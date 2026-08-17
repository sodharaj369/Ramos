/**
 * Discovery controller running on Google Maps pages.
 * Sequentially opens business detail panels to extract rich structured data,
 * falls back gracefully to card data if detail panel is unavailable,
 * de-duplicates locally and reports progress to the service worker.
 */
(function () {
  "use strict";

  const adapter = window.SalesIntelMapsAdapter;
  const HARD_MAX = 50;
  const MAX_SCROLLS_WITHOUT_NEW = 4;

  const state = {
    running: false,
    cancelled: false,
    records: [],
    seen: new Set(),
    limit: 10,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function progress(status, extra) {
    const message = Object.assign(
      {
        type: "SI_DISCOVERY_PROGRESS",
        status,
        found: state.records.length,
        processed: state.records.length,
      },
      extra || {},
    );
    try {
      chrome.runtime.sendMessage(message);
    } catch {
      /* popup closed */
    }
  }

  async function processVisibleCards() {
    let added = 0;
    const cardEls = adapter.getVisibleCardElements();

    for (const cardEl of cardEls) {
      if (state.cancelled || state.records.length >= state.limit) break;

      // Extract card-level info to check local key
      const cardRecord = adapter.extractCard(cardEl);
      if (!cardRecord) continue;

      const key = adapter.localKey(cardRecord);
      if (!key || state.seen.has(key)) continue;

      let finalRecord = null;

      // Try opening rich detail panel
      try {
        const opened = adapter.openCardDetail(cardEl);
        if (opened) {
          await sleep(750); // wait for detail panel render
          const detailRecord = adapter.extractDetailPanel();
          if (detailRecord && detailRecord.company_name) {
            finalRecord = {
              ...cardRecord,
              ...detailRecord,
              extraction_source: "detail",
            };
          }
          adapter.closeDetailPanel();
          await sleep(350);
        }
      } catch {
        /* fallback below */
      }

      // Fallback to card-level data if detail panel extraction failed
      if (!finalRecord) {
        finalRecord = {
          ...cardRecord,
          extraction_source: "card-fallback",
        };
      }

      if (finalRecord) {
        state.seen.add(key);
        state.records.push(finalRecord);
        added++;
        progress("running");
      }
    }
    return added;
  }

  async function run(limit) {
    if (state.running) return { ok: false, error: "Discovery is already running." };
    if (!adapter.isSearchResultsPage()) {
      return {
        ok: false,
        error: "No Google Maps results list found. Run a search on Google Maps first.",
      };
    }
    state.running = true;
    state.cancelled = false;
    state.records = [];
    state.seen = new Set();
    state.limit = Math.min(Math.max(Number(limit) || 10, 1), HARD_MAX);

    const feed = adapter.getFeed();
    let idleScrolls = 0;

    await processVisibleCards();
    progress("running");

    while (
      !state.cancelled &&
      state.records.length < state.limit &&
      idleScrolls < MAX_SCROLLS_WITHOUT_NEW &&
      !adapter.reachedEnd()
    ) {
      if (feed) {
        feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
      }
      await sleep(1200);
      if (state.cancelled) break;
      const added = await processVisibleCards();
      idleScrolls = added > 0 ? 0 : idleScrolls + 1;
      progress("running");
    }

    state.running = false;

    if (state.cancelled) {
      const count = state.records.length;
      state.records = [];
      state.seen = new Set();
      progress("cancelled", { found: 0, processed: 0, discarded: count });
      return { ok: true, cancelled: true, records: [] };
    }

    const records = state.records.slice(0, state.limit);
    progress("completed", { found: records.length, processed: records.length });
    return { ok: true, cancelled: false, records };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    if (sender.id !== chrome.runtime.id) return;

    if (message.type === "SI_PAGE_STATE") {
      sendResponse({
        ok: true,
        isMaps: adapter.isMapsPage(),
        isResults: adapter.isSearchResultsPage(),
        query: adapter.currentQuery(),
        detected: adapter.isSearchResultsPage() ? adapter.getVisibleCardElements().length : 0,
        running: state.running,
        url: location.href,
      });
      return true;
    }

    if (message.type === "SI_START_DISCOVERY") {
      run(message.limit).then(sendResponse, (err) =>
        sendResponse({ ok: false, error: err && err.message ? err.message : "Discovery failed." }),
      );
      return true;
    }

    if (message.type === "SI_STOP_DISCOVERY") {
      state.cancelled = true;
      sendResponse({ ok: true });
      return true;
    }

    return undefined;
  });
})();
