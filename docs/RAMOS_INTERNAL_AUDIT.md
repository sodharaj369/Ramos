# RAMOS — Master Internal Extension Audit & System Review (v1.0.0)

## Executive Summary
This document provides the authoritative internal audit for the **RAMOS Standalone Chrome Extension (`v1.0.0`)**.

RAMOS is a **standalone internal Chrome Extension** for Google Maps lead extraction, sequential detail enrichment, canonical lead normalization, and local CSV export. It is installed locally in Chrome via **Developer Mode** (`chrome://extensions` → **Load unpacked**).

RAMOS is **NOT** a public Chrome Web Store product. It requires zero Web Store publishing tasks, store screenshots, promotional tiles, SEO optimization, or publisher verification.

---

## Audit Matrix & Findings

### 1. Branding Audit
- **Current Product Name**: `RAMOS`
- **Functional Descriptor**: `Maps Lead Extractor`
- **Audit Findings**:
  - User-facing popup (`extension/popup.html`) and scripts (`popup.js`) are 100% clean and display `RAMOS` branding.
  - Internal comments in `background.js` and `popup.css` contain legacy `Sales Intel` references.
  - Global UMD exports in content scripts retain `SalesIntel*` namespaces (aliased to `Ramos*` in `schema.js`). These are internal script variable names and do not affect end-user UX.
  - Default CSV filename in `background.js` uses `sales-intel-...csv`. Recommend updating to `ramos-...csv` in the next controlled phase.

---

### 2. Extension Name & Metadata Alignment
- **Current `extension/manifest.json`**:
  - `name`: `"RAMOS Maps Connector"`
  - `description`: `"Standalone Chrome extension for Google Maps business discovery, detail enrichment, and CSV export."`
  - `version`: `"1.0.0"`
  - `action.default_title`: `"RAMOS Maps Connector"`
- **Current `package.json`**:
  - `name`: `"ramos-maps-connector"`
  - `version`: `"1.0.0"`
- **Recommended Final Internal Metadata**:
  - `name`: `"RAMOS – Maps Lead Extractor"`
  - `short_name`: `"RAMOS"`
  - `description`: `"Extract business details from Google Maps and export clean leads to CSV."`
  - `action.default_title`: `"RAMOS – Maps Lead Extractor"`

---

### 3. Manifest Audit & Permission Analysis
- **Authoritative Manifest**: [`extension/manifest.json`](file:///d:/Ramos/extension/manifest.json) is **authoritative**. Chrome loads `extension/` directly, and `scripts/extension-package.js` packages `extension/manifest.json`.
- **Root `manifest.json` Assessment**: Root `manifest.json` is redundant and can cause drift if modified independently. Recommend removing root `manifest.json` in a future cleanup phase while keeping `extension/manifest.json`.
- **Permission Analysis**:
  - `"storage"`: **REQUIRED**. Preserves user result limit selections and temporary run state.
  - `"tabs"`: **REQUIRED**. Queries active Google Maps tabs and manages tab communication.
  - `"scripting"`: **REVIEW / CAN BE NARROWED**. Inherited from early web app bridge; content scripts are declared statically via `content_scripts` matchers.
  - `"downloads"`: **REQUIRED**. Triggers direct local CSV downloads.
  - `host_permissions`: Tightly scoped to `https://www.google.com/maps*`, `https://*.google.com/maps*`, `https://maps.google.com/*`.

---

### 4. Icon & Favicon Audit
- **Current Icons**: Single icon at `d:\Ramos\extension\icon.png` (70.5 KB, 128x128).
- **Chrome Developer Mode Behavior**: Chrome automatically downscales `icon.png` for toolbar icons, extension management cards, and context menus.
- **Icon Recommendation**: For local developer installation, 128x128 is fully functional. Providing dedicated 16x16, 32x32, 48x48, and 128x128 PNG icons under RAMOS branding will improve visual clarity.
- **Favicon Assessment**: `popup.html` currently has no `<link rel="icon">`. Adding `<link rel="icon" type="image/png" href="icon.png">` provides a clean favicon when `popup.html` is opened directly in a browser tab.

---

### 5. Versioning Alignment
- All **10 version references** across `extension/manifest.json`, root `manifest.json`, `package.json`, `popup.html`, `scripts/extension-package.js`, `scripts/verify-packaged-extension-parity.js`, and documentation are **100% synchronized at `1.0.0`**.
- Future versioning strategy will follow semantic increments: `1.0.0` → `1.0.1` → `1.0.2`.

---

### 6. Local Developer-Mode Installation
- **Installation Procedure**:
  1. Open Chrome → Navigate to `chrome://extensions`.
  2. Enable **Developer mode** toggle.
  3. Click **Load unpacked**.
  4. Select `d:\Ramos\extension` directory.
- **Build Pre-requisites**: **NONE**. All extension files in `extension/` are native browser JavaScript, HTML, and CSS. No build step is required prior to loading unpacked.

---

### 7. Packaging & Distribution Audit
- **Packaging Command**: `npm run package:extension` (`node scripts/extension-package.js`).
- **Output Artifact**: `dist/ramos-maps-connector-v1.0.0.zip` (109.3 KB, 16 packaged files).
- **Package Integrity**: Whitelist-based packaging guarantees **zero** web app, Supabase, or test scratch files enter the ZIP archive.

---

### 8. Dependency & Security Audit
- **Runtime Dependencies**: **0 runtime npm dependencies**.
- **DevDependencies**: 8 standard Node/TypeScript packages (`eslint`, `prettier`, `typescript`, `tsx`, `@types/node`).
- **Secrets & Security**: Zero API keys, zero Supabase service role keys, zero backend auth tokens exist in source code. Tightly restricted network scope.

---

## Master KEEP / REMOVE / REVIEW Table

| Target Path | Category | Purpose / Rationale |
| :--- | :--- | :--- |
| `extension/` | **KEEP** | Authoritative Chrome Extension source code (manifest V3, background, discovery, popup, content scripts). |
| `tests/maps/` | **KEEP** | Node unit and E2E diagnostic test suite (`gmaps-card-pipeline.test.ts`). |
| `scripts/extension-package.js` | **KEEP** | Packaging script for `ramos-maps-connector-v1.0.0.zip`. |
| `scripts/check-project-consistency.js` | **KEEP** | Automated repository consistency checker. |
| `scripts/verify-packaged-extension-parity.js` | **KEEP** | Version and packaging parity validator. |
| `docs/RAMOS_ARCHITECTURE.md` | **KEEP** | Technical architecture specification. |
| `docs/RAMOS_EXTRACTION_RULES.md` | **KEEP** | Google Maps selectors & extraction pipeline specification. |
| `package.json` | **KEEP** | Node package manifest with 0 runtime dependencies. |
| `manifest.json` (Root) | **REMOVE / REVIEW** | Redundant duplicate of `extension/manifest.json`. Can drift if modified separately. |
| `public/` | **REMOVE** | Obsolete Sales Intel static asset build folders (`sales-intel-maps-connector-v1.0.11` to `v1.0.16`). |
| `scratch/` | **REMOVE / ARCHIVE** | Temporary test runner scripts and CDP diagnostic profiles. |
| `e2e-artifacts/` | **REMOVE / ARCHIVE** | Generated test execution log files from Phase 3 diagnostic runs. |

---

## Protection of Working Google Maps Extraction Logic

The following core components are **100% preserved and protected**:
- Search result card extraction & qualification (`result-card-extractor.js`)
- Detail panel enrichment & identity verification (`detail-extractor.js`)
- Google Maps DOM selectors (`selectors.js`)
- Address & location parsing (`address-parser.js`)
- Data validation rules (`validators.js`)
- Bounded loop & candidate queue state machine (`background.js`)
- Canonical lead schema & CSV exporter (`schema.js`, `background.js`)

---

## Final Readiness Score

**READINESS SCORE: READY WITH MINOR CLEANUP**

- **Core Functionality**: 100% working, regression-tested against live Google Maps, 0 data leaks, 0 field shifts.
- **Package Integrity**: 100% verified (`ramos-maps-connector-v1.0.0.zip`, 0 runtime dependencies).
- **Minor Cleanup Actions**: Purge obsolete `public/`, `scratch/`, and `e2e-artifacts/` folders, align metadata name to `RAMOS – Maps Lead Extractor`, and update CSV filename prefix to `ramos-*.csv`.
