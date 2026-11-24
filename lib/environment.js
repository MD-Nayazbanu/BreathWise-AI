const coordinate = (value, min, max) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export async function geocodePlace(query, fetchImpl = fetch) {
  const q = String(query || '').trim().slice(0, 100);
  if (q.length < 2) return { results: [] };
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: q, count: '8', language: 'en', format: 'json' });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);
  const data = await response.json();
  return { results: (data.results || []).map(x => ({ name: x.name, admin1: x.admin1 || '', country: x.country || '', latitude: x.latitude, longitude: x.longitude, timezone: x.timezone || 'auto' })) };
}

export async function getEnvironmentalContext(input = {}, fetchImpl = fetch) {
  const latitude = coordinate(input.latitude, -90, 90);
  const longitude = coordinate(input.longitude, -180, 180);
  if (latitude === null || longitude === null) return { status: 'unavailable', place: String(input.city || 'Selected location').slice(0, 100), latitude, longitude, source: 'Open-Meteo Air Quality API', providerError: 'Choose a valid location before requesting environmental data.', retrievedAt: new Date().toISOString(), current: null, forecast: [], weather: null, forecastStatus: 'unavailable', weatherStatus: 'unavailable' };
  const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  airUrl.search = new URLSearchParams({ latitude, longitude, current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone', hourly: 'us_aqi,pm2_5', forecast_hours: '36', timezone: 'auto' });
  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.search = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,precipitation', hourly: 'temperature_2m,precipitation_probability', forecast_hours: '36', timezone: 'auto' });
  const [airResponse, weatherResult] = await Promise.allSettled([
    fetchImpl(airUrl, { signal: AbortSignal.timeout(6500) }).then(r => { if (!r.ok) throw new Error(`Air-quality provider returned ${r.status}`); return r.json(); }),
    fetchImpl(weatherUrl, { signal: AbortSignal.timeout(6500) }).then(r => { if (!r.ok) throw new Error(`Weather provider returned ${r.status}`); return r.json(); })
  ]);
  if (airResponse.status === 'rejected') return { status: 'unavailable', place: String(input.city || 'Selected location').slice(0, 100), latitude, longitude, source: 'Open-Meteo Air Quality API', providerError: airResponse.reason?.message || 'Air-quality provider unavailable', retrievedAt: new Date().toISOString(), current: null, forecast: [], weather: null };
  const air = airResponse.value;
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const now = air.current?.time;
  const hourlyTimes = air.hourly?.time || [];
  const start = Math.max(0, now ? hourlyTimes.findIndex(t => t >= now) : 0);
  const forecast = hourlyTimes.slice(start, start + 24).map((time, offset) => {
    const i = start + offset;
    const wTimes = weather?.hourly?.time || [];
    const wi = wTimes.indexOf(time);
    return { time, aqi: air.hourly?.us_aqi?.[i] ?? null, pm25: air.hourly?.pm2_5?.[i] ?? null, temperatureC: wi >= 0 ? weather.hourly.temperature_2m?.[wi] ?? null : null, precipitationProbability: wi >= 0 ? weather.hourly.precipitation_probability?.[wi] ?? null : null };
  });
  const c = air.current || {};
  return {
    status: Number.isFinite(c.us_aqi) || Number.isFinite(c.pm2_5) ? 'live' : 'partial',
    place: String(input.city || 'Selected location').slice(0, 100), latitude, longitude,
    source: 'Open-Meteo Air Quality API (CAMS forecast)', weatherSource: weather ? 'Open-Meteo Forecast API' : null,
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    providerAttribution: 'Air-quality model estimates from Copernicus Atmosphere Monitoring Service (CAMS); Open-Meteo API.',
    retrievedAt: new Date().toISOString(), observedAt: now || null,
    current: { aqi: c.us_aqi ?? null, pm25: c.pm2_5 ?? null, pm10: c.pm10 ?? null, no2: c.nitrogen_dioxide ?? null, ozone: c.ozone ?? null },
    weather: weather ? { temperatureC: weather.current?.temperature_2m ?? null, precipitation: weather.current?.precipitation ?? null, observedAt: weather.current?.time || null } : null,
    forecast, forecastStatus: air.hourly?.time ? 'live' : 'unavailable', weatherStatus: weather ? 'live' : 'unavailable'
  };
}

export function recommend(context, profile = {}) {
  if (!context || context.status === 'unavailable') return [{ category: 'data', title: 'Air reading unavailable', detail: 'No current pollution reading is available for this location. Check a local air-quality agency and retry later.', evidence: 'Data status only' }];
  const aqi = context.current?.aqi;
  const recs = [];
  if (Number.isFinite(aqi)) {
    const sensitive = (profile.members || []).some(m => m.sensitiveGroup);
    if (aqi > 100 || (aqi > 50 && sensitive)) recs.push({ category: 'exposure', title: 'Consider a lower-exposure activity window', detail: 'Current modeled AQI is elevated. Check the hourly outlook before prolonged outdoor exertion; follow local public-health advice.', evidence: 'US EPA/AirNow AQI guidance', source: 'https://www.airnow.gov/aqi/aqi-basics/' });
    else recs.push({ category: 'exposure', title: 'Check air quality before longer outdoor plans', detail: 'Current modeled AQI is not in the elevated bands for most people. Conditions can change during the day.', evidence: 'US EPA/AirNow AQI guidance', source: 'https://www.airnow.gov/aqi/aqi-basics/' });
  }
  const best = (context.forecast || []).filter(x => Number.isFinite(x.aqi)).sort((a, b) => a.aqi - b.aqi).slice(0, 3).sort((a,b)=>a.time.localeCompare(b.time));
  if (best.length) recs.push({ category: 'routine', title: 'Lower modeled AQI windows', detail: best.map(x => `${new Date(x.time).toLocaleTimeString([], { hour: 'numeric' })} (AQI ${x.aqi}${x.precipitationProbability == null ? '' : `, ${x.precipitationProbability}% precipitation chance`})`).join(' · '), evidence: 'Open-Meteo hourly model forecast', source: 'https://open-meteo.com/en/docs/air-quality-api', times: best.map(x => x.time) });
  if (context.current?.pm25 != null && context.current.pm25 > 15) recs.push({ category: 'indoor', title: 'Plan a cleaner-air room during particle events', detail: 'During smoke or particle pollution, EPA advises closing windows, using an appropriately sized particle air cleaner, and using a compatible high-efficiency HVAC filter. Ventilate when outdoor air improves.', evidence: 'US EPA wildfire smoke guidance', source: 'https://www.epa.gov/emergencies-iaq/create-clean-room-protect-indoor-air-quality-during-wildfire' });
  if (profile.lifestyle?.commuteMode && profile.lifestyle.commuteMode !== 'car') recs.push({ category: 'emissions', title: 'Keep your lower-emission commute routine', detail: `Your selected usual commute is ${profile.lifestyle.commuteMode}. Log its distance to see an illustrative avoided-emissions estimate.`, evidence: 'Mode-based estimate only' });
  return recs;
}
