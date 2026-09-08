# RAMOS — Lead Export & State Contract Specification

**Current Version:** `v1.0.6`  
**Current Status:** **RELEASE CANDIDATE / PILOT READY**  
**Frozen Baseline:** `v1.0.5` (Maps-Only Export Contract)

---

## 1. Executive Summary & Dual-Pipeline Export Architecture

RAMOS enforces strict separation between two independent export pipelines:

1. **Google Maps Standalone Export (Strictly 24 Columns) — FROZEN BASELINE (v1.0.5)**:
   - Preserves 100% backward compatibility for users exporting Maps leads without website enrichment.
   - Generates clean UTF-8 BOM CSV or ECMA-376 OOXML Strict `.xlsx` files with exactly 24 canonical columns.

2. **Enriched Lead Export (Strictly 34 Columns + 2-Sheet XLSX) — RELEASE CANDIDATE (v1.0.6)**:
   - Generates comprehensive datasets containing all Phase 8/9 intelligence: Lead Quality Score (0–100), Quality Tier (`HIGH`, `MEDIUM`, `LOW`), Primary & Additional Emails with roles, Primary & Additional Phones, Primary Decision Maker (Name, Title, Email, LinkedIn), People Count, full address components, verified social profile URLs, and action links.
   - **CSV Format**: 34 columns.
   - **XLSX Format**: 2-sheet OOXML workbook:
     - **Sheet 1 ("Leads")**: 34 flat CRM-ready company columns.
     - **Sheet 2 ("People")**: Relational breakdown of all discovered executives and team members (7 columns).

---

## 2. OOXML Strict Excel Compatibility Engineering

Generated `.xlsx` files are built using 100% browser-native client-side primitives (`Uint8Array`, `TextEncoder`, `DataView`) without Node.js `Buffer` or third-party npm libraries.

To ensure clean opening in Microsoft Excel without corruption warnings:
1. **Custom `<numFmts>` Declaration**: Declared custom text format `<numFmt numFmtId="164" formatCode="@"/>` to preserve leading zeros in phone numbers and postal codes.
2. **Strict Font Element Sequence**: Valid child ordering (`<b>`, `<i>`, `<u val="single"/>`, `<sz>`, `<color>`, `<name>`).
3. **Preserved Multiline Whitespace**: `xml:space="preserve"` on all string nodes (`<t xml:space="preserve">`) for multiline addresses.
4. **Sanitized Control Characters**: ASCII control characters (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`) are stripped in `escapeXml()`.
5. **Valid MS-DOS Timestamps**: Fixed Zip headers with valid DOS date/time (`0x5821`, `0x0000` = Jan 1, 2024).
6. **Freeze Pane & AutoFilter**: Row 1 freeze pane enabled; AutoFilter enabled across all header columns.

---

## 3. Google Maps Standalone Export Specification (Strictly 24 Columns)

### Column Layout

```text
Col  1: Company              Col  9: Country             Col 17: Booking URL
Col  2: Phone                Col 10: Postal Code          Col 18: Ordering URL
Col  3: Website              Col 11: Industry             Col 19: Menu URL
Col  4: Email                Col 12: Business Type        Col 20: Imported At
Col  5: Email Status         Col 13: Rating               Col 21: Source URL
Col  6: Address              Col 14: Reviews              Col 22: Place ID
Col  7: City                 Col 15: Opening Status       Col 23: Source Query
Col  8: State / Region       Col 16: Price Range          Col 24: Run ID
```

- Standard single-sheet XLSX via `XlsxBuilder.buildXlsx(leads)`.
- Standard CSV via `generateCSV(leads)` in `extension/popup.js`.
- Never modified; remains permanently frozen for v1.0.5 baseline compatibility.

---

## 4. Enriched Lead Export Specification (Strictly 34 Columns + 2-Sheet XLSX)

### 4.1 Sheet 1 — "Leads" (34 Columns in CSV & XLSX)

| Col # | Header Name | Type | Description |
| :--- | :--- | :--- | :--- |
| 1 | **Company** | Text | Commercial or legal business name |
| 2 | **Lead Score** | Number | Transparent lead score (0–100) |
| 3 | **Quality Tier** | Text | Sales qualification tier (`HIGH`, `MEDIUM`, `LOW`) |
| 4 | **Website** | Hyperlink | Normalized canonical website URL |
| 5 | **Primary Email** | Text | Primary commercial contact email |
| 6 | **Email Role** | Text | Commercial role (`sales`, `general`, `support`, etc.) |
| 7 | **Additional Emails** | Text | Secondary corporate emails joined by `"; "` |
| 8 | **Email Status** | Text | Verification status (`business_role`, `business_individual`) |
| 9 | **Primary Phone** | Raw Text | Formatted business phone (leading zeros preserved) |
| 10 | **Additional Phones** | Text | Secondary corporate phones joined by `"; "` |
| 11 | **Decision Maker Name** | Text | Full name of top-ranking executive |
| 12 | **Decision Maker Title**| Text | Executive job title |
| 13 | **Decision Maker Email**| Text | Direct decision maker email |
| 14 | **Decision Maker LinkedIn**| Hyperlink | Direct LinkedIn profile URL of decision maker |
| 15 | **People Count** | Number | Total count of extracted personnel |
| 16 | **Address** | Text | Full physical street address |
| 17 | **City** | Text | City / locality name |
| 18 | **State / Region** | Text | State, province, or region |
| 19 | **Country** | Text | Country name |
| 20 | **Postal Code** | Raw Text | Postal / ZIP code (leading zeros preserved) |
| 21 | **Industry** | Text | Primary business category |
| 22 | **Description** | Text | Business overview / offerings summary |
| 23 | **LinkedIn** | Hyperlink | Official LinkedIn company page |
| 24 | **Twitter / X** | Hyperlink | Official Twitter / X profile |
| 25 | **Facebook** | Hyperlink | Official Facebook company page |
| 26 | **Instagram** | Hyperlink | Official Instagram company profile |
| 27 | **YouTube** | Hyperlink | Official YouTube channel |
| 28 | **GitHub** | Hyperlink | Official GitHub organization |
| 29 | **Booking URL** | Hyperlink | Appointment or reservation URL |
| 30 | **Ordering URL** | Hyperlink | Online ordering or store URL |
| 31 | **Menu URL** | Hyperlink | Digital menu or product catalog URL |
| 32 | **Source URL** | Hyperlink | Originating Google Maps or website URL |
| 33 | **Imported At** | Text | ISO 8601 discovery timestamp |
| 34 | **Source Query** | Text | Search term or target domain |

### 4.2 Sheet 2 — "People" (7 Columns in XLSX)

Available in the 2-sheet OOXML workbook generated via `XlsxBuilder.buildWebsiteXlsx(leads)`:

| Col # | Header Name | Type | Description |
| :--- | :--- | :--- | :--- |
| 1 | **Company** | Text | Associated company name or domain |
| 2 | **Name** | Text | Full name of extracted person |
| 3 | **Title** | Text | Job title / designation |
| 4 | **Email** | Text | Direct corporate email |
| 5 | **Phone** | Raw Text | Direct phone number |
| 6 | **LinkedIn** | Hyperlink | Direct LinkedIn profile URL (`linkedin.com/in/...`) |
| 7 | **Profile URL** | Hyperlink | Internal team bio / profile URL |

---

## 5. Export Function Implementation Map

| Export Type | Output Format | Generator Function | Location | Column Count |
| :--- | :--- | :--- | :--- | :--- |
| **Maps Standalone** | CSV | `generateCSV(leads)` | `extension/popup.js` | 24 columns |
| **Maps Standalone** | XLSX | `buildXlsx(leads)` | `extension/shared/xlsx-builder.js` | 24 columns (1 sheet) |
| **Enriched Leads** | CSV | `generateWebsiteCSV(leads)` | `extension/popup.js` | 34 columns |
| **Enriched Leads** | XLSX | `buildWebsiteXlsx(leads)` | `extension/shared/xlsx-builder.js` | 34 cols (Sheet 1) + 7 cols (Sheet 2) |

### 5.1 Download Pipeline
Both CSV and XLSX export flows route through the unified messaging bridge:
`popup.js → chrome.runtime.sendMessage({ type: "SI_DOWNLOAD_FILE", url: dataUrl, filename }) → background.js → chrome.downloads.download()`.
This architecture guarantees reliable downloads and circumvents Manifest V3 blob URL cross-process restrictions.
