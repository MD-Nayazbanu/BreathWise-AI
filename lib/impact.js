const KM_PER_MILE = 1.609344;
// EPA GHG Equivalencies Calculator: 4.29 metric tons CO2e / year, 10,917 miles/year.
const US_AVERAGE_GASOLINE_VEHICLE_KG_PER_KM = (4290 / 10917) / KM_PER_MILE;

export function emissionsEstimate({ mode, distanceKm, replacedMode } = {}) {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0 || km > 500) throw new Error('Distance must be between 0 and 500 km');
  if (!['walk', 'cycle', 'transit', 'carpool', 'car'].includes(mode)) throw new Error('Unsupported travel mode');
  if (!['solo_gasoline_car', 'unknown'].includes(replacedMode)) throw new Error('Unsupported baseline mode');
  if (replacedMode === 'unknown' || ['transit', 'carpool', 'car'].includes(mode)) return { type: 'emissions', mode, distanceKm: km, avoidedKgCo2e: null, status: 'not-calculated', explanation: 'No defensible comparison factor was selected for both the trip and its alternative. No emissions reduction is estimated.', factors: null };
  const value = km * US_AVERAGE_GASOLINE_VEHICLE_KG_PER_KM;
  return { type: 'emissions', mode, distanceKm: km, avoidedKgCo2e: Math.round(value * 1000) / 1000, status: 'illustrative-estimate', explanation: `Scenario: this ${mode} trip replaced a solo gasoline car trip of the same distance. Uses a US average passenger-vehicle factor; actual vehicle, route, occupancy, and energy mix differ.`, factors: { baseline: 'US average gasoline passenger vehicle', kgCo2ePerKm: Math.round(US_AVERAGE_GASOLINE_VEHICLE_KG_PER_KM * 10000) / 10000, reference: 'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references' } };
}

export function exposureAction(action) {
  const allowed = new Set(['rescheduled_outdoor_activity', 'moved_activity_indoors', 'used_particle_filtration', 'closed_windows_during_smoke', 'ventilated_when_outdoor_air_improved']);
  if (!allowed.has(action)) throw new Error('Unsupported exposure action');
  return { type: 'exposure', action, status: 'logged-not-quantified', exposureChange: null, explanation: 'Action recorded. Exposure reduction is not calculated: the app has no indoor sensor, personal activity measurement, or validated exposure model.' };
}
