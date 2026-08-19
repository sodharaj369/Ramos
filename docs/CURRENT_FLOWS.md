# Current Runtime Flows

Status: ACTIVE (v1.0.16)

This document maps out the core runtime execution flows across the Sales Intel system.

---

## 1. Chrome Extension Discovery & Ingestion Flow

```
User (Chrome Browser)
  │
  ├─ 1. Submits Google Maps Search (e.g. "dentists near me")
  │
  ├─ 2. Chrome Extension popup/content script initializes run state
  │
  ├─ 3. Detects result candidate cards & applies User Limit (e.g. limit = 5)
  │
  ├─ 4. Sequential Loop (Item 1 to N):
  │     ├── Click candidate card -> Detail panel opens
  │     ├── Detect detail elements & validate identity against card name
  │     ├── Extract fields (Name, Address, Phone, Website, Rating, Hours, Category)
  │     └── Save completed result object to extension local state
  │
  ├─ 5. Download CSV (Direct from popup, no server required)
  │     OR
  └─ 6. Sync to Sales Intel:
        ├── Send payload: POST /api/public/extension/import
        ├── Authenticated via Bearer token (chrome.storage.local)
        ├── Normalized server-side (src/lib/normalize.ts)
        ├── Deduplicated against DB (src/lib/leads.server.ts)
        └── Returns imported count & lead IDs
```

---

## 2. Lead Deduplication & Upsert Flow

```
Import Data Batch (Extension / CSV / API)
  │
  ▼
1. Field Normalization (src/lib/normalize.ts)
   ├── Clean Company Name -> normalized_name
   ├── Extract Domain -> normalized_domain (e.g., example.com)
   ├── Clean City -> normalized_city
   └── Clean Phone & Email -> normalized_phone, normalized_email
  │
  ▼
2. Deduplication Lookup (src/lib/leads.server.ts)
   │
   ├── IF normalized_domain is present:
   │   └── Query leads WHERE normalized_domain = target_domain
   │
   └── ELSE (Domain is absent):
       └── Query leads WHERE normalized_name = target_name AND coalesce(normalized_city, '') = target_city
  │
  ▼
3. Database Operation
   │
   ├── MATCH FOUND (Existing Lead):
   │   ├── UPDATE lead record fields (merge non-null values)
   │   ├── PRESERVE original created_at timestamp
   │   ├── UPDATE discovered_at & updated_at to now()
   │   └── INSERT lead_history event ("rediscovered")
   │
   └── NO MATCH (New Lead):
       ├── INSERT new lead row (created_at = now(), discovered_at = now())
       └── INSERT lead_history event ("created")
```

---

## 3. Single & Bulk Email Verification Flow

```
User triggers Email Verification (Single or Bulk Job)
  │
  ▼
1. Create / Queue Verification Job (src/lib/verification.functions.ts)
   └── Job record created in jobs table (type = 'verification', status = 'queued')
  │
  ▼
2. Job Runner Dispatch (src/lib/job-runner.server.ts)
   └── Fetch unverified target emails
  │
  ▼
3. Call Email Verifier Microservice (http://localhost:8081/verify)
   ├── Tier 1: Syntax format check (Regex / RFC 5322)
   ├── Tier 2: DNS lookup (MX records, fallback to A record)
   ├── Tier 3: Direct SMTP handshake (HELO -> MAIL FROM -> RCPT TO)
   ├── Tier 4: Catch-all test (random prefix test@domain.com)
   └── Tier 5: Disposable & role account dictionary evaluation
  │
  ▼
4. Response Processing
   ├── Map status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'catch_all' | 'disposable' | 'role'
   ├── Update lead record (email_status, email_verified_at, email_verification_reason)
   ├── Record verification history in email_verifications table
   └── Update job counters & cursor
```

---

## 4. Web Application Authentication & Extension Sync Flow

```
User opens Sales Intel Web App (http://localhost:8080)
  │
  ├─ 1. Authenticates via Supabase Auth (Email/Password or Magic Link)
  │
  ├─ 2. Navigates to /settings page
  │
  ├─ 3. Clicks "Connect Extension" button
  │
  ├─ 4. Web App emits window.postMessage with Supabase Session Access Token
  │
  ├─ 5. Extension content script listens on web page & forwards token to background.js
  │
  ├─ 6. Extension stores auth token in chrome.storage.local
  │
  └─ 7. Status badge updates to "Connected" on both Web App & Extension Popup
```
