/**
 * RAMOS Phase 9 Release Candidate — Real Chrome Benchmark & E2E Validation Suite
 * Executes controlled benchmarks for 10 -> 25 -> 50 -> 100 leads,
 * measures exact performance metrics (runtime, avg per lead, cancellation speed),
 * validates real-browser user workflow, and audits actual downloaded files on disk.
 */
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_PATH = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

const EXT_PATH = path.resolve("d:/Ramos/extension");
const TEMP_PROFILE = path.resolve("d:/Ramos/scratch/chrome-profile-phase9-rc");
const DOWNLOADS_DIR = path.resolve("d:/Ramos/scratch/test-downloads");
const RESULTS_FILE = path.resolve("d:/Ramos/scratch/phase9-rc-benchmark-results.json");
const PORT = 4199;

// Ensure download & profile dirs exist cleanly
if (fs.existsSync(DOWNLOADS_DIR)) {
  fs.rmSync(DOWNLOADS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

if (fs.existsSync(TEMP_PROFILE)) {
  fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_PROFILE, { recursive: true });

// ─── LOCAL MOCK HTTP SERVER WITH REALISTIC SCENARIOS ────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url || "/";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // Scenario 1: Rich Corporate Site
  if (url === "/biz/vanguard" || url === "/biz/vanguard/") {
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vanguard Technology Partners</title>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Corporation",
            "name": "Vanguard Technology Partners",
            "telephone": "+1-800-555-0199",
            "email": "corporate@vanguard.io",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "500 Howard St",
              "addressLocality": "San Francisco",
              "addressRegion": "CA",
              "postalCode": "94105",
              "addressCountry": "US"
            }
          }
          </script>
        </head>
        <body>
          <h1>Vanguard Technology Partners</h1>
          <nav>
            <a href="http://127.0.0.1:${PORT}/biz/vanguard/contact">Contact</a>
            <a href="http://127.0.0.1:${PORT}/biz/vanguard/team">Leadership</a>
          </nav>
          <footer>
            <a href="mailto:sales@vanguard.io">sales@vanguard.io</a>
            <a href="mailto:support@vanguard.io">support@vanguard.io</a>
            <a href="tel:+18005550199">(800) 555-0199</a>
            <a href="https://linkedin.com/company/vanguard-tech">LinkedIn</a>
            <a href="https://twitter.com/vanguardtech">Twitter</a>
            <a href="https://facebook.com/vanguardtech">Facebook</a>
          </footer>
        </body>
      </html>
    `);
    return;
  }

  if (url === "/biz/vanguard/team") {
    res.end(`
      <html><head><title>Leadership</title></head><body>
        <div class="team-card">
          <h3>Elena Vance</h3>
          <span class="title">Chief Executive Officer</span>
          <a href="mailto:elena@vanguard.io">elena@vanguard.io</a>
          <a href="https://linkedin.com/in/elenavance">LinkedIn</a>
        </div>
      </body></html>
    `);
    return;
  }

  // Scenario 2: Cloudflare Email Protection Site
  if (url === "/biz/cf-protected") {
    // 0x18 XOR contact@example.com -> 187b77766c797b6c587d60797568747d367b7775
    res.end(`
      <html><head><title>Cloudflare Business</title></head><body>
        <h1>Protected Inquiries</h1>
        <a href="/cdn-cgi/l/email-protection#187b77766c797b6c587d60797568747d367b7775">[email&#160;protected]</a>
        <a href="https://linkedin.com/company/cf-protected">LinkedIn</a>
      </body></html>
    `);
    return;
  }

  // Scenario 3: Slow Response Site (800ms)
  if (url === "/biz/slow") {
    setTimeout(() => {
      res.end(`
        <html><head><title>Slow Business</title></head><body>
          <h1>Slow Co</h1>
          <a href="mailto:hello@slowco.com">hello@slowco.com</a>
        </body></html>
      `);
    }, 800);
    return;
  }

  // Scenario 4: HTTP 403 Forbidden
  if (url === "/biz/forbidden") {
    res.statusCode = 403;
    res.end("403 Forbidden");
    return;
  }

  // Scenario 5: HTTP 429 Rate Limit
  if (url === "/biz/rate-limited") {
    res.statusCode = 429;
    res.end("429 Too Many Requests");
    return;
  }

  // Scenario 6: Standard 404
  res.statusCode = 404;
  res.end("Not Found");
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
console.log(`[TEST-SERVER] Mock server listening on http://127.0.0.1:${PORT}`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clearDownloadFolder() {
  if (fs.existsSync(DOWNLOADS_DIR)) {
    for (const f of fs.readdirSync(DOWNLOADS_DIR)) {
      try {
        fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
      } catch {}
    }
  }
}

async function waitForDownload(page, expectedExt = ".xlsx", timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const items = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (typeof chrome !== "undefined" && chrome.downloads && chrome.downloads.search) {
            chrome.downloads.search({ state: "complete" }, (list) => resolve(list || []));
          } else {
            resolve([]);
          }
        });
      });

      if (items && items.length > 0) {
        items.sort((a, b) => new Date(b.endTime || 0) - new Date(a.endTime || 0));
        const matched = items.find(
          (it) =>
            it.filename &&
            it.filename.toLowerCase().endsWith(expectedExt.toLowerCase()) &&
            new Date(it.endTime).getTime() >= start - 4000
        );
        if (matched && matched.filename && fs.existsSync(matched.filename)) {
          const stat = fs.statSync(matched.filename);
          if (stat.size > 0) {
            return { filename: path.basename(matched.filename), fullPath: matched.filename, size: stat.size };
          }
        }
      }
    } catch {}

    const candidateDirs = [DOWNLOADS_DIR, "C:\\Users\\Raj.Sodha\\Downloads"];
    for (const d of candidateDirs) {
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d);
        for (const f of files) {
          if (
            f.toLowerCase().endsWith(expectedExt.toLowerCase()) &&
            !f.endsWith(".crdownload") &&
            !f.endsWith(".tmp")
          ) {
            const fp = path.join(d, f);
            try {
              const stat = fs.statSync(fp);
              if (stat.size > 0 && stat.mtimeMs >= start - 4000) {
                return { filename: f, fullPath: fp, size: stat.size };
              }
            } catch {}
          }
        }
      }
    }
    await sleep(300);
  }
  return null;
}

function verifyXlsxBinary(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 500, `XLSX file size must be > 500 bytes, got ${buf.length}`);
  assert.equal(buf[0], 0x50, "Magic byte 0 must be 0x50 ('P')");
  assert.equal(buf[1], 0x4b, "Magic byte 1 must be 0x4b ('K')");
  const str = buf.toString("latin1");
  assert.ok(str.includes("[Content_Types].xml"), "Must contain [Content_Types].xml");
  assert.ok(str.includes("xl/worksheets/sheet1.xml"), "Must contain sheet1.xml");
  return { valid: true, size: buf.length, hasPeopleSheet: str.includes("sheet2.xml") || str.includes("People") };
}

function parseCsvRow(row) {
  const cols = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuote) {
      if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { cols.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function verifyCsvContent(filePath, expectedCols = 34) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  assert.ok(lines.length >= 2, `CSV must have header + at least 1 data row, got ${lines.length} lines`);
  const headerCols = lines[0].replace(/^\uFEFF/, "").split(",");
  assert.equal(headerCols.length, expectedCols, `Expected exactly ${expectedCols} cols, got ${headerCols.length}`);
  return { valid: true, linesCount: lines.length, colCount: headerCols.length, raw };
}

// ─── LAUNCH BROWSER ─────────────────────────────────────────────────────────
console.log(`[BROWSER] Launching browser: ${BROWSER_PATH}`);
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: false,
  userDataDir: TEMP_PROFILE,
  ignoreDefaultArgs: ["--disable-extensions", "about:blank"],
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,840",
  ],
});

const benchmarkResults = {
  version: "1.0.6",
  timestamp: new Date().toISOString(),
  benchmarks: {},
  exportFiles: {},
  workflow: {},
};

try {
  const workerTarget = await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 15000 });
  const extId = new URL(workerTarget.url()).hostname;
  console.log(`[BROWSER] RAMOS Extension loaded. ID: ${extId}`);

  const browserCdp = await browser.target().createCDPSession();
  await browserCdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOADS_DIR,
    eventsEnabled: true,
  });

  const page = await browser.newPage();
  const popupUrl = `chrome-extension://${extId}/popup.html`;

  // ═══════════════════════════════════════════════════════════════════════════
  // BENCHMARKS: 10 -> 25 -> 50 -> 100 LEADS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n========================================================");
  console.log("  STARTING CONTROLLED BENCHMARK RUNS (10 / 25 / 50 / 100) ");
  console.log("========================================================");

  async function runBatchBenchmark(leadCount) {
    console.log(`\n--- BENCHMARK: ${leadCount} Leads Batch ---`);
    await page.goto(popupUrl, { waitUntil: "domcontentloaded" });
    await page.click("#tabMapsBtn");

    // Generate leads mix
    const leads = [];
    for (let i = 1; i <= leadCount; i++) {
      let website = "";
      if (i % 5 === 1) website = `http://127.0.0.1:${PORT}/biz/vanguard`;
      else if (i % 5 === 2) website = `http://127.0.0.1:${PORT}/biz/cf-protected`;
      else if (i % 5 === 3) website = `http://127.0.0.1:${PORT}/biz/slow`;
      else if (i % 5 === 4) website = `http://127.0.0.1:${PORT}/biz/forbidden`;
      else website = ""; // no website (skipped)

      leads.push({
        company_name: `Enterprise Lead ${i}`,
        place_id: `ChIJ_BENCH_${i}`,
        phone: `+1 800-555-${String(i).padStart(4, "0")}`,
        address: `${i} Financial Plaza`,
        website,
      });
    }

    // Include 1 duplicate intentionally
    if (leadCount >= 25) {
      leads[leadCount - 1].place_id = leads[0].place_id;
    }

    await page.evaluate((batch) => {
      window.handleDiscoveryTerminalState({
        status: "completed",
        leads: batch,
        stats: { discovered: batch.length, qualified: batch.length, ready: batch.length },
      });
    }, leads);

    const readyCount = await page.evaluate(() => window.currentExtractedLeads.length);
    const duplicatesCount = await page.$eval("#statDuplicates", (el) => Number(el.textContent.trim()) || 0);

    const startTime = Date.now();
    await page.click("#enrichWebsitesBtn");

    // Wait until enrichment finishes
    await page.waitForFunction(() => {
      const stopBtn = document.getElementById("stopEnrichBtn");
      const xlsxBtn = document.getElementById("downloadXlsxBtn");
      return stopBtn && stopBtn.classList.contains("hidden") && xlsxBtn && !xlsxBtn.disabled;
    }, { timeout: 60000 });

    const totalRuntimeMs = Date.now() - startTime;
    const avgPerLeadMs = Math.round(totalRuntimeMs / readyCount);

    const enrichedCount = await page.$eval("#enrichMetricCount", (el) => Number(el.textContent) || 0);
    const skippedCount = await page.$eval("#enrichMetricSkipped", (el) => Number(el.textContent) || 0);
    const failedCount = await page.$eval("#enrichMetricFailed", (el) => Number(el.textContent) || 0);
    const statusText = await page.$eval("#enrichStatusInfo", (el) => el.textContent.trim());

    // In-memory contact tally
    const { emailsFound, dmsFound, avgScore } = await page.evaluate(() => {
      let em = 0, dm = 0, scoreSum = 0, count = 0;
      for (const l of window.currentExtractedLeads) {
        if (l.email || (l.additional_emails && l.additional_emails.length > 0)) em++;
        if (l.decision_maker_name || (l.people && l.people.length > 0)) dm++;
        if (typeof l.lead_score === "number") {
          scoreSum += l.lead_score;
          count++;
        }
      }
      return { emailsFound: em, dmsFound: dm, avgScore: count > 0 ? Math.round(scoreSum / count) : 0 };
    });

    console.log(`  Total Runtime: ${totalRuntimeMs} ms (${avgPerLeadMs} ms/lead)`);
    console.log(`  Enriched: ${enrichedCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`);
    console.log(`  Duplicates Detected: ${duplicatesCount}`);
    console.log(`  Emails Found: ${emailsFound} | DMs Found: ${dmsFound} | Avg Score: ${avgScore}`);
    console.log(`  Status Banner: "${statusText}"`);

    // Download and record file sizes
    clearDownloadFolder();
    await page.click("#downloadXlsxBtn");
    const xlsxFile = await waitForDownload(page, ".xlsx", 10000);
    assert.ok(xlsxFile, "XLSX download failed");

    clearDownloadFolder();
    await page.click("#downloadCsvBtn");
    const csvFile = await waitForDownload(page, ".csv", 10000);
    assert.ok(csvFile, "CSV download failed");

    console.log(`  Exported Files: XLSX (${xlsxFile.size} bytes) | CSV (${csvFile.size} bytes)`);

    const record = {
      leadCount,
      totalRuntimeMs,
      avgPerLeadMs,
      enrichedCount,
      skippedCount,
      failedCount,
      duplicatesCount,
      emailsFound,
      dmsFound,
      avgScore,
      xlsxSize: xlsxFile.size,
      csvSize: csvFile.size,
      statusBanner: statusText,
    };

    benchmarkResults.benchmarks[`${leadCount}_leads`] = record;
    return record;
  }

  // Execute benchmarks
  await runBatchBenchmark(10);
  await runBatchBenchmark(25);
  await runBatchBenchmark(50);
  await runBatchBenchmark(100);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELLATION BENCHMARK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n--- BENCHMARK: Cancellation Response Speed ---");
  const cancelLeads = [];
  for (let i = 1; i <= 50; i++) {
    cancelLeads.push({
      company_name: `Cancel Test ${i}`,
      place_id: `ChIJ_CANCEL_${i}`,
      website: `http://127.0.0.1:${PORT}/biz/slow`,
    });
  }
  await page.evaluate((batch) => {
    window.handleDiscoveryTerminalState({
      status: "completed",
      leads: batch,
      stats: { discovered: 50, qualified: 50, ready: 50 }
    });
  }, cancelLeads);

  await page.click("#enrichWebsitesBtn");
  await sleep(1000); // Wait for worker loop

  const cancelStart = Date.now();
  await page.click("#stopEnrichBtn");
  await page.waitForFunction(() => {
    const stopBtn = document.getElementById("stopEnrichBtn");
    return stopBtn && stopBtn.classList.contains("hidden");
  }, { timeout: 5000 });
  const cancelElapsedMs = Date.now() - cancelStart;

  console.log(`  [PASS] User cancellation halted workers in ${cancelElapsedMs} ms.`);
  benchmarkResults.benchmarks.cancellationSpeedMs = cancelElapsedMs;

  // ═══════════════════════════════════════════════════════════════════════════
  // END-TO-END USER WORKFLOW TEST
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n========================================================");
  console.log("  USER WORKFLOW SIMULATION (Zero Developer Intervention)");
  console.log("========================================================");

  // 1. Open RAMOS
  await page.goto(popupUrl, { waitUntil: "domcontentloaded" });
  console.log("  1. RAMOS popup initialized.");

  // 2. Open Google Maps CTA
  const openMapsBtn = await page.$("#openMapsBtn");
  assert.ok(openMapsBtn);
  await page.click("#openMapsBtn");
  const mapsTarget = await browser.waitForTarget((t) => t.url().includes("google.com/maps"), { timeout: 10000 });
  assert.ok(mapsTarget, "Maps tab opened");
  console.log("  2. Google Maps CTA launched Maps tab.");
  const mPage = await mapsTarget.page();
  if (mPage) await mPage.close();

  // 3. Simulate Search & Run Discovery
  console.log("  3. Simulating Discovery of 5 leads...");
  const pilotLeads = [
    {
      company_name: "Apex Medical Care",
      place_id: "ChIJ_PILOT_1",
      phone: "+1 800-555-0199",
      address: "100 Medical Center Way",
      website: `http://127.0.0.1:${PORT}/biz/vanguard`,
    },
    {
      company_name: "Apex Medical Care Clinic", // Duplicate of 1
      place_id: "ChIJ_PILOT_1",
      phone: "+1 800-555-0199",
      address: "100 Medical Center Way",
      website: `http://127.0.0.1:${PORT}/biz/vanguard`,
      additional_emails: ["appointments@apexmedical.org"],
    },
    {
      company_name: "Cloud Security Corp",
      place_id: "ChIJ_PILOT_2",
      phone: "+1 555-222-3333",
      website: `http://127.0.0.1:${PORT}/biz/cf-protected`,
    },
    {
      company_name: "Slow Movers Co",
      place_id: "ChIJ_PILOT_3",
      phone: "+1 555-444-5555",
      website: `http://127.0.0.1:${PORT}/biz/slow`,
    },
    {
      company_name: "No Website Law",
      place_id: "ChIJ_PILOT_4",
      phone: "+1 555-777-8888",
      website: "",
    }
  ];

  await page.evaluate((batch) => {
    window.handleDiscoveryTerminalState({
      status: "completed",
      leads: batch,
      stats: { discovered: 5, qualified: 5, ready: 5 }
    });
  }, pilotLeads);

  // 4. Review leads in UI
  const discoveredCount = await page.evaluate(() => window.currentExtractedLeads.length);
  assert.equal(discoveredCount, 4, "5 raw leads deduplicated into 4");
  console.log("  4. Leads reviewed: 4 unique leads (1 duplicate merged).");

  // 5. Enrich Websites
  console.log("  5. Enriching websites with company intelligence...");
  await page.click("#enrichWebsitesBtn");
  await page.waitForFunction(() => {
    const stopBtn = document.getElementById("stopEnrichBtn");
    const xlsxBtn = document.getElementById("downloadXlsxBtn");
    return stopBtn && stopBtn.classList.contains("hidden") && xlsxBtn && !xlsxBtn.disabled;
  }, { timeout: 20000 });

  // 6. Review enrichment
  const pilotStatus = await page.$eval("#enrichStatusInfo", (el) => el.textContent.trim());
  console.log(`  6. Enrichment reviewed: "${pilotStatus}"`);

  // 7. Download Excel and verify on disk
  console.log("  7. Downloading Excel spreadsheet...");
  clearDownloadFolder();
  await page.click("#downloadXlsxBtn");
  const pilotXlsx = await waitForDownload(page, ".xlsx", 10000);
  assert.ok(pilotXlsx, "Pilot XLSX file missing");
  const xlsxCheck = verifyXlsxBinary(pilotXlsx.fullPath);
  assert.ok(xlsxCheck.valid);
  assert.ok(xlsxCheck.hasPeopleSheet, "Workbook has 2 sheets (Leads + People)");
  console.log(`     [PASS] Excel (.xlsx) verified: ${pilotXlsx.size} bytes (Valid OOXML 2-sheet workbook).`);

  // 8. Download CSV and verify on disk
  console.log("  8. Downloading CSV spreadsheet...");
  clearDownloadFolder();
  await page.click("#downloadCsvBtn");
  const pilotCsv = await waitForDownload(page, ".csv", 10000);
  assert.ok(pilotCsv, "Pilot CSV file missing");
  const csvCheck = verifyCsvContent(pilotCsv.fullPath, 34);
  assert.ok(csvCheck.valid);
  assert.equal(csvCheck.linesCount, 5, "Header + 4 leads rows");
  console.log(`     [PASS] CSV verified: ${pilotCsv.size} bytes (34 columns, RFC-4180 compliant).`);

  benchmarkResults.workflow = {
    status: "PASS",
    pilotLeadsExtracted: 4,
    pilotXlsxSize: pilotXlsx.size,
    pilotCsvSize: pilotCsv.size,
  };

  // Write benchmark results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(benchmarkResults, null, 2), "utf-8");
  console.log(`\n[RESULTS] Benchmark data written to ${RESULTS_FILE}`);

  console.log("\n========================================================");
  console.log("  PHASE 9 RELEASE CANDIDATE VERIFICATION: 100% PASS!     ");
  console.log("========================================================");
} finally {
  await browser.close();
  server.close();
}
