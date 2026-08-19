<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AI DEVELOPMENT CONTRACT & GOVERNANCE POLICY

This document serves as the primary instruction contract for all AI coding agents working on the **Sales Intel** codebase.
Every AI agent MUST follow this contract without exception.

---

## 1. Core Operating Principles

1. **Stable/Frozen Components**:
   - The Chrome Extension Google Maps discovery flow (**v1.0.16**) is **STABLE AND FROZEN**.
   - Do NOT modify discovery logic, extension API contracts, or messaging bridges unless explicitly commanded with explicit impact analysis.
2. **Preserve Business Logic**:
   - Do NOT refactor working architecture merely for convenience or personal style.
   - Prefer minimum safe, incremental changes.
3. **Synchronized Lifecycle**:
   - Code, documentation, configuration, tests, security/RLS, and Git hygiene MUST remain synchronized at all times.
   - A task is NOT complete until code AND documentation are updated.

---

## 2. Mandatory Workflow: Before Any Code Change

Before writing or modifying any code, the AI MUST:

1. **Read `AGENTS.md`** (this document).
2. **Identify the exact requested change** and target scope.
3. **Perform a Change-Impact Analysis** (visible checklist):
   - Affected Code modules
   - Database schema & migrations
   - Environment & configuration
   - Security, authentication, and RLS policies
   - Provider integrations & secrets
   - Job engine & background tasks
   - Chrome Extension & extension messaging contracts
   - Test suites & test cases
   - Documentation files (`docs/*.md`, `README.md`)
   - Deployment files (`Dockerfile`, `start-local.bat`, etc.)
   - `.env.example` and `.gitignore`
4. **Read Relevant Documentation FIRST**:
   - Consult [`docs/DOCUMENTATION_MAP.md`](file:///d:/Sales-Intel/docs/DOCUMENTATION_MAP.md) to locate relevant documentation files.
   - Read the corresponding `docs/` files BEFORE modifying code.
5. **Inspect Actual Code**:
   - Never assume schemas, function signatures, or file paths. Inspect the actual source code.

---

## 3. Mandatory Workflow: During Implementation

During code implementation, the AI MUST:

1. **Preserve Existing Contracts**: Keep function signatures, API payloads, and database constraints intact unless explicitly requested.
2. **Avoid Unnecessary Refactoring**: Focus exclusively on the required task.
3. **Avoid Architecture Duplication**: Leverage existing abstractions (`src/lib/leads.server.ts`, `src/lib/normalize.ts`, `src/lib/providers/`, etc.).
4. **Keep Secrets Server-Side**: Never expose API keys or secrets to Vite frontend bundles, React components, or Chrome Extension popups/scripts.
5. **Preserve RLS & Auth**: Ensure all database queries respect Supabase Row Level Security (RLS) and server-side authorization helpers (`has_role`).
6. **Consistent Terminology**: Match terminology used in code with [`docs/CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md).

---

## 4. Mandatory Workflow: After Implementation

After modifying code, the AI MUST perform the following 18-step completion checklist:

1. [ ] **Run relevant tests** (`npm test`).
2. [ ] **Run typecheck/build** (`npm run build` or `npx tsc`).
3. [ ] **Review changed files** (`git status`, `git diff`).
4. [ ] **Identify documentation affected** by the change.
5. [ ] **Update affected documentation** in `docs/`.
6. [ ] **Update architecture documentation** ([`CURRENT_ARCHITECTURE.md`](file:///d:/Sales-Intel/docs/CURRENT_ARCHITECTURE.md)) if architecture changed.
7. [ ] **Update flow documentation** ([`CURRENT_FLOWS.md`](file:///d:/Sales-Intel/docs/CURRENT_FLOWS.md)) if runtime flows changed.
8. [ ] **Update configuration documentation** ([`CONFIGURATION.md`](file:///d:/Sales-Intel/docs/CONFIGURATION.md)) if configuration changed.
9. [ ] **Update admin documentation** ([`ADMIN.md`](file:///d:/Sales-Intel/docs/ADMIN.md)) if admin/permissions changed.
10. [ ] **Update email verification documentation** ([`EMAIL_VERIFICATION.md`](file:///d:/Sales-Intel/docs/EMAIL_VERIFICATION.md)) if email verifier changed.
11. [ ] **Update `README.md`** if setup or local execution changed.
12. [ ] **Update `.env.example`** if new environment variables were introduced.
13. [ ] **Review `.gitignore`** if temporary, generated, or sensitive files were created.
14. [ ] **Check database migrations** in `supabase/migrations/` if database schema changed.
15. [ ] **Run automated consistency check** (`npm run check:consistency`).
16. [ ] **Check for secrets exposure** (no hardcoded keys or internal tokens in code/git).
17. [ ] **Update `docs/CHANGELOG.md`** for meaningful product/architecture changes.
18. [ ] **Perform final self-reflection**: *"Does the documentation now describe the actual code?"*

A task is **NOT** considered complete until this entire checklist is satisfied.

---

## 5. Change Impact Analysis Template

When proposing or implementing changes, present the impact checklist:

```markdown
### Change Impact Analysis

- **Code**: [ ] Finder [ ] Extension [ ] Leads [ ] Providers [ ] Jobs [ ] Auth
- **Database / RLS**: [ ] Yes [ ] No
- **Configuration**: [ ] Yes [ ] No
- **Secrets**: [ ] Yes [ ] No
- **Chrome Extension**: [ ] Yes [ ] STABLE (No Change)
- **Tests**: [ ] Yes [ ] No
- **Documentation**: [ ] CURRENT_ARCHITECTURE [ ] CURRENT_FLOWS [ ] CONFIGURATION [ ] ADMIN [ ] EMAIL_VERIFICATION
- **Deployment / Environment**: [ ] .env.example [ ] Docker [ ] Local scripts
```
