# Project Instructions & Context

## Persistent Tasks
- **Ecosystem Expansion:** Refer to `ECOSYSTEM_PLAN.md` for the full architectural blueprint of the "Distributor" and "User_Manager" projects. Do not start building these until explicitly requested, but keep their logic in mind for any API changes to the core Deep Insight engine.

## Core Rules
- **Audio Quality:** Prioritize SSML interjections and dynamic prosody.
- **Grounding:** Maintain an 80/20 ratio (80% SEC filing, 20% external context).
- **Database Safety:** Large assets (audio/content) must be stored in the `/storage` directory, not directly in SQLite.
- **API Resilience:** Always handle 429 (Quota) and 403 (Suspension) errors gracefully with fallbacks and user-facing status updates.
