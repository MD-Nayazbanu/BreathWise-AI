const ageBands = new Set(['under5', '5to17', '18to64', '65plus']);
const commuteModes = new Set(['walk', 'cycle', 'transit', 'carpool', 'car', 'remote', 'other']);
const outdoorRoutines = new Set(['morning', 'midday', 'evening', 'flexible', 'none']);

export function normalizeProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Profile must be an object');
  const members = Array.isArray(input.members) ? input.members.slice(0, 12).map((m, i) => {
    if (!m || !ageBands.has(m.ageBand)) throw new Error(`Member ${i + 1} has an invalid age band`);
    return { ageBand: m.ageBand, sensitiveGroup: Boolean(m.sensitiveGroup) };
  }) : [];
  const lifestyle = input.lifestyle || {};
  const commuteMode = commuteModes.has(lifestyle.commuteMode) ? lifestyle.commuteMode : 'other';
  const outdoorActivity = outdoorRoutines.has(lifestyle.outdoorActivity) ? lifestyle.outdoorActivity : 'flexible';
  return { members, lifestyle: { commuteMode, outdoorActivity, hasPortableAirCleaner: Boolean(lifestyle.hasPortableAirCleaner), hasHVACFilter: Boolean(lifestyle.hasHVACFilter), cookingFuel: ['electric', 'gas', 'other', 'unknown'].includes(lifestyle.cookingFuel) ? lifestyle.cookingFuel : 'unknown' } };
}
