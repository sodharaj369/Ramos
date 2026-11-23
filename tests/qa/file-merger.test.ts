import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/shared/deduplicator.js");
await import("../../extension/shared/file-merger.js");

const FileMerger = (globalThis as any).RamosFileMerger;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

test("FILE MERGER [1]: parseCsv parses standard and quoted CSV files correctly", () => {
  const csvContent = `Company,Phone,Website,Email,Address
"Alpha Dental, LLC","+1 555-123-4567","https://alphadental.com",info@alphadental.com,"100 Main St, Suite 200"
Beta Cafe,555-9876,https://betacafe.com,contact@betacafe.com,456 Oak Ave
`;

  const { headers, rows } = FileMerger.parseCsv(csvContent);
  assert.equal(headers.length, 5);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Company"], "Alpha Dental, LLC");
  assert.equal(rows[0]["Address"], "100 Main St, Suite 200");
  assert.equal(rows[1]["Company"], "Beta Cafe");
});

test("FILE MERGER [2]: parseXlsx reads browser-native OOXML spreadsheet without external packages", async () => {
  const sampleLeads = [
    { company_name: "Apex Healthcare", phone: "555-3333", website: "https://apexhealth.com", address: "789 Pine Rd", city: "Denver" },
    { company_name: "Summit Logistics", phone: "555-7777", website: "https://summitlogistics.com", address: "321 Elm St", city: "Seattle" },
  ];

  const xlsxBytes = XlsxBuilder.buildXlsx(sampleLeads);
  assert.ok(xlsxBytes instanceof Uint8Array);

  const { headers, rows } = await FileMerger.parseXlsx(xlsxBytes);
  assert.ok(headers.includes("Company"));
  assert.ok(headers.includes("Phone"));
  assert.ok(headers.includes("Website"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Company"], "Apex Healthcare");
  assert.equal(rows[1]["Company"], "Summit Logistics");
});

test("FILE MERGER [3]: normalizeRecord handles diverse header names across third-party tools", () => {
  const apolloRow = {
    "Business Name": "Global Tech Services",
    "URL": "https://globaltech.io",
    "Telephone": "555-0011",
    "Contact Email": "hello@globaltech.io",
    "Street Address": "500 Market St",
    "Town": "San Francisco",
    "Zip": "94105",
    "Owner": "Jane Doe",
    "Title": "CEO",
  };

  const norm = FileMerger.normalizeRecord(apolloRow);
  assert.ok(norm);
  assert.equal(norm.company_name, "Global Tech Services");
  assert.equal(norm.website, "https://globaltech.io");
  assert.equal(norm.phone, "555-0011");
  assert.equal(norm.email, "hello@globaltech.io");
  assert.equal(norm.address, "500 Market St");
  assert.equal(norm.city, "San Francisco");
  assert.equal(norm.postal_code, "94105");
  assert.equal(norm.decision_maker_name, "Jane Doe");
  assert.equal(norm.decision_maker_title, "CEO");
});

test("FILE MERGER [4]: mergeLeadFiles merges multiple CSV and XLSX files and deduplicates master list", async () => {
  // File 1: CSV from Maps search 1
  const file1Csv = `Company,Phone,Website,Email,Address
"Delta Roofing","+1 555-111-2222","https://deltaroofing.com",,"101 First Ave"
"Echo Plumbing","+1 555-333-4444","https://echoplumbing.com","service@echoplumbing.com","202 Second Ave"
`;

  // File 2: XLSX from Maps search 2 (Delta Roofing has richer data: email added)
  const file2Leads = [
    { company_name: "Delta Roofing Services", phone: "+1 555-111-2222", website: "https://deltaroofing.com", email: "info@deltaroofing.com", address: "101 First Ave" },
    { company_name: "Foxtrot Electric", phone: "+1 555-555-6666", website: "https://foxtrotelectric.com", email: "help@foxtrot.com", address: "303 Third Ave" },
  ];
  const file2XlsxBytes = XlsxBuilder.buildXlsx(file2Leads);

  // File 3: Another CSV with duplicate Echo Plumbing
  const file3Csv = `Company Name,Phone Number,Website,Email
"Echo Plumbing LLC","555-333-4444","https://echoplumbing.com","admin@echoplumbing.com"
"Golf Landscaping","555-777-8888","https://golflandscaping.com","contact@golf.com"
`;

  const files = [
    { name: "maps_export_batch1.csv", content: file1Csv },
    { name: "maps_export_batch2.xlsx", content: file2XlsxBytes },
    { name: "website_leads.csv", content: file3Csv },
  ];

  const result = await FileMerger.mergeLeadFiles(files);

  assert.equal(result.totalFiles, 3);
  assert.equal(result.totalRawLeads, 6);
  // Delta Roofing (file 1 & file 2) -> merged (1 dup)
  // Echo Plumbing (file 1 & file 3) -> merged (1 dup)
  // Total unique: 4 (Delta, Echo, Foxtrot, Golf)
  assert.equal(result.duplicatesRemoved, 2);
  assert.equal(result.masterLeads.length, 4);

  // Verify Delta Roofing received merged email from file 2
  const delta = result.masterLeads.find((l: any) => l.website.includes("deltaroofing.com"));
  assert.ok(delta);
  assert.equal(delta.email, "info@deltaroofing.com");

  // Verify Echo Plumbing merged both emails
  const echo = result.masterLeads.find((l: any) => l.website.includes("echoplumbing.com"));
  assert.ok(echo);
  assert.equal(echo.email, "service@echoplumbing.com");
  assert.ok(echo.additional_emails.includes("admin@echoplumbing.com"));

  assert.equal(result.breakdown.length, 3);
  assert.equal(result.breakdown[0].rowCount, 2);
  assert.equal(result.breakdown[1].rowCount, 2);
  assert.equal(result.breakdown[2].rowCount, 2);
});
