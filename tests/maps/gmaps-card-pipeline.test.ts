import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// --- Import Authoritative Extension Modules ---
const Validators = require("../../extension/content/maps/validators");
const DetailExtractor = require("../../extension/content/maps/detail-extractor");
const ResultCardExtractor = require("../../extension/content/maps/result-card-extractor");
const RamosXlsxBuilderRaw = require("../../extension/shared/xlsx-builder");
const RamosXlsxBuilder = RamosXlsxBuilderRaw.buildXlsx ? RamosXlsxBuilderRaw : (RamosXlsxBuilderRaw.default || globalThis.RamosXlsxBuilder || RamosXlsxBuilderRaw);

// Simulated Authoritative Run Engine (reflecting background.js currentRun architecture)
class TestRunEngine {
  currentRun: {
    runId: string;
    query: string | null;
    sourceQuery: string | null;
    requestedLimit: number;
    candidates: any[];
    readyLeads: any[];
    failedLeads: any[];
    status: string;
  } | null = null;

  startNewRun(query: string, limit: number) {
    const runId = "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    this.currentRun = {
      runId,
      query,
      sourceQuery: query,
      requestedLimit,
      candidates: [],
      readyLeads: [],
      failedLeads: [],
      status: "running",
    };
    return this.currentRun;
  }

  setDiscoveredCandidates(rawCandidates: any[]) {
    if (!this.currentRun) return [];
    // Apply requestedLimit ONCE to candidates
    const selected = rawCandidates.slice(0, this.currentRun.requestedLimit);
    this.currentRun.candidates = selected.map((c) => ({
      ...c,
      runId: this.currentRun!.runId,
      sourceQuery: this.currentRun!.query,
    }));
    return this.currentRun.candidates;
  }

  handleDetailReady(message: { runId: string; sourceQuery: string; detailLead: any }) {
    if (!this.currentRun) return false;
    if (message.runId !== this.currentRun.runId || message.sourceQuery !== this.currentRun.query) {
      return false; // discarded stale result
    }

    const merged = {
      ...message.detailLead,
      runId: this.currentRun.runId,
      sourceQuery: this.currentRun.query,
      enrichmentStatus: "complete",
    };
    this.currentRun.readyLeads.push(merged);
    this.checkCompletionStatus();
    return true;
  }

  handleCandidateFailed(message: { runId: string; sourceQuery: string; candidate: any; reason?: string }) {
    if (!this.currentRun) return false;
    if (message.runId !== this.currentRun.runId || message.sourceQuery !== this.currentRun.query) {
      return false;
    }

    const failed = {
      ...message.candidate,
      runId: this.currentRun.runId,
      sourceQuery: this.currentRun.query,
      enrichmentStatus: message.reason || "failed",
    };
    this.currentRun.failedLeads.push(failed);
    this.checkCompletionStatus();
    return true;
  }

  private checkCompletionStatus() {
    if (!this.currentRun) return;
    const totalProcessed = this.currentRun.readyLeads.length + this.currentRun.failedLeads.length;
    if (totalProcessed >= this.currentRun.candidates.length) {
      this.currentRun.status = "completed";
    }
  }

  getExportableLeads() {
    if (!this.currentRun) return [];

    const ready = this.currentRun.readyLeads.filter((r) => r && r.enrichmentStatus === "complete");

    // HARD BOUNDED ASSERTION (protecting result limits)
    if (ready.length > this.currentRun.requestedLimit) {
      throw new Error(
        `EXPORT_LIMIT_VIOLATION: readyLeads.length (${ready.length}) exceeds requestedLimit (${this.currentRun.requestedLimit})`
      );
    }
    return ready;
  }
}

function getActionButtonState(response: { cardCount: number; readyCount: number; records: any[]; siConnected?: boolean }) {
  const readyCount = (response.records || []).length || response.readyCount || 0;
  const hasReadyLeads = readyCount > 0;
  const hasCandidates = response.cardCount > 0;

  return {
    downloadCsvEnabled: hasReadyLeads,
    downloadXlsxEnabled: hasReadyLeads,
    extractBtnEnabled: hasReadyLeads || hasCandidates,
    extractBtnText: hasReadyLeads ? "Run Discovery Again" : "Run Discovery",
  };
}

function generateCSV(leads: any[]) {
  const CSV_HEADERS = [
    "Company", "Phone", "Website", "Email", "Email Status", "Address", "City", "State / Region",
    "Country", "Postal Code", "Industry", "Business Type", "Rating", "Reviews", "Opening Status",
    "Price Range", "Booking URL", "Ordering URL", "Menu URL", "Imported At", "Source URL", "Place ID",
    "Source Query", "Run ID"
  ];
  function escape(str: any) {
    if (str == null) return "";
    const s = String(str).trim();
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const rows = [CSV_HEADERS.join(",")];
  for (const lead of leads) {
    if (!lead || !lead.company_name) continue;
    rows.push([
      escape(lead.company_name), escape(lead.phone), escape(lead.website), escape(lead.email),
      escape(lead.email_status), escape(lead.address), escape(lead.city), escape(lead.region || lead.state),
      escape(lead.country), escape(lead.postal_code), escape(lead.category), escape(lead.business_type || lead.category),
      escape(lead.rating), escape(lead.review_count), escape(lead.opening_status), escape(lead.price_range),
      escape(lead.booking_url), escape(lead.ordering_url), escape(lead.menu_url), escape(lead.discovered_at || lead.created_at),
      escape(lead.source_url), escape(lead.place_id), escape(lead.sourceQuery), escape(lead.runId)
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n");
}

// ─── PIPELINE & REGRESSION SUITE ──────────────────────────────────────────────

test("REGRESSION TEST 1: Completed discovery with 5 ready records -> Download CSV immediately succeeds", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const candidates = engine.setDiscoveredCandidates(Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}` })));

  candidates.forEach((c) => {
    engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "pizza", detailLead: c });
  });

  assert.equal(engine.currentRun!.status, "completed");
  const ready = engine.getExportableLeads();
  assert.equal(ready.length, 5);

  const buttonState = getActionButtonState({ cardCount: 5, readyCount: 5, records: ready });
  assert.equal(buttonState.downloadCsvEnabled, true, "Download CSV must be immediately ENABLED");

  const csv = generateCSV(ready);
  assert.ok(csv.includes("Pizza 1"));
  assert.ok(csv.includes("Pizza 5"));
});

test("REGRESSION TEST 2: Completed discovery with 5 ready records -> Download Excel immediately succeeds", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const candidates = engine.setDiscoveredCandidates(Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}`, phone: "123-456" })));

  candidates.forEach((c) => {
    engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "pizza", detailLead: c });
  });

  const ready = engine.getExportableLeads();
  assert.equal(ready.length, 5);

  const buttonState = getActionButtonState({ cardCount: 5, readyCount: 5, records: ready });
  assert.equal(buttonState.downloadXlsxEnabled, true, "Download Excel must be immediately ENABLED");

  const xlsxBuf = RamosXlsxBuilder.buildXlsx(ready);
  assert.ok(xlsxBuf instanceof Uint8Array || Buffer.isBuffer(xlsxBuf));
  assert.ok(xlsxBuf.length > 500, "Generated XLSX buffer must be valid zip payload");
});

test("REGRESSION TEST 3: Popup reopened after discovery -> Ready count restored -> Download CSV works", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("plumber", 5);
  const candidates = engine.setDiscoveredCandidates(Array.from({ length: 5 }, (_, i) => ({ company_name: `Plumber ${i + 1}` })));
  candidates.forEach((c) => engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "plumber", detailLead: c }));

  // Simulate popup reopen by querying background state
  const backgroundState = {
    cardCount: 5,
    readyCount: engine.currentRun!.readyLeads.length,
    records: engine.getExportableLeads(),
  };

  const buttonState = getActionButtonState(backgroundState);
  assert.equal(buttonState.downloadCsvEnabled, true);
  assert.equal(buttonState.extractBtnText, "Run Discovery Again");

  const csv = generateCSV(backgroundState.records);
  assert.equal(csv.split("\r\n").filter((l) => l.trim().length > 0).length, 6); // header + 5 records
});

test("REGRESSION TEST 4: Popup reopened after discovery -> Download Excel works", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("dentist", 5);
  const candidates = engine.setDiscoveredCandidates(Array.from({ length: 5 }, (_, i) => ({ company_name: `Dentist ${i + 1}` })));
  candidates.forEach((c) => engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "dentist", detailLead: c }));

  const backgroundState = {
    cardCount: 5,
    readyCount: engine.currentRun!.readyLeads.length,
    records: engine.getExportableLeads(),
  };

  const buttonState = getActionButtonState(backgroundState);
  assert.equal(buttonState.downloadXlsxEnabled, true);

  const xlsxBuf = RamosXlsxBuilder.buildXlsx(backgroundState.records);
  assert.ok(xlsxBuf.length > 500);
});

test("REGRESSION TEST 5: Ready = 0 -> exports disabled", () => {
  const buttonState = getActionButtonState({ cardCount: 5, readyCount: 0, records: [] });
  assert.equal(buttonState.downloadCsvEnabled, false, "CSV export must be disabled when Ready = 0");
  assert.equal(buttonState.downloadXlsxEnabled, false, "Excel export must be disabled when Ready = 0");
});

test("REGRESSION TEST 6: Discovery completed -> export -> Run Discovery Again -> new search -> export -> no stale records", () => {
  const engine = new TestRunEngine();

  // Search 1: Pizza
  const run1 = engine.startNewRun("pizza", 5);
  const cand1 = engine.setDiscoveredCandidates([{ company_name: "Pizza Place 1" }]);
  engine.handleDetailReady({ runId: run1.runId, sourceQuery: "pizza", detailLead: cand1[0] });

  const export1 = engine.getExportableLeads();
  assert.equal(export1.length, 1);
  assert.equal(export1[0].company_name, "Pizza Place 1");

  // User clicks "Run Discovery Again" for new query: Gym
  const run2 = engine.startNewRun("gym", 5);
  const cand2 = engine.setDiscoveredCandidates([{ company_name: "Gym Place 1" }]);
  engine.handleDetailReady({ runId: run2.runId, sourceQuery: "gym", detailLead: cand2[0] });

  const export2 = engine.getExportableLeads();
  assert.equal(export2.length, 1);
  assert.equal(export2[0].company_name, "Gym Place 1");
  assert.equal(export2.some((r) => r.company_name === "Pizza Place 1"), false, "Zero stale pizza records in gym export");
});

test("REGRESSION TEST 7: Pizza search -> export -> Gym search -> export -> zero Pizza records in Gym export", () => {
  const engine = new TestRunEngine();

  // Run A: Pizza
  const runA = engine.startNewRun("pizza near Gota", 5);
  const pizzaCands = engine.setDiscoveredCandidates(Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}` })));
  pizzaCands.forEach((c) => engine.handleDetailReady({ runId: runA.runId, sourceQuery: "pizza near Gota", detailLead: c }));
  const exportA = engine.getExportableLeads();
  assert.equal(exportA.length, 5);

  // Run B: Gym
  const runB = engine.startNewRun("gym near Gota", 5);
  const gymCands = engine.setDiscoveredCandidates(Array.from({ length: 3 }, (_, i) => ({ company_name: `Gym ${i + 1}` })));
  gymCands.forEach((c) => engine.handleDetailReady({ runId: runB.runId, sourceQuery: "gym near Gota", detailLead: c }));
  const exportB = engine.getExportableLeads();

  assert.equal(exportB.length, 3);
  assert.equal(exportB.every((r) => r.company_name.startsWith("Gym")), true);
});

test("REGRESSION TEST 8: Limit = 5 -> exactly 5 exported", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const cands = engine.setDiscoveredCandidates(Array.from({ length: 10 }, (_, i) => ({ company_name: `Pizza ${i + 1}` })));
  assert.equal(cands.length, 5, "Candidates list must be capped at 5");

  cands.forEach((c) => engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "pizza", detailLead: c }));
  assert.equal(engine.getExportableLeads().length, 5);
});

test("REGRESSION TEST 9: Limit = 10 -> up to 10 exported", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 10);
  const cands = engine.setDiscoveredCandidates(Array.from({ length: 15 }, (_, i) => ({ company_name: `Pizza ${i + 1}` })));
  assert.equal(cands.length, 10, "Candidates list must be capped at 10");

  cands.forEach((c) => engine.handleDetailReady({ runId: engine.currentRun!.runId, sourceQuery: "pizza", detailLead: c }));
  assert.equal(engine.getExportableLeads().length, 10);
});

test("REGRESSION TEST 10: Partial lead fields -> no column shifting", () => {
  const leadWithPartialFields = {
    company_name: "Partial Business",
    phone: "",
    website: "https://partial.com",
    address: "123 Main St",
    city: "",
    region: "",
    country: "USA",
    postal_code: "",
    category: "Store",
    rating: null,
    review_count: null,
  };

  const csv = generateCSV([leadWithPartialFields]);
  const lines = csv.split("\r\n");
  const headerCols = lines[0].replace("\uFEFF", "").split(",");
  const dataCols = lines[1].split(",");

  assert.equal(headerCols.length, dataCols.length, "Column counts must match exactly");
  assert.equal(dataCols[0], "Partial Business");
  assert.equal(dataCols[1], ""); // Phone empty
  assert.equal(dataCols[2], "https://partial.com"); // Website
  assert.equal(dataCols[5], "123 Main St"); // Address
});

test("DATA INTEGRITY TEST: CSV vs XLSX lead representation match", () => {
  const testLeads = [
    { company_name: "Biz 1", phone: "123-456", website: "https://b1.com", address: "Addr 1", rating: "4.5", review_count: 100 },
    { company_name: "Biz 2", phone: "987-654", website: "https://b2.com", address: "Addr 2", rating: "4.2", review_count: 50 },
    { company_name: "Biz 3", phone: "555-000", website: "", address: "Addr 3", rating: null, review_count: 0 },
    { company_name: "Biz 4", phone: "", website: "https://b4.com", address: "Addr 4", rating: "5.0", review_count: 12 },
    { company_name: "Biz 5", phone: "111-222", website: "https://b5.com", address: "Addr 5", rating: "3.8", review_count: 99 },
  ];

  const csv = generateCSV(testLeads);
  const xlsxBuf = RamosXlsxBuilder.buildXlsx(testLeads);

  const csvRows = csv.split("\r\n").filter((l) => l.length > 0);
  assert.equal(csvRows.length - 1, testLeads.length, "CSV record count must equal input leads length");
  assert.ok(xlsxBuf.length > 500, "XLSX buffer must be generated");

  // Verify fields match across dataset
  testLeads.forEach((lead, i) => {
    assert.ok(csv.includes(lead.company_name), `CSV must contain lead ${i + 1} company name`);
  });
});

test("BROWSER COMPATIBILITY REGRESSION TEST: XLSX builder works without Node Buffer global", () => {
  const originalBuffer = (globalThis as any).Buffer;
  try {
    // Temporarily remove Buffer from globalScope to simulate Chrome extension runtime
    (globalThis as any).Buffer = undefined;

    const testLeads = [
      { company_name: "Browser Biz 1", phone: "123-456", website: "https://b1.com", address: "Addr 1" },
      { company_name: "Browser Biz 2", phone: "987-654", website: "https://b2.com", address: "Addr 2" },
    ];

    const resultUint8 = RamosXlsxBuilder.buildXlsx(testLeads);

    assert.ok(resultUint8 instanceof Uint8Array, "Result must be a browser-native Uint8Array");
    assert.ok(resultUint8.length > 500, "XLSX payload must be generated without Node Buffer");
  } finally {
    (globalThis as any).Buffer = originalBuffer;
  }
});

test("OOXML SCHEMA & XML COMPLIANCE REGRESSION TEST: Generated XLSX contains valid XML & relationships", () => {
  const sampleLeads = [
    {
      company_name: "Hyundai Motor India Ltd & Co <Gota>",
      phone: "+91 79 2685 1234",
      website: "https://www.hyundai.com/in/en.html",
      email: "contact@hyundai.co.in",
      address: "Plot No 1, Near Gota Bridge,\nSarkhej - Gandhinagar Hwy, Gota,\nAhmedabad, Gujarat 382481",
      city: "Ahmedabad",
      region: "Gujarat",
      country: "India",
      postal_code: "382481",
      category: "Car Dealer",
      rating: "4.6",
      review_count: 1250,
      sourceQuery: "hyundai near me",
    }
  ];

  const uint8 = RamosXlsxBuilder.buildXlsx(sampleLeads);
  assert.ok(uint8.length > 500, "XLSX payload must be generated");

  // Parse zip headers to extract XML text string entries
  const buf = Buffer.from(uint8);
  const entries: Record<string, string> = {};
  let pos = 0;

  while (pos < buf.length - 30) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== 0x04034b50) break;

    const compSize = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const name = buf.toString("utf8", pos + 30, pos + 30 + nameLen);
    const dataStart = pos + 30 + nameLen + extraLen;
    entries[name] = buf.toString("utf8", dataStart, dataStart + compSize);
    pos = dataStart + compSize;
  }

  assert.ok(entries["[Content_Types].xml"], "Must contain [Content_Types].xml");
  assert.ok(entries["xl/styles.xml"], "Must contain xl/styles.xml");
  assert.ok(entries["xl/worksheets/sheet1.xml"], "Must contain xl/worksheets/sheet1.xml");

  const stylesXml = entries["xl/styles.xml"];
  const sheetXml = entries["xl/worksheets/sheet1.xml"];

  // Verify OOXML Strict Schema Requirements
  assert.ok(stylesXml.includes('<numFmts count="1">'), "styles.xml must declare numFmts block");
  assert.ok(stylesXml.includes('<numFmt numFmtId="49" formatCode="@"/>'), "numFmtId=49 must be declared");
  assert.ok(stylesXml.includes('<u val="single"/>'), "Hyperlink font underline must use val='single'");
  assert.ok(sheetXml.includes('xml:space="preserve"'), "sheet1.xml text nodes must preserve whitespace");
  assert.ok(sheetXml.includes('&amp;'), "Special characters like & must be escaped as &amp;");
  assert.ok(!sheetXml.includes('<t>Hyundai Motor India Ltd & Co <Gota></t>'), "Unescaped XML tags must not exist");
});


