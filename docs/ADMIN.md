# Admin Role Architecture & Security Model

Status: ACTIVE (v1.0.16)

This document specifies the Admin role architecture, role-based access control (RBAC), Row Level Security (RLS) policies, and administrative configuration controls in Sales Intel.

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
  - Can read public runtime configuration settings.

### B. Admin (`admin`)
- **Capabilities**:
  - All standard Member capabilities.
  - Access to the **Administration** panel in Settings (`src/components/admin-settings-panel.tsx`).
  - Ability to modify centralized runtime configuration settings (`public.app_settings`) with server-side Zod validation.
  - Access to the immutable configuration audit trail (`public.settings_history`).
  - Full management access to ALL leads across all users (`leads_update` & `leads_delete` RLS policies).
  - Ability to inspect background job state across all users (`jobs_update` RLS policy).

---

## 2. Admin Configuration Security Model

```
Admin User (Browser)
    │
    ▼ Server Function Call: updateAdminSetting({ key, value })
Server-Side Authorization Check: rpc('has_role', { _role: 'admin' })
    │
    ├─► IF NOT ADMIN: Reject with 403 Forbidden Error
    │
    └─► IF ADMIN:
         ├── Validate value bounds via Zod schemas (src/lib/config/runtime-config.server.ts)
         ├── Upsert setting in public.app_settings
         ├── Record audit trail entry in public.settings_history
         └── Invalidate in-memory server config cache (5s TTL)
```

> [!CAUTION]
> Admin privileges are enforced server-side. RLS policies on `app_settings` and `settings_history` explicitly require `public.has_role(auth.uid(), 'admin')` for all INSERT, UPDATE, and DELETE operations.

---

## 3. Row Level Security Policies

### A. App Settings Table (`public.app_settings`)
- `app_settings_select`: `authenticated` users can read settings (`USING (true)`).
- `app_settings_insert_admin`: ONLY `admin` users can insert settings (`WITH CHECK (public.has_role(auth.uid(), 'admin'))`).
- `app_settings_update_admin`: ONLY `admin` users can update settings (`USING (public.has_role(auth.uid(), 'admin'))`).

### B. Settings History Table (`public.settings_history`)
- `settings_history_select_admin`: ONLY `admin` users can view audit history (`USING (public.has_role(auth.uid(), 'admin'))`).
- `settings_history_insert_admin`: ONLY `admin` users or system functions can insert audit history records.
