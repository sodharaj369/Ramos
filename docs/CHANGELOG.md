# Product & Architecture Changelog

All notable changes to the Sales Intel codebase and architecture will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.16] - 2026-08-19

### Added & Improved — Phase 5.8 Settings UI/UX Audit & Production Polish
- **Read-Only Audit Document**:
  - Published [`docs/SETTINGS_UI_UX_AUDIT.md`](file:///d:/Sales-Intel/docs/SETTINGS_UI_UX_AUDIT.md) detailing all 16 runtime setting keys, categories, value types, secrets hygiene, P0/P1/P2 issues, and preserved RLS security guarantees.
- **Administration Console Overhaul & OKLCH Design Tokens**:
  - Redesigned [`src/components/admin-settings-panel.tsx`](file:///d:/Sales-Intel/src/components/admin-settings-panel.tsx) using OKLCH semantic design system tokens (`bg-card`, `border-border`, `text-foreground`, `bg-primary`), replacing hardcoded Tailwind color classes.
- **Member Settings & Admin System Configuration Separation**:
  - Separated Member Settings (`/settings`) from Admin System Configuration (`/settings/system`).
  - `/settings` is now a clean member-focused page showing Account, Extension status, Data Providers, and Capabilities. All admin banners, read-only cards, and disabled admin controls are removed.
  - Created dedicated route `/settings/system` (`src/routes/_authenticated/settings.system.tsx`) for the Admin System Configuration console. Members attempting direct access are redirected to `/settings`.
  - Added an `ADMINISTRATION` sidebar navigation entry (**System Configuration**) rendered exclusively for administrator roles in `AppShell`.
  - Restored strict server-side authorization checks (`verifyAdminRole`) on all admin server functions (`getAdminSettingsData`, `getAdminSettingsHistoryData`, `updateAdminSetting`).
- **Edit/Save UX & Cancel State Model**:
  - Implemented card-level dirty state tracking (`Idle` → `Modified` → `Saving...` → `Saved ✓`) with a `Cancel` button allowing admins to revert unpersisted edits.
- **Secrets Presentation & Security Framing**:
  - Framed server secrets with masked value badges (`••••••••••••••••`), status indicators (`Configured ✓` / `Not configured`), and explicit read-only explanatory text.
- **Audit History Formatting & Access Control**:
  - Formatted audit trail value changes (`5 → 10`, `OFF → ON`, secret status) and displayed clean read-only notice when audit history is restricted for member roles.
- **High-Impact Setting Confirmation**:
  - Integrated `AlertDialog` confirmation for disabling core feature flags and global verification toggles.
- **Skeleton Loading & Layout Stability**:
  - Standardized skeleton loading state across `/settings` page sections to eliminate layout shifts during query fetching.
- **Segmented Workflow Switcher (Single vs Bulk Verification)**:
  - Redesigned [`src/routes/_authenticated/verification.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/verification.tsx) using a top Radix `Tabs` segmented control (`Single Verification` vs `Bulk Verification`).
- **Single Verification Workspace & Evidence Banners**:
  - Implemented high-contrast deliverability result banners (`CheckCircle2` for Valid, `XCircle` for Invalid, `AlertTriangle` for Risky, `HelpCircle` for Unknown) with confidence score meters (`Confidence: 98%`), clear status assignment reason paragraphs, and structured validation check rows (Syntax, DNS, MX, SMTP, Disposable, Role, Catch-all).
- **Bulk Verification Workspace & Real-time Parser**:
  - Created a dedicated bulk text area workspace featuring a real-time unique email parser badge (`14 unique email(s) detected`) and progress tracking via `JobProgressPanel`.
- **Provider Settings & Health Alerts**:
  - Surfaced provider selection dropdown, provider configuration hints, and verifier service health alerts in the right sidebar.
- **Job Status Hierarchy & Operational Cards**:
  - Redesigned [`src/routes/_authenticated/jobs.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/jobs.tsx) into a mobile-friendly job card queue with clear visual status indicators (`JobStatusBadge`), progress percentage bars, and `processed / total` item counters.
  - Added expandable technical details panel for inspectable job metadata (Job ID, timestamps, status) and metric counter chips (`New leads`, `Enriched`, `Duplicates`, `Invalid`, etc.).
- **Cancellation Safety & Error Presentation**:
  - Replaced immediate cancel with a Radix `AlertDialog` (`AlertDialogContent`, `AlertDialogAction`), ensuring users confirm job cancellation without risking accidental cancellation.
  - Surfaced execution errors in high-contrast alert boxes (`AlertTriangle` icon with clear failure message).
- **Auto-Sync Indicator & Empty/Loading Polish**:
  - Integrated a 15s auto-sync polling indicator in the header bar with manual `Refresh queue` action.
  - Integrated 4-card Skeleton loading state and `EmptyState` component for empty job queue states.
- **2-Column CRM Profile Layout**:
  - Redesigned [`src/routes/_authenticated/leads.$id.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.$id.tsx) into a structured 2-column CRM detail layout (2/3 Main Profile + 1/3 Right Sidebar).
  - Main Column features **Company Overview**, formatted **Action & Social Links** (Contact Page, Booking, Ordering, Social Chips), **Email Verification History**, and a chronological **Lead Activity Timeline**.
- **Contactability & Provenance Sidebar**:
  - Sidebar surfaces explicit Contact & Deliverability fields with `mailto:`, `tel:`, `target="_blank"` website links, and an automated `Open in Google Maps` query button.
  - Exposes complete Lead Provenance (Discovery Source, Owner, Created/Imported dates, Source URL link).
- **Empty & Loading State Polish**:
  - Added multi-card Skeleton loading state, graceful missing data fallback strings ("Email not available", "No rating recorded"), and `EmptyState` components for 0-verification or 0-activity states.
- **Sort Column Indicators & Toggle Logic**:
  - Implemented interactive table sort headers in [`src/routes/_authenticated/leads.index.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.index.tsx) with directional arrows (`ArrowUp` for ASC, `ArrowDown` for DESC, `ArrowUpDown` for inactive), allowing single-click column sorting on Company, City, Email Status, and Discovered Date while preserving URL search params.
- **Responsive Filter Bar & Mobile Sheet Drawer**:
  - Refactored desktop filter inputs into a compact 6-column grid with clear search reset buttons and a dynamic active filter count badge (`Clear filters (3)`).
  - Added a mobile/tablet filter drawer via Radix Sheet (`Sheet`), preventing responsive layout collapse on small screens.
- **Contextual Bulk Action Bar & Radix AlertDialog Delete UX**:
  - Implemented a high-contrast bulk action toolbar appearing when rows are selected (`${selected.length} lead(s) selected`), featuring `Verify emails`, `Export selected`, and `Delete` actions.
  - Replaced native `window.confirm()` with a Radix `AlertDialog` (`AlertDialogContent`, `AlertDialogAction`), detailing permanent lead deletion and owner permissions safely.
- **Table Visual Hierarchy & Empty/Loading States**:
  - Enhanced company typography (`font-display font-semibold`) over secondary location/contact metadata.
  - Differentiated zero database leads vs zero filtered leads using targeted `EmptyState` components.
  - Added 8-row table skeleton loading representations for layout stability.
- **Operational Hierarchy & Information Architecture**:
  - Redesigned [`src/routes/_authenticated/dashboard.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/dashboard.tsx) into a structured operational pipeline overview.
  - Added Actionable Attention Alert header for surfacing failed background jobs requiring review with direct action links to `/jobs`.
  - Refactored 8 KPI cards across 2 logical rows (Core Pipeline Metrics & Deliverability/Contactability Breakdown) using Phase 5.1 design tokens.
- **Pipeline Quick Actions & Work Area**:
  - Added a compact Quick Actions Bar providing direct one-click navigation to primary workflows (`Find Leads`, `Manage Leads`, `Verify Emails`, `Monitor Jobs`).
  - Added **Recent Leads Preview Table** (2/3 width) powered by `listLeads` with `EmptyState` integration and skeleton row loading.
  - Added **Recent Background Jobs Queue** (1/3 width) powered by `listJobs` with `JobStatusBadge` indicators and `EmptyState` integration.
- **Shared Metric Components**:
  - Polished [`src/components/stat-card.tsx`](file:///d:/Sales-Intel/src/components/stat-card.tsx) (`StatCard` and `BreakdownList`) with OKLCH token bindings, icon badge containers, font-display metric numbers, and smooth progress bars.
- **Workflow-Aligned Navigation Structure**:
  - Reorganized sidebar navigation in [`src/components/app-shell.tsx`](file:///d:/Sales-Intel/src/components/app-shell.tsx) into clear conceptual pipeline groups:
    - **SALES INTEL**: Dashboard (`/dashboard`)
    - **LEADS**: Find Leads (`/finder`), Leads (`/leads`), Import (`/import`)
    - **VERIFICATION**: Email Verification (`/verification`), Verification History (`/verification-history`)
    - **OPERATIONS**: Jobs (`/jobs`)
    - **SYSTEM**: Settings (`/settings`), Documentation (`/documentation`)
- **Mobile Navigation Drawer Upgrade**:
  - Replaced the mobile text pill strip with a responsive, touch-friendly Radix Sheet drawer (`side="left"`), featuring brand branding, full icon-driven navigation grouping, route active state highlighting, and automatic auto-close on navigation.
- **SaaS Header & Extension Indicator Integration**:
  - Added a compact Chrome Extension connection badge in the header via `useExtensionBridge()`, displaying a real-time green pulsing dot when connected or a direct link to Settings when disconnected.
  - Refactored user account area and sign-out button with clear visual hierarchy and accessibility labels.
- **P0 Router Link Type Mismatches Resolved**:
  - Fixed optional search parameter typing in [`src/routes/_authenticated/leads.index.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.index.tsx#L27-L42) (`LeadSearchSchema`), resolving TypeScript route parameter mismatches for `/leads` navigation links in [`src/routes/_authenticated/finder.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/finder.tsx#L135-L142) and [`src/routes/_authenticated/leads.$id.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.$id.tsx#L85-L95).
- **Standardized Status Badge Semantics**:
  - Refactored [`src/components/status-badge.tsx`](file:///d:/Sales-Intel/src/components/status-badge.tsx) with semantic color mapping (Green: valid/connected/completed/ready; Amber: risky/pending/warning/partial/unconfigured; Red: invalid/failed/error/disconnected; Gray: unknown/unverified/disabled).
  - Added export for reusable `SemanticStatusBadge` component while preserving 100% backward compatibility for `EmailStatusBadge` and `JobStatusBadge`.
- **Enhanced EmptyState Component**:
  - Updated [`src/components/empty-state.tsx`](file:///d:/Sales-Intel/src/components/empty-state.tsx) with responsive typography, `heading` alias, and `secondaryAction` support.
- **Shared Design Primitives Standardized**:
  - Refactored focus-visible rings, OKLCH color token bindings, shadow tokens, and border styles across `button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `sonner.tsx`, and `styles.css`.
  - Configured global toast defaults in [`src/components/ui/sonner.tsx`](file:///d:/Sales-Intel/src/components/ui/sonner.tsx) (`position="bottom-right"`, `richColors`, `duration={4000}`, `closeButton`).
- **Action Separation ("Run Discovery" vs. "Import")**:
  - Renamed upper extraction button (`#extractBtn` in Search Result Cards) from `"Import to Sales Intel"` to **`"Run Discovery Again"`** (or `"Run Discovery"`), eliminating user confusion between extraction and database ingestion.
  - Designated lower button (`#importBackendBtn` in Summary Card) as the **EXACTLY ONE** action responsible for sending discovered leads to Sales Intel.
- **Dynamic In-Progress State & Spinner**:
  - On click, `#importBackendBtn` **synchronously** locks local double-submit protection (`isLocalImportLocked = true`), disables the button, and renders a rotating 12px CSS spinner with dynamic count (`<span class="spinner"></span> IMPORTING 5 LEADS...`) before sending background requests.
  - Handles all exit paths (Success, HTTP 400/500, 401 Session Expiry, Network Error, Exceptions) cleanly without leaving the button locked or stuck.
- **In-Popup Result Component (Native `alert()` Removal)**:
  - Completely removed modal browser `alert()` calls from post-import callback execution paths.
  - Integrated outcome-aware persistent status banner (`#importBanner`) inside summary card:
    - **Created Only**: `✓ IMPORT COMPLETED` — `5 leads added to Sales Intel`.
    - **Created + Merged**: `✓ IMPORT COMPLETED` — `5 leads added/enriched to Sales Intel`.
    - **Duplicate Only**: `✓ IMPORT CHECKED` — `All 5 leads were already in Sales Intel`.
    - **Partial Failure**: `⚠ IMPORT COMPLETED WITH ISSUES` — `4 leads added — 1 lead failed`.
    - **Complete Error / 401**: In-popup error banner (`#importErrorBanner` with `⚠ IMPORT FAILED`).
  - Added primary CTA button **`"VIEW X LEADS IN SALES INTEL"`** navigating directly to `${base}/leads`.

### Fixed & Added — Configuration Contract Audit & Label Column Synchronization
- **Database Schema Sync**:
  - Applied migration [`20260819130000_app_settings_label_and_schema_sync.sql`](file:///d:/Sales-Intel/supabase/migrations/20260819130000_app_settings_label_and_schema_sync.sql) to add `label` column (`TEXT NOT NULL DEFAULT ''`) to `public.app_settings`.
  - Populated human-readable canonical labels for all settings.
  - Seeded missing `discovery.chrome_extension_enabled` setting (16 total settings).
- **Targeted Server-Side Updates**:
  - Updated `updateAppSetting` in [`src/lib/config/runtime-config.server.ts`](file:///d:/Sales-Intel/src/lib/config/runtime-config.server.ts) to execute targeted `.update({ value, updated_at, updated_by })` queries on existing settings, preserving `label`, `category`, `description`, `value_type`, `is_secret` 100%.
  - Added RLS mutation check: `.select()` verifies that non-admin member setting updates return 0 affected rows and throw an explicit `"Permission denied: Admin privileges required"` exception.
- **Runtime Enforcement**:
  - Wired `discovery.chrome_extension_enabled` into [`src/lib/extension-import.server.ts`](file:///d:/Sales-Intel/src/lib/extension-import.server.ts) and [`src/lib/jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts). Disabling the master toggle blocks browser extension discovery and batch ingestion.

### Changed — Truthful Runtime Configuration Enforcement (Phase 2B)
- **100% Runtime Enforcement**:
  - Wired all 15 settings in `public.app_settings` into actual server-side execution handlers:
    - Discovery Default & Max Limits (`discovery.default_limit` = 5, `discovery.max_limit` = 50): Enforced in `handleCreateDiscoveryJob` server handler.
    - Default Provider (`discovery.default_provider` = `"chrome-extension"`): Default discovery source fallback.
    - Scraper Job Timeout (`discovery.job_timeout_ms` = 360000): Polling deadline budget in `self-hosted-google-maps.server.ts`.
    - Retry Count (`discovery.retry_count` = 3): Max attempt budget in `withRetry()`.
    - Verification Timeout (`verification.timeout_ms` = 8000): Network timeout budget in `fetchWithTimeout()`.
    - Master Verification Toggle (`verification.enabled` = `true`): Server-side block on single/bulk verification when false.
    - Provider Toggles (`providers.self_hosted_gmaps_enabled`, `providers.aftership_smtp_enabled`, `providers.builtin_dns_enabled`): Dynamic `isConfigured()` evaluation & provider execution guards.
    - Feature Flags (`feature_flags.csv_export_enabled`, `feature_flags.bulk_verification_enabled`): Server-side action authorization checks on CSV export and bulk verification job creation.
- **Admin Panel Truthfulness**:
  - Added `ENFORCED` status badges to setting cards in [`src/components/admin-settings-panel.tsx`](file:///d:/Sales-Intel/src/components/admin-settings-panel.tsx).
- **Tests & Verification**:
  - Expanded unit test suite (`116 passed, 0 failed`).
