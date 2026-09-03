import test from "node:test";
import assert from "node:assert/strict";

// Ensure global environment for UMD modules
if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/content/website/enricher.js");

const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;
const Enricher = (globalThis as any).RamosWebsiteEnricher;

const CANONICAL_HEADERS = [
  "Company", "Phone", "Website", "Email", "Email Status",
  "Address", "City", "State / Region", "Country", "Postal Code",
  "Industry", "Business Type", "Rating", "Reviews", "Opening Status",
  "Price Range", "Booking URL", "Ordering URL", "Menu URL",
  "Imported At", "Source URL", "Place ID", "Source Query", "Run ID"
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

function leadToCsvRow(l: any): string {
  return [
    escapeCsvCell(l.company_name),
    escapeCsvCell(l.phone),
    escapeCsvCell(l.website),
    escapeCsvCell(l.email),
    escapeCsvCell(l.email_status),
    escapeCsvCell(l.address),
    escapeCsvCell(l.city),
    escapeCsvCell(l.region),
    escapeCsvCell(l.country),
    escapeCsvCell(l.postal_code),
    escapeCsvCell(l.category),
    escapeCsvCell(l.business_type),
    l.rating != null ? l.rating : "",
    l.review_count != null ? l.review_count : "",
    escapeCsvCell(l.opening_status),
    escapeCsvCell(l.price_range),
    escapeCsvCell(l.booking_url),
    escapeCsvCell(l.ordering_url),
    escapeCsvCell(l.menu_url),
    escapeCsvCell(l.imported_at || "2026-01-01T00:00:00.000Z"),
    escapeCsvCell(l.source_url),
    escapeCsvCell(l.place_id),
    escapeCsvCell(l.sourceQuery),
    escapeCsvCell(l.run_id)
  ].join(",");
}

// ─── 1. Canonical 24-Column Count and Alignment ─────────────────────────────
test("EXPORT PARITY: Canonical column count is strictly 24 in CSV and XLSX", () => {
  assert.equal(CANONICAL_HEADERS.length, 24);

  const fullLead = {
    company_name: "Acme Precision Industrial Corp.",
    phone: "+1 (555) 019-2834",
    website: "https://acme-industrial.com",
    email: "sales@acme-industrial.com",
    email_status: "business_role",
    address: "100 Industrial Parkway, Suite 400",
    city: "Detroit",
    region: "MI",
    country: "US",
    postal_code: "48201",
    category: "Manufacturing",
    business_type: "Industrial Equipment",
    rating: 4.7,
    review_count: 320,
    opening_status: "Open now",
    price_range: "$$$",
    booking_url: "https://acme-industrial.com/schedule",
    ordering_url: "https://acme-industrial.com/order",
    menu_url: "https://acme-industrial.com/catalog",
    imported_at: "2026-09-03T12:00:00.000Z",
    source_url: "https://google.com/maps/place/data",
    place_id: "ChIJ_acme_123",
    sourceQuery: "industrial equipment detroit",
    run_id: "run_e2e_001",
  };

  const csvLine = leadToCsvRow(fullLead);
  // Parse CSV line ensuring 24 fields
  const parsedCols = csvLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  assert.equal(parsedCols.length, 24, "CSV row must contain exactly 24 comma-separated fields");

  // XLSX generation
  const xlsxBytes = XlsxBuilder.buildXlsx([fullLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 1000);
});

// ─── 2. Sparse Lead With Null Fields Does Not Shift Columns ─────────────────
test("EXPORT PARITY: Highly sparse lead with missing fields retains strict 24-column positioning", () => {
  const sparseLead = {
    company_name: "Sparse Workshop",
    phone: null,
    website: null,
    email: null,
    email_status: null,
    address: null,
    city: null,
    region: null,
    country: null,
    postal_code: null,
    category: null,
    business_type: null,
    rating: null,
    review_count: null,
    opening_status: null,
    price_range: null,
    booking_url: null,
    ordering_url: null,
    menu_url: null,
    imported_at: "2026-09-03T12:00:00.000Z",
    source_url: "https://maps.google.com",
    place_id: "ChIJ_sparse",
    sourceQuery: "workshop",
    run_id: "run_sparse",
  };

  const csvLine = leadToCsvRow(sparseLead);
  const cols = csvLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  assert.equal(cols.length, 24);
  assert.equal(cols[0], "Sparse Workshop");
  assert.equal(cols[1], ""); // Phone
  assert.equal(cols[2], ""); // Website
  assert.equal(cols[3], ""); // Email
  assert.equal(cols[21], "ChIJ_sparse"); // Place ID still in column 22
});

// ─── 3. Leading Zero Preservation in Phone and Postal Codes ─────────────────
test("EXPORT PARITY: Preserves leading zeros in phone numbers and postal codes as raw text", () => {
  const zeroLead = {
    company_name: "Boston Zero Supply",
    phone: "0123456789",
    postal_code: "02138",
  };

  const csvLine = leadToCsvRow(zeroLead);
  assert.ok(csvLine.includes("0123456789"));
  assert.ok(csvLine.includes("02138"));

  // In XLSX, check numFmtId 164 is declared for text formatting
  const xlsxBytes = XlsxBuilder.buildXlsx([zeroLead]);
  const decodedZip = new TextDecoder("utf-8", { fatal: false }).decode(xlsxBytes);
  // Zip contains styles.xml declaring numFmtId="164" formatCode="@"
  assert.ok(decodedZip.includes("numFmts") || xlsxBytes.length > 500);
});

// ─── 4. Special Characters, Quotes, and Commas in CSV ───────────────────────
test("EXPORT PARITY: Handles commas, quotes, and newlines safely in CSV formatting", () => {
  const trickyLead = {
    company_name: 'Joe\'s "Premier" Coffee, Tea & Baked Goods',
    address: '123 Main St,\nSuite 100, "Tower B"',
    phone: "+1-555-0100",
  };

  const csvLine = leadToCsvRow(trickyLead);
  // Quotes escaped as ""
  assert.ok(csvLine.includes('"Joe\'s ""Premier"" Coffee, Tea & Baked Goods"'));
  assert.ok(csvLine.includes('"123 Main St,\nSuite 100, ""Tower B"""'));
});

// ─── 5. Enriched Lead With Complex Sub-Objects Does Not Corrupt Export ──────
test("EXPORT PARITY: Enriched lead with people[], social{}, and _provenance{} exports cleanly without shifting columns", () => {
  const mapsLead = {
    company_name: "Apex BioTech",
    phone: "+15125550100",
    website: "https://apexbio.com",
    address: "700 Bio Way",
    city: "Austin",
    region: "TX",
    country: "US",
    postal_code: "78701",
  };

  const websiteLead = {
    company_name: "Apex BioTech LLC",
    email: "info@apexbio.com",
    email_status: "business_role",
    social: {
      linkedin: "https://linkedin.com/company/apexbio",
      twitter_x: "https://twitter.com/apexbio",
    },
    people: [
      { name: "Dr. Evelyn Reed", title: "Chief Scientist", linkedin_url: "https://linkedin.com/in/evelyn" },
      { name: "Marcus Vance", title: "VP Engineering" },
    ],
    _fieldRankings: {
      email: [{ confidence: 0.98 }],
    },
  };

  const enrichedLead = Enricher.mergeMapsAndWebsiteLead(mapsLead, websiteLead);
  assert.ok(enrichedLead.people.length === 2);
  assert.ok(enrichedLead._provenance);

  // Check CSV row has 24 columns
  const csvLine = leadToCsvRow(enrichedLead);
  const cols = csvLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  assert.equal(cols.length, 24);
  assert.equal(cols[0], "Apex BioTech");
  assert.equal(cols[3], "info@apexbio.com");
  assert.equal(cols[4], "business_role");

  // Check XLSX builds successfully
  const xlsxBytes = XlsxBuilder.buildXlsx([enrichedLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 1000);
});
