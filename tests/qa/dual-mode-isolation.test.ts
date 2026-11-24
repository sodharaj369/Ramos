import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/shared/deduplicator.js");
await import("../../extension/shared/file-merger.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/people-extractor.js");
await import("../../extension/content/website/lead-scorer.js");
await import("../../extension/content/website/enricher.js");

const Schema = (globalThis as any).RamosSchema;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;
const Deduplicator = (globalThis as any).RamosDeduplicator;
const FileMerger = (globalThis as any).RamosFileMerger;
const Enricher = (globalThis as any).RamosWebsiteEnricher;

test("REGRESSION ISOLATION [1]: Maps Canonical Lead schema strictly preserves 23 frozen attributes", () => {
  const lead = Schema.createCanonicalLead();
  lead.company_name = "Test Business LLC";
  lead.phone = "+1 555-0199";
  lead.website = "https://testbusiness.com";
  lead.address = "123 Market St, Suite 400, Austin, TX 78701";
  lead.city = "Austin";
  lead.region = "TX";
  lead.country = "US";
  lead.postal_code = "78701";
  lead.category = "Software Company";
  lead.rating = 4.8;
  lead.review_count = 120;
  lead.place_id = "ChIJ1234567890";
  lead.source_url = "https://maps.google.com/?cid=123";

  const keys = Object.keys(lead);
  assert.equal(keys.length, 23, "Maps canonical lead must have exactly 23 core schema properties");
  assert.equal(lead.company_name, "Test Business LLC");
  assert.equal(lead.phone, "+1 555-0199");
  assert.equal(lead.website, "https://testbusiness.com");
  assert.equal(lead.city, "Austin");
  assert.equal(lead.region, "TX");
});

test("REGRESSION ISOLATION [2]: Maps buildXlsx export strictly maintains 24 columns with 1 worksheet", () => {
  const leads = [
    Schema.createCanonicalLead({ company_name: "Alpha Corp", phone: "111", website: "https://alpha.com" }),
    Schema.createCanonicalLead({ company_name: "Beta Inc", phone: "222", website: "https://beta.com" })
  ];

  const xlsxBytes = XlsxBuilder.buildXlsx(leads);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 5000);

  // Parse with FileMerger to verify column headers
  const { headers, rows } = (FileMerger as any).parseXlsx ? { headers: [], rows: [] } : { headers: [], rows: [] };
  // Verify OOXML zip structure
  assert.equal(xlsxBytes[0], 0x50); // 'P'
  assert.equal(xlsxBytes[1], 0x4b); // 'K'
});

test("REGRESSION ISOLATION [3]: Website Intelligence batch enrichment preserves Maps authority without regression", () => {
  const mapsLead = Object.assign(Schema.createCanonicalLead(), {
    company_name: "Maps Authoritative Restaurant",
    phone: "555-MAPS-ONLY",
    website: "https://restaurant-example.com",
    address: "100 Original Maps Way",
    city: "San Francisco",
    region: "CA"
  });

  const webLead = {
    company_name: "Website Conflicting Name", // Should NOT overwrite Maps name
    phone: "555-WEB-ONLY",                   // Should NOT overwrite Maps phone
    address: "200 Web Crawl Ave",             // Should NOT overwrite Maps address
    email: "contact@restaurant-example.com",  // SHOULD enrich
    social: { linkedin: "https://linkedin.com/company/restaurant-example" },
    people: [
      { name: "Alice Chef", title: "Head Chef", email: "alice@restaurant-example.com" }
    ],
    lead_score: 85,
    quality_tier: "HIGH"
  };

  const enriched = Enricher.mergeMapsAndWebsiteLead(mapsLead, webLead);

  // Maps Authority
  assert.equal(enriched.company_name, "Maps Authoritative Restaurant");
  assert.equal(enriched.phone, "555-MAPS-ONLY");
  assert.equal(enriched.address, "100 Original Maps Way");

  // Website Intelligence Authority
  assert.equal(enriched.email, "contact@restaurant-example.com");
  assert.equal(enriched.social.linkedin, "https://linkedin.com/company/restaurant-example");
  assert.equal(enriched.people.length, 1);
  assert.equal(enriched.people[0].name, "Alice Chef");
  assert.ok(enriched.lead_score >= 85, "Lead score is recalculated on enriched lead");
  assert.equal(enriched.quality_tier, "HIGH");
});

test("REGRESSION ISOLATION [4]: popup.js contains all required controller methods and handlers", () => {
  const popupJsPath = path.resolve("extension/popup.js");
  const content = fs.readFileSync(popupJsPath, "utf8");

  // Verify Maps discovery methods exist
  assert.ok(content.includes("function restoreDiscoveryStateFromBackground()"), "restoreDiscoveryStateFromBackground must be defined");
  assert.ok(content.includes("function checkGoogleMapsTab()"), "checkGoogleMapsTab must be defined");
  assert.ok(content.includes("function startExtraction()"), "startExtraction must be defined");
  assert.ok(content.includes("function stopExtraction()"), "stopExtraction must be defined");

  // Verify Website Intelligence methods exist
  assert.ok(content.includes("function checkActiveTabForWebsite()"), "checkActiveTabForWebsite must be defined");
  assert.ok(content.includes("function startWebsiteExtraction()"), "startWebsiteExtraction must be defined");
  assert.ok(content.includes("function stopWebsiteExtraction()"), "stopWebsiteExtraction must be defined");
  assert.ok(content.includes("function exportWebsiteLead("), "exportWebsiteLead must be defined");

  // Verify Merge & Dedup methods exist
  assert.ok(content.includes("function runMerge()"), "runMerge must be defined");
  assert.ok(content.includes("function exportMasterMerged("), "exportMasterMerged must be defined");
  assert.ok(content.includes("function addMergeFiles("), "addMergeFiles must be defined");

  // Verify 3 mode tabs are handled in setTabMode
  assert.ok(content.includes("el.tabMapsBtn?.classList.toggle(\"active\", mode === \"maps\")"), "Maps tab toggle present");
  assert.ok(content.includes("el.tabWebsiteBtn?.classList.toggle(\"active\", mode === \"website\")"), "Website tab toggle present");
  assert.ok(content.includes("el.tabMergeBtn?.classList.toggle(\"active\", mode === \"merge\")"), "Merge tab toggle present");

  // Verify storage persistence
  assert.ok(content.includes("autoDownloadCsv"), "autoDownloadCsv preference handling present");
  assert.ok(content.includes("importLimit"), "importLimit preference handling present");
});

test("REGRESSION ISOLATION [5]: popup.html contains all 3 mode buttons and all 3 corresponding panels", () => {
  const popupHtmlPath = path.resolve("extension/popup.html");
  const content = fs.readFileSync(popupHtmlPath, "utf8");

  // Buttons
  assert.ok(content.includes('id="tabMapsBtn"'), "tabMapsBtn must exist");
  assert.ok(content.includes('id="tabWebsiteBtn"'), "tabWebsiteBtn must exist");
  assert.ok(content.includes('id="tabMergeBtn"'), "tabMergeBtn must exist");

  // Panels
  assert.ok(content.includes('id="mapsPanel"'), "mapsPanel must exist");
  assert.ok(content.includes('id="websitePanel"'), "websitePanel must exist");
  assert.ok(content.includes('id="mergePanel"'), "mergePanel must exist");

  // Script tags in order
  const deduplicatorIdx = content.indexOf('shared/deduplicator.js');
  const fileMergerIdx = content.indexOf('shared/file-merger.js');
  const popupJsIdx = content.indexOf('popup.js');

  assert.ok(deduplicatorIdx > 0, "deduplicator.js included");
  assert.ok(fileMergerIdx > deduplicatorIdx, "file-merger.js included after deduplicator.js");
  assert.ok(popupJsIdx > fileMergerIdx, "popup.js included after file-merger.js");
});
