# RAMOS — Stable Baseline Specification (v1.0.5)

## Executive Summary
This document defines the authoritative, frozen engineering baseline for **RAMOS – Maps Lead Extractor (v1.0.5)**.

RAMOS is a standalone, local Manifest V3 Chrome Extension designed for Google Maps business lead extraction, sequential detail-panel enrichment, canonical normalization, and local CSV/XLSX export.

---

## 1. Product Identity & Target Architecture

- **Product Name**: RAMOS – Maps Lead Extractor
- **Short Name**: RAMOS
- **Version**: `1.0.5`
- **Target Distribution**: Local unpacked installation via `chrome://extensions` → Developer Mode → Load unpacked.
- **Runtime Environment**: Manifest V3 Chrome Extension (Google Maps Content Script + Background Service Worker + Popup Window).
- **External Dependencies**: **0 runtime npm packages**, 0 backend databases (Supabase removed), 0 external API servers, 0 auth services, 0 Node.js runtime globals (`Buffer`, `process`, `fs`, `path`).

---

## 2. Component Structure & Communication

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

---

## 3. Canonical Schema (24 Export Fields)

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
23. `Source Query` — Search term executed (e.g. `hyundai near me`)
24. `Run ID` — Discovery session identifier

---

## 4. Export Capabilities & Formatting

- **Filename Structure**: `ramos-${sanitize(query)}-${YYYY}-${MM}-${DD}.${csv|xlsx}`
- **CSV Format**: Clean UTF-8 with Byte Order Mark (`\uFEFF`), CRLF line endings (`\r\n`), strict RFC 4180 escaping.
- **XLSX Format**: ECMA-376 OOXML Strict compliant binary zip archive generated 100% client-side via native `Uint8Array`, `TextEncoder`, and `DataView` primitives.
  - **Header Row**: RAMOS Deep Violet fill (`#7C3AED`), white bold text, centered/top-aligned, 28pt height, wrapped text.
  - **Grid Styling**: Alternating white (`#FFFFFF`) and light neutral (`#F8FAFC`) row fills with slate borders (`#E2E8F0`).
  - **Top Row Freeze**: `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`.
  - **Header AutoFilter**: AutoFilter enabled across all columns (`A1:X{N}`).
  - **Excel Compatibility**: Verified 100% clean open in Microsoft Excel without recovery prompts.

---

## 5. Manifest & Permissions Audit

[`extension/manifest.json`](file:///d:/Ramos/extension/manifest.json) contains minimal required permissions:
- `permissions`:
  - `storage` — Persisting popup options and user limits.
  - `tabs` — Querying active Google Maps tab status.
  - `scripting` — Injecting content scripts into Google Maps tabs.
  - `downloads` — Saving CSV and XLSX export files via `chrome.downloads.download()`.
- `host_permissions`:
  - `https://www.google.com/maps*`
  - `https://*.google.com/maps*`
  - `https://maps.google.com/*`

---

## 6. Validation & Consistency Results

| Verification Suite | Execution Result | Status |
| :--- | :--- | :--- |
| **Unit & Regression Suite** (`npm test`) | **14 / 14 Passed** (632ms) | **PASS** |
| **Consistency Checker** (`npm run check:consistency`) | Checked docs, secret hygiene, versioning | **PASS** |
| **Distribution Packager** (`npm run package:extension`) | Generated `dist/ramos-maps-connector-v1.0.5.zip` (49.6 KB) | **PASS** |
| **Parity Verifier** (`node scripts/verify-packaged-extension-parity.js`) | Source vs ZIP artifact 100% verified (v1.0.5) | **PASS** |

---

## 7. Baseline Declaration

RAMOS **v1.0.5** is officially **FROZEN** as the stable internal baseline. Future feature development (e.g. VibeProspecting, Apollo integration, external enrichment APIs) must branch cleanly from this baseline.
