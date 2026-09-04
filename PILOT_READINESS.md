# RAMOS Lead Intelligence — Pilot Readiness Document

**Version:** `v1.0.6`  
**Build Artifact:** `dist/ramos-maps-connector-v1.0.6.zip` (111.1 KB, 36 runtime files)  
**Status:** **PILOT READY — CODE FROZEN**  
**Date:** September 4, 2026

---

## 1. Executive Summary & Verification Results

RAMOS `v1.0.6` has passed all release qualification gates. All core modules—including Google Maps card discovery, sequential candidate queue, Website Intelligence crawler, people & decision maker extraction, confidence engine, lead scoring, deduplication, and export engines—are **permanently frozen**.

### Test & Parity Results
- **Automated Test Suites:** **162 passing**, 0 failing (14 Maps regression tests, 143 Website Intelligence tests, 5 Phase 9 QA matrix tests).
- **Parity Verification:** Source-to-package file parity passed (100% match across all 36 runtime files).
- **Consistency Verification:** Consistency checker passed with 0 secret exposures and valid doc manifests.
- **Real Chrome Workflow Verification:** Verified end-to-end extraction, enrichment, and physical spreadsheet generation on disk (`.xlsx` and `.csv`).
- **Benchmark Stability:** Linear throughput (~164 ms/lead) across 10, 25, 50, and 100 leads with instant 26 ms cancellation response time.
- **Export Compatibility:** 24-column Maps-only export and 34-column Enriched export remain strictly separated and backward compatible.

---

## 2. Known Operational Limitations

1. **Client-Side IP Rate Limiting:** All requests execute directly from the user's browser. While 50–100 leads per batch run without issue, running several hundred consecutive website crawls from the same residential IP in a single sitting may cause individual target sites to temporarily throttle HTTP requests.
2. **Interactive Cloudflare CAPTCHAs:** RAMOS does not attempt to bypass CAPTCHA challenges. Such sites will time out cleanly after 6 seconds and be marked as `failed` without crashing or freezing the extension.
3. **Client-Rendered JavaScript SPAs:** Websites that generate all content via client-side React/Vue/Angular without server-rendered HTML will yield only metadata and structured JSON-LD present in the initial markup.
4. **Single Active Discovery Tab:** Only one Google Maps tab should be actively running discovery at a time.

---

## 3. Pilot Instructions (For Sales Representatives)

### Setup & Installation
1. Download `dist/ramos-maps-connector-v1.0.6.zip` and extract it to a local folder (or use `extension/` directly).
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the unzipped folder (containing `manifest.json`).
5. Pin the **RAMOS** extension icon to the Chrome toolbar.

### Standard Prospecting Workflow
1. Open Google Maps (`https://www.google.com/maps`).
2. Search for target businesses in your target location (e.g., `"dentists in Chicago"` or `"commercial roofing in Dallas"`).
3. Click the **RAMOS** icon in the toolbar.
4. Verify the popup displays `Google Maps Detected` with a green indicator.
5. Set the import limit (recommended: 25–50 leads for initial pilot runs).
6. Click **Start Extraction**. Watch RAMOS discover cards and extract place details.
7. When extraction completes, click **Enrich Discovered Leads** to run Website Intelligence.
8. Monitor the real-time status banner:  
   `"X leads → Y enriched → Z skipped → W failed | N emails | M decision makers | Avg Lead Score: S"`
9. Click **Export to Excel** (recommended for sales CRMs) or **Export to CSV**.
10. Open the downloaded file in Microsoft Excel or your CRM. Notice:
    - **Sheet 1 ("Leads"):** Flat CRM columns including company name, address, phone, website, lead score, quality tier, decision maker contact, and social profiles.
    - **Sheet 2 ("People"):** Complete relational roster of executives and team members found on websites.

---

## 4. Rollback Procedure

If a critical flaw is encountered during the pilot:
1. **To Rollback to Maps-Only Mode:**
   - In the popup, sales reps can simply click **Export to Excel** or **Export to CSV** immediately after Maps extraction finishes, *without* clicking "Enrich Discovered Leads". This produces the original, frozen 24-column Maps dataset.
2. **To Rollback to v1.0.5:**
   - Unload the `v1.0.6` extension from `chrome://extensions`.
   - Reinstall the previous tagged distribution: `dist/ramos-maps-connector-v1.0.5.zip`.
   - No database migrations, cloud deployments, or server rollbacks are required since RAMOS is 100% standalone and client-side.

---

## 5. What Should Be Reported as a Bug During Pilot

Sales representatives should report an issue if they encounter any of the following:

| Bug Category | Expected Behavior | Bug Condition |
| :--- | :--- | :--- |
| **Popup Freezing** | UI buttons respond or show spinner with clear status text. | Popup becomes unresponsive, clicks do nothing, or stuck in infinite loop. |
| **Export Corruption** | Downloaded `.xlsx` opens cleanly in Excel without warnings. | Excel displays `"We found a problem with some content..."` or CSV columns are misaligned. |
| **Data Leakage** | An employee's personal email/phone appears in `decision_maker_*` or `people[]`. | An employee's personal email overwrites the main company contact email. |
| **False Executive** | Decision makers must be C-level, VP, Director, or Founder. | A generic blog author, commenter, or junior assistant is ranked as a decision maker. |
| **Crash on Special Sites** | Bounded 6s timeout moves to the next lead on broken sites. | Extension stops processing the remaining batch when hitting a 403/404/slow site. |
| **Duplicate Confusion** | Same physical location or phone merged into one lead. | Two completely distinct businesses with different names and addresses merged together. |

---

## 6. Release Sign-Off

- **Code Status:** **FROZEN**
- **QA Matrix:** **100% PASS**
- **Recommended Action:** Release `ramos-maps-connector-v1.0.6.zip` to pilot users immediately.
