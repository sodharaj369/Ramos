(function () {
  "use strict";

  const el = {
    envBadge: document.getElementById("envBadge"),
    connectionStatus: document.getElementById("connectionStatus"),
    statusTitle: document.getElementById("statusTitle"),
    statusUser: document.getElementById("statusUser"),
    mapsDot: document.getElementById("mapsDot"),
    mapsStatusTitle: document.getElementById("mapsStatusTitle"),
    queryInfo: document.getElementById("queryInfo"),
    detectedInfo: document.getElementById("detectedInfo"),
    cardStats: document.getElementById("cardStats"),
    statQualifiedLive: document.getElementById("statQualifiedLive"),
    statSkippedLive: document.getElementById("statSkippedLive"),
    statDuplicatesLive: document.getElementById("statDuplicatesLive"),
    importLimit: document.getElementById("importLimit"),
    quickCsvBtn: document.getElementById("quickCsvBtn"),
    extractBtn: document.getElementById("extractBtn"),
    stopBtn: document.getElementById("stopBtn"),
    importHint: document.getElementById("importHint"),
    progressContainer: document.getElementById("progressContainer"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    resultSummary: document.getElementById("resultSummary"),
    summaryTitle: document.getElementById("summaryTitle"),
    statDiscovered: document.getElementById("statDiscovered"),
    statQualified: document.getElementById("statQualified"),
    statEnriched: document.getElementById("statEnriched"),
    statFailed: document.getElementById("statFailed"),
    statSkipped: document.getElementById("statSkipped"),
    statDuplicates: document.getElementById("statDuplicates"),
    statReady: document.getElementById("statReady"),
    currentBizCard: document.getElementById("currentBizCard"),
    currentBizName: document.getElementById("currentBizName"),
    fieldAddress: document.getElementById("fieldAddress"),
    fieldPhone: document.getElementById("fieldPhone"),
    fieldWebsite: document.getElementById("fieldWebsite"),
    fieldRating: document.getElementById("fieldRating"),
    fieldHours: document.getElementById("fieldHours"),
    extVersion: document.getElementById("extVersion"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    importBackendBtn: document.getElementById("importBackendBtn"),
    openAppBtn: document.getElementById("openAppBtn"),
    viewLeadsBtn: document.getElementById("viewLeadsBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    reconnectBtn: document.getElementById("reconnectBtn"),
  };

  const manifestVersion = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest().version
    : "1.0.12";

  if (el.extVersion) {
    el.extVersion.textContent = `v${manifestVersion}`;
  }

  let connectedTabId = null;
  let currentExtractedLeads = [];
  let currentSearchQuery = null;
  let siConnected = false;

  // ─── Environment ─────────────────────────────────────────────────────────────
  function getEnv() {
    if (window.SalesIntelEnv) {
      const detected = window.SalesIntelEnv.resolveEnvironment(null, null);
      return detected;
    }
    return { env: "LOCAL", origin: "http://localhost:8080" };
  }

  function updateEnvBadge() {
    const env = getEnv();
    const isLocal = env.env === "LOCAL";
    el.envBadge.textContent = isLocal ? "LOCAL" : "PROD";
    el.envBadge.className = isLocal ? "badge badge-local" : "badge badge-prod";
  }

  function getBaseUrl() {
    return getEnv().origin;
  }

  // ─── Google Maps URL check ────────────────────────────────────────────────────
  function isGoogleMapsUrl(url) {
    if (!url) return false;
    try {
      const p = new URL(url);
      const host = p.hostname.toLowerCase();
      const isGoogle = host === "google.com" || host === "www.google.com" ||
        host === "maps.google.com" || /(^|\.)google\.[a-z.]+$/.test(host);
      const isMaps = p.pathname.startsWith("/maps") || host.startsWith("maps.google.");
      return isGoogle && isMaps;
    } catch { return false; }
  }

  // ─── CSV Generation ───────────────────────────────────────────────────────────
  function escapeCsvCell(val) {
    if (val == null) return "";
    const str = String(val);
    if (!str.length) return "";
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const CSV_HEADERS = [
    "Company", "Phone", "Website", "Email", "Email Status",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Business Type", "Rating", "Reviews", "Opening Status", "Price Range",
    "Booking URL", "Ordering URL", "Menu URL",
    "Imported At", "Source URL",
  ];

  function generateCSV(leads) {
    const now = new Date().toISOString();
    const rows = [CSV_HEADERS.join(",")];
    for (const lead of leads) {
      if (!lead || !lead.company_name) continue;
      console.log("[SI][CSV][ROW]", JSON.stringify(lead));
      rows.push([
        escapeCsvCell(lead.company_name),
        escapeCsvCell(lead.phone),
        escapeCsvCell(lead.website),
        escapeCsvCell(lead.email),
        escapeCsvCell(lead.email_status),
        escapeCsvCell(lead.address),
        escapeCsvCell(lead.city),
        escapeCsvCell(lead.region),
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
      ].join(","));
    }
    return "\uFEFF" + rows.join("\r\n");
  }

  function triggerCsvDownload(csvText) {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    let slug = "";
    if (currentSearchQuery) {
      slug = currentSearchQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "").slice(0, 40);
    }
    const filename = slug
      ? `sales-intel-${slug}-${YYYY}-${MM}-${DD}.csv`
      : `sales-intel-google-maps-${YYYY}-${MM}-${DD}.csv`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ─── State 1: Sales Intel Connection ─────────────────────────────────────────
  function checkSalesIntelConnection() {
    chrome.runtime.sendMessage({ type: "SI_GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.connected) {
        siConnected = false;
        el.connectionStatus.className = "status-banner disconnected";
        el.statusTitle.textContent = "Not connected to Sales Intel";
        el.statusUser.textContent = "Open Settings to connect.";
        el.extractBtn.disabled = true;
        el.importBackendBtn && (el.importBackendBtn.disabled = true);
        el.importHint && el.importHint.classList.remove("hidden");
        return;
      }
      siConnected = true;
      el.connectionStatus.className = "status-banner connected";
      el.statusTitle.textContent = "Connected to Sales Intel";
      const user = res.user || res.email;
      el.statusUser.textContent = user
        ? (typeof user === "object" && user.email ? user.email : String(user))
        : "Active Session";
      el.importHint && el.importHint.classList.add("hidden");

      if (currentExtractedLeads.length > 0) {
        el.extractBtn.disabled = false;
        el.importBackendBtn && (el.importBackendBtn.disabled = false);
      }
    });
  }

  // ─── State 2: Google Maps Tab ─────────────────────────────────────────────────
  function setMapsNotOpen() {
    el.mapsDot.className = "maps-dot gray";
    el.mapsStatusTitle.textContent = "Open Google Maps to discover businesses.";
    el.queryInfo.classList.add("hidden");
    el.detectedInfo.textContent = "";
    el.cardStats && el.cardStats.classList.add("hidden");
    el.quickCsvBtn.disabled = currentExtractedLeads.length === 0;
    el.extractBtn.disabled = true;
  }

  function setMapsNoResults() {
    el.mapsDot.className = "maps-dot green";
    el.mapsStatusTitle.textContent = "Google Maps detected";
    el.queryInfo.classList.add("hidden");
    el.detectedInfo.textContent = "No search results detected yet. Detected Cards: 0";
    el.cardStats && el.cardStats.classList.add("hidden");
    el.quickCsvBtn.disabled = currentExtractedLeads.length === 0;
    el.extractBtn.disabled = true;
  }

  function getActionButtonState(state) {
    const cardCount = Number(state.cardCount != null ? state.cardCount : (state.detected || 0));
    const readyCount = Number(state.readyCount || (state.records ? state.records.length : 0));
    const hasCandidates = cardCount > 0 || readyCount > 0;
    const isConnected = Boolean(state.siConnected);

    return {
      downloadCsvEnabled: hasCandidates,
      importEnabled: hasCandidates && isConnected,
    };
  }

  function applyMapsState(response) {
    el.mapsDot.className = "maps-dot green";
    el.mapsStatusTitle.textContent = "Google Maps detected";
    const newQuery = response.searchQuery || response.query || null;

    if (newQuery && currentSearchQuery && newQuery.toLowerCase().trim() !== currentSearchQuery.toLowerCase().trim()) {
      console.log(`[SI][SESSION][RESET]\nreason=popup_detected_query_change\npreviousQuery=${currentSearchQuery}\nnewQuery=${newQuery}`);
      currentExtractedLeads = [];
      el.resultSummary.classList.add("hidden");
    }

    currentSearchQuery = newQuery;
    if (currentSearchQuery) {
      el.queryInfo.classList.remove("hidden");
      el.queryInfo.textContent = `Search: "${currentSearchQuery}"`;
    } else {
      el.queryInfo.classList.add("hidden");
    }
    const cardCount = response.cardCount != null ? response.cardCount : (response.detected || 0);
    console.log(`[SI][STATE][POPUP] cards=${cardCount}`);

    const btnState = getActionButtonState({
      cardCount,
      readyCount: response.readyCount,
      records: response.records,
      siConnected,
    });

    if (cardCount > 0) {
      el.detectedInfo.textContent = `Detected Cards: ${cardCount}`;
    } else {
      el.detectedInfo.textContent = "No search results detected yet. Detected Cards: 0";
    }

    el.quickCsvBtn.disabled = !btnState.downloadCsvEnabled;
    el.extractBtn.disabled = !btnState.importEnabled;

    if (!siConnected) {
      el.importHint && el.importHint.classList.remove("hidden");
    } else {
      el.importHint && el.importHint.classList.add("hidden");
    }

    if (response.running) {
      el.extractBtn.classList.add("hidden");
      el.quickCsvBtn.classList.add("hidden");
      el.stopBtn.classList.remove("hidden");
      el.progressContainer.classList.remove("hidden");
      if (response.currentBusiness) {
        updateCurrentBusiness(response.currentBusiness);
      }
      if (response.stats) {
        updateSummaryStats(response.stats, response.readyCount);
      }
    } else if (response.records && response.records.length > 0) {
      const activeQ = currentSearchQuery ? currentSearchQuery.toLowerCase().trim() : null;
      const matchingRecords = response.records.filter(r => !r.searchQuery || (activeQ && r.searchQuery.toLowerCase().trim() === activeQ));
      if (matchingRecords.length > 0) {
        currentExtractedLeads = matchingRecords;
        el.resultSummary.classList.remove("hidden");
        el.summaryTitle.textContent = "Discovery Complete";
        if (response.stats) updateSummaryStats(response.stats, currentExtractedLeads.length);
        if (el.downloadCsvBtn) el.downloadCsvBtn.disabled = false;
        if (el.importBackendBtn) el.importBackendBtn.disabled = !siConnected;
      } else {
        currentExtractedLeads = [];
        el.resultSummary.classList.add("hidden");
      }
    }
  }

  async function injectContentScripts(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          "shared/constants.js", "shared/environment.js", "shared/schema.js",
          "content/maps/dom-utils.js", "content/maps/selectors.js",
          "content/maps/validators.js", "content/maps/address-parser.js",
          "content/maps/result-card-extractor.js",
          "content/maps/maps-adapter.js", "discovery.js",
        ],
      });
      return true;
    } catch { return false; }
  }

  async function checkGoogleMapsTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) { setMapsNotOpen(); return; }
      connectedTabId = tab.id;
      if (!isGoogleMapsUrl(tab.url)) { setMapsNotOpen(); return; }

      // Popup queries Background (stable coordinator) for GET_MAPS_STATE
      chrome.runtime.sendMessage({ type: "GET_MAPS_STATE" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          console.log("[SI][MSG][RECOVERED] type=GET_MAPS_STATE reason=lastError_handled");
          setMapsNoResults();
          return;
        }
        applyMapsState(response);
      });
    } catch { setMapsNotOpen(); }
  }

  // ─── Summary helpers ─────────────────────────────────────────────────────────
  function updateSummaryStats(stats, readyCount) {
    if (!stats) return;
    el.statDiscovered.textContent = stats.totalCandidates || 0;
    el.statQualified.textContent = stats.qualifiedBusinessCards || 0;
    if (el.statEnriched) el.statEnriched.textContent = stats.enrichmentCompleted || stats.enriched || 0;
    if (el.statFailed) el.statFailed.textContent = stats.enrichmentFailed || stats.enrichment_failed || 0;
    el.statSkipped.textContent = (stats.skippedNonBusiness || 0) + (stats.skippedIncomplete || 0);
    el.statDuplicates.textContent = stats.duplicateCount || 0;
    el.statReady.textContent = readyCount != null ? readyCount : (stats.readyCount || stats.importedCount || 0);
  }

  // ─── Current Business Indicator ──────────────────────────────────────────────
  function updateCurrentBusiness(bizInfo) {
    if (!bizInfo || !bizInfo.name) {
      if (el.currentBizCard) el.currentBizCard.classList.add("hidden");
      return;
    }
    if (el.currentBizCard) el.currentBizCard.classList.remove("hidden");
    if (el.currentBizName) el.currentBizName.textContent = bizInfo.name;

    function setField(element, isFound, foundText, missingText) {
      if (!element) return;
      if (isFound) {
        element.className = "biz-field found";
        element.textContent = foundText;
      } else {
        element.className = "biz-field gray";
        element.textContent = missingText;
      }
    }

    setField(el.fieldAddress, Boolean(bizInfo.address || bizInfo.hasAddress), "✓ Full Address", "— Address");
    setField(el.fieldPhone, Boolean(bizInfo.phone || bizInfo.hasPhone), "✓ Phone", "— Phone");
    setField(el.fieldWebsite, Boolean(bizInfo.website || bizInfo.hasWebsite), "✓ Website", "— Website");
    setField(el.fieldRating, Boolean(bizInfo.rating != null || bizInfo.review_count != null || bizInfo.hasRating || bizInfo.hasReviews), "✓ Rating / Reviews", "— Rating");
    setField(el.fieldHours, Boolean(bizInfo.opening_status || bizInfo.hasOpeningStatus), "✓ Opening Status", "— Hours");
  }

  // ─── Progress listener ────────────────────────────────────────────────────────
  function listenForProgress() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== "SI_DISCOVERY_PROGRESS") return;
      el.progressContainer.classList.remove("hidden");
      const found = message.found || 0;
      const target = Number(el.importLimit.value) || 10;
      const pct = Math.min(100, Math.round((found / target) * 100));
      el.progressBar.style.width = `${pct}%`;
      el.progressText.textContent = message.statusText || `Extracting & validating ${found} / ${target} leads...`;

      if (message.currentBusiness) {
        updateCurrentBusiness(message.currentBusiness);
      }

      if (message.stats) {
        const s = message.stats;
        if (el.statQualifiedLive) el.statQualifiedLive.textContent = s.qualifiedBusinessCards || 0;
        if (el.statSkippedLive) el.statSkippedLive.textContent = (s.skippedNonBusiness || 0) + (s.skippedIncomplete || 0);
        if (el.statDuplicatesLive) el.statDuplicatesLive.textContent = s.duplicateCount || 0;
        if (el.cardStats) el.cardStats.classList.remove("hidden");
        updateSummaryStats(s, found);
      }
      if (message.status === "completed" || message.status === "cancelled") {
        el.extractBtn.classList.remove("hidden");
        el.quickCsvBtn.classList.remove("hidden");
        el.stopBtn.classList.add("hidden");
        el.progressContainer.classList.add("hidden");
        if (el.currentBizCard) el.currentBizCard.classList.add("hidden");
        el.resultSummary.classList.remove("hidden");
        el.summaryTitle.textContent = message.status === "completed"
          ? "Discovery Complete" : "Extraction Stopped";

        if (message.records && message.records.length > 0) {
          currentExtractedLeads = message.records;
        }

        if (el.downloadCsvBtn) {
          el.downloadCsvBtn.disabled = currentExtractedLeads.length === 0;
        }
        if (el.importBackendBtn) {
          el.importBackendBtn.disabled = currentExtractedLeads.length === 0 || !siConnected;
        }

        if (typeof window._onExtractionComplete === "function") {
          const cb = window._onExtractionComplete;
          window._onExtractionComplete = null;
          cb(currentExtractedLeads);
        }
      }
    });
  }

  // ─── Extraction ───────────────────────────────────────────────────────────────
  function startExtraction(onComplete) {
    const limit = Math.min(Math.max(Number(el.importLimit?.value) || 10, 1), 50);
    el.resultSummary.classList.add("hidden");
    el.extractBtn.classList.add("hidden");
    el.quickCsvBtn.classList.add("hidden");
    el.stopBtn.classList.remove("hidden");
    el.progressContainer.classList.remove("hidden");
    el.progressBar.style.width = "5%";
    el.progressText.textContent = "Initiating bulk extraction...";
    currentExtractedLeads = [];

    console.log("[SI][EXTRACTION][START]");

    // Send SI_START_DISCOVERY to Background Service Worker (stable coordinator)
    chrome.runtime.sendMessage({ type: "SI_START_DISCOVERY", limit }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const errorDetails = chrome.runtime.lastError ? chrome.runtime.lastError.message : (res?.error || "Unknown initiation failure");
        console.error("[SI][EXTRACTION][FAILED]", {
          stage: "initiation",
          error: errorDetails,
        });
        el.extractBtn.classList.remove("hidden");
        el.quickCsvBtn.classList.remove("hidden");
        el.stopBtn.classList.add("hidden");
        el.progressContainer.classList.add("hidden");
        alert(`Extraction failed. Check the extension console for [SI][EXTRACTION][FAILED]. (${errorDetails})`);
        return;
      }

      if (res.stats) {
        console.log(`[SI][EXTRACTION][QUALIFIED] count=${res.stats.discovered || 0}`);
      }
    });

    // Save completion callback if provided
    if (typeof onComplete === "function") {
      window._onExtractionComplete = onComplete;
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────────
  function setupActions() {
    // Download CSV — works without SI connection
    el.quickCsvBtn.addEventListener("click", () => {
      const activeQuery = currentSearchQuery ? currentSearchQuery.toLowerCase().trim() : null;
      const hasValidLeads = currentExtractedLeads.length > 0 &&
        currentExtractedLeads.every(l => !l.searchQuery || (activeQuery && l.searchQuery.toLowerCase().trim() === activeQuery));

      if (hasValidLeads) {
        triggerCsvDownload(generateCSV(currentExtractedLeads));
      } else {
        if (currentExtractedLeads.length > 0) {
          console.warn("[SI][CSV][STALE_DATA_BLOCKED]", { activeQuery, staleCount: currentExtractedLeads.length });
          currentExtractedLeads = [];
        }
        startExtraction((leads) => {
          if (leads && leads.length > 0) triggerCsvDownload(generateCSV(leads));
        });
      }
    });

    // Import to Sales Intel — requires connection
    el.extractBtn.addEventListener("click", () => {
      if (!siConnected) { alert("Connect Sales Intel first to import leads."); return; }
      startExtraction();
    });

    // Stop
    el.stopBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SI_STOP_DISCOVERY" });
    });

    // Summary: Download CSV
    el.downloadCsvBtn.addEventListener("click", () => {
      if (!currentExtractedLeads || !currentExtractedLeads.length) {
        alert("No extracted leads ready to download."); return;
      }
      triggerCsvDownload(generateCSV(currentExtractedLeads));
    });

    // Summary: Import to Sales Intel
    el.importBackendBtn.addEventListener("click", () => {
      if (!siConnected) { alert("Connect Sales Intel first."); return; }
      if (!currentExtractedLeads || !currentExtractedLeads.length) {
        alert("No extracted leads ready to import."); return;
      }
      el.importBackendBtn.disabled = true;
      el.importBackendBtn.textContent = "Importing...";
      chrome.runtime.sendMessage({ type: "SI_BATCH_IMPORT", leads: currentExtractedLeads }, (res) => {
        el.importBackendBtn.disabled = false;
        el.importBackendBtn.textContent = "Import to Sales Intel";
        if (chrome.runtime.lastError || !res || !res.ok) {
          alert(res?.error || "Import failed."); return;
        }
        alert(`Successfully imported ${res.imported || currentExtractedLeads.length} lead(s)!`);
      });
    });

    // Footer nav
    const base = getBaseUrl();
    el.openAppBtn.addEventListener("click", () => chrome.tabs.create({ url: base }));
    el.viewLeadsBtn.addEventListener("click", () => chrome.tabs.create({ url: `${base}/leads` }));
    el.settingsBtn.addEventListener("click", () => chrome.tabs.create({ url: `${base}/settings` }));
    el.reconnectBtn.addEventListener("click", () => {
      checkSalesIntelConnection();
      checkGoogleMapsTab();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateEnvBadge();
    listenForProgress();
    setupActions();
    // Independent state checks — run in parallel
    checkSalesIntelConnection();
    checkGoogleMapsTab();
  });
})();
