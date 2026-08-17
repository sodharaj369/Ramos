/**
 * Background Service Worker for Sales Intel Chrome Extension (v1.0.3).
 * Stable coordinator for messaging, auth handshake, and single-owner discovery state.
 */
importScripts("shared/constants.js", "shared/environment.js", "shared/schema.js");

const getExtensionVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "1.0.5";
  }
};

const STORAGE_KEYS = {
  TOKEN: "sales_intel_token",
  USER: "sales_intel_user",
  API_BASE: "sales_intel_api_base",
};

/**
 * Background-Owned Discovery Orchestrator State.
 */
const discoveryState = {
  active: false,
  tabId: null,
  limit: 2,
  currentIndex: 0,
  queue: [],
  records: [],
  stats: {
    discovered: 0,
    enrichmentStarted: 0,
    clickAttempted: 0,
    detailPanelReady: 0,
    identityVerified: 0,
    enrichmentCompleted: 0,
  },
  activeCandidate: null,
  status: "idle", // "idle" | "running" | "completed" | "cancelled"
  currentBusiness: null,
};

/**
 * Background-Owned Maps Page State Cache.
 * Survives content script re-injections & tab reloads!
 */
const mapsState = {
  isMaps: false,
  isResults: false,
  searchQuery: null,
  cardCount: 0,
  url: "",
  lastUpdated: 0,
};

async function getAuthData() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.USER,
    STORAGE_KEYS.API_BASE,
  ]);
  return {
    token: data[STORAGE_KEYS.TOKEN] || null,
    user: data[STORAGE_KEYS.USER] || null,
    apiBase: data[STORAGE_KEYS.API_BASE] || null,
  };
}

async function setAuthData(token, user, apiBase) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.TOKEN]: token || null,
    [STORAGE_KEYS.USER]: user || null,
    [STORAGE_KEYS.API_BASE]: apiBase || null,
  });
}

async function clearAuth() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.USER,
    STORAGE_KEYS.API_BASE,
  ]);
}

function resolveApiBase(apiBase) {
  if (!apiBase) {
    if (self.SalesIntelEnv) {
      const detected = self.SalesIntelEnv.resolveEnvironment(null, null);
      return detected.origin;
    }
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

/** Broadcasts progress updates to popup UI */
function broadcastProgress(statusText) {
  try {
    chrome.runtime.sendMessage({
      type: "SI_DISCOVERY_PROGRESS",
      status: discoveryState.active ? "running" : discoveryState.status,
      found: discoveryState.records.length,
      processed: discoveryState.records.length,
      stats: discoveryState.stats,
      currentBusiness: discoveryState.currentBusiness,
      records: discoveryState.records,
      statusText,
    });
  } catch {
    /* Popup might be closed */
  }
}

/** Processes current active candidate or advances to completion */
function processNextCandidate() {
  if (!discoveryState.active) return;

  if (
    discoveryState.currentIndex >= discoveryState.queue.length ||
    discoveryState.records.length >= discoveryState.limit
  ) {
    discoveryState.active = false;
    discoveryState.status = "completed";
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
    chrome.tabs.sendMessage(discoveryState.tabId, {
      type: "ENRICH_CURRENT_CANDIDATE",
      candidate,
      index: idx,
    });
  }
}

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

  // --- SI_CONNECTION_STATE ---
  if (message.type === "SI_CONNECTION_STATE") {
    getAuthData().then(({ token, user, apiBase }) => {
      sendResponse({
        installed: true,
        connected: Boolean(token),
        email: user || null,
        apiBase: apiBase || null,
        version: getExtensionVersion(),
      });
    });
    return true;
  }

  // --- SI_GET_STATUS ---
  if (message.type === "SI_GET_STATUS") {
    getAuthData().then(({ token, user, apiBase }) => {
      sendResponse({
        ok: true,
        connected: Boolean(token),
        user: user || (token ? "Connected User" : null),
        apiBase: apiBase || null,
      });
    });
    return true;
  }

  // --- SI_BATCH_IMPORT ---
  if (message.type === "SI_BATCH_IMPORT") {
    sendBatchImportToBackend(message.leads).then(sendResponse);
    return true;
  }

  // --- GET_MAPS_STATE (Requested by Popup) ---
  if (message.type === "GET_MAPS_STATE" || message.type === "SI_PAGE_STATE") {
    console.log("[SI][MSG][REQUEST] type=GET_MAPS_STATE");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
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
        });
        return;
      }

      const activeTabId = tabs[0].id;

      chrome.tabs.sendMessage(activeTabId, { type: "SI_PAGE_STATE" }, (csRes) => {
        if (chrome.runtime.lastError || !csRes || !csRes.ok) {
          console.log("[SI][MSG][RECOVERED] type=GET_PAGE_STATE reason=content_script_reconnected");
        } else {
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
        });
      });
    });
    return true;
  }

  // --- SI_CONTENT_READY (Event sent by Content Script) ---
  if (message.type === "SI_CONTENT_READY") {
    console.log("[SI][LIFECYCLE][CONTENT_READY]");

    if (sender && sender.tab && sender.tab.id) {
      discoveryState.tabId = sender.tab.id;
    }

    if (message.cardCount != null) {
      mapsState.isMaps = Boolean(message.isMaps);
      // Reconnect MUST NOT reset a non-zero card count to 0 automatically
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
        `[SI][LIFECYCLE][CONTENT_RECONNECTED] candidate=${idx} name=${discoveryState.activeCandidate.company_name}`,
      );

      if (sender && sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "ENRICH_CURRENT_CANDIDATE",
          candidate: discoveryState.activeCandidate,
          index: idx,
        });
      }
    }

    sendResponse({ ok: true });
    return false;
  }

  // --- SI_PAGE_STATE_UPDATE (Explicit DOM Mutation Update) ---
  if (message.type === "SI_PAGE_STATE_UPDATE") {
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id) {
        sendResponse({ ok: false, error: "No active Google Maps tab found." });
        return;
      }

      const activeTabId = tabs[0].id;
      discoveryState.tabId = activeTabId;
      discoveryState.active = true;
      discoveryState.status = "running";
      discoveryState.limit = Math.min(Math.max(Number(message.limit) || 2, 1), 50);
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

      chrome.tabs.sendMessage(activeTabId, { type: "BUILD_DISCOVERY_QUEUE", limit: discoveryState.limit }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
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
      discoveryState.records.push(detailLead);
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
