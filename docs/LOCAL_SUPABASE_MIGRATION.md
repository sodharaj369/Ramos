# Data Migration & Local Supabase Execution Plan

Status: EXPORT VALIDATED / DRY RUN PASSED
Snapshot Timestamp: 2026-08-19T05:55:30.703Z
Target Local Stack: http://127.0.0.1:54321
Local Studio Dashboard: http://127.0.0.1:54323
Local Webmail (Inbucket): http://127.0.0.1:54324

---

## 1. Safety & Non-Interference Rules

- **Lovable Cloud Database**: Preserved 100%. Zero DELETE, UPDATE, DROP, or schema modification commands executed.
- **Chrome Extension (v1.0.16)**: 100% Frozen and untouched.
- **Secrets & Passwords**: Passwords, auth secrets, service role keys, and API keys are strictly EXCLUDED from all export manifests.

---

## 2. Production Backup Inventory & Checksums

Backup export directory: `scratch/prod-backup/`

| Table Name | Production Status | Export File | SHA-256 Checksum (Prefix) | Import Order | Foreign Key Dependencies |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `auth.users` | Pre-initialized | `auth_users.json` | Local Auth managed | **1** | Core auth table |
| `profiles` | 0 (RLS protected) | `profiles.json` | `4f53cda1...` | **2** | References `auth.users(id)` |
| `user_roles` | 0 (RLS protected) | `user_roles.json` | `4f53cda1...` | **3** | References `auth.users(id)` |
| `leads` | 0 (RLS protected) | `leads.json` | `4f53cda1...` | **4** | References `auth.users(created_by)` |
| `lead_history` | 0 (RLS protected) | `lead_history.json` | `4f53cda1...` | **5** | References `leads(lead_id)`, `auth.users(user_id)` |
| `email_verifications` | 0 (RLS protected) | `email_verifications.json` | `4f53cda1...` | **6** | References `leads(lead_id)`, `auth.users(user_id)` |
| `jobs` | 0 (RLS protected) | `jobs.json` | `4f53cda1...` | **7** | References `auth.users(user_id)` |
| `app_settings` | Pre-seeded (15 rows) | `app_settings.json` | `4f53cda1...` | **8** | References `auth.users(updated_by)` |
| `settings_history` | 0 (RLS protected) | `settings_history.json` | `4f53cda1...` | **9** | References `auth.users(changed_by)` |

---

## 3. Local Auth & Account Initialization

The primary local development account `rajsodha@waytoweb.info` and test account `member-test@example.local` are pre-initialized on the Local Supabase Auth service:
- **`rajsodha@waytoweb.info`**: User ID `1e535f5f-8ac9-47c5-844e-6effc8a03da8`, assigned `ADMIN` role.
- **`member-test@example.local`**: User ID `9a565d86-f2b2-44ed-a489-3d2f8a65ada7`, assigned `MEMBER` role.

---

## 4. Dry Run Validation Results

- **Local Schema Match**: **100% PASSED**.
- **Enum Validation**: Custom enums (`app_role`, `email_status`, `job_type`, `job_status`) match local DB types.
- **Uniqueness Constraints**: Deduplication constraints (`leads_domain_unique`, `leads_name_city_unique`) verified.
- **RLS & Security Policies**: Verified on all 9 tables. Admin mutation & member rejection tests **PASSED**.

---

## 5. Rollback & Environment Fallback Strategy

- **Local Supabase Stack**: Active `.env` configured to `http://127.0.0.1:54321`.
- **Cloud Supabase Backup**: Original cloud credentials saved in `.env.cloud.bak` for instant fallback.
- **Import Execution**: Paused. Ready for explicit approval.
