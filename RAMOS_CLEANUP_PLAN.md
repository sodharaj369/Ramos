# RAMOS Codebase Cleanup & Dependency Audit Plan (Phase 1)

## Executive Summary & Audit Scope
This document specifies the audit findings for transitioning the cloned **Sales Intel** repository into a clean, standalone **RAMOS Chrome Extension** repository for Google Maps lead extraction.

### Core Objectives
1. **Remove Web Application & Backend Overhead**: Eliminate Vinxi/Nitro web server code, TanStack Start/Router routes, Supabase database integrations, authentication helpers, email verifiers, and Gosom Puppeteer scrapers.
2. **Protect Google Maps Extraction Engine**: Retain and preserve all working Manifest V3 Chrome Extension background service workers, content scripts, DOM utilities, selectors, validators, address parsers, candidate queue state machines, and CSV export functionality.
3. **Purge Unused Dependencies & Scripts**: Remove 35+ React/Radix/TanStack/Supabase npm dependencies and 20+ local database/app batch scripts, reducing the project footprint to zero runtime dependencies.

---

## KEEP / REMOVE / REVIEW Summary Table

| Category | Count | Primary Description |
| :--- | :---: | :--- |
| **KEEP** | 32 files | Extension Manifest V3, Popup UI, Background Worker, Maps Content Scripts, Extractor Core, Diagnostics, Packaging Scripts, Formatting Config |
| **REMOVE** | 120+ files | Web App (`src/routes`, `src/components`, `src/integrations`, `src/lib` backend code), Supabase DB migrations, Go email verifier, obsolete docs & scripts |
| **REVIEW** | 9 files | Shared normalizers (`normalize.ts`), Extension Lead Types (`domain-types.ts`), Maps unit test relocation, Config files (`tsconfig.json`, `vite.config.ts`) |

---

## Detailed Classification Breakdown

### 1. KEEP (Files Required for Standalone RAMOS Extension)

| Path | Description & Purpose |
| :--- | :--- |
| [`extension/manifest.json`](file:///d:/Ramos/extension/manifest.json) | Chrome Extension Manifest V3 declaration |
| [`extension/background.js`](file:///d:/Ramos/extension/background.js) | Service worker tracking run state, candidate queue dispatching, bounded timeouts, CSV export |
| [`extension/discovery.js`](file:///d:/Ramos/extension/discovery.js) | Google Maps DOM discovery worker, scroll engine, candidate queue builder |
| [`extension/popup.html`](file:///d:/Ramos/extension/popup.html) | Extension Popup HTML interface |
| [`extension/popup.js`](file:///d:/Ramos/extension/popup.js) | Extension Popup controller & progress listener |
| [`extension/popup.css`](file:///d:/Ramos/extension/popup.css) | Extension Popup stylesheet |
| [`extension/icon.png`](file:///d:/Ramos/extension/icon.png) | Extension icon asset |
| [`extension/content/maps/dom-utils.js`](file:///d:/Ramos/extension/content/maps/dom-utils.js) | DOM query utilities, element scrolling, sleep helpers |
| [`extension/content/maps/selectors.js`](file:///d:/Ramos/extension/content/maps/selectors.js) | Authoritative DOM selectors for Google Maps search cards, feed, detail panel |
| [`extension/content/maps/validators.js`](file:///d:/Ramos/extension/content/maps/validators.js) | Data validation rules for names, phones, ratings, URLs |
| [`extension/content/maps/address-parser.js`](file:///d:/Ramos/extension/content/maps/address-parser.js) | City, region, country, postal code extraction from Google Maps address strings |
| [`extension/content/maps/result-card-extractor.js`](file:///d:/Ramos/extension/content/maps/result-card-extractor.js) | Search result card metadata extraction & business qualification |
| [`extension/content/maps/detail-extractor.js`](file:///d:/Ramos/extension/content/maps/detail-extractor.js) | Rich detail panel metadata extraction & identity verification |
| [`extension/content/maps/maps-adapter.js`](file:///d:/Ramos/extension/content/maps/maps-adapter.js) | Orchestrator module binding extractor scripts to unified API surface |
| [`extension/shared/constants.js`](file:///d:/Ramos/extension/shared/constants.js) | Shared error codes, extraction modes, and limits |
| [`extension/shared/schema.js`](file:///d:/Ramos/extension/shared/schema.js) | Canonical Lead model builder (`createCanonicalLead`) |
| [`scripts/extension-package.js`](file:///d:/Ramos/scripts/extension-package.js) | Extension packaging script for creating ZIP distribution |
| [`scripts/verify-packaged-extension-parity.js`](file:///d:/Ramos/scripts/verify-packaged-extension-parity.js) | Parity verification script between source and ZIP package |
| [`scripts/test-queue-resilience.js`](file:///d:/Ramos/scripts/test-queue-resilience.js) | Live CDP test runner for queue resilience & timeouts |
| [`scripts/run-real-e2e-diagnostic.js`](file:///d:/Ramos/scripts/run-real-e2e-diagnostic.js) | Live Playwright/Puppeteer E2E diagnostic harness |
| [`scripts/generate-e2e-diagnostic-report.js`](file:///d:/Ramos/scripts/generate-e2e-diagnostic-report.js) | Diagnostic report generator |
| [`scripts/probe-chrome.js`](file:///d:/Ramos/scripts/probe-chrome.js) | Chrome instance debug prober |
| [`scripts/probe-targets.js`](file:///d:/Ramos/scripts/probe-targets.js) | Chrome CDP target prober |
| [`scripts/inspect-cdp-targets.js`](file:///d:/Ramos/scripts/inspect-cdp-targets.js) | CDP targets inspector |
| [`scripts/test-sw-trigger.js`](file:///d:/Ramos/scripts/test-sw-trigger.js) | Service worker trigger test script |
| [`.gitignore`](file:///d:/Ramos/.gitignore) | Git ignore patterns |
| [`.prettierrc`](file:///d:/Ramos/.prettierrc) | Prettier configuration |
| [`.prettierignore`](file:///d:/Ramos/.prettierignore) | Prettier ignore patterns |
| [`eslint.config.js`](file:///d:/Ramos/eslint.config.js) | ESLint configuration |
| [`docs/chrome-extension.md`](file:///d:/Ramos/docs/chrome-extension.md) | Technical reference spec for Google Maps extraction engine |

---

### 2. REMOVE (Files Safe to Delete)

#### Web Application Frontend & Routing (`src/`)
- `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/styles.css`
  - **Why Sales Intel-specific**: Vinxi / Nitro / TanStack Start server entry points, router, and global CSS for web application.
  - **Import references**: `vite.config.ts`.
  - **Impact of removal**: Removes web app rendering.
  - **Maps functionality dependency**: NONE.
- `src/routes/` (All 17 files: `__root.tsx`, `auth.tsx`, `index.tsx`, `reset-password.tsx`, `_authenticated/*`, `api/public/extension/import.ts`, `status.ts`)
  - **Why Sales Intel-specific**: React routes, dashboard UI, auth pages, and backend API endpoints for web app lead import.
  - **Import references**: `routeTree.gen.ts`.
  - **Impact of removal**: Removes web application pages and web API endpoints.
  - **Maps functionality dependency**: NONE.
- `src/components/` (All 55 files: `admin-settings-panel.tsx`, `app-shell.tsx`, `empty-state.tsx`, `extension-connection.tsx`, `job-progress.tsx`, `location-picker.tsx`, `source-badge.tsx`, `stat-card.tsx`, `status-badge.tsx`, and 46 `src/components/ui/*` Radix UI components)
  - **Why Sales Intel-specific**: Web app React UI components and Radix UI elements.
  - **Import references**: Web app routes.
  - **Impact of removal**: Removes web app UI elements.
  - **Maps functionality dependency**: NONE.
- `src/hooks/` (`use-auth.ts`, `use-extension-bridge.ts`, `use-job-runner.ts`, `use-mobile.tsx`)
  - **Why Sales Intel-specific**: React hooks for web app auth session and web extension bridge handshake.
  - **Import references**: Web app components.
  - **Impact of removal**: Removes web app state management.
  - **Maps functionality dependency**: NONE.
- `src/integrations/supabase/` (`auth-attacher.ts`, `auth-middleware.ts`, `client.server.ts`, `client.ts`, `types.ts`)
  - **Why Sales Intel-specific**: Supabase client configuration and RLS database types.
  - **Import references**: `src/lib/leads.server.ts`, `src/lib/admin.functions.ts`.
  - **Impact of removal**: Removes Supabase DB connectivity.
  - **Maps functionality dependency**: NONE.

#### Web App Backend Libraries (`src/lib/`)
- `src/lib/admin.functions.ts` (Admin user functions)
- `src/lib/error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts` (Web app error handling)
- `src/lib/extension-auth.server.ts` (Server auth for extension token)
- `src/lib/extension-connection.test.ts`, `extension-import.server.ts`, `extension-import.test.ts` (Web app import API & tests)
- `src/lib/job-runner.server.ts`, `jobs.functions.ts`, `jobs.handlers.server.ts` (Backend prospecting job queue)
- `src/lib/leads-timestamp.test.ts`, `leads.functions.ts`, `leads.server.ts` (Database CRUD operations for leads)
- `src/lib/password-policy.ts` (Auth password validation rules)
- `src/lib/utils.ts` (shadcn classname merger)
- `src/lib/verification.functions.ts` (Email verifier API functions)
- `src/lib/config/runtime-config.server.ts`, `runtime-config.test.ts` (Server runtime config)
- `src/lib/providers/` (`aftership-smtp.server.ts`, `email-verifiers.server.ts`, `email-verifiers.test.ts`, `lead-sources.server.ts`, `runtime.server.ts`, `self-hosted-google-maps.server.ts`, `self-hosted-google-maps.test.ts`)
  - **Why Sales Intel-specific**: Backend services, email verification, Gosom Puppeteer scrapers, and database handlers.
  - **Import references**: Web app server routes and jobs.
  - **Impact of removal**: Removes backend services.
  - **Maps functionality dependency**: NONE.

#### Extension Backend & Bridge Code (`extension/`)
- `extension/content/bridge.js`: Web app bridge script injected into web app domains (`biz-intel-tool.lovable.app`, `localhost:8080`).
  - **Why Sales Intel-specific**: Handshakes auth session with web app.
  - **Import references**: `extension/manifest.json`.
  - **Impact of removal**: Removes web app auth handshake.
  - **Maps functionality dependency**: NONE.
- `extension/content/discovery.js` & `extension/content/maps-adapter.js`: Legacy duplicate content scripts in `extension/content/`.
  - **Why Sales Intel-specific**: Unused legacy artifacts from v1.0.11 connector.
  - **Import references**: None (active extension uses `extension/discovery.js` and `extension/content/maps/maps-adapter.js`).
  - **Impact of removal**: None.
  - **Maps functionality dependency**: NONE.
- Backend import functions in `extension/background.js`:
  - `sendBatchImportToBackend(leads)`, `getAuthData()`, `setAuthData()`, `clearAuth()`, `resolveApiBase()`, message listeners `SI_CONNECT`, `SI_DISCONNECT`, `SI_GET_STATUS`, `SI_BATCH_IMPORT`.
  - **Why Sales Intel-specific**: Communicates with remote Supabase import API.
  - **Import references**: Listener dispatch in `background.js`.
  - **Impact of removal**: Removes remote backend lead import.
  - **Maps functionality dependency**: NONE.

#### Infrastructure, Databases, Services & Batch Scripts
- `supabase/` (All migrations, config.toml, snippets, branches)
- `email-verifier-service/` (`main.go`, `Dockerfile`, `go.mod`, `go.sum`, `README.md`)
- `.env`, `.env.example`
- `start-local.bat`, `stop-local.bat`, `restart-local.bat`
- `components.json`, `bun.lock`, `bunfig.toml`
- `scripts/apply-local-migration.js`, `apply-migration-20260819140000.js`, `execute-local-import.js`, `export-prod-data.js`, `inspect-all-settings.js`, `inspect-db-columns.js`, `inspect-local-schema.js`, `inspect-rls-policies.js`, `inspect-table-schema.js`, `query-db.js`, `seed-local-auth-users.js`, `setup-local-auth-test.js`, `smoke-test-local-app.js`, `test-auth-confirmation-flow.js`, `test-cloud-auth-export.js`, `test-extension-import-flow.js`, `test-local-supabase.js`, `test-native-connect.js`, `test-popup-access.js`, `test-settings-ui-flow.js`.
  - **Why Sales Intel-specific**: Database setup, Go email verification microservice, and local web app orchestration.
  - **Impact of removal**: Removes backend infrastructure.
  - **Maps functionality dependency**: NONE.

#### Obsolete Web App Documentation (`docs/`)
- `docs/ADMIN.md`, `CONFIGURATION.md`, `CURRENT_FEATURES.md`, `CURRENT_FLOWS.md`, `DOCUMENTATION_MAP.md`, `EMAIL_VERIFICATION.md`, `LOCAL_SUPABASE_MIGRATION.md`, `LOCAL_SUPABASE_MIGRATION_ASSESSMENT.md`, `SETTINGS_UI_UX_AUDIT.md`, `TECHNICAL_DEBT.md`, `UI_UX_AUDIT.md`, `UI_UX_POLISH_PLAN.md`, `local-development.md`, `self-hosted-google-maps.md`.
  - **Why Sales Intel-specific**: Describes web app architecture, admin roles, Supabase setup, and Gosom scrapers.
  - **Impact of removal**: Cleans up obsolete documentation.
  - **Maps functionality dependency**: NONE.

---

### 3. REVIEW (Modules Requiring Dependency Verification Before Cleanup)

| File / Module | Dependency Analysis | Action Required in Phase 2 |
| :--- | :--- | :--- |
| [`src/lib/normalize.ts`](file:///d:/Ramos/src/lib/normalize.ts) | Contains text cleaning (`cleanUnicode`), company name normalization, website/domain normalization, address location parsing, and canonical lead builder (`normalizeBusinessLead`). | **Extract & Migrate**: Extract client-safe functions into `extension/content/maps/normalize-utils.js` or `extension/shared/schema.js`, then delete `src/lib/normalize.ts`. |
| [`src/lib/domain-types.ts`](file:///d:/Ramos/src/lib/domain-types.ts) | Contains lead domain interface declarations (`CanonicalLead`, `LeadRecord`). | **Extract Types**: Extract `CanonicalLead` type definitions into `extension/shared/schema.js` or `extension/types.ts`, then remove `domain-types.ts`. |
| [`src/lib/csv.ts`](file:///d:/Ramos/src/lib/csv.ts) | Web app CSV exporter module for Supabase lead records. | **Safely Delete**: `extension/background.js` and `extension/popup.js` already implement standalone CSV generation (`createCsv`, `generateCSV`, `escapeCsvCell`). Can be deleted after verifying header parity. |
| [`src/lib/gmaps-card-pipeline.test.ts`](file:///d:/Ramos/src/lib/gmaps-card-pipeline.test.ts) & [`src/lib/gmaps-vadapav-e2e-diagnostic.test.ts`](file:///d:/Ramos/src/lib/gmaps-vadapav-e2e-diagnostic.test.ts) | Node.js unit and diagnostic tests that test `extension/content/maps/` extractors and run engine queue logic. | **Relocate**: Move both test files to `extension/tests/` so they run via `npm test` without depending on `src/lib/`. |
| [`scripts/check-project-consistency.js`](file:///d:/Ramos/scripts/check-project-consistency.js) | Automated consistency checker verifying docs and codebase alignment. | **Update**: Update file paths in script to check RAMOS documentation (`RAMOS_CURRENT_ARCHITECTURE.md`, `RAMOS_CLEANUP_PLAN.md`). |
| [`extension/shared/environment.js`](file:///d:/Ramos/extension/shared/environment.js) | Resolves web app origin (`localhost:8080` vs `biz-intel-tool.lovable.app`). | **Simplify / Remove**: Replace web app origin resolution with a static standalone extension environment config. |
| [`extension/shared/schema.js`](file:///d:/Ramos/extension/shared/schema.js) | Defines `createCanonicalLead` and `toBackendImportPayload`. | **Refactor**: Keep `createCanonicalLead()` as the RAMOS canonical lead builder; remove `toBackendImportPayload()`. |
| [`vite.config.ts`](file:///d:/Ramos/vite.config.ts) | Vite build configuration for TanStack Start Vinxi server application. | **Simplify**: Simplify to a lightweight Vite TypeScript config for bundling extension scripts or running unit tests. |
| [`tsconfig.json`](file:///d:/Ramos/tsconfig.json) | TypeScript compiler options with React JSX and web app path aliases. | **Simplify**: Update compiler options for DOM, ES2022, and WebWorker types for extension development. |

---

## Package.json Audit Summary

### 1. Dependencies to REMOVE (30 Runtime Dependencies)
All 30 runtime dependencies exist exclusively for the Sales Intel React web application and backend database integration:

```json
"@hookform/resolvers", "@radix-ui/react-accordion", "@radix-ui/react-alert-dialog",
"@radix-ui/react-aspect-ratio", "@radix-ui/react-avatar", "@radix-ui/react-checkbox",
"@radix-ui/react-collapsible", "@radix-ui/react-context-menu", "@radix-ui/react-dialog",
"@radix-ui/react-dropdown-menu", "@radix-ui/react-hover-card", "@radix-ui/react-label",
"@radix-ui/react-menubar", "@radix-ui/react-navigation-menu", "@radix-ui/react-popover",
"@radix-ui/react-progress", "@radix-ui/react-radio-group", "@radix-ui/react-scroll-area",
"@radix-ui/react-select", "@radix-ui/react-separator", "@radix-ui/react-slider",
"@radix-ui/react-slot", "@radix-ui/react-switch", "@radix-ui/react-tabs",
"@radix-ui/react-toggle", "@radix-ui/react-toggle-group", "@radix-ui/react-tooltip",
"@supabase/supabase-js", "@tailwindcss/vite", "@tanstack/react-query",
"@tanstack/react-router", "@tanstack/react-start", "@tanstack/router-plugin",
"class-variance-authority", "clsx", "cmdk", "country-state-city", "date-fns",
"embla-carousel-react", "input-otp", "lucide-react", "react", "react-day-picker",
"react-dom", "react-hook-form", "react-resizable-panels", "recharts", "sonner",
"tailwind-merge", "tailwindcss", "tw-animate-css", "vaul", "vite-tsconfig-paths", "zod"
```

### 2. devDependencies to REMOVE (5 Packages)
```json
"@lovable.dev/vite-tanstack-config", "@types/react", "@types/react-dom",
"@vitejs/plugin-react", "nitro"
```

### 3. devDependencies to KEEP (7 Packages)
```json
"@eslint/js", "@types/node", "eslint", "eslint-config-prettier",
"eslint-plugin-prettier", "prettier", "typescript"
```

### 4. Target Clean `package.json` Structure
```json
{
  "name": "ramos-chrome-extension",
  "version": "1.0.16",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test extension/tests/*.test.ts",
    "package:extension": "node scripts/extension-package.js",
    "check:consistency": "node scripts/check-project-consistency.js",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@types/node": "^22.16.5",
    "eslint": "^9.32.0",
    "eslint-config-prettier": "^10.1.1",
    "eslint-plugin-prettier": "^5.2.6",
    "prettier": "^3.7.3",
    "typescript": "^5.8.3"
  }
}
```

---

## Phase 2 Implementation Roadmap (Post-Approval)

Once this cleanup plan is reviewed and approved, Phase 2 implementation will execute as follows:

1. **Extract & Relocate Shared Logic**:
   - Extract client-safe functions from `src/lib/normalize.ts` into `extension/content/maps/` / `extension/shared/schema.js`.
   - Relocate `src/lib/gmaps-card-pipeline.test.ts` and `src/lib/gmaps-vadapav-e2e-diagnostic.test.ts` to `extension/tests/`.
2. **Purge REMOVE Items**:
   - Delete `src/` directory (`routes`, `components`, `hooks`, `integrations`, `lib`).
   - Delete `supabase/` directory and `email-verifier-service/` directory.
   - Delete obsolete batch scripts and backend documentation files.
   - Delete `extension/content/bridge.js`, `extension/content/discovery.js`, and `extension/content/maps-adapter.js`.
3. **Clean Up Extension Manifest & Popup UI**:
   - Update `extension/manifest.json` title to "RAMOS Maps Connector" and remove web app content script matches.
   - Remove Sales Intel backend connection panel, import buttons, and web app links from `extension/popup.html` and `extension/popup.js`.
   - Strip backend import functions (`sendBatchImportToBackend`, `SI_CONNECT`, etc.) from `extension/background.js`.
4. **Update Project Package & Config**:
   - Update `package.json` to the lean target structure.
   - Simplify `tsconfig.json` and `vite.config.ts`.
5. **Validation & Packaging**:
   - Run `npm test` to verify extension unit tests pass cleanly.
   - Run `npm run package:extension` to generate the standalone `ramos-maps-connector-v1.0.16.zip`.
