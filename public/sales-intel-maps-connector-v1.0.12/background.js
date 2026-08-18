/**
 * Background Service Worker for Sales Intel Chrome Extension (v1.0.11)
 * Manifest V3 Safe Messaging Architecture with Controlled Content-Script Re-injection.
 * Single Authority for Discovery Session Coordination and Stale Data Prevention.
 */

const getExtensionVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "1.0.12";
  }
};

/**
 * State of the current discovery run.
 */
const discoveryState = {
  active: false,
  status: "idle",
  limit: 10,
  currentIndex: 0,
  tabId: null,
  queue: [],
  records: [],
  activeCandidate: null,
  currentBusiness: null,
  stats: {
    discovered: 0,
    enrichmentStarted: 0,
    clickAttempted: 0,
    detailPanelReady: 0,
    identityVerified: 0,
    enrichmentCompleted: 0,
  },
};

let currentDiscoverySession = {
  id: "session_" + Date.now(),
  searchQuery: null,
  sourceUrl: "",
  startedAt: Date.now(),
};

let lastCompletedName = null;
let lastCompletedPlaceId = null;

function checkAndResetSession(newQuery, newUrl) {
  const normOldQuery = (mapsState.searchQuery || "").trim().toLowerCase();
  const normNewQuery = (newQuery || "").trim().toLowerCase();

  const queryChanged = Boolean(normNewQuery && normOldQuery && normNewQuery !== normOldQuery);

  if (queryChanged) {
    const previousReady = discoveryState.records.length;
    console.log(`[SI][SESSION][RESET]\nreason=maps_search_changed\npreviousQuery=${mapsState.searchQuery}\nnewQuery=${newQuery}`);
    console.log("[SI][SESSION][STATE_RESET]", JSON.stringify({
      previousQuery: mapsState.searchQuery,
      newQuery: newQuery,
      previousReady: previousReady,
      newReady: 0,
    }));

    currentDiscoverySession = {
      id: "session_" + Date.now(),
      searchQuery: newQuery,
      sourceUrl: newUrl || mapsState.url || "",
      startedAt: Date.now(),
    };

    lastCompletedName = null;
    lastCompletedPlaceId = null;

    discoveryState.active = false;
    discoveryState.status = "idle";
    discoveryState.currentIndex = 0;
    discoveryState.queue = [];
    discoveryState.records = [];
    discoveryState.stats = {
      discovered: 0,
      enrichmentStarted: 0,
      clickAttempted: 0,
      detailPanelReady: 0,
      identityVerified: 0,
      enrichmentCompleted: 0,
    };

    broadcastProgress("Search query changed. Ready for new extraction.");
  }
}

/**
 * Background-Owned Maps Page State Cache.
 */
const mapsState = {
  isMaps: false,
  isResults: false,
  cardCount: 0,
  searchQuery: null,
  url: "",
  lastUpdated: 0,
};

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

/**
 * Safely sends runtime messages (to popup/internal listeners) without unhandled promise rejections.
 */
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

/** Broadcasts progress updates to popup UI safely */
function broadcastProgress(statusText) {
  safeSendRuntimeMessage({
    type: "SI_DISCOVERY_PROGRESS",
    status: discoveryState.active ? "running" : discoveryState.status,
    found: discoveryState.records.length,
    processed: discoveryState.records.length,
    stats: discoveryState.stats,
    currentBusiness: discoveryState.currentBusiness,
    records: discoveryState.records,
    statusText,
  });
}

/**
 * Ensures content script files are injected into the Google Maps tab.
 */
async function ensureContentScriptInjected(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || !tab.url.includes("google.com/maps")) {
      return false;
    }
    console.log(`[SI][MSG][REINJECT] tab=${tabId}`);
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
    // Wait briefly for content script initialization
    await new Promise((r) => setTimeout(r, 300));
    return true;
  } catch (err) {
    console.warn(`[SI][MSG][FAILED] reinjection failed tab=${tabId}`, err?.message || err);
    return false;
  }
}

/**
 * Central safe messaging helper for background -> content-script communication.
 * Handles "Receiving end does not exist" via controlled 1-time reinjection and retry.
 */
async function safeSendTabMessage(tabId, message) {
  if (!tabId) return { ok: false, reason: "NO_TAB_ID" };

  console.log(`[SI][MSG][SEND] type=${message?.type || "unknown"}`);

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
    console.log(`[SI][MSG][DISCONNECTED] tab=${tabId}`);
    const injected = await ensureContentScriptInjected(tabId);
    if (injected) {
      console.log(`[SI][MSG][RETRY] type=${message?.type || "unknown"}`);
      result = await sendOnce(tabId, message);
      if (result.ok) {
        console.log(`[SI][MSG][CONNECTED] tab=${tabId}`);
        return result;
      }
    }
  }

  console.log(`[SI][MSG][FAILED] reason=${result.reason || "unknown"}`);
  return result;
}

// ─── TAB NAVIGATION & LIFECYCLE LISTENERS ───────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === discoveryState.tabId && changeInfo.status === "loading") {
    console.log(`[SI][MSG][DISCONNECTED] tab=${tabId}`);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === discoveryState.tabId) {
    console.log(`[SI][MSG][DISCONNECTED] tab=${tabId}`);
    discoveryState.active = false;
    discoveryState.tabId = null;
  }
});

// ─── DEDUPLICATION HELPER ───────────────────────────────────────────────────

function deduplicateLeads(leads) {
  if (!Array.isArray(leads)) return [];
  const seen = new Set();
  const unique = [];

  for (const lead of leads) {
    if (!lead) continue;
    const placeKey = lead.place_id ? `place:${lead.place_id}` : null;
    const urlKey = lead.source_url ? `url:${lead.source_url.toLowerCase().trim()}` : null;
    const nameAddrKey =
      lead.company_name && lead.address
        ? `nameaddr:${lead.company_name.toLowerCase().trim()}|${lead.address.toLowerCase().trim()}`
        : null;
    const phone = (lead.phone || "").replace(/\D/g, "");
    const namePhoneKey =
      lead.company_name && phone.length >= 6
        ? `namephone:${lead.company_name.toLowerCase().trim()}|${phone}`
        : null;

    const key = placeKey || urlKey || nameAddrKey || namePhoneKey || `name:${lead.company_name?.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(lead);
    }
  }

  if (unique.length < leads.length) {
    console.log(
      "[SI][DEDUP]",
      JSON.stringify({
        before: leads.length,
        after: unique.length,
        removed: leads.length - unique.length,
      })
    );
  }

  return unique;
}

/** Processes current active candidate or advances to completion */
async function processNextCandidate() {
  if (!discoveryState.active) return;

  if (
    discoveryState.currentIndex >= discoveryState.queue.length ||
    discoveryState.records.length >= discoveryState.limit
  ) {
    discoveryState.active = false;
    discoveryState.status = "completed";
    discoveryState.records = deduplicateLeads(discoveryState.records);
    const summary = {
      discovered: discoveryState.stats.discovered,
      processed: discoveryState.currentIndex,
      succeeded: discoveryState.records.length,
      failed: Math.max(0, discoveryState.currentIndex - discoveryState.records.length),
      records: discoveryState.records.length,
    };
    console.log("[SI][EXTRACTION][SUMMARY]", JSON.stringify(summary));
    console.log("[SI][LOOP][SUMMARY]", JSON.stringify(discoveryState.stats));
    broadcastProgress("Discovery & enrichment complete.");
    return;
  }

  const idx = discoveryState.currentIndex + 1;
  const candidate = discoveryState.queue[discoveryState.currentIndex];
  discoveryState.activeCandidate = candidate;
  discoveryState.currentBusiness = { name: candidate.company_name };

  discoveryState.stats.enrichmentStarted++;
  console.log(`[SI][EXTRACTION][CANDIDATE]\nindex=${idx}\nname=${candidate.company_name}`);
  console.log(`[SI][EXTRACTION][ENRICH_START]\nindex=${idx}\nname=${candidate.company_name}`);
  console.log(`[SI][LOOP][${idx}][START]\nname=${candidate.company_name}`);

  broadcastProgress(`[LOOP ${idx}/${discoveryState.limit}] ${candidate.company_name}`);

  if (discoveryState.tabId) {
    const res = await safeSendTabMessage(discoveryState.tabId, {
      type: "ENRICH_CURRENT_CANDIDATE",
      candidate,
      index: idx,
      previousName: lastCompletedName,
    });
    if (!res.ok) {
      console.warn(`[SI][LOOP][${idx}][FAILED] candidate dispatch failed reason=${res.reason}`);
    }
  }
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
    const leads = message.leads || [];
    sendBatchImportToBackend(leads).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  // --- GET_MAPS_STATE ---
  if (message.type === "GET_MAPS_STATE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
        sendResponse({
          ok: true,
          mapsDetected: false,
          cardCount: mapsState.cardCount,
          searchQuery: mapsState.searchQuery,
          running: discoveryState.active,
          stats: discoveryState.stats,
          currentBusiness: discoveryState.currentBusiness,
          readyCount: discoveryState.records.length,
          records: discoveryState.records,
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

      console.log(`[SI][MSG][RESPONSE] type=GET_MAPS_STATE ok=true cards=${mapsState.cardCount}`);
      sendResponse({
        ok: true,
        mapsDetected: mapsState.isMaps,
        cardCount: mapsState.cardCount,
        searchQuery: mapsState.searchQuery,
        running: discoveryState.active,
        stats: discoveryState.stats,
        currentBusiness: discoveryState.currentBusiness,
        readyCount: discoveryState.records.length,
        records: discoveryState.records,
        discoverySessionId: currentDiscoverySession.id,
      });
    });
    return true;
  }

  // --- SI_CONTENT_READY / CONTENT_SCRIPT_READY ---
  if (message.type === "SI_CONTENT_READY" || message.type === "CONTENT_SCRIPT_READY") {
    const tabId = sender?.tab?.id || message.tabId;
    if (tabId) {
      discoveryState.tabId = tabId;
      console.log(`[SI][MSG][READY] tab=${tabId}`);
      console.log(`[SI][MSG][CONNECTED] tab=${tabId}`);
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

    if (discoveryState.active && discoveryState.activeCandidate) {
      const idx = discoveryState.currentIndex + 1;
      console.log(
        `[SI][LIFECYCLE][CONTENT_RECONNECTED] candidate=${idx} name=${discoveryState.activeCandidate.company_name}`
      );

      if (tabId) {
        safeSendTabMessage(tabId, {
          type: "ENRICH_CURRENT_CANDIDATE",
          candidate: discoveryState.activeCandidate,
          index: idx,
          previousName: lastCompletedName,
        });
      }
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
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
        sendResponse({ ok: false, error: "No active Google Maps tab found." });
        return;
      }

      const activeTabId = tabs[0].id;
      const requestedLimit = Math.min(Math.max(Number(message.limit) || 10, 1), 50);

      // Initialize fresh discovery session
      currentDiscoverySession = {
        id: "session_" + Date.now(),
        searchQuery: mapsState.searchQuery,
        sourceUrl: mapsState.url,
        startedAt: Date.now(),
      };

      lastCompletedName = null;
      lastCompletedPlaceId = null;

      discoveryState.tabId = activeTabId;
      discoveryState.active = true;
      discoveryState.status = "running";
      discoveryState.limit = requestedLimit;
      discoveryState.currentIndex = 0;
      discoveryState.queue = [];
      discoveryState.records = [];
      discoveryState.stats = {
        discovered: 0,
        enrichmentStarted: 0,
        clickAttempted: 0,
        detailPanelReady: 0,
        identityVerified: 0,
        enrichmentCompleted: 0,
      };

      const res = await safeSendTabMessage(activeTabId, { type: "BUILD_DISCOVERY_QUEUE", limit: discoveryState.limit });

      if (!res || !res.ok) {
        discoveryState.active = false;
        sendResponse({ ok: false, error: "Failed to query Google Maps candidates." });
        return;
      }

      discoveryState.queue = res.queue || [];
      discoveryState.stats.discovered = discoveryState.queue.length;

      console.log(`[SI][EXTRACTION][CARDS]\ncount=${discoveryState.queue.length}`);
      console.log(`[SI][EXTRACTION][QUALIFIED]\ncount=${discoveryState.queue.length}`);

      if (discoveryState.queue.length === 0) {
        discoveryState.active = false;
        discoveryState.status = "completed";
        sendResponse({ ok: true, records: [], stats: discoveryState.stats });
        return;
      }

      sendResponse({ ok: true, stats: discoveryState.stats });
      processNextCandidate();
    });
    return true;
  }

  // --- SI_STOP_DISCOVERY ---
  if (message.type === "SI_STOP_DISCOVERY") {
    discoveryState.active = false;
    discoveryState.status = "cancelled";
    broadcastProgress("Discovery stopped by user.");
    sendResponse({ ok: true });
    return false;
  }

  // --- SI_CLICK_ATTEMPTED ---
  if (message.type === "SI_CLICK_ATTEMPTED") {
    const idx = message.index || discoveryState.currentIndex + 1;
    const candidateName = message.name || (discoveryState.activeCandidate ? discoveryState.activeCandidate.company_name : "");
    discoveryState.stats.clickAttempted++;
    console.log(`[SI][LOOP][${idx}][CLICK]\nname=${candidateName}`);
    sendResponse({ ok: true });
    return false;
  }

  // --- SI_DETAIL_READY ---
  if (message.type === "SI_DETAIL_READY") {
    const idx = message.index || discoveryState.currentIndex + 1;
    const detailLead = message.detailLead;
    const candidateName = detailLead ? detailLead.company_name : "";

    console.log(`[SI][EXTRACTION][ENRICH_RESULT]\nindex=${idx}\nname=${candidateName}\nsuccess=true`);
    console.log(`[SI][LOOP][${idx}][DETAIL_READY]\nname=${candidateName}`);
    console.log(`[SI][LOOP][${idx}][IDENTITY_OK]\nname=${candidateName}`);

    const detailSummary = {
      company_name: detailLead.company_name,
      address: detailLead.address || null,
      phone: detailLead.phone || null,
      website: detailLead.website || null,
      opening_status: detailLead.opening_status || null,
    };
    console.log(`[SI][LOOP][${idx}][DETAIL_DATA]`, JSON.stringify(detailSummary));
    console.log(`[SI][LOOP][${idx}][COMPLETE]\nname=${candidateName}`);
    console.log(`[SI][EXTRACTION][CANDIDATE_COMPLETE]\nindex=${idx}\nname=${candidateName}`);

    discoveryState.stats.detailPanelReady++;
    discoveryState.stats.identityVerified++;
    discoveryState.stats.enrichmentCompleted++;

    if (detailLead) {
      detailLead.source = "detail";
      detailLead.discoverySessionId = currentDiscoverySession.id;
      detailLead.searchQuery = currentDiscoverySession.searchQuery || mapsState.searchQuery || "";
      if (!detailLead.source_url) {
        detailLead.source_url = currentDiscoverySession.sourceUrl || mapsState.url || "";
      }

      const isDuplicate = discoveryState.records.some((rec) => {
        if (rec.place_id && detailLead.place_id && rec.place_id === detailLead.place_id) return true;
        if (rec.source_url && detailLead.source_url && rec.source_url === detailLead.source_url) return true;
        const normNameA = (rec.company_name || "").trim().toLowerCase();
        const normNameB = (detailLead.company_name || "").trim().toLowerCase();
        const normAddrA = (rec.address || "").trim().toLowerCase();
        const normAddrB = (detailLead.address || "").trim().toLowerCase();
        if (normNameA === normNameB && normAddrA && normAddrB && normAddrA === normAddrB) return true;
        const normPhoneA = (rec.phone || "").replace(/\D/g, "");
        const normPhoneB = (detailLead.phone || "").replace(/\D/g, "");
        if (normNameA === normNameB && normPhoneA.length >= 6 && normPhoneA === normPhoneB) return true;
        return false;
      });

      if (isDuplicate) {
        console.warn(`[SI][LOOP][${idx}][DUPLICATE_REJECTED]\nname=${candidateName}`);
      } else {
        lastCompletedName = detailLead.company_name;
        lastCompletedPlaceId = detailLead.place_id;
        discoveryState.records.push(detailLead);
        discoveryState.currentBusiness = {
          name: detailLead.company_name,
          address: detailLead.address,
          phone: detailLead.phone,
          website: detailLead.website,
          rating: detailLead.rating,
          opening_status: detailLead.opening_status,
        };
        broadcastProgress(`[LOOP ${idx}/${discoveryState.limit}] ${candidateName} ✓`);
      }
    }

    discoveryState.currentIndex++;
    sendResponse({ ok: true });
    processNextCandidate();
    return false;
  }

  // --- SI_CANDIDATE_FAILED ---
  if (message.type === "SI_CANDIDATE_FAILED") {
    const idx = message.index || discoveryState.currentIndex + 1;
    const name = message.name || (discoveryState.activeCandidate ? discoveryState.activeCandidate.company_name : "");
    console.log(`[SI][EXTRACTION][ENRICH_RESULT]\nindex=${idx}\nname=${name}\nsuccess=false`);
    console.log(`[SI][EXTRACTION][FAILED]\nstage=detail_panel_enrichment\nindex=${idx}\nname=${name}`);
    console.log(`[SI][LOOP][${idx}][FAILED] name=${name} reason=${message.reason || "detail_panel_timeout"}`);

    discoveryState.currentIndex++;
    sendResponse({ ok: true });
    processNextCandidate();
    return false;
  }

  return undefined;
});
