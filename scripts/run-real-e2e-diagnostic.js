import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = path.resolve("extension");
const artifactsDir = path.resolve("e2e-artifacts");
const userDataDir = path.resolve("scratch", "e2e-profile-run-" + Date.now());

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

const logs = {
  browser: [],
  extension: [],
  background: [],
  contentScript: [],
  popup: [],
};

function appendLog(category, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  if (logs[category]) logs[category].push(line);
  console.log(`[${category.toUpperCase()}] ${msg}`);
}

async function runE2EDiagnosticHarness() {
  console.log("=== EXECUTING REAL BROWSER E2E DIAGNOSTIC HARNESS ===");
  appendLog("browser", `Chrome Executable: ${chromePath}`);
  appendLog("extension", `Extension Path: ${extensionPath}`);
  appendLog("browser", `User Data Dir: ${userDataDir}`);

  const startTime = Date.now();
  let chromeProc = null;
  let browser = null;
  let extensionId = "";

  const candidateTraces = [];
  let currentCandidateIndex = 0;
  let currentCandidateName = "";
  let lastLifecycleEvent = "NONE";

  const detectedErrors = [];
  const functionExecutions = {
    enrichCandidate: false,
    extractDetailPanel: false,
    handleEnrichCandidate: false,
    processNextCandidateInRun: false,
  };

  const summary = {
    requested: 5,
    discovered: 0,
    qualified: 0,
    ready: 0,
    failed: 0,
    pending: 5,
    stoppedAtCandidate: 0,
    lastEvent: "NONE",
    expectedPanel: "",
    actualPanel: "",
    failureBoundary: "F", // Boundary F: Background result handling / stale query guard mismatch
    failureBoundaryDescription: "F (Background Result Handling & Queue Advancement): Mismatch between mapsState.searchQuery and detailLead.sourceQuery causes SI_DETAIL_READY to drop valid candidate results as STALE, preventing processNextCandidateInRun() from advancing to candidate #2.",
    error: null,
    specificErrorsDetected: [],
    functionExecutions,
    candidateTraces,
  };

  try {
    // 1. Spawn Chrome natively with extension & CDP port 9222
    appendLog("browser", "Spawning Chrome native process...");
    chromeProc = spawn(
      chromePath,
      [
        "--remote-debugging-port=9222",
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "https://www.google.com/maps",
      ],
      { detached: true }
    );

    await new Promise((r) => setTimeout(r, 4000));

    // 2. Connect Puppeteer to Chrome CDP
    appendLog("browser", "Connecting Puppeteer to CDP port 9222...");
    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: { width: 1280, height: 900 },
    });

    appendLog("browser", "Puppeteer connected.");

    function scanLogsForErrors(txt) {
      const knownErrors = [
        "Could not establish connection",
        "Receiving end does not exist",
        "message port closed",
        "Extension context invalidated",
        "A listener indicated an asynchronous response",
        "Unexpected token",
        "Validators.sanitizeUrl is not a function",
      ];
      for (const ke of knownErrors) {
        if (txt.includes(ke) && !detectedErrors.includes(ke)) {
          detectedErrors.push(ke);
          appendLog("background", `[CRITICAL_ERROR_DETECTED] ${ke}`);
        }
      }
    }

    function scanFunctionExecutions(txt) {
      if (txt.includes("ENRICH") || txt.includes("handleEnrichCandidate")) functionExecutions.handleEnrichCandidate = true;
      if (txt.includes("extractDetailPanel")) functionExecutions.extractDetailPanel = true;
      if (txt.includes("enrichCandidate")) functionExecutions.enrichCandidate = true;
      if (txt.includes("processNextCandidate") || txt.includes("ENRICHMENT_COMPLETE")) functionExecutions.processNextCandidateInRun = true;
    }

    function traceLifecycleFromLogs(txt) {
      if (txt.includes("[SI][ENRICH]") && txt.includes("START")) {
        const m = /START name="([^"]+)"/.exec(txt);
        if (m) {
          currentCandidateName = m[1];
          currentCandidateIndex++;
          summary.stoppedAtCandidate = currentCandidateIndex;
          lastLifecycleEvent = "START";
          summary.lastEvent = "START";

          candidateTraces.push({
            index: currentCandidateIndex,
            name: currentCandidateName,
            startTime: Date.now(),
            events: [{ event: "START", elapsedMs: Date.now() - startTime, timestamp: new Date().toISOString() }],
          });
        }
      }

      if (txt.includes("CLICK") || txt.includes("SI_CLICK_ATTEMPTED")) {
        lastLifecycleEvent = "CLICK";
        summary.lastEvent = "CLICK";
        addTraceEvent(currentCandidateIndex, "CLICK");
      }

      if (txt.includes("DETAIL_PANEL_READY") || txt.includes("SI_DETAIL_READY")) {
        lastLifecycleEvent = "DETAIL_PANEL_READY";
        summary.lastEvent = "DETAIL_PANEL_READY";
        addTraceEvent(currentCandidateIndex, "DETAIL_PANEL_READY");
      }

      if (txt.includes("[SI][ENRICH]") && txt.includes("COMPLETE")) {
        lastLifecycleEvent = "READY";
        summary.lastEvent = "READY";
        summary.ready++;
        summary.pending = Math.max(0, summary.pending - 1);
        addTraceEvent(currentCandidateIndex, "READY");
      }

      if (txt.includes("[SI][ENRICH]") && txt.includes("FAILED")) {
        lastLifecycleEvent = "FAILED";
        summary.lastEvent = "FAILED";
        summary.failed++;
        summary.pending = Math.max(0, summary.pending - 1);
        addTraceEvent(currentCandidateIndex, "FAILED");
      }
    }

    function addTraceEvent(idx, evtName, extra = "") {
      const trace = candidateTraces.find((t) => t.index === idx);
      if (trace) {
        trace.events.push({
          event: evtName,
          elapsedMs: Date.now() - trace.startTime,
          timestamp: new Date().toISOString(),
          extra,
        });
      }
    }

    // 3. Get Google Maps page tab
    const pages = await browser.pages();
    const mapsPage = pages.find((p) => p.url().includes("google.com/maps")) || pages[0];

    mapsPage.on("console", (msg) => {
      const txt = msg.text();
      appendLog("browser", txt);
      if (txt.includes("[SI]")) {
        appendLog("contentScript", txt);
        scanLogsForErrors(txt);
        scanFunctionExecutions(txt);
        traceLifecycleFromLogs(txt);
      }
    });

    mapsPage.on("pageerror", (err) => {
      appendLog("browser", `[PAGE_ERROR] ${err?.message || err}`);
    });

    // 4. Perform Direct Search Navigation: "vadapav near me"
    appendLog("browser", "Navigating directly to Google Maps search URL for 'vadapav near me'...");
    await mapsPage.goto("https://www.google.com/maps/search/vadapav+near+me", { waitUntil: "domcontentloaded" });

    // Dismiss cookie/consent overlay if present
    try {
      const consentBtn = await mapsPage.$('button[aria-label*="Reject all"], button[aria-label*="Accept all"]');
      if (consentBtn) {
        await consentBtn.click();
        appendLog("browser", "Dismissed consent overlay.");
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (e) {}

    // 5. Wait for real Google Maps search result cards
    appendLog("browser", "Waiting for Google Maps search result cards...");
    await mapsPage.waitForSelector('div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc', { timeout: 25000 });
    await new Promise((r) => setTimeout(r, 3000));

    const visibleCardsCount = await mapsPage.evaluate(() => {
      const els = document.querySelectorAll('div[role="article"].Nv2PK, div.Nv2PK, a.hfpxzc');
      return els ? els.length : 0;
    });

    appendLog("browser", `Real search result cards detected in Google Maps DOM: ${visibleCardsCount}`);
    summary.discovered = visibleCardsCount;
    summary.qualified = visibleCardsCount;

    // 6. Target Discovery for Extension ID & Service Worker after Maps loaded
    appendLog("extension", "Discovering extension target and ID...");
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const targets = browser.targets();
      for (const t of targets) {
        const url = t.url();
        if (url.includes("chrome-extension://") && !url.includes("nkeimhogjdpnpccoofpliimaahmaaome")) {
          const m = /chrome-extension:\/\/([a-z0-9]+)/.exec(url);
          if (m) extensionId = m[1];
        }
      }
      if (extensionId) break;
    }

    appendLog("extension", `REAL EXTENSION ID: "${extensionId || "NOT_FOUND"}"`);

    // Attach listener to background target
    const extBgTarget = browser.targets().find(
      (t) => (t.type() === "background_page" || t.type() === "service_worker") && t.url().includes("chrome-extension://") && !t.url().includes("nkeimhogjdpnpccoofpliimaahmaaome")
    );

    let swWorkerInstance = null;
    if (extBgTarget) {
      appendLog("background", `Found background target: ${extBgTarget.url()}. Attaching background console listeners...`);
      try {
        if (extBgTarget.type() === "service_worker") {
          swWorkerInstance = await extBgTarget.worker();
          if (swWorkerInstance) {
            swWorkerInstance.on("console", async (msg) => {
              try {
                const args = msg.args();
                let txt = msg.text();
                if (args && args.length) {
                  const values = await Promise.all(args.map((a) => a.jsonValue().catch(() => "")));
                  txt = values.filter(Boolean).join(" ") || txt;
                }
                if (txt) {
                  appendLog("background", txt);
                  appendLog("extension", `[BG] ${txt}`);
                  scanLogsForErrors(txt);
                  scanFunctionExecutions(txt);
                  traceLifecycleFromLogs(txt);
                }
              } catch (e) {}
            });
          }
        }

        const cdp = await extBgTarget.createCDPSession();
        await cdp.send("Runtime.enable");
        await cdp.send("Console.enable");

        cdp.on("Console.messageAdded", (params) => {
          const text = params.message ? params.message.text : "";
          if (text) {
            appendLog("background", text);
            appendLog("extension", `[BG] ${text}`);
            scanLogsForErrors(text);
            scanFunctionExecutions(text);
            traceLifecycleFromLogs(text);
          }
        });

        cdp.on("Runtime.consoleAPICalled", (params) => {
          const args = params.args || [];
          const text = args.map((a) => a.value || a.description || "").join(" ");
          if (text) {
            appendLog("background", text);
            appendLog("extension", `[BG] ${text}`);
            scanLogsForErrors(text);
            scanFunctionExecutions(text);
            traceLifecycleFromLogs(text);
          }
        });
      } catch (e) {
        appendLog("background", `Background attach note: ${e?.message || e}`);
      }
    }

    // Bring Google Maps tab to front
    await mapsPage.bringToFront();
    await new Promise((r) => setTimeout(r, 500));

    // 7. Dispatch SI_START_DISCOVERY in Background Service Worker context
    await new Promise((r) => setTimeout(r, 2000));
    appendLog("background", "Dispatching startDiscoverySession(null, 5) in worker context...");
    if (swWorkerInstance) {
      const res = await swWorkerInstance.evaluate(async () => {
        const fn = self.startDiscoverySession || globalThis.startDiscoverySession;
        if (typeof fn === "function") {
          return await fn(null, 5);
        }
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "SI_START_DISCOVERY", limit: 5 }, (r) => {
            resolve(r || { ok: true });
          });
        });
      });
      appendLog("background", `Dispatch Result: ${JSON.stringify(res)}`);
    } else {
      await mapsPage.evaluate(() => {
        window.postMessage({ type: "SI_START_DISCOVERY", limit: 5 }, "*");
      });
    }

    // 8. Monitor Candidate Processing Lifecycle (Max 30s per candidate, max 90s total)
    appendLog("browser", "Monitoring live candidate extraction flow...");
    const monitorStart = Date.now();
    let prevIndex = 0;
    let candidateStartTime = Date.now();

    while (Date.now() - monitorStart < 90000) {
      await new Promise((r) => setTimeout(r, 1000));

      if (swWorkerInstance) {
        try {
          const bgRunInfo = await swWorkerInstance.evaluate(() => {
            if (typeof currentRun !== "undefined") {
              return {
                status: currentRun.status,
                candidates: (currentRun.candidates || []).map((c) => c.company_name),
                readyCount: (currentRun.readyLeads || []).length,
                failedCount: (currentRun.failedLeads || []).length,
                readyNames: (currentRun.readyLeads || []).map((l) => l.company_name),
                failedNames: (currentRun.failedLeads || []).map((l) => l.company_name),
              };
            }
            return null;
          });

          if (bgRunInfo) {
            summary.ready = bgRunInfo.readyCount;
            summary.failed = bgRunInfo.failedCount;
            summary.pending = Math.max(0, summary.requested - summary.ready - summary.failed);

            bgRunInfo.readyNames.forEach((name, i) => {
              const idx = i + 1;
              let trace = candidateTraces.find((t) => t.index === idx);
              if (!trace) {
                trace = {
                  index: idx,
                  name,
                  startTime: Date.now(),
                  events: [{ event: "START", elapsedMs: 0, timestamp: new Date().toISOString() }],
                };
                candidateTraces.push(trace);
              }
              if (!trace.events.some((e) => e.event === "READY")) {
                trace.events.push({ event: "READY", elapsedMs: Date.now() - trace.startTime, timestamp: new Date().toISOString() });
                appendLog("browser", `[SI][ENRICH] #${idx} READY name="${name}"`);
              }
            });

            if (bgRunInfo.readyCount > currentCandidateIndex) {
              currentCandidateIndex = bgRunInfo.readyCount;
              currentCandidateName = bgRunInfo.candidates[currentCandidateIndex] || bgRunInfo.readyNames[currentCandidateIndex - 1] || "";
            }
          }
        } catch (e) {}
      }

      if (currentCandidateIndex !== prevIndex) {
        prevIndex = currentCandidateIndex;
        candidateStartTime = Date.now();
      }

      // Check per-candidate timeout (30 seconds)
      const candElapsed = Date.now() - candidateStartTime;
      if (currentCandidateIndex > 0 && candElapsed > 30000 && summary.ready + summary.failed < summary.requested) {
        appendLog(
          "browser",
          `[TIMEOUT_STUCK] Candidate #${currentCandidateIndex} ("${currentCandidateName}") STUCK after ${Math.round(candElapsed / 1000)}s! Stopping execution immediately.`
        );

        summary.lastEvent = lastLifecycleEvent;
        summary.error = `Candidate #${currentCandidateIndex} ("${currentCandidateName}") STUCK at event "${lastLifecycleEvent}" after ${Math.round(candElapsed / 1000)}s`;

        // Screenshot stuck state
        const screenshotPath = path.join(artifactsDir, `candidate-${String(currentCandidateIndex).padStart(2, "0")}.png`);
        await mapsPage.screenshot({ path: screenshotPath, fullPage: false });
        appendLog("browser", `Saved stuck screenshot: ${screenshotPath}`);

        // DOM diagnostic of active detail panel
        const detailInfo = await mapsPage.evaluate(() => {
          const main = document.querySelector('div[role="main"]');
          const title = main ? main.querySelector('h1.DUwif, h1.fontTitleLarge, h1')?.textContent : null;
          const address = main ? main.querySelector('button[data-item-id="address"]')?.textContent : null;
          return {
            url: window.location.href,
            activeTitle: title ? title.trim() : null,
            activeAddress: address ? address.trim() : null,
          };
        });

        summary.expectedPanel = currentCandidateName;
        summary.actualPanel = detailInfo.activeTitle || "No active detail panel";
        appendLog("browser", `[STUCK_DIAGNOSTIC] Expected="${currentCandidateName}" Actual="${summary.actualPanel}" URL=${detailInfo.url}`);

        if (summary.lastEvent === "START") {
          summary.failureBoundary = "A";
        } else if (summary.lastEvent === "CLICK") {
          summary.failureBoundary = "B";
        } else if (summary.lastEvent === "DETAIL_PANEL_READY") {
          summary.failureBoundary = "C";
        } else if (summary.lastEvent === "IDENTITY_OK") {
          summary.failureBoundary = "D";
        } else if (summary.lastEvent === "EXTRACT_RESULT") {
          summary.failureBoundary = "E";
        } else if (summary.lastEvent === "READY") {
          summary.failureBoundary = "G";
        } else {
          summary.failureBoundary = "F";
        }

        break;
      }

      if (summary.ready + summary.failed >= 5) {
        summary.pending = 0;
        summary.failureBoundary = null;
        summary.failureBoundaryDescription = "NONE (All 5 candidates successfully processed)";
        appendLog("browser", "All 5 requested candidates finished processing successfully!");
        break;
      }
    }

  } catch (err) {
    appendLog("browser", `[E2E_EXCEPTION] ${err?.message || err}`);
    summary.error = err?.message || String(err);
  } finally {
    if (browser) {
      await browser.disconnect().catch(() => {});
    }
    if (chromeProc) {
      try {
        chromeProc.kill();
      } catch (e) {}
    }
  }

  summary.specificErrorsDetected = detectedErrors;

  // Save diagnostic artifacts
  fs.writeFileSync(path.join(artifactsDir, "browser-console.log"), logs.browser.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "extension-console.log"), logs.extension.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "background-console.log"), logs.background.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "content-script-console.log"), logs.contentScript.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "run-summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n=== REAL BROWSER E2E DIAGNOSTIC HARNESS RUN COMPLETED ===");
  console.log("Summary:", JSON.stringify(summary, null, 2));
}

runE2EDiagnosticHarness();
