import test from "node:test";
import assert from "node:assert/strict";

// Ensure self is defined in Node environment before loading extension UMD scripts
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
await import("../../extension/shared/schema.js");
await import("../../extension/content/website/website-adapter.js");

const Confidence = (globalThis as any).RamosConfidence;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;

// ─── SUITE 1: STRONG VS WEAK CANDIDATES ─────────────────────────────────────

test("CONFIDENCE: Strongly prefers structured & protocol sources over weak regex fallbacks", () => {
  const strongEmail = {
    field: "email",
    value: "support@acme.com",
    source: "mailto",
    evidence_type: "mailto-protocol",
    page_type: "CONTACT",
    classification: "business_role",
  };
  const weakEmail = {
    field: "email",
    value: "contact-old@acme.com",
    source: "regex-fallback",
    evidence_type: "body-regex-fallback",
    page_type: "BLOG",
  };

  const scoreStrong = Confidence.computeInitialConfidence(strongEmail);
  const scoreWeak = Confidence.computeInitialConfidence(weakEmail);

  assert.ok(scoreStrong > 0.95, `Expected strong email score > 0.95, got ${scoreStrong}`);
  assert.ok(scoreWeak < 0.60, `Expected weak email score < 0.60, got ${scoreWeak}`);

  const strongPhone = {
    field: "phone",
    value: "+18005550199",
    source: "tel",
    evidence_type: "tel-protocol",
    page_type: "CONTACT",
  };
  const weakPhone = {
    field: "phone",
    value: "+18005550000",
    source: "regex-fallback",
    evidence_type: "body-regex-fallback",
    page_type: "GENERIC",
  };

  const phoneStrongScore = Confidence.computeInitialConfidence(strongPhone);
  const phoneWeakScore = Confidence.computeInitialConfidence(weakPhone);

  assert.ok(phoneStrongScore > 0.95);
  assert.ok(phoneWeakScore <= 0.60);
});

// ─── SUITE 2: CONFLICT RESOLUTION ACROSS PAGES ──────────────────────────────

test("CONFIDENCE: Resolves conflicting emails across pages and retains all candidates in evidence", () => {
  const candidates = [
    {
      field: "email",
      value: "info@acme.com",
      source: "mailto",
      sourceUrl: "https://acme.com/about",
      page_url: "https://acme.com/about",
      page_type: "ABOUT",
      pageType: "ABOUT",
      confidence: 0.90,
      classification: "business_role",
    },
    {
      field: "email",
      value: "sales@acme.com",
      source: "mailto",
      sourceUrl: "https://acme.com/contact",
      page_url: "https://acme.com/contact",
      page_type: "CONTACT",
      pageType: "CONTACT",
      confidence: 0.98,
      classification: "business_role",
    },
  ];

  const { winner, ranked } = Confidence.resolveFieldConflict(candidates);

  assert.ok(winner);
  assert.equal(winner.value, "sales@acme.com", "Contact page candidate must win conflict");
  assert.equal(ranked.length, 2, "Both candidates must be retained in ranked list");
  assert.equal(ranked[0].value, "sales@acme.com");
  assert.equal(ranked[1].value, "info@acme.com");
});

test("CONFIDENCE: Resolves conflicting phone numbers across pages favoring contact page", () => {
  const candidates = [
    {
      field: "phone",
      value: "+15551112222",
      source: "semantic-dom",
      sourceUrl: "https://acme.com/blog",
      page_type: "BLOG",
      confidence: 0.70,
    },
    {
      field: "phone",
      value: "+18005551234",
      source: "tel",
      sourceUrl: "https://acme.com/contact",
      page_type: "CONTACT",
      confidence: 0.98,
    },
  ];

  const { winner, ranked } = Confidence.resolveFieldConflict(candidates);

  assert.ok(winner);
  assert.equal(winner.value, "+18005551234");
  assert.equal(ranked.length, 2);
});

// ─── SUITE 3: REPETITION & CORROBORATION BOOST ──────────────────────────────

test("CONFIDENCE: Increases confidence when the same value is seen across independent pages", () => {
  const singleCandidate = [
    {
      field: "phone",
      value: "+18005551234",
      source: "semantic-dom",
      sourceUrl: "https://acme.com/page-1",
      page_url: "https://acme.com/page-1",
      confidence: 0.85,
    },
  ];

  const repeatedCandidates = [
    {
      field: "phone",
      value: "+18005551234",
      source: "semantic-dom",
      sourceUrl: "https://acme.com/page-1",
      page_url: "https://acme.com/page-1",
      confidence: 0.85,
    },
    {
      field: "phone",
      value: "+18005551234",
      source: "semantic-dom",
      sourceUrl: "https://acme.com/page-2",
      page_url: "https://acme.com/page-2",
      confidence: 0.85,
    },
    {
      field: "phone",
      value: "+18005551234",
      source: "tel",
      sourceUrl: "https://acme.com/page-3",
      page_url: "https://acme.com/page-3",
      confidence: 0.85,
    },
  ];

  const scoreBefore = singleCandidate[0].confidence;
  const corroborated = Confidence.applyCorroboration(repeatedCandidates);

  assert.ok(corroborated[0].confidence > scoreBefore, "Corroborated candidate should receive score boost");
  assert.ok(corroborated[0].corroboration);
  assert.equal(corroborated[0].corroboration.uniquePageCount, 3);
  assert.equal(corroborated[0].corroboration.uniqueSourceCount, 2);
});

// ─── SUITE 4: JSON-LD VS DOM CONFLICT ───────────────────────────────────────

test("CONFIDENCE: Deterministically resolves JSON-LD vs DOM conflict favoring JSON-LD", () => {
  const candidates = [
    {
      field: "company_name",
      value: "Acme Innovations Group",
      source: "json-ld",
      evidence_type: "json-ld-organization",
      confidence: 0.98,
    },
    {
      field: "company_name",
      value: "Acme Corp",
      source: "semantic-dom",
      evidence_type: "footer-branding",
      confidence: 0.80,
    },
  ];

  const { winner } = Confidence.resolveFieldConflict(candidates);
  assert.ok(winner);
  assert.equal(winner.value, "Acme Innovations Group");
  assert.equal(winner.source, "json-ld");
});

// ─── SUITE 5: REJECTION OF LOW-CONFIDENCE & PLACEHOLDERS ────────────────────

test("CONFIDENCE: Filters out below-threshold candidates and prevents hallucination", () => {
  const candidates = [
    {
      field: "email",
      value: "user@example.com",
      source: "regex-fallback",
      confidence: 0.35, // below 0.45 threshold
    },
  ];

  const { winner, ranked } = Confidence.resolveFieldConflict(candidates);
  assert.equal(winner, null, "Below-threshold candidate must be rejected");
  assert.equal(ranked.length, 0);
});

// ─── SUITE 6: CONFIDENCE BOUNDARIES ─────────────────────────────────────────

test("CONFIDENCE: Confines all computed scores to 0.00 - 1.00", () => {
  const maxCandidate = {
    field: "email",
    value: "sales@acme.com",
    source: "json-ld",
    evidence_type: "json-ld-organization",
    page_type: "CONTACT",
    classification: "business_role",
  };
  const maxScore = Confidence.computeInitialConfidence(maxCandidate);
  assert.ok(maxScore <= 1.00 && maxScore >= 0.00);

  const minCandidate = {
    field: "email",
    value: "anon@freemail.com",
    source: "regex-fallback",
    page_type: "LEGAL",
    classification: "freemail",
  };
  const minScore = Confidence.computeInitialConfidence(minCandidate);
  assert.ok(minScore <= 1.00 && minScore >= 0.00);
});

// ─── SUITE 7: END-TO-END ADAPTER RESOLUTION & PROVENANCE ────────────────────

test("WEBSITE ADAPTER: Retains full candidate provenance, corroboration, and field rankings", async () => {
  // Mock page fetcher with conflicting multi-page website data
  const pages: Record<string, any> = {
    "https://matrix-labs.com": {
      url: "https://matrix-labs.com",
      baseUrl: "https://matrix-labs.com",
      document: {
        querySelectorAll: (sel: string) => {
          if (sel.includes("title")) {
            return [{ textContent: "Matrix Labs Inc — Advanced Materials" }];
          }
          if (sel.includes("a[href]")) {
            return [
              {
                getAttribute: (k: string) => (k === "href" ? "/contact" : null),
                textContent: "Contact Us",
                parentElement: { tagName: "NAV", parentElement: null },
              },
              {
                getAttribute: (k: string) => (k === "href" ? "/about" : null),
                textContent: "About Us",
                parentElement: { tagName: "NAV", parentElement: null },
              },
            ];
          }
          return [];
        },
        querySelector: () => null,
      },
    },
    "https://matrix-labs.com/contact": {
      url: "https://matrix-labs.com/contact",
      baseUrl: "https://matrix-labs.com/contact",
      document: {
        querySelectorAll: (sel: string) => {
          if (sel.includes("a[href^=\"mailto:\"]")) {
            return [
              {
                getAttribute: (k: string) => (k === "href" ? "mailto:sales@matrix-labs.com" : null),
                textContent: "Email Sales",
                parentElement: null,
              },
            ];
          }
          if (sel.includes("a[href^=\"tel:\"]")) {
            return [
              {
                getAttribute: (k: string) => (k === "href" ? "tel:+16505550199" : null),
                textContent: "Call Headquarters",
                parentElement: null,
              },
            ];
          }
          return [];
        },
        querySelector: () => null,
      },
    },
    "https://matrix-labs.com/about": {
      url: "https://matrix-labs.com/about",
      baseUrl: "https://matrix-labs.com/about",
      document: {
        querySelectorAll: (sel: string) => {
          if (sel.includes("a[href^=\"mailto:\"]")) {
            return [
              {
                getAttribute: (k: string) => (k === "href" ? "mailto:info@matrix-labs.com" : null),
                textContent: "General Info",
                parentElement: null,
              },
            ];
          }
          return [];
        },
        querySelector: () => null,
      },
    },
  };

  const lead = await WebsiteAdapter.crawlWebsite(
    "https://matrix-labs.com",
    { maxPages: 5, maxDepth: 2, enableEarlyExit: false },
    async (url: string) => pages[url] || null
  );

  // 1. Conflict resolution: sales@matrix-labs.com from /contact must win over info@matrix-labs.com from /about
  assert.equal(lead.email, "sales@matrix-labs.com");
  assert.equal(lead.phone, "+16505550199");

  // 2. Full evidence preservation: both emails must exist in lead._evidence
  const emailEvidences = lead._evidence.filter((e: any) => e.field === "email");
  assert.ok(emailEvidences.length >= 2);
  assert.ok(emailEvidences.some((e: any) => e.value === "sales@matrix-labs.com"));
  assert.ok(emailEvidences.some((e: any) => e.value === "info@matrix-labs.com"));

  // 3. Provenance structure check
  const salesEv = emailEvidences.find((e: any) => e.value === "sales@matrix-labs.com");
  assert.ok(salesEv.sourceUrl || salesEv.page_url);
  assert.ok(salesEv.sourceType || salesEv.source);
  assert.ok(salesEv.method || salesEv.evidence_type);
  assert.ok(salesEv.confidence > 0.90);
  assert.equal(salesEv.validated, true);

  // 4. Field Rankings check
  assert.ok(lead._fieldRankings);
  assert.ok(lead._fieldRankings.email);
  assert.equal(lead._fieldRankings.email[0].value, "sales@matrix-labs.com");
});
