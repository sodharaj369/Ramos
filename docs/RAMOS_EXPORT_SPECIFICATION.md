# RAMOS — Lead Export & State Contract Specification (v1.0.5)

## Executive Summary
This document specifies the authoritative state contract, CSV export format, OpenXML XLSX Excel export architecture, popup state reconstruction rules, and test verification suite for **RAMOS – Maps Lead Extractor (v1.0.5)**.

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
