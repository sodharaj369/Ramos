/**
 * Background Service Worker for Sales Intel Chrome Extension (v1.0.15)
 * Manifest V3 Safe Messaging Architecture with Resilient Content-Script Reconnection.
 * Single Authority for Discovery Session & Run State Isolation.
 */

const getExtensionVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "1.0.15";
  }
};

function generateRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

/**
 * Single Authoritative Run State for Discovery, Enrichment, and Export.
 */
let currentRun = {
  runId: generateRunId(),
  query: null,
  sourceQuery: null,
  requestedLimit: 10,
  candidates: [],
  enrichedLeads: [],
  readyLeads: [],
  failedLeads: [],
  status: "idle", // 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'
  startedAt: Date.now(),
};

const discoveryState = {
  active: false,
  status: "idle",
  tabId: null,
};

const mapsState = {
  isMaps: false,
  isResults: false,
  cardCount: 0,
  searchQuery: null,
  url: "",
  lastUpdated: 0,
};

let lastCompletedName = null;
let lastCompletedPlaceId = null;
const processedPlaceIds = new Set();

function normalizeQuery(q) {
  if (!q || typeof q !== "string") return "";
  return q.toLowerCase().replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function startNewRun(query, limit) {
  const newRunId = generateRunId();
  const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const canonicalQuery = normalizeQuery(query) || query || null;

  console.log(`[SI][RUN_CREATED] runId=${newRunId} sourceQuery="${canonicalQuery || ""}" limit=${requestedLimit}`);

  currentRun = {
    runId: newRunId,
    query: canonicalQuery,
    sourceQuery: canonicalQuery,
    requestedLimit: requestedLimit,
    candidates: [],
    enrichedLeads: [],
    readyLeads: [],
    failedLeads: [],
    status: "running",
    startedAt: Date.now(),
  };

  processedPlaceIds.clear();
  lastCompletedName = null;
  lastCompletedPlaceId = null;

  return currentRun;
}

function checkAndResetSession(newQuery, newUrl) {
  const normOldQuery = normalizeQuery(mapsState.searchQuery);
  const normNewQuery = normalizeQuery(newQuery);

  const queryChanged = Boolean(normNewQuery && normOldQuery && normNewQuery !== normOldQuery);

  if (queryChanged) {
    console.log(`[SI][SESSION] RESET queryChanged=true previousQuery="${mapsState.searchQuery}" newQuery="${newQuery}"`);
    mapsState.searchQuery = newQuery;
    mapsState.url = newUrl || mapsState.url;

    startNewRun(newQuery, currentRun.requestedLimit || 10);
    currentRun.status = "idle";

    broadcastProgress("Search query changed. Ready for new extraction.");
  } else {
    if (newQuery) mapsState.searchQuery = newQuery;
    mapsState.url = newUrl || mapsState.url;
  }
}

// ─── AUTH STORAGE HELPERS ───────────────────────────────────────────────────

async function getAuthData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["si_token", "si_email", "si_api_base"], (result) => {
      resolve({
        token: result.si_token || null,
        email: result.si_email || null,
        apiBase: result.si_api_base || "http://localhost:8080",
      });
    });
  });
}

async function setAuthData(token, email, apiBase) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        si_token: token,
        si_email: email,
        si_api_base: apiBase || "http://localhost:8080",
      },
      resolve
    );
  });
}

async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["si_token", "si_email", "si_api_base"], resolve);
  });
}

function resolveApiBase(apiBase) {
  if (!apiBase) return "http://localhost:8080";
  if (apiBase.includes("localhost:5173") || apiBase.includes("localhost:3000") || apiBase.includes("localhost:4173")) {
    return "http://localhost:8080";
  }
  return apiBase;
}

async function sendBatchImportToBackend(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    return { ok: false, error: "No leads provided for import." };
  }

  const { token, apiBase } = await getAuthData();
  const base = resolveApiBase(apiBase);
  const endpoint = `${base}/api/public/extension/import`;

  const importPayloads = leads.map((lead) => {
    return self.SalesIntelSchema ? self.SalesIntelSchema.toBackendImportPayload(lead) : lead;
  });

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ leads: importPayloads }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || errJson.message || `HTTP error ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, imported: data.created || data.processed || importPayloads.length, data };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Network error" };
  }
}

// ─── SAFE MESSAGING HELPERS (MV3 Resilient) ─────────────────────────────────

function safeSendRuntimeMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        if (typeof callback === "function") callback({ ok: false, reason: "NOT_CONNECTED", error: err.message });
      } else {
        if (typeof callback === "function") callback(res || { ok: true });
      }
    });
  } catch (syncErr) {
    if (typeof callback === "function") callback({ ok: false, reason: "NOT_CONNECTED", error: syncErr?.message });
  }
}

function getExportableLeads() {
  const ready = currentRun.readyLeads.filter(
    (lead) => lead.runId === currentRun.runId && normalizeQuery(lead.sourceQuery) === normalizeQuery(currentRun.sourceQuery)
  );

  console.log(
    `[SI][EXPORT] runId=${currentRun.runId} query="${currentRun.query || ""}" requestedLimit=${currentRun.requestedLimit} candidates=${currentRun.candidates.length} ready=${ready.length} exporting=${ready.length}`
  );

  if (ready.length > currentRun.requestedLimit) {
    throw new Error(`EXPORT_LIMIT_VIOLATION ready=${ready.length} limit=${currentRun.requestedLimit}`);
  }

  return ready;
}

function getRunStats() {
  return {
    discovered: currentRun.candidates.length,
    enrichmentStarted: currentRun.readyLeads.length + currentRun.failedLeads.length,
    clickAttempted: currentRun.readyLeads.length + currentRun.failedLeads.length,
    detailPanelReady: currentRun.readyLeads.length,
    identityVerified: currentRun.readyLeads.length,
    enrichmentCompleted: currentRun.readyLeads.length,
    enrichmentFailed: currentRun.failedLeads.length,
  };
}

function broadcastProgress(statusText) {
  const readyLeads = getExportableLeads();
  safeSendRuntimeMessage({
    type: "SI_DISCOVERY_PROGRESS",
    status: currentRun.status,
    found: currentRun.candidates.length,
    processed: readyLeads.length,
    stats: getRunStats(),
    currentBusiness: currentRun.readyLeads[currentRun.readyLeads.length - 1] || null,
    records: readyLeads,
    runId: currentRun.runId,
    statusText,
  });
}

async function ensureContentScriptInjected(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || !tab.url.includes("google.com/maps")) {
      return false;
    }
    console.log(`[SI][MSG] REINJECT tab=${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "shared/constants.js",
        "shared/environment.js",
        "shared/schema.js",
        "content/maps/dom-utils.js",
        "content/maps/selectors.js",
        "content/maps/validators.js",
        "content/maps/address-parser.js",
        "content/maps/result-card-extractor.js",
        "content/maps/detail-extractor.js",
        "content/maps/maps-adapter.js",
        "discovery.js",
      ],
    });
    await new Promise((r) => setTimeout(r, 300));
    return true;
  } catch (err) {
    console.warn(`[SI][MSG] REINJECT_FAILED tab=${tabId}`, err?.message || err);
    return false;
  }
}

async function safeSendTabMessage(tabId, message) {
  if (!tabId) return { ok: false, reason: "NO_TAB_ID" };

  const sendOnce = (id, msg) => {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(id, msg, (res) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            const errMsg = lastErr.message || String(lastErr);
            if (errMsg.includes("Receiving end does not exist") || errMsg.includes("Could not establish connection")) {
              resolve({ ok: false, reason: "CONTENT_SCRIPT_NOT_CONNECTED", error: errMsg });
            } else {
              resolve({ ok: false, reason: "TABS_MESSAGE_ERROR", error: errMsg });
            }
          } else {
            resolve(res || { ok: true });
          }
        });
      } catch (syncErr) {
        resolve({ ok: false, reason: "SYNC_EXCEPTION", error: syncErr?.message || String(syncErr) });
      }
    });
  };

  let result = await sendOnce(tabId, message);
  if (result.ok) return result;

  if (result.reason === "CONTENT_SCRIPT_NOT_CONNECTED") {
    const injected = await ensureContentScriptInjected(tabId);
    if (injected) {
      result = await sendOnce(tabId, message);
      if (result.ok) {
        return result;
      }
    }
  }

  return result;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === discoveryState.tabId && changeInfo.status === "loading") {
    console.log(`[SI][MSG] DISCONNECTED tab=${tabId}`);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === discoveryState.tabId) {
    console.log(`[SI][MSG] DISCONNECTED tab=${tabId}`);
    currentRun.status = "cancelled";
    discoveryState.tabId = null;
  }
});

async function processNextCandidateInRun(index) {
  if (currentRun.status !== "running") return;

  const totalCandidates = currentRun.candidates.length;

  if (index >= totalCandidates || currentRun.readyLeads.length + currentRun.failedLeads.length >= totalCandidates) {
    currentRun.status = "completed";
    const readyLeads = getExportableLeads();

    console.log(
      `[SI][RUN] ENRICHMENT_COMPLETE runId=${currentRun.runId} selected=${totalCandidates} ready=${readyLeads.length} failed=${currentRun.failedLeads.length}`
    );

    broadcastProgress("Discovery & enrichment complete.");
    return;
  }

  const candidate = currentRun.candidates[index];
  const idx = index + 1;

  console.log(`[SI][ENRICH] ${idx}/${totalCandidates} START name="${candidate.company_name}"`);
  broadcastProgress(`[LOOP ${idx}/${totalCandidates}] ${candidate.company_name}`);

  if (discoveryState.tabId) {
    const res = await safeSendTabMessage(discoveryState.tabId, {
      type: "ENRICH_CURRENT_CANDIDATE",
      candidate,
      index: idx,
      previousName: lastCompletedName,
      runId: currentRun.runId,
      sourceQuery: currentRun.sourceQuery,
    });
    if (!res.ok) {
      console.warn(`[SI][ENRICH] ${idx} dispatch failed reason=${res.reason}`);
      // Mark candidate failed and continue
      handleCandidateFailure(candidate, index, "dispatch_failed");
    }
  }
}

function handleCandidateFailure(candidate, index, reason) {
  const failedLead = {
    ...candidate,
    runId: currentRun.runId,
    sourceQuery: currentRun.sourceQuery,
    enrichmentStatus: "failed",
    reason: reason || "failed",
  };
  currentRun.failedLeads.push(failedLead);
  console.log(`[SI][ENRICH] ${index + 1}/${currentRun.candidates.length} FAILED name="${candidate.company_name}" reason=${reason}`);
  processNextCandidateInRun(index + 1);
}

// ─── RUNTIME MESSAGE DISPATCHER ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  // --- SI_CONNECT ---
  if (message.type === "SI_CONNECT") {
    const session = message.session || {};
    const token = session.access_token || message.token || null;
    const email = session.email || message.email || null;
    const apiBase = message.apiBase || null;
    setAuthData(token, email, apiBase).then(() => {
      console.log("[SI][CONNECTION] Connected:", email, "via", apiBase);
      sendResponse({ ok: true, connected: true, version: getExtensionVersion() });
    });
    return true;
  }

  // --- SI_DISCONNECT ---
  if (message.type === "SI_DISCONNECT") {
    clearAuth().then(() => {
      console.log("[SI][CONNECTION] Disconnected");
      sendResponse({ ok: true, connected: false });
    });
    return true;
  }

  // --- SI_GET_STATUS ---
  if (message.type === "SI_GET_STATUS") {
    getAuthData().then(({ token, email, apiBase }) => {
      sendResponse({
        ok: true,
        connected: Boolean(token),
        email,
        apiBase,
        version: getExtensionVersion(),
      });
    });
    return true;
  }

  // --- SI_BATCH_IMPORT ---
  if (message.type === "SI_BATCH_IMPORT") {
    const leads = getExportableLeads();
    sendBatchImportToBackend(leads).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  // --- GET_DISCOVERY_STATE / GET_MAPS_STATE ---
  if (message.type === "GET_DISCOVERY_STATE" || message.type === "GET_MAPS_STATE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const readyLeads = getExportableLeads();
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
        sendResponse({
          ok: true,
          mapsDetected: false,
          cardCount: mapsState.cardCount,
          searchQuery: mapsState.searchQuery,
          running: currentRun.status === "running",
          stats: getRunStats(),
          readyCount: readyLeads.length,
          records: readyLeads,
          runId: currentRun.runId,
        });
        return;
      }

      const activeTabId = tabs[0].id;
      const csRes = await safeSendTabMessage(activeTabId, { type: "SI_PAGE_STATE" });

      if (csRes && csRes.ok) {
        if (csRes.query) {
          checkAndResetSession(csRes.query, csRes.url);
        }
        mapsState.isMaps = csRes.isMaps;
        mapsState.isResults = csRes.isResults;
        mapsState.searchQuery = csRes.query;
        mapsState.cardCount = csRes.detected || 0;
        mapsState.url = csRes.url || "";
        mapsState.lastUpdated = Date.now();
      }

      sendResponse({
        ok: true,
        mapsDetected: mapsState.isMaps,
        cardCount: mapsState.cardCount,
        searchQuery: mapsState.searchQuery,
        running: currentRun.status === "running",
        stats: getRunStats(),
        readyCount: readyLeads.length,
        records: readyLeads,
        runId: currentRun.runId,
      });
    });
    return true;
  }

  // --- SI_CONTENT_READY / CONTENT_SCRIPT_READY ---
  if (message.type === "SI_CONTENT_READY" || message.type === "CONTENT_SCRIPT_READY") {
    const tabId = sender?.tab?.id || message.tabId;
    if (tabId) {
      discoveryState.tabId = tabId;
    }

    if (message.searchQuery) {
      checkAndResetSession(message.searchQuery, message.url);
    }

    if (message.cardCount != null) {
      mapsState.isMaps = Boolean(message.isMaps);
      if (message.cardCount > 0 || !mapsState.cardCount) {
        mapsState.cardCount = message.cardCount;
      }
      mapsState.searchQuery = message.searchQuery || mapsState.searchQuery;
      mapsState.url = message.url || mapsState.url;
      mapsState.lastUpdated = Date.now();
    }

    sendResponse({ ok: true });
    return false;
  }

  // --- SI_PAGE_STATE_UPDATE ---
  if (message.type === "SI_PAGE_STATE_UPDATE") {
    if (message.searchQuery) {
      checkAndResetSession(message.searchQuery, message.url);
    }

    if (message.cardCount != null) {
      mapsState.isMaps = Boolean(message.isMaps);
      mapsState.isResults = Boolean(message.isResults);
      mapsState.cardCount = message.cardCount;
      mapsState.searchQuery = message.searchQuery || mapsState.searchQuery;
      mapsState.url = message.url || mapsState.url;
      mapsState.lastUpdated = Date.now();
    }
    sendResponse({ ok: true });
    return false;
  }

  // --- SI_START_DISCOVERY ---
  if (message.type === "SI_START_DISCOVERY") {
    const getTargetTab = () =>
      new Promise((resolve) => {
        if (message.tabId) {
          chrome.tabs.get(message.tabId, (t) => resolve(t || null));
          return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length && tabs[0].id) {
            resolve(tabs[0]);
          } else {
            chrome.tabs.query({ url: "*://*.google.com/maps*" }, (allMapsTabs) => {
              resolve(allMapsTabs && allMapsTabs.length ? allMapsTabs[0] : null);
            });
          }
        });
      });

    getTargetTab().then(async (targetTab) => {
      if (!targetTab || !targetTab.id) {
        sendResponse({ ok: false, error: "No active Google Maps tab found." });
        return;
      }

      const activeTabId = targetTab.id;
      const requestedLimit = Math.min(Math.max(Number(message.limit) || 10, 1), 50);

      // Resolve live page query synchronously from content script before creating run
      let pageQuery = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const pageStateRes = await safeSendTabMessage(activeTabId, { type: "SI_PAGE_STATE" });
        if (pageStateRes && pageStateRes.ok && pageStateRes.query) {
          pageQuery = pageStateRes.query;
          break;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 350));
      }

      const resolvedQuery = pageQuery || mapsState.searchQuery || message.query || null;
      const canonicalQuery = normalizeQuery(resolvedQuery) || resolvedQuery;

      console.log(
        `[SI][QUERY_STATE] pageQuery="${pageQuery || ""}" mapsState.searchQuery="${mapsState.searchQuery || ""}" canonicalQuery="${canonicalQuery || ""}"`
      );
      console.log(
        `[SI][START_DISCOVERY] requestedQuery="${message.query || ""}" resolvedQuery="${resolvedQuery || ""}" canonicalQuery="${canonicalQuery || ""}" runId=${currentRun.runId}`
      );

      if (!canonicalQuery) {
        currentRun.status = "failed";
        sendResponse({ ok: false, error: "No search query detected on Google Maps. Please perform a search first." });
        broadcastProgress("No search query detected.");
        return;
      }

      mapsState.searchQuery = canonicalQuery;

      // Start completely fresh run with canonical query
      startNewRun(canonicalQuery, requestedLimit);
      discoveryState.tabId = activeTabId;

      const res = await safeSendTabMessage(activeTabId, {
        type: "BUILD_DISCOVERY_QUEUE",
        limit: currentRun.requestedLimit,
        runId: currentRun.runId,
        sourceQuery: currentRun.sourceQuery,
      });

      console.log(`[SI][START_DISCOVERY] BUILD_DISCOVERY_QUEUE res=${JSON.stringify(res)}`);

      if (!res || !res.ok) {
        currentRun.status = "failed";
        sendResponse({ ok: false, error: "Failed to query Google Maps candidates." });
        return;
      }

      const rawDiscovered = res.queue || [];
      console.log(`[SI][RUN] DISCOVERED count=${rawDiscovered.length}`);

      // Apply requested limit ONCE
      const selected = rawDiscovered.slice(0, currentRun.requestedLimit);
      console.log(`[SI][RUN] LIMITED count=${selected.length}`);

      currentRun.candidates = selected.map((c) => ({
        ...c,
        runId: currentRun.runId,
        sourceQuery: currentRun.sourceQuery,
      }));

      if (currentRun.candidates.length === 0) {
        currentRun.status = "completed";
        sendResponse({ ok: true, records: [], stats: getRunStats() });
        broadcastProgress("No candidates discovered.");
        return;
      }

      sendResponse({ ok: true, stats: getRunStats() });
      processNextCandidateInRun(0);
    });
    return true;
  }

  // --- SI_STOP_DISCOVERY ---
  if (message.type === "SI_STOP_DISCOVERY") {
    currentRun.status = "cancelled";
    broadcastProgress("Discovery stopped by user.");
    sendResponse({ ok: true });
    return false;
  }

  // --- SI_CLICK_ATTEMPTED ---
  if (message.type === "SI_CLICK_ATTEMPTED") {
    sendResponse({ ok: true });
    return false;
  }

  // --- SI_DETAIL_READY ---
  if (message.type === "SI_DETAIL_READY") {
    const runId = message.runId || message.sessionId;
    const sourceQuery = message.sourceQuery;

    const normRunQuery = normalizeQuery(currentRun.sourceQuery);
    const normMsgQuery = normalizeQuery(sourceQuery);

    console.log(
      `[SI][DETAIL_READY] runId=${runId} sourceQuery="${sourceQuery || ""}" currentRunId=${currentRun.runId} currentRunSourceQuery="${currentRun.sourceQuery || ""}"`
    );

    // Hard Stale Guard: Ignore any response that does not match the active currentRun
    if (runId !== currentRun.runId || (normMsgQuery && normRunQuery && normMsgQuery !== normRunQuery)) {
      console.log(
        `[SI][STALE_RESPONSE] reason=query_or_run_mismatch responseRunId=${runId} currentRunId=${currentRun.runId} responseSourceQuery="${sourceQuery}" currentRunSourceQuery="${currentRun.sourceQuery}"`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }

    const index = (message.index || 1) - 1;
    const candidate = currentRun.candidates[index] || {};
    const detailLead = message.detailLead || {};

    const mergedLead = {
      ...candidate,
      ...detailLead,
      runId: currentRun.runId,
      sourceQuery: currentRun.sourceQuery,
      enrichmentStatus: "complete",
      enrichedAt: new Date().toISOString(),
    };

    const placeId = mergedLead.place_id;
    if (placeId && processedPlaceIds.has(placeId)) {
      console.log(`[SI][ENRICH] ${index + 1} DUPLICATE_SKIPPED placeId=${placeId}`);
      currentRun.failedLeads.push({
        ...candidate,
        runId: currentRun.runId,
        sourceQuery: currentRun.sourceQuery,
        enrichmentStatus: "duplicate_skipped",
      });
    } else {
      if (placeId) processedPlaceIds.add(placeId);
      lastCompletedName = mergedLead.company_name;
      lastCompletedPlaceId = mergedLead.place_id;
      currentRun.readyLeads.push(mergedLead);

      console.log(
        `[SI][ENRICH] ${index + 1}/${currentRun.candidates.length} COMPLETE name="${mergedLead.company_name}" phone=${Boolean(mergedLead.phone)} website=${Boolean(mergedLead.website)} address=${Boolean(mergedLead.address)}`
      );

      broadcastProgress(`[LOOP ${currentRun.readyLeads.length}/${currentRun.candidates.length}] ${mergedLead.company_name} ✓`);
    }

    sendResponse({ ok: true });

    console.log(`[SI][QUEUE_ADVANCE] completedCandidate="${mergedLead.company_name}" nextCandidateIndex=${index + 1}`);
    processNextCandidateInRun(index + 1);
    return false;
  }

  // --- SI_CANDIDATE_FAILED ---
  if (message.type === "SI_CANDIDATE_FAILED") {
    const runId = message.runId || message.sessionId;
    if (runId !== currentRun.runId) {
      sendResponse({ ok: true, ignored: true });
      return false;
    }

    const index = (message.index || 1) - 1;
    const candidate = currentRun.candidates[index] || {};
    handleCandidateFailure(candidate, index, message.reason || "enrichment_failed");
    sendResponse({ ok: true });
    return false;
  }

  return undefined;
});
