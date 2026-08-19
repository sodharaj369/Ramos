# Configuration Governance & Inventory

Status: ACTIVE (v1.0.16) — TRUTHFUL & ENFORCED
Canonical Database Migration: [`supabase/migrations/20260819140000_app_settings_canonical_schema_fix.sql`](file:///d:/Sales-Intel/supabase/migrations/20260819140000_app_settings_canonical_schema_fix.sql)
Canonical Table Schema: `public.app_settings` (`key`, `label`, `value`, `category`, `description`, `value_type`, `is_secret`, `updated_at`, `updated_by`)

This document specifies the canonical configuration model, database schema constraints, visibility rules, secret status, mutability boundaries, and exact server-side enforcement points for all 16 runtime settings.

---

## 1. Centralized Runtime Configuration Architecture

Runtime configurations are stored in PostgreSQL table `public.app_settings` on Local Supabase (`http://127.0.0.1:54321`) and managed by Admins via **Settings → Administration** (`src/components/admin-settings-panel.tsx`).

Key characteristics:
- **Canonical Schema**: Database table enforces `label TEXT NOT NULL` alongside `key PRIMARY KEY`. No setting row can contain `NULL` or empty labels.
- **Targeted Updates**: Value modifications perform targeted `.update({ value, updated_at, updated_by })` queries, preserving metadata (`label`, `category`, `description`) 100%.
- **Typed & Validated**: Every setting key is validated server-side via Zod schemas (`src/lib/config/runtime-config.server.ts`).
- **Cached**: In-memory server cache with 5-second TTL (`getRuntimeConfig()`).
- **100% Enforced**: All 16 active settings actively govern runtime execution behavior.
- **Audited**: Updates log `setting_key`, `old_value`, `new_value`, `changed_by`, and timestamp in `public.settings_history`.
- **Secret Boundaries**: Secrets remain strictly in server-side environment variables (`.env`). Admin UI displays `Configured ✓` or `Not configured` only.

---

## 2. Canonical 16-Setting Inventory & Enforcement Matrix

| Setting Key | Label | Category | Value Type | Default Value | DB Seeded? | Admin UI Displayed? | Runtime Consumer & Enforcement Behavior | Validation Schema | Actually Enforced? |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| `discovery.chrome_extension_enabled` | Chrome Extension Discovery Enabled | `discovery` | `boolean` | `true` | YES | YES | [`extension-import.server.ts`](file:///d:/Sales-Intel/src/lib/extension-import.server.ts) & [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Master toggle. Blocks extension discovery and batch ingestion when false. | `z.boolean()` | **YES** |
| `discovery.default_limit` | Default Discovery Limit | `discovery` | `number` | `5` | YES | YES | [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Default result limit for discovery jobs when unsupplied. | `z.number().int().min(1).max(200)` | **YES** |
| `discovery.max_limit` | Maximum Discovery Limit | `discovery` | `number` | `50` | YES | YES | [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Hard server-side ceiling. Throws error if limit > max. | `z.number().int().min(1).max(500)` | **YES** |
| `discovery.default_provider` | Default Discovery Provider | `discovery` | `string` | `"chrome-extension"` | YES | YES | [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Default discovery provider selection. | `z.string().min(1)` | **YES** |
| `discovery.job_timeout_ms` | Discovery Job Timeout (ms) | `discovery` | `number` | `360000` | YES | YES | [`self-hosted-google-maps.server.ts`](file:///d:/Sales-Intel/src/lib/providers/self-hosted-google-maps.server.ts): Scraper polling maxWaitMs budget. | `z.number().int().min(5000).max(1800000)` | **YES** |
| `discovery.retry_count` | Max Discovery Retries | `discovery` | `number` | `3` | YES | YES | [`runtime.server.ts`](file:///d:/Sales-Intel/src/lib/providers/runtime.server.ts): Max attempt budget for `withRetry()`. | `z.number().int().min(0).max(10)` | **YES** |
| `import.batch_size` | Lead Import Batch Size | `import` | `number` | `50` | YES | YES | [`extension-import.server.ts`](file:///d:/Sales-Intel/src/lib/extension-import.server.ts): Hard ceiling on lead import batch payload size. | `z.number().int().min(1).max(200)` | **YES** |
| `verification.default_verifier` | Default Email Verifier | `verification` | `string` | `"aftership-smtp"` | YES | YES | [`email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Default verifier selection. Validation prevents setting disabled verifiers as default. | `z.string().min(1)` | **YES** |
| `verification.concurrency` | Verification Concurrency | `verification` | `number` | `3` | YES | YES | [`job-runner.server.ts`](file:///d:/Sales-Intel/src/lib/job-runner.server.ts): Dynamic worker concurrency bound in `processVerificationSlice()`. | `z.number().int().min(1).max(20)` | **YES** |
| `verification.timeout_ms` | Verification Timeout (ms) | `verification` | `number` | `8000` | YES | YES | [`runtime.server.ts`](file:///d:/Sales-Intel/src/lib/providers/runtime.server.ts): HTTP timeout budget for `fetchWithTimeout()`. | `z.number().int().min(1000).max(60000)` | **YES** |
| `verification.enabled` | Master Verification Switch | `verification` | `boolean` | `true` | YES | YES | [`verification.functions.ts`](file:///d:/Sales-Intel/src/lib/verification.functions.ts): Master toggle. When false, blocks single & job verification actions. | `z.boolean()` | **YES** |
| `providers.self_hosted_gmaps_enabled` | Self-Hosted Google Maps Provider | `providers` | `boolean` | `true` | YES | YES | [`lead-sources.server.ts`](file:///d:/Sales-Intel/src/lib/providers/lead-sources.server.ts): Returns `isConfigured() = false` and blocks execution when false. | `z.boolean()` | **YES** |
| `providers.aftership_smtp_enabled` | AfterShip SMTP Verifier | `providers` | `boolean` | `true` | YES | YES | [`email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Returns `isConfigured() = false` and blocks execution when false. | `z.boolean()` | **YES** |
| `providers.builtin_dns_enabled` | Built-in DNS Fallback Verifier | `providers` | `boolean` | `true` | YES | YES | [`email-verifiers.server.ts`](file:///d:/Sales-Intel/src/lib/providers/email-verifiers.server.ts): Returns `isConfigured() = false` and blocks execution when false. | `z.boolean()` | **YES** |
| `feature_flags.csv_export_enabled` | CSV Export Capability | `feature_flags` | `boolean` | `true` | YES | YES | [`leads.functions.ts`](file:///d:/Sales-Intel/src/lib/leads.functions.ts): Server check on `exportLeads`. Throws error if disabled. | `z.boolean()` | **YES** |
| `feature_flags.bulk_verification_enabled` | Bulk Verification Capability | `feature_flags` | `boolean` | `true` | YES | YES | [`jobs.handlers.server.ts`](file:///d:/Sales-Intel/src/lib/jobs.handlers.server.ts): Server check on `handleCreateVerificationJob`. Throws error if disabled. | `z.boolean()` | **YES** |
