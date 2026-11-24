# Test Report

## 2026-11-24 — Phase 3 submission-readiness verification

- `npm test`: **14 passed, 0 failed** on Node v24.11.1.
- JavaScript syntax checks: **8 passed** (`server.js`, browser app, four service modules, and two test files).
- Manual browser testing was completed successfully as reported by the project owner. The reported coverage includes location search and geolocation, environmental readings/timestamps, forecast, household profiles, assistant conversations, recommendations, exposure actions, and emissions tracking.
- One real Gemini request through BreatheWise succeeded on 2026-11-24: HTTP 200, `mode: gemini`, provider `Google Gemini`, model `gemini-3.5-flash-lite`, and the requested verification phrase. The API key was not printed or returned.
- Automated provider tests use mocks. The live Gemini result verifies one successful request; it does not certify continued upstream availability.
- Environmental provider failure and missing coordinates return unavailable states without synthetic readings.
- The Node runtime emits its expected experimental warning for built-in `node:sqlite`.

See `PROJECT_STATUS.md` for the Git-root status and remaining submission-preparation work.
