# Development Rules & AI Engineering Guidelines

Status: ACTIVE (v1.0.16)

This document establishes the mandatory development rules and guidelines for developer and AI coding agent workflows on the Sales Intel repository.

---

## 1. The Permanent 15-Step Development Workflow

Every code modification MUST follow this disciplined workflow:

1. **Understand**: Fully comprehend the user's intent and target scope.
2. **Change-Impact Analysis**: Determine all affected areas (code, database, config, security/RLS, Chrome extension, tests, documentation, deployment).
3. **Read Relevant Documentation**: Consult [`docs/DOCUMENTATION_MAP.md`](file:///d:/Sales-Intel/docs/DOCUMENTATION_MAP.md) and read corresponding `docs/` files BEFORE writing code.
4. **Inspect Implementation**: Inspect actual source files and database schemas to verify contracts.
5. **Implement Minimum Necessary Change**: Prefer minimum safe changes over broad refactoring.
6. **Test**: Run unit and integration tests (`npm test`).
7. **Update Documentation**: Update affected markdown files in `docs/`.
8. **Check Configuration**: Verify environment variables and configuration settings.
9. **Check Secrets**: Ensure no API keys or secrets are exposed to client code.
10. **Check `.env.example`**: Update `.env.example` if new environment variables were added.
11. **Check `.gitignore`**: Ensure temporary files, build artifacts, and logs are ignored.
12. **Check Migrations**: Verify database migrations in `supabase/migrations/` if schema changed.
13. **Run Git Status**: Inspect `git status` to ensure repository hygiene.
14. **Review Final Diff**: Verify that changes are accurate and free from unwanted side effects.
15. **Confirm Consistency**: Run `npm run check:consistency` to confirm code and documentation match.

---

## 2. Mandatory Coding Directives

1. **Do NOT rewrite working architecture merely for convenience.**
2. **Prefer minimum safe changes.**
3. **Stable components require explicit approval before behavioral changes.** (The Chrome Extension Google Maps discovery flow **v1.0.16** is FROZEN).
4. **Keep secrets server-side.** Never expose secret tokens or private keys to Vite frontend builds or Chrome Extension popups.
5. **Enforce authorization server-side.** Never rely on frontend-only UI checks or hidden navigation for security.
6. **Documentation describes the CURRENT implementation.** Never claim a feature exists if it is not active. Use `Status: PLANNED` or `Status: PARTIAL` when appropriate.
