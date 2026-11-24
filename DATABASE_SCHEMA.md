# Database Schema

SQLite is initialized at `data/breathewise.sqlite` by default (`DB_PATH` overrides it). WAL journaling is enabled.

- `assessments(id, created_at, city, latitude, longitude, conditions, recommendations, impact)`: snapshots of conditions requests, including explicit provider status and provenance.
- `conversations(id, created_at, question, answer)`: local assistant conversation history.
- `profiles(id=1, updated_at, profile)`: one locally stored normalized household profile.
- `impact_log(id, created_at, kind, record)`: JSON records with `kind` emissions or exposure.
- `impact_log_legacy`: preserved table created when migrating the earlier `action/co2_kg` schema. Legacy rows are copied as `emissions-legacy` with an unverified status and excluded from current quantified totals.

There are no accounts or personal identifiers. Do not deploy with user-specific records until access control and retention policies are designed.
