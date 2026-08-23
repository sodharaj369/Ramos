# RAMOS Standalone Extension Architecture

## Overview
**RAMOS** is a standalone, client-side Manifest V3 Chrome Extension designed for high-precision business discovery, detail enrichment, and canonical lead extraction from Google Maps (`google.com/maps`).

RAMOS runs completely inside the user's browser without external API servers, backend databases, authentication gateways, or third-party web application dependencies.

---

## Target Workflow

```mermaid
flowchart LR
    A[Google Maps Search] --> B[Result Card Discovery]
    B --> C[Sequential Candidate Queue]
    C --> D[Detail Panel Enrichment & Identity Check]
    D --> E[Canonical Lead Model]
    E --> F[Standalone CSV Export]
```

1. **Google Maps Search**: The user performs any search on Google Maps (e.g. `restaurants in Austin, TX`).
2. **Result Card Discovery**: Content script scans the DOM for visible result cards, extracts initial metadata, and deduplicates by `place_id`.
3. **Sequential Candidate Queue**: Background service worker manages candidate dispatch with single-flight isolation and per-candidate bounded timeouts (15s).
4. **Detail Panel Enrichment**: Content script clicks cards sequentially, waits for detail panel load, verifies identity matching (`expectedName` vs `panelName`), and extracts rich metadata (phone, website, opening hours, rating, address).
5. **Canonical Lead Model**: Data is normalized into `createCanonicalLead()` structure.
6. **Local CSV Export**: User clicks "Download CSV" to save extracted leads directly via `chrome.downloads`.

---

## Component Structure

```
RAMOS Standalone Extension
├── manifest.json / extension/manifest.json (MV3 declaration, host_permissions: google.com/maps)
├── extension/
│   ├── popup.html (Popup interface: active tab detection, result limit selector, run/stop/CSV controls, live progress)
│   ├── popup.js (Popup state controller & messaging listener)
│   ├── popup.css (Standalone popup styles)
│   ├── background.js (Background service worker: discovery session authority, candidate queue runner, CSV generator)
│   ├── discovery.js (DOM content script worker, scroll engine, candidate queue builder)
│   ├── shared/
│   │   ├── constants.js (Error codes, extraction modes, max results constants)
│   │   └── schema.js (Canonical Lead schema builder: createCanonicalLead)
│   └── content/maps/
│       ├── dom-utils.js (DOM querying, scrolling helpers, element selection, sleep)
│       ├── selectors.js (Authoritative DOM selectors for Google Maps search cards, feed, detail panel, search box)
│       ├── validators.js (Data field validators for names, phones, ratings, URLs)
│       ├── address-parser.js (City, region, country, postal code extraction from address strings)
│       ├── result-card-extractor.js (Search result card extraction & qualification)
│       ├── detail-extractor.js (Detail panel extraction & identity verification)
│       └── maps-adapter.js (Orchestrator module binding extractor scripts to unified API surface)
├── tests/maps/
│   ├── gmaps-card-pipeline.test.ts (Node unit test suite validating discovery, queue & export invariants)
│   └── gmaps-vadapav-e2e-diagnostic.test.ts (Node E2E diagnostic harness)
└── scripts/
    ├── extension-package.js (Packaging script generating ramos-maps-connector-v1.0.0.zip)
    └── verify-packaged-extension-parity.js (Extension packaging verification)
```

---

## Standalone Execution Guarantees

1. **Zero External Network Dependencies**: Operates offline once installed. No backend API endpoints, fetch calls to remote databases, or auth tokens.
2. **Resilient Extension Messaging**: Content script reinjection and bounded timeouts protect against context invalidation or stale responses.
3. **Canonical Lead Schema**: Every lead record conforms to the canonical `createCanonicalLead()` model.
