# Future / Optional Self-Hosted Google Maps Architecture

> [!IMPORTANT]
> **Future / Optional Architecture**
> This document describes the **server-side containerized scraper architecture** using [`gosom/google-maps-scraper`](https://github.com/gosom/google-maps-scraper).
>
> **It is NOT required for the currently working Google Maps extraction workflow.**
> The active production path is the **Sales Intel Maps Connector Chrome Extension (v1.0.16)**, which extracts public Google Maps listings directly in the user's Chrome browser without any hosted scraper container.

The `self-hosted-google-maps` provider talks to a server-side deployment of
[`gosom/google-maps-scraper`](https://github.com/gosom/google-maps-scraper)
(MIT licence). The scraper runs **outside** this application — the app only
calls its HTTP API from the server side.

```
Lead Finder UI
   -> createDiscoveryJob (server function)
   -> job engine  -> LeadSource "self-hosted-google-maps"
   -> HTTP: your scraper service (Docker container)
   -> normalise -> existing deduplication -> leads table
```

## 1. Deploy the scraper

Simplest reliable option — one container, web/API mode:

```bash
docker run -d --name gmaps-scraper \
  -p 8080:8080 \
  -v "$PWD/gmapsdata:/gmapsdata" \
  --shm-size=1g \
  gosom/google-maps-scraper -data-folder /gmapsdata -web -c 4
```

Notes:

- The image already bundles Playwright + headless Chromium. No extra browser
  container is needed.
- Budget at least 512 MiB RAM and ~0.5 vCPU per replica; headless Chromium is
  the heavy part. `--shm-size=1g` avoids Chromium crashes.
- Throughput is roughly 120 places/minute at `-c 8 -depth 1`.
- Optional proxies: `-proxies "http://user:pass@host:port,..."` or
  `-proxies-file`. Supported schemes: `http`, `https`, `socks5`, `socks5h`.
- The OSS `-web` API has **no authentication**. Do not expose port 8080 to the
  public internet: put it on a private network, or behind a reverse proxy that
  enforces an API key / mTLS / IP allow-list, and give this app the proxied URL.
- The optional "SaaS edition" (`Dockerfile.saas`) does have API keys and an
  admin UI; use `GMAPS_SCRAPER_MODE=saas` for it.

## 2. Server-side configuration (secrets)

All values are server-only; none are exposed to the browser.

| Secret                      | Required                             | Default  | Purpose                                                                                           |
| --------------------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `GMAPS_SCRAPER_URL`         | yes                                  | —        | Base URL of the scraper, e.g. `https://scraper.internal:8080`                                     |
| `GMAPS_SCRAPER_API_KEY`     | only if your deployment requires one | —        | Sent as `X-API-Key` and `Authorization: Bearer`                                                   |
| `GMAPS_SCRAPER_MODE`        | no                                   | `web`    | `web` (OSS `-web` API) or `saas` (SaaS edition API)                                               |
| `GMAPS_SCRAPER_LANG`        | no                                   | `en`     | 2-letter results language                                                                         |
| `GMAPS_SCRAPER_ZOOM`        | no                                   | `15`     | Map zoom used for the search                                                                      |
| `GMAPS_SCRAPER_MAX_WAIT_MS` | no                                   | `360000` | Hard deadline for polling (max 600000). It does not recover a job lost when the scraper restarts. |

The Settings page only shows **Self-hosted Google Maps — Configured / Not
configured**; secret values are never read by or sent to the frontend.

## 3. API used

`web` mode (default):

- `POST /api/v1/jobs` — `{ name, keywords[], lang, zoom, depth, email: false, max_time }`
- `GET  /api/v1/jobs/{id}` — poll until status is done/failed
- `GET  /api/v1/jobs/{id}/download` — CSV of results

`saas` mode:

- `POST /api/v1/scrape` — `{ keyword, lang, max_depth, email: false, timeout }`
- `GET  /api/v1/jobs/{job_id}` — status plus inline `results[]`

## 4. Field mapping

| Scraper field                                                                                                                            | Lead field                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `title`                                                                                                                                  | `company_name`                                        |
| `website`                                                                                                                                | `website`, `domain` (normalised)                      |
| `phone`                                                                                                                                  | `phone` (public business phone)                       |
| `emails[0]`                                                                                                                              | `email` — stored **unverified**                       |
| `address`, `complete_address.*`                                                                                                          | `address`, `city`, `region`, `country`, `postal_code` |
| `category`                                                                                                                               | `category`, `business_type`                           |
| `status`                                                                                                                                 | `opening_status`                                      |
| `review_rating` / `review_count`                                                                                                         | `rating` / `review_count`                             |
| `link`                                                                                                                                   | `source_url`                                          |
| `reservations` / `order_online`                                                                                                          | `booking_url` / `ordering_url`                        |
| `latitude`, `longitude`, `place_id`, `cid`, `data_id`, `plus_code`, `timezone`, `price_range`, `open_hours`, `thumbnail`, `reviews_link` | `attributes` (JSON)                                   |

Also recorded per lead: `source = self-hosted-google-maps`, `search_query`,
`created_by`, `created_at`, plus a `lead_history` entry.

## 5. Limits

- Discovery collects Google Maps business data without website crawling/email
  extraction (`email: false`). Email enrichment remains a separate workflow.
- The provider saves at most 10 results after normalisation. For a constrained
  demo host, request 5 if 10 is unstable.
- Discovery runs while a browser tab is open (existing job-engine behaviour);
  there is no server-side scheduler.
- A run that exceeds `GMAPS_SCRAPER_MAX_WAIT_MS` fails with a timeout error.
  Nothing ever falls back to demo data.
- Polling retries only 502/503/504 and network failures with bounded exponential
  backoff, and fails after five consecutive transient failures. A missing job
  (404) is reported separately as a scraper restart; the app never submits a
  replacement job automatically and never saves partial results.
- No CAPTCHA solving or access-control circumvention is implemented.
