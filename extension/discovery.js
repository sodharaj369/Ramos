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
    const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 500);
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

    function isRealEndOfResults(scrollContainer) {
      if (!scrollContainer) return false;

      // Only inspect visible elements within the scrollContainer feed
      const candidates = scrollContainer.querySelectorAll("span.HlvSq, div.PbZDve, p.fontBodyMedium, p, span, div");
      for (const el of candidates) {
        if (!el) continue;
        // Element must be attached, rendered, and visible in layout
        const isVisible = Boolean(el.offsetParent !== null || el.offsetHeight > 0);
        if (!isVisible) continue;

        const txt = (el.textContent || "").trim().toLowerCase();
        if (!txt || txt.length < 5) continue;

        // Must match explicit end-of-list wording
        if (
          txt.includes("you've reached the end of the list") ||
          txt.includes("you have reached the end of the list") ||
          txt.includes("reached the end of the list") ||
          txt.includes("end of the list") ||
          txt.includes("end of list") ||
          txt.includes("ende der liste") ||
          txt.includes("fin de la liste") ||
          txt.includes("final de la lista")
        ) {
          return true;
        }
      }
      return false;
    }

    // Bounded Scroll Discovery Phase: scales with requested limit (up to 120 passes for high limits)
    const maxPasses = Math.min(Math.max(Math.ceil(requestedLimit / 3), 15), 120);
    let pass = 0;
    let consecutiveStalled = 0;

    while (pass < maxPasses && candidateMap.size < requestedLimit && container) {
      pass++;
      const before = candidateMap.size;

      // Scroll container down to bottom
      if (typeof container.scrollTo === "function") {
        container.scrollTo(0, container.scrollHeight);
      } else if (typeof container.scrollBy === "function") {
        container.scrollBy(0, 1200);
      } else {
        container.scrollTop = container.scrollHeight;
      }

      // Dispatch scroll event so Google Maps infinite-scroll listeners trigger
      try {
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch (e) {}

      // Initial delay to allow rendering
      await sleep(500);
      scanVisibleCards();

      const after = candidateMap.size;

      // If new cards were added, keep going immediately!
      if (after > before) {
        consecutiveStalled = 0;
        continue;
      }

      // If no new cards discovered, check if the real end-of-list text banner is already visible
      if (isRealEndOfResults(container)) {
        console.log(`[SI][DISCOVERY] True end of search results marker reached at ${candidateMap.size} candidates.`);
        break;
      }

      // Bounded wait loop (up to 4000ms, polling every 400ms) for Google Maps network request to resolve
      const maxWaitMs = 4000;
      const pollInterval = 400;
      let waitedMs = 0;
      let foundNew = false;

      while (waitedMs < maxWaitMs) {
        await sleep(pollInterval);
        waitedMs += pollInterval;

        const newlyAdded = scanVisibleCards();
        if (newlyAdded > 0) {
          foundNew = true;
          console.log(`[SI][DISCOVERY] Results updated after ${waitedMs}ms (+${newlyAdded} new cards, total=${candidateMap.size})`);
          break;
        }

        // Check if true end of list appeared while waiting
        if (isRealEndOfResults(container)) {
          console.log(`[SI][DISCOVERY] True end of list appeared after ${waitedMs}ms.`);
          break;
        }

        // Periodic scroll nudge to keep Google Maps infinite scroll loading
        if (waitedMs % 800 === 0 && container) {
          try {
            container.scrollBy(0, -60);
            await sleep(60);
            if (typeof container.scrollTo === "function") {
              container.scrollTo(0, container.scrollHeight);
            } else {
              container.scrollBy(0, 500);
            }
            container.dispatchEvent(new Event("scroll", { bubbles: true }));
          } catch (e) {}
        }
      }

      if (foundNew) {
        consecutiveStalled = 0;
        continue;
      }

      if (isRealEndOfResults(container)) {
        console.log(`[SI][DISCOVERY] End of list confirmed after ${waitedMs}ms wait.`);
        break;
      }

      consecutiveStalled++;
      console.log(`[SI][DISCOVERY] Pass ${pass}: No new cards after wait (stalled ${consecutiveStalled}/4).`);

      // Require 4 consecutive stalled cycles (16 seconds of zero new cards) before concluding feed exhaustion
      if (consecutiveStalled >= 4) {
        console.log(`[SI][DISCOVERY] Feed exhausted after ${consecutiveStalled} wait cycles. Concluding discovery at ${candidateMap.size} candidates.`);
        break;
      }
    }

    // Scroll container back to top and dispatch scroll event for Google Maps
    if (container && typeof container.scrollTo === "function") {
      try {
        container.scrollTo(0, 0);
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
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

  function fastFindCardElement(candidate, ad) {
    if (!candidate) return null;

    // A. Direct Place ID query (takes 0.1ms)
    if (candidate.place_id && typeof document !== "undefined") {
      try {
        const link = document.querySelector(`a.hfpxzc[href*="${candidate.place_id}"]`);
        if (link) {
          return link.closest('div[role="article"], div.Nv2PK') || link;
        }
      } catch (e) {}
    }

    // B. Direct aria-label query (takes 0.1ms)
    if (candidate.company_name && typeof CSS !== "undefined" && CSS.escape && typeof document !== "undefined") {
      try {
        const escaped = CSS.escape(candidate.company_name);
        const link = document.querySelector(`a.hfpxzc[aria-label="${escaped}"]`);
        if (link) {
          return link.closest('div[role="article"], div.Nv2PK') || link;
        }
      } catch (e) {}
    }

    // C. Adapter fallback
    if (ad && typeof ad.findCurrentCardElement === "function") {
      return ad.findCurrentCardElement(candidate);
    }
    return null;
  }

  function getActiveH1Name() {
    if (typeof document === "undefined") return null;
    const h1s = document.querySelectorAll(
      'h1.DUwif, h1.fontTitleLarge, h1.section-hero-header-title-title, div[role="main"] h1, h1'
    );
    for (const h1 of h1s) {
      const txt = (h1.textContent || "").trim();
      if (txt && !(self.SalesIntelValidators?.isUIElementTitle?.(txt))) {
        return txt;
      }
    }
    return null;
  }

  async function scrollFeedToFindCard(candidate, ad) {
    if (!candidate) return null;

    // 1. Instant check if already in DOM
    let cardEl = fastFindCardElement(candidate, ad);
    if (cardEl) return cardEl;

    const { element: container } = findScrollableResultsContainer();
    if (!container) return null;

    console.log(`[SI][FEED_SCROLL] Scrolling feed to locate "${candidate.company_name}"...`);

    // 2. Incremental forward scroll with scroll event dispatching for Google Maps virtual list
    let scrollStep = 0;
    const maxSteps = 35;

    while (!cardEl && scrollStep < maxSteps) {
      scrollStep++;

      if (typeof container.scrollBy === "function") {
        container.scrollBy(0, 800);
      } else {
        container.scrollTop += 800;
      }

      // CRITICAL: Dispatch scroll event so Google Maps infinite-scroll virtual list listener triggers
      try {
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch (e) {}

      await sleep(150);
      cardEl = fastFindCardElement(candidate, ad);
      if (cardEl) {
        console.log(`[SI][FEED_SCROLL] Located "${candidate.company_name}" on step ${scrollStep}`);
        return cardEl;
      }

      // If near bottom of container, nudge to trigger Google Maps feed pagination
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 60) {
        try {
          container.scrollBy(0, -50);
          await sleep(50);
          if (typeof container.scrollTo === "function") {
            container.scrollTo(0, container.scrollHeight);
          } else {
            container.scrollTop = container.scrollHeight;
          }
          container.dispatchEvent(new Event("scroll", { bubbles: true }));
        } catch (e) {}
        await sleep(350);
        cardEl = fastFindCardElement(candidate, ad);
        if (cardEl) {
          console.log(`[SI][FEED_SCROLL] Located "${candidate.company_name}" after pagination nudge on step ${scrollStep}`);
          return cardEl;
        }
      }
    }

    // 3. Fallback: If not found and scrolled far down, search from top downwards
    if (!cardEl && container.scrollTop > 600) {
      try {
        container.scrollTo(0, 0);
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch (e) {}
      await sleep(250);
      cardEl = fastFindCardElement(candidate, ad);
      if (cardEl) return cardEl;

      let retryStep = 0;
      while (!cardEl && retryStep < maxSteps) {
        retryStep++;
        if (typeof container.scrollBy === "function") {
          container.scrollBy(0, 800);
        } else {
          container.scrollTop += 800;
        }
        try {
          container.dispatchEvent(new Event("scroll", { bubbles: true }));
        } catch (e) {}
        await sleep(150);
        cardEl = fastFindCardElement(candidate, ad);
        if (cardEl) return cardEl;

        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 60) {
          try {
            container.scrollBy(0, -50);
            await sleep(50);
            if (typeof container.scrollTo === "function") {
              container.scrollTo(0, container.scrollHeight);
            } else {
              container.scrollTop = container.scrollHeight;
            }
            container.dispatchEvent(new Event("scroll", { bubbles: true }));
          } catch (e) {}
          await sleep(350);
          cardEl = fastFindCardElement(candidate, ad);
          if (cardEl) return cardEl;
        }
      }
    }

    return cardEl;
  }

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
      // 1. Locate DOM card element matching candidate identity (with virtual scroll event pagination)
      let cardEl = await scrollFeedToFindCard(candidate, ad);

      if (!cardEl) {
        console.warn(`[SI][LOOP][${idx}][PRESERVE_LEAD] Card element not mounted in DOM for "${name}". Preserving qualified Mode A lead.`);
        // Fallback: Preserve qualified candidate with complete Mode A data so lead is never lost
        candidate.source = "result_card";
        candidate.extraction_mode = "mode_a_result_cards";
        candidate.runId = activeRunId;
        candidate.sourceQuery = activeQuery;
        chrome.runtime.sendMessage({
          type: "SI_DETAIL_READY",
          index: idx,
          detailLead: candidate,
          runId: activeRunId,
          sourceQuery: activeQuery,
          attemptId: activeAttemptId,
        });
        return;
      }

      console.log(`[SI][LOOP][${idx}][CARD_FOUND]`);

      // 2. Trigger Click on candidate card with full pointer/mouse sequence for instant Google Maps reaction
      try {
        const link =
          cardEl.querySelector("a.hfpxzc") ||
          cardEl.querySelector("div.qBF1Pd") ||
          cardEl.querySelector("button") ||
          cardEl;
        if (link) {
          if (typeof link.scrollIntoView === "function") {
            link.scrollIntoView({ block: "center", behavior: "auto" });
          }
          const eventOpts = { bubbles: true, cancelable: true, view: window };
          link.dispatchEvent(new PointerEvent("pointerdown", eventOpts));
          link.dispatchEvent(new MouseEvent("mousedown", eventOpts));
          link.dispatchEvent(new PointerEvent("pointerup", eventOpts));
          link.dispatchEvent(new MouseEvent("mouseup", eventOpts));
          link.dispatchEvent(new MouseEvent("click", eventOpts));
          if (typeof link.click === "function") {
            link.click();
          }
          console.log(`[SI][LOOP][${idx}][CLICK]`);
        }
      } catch (e) {}

      chrome.runtime.sendMessage({
        type: "SI_CLICK_ATTEMPTED",
        index: idx,
        name,
        runId: activeRunId,
        sourceQuery: activeQuery,
      });

      // 3. Fast & Bounded Wait for Detail Panel to match candidate identity
      const extractor = self.SalesIntelDetailExtractor || window.SalesIntelDetailExtractor;
      const isIdMatch = (actual, expected) => {
        if (!actual || !expected) return false;
        if (extractor && typeof extractor.isIdentityMatch === "function") {
          return extractor.isIdentityMatch(actual, expected);
        }
        return actual.toLowerCase().trim() === expected.toLowerCase().trim();
      };

      let attempts = 0;
      const pollIntervalMs = 120; // Fast 120ms polling interval (down from 400ms)
      const maxAttempts = 60; // 60 * 120ms = ~7200ms total bounded safety window
      let extracted = null;
      let panelName = null;

      while (attempts < maxAttempts) {
        attempts++;

        if (!isContextValid()) return;

        // Fast check: inspect active H1 heading text without triggering heavy DOM extraction
        const currentH1 = getActiveH1Name();

        // If prevName exists and current H1 still shows prevName, detail panel hasn't transitioned yet
        if (prevName && currentH1 && !isIdMatch(name, prevName) && isIdMatch(currentH1, prevName)) {
          panelName = currentH1;
          // If stuck on previous business after 10 attempts (~1.2s), re-dispatch click to assist Maps event handler
          if (attempts === 10 || attempts === 25) {
            try {
              const link =
                cardEl.querySelector("a.hfpxzc") ||
                cardEl.querySelector("div.qBF1Pd") ||
                cardEl.querySelector("button") ||
                cardEl;
              if (link) {
                link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                if (typeof link.click === "function") link.click();
              }
            } catch (e) {}
          }
          await sleep(pollIntervalMs);
          continue;
        }

        if (currentH1) {
          panelName = currentH1;
        }

        // When H1 matches target candidate identity, extract full detail panel
        if (currentH1 && isIdMatch(currentH1, name)) {
          const currentDetail = ad ? ad.extractDetailPanel(name) : null;
          if (currentDetail && currentDetail.company_name && isIdMatch(currentDetail.company_name, name)) {
            extracted = currentDetail;
            panelName = currentDetail.company_name;
            break;
          }
        }

        // Fallback: every 3rd attempt (~360ms), run extractDetailPanel in case H1 had non-standard styling
        if (attempts % 3 === 0) {
          const currentDetail = ad ? ad.extractDetailPanel(name) : null;
          if (currentDetail && currentDetail.company_name) {
            if (!(prevName && !isIdMatch(name, prevName) && isIdMatch(currentDetail.company_name, prevName))) {
              if (isIdMatch(currentDetail.company_name, name)) {
                extracted = currentDetail;
                panelName = currentDetail.company_name;
                break;
              }
            }
          }
        }

        await sleep(pollIntervalMs);
      }

      console.log(`[SI][DETAIL_PIPELINE][PANEL_OPEN]\nindex=${idx}\nexpectedName=${name}\npanelName=${panelName || ""}`);

      console.log(`[SI][DETAIL_PIPELINE][EXTRACT_START]\nindex=${idx}\npanelName=${panelName || ""}`);

      const extractedExists = Boolean(extracted && extracted.company_name);

      console.log(
        `[SI][DETAIL_PIPELINE][RETURN]\nindex=${idx}\nextractedExists=${extractedExists}\nextractedName=${extractedExists ? extracted.company_name : ""}\nextractedPhone=${extractedExists ? (extracted.phone || "") : ""}\nextractedWebsite=${extractedExists ? (extracted.website || "") : ""}\nextractedAddress=${extractedExists ? (extracted.address || "") : ""}`
      );

      if (!extractedExists) {
        console.warn(`[SI][LOOP][${idx}][PRESERVE_LEAD] Detail panel timed out for "${name}". Preserving qualified Mode A lead.`);
        // Fallback: Preserve qualified candidate with complete Mode A data so lead is never lost
        candidate.source = "result_card";
        candidate.extraction_mode = "mode_a_result_cards";
        candidate.runId = activeRunId;
        candidate.sourceQuery = activeQuery;
        chrome.runtime.sendMessage({
          type: "SI_DETAIL_READY",
          index: idx,
          detailLead: candidate,
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

      if (message.type === "SI_TRIGGER_DOWNLOAD") {
        try {
          const a = document.createElement("a");
          a.href = message.url;
          a.download = message.filename || "ramos-export.csv";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message });
        }
        return true;
      }

      return undefined;
    });
  }
})();
