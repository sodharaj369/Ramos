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

## Capabilities

- **Browser-Based Google Maps Extraction** — Extract business leads in real-time from `google.com/maps`.
- **Sequential Candidate Queue** — Single-flight candidate tracking with per-candidate bounded timeouts (15s).
- **Identity Matching** — Strict business identity check (`expectedName` vs `panelName`) to guarantee zero false-positive panel assignments.
- **Rich Data Fields** — Company name, phone, website, address, city, region, country, postal code, rating, reviews, opening status, price range, booking/ordering/menu URLs.
- **Standalone Local CSV & Excel Export** — Export clean UTF-8 BOM CSV files or formatted Microsoft Excel (`.xlsx`) files directly via `chrome.downloads` (`ramos-${query}-${date}.xlsx`).

---

## Installation & Setup

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select the [`extension/`](file:///d:/Ramos/extension) folder.
3. Open Google Maps (`https://www.google.com/maps`), search for a business category (e.g., `pizza near Satellite`), and click the **RAMOS** icon in your browser toolbar to run discovery.

---

## Testing & Packaging

- **Run Unit Tests**: `npm test`
- **Package Extension**: `npm run package:extension` (generates `dist/ramos-maps-connector-v1.0.6.zip`)
- **Check Project Consistency**: `npm run check:consistency`

---

## Documentation

- **Brand Guidelines**: [`docs/RAMOS_BRAND_GUIDELINES.md`](docs/RAMOS_BRAND_GUIDELINES.md)
- **Architecture Specification**: [`RAMOS_CURRENT_ARCHITECTURE.md`](RAMOS_CURRENT_ARCHITECTURE.md) & [`docs/RAMOS_ARCHITECTURE.md`](docs/RAMOS_ARCHITECTURE.md)
- **Extraction Rules & Selectors**: [`docs/RAMOS_EXTRACTION_RULES.md`](docs/RAMOS_EXTRACTION_RULES.md)
- **Master Internal Audit**: [`docs/RAMOS_INTERNAL_AUDIT.md`](docs/RAMOS_INTERNAL_AUDIT.md)
