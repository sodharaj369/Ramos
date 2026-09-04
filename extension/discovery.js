/**
 * Authoritative DOM Content Worker for Google Maps (v1.0.14).
 * Single Source of Truth for Search Result Card Discovery & Detail Panel Enrichment.
 * Self-contained & resilient: independent of Sales Intel authentication state.
 */
(function () {
  "use strict";

  let adapter = null;
  function getAdapter() {
    if (adapter) return adapter;
    if (typeof globalThis !== "undefined" && globalThis.SalesIntelMapsAdapter) {
      adapter = globalThis.SalesIntelMapsAdapter;
    } else if (typeof window !== "undefined" && window.SalesIntelMapsAdapter) {
      adapter = window.SalesIntelMapsAdapter;
    } else if (typeof self !== "undefined" && self.SalesIntelMapsAdapter) {
      adapter = self.SalesIntelMapsAdapter;
    }
    return adapter;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function getCurrentPageState() {
    const ad = getAdapter();
    const isMaps = ad ? ad.isMapsPage() : false;
    const rawCards = ad ? ad.getVisibleCardElements() : [];
    const domCardCount = rawCards.length;
    const qualifiedCards = ad ? ad.getQualifiedCardElements() : [];
    const detected = qualifiedCards.length > 0 ? qualifiedCards.length : domCardCount;
    const isResults = detected > 0;
    const query = ad ? ad.currentQuery() : null;
    const currentUrl = typeof location !== "undefined" ? location.href : "";

    console.log(`[SI][DETECT] cards=${detected} isMaps=${isMaps} query="${query || ""}"`);

    return {
      ok: true,
      isMaps,
      isResults,
      query,
      detected,
      cardCount: detected,
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
    const ad = getAdapter();
    const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const query = (ad ? ad.currentQuery() : "") || "";

    console.log(`[SI][DISCOVERY_TEST][RUN_START] query="${query}" requestedLimit=${requestedLimit}`);
    let cardElements = ad ? ad.getQualifiedCardElements() : [];
    console.log(`[SI][DISCOVERY_TEST][CARDS_DETECTED] count=${cardElements.length}`);

    let { element: container, selector: feedSelector } = findScrollableResultsContainer();

    // Bounded wait for delayed cards: if 0 cards detected and container is missing,
    // wait up to 3500ms (polling ~350ms) to allow dynamic Maps results to render
    if (cardElements.length === 0 && !container) {
      console.log(`[SI][DISCOVERY] WAITING_FOR_RESULTS...`);
      const maxWaitMs = 3500;
      const pollInterval = 350;
      let waitedMs = 0;
      while (waitedMs < maxWaitMs) {
        await sleep(pollInterval);
        waitedMs += pollInterval;
        cardElements = ad ? ad.getQualifiedCardElements() : [];
        const found = findScrollableResultsContainer();
        container = found.element;
        feedSelector = found.selector;
        if (cardElements.length > 0 || container) {
          console.log(`[SI][DISCOVERY] Results rendered after ${waitedMs}ms (cards=${cardElements.length})`);
          break;
        }
      }
      if (cardElements.length === 0 && !container) {
        console.log(`[SI][DISCOVERY] WAITING_FOR_RESULTS timeout reached (${maxWaitMs}ms). 0 results confirmed.`);
      }
    }

    const candidateMap = new Map();

    function scanVisibleCards() {
      const cardEls = ad ? ad.getQualifiedCardElements() : [];
      let added = 0;
      for (const cardEl of cardEls) {
        const cardRecord = ad ? ad.extractResultCard(cardEl) : null;
        if (!cardRecord || !cardRecord.company_name) continue;

        // Stable identity: place_id -> canonical URL -> normalized name + address
        const key = cardRecord.place_id
          ? `pid:${cardRecord.place_id}`
          : cardRecord.source_url
          ? `url:${cardRecord.source_url.toLowerCase().trim()}`
          : `name:${cardRecord.company_name.toLowerCase().trim()}|addr:${(cardRecord.address || "").toLowerCase().trim()}`;

        const isDuplicate = candidateMap.has(key);
        console.log(`[SI][DISCOVERY_TEST][DEDUP] input="${cardRecord.company_name}" accepted=${!isDuplicate} reason=${isDuplicate ? "duplicate_identity" : "unique"}`);

        if (!isDuplicate) {
          candidateMap.set(key, {
            ...cardRecord,
            sourceQuery: query,
          });
          added++;
          console.log(`[SI][DISCOVERY_TEST][CANDIDATE] index=${candidateMap.size} placeId=${cardRecord.place_id || "n/a"} name="${cardRecord.company_name}" address="${cardRecord.address || "n/a"}"`);
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
      if (after === before && ad && typeof ad.reachedEnd === "function" && ad.reachedEnd()) {
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
      `[SI][DISCOVERY_TEST][COMPLETE] visible=${allUniqueCandidates.length} unique=${candidateMap.size} requestedLimit=${requestedLimit} selected=${finalCandidates.length}`
    );

    return finalCandidates;
  }

  let lastEnrichedPanelName = null;

  async function handleEnrichCandidate(candidate, index, previousName, runId, sourceQuery, attemptId) {
    if (!isContextValid() || !candidate || !candidate.company_name) return;

    const ad = getAdapter();
    const name = candidate.company_name;
    const prevName = previousName || lastEnrichedPanelName || null;
    const activeRunId = runId || candidate.runId || candidate.sessionId;
    const activeQuery = sourceQuery || candidate.sourceQuery;
    const activeAttemptId = attemptId || null;

    const idx = index;
    const candidateId = candidate.place_id || candidate.source_url || `cand_${idx}`;

    console.log(`[SI][DETAIL_PIPELINE][START]\nindex=${idx}\ncandidateId=${candidateId}\nexpectedName=${name}`);

    try {
      // 1. Locate DOM card element matching candidate identity
      const cardEl = ad ? ad.findCurrentCardElement(candidate) : null;
      if (cardEl) {
        console.log(`[SI][LOOP][${idx}][CARD_FOUND]`);
      }

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
            console.log(`[SI][LOOP][${idx}][CLICK]`);
          }
        } catch (e) {}
      }

      chrome.runtime.sendMessage({
        type: "SI_CLICK_ATTEMPTED",
        index: idx,
        name,
        runId: activeRunId,
        sourceQuery: activeQuery,
      });

      // 3. Bounded Wait for Detail Panel to match candidate identity
      let attempts = 0;
      const maxAttempts = 22; // 22 * 400ms = 8800ms
      let extracted = null;
      let panelName = null;

      while (attempts < maxAttempts) {
        await sleep(400);
        attempts++;

        if (!isContextValid()) return;

        const activeRoot = ad?.detailExtractor ? ad.detailExtractor.getActiveDetailPanel(null) : null;
        if (activeRoot?.companyName) {
          panelName = activeRoot.companyName;
        }

        const currentDetail = ad ? ad.extractDetailPanel(name) : null;

        if (currentDetail && currentDetail.company_name) {
          const extractor = self.SalesIntelDetailExtractor || window.SalesIntelDetailExtractor;

          // If prevName exists and differs from name, ensure detail panel has moved away from prevName
          if (prevName && extractor && extractor.isIdentityMatch && !extractor.isIdentityMatch(name, prevName)) {
            if (extractor.isIdentityMatch(currentDetail.company_name, prevName)) {
              // Still showing previous panel
              continue;
            }
          }

          const isMatch = extractor && extractor.isIdentityMatch
            ? extractor.isIdentityMatch(currentDetail.company_name, name)
            : (currentDetail.company_name.toLowerCase().trim() === name.toLowerCase().trim());

          if (isMatch) {
            extracted = currentDetail;
            panelName = currentDetail.company_name;
            break;
          }
        }
      }

      console.log(`[SI][DETAIL_PIPELINE][PANEL_OPEN]\nindex=${idx}\nexpectedName=${name}\npanelName=${panelName || ""}`);

      console.log(`[SI][DETAIL_PIPELINE][EXTRACT_START]\nindex=${idx}\npanelName=${panelName || ""}`);

      const extractedExists = Boolean(extracted && extracted.company_name);

      console.log(
        `[SI][DETAIL_PIPELINE][RETURN]\nindex=${idx}\nextractedExists=${extractedExists}\nextractedName=${extractedExists ? extracted.company_name : ""}\nextractedPhone=${extractedExists ? (extracted.phone || "") : ""}\nextractedWebsite=${extractedExists ? (extracted.website || "") : ""}\nextractedAddress=${extractedExists ? (extracted.address || "") : ""}`
      );

      if (!extractedExists) {
        const failReason = panelName ? "IDENTITY_MISMATCH" : "DETAIL_PANEL_TIMEOUT";
        if (panelName && extracted) {
          console.log(`[SI][DETAIL_PIPELINE][IDENTITY_FAILED]\nindex=${idx}\nexpected=${name}\nactual=${extracted.company_name}`);
        }
        console.log(`[SI][DETAIL_PIPELINE][EXTRACT_FAILED]\nindex=${idx}\nreason=${failReason}`);
        chrome.runtime.sendMessage({
          type: "SI_CANDIDATE_FAILED",
          index: idx,
          name,
          reason: failReason,
          runId: activeRunId,
          sourceQuery: activeQuery,
          attemptId: activeAttemptId,
        });
        return;
      }

      console.log(
        `[SI][DETAIL_PIPELINE][EXTRACT_RESULT]\nindex=${idx}\nname=${extracted.company_name}\nphone=${extracted.phone || ""}\nwebsite=${extracted.website || ""}\naddress=${extracted.address || ""}\nrating=${extracted.rating != null ? extracted.rating : ""}\nreviews=${extracted.review_count != null ? extracted.review_count : ""}`
      );

      lastEnrichedPanelName = extracted.company_name;
      extracted.source = "detail";
      extracted.runId = activeRunId;
      extracted.sourceQuery = activeQuery;

      chrome.runtime.sendMessage({
        type: "SI_DETAIL_READY",
        index: idx,
        detailLead: extracted,
        runId: activeRunId,
        sourceQuery: activeQuery,
        attemptId: activeAttemptId,
      });
    } catch (err) {
      console.log(`[SI][DETAIL_PIPELINE][EXTRACT_FAILED]\nindex=${idx}\nreason=${err?.message || "unhandled_exception"}`);
      chrome.runtime.sendMessage({
        type: "SI_CANDIDATE_FAILED",
        index: idx,
        name,
        reason: err?.message || "unhandled_exception",
        runId: activeRunId,
        sourceQuery: activeQuery,
        attemptId: activeAttemptId,
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
        console.log(`[SI][POST_MESSAGE_BRIDGE] Received msg type=${event.data.type}`);
        safeSendRuntime(event.data, (res) => {
          console.log(`[SI][POST_MESSAGE_BRIDGE] Response for ${event.data.type}:`, res);
        });
      }
    });

    // Listen for background requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return;

      if (message.type === "SI_PAGE_STATE" || message.type === "SI_DETECT_QUERY") {
        sendResponse(getCurrentPageState());
        return true;
      }

      if (message.type === "BUILD_DISCOVERY_QUEUE") {
        console.log(`[SI][DISCOVERY][START] content script BUILD_DISCOVERY_QUEUE received limit=${message.limit}`);
        buildCandidateQueue(message.limit || 10).then((queue) => {
          console.log(`[SI][DISCOVERY][CANDIDATES] discovered queue count=${queue.length}`);
          sendResponse({ ok: true, queue });
        }).catch((err) => {
          console.error(`[SI][DISCOVERY][ERROR] content script buildCandidateQueue failed:`, {
            message: err?.message,
            stack: err?.stack,
            type: "BUILD_DISCOVERY_QUEUE",
            url: typeof location !== "undefined" ? location.href : "",
            requestedLimit: message.limit
          });
          sendResponse({ ok: false, error: err?.message || "discovery_error" });
        });
        return true;
      }

      if (message.type === "ENRICH_CURRENT_CANDIDATE") {
        sendResponse({ ok: true });
        handleEnrichCandidate(
          message.candidate,
          message.index,
          message.previousName,
          message.runId || message.sessionId,
          message.sourceQuery,
          message.attemptId || null
        );
        return true;
      }

      return undefined;
    });
  }
})();
