# Sales Intel Maps Connector (Chrome Extension v1.0.16)

The **Sales Intel Maps Connector** Chrome Extension (**v1.0.16**) performs browser-based Google Maps lead extraction directly inside the user's Chrome browser. Source code lives in [`extension/`](file:///d:/Sales-Intel/extension).

---

## 1. Product Status & Architecture

- **Active Discovery Path**: Google Maps discovery runs directly in the user's own browser tab.
- **No Server Scraper Required**: The extension operates independently without requiring a hosted server-side scraper.
- **Session Sync**: Authenticates and synchronizes session state with the Sales Intel web application via `externally_connectable` web messaging.
- **Frozen Version**: **v1.0.16**.

---

## 2. Installation & Setup

1. Open `chrome://extensions` in Google Chrome and enable **Developer mode** (top-right toggle).
2. Click **Load unpacked** and select the [`extension/`](file:///d:/Sales-Intel/extension) folder (or unzipped package).
3. Open the Sales Intel web app at `http://localhost:8080/settings` (or production URL).
4. Click **Connect Extension** to complete pairing.

---

## 3. Current Google Maps Extraction Workflow

The extension executes a strict, sequential candidate processing pipeline:

```
1. Google Maps Search
   ↓ User submits a search query on Google Maps
2. Result Card Detection
   ↓ Extension detects place candidate cards in the search results sidebar
3. Result Limit Selection
   ↓ Extension respects the user-selected maximum limit (e.g. 5, 10, 20 candidates)
4. Unique Candidate Queue Construction
   ↓ Extension builds a queue of unique result card candidates
5. Sequential Processing Loop (Candidate #1 → Candidate #N)
   ↓ Click candidate card to open detail panel
   ↓ Detect detail panel DOM elements
   ↓ Validate business identity against card info
   ↓ Extract detail panel fields
   ↓ Save result mapped to candidate index
   ↓ Transition to terminal state (Complete / Fail)
   ↓ Proceed to next candidate ONLY after previous candidate reaches a terminal state
6. Final Export
   ↓ Completed current-run records are exported to CSV or synced to Sales Intel
```

---

## 4. Extracted Google Maps Detail Fields

The extension extracts public detail-panel business fields, including:

- **Company / Business Name**
- **Address** (Street, City, State/Region, Postal Code, Country)
- **Phone** (when publicly displayed by Google Maps)
- **Website** (when publicly displayed by Google Maps)
- **Rating** (numerical score, e.g. 4.7)
- **Review Count** (total reviews)
- **Opening Status / Hours** (e.g. "Open 24 hours", "Closed")
- **Category / Business Type**
- **Source URL / Place Identity** (Direct Google Maps place link)

> [!NOTE]
> Missing fields (such as phone or website) are legitimate when Google Maps does not expose them for a specific business listing. The extractor never invents or guesses missing field values.

---

## 5. Result Limit Contract

- **Strict Upper Bound**: If the user requests **5** results, at most 5 candidate listings are processed and eligible for export.
- **Exact Row Count**: If only 3 candidates successfully complete enrichment out of 5 requested, the exported CSV contains exactly 3 valid completed rows.
- **No Padding**: Missing or failed candidate slots are never padded with dummy or empty rows.
- **No Duplication**: Candidates are deduplicated by place identity to prevent duplicate rows.
- **Run Isolation**: Results from prior searches or older runs are cleared and never mixed into the current extraction run.

---

## 6. CSV Export Workflow

- **Current-Run Records**: Clicking **Download CSV** in the popup exports all completed candidates from the current active run.
- **Re-Download Without Re-Extraction**: Clicking **Download CSV** a second time exports the existing completed dataset immediately without re-initiating the extraction workflow.
- **Standalone UI Availability**: CSV export functions independently from Sales Intel web application connection status inside the popup.

---

## 7. Resilience & Failure Handling

- **Terminal Candidate State**: Candidate failures (e.g. missing detail panel, navigational failure) are treated as terminal. A failed candidate is logged and does not block the queue indefinitely.
- **Queue Progress**: The pipeline automatically advances to the next queued candidate upon reaching a terminal state for the current item.
- **Content Script Re-Injection**: If a tab or context invalidation occurs, background and content scripts re-establish communication cleanly.
- **Run Contamination Prevention**: State transitions enforce strict run isolation so stale data from past runs cannot contaminate active extraction runs.

---

## 8. Backend Synchronization Contract (Optional Web App Sync)

When connected to Sales Intel, batches are posted to `POST /api/public/extension/import`:

```json
{
  "source": "chrome-extension",
  "search_query": "dentists gota ahmedabad",
  "source_url": "https://www.google.com/maps/search/...",
  "leads": [{ "company_name": "...", "phone": "...", "rating": 4.7 }]
}
```

Server-side ingestion rules:
- User identity is authenticated via bearer token (`chrome.storage.local`).
- Max 50 records per batch payload.
- Merges into existing lead deduplication pipeline (`upsertLead`).
- Emails are not scraped from Google Maps; email enrichment remains a separate workflow.

