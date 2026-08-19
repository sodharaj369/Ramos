# Code-to-Documentation Mapping

Status: ACTIVE (v1.0.16)

This document establishes the mandatory mapping between codebase directories/files and their corresponding documentation documents in `docs/`.
Whenever an AI coding agent or developer modifies code in a listed area, they MUST consult and update the corresponding documentation files.

---

## 1. Module Mapping Table

| Code Area / Path | Primary Code Files | Authoritative Documentation |
| :--- | :--- | :--- |
| **Chrome Extension (FROZEN v1.0.16)** | `extension/`, `scripts/extension-package.js` | [`docs/chrome-extension.md`](file:///d:/Sales-Intel/docs/chrome-extension.md)<br>[`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md)<br>[`docs/CURRENT_FLOWS.md`](file:///d:/Sales-Intel/docs/CURRENT_FLOWS.md)<br>[`docs/CURRENT_FEATURES.md`](file:///d:/Sales-Intel/docs/CURRENT_FEATURES.md) |
| **Lead Import & Deduplication** | `src/lib/leads.server.ts`, `src/lib/normalize.ts`, `src/lib/extension-import.server.ts` | [`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md)<br>[`docs/CURRENT_FEATURES.md`](file:///d:/Sales-Intel/docs/CURRENT_FEATURES.md)<br>[`docs/CURRENT_FLOWS.md`](file:///d:/Sales-Intel/docs/CURRENT_FLOWS.md) |
| **Email Verification** | `email-verifier-service/`, `src/lib/providers/aftership-smtp.server.ts`, `src/lib/verification.functions.ts` | [`docs/EMAIL_VERIFICATION.md`](file:///d:/Sales-Intel/docs/EMAIL_VERIFICATION.md)<br>[`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md)<br>[`docs/CURRENT_FLOWS.md`](file:///d:/Sales-Intel/docs/CURRENT_FLOWS.md) |
| **Admin & Security / RLS** | `supabase/migrations/`, `src/lib/extension-auth.server.ts` | [`docs/ADMIN.md`](file:///d:/Sales-Intel/docs/ADMIN.md)<br>[`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md) |
| **Configuration & Environment** | `.env`, `.env.example`, `src/lib/providers/runtime.server.ts` | [`docs/CONFIGURATION.md`](file:///d:/Sales-Intel/docs/CONFIGURATION.md)<br>[`docs/local-development.md`](file:///d:/Sales-Intel/docs/local-development.md) |
| **Background Job Engine** | `src/lib/jobs.functions.ts`, `src/lib/job-runner.server.ts` | [`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md)<br>[`docs/CURRENT_FEATURES.md`](file:///d:/Sales-Intel/docs/CURRENT_FEATURES.md) |
| **Optional Server-Side Scraper** | `src/lib/providers/self-hosted-google-maps.server.ts` | [`docs/self-hosted-google-maps.md`](file:///d:/Sales-Intel/docs/self-hosted-google-maps.md) |
| **User Interface Pages** | `src/routes/`, `src/components/` | [`docs/UI_UX_AUDIT.md`](file:///d:/Sales-Intel/docs/UI_UX_AUDIT.md)<br>[`docs/CURRENT_FEATURES.md`](file:///d:/Sales-Intel/docs/CURRENT_FEATURES.md) |
| **Development Rules & Process** | `AGENTS.md`, `docs/DEVELOPMENT_RULES.md`, `scripts/check-project-consistency.js` | [`AGENTS.md`](file:///d:/Sales-Intel/AGENTS.md)<br>[`docs/DEVELOPMENT_RULES.md`](file:///d:/Sales-Intel/docs/DEVELOPMENT_RULES.md) |

---

## 2. Trigger Rules for Documentation Review

- **Rule 1**: If modifying `extension/*` files, check [`docs/chrome-extension.md`](file:///d:/Sales-Intel/docs/chrome-extension.md).
- **Rule 2**: If modifying `email-verifier-service/*` or `aftership-smtp.server.ts`, check [`docs/EMAIL_VERIFICATION.md`](file:///d:/Sales-Intel/docs/EMAIL_VERIFICATION.md).
- **Rule 3**: If modifying environment variables or configuration constants, update `.env.example` AND check [`docs/CONFIGURATION.md`](file:///d:/Sales-Intel/docs/CONFIGURATION.md).
- **Rule 4**: If modifying RLS policies or user roles, check [`docs/ADMIN.md`](file:///d:/Sales-Intel/docs/ADMIN.md).
- **Rule 5**: If modifying setup commands or port bindings, check [`docs/local-development.md`](file:///d:/Sales-Intel/docs/local-development.md).
