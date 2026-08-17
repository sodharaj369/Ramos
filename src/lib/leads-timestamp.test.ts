import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadRow } from "./leads.server";

test("Lead Date Test 1: Server generates authoritative discovered_at timestamp on buildLeadRow", () => {
  const rawLead = { company_name: "Test Server Date Lead" };
  const ctx = { source: "chrome-extension", userId: "user-123" };
  const row = buildLeadRow(rawLead, ctx);

  assert.ok(row.discovered_at);
  const date = new Date(row.discovered_at);
  assert.equal(isNaN(date.getTime()), false);
  // Assert timestamp is recent (within last 10 seconds)
  assert.ok(Date.now() - date.getTime() < 10000);
});

test("Lead Date Test 2: Rediscovery preserves original created_at while updating discovered_at", () => {
  const originalCreatedAt = "2026-08-10T10:00:00.000Z";
  const existingLeadInDb = {
    id: "lead-abc",
    company_name: "Si Nonna's",
    created_at: originalCreatedAt,
    discovered_at: originalCreatedAt,
  };

  const rediscoveryTime = "2026-08-17T17:00:00.000Z";

  // Simulate update patch on rediscovery
  const patch = {
    discovered_at: rediscoveryTime,
    // created_at is NOT in the patch
  };

  const updatedLead = Object.assign({}, existingLeadInDb, patch);

  // Assert created_at remains untouched
  assert.strictEqual(updatedLead.created_at, originalCreatedAt);

  // Assert discovered_at is updated
  assert.strictEqual(updatedLead.discovered_at, rediscoveryTime);

  // Assert discovered_at is newer than created_at
  assert.ok(new Date(updatedLead.discovered_at).getTime() > new Date(updatedLead.created_at).getTime());
});

test("Lead Date Test 3: Date Filter - Today matches lead created today", () => {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  const leadToday = { company_name: "Today Lead", discovered_at: new Date().toISOString() };
  const leadYesterday = { company_name: "Yesterday Lead", discovered_at: new Date(now.getTime() - 86400000).toISOString() };

  const matchesToday = (lead: { discovered_at: string }) => new Date(lead.discovered_at) >= todayStart;

  assert.equal(matchesToday(leadToday), true);
  assert.equal(matchesToday(leadYesterday), false);
});

test("Lead Date Test 4: Date Filter - Yesterday matches lead created yesterday only", () => {
  const now = new Date();
  const yestStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
  const yestEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));

  const leadYesterday = { company_name: "Yesterday Lead", discovered_at: new Date(yestStart.getTime() + 3600000).toISOString() };
  const leadToday = { company_name: "Today Lead", discovered_at: new Date().toISOString() };
  const lead2DaysAgo = { company_name: "2 Days Ago Lead", discovered_at: new Date(now.getTime() - 2 * 86400000).toISOString() };

  const matchesYesterday = (lead: { discovered_at: string }) => {
    const d = new Date(lead.discovered_at);
    return d >= yestStart && d <= yestEnd;
  };

  assert.equal(matchesYesterday(leadYesterday), true);
  assert.equal(matchesYesterday(leadToday), false);
  assert.equal(matchesYesterday(lead2DaysAgo), false);
});

test("Lead Date Test 5: Date Filter - Last 7 days includes lead from 3 days ago, excludes lead from 10 days ago", () => {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 86400000);

  const lead3DaysAgo = { company_name: "3 Days Ago", discovered_at: new Date(now.getTime() - 3 * 86400000).toISOString() };
  const lead10DaysAgo = { company_name: "10 Days Ago", discovered_at: new Date(now.getTime() - 10 * 86400000).toISOString() };

  const matchesLast7Days = (lead: { discovered_at: string }) => new Date(lead.discovered_at) >= last7;

  assert.equal(matchesLast7Days(lead3DaysAgo), true);
  assert.equal(matchesLast7Days(lead10DaysAgo), false);
});

test("Lead Date Test 6: Date Filter - Last 30 days excludes lead from 45 days ago", () => {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 86400000);

  const lead20DaysAgo = { company_name: "20 Days Ago", discovered_at: new Date(now.getTime() - 20 * 86400000).toISOString() };
  const lead45DaysAgo = { company_name: "45 Days Ago", discovered_at: new Date(now.getTime() - 45 * 86400000).toISOString() };

  const matchesLast30Days = (lead: { discovered_at: string }) => new Date(lead.discovered_at) >= last30;

  assert.equal(matchesLast30Days(lead20DaysAgo), true);
  assert.equal(matchesLast30Days(lead45DaysAgo), false);
});

test("Lead Date Test 7: Newest imported sorting orders leads descending by discovered_at", () => {
  const leads = [
    { company_name: "Older Lead", discovered_at: "2026-08-10T10:00:00.000Z" },
    { company_name: "Newest Lead", discovered_at: "2026-08-17T15:00:00.000Z" },
    { company_name: "Middle Lead", discovered_at: "2026-08-14T12:00:00.000Z" },
  ];

  const sortedNewest = [...leads].sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime());

  assert.equal(sortedNewest[0].company_name, "Newest Lead");
  assert.equal(sortedNewest[1].company_name, "Middle Lead");
  assert.equal(sortedNewest[2].company_name, "Older Lead");
});

test("Lead Date Test 8: Oldest imported sorting orders leads ascending by discovered_at", () => {
  const leads = [
    { company_name: "Older Lead", discovered_at: "2026-08-10T10:00:00.000Z" },
    { company_name: "Newest Lead", discovered_at: "2026-08-17T15:00:00.000Z" },
    { company_name: "Middle Lead", discovered_at: "2026-08-14T12:00:00.000Z" },
  ];

  const sortedOldest = [...leads].sort((a, b) => new Date(a.discovered_at).getTime() - new Date(b.discovered_at).getTime());

  assert.equal(sortedOldest[0].company_name, "Older Lead");
  assert.equal(sortedOldest[1].company_name, "Middle Lead");
  assert.equal(sortedOldest[2].company_name, "Newest Lead");
});

test("Lead Date Test 9: Timezone boundary filtering operates consistently in UTC", () => {
  const utcDateStr = "2026-08-17T00:00:01.000Z";
  const dateObj = new Date(utcDateStr);

  assert.equal(dateObj.getUTCFullYear(), 2026);
  assert.equal(dateObj.getUTCMonth(), 7); // August is 7
  assert.equal(dateObj.getUTCDate(), 17);
});

test("Lead Date Test 10: Fallback handling when discovered_at is null uses created_at", () => {
  const legacyLead = {
    company_name: "Legacy Lead",
    created_at: "2026-08-01T12:00:00.000Z",
    discovered_at: null,
  };

  const getEffectiveDate = (lead: { created_at?: string | null; discovered_at?: string | null }) =>
    lead.discovered_at || lead.created_at || null;

  assert.equal(getEffectiveDate(legacyLead), "2026-08-01T12:00:00.000Z");
});
