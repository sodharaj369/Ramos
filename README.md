# Sales Intelligence — Lead Management & Maps Extraction

An internal sales intelligence web application for lead discovery, deduplication, CSV import/export, email verification, and sales signal tracking.

Built with **TanStack Start** (React 19, Vite 8, Tailwind v4) + **Supabase / Lovable Cloud backend** (Postgres, Auth, RLS, Storage).

---

## Current Product Status

| Component | Architecture | Status |
| :--- | :--- | :--- |
| **Sales Intel Web App** | TanStack Start + Supabase | **Active** — Lead table, deduplication, verification history, job management. |
| **Google Maps Discovery** | Browser Chrome Extension (**v1.0.16**) | **Active** — Extracts public Google Maps details directly in the user's Chrome browser. No hosted scraper required. |
| **Built-in Email Verifier** | Server-side validation | **Active** — Syntax, DNS, MX, disposable domain, and role-account checks. |
| **External Email Verifier** | Standalone Go service (`email-verifier-service`) | **Available** — Optional microservice for deep SMTP reachability checks. |
| **Self-Hosted Server Scraper** | Headless Chromium Docker service | **Future / Optional** — Server-side scraper container architecture for headless discovery. |

---

## Key Capabilities

- **Browser-Based Google Maps Discovery** — Extract business leads in real-time using the **Sales Intel Maps Connector** Chrome Extension (**v1.0.16**).
- **Lead Deduplication & Merging** — Multi-key matching (domain → email → phone → company name + city) with field-level enrichment on merge.
- **CSV Export & Import** — RFC4180 parser with column mapping, preview, and current-run CSV export.
- **Email Verification** — Built-in syntax, DNS, and MX checks with 30-day result caching, plus optional Go SMTP verification microservice.
- **Multi-User Access Control** — Team-wide read access with role-based write/admin permissions (RLS).

---

## Google Maps Chrome Extension Workflow (v1.0.16)

Google Maps lead discovery runs locally inside the user's Chrome browser via the extension in `extension/`:

```
Google Maps Search in Chrome
  ↳ Detect result cards
  ↳ Respect user-selected result limit (e.g., max 5 candidates)
  ↳ Build candidate queue & process sequentially
  ↳ Open Google Maps detail panel per candidate
  ↳ Detect detail panel & validate business identity
  ↳ Extract business details (company, address, phone, website, rating, reviews, status, category, URL)
  ↳ Store result against candidate index
  ↳ Move to next candidate upon reaching terminal state
  ↳ Export completed current-run records to CSV
```

### CSV Export Contract
- **Completed Records**: Export CSV contains only completed, validated current-run candidates.
- **Re-Download without Extraction**: Clicking **Download CSV** again exports the existing completed run without re-initiating extraction.
- **Run Isolation**: Results from past runs are never mixed into a new search run.
- **Standalone Export**: CSV export operates independently from Sales Intel web application connection status in the popup.

---

## Architecture: Current vs. Future

### 1. Current Browser Extension Architecture (Active)
No server-side scraper host or headless browser setup is required. The user installs the **Sales Intel Maps Connector (v1.0.16)** from `extension/` into Chrome, navigates to Google Maps, and extracts public listings directly.

### 2. Future / Optional Self-Hosted Scraper Architecture
For automated or headless bulk server-side discovery without an open browser window, the codebase supports an optional backend scraper (`gosom/google-maps-scraper`). See [`docs/self-hosted-google-maps.md`](docs/self-hosted-google-maps.md) for future deployment details.

---

## Local Development Quick Start

Run the local development environment using the root batch scripts:

```cmd
start-local.bat
```

This launches the dev web server (`http://localhost:8080`), starts local support containers (optional Email Verifier on port 8081 and Scraper on port 8082), and verifies service health.

- **Stop Services**: `stop-local.bat`
- **Restart Services**: `restart-local.bat`

See [`docs/local-development.md`](docs/local-development.md) for full local environment setup details.

---

## Chrome Extension Setup

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select the [`extension/`](file:///d:/Sales-Intel/extension) folder.
3. Open `http://localhost:8080/settings` (or your Sales Intel web app instance).
4. Click **Connect Extension** to establish session sync.

See [`docs/chrome-extension.md`](docs/chrome-extension.md) for full extension documentation.

---

## Detailed Documentation

- **Chrome Extension Manual**: [`docs/chrome-extension.md`](docs/chrome-extension.md) — Detailed sequential workflow, candidate queue, extraction fields, and CSV export.
- **Local Development Guide**: [`docs/local-development.md`](docs/local-development.md) — Environment setup, scripts, Docker microservices, and debugging.
- **Future Self-Hosted Scraper**: [`docs/self-hosted-google-maps.md`](docs/self-hosted-google-maps.md) — Optional containerized backend scraper architecture.
- **Email Verifier Service**: [`email-verifier-service/README.md`](email-verifier-service/README.md) — Standalone Go SMTP email verification microservice.
