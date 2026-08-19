# Configuration Governance & Inventory

Status: ACTIVE (v1.0.16)

This document lists all application configuration settings, their sources, visibility rules, secret status, and runtime mutability boundaries.

---

## 1. Configuration Inventory Table

| Setting Key | Current Source | Used By | Secret? | Admin Configurable? | Runtime Change? | Restart / Deployment Required? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Environment Variable / `.env` | Backend / Supabase Client | No | No | No | Deployment | Public Supabase endpoint URL |
| `SUPABASE_PUBLISHABLE_KEY` | Environment Variable / `.env` | Vite / Frontend Client | No | No | No | Deployment | Public anonymous key |
| `SUPABASE_PROJECT_ID` | Environment Variable / `.env` | Backend | No | No | No | Deployment | Project identifier |
| `VITE_SUPABASE_URL` | Environment Variable / `.env` | Frontend Bundle | No | No | No | Build / Restart | Client bundle copy |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Environment Variable / `.env` | Frontend Bundle | No | No | No | Build / Restart | Client bundle copy |
| `EMAIL_VERIFIER_URL` | Environment Variable (`http://localhost:8081`) | Server verification runner | No | Yes (Planned) | Yes (Planned) | No | Target URL of Go verifier microservice |
| `EMAIL_VERIFIER_API_KEY` | Environment Variable / Secrets | Server verification runner | **YES** | Yes (Masked) | Yes (Planned) | No | Server-side secret token for verifier API |
| `GMAPS_SCRAPER_URL` | Environment Variable (`http://localhost:8082`) | Optional server scraper | No | Yes (Planned) | Yes (Planned) | No | Scraper container URL |
| `GMAPS_SCRAPER_API_KEY` | Environment Variable / Secrets | Optional server scraper | **YES** | Yes (Masked) | Yes (Planned) | No | Server-side API key |
| `GMAPS_SCRAPER_MODE` | Environment Variable (`web`) | Optional server scraper | No | Yes (Planned) | Yes (Planned) | No | `web` or `saas` |
| `GMAPS_SCRAPER_LANG` | Environment Variable (`en`) | Optional server scraper | No | Yes (Planned) | Yes (Planned) | No | Results language |
| `GMAPS_SCRAPER_ZOOM` | Environment Variable (`15`) | Optional server scraper | No | Yes (Planned) | Yes (Planned) | No | Map zoom level |
| `GMAPS_SCRAPER_MAX_WAIT_MS` | Environment Variable (`360000`) | Optional server scraper | No | Yes (Planned) | Yes (Planned) | No | Scraper polling timeout (6 min) |
| `EXTENSION_MAX_BATCH_SIZE` | Hardcoded Constant (`50`) | Backend Extension API | No | No | No | Code Change | Max leads per import batch payload |
| `VERIFICATION_CONCURRENCY` | Hardcoded Constant (`3`) | Server job runner | No | Yes (Planned) | Yes (Planned) | No | Simultaneous SMTP check worker threads |
| `JOB_RETRY_COUNT` | Hardcoded Constant (`3`) | Server job runner | No | No | No | Code Change | Retry attempts on transient errors |

---

## 2. Governance Rules for Configuration

1. **Secret Storage Rule**:
   - Secrets (`EMAIL_VERIFIER_API_KEY`, `GMAPS_SCRAPER_API_KEY`, etc.) MUST strictly remain server-side.
   - Never prefix secrets with `VITE_`.
   - Admin UI pages may display "Configured ✓" or "Not Configured", but MUST NEVER display secret values or transmit them to client components.
2. **Runtime Configuration Boundary**:
   - Application defaults (timeouts, result limits, provider endpoints) may be made Admin configurable in future database settings tables.
   - Core database connections and build configurations require code/deployment changes.
3. **Environment Template Synchronization**:
   - Whenever a new environment variable is introduced, it MUST be declared in `.env.example` with a clear comment and blank value.
