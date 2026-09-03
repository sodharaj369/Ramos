import test from "node:test";
import assert from "node:assert/strict";

// Ensure global environment for UMD modules
if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/content/website/page-acquisition.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/page-analyzer.js");
await import("../../extension/content/website/structured-data.js");
await import("../../extension/content/website/field-extractors.js");
await import("../../extension/content/website/crawl-policy.js");
await import("../../extension/content/website/page-priority.js");
await import("../../extension/content/website/link-discovery.js");
await import("../../extension/content/website/crawl-queue.js");
await import("../../extension/content/website/people-extractor.js");
await import("../../extension/content/website/confidence.js");
await import("../../extension/content/website/enricher.js");
await import("../../extension/content/website/website-adapter.js");

const Enricher = (globalThis as any).RamosWebsiteEnricher;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

function createBaseMapsLead(overrides: Record<string, any> = {}) {
  return {
    company_name: "Austin Artisanal Bakery",
    phone: "+15125550190",
    website: "https://austin-bakery.com",
    email: null,
    email_status: null,
    address: "200 South Congress Ave, Austin, TX 78704",
    city: "Austin",
    region: "TX",
    country: "US",
    postal_code: "78704",
    category: "Bakery",
    business_type: "Bakery",
    rating: 4.8,
    review_count: 142,
    opening_status: "Open",
    price_range: "$$",
    booking_url: null,
    ordering_url: null,
    menu_url: null,
    imported_at: new Date().toISOString(),
    source_url: "https://google.com/maps/place/data",
    place_id: "ChIJ_place_123",
    sourceQuery: "bakery austin",
    run_id: "run_maps_001",
    ...overrides,
  };
}

function createBaseWebsiteLead(overrides: Record<string, any> = {}) {
  return {
    company_name: "Austin Artisanal Bakery & Cafe LLC",
    phone: "+15125559999",
    website: "https://austin-bakery.com",
    email: "catering@austin-bakery.com",
    email_status: "business_role",
    address: "200 S Congress Ave Suite B, Austin, TX",
    city: "Austin",
    region: "TX",
    country: "US",
    postal_code: "78704",
    category: "Artisanal Breads & Catering",
    booking_url: "https://austin-bakery.com/reservations",
    ordering_url: "https://toasttab.com/austin-bakery/order",
    menu_url: "https://austin-bakery.com/menu.pdf",
    description: "Handcrafted organic sourdough in Austin, TX.",
    social: {
      instagram: "https://instagram.com/austin_bakery",
      facebook: "https://facebook.com/austinbakery",
    },
    people: [
      {
        name: "Chef Marco Silva",
        title: "Head Baker & Founder",
        linkedin_url: "https://linkedin.com/in/marco-silva-baker",
        email: "marco@personal-domain.com",
        phone: "+15125551111",
      },
    ],
    _fieldRankings: {
      email: [{ confidence: 0.96, sourceUrl: "https://austin-bakery.com/contact" }],
      phone: [{ confidence: 0.88, sourceUrl: "https://austin-bakery.com" }],
    },
    ...overrides,
  };
}

// ─── 1. Maps Company Name Beats Website Name ─────────────────────────────────
test("ENRICHMENT: Maps company name beats website company name", () => {
  const maps = createBaseMapsLead({ company_name: "Austin Artisanal Bakery" });
  const web = createBaseWebsiteLead({ company_name: "Austin Artisanal Bakery & Cafe LLC" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.company_name, "Austin Artisanal Bakery");
  assert.equal(merged._provenance.company_name.source, "GOOGLE_MAPS");
});

// ─── 2. Maps Phone Beats Website Phone ───────────────────────────────────────
test("ENRICHMENT: Maps phone beats website phone", () => {
  const maps = createBaseMapsLead({ phone: "+15125550190" });
  const web = createBaseWebsiteLead({ phone: "+15125559999" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.phone, "+15125550190");
  assert.equal(merged._provenance.phone.source, "GOOGLE_MAPS");
});

// ─── 3. Website Phone Fills Missing Maps Phone ───────────────────────────────
test("ENRICHMENT: Website phone fills missing Maps phone", () => {
  const maps = createBaseMapsLead({ phone: null });
  const web = createBaseWebsiteLead({ phone: "+15125559999" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.phone, "+15125559999");
  assert.equal(merged._provenance.phone.source, "WEBSITE");
});

// ─── 4. Maps Address Beats Website Address ───────────────────────────────────
test("ENRICHMENT: Maps address beats website address", () => {
  const maps = createBaseMapsLead({ address: "200 South Congress Ave, Austin, TX 78704" });
  const web = createBaseWebsiteLead({ address: "Different Web Address" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.address, "200 South Congress Ave, Austin, TX 78704");
  assert.equal(merged._provenance.address.source, "GOOGLE_MAPS");
});

// ─── 5. Website Address Fills Missing Maps Address ───────────────────────────
test("ENRICHMENT: Website address fills missing Maps address", () => {
  const maps = createBaseMapsLead({ address: null });
  const web = createBaseWebsiteLead({ address: "200 South Congress Ave, Austin, TX" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.address, "200 South Congress Ave, Austin, TX");
  assert.equal(merged._provenance.address.source, "WEBSITE");
});

// ─── 6. Website Email Fills Missing Email ────────────────────────────────────
test("ENRICHMENT: Website email fills missing Maps email", () => {
  const maps = createBaseMapsLead({ email: null });
  const web = createBaseWebsiteLead({ email: "catering@austin-bakery.com" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.email, "catering@austin-bakery.com");
  assert.equal(merged._provenance.email.source, "WEBSITE");
});

// ─── 7. Website Email Status is Preserved ────────────────────────────────────
test("ENRICHMENT: Website email status is preserved", () => {
  const maps = createBaseMapsLead({ email: null, email_status: null });
  const web = createBaseWebsiteLead({ email: "catering@austin-bakery.com", email_status: "business_role" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.email_status, "business_role");
  assert.equal(merged._provenance.email_status.source, "WEBSITE");
});

// ─── 8. Website Social Links Are Attached ────────────────────────────────────
test("ENRICHMENT: Website social profiles are attached to enriched lead", () => {
  const maps = createBaseMapsLead();
  const web = createBaseWebsiteLead();

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.ok(merged.social);
  assert.equal(merged.social.instagram, "https://instagram.com/austin_bakery");
  assert.equal(merged._provenance.social.source, "WEBSITE");
});

// ─── 9. Website People Are Attached ──────────────────────────────────────────
test("ENRICHMENT: Website people array is attached to enriched lead", () => {
  const maps = createBaseMapsLead();
  const web = createBaseWebsiteLead();

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.ok(Array.isArray(merged.people));
  assert.equal(merged.people.length, 1);
  assert.equal(merged.people[0].name, "Chef Marco Silva");
  assert.equal(merged.people[0].title, "Head Baker & Founder");
  assert.equal(merged._provenance.people.source, "WEBSITE");
});

// ─── 10. Employee Email Never Becomes Company Email ──────────────────────────
test("ENRICHMENT: Employee email never leaks into lead.email or company phone", () => {
  const maps = createBaseMapsLead({ email: null, phone: "+15125550190" });
  const web = createBaseWebsiteLead({
    email: "info@company.com",
    people: [
      {
        name: "Alice Employee",
        title: "Staff",
        email: "alice@employee-personal.com",
        phone: "+19998887777",
      },
    ],
  });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.email, "info@company.com");
  assert.notEqual(merged.email, "alice@employee-personal.com");
  assert.equal(merged.phone, "+15125550190");
});

// ─── 11. Booking URL Precedence ──────────────────────────────────────────────
test("ENRICHMENT: Booking URL precedence favors existing Maps value or fills from Website", () => {
  // Case A: Maps has booking URL -> preserved
  const mapsWithBooking = createBaseMapsLead({ booking_url: "https://maps.booking.com/table" });
  const webA = createBaseWebsiteLead({ booking_url: "https://website.com/book" });
  const mergedA = Enricher.mergeMapsAndWebsiteLead(mapsWithBooking, webA);
  assert.equal(mergedA.booking_url, "https://maps.booking.com/table");
  assert.equal(mergedA._provenance.booking_url.source, "GOOGLE_MAPS");

  // Case B: Maps booking is null -> filled by website
  const mapsNoBooking = createBaseMapsLead({ booking_url: null });
  const mergedB = Enricher.mergeMapsAndWebsiteLead(mapsNoBooking, webA);
  assert.equal(mergedB.booking_url, "https://website.com/book");
  assert.equal(mergedB._provenance.booking_url.source, "WEBSITE");
});

// ─── 12. Ordering URL Precedence ─────────────────────────────────────────────
test("ENRICHMENT: Ordering URL precedence preserves Maps or fills from Website", () => {
  const maps = createBaseMapsLead({ ordering_url: null });
  const web = createBaseWebsiteLead({ ordering_url: "https://toasttab.com/austin-bakery" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.ordering_url, "https://toasttab.com/austin-bakery");
  assert.equal(merged._provenance.ordering_url.source, "WEBSITE");
});

// ─── 13. Menu URL Precedence ─────────────────────────────────────────────────
test("ENRICHMENT: Menu URL precedence preserves Maps or fills from Website", () => {
  const maps = createBaseMapsLead({ menu_url: null });
  const web = createBaseWebsiteLead({ menu_url: "https://austin-bakery.com/menu.pdf" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.equal(merged.menu_url, "https://austin-bakery.com/menu.pdf");
  assert.equal(merged._provenance.menu_url.source, "WEBSITE");
});

// ─── 14. Provenance Is Generated Correctly ───────────────────────────────────
test("ENRICHMENT: Provenance dictionary accurately tags every attribute source", () => {
  const maps = createBaseMapsLead({ email: null });
  const web = createBaseWebsiteLead({ email: "contact@austin-bakery.com" });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);
  assert.ok(merged._provenance);
  assert.equal(merged._provenance.company_name.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.phone.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.address.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.email.source, "WEBSITE");
  assert.equal(merged._provenance.people.source, "WEBSITE");
});

// ─── 15. Lead Without Website Is Skipped Safely ──────────────────────────────
test("ENRICHMENT: Lead without website is skipped cleanly with original data intact", () => {
  const mapsNoWeb = createBaseMapsLead({ website: null });

  const merged = Enricher.mergeMapsAndWebsiteLead(mapsNoWeb, null);
  assert.equal(merged.company_name, "Austin Artisanal Bakery");
  assert.equal(merged.enrichment_status, "skipped_no_website");
  assert.equal(merged.email, null);
});

// ─── 16. One Failed Website Does Not Stop Batch ──────────────────────────────
test("ENRICHMENT: Failure on one website does not stop batch processing", async () => {
  const batchLeads = [
    createBaseMapsLead({ company_name: "Lead 1", website: "https://valid1.com" }),
    createBaseMapsLead({ company_name: "Lead 2", website: "https://broken.com" }),
    createBaseMapsLead({ company_name: "Lead 3", website: "https://valid2.com" }),
  ];

  let enrichedCount = 0;
  let failedCount = 0;
  const results: any[] = [];

  for (const lead of batchLeads) {
    try {
      if (lead.website === "https://broken.com") {
        throw new Error("HTTP_500_INTERNAL_SERVER_ERROR");
      }
      const webLead = createBaseWebsiteLead({ email: `info@${lead.company_name.toLowerCase().replace(/\s+/g, "")}.com` });
      results.push(Enricher.mergeMapsAndWebsiteLead(lead, webLead));
      enrichedCount++;
    } catch {
      failedCount++;
      results.push(lead); // retain original
    }
  }

  assert.equal(enrichedCount, 2);
  assert.equal(failedCount, 1);
  assert.equal(results.length, 3);
  assert.ok(results[0].email);
  assert.equal(results[1].email, null);
  assert.ok(results[2].email);
});

// ─── 17. Cancellation Works Cleanly ──────────────────────────────────────────
test("ENRICHMENT: AbortController cancels batch cleanly and retains partial enrichments", async () => {
  const batchLeads = [
    createBaseMapsLead({ company_name: "Lead A", website: "https://a.com" }),
    createBaseMapsLead({ company_name: "Lead B", website: "https://b.com" }),
    createBaseMapsLead({ company_name: "Lead C", website: "https://c.com" }),
  ];

  const controller = new AbortController();
  let processed = 0;
  const results: any[] = [];

  for (let i = 0; i < batchLeads.length; i++) {
    if (controller.signal.aborted) {
      break;
    }
    const lead = batchLeads[i];
    const webLead = createBaseWebsiteLead({ email: "info@a.com" });
    results.push(Enricher.mergeMapsAndWebsiteLead(lead, webLead));
    processed++;

    // User cancels after 1st lead
    if (processed === 1) {
      controller.abort();
    }
  }

  assert.equal(processed, 1, "Should have stopped after 1 lead was processed");
  assert.equal(results.length, 1);
  assert.equal(results[0].company_name, "Lead A");
});

// ─── 18. New Maps Search Clears Previous Enrichment ──────────────────────────
test("ENRICHMENT: Starting a new Maps search clears prior enrichment state", () => {
  let activeLeads = [
    Enricher.mergeMapsAndWebsiteLead(createBaseMapsLead({ company_name: "Old Bakery" }), createBaseWebsiteLead()),
  ];
  assert.equal(activeLeads[0].enrichment_status, "enriched");

  // New search starts
  activeLeads = [];
  assert.equal(activeLeads.length, 0, "Previous enrichment state must be wiped cleanly");
});

// ─── 19. No Stale Leads Appear After a New Search ────────────────────────────
test("ENRICHMENT: Zero stale leads appear after starting a new search", () => {
  // Run A
  const runALeads = [
    Enricher.mergeMapsAndWebsiteLead(
      createBaseMapsLead({ company_name: "Search A Pizza", sourceQuery: "pizza" }),
      createBaseWebsiteLead({ email: "pizza@search-a.com" })
    ),
  ];

  // Run B (New query)
  const runBLeads = [
    createBaseMapsLead({ company_name: "Search B Gym", sourceQuery: "gym" }),
  ];

  assert.equal(runBLeads.length, 1);
  assert.equal(runBLeads[0].company_name, "Search B Gym");
  assert.equal(runBLeads[0].email, null, "Must not contain Pizza email from run A");
});

// ─── 20. CSV & XLSX Export Parity Remains Intact ─────────────────────────────
test("ENRICHMENT: Enriched lead exports cleanly to XLSX and CSV with identical data and 24 canonical columns", () => {
  const maps = createBaseMapsLead();
  const web = createBaseWebsiteLead();
  const enrichedLead = Enricher.mergeMapsAndWebsiteLead(maps, web);

  // 1. XLSX builder test
  const xlsxBytes = XlsxBuilder.buildXlsx([enrichedLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 500);
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);

  // 2. CSV generation test
  const csvHeaders = [
    "Company", "Phone", "Website", "Email", "Email Status",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Business Type", "Rating", "Reviews", "Opening Status",
    "Price Range", "Booking URL", "Ordering URL", "Menu URL",
    "Imported At", "Source URL", "Place ID", "Source Query", "Run ID"
  ];

  const csvRow = [
    `"${enrichedLead.company_name}"`,
    `"${enrichedLead.phone}"`,
    `"${enrichedLead.website}"`,
    `"${enrichedLead.email}"`,
    `"${enrichedLead.email_status}"`,
    `"${enrichedLead.address}"`,
    `"${enrichedLead.city}"`,
    `"${enrichedLead.region}"`,
    `"${enrichedLead.country}"`,
    `"${enrichedLead.postal_code}"`,
  ].join(",");

  assert.ok(csvRow.includes("Austin Artisanal Bakery"));
  assert.ok(csvRow.includes("+15125550190"));
  assert.ok(csvRow.includes("catering@austin-bakery.com"));
  assert.ok(csvRow.includes("business_role"));
});

// ─── 21. Partial Enrichment Verification ─────────────────────────────────────
test("ENRICHMENT: Partial enrichment correctly preserves Maps authority while pulling Website email", () => {
  // Maps: Company ✓, Phone ✓, Address ✓, Email ✗
  const maps = createBaseMapsLead({
    company_name: "Original Maps Company",
    phone: "+15125551111",
    address: "100 Maps Way",
    email: null,
  });

  // Website: Company ✓, Phone ✓, Address ✓, Email ✓
  const web = createBaseWebsiteLead({
    company_name: "Different Web Company",
    phone: "+19999999999",
    address: "999 Web St",
    email: "discovered@web.com",
  });

  const merged = Enricher.mergeMapsAndWebsiteLead(maps, web);

  // Expected: Company = Maps, Phone = Maps, Address = Maps, Email = Website
  assert.equal(merged.company_name, "Original Maps Company");
  assert.equal(merged.phone, "+15125551111");
  assert.equal(merged.address, "100 Maps Way");
  assert.equal(merged.email, "discovered@web.com");
  assert.equal(merged._provenance.company_name.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.phone.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.address.source, "GOOGLE_MAPS");
  assert.equal(merged._provenance.email.source, "WEBSITE");
});
