# API Documentation

All `/api/*` responses use JSON. There is no authentication; run only in a trusted local environment. Coordinates are supplied by an explicit place selection or browser geolocation.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Service and SQLite health indicator. |
| `GET /api/places?q=Delhi` | Open-Meteo geocoding results with coordinates and place labels. |
| `GET /api/conditions?latitude=28.6&longitude=77.2&city=Delhi` | Air-model current/hourly values, timestamps, optional weather, status, source, and profile-based recommendations. Air failure returns `status: unavailable`, `current: null`, and an empty forecast. |
| `GET /api/profile` | Read the normalized household profile. |
| `PUT /api/profile` | Save member age bands/sensitivity and lifestyle preferences locally. No names or exact birthdates are accepted. |
| `POST /api/assistant` | Body `{ "question": "...", "context": { "current": { "aqi": 75 } } }`; returns answer, mode, and provider metadata when applicable. The API key is never returned. |
| `POST /api/impact` | Emissions body `{ "type":"emissions", "mode":"walk", "distanceKm":2, "replacedMode":"solo_gasoline_car" }`; exposure body `{ "type":"exposure", "action":"used_particle_filtration" }`. They are stored and totaled separately. Exposure is not quantified. |
| `GET /api/history` | Latest 20 condition assessments and separate impact totals. |

Validation errors return HTTP 400; provider errors return HTTP 502 where applicable. Conditions may return HTTP 200 with an unavailable provider state because that is a valid result for the dashboard.
