This folder stores historical survey artifacts kept for reference.

- `seed-master-surveys.sql` is a deprecated SQL seeding approach.
- `SURVEYJS_SETUP_2026-02-01.md` is an older setup snapshot.
- `surveys_*_v1.jsonc` files here are archived survey sources not used by the
  current `surveySources` registry.

Current onboarding flow uses:

- `surveys/*.jsonc` active sources
- `scripts/seed-surveys-from-jsonc.mjs`
- `/surveys/<slug>` runtime route
