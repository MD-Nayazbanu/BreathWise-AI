const emergencyPattern = /can't breathe|cannot breathe|chest pain|blue lips|severe breathing|unconscious/i;

export function localAssistantAnswer(question, context = {}) {
  const q = String(question || '').trim().slice(0, 1200);
  if (emergencyPattern.test(q)) return 'Severe breathing difficulty or chest pain can be an emergency. Contact your local emergency service now and follow your clinician-provided action plan.';
  if (/aqi|air quality|outside|outdoor|run|exercise/i.test(q)) {
    const aqi = context?.current?.aqi ?? context?.aqi;
    return aqi == null ? 'A current modeled air-quality reading is unavailable. Check your local air-quality agency for current conditions.' : `The current modeled AQI is ${aqi}. Air-quality forecasts are estimates and cannot predict how an individual will feel. Check local public-health advice before prolonged outdoor activity.`;
  }
  return 'I can explain the available air-quality data and general ways to reduce exposure. I cannot diagnose symptoms or provide medical treatment advice. For personal medical guidance, contact a qualified clinician.';
}

export async function getAssistantResponse({ question, context, profile, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', fetchImpl = fetch } = {}) {
  const q = String(question || '').trim().slice(0, 1200);
  if (!q) return { answer: 'Enter a question about air quality, exposure, or lower-emission routines.', mode: 'local-fallback', provider: 'local' };
  if (/can't breathe|cannot breathe|chest pain|blue lips|severe breathing|unconscious/i.test(q)) return { answer: localAssistantAnswer(q, context), mode: 'safety-response', provider: 'local' };
  const fallback = reason => ({ answer: localAssistantAnswer(q, context), mode: 'local-fallback', provider: 'local', fallbackReason: reason });
  if (!apiKey?.trim()) return fallback('not-configured');
  const safeContext = {
    location: context?.place || 'unknown',
    sourceStatus: context?.status || 'unknown',
    current: context?.current || null,
    observedAt: context?.observedAt || null,
    nextForecast: (context?.forecast || []).slice(0, 6)
  };
  const safeProfile = profile ? {
    familySize: Array.isArray(profile.members) ? profile.members.length : 0,
    sensitiveMembers: Array.isArray(profile.members) ? profile.members.filter(m => m.sensitiveGroup).length : 0,
    commuteMode: profile.lifestyle?.commuteMode || null,
    outdoorActivity: profile.lifestyle?.outdoorActivity || null
  } : null;
  const systemInstruction = 'You are BreatheWise, a careful environmental information assistant. Give general, concise, practical information only. Never diagnose, prescribe, predict personal health outcomes, or claim a health benefit without a reliable source. Do not invent readings: distinguish modeled forecasts from measured data, state when data is unavailable, and mention source timestamps when relevant. For emergency symptoms such as severe breathing difficulty or chest pain, instruct the user to contact emergency services. If asked for medical advice, direct them to a qualified clinician. Clearly label estimates. Use the supplied app data as the only source of current readings.';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const response = await fetchImpl(url, {
      method: 'POST', signal: AbortSignal.timeout(18000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: `Question: ${q}\n\nCurrent environmental context (JSON): ${JSON.stringify(safeContext)}\nFamily/lifestyle preferences (JSON, no names): ${JSON.stringify(safeProfile)}` }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 450 } })
    });
    if (!response.ok) {
      let details = {};
      try { details = await response.json(); } catch {}
      const providerCode = details?.error?.details?.flatMap(x => x?.reason ? [x.reason] : []).join(' ') || details?.error?.status || '';
      const providerMessage = details?.error?.message || '';
      const invalidKey = /API_KEY_INVALID|API key not valid/i.test(`${providerCode} ${providerMessage}`);
      if (invalidKey || response.status === 401) return fallback('invalid-key');
      if (response.status === 403) return fallback('key-not-authorized');
      if (response.status === 429) return fallback('quota-exceeded');
      if (response.status === 408 || response.status >= 500) return fallback('provider-unavailable');
      return fallback('provider-rejected-request');
    }
    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!answer) return fallback('empty-provider-response');
    return { answer: answer.slice(0, 3500), mode: 'gemini', provider: 'Google Gemini', model };
  } catch (error) {
    return fallback(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'provider-unavailable');
  }
}
