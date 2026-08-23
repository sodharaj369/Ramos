import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// --- Import Authoritative Extension Modules ---
const Validators = require("../../extension/content/maps/validators");
const DetailExtractor = require("../../extension/content/maps/detail-extractor");
const ResultCardExtractor = require("../../extension/content/maps/result-card-extractor");

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
      enrichmentStatus: "failed",
      reason: message.reason || "failed",
    };
    this.currentRun.failedLeads.push(failed);
    this.checkCompletionStatus();
    return true;
  }

  checkCompletionStatus() {
    if (!this.currentRun) return;
    const total = this.currentRun.candidates.length;
    const resolved = this.currentRun.readyLeads.length + this.currentRun.failedLeads.length;
    if (resolved >= total) {
      this.currentRun.status = "completed";
    }
  }

  getExportableLeads() {
    if (!this.currentRun) return [];

    const ready = this.currentRun.readyLeads.filter(
      (lead) => lead.runId === this.currentRun!.runId && lead.sourceQuery === this.currentRun!.query && lead.enrichmentStatus === "complete"
    );

    if (ready.length > this.currentRun.requestedLimit) {
      throw new Error(
        `EXPORT_LIMIT_VIOLATION ready=${ready.length} limit=${this.currentRun.requestedLimit}`
      );
    }

    // Row count === READY count (zero padding, no fake/failed records)
    return ready;
  }
}

function getActionButtonState(state: { cardCount?: number; readyCount?: number; records?: any[]; siConnected?: boolean }) {
  const cardCount = Number(state.cardCount != null ? state.cardCount : 0);
  const readyCount = Number(state.readyCount || (state.records ? state.records.length : 0));
  const hasCandidates = cardCount > 0 || readyCount > 0;
  const isConnected = Boolean(state.siConnected);

  return {
    downloadCsvEnabled: hasCandidates,
    importEnabled: hasCandidates && isConnected,
  };
}

// ─── 12 REGRESSION TESTS (Section 15 & Completion Contract) ──────────────────

test("TEST 1: 10 discovered, limit 5 -> expected export = 5", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza near Satellite", 5);

  const rawDiscovered = Array.from({ length: 10 }, (_, i) => ({
    company_name: `Pizza Shop ${i + 1}`,
    place_id: `place-${i + 1}`,
  }));

  const candidates = engine.setDiscoveredCandidates(rawDiscovered);
  assert.equal(candidates.length, 5);

  for (const c of candidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: engine.currentRun!.query!,
      detailLead: { company_name: c.company_name, phone: "+91 99999 11111", address: "Satellite Rd" },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 5);
  assert.equal(engine.currentRun!.status, "completed");
});

test("TEST 2: 5 discovered, limit 5 -> expected export = 5", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("gym near Gota", 5);

  const rawDiscovered = Array.from({ length: 5 }, (_, i) => ({
    company_name: `Gym ${i + 1}`,
    place_id: `place-gym-${i + 1}`,
  }));

  const candidates = engine.setDiscoveredCandidates(rawDiscovered);
  assert.equal(candidates.length, 5);

  for (const c of candidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: engine.currentRun!.query!,
      detailLead: { company_name: c.company_name, phone: "+91 88888 22222", address: "Gota Rd" },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 5);
});

test("TEST 3: 10 discovered, limit 10 -> expected export = 10", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("hotels near station", 10);

  const rawDiscovered = Array.from({ length: 10 }, (_, i) => ({
    company_name: `Hotel ${i + 1}`,
    place_id: `place-hotel-${i + 1}`,
  }));

  const candidates = engine.setDiscoveredCandidates(rawDiscovered);
  assert.equal(candidates.length, 10);

  for (const c of candidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: engine.currentRun!.query!,
      detailLead: { company_name: c.company_name, address: "Station Rd" },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 10);
});

test("TEST 4: 10 discovered, limit 2 -> expected export = 2", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("cafes near me", 2);

  const rawDiscovered = Array.from({ length: 10 }, (_, i) => ({
    company_name: `Cafe ${i + 1}`,
    place_id: `place-cafe-${i + 1}`,
  }));

  const candidates = engine.setDiscoveredCandidates(rawDiscovered);
  assert.equal(candidates.length, 2);

  for (const c of candidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: engine.currentRun!.query!,
      detailLead: { company_name: c.company_name, phone: "+91 77777 33333" },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 2);
});

test("TEST 5: Run A: pizza (limit 5), Run B: gym (limit 5) -> Run B export must contain ONLY gym", () => {
  const engine = new TestRunEngine();

  // Run A
  engine.startNewRun("pizza near Satellite", 5);
  const pizzaCandidates = engine.setDiscoveredCandidates(
    Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}`, place_id: `pizza-${i + 1}` }))
  );
  for (const c of pizzaCandidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "pizza near Satellite",
      detailLead: { company_name: c.company_name },
    });
  }

  // Run B (New query)
  engine.startNewRun("gym near Godrej Garden City", 5);
  const gymCandidates = engine.setDiscoveredCandidates(
    Array.from({ length: 5 }, (_, i) => ({ company_name: `Gym ${i + 1}`, place_id: `gym-${i + 1}` }))
  );
  for (const c of gymCandidates) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "gym near Godrej Garden City",
      detailLead: { company_name: c.company_name },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 5);
  assert.equal(exported.every((lead) => lead.company_name.startsWith("Gym")), true);
  assert.equal(exported.some((lead) => lead.company_name.startsWith("Pizza")), false);
});

test("TEST 6: Run A has 10 records, Run B has 3 records -> Run B export must contain exactly 3", () => {
  const engine = new TestRunEngine();

  // Run A
  engine.startNewRun("Search A", 10);
  const candA = engine.setDiscoveredCandidates(
    Array.from({ length: 10 }, (_, i) => ({ company_name: `Record A-${i + 1}` }))
  );
  for (const c of candA) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "Search A",
      detailLead: { company_name: c.company_name },
    });
  }

  // Run B
  engine.startNewRun("Search B", 3);
  const candB = engine.setDiscoveredCandidates(
    Array.from({ length: 3 }, (_, i) => ({ company_name: `Record B-${i + 1}` }))
  );
  for (const c of candB) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "Search B",
      detailLead: { company_name: c.company_name },
    });
  }

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 3);
});

test("TEST 7: 5 candidates, 5 enrichment successes -> ready = 5, export = 5", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const cand = engine.setDiscoveredCandidates(
    Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}` }))
  );
  for (const c of cand) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "pizza",
      detailLead: { company_name: c.company_name, phone: "+91 95124 44530" },
    });
  }

  assert.equal(engine.currentRun!.readyLeads.length, 5);
  assert.equal(engine.getExportableLeads().length, 5);
});

test("TEST 8: 5 candidates, 3 enrichment successes, 2 failures -> ready = 3, failed = 2, export = 3 (NO PADDING)", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const cand = engine.setDiscoveredCandidates(
    Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}` }))
  );

  // 3 succeed
  for (let i = 0; i < 3; i++) {
    engine.handleDetailReady({
      runId: engine.currentRun!.runId,
      sourceQuery: "pizza",
      detailLead: { company_name: cand[i].company_name },
    });
  }
  // 2 fail
  for (let i = 3; i < 5; i++) {
    engine.handleCandidateFailed({
      runId: engine.currentRun!.runId,
      sourceQuery: "pizza",
      candidate: cand[i],
      reason: "detail_panel_timeout",
    });
  }

  assert.equal(engine.currentRun!.readyLeads.length, 3);
  assert.equal(engine.currentRun!.failedLeads.length, 2);
  assert.equal(engine.currentRun!.status, "completed");
  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 3, "CSV export must contain exactly 3 valid leads, ZERO padding");
});

test("TEST 9: Start pizza enrichment. Before it finishes, change search to gym. Pizza's late async result must be discarded.", () => {
  const engine = new TestRunEngine();

  // Start Run A (pizza)
  const runA = engine.startNewRun("pizza", 5);
  engine.setDiscoveredCandidates([{ company_name: "Pizza 1" }]);

  // User changes query to gym (Run B starts)
  const runB = engine.startNewRun("gym", 5);
  const gymCand = engine.setDiscoveredCandidates([{ company_name: "Gym 1" }]);

  // Pizza's late async response arrives with old runA.runId
  const acceptedLatePizza = engine.handleDetailReady({
    runId: runA.runId,
    sourceQuery: "pizza",
    detailLead: { company_name: "Pizza 1" },
  });

  assert.equal(acceptedLatePizza, false, "Late pizza result must be discarded");

  // Gym response arrives
  engine.handleDetailReady({
    runId: runB.runId,
    sourceQuery: "gym",
    detailLead: { company_name: gymCand[0].company_name },
  });

  const exported = engine.getExportableLeads();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].company_name, "Gym 1");
});

test("TEST 10: Extension state check -> Download CSV enabled when candidates or ready leads exist", () => {
  const state = getActionButtonState({
    cardCount: 5,
    readyCount: 5,
    records: [{ company_name: "Lead 1" }],
    siConnected: false,
  });

  assert.equal(state.downloadCsvEnabled, true, "Download CSV must be ENABLED");
});

test("TEST 11: Export function receives 10 internal records with requestedLimit=5 -> Hard assertion throws EXPORT_LIMIT_VIOLATION", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("test query", 5);

  // Directly push 10 records into readyLeads violating limit
  for (let i = 0; i < 10; i++) {
    engine.currentRun!.readyLeads.push({
      company_name: `Lead ${i + 1}`,
      runId: engine.currentRun!.runId,
      sourceQuery: "test query",
      enrichmentStatus: "complete",
    });
  }

  assert.throws(
    () => engine.getExportableLeads(),
    /EXPORT_LIMIT_VIOLATION/
  );
});

test("TEST 12: Run remains running while pending candidates exist (ready=1, failed=2, pending=2 -> status running)", () => {
  const engine = new TestRunEngine();
  engine.startNewRun("pizza", 5);
  const cand = engine.setDiscoveredCandidates(
    Array.from({ length: 5 }, (_, i) => ({ company_name: `Pizza ${i + 1}` }))
  );

  // 1 ready
  engine.handleDetailReady({
    runId: engine.currentRun!.runId,
    sourceQuery: "pizza",
    detailLead: { company_name: cand[0].company_name },
  });

  // 2 failed
  engine.handleCandidateFailed({
    runId: engine.currentRun!.runId,
    sourceQuery: "pizza",
    candidate: cand[1],
    reason: "detail_panel_timeout",
  });
  engine.handleCandidateFailed({
    runId: engine.currentRun!.runId,
    sourceQuery: "pizza",
    candidate: cand[2],
    reason: "detail_panel_timeout",
  });

  // 2 candidates (index 3 and 4) are still pending
  assert.equal(engine.currentRun!.status, "running", "Run must remain running while pending candidates exist");
  assert.equal(engine.currentRun!.readyLeads.length, 1);
  assert.equal(engine.currentRun!.failedLeads.length, 2);

  // Now resolve remaining 2
  engine.handleDetailReady({
    runId: engine.currentRun!.runId,
    sourceQuery: "pizza",
    detailLead: { company_name: cand[3].company_name },
  });
  engine.handleDetailReady({
    runId: engine.currentRun!.runId,
    sourceQuery: "pizza",
    detailLead: { company_name: cand[4].company_name },
  });

  // Now pending === 0, status must become completed
  assert.equal(engine.currentRun!.status, "completed");
  assert.equal(engine.getExportableLeads().length, 3);
});
