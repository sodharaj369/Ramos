/**
 * Background Service Worker for RAMOS Chrome Extension (v1.0.5)
 * Manifest V3 Safe Messaging Architecture with Resilient Content-Script Reconnection.
 * Single Authority for Discovery Session & Run State Isolation.
 */

try {
  if (typeof importScripts === "function") {
    importScripts("shared/xlsx-builder.js");
  }
} catch (e) {
  // Ignored in non-worker environments
}

const getExtensionVersion = () => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "1.0.6";
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
  results: [],
  enrichedLeads: [],
  readyLeads: [],
  failedLeads: [],
  status: "idle", // 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'
  startedAt: Date.now(),
  // Single-flight candidate tracking
  activeIndex: -1,
  activeAttemptId: null,
  activeAt: 0,
  activeTimeoutId: null,
  // Per-candidate state machine: 'PENDING'|'DISPATCHED'|'READY'|'FAILED'|'DUPLICATE_SKIPPED'|'SKIPPED'
  candidateStates: [],
  // Export lifecycle tracking
  exportInProgress: false,
  exportCompleted: false,
  lastExportedDownloadId: null,
  lastExportedFilename: null,
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

  // Clear any in-flight timeout from the previous run before replacing currentRun
  if (currentRun.activeTimeoutId != null) {
    clearTimeout(currentRun.activeTimeoutId);
  }

  console.log(`[SI][RUN_CREATED] runId=${newRunId} sourceQuery="${canonicalQuery || ""}" limit=${requestedLimit}`);

  currentRun = {
    runId: newRunId,
    query: canonicalQuery,
    sourceQuery: canonicalQuery,
    requestedLimit: requestedLimit,
    candidates: [],
    results: [],
    enrichedLeads: [],
    readyLeads: [],
    failedLeads: [],
    status: "running",
    startedAt: Date.now(),
    activeIndex: -1,
    activeAttemptId: null,
    activeAt: 0,
    activeTimeoutId: null,
    candidateStates: [],
    exportInProgress: false,
    exportCompleted: false,
    lastExportedDownloadId: null,
    lastExportedFilename: null,
  };

  console.log(`[SI][EXPORT_FLOW][RUN_STARTED] runId=${newRunId} query="${canonicalQuery || ""}" limit=${requestedLimit}`);

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

// ─── SAFE MESSAGING HELPERS (MV3 Resilient) ─────────────────────────────────

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
  const exportRunId = currentRun.runId;
  const results = currentRun.results || [];
  const ready = results.filter(
    (lead) =>
      lead &&
      lead.runId === exportRunId &&
      normalizeQuery(lead.sourceQuery) === normalizeQuery(currentRun.sourceQuery) &&
      (lead.enrichmentStatus === "complete" || lead.enrichmentStatus === "ready")
  );

  const limit = currentRun.requestedLimit;
  const exportable = ready.slice(0, limit);

  console.log(
    `[SI][EXPORT_FLOW][READY] runId=${exportRunId} query="${currentRun.sourceQuery || ""}" requested=${limit} rows=${exportable.length}`
  );

  if (ready.length > limit) {
    console.error(`[SI][EXPORT_FLOW][EXPORT_VIOLATION] requested=${limit} rows=${ready.length}`);
  }

  return exportable;
}

const CSV_HEADERS = [
  "Company",
  "Phone",
  "Website",
  "Email",
  "Email Status",
  "Address",
  "City",
  "State / Region",
  "Country",
  "Postal Code",
  "Industry",
  "Business Type",
  "Rating",
  "Reviews",
  "Opening Status",
  "Price Range",
  "Booking URL",
  "Ordering URL",
  "Menu URL",
  "Imported At",
  "Source URL",
  "Place ID",
  "Source Query",
  "Run ID",
];

function escapeCsvCell(val) {
  if (val == null) return "";
  const str = String(val).trim();
  if (!str.length) return "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function createCsv(leads) {
  const now = new Date().toISOString();
  const rows = [CSV_HEADERS.join(",")];
  for (const lead of leads) {
    if (!lead || !lead.company_name) continue;
    rows.push(
      [
        escapeCsvCell(lead.company_name),
        escapeCsvCell(lead.phone),
        escapeCsvCell(lead.website),
        escapeCsvCell(lead.email),
        escapeCsvCell(lead.email_status),
        escapeCsvCell(lead.address),
        escapeCsvCell(lead.city),
        escapeCsvCell(lead.region || lead.state),
        escapeCsvCell(lead.country),
        escapeCsvCell(lead.postal_code),
        escapeCsvCell(lead.category),
        escapeCsvCell(lead.business_type || lead.category),
        escapeCsvCell(lead.rating),
        escapeCsvCell(lead.review_count),
        escapeCsvCell(lead.opening_status),
        escapeCsvCell(lead.price_range),
        escapeCsvCell(lead.booking_url),
        escapeCsvCell(lead.ordering_url),
        escapeCsvCell(lead.menu_url),
        escapeCsvCell(lead.discovered_at || lead.created_at || now),
        escapeCsvCell(lead.source_url),
        escapeCsvCell(lead.place_id),
        escapeCsvCell(lead.sourceQuery),
        escapeCsvCell(lead.runId),
      ].join(",")
    );
  }
  return "\uFEFF" + rows.join("\r\n");
}

function createEnrichedCsv(leads) {
  const ENRICHED_CSV_HEADERS = [
    "Company", "Lead Score", "Quality Tier", "Website",
    "Primary Email", "Email Role", "Additional Emails", "Email Status",
    "Primary Phone", "Additional Phones",
    "Decision Maker Name", "Decision Maker Title", "Decision Maker Email", "Decision Maker LinkedIn", "People Count",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Description",
    "LinkedIn", "Twitter / X", "Facebook", "Instagram", "YouTube", "GitHub",
    "Booking URL", "Ordering URL", "Menu URL",
    "Source URL", "Imported At", "Source Query"
  ];
  const rows = [ENRICHED_CSV_HEADERS.join(",")];
  for (const l of leads) {
    if (!l || (!l.company_name && !l.website && !l.email && !l.phone)) continue;
    const social = l.social || {};
    const extraEmails = Array.isArray(l.additional_emails) && l.additional_emails.length > 0
      ? l.additional_emails.join("; ")
      : (Array.isArray(l.emails) && l.emails.length > 1
        ? l.emails.slice(1).map((e) => e.email || e).join("; ")
        : "");
    const extraPhones = Array.isArray(l.additional_phones) && l.additional_phones.length > 0
      ? l.additional_phones.join("; ")
      : (Array.isArray(l.phones) && l.phones.length > 1
        ? l.phones.slice(1).map((p) => p.phone || p).join("; ")
        : "");
    const peopleCount = l.people_count != null
      ? l.people_count
      : (Array.isArray(l.people) ? l.people.length : 0);
    rows.push([
      escapeCsvCell(l.company_name || l.website || "—"),
      escapeCsvCell(l.lead_score != null ? l.lead_score : ""),
      escapeCsvCell(l.quality_tier || ""),
      escapeCsvCell(l.website),
      escapeCsvCell(l.email),
      escapeCsvCell(l.email_role || l.emailRole || ""),
      escapeCsvCell(extraEmails),
      escapeCsvCell(l.email_status),
      escapeCsvCell(l.phone),
      escapeCsvCell(extraPhones),
      escapeCsvCell(l.decision_maker_name || ""),
      escapeCsvCell(l.decision_maker_title || ""),
      escapeCsvCell(l.decision_maker_email || ""),
      escapeCsvCell(l.decision_maker_linkedin || ""),
      escapeCsvCell(peopleCount),
      escapeCsvCell(l.address),
      escapeCsvCell(l.city),
      escapeCsvCell(l.region || l.state),
      escapeCsvCell(l.country),
      escapeCsvCell(l.postal_code),
      escapeCsvCell(l.category),
      escapeCsvCell(l.description || l.business_type || ""),
      escapeCsvCell(social.linkedin || ""),
      escapeCsvCell(social.twitter_x || ""),
      escapeCsvCell(social.facebook || ""),
      escapeCsvCell(social.instagram || ""),
      escapeCsvCell(social.youtube || ""),
      escapeCsvCell(social.github || ""),
      escapeCsvCell(l.booking_url),
      escapeCsvCell(l.ordering_url),
      escapeCsvCell(l.menu_url),
      escapeCsvCell(l.source_url),
      escapeCsvCell(l.imported_at || new Date().toISOString()),
      escapeCsvCell(l.sourceQuery)
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n");
}

function executeExportDownload(customSendResponse, format = "csv", providedLeads = null) {
  console.log(`[SI][EXPORT_FLOW][CLICK] runId=${currentRun.runId} status=${currentRun.status} format=${format}`);

  if (currentRun.exportInProgress) {
    console.warn(`[SI][EXPORT_FLOW][CLICK] ignored: export in progress`);
    if (typeof customSendResponse === "function") {
      customSendResponse({ ok: false, reason: "EXPORT_IN_PROGRESS", error: "Export is already in progress." });
    }
    return;
  }

  if (currentRun.status === "running") {
    console.warn(`[SI][EXPORT_FLOW][CLICK] ignored: extraction in progress`);
    if (typeof customSendResponse === "function") {
      customSendResponse({ ok: false, reason: "EXTRACTION_IN_PROGRESS", error: "Extraction is currently running. Please wait for completion." });
    }
    return;
  }

  const exportRunId = currentRun.runId;
  const sourceQuery = currentRun.sourceQuery || "google-maps";
  const leads = Array.isArray(providedLeads) && providedLeads.length > 0 ? providedLeads : getExportableLeads();

  console.log(
    `[SI][EXPORT][FINAL_INPUT]\nrequested=${currentRun.requestedLimit}\nresultsLength=${(currentRun.results || []).length}\nready=${leads.length}\nexportable=${leads.length}`
  );

  if (leads.length === 0) {
    console.warn(`[SI][EXPORT_FLOW][CLICK] no exportable leads found`);
    if (typeof customSendResponse === "function") {
      customSendResponse({ ok: false, reason: "NO_LEADS", error: "No completed leads are available to export yet." });
    }
    return;
  }

  const isEnriched = leads.some(
    (l) => l && (l.enrichment_status === "enriched" || (l.people && l.people.length > 0) || (l.additional_emails && l.additional_emails.length > 0) || (l.social && Object.keys(l.social).length > 0))
  );

  currentRun.exportInProgress = true;
  const sanitize = (q) => (q || "google-maps").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10);
  const exportFormat = String(format).toLowerCase() === "xlsx" || String(format).toLowerCase() === "excel" ? "xlsx" : "csv";
  const filename = `ramos-${sanitize(sourceQuery)}-${dateStr}.${exportFormat}`;

  let dataUrl = "";
  if (exportFormat === "xlsx") {
    const xlsxBuilder =
      typeof RamosXlsxBuilder !== "undefined"
        ? RamosXlsxBuilder
        : typeof require === "function"
        ? require("./shared/xlsx-builder")
        : null;

    if (!xlsxBuilder || typeof xlsxBuilder.buildXlsx !== "function") {
      currentRun.exportInProgress = false;
      const errMsg = "XLSX Builder unavailable";
      console.error(`[SI][EXPORT_FLOW][ERROR] ${errMsg}`);
      if (typeof customSendResponse === "function") {
        customSendResponse({ ok: false, error: errMsg });
      }
      return;
    }

    try {
      const uint8 = isEnriched && typeof xlsxBuilder.buildWebsiteXlsx === "function"
        ? xlsxBuilder.buildWebsiteXlsx(leads)
        : xlsxBuilder.buildXlsx(leads);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = typeof btoa === "function" ? btoa(binary) : "";
      dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
    } catch (err) {
      currentRun.exportInProgress = false;
      const errMsg = err?.message || String(err);
      console.error(`[SI][EXPORT_FLOW][XLSX_BUILD_ERROR] ${errMsg}`);
      if (typeof customSendResponse === "function") {
        customSendResponse({ ok: false, error: errMsg });
      }
      return;
    }
  } else {
    const csv = isEnriched ? createEnrichedCsv(leads) : createCsv(leads);
    dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }

  console.log(`[SI][EXPORT_FLOW][DOWNLOAD_REQUEST] filename="${filename}" format=${exportFormat}`);

  try {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: filename,
        saveAs: false,
      },
      (downloadId) => {
        currentRun.exportInProgress = false;
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          const errMsg = lastErr.message || String(lastErr);
          console.error(`[SI][EXPORT_FLOW][DOWNLOAD_ERROR] ${errMsg}`);
          safeSendRuntimeMessage({
            type: "SI_EXPORT_FAILED",
            runId: exportRunId,
            error: errMsg,
          });
          if (typeof customSendResponse === "function") {
            customSendResponse({ ok: false, error: errMsg });
          }
        } else {
          console.log(`[SI][EXPORT_FLOW][DOWNLOAD_SUCCESS] id=${downloadId}`);
          currentRun.exportCompleted = true;
          currentRun.lastExportedDownloadId = downloadId;
          currentRun.lastExportedFilename = filename;
          safeSendRuntimeMessage({
            type: "SI_EXPORT_COMPLETE",
            runId: exportRunId,
            rowCount: leads.length,
            filename: filename,
            downloadId: downloadId,
            format: exportFormat,
          });
          if (typeof customSendResponse === "function") {
            customSendResponse({ ok: true, downloadId, filename, rowCount: leads.length, format: exportFormat });
          }
        }
      }
    );
  } catch (syncErr) {
    currentRun.exportInProgress = false;
    const errMsg = syncErr?.message || String(syncErr);
    console.error(`[SI][EXPORT_FLOW][DOWNLOAD_ERROR] ${errMsg}`);
    safeSendRuntimeMessage({
      type: "SI_EXPORT_FAILED",
      runId: exportRunId,
      error: errMsg,
    });
    if (typeof customSendResponse === "function") {
      customSendResponse({ ok: false, error: errMsg });
    }
  }
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
  const total = currentRun.candidates.length;
  const processed = readyLeads.length;
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  const progressPayload = {
    type: "SI_DISCOVERY_PROGRESS",
    status: currentRun.status,
    found: total,
    processed,
    percent: pct,
    stats: getRunStats(),
    currentBusiness: currentRun.readyLeads[currentRun.readyLeads.length - 1] || null,
    records: readyLeads,
    leads: readyLeads,
    runId: currentRun.runId,
    statusText,
    text: statusText,
  };

  // 1. Maintain primary backward-compatible contract
  safeSendRuntimeMessage(progressPayload);

  // 2. Broadcast modern SI_PROGRESS_UPDATE for UI listeners
  safeSendRuntimeMessage({
    ...progressPayload,
    type: "SI_PROGRESS_UPDATE",
  });

  // 3. Broadcast terminal event when status reaches completed/cancelled/failed
  if (currentRun.status === "completed") {
    safeSendRuntimeMessage({
      type: "SI_DISCOVERY_COMPLETE",
      status: "completed",
      leads: readyLeads,
      records: readyLeads,
      stats: getRunStats(),
      runId: currentRun.runId,
      statusText,
    });
  } else if (currentRun.status === "cancelled") {
    safeSendRuntimeMessage({
      type: "SI_DISCOVERY_STOPPED",
      status: "cancelled",
      leads: readyLeads,
      records: readyLeads,
      stats: getRunStats(),
      runId: currentRun.runId,
      statusText,
    });
  } else if (currentRun.status === "failed") {
    safeSendRuntimeMessage({
      type: "SI_DISCOVERY_COMPLETE",
      status: "failed",
      leads: readyLeads,
      records: readyLeads,
      stats: getRunStats(),
      runId: currentRun.runId,
      error: statusText,
      statusText,
    });
  }
}

async function ensureContentScriptInjected(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || !tab.url.includes("google.com/maps")) {
      console.warn(`[SI][MSG] REINJECT_SKIP tab=${tabId} url=${tab?.url}`);
      return false;
    }
    console.log(`[SI][MSG] REINJECT tab=${tabId} url=${tab.url}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: [
        "shared/constants.js",
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
    await new Promise((r) => setTimeout(r, 400));
    console.log(`[SI][MSG] REINJECT_SUCCESS tab=${tabId}`);
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

// ─── CANDIDATE_TIMEOUT_MS ────────────────────────────────────────────────────
const CANDIDATE_TIMEOUT_MS = 15000;

function generateAttemptId() {
  return "atm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function isTerminalState(state) {
  return state === "READY" || state === "FAILED" || state === "DUPLICATE_SKIPPED" || state === "SKIPPED";
}

function clearActiveCandidateTimeout() {
  if (currentRun.activeTimeoutId != null) {
    clearTimeout(currentRun.activeTimeoutId);
    currentRun.activeTimeoutId = null;
  }
}

function logQueueStats() {
  const total = currentRun.candidates.length;
  const pending = currentRun.candidateStates.slice(0, total).filter(
    (s) => s === "PENDING" || s === "DISPATCHED"
  ).length;
  const ready = currentRun.readyLeads.length;
  const failed = currentRun.failedLeads.length;
  const duplicates = currentRun.candidateStates.filter((s) => s === "DUPLICATE_SKIPPED").length;
  const skipped = currentRun.candidateStates.filter((s) => s === "SKIPPED").length;
  console.log(
    `[SI][QUEUE] pending=${pending} ready=${ready} failed=${failed} duplicates=${duplicates} skipped=${skipped}`
  );
}

/**
 * Moves a candidate to a terminal state, clears active tracking, and logs.
 * Guards against overwriting an already-terminal state.
 */
function setCandidateTerminal(index, state) {
  if (isTerminalState(currentRun.candidateStates[index])) {
    console.log(
      `[SI][QUEUE] TERMINAL_OVERWRITE_IGNORED index=${index + 1} existing=${currentRun.candidateStates[index]} attempted=${state}`
    );
    return;
  }
  currentRun.candidateStates[index] = state;
  // Clear active tracking only if this index is the currently active one
  if (currentRun.activeIndex === index) {
    clearActiveCandidateTimeout();
    currentRun.activeIndex = -1;
    currentRun.activeAttemptId = null;
    currentRun.activeAt = 0;
  }
  console.log(`[SI][QUEUE] TERMINAL index=${index + 1} state=${state}`);
  logQueueStats();
}

/**
 * Fires when the per-candidate bounded timeout expires.
 * Only acts if the attemptId still matches (guards stale timeouts after retry).
 */
function handleCandidateTimeout(index, attemptId) {
  if (currentRun.activeIndex !== index || currentRun.activeAttemptId !== attemptId) {
    // Stale timeout — a newer attempt is active or candidate already resolved
    console.log(
      `[SI][QUEUE] TIMEOUT_IGNORED index=${index + 1} reason=stale_attempt attemptId=${attemptId}`
    );
    return;
  }
  if (isTerminalState(currentRun.candidateStates[index])) {
    return;
  }
  const candidate = currentRun.candidates[index] || {};
  console.log(
    `[SI][QUEUE] TIMEOUT index=${index + 1} name="${candidate.company_name}" attemptId=${attemptId}`
  );
  // The timeout has fired so clear the handle reference before setCandidateTerminal
  currentRun.activeTimeoutId = null;
  currentRun.failedLeads.push({
    ...candidate,
    runId: currentRun.runId,
    sourceQuery: currentRun.sourceQuery,
    enrichmentStatus: "failed",
    reason: "timeout",
  });
  setCandidateTerminal(index, "FAILED");
  console.log(
    `[SI][ENRICH] ${index + 1}/${currentRun.candidates.length} FAILED name="${candidate.company_name}" reason=timeout`
  );
  processNextCandidateInRun(index + 1);
}

/**
 * Dispatches a single candidate to the content script with a unique attemptId.
 * Calling this again for the same index invalidates the previous attemptId and
 * restarts the bounded timeout — enabling safe retry on content-script reinjection.
 * @param {number}  index   0-based candidate index
 * @param {object}  candidate
 * @param {boolean} isRetry true when called as a reconnect retry
 */
async function dispatchCandidate(index, candidate, isRetry) {
  if (currentRun.status !== "running") return;

  const totalCandidates = currentRun.candidates.length;
  const idx = index + 1; // 1-based for display/logging

  // Mark as DISPATCHED (idempotent if already DISPATCHED)
  currentRun.candidateStates[index] = "DISPATCHED";

  // Generate a fresh attempt ID — this invalidates any prior in-flight attempt
  const attemptId = generateAttemptId();
  currentRun.activeIndex = index;
  currentRun.activeAttemptId = attemptId;
  currentRun.activeAt = Date.now();

  // Clear any previous timeout and start a fresh bounded timeout
  clearActiveCandidateTimeout();
  currentRun.activeTimeoutId = setTimeout(
    () => handleCandidateTimeout(index, attemptId),
    CANDIDATE_TIMEOUT_MS
  );

  if (!isRetry) {
    console.log(
      `[SI][QUEUE] DISPATCH index=${idx} name="${candidate.company_name}" attemptId=${attemptId}`
    );
    console.log(`[SI][ENRICH] ${idx}/${totalCandidates} START name="${candidate.company_name}"`);
    broadcastProgress(`[LOOP ${idx}/${totalCandidates}] ${candidate.company_name}`);
  } else {
    console.log(
      `[SI][QUEUE] RETRY_DISPATCH index=${idx} name="${candidate.company_name}" attemptId=${attemptId}`
    );
  }

  if (discoveryState.tabId) {
    const res = await safeSendTabMessage(discoveryState.tabId, {
      type: "ENRICH_CURRENT_CANDIDATE",
      candidate,
      index: idx,
      previousName: lastCompletedName,
      runId: currentRun.runId,
      sourceQuery: currentRun.sourceQuery,
      attemptId,
    });
    if (!res.ok) {
      console.warn(`[SI][ENRICH] ${idx} dispatch failed reason=${res.reason}`);
      // Only fail if THIS attempt is still the active one
      if (currentRun.activeIndex === index && currentRun.activeAttemptId === attemptId) {
        clearActiveCandidateTimeout();
        handleCandidateFailure(candidate, index, "dispatch_failed");
      }
    }
  } else {
    if (currentRun.activeIndex === index && currentRun.activeAttemptId === attemptId) {
      clearActiveCandidateTimeout();
      handleCandidateFailure(candidate, index, "no_tab");
    }
  }
}

async function processNextCandidateInRun(index) {
  if (currentRun.status !== "running") return;

  const totalCandidates = currentRun.candidates.length;

  // Skip over any candidates that already reached a terminal state
  while (index < totalCandidates && isTerminalState(currentRun.candidateStates[index])) {
    index++;
  }

  if (index >= totalCandidates) {
    // Do not complete while the active candidate is still DISPATCHED
    if (currentRun.activeIndex >= 0 && currentRun.candidateStates[currentRun.activeIndex] === "DISPATCHED") {
      console.log(
        `[SI][QUEUE] COMPLETION_DEFERRED pending candidate ${currentRun.activeIndex + 1} still DISPATCHED`
      );
      return;
    }
    currentRun.status = "completed";

    currentRun.readyLeads = (currentRun.results || []).filter((r) => r && r.enrichmentStatus === "complete");
    currentRun.failedLeads = (currentRun.results || []).filter(
      (r) => r && (r.enrichmentStatus === "failed" || r.enrichmentStatus === "duplicate_skipped")
    );

    const readyLeads = getExportableLeads();
    const readyCount = readyLeads.length;
    const failedCount = currentRun.failedLeads.length;

    console.log(
      `[SI][DETAIL_PIPELINE][FINAL]\nrequested=${currentRun.requestedLimit}\ncandidateCount=${totalCandidates}\nreadyCount=${readyCount}\nfailedCount=${failedCount}\npendingCount=0`
    );

    for (let i = 0; i < totalCandidates; i++) {
      const state = currentRun.candidateStates[i] || "UNKNOWN";
      const cand = currentRun.candidates[i] || {};
      const res = currentRun.results[i] || cand;
      console.log(
        `[SI][DETAIL_PIPELINE][FINAL_ROW]\nindex=${i + 1}\nstate=${state}\nname=${res.company_name || cand.company_name || ""}`
      );
    }

    console.log(
      `[SI][EXPORT_FLOW][RUN_COMPLETED] runId=${currentRun.runId} ready=${readyLeads.length} failed=${currentRun.failedLeads.length}`
    );
    console.log(
      `[SI][RUN][COMPLETE] requested=${currentRun.requestedLimit} completed=${readyLeads.length} failed=${currentRun.failedLeads.length} pending=0`
    );
    broadcastProgress("Extraction complete.");
    return;
  }

  const candidate = currentRun.candidates[index];

  // Single-flight guard: do not re-dispatch a candidate that is already DISPATCHED
  if (currentRun.candidateStates[index] === "DISPATCHED") {
    console.warn(
      `[SI][QUEUE] WARN: candidate ${index + 1} already DISPATCHED — ignoring redundant processNextCandidateInRun call`
    );
    return;
  }

  // Concurrent dispatch guard: never start a new candidate while one is in-flight
  if (currentRun.activeIndex >= 0 && currentRun.activeIndex !== index) {
    console.warn(
      `[SI][QUEUE] WARN: candidate ${currentRun.activeIndex + 1} still active — cannot dispatch ${index + 1} concurrently`
    );
    return;
  }

  await dispatchCandidate(index, candidate, false);
}

function handleCandidateFailure(candidate, index, reason) {
  // Guard: never overwrite a terminal state
  if (isTerminalState(currentRun.candidateStates[index])) {
    console.log(
      `[SI][QUEUE] FAILURE_IGNORED index=${index + 1} already=${currentRun.candidateStates[index]}`
    );
    return;
  }

  const failedResult = {
    ...candidate,
    runId: currentRun.runId,
    sourceQuery: currentRun.sourceQuery,
    candidateIndex: index,
    candidateId: candidate.place_id || candidate.id || `cand_${index + 1}`,
    enrichmentStatus: "failed",
    reason: reason || "failed",
    failedAt: new Date().toISOString(),
  };

  currentRun.results[index] = failedResult;

  currentRun.readyLeads = (currentRun.results || []).filter((r) => r && r.enrichmentStatus === "complete");
  currentRun.failedLeads = (currentRun.results || []).filter(
    (r) => r && (r.enrichmentStatus === "failed" || r.enrichmentStatus === "duplicate_skipped")
  );

  const readyCount = currentRun.readyLeads.length;
  const failedCount = currentRun.failedLeads.length;
  const pendingCount = currentRun.candidates.length - (readyCount + failedCount);

  console.log(
    `[SI][DETAIL_PIPELINE][RESULT_COUNT]\nready=${readyCount}\nfailed=${failedCount}\npending=${pendingCount}`
  );

  console.log(
    `[SI][ENRICH] ${index + 1}/${currentRun.candidates.length} FAILED name="${candidate.company_name}" reason=${reason}`
  );
  setCandidateTerminal(index, "FAILED");
  processNextCandidateInRun(index + 1);
}

function parseQueryFromUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const mSearch = /\/maps\/search\/([^/@?]+)/.exec(urlStr);
    if (mSearch && mSearch[1]) {
      return decodeURIComponent(mSearch[1].replace(/\+/g, " ")).trim() || null;
    }
    const mPlace = /\/maps\/place\/([^/@?]+)/.exec(urlStr);
    if (mPlace && mPlace[1]) {
      return decodeURIComponent(mPlace[1].replace(/\+/g, " ")).trim() || null;
    }
  } catch (e) {}
  return null;
}

async function startDiscoverySession(tabId, limit, queryOverride) {
  const getTargetTab = () =>
    new Promise((resolve) => {
      if (tabId) {
        chrome.tabs.get(tabId, (t) => resolve(t || null));
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

  const targetTab = await getTargetTab();
  if (!targetTab || !targetTab.id) {
    return { ok: false, error: "No active Google Maps tab found." };
  }

  const activeTabId = targetTab.id;
  const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  // Resolve live page query synchronously from content script or tab URL
  let pageQuery = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const pageStateRes = await safeSendTabMessage(activeTabId, { type: "SI_PAGE_STATE" });
    if (pageStateRes && pageStateRes.ok && pageStateRes.query) {
      pageQuery = pageStateRes.query;
      break;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250));
  }

  const tabUrlQuery = parseQueryFromUrl(targetTab.url) || parseQueryFromUrl(mapsState.url);
  const resolvedQuery = queryOverride || pageQuery || tabUrlQuery || mapsState.searchQuery || null;
  const canonicalQuery = normalizeQuery(resolvedQuery) || resolvedQuery;

  console.log(
    `[SI][QUERY_STATE] pageQuery="${pageQuery || ""}" tabUrlQuery="${tabUrlQuery || ""}" mapsState.searchQuery="${mapsState.searchQuery || ""}" canonicalQuery="${canonicalQuery || ""}"`
  );
  console.log(
    `[SI][START_DISCOVERY] requestedQuery="${queryOverride || ""}" resolvedQuery="${resolvedQuery || ""}" canonicalQuery="${canonicalQuery || ""}" runId=${currentRun.runId}`
  );

  if (!canonicalQuery) {
    currentRun.status = "failed";
    broadcastProgress("No search query detected.");
    return { ok: false, error: "No search query detected on Google Maps. Please perform a search first." };
  }

  mapsState.searchQuery = canonicalQuery;

  console.log(`[SI][DISCOVERY][START] tabId=${activeTabId} requestedLimit=${requestedLimit} query="${canonicalQuery}"`);

  // Start completely fresh run with canonical query
  startNewRun(canonicalQuery, requestedLimit);
  discoveryState.tabId = activeTabId;

  console.log(`[SI][DISCOVERY][QUERY] sending BUILD_DISCOVERY_QUEUE to tab ${activeTabId}`);
  const res = await safeSendTabMessage(activeTabId, {
    type: "BUILD_DISCOVERY_QUEUE",
    limit: currentRun.requestedLimit,
    runId: currentRun.runId,
    sourceQuery: currentRun.sourceQuery,
  });

  console.log(`[SI][DISCOVERY][QUERY_RESPONSE] res=${JSON.stringify(res)}`);

  if (!res || !res.ok) {
    const errReason = res?.error || res?.reason || "Failed to query Google Maps candidates.";
    console.error(`[SI][DISCOVERY][ERROR]`, {
      message: errReason,
      stack: (new Error(errReason)).stack,
      type: "BUILD_DISCOVERY_QUEUE",
      tabId: activeTabId,
      url: targetTab?.url || mapsState.url,
      mapsState: { isMaps: mapsState.isMaps, isResults: mapsState.isResults },
      cardCount: mapsState.cardCount,
      requestedLimit: currentRun.requestedLimit
    });
    currentRun.status = "failed";
    broadcastProgress(`Discovery failed: ${errReason}`);
    return { ok: false, error: errReason };
  }

  const rawDiscovered = res.queue || [];
  console.log(`[SI][RUN][START] runId=${currentRun.runId} query="${canonicalQuery}" requestedLimit=${requestedLimit}`);
  console.log(`[SI][DISCOVERY][CARDS] count=${rawDiscovered.length}`);

  const selected = rawDiscovered.slice(0, currentRun.requestedLimit);
  console.log(`[SI][DISCOVERY][SELECTED] count=${selected.length}`);

  currentRun.candidates = selected.map((c) => ({
    ...c,
    runId: currentRun.runId,
    sourceQuery: currentRun.sourceQuery,
  }));

  currentRun.results = new Array(currentRun.candidates.length).fill(null);
  currentRun.candidateStates = new Array(currentRun.candidates.length).fill("PENDING");

  if (currentRun.candidates.length === 0) {
    currentRun.status = "completed";
    broadcastProgress("No candidates discovered.");
    console.log(`[SI][RUN][COMPLETE] requested=${requestedLimit} completed=0 failed=0 pending=0`);
    return { ok: true, records: [], stats: getRunStats() };
  }

  processNextCandidateInRun(0);
  return { ok: true, stats: getRunStats() };
}

globalThis.startDiscoverySession = startDiscoverySession;
self.startDiscoverySession = startDiscoverySession;

// ─── RUNTIME MESSAGE DISPATCHER ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;



  // --- EXPORT DOWNLOAD HANDLERS ---
  if (
    message.type === "SI_TRIGGER_DOWNLOAD_CSV" ||
    message.type === "SI_TRIGGER_DOWNLOAD_EXCEL" ||
    message.type === "SI_TRIGGER_DOWNLOAD_XLSX" ||
    message.type === "DOWNLOAD_CSV" ||
    message.type === "DOWNLOAD_EXCEL"
  ) {
    const fmt = message.format || (message.type.includes("EXCEL") || message.type.includes("XLSX") ? "xlsx" : "csv");
    executeExportDownload(sendResponse, fmt, message.leads);
    return true;
  }

  if (message.type === "SI_DOWNLOAD_FILE") {
    const url = message.url;
    const filename = message.filename || "ramos-export.bin";
    if (!url) {
      sendResponse({ ok: false, error: "Missing download URL" });
      return false;
    }
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.error(`[SI][DOWNLOAD_FILE_ERROR] ${err.message}`);
        sendResponse({ ok: false, error: err.message });
      } else {
        console.log(`[SI][DOWNLOAD_FILE_SUCCESS] id=${downloadId} filename="${filename}"`);
        sendResponse({ ok: true, downloadId, filename });
      }
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

    if (
      currentRun.status === "running" &&
      currentRun.activeIndex >= 0 &&
      currentRun.candidateStates[currentRun.activeIndex] === "DISPATCHED"
    ) {
      const ai = currentRun.activeIndex;
      const candidate = currentRun.candidates[ai];
      if (candidate) {
        console.log(
          `[SI][QUEUE] CONTENT_SCRIPT_RECONNECTED index=${ai + 1} name="${candidate.company_name}"`
        );
        dispatchCandidate(ai, candidate, true);
      }
    }

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

  // --- SI_DOWNLOAD_FILE ---
  if (message.type === "SI_DOWNLOAD_FILE") {
    if (typeof chrome !== "undefined" && chrome.downloads && typeof chrome.downloads.download === "function") {
      try {
        chrome.downloads.download({ url: message.url, filename: message.filename, saveAs: false }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("[SI][DOWNLOAD_ERROR]", chrome.runtime.lastError.message);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            console.log(`[SI][DOWNLOAD_SUCCESS] id=${downloadId} file=${message.filename}`);
            sendResponse({ ok: true, downloadId });
          }
        });
        return true;
      } catch (err) {
        console.error("[SI][DOWNLOAD_EXCEPTION]", err);
        sendResponse({ ok: false, error: err.message });
        return false;
      }
    }
    sendResponse({ ok: false, error: "chrome.downloads API unavailable" });
    return false;
  }

  // --- SI_TRIGGER_DOWNLOAD_CSV / SI_EXPORT_CSV ---
  if (message.type === "SI_TRIGGER_DOWNLOAD_CSV" || message.type === "SI_EXPORT_CSV") {
    executeExportDownload(sendResponse, message.leads);
    return true;
  }

  // --- SI_START_DISCOVERY ---
  if (message.type === "SI_START_DISCOVERY") {
    const tabId = message.tabId || (sender && sender.tab ? sender.tab.id : null);
    startDiscoverySession(tabId, message.limit, message.query).then((res) => {
      sendResponse(res);
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
    const attemptId = message.attemptId || null;

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

    // Single-flight guard: reject if index doesn't match the currently active slot
    if (index !== currentRun.activeIndex) {
      console.log(
        `[SI][QUEUE] STALE_DETAIL_IGNORED index=${index + 1} activeIndex=${currentRun.activeIndex + 1}`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }
    // Reject if attemptId is stale (an older attempt responded after a retry)
    if (attemptId && attemptId !== currentRun.activeAttemptId) {
      console.log(
        `[SI][QUEUE] STALE_ATTEMPT_IGNORED index=${index + 1} attemptId=${attemptId} activeAttemptId=${currentRun.activeAttemptId}`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }
    // Guard against double terminal
    if (isTerminalState(currentRun.candidateStates[index])) {
      console.log(
        `[SI][QUEUE] DUPLICATE_TERMINAL_IGNORED index=${index + 1} state=${currentRun.candidateStates[index]}`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }

    const candidate = currentRun.candidates[index] || {};
    const detailLead = message.detailLead || {};

    const expectedName = candidate.company_name || "";
    const actualName = detailLead.company_name || expectedName;

    console.log(
      `[SI][DETAIL_PIPELINE][SAVE_ATTEMPT]\nindex=${index + 1}\nexpectedName=${expectedName}\nactualName=${actualName}\nrunId=${currentRun.runId}`
    );

    const savedResult = {
      ...candidate,
      ...detailLead,
      runId: currentRun.runId,
      sourceQuery: currentRun.sourceQuery,
      candidateIndex: index,
      candidateId: candidate.place_id || candidate.id || `cand_${index + 1}`,
      enrichmentStatus: "complete",
      enrichedAt: new Date().toISOString(),
    };

    const placeId = savedResult.place_id;
    if (placeId && processedPlaceIds.has(placeId)) {
      console.log(`[SI][ENRICH] ${index + 1} DUPLICATE_SKIPPED placeId=${placeId}`);
      savedResult.enrichmentStatus = "duplicate_skipped";
      currentRun.results[index] = savedResult;
      setCandidateTerminal(index, "DUPLICATE_SKIPPED");
    } else {
      if (placeId) processedPlaceIds.add(placeId);
      lastCompletedName = savedResult.company_name;
      lastCompletedPlaceId = savedResult.place_id;

      currentRun.results[index] = savedResult;

      if (!currentRun.results[index]) {
        console.log(`[SI][DETAIL_PIPELINE][SAVE_FAILED]\nindex=${index + 1}\nreason=RESULT_NOT_PERSISTED`);
        handleCandidateFailure(candidate, index, "RESULT_NOT_PERSISTED");
        sendResponse({ ok: false, error: "RESULT_NOT_PERSISTED" });
        return false;
      }

      console.log(`[SI][DETAIL_PIPELINE][SAVE_SUCCESS]\nindex=${index + 1}\nname=${savedResult.company_name}`);
      setCandidateTerminal(index, "READY");
    }

    currentRun.readyLeads = (currentRun.results || []).filter((r) => r && r.enrichmentStatus === "complete");
    currentRun.failedLeads = (currentRun.results || []).filter(
      (r) => r && (r.enrichmentStatus === "failed" || r.enrichmentStatus === "duplicate_skipped")
    );

    const readyCount = currentRun.readyLeads.length;
    const failedCount = currentRun.failedLeads.length;
    const pendingCount = currentRun.candidates.length - (readyCount + failedCount);

    console.log(
      `[SI][DETAIL_PIPELINE][RESULT_COUNT]\nready=${readyCount}\nfailed=${failedCount}\npending=${pendingCount}`
    );

    broadcastProgress(`[LOOP ${readyCount}/${currentRun.candidates.length}] ${savedResult.company_name} ✓`);

    sendResponse({ ok: true });

    console.log(`[SI][QUEUE_ADVANCE] completedCandidate="${savedResult.company_name}" nextCandidateIndex=${index + 1}`);
    processNextCandidateInRun(index + 1);
    return false;
  }

  // --- SI_CANDIDATE_FAILED ---
  if (message.type === "SI_CANDIDATE_FAILED") {
    const runId = message.runId || message.sessionId;
    const attemptId = message.attemptId || null;

    if (runId !== currentRun.runId) {
      sendResponse({ ok: true, ignored: true });
      return false;
    }

    const index = (message.index || 1) - 1;

    // Single-flight guard: reject if index or attemptId is stale
    if (index !== currentRun.activeIndex) {
      console.log(
        `[SI][QUEUE] STALE_FAILURE_IGNORED index=${index + 1} activeIndex=${currentRun.activeIndex + 1}`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }
    if (attemptId && attemptId !== currentRun.activeAttemptId) {
      console.log(
        `[SI][QUEUE] STALE_ATTEMPT_IGNORED index=${index + 1} attemptId=${attemptId} activeAttemptId=${currentRun.activeAttemptId}`
      );
      sendResponse({ ok: true, ignored: true });
      return false;
    }
    if (isTerminalState(currentRun.candidateStates[index])) {
      sendResponse({ ok: true, ignored: true });
      return false;
    }

    const candidate = currentRun.candidates[index] || {};
    handleCandidateFailure(candidate, index, message.reason || "enrichment_failed");
    sendResponse({ ok: true });
    return false;
  }

  return undefined;
});
