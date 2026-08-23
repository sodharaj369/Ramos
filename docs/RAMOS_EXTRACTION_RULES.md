# RAMOS Google Maps Extraction Rules & Selector Specification

## Overview
This document specifies the authoritative rules, DOM selectors, identity verification logic, and bounded loop behavior for Google Maps business lead extraction in **RAMOS**.

---

## 1. Important Google Maps Selectors

All selectors are declared in [`extension/content/maps/selectors.js`](file:///d:/Ramos/extension/content/maps/selectors.js):

| Component | Target Element | Primary Selector |
| :--- | :--- | :--- |
| **Search Box** | Main input element | `input#searchboxinput, input[name="q"], input[aria-label*="Search" i]` |
| **Results Feed** | Scrollable container | `div[role="feed"], div[aria-label*="Results for" i], div.m6QErb.DxyBCb` |
| **Result Card** | Business card item | `div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc` |
| **Card Title** | Business name | `div.qBF1Pd, span.OSrA9b, div.fontHeadlineSmall` |
| **Card Link** | Click target link | `a.hfpxzc` |
| **Detail Panel** | Business detail root | `div.m6QErb[aria-label], div.m6QErb.DxyBCb.kA9KIf, div.TIVStb` |
| **Detail Name** | Panel headline | `h1.DUwif, h1.fontHeadlineLarge, div.DUwif` |
| **Detail Phone** | Phone button / text | `button[data-tooltip*="phone" i], button[data-item-id^="phone:" i]` |
| **Detail Website** | Website link | `a[data-tooltip*="website" i], a[data-item-id="authority"]` |
| **End of List** | Scroll end indicator | `span.Hv2pfc, div.PbA4ef` |

---

## 2. Extraction Pipeline Rules

### A. Result-Card Extraction
- **Qualification Check**: A card must contain a valid business headline and pass `isBusinessResultCard(cardEl)` qualification.
- **Card Metadata Extracted**:
  - `company_name` (cleaned of unicode/blacklisted titles)
  - `place_id` (extracted from `href` parameter `1s0x...`)
  - `source_url` (canonical Maps URL)
  - `category` & `rating` (when present on card)

### B. Detail-Panel Enrichment
- **Click Trigger**: Dispatches synthetic `MouseEvent("click")` on the candidate's `a.hfpxzc` link.
- **Dynamic Bounded Wait**: Waits up to 22 checks x 400ms (8.8s max) for detail panel render.
- **Identity Verification**: Verifies `expectedName` vs `panelName` using `isIdentityMatch()` to prevent assigning data from a previous business panel.
- **Rich Metadata Extracted**:
  - `phone` (formatted international/national phone number)
  - `website` (sanitized external website URL, excluding Google Maps links)
  - `address` (full street address, cleaned of opening status suffixes)
  - `city`, `region`, `country`, `postal_code` (parsed via `address-parser.js`)
  - `opening_status` (validated status string e.g. `Open · Closes 9 PM`)
  - `rating` & `review_count`
  - `booking_url`, `ordering_url`, `menu_url`

---

## 3. Bounded Loop & Single-Flight Queue Behavior

1. **Single Authority State**: `currentRun` in `background.js` tracks 1 candidate in flight (`activeIndex`).
2. **Single-Flight Guard**: Never dispatches a candidate if another is currently active (`DISPATCHED`).
3. **Candidate Bounded Timeout**: 15 seconds per candidate (`CANDIDATE_TIMEOUT_MS`). If expired, candidate transitions to `FAILED` and queue advances to next candidate.
4. **Identity Match Safety**: If identity check fails or panel times out, candidate is marked `FAILED` with `IDENTITY_MISMATCH` or `DETAIL_PANEL_TIMEOUT`.

---

## 4. Canonical Lead Schema & CSV Export

- Records use `createCanonicalLead()` format defined in [`extension/shared/schema.js`](file:///d:/Ramos/extension/shared/schema.js).
- CSV export generates UTF-8 BOM formatted file downloaded via `chrome.downloads.download()`.
- Headers: `Company, Phone, Website, Email, Email Status, Address, City, State / Region, Country, Postal Code, Industry, Business Type, Rating, Reviews, Opening Status, Price Range, Booking URL, Ordering URL, Menu URL, Imported At, Source URL, Place ID, Source Query, Run ID`.
