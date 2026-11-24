import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { geocodePlace, getEnvironmentalContext, recommend } from './lib/environment.js';
import { getAssistantResponse } from './lib/assistant.js';
import { emissionsEstimate, exposureAction } from './lib/impact.js';
import { normalizeProfile } from './lib/profile.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const dbPath = resolve(ROOT, process.env.DB_PATH || './data/breathewise.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS assessments(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, city TEXT, latitude REAL, longitude REAL, conditions TEXT NOT NULL, recommendations TEXT NOT NULL, impact TEXT);
CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS impact_log(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL, record TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY CHECK(id=1), updated_at TEXT NOT NULL, profile TEXT NOT NULL);
INSERT OR IGNORE INTO profiles(id,updated_at,profile) VALUES(1,datetime('now'),'{"members":[],"lifestyle":{"commuteMode":"other","outdoorActivity":"flexible","hasPortableAirCleaner":false,"hasHVACFilter":false,"cookingFuel":"unknown"}}');`);
const impactColumns = db.prepare('PRAGMA table_info(impact_log)').all().map(x => x.name);
if (!impactColumns.includes('kind')) {
  db.exec(`ALTER TABLE impact_log RENAME TO impact_log_legacy;
  CREATE TABLE impact_log(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL, record TEXT NOT NULL);`);
  const legacy = db.prepare('SELECT created_at,action,co2_kg FROM impact_log_legacy').all();
  const addLegacy = db.prepare('INSERT INTO impact_log(created_at,kind,record) VALUES(?,?,?)');
  for (const row of legacy) addLegacy.run(row.created_at, 'emissions-legacy', JSON.stringify({ type: 'emissions', mode: row.action, avoidedKgCo2e: row.co2_kg, status: 'legacy-estimate', explanation: 'Recorded by the earlier calculator; factor basis was not verified and is excluded from current totals.' }));
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); res.end(JSON.stringify(body)); };
const readBody = async req => { let raw = ''; for await (const chunk of req) raw += chunk; if (raw.length > 30_000) throw new Error('Request too large'); return raw ? JSON.parse(raw) : {}; };
const num = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : fallback));
function getImpactTotals() {
  const rows = db.prepare("SELECT kind,record FROM impact_log WHERE kind IN ('emissions','exposure')").all();
  const emissions = rows.filter(x => x.kind === 'emissions').map(x => JSON.parse(x.record)).filter(x => Number.isFinite(x.avoidedKgCo2e));
  return { emissionsEntries: rows.filter(x=>x.kind==='emissions').length, exposureActions: rows.filter(x=>x.kind==='exposure').length, estimatedAvoidedKgCo2e: Math.round(emissions.reduce((sum,x)=>sum+x.avoidedKgCo2e,0)*1000)/1000, emissionsNote: 'Only estimates calculated with the current documented scenario are summed; exposure actions are not converted to health or pollution units.' };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const path = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok', service: 'BreatheWise AI', database: 'sqlite', time: new Date().toISOString() });
    if (req.method === 'GET' && path === '/api/places') {
      const q = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('q');
      return json(res, 200, await geocodePlace(q));
    }
    if (req.method === 'GET' && path === '/api/conditions') {
      const params = Object.fromEntries(new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams);
      const profile = JSON.parse(db.prepare('SELECT profile FROM profiles WHERE id=1').get().profile);
      const c = await getEnvironmentalContext(params);
      const result = { ...c, recommendations: recommend(c, profile) };
      db.prepare('INSERT INTO assessments(created_at,city,latitude,longitude,conditions,recommendations,impact) VALUES(?,?,?,?,?,?,?)').run(new Date().toISOString(), c.place, c.latitude, c.longitude, JSON.stringify(c), JSON.stringify(result.recommendations), 'null');
      return json(res, 200, result);
    }
    if (req.method === 'GET' && path === '/api/profile') return json(res, 200, { profile: JSON.parse(db.prepare('SELECT profile FROM profiles WHERE id=1').get().profile) });
    if (req.method === 'PUT' && path === '/api/profile') {
      const profile = normalizeProfile(await readBody(req));
      db.prepare('UPDATE profiles SET updated_at=?,profile=? WHERE id=1').run(new Date().toISOString(), JSON.stringify(profile));
      return json(res, 200, { profile, updatedAt: new Date().toISOString() });
    }
    if (req.method === 'POST' && path === '/api/assistant') {
      const body = await readBody(req), profile = JSON.parse(db.prepare('SELECT profile FROM profiles WHERE id=1').get().profile);
      const result = await getAssistantResponse({ question: body.question, context: body.context || {}, profile });
      db.prepare('INSERT INTO conversations(created_at,question,answer) VALUES(?,?,?)').run(new Date().toISOString(), String(body.question || '').slice(0,1200), result.answer);
      return json(res, 200, result);
    }
    if (req.method === 'POST' && path === '/api/impact') {
      const body = await readBody(req);
      const record = body.type === 'exposure' ? exposureAction(body.action) : emissionsEstimate(body);
      db.prepare('INSERT INTO impact_log(created_at,kind,record) VALUES(?,?,?)').run(new Date().toISOString(), record.type, JSON.stringify(record));
      return json(res, 200, { record, totals: getImpactTotals() });
    }
    if (req.method === 'GET' && path === '/api/history') return json(res, 200, { assessments: db.prepare('SELECT id,created_at,city,conditions,recommendations FROM assessments ORDER BY id DESC LIMIT 20').all().map(x => ({ ...x, conditions: JSON.parse(x.conditions), recommendations: JSON.parse(x.recommendations) })), impact: getImpactTotals() });
    if (req.method === 'GET' && path.startsWith('/api/')) return json(res, 404, { error: 'API route not found' });
    const safePath = path === '/' ? '/index.html' : path;
    const file = resolve(ROOT, 'public', `.${safePath}`);
    if (!file.startsWith(resolve(ROOT, 'public'))) return json(res, 403, { error: 'Forbidden' });
    const content = await readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(content);
  } catch (err) {
    const message = err.message || 'Internal server error';
    const status = err instanceof SyntaxError || /invalid|unsupported|must be|distance|request too large|enter a question/i.test(message) ? 400 : /provider returned|provider unavailable/i.test(message) ? 502 : 500;
    json(res, status, { error: message });
  }
});
server.listen(PORT, HOST, () => console.log(`BreatheWise running at http://${HOST}:${PORT}`));
