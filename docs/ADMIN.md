# Admin Role Architecture & Security Model

Status: ACTIVE (v1.0.16)

This document specifies the Admin role architecture, role-based access control (RBAC), and Row Level Security (RLS) policies in Sales Intel.

---

## 1. Role Definitions

The system defines two primary roles via PostgreSQL enum `public.app_role`:

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
```

### A. Member (`member`)
- **Capabilities**:
  - Full access to normal application functionality.
  - Can search, discover, import, view, edit, and delete leads created by themselves.
  - Can queue email verification jobs for their own leads.
  - Can connect their own Chrome Extension instance.

### B. Admin (`admin`)
- **Capabilities**:
  - All standard Member capabilities.
  - System configuration and provider management.
  - Full management access to ALL leads across all users (`leads_update` & `leads_delete` RLS policies).
  - Ability to inspect background job state across all users (`jobs_update` RLS policy).
  - System diagnostics and audit history visibility.

---

## 2. Server-Side Authorization Enforcement

Authorization MUST be enforced server-side via Supabase Row Level Security (RLS) policies and database functions.

> [!CAUTION]
> Frontend checks (such as hiding buttons or relying on React state/URL routes) are purely for UI/UX convenience. Server-side RLS policies are the **ONLY** true security boundary.

### A. Database Role Evaluation Helper
Role checks use the PostgreSQL `SECURITY DEFINER` function:

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
```

Execution is granted exclusively to `service_role` to prevent unauthorized client-side role checks while allowing RLS policy evaluation.

### B. Row Level Security Policies

#### 1. Leads Table (`public.leads`)
- `leads_select`: `authenticated` users can read all leads (`USING (true)`).
- `leads_insert`: `authenticated` users can insert leads assigned to themselves (`WITH CHECK (created_by = auth.uid())`).
- `leads_update`: Allowed if `created_by = auth.uid()` OR user has `admin` role.
- `leads_delete`: Allowed if `created_by = auth.uid()` OR user has `admin` role.

#### 2. Jobs Table (`public.jobs`)
- `jobs_select`: `authenticated` users can read jobs (`USING (true)`).
- `jobs_insert`: `authenticated` users can insert jobs assigned to themselves (`WITH CHECK (user_id = auth.uid())`).
- `jobs_update`: Allowed if `user_id = auth.uid()` OR user has `admin` role.

#### 3. User Roles Table (`public.user_roles`)
- Only `service_role` can mutate role assignments (`GRANT ALL ON public.user_roles TO service_role`).
- Authenticated users can view their own roles (`GRANT SELECT ON public.user_roles TO authenticated`).

---

## 3. New User Onboarding Trigger

When a user signs up, the Postgres trigger `on_auth_user_created` executes `handle_new_user()`, automatically inserting a row into `profiles` and defaulting their role to `member` in `user_roles`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
```
