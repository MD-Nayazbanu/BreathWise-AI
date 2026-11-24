import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let child, base, temp;
before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'breathewise-'));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_PATH: join(temp, 'test.sqlite'), GEMINI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  for (let i=0;i<60;i++) { try { if ((await fetch(base+'/api/health')).ok) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.ok(ready, 'server should start');
});
after(async () => { if(child){child.kill(); await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1000))]);} if(temp) await rm(temp,{recursive:true,force:true}); });
const json = (url, options) => fetch(base + url, options);
const post = (url, body, method = 'POST') => json(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('serves the connected dashboard and health endpoint', async () => {
  const [health, page, script] = await Promise.all([json('/api/health'),json('/'),json('/app.js')]);
  assert.equal((await health.json()).status,'ok'); const html=await page.text(), js=await script.text(); assert.match(html,/id="place-search"/); assert.match(js,/api\/conditions/);
  for (const [,id] of js.matchAll(/\$\('#([a-z0-9-]+)'\)/g)) assert.match(html,new RegExp(`id="${id}"`),`dashboard must provide #${id}`);
  assert.doesNotMatch(js,/GEMINI_API_KEY|x-goog-api-key|AIza[0-9A-Za-z_-]{20}/);
});
test('conditions never substitute readings when provider is unavailable', async () => {
  const r = await json('/api/conditions?latitude=37.77&longitude=-122.41&city=Testville'); assert.equal(r.status,200);
  const d = await r.json(); assert.ok(['live','partial','unavailable'].includes(d.status)); assert.ok(d.source); assert.ok(Array.isArray(d.forecast));
  if (d.status === 'unavailable') { assert.equal(d.current, null); assert.equal(d.forecast.length, 0); }
  else { assert.ok(d.current && typeof d.current === 'object'); assert.ok(d.retrievedAt); }
});
test('assistant has safe local mode and never returns configured secrets', async () => {
  let r=await post('/api/assistant',{question:'I have chest pain'}); const emergency=await r.json(); assert.match(emergency.answer,/emergency/i); assert.equal(emergency.mode,'safety-response');
  r=await post('/api/assistant',{question:'Can I exercise outside?',context:{current:{aqi:125}}}); const result=await r.json(); assert.match(result.answer,/125/); assert.equal(result.mode,'local-fallback');
  assert.equal(JSON.stringify(result).includes(process.env.GEMINI_API_KEY || 'this-key-is-not-present'),false);
});
test('profile validates, persists and returns only normalized fields', async () => {
  let r=await json('/api/profile'); assert.equal(r.status,200); let d=await r.json(); assert.deepEqual(d.profile.members,[]);
  r=await post('/api/profile',{members:[{ageBand:'under5',sensitiveGroup:true}],lifestyle:{commuteMode:'cycle',outdoorActivity:'morning',hasPortableAirCleaner:true}},'PUT'); assert.equal(r.status,200);
  r=await json('/api/profile'); d=await r.json(); assert.equal(d.profile.members[0].sensitiveGroup,true); assert.equal(d.profile.lifestyle.commuteMode,'cycle');
  r=await post('/api/profile',{members:[{ageBand:'birthdate',sensitiveGroup:true}]},'PUT'); assert.equal(r.status,400);
});
test('emissions and exposure entries remain separate and unquantified exposure stays null', async () => {
  let r=await post('/api/impact',{type:'emissions',mode:'walk',distanceKm:2,replacedMode:'solo_gasoline_car'}); assert.equal(r.status,200); let d=await r.json(); assert.equal(d.record.avoidedKgCo2e,0.488); assert.equal(d.totals.emissionsEntries,1);
  r=await post('/api/impact',{type:'exposure',action:'used_particle_filtration'}); assert.equal(r.status,200); d=await r.json(); assert.equal(d.record.exposureChange,null); assert.equal(d.totals.exposureActions,1); assert.equal(d.totals.emissionsEntries,1);
  r=await post('/api/impact',{type:'exposure',action:'invented'}); assert.equal(r.status,400);
  const history=await (await json('/api/history')).json(); assert.equal(history.impact.exposureActions,1);
});
test('impact input bounds reject invalid distances', async () => {
  for (const distanceKm of [0,-1,501,'bad']) { const r=await post('/api/impact',{mode:'walk',distanceKm,replacedMode:'solo_gasoline_car'}); assert.equal(r.status,400); }
});
test('legacy impact migration preserves rows and excludes unverified values from current totals', async () => {
  const legacyPath=join(temp,'legacy.sqlite'), db=new DatabaseSync(legacyPath);
  db.exec("CREATE TABLE impact_log(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, action TEXT, co2_kg REAL); INSERT INTO impact_log(created_at,action,co2_kg) VALUES('2025-01-01','walk',99.9);"); db.close();
  const probe=createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening'); const port=probe.address().port; await new Promise(r=>probe.close(r));
  const migrated=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_PATH:legacyPath},stdio:['ignore','pipe','pipe']}); const url=`http://127.0.0.1:${port}`;
  try {
    let ready=false; for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));} assert.ok(ready,'migration server starts');
    const history=await(await fetch(url+'/api/history')).json(); assert.equal(history.impact.emissionsEntries,0);
    const verify=new DatabaseSync(legacyPath); assert.equal(verify.prepare('SELECT COUNT(*) count FROM impact_log_legacy').get().count,1); assert.equal(verify.prepare('SELECT COUNT(*) count FROM impact_log').get().count,1); verify.close();
  } finally { migrated.kill(); await Promise.race([once(migrated,'exit'),new Promise(r=>setTimeout(r,1000))]); }
});
