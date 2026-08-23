# RAMOS — Standalone Google Maps Business Extractor (v1.0.0)

A standalone Manifest V3 Chrome Extension for Google Maps lead extraction, sequential detail-panel enrichment, canonical lead normalization, and local CSV export.

RAMOS runs completely inside the user's browser without external API servers, backend databases, or third-party web application dependencies.

---

## Capabilities

- **Browser-Based Google Maps Extraction** — Extract business leads in real-time from `google.com/maps`.
- **Sequential Candidate Queue** — Single-flight candidate tracking with per-candidate bounded timeouts (15s).
- **Identity Matching** — Strict business identity check (`expectedName` vs `panelName`) to guarantee zero false-positive panel assignments.
- **Rich Data Fields** — Company name, phone, website, address, city, region, country, postal code, rating, reviews, opening status, price range, booking/ordering/menu URLs.
- **Standalone Local CSV Export** — Export clean UTF-8 BOM CSV files directly via `chrome.downloads`.

---

## Installation & Setup

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select the [`extension/`](file:///d:/Ramos/extension) folder.
3. Open Google Maps (`https://www.google.com/maps`), search for a business category (e.g., `pizza near Satellite`), and click the **RAMOS** icon in your browser toolbar to run discovery.

---

## Testing & Packaging

- **Run Unit Tests**: `npm test`
- **Package Extension**: `npm run package:extension` (generates `dist/ramos-maps-connector-v1.0.0.zip`)
- **Check Project Consistency**: `npm run check:consistency`

---

## Documentation

- **Architecture Specification**: [`RAMOS_CURRENT_ARCHITECTURE.md`](RAMOS_CURRENT_ARCHITECTURE.md) & [`docs/RAMOS_ARCHITECTURE.md`](docs/RAMOS_ARCHITECTURE.md)
- **Extraction Rules & Selectors**: [`docs/RAMOS_EXTRACTION_RULES.md`](docs/RAMOS_EXTRACTION_RULES.md)
- **Cleanup Audit Plan**: [`RAMOS_CLEANUP_PLAN.md`](RAMOS_CLEANUP_PLAN.md)
