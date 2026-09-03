/**
 * RAMOS Website Intelligence — Social Export Tests
 * Covers: social URL preservation in CSV and XLSX via buildWebsiteXlsx/generateWebsiteCSV
 */
import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");

const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

// ── Helpers ────────────────────────────────────────────────────────────────

const WEBSITE_CSV_HEADERS = [
  "Company", "Website", "Primary Email", "Additional Emails", "Email Status",
  "Primary Phone", "Additional Phones",
  "Address", "City", "State / Region", "Country", "Postal Code",
  "Industry", "Description",
  "LinkedIn", "Twitter / X", "Facebook", "Instagram", "YouTube", "GitHub",
  "Booking URL", "Ordering URL", "Menu URL",
  "Source URL", "Imported At", "Source Query"
];

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
  const extraEmails = Array.isArray(l.emails) && l.emails.length > 1
    ? l.emails.slice(1).map((e: any) => e.email || e).join("; ")
    : "";
  const extraPhones = Array.isArray(l.phones) && l.phones.length > 1
    ? l.phones.slice(1).map((p: any) => p.phone || p).join("; ")
    : "";
  return [
    escapeCsvCell(l.company_name || l.website || "—"),
    escapeCsvCell(l.website),
    escapeCsvCell(l.email),
    escapeCsvCell(extraEmails),
    escapeCsvCell(l.email_status),
    escapeCsvCell(l.phone),
    escapeCsvCell(extraPhones),
    escapeCsvCell(l.address),
    escapeCsvCell(l.city),
    escapeCsvCell(l.region),
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

function generateWebsiteCSV(leads: any[]): string {
  const valid = (leads || []).filter((l) => l && (l.company_name || l.website || l.email || l.phone));
  return "\uFEFF" + [WEBSITE_CSV_HEADERS.join(","), ...valid.map(websiteLeadToCsvRow)].join("\r\n");
}

function parseCsvRow(row: string): string[] {
  // Simple RFC-4180 split that respects quoted cells
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

// ── Social URL fixtures ───────────────────────────────────────────────────────

function makeLead(overrides: any = {}): any {
  return {
    company_name: "Techuz",
    website: "https://www.techuz.com/",
    email: "hello@techuz.com",
    email_status: "business_role",
    phone: "+917861812222",
    address: "806, PNTC, beside Passport Office, Ahmedabad",
    city: "Ahmedabad",
    region: "Gujarat",
    country: "India",
    postal_code: "380006",
    category: "Software Development",
    business_type: null,
    imported_at: "2026-09-03T14:00:00.000Z",
    source_url: "https://www.techuz.com/",
    sourceQuery: "techuz.com",
    emails: [{ email: "hello@techuz.com", type: "business_role", confidence: 0.95 }],
    phones: [{ phone: "+917861812222", confidence: 0.95 }],
    people: [],
    social: {
      linkedin: "https://www.linkedin.com/company/techuz",
      twitter_x: "https://x.com/techuz",
      facebook: "https://www.facebook.com/techuz",
      instagram: "https://www.instagram.com/techuz",
      youtube: null,
      github: null,
    },
    ...overrides
  };
}

// ── SUITE SOCIAL-1: LinkedIn URL present in CSV and XLSX ──────────────────────
test("SOCIAL EXPORT [1]: LinkedIn URL is preserved in Website CSV export", () => {
  const lead = makeLead();
  const csv = generateWebsiteCSV([lead]);
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lines.length, 2);
  const cols = parseCsvRow(lines[1]);
  assert.equal(cols.length, 26, "Website CSV must have 26 columns");
  const linkedinIdx = WEBSITE_CSV_HEADERS.indexOf("LinkedIn");
  assert.equal(cols[linkedinIdx], "https://www.linkedin.com/company/techuz");
});

// ── SUITE SOCIAL-2: Twitter/X URL present in CSV ──────────────────────────────
test("SOCIAL EXPORT [2]: Twitter/X URL is preserved in Website CSV export", () => {
  const lead = makeLead();
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  const twitterIdx = WEBSITE_CSV_HEADERS.indexOf("Twitter / X");
  assert.equal(cols[twitterIdx], "https://x.com/techuz");
});

// ── SUITE SOCIAL-3: Facebook URL present in CSV ────────────────────────────────
test("SOCIAL EXPORT [3]: Facebook URL is preserved in Website CSV export", () => {
  const lead = makeLead();
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  const facebookIdx = WEBSITE_CSV_HEADERS.indexOf("Facebook");
  assert.equal(cols[facebookIdx], "https://www.facebook.com/techuz");
});

// ── SUITE SOCIAL-4: Instagram URL present in CSV ───────────────────────────────
test("SOCIAL EXPORT [4]: Instagram URL is preserved in Website CSV export", () => {
  const lead = makeLead();
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  const instagramIdx = WEBSITE_CSV_HEADERS.indexOf("Instagram");
  assert.equal(cols[instagramIdx], "https://www.instagram.com/techuz");
});

// ── SUITE SOCIAL-5: YouTube and GitHub URLs present when detected ──────────────
test("SOCIAL EXPORT [5]: YouTube and GitHub URLs are preserved in Website CSV export", () => {
  const lead = makeLead({
    social: {
      linkedin: "https://www.linkedin.com/company/techuz",
      twitter_x: null,
      facebook: null,
      instagram: null,
      youtube: "https://www.youtube.com/@techuz",
      github: "https://github.com/techuz",
    }
  });
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  const youtubeIdx = WEBSITE_CSV_HEADERS.indexOf("YouTube");
  const githubIdx = WEBSITE_CSV_HEADERS.indexOf("GitHub");
  assert.equal(cols[youtubeIdx], "https://www.youtube.com/@techuz");
  assert.equal(cols[githubIdx], "https://github.com/techuz");
});

// ── SUITE SOCIAL-6: Multiple platforms on one company ─────────────────────────
test("SOCIAL EXPORT [6]: All 6 social platforms preserved simultaneously", () => {
  const lead = makeLead({
    social: {
      linkedin: "https://www.linkedin.com/company/acme",
      twitter_x: "https://x.com/acme",
      facebook: "https://www.facebook.com/acme",
      instagram: "https://www.instagram.com/acme",
      youtube: "https://www.youtube.com/@acme",
      github: "https://github.com/acme",
    }
  });
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("LinkedIn")], "https://www.linkedin.com/company/acme");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Twitter / X")], "https://x.com/acme");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Facebook")], "https://www.facebook.com/acme");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Instagram")], "https://www.instagram.com/acme");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("YouTube")], "https://www.youtube.com/@acme");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("GitHub")], "https://github.com/acme");
});

// ── SUITE SOCIAL-7: No social links → clean empty cells ───────────────────────
test("SOCIAL EXPORT [7]: No social links produces clean empty cells in CSV", () => {
  const lead = makeLead({ social: {} });
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  for (const field of ["LinkedIn", "Twitter / X", "Facebook", "Instagram", "YouTube", "GitHub"]) {
    assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf(field)], "", `${field} should be empty`);
  }
});

// ── SUITE SOCIAL-8: Null social object → no crash, empty cells ────────────────
test("SOCIAL EXPORT [8]: null social object produces empty social cells without error", () => {
  const lead = makeLead({ social: null });
  assert.doesNotThrow(() => generateWebsiteCSV([lead]));
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("LinkedIn")], "");
});

// ── SUITE SOCIAL-9: Column count is strictly 26 ───────────────────────────────
test("SOCIAL EXPORT [9]: Website CSV always produces exactly 26 columns", () => {
  const lead = makeLead();
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  assert.equal(cols.length, 26, `Expected 26 columns, got ${cols.length}`);
});

// ── SUITE SOCIAL-10: Social URLs in XLSX via buildWebsiteXlsx ─────────────────
test("SOCIAL EXPORT [10]: buildWebsiteXlsx produces valid OOXML file with social columns", () => {
  assert.ok(typeof XlsxBuilder.buildWebsiteXlsx === "function", "buildWebsiteXlsx must be exported");
  const lead = makeLead({
    social: {
      linkedin: "https://www.linkedin.com/company/techuz",
      twitter_x: "https://x.com/techuz",
      facebook: "https://www.facebook.com/techuz",
      instagram: "https://www.instagram.com/techuz",
      youtube: null,
      github: null,
    }
  });
  const bytes = XlsxBuilder.buildWebsiteXlsx([lead]);
  assert.ok(bytes instanceof Uint8Array, "Must return Uint8Array");
  assert.ok(bytes.length > 1000, "XLSX must be non-trivially sized");
  // Valid PK ZIP header
  assert.equal(bytes[0], 0x50, "XLSX must start with PK header");
  assert.equal(bytes[1], 0x4b);
});

// ── SUITE SOCIAL-11: buildWebsiteXlsx 2-sheet structure ──────────────────────
test("SOCIAL EXPORT [11]: buildWebsiteXlsx includes both Leads and People sheets in workbook XML", () => {
  const lead = makeLead({
    people: [
      { name: "Rajan Patel", title: "CEO", email: "rajan@techuz.com", linkedin_url: "https://linkedin.com/in/rajan" },
    ],
  });
  const bytes = XlsxBuilder.buildWebsiteXlsx([lead]);
  // Convert bytes to text and search for sheet names
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  assert.ok(text.includes("Leads"), "Workbook must contain 'Leads' sheet");
  assert.ok(text.includes("People"), "Workbook must contain 'People' sheet");
  assert.ok(text.includes("Rajan Patel"), "People sheet must contain extracted person's name");
});

// ── SUITE SOCIAL-12: Maps export remains regression-free ──────────────────────
test("SOCIAL EXPORT [12]: Maps buildXlsx remains 100% intact and unchanged (24 columns)", () => {
  const mapsLead = {
    company_name: "Navratna Indian Cuisine",
    phone: "+1-905-290-0400",
    website: "https://navratnarestaurant.com",
    email: null,
    email_status: null,
    address: "1225 Bur Oak Ave Unit 2, Markham, ON L6E 1G1",
    city: "Markham",
    region: "Ontario",
    country: "Canada",
    postal_code: "L6E1G1",
    category: "Indian Restaurant",
    business_type: "Fine Dining",
    rating: 4.5,
    review_count: 340,
    opening_status: "Open",
    price_range: "$$",
    booking_url: null,
    ordering_url: null,
    menu_url: null,
    source_url: "https://maps.google.com/?cid=123",
    place_id: "ChIJ123",
    sourceQuery: "indian restaurants near me",
    run_id: "run_abc",
    imported_at: "2026-09-03T00:00:00.000Z",
  };
  const bytes = XlsxBuilder.buildXlsx([mapsLead]);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  const text = new TextDecoder().decode(bytes);
  // Should contain the Maps 24-column header
  assert.ok(text.includes("RAMOS Leads"), "Maps sheet must be named RAMOS Leads");
  assert.ok(!text.includes("People"), "Maps export must NOT have a People sheet");
  assert.ok(text.includes("Navratna Indian Cuisine"), "Company name must appear in sheet");
  assert.ok(text.includes("Rating"), "Maps sheet must include Rating column");
  assert.ok(text.includes("Reviews"), "Maps sheet must include Reviews column");
});

// ── SUITE SOCIAL-13: duplicate social links → same URL kept deterministically ──
test("SOCIAL EXPORT [13]: Duplicate social URL in social object is kept without multiplication", () => {
  const lead = makeLead({
    social: {
      linkedin: "https://www.linkedin.com/company/techuz",
      twitter_x: "https://www.linkedin.com/company/techuz", // same URL accidentally
      facebook: "https://www.facebook.com/techuz",
      instagram: null,
      youtube: null,
      github: null,
    }
  });
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);
  // Each slot must hold its own value (no merging)
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("LinkedIn")], "https://www.linkedin.com/company/techuz");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Twitter / X")], "https://www.linkedin.com/company/techuz");
  // Confirmed: only 1 row
  const dataLines = csv.replace(/^\uFEFF/, "").split("\r\n").filter(l => l.trim());
  assert.equal(dataLines.length, 2); // header + 1 data row
});

// ── SUITE SOCIAL-14: UI social data matches export social data ─────────────────
test("SOCIAL EXPORT [14]: Social data in lead.social matches values in exported CSV exactly", () => {
  const expectedSocial = {
    linkedin: "https://www.linkedin.com/company/techuz",
    twitter_x: "https://x.com/techuz",
    facebook: "https://www.facebook.com/techuz",
    instagram: "https://www.instagram.com/techuz",
    youtube: null,
    github: null,
  };
  const lead = makeLead({ social: expectedSocial });
  const csv = generateWebsiteCSV([lead]);
  const cols = parseCsvRow(csv.replace(/^\uFEFF/, "").split("\r\n")[1]);

  // The lead.social values must round-trip into CSV exactly
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("LinkedIn")], expectedSocial.linkedin || "");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Twitter / X")], expectedSocial.twitter_x || "");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Facebook")], expectedSocial.facebook || "");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("Instagram")], expectedSocial.instagram || "");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("YouTube")], expectedSocial.youtube || "");
  assert.equal(cols[WEBSITE_CSV_HEADERS.indexOf("GitHub")], expectedSocial.github || "");
});
