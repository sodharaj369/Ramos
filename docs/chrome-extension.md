# Sales Intel Maps Connector (Chrome extension)

Google Maps discovery runs in the user's own Chrome browser instead of a hosted
scraper. Source lives in `extension/`; the packaged build is served at
`/sales-intel-maps-connector.zip`.

## Install

1. Sign in to Sales Intel → Settings → Sales Intel Maps Connector → Download extension.
2. Unzip it.
3. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, select the folder.
4. Reload Sales Intel and click **Connect Extension**.

## How it works

- `content/bridge.js` runs only on the Sales Intel origin and hands over the
  already-authenticated session (access + refresh token) via `window.postMessage`.
- `background.js` stores that session in `chrome.storage.local`, refreshes the
  short-lived access token, and posts batches to the backend.
- `content/maps-adapter.js` + `content/discovery.js` read publicly visible
  business details from the Google Maps results the user opened.
- The popup shows progress and lets the user import the collected results.

## Backend contract

`POST /api/public/extension/import` (bearer token required)

```json
{
  "source": "chrome-extension",
  "search_query": "dentists gota ahmedabad",
  "source_url": "https://www.google.com/maps/search/...",
  "leads": [{ "company_name": "...", "phone": "...", "rating": 4.7 }]
}
```

Response: `{ jobId, total, created, duplicate, merged, rejected, errors, results[] }`

`GET /api/public/extension/status` returns `{ authenticated: boolean }`.

Rules enforced server-side:

- The user identity always comes from the verified token, never from the body.
- Max 50 records per batch; every record is validated and normalised.
- Imports reuse the existing lead pipeline (`upsertLead`) for deduplication,
  enrichment and history — no separate dedup logic.
- Emails are never extracted or guessed from Google Maps; email verification
  stays a separate, explicit step.
- Each import creates a `discovery` job and a `provider_usage` row for auditing.
