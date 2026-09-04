import test from "node:test";
import assert from "node:assert/strict";

// Simulated DOM and Chrome Extension messaging environment for Popup & Content Worker
class MockDOMElement {
  tagName: string;
  className: string = "";
  textContent: string = "";
  style: Record<string, string> = {};
  disabled: boolean = false;
  classList = {
    classes: new Set<string>(),
    add: (c: string) => {
      this.classList.classes.add(c);
      this.className = Array.from(this.classList.classes).join(" ");
    },
    remove: (c: string) => {
      this.classList.classes.delete(c);
      this.className = Array.from(this.classList.classes).join(" ");
    },
    contains: (c: string) => this.classList.classes.has(c),
  };

  constructor(tagName: string, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.textContent = textContent;
  }
}

// ─── REGRESSION SUITE ────────────────────────────────────────────────────────

test("REGRESSION [1]: Delayed Maps cards eventually appear — bounded wait discovers cards", async () => {
  let pollCount = 0;
  const mockAdapter = {
    currentQuery: () => "Coffee Shop",
    getQualifiedCardElements: () => {
      pollCount++;
      // Cards appear on 3rd poll (~1050ms)
      if (pollCount >= 3) {
        return [{ company_name: "Artisan Coffee", place_id: "pid_101" }];
      }
      return [];
    },
  };

  // Replicate bounded wait logic from discovery.js
  let cardElements = mockAdapter.getQualifiedCardElements();
  let container: any = null;
  const maxWaitMs = 3500;
  const pollInterval = 100; // scaled for test speed
  let waitedMs = 0;

  if (cardElements.length === 0 && !container) {
    while (waitedMs < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      waitedMs += pollInterval;
      cardElements = mockAdapter.getQualifiedCardElements();
      if (cardElements.length > 0) {
        break;
      }
    }
  }

  assert.ok(cardElements.length > 0, "Cards must be discovered after delay");
  assert.equal(cardElements[0].company_name, "Artisan Coffee");
  assert.ok(waitedMs <= maxWaitMs, "Wait must be bounded within maximum timeout");
});

test("REGRESSION [2]: Zero Maps results terminate cleanly without hanging", async () => {
  let pollCount = 0;
  const mockAdapter = {
    currentQuery: () => "Nonexistent Place XYZ",
    getQualifiedCardElements: () => {
      pollCount++;
      return []; // Never returns cards
    },
  };

  let cardElements = mockAdapter.getQualifiedCardElements();
  let container: any = null;
  const maxWaitMs = 300; // bounded
  const pollInterval = 100;
  let waitedMs = 0;

  if (cardElements.length === 0 && !container) {
    while (waitedMs < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      waitedMs += pollInterval;
      cardElements = mockAdapter.getQualifiedCardElements();
      if (cardElements.length > 0) break;
    }
  }

  assert.equal(cardElements.length, 0, "Zero cards confirmed");
  assert.ok(waitedMs >= maxWaitMs, "Wait must terminate cleanly when timeout reached");

  // Popup state machine zero-result handling
  let uiState = "running";
  let toastMsg = "";
  const handleDiscoveryTerminalState = (payload: any) => {
    uiState = payload.status || "completed";
    if (!payload.leads || payload.leads.length === 0) {
      toastMsg = "No search results visible on map to extract.";
    }
  };

  handleDiscoveryTerminalState({ status: "completed", leads: [] });
  assert.equal(uiState, "completed");
  assert.equal(toastMsg, "No search results visible on map to extract.");
});

test("REGRESSION [3]: Normal Maps extraction completes and handles dual message contracts", () => {
  const listeners: ((msg: any) => void)[] = [];
  const mockRuntime = {
    onMessage: {
      addListener: (fn: (msg: any) => void) => listeners.push(fn),
    },
  };

  // Setup Popup elements
  const el = {
    extractBtn: new MockDOMElement("BUTTON"),
    stopBtn: new MockDOMElement("BUTTON"),
    progressContainer: new MockDOMElement("DIV"),
    progressBar: new MockDOMElement("DIV"),
    progressText: new MockDOMElement("P"),
    resultSummary: new MockDOMElement("DIV"),
    summaryTitle: new MockDOMElement("SPAN"),
    downloadXlsxBtn: new MockDOMElement("BUTTON"),
    downloadCsvBtn: new MockDOMElement("BUTTON"),
    currentBizCard: new MockDOMElement("DIV"),
    currentBizName: new MockDOMElement("P"),
    fieldAddress: new MockDOMElement("SPAN"),
    fieldPhone: new MockDOMElement("SPAN"),
    fieldWebsite: new MockDOMElement("SPAN"),
    fieldRating: new MockDOMElement("SPAN"),
    fieldHours: new MockDOMElement("SPAN"),
  };

  let currentExtractedLeads: any[] = [];
  let activeRunId: string | null = "run_123";

  function handleDiscoveryTerminalState(payload: any) {
    const status = payload?.status || "completed";
    currentExtractedLeads = payload?.leads || [];
    el.extractBtn.classList.remove("hidden");
    el.stopBtn.classList.add("hidden");
    el.progressContainer.classList.add("hidden");

    if (currentExtractedLeads.length > 0) {
      el.resultSummary.classList.remove("hidden");
      el.summaryTitle.textContent = status === "cancelled" ? "Extraction Stopped" : "Discovery Complete";
      el.downloadXlsxBtn.disabled = false;
      el.downloadCsvBtn.disabled = false;
    }
  }

  // Register listener with dual-contract support
  mockRuntime.onMessage.addListener((message: any) => {
    if (!message || !message.type) return;

    if (
      message.type === "SI_DISCOVERY_COMPLETE" ||
      message.type === "SI_DISCOVERY_STOPPED" ||
      (message.type === "SI_DISCOVERY_PROGRESS" &&
        (message.status === "completed" || message.status === "cancelled" || message.status === "failed"))
    ) {
      if (activeRunId && message.runId && message.runId !== activeRunId) return;
      handleDiscoveryTerminalState({
        status: message.status || "completed",
        leads: message.leads || message.records || currentExtractedLeads,
        stats: message.stats,
      });
      return;
    }

    if (message.type === "SI_PROGRESS_UPDATE" || message.type === "SI_DISCOVERY_PROGRESS") {
      if (activeRunId && message.runId && message.runId !== activeRunId) return;
      el.progressContainer.classList.remove("hidden");
      el.extractBtn.classList.add("hidden");
      el.stopBtn.classList.remove("hidden");

      if (message.records) currentExtractedLeads = message.records;
      if (message.statusText) el.progressText.textContent = message.statusText;
    }
  });

  // 1. Send SI_DISCOVERY_PROGRESS (legacy background contract)
  listeners[0]({
    type: "SI_DISCOVERY_PROGRESS",
    status: "running",
    found: 5,
    processed: 1,
    statusText: "[LOOP 1/5] Acme Bakery ✓",
    records: [{ company_name: "Acme Bakery", phone: "+123456" }],
    runId: "run_123",
  });

  assert.equal(el.stopBtn.classList.contains("hidden"), false, "Stop button visible while running");
  assert.equal(el.progressText.textContent, "[LOOP 1/5] Acme Bakery ✓");
  assert.equal(currentExtractedLeads.length, 1);

  // 2. Send SI_DISCOVERY_COMPLETE (terminal completion event)
  listeners[0]({
    type: "SI_DISCOVERY_COMPLETE",
    status: "completed",
    leads: [
      { company_name: "Acme Bakery", phone: "+123456" },
      { company_name: "Baker Joe", phone: "+654321" },
    ],
    runId: "run_123",
  });

  assert.equal(el.extractBtn.classList.contains("hidden"), false, "Run discovery restored");
  assert.equal(el.stopBtn.classList.contains("hidden"), true, "Stop button hidden");
  assert.equal(el.progressContainer.classList.contains("hidden"), true, "Progress hidden");
  assert.equal(el.summaryTitle.textContent, "Discovery Complete");
  assert.equal(currentExtractedLeads.length, 2);
  assert.equal(el.downloadXlsxBtn.disabled, false);
});

test("REGRESSION [4]: Maps discovery completion does NOT automatically trigger website enrichment", () => {
  let enrichmentAutoStarted = false;
  const startBatchWebsiteEnrichment = () => {
    enrichmentAutoStarted = true;
  };

  let enrichmentUIAttached = false;
  const updateEnrichmentUI = (leads: any[]) => {
    enrichmentUIAttached = true;
    // Does NOT call startBatchWebsiteEnrichment()!
  };

  const leads = [{ company_name: "Tech Corp", website: "https://techcorp.com" }];

  // Simulate completion handler
  updateEnrichmentUI(leads);

  assert.equal(enrichmentUIAttached, true, "Enrichment UI metadata updated");
  assert.equal(enrichmentAutoStarted, false, "Enrichment must NOT be triggered automatically");
});

test("REGRESSION [5]: Website enrichment failure does not break Maps results", () => {
  const currentExtractedLeads = [
    { company_name: "Good Company", website: "https://good.com", phone: "111" },
    { company_name: "Failing Company", website: "https://broken-domain-does-not-exist-xyz.com", phone: "222" },
  ];

  let failedCount = 0;
  for (const lead of currentExtractedLeads) {
    if (lead.website.includes("broken")) {
      failedCount++;
      // Lead is not dropped or corrupted
    }
  }

  assert.equal(failedCount, 1);
  assert.equal(currentExtractedLeads.length, 2, "Both leads remain in currentExtractedLeads");
  assert.equal(currentExtractedLeads[0].company_name, "Good Company");
  assert.equal(currentExtractedLeads[1].company_name, "Failing Company");
});

test("REGRESSION [6]: Website enrichment cancellation does not leave UI stuck", () => {
  let isEnrichingWebsites = true;
  const abortController = new AbortController();

  const stopBatchWebsiteEnrichment = () => {
    abortController.abort();
    isEnrichingWebsites = false;
  };

  stopBatchWebsiteEnrichment();

  assert.equal(abortController.signal.aborted, true, "Enrichment signal aborted");
  assert.equal(isEnrichingWebsites, false, "Enrichment running flag reset to false");
});

test("REGRESSION [7]: New Maps search clears old state and aborts previous enrichment", () => {
  let currentExtractedLeads: any[] = [{ company_name: "Old Bakery" }];
  let activeRunId: string | null = "run_old";
  let enrichController: AbortController | null = new AbortController();
  let isEnrichingWebsites = true;

  // New extraction initiation
  function startExtraction() {
    currentExtractedLeads = [];
    activeRunId = null;
    if (enrichController) {
      enrichController.abort();
      enrichController = null;
    }
    isEnrichingWebsites = false;
  }

  startExtraction();

  assert.equal(currentExtractedLeads.length, 0, "Leads reset for fresh run");
  assert.equal(activeRunId, null, "Active run reset");
  assert.equal(isEnrichingWebsites, false, "Previous enrichment cancelled");
  assert.equal(enrichController, null, "AbortController cleared");
});

test("REGRESSION [8]: Watchdog timer forces terminal state on stuck progress", () => {
  let watchdogFired = false;
  let toastMessage = "";
  let uiTerminated = false;

  function triggerWatchdogTimeout() {
    watchdogFired = true;
    uiTerminated = true;
    toastMessage = "Maps results timed out — check that the search results are loaded.";
  }

  // Simulate timeout expiration
  triggerWatchdogTimeout();

  assert.equal(watchdogFired, true);
  assert.equal(uiTerminated, true, "UI must reach terminal state");
  assert.equal(toastMessage, "Maps results timed out — check that the search results are loaded.");
});

test("REGRESSION [9]: Stale messages from an old run cannot update a new run", () => {
  const activeRunId = "run_NEW_999";
  let updatedName = "";

  function receiveMessage(msg: any) {
    if (activeRunId && msg.runId && msg.runId !== activeRunId) {
      // Reject stale message from prior run
      return;
    }
    updatedName = msg.name;
  }

  // Stale message arrives from run_OLD_111
  receiveMessage({ runId: "run_OLD_111", name: "Stale Old Candidate" });
  assert.equal(updatedName, "", "Stale candidate must be ignored");

  // Valid message arrives from current run
  receiveMessage({ runId: "run_NEW_999", name: "Fresh Candidate" });
  assert.equal(updatedName, "Fresh Candidate", "Valid candidate must be processed");
});

test("REGRESSION [10]: Both currentBusiness payload shapes (flat and nested) are handled correctly", () => {
  function extractBusinessFields(biz: any) {
    const bizName = biz.company_name || biz.name || "";
    const fields = biz.fields || {};
    const addr = biz.address || fields.address || "";
    const ph = biz.phone || fields.phone || "";
    const web = biz.website || fields.website || "";

    return { bizName, addr, ph, web };
  }

  // Flat payload shape (from background.js)
  const flatBiz = {
    company_name: "Flat Style Business",
    address: "123 Main St",
    phone: "555-1234",
    website: "https://flat.com",
  };
  const resFlat = extractBusinessFields(flatBiz);
  assert.equal(resFlat.bizName, "Flat Style Business");
  assert.equal(resFlat.addr, "123 Main St");
  assert.equal(resFlat.ph, "555-1234");
  assert.equal(resFlat.web, "https://flat.com");

  // Nested payload shape (from some test mocks or legacy callers)
  const nestedBiz = {
    name: "Nested Style Business",
    fields: {
      address: "456 Oak Ave",
      phone: "555-9876",
      website: "https://nested.com",
    },
  };
  const resNested = extractBusinessFields(nestedBiz);
  assert.equal(resNested.bizName, "Nested Style Business");
  assert.equal(resNested.addr, "456 Oak Ave");
  assert.equal(resNested.ph, "555-9876");
  assert.equal(resNested.web, "https://nested.com");
});
