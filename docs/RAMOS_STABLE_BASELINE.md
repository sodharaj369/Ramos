# RAMOS — Stable Baseline Specification

**Frozen Maps Baseline:** `v1.0.5`  
**Current Integrated Release:** `v1.0.6` (Pilot Ready / Release Candidate)  
**Distribution Artifact:** `dist/ramos-maps-connector-v1.0.6.zip` (111.1 KB, 36 runtime files)  
**Engineering State:** **PERMANENTLY FROZEN**

---

## 1. Executive Summary & Dual Baseline Hierarchy

This document defines the engineering baselines of the RAMOS Chrome Extension:

1. **v1.0.5 Baseline (Frozen Google Maps Engine)**:
   - Authoritative, permanent freeze of the core Google Maps lead extraction engine.
   - Preserves DOM discovery scripts, candidate queue state machine, card extractors, detail panel navigators, and the canonical 24-column Maps export format.
   - Maps extraction logic is **100% stable and frozen**.

2. **v1.0.6 Baseline (Integrated Pilot & Release Candidate)**:
   - Integrates modular Website Intelligence, targeted multi-page crawling, people and decision maker discovery, multi-contact aggregation, confidence and conflict resolution, lead quality scoring, deduplication, and the 34-column enriched export pipeline.
   - Passed all 162 automated test suites, real Chrome browser validation runs, and physical spreadsheet verification audits.
   - Formally designated as **Pilot Ready / Release Candidate**.

---

## 2. Product Identity & Target Architecture

- **Product Name**: RAMOS – Maps Lead Extractor & Website Intelligence
- **Short Name**: RAMOS
- **Current Version**: `1.0.6`
- **Target Distribution**: Local unpacked installation via `chrome://extensions` → Developer Mode → Load unpacked.
- **Runtime Environment**: Manifest V3 Chrome Extension (Google Maps Content Script + Background Service Worker + Popup Window).
- **External Dependencies**: **0 runtime npm packages**, 0 backend databases, 0 external API servers, 0 auth services, 0 Node.js runtime globals (`Buffer`, `process`, `fs`, `path`).

---

## 3. Frozen Google Maps Baseline (v1.0.5)

The Google Maps extraction pipeline established in `v1.0.5` remains active and completely untouched:

```
Google Maps Page (google.com/maps)
       ↓
Content Script Engine (extension/content/maps/*, discovery.js)
       ↓ (Chrome Runtime Messaging)
Background Service Worker (extension/background.js) [Authoritative State]
       ↓ (Chrome Runtime Messaging)
Popup UI Controller (extension/popup.js, popup.html)
       ↓ (chrome.downloads API)
Local CSV Export / OpenXML XLSX Export (extension/shared/xlsx-builder.js)
```

### Frozen Canonical Schema (24 Export Fields)
1. `Company` — Extracted business title
2. `Phone` — Parsed phone number (preserved as raw text to prevent leading-zero truncation)
3. `Website` — Primary website URL (formatted as clickable hyperlink in XLSX)
4. `Email` — Contact email if available
5. `Email Status` — Verification status
6. `Address` — Complete physical address (top-aligned, wrapped cells)
7. `City` — Extracted city
8. `State / Region` — State or province
9. `Country` — Country name
10. `Postal Code` — Zip / postal code (preserved as raw text)
11. `Industry` — Business category
12. `Business Type` — Primary classification
13. `Rating` — Numeric star rating (e.g. 4.6)
14. `Reviews` — Total review count (e.g. 1250)
15. `Opening Status` — Operating hours status
16. `Price Range` — Price indicator (e.g. ₹₹₹ / $$$)
17. `Booking URL` — Appointment/reservation link (clickable hyperlink)
18. `Ordering URL` — Online ordering link (clickable hyperlink)
19. `Menu URL` — Digital menu link (clickable hyperlink)
20. `Imported At` — ISO 8601 discovery timestamp
21. `Source URL` — Google Maps URL (clickable hyperlink)
22. `Place ID` — Google Maps Place ID identifier
23. `Source Query` — Search term executed (e.g. `commercial roofing`)
24. `Run ID` — Discovery session identifier

---

## 4. Integrated Release Candidate Baseline (v1.0.6)

RAMOS `v1.0.6` integrates the full Website Intelligence subsystem on top of the frozen Maps baseline without modifying Maps extraction contracts:

### Integrated Subsystems
- **Single-Page Website Extraction (Phase 1)**: Structured data (JSON-LD, microdata), semantic DOM, mailto/tel, OpenGraph.
- **Smart Targeted Crawling (Phase 2)**: Priority queue scoring `/contact`, `/about`, `/team`, `/locations` with dynamic field-awareness and bounded budgets (max 20 pages, max depth 2).
- **People & Leadership Extraction (Phase 3)**: Team card parser, Person schema, clean name/title separation, and seniority ranking (`c_level`, `vp`, `director`, `founder`, `manager`, `staff`).
- **Evidence & Confidence Scoring (Phase 4)**: 7-tier source reliability weighting, page context modifiers, cross-page corroboration bonuses, and deterministic conflict resolution.
- **Dual-Mode UI (Phase 5)**: Seamless mode switching in extension popup with live progress bars, people view, and error toasts.
- **Maps → Website Lead Enrichment (Phase 6)**: Non-destructive merger with Maps authority for physical fields and field-level `_provenance` dictionary.
- **Export Parity & Social Support (Phase 7)**: Preserved 24-col Maps export; added social columns (LinkedIn, Twitter/X, Facebook, Instagram, YouTube, GitHub) and 2-sheet XLSX.
- **Lead Quality & Deduplication (Phase 8)**: Transparent lead scoring (0–100), quality tiers (`HIGH`, `MEDIUM`, `LOW`), conservative deduplication (`place_id`, domain+phone, domain+name similarity), and multi-contact preservation (`emails[]`, `phones[]`).
- **Production Hardening & RC Validation (Phase 9)**: 162 passing automated tests, zero secret exposures, 100% packaged file parity (36 runtime files), and end-to-end spreadsheet verification.

---

## 5. Enforced Timeout Standards (Source Code Authoritative)

| Operation | Enforced Timeout | Location | Purpose |
| :--- | :--- | :--- | :--- |
| **Maps Candidate Extraction** | **15,000 ms (15s)** | `extension/background.js:646` | Guards against stuck detail panel rendering or Maps network lag. |
| **Batch Enrichment Page Fetch** | **6,000 ms (6s)** | `extension/popup.js:829` | Bounded per-website timeout to keep batch enrichment moving on broken/slow sites. |
| **Interactive Website Crawl Fetch** | **10,000 ms (10s)** | `extension/popup.js:1040` | Interactive timeout for single-site deep crawls in popup UI. |

---

## 6. Verification Results Summary

| Verification Suite | Test Count | Result | Status |
| :--- | :--- | :--- | :--- |
| **Google Maps Regression Suite** | 14 tests | 14 passed | **PASS** |
| **Website Intelligence Unit Suite** | 143 tests | 143 passed | **PASS** |
| **Phase 9 RC QA Matrix** | 5 tests | 5 passed | **PASS** |
| **Total Automated Test Suite** (`npm test`) | **162 tests** | **162 passed / 0 failed** | **PASS** |
| **Project Consistency Checker** (`npm run check:consistency`) | Docs, secrets, hygiene | 0 errors | **PASS** |
| **Packaged Extension Parity** (`node scripts/verify-packaged-extension-parity.js`) | 36 runtime files | 100% parity match | **PASS** |
