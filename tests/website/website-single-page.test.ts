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
await import("../../extension/shared/schema.js");
await import("../../extension/content/website/website-adapter.js");

const PageAcquisition = (globalThis as any).RamosPageAcquisition;
const Normalizers = (globalThis as any).RamosWebsiteNormalizers;
const Validators = (globalThis as any).RamosWebsiteValidators;
const PageAnalyzer = (globalThis as any).RamosPageAnalyzer;
const StructuredData = (globalThis as any).RamosStructuredData;
const FieldExtractors = (globalThis as any).RamosFieldExtractors;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;

// --- Lightweight Test DOM Node Implementation ---
class MockElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: MockElement[];

  constructor(tagName: string, attributes: Record<string, string> = {}, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.textContent = textContent;
    this.children = [];
  }

  getAttribute(attr: string) {
    return this.attributes[attr.toLowerCase()] ?? null;
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const matches: MockElement[] = [];
    const lowerSel = selector.toLowerCase().trim();

    const checkNode = (node: MockElement) => {
      let isMatch = false;

      // Tag selector e.g. "title", "address", "footer"
      if (lowerSel === node.tagName.toLowerCase()) {
        isMatch = true;
      }
      // Attribute selector e.g. script[type="application/ld+json"]
      else if (lowerSel.includes("[") && lowerSel.endsWith("]")) {
        const tagPart = lowerSel.split("[")[0];
        const attrPart = lowerSel.slice(lowerSel.indexOf("[") + 1, -1);

        const tagMatch = !tagPart || tagPart === node.tagName.toLowerCase();

        if (tagMatch) {
          if (attrPart.includes("^=")) {
            const [k, v] = attrPart.split("^=");
            const cleanV = v.replace(/["']/g, "");
            const val = node.getAttribute(k);
            if (val && val.toLowerCase().startsWith(cleanV)) isMatch = true;
          } else if (attrPart.includes("=")) {
            const [k, v] = attrPart.split("=");
            const cleanV = v.replace(/["']/g, "");
            const val = node.getAttribute(k);
            if (val && val.toLowerCase() === cleanV) isMatch = true;
          } else {
            if (node.getAttribute(attrPart) !== null) isMatch = true;
          }
        }
      } else if (lowerSel.includes(",")) {
        const parts = lowerSel.split(",").map((p) => p.trim());
        for (const p of parts) {
          if (p === node.tagName.toLowerCase() || (p === "a" && node.tagName === "A")) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) matches.push(node);

      for (const child of node.children) {
        checkNode(child);
      }
    };

    for (const child of this.children) {
      checkNode(child);
    }
    return matches;
  }
}

class MockDocument extends MockElement {
  body: MockElement;

  constructor() {
    super("#DOCUMENT");
    this.body = new MockElement("BODY");
    this.children.push(this.body);
  }
}

// ─── SUITE 1: NORMALIZERS ───────────────────────────────────────────────────

test("NORMALIZERS: Text normalization cleans whitespace & preserves unicode", () => {
  const input = "   Acme    Robotics   \n\t  GmbH  —  Zürich   ";
  const expected = "Acme Robotics GmbH — Zürich";
  assert.equal(Normalizers.normalizeText(input), expected);
});

test("NORMALIZERS: Email normalization trims, lowercases, and strips trailing punctuation", () => {
  assert.equal(Normalizers.normalizeEmail("  Info@AcmeCorp.COM.  "), "info@acmecorp.com");
  assert.equal(Normalizers.normalizeEmail("mailto:Support@Domain.com?subject=Help"), "support@domain.com");
  assert.equal(Normalizers.normalizeEmail("contact@domain.co.uk;"), "contact@domain.co.uk");
});

test("NORMALIZERS: Phone normalization standardizes international and local numbers", () => {
  assert.equal(Normalizers.normalizePhone("tel:+1 (555) 234-5678"), "+15552345678");
  assert.equal(Normalizers.normalizePhone("020 7946 0991"), "020 7946 0991");
  assert.equal(Normalizers.normalizePhone("+44 20 7946 0991"), "+442079460991");
  // Too short
  assert.equal(Normalizers.normalizePhone("12345"), "");
});

test("NORMALIZERS: URL normalization resolves relative links and strips tracking params", () => {
  const base = "https://acme.com/en/";
  const rel = "/contact?utm_source=google&utm_medium=cpc&ref=campaign123";
  const normalized = Normalizers.normalizeUrl(rel, base);
  assert.equal(normalized, "https://acme.com/contact");
});

test("NORMALIZERS: Domain extraction handles www and subdomains", () => {
  assert.equal(Normalizers.normalizeDomain("https://www.acme.com/about"), "acme.com");
  assert.equal(Normalizers.normalizeDomain("http://sub.company.co.uk:8080/"), "sub.company.co.uk");
});

// ─── SUITE 2: VALIDATORS (SYNTAX VS USEFULNESS) ─────────────────────────────

test("VALIDATORS: Distinguishes valid business role accounts from personal & placeholder emails", () => {
  // Business role accounts on matching domain must be accepted and classified
  const role1 = Validators.evaluateEmail("info@acmerobotics.com", "acmerobotics.com");
  assert.equal(role1.isValid, true);
  assert.equal(role1.classification, "business_role");

  const role2 = Validators.evaluateEmail("sales@acmerobotics.com", "acmerobotics.com");
  assert.equal(role2.isValid, true);
  assert.equal(role2.classification, "business_role");

  const ind1 = Validators.evaluateEmail("sarah.connor@acmerobotics.com", "acmerobotics.com");
  assert.equal(ind1.isValid, true);
  assert.equal(ind1.classification, "business_individual");

  // Free personal emails are syntactically valid but classified as freemail
  const free1 = Validators.evaluateEmail("founder123@gmail.com", "acmerobotics.com");
  assert.equal(free1.isValid, true);
  assert.equal(free1.classification, "freemail");

  // Dummy placeholders must be rejected
  const dummy1 = Validators.evaluateEmail("test@example.com", "acmerobotics.com");
  assert.equal(dummy1.isValid, false);
  assert.equal(dummy1.classification, "placeholder");

  const dummy2 = Validators.evaluateEmail("name@domain.com", "acmerobotics.com");
  assert.equal(dummy2.isValid, false);
  assert.equal(dummy2.classification, "placeholder");

  // Image assets false positives must be rejected
  const asset1 = Validators.evaluateEmail("logo@2x.png", "acmerobotics.com");
  assert.equal(asset1.isValid, false);
  assert.equal(asset1.classification, "asset_filename");

  // Vendor tracking scripts must be rejected
  const vendor1 = Validators.evaluateEmail("app@sentry.io", "acmerobotics.com");
  assert.equal(vendor1.isValid, false);
  assert.equal(vendor1.classification, "vendor_tracker");
});

test("VALIDATORS: Phone validator rejects repetitive and invalid sequences", () => {
  assert.equal(Validators.isValidPhone("+1 (555) 234-5678"), true);
  assert.equal(Validators.isValidPhone("+44 20 7946 0991"), true);
  // All zeroes
  assert.equal(Validators.isValidPhone("0000000000"), false);
  // All ones
  assert.equal(Validators.isValidPhone("1111111111"), false);
  // Sequential ascending
  assert.equal(Validators.isValidPhone("1234567890"), false);
  // Too short
  assert.equal(Validators.isValidPhone("12345"), false);
});

test("VALIDATORS: Social profile URLs distinguished from share widgets", () => {
  assert.equal(Validators.isSocialProfileUrl("https://linkedin.com/company/acme-corp", "linkedin"), true);
  assert.equal(Validators.isSocialProfileUrl("https://linkedin.com/shareArticle?url=foo", "linkedin"), false);

  assert.equal(Validators.isSocialProfileUrl("https://twitter.com/acmecorp", "twitter"), true);
  assert.equal(Validators.isSocialProfileUrl("https://twitter.com/intent/tweet?text=hi", "twitter"), false);

  assert.equal(Validators.isSocialProfileUrl("https://facebook.com/acmecorp", "facebook"), true);
  assert.equal(Validators.isSocialProfileUrl("https://facebook.com/sharer/sharer.php?u=foo", "facebook"), false);

  assert.equal(Validators.isSocialProfileUrl("https://instagram.com/acmecorp", "instagram"), true);
  assert.equal(Validators.isSocialProfileUrl("https://instagram.com/p/B12345678", "instagram"), false);
});

// ─── SUITE 3: STRUCTURED DATA (JSON-LD) ──────────────────────────────────────

test("STRUCTURED DATA: Extracts Organization JSON-LD with Tier 1 confidence", () => {
  const mockDoc = new MockDocument();
  const jsonLdScript = new MockElement(
    "SCRIPT",
    { type: "application/ld+json" },
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme Industrial Technologies",
      url: "https://acme-tech.com",
      email: "contact@acme-tech.com",
      telephone: "+1-555-789-0123",
      address: {
        "@type": "PostalAddress",
        streetAddress: "123 Innovation Way",
        addressLocality: "Austin",
        addressRegion: "TX",
        postalCode: "78701",
        addressCountry: "USA",
      },
      sameAs: [
        "https://linkedin.com/company/acme-tech",
        "https://twitter.com/acmetech",
      ],
    })
  );
  mockDoc.children.push(jsonLdScript);

  const candidates = StructuredData.extractStructuredData({
    document: mockDoc,
    url: "https://acme-tech.com",
  });

  assert.ok(candidates.length >= 6);

  const nameCand = candidates.find((c: any) => c.field === "company_name");
  assert.equal(nameCand.value, "Acme Industrial Technologies");
  assert.equal(nameCand.confidence, 0.98);
  assert.equal(nameCand.source, "json-ld");

  const emailCand = candidates.find((c: any) => c.field === "email");
  assert.equal(emailCand.value, "contact@acme-tech.com");
  assert.equal(emailCand.confidence, 0.98);

  const phoneCand = candidates.find((c: any) => c.field === "phone");
  assert.equal(phoneCand.value, "+1-555-789-0123");

  const cityCand = candidates.find((c: any) => c.field === "city");
  assert.equal(cityCand.value, "Austin");
});

// ─── SUITE 4: FIELD EXTRACTORS (MAILTO, TEL, ADDRESS, SOCIAL) ───────────────

test("FIELD EXTRACTORS: Extracts mailto, tel, semantic address, and social links", () => {
  const mockDoc = new MockDocument();

  const mailtoLink = new MockElement("A", { href: "mailto:hello@startup.io?subject=Inquiry" }, "Email Us");
  const telLink = new MockElement("A", { href: "tel:+15559876543" }, "Call Us");
  const linkedInLink = new MockElement("A", { href: "https://linkedin.com/company/startup-io" }, "LinkedIn");
  const calendlyLink = new MockElement("A", { href: "https://calendly.com/startup-io/demo" }, "Book a Demo");
  const addressEl = new MockElement("ADDRESS", {}, "742 Evergreen Terrace, Springfield, OR 97477");

  mockDoc.body.children.push(mailtoLink, telLink, linkedInLink, calendlyLink, addressEl);

  const candidates = FieldExtractors.extractFields({
    document: mockDoc,
    url: "https://startup.io",
  });

  const email = candidates.find((c: any) => c.field === "email");
  assert.equal(email.value, "hello@startup.io");
  assert.equal(email.source, "mailto");
  assert.equal(email.confidence, 0.95);

  const phone = candidates.find((c: any) => c.field === "phone");
  assert.equal(phone.value, "+15559876543");
  assert.equal(phone.source, "tel");

  const linkedin = candidates.find((c: any) => c.field === "linkedin");
  assert.equal(linkedin.value, "https://linkedin.com/company/startup-io");

  const booking = candidates.find((c: any) => c.field === "booking_url");
  assert.equal(booking.value, "https://calendly.com/startup-io/demo");

  const addr = candidates.find((c: any) => c.field === "address");
  assert.ok(addr.value.includes("742 Evergreen Terrace"));
});

// ─── SUITE 5: PAGE ANALYZER & INTENT CLASSIFICATION ─────────────────────────

test("PAGE ANALYZER: Classifies page type and extracts OpenGraph metadata", () => {
  const mockDoc = new MockDocument();
  const titleEl = new MockElement("TITLE", {}, "Contact Acme Corp | Support & Sales");
  const ogSite = new MockElement("META", { property: "og:site_name", content: "Acme Corp" });
  const ogDesc = new MockElement("META", { property: "og:description", content: "World-class robotics engineering." });

  mockDoc.children.push(titleEl, ogSite, ogDesc);

  const analysis = PageAnalyzer.analyzePage({
    document: mockDoc,
    url: "https://acme.com/contact-us",
  });

  assert.equal(analysis.pageType, "CONTACT");
  assert.equal(analysis.openGraph.siteName, "Acme Corp");
  assert.equal(analysis.openGraph.description, "World-class robotics engineering.");
});

// ─── SUITE 6: ADAPTER PIPELINE & PROVENANCE INTEGRITY ───────────────────────

test("WEBSITE ADAPTER: End-to-end single-page extraction maps into Canonical RAMOS Lead with _evidence", () => {
  const mockDoc = new MockDocument();

  // Add Title and Meta
  const titleEl = new MockElement("TITLE", {}, "Apex Solar Solutions — Commercial Energy");
  const ogSite = new MockElement("META", { property: "og:site_name", content: "Apex Solar Solutions" });
  mockDoc.children.push(titleEl, ogSite);

  // Add JSON-LD with company info and address
  const jsonLd = new MockElement(
    "SCRIPT",
    { type: "application/ld+json" },
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Apex Solar Solutions",
      telephone: "+1-800-555-0199",
      email: "info@apexsolar.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "500 Solar Way",
        addressLocality: "Phoenix",
        addressRegion: "AZ",
        postalCode: "85001",
        addressCountry: "USA",
      },
    })
  );
  mockDoc.children.push(jsonLd);

  // Add social link
  const li = new MockElement("A", { href: "https://linkedin.com/company/apex-solar" }, "LinkedIn");
  mockDoc.body.children.push(li);

  const acquired = {
    url: "https://apexsolar.com",
    baseUrl: "https://apexsolar.com",
    sourceType: "rendered_dom",
    document: mockDoc,
    title: "Apex Solar Solutions — Commercial Energy",
    acquiredAt: Date.now(),
  };

  const lead = WebsiteAdapter.extractFromAcquiredPage(acquired);

  // 1. Verify Canonical Lead Model
  assert.equal(lead.company_name, "Apex Solar Solutions");
  assert.equal(lead.phone, "+18005550199");
  assert.equal(lead.email, "info@apexsolar.com");
  assert.equal(lead.email_status, "business_role");
  assert.equal(lead.city, "Phoenix");
  assert.equal(lead.region, "AZ");
  assert.equal(lead.country, "USA");
  assert.equal(lead.postal_code, "85001");
  assert.equal(lead.website, "https://apexsolar.com");
  assert.equal(lead.extraction_mode, "website-single-page");
  assert.equal(lead.social.linkedin, "https://linkedin.com/company/apex-solar");

  // 2. Verify Internal Evidence & Provenance
  assert.ok(Array.isArray(lead._evidence));
  assert.ok(lead._evidence.length > 0);

  // Check that every evidence candidate contains required provenance keys
  for (const ev of lead._evidence) {
    assert.ok(ev.field, "Evidence must declare target field");
    assert.ok(ev.value, "Evidence must declare extracted value");
    assert.ok(ev.source, "Evidence must declare extraction source");
    assert.ok(ev.evidence_type, "Evidence must declare evidence_type");
    assert.ok(typeof ev.confidence === "number", "Evidence must declare numerical confidence");
    assert.ok(ev.confidence >= 0.0 && ev.confidence <= 1.0, "Confidence must be within 0.0 - 1.0");
    assert.ok(ev.page_url, "Evidence must declare origin page_url");
  }

  // Verify email candidate provenance
  const emailEv = lead._evidence.find((e: any) => e.field === "email");
  assert.ok(emailEv);
  assert.equal(emailEv.source, "json-ld");
  assert.equal(emailEv.value, "info@apexsolar.com");
  assert.ok(emailEv.confidence >= 0.95);
});

test("WEBSITE ADAPTER: Conflict resolution favors JSON-LD & Mailto over lower-confidence pattern matches", () => {
  const mockDoc = new MockDocument();

  // Tier 1: Mailto email
  const mailtoEl = new MockElement("A", { href: "mailto:verified-desk@acme.com" }, "Write Desk");
  // Lower tier: body text containing a generic email match
  const bodyText = new MockElement("DIV", {}, "Random quote from our client partner: partner@otherdomain.com");

  mockDoc.body.children.push(mailtoEl, bodyText);

  const acquired = {
    url: "https://acme.com",
    baseUrl: "https://acme.com",
    sourceType: "rendered_dom",
    document: mockDoc,
    title: "Acme",
    acquiredAt: Date.now(),
  };

  const lead = WebsiteAdapter.extractFromAcquiredPage(acquired);

  // High-confidence official mailto must win
  assert.equal(lead.email, "verified-desk@acme.com");
});
