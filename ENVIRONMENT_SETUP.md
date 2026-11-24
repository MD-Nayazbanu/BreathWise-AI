# Environment Setup

## Requirements

- Node.js 22.5 or newer. Node 24 is the verified development runtime; its built-in `node:sqlite` emits an experimental warning.
- No npm dependencies or API keys are required.

## Start locally

1. Run `npm start`.
2. Open `http://127.0.0.1:3000`.
3. Search for a place or explicitly allow browser location access. The app does not select a default location or substitute readings.

Optional variables: `PORT` (3000), `HOST` (127.0.0.1), `DB_PATH` (`./data/breathewise.sqlite`), `GEMINI_API_KEY`, and `GEMINI_MODEL` (`gemini-3.5-flash-lite`). Node does not load `.env` automatically. Set variables in the server process environment or a deployment manager; never send or commit provider keys. `.env` is ignored by Git but is not loaded automatically. Without Gemini configuration or when its provider fails, the assistant uses its local fallback and identifies common failure reasons without returning provider error details.

Environmental data comes from Open-Meteo air-quality/CAMS model output and optional Open-Meteo weather data. If the air provider is unavailable, the API returns an explicit unavailable state and null current values; it never uses demo readings. `npm test` runs integration and service tests with temporary databases and mocked provider responses.
