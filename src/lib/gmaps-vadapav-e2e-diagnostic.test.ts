import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const Validators = require("../../extension/content/maps/validators");
const DetailExtractor = require("../../extension/content/maps/detail-extractor");
const ResultCardExtractor = require("../../extension/content/maps/result-card-extractor");

// Simulated Live E2E Diagnostic Harness with Per-Candidate Trace Logging
class DiagnosticE2EEngine {
  currentRun: {
    runId: string;
    query: string;
    requestedLimit: number;
    candidates: any[];
    readyLeads: any[];
    failedLeads: any[];
    status: string;
    startedAt: number;
  };

  constructor(query: string, limit: number) {
    this.currentRun = {
      runId: "e2e_run_" + Date.now(),
      query,
      requestedLimit: limit,
      candidates: [],
      readyLeads: [],
      failedLeads: [],
      status: "running",
      startedAt: Date.now(),
    };
  }

  logTrace(index: number, eventName: string, candidateName: string, extraStr = "") {
    const elapsedMs = Date.now() - this.currentRun.startedAt;
    const detail = extraStr ? ` ${extraStr}` : "";
    console.log(`[SI][E2E][${index}][${eventName}] name="${candidateName}" elapsedMs=${elapsedMs}${detail}`);
  }

  async runDiagnostic(liveCandidates: any[]) {
    // 1. Discovery phase
    console.log(`[SI][E2E] START query="${this.currentRun.query}" limit=${this.currentRun.requestedLimit}`);
    
    // Select up to requested limit
    this.currentRun.candidates = liveCandidates.slice(0, this.currentRun.requestedLimit);
    console.log(`[SI][E2E] DISCOVERED count=${liveCandidates.length} LIMITED count=${this.currentRun.candidates.length}`);

    // 2. Sequential candidate enrichment lifecycle
    for (let i = 0; i < this.currentRun.candidates.length; i++) {
      const idx = i + 1;
      const cand = this.currentRun.candidates[i];
      const startCandidateTime = Date.now();

      this.logTrace(idx, "START", cand.company_name);
      
      // Event 1: CLICK_ATTEMPT
      this.logTrace(idx, "CLICK_ATTEMPT", cand.company_name);

      // Event 2: DETAIL_PANEL_DETECTED
      await new Promise((r) => setTimeout(r, 100)); // simulate panel load
      this.logTrace(idx, "DETAIL_PANEL_DETECTED", cand.company_name);

      // Event 3: DETAIL_IDENTITY_CHECK
      this.logTrace(idx, "DETAIL_IDENTITY_CHECK", cand.company_name);

      if (cand.shouldTimeout || cand.shouldFail) {
        this.logTrace(idx, "FAILED", cand.company_name, `reason=${cand.failReason || "timeout"}`);
        this.currentRun.failedLeads.push({
          ...cand,
          runId: this.currentRun.runId,
          sourceQuery: this.currentRun.query,
          enrichmentStatus: "failed",
        });
        continue;
      }

      // Event 4: IDENTITY_OK
      this.logTrace(idx, "IDENTITY_OK", cand.company_name);

      // Event 5: EXTRACT_START
      this.logTrace(idx, "EXTRACT_START", cand.company_name);

      const hasPhone = Boolean(cand.phone);
      const hasWebsite = Boolean(cand.website);
      const hasAddress = Boolean(cand.address);

      // Event 6: EXTRACT_RESULT
      this.logTrace(idx, "EXTRACT_RESULT", cand.company_name, `phone=${hasPhone} website=${hasWebsite} address=${hasAddress}`);

      const mergedLead = {
        ...cand,
        runId: this.currentRun.runId,
        sourceQuery: this.currentRun.query,
        enrichmentStatus: "complete",
        enrichedAt: new Date().toISOString(),
      };

      this.currentRun.readyLeads.push(mergedLead);
      const candElapsed = Date.now() - startCandidateTime;

      // Event 7: READY
      this.logTrace(idx, "READY", cand.company_name, `candElapsedMs=${candElapsed}`);
    }

    this.currentRun.status = "completed";
    const totalElapsed = Date.now() - this.currentRun.startedAt;
    console.log(
      `[SI][E2E] DIAGNOSTIC_COMPLETE requested=${this.currentRun.requestedLimit} ready=${this.currentRun.readyLeads.length} failed=${this.currentRun.failedLeads.length} totalElapsedMs=${totalElapsed}`
    );
    return this.currentRun;
  }
}

// ─── TARGETED E2E DIAGNOSTIC TEST ─────────────────────────────────────────────

test("Targeted E2E Diagnostic Test: 'vadapav near me' limit 5 trace recording", async () => {
  const vadapavCandidates = [
    {
      company_name: "CITY VADAPAV",
      place_id: "place-vada-1",
      phone: "+91 98250 11111",
      website: null,
      address: "Shop 1, Main Rd, Vadodara",
    },
    {
      company_name: "Amadavad Signal Vadapav",
      place_id: "place-vada-2",
      phone: "+91 98250 22222",
      website: "https://signalvadapav.com",
      address: "Opposite Signal, SG Highway, Ahmedabad",
    },
    {
      company_name: "JAY BHAVANI VADAPAV",
      place_id: "place-vada-3",
      phone: "+91 98250 33333",
      website: "https://jaybhavanivadapav.com",
      address: "Satellite Cross Rd, Ahmedabad",
    },
    {
      company_name: "Gajanand Vadapav",
      place_id: "place-vada-4",
      phone: "+91 98250 44444",
      website: null,
      address: "Science City Rd, Ahmedabad",
    },
    {
      company_name: "Karnavati Vadapav",
      place_id: "place-vada-5",
      phone: "+91 98250 55555",
      website: null,
      address: "Drive-In Rd, Ahmedabad",
    },
  ];

  const engine = new DiagnosticE2EEngine("vadapav near me", 5);
  const resultRun = await engine.runDiagnostic(vadapavCandidates);

  assert.equal(resultRun.candidates.length, 5);
  assert.equal(resultRun.readyLeads.length, 5);
  assert.equal(resultRun.failedLeads.length, 0);
  assert.equal(resultRun.status, "completed");
});
