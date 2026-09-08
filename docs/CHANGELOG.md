# RAMOS — Changelog

All notable changes to the **RAMOS** extension are documented in this file.
This changelog is reconstructed strictly from repository evidence and git commit history.

---

## [1.0.6] — 2026-09-04 (Pilot Ready / Release Candidate)

### Added
- **Website Intelligence Subsystem (Phases 0–9)**:
  - **Single-Page Extraction (Phase 1)**: Extraction of business identity, contact channels, semantic addresses, OpenGraph metadata, and Schema.org JSON-LD / microdata.
  - **Targeted Intelligence Crawler (Phase 2)**: Dynamic priority queue (`crawl-queue.js`) scoring `/contact`, `/about`, `/team`, `/locations` with field-aware dynamic re-ranking and early termination.
  - **People & Leadership Extraction (Phase 3)**: Structured extraction of personnel and executives from DOM team cards and Person schemas; strict job title validation; clean isolation preventing employee emails from leaking into company contacts.
  - **Evidence & Confidence Scoring (Phase 4)**: 7-tier source reliability weighting, page context modifiers, cross-page corroboration calculation, and deterministic conflict resolution.
  - **Dual-Mode Extension UI (Phase 5)**: Seamless `[ Google Maps ] [ Website Intelligence ]` tabs in extension popup with real-time metrics, people view, error toasts, and instant cancellation via `AbortController`.
  - **Google Maps → Website Enrichment (Phase 6)**: Batch lead enrichment with strict Maps authority preservation for physical attributes and field-level `_provenance` dictionary.
  - **Export Parity & Social Support (Phase 7)**: Preserved frozen 24-column Maps export; added verified social columns (LinkedIn, Twitter/X, Facebook, Instagram, YouTube, GitHub) and 2-sheet OOXML XLSX workbook.
  - **Lead Scoring & Qualification (Phase 8A)**: Deterministic 0–100 lead quality scoring across identity, contactability, executive discovery, and digital footprint, assigning `quality_tier` (`HIGH`, `MEDIUM`, `LOW`).
  - **Multi-Contact Preservation (Phase 8B)**: Support for multiple corporate emails (`lead.emails[]`) with commercial roles (`sales`, `general`, `support`) and multiple phones (`lead.phones[]`).
  - **Executive Decision Maker Selection (Phase 8A)**: Seniority ranking tiers (`c_level`, `vp`, `director`, `founder`, `manager`, `staff`) with top decision maker selection (`decision_maker_*`).
  - **Conservative Deduplication Engine (Phase 8D)**: High-precision deduplication (`deduplicator.js`) matching by `place_id`, domain+phone, or domain+name similarity ($\ge 0.75$) with non-destructive contact union.
  - **34-Column Enriched Export (Phase 8E)**: Upgraded enriched export layout to 34 columns (CSV & Sheet 1 of XLSX) and 7 columns (Sheet 2 "People" of XLSX).
- **Production Hardening & RC Qualification (Phase 9)**:
  - Enforced bounded timeouts: 15s Maps candidate timeout, 6s batch enrichment fetch timeout, 10s interactive crawl timeout.
  - Comprehensive automated test suite with **162 passing tests** and 0 failures.
  - 100% packaged distribution file parity across 36 runtime files in `dist/ramos-maps-connector-v1.0.6.zip`.

---

## [1.0.5] — 2026-08-30 (Frozen Maps Baseline)

### Fixed
- **Critical OpenXML Validation Compliance**:
  - Refactored `extension/shared/xlsx-builder.js` to satisfy ECMA-376 OOXML Strict schema definitions.
  - Declared custom text format `<numFmt numFmtId="164" formatCode="@"/>` in `<numFmts>` to preserve leading zeros in phone numbers and postal codes.
  - Fixed font child ordering (`<b>`, `<i>`, `<u val="single"/>`, `<sz>`, `<color>`, `<name>`).
  - Added `xml:space="preserve"` to string nodes (`<t xml:space="preserve">`) to prevent corruption on multiline address strings.
  - Sanitized ASCII control characters (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`) in `escapeXml()`.
  - Set valid MS-DOS Zip timestamps (`Jan 1, 2024`) to eliminate Windows Zip decoder errors.
- **Permanent Engine Freeze**: Established `v1.0.5` as the authoritative, frozen baseline for Google Maps extraction.

---

## [1.0.4] — 2026-08-28

### Added
- **XLSX Readability Polish**: Deliberate column widths, wrapped headers, alternating white and light-neutral row styling (`#F8FAFC`), and freeze panes on row 1.

---

## [1.0.3] — 2026-08-26

### Fixed
- **Browser-Native XLSX Regression Fix**: Replaced Node.js `Buffer` reliance with 100% browser-native `Uint8Array`, `TextEncoder`, and `DataView` primitives, enabling standalone in-browser generation without npm packages.

---

## [1.0.2] — 2026-08-25

### Added
- **Export Reliability Hardening**: OpenXML XLSX Excel exporter, toast feedback system, and popup state reconstruction across popup close/reopen events.

---

## [1.0.1] — 2026-08-24

### Added
- **RAMOS Visual Branding**: Dedicated brand design system, Deep Violet styling (`#7C3AED`), high-resolution icon assets (16px, 32px, 48px, 128px), and responsive popup layout.

---

## [1.0.0] — 2026-08-22

### Added
- **Initial Clean Standalone Cut**: Established standalone Manifest V3 Chrome Extension decoupled from external servers, backend databases, and third-party APIs.
- **Google Maps Discovery Flow**: Sequential candidate queue with single-flight dispatch, identity verification, DOM extraction, and 24-column CSV export.
