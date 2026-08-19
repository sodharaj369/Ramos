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
|   +------------------------------------+   +----------------------------------+   |
|                                            +----------------------------------+   |
|                                            | (Optional) Server-Side Scraper   |   |
|                                            | gosom/google-maps-scraper (8082) |   |
|                                            +----------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Breakdown

### A. Frontend Web Application
- **Framework**: React 19, TanStack Router (`@tanstack/react-router`), TanStack Query (`@tanstack/react-query`), TanStack Start (`@tanstack/react-start`), Vite.
- **Styling**: Vanilla CSS with Tailwind CSS v4 (`@tailwindcss/vite`), Radix UI primitives (`@radix-ui/react-*`), Lucide icons (`lucide-react`), Sonner toast notifications.
- **Port**: `http://localhost:8080`.
- **Role**: Provides lead search UI, lead database table views with rich filtering, verification job triggers, configuration/settings UI, and authentication management.

### B. Chrome Extension (v1.0.16) — STABLE / FROZEN
- **Version**: **v1.0.16** (Manifest V3). Source code in [`extension/`](file:///d:/Sales-Intel/extension).
- **Primary Discovery Engine**: Extracts Google Maps business place detail cards directly in the user's browser tab.
- **Web App Messaging**: Uses `externally_connectable` web messaging to sync authorization tokens and trigger direct lead imports into the web application backend (`POST /api/public/extension/import`).

### C. Supabase Backend & Database
- **Database**: PostgreSQL with Row Level Security (RLS) enabled on all tables.
- **Schema / Tables**:
  - `profiles`: User account details (`id`, `email`, `full_name`).
  - `user_roles`: Role assignments (`admin`, `member`).
  - `leads`: Core lead records with unique constraints (`leads_domain_unique`, `leads_name_city_unique`).
  - `lead_history`: Audit log of lead creation, updates, and enrichment events.
  - `email_verifications`: Audit trail of email verification attempts and result metadata.
  - `jobs`: Background jobs for discovery, verification, and lead imports.
  - `provider_usage`: Tracking for third-party service usage units and estimated costs.
- **Functions & Triggers**: `handle_new_user()` auto-assigns `member` role upon signup. `has_role(_user_id, _role)` evaluates role membership server-side.

### D. Email Verifier Microservice
- **Technology**: Standalone Go microservice located in [`email-verifier-service/`](file:///d:/Sales-Intel/email-verifier-service).
- **Execution**: Containerized via Docker (`sales-intel-email-verifier`) running on `http://localhost:8081`.
- **Capabilities**:
  - RFC syntax validation.
  - DNS MX record resolution with fallback to A record.
  - Direct SMTP handshake check (`RCPT TO`).
  - Catch-all domain detection.
  - Disposable email domain blacklist.
  - Role-based account detection (`admin@`, `info@`, `support@`).

### E. Optional Server-Side Scraper Container
- **Technology**: `gosom/google-maps-scraper` (Docker container on port 8082).
- **Status**: Optional / Secondary testing path. Main production discovery is handled by the Chrome Extension.

---

## 3. Technology Stack & Dependencies

- **Runtime**: Node.js (v22+ recommended), Go 1.22+ (for email verifier microservice).
- **Package Manager**: `npm` / `bun`.
- **Database**: Supabase PostgreSQL.
- **Build Systems**: Vite 8, Nitro (server bundle generator).
