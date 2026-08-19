# Technical Debt & Known Gaps

Status: ACTIVE (v1.0.16)

This document tracks known technical debt, compiler warnings, edge cases, and optimization opportunities in the Sales Intel application.

---

## 1. Compiler & Typecheck Observations

- **TypeScript Index Signature Strictness (`noPropertyAccessFromIndexSignature`)**:
  - Running strict `tsc --noEmit` produces property access errors on index signature types (e.g. `src/lib/normalize.ts`, `src/routes/_authenticated/leads.index.tsx`).
  - *Impact*: Low at runtime because Vite / Nitro builds compile cleanly and all 109 unit/integration tests pass.
  - *Recommended Action*: Normalize search parameter interface types or adjust compiler index signature access in route definitions.
- **TanStack Router Route Search Parameters**:
  - `src/routes/_authenticated/finder.tsx` and `leads.$id.tsx` have route navigation calls missing explicit search params generic parameters in strict mode.

---

## 2. Git Hygiene & Artifact Tracking

- **Temporary Chrome E2E Profile Data in `scratch/`**:
  - `git status` previously tracked subfiles inside `scratch/e2e-chrome-profile-...`.
  - *Resolution*: Updated `.gitignore` to explicitly ignore `scratch/*` and clean untracked zip copies in `public/`.

---

## 3. Configuration & Governance Gaps

- **Hardcoded Runtime Parameters**:
  - Parameters such as max import batch size (`50`) and email verification concurrency (`3`) are hardcoded in server code.
  - *Recommended Action*: Expose these via system configuration tables in PostgreSQL for Admin tuning without code redeployment.

---

## 4. Test Suite Coverage & Verification

- **Current Status**: 109 tests passing in `src/**/*.test.ts`.
- **Gaps**:
  - Unit tests cover normalization, extension import contracts, candidate limits, lead timestamp preservation, and email verification logic.
  - End-to-end browser tests run via standalone scripts in `scripts/` (`run-real-e2e-diagnostic.js`, `test-queue-resilience.js`).
