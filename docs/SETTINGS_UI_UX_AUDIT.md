# Comprehensive Settings UI/UX Audit Report

**Project**: Sales Intel (`sodharaj369/Sales-Intel`)  
**Target Scope**: `/settings` Route, `AppShell`, `AdminSettingsPanel`, and Runtime Configuration System  
**Audit Date**: 2026-08-19  
**Status**: READ-ONLY AUDIT COMPLETE (Phase 1)

---

## 1. Overview & Current Setting Model

The Sales Intel Settings experience manages centralized application runtime configuration, provider status, account details, extension connectivity, and audit logging. The backend runtime configuration system (`runtime-config.server.ts` & `admin.functions.ts`) is fully functional, enforcing server-side Zod validation, Supabase Row Level Security (RLS), and audit history tracking.

### Inventory of Existing Settings (16 DB Keys + 2 Virtual Secret Indicators)

| Setting Key | Label | Category | Value Type | Current / Default Value | Editable (Admin) | Read-Only (Member) | Secret / Masked |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `discovery.chrome_extension_enabled` | Chrome Extension Discovery Enabled | `discovery` | `boolean` | `true` | Yes | Read-Only | No |
| `discovery.default_limit` | Default Discovery Limit | `discovery` | `number` | `5` (1–200) | Yes | Read-Only | No |
| `discovery.max_limit` | Maximum Discovery Limit | `discovery` | `number` | `50` (1–500) | Yes | Read-Only | No |
| `discovery.default_provider` | Default Discovery Provider | `discovery` | `string` | `"chrome-extension"` | Yes | Read-Only | No |
| `discovery.job_timeout_ms` | Discovery Job Timeout (ms) | `discovery` | `number` | `360000` (5k–1.8M) | Yes | Read-Only | No |
| `discovery.retry_count` | Max Discovery Retries | `discovery` | `number` | `3` (0–10) | Yes | Read-Only | No |
| `import.batch_size` | Lead Import Batch Size | `import` | `number` | `50` (1–200) | Yes | Read-Only | No |
| `verification.default_verifier` | Default Email Verifier | `verification` | `string` | `"aftership-smtp"` | Yes | Read-Only | No |
| `verification.concurrency` | Verification Concurrency | `verification` | `number` | `3` (1–20) | Yes | Read-Only | No |
| `verification.timeout_ms` | Verification Timeout (ms) | `verification` | `number` | `8000` (1k–60k) | Yes | Read-Only | No |
| `verification.enabled` | Master Verification Switch | `verification` | `boolean` | `true` | Yes | Read-Only | No |
| `providers.self_hosted_gmaps_enabled` | Self-Hosted Google Maps Provider | `providers` | `boolean` | `true` | Yes | Read-Only | No |
| `providers.aftership_smtp_enabled` | AfterShip SMTP Verifier | `providers` | `boolean` | `true` | Yes | Read-Only | No |
| `providers.builtin_dns_enabled` | Built-in DNS Fallback Verifier | `providers` | `boolean` | `true` | Yes | Read-Only | No |
| `feature_flags.csv_export_enabled` | CSV Export Capability | `feature_flags` | `boolean` | `true` | Yes | Read-Only | No |
| `feature_flags.bulk_verification_enabled` | Bulk Verification Capability | `feature_flags` | `boolean` | `true` | Yes | Read-Only | No |
| `secrets.email_verifier_api_key` | Email Verifier API Key / Endpoint | `verification` | `secret` | `[MASKED]` | No (Status) | Read-Only | Yes |
| `secrets.gmaps_scraper_api_key` | Scraper API Key / Endpoint | `providers` | `secret` | `[MASKED]` | No (Status) | Read-Only | Yes |

---

## 2. Detailed Audit Findings

### P0 — Functional & Authorization Deficiencies

1. **Member Role Configuration Visibility Blocked**:
   - **Current Behavior**: When a user with the `member` role opens `/settings`, `AdminSettingsPanel` checks `checkIsAdmin()` and, finding `isAdmin === false`, renders *only* a warning box (`Administrator Privileges Required`). All category tabs, setting cards, values, and audit history are hidden.
   - **Required Behavior**: Members MUST be able to view system runtime configuration in a read-only state. The panel must display:
     *"Admin privileges required. You can view configuration, but only administrators can modify runtime settings."*
     All inputs must be disabled for members, while remaining visible for transparency.

2. **Inconsistent Category Hierarchy & Navigation**:
   - **Current Behavior**: Category tabs currently show `Discovery`, `Import`, `Verification`, `Providers`, `Feature Flags`, and `Audit Log`. "Secrets / Credentials" are split inside Providers and Verification tabs, and "Jobs" settings are grouped under "Import".
   - **Required Behavior**: Establish clean top-level categories:
     - **Discovery**
     - **Verification**
     - **Providers**
     - **Jobs** (combining import & job execution limits)
     - **Feature Flags**
     - **Secrets / Credentials** (dedicated view for server secret indicators)
     - **Audit History**

---

### P1 — User Experience & State Management Deficiencies

1. **Lack of Dirty/Modified State & Cancel Action**:
   - **Current Behavior**: When an admin edits a number or text input, local component state is mutated immediately without visual feedback distinguishing unmodified settings from modified/dirty settings. There is no `Cancel` or `Reset` button to revert to the last persisted value.
   - **Required Behavior**: Introduce a explicit card state model:
     `Idle (Persisted)` → `Editing / Modified (Dirty)` → `Saving...` → `Saved ✓`
     Provide a `Cancel` button alongside `Save` when a setting is modified, allowing the admin to easily revert edits before committing to the database.

2. **Static Status Badge Confusion**:
   - **Current Behavior**: The `ENFORCED` badge is statically rendered on setting cards regardless of whether the user has typed an un-saved value in the input field.
   - **Required Behavior**: Update status badges dynamically:
     - `ENFORCED` when setting matches persisted server state.
     - `MODIFIED` (Amber) when local draft changes exist.
     - `SAVING...` (Blue) during mutation.
     - `SAVED ✓` (Green) upon successful mutation.

3. **Unformatted Raw Error Toasts**:
   - **Current Behavior**: Errors during updates display raw database or exception messages (e.g., `Failed to update setting discovery.default_limit: ...`) directly in toasts.
   - **Required Behavior**: Catch and transform error messages into clean, actionable, human-readable feedback (e.g., *"Unable to save setting. Default limit cannot exceed maximum limit (50)."*).

4. **Secret Presentation Needs Standardized Visual Framing**:
   - **Current Behavior**: Virtual secrets render with standard input fields showing `[MASKED]`.
   - **Required Behavior**: Present secrets with explicit security framing:
     - Label: **Google Maps Scraper API Key**
     - Value: `••••••••••••••••`
     - Status Badge: `Configured ✓` or `Not configured`
     - Description: *"Credential is securely configured as a server-side secret and cannot be viewed here."*

5. **Audit History Raw JSON Formatting**:
   - **Current Behavior**: The configuration audit table renders raw strings such as `"true"`, `"5"`, and `"chrome-extension"`.
   - **Required Behavior**: Format audit values cleanly (e.g., `5 → 10`, `OFF → ON`), parse dates into readable timestamps, and format secret changes as `Configured`, `Updated`, or `Removed`.

---

### P2 — Visual, Theme & Accessibility Deficiencies

1. **Hardcoded Slate/Amber Styling**:
   - **Current Behavior**: Warning banners in `AdminSettingsPanel` use hardcoded Tailwind classes (`bg-amber-500/10`, `border-amber-500/30`).
   - **Required Behavior**: Migrate all color references to the OKLCH semantic design system (`border-warning/30`, `bg-warning/15`, `text-warning-foreground`, `bg-card`, `border-border`).

2. **Page-Level Skeleton Loading**:
   - **Current Behavior**: `/settings` sections (Account, Provider Usage, Data Providers, Capabilities) render text placeholders or blank states while fetching query data.
   - **Required Behavior**: Standardize skeleton loading placeholders across all sections on initial load to prevent layout shifting.

3. **Form Accessibility & Focus Rings**:
   - **Current Behavior**: Setting input fields use `aria-label` but lack explicit `<label>` element associations or visible keyboard focus ring styling.
   - **Required Behavior**: Attach accessible labels, provide visible `focus-visible:ring-2` indicators on all interactive controls, and ensure full keyboard navigation.

---

## 3. Good Existing Behaviors to Preserve

The following baseline behaviors are fully functional and MUST NOT be altered or refactored:

1. **Authoritative Server-Side Authorization**: `verifyAdminRole` strictly validates `has_role(_user_id, 'admin')` via Supabase RPC and server middleware.
2. **Schema Bounds & Zod Validation**: `settingValidationSchemas` strictly validates value types and range bounds (`default_limit` 1–200, `concurrency` 1–20).
3. **Cross-Setting Logic Rules**: Server-side checks enforce invariants (e.g., `default_limit` cannot exceed `max_limit`; verifiers cannot be set as default if disabled).
4. **Secret Isolation**: Secrets are strictly kept server-side; values are never sent to Vite bundles or client-visible state.
5. **Audit Trail Logging**: Every setting update automatically creates an immutable record in `settings_history` with actor IDs and timestamps.
6. **In-Memory Config Cache Invalidation**: `invalidateRuntimeConfigCache()` flushes TTL cache immediately on any setting update.
7. **High-Impact AlertDialog Confirmation**: Disabling core system toggles prompts an `AlertDialog` confirmation step before saving.

---

## 4. Phase 5.8 Implementation Strategy

1. **App Shell & Page Structure**:
   - Refactor `src/routes/_authenticated/settings.tsx` to establish a clear visual hierarchy with structured section headers and Skeleton loading.
2. **Admin Access Banner & Read-Only Member Mode**:
   - Update `AdminSettingsPanel` to display settings in read-only mode for non-admin members with the required status banner.
3. **Setting Card Refactoring**:
   - Update `AdminSettingsPanel` setting cards to support:
     - Clear title, description, and subtle key display.
     - Dynamic status badges (`ENFORCED`, `MODIFIED`, `SAVED`).
     - Save and Cancel/Reset controls for modified settings.
     - Enhanced secret presentation.
4. **Audit History Polish**:
   - Format audit trail values cleanly and handle masked secret history entries.
5. **Dark Mode & Design System Alignment**:
   - Replace all hardcoded color classes with OKLCH semantic tokens.
6. **Verification & Testing**:
   - Execute `npm test`, `node scripts/test-settings-ui-flow.js`, `npm run check:consistency`, and `npm run build`.
