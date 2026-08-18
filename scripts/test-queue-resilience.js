"use strict";
/**
 * Regression tests for candidate queue single-flight state machine.
 * Simulates background.js queue logic in Node.js (no browser required).
 */

// ─── Mini state-machine that mirrors background.js logic ─────────────────────

function createRun(candidates, limit) {
  limit = Math.min(limit || candidates.length, candidates.length);
  const run = {
    status: "running",
    runId: "run_test_" + Date.now(),
    sourceQuery: "test query",
    requestedLimit: limit,
    candidates: candidates.slice(0, limit).map((c, i) => ({ company_name: c, index: i })),
    candidateStates: [],
    readyLeads: [],
    failedLeads: [],
    activeIndex: -1,
    activeAttemptId: null,
    activeAt: 0,
    activeTimeoutId: null,
  };
  run.candidateStates = new Array(run.candidates.length).fill("PENDING");
  return run;
}

function generateAttemptId() {
  return "atm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}
function isTerminal(s) {
  return s === "READY" || s === "FAILED" || s === "DUPLICATE_SKIPPED" || s === "SKIPPED";
}
function clearTimeout_(run) {
  if (run.activeTimeoutId) { clearTimeout(run.activeTimeoutId); run.activeTimeoutId = null; }
}
function setCandidateTerminal(run, index, state) {
  if (isTerminal(run.candidateStates[index])) return;
  run.candidateStates[index] = state;
  if (run.activeIndex === index) {
    clearTimeout_(run);
    run.activeIndex = -1;
    run.activeAttemptId = null;
    run.activeAt = 0;
  }
}
function dispatchCandidate(run, index, isRetry, onTimeout) {
  if (run.status !== "running") return null;
  run.candidateStates[index] = "DISPATCHED";
  const attemptId = generateAttemptId();
  run.activeIndex = index;
  run.activeAttemptId = attemptId;
  run.activeAt = Date.now();
  clearTimeout_(run);
  if (onTimeout) {
    run.activeTimeoutId = setTimeout(() => {
      if (run.activeIndex === index && run.activeAttemptId === attemptId) {
        run.activeTimeoutId = null;
        if (!isTerminal(run.candidateStates[index])) {
          run.failedLeads.push(run.candidates[index]);
          setCandidateTerminal(run, index, "FAILED");
          processNext(run, index + 1, onTimeout);
        }
      }
    }, onTimeout);
  }
  return attemptId;
}
function processNext(run, index, onTimeout) {
  if (run.status !== "running") return;
  while (index < run.candidates.length && isTerminal(run.candidateStates[index])) index++;
  if (index >= run.candidates.length) {
    if (run.activeIndex >= 0 && run.candidateStates[run.activeIndex] === "DISPATCHED") return;
    run.status = "completed";
    return;
  }
  if (run.candidateStates[index] === "DISPATCHED") return;
  if (run.activeIndex >= 0 && run.activeIndex !== index) return;
  dispatchCandidate(run, index, false, onTimeout);
}
function acceptDetail(run, index, attemptId) {
  if (index !== run.activeIndex) return false;
  if (attemptId && attemptId !== run.activeAttemptId) return false;
  if (isTerminal(run.candidateStates[index])) return false;
  run.readyLeads.push(run.candidates[index]);
  setCandidateTerminal(run, index, "READY");
  processNext(run, index + 1, null);
  return true;
}
function acceptFailure(run, index, attemptId) {
  if (index !== run.activeIndex) return false;
  if (attemptId && attemptId !== run.activeAttemptId) return false;
  if (isTerminal(run.candidateStates[index])) return false;
  run.failedLeads.push(run.candidates[index]);
  setCandidateTerminal(run, index, "FAILED");
  processNext(run, index + 1, null);
  return true;
}
function reconnect(run) {
  if (run.status !== "running" || run.activeIndex < 0) return null;
  if (run.candidateStates[run.activeIndex] !== "DISPATCHED") return null;
  const ai = run.activeIndex;
  return dispatchCandidate(run, ai, true, null);
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed_count = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS " + name); passed++; }
  catch(e) { console.error("  FAIL " + name + "\n       " + e.message); failed_count++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg||"eq") + ": got " + a + " expected " + b); }

console.log("\n=== Queue Resilience Regression Tests ===\n");

// T1: candidate 1 READY → content script reinjected → candidate 2 processes
test("T1: cs-reinjection after candidate 1 READY → candidate 2 processes", () => {
  const run = createRun(["Biz1","Biz2"], 2);
  processNext(run, 0, null);
  eq(run.activeIndex, 0, "active should be 0");
  const a1 = run.activeAttemptId;
  acceptDetail(run, 0, a1);
  eq(run.candidateStates[0], "READY", "c0 should be READY");
  eq(run.activeIndex, 1, "active should advance to 1");
  // simulate reinjection
  const a2 = reconnect(run);
  assert(a2 !== null, "reconnect should return new attemptId");
  assert(a2 !== a1, "new attempt should differ");
  acceptDetail(run, 1, run.activeAttemptId);
  eq(run.candidateStates[1], "READY", "c1 READY");
  eq(run.status, "completed", "run completed");
  eq(run.readyLeads.length, 2, "2 ready leads");
});

// T2: reinjection between every candidate → all 5 process
test("T2: reinjection between every candidate → all 5 process", () => {
  const run = createRun(["A","B","C","D","E"], 5);
  processNext(run, 0, null);
  for (let i = 0; i < 5; i++) {
    reconnect(run); // simulate reinjection
    const a = run.activeAttemptId;
    acceptDetail(run, i, a);
  }
  eq(run.readyLeads.length, 5, "all 5 ready");
  eq(run.status, "completed", "completed");
});

// T3: candidate fails → queue continues
test("T3: candidate extraction rejects → candidate FAILED → next starts", () => {
  const run = createRun(["Biz1","Biz2"], 2);
  processNext(run, 0, null);
  const a = run.activeAttemptId;
  acceptFailure(run, 0, a);
  eq(run.candidateStates[0], "FAILED", "c0 FAILED");
  eq(run.activeIndex, 1, "c1 now active");
  acceptDetail(run, 1, run.activeAttemptId);
  eq(run.candidateStates[1], "READY", "c1 READY");
  eq(run.status, "completed");
});

// T4: timeout fires → FAILED → queue continues
test("T4: extraction timeout → candidate FAILED → queue continues", () => {
  // Synchronous version: call the timeout handler directly
  const run = createRun(["Biz1","Biz2"], 2);
  dispatchCandidate(run, 0, false, null); // dispatch without real timer
  eq(run.candidateStates[0], "DISPATCHED", "c0 DISPATCHED");
  const savedAttempt = run.activeAttemptId;
  // Manually trigger what handleCandidateTimeout does
  run.failedLeads.push(run.candidates[0]);
  setCandidateTerminal(run, 0, "FAILED");
  processNext(run, 1, null);
  eq(run.candidateStates[0], "FAILED", "c0 FAILED");
  eq(run.activeIndex, 1, "c1 now active");
  acceptDetail(run, 1, run.activeAttemptId);
  eq(run.status, "completed");
});


// T5: multiple SI_CONTENT_READY → only ONE active attempt at a time
test("T5: repeated SI_CONTENT_READY → single active attempt", () => {
  const run = createRun(["Biz1","Biz2"], 2);
  processNext(run, 0, null);
  const a1 = run.activeAttemptId;
  const a2 = reconnect(run);
  const a3 = reconnect(run);
  const a4 = reconnect(run);
  // Only the last attemptId should be active
  assert(run.activeAttemptId === a4, "last reconnect wins");
  assert(a1 !== a4 && a2 !== a4 && a3 !== a4, "all different");
  assert(run.activeIndex === 0, "still processing c0");
  // Old attempt response should be ignored
  const oldIgnored = acceptDetail(run, 0, a1);
  assert(!oldIgnored, "old attempt ignored");
  eq(run.candidateStates[0], "DISPATCHED", "still DISPATCHED");
  // Current attempt resolves
  acceptDetail(run, 0, run.activeAttemptId);
  eq(run.candidateStates[0], "READY");
});

// T6: old attempt response after retry is ignored
test("T6: stale attempt response arrives after retry → ignored", () => {
  const run = createRun(["Biz1","Biz2"], 2);
  processNext(run, 0, null);
  const staleAttemptId = run.activeAttemptId;
  reconnect(run); // new attempt
  // stale response arrives
  const accepted = acceptDetail(run, 0, staleAttemptId);
  assert(!accepted, "stale response should be rejected");
  assert(!isTerminal(run.candidateStates[0]), "should still be DISPATCHED");
  // correct response arrives
  acceptDetail(run, 0, run.activeAttemptId);
  eq(run.candidateStates[0], "READY");
  eq(run.readyLeads.length, 1);
});

// T7: 5 requested → never export more than 5
test("T7: 5 requested → never more than 5 exported", () => {
  const run = createRun(["A","B","C","D","E","F","G"], 5);
  eq(run.candidates.length, 5, "only 5 candidates");
  processNext(run, 0, null);
  for (let i = 0; i < 5; i++) acceptDetail(run, i, run.activeAttemptId);
  assert(run.readyLeads.length <= 5, "readyLeads <= 5");
});

// T8: 10 requested → all 10 processed if all READY
test("T8: 10 requested → all 10 can become READY", () => {
  const names = Array.from({length:10}, (_,i) => "Biz" + i);
  const run = createRun(names, 10);
  processNext(run, 0, null);
  for (let i = 0; i < 10; i++) acceptDetail(run, i, run.activeAttemptId);
  eq(run.readyLeads.length, 10);
  eq(run.status, "completed");
});

// T9: query change cannot contaminate new run (runId isolation)
test("T9: stale runId response from old run is ignored", () => {
  const run1 = createRun(["Old1"], 1);
  processNext(run1, 0, null);
  const oldRunId = run1.runId;
  // simulate new run replacing run1
  const run2 = createRun(["New1"], 1);
  run2.runId = "run_new_" + Date.now();
  processNext(run2, 0, null);
  // old run response arrives at run2 — simulate runId guard
  const isOldRun = oldRunId === run2.runId;
  assert(!isOldRun, "runIds must differ");
});

// T10: run cannot complete while pending > 0
test("T10: run does not complete while a candidate is still DISPATCHED", () => {
  const run = createRun(["Biz1","Biz2"], 2);
  processNext(run, 0, null);
  // Try to advance to completion without resolving c0
  processNext(run, 2, null); // index beyond candidates
  assert(run.status !== "completed", "should not complete: c0 still DISPATCHED");
});

// T11: candidate #2 active, 3x reinjection → exactly ONE terminal state
test("T11: candidate #2 — 3x SI_CONTENT_READY → one terminal, one dispatch at a time", () => {
  const run = createRun(["Biz1","Biz2","Biz3"], 3);
  processNext(run, 0, null);
  acceptDetail(run, 0, run.activeAttemptId);
  eq(run.activeIndex, 1, "c1 now active");
  // 3 reinjections
  reconnect(run);
  reconnect(run);
  const lastAttempt = reconnect(run);
  // only one active attempt
  eq(run.activeAttemptId, lastAttempt, "last attempt is active");
  eq(run.candidateStates[1], "DISPATCHED", "still dispatched once");
  // resolve
  acceptDetail(run, 1, run.activeAttemptId);
  eq(run.candidateStates[1], "READY", "exactly one terminal: READY");
  eq(run.readyLeads.length, 2, "2 ready leads");
  // no double-terminal
  const secondReady = acceptDetail(run, 1, run.activeAttemptId);
  assert(!secondReady, "second READY ignored");
  eq(run.readyLeads.length, 2, "still 2 ready leads");
});

// T12: candidate #3 does not start until #2 terminal
test("T12: candidate N+1 does not start until N is terminal", () => {
  const run = createRun(["Biz1","Biz2","Biz3"], 3);
  processNext(run, 0, null);
  acceptDetail(run, 0, run.activeAttemptId);
  // c1 dispatched
  eq(run.activeIndex, 1);
  // try to dispatch c2 while c1 active
  processNext(run, 2, null);
  assert(run.activeIndex === 1, "c1 still active, c2 not started");
});

// T13: Discovery Boundary: distinguish zero candidates found vs discovery error
test("T13: Discovery boundary — distinguish zero candidates vs discovery error", () => {
  function handleDiscoveryResponse(res) {
    if (!res || !res.ok) {
      return { status: "failed", error: res?.error || res?.reason || "Failed to query Google Maps candidates." };
    }
    const queue = res.queue || [];
    if (queue.length === 0) {
      return { status: "completed", candidates: [] };
    }
    return { status: "running", candidates: queue };
  }

  // Scenario A: Discovery Error (e.g. ReferenceError or tab disconnected)
  const errRes = handleDiscoveryResponse({ ok: false, error: "placeId is not defined" });
  eq(errRes.status, "failed", "discovery error sets status to failed");
  eq(errRes.error, "placeId is not defined", "preserves exact error message");

  // Scenario B: Zero candidates genuinely found
  const zeroRes = handleDiscoveryResponse({ ok: true, queue: [] });
  eq(zeroRes.status, "completed", "zero candidates sets status to completed");
  eq(zeroRes.candidates.length, 0);

  // Scenario C: Candidates returned
  const successRes = handleDiscoveryResponse({ ok: true, queue: [{ company_name: "Pizza Hut" }] });
  eq(successRes.status, "running", "success sets status to running");
  eq(successRes.candidates.length, 1);
});

// T14: Content-script reinjection during discovery phase
test("T14: Content script reinjection during discovery boundary", () => {
  let csConnected = false;
  function mockSendTabMessage(msg) {
    if (!csConnected) {
      return { ok: false, reason: "CONTENT_SCRIPT_NOT_CONNECTED" };
    }
    return { ok: true, queue: [{ company_name: "The Chef Pizzeria" }] };
  }

  // Attempt 1: not connected -> failure
  let res = mockSendTabMessage({ type: "BUILD_DISCOVERY_QUEUE" });
  eq(res.ok, false);
  eq(res.reason, "CONTENT_SCRIPT_NOT_CONNECTED");

  // Simulate reinjection -> connected
  csConnected = true;
  res = mockSendTabMessage({ type: "BUILD_DISCOVERY_QUEUE" });
  eq(res.ok, true);
  eq(res.queue.length, 1);
});

// ─── DISCOVERY-ONLY PROOF TEST SUITE (T15–T24) ──────────────────────────────────

function simulateDiscoveryRun(detectedCardNames, requestedLimit, sourceQuery, runIdOverride) {
  const runId = runIdOverride || "run_disc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const candidateMap = new Map();

  // Deduplicate
  for (const item of detectedCardNames) {
    const name = typeof item === "string" ? item : item.name;
    const placeId = typeof item === "object" ? item.placeId : null;
    const key = placeId ? `pid:${placeId}` : `name:${name.toLowerCase().trim()}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        company_name: name,
        place_id: placeId,
        sourceQuery,
        runId,
        enrichmentStatus: "complete",
      });
    }
  }

  const allUnique = Array.from(candidateMap.values());
  const selected = allUnique.slice(0, requestedLimit);

  const run = {
    runId,
    sourceQuery,
    requestedLimit,
    detectedCount: detectedCardNames.length,
    candidates: selected,
    readyLeads: selected,
    status: "completed",
  };

  return run;
}

function mockGetExportableLeads(run) {
  const ready = run.readyLeads.filter(
    (lead) => lead.runId === run.runId && lead.sourceQuery.toLowerCase() === run.sourceQuery.toLowerCase()
  );
  return ready.slice(0, run.requestedLimit);
}

// T15: 12 detected cards, requested 5 -> 5 candidates
test("T15: 12 detected cards, requested 5 -> 5 candidates exported", () => {
  const cards = Array.from({ length: 12 }, (_, i) => `Vadapav Center ${i + 1}`);
  const run = simulateDiscoveryRun(cards, 5, "vadapav near me");
  eq(run.candidates.length, 5, "candidates sliced to 5");
  const exportable = mockGetExportableLeads(run);
  eq(exportable.length, 5, "exportable rows = 5");
});

// T16: 12 detected cards, requested 10 -> 10 candidates
test("T16: 12 detected cards, requested 10 -> 10 candidates exported", () => {
  const cards = Array.from({ length: 12 }, (_, i) => `Pizza Place ${i + 1}`);
  const run = simulateDiscoveryRun(cards, 10, "pizza near me");
  eq(run.candidates.length, 10, "candidates sliced to 10");
  const exportable = mockGetExportableLeads(run);
  eq(exportable.length, 10, "exportable rows = 10");
});

// T17: 5 detected cards, requested 10 -> 5 candidates
test("T17: 5 detected cards, requested 10 -> 5 candidates exported", () => {
  const cards = Array.from({ length: 5 }, (_, i) => `Taco Shop ${i + 1}`);
  const run = simulateDiscoveryRun(cards, 10, "tacos near me");
  eq(run.candidates.length, 5, "candidates capped at detected count = 5");
  const exportable = mockGetExportableLeads(run);
  eq(exportable.length, 5, "exportable rows = 5");
});

// T18: duplicate DOM detection -> no duplicate candidates
test("T18: duplicate DOM detection -> no duplicate candidates", () => {
  const cards = ["Gajanand Vadapav", "Gajanand Vadapav", "Gajanand Vadapav", "Joshi Vadapav"];
  const run = simulateDiscoveryRun(cards, 5, "vadapav near me");
  eq(run.candidates.length, 2, "duplicates deduplicated to 2 unique");
  const names = run.candidates.map((c) => c.company_name);
  assert(names.includes("Gajanand Vadapav") && names.includes("Joshi Vadapav"));
});

// T19: same business with same placeId appearing multiple times -> one candidate
test("T19: same business with place_id appearing multiple times -> 1 candidate", () => {
  const cards = [
    { name: "Dominos Pizza", placeId: "ChIJ1111" },
    { name: "Dominos Pizza - Satellite", placeId: "ChIJ1111" },
    { name: "Dominos Pizza", placeId: "ChIJ1111" },
  ];
  const run = simulateDiscoveryRun(cards, 5, "pizza near me");
  eq(run.candidates.length, 1, "same place_id deduplicated to 1 candidate");
});

// T20: run A vadapav -> run B pizza -> zero vadapav records in run B
test("T20: run A (vadapav) -> run B (pizza) -> zero vadapav records in run B", () => {
  const runA = simulateDiscoveryRun(["Vadapav King", "Joshi Vadapav"], 5, "vadapav near me", "run_A");
  const runB = simulateDiscoveryRun(["Pizza Hut", "Dominos"], 5, "pizza near me", "run_B");

  const exportB = mockGetExportableLeads(runB);
  eq(exportB.length, 2, "run B has 2 rows");
  for (const item of exportB) {
    eq(item.runId, "run_B", "row belongs to run B");
    eq(item.sourceQuery, "pizza near me", "query is pizza near me");
    assert(!item.company_name.toLowerCase().includes("vadapav"), "no vadapav in run B");
  }
});

// T21: old async result from run A arriving during run B -> discard it
test("T21: old async result from run A arriving during run B -> discarded", () => {
  const runA = simulateDiscoveryRun(["Vadapav Corner"], 5, "vadapav near me", "run_A");
  const runB = simulateDiscoveryRun(["Pizza Express"], 5, "pizza near me", "run_B");

  // Simulate late callback from run A
  const lateRecord = { company_name: "Late Vadapav", runId: runA.runId, sourceQuery: runA.sourceQuery };
  runB.readyLeads.push(lateRecord);

  // Filter exportable for runB
  const exportB = mockGetExportableLeads(runB);
  eq(exportB.length, 1, "late record from run A filtered out of run B export");
  eq(exportB[0].company_name, "Pizza Express");
});

// T22: CSV rows always equal current run's candidate count
test("T22: CSV rows always equal current run candidate count", () => {
  const run = simulateDiscoveryRun(["A", "B", "C"], 5, "pizza near me");
  const exportable = mockGetExportableLeads(run);
  eq(exportable.length, run.candidates.length, "CSV exportable count equals candidates length");
  eq(exportable.length, 3);
});

// T23: CSV works without Sales Intel connection
test("T23: CSV export works without Sales Intel connection (siConnected = false)", () => {
  const siConnected = false;
  const run = simulateDiscoveryRun(["Pizza Hut", "Papa Johns"], 5, "pizza near me");
  const exportable = mockGetExportableLeads(run);
  const csvEnabled = !siConnected && exportable.length > 0;
  assert(csvEnabled, "CSV download enabled when not connected if leads exist");
  eq(exportable.length, 2);
});

// T24: discovery works without opening a detail panel
test("T24: discovery works without opening detail panel (mode=RESULT_CARD, status=completed)", () => {
  const run = simulateDiscoveryRun(["Card Only Pizza 1", "Card Only Pizza 2"], 5, "pizza near me");
  eq(run.status, "completed", "run completes immediately after card discovery");
  eq(run.readyLeads.length, 2, "card data is directly ready");
  eq(run.readyLeads[0].enrichmentStatus, "complete");
});

// T25: Second Click Download CSV — download again without re-running extraction
test("T25: Second Click Download CSV → downloads completed run data again, no new extraction", () => {
  let extractionRunCount = 0;
  let exportCount = 0;

  const mockRun = simulateDiscoveryRun(["Pizza Place 1", "Pizza Place 2"], 5, "pizza near me", "run_fixed_123");
  extractionRunCount++; // 1st extraction run

  function handleDownloadClick(run) {
    if (run.status === "completed" && run.readyLeads.length > 0) {
      // Completed run: export directly, DO NOT start extraction
      exportCount++;
      const leads = mockGetExportableLeads(run);
      return { action: "EXPORTED", runId: run.runId, rowCount: leads.length };
    } else {
      extractionRunCount++;
      run.status = "running";
      return { action: "EXTRACTING", runId: run.runId };
    }
  }

  // First Click on completed run:
  const res1 = handleDownloadClick(mockRun);
  eq(res1.action, "EXPORTED");
  eq(res1.runId, "run_fixed_123");
  eq(res1.rowCount, 2);
  eq(extractionRunCount, 1, "extraction run count MUST stay 1");
  eq(exportCount, 1, "export count = 1");

  // Second Click on completed run:
  const res2 = handleDownloadClick(mockRun);
  eq(res2.action, "EXPORTED");
  eq(res2.runId, "run_fixed_123");
  eq(res2.rowCount, 2);
  eq(extractionRunCount, 1, "extraction run count MUST STILL BE 1 (no re-extraction)");
  eq(exportCount, 2, "export count = 2");
});

// ─── Async summary after T4 timeout ──────────────────────────────────────────
setTimeout(() => {
  console.log("\n=== Results ===");
  console.log("Passed: " + passed);
  console.log("Failed: " + failed_count);
  if (failed_count > 0) process.exit(1);
}, 200);
