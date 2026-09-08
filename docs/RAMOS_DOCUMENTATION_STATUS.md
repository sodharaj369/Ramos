# RAMOS — Documentation Status Matrix

**Current Version:** `v1.0.6`  
**Current State:** Pilot Ready / Release Candidate  
**Audit Date:** September 2026  
**Scope:** Repository-wide markdown documentation inventory and status classification before Phase 10.

---

## 1. Documentation Surface Matrix

The repository contains 33 tracked `.md` documentation files (plus new governance records created during this synchronization). Each file is classified into one of the following states:
- **CURRENT**: Authoritative and accurate for RAMOS v1.0.6.
- **NEEDS UPDATE**: Contains outdated references, obsolete architecture descriptions, or superseded version numbers that require synchronization.
- **HISTORICAL**: Preserved as a historical milestone, release audit, or phase report; intentionally not rewritten to preserve audit trail.
- **DUPLICATE**: Redundant duplicate file.
- **OBSOLETE**: Deprecated or superseded.

| File | Purpose | Documented Version | Documented Phase | Status | Action Taken |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AGENTS.md` | Primary AI coding contract & governance rules | v1.0.6 | Pilot / RC | **CURRENT** (was NEEDS UPDATE) | Rewritten: defines RAMOS v1.0.6 rules, frozen Maps baseline, modular Website Intelligence, zero AI/LLM, deterministic extraction, bounded crawling. |
| `README.md` | Executive project overview & user guide | v1.0.6 | Pilot / RC | **CURRENT** (was NEEDS UPDATE) | Rewritten: describes RAMOS v1.0.6 standalone Chrome Extension, 7 core capabilities, installation, limitations. |
| `PILOT_READINESS.md` | Pilot qualification & rollout guide | v1.0.6 | Phase 9 (RC) | **CURRENT** | Retained: authoritative pilot qualification report (162 tests passing, 36 runtime files). |
| `RAMOS_CURRENT_ARCHITECTURE.md` | Authoritative system architecture | v1.0.6 | Phase 9 (RC) | **CURRENT** (was NEEDS UPDATE) | Updated: full dual-mode architecture, Maps vs Website authority, Lead Scorer, Deduplicator, 34-column enriched export. |
| `RAMOS_FINAL_ARCHITECTURE.md` | Architecture cut document | v1.0.0 | Baseline | **HISTORICAL** | Preserved: documents original transition from legacy web app to standalone Chrome Extension. |
| `RAMOS_CLEANUP_PLAN.md` | Cleanup roadmap & migration log | v1.0.0 | Baseline | **HISTORICAL** | Preserved: historical cleanup task checklist. |
| `RAMOS_FINAL_RELEASE_AUDIT.md` (root) | Root copy of release audit | v1.0.5 | Baseline | **HISTORICAL** | Preserved: historical audit for frozen Maps v1.0.5 release. |
| `RAMOS_REAL_WORLD_LEAD_GENERATION_AUDIT.md` | Real-world extraction quality audit | v1.0.5 | Baseline | **HISTORICAL** | Preserved: 100-lead test run audit. |
| `docs/RAMOS_ARCHITECTURE.md` | Early Maps architecture document | v1.0.0 | Phase 0 | **HISTORICAL** | Preserved: v1.0.0 standalone Maps extension architecture. |
| `docs/RAMOS_BRAND_GUIDELINES.md` | Visual design system & UI tokens | v1.0.1 | Phase 1 | **CURRENT** | Retained: brand styling, deep violet `#7C3AED`, typography, UI tokens. |
| `docs/RAMOS_EXPORT_SPECIFICATION.md` | Export formats & state contract | v1.0.6 | Phase 8E/9 | **CURRENT** (was NEEDS UPDATE) | Updated: specifies 34-column enriched export, 2-sheet XLSX, and frozen 24-column Maps export. |
| `docs/RAMOS_EXTRACTION_RULES.md` | Google Maps DOM selectors & rules | v1.0.0 | Baseline | **HISTORICAL** | Preserved: frozen Google Maps DOM selectors and extraction rules. |
| `docs/RAMOS_FINAL_RELEASE_AUDIT.md` | Release verification audit | v1.0.5 | Baseline | **HISTORICAL** | Preserved: historical release verification audit. |
| `docs/RAMOS_INTERNAL_AUDIT.md` | Internal codebase audit | v1.0.1 | Phase 1 | **HISTORICAL** | Preserved: historical internal codebase audit. |
| `docs/RAMOS_RELEASE_CANDIDATE_CHECKLIST.md` | RC qualification gate checklist | v1.0.6 | Phase 9 (RC) | **CURRENT** | Retained: formal qualification gates for v1.0.6. |
| `docs/RAMOS_RELEASE_CANDIDATE_REPORT.md` | RC audit and verification report | v1.0.6 | Phase 9 (RC) | **CURRENT** | Retained: formal qualification report for v1.0.6. |
| `docs/RAMOS_STABLE_BASELINE.md` | Engineering baseline specification | v1.0.5 / v1.0.6 | Phase 9 (RC) | **CURRENT** (was NEEDS UPDATE) | Updated: preserves v1.0.5 as frozen Maps baseline while documenting v1.0.6 as current integrated pilot/RC release. |
| `docs/RAMOS_WEBSITE_ARCHITECTURE.md` | Website Intelligence architecture | v1.0.6 | Phase 9 (RC) | **CURRENT** (was NEEDS UPDATE) | Updated: corrected module tree (`lead-scorer.js`, `deduplicator.js`, `enricher.js`), end-to-end pipeline. |
| `docs/RAMOS_WEBSITE_EXTRACTION_RULES.md` | Website extraction rules & scoring | v1.0.6 | Phase 8/9 | **CURRENT** (was NEEDS UPDATE) | Updated: includes multi-contact (`emails[]`, `phones[]`), lead scoring, decision maker ranking, deduplication. |
| `docs/RAMOS_WEBSITE_FIELD_SPECIFICATION.md` | Field dictionary & export mapping | v1.0.6 | Phase 8/9 | **CURRENT** (was NEEDS UPDATE) | Updated: added Phase 8 fields, updated export mapping to 34-column enriched format. |
| `docs/RAMOS_WEBSITE_ROADMAP.md` | Website Intelligence roadmap | v1.0.6 | Phase 0–10 | **CURRENT** (was NEEDS UPDATE) | Updated: marked Phases 0–9 as COMPLETE / RC, Phase 10 as PLANNED, outlined Phases 11–13. |
| `docs/RAMOS_WEBSITE_SECURITY.md` | Security constraints & boundaries | v1.0.6 | Phase 9 (RC) | **CURRENT** (was NEEDS UPDATE) | Updated: page budget ceiling aligned to code (20 pages), verified zero-backend, zero-LLM, timeout rules. |
| `docs/RAMOS_WEBSITE_PHASE_0_REPORT.md` | Phase 0 Investigation report | v1.0.6 | Phase 0 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_1_REPORT.md` | Phase 1 Single-Page extraction report | v1.0.6 | Phase 1 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_2_REPORT.md` | Phase 2 Crawler intelligence report | v1.0.6 | Phase 2 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_3_REPORT.md` | Phase 3 People extraction report | v1.0.6 | Phase 3 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_4_REPORT.md` | Phase 4 Confidence engine report | v1.0.6 | Phase 4 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_5_REPORT.md` | Phase 5 Popup UI integration report | v1.0.6 | Phase 5 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_6_REPORT.md` | Phase 6 Maps enrichment report | v1.0.6 | Phase 6 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_7_REPORT.md` | Phase 7 Export parity & hardening | v1.0.6 | Phase 7 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_PHASE_8_REPORT.md` | Phase 8 Quality scoring & deduplication | v1.0.6 | Phase 8 | **HISTORICAL** | Preserved: historical milestone report. |
| `docs/RAMOS_WEBSITE_SCRAPER_PHASE_0_1_AUDIT.md` | Scraper reusability audit | v1.0.6 | Phase 0.1 | **HISTORICAL** | Preserved: historical audit report. |
| `docs/chrome-extension.md` | Early extension notes | v1.0.0 | Baseline | **HISTORICAL** | Preserved: historical development reference. |
| `docs/CHANGELOG.md` | Comprehensive release history | v1.0.6 | Phase 9 (RC) | **CURRENT** (NEW) | Created: full release history from v1.0.0 to v1.0.6 reconstructed from repository evidence. |
| `docs/RAMOS_DOCUMENTATION_STATUS.md` | Documentation status matrix (this file)| v1.0.6 | Phase 9 (RC) | **CURRENT** (NEW) | Created: repository-wide documentation audit matrix. |
| `docs/RAMOS_DOCUMENTATION_SYNC_REPORT.md` | Documentation sync deliverable report | v1.0.6 | Phase 9 (RC) | **CURRENT** (NEW) | Created: final synchronization deliverable report. |

---

## 2. Classification Summary

- **CURRENT (Authoritative for v1.0.6)**: 12 files
- **HISTORICAL (Preserved Milestone / Audit Records)**: 24 files
- **DUPLICATE**: 0 files
- **OBSOLETE**: 0 files

All active architectural and specification documents now accurately reflect the code implemented through Phase 9 (Release Candidate / Pilot Ready).
