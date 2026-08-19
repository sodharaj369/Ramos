# Email Verification Subsystem Documentation

Status: ACTIVE (v1.0.16)

This document describes the email verification architecture, Go microservice implementation, validation tiers, and provider contracts.

---

## 1. Architecture Overview

```
Sales Intel Backend (Node.js / Nitro)
        │
        ▼  POST http://localhost:8081/verify
+-------------------------------------------------------------+
| Email Verifier Microservice (Go)                            |
| Docker Container: sales-intel-email-verifier (Port 8081)    |
| Source: email-verifier-service/                             |
+-------------------------------------------------------------+
        │
        ├── 1. Syntax Validation (RFC 5322)
        ├── 2. DNS MX / A Record Lookup
        ├── 3. Direct SMTP Handshake (RCPT TO)
        ├── 4. Catch-all Domain Testing
        └── 5. Disposable / Role Account Filtering
        │
        ▼
Response Payload JSON -> Database (email_verifications & leads tables)
```

---

## 2. Go Microservice (`email-verifier-service/`)

- **Location**: [`email-verifier-service/main.go`](file:///d:/Sales-Intel/email-verifier-service/main.go)
- **Local Port**: `8081` (`http://localhost:8081`)
- **Health Check**: `GET /health` -> `{"status": "ok"}`
- **Verification Endpoint**: `POST /verify` -> accepts `{ "email": "user@domain.com" }`

### Verification Tiers & Decision Pipeline

1. **Syntax Check**: Validates email format using strict RFC regex. If invalid, returns status `invalid`, reason `invalid_syntax`.
2. **DNS Resolution**: Queries MX records for domain. If MX is missing, checks for A record fallback. If neither exist, returns status `invalid`, reason `no_mx_records`.
3. **Disposable Domain Check**: Compares domain against embedded disposable email providers dictionary (e.g. `mailinator.com`, `tempmail.com`). If matched, returns status `disposable`.
4. **Role Account Check**: Checks username against role prefixes (`admin`, `info`, `support`, `contact`, `sales`). If matched, returns status `role`.
5. **Direct SMTP Handshake**: Connects to domain MX host on port 25 with 5-second timeout:
   - `EHLO / HELO` -> `MAIL FROM` -> `RCPT TO:<target_email>`
   - If SMTP server accepts (`250` response): proceeded to catch-all test.
   - If SMTP server explicitly rejects (`550` / `551` / `553` response): returns status `invalid`, reason `mailbox_not_found`.
   - If SMTP times out or drops connection: returns status `unknown`, reason `smtp_timeout`.
6. **Catch-All Detection**: Sends `RCPT TO` for a non-existent random address (e.g. `random_xyz999@domain.com`). If server accepts all addresses, domain is flagged as `catch_all`.

---

## 3. Status Definitions & Confidence Ratings

| Status | Description | Confidence Score | Actionable Recommendation |
| :--- | :--- | :--- | :--- |
| `valid` | Syntax valid, DNS valid, MX valid, SMTP accepted, non-catch-all | 95-100% | Safe to deliver outreach |
| `invalid` | Malformed syntax, MX missing, or explicit SMTP 550 rejection | 0% | Do not send (protect sender reputation) |
| `risky` / `catch_all` | Domain accepts any email address; deliverability cannot be guaranteed | 40-50% | Send with caution / lower volume |
| `disposable` | Temporary / disposable email provider | 0% | Reject lead / invalid |
| `role` | Role-based group mailbox (`admin@`, `support@`) | 60% | Acceptable for B2B company outreach |
| `unknown` | SMTP handshake timed out or network blocked port 25 | 30% | Retry later or use secondary provider |

---

## 4. Secondary Provider Support: AfterShip SMTP

- **Location**: [`src/lib/providers/aftership-smtp.server.ts`](file:///d:/Sales-Intel/src/lib/providers/aftership-smtp.server.ts)
- **Role**: Secondary / fallback provider integration for external SMTP verification services.
