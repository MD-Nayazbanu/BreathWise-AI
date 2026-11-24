import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodePlace, getEnvironmentalContext, recommend } from '../lib/environment.js';
import { getAssistantResponse } from '../lib/assistant.js';
import { emissionsEstimate, exposureAction } from '../lib/impact.js';
import { normalizeProfile } from '../lib/profile.js';

const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
test('geocoding maps provider results and propagates provider failure', async () => {
  const result = await geocodePlace('Delhi', async () => response({ results: [{ name: 'Delhi', country: 'India', latitude: 28.6, longitude: 77.2 }] }));
  assert.equal(result.results[0].latitude,28.6); assert.equal(result.results[0].country,'India');
  assert.deepEqual(await geocodePlace('x', async () => { throw Error('should not fetch'); }), { results: [] });
  await assert.rejects(geocodePlace('Delhi', async () => response({},false)),/503/);
});
test('environment maps model current and hourly values, timestamps, and weather partial failure', async () => {
  const air = { current: { time:'2026-11-24T10:00', us_aqi:42, pm2_5:7.1, pm10:12, ozone:55 }, hourly: { time:['2026-11-24T10:00','2026-11-24T11:00'], us_aqi:[42,38], pm2_5:[7.1,6] } };
  const context = await getEnvironmentalContext({ latitude:1, longitude:2, city:'Example' }, async url => String(url).includes('air-quality') ? response(air) : response({},false));
  assert.equal(context.status,'live'); assert.equal(context.current.aqi,42); assert.equal(context.forecast[1].aqi,38); assert.equal(context.weatherStatus,'unavailable'); assert.ok(context.retrievedAt); assert.equal(context.observedAt,air.current.time);
});
test('environment reports unavailable without substituting values and recommendation respects profile', async () => {
  const missing = await getEnvironmentalContext({}, async () => { throw Error('must not fetch without selected coordinates'); });
  assert.equal(missing.status,'unavailable'); assert.equal(missing.latitude,null);
  const context = await getEnvironmentalContext({ latitude:1, longitude:2 }, async () => response({},false));
  assert.equal(context.status,'unavailable'); assert.equal(context.current,null); assert.deepEqual(context.forecast,[]);
  assert.match(recommend(context)[0].title,/unavailable/i);
  const elevated = { status:'live', current:{aqi:75}, forecast:[] };
  assert.equal(recommend(elevated,{members:[]})[0].title,'Check air quality before longer outdoor plans');
  assert.equal(recommend(elevated,{members:[{sensitiveGroup:true}]})[0].title,'Consider a lower-exposure activity window');
});
test('assistant Gemini success, missing key, provider failure, and secret non-disclosure', async () => {
  let captured;
  const success = await getAssistantResponse({ question:'Explain today', context:{ current:{aqi:32} }, apiKey:'secret-value', model:'test-model', fetchImpl:async (url,options) => { captured={url,options}; return response({ candidates:[{ content:{ parts:[{text:'Model estimate is available.'}] } }] }); } });
  assert.equal(success.mode,'gemini'); assert.match(captured.options.headers['x-goog-api-key'],/secret-value/); assert.equal(JSON.stringify(success).includes('secret-value'),false); assert.equal(captured.options.body.includes('test-model'),false);
  const local = await getAssistantResponse({ question:'What is the air quality?', context:{current:{aqi:32}}, apiKey:'', fetchImpl:async()=>{throw Error('unexpected');} }); assert.equal(local.mode,'local-fallback'); assert.match(local.answer,/32/);
  const fallback = await getAssistantResponse({ question:'Explain', apiKey:'secret-value', fetchImpl:async()=>response({},false) }); assert.equal(fallback.mode,'local-fallback'); assert.equal(JSON.stringify(fallback).includes('secret-value'),false);
  const emergency = await getAssistantResponse({question:'I cannot breathe',apiKey:'secret-value',fetchImpl:async()=>{throw Error('must not call');}}); assert.equal(emergency.mode,'safety-response');
});
test('assistant classifies invalid key, unauthorized key, quota, provider outage, and timeout safely', async () => {
  const ask = async fetchImpl => getAssistantResponse({question:'Explain air quality',apiKey:'private-key',fetchImpl});
  const fail = (status, details = {}) => ({ ok:false, status, json:async()=>({error:{...details}}) });
  let result=await ask(async()=>fail(400,{details:[{reason:'API_KEY_INVALID'}],message:'API key not valid'})); assert.equal(result.fallbackReason,'invalid-key');
  result=await ask(async()=>fail(403)); assert.equal(result.fallbackReason,'key-not-authorized');
  result=await ask(async()=>fail(429)); assert.equal(result.fallbackReason,'quota-exceeded');
  result=await ask(async()=>fail(503)); assert.equal(result.fallbackReason,'provider-unavailable');
  result=await ask(async(_url, options)=>{ assert.ok(options.signal instanceof AbortSignal); const error=Error('deadline'); error.name='TimeoutError'; throw error; }); assert.equal(result.fallbackReason,'timeout');
  for (const failure of [400,403,429,503]) { result=await ask(async()=>fail(failure,{message:'private-key'})); assert.equal(JSON.stringify(result).includes('private-key'),false); }
});
test('profiles normalize bounded preference fields and reject invalid age bands', () => {
  const p=normalizeProfile({members:[{ageBand:'65plus',sensitiveGroup:true}],lifestyle:{commuteMode:'cycle',hasHVACFilter:true,cookingFuel:'gas'}});
  assert.equal(p.members.length,1); assert.equal(p.lifestyle.commuteMode,'cycle'); assert.equal(p.lifestyle.hasHVACFilter,true);
  assert.throws(()=>normalizeProfile({members:[{ageBand:'1990-04-03'}]}),/invalid age band/);
  assert.throws(()=>normalizeProfile(null),/object/);
});
test('impact calculations validate inputs and keep exposure actions unquantified', () => {
  const estimate=emissionsEstimate({mode:'walk',distanceKm:2,replacedMode:'solo_gasoline_car'}); assert.equal(estimate.status,'illustrative-estimate'); assert.equal(estimate.avoidedKgCo2e,0.488);
  assert.equal(emissionsEstimate({mode:'walk',distanceKm:2,replacedMode:'unknown'}).avoidedKgCo2e,null);
  assert.equal(emissionsEstimate({mode:'car',distanceKm:2,replacedMode:'solo_gasoline_car'}).avoidedKgCo2e,null);
  assert.equal(exposureAction('used_particle_filtration').exposureChange,null);
  assert.throws(()=>emissionsEstimate({mode:'walk',distanceKm:501,replacedMode:'unknown'}),/Distance/);
  assert.throws(()=>exposureAction('unknown'),/Unsupported/);
});
