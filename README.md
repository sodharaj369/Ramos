# Sales Intelligence — Internal Tool

An internal web application for the sales team: lead management, deduplication,
CSV import/export, email verification and background job processing, built on a
pluggable data-provider architecture.

Stack: TanStack Start (React 19, Vite 7, Tailwind v4) + Lovable Cloud backend
(Postgres, auth, RLS, storage).

## Current capabilities

- **Authentication** — email/password sign-up, sign-in, password reset, email
  verification state with resend + cooldown, protected routes.
- **Multi-user access** — team-wide read access to leads/jobs/verifications;
  write access limited to record creators and admins (role table + RLS).
- **Lead management** — filterable, paginated leads table, lead detail with
  sales signals, provenance and change history.
- **CSV import/export** — RFC4180 parser, column mapping, preview, export of
  filtered/selected leads.
- **Deduplication** — multi-key matching (domain → email → phone → name+city)
  with field-level enrichment on merge, backed by DB unique constraints.
- **Email verification** — built-in verifier (syntax, DNS, MX, disposable
  domains, role accounts) with 30-day result caching.
- **Verification history** — team-wide audit log of every verification result.
- **Job processing** — queued/running/completed/failed/cancelled jobs, batched
  and resumable, with retry/backoff and per-provider usage tracking. Batches are
  driven by the open browser tab; there is no server-side scheduler yet.
- **Provider architecture** — lead sources and email verifiers are pluggable
  behind a common interface; credentials live in server-side secrets only.

## Current status

| Component | Status |
| --- | --- |
| Lead discovery — self-hosted Google Maps scraper | **Not yet deployed.** No scraper host exists, so lead discovery is unavailable. The Lead Finder shows "Not configured" and search is disabled. |
| External email verifier | **Not configured.** Requires `EMAIL_VERIFIER_ENDPOINT` + `EMAIL_VERIFIER_API_KEY`. |
| Built-in email verifier | **Available.** No SMTP mailbox handshake, so mailbox existence is never confirmed — results are `valid`/`risky`/`unknown` accordingly. |
| Demo lead source | Synthetic sample data for testing only. Must be selected explicitly; it never runs automatically and results are prefixed `[DEMO]`. |

Real Google Maps lead discovery is **not** currently available in this
deployment.

## Future infrastructure

The Google Maps lead source will run as a **separate Docker service**
(`gosom/google-maps-scraper`, MIT) on infrastructure outside this app —
a VPS or container host. The application only calls that service's HTTP API
server-side.

```
Application  ->  Lovable / Supabase (app, database, auth)
Scraper      ->  Separate Docker host (headless Chromium, HTTP API)
```

Headless Chromium/Playwright cannot and must not run inside Supabase Edge
Functions or the app's serverless runtime. Once the container is deployed, set
`GMAPS_SCRAPER_URL` (and optionally an API key) as a server-side secret and the
provider switches on with no code changes.

Deployment guide: [`docs/self-hosted-google-maps.md`](docs/self-hosted-google-maps.md).

## Environment variables

See [`.env.example`](.env.example) for the full list of names. Provider
credentials are server-side only and are never sent to the browser; the UI shows
only configured / not-configured status.

## Development

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Never commit `.env`, secrets, API keys, service-role keys, tokens or local
scraper data — all are excluded via `.gitignore`.
