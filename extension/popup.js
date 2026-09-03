/**
 * Standalone Popup UI Controller for RAMOS (v1.0.5)
 * Dual-Mode Controller:
 * 1. Google Maps Lead Extractor (Stable & Frozen)
 * 2. Website Intelligence & Bounded Crawler
 */
(function () {
  "use strict";

  // Cache DOM Elements
  const el = {
    // Mode Tabs
    tabMapsBtn: document.getElementById("tabMapsBtn"),
    tabWebsiteBtn: document.getElementById("tabWebsiteBtn"),
    mapsPanel: document.getElementById("mapsPanel"),
    websitePanel: document.getElementById("websitePanel"),

    // Toast
    exportToast: document.getElementById("exportToast"),
    extVersion: document.getElementById("extVersion"),

    // Maps Elements
    mapsDot: document.getElementById("mapsDot"),
    mapsStatusTitle: document.getElementById("mapsStatusTitle"),
    queryInfo: document.getElementById("queryInfo"),
    detectedInfo: document.getElementById("detectedInfo"),
    openMapsBtn: document.getElementById("openMapsBtn"),
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
    downloadXlsxBtn: document.getElementById("downloadXlsxBtn"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),

    // Website Enrichment Elements (Phase 6)
    enrichSection: document.getElementById("enrichSection"),
    enrichStatusInfo: document.getElementById("enrichStatusInfo"),
    enrichWebsitesBtn: document.getElementById("enrichWebsitesBtn"),
    stopEnrichBtn: document.getElementById("stopEnrichBtn"),
    enrichProgressContainer: document.getElementById("enrichProgressContainer"),
    enrichProgressBar: document.getElementById("enrichProgressBar"),
    enrichProgressText: document.getElementById("enrichProgressText"),
    enrichMetricCount: document.getElementById("enrichMetricCount"),
    enrichMetricSkipped: document.getElementById("enrichMetricSkipped"),
    enrichMetricFailed: document.getElementById("enrichMetricFailed"),

    // Website Intelligence Elements
    webUrlInput: document.getElementById("webUrlInput"),
    webUseActiveTabBtn: document.getElementById("webUseActiveTabBtn"),
    scopeCompany: document.getElementById("scopeCompany"),
    scopeContact: document.getElementById("scopeContact"),
    scopeSocial: document.getElementById("scopeSocial"),
    scopePeople: document.getElementById("scopePeople"),
    webCrawlLimit: document.getElementById("webCrawlLimit"),
    webAnalyzeBtn: document.getElementById("webAnalyzeBtn"),
    webStopBtn: document.getElementById("webStopBtn"),
    webProgressContainer: document.getElementById("webProgressContainer"),
    webProgressBar: document.getElementById("webProgressBar"),
    webProgressText: document.getElementById("webProgressText"),
    webMetricDiscovered: document.getElementById("webMetricDiscovered"),
    webMetricScanned: document.getElementById("webMetricScanned"),
    webMetricPeople: document.getElementById("webMetricPeople"),
    webResultSummary: document.getElementById("webResultSummary"),
    webSummaryTitle: document.getElementById("webSummaryTitle"),
    webConfidenceBadge: document.getElementById("webConfidenceBadge"),
    webLeadCompany: document.getElementById("webLeadCompany"),
    webLeadEmail: document.getElementById("webLeadEmail"),
    webLeadPhone: document.getElementById("webLeadPhone"),
    webLeadAddress: document.getElementById("webLeadAddress"),
    webLeadSocial: document.getElementById("webLeadSocial"),
    webPeopleSection: document.getElementById("webPeopleSection"),
    webPeopleCount: document.getElementById("webPeopleCount"),
    webPeopleList: document.getElementById("webPeopleList"),
    webEvidenceDetails: document.getElementById("webEvidenceDetails"),
    webEvidenceContent: document.getElementById("webEvidenceContent"),
    webDownloadXlsxBtn: document.getElementById("webDownloadXlsxBtn"),
    webDownloadCsvBtn: document.getElementById("webDownloadCsvBtn"),
  };

  const manifestVersion =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : "1.0.5";

  if (el.extVersion) {
    el.extVersion.textContent = `v${manifestVersion}`;
  }

  // ─── Local State ─────────────────────────────────────────────────────────────
  let currentActiveTabMode = "maps"; // "maps" | "website"
  let currentExtractedLeads = []; // Maps leads
  let currentSearchQuery = null;
  let currentDetectedCards = 0;

  // Website Intelligence State
  let currentWebLead = null;
  let webCrawlAbortController = null;
  let isWebCrawling = false;
  let isWebExporting = false;

  // Website Enrichment State (Phase 6)
  let isEnrichingWebsites = false;
  let enrichAbortController = null;

  function showToast(msg, type = "success") {
    if (!el.exportToast) return;
    el.exportToast.className = `toast-banner ${type}`;
    el.exportToast.textContent = msg;
    el.exportToast.classList.remove("hidden");
    setTimeout(() => {
      if (el.exportToast) el.exportToast.classList.add("hidden");
    }, 4000);
  }

  // ─── Mode Switching ──────────────────────────────────────────────────────────
  function setTabMode(mode) {
    currentActiveTabMode = mode;
    if (mode === "maps") {
      el.tabMapsBtn?.classList.add("active");
      el.tabWebsiteBtn?.classList.remove("active");
      el.mapsPanel?.classList.remove("hidden");
      el.websitePanel?.classList.add("hidden");
    } else {
      el.tabMapsBtn?.classList.remove("active");
      el.tabWebsiteBtn?.classList.add("active");
      el.mapsPanel?.classList.add("hidden");
      el.websitePanel?.classList.remove("hidden");
      checkActiveTabForWebsite();
    }
  }

  function checkActiveTabForWebsite() {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        const url = tabs[0].url.trim();
        if (/^https?:\/\//i.test(url) && !isGoogleMapsUrl(url)) {
          if (el.webUrlInput && !el.webUrlInput.value) {
            el.webUrlInput.value = url;
          }
        }
      }
    });
  }

  // ─── GOOGLE MAPS CONTROLLER (FROZEN) ─────────────────────────────────────────
  function isGoogleMapsUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    return (
      /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|googleusercontent\.com)\/maps(\/|$|\?)/i.test(trimmed) ||
      /^(https?:\/\/)?maps\.google\.[a-z.]+(\/|$|\?)/i.test(trimmed)
    );
  }

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
    "Company", "Phone", "Website", "Email", "Email Status",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Business Type", "Rating", "Reviews", "Opening Status",
    "Price Range", "Booking URL", "Ordering URL", "Menu URL",
    "Imported At", "Source URL", "Place ID", "Source Query", "Run ID"
  ];

  function leadToCsvRow(l) {
    return [
      escapeCsvCell(l.company_name || l.website || "—"),
      escapeCsvCell(l.phone),
      escapeCsvCell(l.website),
      escapeCsvCell(l.email),
      escapeCsvCell(l.email_status),
      escapeCsvCell(l.address),
      escapeCsvCell(l.city),
      escapeCsvCell(l.region),
      escapeCsvCell(l.country),
      escapeCsvCell(l.postal_code),
      escapeCsvCell(l.category),
      escapeCsvCell(l.business_type),
      l.rating != null ? l.rating : "",
      l.review_count != null ? l.review_count : "",
      escapeCsvCell(l.opening_status),
      escapeCsvCell(l.price_range),
      escapeCsvCell(l.booking_url),
      escapeCsvCell(l.ordering_url),
      escapeCsvCell(l.menu_url),
      escapeCsvCell(l.imported_at || new Date().toISOString()),
      escapeCsvCell(l.source_url),
      escapeCsvCell(l.place_id),
      escapeCsvCell(l.sourceQuery),
      escapeCsvCell(l.run_id)
    ].join(",");
  }

  function generateCSV(leads) {
    const valid = (leads || []).filter((l) => l && (l.company_name || l.website || l.email || l.phone));
    return "\uFEFF" + [CSV_HEADERS.join(","), ...valid.map(leadToCsvRow)].join("\r\n");
  }

  function fallbackAnchorDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function triggerCsvDownload(csvString, filename = "ramos-leads.csv") {
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    if (typeof chrome !== "undefined" && chrome.downloads && typeof chrome.downloads.download === "function") {
      chrome.downloads.download({ url, filename, saveAs: false }, () => {
        if (chrome.runtime.lastError) {
          fallbackAnchorDownload(url, filename);
        } else {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      });
    } else {
      fallbackAnchorDownload(url, filename);
    }
  }

  function triggerXlsxDownload(leads, filename = "ramos-leads.xlsx") {
    const XlsxBuilder = window.RamosXlsxBuilder || globalThis.RamosXlsxBuilder;
    if (!XlsxBuilder) return;
    const xlsxBytes = XlsxBuilder.buildXlsx(leads);
    const blob = new Blob([xlsxBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    if (typeof chrome !== "undefined" && chrome.downloads && typeof chrome.downloads.download === "function") {
      chrome.downloads.download({ url, filename, saveAs: false }, () => {
        if (chrome.runtime.lastError) {
          fallbackAnchorDownload(url, filename);
        } else {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      });
    } else {
      fallbackAnchorDownload(url, filename);
    }
  }

  function updateMapsTabState(active, query = null, cardCount = 0) {
    if (!el.mapsDot || !el.mapsStatusTitle) return;
    if (active) {
      el.mapsDot.className = "maps-dot green";
      el.mapsStatusTitle.textContent = "Google Maps Detected";
      if (query && el.queryInfo) {
        el.queryInfo.textContent = `Search: "${query}"`;
        el.queryInfo.classList.remove("hidden");
      }
      if (el.detectedInfo) {
        el.detectedInfo.textContent =
          cardCount > 0
            ? `${cardCount} result card${cardCount === 1 ? "" : "s"} found`
            : "No search results visible on map";
      }
      if (el.openMapsBtn) el.openMapsBtn.classList.add("hidden");
      if (el.extractBtn) el.extractBtn.disabled = false;
    } else {
      el.mapsDot.className = "maps-dot red";
      el.mapsStatusTitle.textContent = "Google Maps not detected";
      if (el.queryInfo) el.queryInfo.classList.add("hidden");
      if (el.detectedInfo) {
        el.detectedInfo.textContent = "Navigate to Google Maps search results to extract";
      }
      if (el.openMapsBtn) el.openMapsBtn.classList.remove("hidden");
      if (el.extractBtn) el.extractBtn.disabled = true;
    }
  }

  function openGoogleMapsTab() {
    const mapsUrl = "https://www.google.com/maps/";
    if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url: mapsUrl, active: true });
    } else if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(mapsUrl, "_blank");
    }
  }

  function checkGoogleMapsTab() {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].url) {
        updateMapsTabState(false);
        return;
      }
      const activeTab = tabs[0];
      if (!isGoogleMapsUrl(activeTab.url)) {
        updateMapsTabState(false);
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { type: "SI_DETECT_QUERY" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          updateMapsTabState(true, null, 0);
          return;
        }
        currentSearchQuery = response.query || null;
        currentDetectedCards = response.cardCount || 0;
        updateMapsTabState(true, currentSearchQuery, currentDetectedCards);
      });
    });
  }

  function updateSummaryStats(stats, readyCount) {
    if (el.statDiscovered) el.statDiscovered.textContent = stats?.discovered ?? readyCount;
    if (el.statQualified) el.statQualified.textContent = stats?.qualified ?? readyCount;
    if (el.statEnriched) el.statEnriched.textContent = stats?.enriched ?? readyCount;
    if (el.statFailed) el.statFailed.textContent = stats?.failed ?? 0;
    if (el.statDuplicates) el.statDuplicates.textContent = stats?.duplicatesSkipped ?? 0;
    if (el.statReady) el.statReady.textContent = readyCount;
  }

  function listenForProgress() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || !message.type) return;
      if (message.type === "SI_PROGRESS_UPDATE") {
        if (el.progressContainer) el.progressContainer.classList.remove("hidden");
        if (el.progressBar && message.percent != null) {
          el.progressBar.style.width = `${Math.min(Math.max(message.percent, 0), 100)}%`;
        }
        if (el.progressText && message.text) el.progressText.textContent = message.text;

        if (message.currentBusiness && el.currentBizCard) {
          el.currentBizCard.classList.remove("hidden");
          if (el.currentBizName) el.currentBizName.textContent = message.currentBusiness.name || "—";
          const fields = message.currentBusiness.fields || {};
          const setField = (elem, val) => {
            if (!elem) return;
            elem.className = val ? "biz-field found" : "biz-field gray";
          };
          setField(el.fieldAddress, fields.address);
          setField(el.fieldPhone, fields.phone);
          setField(el.fieldWebsite, fields.website);
          setField(el.fieldRating, fields.rating);
          setField(el.fieldHours, fields.hours);
        }
      } else if (message.type === "SI_DISCOVERY_COMPLETE" || message.type === "SI_DISCOVERY_STOPPED") {
        currentExtractedLeads = Array.isArray(message.leads) ? message.leads : [];
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
          updateEnrichmentUI(currentExtractedLeads);
          if (el.downloadXlsxBtn) el.downloadXlsxBtn.disabled = false;
          if (el.downloadCsvBtn) el.downloadCsvBtn.disabled = false;
        }
      }
    });
  }

  function startExtraction() {
    const limit = Math.min(Math.max(Number(el.importLimit?.value) || 10, 1), 50);
    if (el.resultSummary) el.resultSummary.classList.add("hidden");
    if (el.extractBtn) el.extractBtn.classList.add("hidden");
    if (el.stopBtn) el.stopBtn.classList.remove("hidden");
    if (el.progressContainer) el.progressContainer.classList.remove("hidden");
    if (el.progressBar) el.progressBar.style.width = "5%";
    if (el.progressText) el.progressText.textContent = "Initiating discovery & automatic enrichment...";

    // Strict State Isolation: Wipe previous leads and enrichment state for fresh search
    currentExtractedLeads = [];
    if (enrichAbortController) {
      enrichAbortController.abort();
      enrichAbortController = null;
    }
    isEnrichingWebsites = false;
    if (el.enrichProgressContainer) el.enrichProgressContainer.classList.add("hidden");
    if (el.enrichStatusInfo) el.enrichStatusInfo.textContent = "";
    if (el.enrichWebsitesBtn) {
      el.enrichWebsitesBtn.disabled = true;
      el.enrichWebsitesBtn.classList.remove("hidden");
    }
    if (el.stopEnrichBtn) el.stopEnrichBtn.classList.add("hidden");

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

  function triggerMapsExport(format = "xlsx") {
    chrome.runtime.sendMessage(
      { type: format === "xlsx" ? "SI_TRIGGER_DOWNLOAD_EXCEL" : "SI_TRIGGER_DOWNLOAD_CSV", format },
      (res) => {
        if (chrome.runtime.lastError) {
          if (currentExtractedLeads.length > 0) {
            if (format === "xlsx") {
              triggerXlsxDownload(currentExtractedLeads);
            } else {
              triggerCsvDownload(generateCSV(currentExtractedLeads));
            }
            showToast(`Exported ${currentExtractedLeads.length} leads.`, "success");
          } else {
            showToast(`Export failed: ${chrome.runtime.lastError.message}`, "error");
          }
          return;
        }
        if (res && res.ok) {
          showToast(`Exported ${res.rowCount || currentExtractedLeads.length} leads to ${format.toUpperCase()}.`, "success");
        } else {
          showToast(res?.error || "No leads available to export.", "error");
        }
      }
    );
  }

  // ─── WEBSITE ENRICHMENT ORCHESTRATION (Phase 6) ──────────────────────────────
  function updateEnrichmentUI(leads) {
    if (!el.enrichStatusInfo || !el.enrichWebsitesBtn) return;
    const withWeb = (leads || []).filter((l) => l && typeof l.website === "string" && l.website.trim().length > 0);
    const count = withWeb.length;
    const total = (leads || []).length;
    el.enrichStatusInfo.textContent = `${count} / ${total} have websites`;
    el.enrichWebsitesBtn.disabled = count === 0;
    if (el.enrichMetricCount) el.enrichMetricCount.textContent = "0";
    if (el.enrichMetricSkipped) el.enrichMetricSkipped.textContent = "0";
    if (el.enrichMetricFailed) el.enrichMetricFailed.textContent = "0";
  }

  async function startBatchWebsiteEnrichment() {
    if (isEnrichingWebsites || currentExtractedLeads.length === 0) return;

    const Adapter = window.RamosWebsiteAdapter || globalThis.RamosWebsiteAdapter;
    const Acquisition = window.RamosPageAcquisition || globalThis.RamosPageAcquisition;
    const Enricher = window.RamosWebsiteEnricher || globalThis.RamosWebsiteEnricher;

    if (!Adapter || !Acquisition || !Enricher) {
      showToast("Website enrichment modules not loaded.", "error");
      return;
    }

    isEnrichingWebsites = true;
    enrichAbortController = new AbortController();

    el.enrichWebsitesBtn?.classList.add("hidden");
    el.stopEnrichBtn?.classList.remove("hidden");
    el.enrichProgressContainer?.classList.remove("hidden");
    if (el.downloadXlsxBtn) el.downloadXlsxBtn.disabled = true;
    if (el.downloadCsvBtn) el.downloadCsvBtn.disabled = true;

    let enrichedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const total = currentExtractedLeads.length;

    const pageFetcher = async (targetUrl) => {
      if (enrichAbortController.signal.aborted) {
        throw new Error("CRAWL_ABORTED");
      }
      const fetchSignal = AbortSignal.timeout
        ? AbortSignal.any([enrichAbortController.signal, AbortSignal.timeout(10000)])
        : enrichAbortController.signal;

      const resp = await fetch(targetUrl, { signal: fetchSignal, credentials: "omit" });
      if (!resp.ok) return null;
      const html = await resp.text();
      return Acquisition.acquireFromRawHtml(html, targetUrl);
    };

    try {
      for (let i = 0; i < total; i++) {
        if (enrichAbortController.signal.aborted) {
          break;
        }

        const lead = currentExtractedLeads[i];
        if (!lead || !lead.website || typeof lead.website !== "string" || !lead.website.trim()) {
          skippedCount++;
          if (el.enrichMetricSkipped) el.enrichMetricSkipped.textContent = String(skippedCount);
          continue;
        }

        const cleanWeb = lead.website.trim();
        if (el.enrichProgressText) {
          el.enrichProgressText.textContent = `Enriching ${i + 1} / ${total}: ${cleanWeb}`;
        }
        if (el.enrichProgressBar) {
          const pct = Math.round(((i + 1) / total) * 100);
          el.enrichProgressBar.style.width = `${pct}%`;
        }

        try {
          const webLead = await Adapter.crawlWebsite(
            cleanWeb,
            {
              maxPages: 5,
              maxDepth: 1,
              enableEarlyExit: true,
            },
            pageFetcher
          );

          if (webLead) {
            const merged = Enricher.mergeMapsAndWebsiteLead(lead, webLead);
            currentExtractedLeads[i] = merged;
            enrichedCount++;
            if (el.enrichMetricCount) el.enrichMetricCount.textContent = String(enrichedCount);
          } else {
            failedCount++;
            if (el.enrichMetricFailed) el.enrichMetricFailed.textContent = String(failedCount);
          }
        } catch (err) {
          if (err && (err.message === "CRAWL_ABORTED" || err.name === "AbortError")) {
            throw err;
          }
          console.warn(`[RAMOS][ENRICH_LEAD_FAILED] ${cleanWeb}`, err);
          failedCount++;
          if (el.enrichMetricFailed) el.enrichMetricFailed.textContent = String(failedCount);
        }
      }

      showToast(
        `Enrichment complete: ${enrichedCount} enriched, ${skippedCount} skipped, ${failedCount} failed.`,
        "success"
      );
    } catch (err) {
      if (err && (err.message === "CRAWL_ABORTED" || err.name === "AbortError")) {
        showToast("Website enrichment stopped by user.", "success");
      } else {
        showToast(`Enrichment encountered an issue: ${err.message || err}`, "error");
      }
    } finally {
      isEnrichingWebsites = false;
      enrichAbortController = null;
      el.enrichWebsitesBtn?.classList.remove("hidden");
      el.stopEnrichBtn?.classList.add("hidden");
      if (el.downloadXlsxBtn) el.downloadXlsxBtn.disabled = currentExtractedLeads.length === 0;
      if (el.downloadCsvBtn) el.downloadCsvBtn.disabled = currentExtractedLeads.length === 0;
      if (el.enrichStatusInfo) {
        el.enrichStatusInfo.textContent = `Enriched ${enrichedCount} leads (${skippedCount} skipped, ${failedCount} failed)`;
      }
    }
  }

  function stopBatchWebsiteEnrichment() {
    if (enrichAbortController) {
      enrichAbortController.abort();
    }
  }

  // ─── WEBSITE INTELLIGENCE CONTROLLER ─────────────────────────────────────────
  function sanitizeInputUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    let trimmed = rawUrl.trim();
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("file:") ||
      lower.startsWith("chrome:") ||
      lower.startsWith("about:") ||
      lower.startsWith("blob:")
    ) {
      return "";
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = "https://" + trimmed;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  async function startWebsiteExtraction() {
    if (isWebCrawling) return;

    const rawInput = (el.webUrlInput?.value || "").trim();
    const cleanUrl = sanitizeInputUrl(rawInput);

    if (!cleanUrl) {
      showToast("Please enter a valid website URL (e.g. https://example.com)", "error");
      return;
    }

    const crawlLimit = parseInt(el.webCrawlLimit?.value || "10", 10);
    const scope = {
      company: el.scopeCompany?.checked !== false,
      contact: el.scopeContact?.checked !== false,
      social: el.scopeSocial?.checked !== false,
      people: el.scopePeople?.checked !== false,
    };

    // Update UI to running state
    isWebCrawling = true;
    webCrawlAbortController = new AbortController();

    el.webAnalyzeBtn?.classList.add("hidden");
    el.webStopBtn?.classList.remove("hidden");
    el.webProgressContainer?.classList.remove("hidden");
    el.webResultSummary?.classList.add("hidden");

    if (el.webProgressBar) el.webProgressBar.style.width = "10%";
    if (el.webProgressText) el.webProgressText.textContent = `Connecting to ${cleanUrl}...`;
    if (el.webMetricDiscovered) el.webMetricDiscovered.textContent = "1";
    if (el.webMetricScanned) el.webMetricScanned.textContent = "0";
    if (el.webMetricPeople) el.webMetricPeople.textContent = "0";

    const Adapter = window.RamosWebsiteAdapter || globalThis.RamosWebsiteAdapter;
    const Acquisition = window.RamosPageAcquisition || globalThis.RamosPageAcquisition;

    if (!Adapter || !Acquisition) {
      showToast("Website adapter modules not loaded.", "error");
      resetWebRunState();
      return;
    }

    // In-browser page fetcher with signal and timeout
    const pageFetcher = async (targetUrl) => {
      if (webCrawlAbortController.signal.aborted) {
        throw new Error("CRAWL_ABORTED");
      }

      const fetchSignal = AbortSignal.timeout
        ? AbortSignal.any([webCrawlAbortController.signal, AbortSignal.timeout(10000)])
        : webCrawlAbortController.signal;

      const resp = await fetch(targetUrl, { signal: fetchSignal, credentials: "omit" });
      if (!resp.ok) return null;
      const html = await resp.text();
      return Acquisition.acquireFromRawHtml(html, targetUrl);
    };

    try {
      let pagesCount = 0;
      const lead = await Adapter.crawlWebsite(
        cleanUrl,
        {
          maxPages: crawlLimit,
          maxDepth: crawlLimit === 1 ? 0 : 2,
          enableEarlyExit: true,
          scope,
          onProgress: (p) => {
            pagesCount = p.pagesScanned || pagesCount;
            if (el.webProgressText) el.webProgressText.textContent = `Scanning: ${p.currentUrl}`;
            if (el.webMetricScanned) el.webMetricScanned.textContent = `${pagesCount} of ${crawlLimit}`;
            if (el.webMetricDiscovered) el.webMetricDiscovered.textContent = String((p.pendingPages || 0) + pagesCount);
            if (el.webProgressBar) {
              const pct = Math.min(Math.round((pagesCount / crawlLimit) * 100), 95);
              el.webProgressBar.style.width = `${pct}%`;
            }
          },
        },
        pageFetcher
      );

      currentWebLead = lead;
      if (lead && lead._crawlStats && lead._crawlStats.pagesScanned === 0) {
        displayWebsiteResults(lead, "Extraction Failed (0 Pages Accessible)");
        showToast("Could not access target website. Check URL, network, or permissions.", "error");
      } else {
        const stats = lead._crawlStats || {};
        const scanned = stats.pagesScanned || 1;
        const budget = stats.pagesBudget || crawlLimit;
        let title = "Extraction Complete";
        if (budget > 1) {
          title = stats.stoppedEarly
            ? `Extraction Complete (Scanned ${scanned} of ${budget} pages)`
            : `Extraction Complete (Scanned ${scanned} of ${budget} pages)`;
        }
        displayWebsiteResults(lead, title);
        showToast(`Website extraction completed (Scanned ${scanned} of ${budget} pages).`, "success");
      }
    } catch (err) {
      if (err && (err.message === "CRAWL_ABORTED" || err.name === "AbortError")) {
        showToast("Crawl stopped by user.", "success");
        if (currentWebLead) {
          displayWebsiteResults(currentWebLead, "Extraction Stopped (Partial Results)");
        }
      } else {
        console.error("[RAMOS][WEB_CRAWL_ERROR]", err);
        showToast(`Extraction failed: ${err.message || "Unreachable website"}`, "error");
      }
    } finally {
      resetWebRunState();
    }
  }

  function stopWebsiteExtraction() {
    if (webCrawlAbortController) {
      webCrawlAbortController.abort();
    }
  }

  function resetWebRunState() {
    isWebCrawling = false;
    webCrawlAbortController = null;
    el.webAnalyzeBtn?.classList.remove("hidden");
    el.webStopBtn?.classList.add("hidden");
    el.webProgressContainer?.classList.add("hidden");
  }

  function displayWebsiteResults(lead, titleText = "Extraction Complete") {
    if (!lead) return;
    if (el.webResultSummary) el.webResultSummary.classList.remove("hidden");
    if (el.webSummaryTitle) el.webSummaryTitle.textContent = titleText;

    // Company, Email, Phone, Address
    if (el.webLeadCompany) el.webLeadCompany.textContent = lead.company_name || "—";

    // Multi-value Email Rendering
    if (el.webLeadEmail) {
      el.webLeadEmail.innerHTML = "";
      if (!lead.email) {
        el.webLeadEmail.textContent = "Not detected";
      } else {
        const emails = Array.isArray(lead.emails) && lead.emails.length > 0
          ? lead.emails
          : [{ email: lead.email, type: lead.email_status || "verified" }];

        const mainSpan = document.createElement("span");
        mainSpan.textContent = `${lead.email} (${lead.email_status || "verified"})`;
        el.webLeadEmail.appendChild(mainSpan);

        if (emails.length > 1) {
          const toggleBtn = document.createElement("button");
          toggleBtn.className = "btn-more-toggle";
          toggleBtn.type = "button";
          toggleBtn.textContent = `+ ${emails.length - 1} more`;

          const moreList = document.createElement("div");
          moreList.className = "more-contacts-list hidden";
          emails.slice(1).forEach((em) => {
            const item = document.createElement("div");
            item.className = "contact-sub-item";
            item.textContent = `${em.email} (${em.type || "corporate"})`;
            moreList.appendChild(item);
          });

          toggleBtn.addEventListener("click", () => {
            const isHidden = moreList.classList.toggle("hidden");
            toggleBtn.textContent = isHidden ? `+ ${emails.length - 1} more` : "Show less";
          });

          el.webLeadEmail.appendChild(toggleBtn);
          el.webLeadEmail.appendChild(moreList);
        }
      }
    }

    // Multi-value Phone Rendering
    if (el.webLeadPhone) {
      el.webLeadPhone.innerHTML = "";
      if (!lead.phone) {
        el.webLeadPhone.textContent = "Not detected";
      } else {
        const phones = Array.isArray(lead.phones) && lead.phones.length > 0
          ? lead.phones
          : [{ phone: lead.phone }];

        const mainSpan = document.createElement("span");
        mainSpan.textContent = lead.phone;
        el.webLeadPhone.appendChild(mainSpan);

        if (phones.length > 1) {
          const toggleBtn = document.createElement("button");
          toggleBtn.className = "btn-more-toggle";
          toggleBtn.type = "button";
          toggleBtn.textContent = `+ ${phones.length - 1} more`;

          const moreList = document.createElement("div");
          moreList.className = "more-contacts-list hidden";
          phones.slice(1).forEach((ph) => {
            const item = document.createElement("div");
            item.className = "contact-sub-item";
            item.textContent = ph.phone;
            moreList.appendChild(item);
          });

          toggleBtn.addEventListener("click", () => {
            const isHidden = moreList.classList.toggle("hidden");
            toggleBtn.textContent = isHidden ? `+ ${phones.length - 1} more` : "Show less";
          });

          el.webLeadPhone.appendChild(toggleBtn);
          el.webLeadPhone.appendChild(moreList);
        }
      }
    }

    if (el.webLeadAddress) el.webLeadAddress.textContent = lead.address || "Not detected";

    // Social Pills
    if (el.webLeadSocial) {
      el.webLeadSocial.innerHTML = "";
      const social = lead.social || {};
      let hasSocial = false;
      for (const [platform, url] of Object.entries(social)) {
        if (url) {
          hasSocial = true;
          const a = document.createElement("a");
          a.className = "social-pill";
          a.href = url;
          a.target = "_blank";
          a.rel = "noreferrer";
          a.textContent = platform.replace("_x", "");
          el.webLeadSocial.appendChild(a);
        }
      }
      if (!hasSocial) {
        el.webLeadSocial.textContent = "None detected";
      }
    }

    // People Section
    const people = Array.isArray(lead.people) ? lead.people : [];
    if (el.webMetricPeople) el.webMetricPeople.textContent = String(people.length);
    if (people.length > 0 && el.webPeopleSection && el.webPeopleList) {
      el.webPeopleSection.classList.remove("hidden");
      if (el.webPeopleCount) el.webPeopleCount.textContent = String(people.length);
      el.webPeopleList.innerHTML = "";
      people.forEach((p) => {
        const item = document.createElement("div");
        item.className = "person-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "person-name";
        nameSpan.textContent = p.name;
        item.appendChild(nameSpan);

        if (p.title) {
          const titleSpan = document.createElement("span");
          titleSpan.className = "person-title";
          titleSpan.textContent = `— ${p.title}`;
          item.appendChild(titleSpan);
        }

        if (p.linkedin_url) {
          const liSpan = document.createElement("a");
          liSpan.className = "social-pill";
          liSpan.style.marginLeft = "6px";
          liSpan.href = p.linkedin_url;
          liSpan.target = "_blank";
          liSpan.textContent = "LinkedIn";
          item.appendChild(liSpan);
        }

        if (p.email) {
          const emSpan = document.createElement("span");
          emSpan.style.marginLeft = "6px";
          emSpan.style.fontSize = "9px";
          emSpan.style.color = "#22d3ee";
          emSpan.textContent = p.email;
          item.appendChild(emSpan);
        }

        el.webPeopleList.appendChild(item);
      });
    } else if (el.webPeopleSection) {
      el.webPeopleSection.classList.add("hidden");
    }

    // Evidence & Confidence Inspection
    if (el.webEvidenceContent) {
      el.webEvidenceContent.innerHTML = "";
      const evidence = Array.isArray(lead._evidence) ? lead._evidence : [];
      if (evidence.length === 0) {
        el.webEvidenceContent.textContent = "No raw evidence records retained.";
      } else {
        const ul = document.createElement("ul");
        ul.style.paddingLeft = "14px";
        evidence.slice(0, 10).forEach((ev) => {
          const li = document.createElement("li");
          li.textContent = `${ev.field}: "${ev.value}" (source: ${ev.sourceType || ev.source}, conf: ${ev.confidence})`;
          ul.appendChild(li);
        });
        if (evidence.length > 10) {
          const more = document.createElement("p");
          more.style.marginTop = "4px";
          more.style.fontStyle = "italic";
          more.textContent = `...and ${evidence.length - 10} more evidence items verified.`;
          ul.appendChild(more);
        }
        el.webEvidenceContent.appendChild(ul);
      }
    }
  }

  function exportWebsiteLead(format = "xlsx") {
    if (!currentWebLead) {
      showToast("No extracted website data available to export.", "error");
      return;
    }
    if (isWebExporting) return;
    isWebExporting = true;

    try {
      const filename = `ramos-website-${(currentWebLead.company_name || "lead").toLowerCase().replace(/[^a-z0-9]/g, "-")}.${format}`;
      if (format === "xlsx") {
        triggerXlsxDownload([currentWebLead], filename);
      } else {
        triggerCsvDownload(generateCSV([currentWebLead]), filename);
      }
      showToast(`Website lead exported to ${format.toUpperCase()}.`, "success");
    } catch (err) {
      showToast(`Export failed: ${err.message}`, "error");
    } finally {
      setTimeout(() => {
        isWebExporting = false;
      }, 1000);
    }
  }

  // ─── Setup Action Listeners ──────────────────────────────────────────────────
  function setupActions() {
    // Mode Switch
    el.tabMapsBtn?.addEventListener("click", () => setTabMode("maps"));
    el.tabWebsiteBtn?.addEventListener("click", () => setTabMode("website"));

    // Maps Actions
    el.openMapsBtn?.addEventListener("click", () => openGoogleMapsTab());
    el.extractBtn?.addEventListener("click", () => startExtraction());
    el.stopBtn?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SI_STOP_DISCOVERY" });
    });
    el.enrichWebsitesBtn?.addEventListener("click", () => startBatchWebsiteEnrichment());
    el.stopEnrichBtn?.addEventListener("click", () => stopBatchWebsiteEnrichment());
    el.downloadXlsxBtn?.addEventListener("click", () => triggerMapsExport("xlsx"));
    el.downloadCsvBtn?.addEventListener("click", () => triggerMapsExport("csv"));

    // Website Intelligence Actions
    el.webUseActiveTabBtn?.addEventListener("click", () => checkActiveTabForWebsite());
    el.webAnalyzeBtn?.addEventListener("click", () => startWebsiteExtraction());
    el.webStopBtn?.addEventListener("click", () => stopWebsiteExtraction());
    el.webDownloadXlsxBtn?.addEventListener("click", () => exportWebsiteLead("xlsx"));
    el.webDownloadCsvBtn?.addEventListener("click", () => exportWebsiteLead("csv"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    listenForProgress();
    setupActions();
    checkGoogleMapsTab();

    setInterval(() => {
      if (currentActiveTabMode === "maps") {
        checkGoogleMapsTab();
      }
    }, 2000);
  });
})();
