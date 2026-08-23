# Sales Intel Web Application UI/UX Audit

**Date**: August 19, 2026  
**Status**: Completed Baseline Audit (v1.0.16)  
**Scope**: Entire Web Application (`src/`)  
**Rules & Contracts**: Pure Read-Only Audit. Zero application code modified during this phase. Chrome Extension v1.0.16 & database schema strictly preserved.

---

## 1. Current Application UI Architecture

- **UI Framework & Routing**: React 19 + TanStack Router (`@tanstack/react-router`) with file-based routing (`src/routes/_authenticated/`).
- **Styling System**: Tailwind CSS v4 (`@tailwindcss/vite`) + Vanilla CSS custom variables (`src/styles.css`) utilizing OKLCH color spaces.
- **Component Primitives**: Radix UI primitive wrappers styled with `class-variance-authority` and `tailwind-merge` located in `src/components/ui/`.
- **Icons & Visual Assets**: `lucide-react` vector icons.
- **Toasts & Feedback**: `sonner` toast notification manager (`src/components/ui/sonner.tsx`).
- **Server Communication**: TanStack Start server functions (`useServerFn`) with TanStack Query (`@tanstack/react-query`) for client state management.

---

## 2. Page-by-Page Inventory

### 1. Auth Page (`src/routes/auth.tsx`)
- **Purpose**: Authenticate users via email/password sign-in or registration.
- **Current UI**: Centered card layout with tabs for Login and Sign Up.
- **Observations**: Functional and clean, but uses hardcoded form styles rather than standardized Shadcn Form field components.

### 2. Reset Password (`src/routes/reset-password.tsx`)
- **Purpose**: Allow users to update their password from a reset link.
- **Current UI**: Centered single-card form.
- **Observations**: Functional; clean loading and success message states.

### 3. Dashboard (`src/routes/_authenticated/dashboard.tsx`)
- **Purpose**: High-level sales pipeline metrics, recent discovery jobs, and lead breakdowns.
- **Current UI**: Grid of KPI cards (`StatCard`), breakdown lists, and a recent jobs list.
- **Observations**: Clean layout, but lacks visual hierarchy between key metrics (Total Leads vs Invalid Emails). Recent jobs list uses standard `<li>` elements without direct navigation links to job details.

### 4. Lead Finder (`src/routes/_authenticated/finder.tsx`)
- **Purpose**: Search for businesses by query, location, and parameters via scraper or Chrome Extension.
- **Current UI**: 2-column layout with search parameters on the left and provider selection on the right.
- **Observations**: Effective form layout, but provider selection warning cards use inline yellow background styles (`bg-warning/10`) that clash with dark mode. Navigation button back to `/leads` uses non-standard route options.

### 5. Leads Table (`src/routes/_authenticated/leads.index.tsx`)
- **Purpose**: Primary repository view for searching, filtering, bulk verifying, deleting, and exporting leads.
- **Current UI**: Top multi-input filter grid, secondary toggle filters, floating batch action bar, full-width HTML table, pagination controls.
- **Observations**: Core workhorse screen. Primary export buttons lack clear hierarchy distinction. Destructive action uses native `window.confirm()` instead of Radix `AlertDialog`. Column headers lack visual sort icons.

### 6. Lead Detail View (`src/routes/_authenticated/leads.$id.tsx`)
- **Purpose**: 360-degree view of a company profile, sales signals, verification history, and audit log.
- **Current UI**: 2-column layout with company metadata cards on left and provenance/history timeline on right.
- **Observations**: Rich data layout. Website and social links are clear. Could benefit from clear visual sections and status badge standardization.

### 7. Background Jobs (`src/routes/_authenticated/jobs.tsx`)
- **Purpose**: Queue monitor for discovery, import, and verification background tasks.
- **Current UI**: List of job cards showing progress bars, counter breakdowns, and control buttons (Resume/Cancel).
- **Observations**: Information is accurate. Missing skeleton loading state when query is initializing. Technical error text displays raw string without expandable formatting.

### 8. Email Verification (`src/routes/_authenticated/verification.tsx`)
- **Purpose**: Perform single email deliverability lookup or bulk list verification.
- **Current UI**: 2-column layout with single check form and bulk textarea on left; provider status on right.
- **Observations**: Clear breakdown of syntax/MX/SMTP checks. Bulk textarea lacks drag-and-drop file support. Status badges are consistent.

### 9. Verification History (`src/routes/_authenticated/verification-history.tsx`)
- **Purpose**: Log view of all historical email verifications executed across the system.
- **Current UI**: Filter bar (search, status) + HTML table with CSV export button.
- **Observations**: Effective tabular display. Missing Skeleton loading states while filtering.

### 10. Import Leads (`src/routes/_authenticated/import.tsx`)
- **Purpose**: Drag-and-drop CSV upload, header mapping, 5-row preview, and deduplicated database batch import.
- **Current UI**: Dotted upload zone, dropdown mapping grid, table preview, and execution button.
- **Observations**: Reliable workflow. Preview table lacks responsive scrolling container padding.

### 11. Settings (`src/routes/_authenticated/settings.tsx`)
- **Purpose**: Account management, provider configurations, Chrome Extension bridge controls, admin controls.
- **Current UI**: Grid of cards containing account info, usage counters, `ExtensionConnection`, `AdminSettingsPanel`, and data providers list.
- **Observations**: Fragmented styling due to `AdminSettingsPanel` using inline Tailwind v3 slate/indigo colors instead of design system tokens.

### 12. Documentation (`src/routes/_authenticated/documentation.tsx`)
- **Purpose**: Render system documentation directly inside the application shell.
- **Current UI**: Tabbed markdown reader.
- **Observations**: Clean rendering and readable typography.

---

## 3. Shared Component Inventory

- `AppShell` (`src/components/app-shell.tsx`): Main navigation wrapper with sidebar, header, and mobile nav.
- `AdminSettingsPanel` (`src/components/admin-settings-panel.tsx`): Restricted admin tabbed configuration panel.
- `ExtensionConnection` (`src/components/extension-connection.tsx`): Connection bridge card with diagnostic accordion.
- `JobProgressPanel` (`src/components/job-progress.tsx`): Shared real-time progress bar for background jobs.
- `LocationPicker` (`src/components/location-picker.tsx`): Cascading Country/State/City selector powered by `country-state-city`.
- `SourceBadge` (`src/components/source-badge.tsx`): Badge displaying lead origin (Google Maps, CSV, Scraper).
- `StatCard` & `BreakdownList` (`src/components/stat-card.tsx`): Dashboard metric card and horizontal breakdown bar.
- `StatusBadge` / `EmailStatusBadge` / `JobStatusBadge` (`src/components/status-badge.tsx`): Color-coded semantic status chips.
- `EmptyState` (`src/components/empty-state.tsx`): Visual placeholder card with icon, title, description, and action.
- UI Primitives (`src/components/ui/*.tsx`): 46 Shadcn/Radix components (Button, Input, Select, Dialog, Table, Skeleton, etc.).

---

## 4. Current Design/Token System

- **Token Storage**: `src/styles.css` defines OKLCH color variables for light (`:root`) and dark (`.dark`) modes.
- **Semantic Colors**: `--primary` (blue/indigo), `--secondary`, `--muted`, `--accent`, `--destructive` (red), `--success` (green), `--warning` (amber), `--info` (cyan), `--sidebar` (slate/navy).
- **Fonts**: `--font-sans` (`DM Sans`), `--font-display` (`Space Grotesk`).
- **Gaps**: `AdminSettingsPanel` bypasses OKLCH design tokens by utilizing hardcoded Tailwind Slate (`slate-100`, `slate-900`) and Indigo (`indigo-600`) utility classes, causing dark mode breakage and visual inconsistency.

---

## 5. Navigation Audit

- **Current Structure**: Sidebar divides routes into 4 groups:
  - **Overview**: Dashboard
  - **Leads**: Find Leads, Leads, Import
  - **Email**: Email Verification, Verification History
  - **System**: Jobs, Documentation, Settings
- **Problems**:
  - The grouping does not mirror the user's natural workflow (Discover → Review → Import → Manage → Verify → Jobs → Settings).
  - Mobile navigation displays a horizontally scrolling strip of small text pills without icons or section dividers.

---

## 6. Typography Audit

- **Headings**: Use `Space Grotesk` (`font-display`) with `-0.015em` letter spacing.
- **Body**: Uses `DM Sans` (`font-sans`) with default line-heights.
- **Inconsistencies**: Page titles in `AppShell` header use `text-lg font-semibold`, while sub-pages sometimes repeat `<h1>` or `<h2>` titles with varying font sizes (`text-xl font-bold`, `text-sm font-semibold`), violating heading hierarchy.

---

## 7. Color / Status Audit

- **Semantic Color Tokens**:
  - Green (`--success`): Valid email, connected extension, completed job, configured provider.
  - Amber (`--warning`): Risky email, pending/queued job, unconfigured provider, installed-not-connected extension.
  - Red (`--destructive`): Invalid email, failed job, connection error, unconfigured warning.
  - Gray (`--muted`): Unverified/unknown email, not installed extension, cancelled job.
- **Findings**: Email status badges align well, but warning banners in `finder.tsx` and `admin-settings-panel.tsx` use mismatched background opacities and raw tailwind colors (`bg-amber-500/10`).

---

## 8. Button & Action Hierarchy Audit

- **Primary Actions**: Solid primary fill (`Button` default variant).
- **Secondary Actions**: `variant="outline"` or `variant="secondary"`.
- **Ghost Actions**: `variant="ghost"`.
- **Destructive Actions**: Missing dedicated `variant="destructive"` usage in bulk deletion bar on `/leads` (currently uses `variant="outline"` with a trash icon).
- **Inconsistencies**: Header action buttons on `/leads` feature two side-by-side outline buttons ("Export filtered" and "Export selected") without indicating which is the primary workflow action.

---

## 9. Form & Input Audit

- Form fields across `/finder`, `/verification`, and `/import` use Shadcn `Input`, `Textarea`, and `Select`.
- **Gaps**:
  - `Textarea` elements lack standardized resize rules and character count hints.
  - `Checkbox` labels are wrapped in native `<label>` tags with manual flex styles instead of accessible `FormLabel` / `Label` primitives with focus indicators.

---

## 10. Table Audit

- Tables on `/leads`, `/verification-history`, and `/import` use native HTML `<table>` with standard Tailwind classes.
- **Gaps**:
  - Column headers lack sort direction arrows (`ArrowUp`, `ArrowDown`, `ArrowUpDown`).
  - Rows use simple hover background transitions (`hover:bg-secondary/40`), but lack selected-row background highlights.
  - No mobile card transformation for screens under 768px (tables overflow horizontally with standard scrollbars).

---

## 11. Loading-State Audit

- **Good**: `/dashboard` and `/leads` implement grid and table row `Skeleton` components during initial query loading.
- **Gaps**:
  - `/jobs`, `/verification-history`, and `AdminSettingsPanel` show plain text strings ("Loading administration controls...") or empty spaces while fetching, causing layout shifts.

---

## 12. Empty-State Audit

- **Good**: `EmptyState` component exists in `src/components/empty-state.tsx`.
- **Gaps**:
  - Almost no page uses `EmptyState`. Pages render generic muted paragraphs:
    - `/jobs`: `<p className="...">No jobs yet.</p>`
    - `/leads`: `<td colSpan={8}>No leads match these filters yet.</td>`
    - `/verification-history`: `<td colSpan={7}>No verification results yet.</td>`

---

## 13. Error-State Audit

- **Good**: `Sonner` toasts notify on API failures.
- **Gaps**:
  - Job runner errors and provider errors render raw text strings directly on screen without an option to copy details or expand technical stack traces.

---

## 14. Success & Notification Audit

- Standardized on `sonner` toasts with `toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()`.
- **Gaps**: Toast durations and dismiss buttons are not explicitly configured in `src/components/ui/sonner.tsx`.

---

## 15. Responsive / Mobile Audit

- **Desktop (1280px+)**: Layouts render cleanly in 2-column or full-width grids.
- **Tablet / Mobile (<1024px)**:
  - Sidebar hides automatically.
  - Header actions overflow or wrap onto multiple lines.
  - Tables rely on horizontal overflow scrolling without mobile card transformations.
  - Top filter grid on `/leads` stacks into 6 vertical input boxes, taking up the entire mobile viewport before reaching data.

---

## 16. Accessibility Audit

- **Focus States**: Default browser outline rings are present on inputs, but custom button tabs and checkbox wrappers lack clear visible focus rings (`focus-visible:ring-2`).
- **Semantics**: Tables use standard `<th>` and `<td>`. Dialogs use Radix primitives with `aria-describedby`.
- **Gaps**: Interactive iconography buttons (e.g. refresh buttons, sort toggles) lack `aria-label` tags.

---

## 17. Terminology & UX Consistency Audit

- Terminology is largely synchronized: "Discovered", "Imported", "Verified", "Jobs", "Providers".
- Slight variation: `/finder` uses "Find leads" vs `/dashboard` using "Lead Finder" vs Sidebar "Find Leads".

---

## 18. Duplicate & Confusing Action Audit

- CSV Export options appear in header of `/leads`, bottom action bar of `/leads`, `/verification-history`, and `/import`.
- Bulk Delete on `/leads` uses native browser alert dialog `window.confirm()`.

---

## 19. Visual Inconsistencies

1. `AdminSettingsPanel` uses Slate/Indigo hardcoded color palette (`bg-slate-50`, `text-indigo-600`, `dark:bg-slate-900`) overriding CSS design system variables.
2. Sidebar brand header uses hardcoded font style `font-[family-name:var(--font-display)]` instead of `font-display` utility class.
3. Card borders and padding vary between `p-4`, `p-5`, and `p-6` across sub-pages without standard layout tokens.

---

## 20. UX Problems Ranked by Severity

### Priority 0 (P0) — Core Workflow / TypeScript Route Mismatch
1. **Location**: `src/routes/_authenticated/finder.tsx:139` and `src/routes/_authenticated/leads.$id.tsx:89`
   - **Current Behavior**: `Button asChild` renders TanStack Router `Link to="/leads"` without required `search` params object.
   - **Problem**: Causes route type mismatches and console navigation warnings when navigating to `/leads`.
   - **Recommended Improvement**: Supply standard search parameters or use explicit route navigation helper.
   - **Priority**: P0 (Functionality / Routing).

### Priority 1 (P1) — Major Usability & Visual Architecture Issues
2. **Location**: `src/components/admin-settings-panel.tsx`
   - **Current Behavior**: Uses hardcoded Tailwind Slate and Indigo color classes.
   - **Problem**: Breaks dark mode support, ignores theme custom properties, causes stark visual contrast against the rest of Settings.
   - **Recommended Improvement**: Refactor component to use standard semantic CSS tokens (`bg-card`, `text-foreground`, `border-border`, `text-primary`, `bg-primary`).
   - **Priority**: P1 (Presentation / Dark Mode).

3. **Location**: `src/components/app-shell.tsx` (Navigation Grouping & Mobile Shell)
   - **Current Behavior**: Nav groups categorized as Overview, Leads, Email, System. Mobile view displays overflow text links without icons.
   - **Problem**: Sub-optimal grouping; mobile navigation lacks drawer structure and proper touch targets.
   - **Recommended Improvement**: Reorganize nav groups to match natural pipeline (SALES INTEL, LEADS, VERIFICATION, OPERATIONS, SYSTEM) and polish mobile navigation bar.
   - **Priority**: P1 (Usability / Navigation).

4. **Location**: `src/routes/_authenticated/leads.index.tsx:199`
   - **Current Behavior**: `removeSelected()` uses native browser `confirm()`.
   - **Problem**: Inconsistent UX; native browser popups block UI thread and look unstyled.
   - **Recommended Improvement**: Replace with standard Radix `AlertDialog` component (`src/components/ui/alert-dialog.tsx`).
   - **Priority**: P1 (Usability / Consistency).

5. **Location**: `src/routes/_authenticated/leads.index.tsx` (Table Visual Hierarchy)
   - **Current Behavior**: All table cell text rendered with similar visual weight. Column headers lack sort indicators.
   - **Problem**: Difficult to scan lead data quickly on dense datatables.
   - **Recommended Improvement**: Add sort indicator icons to active headers, highlight company names, format dates with compact badges, and add row hover/selection highlight states.
   - **Priority**: P1 (Usability / Data Orientation).

6. **Location**: `src/routes/_authenticated/jobs.tsx` & `src/routes/_authenticated/verification-history.tsx`
   - **Current Behavior**: Displays raw text or empty views while queries load.
   - **Problem**: Unexpected layout jumps and unpolished loading feel.
   - **Recommended Improvement**: Add `Skeleton` loading components matching table and list structures.
   - **Priority**: P1 (Usability / Feedback).

### Priority 2 (P2) — Noticeable Polish & Component Standardization Issues
7. **Location**: `src/routes/_authenticated/dashboard.tsx`, `jobs.tsx`, `leads.index.tsx`, `verification-history.tsx`
   - **Current Behavior**: Raw text paragraphs used for empty data states.
   - **Problem**: Inconsistent empty states across views.
   - **Recommended Improvement**: Standardize on `EmptyState` component with custom icons, descriptive messages, and primary action buttons.
   - **Priority**: P2 (Presentation / UX Polish).

8. **Location**: `src/routes/_authenticated/leads.index.tsx` (Filter Layout)
   - **Current Behavior**: Filter bar uses 6 input boxes in a rigid grid.
   - **Problem**: On tablet and mobile viewports, filters take up the entire screen height before any table rows are visible.
   - **Recommended Improvement**: Create a collapsible filter drawer/bar for mobile and refine desktop grid spacing.
   - **Priority**: P2 (Responsive / Mobile UX).

9. **Location**: `src/routes/_authenticated/verification.tsx` (Single & Bulk Verification)
   - **Current Behavior**: Single verification form and bulk verification are stacked vertically in single cards without visual separation.
   - **Problem**: User confusion between single email check and bulk list verification workflows.
   - **Recommended Improvement**: Introduce clean tabbed interface (Single Check vs Bulk List Verification).
   - **Priority**: P2 (Usability / Workflow).

10. **Location**: `src/components/ui/sonner.tsx` & Global Toasts
    - **Current Behavior**: Toasts rely on default auto-dismiss timeouts without clear placement or action styling.
    - **Problem**: Toast notifications can obscure action buttons or disappear too quickly on long error messages.
    - **Recommended Improvement**: Standardize toast duration, rich colors, and close button behavior.
    - **Priority**: P2 (Usability / Feedback).

### Priority 3 (P3) — Minor Cosmetic & Accessibility Issues
11. **Location**: `src/routes/_authenticated/leads.$id.tsx` (Lead Details Formatting)
    - **Current Behavior**: Detail cards use small text headings without visual section dividers.
    - **Problem**: Lead details page feels cramped.
    - **Recommended Improvement**: Polish spacing, add category icons, and standardize field labels.
    - **Priority**: P3 (Cosmetic).

12. **Location**: `src/components/location-picker.tsx` & Form Controls
    - **Current Behavior**: Select dropdowns and inputs lack consistent focus ring styles and helper text alignment.
    - **Problem**: Minor visual alignment variations across forms.
    - **Recommended Improvement**: Standardize input focus rings and label typography tokens across all forms.
    - **Priority**: P3 (Cosmetic / Accessibility).
