import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/shared/deduplicator.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/people-extractor.js");
await import("../../extension/content/website/lead-scorer.js");
await import("../../extension/content/website/enricher.js");

const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;
const Deduplicator = (globalThis as any).RamosDeduplicator;
const PeopleExtractor = (globalThis as any).RamosPeopleExtractor;
const LeadScorer = (globalThis as any).RamosLeadScorer;
const Enricher = (globalThis as any).RamosWebsiteEnricher;

function escapeCsvCell(val: any): string {
  if (val == null) return "";
  const str = String(val).trim();
  if (!str.length) return "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function websiteLeadToCsvRow(l: any): string {
  const social = l.social || {};
  const extraEmails = Array.isArray(l.additional_emails) && l.additional_emails.length > 0
    ? l.additional_emails.join("; ")
    : (Array.isArray(l.emails) && l.emails.length > 1
      ? l.emails.slice(1).map((e: any) => e.email || e).join("; ")
      : "");
  const extraPhones = Array.isArray(l.additional_phones) && l.additional_phones.length > 0
    ? l.additional_phones.join("; ")
    : (Array.isArray(l.phones) && l.phones.length > 1
      ? l.phones.slice(1).map((p: any) => p.phone || p).join("; ")
      : "");
  const peopleCount = l.people_count != null
    ? l.people_count
    : (Array.isArray(l.people) ? l.people.length : 0);

  return [
    escapeCsvCell(l.company_name || l.website || "—"),
    escapeCsvCell(l.lead_score != null ? l.lead_score : ""),
    escapeCsvCell(l.quality_tier || ""),
    escapeCsvCell(l.website),
    escapeCsvCell(l.email),
    escapeCsvCell(l.email_role || l.emailRole || ""),
    escapeCsvCell(extraEmails),
    escapeCsvCell(l.email_status),
    escapeCsvCell(l.phone),
    escapeCsvCell(extraPhones),
    escapeCsvCell(l.decision_maker_name || ""),
    escapeCsvCell(l.decision_maker_title || ""),
    escapeCsvCell(l.decision_maker_email || ""),
    escapeCsvCell(l.decision_maker_linkedin || ""),
    escapeCsvCell(peopleCount),
    escapeCsvCell(l.address),
    escapeCsvCell(l.city),
    escapeCsvCell(l.region || l.state),
    escapeCsvCell(l.country),
    escapeCsvCell(l.postal_code),
    escapeCsvCell(l.category),
    escapeCsvCell(l.business_type || ""),
    escapeCsvCell(social.linkedin || ""),
    escapeCsvCell(social.twitter_x || ""),
    escapeCsvCell(social.facebook || ""),
    escapeCsvCell(social.instagram || ""),
    escapeCsvCell(social.youtube || ""),
    escapeCsvCell(social.github || ""),
    escapeCsvCell(l.booking_url),
    escapeCsvCell(l.ordering_url),
    escapeCsvCell(l.menu_url),
    escapeCsvCell(l.source_url),
    escapeCsvCell(l.imported_at || new Date().toISOString()),
    escapeCsvCell(l.sourceQuery)
  ].join(",");
}

function parseCsvRow(row: string): string[] {
  const cols: string[] = [];
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

// ─── SUITE 1: DATA LIFECYCLE PARITY (Expected → Extracted → Exported) ─────────
test("PHASE 9 RC [1]: End-to-End Data Quality: Multi-value data survives into XLSX & CSV", () => {
  const peopleList = [
    { name: "Elena Vance", title: "Chief Executive Officer & Founder", email: "elena@vanguard.io", linkedin_url: "https://linkedin.com/in/elenavance" },
    { name: "David Chen", title: "VP of Engineering", email: "david@vanguard.io", linkedin_url: "https://linkedin.com/in/davidchen" },
    { name: "Rachel Adams", title: "Director of Product", email: "rachel@vanguard.io", linkedin_url: null },
    { name: "Tom Hardy", title: "Account Executive", email: "tom@vanguard.io", linkedin_url: null },
    { name: "Sam Blogsmith", title: "Staff Writer / Content", email: "sam@vanguard.io", linkedin_url: null },
  ];

  const rankedPeople = PeopleExtractor.rankPeopleBySeniority(peopleList);
  const primaryDm = PeopleExtractor.selectPrimaryDecisionMaker(rankedPeople);

  const rawLead = {
    company_name: "Vanguard Technology Partners",
    website: "https://vanguard.io",
    email: "sales@vanguard.io",
    email_role: "sales",
    additional_emails: ["partnerships@vanguard.io", "support@vanguard.io"],
    email_status: "verified",
    phone: "+1 800-555-0199",
    additional_phones: ["+1 415-555-0188"],
    people: rankedPeople,
    people_count: rankedPeople.length,
    decision_maker_name: primaryDm?.name || null,
    decision_maker_title: primaryDm?.title || null,
    decision_maker_email: primaryDm?.email || null,
    decision_maker_linkedin: primaryDm?.linkedin_url || null,
    address: "500 Howard Street, Suite 400",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    postal_code: "94105",
    category: "Software",
    social: {
      linkedin: "https://linkedin.com/company/vanguard-tech",
      twitter_x: "https://x.com/vanguardtech",
      facebook: "https://facebook.com/vanguardtech",
      instagram: "https://instagram.com/vanguardtech",
      youtube: "https://youtube.com/@vanguardtech",
      github: "https://github.com/vanguardtech",
    },
  };

  // Compute lead score
  const scoreResult = LeadScorer.computeLeadScore(rawLead);
  rawLead.lead_score = scoreResult.score;
  rawLead.quality_tier = scoreResult.tier;

  // In-Memory Assertions
  assert.equal(rawLead.decision_maker_name, "Elena Vance", "Top executive must be Elena Vance");
  assert.equal(rawLead.decision_maker_title, "Chief Executive Officer & Founder");
  assert.equal(rawLead.lead_score >= 85, true, "Comprehensive lead must score HIGH");
  assert.equal(rawLead.quality_tier, "HIGH");
  assert.equal(rawLead.people_count, 5);
  assert.equal(rawLead.additional_emails.length, 2);
  assert.equal(rawLead.additional_phones.length, 1);

  // 1. Export to XLSX
  const xlsxBytes = XlsxBuilder.buildWebsiteXlsx([rawLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  const xlsxText = new TextDecoder("utf-8", { fatal: false }).decode(xlsxBytes);

  // Verify Sheet 1 (Leads) contains exact data
  assert.ok(xlsxText.includes("Vanguard Technology Partners"));
  assert.ok(xlsxText.includes("sales@vanguard.io"));
  assert.ok(xlsxText.includes("partnerships@vanguard.io; support@vanguard.io"));
  assert.ok(xlsxText.includes("+1 415-555-0188"));
  assert.ok(xlsxText.includes("Elena Vance"));
  assert.ok(xlsxText.includes("https://linkedin.com/company/vanguard-tech"));
  assert.ok(xlsxText.includes("https://github.com/vanguardtech"));

  // Verify Sheet 2 (People) contains all 5 people
  assert.ok(xlsxText.includes("People"));
  assert.ok(xlsxText.includes("David Chen"));
  assert.ok(xlsxText.includes("Rachel Adams"));
  assert.ok(xlsxText.includes("Tom Hardy"));
  assert.ok(xlsxText.includes("Sam Blogsmith"));

  // 2. Export to CSV
  const csvRow = websiteLeadToCsvRow(rawLead);
  const cells = parseCsvRow(csvRow);
  assert.equal(cells.length, 34, "CSV must have exactly 34 columns");
  assert.equal(cells[0], "Vanguard Technology Partners");
  assert.equal(cells[1], String(rawLead.lead_score));
  assert.equal(cells[2], "HIGH");
  assert.equal(cells[3], "https://vanguard.io");
  assert.equal(cells[4], "sales@vanguard.io");
  assert.equal(cells[5], "sales");
  assert.ok(cells[6].includes("partnerships@vanguard.io; support@vanguard.io"));
  assert.equal(cells[8], "+1 800-555-0199");
  assert.equal(cells[9], "+1 415-555-0188");
  assert.equal(cells[10], "Elena Vance");
  assert.equal(cells[14], "5");
});

// ─── SUITE 2: FALSE POSITIVE & HYGIENE DEFENSES ─────────────────────────────
test("PHASE 9 RC [2]: False Positive Audit: Employee email and personal LinkedIn never overwrite company channels", () => {
  const mapsLead = {
    company_name: "Apex Engineering",
    phone: "+1 555-111-2222",
    website: "https://apexengineering.com",
    address: "100 Industrial Way",
    email: null,
  };

  const webLead = {
    company_name: "Apex Engineering LLC",
    phone: "+1 555-999-8888", // Conflict: Maps phone must win
    website: "https://apexengineering.com",
    email: "info@apexengineering.com", // Corporate email
    social: {
      linkedin: "https://linkedin.com/company/apex-engineering",
    },
    people: [
      {
        name: "John Smith",
        title: "Engineer",
        email: "john.smith@apexengineering.com", // Employee email
        phone: "+1 555-333-4444", // Employee direct phone
        linkedin_url: "https://linkedin.com/in/johnsmith", // Personal LinkedIn
      }
    ]
  };

  const merged = Enricher.mergeMapsAndWebsiteLead(mapsLead, webLead);

  // Authority check: Maps phone must beat website phone
  assert.equal(merged.phone, "+1 555-111-2222", "Maps authority phone must be preserved");

  // Corporate email check: Company email is info@, NOT john.smith@
  assert.equal(merged.email, "info@apexengineering.com");
  assert.notEqual(merged.email, "john.smith@apexengineering.com");

  // Social check: Company LinkedIn must be corporate company page, NOT personal profile
  assert.equal(merged.social.linkedin, "https://linkedin.com/company/apex-engineering");
  assert.notEqual(merged.social.linkedin, "https://linkedin.com/in/johnsmith");

  // Employee details must remain isolated in people[0]
  assert.equal(merged.people.length, 1);
  assert.equal(merged.people[0].email, "john.smith@apexengineering.com");
  assert.equal(merged.people[0].linkedin_url, "https://linkedin.com/in/johnsmith");
});

test("PHASE 9 RC [3]: False Positive Audit: Blog authors and non-executives cannot hijack decision maker rank", () => {
  const people = [
    { name: "Blog Author Sam", title: "Content Contributor", email: "sam@firm.com" },
    { name: "Junior Intern", title: "Marketing Intern", email: "intern@firm.com" },
    { name: "Sarah Connor", title: "Managing Partner", email: "sarah@firm.com" },
  ];

  const ranked = PeopleExtractor.rankPeopleBySeniority(people);
  assert.equal(ranked[0].name, "Sarah Connor", "Managing Partner must rank #1 above author and intern");
  assert.ok(ranked[0].seniorityScore >= 0.80);
  assert.ok(ranked[2].seniorityScore <= 0.50);
});

test("PHASE 9 RC [4]: False Positive Audit: Distinct businesses or chain branches are never merged", () => {
  // Case A: Same business name in different cities with different websites and phones
  const bizNY = {
    name: "Horizon Dental",
    place_id: "ChIJ_NY_HORIZON",
    phone: "+1 212-555-1111",
    website: "https://horizondentalny.com",
    address: "100 Broadway, New York, NY",
  };
  const bizLA = {
    name: "Horizon Dental",
    place_id: "ChIJ_LA_HORIZON",
    phone: "+1 310-555-9999",
    website: "https://horizondentalla.com",
    address: "500 Wilshire Blvd, Los Angeles, CA",
  };
  assert.equal(Deduplicator.areDuplicates(bizNY, bizLA).isDuplicate, false, "Distinct regional businesses must NOT merge");

  // Case B: Same corporate domain but different branches with distinct place_id and phone
  const branchDowntown = {
    name: "Target",
    place_id: "ChIJ_TARGET_DOWNTOWN",
    phone: "+1 555-100-0001",
    website: "https://www.target.com",
  };
  const branchSuburbs = {
    name: "Target",
    place_id: "ChIJ_TARGET_SUBURBS",
    phone: "+1 555-200-0002",
    website: "https://www.target.com",
  };
  assert.equal(Deduplicator.areDuplicates(branchDowntown, branchSuburbs).isDuplicate, false, "Distinct store branches must NOT merge");
});

test("PHASE 9 RC [5]: Zero Hallucination Audit: Missing fields remain null or empty, never fabricated", () => {
  const sparseLead = {
    name: "Quiet Corner Cafe",
    phone: "+1 555-000-0000",
    website: null,
    email: null,
    address: null,
  };

  const score = LeadScorer.computeLeadScore(sparseLead);
  assert.ok(score.score < 30, "Sparse lead must receive low score without fake points");
  assert.equal(score.tier, "LOW");

  const row = websiteLeadToCsvRow(sparseLead);
  const cells = row.split(",");
  assert.equal(cells[3], "", "Website must be empty string");
  assert.equal(cells[4], "", "Email must be empty string");
  assert.equal(cells[10], "", "Decision maker name must be empty string");
  assert.equal(cells[14], "0", "People count must be 0");
});
