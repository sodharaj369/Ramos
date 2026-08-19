# Current System Architecture

Status: ACTIVE (v1.0.16)

The **Sales Intel** application is a B2B Lead Intelligence and Discovery Platform designed to discover, enrich, verify, and manage business leads.

---

## 1. System High-Level Topology

```
+-----------------------------------------------------------------------------------+
|                                  USER BROWSER                                     |
|                                                                                   |
|   +------------------------------------+   +----------------------------------+   |
|   | Sales Intel Web Application        |   | Sales Intel Maps Connector       |   |
|   | (React 19 / TanStack / Vite)       | <===> (Chrome Extension v1.0.16)     |   |
|   | Local Port: 8080                   |   | (Google Maps DOM Extractor)      |   |
|   +------------------------------------+   +----------------------------------+   |
+-----------------------------------------------------------------------------------+
             |                                              |
             | HTTP / REST API                              | HTTP / Bearer Auth
             v                                              v
+-----------------------------------------------------------------------------------+
|                                 BACKEND / SERVICES                                |
|                                                                                   |
|   +------------------------------------+   +----------------------------------+   |
|   | Supabase Backend / Database        |   | Email Verifier Service (Go)      |   |
|   | (Postgres, Auth, RLS, Edge APIs)   |   | Docker Container (Port 8081)     |   |
|   | - app_settings (Runtime Config)    |   +----------------------------------+   |
|   | - settings_history (Audit Trail)   |   +----------------------------------+   |
|   +------------------------------------+   | (Optional) Server-Side Scraper   |   |
|                                            | gosom/google-maps-scraper (8082) |   |
|                                            +----------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Breakdown

### A. Frontend Web Application
- **Framework**: React 19, TanStack Router (`@tanstack/react-router`), TanStack Query (`@tanstack/react-query`), TanStack Start (`@tanstack/react-start`), Vite.
- **Admin UI**: Settings → Administration panel (`src/components/admin-settings-panel.tsx`) backed by server functions (`src/lib/admin.functions.ts`).

### B. Chrome Extension (v1.0.16) — STABLE / FROZEN
- **Version**: **v1.0.16** (Manifest V3). Source code in [`extension/`](file:///d:/Sales-Intel/extension).
- Extracts Google Maps place card details directly in the user's browser tab.

### C. Centralized Runtime Configuration Engine
- **Module**: [`src/lib/config/runtime-config.server.ts`](file:///d:/Sales-Intel/src/lib/config/runtime-config.server.ts).
- **Database Tables**: `app_settings` (typed settings) and `settings_history` (audit trail).
- **Caching**: In-memory server cache with 5-second TTL.

### D. Supabase Backend & Database
- PostgreSQL with RLS enabled across all tables (`profiles`, `user_roles`, `leads`, `lead_history`, `email_verifications`, `jobs`, `provider_usage`, `app_settings`, `settings_history`).
- Server-side authorization helpers (`has_role(_user_id, _role)`).

### E. Email Verifier Microservice
- Go microservice on port 8081 (`email-verifier-service/`). Direct RFC, DNS, and SMTP handshake validation.
