import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/people-extractor.js");
await import("../../extension/content/website/lead-scorer.js");
await import("../../extension/shared/deduplicator.js");

const Deduplicator = (globalThis as any).RamosDeduplicator;

test("PHASE 8D [1]: Deduplication matches leads with identical place_id and merges cleanly", () => {
  const leadA = {
    name: "Apex Dentists",
    place_id: "ChIJ_APEX_123",
    phone: "+1 555-123-4567",
    address: "123 Main St, New York, NY",
    website: null,
    rating: 4.8,
    reviews_count: 120,
    email: null,
    additional_emails: [],
    people: [],
    lead_score: 45,
  };

  const leadB = {
    name: "Apex Dental Care",
    place_id: "ChIJ_APEX_123",
    phone: null,
    address: null,
    website: "https://apexdentalcare.com",
    email: "info@apexdentalcare.com",
    additional_emails: ["support@apexdentalcare.com"],
    people: [
      { name: "Dr. Apex", title: "Founder & Dentist", email: "dr@apexdentalcare.com" }
    ],
    lead_score: 55,
  };

  const match = Deduplicator.areDuplicates(leadA, leadB);
  assert.equal(match.isDuplicate, true, "Should identify as duplicates via place_id");
  assert.equal(match.reason, "place_id");

  const merged = Deduplicator.mergeDuplicateLeads(leadA, leadB);
  assert.equal(merged.place_id, "ChIJ_APEX_123");
  assert.equal(merged.name, "Apex Dentists", "Maps name should be preserved");
  assert.equal(merged.phone, "+1 555-123-4567");
  assert.equal(merged.website, "https://apexdentalcare.com");
  assert.equal(merged.email, "info@apexdentalcare.com");
  assert.ok(merged.additional_emails.includes("support@apexdentalcare.com"));
  assert.equal(merged.people.length, 1);
  assert.equal(merged.decision_maker_name, "Dr. Apex");
  assert.ok(merged.lead_score > 60, "Lead score should be recomputed and higher with combined data");
});

test("PHASE 8D [2]: Deduplication matches leads with matching domain and phone", () => {
  const leadA = {
    name: "Blue Ridge Roofing",
    website: "https://blueridgeroofing.com/contact",
    phone: "+1 (555) 789-0123",
    email: "sales@blueridgeroofing.com",
    additional_emails: [],
    people: [],
  };

  const leadB = {
    name: "Blue Ridge Roofing Contractors",
    website: "https://blueridgeroofing.com",
    phone: "555-789-0123",
    email: "contact@blueridgeroofing.com",
    additional_emails: ["billing@blueridgeroofing.com"],
    people: [
      { name: "Mark Vance", title: "Owner", email: "mark@blueridgeroofing.com" }
    ],
  };

  const match = Deduplicator.areDuplicates(leadA, leadB);
  assert.equal(match.isDuplicate, true, "Should match via domain and phone");
  assert.equal(match.reason, "domain_phone");

  const merged = Deduplicator.mergeDuplicateLeads(leadA, leadB);
  assert.equal(merged.email, "sales@blueridgeroofing.com");
  assert.ok(merged.additional_emails.includes("contact@blueridgeroofing.com"));
  assert.ok(merged.additional_emails.includes("billing@blueridgeroofing.com"));
  assert.equal(merged.decision_maker_name, "Mark Vance");
});

test("PHASE 8D [3]: Deduplication matches leads with matching domain and high token name similarity without phone conflicts", () => {
  const leadA = {
    name: "Bright Smile Dental, LLC",
    website: "https://brightsmiledental.org",
    phone: "+1 555-333-4444",
    email: "info@brightsmiledental.org",
    people: [],
  };

  const leadB = {
    name: "Bright Smile Dental Inc",
    website: "https://www.brightsmiledental.org/about-us",
    phone: null,
    email: null,
    people: [],
  };

  const match = Deduplicator.areDuplicates(leadA, leadB);
  assert.equal(match.isDuplicate, true, "Should match via domain and high name similarity");
  assert.equal(match.reason, "domain_name_similarity");
});

test("PHASE 8D [4]: Negative Rule — Never merge businesses based only on similar names if domains or phones differ", () => {
  const leadA = {
    name: "Summit Cafe",
    phone: "+1 555-111-1111",
    website: "https://summitcafeny.com",
    address: "10 Broadway, New York, NY",
    place_id: "ChIJ_NY_1",
  };

  const leadB = {
    name: "Summit Cafe",
    phone: "+1 555-999-9999",
    website: "https://summitcafela.com",
    address: "500 Sunset Blvd, Los Angeles, CA",
    place_id: "ChIJ_LA_2",
  };

  const match = Deduplicator.areDuplicates(leadA, leadB);
  assert.equal(match.isDuplicate, false, "Distinct businesses with different domains/phones/place_ids must NOT be merged");
});

test("PHASE 8D [5]: Negative Rule — Never merge distinct branches of chains sharing corporate domain but having distinct place_ids or phones", () => {
  const branchDowntown = {
    name: "Starbucks",
    place_id: "ChIJ_SBUX_DOWNTOWN",
    phone: "+1 555-100-0001",
    website: "https://www.starbucks.com",
    address: "100 Downtown Ave",
  };

  const branchUptown = {
    name: "Starbucks",
    place_id: "ChIJ_SBUX_UPTOWN",
    phone: "+1 555-200-0002",
    website: "https://www.starbucks.com",
    address: "200 Uptown Way",
  };

  const match = Deduplicator.areDuplicates(branchDowntown, branchUptown);
  assert.equal(match.isDuplicate, false, "Different store branches sharing domain but having distinct place_ids and phones must remain separate");
});

test("PHASE 8D [6]: Batch deduplication processes list and removes duplicates without data loss", () => {
  const rawLeads = [
    {
      name: "Acme Dental",
      place_id: "ChIJ_ACME_1",
      phone: "+1 555-111-2222",
      website: "https://acmedental.com",
      email: "hello@acmedental.com",
      additional_emails: [],
      people: [],
    },
    {
      name: "Baker Plumbing",
      place_id: "ChIJ_BAKER_2",
      phone: "+1 555-333-4444",
      website: "https://bakerplumbing.com",
      email: "service@bakerplumbing.com",
      additional_emails: [],
      people: [],
    },
    {
      // Duplicate of Acme Dental via place_id
      name: "Acme Dental Services",
      place_id: "ChIJ_ACME_1",
      website: "https://acmedental.com",
      email: "sales@acmedental.com",
      additional_emails: ["support@acmedental.com"],
      people: [{ name: "Alice Acme", title: "Managing Partner" }],
    },
    {
      name: "Charlie Consulting",
      place_id: "ChIJ_CHARLIE_3",
      phone: "+1 555-555-6666",
      website: "https://charlieconsulting.com",
      email: "info@charlieconsulting.com",
      additional_emails: [],
      people: [],
    },
  ];

  const result = Deduplicator.deduplicateLeads(rawLeads);
  assert.equal(result.deduplicatedLeads.length, 3, "Should reduce 4 leads to 3 unique leads");
  assert.equal(result.duplicatesRemoved, 1, "Should report exactly 1 duplicate removed");

  const acme = result.deduplicatedLeads.find((l: any) => l.place_id === "ChIJ_ACME_1");
  assert.ok(acme);
  assert.equal(acme.people.length, 1);
  assert.equal(acme.decision_maker_name, "Alice Acme");
  assert.ok(acme.additional_emails.includes("sales@acmedental.com") || acme.email === "sales@acmedental.com");
  assert.ok(acme.additional_emails.includes("support@acmedental.com"));
});
