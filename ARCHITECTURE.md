# Architecture

Single-process Node.js application using Node built-ins. `server.js` serves the dashboard, exposes JSON endpoints, calls Open-Meteo services, and stores household data in SQLite. `public/app.js` uses same-origin APIs and does not request conditions until the user chooses a place or grants browser geolocation.

```text
Browser dashboard ── same-origin HTTP ── Node server
                                           ├── Open-Meteo geocoding
                                           ├── Open-Meteo air quality / CAMS model
                                           ├── optional Open-Meteo weather forecast
                                           ├── optional server-side Gemini assistant
                                           └── SQLite profiles, assessments, chat, impact
```

Air results include provider status, source, retrieval time, and model observation time. Provider failure is an unavailable result with no substitute readings. The assistant falls back to local deterministic guidance when Gemini is not configured or fails. Emissions entries use a labeled illustrative scenario; exposure actions are logged without a calculated exposure or health benefit.
