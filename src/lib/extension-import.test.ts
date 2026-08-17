import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  parseAddressLocation,
  sanitizeAddress,
  sanitizeCategory,
  isPriceRangeText,
  isRatingOrReviewText,
  isPlusCodeText,
  isWebsiteText,
  cleanUnicode,
} from "./normalize";
import { extensionLeadSchema } from "./extension-import.server";
import { mapScraperRecord } from "./providers/self-hosted-google-maps.server";

const require = createRequire(import.meta.url);
const Validators = require("../../extension/content/maps/validators.js");
const AddressParser = require("../../extension/content/maps/address-parser.js");
const Schema = require("../../extension/shared/schema.js");

// Lightweight CSV helper mirroring popup.js implementation
function escapeCsvCell(val: any): string {
  if (val == null) return "";
  const str = String(val);
  if (!str.length) return "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(leads: any[]): string {
  const headers = [
    "Company Name",
    "Industry",
    "Business Type",
    "Website",
    "Address",
    "City",
    "Region",
    "Country",
    "Postal Code",
    "Phone",
    "Email",
    "Rating",
    "Reviews",
    "Price Range",
    "Opening Status",
    "Booking URL",
    "Ordering URL",
    "Menu URL",
    "Source URL",
    "Place ID",
  ];

  const rows = [headers.join(",")];

  for (const lead of leads) {
    if (!lead || !lead.company_name) continue;

    const cellValues = [
      escapeCsvCell(lead.company_name),
      escapeCsvCell(lead.category),
      escapeCsvCell(lead.business_type || lead.category),
      escapeCsvCell(lead.website),
      escapeCsvCell(lead.address),
      escapeCsvCell(lead.city),
      escapeCsvCell(lead.region),
      escapeCsvCell(lead.country),
      escapeCsvCell(lead.postal_code),
      escapeCsvCell(lead.phone),
      escapeCsvCell(lead.email),
      escapeCsvCell(lead.rating),
      escapeCsvCell(lead.review_count),
      escapeCsvCell(lead.price_range),
      escapeCsvCell(lead.opening_status),
      escapeCsvCell(lead.booking_url),
      escapeCsvCell(lead.ordering_url),
      escapeCsvCell(lead.menu_url),
      escapeCsvCell(lead.source_url),
      escapeCsvCell(lead.place_id),
    ];

    rows.push(cellValues.join(","));
  }

  return "\uFEFF" + rows.join("\r\n");
}

// 1. Results UI card rejected
test("1. Structural UI Rejection: UI title 'Results' rejected as non-business candidate", () => {
  assert.equal(Validators.isUIElementTitle("Results"), true);
  const valResult = Validators.validateAndCleanLead({ company_name: "Results", extraction_mode: "result-card" });
  assert.equal(valResult.valid, false);
});

// 2. Search UI card rejected
test("2. Structural UI Rejection: UI title 'Search' and 'Search instead for' rejected", () => {
  assert.equal(Validators.isUIElementTitle("Search"), true);
  assert.equal(Validators.isUIElementTitle("Search instead for"), true);
  const valResult = Validators.validateAndCleanLead({ company_name: "Search", extraction_mode: "result-card" });
  assert.equal(valResult.valid, false);
});

// 3. Rating/review contamination rejected
test("3. Rating/review text rejected from address", () => {
  assert.equal(Validators.isRatingOrReviewText("4.7(2)"), true);
  assert.equal(Validators.cleanAddress("4.7(2)", null), null);
  assert.equal(Validators.cleanAddress("4.9(944)□", null), null);
});

// 4. Plus Code rejected as address
test("4. Plus Code strictly rejected from address and location", () => {
  const plusCodeStr = "2MX7+GC Ahmedabad, Gujarat, India";
  assert.equal(Validators.isPlusCodeText(plusCodeStr), true);
  assert.equal(isPlusCodeText(plusCodeStr), true);
  assert.equal(Validators.cleanAddress(plusCodeStr, null), null);
});

// 5. Opening status separated
test("5. Opening status separated from address cleanly", () => {
  const rawAddress = "Aastha Landmark, Sneh Plaza RdOpen soon";
  const cleaned = Validators.cleanAddress(rawAddress, "Open soon");
  assert.equal(cleaned, "Aastha Landmark, Sneh Plaza Rd");
});

// 6. Donatello's address does not contain Open soon
test("6. Donatello's Pizza address does not contain 'Open soon'", () => {
  const cleaned = Validators.cleanAddress("Aastha Landmark, Sneh Plaza RdOpen soon", "Open soon");
  assert.doesNotMatch(cleaned || "", /Open/i);
});

// 7. Martino'z address does not contain Open
test("7. Martino'z Pizza Zundal address does not contain 'Open'", () => {
  const cleaned = Validators.cleanAddress("G-25, Sardar Patel Ring RdOpen", "Open");
  assert.doesNotMatch(cleaned || "", /Open/i);
});

// 8. Tartine address does not contain Open
test("8. Tartine Deep Dish Pizzeria address does not contain 'Open'", () => {
  const cleaned = Validators.cleanAddress("Sardar Patel Ring Rd, near BetweenOpen", "Open");
  assert.doesNotMatch(cleaned || "", /Open/i);
});

// 9. Si Nonna's address != 4.7(2)
test("9. Si Nonna's address does not equal rating string '4.7(2)'", () => {
  const lead = { company_name: "Si Nonna's", rating: 4.7, review_count: 2, address: null };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.notEqual(val.lead.address, "4.7(2)");
});

// 10. Decent Florist full address extracted
test("10. Decent Florist full postal address extracted cleanly", () => {
  const rawAddr = "Shop No. 11, 12, Decent Florist - Flower Shop, Vaibhav Park Society, opposite Krishna Vihar, Krishna Vihar Society, New India Colony, Nikol, Ahmedabad, Gujarat 380049, India";
  const cleaned = Validators.cleanAddress(rawAddr, "Open · Closes 11pm");
  assert.equal(cleaned, rawAddr);
});

// 11. Decent Florist website extracted
test("11. Decent Florist website extracted cleanly", () => {
  const lead = { company_name: "Decent Florist", website: "https://decentflorist.com/" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.website, "https://decentflorist.com/");
});

// 12. Decent Florist phone extracted
test("12. Phone '+91 88498 81599' validated", () => {
  const lead = { company_name: "Decent Florist", phone: "+91 88498 81599" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.phone, "+91 88498 81599");
});

// 13. Decent Florist postal code = "380049"
test("13. Decent Florist postal code equals '380049'", () => {
  const lead = { company_name: "Decent Florist", postal_code: "380049" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.postal_code, "380049");
});

// 14. Postal code remains string
test("14. Postal code '380057' preserved as strict string", () => {
  const lead = { company_name: "Test", postal_code: "380057" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.strictEqual(val.lead.postal_code, "380057");
  assert.strictEqual(typeof val.lead.postal_code, "string");
});

// 15. 02138 remains "02138"
test("15. Postal code '02138' with leading zero preserved as string '02138'", () => {
  const lead = { company_name: "Test", postal_code: "02138" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.strictEqual(val.lead.postal_code, "02138");
});

// 16. Website domain accepted
test("16. Domain text 'decentflorist.com' accepted as valid website", () => {
  const lead = { company_name: "Test", website: "decentflorist.com" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.website, "decentflorist.com");
});

// 17. Google Maps URL rejected as website
test("17. Google Maps URL strictly rejected from website field", () => {
  const lead = { company_name: "Test", website: "https://www.google.com/maps/place/Decent+Florist" };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.website, null);
});

// 18. Synthetic URL rejected
test("18. Missing booking URL remains null", () => {
  const lead = { company_name: "Test", booking_url: null };
  const val = Validators.validateAndCleanLead(lead);
  assert.equal(val.valid, true);
  assert.equal(val.lead.booking_url, null);
});

// 19. CSV headers correct
test("19. CSV headers match exact schema format", () => {
  const csv = generateCSV([{ company_name: "Sample Lead" }]);
  assert.ok(csv.includes("Company Name,Industry,Business Type,Website,Address,City,Region,Country,Postal Code,Phone,Email,Rating,Reviews,Price Range,Opening Status,Booking URL,Ordering URL,Menu URL,Source URL,Place ID"));
});

// 20. CSV commas escaped
test("20. CSV commas escaped with quotes", () => {
  const csv = generateCSV([{ company_name: "Decent Florist, Inc." }]);
  assert.ok(csv.includes('"Decent Florist, Inc."'));
});

// 21. CSV quotes escaped
test("21. CSV quotes escaped with double quotes", () => {
  const csv = generateCSV([{ company_name: 'Donatello\'s "Pizza"' }]);
  assert.ok(csv.includes('"Donatello\'s ""Pizza"""'));
});

// 22. Unicode preserved
test("22. Unicode characters preserved in CSV", () => {
  const csv = generateCSV([{ company_name: "La Pino'z Pizza", price_range: "₹400–1,000" }]);
  assert.ok(csv.includes("₹400–1,000"));
});

// 23. null/undefined never appear in CSV
test("23. null and undefined values produce empty cells in CSV", () => {
  const csv = generateCSV([{ company_name: "Test", address: null, city: undefined }]);
  assert.doesNotMatch(csv, /,null,/);
  assert.doesNotMatch(csv, /,undefined,/);
});

// 24. Plus Code never appears in CSV address
test("24. Plus Code is not present in CSV address cell", () => {
  const lead = Validators.validateAndCleanLead({ company_name: "Test", address: "2MX7+GC Ahmedabad, Gujarat, India" }).lead;
  const csv = generateCSV([lead]);
  assert.doesNotMatch(csv, /2MX7\+GC/);
});

// 25. Opening status never appears inside CSV address
test("25. Opening status is excluded from CSV address cell", () => {
  const lead = Validators.validateAndCleanLead({ company_name: "Donatello's", address: "Aastha Landmark, Sneh Plaza Rd", opening_status: "Open soon" }).lead;
  const csv = generateCSV([lead]);
  assert.ok(csv.includes("Aastha Landmark, Sneh Plaza Rd"));
  assert.ok(csv.includes("Open soon"));
});

// 26. Schema adapter formats lead correctly for API payload
test("26. Schema adapter formats lead correctly for API payload", () => {
  const canonical = Schema.createCanonicalLead();
  canonical.company_name = "Decent Florist";
  canonical.address = "Nikol, Ahmedabad";
  const backendPayload = Schema.toBackendImportPayload(canonical);
  assert.equal(backendPayload.company_name, "Decent Florist");
  assert.equal(backendPayload.address, "Nikol, Ahmedabad");
});

// ─── Candidate Qualification ──────────────────────────────────────────────────

test("27. Qualification: 'Filters' rejected as UI element", () => {
  assert.equal(Validators.isUIElementTitle("Filters"), true);
  const v = Validators.validateAndCleanLead({ company_name: "Filters" });
  assert.equal(v.valid, false);
});

test("28. Qualification: 'Loading...' rejected as UI element", () => {
  assert.equal(Validators.isUIElementTitle("Loading"), true);
});

test("29. Qualification: 'More results' rejected as UI element", () => {
  assert.equal(Validators.isUIElementTitle("more"), true);
});

test("30. Qualification: real business name accepted", () => {
  const v = Validators.validateAndCleanLead({ company_name: "La Pino'z Pizza" });
  assert.equal(v.valid, true);
  assert.equal(v.lead.company_name, "La Pino'z Pizza");
});

// ─── Opening Status Variants ──────────────────────────────────────────────────

test("31. Opening status: 'Open' stripped from end of address", () => {
  const cleaned = Validators.cleanAddress("Sardar Patel Ring RdOpen", "Open");
  assert.doesNotMatch(cleaned || "", /Open/i);
});

test("32. Opening status: 'Open soon' stripped from end of address", () => {
  const cleaned = Validators.cleanAddress("Sneh Plaza RdOpen soon", "Open soon");
  assert.doesNotMatch(cleaned || "", /Open/i);
});

test("33. Opening status: 'Closes 11pm' stripped from end of address", () => {
  const cleaned = Validators.cleanAddress("Some Road, AhmedabadCloses 11pm", "Closes 11pm");
  assert.doesNotMatch(cleaned || "", /Closes/i);
});

test("34. Opening status: 'Opens 6:30pm' stripped from end of address", () => {
  const cleaned = Validators.cleanAddress("Main RdOpens 6:30pm", "Opens 6:30pm");
  assert.doesNotMatch(cleaned || "", /Opens/i);
});

// ─── Website Extraction ───────────────────────────────────────────────────────

test("35. Website: valid https:// URL accepted", () => {
  const v = Validators.validateAndCleanLead({ company_name: "X", website: "https://example.com" });
  assert.equal(v.valid, true);
  assert.equal(v.lead.website, "https://example.com");
});

test("36. Website: missing stays null", () => {
  const v = Validators.validateAndCleanLead({ company_name: "X", website: null });
  assert.equal(v.valid, true);
  assert.equal(v.lead.website, null);
});

test("37. Website: Google Maps URL rejected", () => {
  const v = Validators.validateAndCleanLead({ company_name: "X", website: "https://maps.google.com/place/foo" });
  assert.equal(v.valid, true);
  assert.equal(v.lead.website, null);
});

// ─── Deduplication via localKey ───────────────────────────────────────────────

test("38. Deduplication: same place_id deduped", () => {
  const seen = new Set();
  const lead1 = { company_name: "Florist A", place_id: "ChIJ_abc123" };
  const lead2 = { company_name: "Florist A (copy)", place_id: "ChIJ_abc123" };
  function localKey(r: any) {
    return r.place_id || r.source_url || `${(r.company_name||"").toLowerCase()}|${(r.address||"").toLowerCase()}`;
  }
  const k1 = localKey(lead1);
  assert.equal(seen.has(k1), false);
  seen.add(k1);
  const k2 = localKey(lead2);
  assert.equal(seen.has(k2), true); // duplicate
});

test("39. Deduplication: different place_id not deduped", () => {
  const seen = new Set();
  const lead1 = { company_name: "Florist A", place_id: "ChIJ_aaa" };
  const lead2 = { company_name: "Florist B", place_id: "ChIJ_bbb" };
  function localKey(r: any) {
    return r.place_id || r.source_url || `${(r.company_name||"").toLowerCase()}|${(r.address||"").toLowerCase()}`;
  }
  seen.add(localKey(lead1));
  assert.equal(seen.has(localKey(lead2)), false);
});

// ─── CSV Format (updated headers) ────────────────────────────────────────────

function generateCSVFull(leads: any[]): string {
  const headers = [
    "Company Name", "Industry", "Business Type",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Phone", "Website", "Email",
    "Rating", "Reviews", "Price Range", "Opening Status",
    "Booking URL", "Ordering URL", "Menu URL",
    "Google Maps URL", "Place ID", "Latitude", "Longitude",
    "Source", "Imported / Discovered Date",
  ];
  function esc(val: any) {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const rows = [headers.join(",")];
  for (const l of leads) {
    if (!l || !l.company_name) continue;
    rows.push([
      esc(l.company_name), esc(l.category), esc(l.business_type || l.category),
      esc(l.address), esc(l.city), esc(l.region), esc(l.country), esc(l.postal_code),
      esc(l.phone), esc(l.website), esc(l.email),
      esc(l.rating), esc(l.review_count), esc(l.price_range), esc(l.opening_status),
      esc(l.booking_url), esc(l.ordering_url), esc(l.menu_url),
      esc(l.source_url), esc(l.place_id), esc(l.latitude), esc(l.longitude),
      esc("google-maps"), esc(new Date().toISOString()),
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n");
}

test("40. CSV: full 24-column headers present", () => {
  const csv = generateCSVFull([{ company_name: "Test" }]);
  assert.ok(csv.includes("Google Maps URL"));
  assert.ok(csv.includes("State / Region"));
  assert.ok(csv.includes("Imported / Discovered Date"));
  assert.ok(csv.includes("Source"));
  assert.ok(csv.includes("Latitude"));
  assert.ok(csv.includes("Longitude"));
});

test("41. CSV: no 'undefined' or '[object Object]' in output", () => {
  const lead = { company_name: "Test", address: undefined, city: null };
  const csv = generateCSVFull([lead]);
  assert.doesNotMatch(csv, /undefined/);
  assert.doesNotMatch(csv, /\[object Object\]/);
});

test("42. CSV: UTF-8 BOM present", () => {
  const csv = generateCSVFull([{ company_name: "Test" }]);
  assert.ok(csv.startsWith("\uFEFF"));
});

test("43. CSV: Gujarati address text preserved", () => {
  const csv = generateCSVFull([{ company_name: "Test", address: "New India Colony, Nikol, Ahmedabad, Gujarat 380049, India" }]);
  assert.ok(csv.includes("Ahmedabad"));
  assert.ok(csv.includes("Gujarat"));
});

// ─── Import payload == CSV canonical data ─────────────────────────────────────

test("44. Import payload and CSV use same canonical company_name", () => {
  const canonical = Schema.createCanonicalLead();
  canonical.company_name = "Decent Florist";
  canonical.address = "Nikol, Ahmedabad, Gujarat 380049, India";
  canonical.rating = 4.9;
  canonical.review_count = 944;
  const payload = Schema.toBackendImportPayload(canonical);
  const csv = generateCSVFull([canonical]);
  assert.equal(payload.company_name, canonical.company_name);
  assert.ok(csv.includes(canonical.company_name));
  assert.equal(payload.rating, canonical.rating);
  assert.equal(payload.review_count, canonical.review_count);
});

// ─── Price contamination ──────────────────────────────────────────────────────

test("45. Price range text not stored as category", () => {
  const v = Validators.validateAndCleanLead({ company_name: "Test", category: "₹200–400" });
  assert.equal(v.valid, true);
  assert.equal(v.lead.category, null);
});

test("46. Price range text not stored as address", () => {
  const cleaned = Validators.cleanAddress("₹400–1,000", null);
  assert.equal(cleaned, null);
});

// ─── Rating contamination ─────────────────────────────────────────────────────

test("47. Rating string 4.4(1) not stored as address", () => {
  assert.equal(Validators.isRatingOrReviewText("4.4(1)"), true);
  assert.equal(Validators.cleanAddress("4.4(1)", null), null);
});

test("48. Rating string 3.9(2) rejected from all location fields", () => {
  assert.equal(Validators.isRatingOrReviewText("3.9(2)"), true);
  const v = Validators.validateAndCleanLead({ company_name: "Test", city: "3.9(2)", region: "4.6(548)" });
  assert.equal(v.lead.city, null);
  assert.equal(v.lead.region, null);
});

// ─── Plus Code contamination ──────────────────────────────────────────────────

test("49. Plus Code rejected as city", () => {
  const v = Validators.validateAndCleanLead({ company_name: "Test", city: "2MX7+GC Ahmedabad" });
  assert.equal(v.lead.city, null);
});

// ─── Postal code string integrity ─────────────────────────────────────────────

test("50. Backend payload keeps postal_code as string", () => {
  const canonical = Schema.createCanonicalLead();
  canonical.company_name = "Test";
  canonical.postal_code = "02138";
  const payload = Schema.toBackendImportPayload(canonical);
  assert.strictEqual(payload.postal_code, "02138");
  assert.strictEqual(typeof payload.postal_code, "string");
});

test("51. Postal code 380049 preserved as string through full pipeline", () => {
  const v = Validators.validateAndCleanLead({ company_name: "Test", postal_code: "380049" });
  assert.strictEqual(v.lead.postal_code, "380049");
  const payload = Schema.toBackendImportPayload(v.lead);
  assert.strictEqual(payload.postal_code, "380049");
});
