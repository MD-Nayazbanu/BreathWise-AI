const $ = (selector, root = document) => root.querySelector(selector);
const state = { place: null, conditions: null, profile: null, impactKind: 'emissions' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function time(value) { if (!value) return 'not provided'; const d = new Date(value); return Number.isNaN(d.valueOf()) ? value : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
async function api(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }
function setBadge(status) { const badge = $('#data-badge'); badge.textContent = status === 'live' ? 'Model data available' : status === 'partial' ? 'Partial data' : 'Unavailable'; badge.className = `badge ${status || 'unavailable'}`; }
function renderConditions(data) {
  state.conditions = data;
  $('#city').textContent = data.place || state.place?.label || 'Selected location';
  setBadge(data.status);
  const current = data.current;
  for (const [id, value] of [['aqi', current?.aqi], ['pm25', current?.pm25], ['pm10', current?.pm10], ['ozone', current?.ozone]]) $(`#${id}`).textContent = Number.isFinite(value) ? (id === 'aqi' ? Math.round(value) : Number(value).toFixed(1)) : '—';
  $('#risk').textContent = Number.isFinite(current?.aqi) ? (current.aqi <= 50 ? 'Good' : current.aqi <= 100 ? 'Moderate' : 'Elevated') : 'No current AQI available';
  $('#meter-fill').style.width = Number.isFinite(current?.aqi) ? `${Math.min(100, Math.max(3, current.aqi / 300 * 100))}%` : '0%';
  $('#timestamps').textContent = `Model time: ${time(data.observedAt)} · Retrieved: ${time(data.retrievedAt)}`;
  $('#feed-state').textContent = data.status === 'unavailable' ? 'Air data unavailable' : data.status === 'partial' ? 'Partial air data' : 'Air model updated';
  $('#live-dot').classList.toggle('offline', data.status === 'unavailable');
  $('#attribution').textContent = data.providerAttribution || 'Air-quality model estimates; not a regulatory monitor.';
  renderRecommendations(data.recommendations || []); renderForecast(data.forecast || []);
  $('#assistant-mode').textContent = 'Gemini is optional. Answers identify Gemini or local fallback mode.';
}
function renderRecommendations(items) {
  const target = $('#recommendations');
  target.replaceChildren();
  if (!items.length) { target.innerHTML = '<div class="placeholder">No recommendations can be generated from the available data.</div>'; return; }
  for (const item of items) { const row = document.createElement('div'); row.className = 'rec'; const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = item.title; const detail = document.createElement('p'); detail.textContent = item.detail; copy.append(title, detail); row.append(copy); target.append(row); }
}
function renderForecast(items) {
  const target = $('#forecast'); target.replaceChildren();
  if (!items.length) { target.textContent = 'Hourly model forecast unavailable.'; return; }
  for (const hour of items.slice(0, 12)) { const cell = document.createElement('div'); cell.className = 'forecast-hour'; const d = document.createElement('b'); d.textContent = hour.aqi == null ? 'AQI —' : `AQI ${hour.aqi}`; const t = document.createElement('span'); t.textContent = `${time(hour.time)}${hour.temperatureC == null ? '' : ` · ${hour.temperatureC}°C`}`; cell.append(d, t); target.append(cell); }
}
async function loadConditions() {
  if (!state.place) { $('#feed-state').textContent = 'Choose a location to load air data'; toast('Search for a place or use your location first.'); return; }
  $('#feed-state').textContent = 'Loading air model';
  try { const q = new URLSearchParams({ latitude: state.place.latitude, longitude: state.place.longitude, city: state.place.label }); renderConditions(await api(`/api/conditions?${q}`)); }
  catch (error) { $('#feed-state').textContent = 'Air data unavailable'; setBadge('unavailable'); $('#risk').textContent = 'No current reading'; toast(error.message); }
}
async function searchPlaces() {
  const query = $('#place-search').value.trim(); if (query.length < 2) { toast('Enter at least two characters.'); return; }
  try {
    const data = await api(`/api/places?q=${encodeURIComponent(query)}`); const target = $('#place-options'); target.replaceChildren();
    if (!data.results?.length) { target.textContent = 'No matching places found.'; return; }
    for (const place of data.results) { const button = document.createElement('button'); button.type = 'button'; button.className = 'place-option'; button.textContent = [place.name, place.admin1, place.country].filter(Boolean).join(', '); button.addEventListener('click', () => { state.place = { ...place, label: button.textContent }; $('#place-search').value = button.textContent; target.replaceChildren(); loadConditions(); }); target.append(button); }
  } catch (error) { toast(`Place search failed: ${error.message}`); }
}
function memberMarkup(member = { ageBand: '18to64', sensitiveGroup: false }) { const row = document.createElement('div'); row.className = 'member-row'; row.innerHTML = `<label>Age band<select class="member-age"><option value="under5">Under 5</option><option value="5to17">5–17</option><option value="18to64">18–64</option><option value="65plus">65+</option></select></label><label class="check-label"><input class="member-sensitive" type="checkbox"> Sensitive group</label><button type="button" class="remove-member" aria-label="Remove member">Remove</button>`; $('.member-age', row).value = member.ageBand; $('.member-sensitive', row).checked = member.sensitiveGroup; $('.remove-member', row).addEventListener('click', () => row.remove()); return row; }
async function loadProfile() { const data = await api('/api/profile'); state.profile = data.profile; $('#members').replaceChildren(...(state.profile.members || []).map(memberMarkup)); const l = state.profile.lifestyle || {}; $('#commute').value = l.commuteMode || 'other'; $('#outdoor-routine').value = l.outdoorActivity || 'flexible'; $('#portable-filter').checked = !!l.hasPortableAirCleaner; $('#hvac-filter').checked = !!l.hasHVACFilter; $('#cooking-fuel').value = l.cookingFuel || 'unknown'; }
function collectProfile() { return { members: [...document.querySelectorAll('.member-row')].map(row => ({ ageBand: $('.member-age', row).value, sensitiveGroup: $('.member-sensitive', row).checked })), lifestyle: { commuteMode: $('#commute').value, outdoorActivity: $('#outdoor-routine').value, hasPortableAirCleaner: $('#portable-filter').checked, hasHVACFilter: $('#hvac-filter').checked, cookingFuel: $('#cooking-fuel').value } }; }
async function loadHistory() { try { const data = await api('/api/history'); $('#total-emissions').textContent = Number(data.impact.estimatedAvoidedKgCo2e || 0).toFixed(3); $('#total-exposure').textContent = data.impact.exposureActions || 0; } catch (error) { toast(`Could not load saved totals: ${error.message}`); } }
$('#search-place').addEventListener('click', searchPlaces); $('#place-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchPlaces(); } });
$('#use-location').addEventListener('click', () => { if (!navigator.geolocation) { toast('Location access is not available in this browser.'); return; } navigator.geolocation.getCurrentPosition(position => { state.place = { latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'Your current location' }; $('#city').textContent = state.place.label; $('#place-search').value = state.place.label; loadConditions(); }, error => toast(`Could not get your location: ${error.message}`), { timeout: 10000, maximumAge: 300000 }); });
$('#refresh').addEventListener('click', loadConditions);
$('#add-member').addEventListener('click', () => { if ($('#members').children.length >= 12) return toast('Up to 12 household members can be recorded.'); $('#members').append(memberMarkup()); });
$('#save-profile').addEventListener('click', async () => { const status = $('#profile-status'); try { const result = await api('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(collectProfile()) }); state.profile = result.profile; status.textContent = 'Saved locally.'; if (state.conditions && state.place) await loadConditions(); } catch (error) { status.textContent = error.message; } });
$('#chat-form').addEventListener('submit', async event => { event.preventDefault(); const input = $('#question'), question = input.value.trim(); if (!question) return; const box = $('#chat'); const user = document.createElement('div'); user.className = 'bubble user'; user.textContent = question; const answer = document.createElement('div'); answer.className = 'bubble bot'; answer.textContent = 'Thinking…'; box.append(user, answer); input.value = ''; box.scrollTop = box.scrollHeight; try { const data = await api('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, context: state.conditions || {} }) }); const reason = { 'not-configured':'Gemini not configured', 'invalid-key':'Gemini key rejected', 'key-not-authorized':'Gemini key not authorized', 'quota-exceeded':'Gemini quota exceeded', 'provider-unavailable':'Gemini unavailable', timeout:'Gemini timed out', 'provider-rejected-request':'Gemini rejected the request', 'empty-provider-response':'Gemini returned no answer' }[data.fallbackReason]; answer.textContent = `${data.answer} (${data.mode || 'unknown'}${data.model ? ` · ${data.model}` : ''}${reason ? ` · ${reason}` : ''})`; $('#assistant-mode').textContent = data.mode === 'gemini' ? `Connected to Gemini · ${data.model}` : data.mode === 'safety-response' ? 'Emergency safety response · local' : reason ? `Local fallback · ${reason}` : 'Local assistant'; } catch (error) { answer.textContent = `Assistant unavailable: ${error.message}`; } box.scrollTop = box.scrollHeight; });
document.querySelectorAll('.segmented button').forEach(button => button.addEventListener('click', () => { state.impactKind = button.dataset.kind; document.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('selected', b === button)); $('#emissions-fields').classList.toggle('hidden', state.impactKind !== 'emissions'); $('#exposure-fields').classList.toggle('hidden', state.impactKind !== 'exposure'); }));
$('#impact-form').addEventListener('submit', async event => { event.preventDefault(); const body = state.impactKind === 'exposure' ? { type: 'exposure', action: $('#exposure-action').value } : { type: 'emissions', mode: $('#travel-mode').value, distanceKm: Number($('#distance').value), replacedMode: $('#baseline').value }; try { const result = await api('/api/impact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); toast(result.record.status === 'illustrative-estimate' ? `Illustrative estimate: ${result.record.avoidedKgCo2e.toFixed(3)} kg CO₂e` : 'Action saved; no reduction was calculated.'); await loadHistory(); } catch (error) { toast(error.message); } });
$('#feed-state').textContent = 'Choose a location to begin';
loadProfile().catch(error => toast(`Could not load profile: ${error.message}`)); loadHistory();
