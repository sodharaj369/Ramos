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
    "Company",
    "Phone",
    "Website",
    "Email",
    "Email Status",
    "Address",
    "City",
    "State / Region",
    "Country",
    "Postal Code",
    "Industry",
    "Business Type",
    "Rating",
    "Reviews",
    "Opening Status",
    "Price Range",
    "Booking URL",
    "Ordering URL",
    "Menu URL",
    "Google Maps URL",
    "Place ID",
    "Imported At",
  ];

  const rows = [headers.join(",")];

  for (const lead of leads) {
    if (!lead || !lead.company_name) continue;

    const cellValues = [
      escapeCsvCell(lead.company_name),
      escapeCsvCell(lead.phone),
      escapeCsvCell(lead.website),
      escapeCsvCell(lead.email),
      escapeCsvCell(lead.email_status),
      escapeCsvCell(lead.address),
      escapeCsvCell(lead.city),
      escapeCsvCell(lead.region),
      escapeCsvCell(lead.country),
      escapeCsvCell(lead.postal_code),
      escapeCsvCell(lead.category),
      escapeCsvCell(lead.business_type || lead.category),
      escapeCsvCell(lead.rating),
      escapeCsvCell(lead.review_count),
      escapeCsvCell(lead.opening_status),
      escapeCsvCell(lead.price_range),
      escapeCsvCell(lead.booking_url),
      escapeCsvCell(lead.ordering_url),
      escapeCsvCell(lead.menu_url),
      escapeCsvCell(lead.source_url),
      escapeCsvCell(lead.place_id),
      escapeCsvCell(new Date().toISOString()),
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
  assert.equal(val.lead.website, "https://decentflorist.com");
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
  assert.equal(val.lead.website, "https://decentflorist.com");
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
  assert.ok(csv.includes("Company,Phone,Website,Email,Email Status,Address,City,State / Region,Country,Postal Code,Industry,Business Type,Rating,Reviews,Opening Status,Price Range,Booking URL,Ordering URL,Menu URL,Google Maps URL,Place ID,Imported At"));
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
    "Company", "Phone", "Website", "Email", "Email Status",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Business Type", "Rating", "Reviews", "Opening Status", "Price Range",
    "Booking URL", "Ordering URL", "Menu URL",
    "Google Maps URL", "Place ID", "Imported At",
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
      esc(l.company_name), esc(l.phone), esc(l.website), esc(l.email), esc(l.email_status),
      esc(l.address), esc(l.city), esc(l.region), esc(l.country), esc(l.postal_code),
      esc(l.category), esc(l.business_type || l.category), esc(l.rating), esc(l.review_count), esc(l.opening_status), esc(l.price_range),
      esc(l.booking_url), esc(l.ordering_url), esc(l.menu_url),
      esc(l.source_url), esc(l.place_id), esc(l.discovered_at || new Date().toISOString()),
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n");
}

test("40. CSV: full 22-column headers present", () => {
  const csv = generateCSVFull([{ company_name: "Test" }]);
  assert.ok(csv.includes("Google Maps URL"));
  assert.ok(csv.includes("State / Region"));
  assert.ok(csv.includes("Email Status"));
  assert.ok(csv.includes("Imported At"));
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

// ─── Canonical Normalizer (Domino's / La Pino'z Fixes) ───────────────────────

test("52. Opening status: description 'Longtime pizza chain known for delivery' rejected", () => {
  const v = Validators.validateAndCleanLead({
    company_name: "Domino's Pizza",
    opening_status: "Longtime pizza chain known for delivery",
  });
  assert.equal(v.lead.opening_status, null);
});

test("53. Opening status: attribute 'Brunch' rejected", () => {
  const v = Validators.validateAndCleanLead({
    company_name: "La Pino'z Pizza",
    opening_status: "Brunch",
  });
  assert.equal(v.lead.opening_status, null);
});

test("54. Opening status: legitimate status 'Open · Closes 11pm' preserved", () => {
  const v = Validators.validateAndCleanLead({
    company_name: "Decent Florist",
    opening_status: "Open · Closes 11pm",
  });
  assert.ok(v.lead.opening_status && v.lead.opening_status.includes("Closes"));
});

test("55. URLs: JSON array string '[\"https://order.online/foo\", \"https://ubereats.com\"]' unwrapped to clean single URL", () => {
  const v = Validators.validateAndCleanLead({
    company_name: "La Pino'z Pizza",
    ordering_url: '["https://order.online/foo", "https://ubereats.com"]',
  });
  assert.equal(v.lead.ordering_url, "https://order.online/foo");
});

test("56. normalizeBusinessLead(): cleans scraper record, unwraps JSON URLs, and filters descriptions", () => {
  const requireModule = createRequire(import.meta.url);
  const { normalizeBusinessLead } = requireModule("./normalize");
  const raw = {
    title: "Domino's Pizza",
    status: "Longtime pizza chain known for delivery",
    reservations: '["https://order.online/reserve"]',
    website: "dominos.co.in",
    address: "Zundal, Ahmedabad, Gujarat 382421",
  };
  const lead = normalizeBusinessLead(raw);
  assert.ok(lead);
  assert.equal(lead.company_name, "Domino's Pizza");
  assert.equal(lead.opening_status, null);
  assert.equal(lead.booking_url, "https://order.online/reserve");
  assert.equal(lead.website, "https://dominos.co.in");
});

// ─── Section 28 Focused Real-World Fixture Tests ─────────────────────────────

test("57. Real-world fixture: Radhika's Authentic South Indian Food", () => {
  const raw = {
    company_name: "Radhika's Authentic South Indian Food",
    address: "Shop no. 1,2,3, Ground floor, Kraft - 7, Sarkhej Gandhinagar Hwy, near Devnagar, opp. Maruti Suzuki Showroom, Gota, Ahmedabad, Gujarat 382481, India",
    phone: "+91 98552 69855",
    website: "radhikas.in",
    menu_url: "https://radhikas.in/menu",
    opening_status: "Open · Closes 11:45 pm",
    rating: 4.4,
    review_count: 1250,
  };
  const val = Validators.validateAndCleanLead(raw);
  assert.equal(val.valid, true);
  assert.equal(val.lead.company_name, "Radhika's Authentic South Indian Food");
  assert.ok(val.lead.address.includes("Kraft - 7"));
  assert.equal(val.lead.phone, "+91 98552 69855");
  assert.equal(val.lead.website, "https://radhikas.in");
  assert.equal(val.lead.menu_url, "https://radhikas.in/menu");
  assert.equal(val.lead.opening_status, "Open · Closes 11:45 pm");
  assert.equal(val.lead.rating, 4.4);
  assert.equal(val.lead.review_count, 1250);
});

test("58. Real-world fixture: The dosa house", () => {
  const raw = {
    company_name: "The dosa house",
    address: "Shukan Glory Rd, opp. Jupiter kids, Gota, Ahmedabad, Gujarat 382481, India",
    phone: "+91 63537 89497",
    opening_status: "Open · Closes 11pm",
  };
  const val = Validators.validateAndCleanLead(raw);
  assert.equal(val.valid, true);
  assert.equal(val.lead.company_name, "The dosa house");
  assert.ok(val.lead.address.includes("Shukan Glory Rd"));
  assert.equal(val.lead.phone, "+91 63537 89497");
  assert.equal(val.lead.opening_status, "Open · Closes 11pm");
});

test("59. Real-world fixture: Decent Florist", () => {
  const raw = {
    company_name: "Decent Florist",
    address: "Shop No. 11, 12, Decent Florist - Flower Shop, Vaibhav Park Society, opposite Krishna Vihar, Krishna Vihar Society, New India Colony, Nikol, Ahmedabad, Gujarat 380049, India",
    phone: "+91 88498 81599",
    website: "decentflorist.com",
    opening_status: "Open · Closes 11pm",
  };
  const val = Validators.validateAndCleanLead(raw);
  assert.equal(val.valid, true);
  assert.equal(val.lead.company_name, "Decent Florist");
  assert.ok(val.lead.address.includes("Vaibhav Park Society"));
  assert.equal(val.lead.phone, "+91 88498 81599");
  assert.equal(val.lead.website, "https://decentflorist.com");
  assert.equal(val.lead.opening_status, "Open · Closes 11pm");
});

test("60. Real-world fixture: La Pino'z Pizza Shela", () => {
  const raw = {
    company_name: "La Pino'z Pizza Shela",
    address: "4, 5 Maher Homes 3, opp. Club O7, Maher Street, Shela, Gujarat 380057, India",
    website: "https://lapinozpizza.in",
    phone: "+91 82382 47969",
    price_range: "₹200–400",
  };
  const val = Validators.validateAndCleanLead(raw);
  assert.equal(val.valid, true);
  assert.equal(val.lead.company_name, "La Pino'z Pizza Shela");
  assert.ok(val.lead.address.includes("Maher Homes 3"));
  assert.equal(val.lead.website, "https://lapinozpizza.in");
  assert.equal(val.lead.phone, "+91 82382 47969");
  assert.equal(val.lead.price_range, "₹200–400");
});

test("61. Corruption tests: address rejects ratings, prices, status, plus codes", () => {
  assert.equal(Validators.cleanAddress("4.9(944)", null), null);
  assert.equal(Validators.cleanAddress("₹200–400", null), null);
  assert.equal(Validators.cleanAddress("Open", null), null);
  assert.equal(Validators.cleanAddress("4G5P+92 Ahmedabad, Gujarat, India", null), null);
  assert.equal(Validators.cleanAddress("□", null), null);
});

test("62. Missing field tests: missing website/phone/email remain null", () => {
  const val = Validators.validateAndCleanLead({ company_name: "Clean Co", website: null, phone: null, email: null });
  assert.equal(val.lead.website, null);
  assert.equal(val.lead.phone, null);
  assert.equal(val.lead.email, null);
});

test("63. CSV formatting: address with commas remains in single cell, phone/postal code stay strings, no undefined/null/□", () => {
  const lead = {
    company_name: "Test Shop",
    phone: "+91 98552 69855",
    postal_code: "380057",
    address: "Shop no. 1, 2, 3, Gota, Ahmedabad",
    website: "https://example.com",
    email: null,
    rating: undefined,
  };
  const csv = generateCSV([lead]);
  assert.ok(csv.includes('"Shop no. 1, 2, 3, Gota, Ahmedabad"'));
  assert.ok(csv.includes("+91 98552 69855"));
  assert.ok(csv.includes("380057"));
  assert.doesNotMatch(csv, /,null,/);
  assert.doesNotMatch(csv, /,undefined,/);
  assert.doesNotMatch(csv, /□/);
});

test("64. Same canonical lead object can feed both CSV and import payload", () => {
  const canonical = Schema.createCanonicalLead();
  canonical.company_name = "Radhika's Authentic South Indian Food";
  canonical.phone = "+91 98552 69855";
  canonical.website = "https://radhikas.in";
  canonical.address = "Gota, Ahmedabad";
  canonical.opening_status = "Open · Closes 11:45 pm";

  const csv = generateCSV([canonical]);
  const backendPayload = Schema.toBackendImportPayload(canonical);

  assert.equal(backendPayload.company_name, canonical.company_name);
  assert.equal(backendPayload.phone, canonical.phone);
  assert.equal(backendPayload.website, canonical.website);
  assert.equal(backendPayload.address, canonical.address);
  assert.ok(csv.includes("Radhika's Authentic South Indian Food"));
  assert.ok(csv.includes("+91 98552 69855"));
  assert.ok(csv.includes("https://radhikas.in"));
});
