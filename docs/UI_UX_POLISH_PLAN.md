# Sales Intel Web Application UI/UX Polish Plan

**Date**: August 19, 2026  
**Status**: Planned Implementation Roadmap  
**Reference Document**: [`docs/UI_UX_AUDIT.md`](file:///d:/Sales-Intel/docs/UI_UX_AUDIT.md)

---

## Controlled Implementation Roadmap

### Phase 5.1 — Design Foundation
- **Files/Components Affected**:
  - `src/styles.css`
  - `src/components/ui/button.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/select.tsx`
  - `src/components/ui/sonner.tsx`
  - `src/components/status-badge.tsx`
  - `src/components/empty-state.tsx`
- **Exact UI Improvements**:
  - Standardize design system tokens, typography rules, focus states, and component variants.
  - Refactor `src/styles.css` utilities and CSS variables for consistent OKLCH palette usage.
  - Standardize semantic colors across status badges (Green: valid/connected/completed; Amber: risky/pending/unconfigured; Red: invalid/failed/error; Gray: unknown/unverified/disabled).
  - Polish reusable `EmptyState` component for application-wide adoption.
- **Dependencies**: None.
- **Risks**: CSS variable name mismatches affecting unstyled elements.
- **Regression Concerns**: Must preserve existing component prop signatures.
- **Verification Method**: `npm run build`, `npm test`, visual inspection of design tokens.

---

### Phase 5.2 — Application Shell
- **Files/Components Affected**:
  - `src/components/app-shell.tsx`
  - `src/routes/_authenticated/route.tsx`
- **Exact UI Improvements**:
  - Reorganize sidebar navigation into conceptual workflow groups:
    - **SALES INTEL**: Dashboard
    - **LEADS**: Find Leads, Leads, Import
    - **VERIFICATION**: Email Verification, Verification History
    - **OPERATIONS**: Jobs
    - **SYSTEM**: Settings, Documentation
  - Improve header layout with breadcrumb indicator and user menu dropdown.
  - Upgrade mobile navigation to responsive sheet drawer/bar with clear touch targets and icons.
- **Dependencies**: Phase 5.1 (Design Foundation).
- **Risks**: Broken route links or navigation active states.
- **Regression Concerns**: TanStack Router active state props must be preserved.
- **Verification Method**: Test navigation across mobile and desktop viewports; run `npm run check:consistency`.

---

### Phase 5.3 — Dashboard
- **Files/Components Affected**:
  - `src/routes/_authenticated/dashboard.tsx`
  - `src/components/stat-card.tsx`
- **Exact UI Improvements**:
  - Elevate visual hierarchy of top KPI cards (Total Leads, Discovered Today, Valid Rate, Verifications Run).
  - Improve recent jobs section with direct quick action links and status indicators.
  - Add standard `EmptyState` integration for new workspace setups with 0 leads.
- **Dependencies**: Phase 5.1 & 5.2.
- **Risks**: None.
- **Regression Concerns**: `getDashboardStats` server function contract must remain untouched.
- **Verification Method**: `npm test`, verify dashboard server function data rendering.

---

### Phase 5.4 — Leads
- **Files/Components Affected**:
  - `src/routes/_authenticated/leads.index.tsx`
- **Exact UI Improvements**:
  - Fix P0 router link navigation type mismatches.
  - Replace native `window.confirm()` with Radix `AlertDialog` primitive for bulk deletion.
  - Add visual sort indicator icons (`ArrowUp`, `ArrowDown`, `ArrowUpDown`) to active table column headers.
  - Polish datatable layout: highlight company name, format compact dates, improve row hover and selection states.
  - Improve search & filter grid layout with responsive collapse controls.
  - Add standard `EmptyState` for zero search/filter matches.
- **Dependencies**: Phase 5.1, 5.2.
- **Risks**: Selection state bugs during pagination or filtering.
- **Regression Concerns**: Bulk deletion, CSV export, and email verification job creation flows MUST remain intact.
- **Verification Method**: `npm test`, manual verification of batch actions and filters.

---

### Phase 5.5 — Lead Details
- **Files/Components Affected**:
  - `src/routes/_authenticated/leads.$id.tsx`
- **Exact UI Improvements**:
  - Fix P0 router link navigation type mismatch when returning to `/leads`.
  - Organize lead profile into clear, distinct visual sections (Company Identity, Contact Info, Sales Signals, Verification History, Provenance & Audit Trail).
  - Polish social links, website button triggers, and status badges.
- **Dependencies**: Phase 5.1, 5.4.
- **Risks**: Null dereferencing on optional lead fields.
- **Regression Concerns**: `getLead` and `verifySingleEmail` server function calls must remain unchanged.
- **Verification Method**: `npm test`, verify lead profile page rendering with complete and partial lead fixtures.

---

### Phase 5.6 — Jobs
- **Files/Components Affected**:
  - `src/routes/_authenticated/jobs.tsx`
  - `src/components/job-progress.tsx`
- **Exact UI Improvements**:
  - Add `Skeleton` loading state during job list query fetching.
  - Clearly distinguish job states (queued, running, completed, failed, cancelled) with standardized status badges.
  - Add collapsible technical detail viewer for raw error messages.
  - Integrate `EmptyState` component for zero job history.
- **Dependencies**: Phase 5.1, 5.2.
- **Risks**: Real-time progress bar polling flickers.
- **Regression Concerns**: Resume and cancel server function calls (`cancelJob`, `listJobs`) must remain untouched.
- **Verification Method**: `npm test`, verify job progress runner behavior.

---

### Phase 5.7 — Email Verification
- **Files/Components Affected**:
  - `src/routes/_authenticated/verification.tsx`
  - `src/routes/_authenticated/verification-history.tsx`
- **Exact UI Improvements**:
  - Refactor verification view to use clear tabbed layout (Single Email Verification vs Bulk List Verification).
  - Add `Skeleton` loading state to `/verification-history` query fetching.
  - Standardize status badge colors and confidence indicators across single check results and history table rows.
  - Add `EmptyState` for empty verification logs.
- **Dependencies**: Phase 5.1, 5.2.
- **Risks**: Textarea parsing errors during bulk submission.
- **Regression Concerns**: Email verifier service integration and DNS/SMTP fallback rules MUST NOT be changed.
- **Verification Method**: `npm test`, verify single and bulk verification execution.

---

### Phase 5.8 — Settings
- **Files/Components Affected**:
  - `src/routes/_authenticated/settings.tsx`
  - `src/components/admin-settings-panel.tsx`
  - `src/components/extension-connection.tsx`
- **Exact UI Improvements**:
  - Refactor `AdminSettingsPanel` from hardcoded Tailwind Slate/Indigo palette to design system OKLCH tokens (`bg-card`, `text-foreground`, `border-border`, `text-primary`).
  - Standardize form controls, toggle switches, and save buttons across setting cards.
  - Enhance `ExtensionConnection` card visual feedback and diagnostic accordion formatting.
- **Dependencies**: Phase 5.1, 5.2.
- **Risks**: Admin privilege check rendering bugs for non-admin users.
- **Regression Concerns**: `checkIsAdmin`, `getAdminSettingsData`, and `updateAdminSetting` server functions must remain intact. Extension connection bridge messaging MUST remain FROZEN.
- **Verification Method**: `npm test`, verify admin and non-admin settings rendering.

---

### Phase 5.9 — Global UX States
- **Files/Components Affected**:
  - `src/components/ui/sonner.tsx`
  - `src/components/empty-state.tsx`
  - `src/components/job-progress.tsx`
- **Exact UI Improvements**:
  - Standardize toast notification duration (4s default), position (bottom-right), icons, and dismiss buttons.
  - Ensure contextual loading skeletons replace generic spinner text across all data tables and lists.
  - Enforce clear empty state messaging across all main routes (what is empty, why, and what to do next).
- **Dependencies**: Phases 5.1 through 5.8.
- **Risks**: Over-notifying on background query refetches.
- **Regression Concerns**: Toast notification API must be consistent (`toast.success`, `toast.error`).
- **Verification Method**: Automated and manual toast and empty state verification.

---

### Phase 5.10 — Responsive & Accessibility
- **Files/Components Affected**:
  - `src/components/app-shell.tsx`
  - `src/routes/_authenticated/leads.index.tsx`
  - `src/routes/_authenticated/finder.tsx`
  - `src/routes/_authenticated/verification.tsx`
- **Exact UI Improvements**:
  - Test and optimize layouts across breakpoints: 1440px+, 1280px, 1024px, 768px, 430px, 390px.
  - Implement mobile filter drawer for `/leads` to prevent filter grid from overwhelming mobile screens.
  - Add visible focus rings (`focus-visible:ring-2`), ARIA labels for icon buttons, and color contrast compliance across dark/light modes.
- **Dependencies**: Phases 5.1 through 5.9.
- **Risks**: Mobile touch target overlaps.
- **Regression Concerns**: Table features must remain usable on mobile devices.
- **Verification Method**: Mobile viewport testing and keyboard navigation testing.

---

### Phase 5.11 — Final Regression & Quality Gate
- **Files/Components Affected**: Entire application codebase & documentation.
- **Exact UI Improvements**:
  - Execute full automated test suite (`npm test`).
  - Execute project consistency check (`npm run check:consistency`).
  - Execute production bundle build (`npm run build`).
  - Verify Chrome Extension discovery and CSV export parity.
  - Update `docs/CHANGELOG.md` with complete Phase 5 UI polish notes.
- **Dependencies**: All previous phases.
- **Risks**: Unexpected build warnings or type errors.
- **Regression Concerns**: All 116 existing unit tests must pass cleanly.
- **Verification Method**: `npm test`, `npm run check:consistency`, `npm run build`.
