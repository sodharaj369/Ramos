/**
 * Disposable DOM Content Worker for Google Maps (v1.0.3).
 * Operates under Background-Owned Orchestration.
 * Re-injection safe: immediately notifies background via SI_CONTENT_READY.
 */
(function () {
  "use strict";

  const adapter = window.SalesIntelMapsAdapter;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function normalizeName(name) {
    if (!name) return "";
    return String(name).toLowerCase().replace(/['"’]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }

  function getCurrentPageState() {
    const isMaps = adapter ? adapter.isMapsPage() : false;
    const rawCards = adapter ? adapter.getVisibleCardElements() : [];
    const domCardCount = rawCards.length;
    const qualifiedCards = adapter ? adapter.getQualifiedCardElements() : [];
    const detected = qualifiedCards.length > 0 ? qualifiedCards.length : domCardCount;
    const isResults = detected > 0;
    const query = adapter ? adapter.currentQuery() : null;
    const currentUrl = typeof location !== "undefined" ? location.href : "";

    console.log(`[SI][STATE][MAPS] url=${currentUrl}`);
    console.log(`[SI][STATE][CARDS] count=${detected}`);

    if (domCardCount > 0 && detected === 0) {
      console.log(`[SI][STATE][MISMATCH] domCards=${domCardCount} reportedCards=${detected}`);
    }

    return {
      ok: true,
      isMaps,
      isResults,
      query,
      detected,
      url: currentUrl,
    };
  }

  function buildCandidateQueue(limit) {
    const queue = [];
    const seen = new Set();
    const cardEls = adapter ? adapter.getVisibleCardElements() : [];

    for (const cardEl of cardEls) {
      if (queue.length >= limit) break;

      let qual = { qualified: false };
      if (adapter && adapter.ResultCardExtractor && adapter.ResultCardExtractor.isBusinessResultCard) {
        qual = adapter.ResultCardExtractor.isBusinessResultCard(cardEl);
      }

      if (!qual || !qual.qualified) continue;

      const cardRecord = adapter ? adapter.extractResultCard(cardEl) : null;
      if (!cardRecord || !cardRecord.company_name) continue;

      const key = adapter ? adapter.localKey(cardRecord) : cardRecord.company_name;
      if (!key || seen.has(key)) continue;

      seen.add(key);
      queue.push({
        company_name: cardRecord.company_name,
        place_id: cardRecord.place_id,
        source_url: cardRecord.source_url,
        category: cardRecord.category,
      });
    }

    return queue;
  }

  async function handleEnrichCandidate(candidate, index) {
    if (!isContextValid() || !candidate || !candidate.company_name) return;

    const expectedNorm = normalizeName(candidate.company_name);

    // 1. Check if detail panel is ALREADY open for this candidate
    let currentDetail = adapter ? adapter.extractDetailPanel() : null;
    if (currentDetail && currentDetail.company_name) {
      const actualNorm = normalizeName(currentDetail.company_name);
      if (actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm)) {
        currentDetail.source = "detail";
        chrome.runtime.sendMessage({
          type: "SI_DETAIL_READY",
          index,
          detailLead: currentDetail,
        });
        return;
      }
    }

    // 2. Locate DOM card element matching candidate identity
    const cardEl = adapter ? adapter.findCurrentCardElement(candidate) : null;

    // 3. Trigger Click
    if (cardEl) {
      try {
        const link = cardEl.querySelector('a.hfpxzc') || cardEl.querySelector('div.qBF1Pd') || cardEl.querySelector('button') || cardEl;
        if (link) {
          if (typeof link.scrollIntoView === "function") {
            link.scrollIntoView({ block: "center" });
          }
          const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
          link.dispatchEvent(evt);
          if (typeof link.click === "function") {
            link.click();
          }
        }
      } catch (e) {
        /* click attempt */
      }
    }

    chrome.runtime.sendMessage({
      type: "SI_CLICK_ATTEMPTED",
      index,
      name: candidate.company_name,
    });

    // 4. Poll detail panel for up to 20 checks x 400ms = 8000ms max
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      await sleep(400);
      attempts++;

      if (!isContextValid()) return;

      currentDetail = adapter ? adapter.extractDetailPanel() : null;
      if (currentDetail && currentDetail.company_name) {
        const actualNorm = normalizeName(currentDetail.company_name);
        if (actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm)) {
          currentDetail.source = "detail";
          chrome.runtime.sendMessage({
            type: "SI_DETAIL_READY",
            index,
            detailLead: currentDetail,
          });
          return;
        }
      }
    }

    // Timeout reached without matching detail panel
    chrome.runtime.sendMessage({
      type: "SI_CANDIDATE_FAILED",
      index,
      name: candidate.company_name,
      reason: "detail_panel_timeout",
    });
  }

  // --- Initialize Content Script ---
  if (isContextValid()) {
    const initialPageState = getCurrentPageState();

    // Notify background worker that content script is active/ready
    chrome.runtime.sendMessage({
      type: "SI_CONTENT_READY",
      isMaps: initialPageState.isMaps,
      cardCount: initialPageState.detected,
      searchQuery: initialPageState.query,
      url: initialPageState.url,
    });

    // Observe DOM mutations to update card count dynamically when Maps search feed updates
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isContextValid()) return;
        const pageState = getCurrentPageState();
        chrome.runtime.sendMessage({
          type: "SI_PAGE_STATE_UPDATE",
          isMaps: pageState.isMaps,
          isResults: pageState.isResults,
          cardCount: pageState.detected,
          searchQuery: pageState.query,
          url: pageState.url,
        });
      }, 600);
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    // Listen for background requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return;

      if (message.type === "SI_PAGE_STATE") {
        sendResponse(getCurrentPageState());
        return true;
      }

      if (message.type === "BUILD_DISCOVERY_QUEUE") {
        const queue = buildCandidateQueue(message.limit || 2);
        sendResponse({ ok: true, queue });
        return true;
      }

      if (message.type === "ENRICH_CURRENT_CANDIDATE") {
        sendResponse({ ok: true });
        handleEnrichCandidate(message.candidate, message.index);
        return true;
      }

      return undefined;
    });
  }
})();
