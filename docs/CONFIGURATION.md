# Configuration Governance & Inventory

Status: ACTIVE (v1.0.16) — TRUTHFUL & ENFORCED
Canonical Schema: `public.app_settings` (`key`, `label`, `value`, `category`, `description`, `value_type`, `is_secret`, `updated_at`, `updated_by`)

This document lists all application configuration settings, their runtime sources, visibility rules, secret status, mutability boundaries, and exact server-side enforcement points.

---

## 1. Centralized Runtime Configuration System

Runtime configurations are stored in PostgreSQL table `public.app_settings` and managed by Admins via **Settings → Administration** (`src/components/admin-settings-panel.tsx`).

Key characteristics:
- **Canonical Schema**: Database table contains `key`, `label`, `value`, `category`, `description`, `value_type`, `is_secret`, `updated_at`, `updated_by`.
- **Targeted Updates**: Value modifications perform targeted `.update({ value, updated_at, updated_by })` queries, preserving metadata (`label`, `category`, `description`) 100%.
- **Typed & Validated**: Every setting key is validated server-side via Zod schemas (`src/lib/config/runtime-config.server.ts`).
- **Cached**: In-memory server cache with 5-second TTL (`getRuntimeConfig()`).
- **100% Enforced**: All 16 active settings actively govern runtime execution behavior.
- **Audited**: Updates log `setting_key`, `old_value`, `new_value`, `changed_by`, and timestamp in `public.settings_history`.
- **Secret Boundaries**: Secrets remain strictly in server-side environment variables (`.env`). Admin UI displays `Configured ✓` or `Not configured` only.

---

## 2. Configuration Inventory & Enforcement Table

| Setting Key | Label | Category | Default Value | Value Type | Actually Enforced? | Runtime Consumer & Enforcement Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `discovery.chrome_extension_enabled` | Chrome Extension Discovery Enabled | `discovery` | `true` | `boolean` | **ENFORCED** | [`src/lib/extension-import.server.ts`](file:///d:/Sales-Intel/src/lib/extension-import.server.ts) & [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Master toggle. Blocks extension discovery and batch ingestion when false. |
| `discovery.default_limit` | Default Discovery Limit | `discovery` | `5` | `number` | **ENFORCED** | [`src/lib/jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Applied as default limit when discovery job limit is unsupplied. |
| `discovery.max_limit` | Maximum Discovery Limit | `discovery` | `50` | `number` | **ENFORCED** | [`src/lib/jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Hard server-side ceiling. Throws error if requested discovery limit exceeds max. |
| `discovery.default_provider` | Default Discovery Provider | `discovery` | `"chrome-extension"` | `string` | **ENFORCED** | [`src/lib/jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Used as default discovery provider when unsupplied. Default is Chrome Extension. |
| `discovery.job_timeout_ms` | Discovery Job Timeout (ms) | `discovery` | `360000` (6 min) | `number` | **ENFORCED** | [`src/lib/providers/self-hosted-google-maps.server.ts`](file:///d:/Sales-Intel/src/lib/providers/self-hosted-google-maps.server.ts): Sets polling deadline maxWaitMs budget for scraper. |
| `discovery.retry_count` | Discovery Retry Attempts | `discovery` | `3` | `number` | **ENFORCED** | [`src/lib/providers/runtime.server.ts`](file:///d:/Sales-Intel/src/lib/providers/runtime.server.ts): Governs max attempt budget for `withRetry()` backoff loops. |
| `import.batch_size` | Lead Import Batch Size | `import` | `50` | `number` | **ENFORCED** | [`src/lib/extension-import.server.ts`](file:///d:/Sales-Intel/src/lib/extension-import.server.ts): Hard server ceiling on batch import size. Throws error if batch exceeds size. |
| `verification.default_verifier` | Default Email Verifier | `verification` | `"aftership-smtp"` | `string` | **ENFORCED** | [`src/lib/providers/email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Default verifier selection. Validation prevents setting disabled verifiers as default. |
| `verification.concurrency` | Verification Concurrency | `verification` | `3` | `number` | **ENFORCED** | [`src/lib/job-runner.server.ts`](file:///d:/Sales-Intel/src/lib/job-runner.server.ts): Dynamic concurrency worker bound in `processVerificationSlice()`. |
| `verification.timeout_ms` | Verification Timeout (ms) | `verification` | `8000` (8s) | `number` | **ENFORCED** | [`src/lib/providers/runtime.server.ts`](file:///d:/Sales-Intel/src/lib/providers/runtime.server.ts): Sets HTTP network timeout budget for `fetchWithTimeout()`. |
| `verification.enabled` | Master Verification Switch | `verification` | `true` | `boolean` | **ENFORCED** | [`src/lib/verification.functions.ts`](file:///d:/Sales-Intel/src/lib/verification.functions.ts): Master toggle. When false, blocks single & job verification actions. |
| `providers.self_hosted_gmaps_enabled` | Self-Hosted Google Maps Provider | `providers` | `true` | `boolean` | **ENFORCED** | [`src/lib/providers/lead-sources.server.ts`](file:///d:/Sales-Intel/src/lib/providers/lead-sources.server.ts): Returns `isConfigured() = false` and blocks execution when false. |
| `providers.aftership_smtp_enabled` | AfterShip SMTP Verifier | `providers` | `true` | `boolean` | **ENFORCED** | [`src/lib/providers/email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Returns `isConfigured() = false` and blocks execution when false. |
| `providers.builtin_dns_enabled` | Built-in DNS Fallback Verifier | `providers` | `true` | `boolean` | **ENFORCED** | [`src/lib/providers/email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Returns `isConfigured() = false` and blocks execution when false. |
| `feature_flags.csv_export_enabled` | CSV Export Capability | `feature_flags` | `true` | `boolean` | **ENFORCED** | [`src/lib/leads.functions.ts`](file:///d:/Sales-Intel/src/lib/leads.functions.ts): Server action check on `exportLeads`. Throws error if disabled. |
| `feature_flags.bulk_verification_enabled` | Bulk Verification Actions | `feature_flags` | `true` | `boolean` | **ENFORCED** | [`src/lib/jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Server check on `handleCreateVerificationJob`. Throws error if disabled. |
