# Architecture Assessment: Transitioning from Lovable Cloud to Local / Self-Hosted Supabase PostgreSQL Stack

Status: PROPOSED / UNDER REVIEW
Date: 2026-08-19
Target Stack: Local / Self-Hosted Supabase PostgreSQL (Docker + GoTrue + PostgREST + Kong + Studio)

---

## 1. Overview & Executive Summary

Sales Intel is built on top of the open-source Supabase stack (PostgreSQL 15+, GoTrue Auth, PostgREST API engine, and Row Level Security).
Transitioning from Lovable-managed Supabase Cloud hosting to a **Local or Self-Hosted Supabase Stack** requires **ZERO business logic refactoring** and **ZERO architectural modifications**.

The application code (`src/integrations/supabase/`, `src/lib/`, TanStack Start SSR middleware) interacts with Supabase exclusively via standard REST/RPC protocols over HTTP and the official `@supabase/supabase-js` SDK.

---

## 2. Comprehensive Dependency Analysis

### 2.1 Database Schema Dependencies
The application relies on standard PostgreSQL 15+ features:
- **Custom ENUM Types**: `public.app_role`, `public.email_status`, `public.job_type`, `public.job_status`.
- **Primary Data Tables**: `public.profiles`, `public.user_roles`, `public.leads`, `public.lead_history`, `public.email_verifications`, `public.jobs`, `public.usage_logs`, `public.app_settings`, `public.settings_history`.
- **UUID Generation**: Standard PostgreSQL `gen_random_uuid()`.
- **JSONB Payload Support**: `leads.social_urls`, `leads.attributes`, `jobs.params`, `jobs.payload`, `jobs.counters`, `app_settings.value`, `settings_history.old_value`, `settings_history.new_value`.

### 2.2 Supabase Auth & JWT Dependencies
- **Auth Provider**: GoTrue (Supabase Auth).
- **Session Identity**: JWT Bearer token authentication verified server-side via `supabase.auth.getClaims(token)` in `src/integrations/supabase/auth-middleware.ts`.
- **User Reference Table**: `auth.users` (Foreign key references from `profiles.id`, `user_roles.user_id`, `leads.created_by`, `jobs.user_id`, `app_settings.updated_by`, `settings_history.changed_by`).
- **Registration Trigger**: `on_auth_user_created` trigger firing `public.handle_new_user()` SECURITY DEFINER function to populate `profiles` and default `member` role in `user_roles`.

### 2.3 Row Level Security (RLS) & Authorization
- **RLS Enabled Tables**: All 9 tables have RLS enabled (`ENABLE ROW LEVEL SECURITY`).
- **Authorization Helper**: `public.has_role(_user_id UUID, _role public.app_role)` SECURITY DEFINER SQL function.
- **Admin Privilege Checks**: Server functions (`verifyAdminRole`) and RLS policies on `app_settings` and `settings_history` evaluate `public.has_role(auth.uid(), 'admin')`.

### 2.4 Supabase Storage & Edge Functions
- **Supabase Storage**: **0 Dependencies**. CSV export and lead imports are parsed and generated in-memory.
- **Supabase Edge Functions**: **0 Dependencies**. All background handling and server logic execute within TanStack Start / Nitro SSR.

---

## 3. Local Supabase Stack Configuration & Docker Infrastructure

Running the local Supabase stack via the official Supabase CLI (`npx supabase start`) manages containerized services via Docker Desktop:

| Container / Service | Port Binding | Purpose |
| :--- | :--- | :--- |
| **Kong API Gateway** | `http://localhost:54321` | Unified API router (`/rest/v1`, `/auth/v1`) |
| **PostgreSQL 15+** | `localhost:54322` | Core database instance (`postgres://postgres:postgres@localhost:54322/postgres`) |
| **GoTrue Auth** | `http://localhost:54321/auth/v1` | Auth service issuing JWT tokens |
| **PostgREST Engine** | `http://localhost:54321/rest/v1` | Auto-generated REST API for database tables |
| **Supabase Studio** | `http://localhost:54323` | Browser database management GUI |
| **Inbucket Mail Capture** | `http://localhost:54324` | Local SMTP webmail for testing auth signup emails |

---

## 4. Environment Variable Adjustments

To switch from Lovable Cloud to the Local Supabase stack, update `.env`:

```env
# --- Backend (Local Supabase Stack) ---
SUPABASE_URL=http://localhost:54321
SUPABASE_PROJECT_ID=local
SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_anon_key_here

VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PROJECT_ID=local
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_anon_key_here
```

---

## 5. Migration Execution & Local Seed Plan

The repository contains full, self-contained migration files in `supabase/migrations/`:
1. `20260814095815_829e57b7-f607-4ead-9caf-c259234c31fb.sql` (Initial core schema)
2. `20260814095833_c5ea1c21-828d-448d-8b2f-d1a675d74c8d.sql`
3. `20260814104134_00acc87d-2ffd-43d2-a946-8571818b1305.sql`
4. `20260814121950_eee49c26-7ccf-4af3-ae33-fe39b3483321.sql`
5. `20260814122015_6efa5036-e23b-4fb9-a08d-f36c54e925e5.sql`
6. `20260814142634_3218f934-35a4-4249-a983-f227ca695e6e.sql`
7. `20260814155948_39a31ee9-93b1-416b-9cfb-7fc5e59b1ac9.sql`
8. `20260819110000_admin_runtime_config.sql` (Runtime configuration & app_settings)
9. `20260819120000_promote_user_to_admin.sql`
10. `20260819120001_fix_admin_authorization.sql` (Targeted admin promotion & function grants)

Executing `npx supabase db reset` or `npx supabase start` applies all 10 migrations sequentially in under 5 seconds.

---

## 6. Estimated Code Changes & Risk Assessment

- **Estimated Code Changes**: **0 lines of application code**. The SDK interface, REST calls, and auth token headers remain 100% identical.
- **Chrome Extension Compatibility**: The Chrome Extension connector relies on `/api/public/extension/import` and `/api/public/extension/auth` hosted by the Sales Intel server. It has **0 direct connection to Supabase** and is **100% unaffected**.
- **Data Migration Plan**:
  1. Export existing `leads`, `lead_history`, and `email_verifications` rows from Lovable DB via SQL/pg_dump.
  2. Register user `rajsodha@waytoweb.info` in local GoTrue auth.
  3. Import existing rows into local PostgreSQL database.
