# RAMOS v1.0.5 Architecture Audit & Website Scraper Reusability Analysis
**Phase 0.1 Architecture Audit — New Development Branch Baseline**
**Date:** September 3, 2026  
**Status:** AUDITED & VERIFIED  
**Scope:** Read-Only Codebase Audit & Component Reusability for Standalone Website Scraper  

---

## 1. Executive Summary & Objective

This document establishes the **Phase 0.1 Architecture Audit** for the RAMOS codebase on the new development branch. The purpose of this audit is to:
1. **Trace existing subsystems** across Google Maps Extraction, Website Intelligence / Crawler, Lead Data Model & State Management, Export Pipeline, Manifest V3 Permissions, and Automated Testing.
2. **Identify reusable architectural components** for a proposed new **Website Scraper** capability.
3. **Define integration points and extension boundaries** ensuring zero regressions to the stable, frozen Google Maps baseline (**v1.0.5**) and maintaining client-side zero-runtime-dependency principles.
4. **Preserve strict implementation freeze** during Phase 0.1 (no new providers, no Scrapling, no modifying code changes).

```mermaid
graph TD
    subgraph RAMOS_Architecture [RAMOS v1.0.5 Architectural Ecosystem]
        subgraph ModeA [Google Maps Engine (FROZEN)]
            M1[discovery.js] --> M2[content/maps/selectors.js]
            M1 --> M3[content/maps/result-card-extractor.js]
            M1 --> M4[content/maps/detail-extractor.js]
            M1 --> M5[content/maps/address-parser.js]
            M1 --> SW[background.js Single-Flight Engine]
        end

        subgraph ModeB [Website Intelligence Subsystem]
            W1[page-acquisition.js] --> W2[page-analyzer.js]
            W1 --> W3[structured-data.js]
            W1 --> W4[field-extractors.js]
            W1 --> W5[people-extractor.js]
            W6[crawl-policy.js] --> W7[link-discovery.js]
            W7 --> W8[page-priority.js]
            W8 --> W9[crawl-queue.js]
            W3 & W4 & W5 --> W10[normalizers.js & validators.js]
            W10 --> W11[confidence.js Multi-Tier Scorer]
            W11 --> W12[website-adapter.js Master Orchestrator]
            W12 --> W13[enricher.js Maps + Web Merger]
        end

        subgraph SharedServices [Shared Core Services]
            S1[shared/schema.js Canonical Lead Model]
            S2[shared/xlsx-builder.js OOXML Strict Exporter]
            S3[shared/constants.js]
            UI[popup.html / popup.js Dual-Mode Controller]
        end

        SW --> UI
        W12 --> UI
        W13 --> UI
        UI --> S1
        UI --> S2
    end
```

---

## 2. Detailed Subsystem Traces

### 2.1 Google Maps Extraction Subsystem (`STABLE & FROZEN`)

The Google Maps extraction pipeline operates under a strict single-flight state machine designed for high-precision, zero-hallucination lead generation directly from `google.com/maps`.

* **Content Script Orchestration (`extension/discovery.js` & `extension/content/maps/maps-adapter.js`)**:
  - **Feed & Card Discovery**: Detects Google Maps search results within `div[role="feed"]` using verified selectors (`div.Nv2PK`, `div[role="article"]`, `a.hfpxzc`).
  - **Result Card Qualification (`result-card-extractor.js`)**: Inspects each card to filter out advertisements, generic navigational buttons, and organic non-business markers. Extracts preliminary card data (`company_name`, `place_id`, `rating`, `review_count`, `category`, `address`, `phone`). Deduplicates candidates by `place_id`.
  - **Bounded Scrolling**: Iteratively scrolls the results container with throttling (800ms) up to the user-specified limit (default: 10, max: 50).
* **Background Service Worker (`extension/background.js`)**:
  - **Single Authority Run State**: Manages `currentRun` containing `runId`, `searchQuery`, `status` (`idle`, `running`, `completed`, `failed`), and candidate states (`PENDING`, `DISPATCHED`, `READY`, `FAILED`, `DUPLICATE_SKIPPED`).
  - **Single-Flight Lock**: Only one candidate is dispatched for detail panel extraction at any time (`ENRICH_CURRENT_CANDIDATE`), guarded by a 15-second timeout boundary.
* **Detail Panel Enrichment (`extension/content/maps/detail-extractor.js`)**:
  - **Interaction & Wait**: Content script clicks the target card, scrolls it into view, and waits for `div[role="main"]` to render.
  - **Identity Verification**: Compares `expectedName` against `panelName` to prevent race conditions or misclicks on adjacent map elements.
  - **Field Extraction**: Authoritative extraction of verified phone number, website link, full address (parsed via `address-parser.js` into street, city, region, postal code, country), opening hours, price range, and action links (`booking_url`, `ordering_url`, `menu_url`).
  - **Progress & Completion**: Dispatches `SI_DETAIL_READY` back to background, updating `currentRun` and broadcasting `SI_DISCOVERY_PROGRESS` to the popup UI.

---

### 2.2 Website Intelligence & Crawler Subsystem

The Website Intelligence subsystem is an in-browser, privacy-first business extraction and crawling engine residing in `extension/content/website/`.

* **Page Acquisition (`page-acquisition.js`)**:
  - Ingests HTML from `fetch()` or active browser DOM.
  - Implements `AbortSignal.timeout(10000)` and combines user abort signals.
  - Employs `credentials: "omit"` ensuring completely stateless, cookie-less network transactions.
  - Parses HTML safely into a sandboxed DOM using native `DOMParser` without executing scripts.
* **Page Analysis & Semantic Classification (`page-analyzer.js`)**:
  - Extracts title, meta description, canonical URL, and OpenGraph/Twitter card metadata (`og:title`, `og:site_name`, `og:description`).
  - Classifies page intent into canonical types: `HOMEPAGE`, `CONTACT`, `ABOUT`, `TEAM`, `SERVICES`, `LOCATION`, `GENERIC`.
* **Structured Data Extraction (`structured-data.js`)**:
  - Parses `<script type="application/ld+json">` graphs and Schema.org Microdata.
  - Deeply traverses `Organization`, `LocalBusiness`, `PostalAddress`, `ContactPoint`, and `Person` nodes.
  - Assigns Tier 1 confidence ($0.95 - 0.98$) to explicit schema properties.
* **Field Extractors (`field-extractors.js`)**:
  - **Email**: Protocol extraction (`mailto:`) and body text regex with RFC 5322 normalization.
  - **Phone**: Protocol extraction (`tel:`) and international/local pattern heuristics.
  - **Socials**: Link scanner supporting LinkedIn, Twitter/X, Facebook, Instagram, YouTube, TikTok, GitHub, with automatic exclusion of share widgets.
  - **Action Links**: Targeted detection of reservation, ordering, and menu URLs.
* **Smart Crawler Queue & Link Discovery (`crawl-policy.js`, `page-priority.js`, `link-discovery.js`, `crawl-queue.js`)**:
  - **Policy Enforcement**: Same-domain boundary (strictly rejects external third-party domains), scheme validation (`http:`, `https:`), and binary asset filtering (`.pdf`, `.png`, `.zip`, etc.).
  - **Priority Scoring**: Path and anchor text evaluation prioritizing high-yield pages (`/contact` +100, `/about` +80, `/team` +85).
  - **Bounded Queue**: Breadth-first traversal capped at depth $\le 2$, max pages $10-20$, and deduplicated by canonical URL.
  - **Early Exit**: Terminates the crawl early if essential contact and business identity fields are fulfilled with high confidence.
* **People & Leadership Extraction (`people-extractor.js`)**:
  - Extracts structured team profiles from `/team`, `/about`, `/leadership` pages.
  - Parses Schema.org Person entities and DOM card patterns (`.team-card`, `.bio-card`).
  - Enforces strict name/title separation without role guessing.
  - **Email Isolation Guardrail**: Strictly prohibits company-wide generic emails (`info@`, `sales@`, `support@`) from leaking to individual employee records.
* **Confidence Scoring & Conflict Resolution (`confidence.js`)**:
  - Computes numerical confidence scores ($0.00 - 1.00$) based on 7 source tiers:
    - Tier 1: JSON-LD Structured Data ($0.95 - 0.98$)
    - Tier 2: Direct Protocol Anchors (`mailto:`, `tel:`) ($0.90 - 0.92$)
    - Tier 3: Schema.org Microdata ($0.88$)
    - Tier 4: Semantic Containers (`<address>`, `<footer>`, `<header>`) ($0.80$)
    - Tier 5: Team / Bio Cards ($0.75$)
    - Tier 6: High-Confidence Regex with Label ($0.60 - 0.65$)
    - Tier 7: Body Text Regex Fallback ($0.50$)
  - Applies page context modifiers (+0.06 for contacts on `/contact`) and corroboration bonuses (+0.05 per independent page observation).
  - Resolves conflicting candidates deterministically and preserves all competing candidates in `_evidence` and `_fieldRankings`.
* **Lead Enrichment (`enricher.js`)**:
  - Merges Google Maps leads with Website Intelligence leads.
  - Enforces Google Maps authority over physical attributes (`company_name`, `phone`, `address`).
  - Additively enriches missing fields (`email`, `social`, `people`, `booking_url`).
  - Populates a field-level `_provenance` dictionary (`GOOGLE_MAPS` vs `WEBSITE`).

---

### 2.3 Lead Data Model & State Architecture

* **Canonical Lead Schema (`extension/shared/schema.js`)**:
  - Centralized model definition via `createCanonicalLead()`.
  - Guarantees exact 24 export fields across both CSV and XLSX pipelines:
    1. `Company` (`company_name`)
    2. `Phone` (`phone`)
    3. `Website` (`website`)
    4. `Email` (`email`)
    5. `Email Status` (`email_status`)
    6. `Address` (`address` / `full_address`)
    7. `City` (`city`)
    8. `State / Region` (`region`)
    9. `Country` (`country`)
    10. `Postal Code` (`postal_code`)
    11. `Industry` (`category`)
    12. `Business Type` (`business_type`)
    13. `Rating` (`rating`)
    14. `Reviews` (`review_count`)
    15. `Opening Status` (`opening_status`)
    16. `Price Range` (`price_range`)
    17. `Booking URL` (`booking_url`)
    18. `Ordering URL` (`ordering_url`)
    19. `Menu URL` (`menu_url`)
    20. `Imported At` (`imported_at`)
    21. `Source URL` (`source_url`)
    22. `Place ID` (`place_id`)
    23. `Source Query` (`source_query`)
    24. `Run ID` (`run_id`)
* **Extended In-Memory Entity Fields**:
  - `social`: Key-value map of normalized social profile links.
  - `people`: Array of structured employee objects (`name`, `title`, `linkedin_url`, `email`, `phone`, `profile_url`).
  - `_provenance`: Field-by-field audit dictionary tracking data source and confidence.
  - `_evidence`: Complete historical candidate log from all visited pages.
  - `_fieldRankings`: Ranked candidate breakdown.
* **State Isolation & Lifecycle**:
  - Service worker manages Maps session lifecycle (`currentRun`).
  - Popup controller manages UI modes (`maps` vs `website`), enrichment state, and abort controllers (`AbortController`).
  - Launching a new Google Maps search immediately clears prior enrichment state and isolates results.

---

### 2.4 Export Pipeline Architecture

* **Pure Browser-Native OOXML XLSX Builder (`extension/shared/xlsx-builder.js`)**:
  - **Zero NPM Dependencies**: 100% pure JavaScript implementation using `Uint8Array`, `TextEncoder`, and `DataView`.
  - **ECMA-376 OOXML Strict Compliance**: Generates complete OpenXML package (`[Content_Types].xml`, `xl/workbook.xml`, `xl/worksheets/sheet1.xml`, `xl/styles.xml`, `_rels/.rels`).
  - **Text Preservation (`numFmtId="164"`)**: Formats phone numbers and postal codes with leading zeros (e.g. `079-123456`, `02138`) as explicit text strings (`t="inlineStr"` / format code `@`), preventing numeric truncation or scientific notation corruption.
  - **Styling**: RAMOS Deep Violet header fill (`#7C3AED`), white bold text, alternating row shading (`#F8FAFC`), top row frozen pane (`<pane ySplit="1" state="frozen"/>`), and auto-filters enabled (`A1:X{N}`).
* **RFC-4180 CSV Generator (`extension/background.js` & `extension/popup.js`)**:
  - Prefixed with UTF-8 Byte Order Mark (`\uFEFF`) ensuring automatic UTF-8 character encoding recognition in Excel.
  - Full RFC-4180 compliance with double-quoted cells escaping commas, line breaks, and internal double quotes.
* **Download Triggers**:
  - In background context: `chrome.downloads.download({ url, filename })`.
  - In popup context: Blob URL anchor simulation with fallback to `chrome.downloads`.

---

### 2.5 Manifest V3 Permissions & Security Model

* **Declared Permissions (`manifest.json`)**:
  - `permissions`:
    - `storage`: Preserves user configurations and run preferences locally.
    - `tabs`: Inspects active tab URL to auto-detect Maps queries or website targets.
    - `scripting`: Executes content script injections into Google Maps tabs.
    - `downloads`: Saves XLSX and CSV files directly to the user's filesystem.
  - `host_permissions`:
    - `https://www.google.com/maps*`, `https://*.google.com/maps*`, `https://maps.google.com/*`: Enables Google Maps content script execution.
    - `http://*/*`, `https://*/*`: Enables client-side `fetch()` requests from popup context to target company websites without cross-origin proxy bottlenecks.
* **Security & Boundary Guardrails**:
  - **Zero External Backend / Zero Proxies**: Operates completely local/client-side. No user data, query history, or lead records are transmitted to remote servers.
  - **Anonymous Network Calls**: Every external fetch specifies `credentials: "omit"`, preventing the transmission of stored user cookies, auth headers, or session states.
  - **In-Memory DOM Sandboxing**: Scraped HTML is parsed in an isolated `DOMParser` instance; scripts on target websites are never executed.
  - **Safe UI Binding**: All rendered data is injected via `textContent` and DOM nodes, strictly preventing XSS injection.
  - **Scheme Sanitization**: Explicit rejection of `javascript:`, `data:`, `file:`, `chrome:`, `blob:`.

---

### 2.6 Existing Test Suite Analysis

The existing test suite comprises **78 unit and pipeline tests**, executing in ~660ms with zero runtime failures:

| Test Suite File | Coverage Scope | Reusable Invariants |
| :--- | :--- | :--- |
| `tests/maps/gmaps-card-pipeline.test.ts` | Result card qualification, place ID parsing, feed selection | Card deduplication & schema creation |
| `tests/maps/gmaps-vadapav-e2e-diagnostic.test.ts` | End-to-end simulated run on 5 candidate businesses | Single-flight state machine verification |
| `tests/website/website-single-page.test.ts` | Single-page extraction, JSON-LD, microdata, mailto/tel | Page analyzer, structured data parsing |
| `tests/website/website-crawler.test.ts` | Crawl policy, page priority scoring, queue mechanics | Bounded BFS queue, early termination |
| `tests/website/website-people.test.ts` | Person schema, team cards, name/title separation | Leadership extraction & email isolation |
| `tests/website/website-confidence.test.ts` | Multi-tier scoring, corroboration, conflict resolution | Best candidate selection formula |
| `tests/website/website-popup-ui.test.ts` | Popup validation, abort handling, export generation | UI state & lifecycle safety |
| `tests/website/website-enrichment.test.ts` | Additive Maps + Web merge, provenance tracking | Field-level authority & provenance mapping |
| `tests/website/website-export-parity.test.ts` | Strict 24-column CSV/XLSX parity, leading zeros | OOXML Strict & CSV export compliance |

---

## 3. Reusability Matrix for New Website Scraper Feature

The following table categorizes existing components and evaluates their direct reusability for a standalone Website Scraper:

| Existing Component | File Path | Reusability Tier | Role in New Website Scraper |
| :--- | :--- | :---: | :--- |
| **Page Acquisition** | `extension/content/website/page-acquisition.js` | **100% Direct** | Unified HTML retrieval & sandboxed `DOMParser` instantiation. |
| **Crawl Policy** | `extension/content/website/crawl-policy.js` | **100% Direct** | Same-domain boundary enforcement, scheme checks, binary file filtering. |
| **Page Priority Scorer** | `extension/content/website/page-priority.js` | **100% Direct** | High-yield path heuristics (`/contact`, `/about`, `/team`). |
| **Link Discovery** | `extension/content/website/link-discovery.js` | **100% Direct** | Same-domain link harvesting, relative link resolution, anchor context. |
| **Priority Crawl Queue** | `extension/content/website/crawl-queue.js` | **100% Direct** | Bounded BFS priority queue, depth control, early exit conditions. |
| **Structured Data Parser** | `extension/content/website/structured-data.js` | **100% Direct** | Schema.org JSON-LD and Microdata extraction for Organization, LocalBusiness, Person. |
| **Field Extractors** | `extension/content/website/field-extractors.js` | **100% Direct** | Email (`mailto:` / regex), Phone (`tel:` / regex), Socials, Action links, Semantic address. |
| **People Extractor** | `extension/content/website/people-extractor.js` | **100% Direct** | Executive & team profile extraction with email isolation. |
| **Normalizers & Validators** | `extension/content/website/normalizers.js`<br>`extension/content/website/validators.js` | **100% Direct** | Text cleaning, E.164 phone formatting, RFC 5322 email validation, domain parsing. |
| **Confidence Scoring** | `extension/content/website/confidence.js` | **100% Direct** | 7-tier source weighting, corroboration bonuses, deterministic conflict resolution. |
| **Website Adapter** | `extension/content/website/website-adapter.js` | **90% Direct** | Master orchestration facade for single-page and multi-page site crawling. |
| **Canonical Schema** | `extension/shared/schema.js` | **100% Direct** | Canonical 24-field lead data model. |
| **Native XLSX Builder** | `extension/shared/xlsx-builder.js` | **100% Direct** | Zero-dependency OOXML Strict Excel generation with formatted headers and text cells. |
| **Lead Enricher** | `extension/content/website/enricher.js` | **Selective** | Used when merging scraped website data into existing lead databases or Maps leads. |
| **Maps Subsystem** | `extension/content/maps/*`<br>`extension/discovery.js` | **0% (Isolated)** | **Frozen baseline.** Unaffected and isolated from website-only scraping. |

---

## 4. Proposed Integration Points & Architectural Blueprint

To support a dedicated, high-performance **Website Scraper** without altering existing Google Maps extraction behavior or introducing external dependencies prematurely:

```
Proposed Website Scraper Pipeline Architecture
┌────────────────────────────────────────────────────────────────────────┐
│ Input Source: Single Domain | URL List | Active Tab | Bulk Import      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [NEW / EXTENDED] Scraper Controller / Batch Ingestion Engine           │
│ - Validates URLs via Normalizers & Validators                          │
│ - Manages concurrency (default 1-2 concurrent domains to avoid rate    │
│   limiting) & AbortSignal orchestration                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Modular Acquisition Adapter (Pluggable Interface)                      │
│ - Mode 1: In-Browser Fetch + DOMParser (Current Default: 0-dep)        │
│ - Mode 2: Active Tab In-DOM Extraction (for SPA / dynamic hydration)   │
│ - Mode 3 (Future): Headless Engine Bridge (Scrapling / Remote Browser) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Core Reusable Extraction Pipeline (Shared & Frozen Core)               │
│ - Page Analyzer ───> Structured Data ───> Field Extractors             │
│ - People Extractor ───> Crawl Queue / Link Discovery                   │
│ - Normalizers & Validators ───> Confidence & Corroboration Engine      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Standard Output Formatter                                              │
│ - Canonical 24-Column Lead Model (extension/shared/schema.js)          │
│ - Extended JSON Export (with nested people[], social{}, _provenance{}) │
│ - OOXML Strict XLSX (shared/xlsx-builder.js) & RFC-4180 CSV            │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Integration Point 1: Pluggable Page Acquisition Interface
- **Current State**: `page-acquisition.js` supports `acquireFromRawHtml` and `acquireFromDocument`.
- **Integration Boundary**: Formalize an `AcquisitionProvider` interface:
  ```javascript
  // Contract:
  // fetchPage(url, options) -> Promise<{ document: Document, url: string, status: number }>
  ```
- **Benefit**: Allows the new scraper feature to utilize standard browser `fetch()` today, while remaining 100% forward-compatible with future headless rendering (e.g. Scrapling or remote Puppeteer) without touching any extractor, validator, or scoring logic.

### 4.2 Integration Point 2: Batch Domain Crawling & Concurrency Orchestration
- **Current State**: Single URL crawl initiated from popup with `crawlLimit` (1 to 20 pages).
- **Integration Boundary**: Create a lightweight batch runner that can iterate over multiple target domains sequentially or with bounded concurrency (e.g., 2 parallel domains), respecting per-domain rate limits.

### 4.3 Integration Point 3: Output Dual-Format Exporter
- **Current State**: Generates 24-column tabular CSV and XLSX exports.
- **Integration Boundary**: Retain the 24-column format for strict spreadsheet parity, while offering a complete nested JSON export format that retains full `people[]`, `social{}`, and `_provenance{}` structures for CRM integration.

---

## 5. Non-Regression Invariants & Phase 0.1 Verification

1. **Frozen Baseline Unchanged**:
   - `extension/content/maps/*` remains strictly untouched.
   - `extension/discovery.js` remains strictly untouched.
   - Google Maps discovery messaging contracts (`SI_START_DISCOVERY`, `ENRICH_CURRENT_CANDIDATE`, `SI_DETAIL_READY`) remain intact.
2. **Zero Runtime Dependencies**:
   - Zero npm runtime dependencies added.
   - Zero backend API or cloud server requirements.
3. **Automated Verification**:
   - All 78 tests passing (`npm test`).
   - Automated project consistency checks passing (`npm run check:consistency`).
4. **Implementation Freeze**:
   - Zero code modifications to runtime implementation in Phase 0.1.
   - Scrapling and external scraping providers deferred to planned future phases with explicit architectural approvals.
