# RAMOS Website Intelligence Implementation Roadmap

## 1. Overview & Phased Execution Plan

The Website Extraction capability will be implemented in 8 structured, regression-safe phases. Each phase requires rigorous unit testing, consistency verification, packaging validation, and documentation updates.

```mermaid
gantt
    title RAMOS Website Intelligence Roadmap
    dateFormat  X
    axisFormat %s

    section Phase 0 - 0.5
    Phase 0: Read-Only Investigation & Safety Baseline      :done, p0, 0, 1
    Phase 0.5: Architecture & Design Documentation Review   :done, p05, 1, 2

    section Core Extraction
    Phase 1: Single-Page Extraction Engine                  :active, p1, 2, 4
    Phase 2: Smart Link Discovery & Crawl Queue             :p2, 4, 6
    Phase 3: People & Leadership Extraction                 :p3, 6, 8

    section Intelligence & UI
    Phase 4: Evidence & Confidence Scoring Engine           :p4, 8, 10
    Phase 5: RAMOS Popup & Tabbed UI Integration            :p5, 10, 12

    section Enrichment & Hardening
    Phase 6: Google Maps -> Website Lead Enrichment         :p6, 12, 14
    Phase 7: Export Parity, Synthetic Fixtures & Hardening  :p7, 14, 16
```

---

## 2. Phase Breakdown & Deliverables

### Phase 0: Read-Only Investigation & Safety Baseline (COMPLETED)
- Inspect complete repository, frozen components, tests, and manifests.
- Verify frozen baseline integrity for Google Maps discovery flow (`14/14 tests passing`).
- Confirm zero backend / zero npm runtime dependencies.

### Phase 0.5: Design Review & Specification (COMPLETED)
- Deliver architecture, extraction rules, field specifications, security guidelines, and roadmap documentation.
- Establish canonical field mappings and confidence scoring matrices.

### Phase 1: Single-Page Extraction Engine
- **Target**: Extract comprehensive business, contact, and social data from a single URL without crawling.
- **Components Built**:
  - `extension/content/website/page-analyzer.js`
  - `extension/content/website/structured-data.js`
  - `extension/content/website/field-extractors.js`
  - `extension/content/website/normalizers.js`
  - `extension/content/website/validators.js`
  - `extension/content/website/website-adapter.js`
- **Validation**: Node unit tests on synthetic HTML fixtures (JSON-LD, semantic DOM, mailto/tel, OpenGraph).

### Phase 2: Smart Link Discovery & Crawl Queue (COMPLETED)
- **Target**: Targeted business-intelligence crawling prioritizing high-yield pages (`/contact`, `/about`, `/team`, `/locations`).
- **Components Built**:
  - `extension/content/website/crawl-policy.js` (Same-domain boundary, scheme sanitation, file type & login path exclusions)
  - `extension/content/website/page-priority.js` (Path & anchor text scoring matrix: `/contact` +100, `/about` +80, `/team` +85, nav context bonus)
  - `extension/content/website/link-discovery.js` (Same-domain link discoverer with anchor text and container extraction)
  - `extension/content/website/crawl-queue.js` (Bounded priority queue, deduplication, depth <= 2, page limits, early stopping)
  - `extension/content/website/website-adapter.js` (Integrated `crawlWebsite()` pipeline with cross-page evidence aggregation)
- **Validation**: Node unit tests on link discovery and crawl queue dynamics; real Chrome browser targeted crawler smoke test with early termination.

### Phase 3: People & Leadership Extraction (COMPLETED)
- **Target**: Extract structured executive and team member profiles without hallucination or title guessing.
- **Components Built**:
  - `extension/content/website/people-extractor.js` (JSON-LD Person, Microdata Person, DOM team card parser, name/title separation, multi-page deduplication)
  - `extension/content/website/website-adapter.js` (Integrated `people[]` array cleanly isolated from company contact fields)
- **Capabilities**: Structured `people[]` extraction (`name`, `title`, `profile_url`, `linkedin_url`, `email`, `phone`, `evidence`). Zero title guessing when role is unstated. Strictly prevents company-wide generic emails (`sales@`, `info@`) from leaking to individual employees.
- **Validation**: 7 unit tests; live Chrome browser smoke test verifying name/title separation, LinkedIn URLs, direct emails, and strict company email isolation.

### Phase 4: Evidence & Confidence Scoring Engine (COMPLETED)
- **Target**: Multi-source candidate evaluation, scoring, corroboration, and deterministic conflict resolution.
- **Components Built**:
  - `extension/content/website/confidence.js` (Tier 1-7 source quality baseline, page context modifier, cross-page corroboration bonus, deterministic conflict resolver)
  - `extension/content/website/website-adapter.js` (Standardized evidence model, candidate ranking, `_fieldRankings` attachment)
- **Capabilities**: Computes deterministic confidence scores ($0.00 - 1.00$); retains all candidate evidence across pages; prefers contact page and high-tier structured sources; applies corroboration bonuses for values confirmed across independent pages; strictly rejects below-threshold placeholders without guessing.
- **Validation**: 8 unit tests; live Chrome browser smoke test verifying email and phone conflict resolution, corroboration bonuses, and deterministic rankings.

### Phase 5: RAMOS UI & Popup Integration (COMPLETED)
- **Target**: Seamless dual-mode interface in the RAMOS extension popup.
- **Components Modified**:
  - `extension/popup.html` (Top-level mode switcher: `[ Google Maps ] [ Website Intelligence ]`, URL input, scope filters, page limit, live progress, results summary, people table, evidence inspection, export buttons)
  - `extension/popup.js` (Dual-mode controller, abortable crawler orchestration, safe DOM rendering, XLSX/CSV export, error toast handling)
  - `extension/popup.css` (Polished tab navigation conforming to RAMOS Brand Guidelines, scope checkboxes, people list, evidence details)
- **Capabilities**: Full client-side Website Intelligence execution inside the popup; auto-detection of active tab website; real-time crawler metrics; user stop action with partial results retention; direct OOXML XLSX and CSV export; 100% frozen preservation of Google Maps mode.
- **Validation**: 5 unit tests in `tests/website/website-popup-ui.test.ts`; live Chrome browser smoke test verifying mode switching, input validation, extraction, and clean return to Maps.

### Phase 6: Google Maps → Website Enrichment (COMPLETED)
- **Target**: Additive, non-destructive enrichment of Google Maps leads with extracted website data.
- **Components Built & Modified**:
  - `extension/content/website/enricher.js` (Deterministic merger enforcing Maps authority, non-overwriting rules, employee email isolation, and field-level `_provenance` dictionary)
  - `extension/popup.html` (Added Website Enrichment section in discovery summary with lead count, `[ Enrich Websites ]`, live progress bar, and metrics)
  - `extension/popup.js` (Batch enrichment orchestration, `AbortController` cancellation, state isolation on new search, safe DOM rendering)
  - `extension/popup.css` (Added `.enrich-section` and `.btn-enrich` styles)
- **Capabilities**: When a Maps lead has a `website` field, trigger website intelligence to populate missing emails, social links, and personnel data without overwriting verified Maps fields; zero stale data survives across searches; leads without websites are skipped cleanly; 100% frozen preservation of Google Maps extraction and existing exports.
- **Validation**: 21 unit tests in `tests/website/website-enrichment.test.ts`; live Chrome browser smoke test verifying discovery → enrichment → export → new search state isolation.

### Phase 7: Export Parity, Synthetic Fixtures & Hardening (COMPLETED)
- **Target**: Full regression testing, export verification, packaging parity, and final production release audit.
- **Deliverables Completed**:
  - Synthetic export parity test suite (`tests/website/website-export-parity.test.ts`) validating strict 24-column positioning, sparse lead resilience, leading zero preservation, and special character sanitization.
  - End-to-end audit verifying Google Maps discovery, targeted crawling, people extraction, confidence scoring, Website enrichment, state isolation, and OOXML XLSX / RFC-4180 CSV parity.
  - Extension packaging verified: 34 clean runtime files (90.2 KB) with 100% source-to-distribution parity.
  - Final audit document authored: `docs/RAMOS_FINAL_RELEASE_AUDIT.md`.

---

## 3. Mandatory Quality & Regression Gates

At the conclusion of each phase:
```bash
npm test
npm run check:consistency
npm run package:extension
node scripts/verify-packaged-extension-parity.js
```
All Google Maps extraction tests must remain 100% passing at all times.
