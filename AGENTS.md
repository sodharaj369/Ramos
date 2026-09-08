# RAMOS AI DEVELOPMENT CONTRACT & GOVERNANCE POLICY

This document serves as the primary instruction contract for all AI coding agents working on the **RAMOS** codebase.
Every AI agent MUST follow this contract without exception.

---

## 1. Current Product Identity & Release Baseline

- **Product Name**: RAMOS – Maps Lead Extractor & Website Intelligence
- **Current Version**: `v1.0.6`
- **Release Status**: **PILOT READY / RELEASE CANDIDATE (PERMANENTLY FROZEN)**
- **Baseline Architecture**:
  - **v1.0.5**: Authoritative, frozen Google Maps extraction engine.
  - **v1.0.6**: Current integrated release candidate adding modular Website Intelligence, multi-page crawling, people & decision maker discovery, confidence scoring, lead quality scoring, deduplication, and 34-column enriched export.
- **Runtime Environment**: 100% Client-Side Manifest V3 Chrome Extension.
- **External Dependencies**: **Zero runtime npm packages**, zero backend servers, zero databases (no Supabase/cloud), zero external scraping APIs, zero proxies.

---

## 2. Core Operating Principles & Frozen Components

1. **Google Maps Engine is FROZEN**:
   - The Google Maps extraction flow (`extension/content/maps/*`, `extension/discovery.js`) is **STABLE AND FROZEN**.
   - Do NOT modify Maps selectors, result card extractors, detail panel navigation, or identity matching rules unless explicitly ordered with formal impact analysis.
2. **Website Intelligence is Modular and Isolated**:
   - All website intelligence code resides in `extension/content/website/` and `extension/shared/`.
   - Modifying website logic must never impact or break Google Maps extraction.
3. **Website Enrichment is Strictly User-Triggered**:
   - Google Maps extraction NEVER automatically launches website crawling.
   - Website enrichment is initiated ONLY when the user explicitly clicks `"Enrich Discovered Leads"`.
4. **Deterministic Extraction & Zero Hallucination**:
   - No AI, LLM, or generative heuristics in the extraction pipeline.
   - All extractions must be grounded in actual DOM nodes, structured data (JSON-LD, microdata), or RFC-validated patterns.
   - If confidence is below threshold, leave the field empty (`null`). Never fabricate or guess values.
5. **Provenance & Evidence Requirements**:
   - Every extracted field must preserve internal provenance: source URL, source type, extraction method, and numerical confidence score ($0.00 - 1.00$).
   - Raw candidate pools must be preserved internally in `_evidence` and `_provenance`.
6. **Multi-Value Preservation**:
   - Multiple discovered corporate emails must be preserved in `lead.emails[]` (with primary in `lead.email` and others in `lead.additional_emails`).
   - Multiple phones must be preserved in `lead.phones[]` (with primary in `lead.phone` and others in `lead.additional_phones`).
   - People discovered must be preserved in `lead.people[]`.
   - Discovered social profiles must be preserved in `lead.social`.
   - Later discoveries must NEVER overwrite stronger earlier candidates without confidence superiority.
7. **Strict Personal Contact Isolation**:
   - Employee personal emails or direct cell phones discovered on team cards or profiles must NEVER overwrite company primary email or company phone.
8. **Authority Precedence**:
   - Google Maps is authoritative for: `company_name`, `phone`, `address`, `city`, `region`, `country`, `postal_code`, `website`.
   - Website Intelligence is authoritative for: `email`, `social`, `people`, `decision_maker_*`, `lead_score`, `quality_tier`.
9. **Security & Anti-Bot Constraints**:
   - **NO CAPTCHA bypass**: Bot-wall or CAPTCHA challenges must fail gracefully and cleanly without infinite retries.
   - **NO proxy scraping**: Requests execute directly from the client browser.
   - **NO authentication bypass**: Never attempt to crawl private login/auth pages.
   - **Scheme sanitation**: Block non-HTTP protocols (`javascript:`, `data:`, `file:`, `blob:`, `chrome:`).
   - **Binary file exclusion**: Skip images, PDFs, archives, executables, and media.
10. **Strict Bounded Crawling & Concurrency**:
    - Hard maximum page ceiling per website: **20 pages** (options: 1, 5, 10, 20).
    - Maximum crawl depth: **2 hops** from root.
    - Concurrency: Sequential single-flight page acquisition.
11. **Enforced Timeouts (Source Code Authoritative)**:
    - Google Maps single-candidate detail enrichment timeout: **15,000 ms (15s)** (`background.js:646`).
    - Website batch enrichment page fetch timeout: **6,000 ms (6s)** (`popup.js:829`).
    - Standalone interactive website crawl fetch timeout: **10,000 ms (10s)** (`popup.js:1040`).
12. **Export Compatibility**:
    - **Maps Standalone Export**: Strictly 24 canonical columns (CSV and XLSX).
    - **Enriched Export**: Strictly 34 canonical columns (CSV and Sheet 1 "Leads" of XLSX) + 7 columns (Sheet 2 "People" of XLSX).
    - Never break the 24-column Maps export contract.

---

## 3. Mandatory Workflow: Before Any Code Change

Before writing or modifying any code, the AI agent MUST:

1. **Read `AGENTS.md`** (this document).
2. **Perform Change-Impact Analysis**:
   ```markdown
   ### Change Impact Analysis
   - **Subsystem**: [ ] Google Maps (FROZEN) [ ] Website Intelligence [ ] Shared / Export [ ] Popup UI [ ] Background
   - **Runtime Behavior Changed**: [ ] Yes [ ] No
   - **Database / Schema**: [ ] Yes [ ] N/A (Client-Side)
   - **Chrome Extension Manifest**: [ ] Yes [ ] No
   - **Tests Affected**: [ ] Maps (14) [ ] Website (143) [ ] QA Matrix (5)
   - **Export Parity**: [ ] 24-col Maps [ ] 34-col Enriched [ ] 2-sheet XLSX
   - **Documentation Affected**: [ ] AGENTS.md [ ] ARCHITECTURE [ ] EXPORT [ ] ROADMAP [ ] SECURITY
   ```
3. **Inspect Active Code First**: Never assume signatures, timeouts, or schemas. Inspect the actual source code.

---

## 4. Mandatory Workflow: During Implementation

1. **Preserve Frozen Contracts**: Do not touch `extension/content/maps/` unless explicitly commanded with regression proof.
2. **Keep Zero-Backend Invariant**: Never add external APIs, cloud databases, server microservices, or npm runtime dependencies.
3. **Keep Client-Side Primitives**: Use native browser `Uint8Array`, `TextEncoder`, and `DOMParser`.
4. **Follow Safe Error Handling**: All network fetches must handle abort signals and timeouts cleanly without crashing the extension.

---

## 5. Mandatory Workflow: After Implementation (Completion Checklist)

After modifying code, the AI agent MUST execute and verify:

1. [ ] **Run all automated tests**: `npm test` (all 162+ tests must pass).
2. [ ] **Run consistency checker**: `npm run check:consistency`.
3. [ ] **Package extension**: `npm run package:extension`.
4. [ ] **Verify packaged extension parity**: `node scripts/verify-packaged-extension-parity.js`.
5. [ ] **Verify zero Maps regressions**: `git diff -- extension/content/maps/` (must be completely clean).
6. [ ] **Review changed files**: `git status`, `git diff --stat`.
7. [ ] **Update affected documentation** in `docs/` and root.
8. [ ] **Update architecture documentation** (`RAMOS_CURRENT_ARCHITECTURE.md`) if architecture changed.
9. [ ] **Update export specification** (`docs/RAMOS_EXPORT_SPECIFICATION.md`) if export formats changed.
10. [ ] **Update changelog** (`docs/CHANGELOG.md`) for meaningful product/architecture changes.
11. [ ] **Check for secret exposure** (zero API keys or credentials in repository).
12. [ ] **Perform final self-reflection**: *"Does the documentation accurately describe the actual running code?"*

A task is **NOT** considered complete until this entire checklist is satisfied.
