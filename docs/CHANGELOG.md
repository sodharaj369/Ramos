# Product & Architecture Changelog

All notable changes to the Sales Intel codebase and architecture will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.16] - 2026-08-19

### Baseline Governance & AI Development Contract
- **Governance**: Created root `AGENTS.md` specifying AI Development Contract, Change-Impact Analysis checklist, and 18-step completion workflow.
- **Documentation Architecture**: Established comprehensive documentation system in `docs/`:
  - `CURRENT_ARCHITECTURE.md`: Technical topology, component breakdown, and tech stack.
  - `CURRENT_FEATURES.md`: Feature inventory (Chrome Extension, Import/Dedup, Email Verifier, Job Engine, Datatable).
  - `CURRENT_FLOWS.md`: Sequence diagrams for discovery, deduplication, verification, and auth sync.
  - `DOCUMENTATION_MAP.md`: Code-to-documentation cross-reference mapping.
  - `CONFIGURATION.md`: Configuration table, secret boundaries, and runtime settings rules.
  - `ADMIN.md`: Admin role architecture, RLS security policies, and server-side authorization.
  - `EMAIL_VERIFICATION.md`: Go email-verifier microservice architecture, RFC syntax, MX/SMTP checks, and status definitions.
  - `UI_UX_AUDIT.md`: Current page inventory and visual/usability baseline audit.
  - `TECHNICAL_DEBT.md`: Typecheck compiler strictness audit, route params, and test tracking.
  - `DEVELOPMENT_RULES.md`: 15 permanent development workflow rules for engineering agents.
- **Infrastructure & Git Hygiene**:
  - Created automated project consistency script [`scripts/check-project-consistency.js`](file:///d:/Sales-Intel/scripts/check-project-consistency.js) and added `npm run check:consistency`.
  - Updated `.gitignore` to prevent tracking of local E2E scratch profiles and temporary build zips.
- **Chrome Extension**: Preserved frozen release **v1.0.16**.
