# RAMOS Website Extraction — Security & Privacy Architecture

**Current Version:** `v1.0.6`  
**Current Phase:** Phase 9 (Release Candidate / Pilot Ready)  
**Status:** **CODE FROZEN**  
**Next Phase:** Phase 10 (Multi-Website & Corporate Relationship Intelligence — PLANNED)

---

## 1. Threat Model & Security Philosophy

RAMOS is a client-side Chrome Extension operating exclusively in the end-user's local browser environment. The Website Intelligence subsystem fetches web pages and parses DOM markup to extract business contact details. To maintain user safety, privacy, and browser stability, strict security boundaries are enforced directly in code.

---

## 2. Zero-Backend & Zero-Credential Guarantees

1. **No External Telemetry or Scraping Servers**: All network requests originate directly from the user's browser. Zero data or scraped payloads are transmitted to external servers, cloud databases, proxy pools, or third-party scraping APIs.
2. **No Secret Tokens or API Keys**: The extension contains zero API keys, database credentials, or secret authentication tokens.
3. **No Third-Party Remote Scripts**: All extraction logic is bundled natively inside the extension package. Zero remote CDNs or dynamic code loading (`'unsafe-eval'` is strictly disabled).
4. **No Generative AI or LLM Execution**: All parsing is deterministic, relying on Schema.org structured data, semantic DOM trees, and RFC-compliant regular expressions.

---

## 3. Protocol & URL Scheme Sanitation Rules

Discovered links and user-input URLs are validated against blocked protocols before any network request or DOM traversal occurs:

| Scheme | Action | Enforced In | Security Rationale |
| :--- | :--- | :--- | :--- |
| `https://` | **ALLOWED** | `crawl-policy.js` | Secure standard web transport. |
| `http://` | **ALLOWED** | `crawl-policy.js` | Standard web transport. |
| `javascript:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents Cross-Site Scripting (XSS) and arbitrary script execution. |
| `data:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents data payload injection and memory bloat. |
| `file:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents local filesystem access attempts. |
| `chrome:` / `chrome-extension:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents extension privilege escalation or internal page tampering. |
| `blob:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents uncontrolled in-memory blob allocations. |
| `about:` | **BLOCKED & REJECTED** | `crawl-policy.js:17` | Prevents internal browser navigation. |

---

## 4. Crawl Boundaries & Resource Isolation

1. **Strict Same-Domain Boundary**:
   - The crawl queue (`crawl-policy.js`) only follows links within the exact same registrable domain or subdomain (`host === cleanRoot || host.endsWith("." + cleanRoot)`).
   - External links, third-party advertising trackers, and cross-domain redirects are rejected.
2. **Bounded Page Ceilings**:
   - Crawl budgets are strictly capped: **1, 5, 10, or 20 pages** (default: 10, hard ceiling: 20 enforced in `website-adapter.js:201` and `crawl-queue.js:28`).
   - Maximum link depth: **2 hops** from root page (enforced in `crawl-queue.js:30`).
3. **Binary File & Media Exclusions**:
   - File extensions automatically rejected before fetching (`crawl-policy.js:19-26`):
     `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `ico`, `mp4`, `webm`, `avi`, `mov`, `mp3`, `wav`, `zip`, `tar`, `gz`, `rar`, `7z`, `exe`, `dmg`, `apk`, `iso`, `css`, `js`, `map`, `xml`, `json`.
4. **Excluded System & Sensitive Paths**:
   - URL path patterns automatically filtered out (`crawl-policy.js:28-58`):
     `/cart/`, `/checkout/`, `/basket/`, `/my-account/`, `/account/`, `/login/`, `/signin/`, `/signup/`, `/register/`, `/password-reset/`, `/logout/`, `/feed/`, `/rss/`, `/wp-admin/`, `/wp-includes/`, `/cdn-cgi/`.
5. **Memory & Payload Caps**:
   - Response bodies exceeding **2.5 MB** are rejected to prevent heap exhaustion.

---

## 5. Anti-Bot, Login, & Access Control Safety

1. **No CAPTCHA Circumvention**: If a website serves a Cloudflare Challenge, reCAPTCHA, hCaptcha, or bot wall, RAMOS gracefully halts extraction and moves to the next candidate. It **never** attempts to solve, bypass, or inject solvers.
2. **No Authentication Bypass**: Paywalled pages, login portals, and private intra-networks (`localhost`, `10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.1`) are restricted.
3. **HTTP Error Handling**: Status codes `401 Unauthorized`, `403 Forbidden`, `429 Too Many Requests`, and `503 Service Unavailable` fail cleanly without aggressive retries.

---

## 6. Enforced Timeouts (Source Code Authoritative)

| Operation | Enforced Timeout | Code Location | Enforced Mechanism |
| :--- | :--- | :--- | :--- |
| **Google Maps Detail Enrichment** | **15,000 ms (15s)** | `extension/background.js:646` | `CANDIDATE_TIMEOUT_MS = 15000` via `setTimeout` / attempt ID guards |
| **Batch Enrichment Page Fetch** | **6,000 ms (6s)** | `extension/popup.js:829` | `AbortSignal.timeout(6000)` combined with user abort controller |
| **Interactive Website Crawl Fetch** | **10,000 ms (10s)** | `extension/popup.js:1040` | `AbortSignal.timeout(10000)` combined with user abort controller |

---

## 7. Cancellation Architecture

All crawler operations support clean user-initiated cancellation:
- Controlled via native `AbortController`.
- When the user clicks `"Stop"`, signals propagate instantly to in-flight `fetch()` calls.
- Benchmark cancellation latency is **~26 ms**.
- Partial extractions acquired prior to cancellation are safely retained and displayed without data corruption.
