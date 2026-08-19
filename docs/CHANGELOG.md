# Product & Architecture Changelog

All notable changes to the Sales Intel codebase and architecture will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.16] - 2026-08-19

### Changed & Fixed — Chrome Extension Import UX Polish & Action Disambiguation
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
