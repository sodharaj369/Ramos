# RAMOS — Lead Export & State Contract Specification (v1.0.5)

## Executive Summary
This document specifies the authoritative state contract, CSV export format, OpenXML XLSX Excel export architecture, popup state reconstruction rules, and test verification suite for **RAMOS – Maps Lead Extractor (v1.0.5)**.

RAMOS supports **two export pipelines**:
- **Maps Canonical Export** — 24-column CSV/XLSX, frozen, unchanged.
- **Website Intelligence Export** — 26-column CSV + 2-sheet XLSX (Leads + People), including social platform URLs.

---

## 1. OOXML Strict Excel Compatibility Fixes (v1.0.5)

### Root Cause of Excel Recovery Dialog
When opening generated `.xlsx` files, Microsoft Excel displayed:
*"We found a problem with some content in 'ramos-...xlsx'. Do you want us to try to recover as much as we can?"*

Systematic OOXML structural analysis revealed 6 specific defects in the generated OpenXML files:

1. **Missing Custom `<numFmts>` Declaration**:
   Style XFs 4 and 5 referenced `numFmtId="49"` (Text format `@`), but `numFmtId="49"` was not declared in `<numFmts>` at the top of `<styleSheet>`.
2. **Invalid Font Element Sequence**:
   Child nodes inside `<font>` violated ECMA-376 schema order. In particular, `<u>` lacked `val="single"` attribute (`<u val="single"/>`) and appeared after `<color>`.
3. **Unpreserved Multiline Whitespace**:
   Multiline addresses inside `<t>` nodes lacked `xml:space="preserve"`, causing Excel's XML parser to fail whitespace validation on raw `\n` characters.
4. **Unsanitized XML Control Characters**:
   ASCII control characters (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`) inside scraped strings were not stripped.
5. **Zip Header DOS Timestamps**:
   Zip headers emitted `0x0000` DOS time and `0x0000` DOS date (representing invalid `00/00/1980`), causing Windows Zip decoders and Excel's Zip engine to flag file corruption.
6. **Worksheet Page Margins**:
   Missing standard `<pageMargins>` element following `<autoFilter>`.

### Resolution Applied in `v1.0.5`
- Refactored [`extension/shared/xlsx-builder.js`](file:///d:/Ramos/extension/shared/xlsx-builder.js) to satisfy ECMA-376 OOXML Strict schema definitions.
- Explicitly declared `<numFmts count="1"><numFmt numFmtId="49" formatCode="@"/></numFmts>`.
- Enforced strict sequence for `<font>` children: `<b>`, `<i>`, `<u val="single"/>`, `<sz>`, `<color>`, `<name>`.
- Added `xml:space="preserve"` attribute to all string nodes (`<t xml:space="preserve">`).
- Sanitized all control characters in `escapeXml()`.
- Set valid MS-DOS Zip timestamps (`Jan 1, 2024`).
- Maintained 0 runtime npm dependencies and 100% browser-native `Uint8Array` primitives.

---

## 2. Authoritative Export State Contract

1. **State Preservation**: Completed lead records (`currentRun.readyLeads` where `enrichmentStatus === "complete"`) are preserved in background runtime state until a NEW search query is executed.
2. **Export Eligibility**:
   ```
   IF readyCount > 0 THEN:
     - Download Excel (.xlsx) = ENABLED
     - Download CSV (.csv)   = ENABLED
     - Action Button text    = "Run Discovery Again"
   ```
3. **Non-Destructive Export**: Downloading CSV or Excel does **NOT** clear `readyLeads` or reset the discovery state.
4. **Search Isolation**: Executing a new search query creates a fresh `runId` and candidate queue, guaranteeing **0 stale lead leaks** between searches.

---

## 3. Test Verification Suite (`tests/maps/gmaps-card-pipeline.test.ts`)

| Test Case | Description | Result |
| :--- | :--- | :--- |
| **TEST 1** | 5 ready records → Immediate CSV download succeeds | **PASS** |
| **TEST 2** | 5 ready records → Immediate Excel (.xlsx) download succeeds | **PASS** |
| **TEST 3** | Popup reopened after discovery → Ready count restored → CSV download works | **PASS** |
| **TEST 4** | Popup reopened after discovery → Excel download works | **PASS** |
| **TEST 5** | Ready = 0 → Export buttons disabled | **PASS** |
| **TEST 6** | Discovery completed → Export → Run Discovery Again → New Search → Export (No stale records) | **PASS** |
| **TEST 7** | Pizza search → Export → Gym search → Export (Zero Pizza records in Gym export) | **PASS** |
| **TEST 8** | Limit = 5 → Exactly 5 leads exported | **PASS** |
| **TEST 9** | Limit = 10 → Up to 10 leads exported | **PASS** |
| **TEST 10** | Partial lead fields → Zero column shifting | **PASS** |
| **INTEGRITY**| CSV vs XLSX record count and field match verification | **PASS** |
| **BROWSER**  | Browser compatibility regression test (globalThis.Buffer = undefined) | **PASS** |
| **OOXML**    | ECMA-376 OOXML Strict XML & schema compliance regression test | **PASS** |

---

## 4. Versioning History
- `1.0.0` — Initial Standalone RAMOS Extension Clean Cut.
- `1.0.1` — RAMOS Visual Branding Redesign & Product Identity.
- `1.0.2` — Export Reliability Hardening, OpenXML XLSX Excel Exporter, Toast Feedback System & Popup State Reconstruction.
- `1.0.3` — Critical XLSX Export Regression Fix (100% Browser-Native `Uint8Array` / `TextEncoder` primitives, zero `Buffer` reliance).
- `1.0.4` — XLSX Readability Polish (Deliberate column widths, wrapped headers, alternating rows).
- `1.0.5` — Critical XLSX OpenXML Validation Bug Fix (ECMA-376 OOXML Strict Schema Compliance, `numFmts` declaration, `xml:space="preserve"`, valid Zip timestamps).

---

## 5. Website Intelligence Export Format

### 5.1 CSV — 26 Columns (`generateWebsiteCSV`)

Website Intelligence results are exported using a **dedicated CSV format** with 26 columns, distinct from the frozen Maps 24-column format:

```text
Col  1: Company             Col 10: Country             Col 19: YouTube
Col  2: Website             Col 11: Postal Code          Col 20: GitHub
Col  3: Primary Email       Col 12: Industry             Col 21: Booking URL
Col  4: Additional Emails   Col 13: Description          Col 22: Ordering URL
Col  5: Email Status        Col 14: LinkedIn             Col 23: Menu URL
Col  6: Primary Phone       Col 15: Twitter / X          Col 24: Source URL
Col  7: Additional Phones   Col 16: Facebook             Col 25: Imported At
Col  8: Address             Col 17: Instagram            Col 26: Source Query
Col  9: City / State/Region Col 18: YouTube
```

- Social columns (LinkedIn, Twitter / X, Facebook, Instagram, YouTube, GitHub) contain the **actual discovered URLs** — never fabricated.
- Empty social cells are left blank; no placeholder text.
- Additional Emails and Additional Phones contain secondary discovered contacts separated by `"; "`.

### 5.2 XLSX — 2-Sheet Workbook (`buildWebsiteXlsx`)

Website Intelligence `.xlsx` exports produce a **2-sheet workbook**:

**Sheet 1 — "Leads"** (26 columns, same as CSV above):
- LinkedIn, Twitter/X, Facebook, Instagram, YouTube, GitHub rendered as clickable hyperlinks.
- Additional Emails / Additional Phones in dedicated columns.

**Sheet 2 — "People"** (7 columns):
```text
Col 1: Company   Col 2: Name   Col 3: Title   Col 4: Email
Col 5: Phone     Col 6: LinkedIn               Col 7: Profile URL
```
- One row per extracted person (leadership, team members).
- If no people were detected, one placeholder row `(No people detected)` is written.

### 5.3 Implementation

| Function | File | Purpose |
|---|---|---|
| `generateWebsiteCSV(leads)` | `extension/popup.js` | Website 26-column CSV |
| `websiteLeadToCsvRow(l)` | `extension/popup.js` | Row mapper with social |
| `buildWebsiteXlsx(leads)` | `extension/shared/xlsx-builder.js` | 2-sheet XLSX builder |
| `buildXlsx(leads)` | `extension/shared/xlsx-builder.js` | Maps 24-col XLSX (unchanged) |
| `generateCSV(leads)` | `extension/popup.js` | Maps 24-col CSV (unchanged) |

### 5.4 Download Pipeline

Both CSV and XLSX use the unified **`SI_DOWNLOAD_FILE` → background service worker → `chrome.downloads.download`** pipeline (Data URI approach) to bypass Manifest V3 process isolation between popup and background contexts. Blob URLs are NOT used (they fail across process boundaries in MV3).

