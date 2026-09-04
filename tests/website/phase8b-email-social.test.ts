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

const Validators = (globalThis as any).RamosWebsiteValidators;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;

test("PHASE 8B [1]: Email functional classification classifies sales, support, general, marketing, careers", () => {
  const domain = "acme.com";
  assert.equal(Validators.evaluateEmail("sales@acme.com", domain).emailRole, "sales");
  assert.equal(Validators.evaluateEmail("inquiries@acme.com", domain).emailRole, "sales");
  assert.equal(Validators.evaluateEmail("support@acme.com", domain).emailRole, "support");
  assert.equal(Validators.evaluateEmail("billing@acme.com", domain).emailRole, "support");
  assert.equal(Validators.evaluateEmail("info@acme.com", domain).emailRole, "general");
  assert.equal(Validators.evaluateEmail("contact@acme.com", domain).emailRole, "general");
  assert.equal(Validators.evaluateEmail("press@acme.com", domain).emailRole, "marketing");
  assert.equal(Validators.evaluateEmail("careers@acme.com", domain).emailRole, "careers");
  assert.equal(Validators.evaluateEmail("jobs@acme.com", domain).emailRole, "careers");
  assert.equal(Validators.evaluateEmail("sarah.jenkins@acme.com", domain).emailRole, "direct");
});

test("PHASE 8B [2]: Deterministic primary email selects sales/contact over support/careers", () => {
  const candidates = [
    { field: "email", value: "careers@techcorp.com", confidence: 0.85, page_url: "https://techcorp.com/careers" },
    { field: "email", value: "support@techcorp.com", confidence: 0.85, page_url: "https://techcorp.com/support" },
    { field: "email", value: "sales@techcorp.com", confidence: 0.85, page_url: "https://techcorp.com/contact" },
  ];

  const lead = WebsiteAdapter.buildCanonicalLead(
    { email: candidates[2] },
    "https://techcorp.com",
    candidates,
    { people: [] }
  );

  assert.equal(lead.email, "sales@techcorp.com", "Canonical email should be sales@techcorp.com");
  assert.ok(lead.additional_emails.includes("support@techcorp.com"));
  assert.ok(lead.additional_emails.includes("careers@techcorp.com"));
  assert.equal(lead.emails.length, 3, "All 3 valid corporate emails must be preserved");
});

test("PHASE 8B [3]: Employee emails remain isolated and never become company email", () => {
  const candidates = [
    { field: "email", value: "info@lawfirm.com", confidence: 0.85, page_url: "https://lawfirm.com" },
    { field: "email", value: "partner.davis@lawfirm.com", confidence: 0.95, page_url: "https://lawfirm.com/team" },
  ];

  const people = [
    { name: "Partner Davis", title: "Senior Partner", email: "partner.davis@lawfirm.com", linkedin_url: null },
  ];

  const lead = WebsiteAdapter.buildCanonicalLead(
    { email: candidates[1] }, // Even if candidate 1 had high confidence
    "https://lawfirm.com",
    candidates,
    { people }
  );

  assert.equal(lead.email, "info@lawfirm.com", "Company email must not be an employee email");
  assert.equal(lead.decision_maker_name, "Partner Davis");
  assert.equal(lead.decision_maker_email, "partner.davis@lawfirm.com");
  assert.equal(lead.additional_emails.includes("partner.davis@lawfirm.com"), false, "Employee email must not leak into additional_emails");
});

test("PHASE 8B [4]: Company social profile normalization strips tracking params and deduplicates", () => {
  const rawUrl = "https://www.linkedin.com/company/acme-corp/?utm_source=footer&utm_medium=web#about";
  const normalized = Validators.normalizeSocialUrl(rawUrl, "linkedin");
  assert.equal(normalized, "https://www.linkedin.com/company/acme-corp");

  const xUrl = "https://twitter.com/acmecorp?lang=en";
  const normX = Validators.normalizeSocialUrl(xUrl, "twitter");
  assert.equal(normX, "https://twitter.com/acmecorp");
});

test("PHASE 8B [5]: Conflicting phone numbers preserved as primary + additional_phones", () => {
  const candidates = [
    { field: "phone", value: "+1-415-555-0100", confidence: 0.90, page_url: "https://shop.com/contact" },
    { field: "phone", value: "+1-800-555-0199", confidence: 0.80, page_url: "https://shop.com" },
  ];

  const lead = WebsiteAdapter.buildCanonicalLead(
    { phone: candidates[0] },
    "https://shop.com",
    candidates,
    { people: [] }
  );

  assert.ok(lead.phone.replace(/\D/g, "").includes("4155550100"), "Primary phone should be 415-555-0100");
  assert.equal(lead.additional_phones.length, 1);
  assert.ok(lead.additional_phones[0].replace(/\D/g, "").includes("8005550199"));
});
