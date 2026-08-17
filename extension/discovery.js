/**
 * Discovery Controller for Google Maps Mode A Bulk Search Cards.
 * Implements strict Qualification -> Extraction -> Validation -> Deduplication pipeline.
 * Mode B (detail panel) has been completely removed.
 * Diagnostic logging: CANDIDATE, SKIPPED, QUALIFIED, IMPORT, DISCOVERY SUMMARY.
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
    stats: {
      totalCandidates: 0,
      qualifiedBusinessCards: 0,
      skippedNonBusiness: 0,
      skippedIncomplete: 0,
      duplicateCount: 0,
      importedCount: 0,
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function progress(status, extra) {
    if (!isContextValid()) return;
    const message = Object.assign(
      {
        type: "SI_DISCOVERY_PROGRESS",
        status,
        found: state.records.length,
        processed: state.records.length,
        stats: state.stats,
      },
      extra || {},
    );
    try {
      chrome.runtime.sendMessage(message);
    } catch {
      /* popup closed or context invalid */
    }
  }

  function processVisibleCards() {
    let added = 0;
    if (!adapter) return added;

    const cardEls = adapter.getVisibleCardElements();

    for (const cardEl of cardEls) {
      if (state.cancelled || state.records.length >= state.limit) break;

      state.stats.totalCandidates++;

      // Structural business qualification check
      let qual = { qualified: false, reason: "Adapter unavailable" };
      if (adapter.ResultCardExtractor && adapter.ResultCardExtractor.isBusinessResultCard) {
        qual = adapter.ResultCardExtractor.isBusinessResultCard(cardEl);
      } else {
        const extracted = adapter.extractResultCard ? adapter.extractResultCard(cardEl) : null;
        if (extracted && extracted.company_name) qual = { qualified: true, name: extracted.company_name };
      }

      console.log("[SI][MODE-A][CANDIDATE]", {
        tagName: cardEl.tagName,
        className: cardEl.className,
        textPreview: (cardEl.textContent || "").slice(0, 60).replace(/\s+/g, " "),
      });

      if (!qual.qualified) {
        state.stats.skippedNonBusiness++;
        console.log("[SI][MODE-A][SKIPPED]", {
          reason: qual.reason || "Non-business element",
          textPreview: (cardEl.textContent || "").slice(0, 60).replace(/\s+/g, " "),
          className: cardEl.className,
        });
        continue;
      }

      state.stats.qualifiedBusinessCards++;
      console.log("[SI][MODE-A][QUALIFIED]", {
        company_name: qual.name,
        place_id: qual.placeId,
        source_url: qual.href,
      });

      // Extraction & Canonical Validation
      const cardRecord = adapter.extractResultCard(cardEl);
      if (!cardRecord || !cardRecord.company_name) {
        state.stats.skippedIncomplete++;
        console.log("[SI][MODE-A][SKIPPED]", {
          reason: "Failed validation or incomplete lead payload",
          name: qual.name,
        });
        continue;
      }

      // Batch-level Deduplication
      const key = adapter.localKey(cardRecord);
      if (!key || state.seen.has(key)) {
        state.stats.duplicateCount++;
        console.log("[SI][MODE-A][SKIPPED]", {
          reason: "Duplicate candidate in current batch",
          name: cardRecord.company_name,
        });
        continue;
      }

      state.seen.add(key);
      state.records.push(cardRecord);
      state.stats.importedCount++;
      added++;

      console.log("[SI][MODE-A][IMPORT]", {
        company_name: cardRecord.company_name,
        place_id: cardRecord.place_id,
        source_url: cardRecord.source_url,
        address: cardRecord.address,
        city: cardRecord.city,
        region: cardRecord.region,
        country: cardRecord.country,
        postal_code: cardRecord.postal_code,
        rating: cardRecord.rating,
        review_count: cardRecord.review_count,
        category: cardRecord.category,
        opening_status: cardRecord.opening_status,
        website: cardRecord.website,
        phone: cardRecord.phone,
      });

      progress("running");
    }
    return added;
  }

  async function runBulkDiscovery(limit) {
    if (state.running) return { ok: false, error: "Discovery is already running." };
    if (!adapter || !adapter.isSearchResultsPage()) {
      return {
        ok: false,
        code: "NO_SEARCH_RESULTS",
        error: "No qualified Google Maps search results found. Search for a business category or location on Google Maps first.",
      };
    }

    state.running = true;
    state.cancelled = false;
    state.records = [];
    state.seen = new Set();
    state.limit = Math.min(Math.max(Number(limit) || 10, 1), HARD_MAX);
    state.stats = {
      totalCandidates: 0,
      qualifiedBusinessCards: 0,
      skippedNonBusiness: 0,
      skippedIncomplete: 0,
      duplicateCount: 0,
      importedCount: 0,
    };

    const feed = adapter.getFeed();
    let idleScrolls = 0;

    processVisibleCards();
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
      await sleep(1000);
      if (state.cancelled) break;

      const added = processVisibleCards();
      idleScrolls = added > 0 ? 0 : idleScrolls + 1;
      progress("running");
    }

    state.running = false;

    console.log("[SI][MODE-A][DISCOVERY SUMMARY]", state.stats);

    if (state.cancelled) {
      const count = state.records.length;
      state.records = [];
      state.seen = new Set();
      progress("cancelled", { found: 0, processed: 0, discarded: count, stats: state.stats });
      return { ok: true, cancelled: true, records: [], stats: state.stats };
    }

    const records = state.records.slice(0, state.limit);
    progress("completed", { found: records.length, processed: records.length, stats: state.stats });
    return { ok: true, cancelled: false, records, stats: state.stats };
  }

  if (isContextValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return;
      if (sender.id !== chrome.runtime.id) return;

      // Report current page state — used by popup to decide connection states
      if (message.type === "SI_PAGE_STATE") {
        const isMaps = adapter ? adapter.isMapsPage() : false;
        const qualifiedCards = (isMaps && adapter) ? adapter.getQualifiedCardElements() : [];
        const detected = qualifiedCards.length;
        const isResults = detected > 0;
        const query = adapter ? adapter.currentQuery() : null;

        sendResponse({
          ok: true,
          isMaps,
          isResults,
          query,
          detected,
          running: state.running,
          url: typeof location !== "undefined" ? location.href : "",
        });
        return true;
      }

      // Start bulk discovery
      if (message.type === "SI_START_DISCOVERY") {
        runBulkDiscovery(message.limit).then(sendResponse, (err) =>
          sendResponse({
            ok: false,
            code: "EXTRACTION_FAILED",
            error: err && err.message ? err.message : "Discovery failed.",
          }),
        );
        return true;
      }

      // Stop discovery
      if (message.type === "SI_STOP_DISCOVERY") {
        state.cancelled = true;
        sendResponse({ ok: true });
        return true;
      }

      return undefined;
    });
  }
})();
