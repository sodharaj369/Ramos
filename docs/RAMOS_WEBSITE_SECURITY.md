# RAMOS Website Extraction — Security & Privacy Architecture

## 1. Threat Model & Security Policy

RAMOS is a client-side Chrome Extension operating exclusively in the end-user's local browser environment. The Website Intelligence subsystem introduces web page fetching and DOM parsing capabilities. To maintain user safety, privacy, and browser stability, the following security constraints are strictly enforced:

---

## 2. Zero-Backend & Zero-Credential Guarantees

1. **No External Telemetry or APIs**: No data is sent to external cloud servers, proxy networks, scraping services, or telemetry endpoints.
2. **No Secret Tokens or API Keys**: The extension contains zero API keys, database credentials, or sensitive authentication secrets.
3. **No Third-Party Scripts**: All parsing and extraction logic is bundled natively inside the extension package. Zero runtime CDNs or remote scripts (`'unsafe-eval'` is disabled).

---

## 3. Protocol & URL Sanitation Rules

All input URLs and discovered links must undergo strict protocol and domain validation:

| Scheme | Action | Rationale |
| :--- | :--- | :--- |
| `https://` | **ALLOWED** | Secure standard web transport. |
| `http://` | **ALLOWED** | Standard web transport. |
| `javascript:` | **BLOCKED & REJECTED** | Prevents Cross-Site Scripting (XSS) and arbitrary code execution. |
| `data:` | **BLOCKED & REJECTED** | Prevents payload injection and memory bloat. |
| `file://` | **BLOCKED & REJECTED** | Prevents local filesystem access attempts. |
| `chrome://` / `chrome-extension://` | **BLOCKED & REJECTED** | Prevents extension privilege escalation or internal page tampering. |
| `blob:` | **BLOCKED & REJECTED** | Prevents uncontrolled memory allocation. |

---

## 4. Crawl Boundaries & Isolation

To prevent accidental denial-of-service, runaway loops, or unauthorized data access:

1. **Strict Same-Domain Boundary**:
   - The crawl queue only follows links within the exact same registrable domain / hostname as the target URL.
   - External links, third-party advertising domains, and cross-domain tracking redirects are automatically filtered out.
2. **Bounded Depth & Page Limits**:
   - Default page limit: **10 pages** (configurable up to a hard maximum of **30 pages**).
   - Maximum link depth: **2 hops** from root page.
3. **Concurrency & Rate Limiting**:
   - Crawl concurrency is capped at **1-2 simultaneous requests** with a polite delay between page fetches ($300\text{ms} - 800\text{ms}$).
4. **Memory & Payload Caps**:
   - Individual response bodies exceeding **2.5 MB** are rejected to prevent heap exhaustion.
   - Non-HTML MIME types (images, PDFs, videos, binary files) are ignored via `Content-Type` header inspection.

---

## 5. Anti-Bot, Login, & Access Control Safety

1. **No CAPTCHA Circumvention**: If a website serves a Cloudflare Challenge, reCAPTCHA, hCaptcha, or bot wall, RAMOS gracefully halts extraction and reports the status (`BOT_PROTECTED` / `BLOCKED`). It will **never** attempt to bypass or solve challenges.
2. **No Authentication Bypass**: Paywalled pages, login portals, and private intra-networks (`localhost`, `10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`) are restricted unless explicitly targeted by the user in local development mode.
3. **HTTP Error Handling**: Status codes `401 Unauthorized`, `403 Forbidden`, `429 Too Many Requests`, and `503 Service Unavailable` immediately terminate crawling for that domain without aggressive retries.

---

## 6. Manifest V3 Permissions Review

```json
{
  "permissions": [
    "storage",
    "tabs",
    "scripting",
    "downloads"
  ],
  "host_permissions": [
    "https://www.google.com/maps*",
    "https://*.google.com/maps*",
    "https://maps.google.com/*",
    "https://*/*",
    "http://*/*"
  ]
}
```

- `storage`: Preserving user crawl settings and temporary run state.
- `tabs`: Querying the active tab when extracting the active browser page.
- `scripting`: Executing lightweight in-tab DOM extraction if tab extraction mode is chosen.
- `downloads`: Saving exported CSV and Excel files to user's local disk.
- `host_permissions` (`https://*/*`, `http://*/*`): Required by Chrome MV3 background service workers to execute `fetch()` requests against arbitrary user-provided target websites without requiring a third-party CORS proxy.
