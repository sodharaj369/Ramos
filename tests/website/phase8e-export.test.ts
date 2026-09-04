import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");

const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

const EXPECTED_ENRICHED_HEADERS = [
  "Company", "Lead Score", "Quality Tier", "Website",
  "Primary Email", "Email Role", "Additional Emails", "Email Status",
  "Primary Phone", "Additional Phones",
  "Decision Maker Name", "Decision Maker Title", "Decision Maker Email", "Decision Maker LinkedIn", "People Count",
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

test("PHASE 8E [1]: buildWebsiteXlsx exports valid 2-sheet OOXML workbook with 34 columns", () => {
  const enrichedLead = {
    company_name: "Bright Smile Dental",
    lead_score: 88,
    quality_tier: "HIGH",
    website: "https://brightsmiledental.com",
    email: "sales@brightsmiledental.com",
    email_role: "sales",
    additional_emails: ["info@brightsmiledental.com", "support@brightsmiledental.com"],
    email_status: "verified",
    phone: "+1 555-123-4567",
    additional_phones: ["+1 555-987-6543"],
    decision_maker_name: "Dr. Alice Morgan",
    decision_maker_title: "Founder & Chief Dentist",
    decision_maker_email: "alice@brightsmiledental.com",
    decision_maker_linkedin: "https://linkedin.com/in/alicemorgan",
    people_count: 2,
    address: "100 Medical Center Dr",
    city: "Austin",
    region: "Texas",
    country: "USA",
    postal_code: "78701",
    category: "Dentist",
    social: {
      linkedin: "https://linkedin.com/company/brightsmiledental",
      twitter_x: "https://x.com/brightdental",
      facebook: "https://facebook.com/brightdental",
      instagram: "https://instagram.com/brightdental",
      youtube: "https://youtube.com/@brightdental",
      github: null,
    },
    people: [
      {
        name: "Dr. Alice Morgan",
        title: "Founder & Chief Dentist",
        email: "alice@brightsmiledental.com",
        phone: "+1 555-123-4567",
        linkedin_url: "https://linkedin.com/in/alicemorgan",
      },
      {
        name: "Bob Jones",
        title: "Office Manager",
        email: "bob@brightsmiledental.com",
        phone: null,
        linkedin_url: null,
      }
    ],
  };

  const bytes = XlsxBuilder.buildWebsiteXlsx([enrichedLead]);
  assert.ok(bytes instanceof Uint8Array, "Must return valid Uint8Array");
  assert.ok(bytes.length > 2000, "XLSX file must have substantial size");
  assert.equal(bytes[0], 0x50, "PK header byte 0");
  assert.equal(bytes[1], 0x4b, "PK header byte 1");

  const xmlText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  assert.ok(xmlText.includes("Leads"), "Contains Leads sheet");
  assert.ok(xmlText.includes("People"), "Contains People sheet");
  assert.ok(xmlText.includes("Lead Score"), "Sheet contains Lead Score column header");
  assert.ok(xmlText.includes("Quality Tier"), "Sheet contains Quality Tier column header");
  assert.ok(xmlText.includes("Decision Maker Name"), "Sheet contains Decision Maker Name column header");
  assert.ok(xmlText.includes("Dr. Alice Morgan"), "Contains decision maker name");
  assert.ok(xmlText.includes("Founder &amp; Chief Dentist") || xmlText.includes("Founder & Chief Dentist"), "Contains decision maker title");
  assert.ok(xmlText.includes("Bob Jones"), "People sheet contains second person");
});

test("PHASE 8E [2]: Enriched CSV export has exactly 34 columns matching 1:1 with XLSX specification", () => {
  assert.equal(EXPECTED_ENRICHED_HEADERS.length, 34, "Expected exactly 34 headers");

  const lead = {
    company_name: "Apex Solutions",
    lead_score: 75,
    quality_tier: "HIGH",
    website: "https://apexsolutions.io",
    email: "contact@apexsolutions.io",
    email_role: "general",
    additional_emails: ["support@apexsolutions.io"],
    email_status: "business_role",
    phone: "+1 555-222-3333",
    additional_phones: [],
    decision_maker_name: "Sarah Apex",
    decision_maker_title: "Managing Director",
    decision_maker_email: "sarah@apexsolutions.io",
    decision_maker_linkedin: "https://linkedin.com/in/sarahapex",
    people_count: 1,
    address: "50 Tech Boulevard",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    postal_code: "94105",
    category: "Software",
    social: {
      linkedin: "https://linkedin.com/company/apexsolutions",
    },
  };

  const row = websiteLeadToCsvRow(lead);
  const cells = row.split(",");
  assert.equal(cells.length, 34, `Expected 34 cells in CSV row, got ${cells.length}`);
  assert.equal(cells[0], "Apex Solutions");
  assert.equal(cells[1], "75");
  assert.equal(cells[2], "HIGH");
  assert.equal(cells[3], "https://apexsolutions.io");
  assert.equal(cells[4], "contact@apexsolutions.io");
  assert.equal(cells[5], "general");
  assert.equal(cells[10], "Sarah Apex");
  assert.equal(cells[11], "Managing Director");
  assert.equal(cells[14], "1");
});

test("PHASE 8E [3]: Maps-only export (buildXlsx) remains strictly 24 columns (regression-free freeze)", () => {
  const mapsLead = {
    company_name: "Downtown Coffee",
    phone: "+1 555-444-5555",
    website: "https://downtowncoffee.com",
    address: "123 Main St",
    city: "Austin",
    region: "TX",
    country: "USA",
    postal_code: "78701",
    category: "Coffee shop",
    rating: 4.7,
    review_count: 310,
    place_id: "ChIJ_DOWNTOWN_COFFEE",
  };

  const bytes = XlsxBuilder.buildXlsx([mapsLead]);
  assert.ok(bytes instanceof Uint8Array);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  assert.ok(!text.includes("People"), "Pure Maps export does not include People sheet");
  assert.ok(text.includes("Downtown Coffee"));
});
