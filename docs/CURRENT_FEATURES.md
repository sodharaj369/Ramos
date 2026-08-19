# Current Feature Inventory

Status: ACTIVE (v1.0.16)

This document provides a comprehensive inventory of all features currently implemented and active in the Sales Intel application.

---

## 1. Chrome Extension Google Maps Discovery

- **Status**: **STABLE / FROZEN (v1.0.16)**
- **Code Locations**: [`extension/`](file:///d:/Sales-Intel/extension), [`docs/chrome-extension.md`](file:///d:/Sales-Intel/docs/chrome-extension.md)
- **Capabilities**:
  - Direct browser tab extraction of Google Maps search results.
  - Candidate queue management with user-selectable result limits (5, 10, 20, etc.).
  - Sequential item enrichment (click card -> open detail panel -> validate identity -> extract detail fields -> terminal state).
  - Public field extraction: Company Name, Phone, Website, Rating, Review Count, Address (Street, City, Region, Postal Code, Country), Business Category, Opening Hours, Source URL.
  - Terminal candidate failure resilience (failed candidates log cleanly and advance queue without blocking).
  - Standalone CSV export directly from extension popup.
  - Direct background sync with Sales Intel web app (`POST /api/public/extension/import`).

---

## 2. Lead Import & Deduplication Engine

- **Status**: **ACTIVE**
- **Code Locations**: [`src/lib/leads.server.ts`](file:///d:/Sales-Intel/src/lib/leads.server.ts), [`src/lib/normalize.ts`](file:///d:/Sales-Intel/src/lib/normalize.ts)
- **Capabilities**:
  - Field normalization (cleans business names, formats addresses, extracts clean domains, validates phone formats).
  - **Deduplication Contracts**:
    1. **Domain Unique Index**: `leads_domain_unique` (`normalized_domain`). Matches existing leads by domain and updates fields without creating duplicates.
    2. **Name + City Unique Index**: `leads_name_city_unique` (`normalized_name`, `normalized_city`). Used when domain is absent.
  - Timestamp auditing: Preserves original `created_at` timestamp on re-discovery while updating `discovered_at` and `updated_at`.
  - Lead history auditing: Automatically appends an event to `lead_history` upon creation or update.

---

## 3. Email Verification Engine

- **Status**: **ACTIVE**
- **Code Locations**: [`email-verifier-service/`](file:///d:/Sales-Intel/email-verifier-service), [`src/lib/providers/aftership-smtp.server.ts`](file:///d:/Sales-Intel/src/lib/providers/aftership-smtp.server.ts), [`src/lib/verification.functions.ts`](file:///d:/Sales-Intel/src/lib/verification.functions.ts)
- **Capabilities**:
  - Standalone Go microservice on port 8081 (`sales-intel-email-verifier`).
  - Multi-tier validation pipeline:
    1. RFC Syntax Check.
    2. DNS MX / A Record Resolution.
    3. Direct SMTP Mailbox Check (`RCPT TO`).
    4. Catch-all domain detection.
    5. Disposable email domain detection.
    6. Role account detection (`admin@`, `support@`, etc.).
  - Email statuses: `valid`, `invalid`, `risky`, `unknown`, `pending`, `unverified`, `catch_all`, `disposable`, `role`.
  - Batch verification support with configurable concurrency and progress tracking.

---

## 4. Background Job Engine

- **Status**: **ACTIVE**
- **Code Locations**: [`src/lib/jobs.functions.ts`](file:///d:/Sales-Intel/src/lib/jobs.functions.ts), [`src/lib/job-runner.server.ts`](file:///d:/Sales-Intel/src/lib/job-runner.server.ts)
- **Capabilities**:
  - Job tracking in PostgreSQL (`jobs` table).
  - Job types: `discovery`, `verification`, `import`.
  - Job statuses: `queued`, `running`, `completed`, `failed`, `cancelled`.
  - Progress counters (`total`, `processed`, `cursor`, `counters` JSON).
  - Server-side runner with error recovery, backoff retries, and state persistence.

---

## 5. Lead Management & Filtering UI

- **Status**: **ACTIVE**
- **Code Locations**: [`src/routes/_authenticated/leads.index.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.index.tsx), [`src/routes/_authenticated/leads.$id.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/leads.$id.tsx)
- **Capabilities**:
  - Interactive datatable of discovered leads.
  - Search by company name, domain, city, or category.
  - Filtering by Date Discovered (Today, Yesterday, Last 7 Days, Last 30 Days, Custom Range).
  - Filtering by Email Status (`valid`, `invalid`, `risky`, `unverified`, etc.).
  - Presence filters (Has Email, Has Phone, Has Website, Created By Me).
  - Sorting by Newest Discovered, Oldest Discovered, Company Name.
  - Lead detail drawer/view showing complete attributes, location breakdown, ratings, and `lead_history` audit timeline.
  - Bulk actions: Bulk Email Verification, Bulk CSV Export, Bulk Delete.

---

## 6. Settings & Extension Connection UI

- **Status**: **ACTIVE**
- **Code Locations**: [`src/routes/_authenticated/settings.tsx`](file:///d:/Sales-Intel/src/routes/_authenticated/settings.tsx), [`src/components/extension-connection.tsx`](file:///d:/Sales-Intel/src/components/extension-connection.tsx)
- **Capabilities**:
  - Extension pairing status indicator (**● Connected** / **● Installed — Not connected** / **● Not installed**).
  - One-click token sync with Chrome Extension.
  - Verification provider status indicators (Email Verifier Service status on port 8081).
  - Optional server-side Google Maps scraper configuration status.
