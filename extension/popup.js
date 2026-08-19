/**
 * Popup UI Controller for Sales Intel Maps Connector (v1.0.14)
 * Decoupled State Architecture:
 * 1. Google Maps Discovery State (detectedCards, extractedLeads)
 * 2. CSV Export (local snapshot, no Sales Intel connection required)
 * 3. Sales Intel Import (requires active Sales Intel connection)
 */
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
    importBanner: document.getElementById("importBanner"),
    importBannerHeader: document.getElementById("importBannerHeader"),
    importBannerSubtitle: document.getElementById("importBannerSubtitle"),
    importErrorBanner: document.getElementById("importErrorBanner"),
    importErrorHeader: document.getElementById("importErrorHeader"),
    importErrorSubtitle: document.getElementById("importErrorSubtitle"),
    importBreakdownList: document.getElementById("importBreakdownList"),
    statImportCreated: document.getElementById("statImportCreated"),
    statImportMerged: document.getElementById("statImportMerged"),
    statImportDuplicates: document.getElementById("statImportDuplicates"),
    statImportFailedRow: document.getElementById("statImportFailedRow"),
    statImportFailed: document.getElementById("statImportFailed"),
    viewImportedLeadsBtn: document.getElementById("viewImportedLeadsBtn"),
    openAppBtn: document.getElementById("openAppBtn"),
    viewLeadsBtn: document.getElementById("viewLeadsBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    reconnectBtn: document.getElementById("reconnectBtn"),
  };

  const manifestVersion =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : "1.0.16";

  if (el.extVersion) {
    el.extVersion.textContent = `v${manifestVersion}`;
  }

  // Authoritative local state
  let currentExtractedLeads = [];
  let currentSearchQuery = null;
  let currentDetectedCards = 0;
  let siConnected = false;
  let activeSessionId = null;

  function renderImportErrorState(errorMsg) {
    if (!el.resultSummary) return;
    el.resultSummary.classList.remove("hidden");
    if (el.importBanner) el.importBanner.classList.add("hidden");
    if (el.importBreakdownList) el.importBreakdownList.classList.add("hidden");
    if (el.viewImportedLeadsBtn) el.viewImportedLeadsBtn.classList.add("hidden");

    if (el.importErrorBanner) {
      el.importErrorBanner.classList.remove("hidden");
      if (el.importErrorHeader) el.importErrorHeader.textContent = "⚠ IMPORT FAILED";
      if (el.importErrorSubtitle) el.importErrorSubtitle.textContent = errorMsg || "Import failed. Please try again.";
    }
  }

  function renderImportResultState(res) {
    if (!res || !el.importBanner) return;

    if (el.importErrorBanner) el.importErrorBanner.classList.add("hidden");

    const created = res.created || 0;
    const merged = res.merged || 0;
    const duplicate = res.duplicate || 0;
    const rejected = res.rejected || 0;
    const errors = res.errors || 0;
    const totalFailed = rejected + errors;
    const totalAdded = created + merged;

    el.resultSummary.classList.remove("hidden");
    el.importBanner.classList.remove("hidden");
    el.importBreakdownList.classList.remove("hidden");

    if (el.statImportCreated) el.statImportCreated.textContent = created;
    if (el.statImportMerged) el.statImportMerged.textContent = merged;
    if (el.statImportDuplicates) el.statImportDuplicates.textContent = duplicate;
    if (totalFailed > 0) {
      if (el.statImportFailedRow) el.statImportFailedRow.classList.remove("hidden");
      if (el.statImportFailed) el.statImportFailed.textContent = totalFailed;
    } else {
      if (el.statImportFailedRow) el.statImportFailedRow.classList.add("hidden");
    }

    if (totalFailed > 0) {
      // Partial Failure
      el.importBanner.className = "import-banner warning";
      el.importBannerHeader.textContent = "⚠ IMPORT COMPLETED WITH ISSUES";
      el.importBannerSubtitle.textContent = `${totalAdded} lead${totalAdded === 1 ? "" : "s"} added, ${totalFailed} lead${totalFailed === 1 ? "" : "s"} failed`;
      if (el.viewImportedLeadsBtn) {
        el.viewImportedLeadsBtn.classList.remove("hidden");
        el.viewImportedLeadsBtn.textContent = totalAdded > 0
          ? `VIEW ${totalAdded} LEAD${totalAdded === 1 ? "" : "S"} IN SALES INTEL`
          : "VIEW LEADS IN SALES INTEL";
      }
    } else if (created === 0 && merged === 0 && duplicate > 0) {
      // Duplicate-Only Result
      el.importBanner.className = "import-banner success";
      el.importBannerHeader.textContent = "✓ IMPORT CHECKED";
      el.importBannerSubtitle.textContent = `All ${duplicate} lead${duplicate === 1 ? " was" : "s were"} already in Sales Intel`;
      if (el.viewImportedLeadsBtn) {
        el.viewImportedLeadsBtn.classList.remove("hidden");
        el.viewImportedLeadsBtn.textContent = "VIEW LEADS IN SALES INTEL";
      }
    } else if (merged > 0) {
      // Created + Merged
      el.importBanner.className = "import-banner success";
      el.importBannerHeader.textContent = "✓ IMPORT COMPLETED";
      el.importBannerSubtitle.textContent = `${totalAdded} leads added/enriched to Sales Intel`;
      if (el.viewImportedLeadsBtn) {
        el.viewImportedLeadsBtn.classList.remove("hidden");
        el.viewImportedLeadsBtn.textContent = `VIEW ${totalAdded} LEADS IN SALES INTEL`;
      }
    } else {
      // Created Only
      el.importBanner.className = "import-banner success";
      el.importBannerHeader.textContent = "✓ IMPORT COMPLETED";
      el.importBannerSubtitle.textContent = `${created} lead${created === 1 ? "" : "s"} added to Sales Intel`;
      if (el.viewImportedLeadsBtn) {
        el.viewImportedLeadsBtn.classList.remove("hidden");
        el.viewImportedLeadsBtn.textContent = `VIEW ${created} LEADS IN SALES INTEL`;
      }
    }

    if (el.importBackendBtn) {
      el.importBackendBtn.textContent = "Import another batch";
    }
  }

  // ─── Environment ─────────────────────────────────────────────────────────────
  function getEnv() {
    if (window.SalesIntelEnv) {
      return window.SalesIntelEnv.resolveEnvironment(null, null);
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

  function isGoogleMapsUrl(url) {
    if (!url || typeof url !== "string") return false;
    return /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|googleusercontent\.com)\/maps(\/|$|\?)/i.test(url.trim());
  }

  // ─── CSV Generation (Snapshot-Based & Local) ──────────────────────────────────
  function escapeCsvCell(val) {
    if (val == null) return "";
    const str = String(val).trim();
    if (!str.length) return "";
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
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
  ];

  function generateCSV(leads) {
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
        ].join(",")
      );
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
      slug = currentSearchQuery
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    }
    const filename = slug
      ? `sales-intel-${slug}-${YYYY}-${MM}-${DD}.csv`
      : `sales-intel-google-maps-${YYYY}-${MM}-${DD}.csv`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── UI State Rendering ───────────────────────────────────────────────────────

  function updateActionButtons() {
    const readyCount = currentExtractedLeads.length;
    const hasReadyLeads = readyCount > 0;
    const hasCandidates = currentDetectedCards > 0;

    // 1. Download CSV: enabled if ready leads exist OR if candidates are available to extract & download
    el.quickCsvBtn.disabled = !hasReadyLeads && !hasCandidates;
    if (el.downloadCsvBtn) {
      el.downloadCsvBtn.disabled = !hasReadyLeads;
    }

    // 2. Run Discovery (Upper action): triggers extraction/discovery on Google Maps candidates
    el.extractBtn.disabled = !hasReadyLeads && !hasCandidates;
    el.extractBtn.textContent = hasReadyLeads ? "Run Discovery Again" : "Run Discovery";

    // 3. Import to Sales Intel (Summary Card action): ONLY button that imports ready leads to backend
    if (el.importBackendBtn) {
      if (hasReadyLeads) {
        el.importBackendBtn.disabled = !siConnected;
        el.importBackendBtn.textContent = `IMPORT ${readyCount} LEAD${readyCount === 1 ? "" : "S"} TO SALES INTEL`;
      } else {
        el.importBackendBtn.disabled = true;
        el.importBackendBtn.textContent = "NO LEADS READY TO IMPORT";
      }
    }

    // 4. Not connected hint
    if (!siConnected) {
      el.importHint && el.importHint.classList.remove("hidden");
    } else {
      el.importHint && el.importHint.classList.add("hidden");
    }
  }

  function checkSalesIntelConnection() {
    chrome.runtime.sendMessage({ type: "SI_GET_STATUS" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.connected) {
        siConnected = false;
        el.connectionStatus.className = "status-banner disconnected";
        el.statusTitle.textContent = "Not connected to Sales Intel";
        el.statusUser.textContent = "Open Settings to connect.";
      } else {
        siConnected = true;
        el.connectionStatus.className = "status-banner connected";
        el.statusTitle.textContent = "Connected to Sales Intel";
        const user = res.user || res.email;
        el.statusUser.textContent = user
          ? typeof user === "object" && user.email
            ? user.email
            : String(user)
          : "Active Session";
      }
      updateActionButtons();
    });
  }

  function applyDiscoveryState(response) {
    if (!response) return;

    el.mapsDot.className = "maps-dot green";
    el.mapsStatusTitle.textContent = "Google Maps detected";

    const newQuery = response.searchQuery || response.query || null;
    const newSessionId = response.sessionId || null;

    if (newSessionId && activeSessionId && newSessionId !== activeSessionId) {
      currentExtractedLeads = [];
      el.resultSummary.classList.add("hidden");
    }

    activeSessionId = newSessionId;
    currentSearchQuery = newQuery;

    if (currentSearchQuery) {
      el.queryInfo.classList.remove("hidden");
      el.queryInfo.textContent = `Search: "${currentSearchQuery}"`;
    } else {
      el.queryInfo.classList.add("hidden");
    }

    currentDetectedCards = Number(response.cardCount != null ? response.cardCount : response.detected || 0);

    if (currentDetectedCards > 0) {
      el.detectedInfo.textContent = `Detected Cards: ${currentDetectedCards}`;
    } else {
      el.detectedInfo.textContent = "No search results detected yet. Detected Cards: 0";
    }

    if (response.records && response.records.length > 0) {
      currentExtractedLeads = response.records;
      el.resultSummary.classList.remove("hidden");
      el.summaryTitle.textContent = "Discovery Complete";
      if (response.stats) updateSummaryStats(response.stats, currentExtractedLeads.length);
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
    } else {
      el.extractBtn.classList.remove("hidden");
      el.quickCsvBtn.classList.remove("hidden");
      el.stopBtn.classList.add("hidden");
      el.progressContainer.classList.add("hidden");
      if (el.currentBizCard) el.currentBizCard.classList.add("hidden");
    }

    updateActionButtons();
  }

  function checkGoogleMapsTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id || !isGoogleMapsUrl(tabs[0].url)) {
        el.mapsDot.className = "maps-dot gray";
        el.mapsStatusTitle.textContent = "Open Google Maps to discover businesses.";
        el.queryInfo.classList.add("hidden");
        el.detectedInfo.textContent = "";
        currentDetectedCards = 0;
        updateActionButtons();
        return;
      }

      chrome.runtime.sendMessage({ type: "GET_DISCOVERY_STATE" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          return;
        }
        applyDiscoveryState(response);
      });
    });
  }

  function updateSummaryStats(stats, readyCount) {
    if (!stats) return;
    el.statDiscovered.textContent = stats.discovered || stats.totalCandidates || 0;
    el.statQualified.textContent = stats.discovered || stats.qualifiedBusinessCards || 0;
    if (el.statEnriched) el.statEnriched.textContent = stats.enrichmentCompleted || 0;
    if (el.statFailed) el.statFailed.textContent = stats.enrichmentFailed || 0;
    if (el.statDuplicates) el.statDuplicates.textContent = stats.duplicateCount || 0;
    el.statReady.textContent = readyCount != null ? readyCount : stats.enrichmentCompleted || 0;
  }

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

    setField(el.fieldAddress, Boolean(bizInfo.address), "✓ Full Address", "— Address");
    setField(el.fieldPhone, Boolean(bizInfo.phone), "✓ Phone", "— Phone");
    setField(el.fieldWebsite, Boolean(bizInfo.website), "✓ Website", "— Website");
    setField(el.fieldRating, Boolean(bizInfo.rating != null), "✓ Rating / Reviews", "— Rating");
    setField(el.fieldHours, Boolean(bizInfo.opening_status), "✓ Opening Status", "— Hours");
  }

  // ─── Progress Listener ────────────────────────────────────────────────────────
  function listenForProgress() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.type !== "string") return;

      if (message.type === "SI_EXPORT_COMPLETE") {
        console.log(`[SI][EXPORT_FLOW][DOWNLOAD_SUCCESS] id=${message.downloadId} rows=${message.rowCount}`);
        if (el.downloadCsvBtn) {
          el.downloadCsvBtn.textContent = `Downloaded CSV (${message.rowCount})`;
        }
        if (el.quickCsvBtn) {
          el.quickCsvBtn.textContent = `Downloaded (${message.rowCount})`;
        }
        return;
      }

      if (message.type === "SI_EXPORT_FAILED") {
        console.error(`[SI][EXPORT_FLOW][DOWNLOAD_ERROR] ${message.error}`);
        alert(`Export failed: ${message.error}`);
        return;
      }

      if (message.type !== "SI_DISCOVERY_PROGRESS") return;

      el.progressContainer.classList.remove("hidden");
      const found = message.found || 0;
      const target = Number(el.importLimit.value) || 10;
      const pct = Math.min(100, Math.round((found / target) * 100));
      el.progressBar.style.width = `${Math.max(5, pct)}%`;
      el.progressText.textContent = message.statusText || `Extracting ${found} / ${target} leads...`;

      if (message.currentBusiness) {
        updateCurrentBusiness(message.currentBusiness);
      }

      if (message.records && message.records.length > 0) {
        currentExtractedLeads = message.records;
      }

      if (message.status === "completed" || message.status === "cancelled") {
        el.extractBtn.classList.remove("hidden");
        el.quickCsvBtn.classList.remove("hidden");
        el.stopBtn.classList.add("hidden");
        el.progressContainer.classList.add("hidden");
        if (el.currentBizCard) el.currentBizCard.classList.add("hidden");

        if (currentExtractedLeads.length > 0) {
          el.resultSummary.classList.remove("hidden");
          el.summaryTitle.textContent =
            message.status === "completed" ? "Discovery Complete" : "Extraction Stopped";
          if (message.stats) updateSummaryStats(message.stats, currentExtractedLeads.length);
        }

        updateActionButtons();

        if (typeof window._onExtractionComplete === "function") {
          const cb = window._onExtractionComplete;
          window._onExtractionComplete = null;
          cb(currentExtractedLeads);
        }
      }
    });
  }

  // ─── Extraction Initiation ────────────────────────────────────────────────────
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

    chrome.runtime.sendMessage({ type: "SI_START_DISCOVERY", limit }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const errorDetails = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : res?.error || "Initiation failure";
        console.error("[SI][SESSION] START_FAILED", errorDetails);
        el.extractBtn.classList.remove("hidden");
        el.quickCsvBtn.classList.remove("hidden");
        el.stopBtn.classList.add("hidden");
        el.progressContainer.classList.add("hidden");
        alert(`Extraction failed: ${errorDetails}`);
      }
    });

    if (typeof onComplete === "function") {
      window._onExtractionComplete = onComplete;
    }
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────
  function triggerExportFlow() {
    console.log("[SI][EXPORT_FLOW][CLICK]");
    chrome.runtime.sendMessage({ type: "SI_TRIGGER_DOWNLOAD_CSV" }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("[SI][EXPORT_FLOW][DOWNLOAD_ERROR]", chrome.runtime.lastError.message);
        if (currentExtractedLeads.length > 0) {
          triggerCsvDownload(generateCSV(currentExtractedLeads));
        }
        return;
      }
      if (res && res.ok) {
        console.log(`[SI][EXPORT_FLOW][DOWNLOAD_SUCCESS] id=${res.downloadId || "direct"}`);
        return;
      }
      if (res && (res.reason === "NO_LEADS" || res.reason === "NO_RUN")) {
        startExtraction((leads) => {
          if (leads && leads.length > 0) {
            chrome.runtime.sendMessage({ type: "SI_TRIGGER_DOWNLOAD_CSV" });
          }
        });
        return;
      }
      if (currentExtractedLeads.length > 0) {
        triggerCsvDownload(generateCSV(currentExtractedLeads));
      }
    });
  }

  function setupActions() {
    // Quick CSV Download: runs locally without Sales Intel connection
    el.quickCsvBtn.addEventListener("click", () => {
      triggerExportFlow();
    });

    // Import to Sales Intel: requires connection
    el.extractBtn.addEventListener("click", () => {
      if (!siConnected) {
        alert("Connect Sales Intel first to import leads.");
        return;
      }
      startExtraction();
    });

    // Stop
    el.stopBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SI_STOP_DISCOVERY" });
    });

    // Summary Card Download CSV
    el.downloadCsvBtn.addEventListener("click", () => {
      triggerExportFlow();
    });

    // Local double-submit protection lock
    let isLocalImportLocked = false;

    // Summary Card Import to Sales Intel
    el.importBackendBtn.addEventListener("click", () => {
      if (el.importBackendBtn.disabled || isLocalImportLocked) return;
      if (!siConnected) {
        if (el.importHint) {
          el.importHint.textContent = "Connect Sales Intel in Settings to import leads.";
          el.importHint.classList.remove("hidden");
        }
        return;
      }
      if (!currentExtractedLeads || !currentExtractedLeads.length) {
        return;
      }

      // Synchronously lock click event and update button to disabled in-progress state with spinner
      isLocalImportLocked = true;
      const count = currentExtractedLeads.length;
      el.importBackendBtn.disabled = true;
      el.importBackendBtn.innerHTML = `<span class="spinner"></span> IMPORTING ${count} LEAD${count === 1 ? "" : "S"}...`;

      chrome.runtime.sendMessage(
        { type: "SI_BATCH_IMPORT", leads: currentExtractedLeads },
        (res) => {
          isLocalImportLocked = false;

          if (chrome.runtime.lastError || !res || !res.ok) {
            const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : res?.error || "Import failed.";
            updateActionButtons();
            if (res?.status === 401) {
              checkSalesIntelConnection();
              renderImportErrorState("Session expired. Please reconnect to Sales Intel.");
            } else {
              renderImportErrorState(err);
            }
            return;
          }

          // Render persistent outcome banner, breakdown list, and View Leads CTA button in-popup
          renderImportResultState(res);
          updateActionButtons();
        }
      );
    });

    // Navigation links
    const base = getBaseUrl();
    if (el.viewImportedLeadsBtn) {
      el.viewImportedLeadsBtn.addEventListener("click", () => chrome.tabs.create({ url: `${base}/leads` }));
    }
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
    checkSalesIntelConnection();
    checkGoogleMapsTab();

    // Periodic state check while popup is open
    setInterval(() => {
      checkGoogleMapsTab();
      checkSalesIntelConnection();
    }, 2000);
  });
})();
