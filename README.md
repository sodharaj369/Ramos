# RAMOS — Maps Lead Extractor & Website Intelligence

**RAMOS** is a standalone, client-side Manifest V3 Chrome Extension designed for high-precision business lead extraction, website intelligence enrichment, executive discovery, and automated spreadsheet generation.

Operating 100% inside Google Chrome, RAMOS has **zero dependencies** on external servers, cloud databases, scraping microservices, or third-party API keys.

---

## Current Status & Version

- **Current Version**: `v1.0.6`
- **Release Status**: **Pilot Ready / Release Candidate**
- **Architecture Baseline**:
  - `v1.0.5`: Authoritative, frozen Google Maps extraction engine.
  - `v1.0.6`: Current integrated release candidate with Website Intelligence (Phases 0–9).
- **Automated Tests**: **162 passing tests / 0 failures** (`npm test`).

---

## What RAMOS Does

1. **Extract Leads from Google Maps**: Real-time extraction of company names, phone numbers, websites, full addresses, ratings, reviews, opening status, and action links from `google.com/maps`.
2. **Extract & Enrich Business Websites**: Bounded, targeted crawling prioritizing `/contact`, `/about`, `/team`, and `/locations` pages.
3. **Discover Contacts & Decision Makers**: Extracts leadership and team members with seniority ranking (`Founder`, `C-Suite`, `VP`, `Director`) and identifies primary commercial decision makers.
4. **Extract Social & Multi-Contact Data**: Discovers verified LinkedIn company pages, Twitter/X, Facebook, Instagram, YouTube, and GitHub profiles, preserving multiple corporate emails (`sales@`, `info@`) and phones.
5. **Score Lead Quality**: Deterministically scores lead viability (0–100) and assigns actionable sales qualification tiers (`HIGH`, `MEDIUM`, `LOW`).
6. **Deduplicate Leads**: Conservative, precision-first deduplication by `place_id`, domain+phone, or domain+name similarity without merging separate branch locations.
7. **Export Clean Datasets**: Direct, 100% browser-native export to 24-column Maps CSV/XLSX or 34-column Enriched CSV/XLSX (with relational "People" sheet) via `chrome.downloads`.

---

## Quickstart & Installation

1. Clone or download the repository.
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the [`extension/`](extension/) directory (or use `dist/ramos-maps-connector-v1.0.6.zip`).
5. Pin the **RAMOS** extension icon to your Chrome toolbar.
6. Open Google Maps (`https://www.google.com/maps`), search for businesses (e.g. `commercial roofing in Dallas`), and click the RAMOS extension icon to extract leads.

---

## Dual Export Pipelines

| Export Mode | Output Formats | Columns / Sheets | Description |
| :--- | :--- | :--- | :--- |
| **Maps Standalone** | CSV & XLSX | 24 Columns (1 sheet) | Frozen baseline export with core physical business details directly from Google Maps. |
| **Enriched Leads** | CSV & XLSX | 34 Columns + 2-Sheet XLSX | Enriched export including lead scores, decision makers, social profiles, and a dedicated "People" sheet. |

---

## Honest Operational Limitations

1. **Client-Side IP Rate Limiting**: All network requests originate directly from the user's browser. While 50–100 leads per batch run smoothly, running hundreds of consecutive website crawls from the same residential IP may cause target servers to rate-limit requests.
2. **Anti-Bot & CAPTCHA Challenges**: RAMOS does not attempt to bypass CAPTCHA challenges. Bot-protected sites time out cleanly after 6 seconds and are marked as `failed` without crashing the extension.
3. **Client-Rendered JavaScript SPAs**: Websites that render all content via client-side JavaScript without server-rendered HTML will yield only metadata and structured JSON-LD present in the initial markup.
4. **Single Active Tab**: Only one Google Maps tab should be actively running extraction at a time.

---

## Verification & Testing Commands

```powershell
# Run all 162 unit & regression tests
npm test

# Check project consistency & hygiene
npm run check:consistency

# Build release extension package
npm run package:extension

# Verify packaged zip parity
node scripts/verify-packaged-extension-parity.js
```

---

## Documentation Map

- [Documentation Status Matrix](docs/RAMOS_DOCUMENTATION_STATUS.md)
- [AI Development Contract & Governance (AGENTS.md)](AGENTS.md)
- [Current System Architecture](RAMOS_CURRENT_ARCHITECTURE.md)
- [Stable Baseline Specification](docs/RAMOS_STABLE_BASELINE.md)
- [Export Specification](docs/RAMOS_EXPORT_SPECIFICATION.md)
- [Website Intelligence Architecture](docs/RAMOS_WEBSITE_ARCHITECTURE.md)
- [Website Extraction Rules](docs/RAMOS_WEBSITE_EXTRACTION_RULES.md)
- [Field Specification](docs/RAMOS_WEBSITE_FIELD_SPECIFICATION.md)
- [Website Implementation Roadmap](docs/RAMOS_WEBSITE_ROADMAP.md)
- [Security & Privacy Architecture](docs/RAMOS_WEBSITE_SECURITY.md)
- [Release Candidate Checklist](docs/RAMOS_RELEASE_CANDIDATE_CHECKLIST.md)
- [Pilot Readiness Document](PILOT_READINESS.md)
- [Changelog](docs/CHANGELOG.md)
