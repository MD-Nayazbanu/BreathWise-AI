# BreatheWise AI

BreatheWise AI is a local-first dashboard for checking modeled outdoor air quality, planning household routines, and recording lower-emission travel scenarios. Air pollution information is often spread across separate services, while household planning tools can blur modeled data, personal exposure, and environmental impact. BreatheWise brings these workflows together and labels what its data can and cannot establish.

## Solution and features

- Search for a place or use browser geolocation to select coordinates.
- View current modeled air-quality values, pollutant values, source attribution, model observation time, and retrieval time.
- See an hourly air-quality outlook and optional weather context.
- Receive general recommendations based on available model data and the household profile.
- Save household age bands and lifestyle preferences locally without collecting names or exact birth dates.
- Ask the assistant about air quality and routines. It uses the optional Gemini API from the server, or a local fallback when Gemini is not configured or unavailable.
- Record exposure-related actions separately from illustrative emissions scenarios. The app does not convert exposure actions into health or exposure-reduction scores.

Environmental values are model estimates, not readings from a personal or regulatory monitor. If a location or air-quality provider response is unavailable, BreatheWise displays an unavailable state and does not substitute demo readings.

## Architecture

```text
Browser dashboard (HTML, CSS, JavaScript)
        │ same-origin JSON requests
        ▼
Node.js HTTP server
   ├── Open-Meteo geocoding
   ├── Open-Meteo air quality (CAMS model output)
   ├── Open-Meteo weather forecast (optional)
   ├── Google Gemini API (optional, server-side only)
   └── SQLite local storage
```

### Technology stack

- Node.js 22.5 or newer; no npm runtime dependencies.
- Built-in `node:http` server and `node:sqlite` database.
- Browser-native HTML, CSS, and JavaScript.
- Open-Meteo Geocoding, Air Quality, and Forecast APIs.
- Optional Google Gemini `generateContent` API through a server-side REST adapter.

## Installation and startup

1. Install Node.js 22.5 or newer.
2. Open a terminal in the project directory.
3. Start the server:

   ```bash
   npm start
   ```

4. Open <http://127.0.0.1:3000>.
5. Search for a place or allow browser location access. Environmental requests are made after a location is selected.

The app creates `data/breathewise.sqlite` on first start. Set `PORT`, `HOST`, or `DB_PATH` in the server environment to change the listener or database location. Node does not load `.env` files automatically.

## Optional Gemini configuration

Set `GEMINI_API_KEY` in the **server process environment**, then start or restart the server. The key is sent only from the Node backend to Google using the `x-goog-api-key` header. It is not sent to browser JavaScript or included in API responses. Never put the key in frontend code, source control, or a chat message. `.env` and credential files are ignored by Git; `.env.example` contains placeholders only.

For PowerShell, enter the key without echoing it and launch the server in the same shell:

```powershell
$secureKey = Read-Host "Gemini API key" -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
npm start
```

When finished, stop the server and clear the current shell environment:

```powershell
Remove-Item Env:GEMINI_API_KEY
Remove-Variable secureKey
```

The default model is `gemini-3.5-flash-lite`. Set `GEMINI_MODEL` in the server environment to select another compatible model. If the key is absent, invalid, unauthorized, over quota, or the provider times out or is unavailable, the assistant uses a local fallback and does not expose raw provider errors.

## Environmental data sources

- **Open-Meteo Geocoding API** supplies place search results and coordinates.
- **Open-Meteo Air Quality API** supplies CAMS model estimates and hourly forecast values.
- **Open-Meteo Forecast API** optionally supplies weather context.

The dashboard distinguishes provider status and shows source/model timestamps when available. Missing coordinates or unavailable air-quality data result in null current values and an unavailable status. No synthetic or demo environmental readings are substituted. Consult local air-quality authorities for regulatory or emergency guidance.

## Tests and verification

Run the automated integration and service tests:

```bash
npm test
```

Check JavaScript syntax:

```bash
node --check server.js
node --check public/app.js
node --check lib/assistant.js
node --check lib/environment.js
node --check lib/impact.js
node --check lib/profile.js
node --check test/app.test.js
node --check test/services.test.js
```

The tests use temporary SQLite databases and mocked external-provider responses. They do not require a Gemini key and do not certify live upstream availability. See `TEST_REPORT.md` for recorded test and live Gemini verification results.

## Documentation

- `ENVIRONMENT_SETUP.md` — runtime configuration
- `API_DOCUMENTATION.md` — HTTP routes and request shapes
- `ARCHITECTURE.md` — application components
- `DATABASE_SCHEMA.md` — persisted records and migration
- `AI_SYSTEM_DOCUMENTATION.md` — assistant and recommendation behavior
- `PROJECT_STATUS.md` and `TEST_REPORT.md` — implementation and verification status

This is a local application without authentication or user accounts. Do not expose it publicly without adding appropriate access controls and data-retention protections.
