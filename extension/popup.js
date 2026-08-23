/**
 * Standalone Popup UI Controller for RAMOS Maps Connector (v1.0.5)
 * Operates completely client-side. Handles Google Maps tab detection,
 * discovery initiation, live progress tracking, and CSV/XLSX export.
 */
(function () {
  "use strict";

  const el = {
    mapsDot: document.getElementById("mapsDot"),
    mapsStatusTitle: document.getElementById("mapsStatusTitle"),
    queryInfo: document.getElementById("queryInfo"),
    detectedInfo: document.getElementById("detectedInfo"),
    importLimit: document.getElementById("importLimit"),
    extractBtn: document.getElementById("extractBtn"),
    stopBtn: document.getElementById("stopBtn"),
    progressContainer: document.getElementById("progressContainer"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    resultSummary: document.getElementById("resultSummary"),
    summaryTitle: document.getElementById("summaryTitle"),
    statDiscovered: document.getElementById("statDiscovered"),
    statQualified: document.getElementById("statQualified"),
    statEnriched: document.getElementById("statEnriched"),
    statFailed: document.getElementById("statFailed"),
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
    downloadXlsxBtn: document.getElementById("downloadXlsxBtn"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    exportToast: document.getElementById("exportToast"),
  };

  const manifestVersion =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : "1.0.5";

  if (el.extVersion) {
    el.extVersion.textContent = `v${manifestVersion}`;
  }

  // Authoritative local state
  let currentExtractedLeads = [];
  let currentSearchQuery = null;
  let currentDetectedCards = 0;
  let activeSessionId = null;

  function showToast(msg, type = "success") {
    if (!el.exportToast) return;
    el.exportToast.className = `toast-banner ${type}`;
    el.exportToast.textContent = msg;
    el.exportToast.classList.remove("hidden");
    setTimeout(() => {
      if (el.exportToast) el.exportToast.classList.add("hidden");
    }, 4000);
  }

  function isGoogleMapsUrl(url) {
    if (!url || typeof url !== "string") return false;
    return /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|googleusercontent\.com)\/maps(\/|$|\?)/i.test(url.trim());
  }

  // ─── CSV & XLSX Generators (Fallback Local Exporters) ────────────────────────
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
    "Place ID",
    "Source Query",
    "Run ID",
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
      ? `ramos-${slug}-${YYYY}-${MM}-${DD}.csv`
      : `ramos-google-maps-${YYYY}-${MM}-${DD}.csv`;
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

  function triggerXlsxDownload(leads) {
    if (typeof RamosXlsxBuilder === "undefined" || typeof RamosXlsxBuilder.buildXlsx !== "function") {
      showToast("Excel generator unavailable. Exporting CSV instead.", "error");
      triggerCsvDownload(generateCSV(leads));
      return;
    }
    const buffer = RamosXlsxBuilder.buildXlsx(leads);
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
      ? `ramos-${slug}-${YYYY}-${MM}-${DD}.xlsx`
      : `ramos-google-maps-${YYYY}-${MM}-${DD}.xlsx`;
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

    if (el.downloadXlsxBtn) {
      el.downloadXlsxBtn.disabled = !hasReadyLeads;
    }
    if (el.downloadCsvBtn) {
      el.downloadCsvBtn.disabled = !hasReadyLeads;
    }

    if (el.extractBtn) {
      el.extractBtn.disabled = !hasReadyLeads && !hasCandidates;
      el.extractBtn.textContent = hasReadyLeads ? "Run Discovery Again" : "Run Discovery";
    }
  }

  function applyDiscoveryState(response) {
    if (!response) return;

    if (el.mapsDot) el.mapsDot.className = "maps-dot green";
    if (el.mapsStatusTitle) el.mapsStatusTitle.textContent = "Google Maps detected";

    const newQuery = response.searchQuery || response.query || null;
    const newSessionId = response.runId || response.sessionId || null;

    if (newSessionId && activeSessionId && newSessionId !== activeSessionId) {
      currentExtractedLeads = [];
      if (el.resultSummary) el.resultSummary.classList.add("hidden");
    }

    activeSessionId = newSessionId;
    currentSearchQuery = newQuery;

    if (currentSearchQuery && el.queryInfo) {
      el.queryInfo.classList.remove("hidden");
      el.queryInfo.textContent = `Search: "${currentSearchQuery}"`;
    } else if (el.queryInfo) {
      el.queryInfo.classList.add("hidden");
    }

    currentDetectedCards = Number(response.cardCount != null ? response.cardCount : response.detected || 0);

    if (el.detectedInfo) {
      if (currentDetectedCards > 0) {
        el.detectedInfo.textContent = `Detected Cards: ${currentDetectedCards}`;
      } else {
        el.detectedInfo.textContent = "No search results detected yet. Detected Cards: 0";
      }
    }

    if (response.records && response.records.length > 0) {
      currentExtractedLeads = response.records;
      if (el.resultSummary) el.resultSummary.classList.remove("hidden");
      if (el.summaryTitle) el.summaryTitle.textContent = "Discovery Complete";
      if (response.stats) updateSummaryStats(response.stats, currentExtractedLeads.length);
    }

    if (response.running) {
      if (el.extractBtn) el.extractBtn.classList.add("hidden");
      if (el.stopBtn) el.stopBtn.classList.remove("hidden");
      if (el.progressContainer) el.progressContainer.classList.remove("hidden");
      if (response.currentBusiness) {
        updateCurrentBusiness(response.currentBusiness);
      }
      if (response.stats) {
        updateSummaryStats(response.stats, response.readyCount);
      }
    } else {
      if (el.extractBtn) el.extractBtn.classList.remove("hidden");
      if (el.stopBtn) el.stopBtn.classList.add("hidden");
      if (el.progressContainer) el.progressContainer.classList.add("hidden");
      if (el.currentBizCard) el.currentBizCard.classList.add("hidden");
    }

    updateActionButtons();
  }

  function checkGoogleMapsTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length || !tabs[0].id || !isGoogleMapsUrl(tabs[0].url)) {
        if (el.mapsDot) el.mapsDot.className = "maps-dot gray";
        if (el.mapsStatusTitle) el.mapsStatusTitle.textContent = "Open Google Maps to discover businesses.";
        if (el.queryInfo) el.queryInfo.classList.add("hidden");
        if (el.detectedInfo) el.detectedInfo.textContent = "";
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
    if (el.statDiscovered) el.statDiscovered.textContent = stats.discovered || stats.totalCandidates || 0;
    if (el.statQualified) el.statQualified.textContent = stats.discovered || stats.qualifiedBusinessCards || 0;
    if (el.statEnriched) el.statEnriched.textContent = stats.enrichmentCompleted || 0;
    if (el.statFailed) el.statFailed.textContent = stats.enrichmentFailed || 0;
    if (el.statDuplicates) el.statDuplicates.textContent = stats.duplicateCount || 0;
    if (el.statReady) el.statReady.textContent = readyCount != null ? readyCount : stats.enrichmentCompleted || 0;
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
        const fmtUpper = (message.format || "CSV").toUpperCase();
        console.log(`[RAMOS][EXPORT][SUCCESS] id=${message.downloadId} rows=${message.rowCount} format=${fmtUpper}`);
        showToast(`Exported ${message.rowCount} leads to ${fmtUpper}.`, "success");
        return;
      }

      if (message.type === "SI_EXPORT_FAILED") {
        console.error(`[RAMOS][EXPORT][ERROR] ${message.error}`);
        showToast(`Export failed: ${message.error}`, "error");
        return;
      }

      if (message.type !== "SI_DISCOVERY_PROGRESS") return;

      if (el.progressContainer) el.progressContainer.classList.remove("hidden");
      const found = message.found || 0;
      const target = Number(el.importLimit?.value) || 10;
      const pct = Math.min(100, Math.round((found / target) * 100));
      if (el.progressBar) el.progressBar.style.width = `${Math.max(5, pct)}%`;
      if (el.progressText) el.progressText.textContent = message.statusText || `Extracting ${found} / ${target} leads...`;

      if (message.currentBusiness) {
        updateCurrentBusiness(message.currentBusiness);
      }

      if (message.records && message.records.length > 0) {
        currentExtractedLeads = message.records;
      }

      if (message.status === "completed" || message.status === "cancelled") {
        if (el.extractBtn) el.extractBtn.classList.remove("hidden");
        if (el.stopBtn) el.stopBtn.classList.add("hidden");
        if (el.progressContainer) el.progressContainer.classList.add("hidden");
        if (el.currentBizCard) el.currentBizCard.classList.add("hidden");

        if (currentExtractedLeads.length > 0 && el.resultSummary) {
          el.resultSummary.classList.remove("hidden");
          if (el.summaryTitle) {
            el.summaryTitle.textContent =
              message.status === "completed" ? "Discovery Complete" : "Extraction Stopped";
          }
          if (message.stats) updateSummaryStats(message.stats, currentExtractedLeads.length);
        }

        updateActionButtons();
      }
    });
  }

  // ─── Extraction Initiation ────────────────────────────────────────────────────
  function startExtraction() {
    const limit = Math.min(Math.max(Number(el.importLimit?.value) || 10, 1), 50);
    if (el.resultSummary) el.resultSummary.classList.add("hidden");
    if (el.extractBtn) el.extractBtn.classList.add("hidden");
    if (el.stopBtn) el.stopBtn.classList.remove("hidden");
    if (el.progressContainer) el.progressContainer.classList.remove("hidden");
    if (el.progressBar) el.progressBar.style.width = "5%";
    if (el.progressText) el.progressText.textContent = "Initiating bulk extraction...";
    currentExtractedLeads = [];

    chrome.runtime.sendMessage({ type: "SI_START_DISCOVERY", limit }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        const errorDetails = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : res?.error || "Initiation failure";
        console.error("[RAMOS][START_FAILED]", errorDetails);
        if (el.extractBtn) el.extractBtn.classList.remove("hidden");
        if (el.stopBtn) el.stopBtn.classList.add("hidden");
        if (el.progressContainer) el.progressContainer.classList.add("hidden");
        showToast(`Extraction failed: ${errorDetails}`, "error");
      }
    });
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────
  function triggerExport(format = "xlsx") {
    console.log(`[RAMOS][EXPORT_FLOW] format=${format}`);
    chrome.runtime.sendMessage(
      { type: format === "xlsx" ? "SI_TRIGGER_DOWNLOAD_EXCEL" : "SI_TRIGGER_DOWNLOAD_CSV", format },
      (res) => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message;
          console.error("[RAMOS][EXPORT_ERROR]", err);
          if (currentExtractedLeads.length > 0) {
            if (format === "xlsx") {
              triggerXlsxDownload(currentExtractedLeads);
            } else {
              triggerCsvDownload(generateCSV(currentExtractedLeads));
            }
            showToast(`Exported ${currentExtractedLeads.length} leads.`, "success");
          } else {
            showToast(`Export failed: ${err}`, "error");
          }
          return;
        }

        if (res && res.ok) {
          console.log(`[RAMOS][EXPORT_SUCCESS] format=${format} count=${res.rowCount}`);
          showToast(`Exported ${res.rowCount || currentExtractedLeads.length} leads to ${format.toUpperCase()}.`, "success");
        } else {
          const msg = res?.error || "No completed leads are available to export yet.";
          console.warn(`[RAMOS][EXPORT_WARN] ${msg}`);
          showToast(msg, "error");
        }
      }
    );
  }

  function setupActions() {
    if (el.extractBtn) {
      el.extractBtn.addEventListener("click", () => startExtraction());
    }
    if (el.stopBtn) {
      el.stopBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "SI_STOP_DISCOVERY" });
      });
    }
    if (el.downloadXlsxBtn) {
      el.downloadXlsxBtn.addEventListener("click", () => triggerExport("xlsx"));
    }
    if (el.downloadCsvBtn) {
      el.downloadCsvBtn.addEventListener("click", () => triggerExport("csv"));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    listenForProgress();
    setupActions();
    checkGoogleMapsTab();

    // Periodic check while popup is open
    setInterval(() => {
      checkGoogleMapsTab();
    }, 2000);
  });
})();
