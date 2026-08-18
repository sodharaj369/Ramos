/**
 * Authoritative DOM Content Worker for Google Maps (v1.0.14).
 * Single Source of Truth for Search Result Card Discovery & Detail Panel Enrichment.
 * Self-contained & resilient: independent of Sales Intel authentication state.
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

  function getCurrentPageState() {
    const isMaps = adapter ? adapter.isMapsPage() : false;
    const rawCards = adapter ? adapter.getVisibleCardElements() : [];
    const domCardCount = rawCards.length;
    const qualifiedCards = adapter ? adapter.getQualifiedCardElements() : [];
    const detected = qualifiedCards.length > 0 ? qualifiedCards.length : domCardCount;
    const isResults = detected > 0;
    const query = adapter ? adapter.currentQuery() : null;
    const currentUrl = typeof location !== "undefined" ? location.href : "";

    console.log(`[SI][DETECT] cards=${detected} isMaps=${isMaps} query="${query || ""}"`);

    return {
      ok: true,
      isMaps,
      isResults,
      query,
      detected,
      url: currentUrl,
    };
  }

  function findScrollableResultsContainer() {
    if (typeof document === "undefined") return { element: null, selector: "none" };

    const feedSelectors = [
      'div[role="feed"]',
      'div[aria-label^="Results for" i]',
      'div[aria-label*="Results for" i]',
      'div.m6QErb[aria-label*="Results" i]',
      'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
      'div.m6QErb.DxyBCb',
    ];

    for (const sel of feedSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        return { element: el, selector: sel };
      }
    }

    const anyCard = document.querySelector('div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc');
    if (anyCard) {
      let curr = anyCard.parentElement;
      while (curr && curr !== document.body) {
        if (curr.scrollHeight > curr.clientHeight && curr.clientHeight > 100) {
          const style = window.getComputedStyle ? window.getComputedStyle(curr) : null;
          const overflowY = style ? style.overflowY : "";
          if (overflowY === "auto" || overflowY === "scroll" || curr.classList.contains("m6QErb")) {
            return { element: curr, selector: `ancestor.${curr.className || curr.tagName}` };
          }
        }
        curr = curr.parentElement;
      }
    }

    return { element: null, selector: "none" };
  }

  async function buildCandidateQueue(limit) {
    const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const query = (adapter ? adapter.currentQuery() : "") || "";

    const { element: container, selector: feedSelector } = findScrollableResultsContainer();
    const feedFound = Boolean(container);
    const feedScrollHeight = container ? container.scrollHeight : 0;
    const feedClientHeight = container ? container.clientHeight : 0;

    const initialArticles = document.querySelectorAll('div[role="article"]').length;
    const initialNv2PK = document.querySelectorAll('div.Nv2PK, div[role="article"].Nv2PK').length;
    const initialPlaceLinks = document.querySelectorAll('a.hfpxzc').length;

    console.log(`[SI][LIVE_DISCOVERY] query="${query}"`);
    console.log(`[SI][LIVE_DISCOVERY] feed=${feedSelector}`);
    console.log(`[SI][LIVE_DISCOVERY] feedFound=${feedFound}`);
    console.log(`[SI][LIVE_DISCOVERY] feedScrollHeight=${feedScrollHeight}`);
    console.log(`[SI][LIVE_DISCOVERY] feedClientHeight=${feedClientHeight}`);
    console.log(`[SI][LIVE_DISCOVERY] initialArticles=${initialArticles}`);
    console.log(`[SI][LIVE_DISCOVERY] initialNv2PK=${initialNv2PK}`);
    console.log(`[SI][LIVE_DISCOVERY] initialPlaceLinks=${initialPlaceLinks}`);

    const candidateMap = new Map();

    function scanVisibleCards() {
      const cardEls = adapter ? adapter.getQualifiedCardElements() : [];
      let added = 0;
      for (const cardEl of cardEls) {
        const cardRecord = adapter ? adapter.extractResultCard(cardEl) : null;
        if (!cardRecord || !cardRecord.company_name) continue;

        const key = cardRecord.place_id || cardRecord.company_name.toLowerCase().trim();
        if (!candidateMap.has(key)) {
          candidateMap.set(key, {
            company_name: cardRecord.company_name,
            place_id: cardRecord.place_id,
            source_url: cardRecord.source_url,
            category: cardRecord.category,
            sourceQuery: query,
          });
          added++;
        }
      }
      return added;
    }

    scanVisibleCards();

    // Bounded Scroll Discovery Phase (up to 5 passes)
    const maxPasses = 5;
    let pass = 0;

    while (pass < maxPasses && candidateMap.size < requestedLimit && container) {
      pass++;
      const before = candidateMap.size;
      const scrollTopBefore = container.scrollTop;

      if (typeof container.scrollBy === "function") {
        container.scrollBy(0, 800);
      } else {
        container.scrollTop = scrollTopBefore + 800;
      }

      await sleep(400);
      scanVisibleCards();

      const after = candidateMap.size;
      console.log(`[SI][LIVE_DISCOVERY] PASS=${pass} before=${before}`);
      console.log(`[SI][LIVE_DISCOVERY] PASS=${pass} scrollTop=${Math.round(container.scrollTop)}`);
      console.log(`[SI][LIVE_DISCOVERY] PASS=${pass} scrollHeight=${container.scrollHeight}`);
      console.log(`[SI][LIVE_DISCOVERY] PASS=${pass} after=${after}`);
      console.log(`[SI][LIVE_DISCOVERY] PASS=${pass} unique=${candidateMap.size}`);

      if (after === before && adapter && typeof adapter.reachedEnd === "function" && adapter.reachedEnd()) {
        break;
      }
    }

    // Scroll container back to top
    if (container && typeof container.scrollTo === "function") {
      try {
        container.scrollTo(0, 0);
      } catch (e) {}
    }

    const allUniqueCandidates = Array.from(candidateMap.values());
    const finalCandidates = allUniqueCandidates.slice(0, requestedLimit);

    console.log(
      `[SI][LIVE_DISCOVERY] FINAL visible=${allUniqueCandidates.length} unique=${candidateMap.size} requestedLimit=${requestedLimit}`
    );

    return finalCandidates;
  }

  let lastEnrichedPanelName = null;

  async function handleEnrichCandidate(candidate, index, previousName, runId, sourceQuery) {
    if (!isContextValid() || !candidate || !candidate.company_name) return;

    const name = candidate.company_name;
    const prevName = previousName || lastEnrichedPanelName || null;
    const activeRunId = runId || candidate.runId || candidate.sessionId;
    const activeQuery = sourceQuery || candidate.sourceQuery;

    console.log(`[SI][ENRICH] ${index} START name="${name}" placeId=${candidate.place_id || "n/a"}`);

    try {
      // 1. Locate DOM card element matching candidate identity
      const cardEl = adapter ? adapter.findCurrentCardElement(candidate) : null;

      // 2. Trigger Click on candidate card
      if (cardEl) {
        try {
          const link =
            cardEl.querySelector("a.hfpxzc") ||
            cardEl.querySelector("div.qBF1Pd") ||
            cardEl.querySelector("button") ||
            cardEl;
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
        } catch (e) {}
      }

      chrome.runtime.sendMessage({
        type: "SI_CLICK_ATTEMPTED",
        index,
        name,
        runId: activeRunId,
        sourceQuery: activeQuery,
      });

      // 3. Bounded Two-Stage Wait: Panel Transition & Expected Identity (8-10 seconds max)
      let attempts = 0;
      const maxAttempts = 22; // 22 * 400ms = 8800ms
      let panelChangedFromPrevious = !prevName;

      while (attempts < maxAttempts) {
        await sleep(400);
        attempts++;

        if (!isContextValid()) return;

        // Stage A: Verify panel changed away from previous candidate
        const activeRoot = adapter?.detailExtractor ? adapter.detailExtractor.getActiveDetailPanel(null) : null;
        const currentPanelTitle = activeRoot?.companyName || null;

        if (prevName && !panelChangedFromPrevious) {
          const extractor = self.SalesIntelDetailExtractor || window.SalesIntelDetailExtractor;
          const matchesPrev = extractor && extractor.isIdentityMatch ? extractor.isIdentityMatch(currentPanelTitle, prevName) : (currentPanelTitle === prevName);
          if (currentPanelTitle && !matchesPrev) {
            panelChangedFromPrevious = true;
          } else {
            continue;
          }
        }

        // Stage B: Verify panel matches expected candidate
        const currentDetail = adapter ? adapter.extractDetailPanel(name) : null;

        if (currentDetail && currentDetail.company_name) {
          const extractor = self.SalesIntelDetailExtractor || window.SalesIntelDetailExtractor;
          if (prevName && extractor && extractor.isIdentityMatch) {
            if (extractor.isIdentityMatch(currentDetail.company_name, prevName) && !extractor.isIdentityMatch(name, prevName)) {
              continue;
            }
          }

          lastEnrichedPanelName = currentDetail.company_name;
          currentDetail.source = "detail";
          currentDetail.runId = activeRunId;
          currentDetail.sourceQuery = activeQuery;

          console.log(
            `[SI][ENRICH] ${index} COMPLETE name="${currentDetail.company_name}" phone=${Boolean(currentDetail.phone)} website=${Boolean(currentDetail.website)} address=${Boolean(currentDetail.address)}`
          );

          chrome.runtime.sendMessage({
            type: "SI_DETAIL_READY",
            index,
            detailLead: currentDetail,
            runId: activeRunId,
            sourceQuery: activeQuery,
          });
          return;
        }
      }

      // Timeout reached - terminal state FAILED
      console.log(`[SI][ENRICH] ${index} FAILED name="${name}" reason=detail_panel_timeout`);
      chrome.runtime.sendMessage({
        type: "SI_CANDIDATE_FAILED",
        index,
        name,
        reason: "detail_panel_timeout",
        runId: activeRunId,
        sourceQuery: activeQuery,
      });
    } catch (err) {
      console.error(`[SI][ENRICH] ${index} FAILED`, err);
      chrome.runtime.sendMessage({
        type: "SI_CANDIDATE_FAILED",
        index,
        name,
        reason: err?.message || "unhandled_exception",
        runId: activeRunId,
        sourceQuery: activeQuery,
      });
    }
  }

  // --- Initialize Content Script ---
  if (isContextValid()) {
    const initialPageState = getCurrentPageState();

    function safeSendRuntime(msg, cb) {
      if (!isContextValid()) return;
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            if (typeof cb === "function") cb({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            if (typeof cb === "function") cb(res || { ok: true });
          }
        });
      } catch (e) {
        if (typeof cb === "function") cb({ ok: false, error: e?.message });
      }
    }

    // Register readiness with background
    safeSendRuntime({
      type: "SI_CONTENT_READY",
      isMaps: initialPageState.isMaps,
      cardCount: initialPageState.detected,
      searchQuery: initialPageState.query,
      url: initialPageState.url,
      timestamp: Date.now(),
    });

    // Observe DOM mutations & search input changes
    let debounceTimer = null;
    function notifyStateUpdate() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isContextValid()) return;
        const pageState = getCurrentPageState();
        safeSendRuntime({
          type: "SI_PAGE_STATE_UPDATE",
          isMaps: pageState.isMaps,
          isResults: pageState.isResults,
          cardCount: pageState.detected,
          searchQuery: pageState.query,
          url: pageState.url,
        });
      }, 400);
    }

    const observer = new MutationObserver(notifyStateUpdate);
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    // Input events on search boxes
    window.addEventListener("input", (e) => {
      if (e.target && (e.target.id === "searchboxinput" || e.target.name === "q")) {
        notifyStateUpdate();
      }
    }, true);
    window.addEventListener("popstate", notifyStateUpdate);
    window.addEventListener("hashchange", notifyStateUpdate);

    // postMessage bridge for test runner and web app bridge
    window.addEventListener("message", (event) => {
      if (event.data && typeof event.data.type === "string" && event.data.type.startsWith("SI_")) {
        safeSendRuntime(event.data);
      }
    });

    // Listen for background requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return;

      if (message.type === "SI_PAGE_STATE") {
        sendResponse(getCurrentPageState());
        return true;
      }

      if (message.type === "BUILD_DISCOVERY_QUEUE") {
        buildCandidateQueue(message.limit || 10).then((queue) => {
          sendResponse({ ok: true, queue });
        }).catch((err) => {
          sendResponse({ ok: false, error: err?.message || "discovery_error" });
        });
        return true;
      }

      if (message.type === "ENRICH_CURRENT_CANDIDATE") {
        sendResponse({ ok: true });
        handleEnrichCandidate(message.candidate, message.index, message.previousName, message.runId || message.sessionId, message.sourceQuery);
        return true;
      }

      return undefined;
    });
  }
})();
