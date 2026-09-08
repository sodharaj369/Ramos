# RAMOS Website Intelligence Implementation Roadmap

**Current Baseline Version:** `v1.0.6`  
**Current Status:** **PILOT READY / RELEASE CANDIDATE (PHASES 0–9 COMPLETE)**  
**Next Active Phase:** Phase 10 (Multi-Website & Corporate Relationship Intelligence — PLANNED)

---

## 1. Overview & Phased Execution Plan

The RAMOS Website Intelligence capability has been delivered across 10 structured, regression-safe phases. Phases 0 through 9 are **100% COMPLETE** and formally verified. Phase 10 is currently **PLANNED**.

```mermaid
gantt
    title RAMOS Website Intelligence Execution Roadmap
    dateFormat  X
    axisFormat %s

    section Foundation & Single-Page
    Phase 0 / 0.5: Investigation, Safety & Design Specification :done, p0, 0, 2
    Phase 1: Single-Page Extraction Engine                     :done, p1, 2, 4

    section Crawler & Intelligence
    Phase 2: Smart Link Discovery & Crawl Queue                :done, p2, 4, 6
    Phase 3: People & Leadership Extraction                    :done, p3, 6, 8
    Phase 4: Evidence & Confidence Scoring Engine              :done, p4, 8, 10

    section UI & Enrichment
    Phase 5: RAMOS Dual-Mode Popup UI Integration              :done, p5, 10, 12
    Phase 6: Google Maps -> Website Lead Enrichment            :done, p6, 12, 14
    Phase 7: Export Parity, Social Fields & 2-Sheet XLSX       :done, p7, 14, 16

    section Hardening & Qualification
    Phase 8: Lead Scoring, Deduplication & Multi-Contact       :done, p8, 16, 18
    Phase 9: Production Hardening & Release Candidate (v1.0.6) :done, p9, 18, 20

    section Planned Future Phases
    Phase 10: Multi-Website & Corporate Relationship Intelligence:active, p10, 20, 22
    Phase 11: Website Health & Sales Readiness Signals         :p11, 22, 24
    Phase 12: Commercial Opportunity Signals                   :p12, 24, 26
    Phase 13: Lead Prioritization & Scoring Engine v2          :p13, 26, 28
```

---

## 2. Phase Breakdown & Verification Status

### Phase 0 / 0.5: Investigation, Safety & Design Review — **COMPLETE**
- Inspected complete repository, verified frozen baseline for Google Maps discovery flow (`14/14 tests passing`).
- Established architectural guardrails: 0 backend dependencies, 0 runtime npm packages.
- Delivered initial architecture, extraction rules, field specifications, security guidelines, and roadmap documentation.

### Phase 1: Single-Page Extraction Engine — **COMPLETE**
- Extracted business identity, contacts, semantic addresses, and social links from a single page without crawling.
- Modules built: `page-acquisition.js`, `page-analyzer.js`, `structured-data.js`, `field-extractors.js`, `normalizers.js`, `validators.js`.

### Phase 2: Smart Link Discovery & Crawl Queue — **COMPLETE**
- Implemented targeted crawling prioritizing `/contact`, `/about`, `/team`, `/locations` with dynamic field awareness.
- Modules built: `crawl-policy.js` (same-domain bounds, scheme checks, binary exclusion), `page-priority.js`, `link-discovery.js`, `crawl-queue.js` (page budget ceilings 1, 5, 10, 20; max depth 2; early exit).

### Phase 3: People & Leadership Extraction — **COMPLETE**
- Extracted structured executive profiles without hallucination or title guessing.
- Modules built: `people-extractor.js` (DOM team cards, Person schema, clean name/title separation, seniority scoring).
- Strict isolation: employee personal emails/phones are forbidden from overwriting company primary contacts.

### Phase 4: Evidence & Confidence Scoring Engine — **COMPLETE**
- Evaluated multi-source candidates across 7 reliability tiers ($0.50 - 0.98$) with cross-page corroboration bonuses.
- Modules built: `confidence.js` (deterministic conflict resolver, corroboration scoring, `_fieldRankings` attachment).

### Phase 5: RAMOS Dual-Mode Popup UI Integration — **COMPLETE**
- Delivered seamless dual-mode UI (`[ Google Maps ] [ Website Intelligence ]`) inside `popup.html`, `popup.js`, `popup.css`.
- Real-time crawler metrics, people roster display, error toasts, and instant cancellation via `AbortController`.

### Phase 6: Google Maps → Website Lead Enrichment — **COMPLETE**
- Delivered non-destructive batch enrichment for discovered Maps leads.
- Modules built: `enricher.js` (strictly preserves Maps authority for physical fields, attaches field-level `_provenance` dictionary).

### Phase 7: Export Parity, Social Fields & 2-Sheet XLSX — **COMPLETE**
- Preserved frozen 24-column Maps export contract.
- Added verified social profile columns (LinkedIn, Twitter/X, Facebook, Instagram, YouTube, GitHub).
- Implemented 2-sheet OOXML XLSX export: Sheet 1 ("Leads") and Sheet 2 ("People").

### Phase 8: Lead Scoring, Multi-Contact & Deduplication — **COMPLETE**
- **Lead Quality Scoring**: `lead-scorer.js` computes 0–100 score and assigns quality tiers (`HIGH`, `MEDIUM`, `LOW`).
- **Multi-Contact Preservation**: `lead.emails[]` (with commercial role tags: sales, general, support) and `lead.phones[]`.
- **Decision Maker Selection**: Highest-ranking executive promoted to top decision maker fields.
- **Conservative Deduplication**: `deduplicator.js` matches duplicate leads via `place_id`, domain+phone, or domain+high name similarity ($\ge 0.75$) without merging distinct branch locations.
- **Enriched Export**: Upgraded enriched export layout to 34 columns.

### Phase 9: Production Hardening & Release Candidate (v1.0.6) — **COMPLETE / RELEASE CANDIDATE**
- Hardened all error paths: 6s batch enrichment timeout, 10s interactive crawler timeout, 15s Maps candidate timeout.
- Full qualification: **162 passing automated tests**, 0 failures, 100% packaged file parity (36 runtime files), clean Excel validation.
- Formally tagged and packaged as **RAMOS v1.0.6 Pilot Ready / Release Candidate**.

---

## 3. Active & Future Roadmap

### Phase 10: Multi-Website & Corporate Relationship Intelligence — **PLANNED / NEXT**
- **Objective**: Given a primary business website, discover and verify up to a few high-confidence official related domains (e.g. careers portals, parent corporate groups, regional domains, official brand subsidiaries).
- **Core Constraints**:
  - Bounded discovery: maximum 2 verified related websites (max 3 total websites per lead).
  - Deterministic verification: never merge domains based on similar names alone; require multi-signal evidence (shared corporate email domain, shared physical address, shared phone, official company LinkedIn).
  - Unverified candidates remain `UNKNOWN` and are never crawled automatically.
  - Zero AI/LLM, zero external scraping proxies, zero new dependencies.
  - Preserve all existing Maps and Website Intelligence contracts.

### Phase 11: Website Health & Sales Readiness Signals — **FUTURE DIRECTION**
- Assess commercial website health indicators (SSL validity, mobile readiness, CMS/platform signals, active contact responsiveness) to gauge sales receptivity.

### Phase 12: Commercial Opportunity Signals — **FUTURE DIRECTION**
- Identify actionable business expansion triggers (hiring surges, new location openings, service launches) from official website evidence.

### Phase 13: Lead Prioritization & Scoring Engine v2 — **FUTURE DIRECTION**
- Advanced composite ranking combining Maps local prominence, digital footprint, contact depth, and commercial signals into actionable sales tiering.
