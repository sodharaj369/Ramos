import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

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
await import("../../extension/content/website/lead-scorer.js");
await import("../../extension/shared/schema.js");
await import("../../extension/content/website/website-adapter.js");
await import("../../extension/content/website/enricher.js");

const LeadScorer = (globalThis as any).RamosLeadScorer;
const PeopleExtractor = (globalThis as any).RamosPeopleExtractor;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;
const Enricher = (globalThis as any).RamosWebsiteEnricher;

test("PHASE 8A [1]: Seniority ranking ranks Owner/Founder/CEO highest", () => {
  const people = [
    { name: "John Doe", title: "Dental Assistant", email: "john@clinic.com", linkedin_url: null },
    { name: "Sarah Connor", title: "Founder & Chief Executive Officer", email: "sarah@clinic.com", linkedin_url: "https://linkedin.com/in/sarah" },
    { name: "David Miller", title: "Office Manager", email: "david@clinic.com", linkedin_url: null },
    { name: "Alice Cooper", title: "VP of Operations", email: "alice@clinic.com", linkedin_url: null },
  ];

  const ranked = PeopleExtractor.rankPeopleBySeniority(people);
  assert.equal(ranked[0].name, "Sarah Connor", "Top decision maker should be Founder & CEO");
  assert.equal(ranked[1].name, "Alice Cooper", "Second decision maker should be VP of Operations");
  assert.equal(ranked[2].name, "David Miller", "Third decision maker should be Office Manager");
  assert.equal(ranked[3].name, "John Doe", "Last should be Assistant");
  assert.ok(ranked[0].seniorityScore >= 0.95);
  assert.ok(ranked[3].seniorityScore <= 0.50);
});

test("PHASE 8A [2]: Decision maker flat CRM fields populated on lead", () => {
  const people = [
    { name: "Marcus Vance", title: "Managing Partner", email: "marcus@law.com", linkedin_url: "https://linkedin.com/in/marcus-vance" },
    { name: "Elena Rostova", title: "Associate Attorney", email: "elena@law.com", linkedin_url: "https://linkedin.com/in/elena-rostova" },
  ];

  const dm = PeopleExtractor.selectPrimaryDecisionMaker(people);
  assert.ok(dm, "Primary decision maker should be selected");
  assert.equal(dm.name, "Marcus Vance");
  assert.equal(dm.title, "Managing Partner");
  assert.equal(dm.email, "marcus@law.com");
  assert.equal(dm.linkedin_url, "https://linkedin.com/in/marcus-vance");
});

test("PHASE 8A [3]: Empty people array results in null decision maker fields", () => {
  const dm = PeopleExtractor.selectPrimaryDecisionMaker([]);
  assert.equal(dm, null);
});

test("PHASE 8A [4]: Lead scorer produces deterministic 0-100 score and quality tiers", () => {
  // High quality lead (all key fields + decision maker + social)
  const highLead = {
    company_name: "Apex Solutions",
    phone: "+1-415-555-0199",
    email: "contact@apexsolutions.com",
    website: "https://apexsolutions.com",
    address: "100 Market St, San Francisco, CA 94105",
    social: { linkedin: "https://linkedin.com/company/apex-solutions" },
    people: [{ name: "Sarah Connor", title: "Founder & CEO", email: "sarah@apexsolutions.com", seniorityScore: 1.0 }],
    decision_maker_name: "Sarah Connor",
    decision_maker_title: "Founder & CEO",
    _provenance: {
      phone: { source: "GOOGLE_MAPS" },
      address: { source: "GOOGLE_MAPS" },
      email: { source: "WEBSITE" },
    },
  };

  const resultHigh = LeadScorer.computeLeadScore(highLead);
  assert.ok(resultHigh.score >= 80, `High score expected >= 80, got ${resultHigh.score}`);
  assert.equal(resultHigh.tier, "HIGH");
  assert.ok(resultHigh.breakdown.company_name > 0);
  assert.ok(resultHigh.breakdown.phone > 0);
  assert.ok(resultHigh.breakdown.email > 0);
  assert.ok(resultHigh.breakdown.decision_maker > 0);

  // Medium quality lead (company, phone, website, address, but no email or decision maker)
  const medLead = {
    company_name: "Apex Solutions",
    phone: "+1-415-555-0199",
    email: null,
    website: "https://apexsolutions.com",
    address: "100 Market St, San Francisco, CA 94105",
    social: {},
    people: [],
    decision_maker_name: null,
  };

  const resultMed = LeadScorer.computeLeadScore(medLead);
  assert.ok(resultMed.score >= 40 && resultMed.score <= 65, `Med score expected 40-65, got ${resultMed.score}`);
  assert.equal(resultMed.tier, "MEDIUM");

  // Low quality lead (only company name)
  const lowLead = {
    company_name: "Mystery Business",
    phone: null,
    email: null,
    website: null,
    address: null,
    social: {},
    people: [],
    decision_maker_name: null,
  };

  const resultLow = LeadScorer.computeLeadScore(lowLead);
  assert.ok(resultLow.score < 40, `Low score expected < 40, got ${resultLow.score}`);
  assert.equal(resultLow.tier, "LOW");
});

test("PHASE 8A [5]: Zero hallucination: missing data always scores zero points", () => {
  const emptyLead = {};
  const res = LeadScorer.computeLeadScore(emptyLead);
  assert.equal(res.score, 0);
  assert.equal(res.tier, "LOW");
  assert.equal(res.breakdown.company_name, 0);
  assert.equal(res.breakdown.email, 0);
  assert.equal(res.breakdown.phone, 0);
  assert.equal(res.breakdown.website, 0);
  assert.equal(res.breakdown.address, 0);
  assert.equal(res.breakdown.social, 0);
  assert.equal(res.breakdown.decision_maker, 0);
  assert.equal(res.breakdown.corroboration, 0);
});

test("PHASE 8A [6]: Lead merger in enricher attaches decision maker fields and lead score", () => {
  const mapsLead = {
    company_name: "Bay Area Law Group",
    phone: "+1-415-555-9000",
    address: "500 Montgomery St, San Francisco, CA",
    website: "https://bayarealaw.com",
    place_id: "ChIJ_test123",
  };

  const websiteLead = {
    company_name: "Bay Area Law Group",
    website: "https://bayarealaw.com",
    email: "info@bayarealaw.com",
    social: { linkedin: "https://linkedin.com/company/bay-area-law" },
    people: [
      { name: "Robert Green", title: "Senior Partner", email: "rgreen@bayarealaw.com", linkedin_url: "https://linkedin.com/in/rgreen" },
      { name: "Jessica Taylor", title: "Paralegal", email: "jtaylor@bayarealaw.com", linkedin_url: null },
    ],
  };

  const merged = Enricher.mergeMapsAndWebsiteLead(mapsLead, websiteLead);

  assert.equal(merged.decision_maker_name, "Robert Green");
  assert.equal(merged.decision_maker_title, "Senior Partner");
  assert.equal(merged.decision_maker_email, "rgreen@bayarealaw.com");
  assert.equal(merged.decision_maker_linkedin, "https://linkedin.com/in/rgreen");
  assert.equal(merged.people_count, 2);
  assert.ok(merged.lead_score >= 80, `Expected high score, got ${merged.lead_score}`);
  assert.equal(merged.quality_tier, "HIGH");
  assert.ok(merged._provenance.lead_score, "Provenance must include lead_score breakdown");
});
