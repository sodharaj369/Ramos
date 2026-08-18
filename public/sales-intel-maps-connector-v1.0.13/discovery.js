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
  }  let lastEnrichedPanelName = null;

  async function handleEnrichCandidate(candidate, index, previousName) {
    if (!isContextValid() || !candidate || !candidate.company_name) return;

    const name = candidate.company_name;
    const prevName = previousName || lastEnrichedPanelName || null;

    console.log(`[SI][LOOP][${index}][START]\nname=${name}`);
    console.log(`[SI][LOOP][${index}][WAIT_START]\nname=${name}`);

    try {
      // 1. Locate DOM card element matching candidate identity
      const cardEl = adapter ? adapter.findCurrentCardElement(candidate) : null;

      // 2. Trigger Click on candidate card
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
        } catch (e) {}
      }

      console.log(`[SI][LOOP][${index}][CLICK]\nname=${name}`);
      chrome.runtime.sendMessage({
        type: "SI_CLICK_ATTEMPTED",
        index,
        name,
      });

      // 3. Two-Stage Wait: Panel Transition & Expected Identity
      let attempts = 0;
      const maxAttempts = 20; // 20 * 400ms = 8000ms
      let panelChangedFromPrevious = !prevName;

      if (prevName) {
        console.log(`[SI][LOOP][${index}][PANEL_CHANGE_WAIT]\nprevious=${prevName}`);
      }

      while (attempts < maxAttempts) {
        await sleep(400);
        attempts++;

        if (!isContextValid()) return;

        // Stage A: Verify panel changed away from previous candidate
        const activeRoot = adapter?.detailExtractor ? adapter.detailExtractor.getActiveDetailPanel(null) : null;
        const currentPanelTitle = activeRoot?.companyName || null;

        if (prevName && !panelChangedFromPrevious) {
          const extractor = self.SalesIntelDetailExtractor || root.SalesIntelDetailExtractor;
          const matchesPrev = extractor && extractor.isIdentityMatch ? extractor.isIdentityMatch(currentPanelTitle, prevName) : (currentPanelTitle === prevName);
          if (currentPanelTitle && !matchesPrev) {
            panelChangedFromPrevious = true;
            console.log(`[SI][LOOP][${index}][PANEL_CHANGED]\ncurrent=${currentPanelTitle}`);
          } else {
            // Still showing previous candidate panel, wait for DOM transition
            continue;
          }
        }

        // Stage B: Verify panel matches expected candidate
        const currentDetail = adapter ? adapter.extractDetailPanel(name) : null;

        if (currentDetail && currentDetail.company_name) {
          const extractor = self.SalesIntelDetailExtractor || root.SalesIntelDetailExtractor;
          if (prevName && extractor && extractor.isIdentityMatch) {
            if (extractor.isIdentityMatch(currentDetail.company_name, prevName) && !extractor.isIdentityMatch(name, prevName)) {
              continue;
            }
          }

          console.log(`[SI][LOOP][${index}][PANEL_DETECTED]\nname=${currentDetail.company_name}`);
          console.log(`[SI][LOOP][${index}][IDENTITY_OK]\nname=${currentDetail.company_name}`);
          console.log(`[SI][LOOP][${index}][EXTRACT_RESULT]\nsuccess=true`);
          lastEnrichedPanelName = currentDetail.company_name;
          currentDetail.source = "detail";
          chrome.runtime.sendMessage({
            type: "SI_DETAIL_READY",
            index,
            detailLead: currentDetail,
          });
          console.log(`[SI][LOOP][${index}][WAIT_END]\nname=${name}`);
          return;
        }
      }

      // Timeout reached after 8000ms
      if (prevName && !panelChangedFromPrevious) {
        console.log(`[SI][LOOP][${index}][PANEL_CHANGE_TIMEOUT]\nprevious=${prevName}\nexpected=${name}`);
      } else {
        console.log(`[SI][LOOP][${index}][TIMEOUT]\nname=${name}\nreason=max_wait_exceeded`);
      }
      console.log(`[SI][LOOP][${index}][WAIT_END]\nname=${name}`);
      chrome.runtime.sendMessage({
        type: "SI_CANDIDATE_FAILED",
        index,
        name,
        reason: "detail_panel_timeout",
      });
    } catch (err) {
      console.error(`[SI][LOOP][${index}][FAILED]`, err);
      console.log(`[SI][LOOP][${index}][FAILED] name=${name} reason=${err?.message || "unhandled_exception"}`);
      chrome.runtime.sendMessage({
        type: "SI_CANDIDATE_FAILED",
        index,
        name,
        reason: err?.message || "unhandled_exception",
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

    // Notify background worker that content script is active/ready
    safeSendRuntime({
      type: "SI_CONTENT_READY",
      isMaps: initialPageState.isMaps,
      cardCount: initialPageState.detected,
      searchQuery: initialPageState.query,
      url: initialPageState.url,
      timestamp: Date.now(),
    });

    // Observe DOM mutations to update card count dynamically when Maps search feed updates
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
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
      }, 500);
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
        const queue = buildCandidateQueue(message.limit || 10);
        sendResponse({ ok: true, queue });
        return true;
      }

      if (message.type === "ENRICH_CURRENT_CANDIDATE") {
        sendResponse({ ok: true });
        handleEnrichCandidate(message.candidate, message.index, message.previousName);
        return true;
      }

      return undefined;
    });
  } }
})();
