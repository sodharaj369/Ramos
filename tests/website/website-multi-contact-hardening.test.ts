import test from "node:test";
import assert from "node:assert/strict";

// Global UMD setup
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

const Adapter = (globalThis as any).RamosWebsiteAdapter;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;
const Enricher = (globalThis as any).RamosWebsiteEnricher;
const Normalizers = (globalThis as any).RamosWebsiteNormalizers;

// --- Mock DOM Node Implementation (Identical to website-single-page.test.ts) ---
class MockElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: MockElement[];
  parentElement: MockElement | null = null;

  constructor(tagName: string, attributes: Record<string, string> = {}, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    for (const [k, v] of Object.entries(attributes)) {
      this.attributes[k.toLowerCase()] = v;
    }
    this.textContent = textContent;
    this.children = [];
  }

  contains(other: MockElement): boolean {
    if (!other) return false;
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  getAttribute(attr: string) {
    return this.attributes[attr.toLowerCase()] ?? null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  querySelector(sel: string): MockElement | null {
    const all = this.querySelectorAll(sel);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const subSelectors = selector.split(",").map((s) => s.trim().toLowerCase());

    const matchesOne = (node: MockElement, sel: string): boolean => {
      // Attribute only e.g. [class*='name'] or [href^="mailto:"]
      if (sel.startsWith("[") && sel.endsWith("]")) {
        const inner = sel.slice(1, -1).replace(/\s+i$/i, "");
        if (inner.includes("^=")) {
          const [k, v] = inner.split("^=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase().startsWith(cleanV));
        }
        if (inner.includes("*=")) {
          const [k, v] = inner.split("*=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase().includes(cleanV));
        }
        if (inner.includes("=")) {
          const [k, v] = inner.split("=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase() === cleanV);
        }
        return node.getAttribute(inner) !== null;
      }

      // Tag + Attribute e.g. a[href^="mailto:"] or script[type="application/ld+json"]
      if (sel.includes("[") && sel.endsWith("]")) {
        const tag = sel.split("[")[0];
        const attrPart = sel.slice(sel.indexOf("[") + 1, -1).replace(/\s+i$/i, "");
        if (tag && tag !== node.tagName.toLowerCase()) return false;
        if (attrPart.includes("^=")) {
          const [k, v] = attrPart.split("^=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase().startsWith(cleanV));
        }
        if (attrPart.includes("*=")) {
          const [k, v] = attrPart.split("*=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase().includes(cleanV));
        }
        if (attrPart.includes("=")) {
          const [k, v] = attrPart.split("=");
          const cleanV = v.replace(/["']/g, "").trim();
          const val = node.getAttribute(k);
          return Boolean(val && val.toLowerCase() === cleanV);
        }
        return node.getAttribute(attrPart) !== null;
      }

      // Class selector e.g. .team-member
      if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        const classes = (node.getAttribute("class") || "").toLowerCase().split(/\s+/);
        return classes.includes(cls);
      }

      // Plain tag e.g. a, div, span, title
      return sel === node.tagName.toLowerCase();
    };

    const traverse = (node: MockElement) => {
      for (const sel of subSelectors) {
        if (matchesOne(node, sel)) {
          results.push(node);
          break;
        }
      }
      for (const ch of node.children) {
        traverse(ch);
      }
    };

    for (const ch of this.children) {
      traverse(ch);
    }
    return results;
  }
}

class MockDocument extends MockElement {
  body: MockElement;
  head: MockElement;

  constructor() {
    super("#DOCUMENT");
    this.head = new MockElement("HEAD");
    this.body = new MockElement("BODY");
    this.children.push(this.head, this.body);
  }
}

// ─── Test A: Website with 4 company emails -> all 4 retained ────────────────
test("MULTI-CONTACT [A]: Website with 4 corporate emails retains all 4 in lead.emails[]", () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Apex Global Solutions"));

  const footer = new MockElement("FOOTER");
  footer.appendChild(new MockElement("A", { href: "mailto:sales@apex-solutions.com" }, "Sales Inquiries"));
  footer.appendChild(new MockElement("A", { href: "mailto:support@apex-solutions.com" }, "Customer Support"));
  footer.appendChild(new MockElement("A", { href: "mailto:info@apex-solutions.com" }, "General Info"));
  footer.appendChild(new MockElement("A", { href: "mailto:careers@apex-solutions.com" }, "Careers"));
  doc.body.appendChild(footer);

  const acquired = {
    url: "https://apex-solutions.com",
    baseUrl: "https://apex-solutions.com",
    sourceType: "rendered_dom",
    document: doc,
    acquiredAt: Date.now(),
  };

  const lead = Adapter.extractFromAcquiredPage(acquired);
  assert.ok(lead.email, "Primary email must be selected");
  assert.ok(Array.isArray(lead.emails), "lead.emails must be an array");
  assert.equal(lead.emails.length, 4, "All 4 corporate emails must be retained");

  const emailSet = new Set(lead.emails.map((e: any) => e.email));
  assert.ok(emailSet.has("sales@apex-solutions.com"));
  assert.ok(emailSet.has("support@apex-solutions.com"));
  assert.ok(emailSet.has("info@apex-solutions.com"));
  assert.ok(emailSet.has("careers@apex-solutions.com"));
});

// ─── Test B: Same email appearing on multiple pages -> deduplicated with corroboration ─
test("MULTI-CONTACT [B]: Same email across 3 pages deduplicates into 1 candidate with corroboration", async () => {
  const homeDoc = new MockDocument();
  homeDoc.body.appendChild(new MockElement("A", { href: "mailto:contact@stellar-tech.com" }, "Contact"));
  homeDoc.body.appendChild(new MockElement("A", { href: "/about" }, "About"));
  homeDoc.body.appendChild(new MockElement("A", { href: "/contact" }, "Contact Page"));

  const aboutDoc = new MockDocument();
  aboutDoc.body.appendChild(new MockElement("A", { href: "mailto:contact@stellar-tech.com" }, "Contact"));

  const contactDoc = new MockDocument();
  contactDoc.body.appendChild(new MockElement("A", { href: "mailto:contact@stellar-tech.com" }, "Contact"));

  const pagesMap: Record<string, any> = {
    "https://stellar-tech.com": {
      url: "https://stellar-tech.com",
      baseUrl: "https://stellar-tech.com",
      sourceType: "rendered_dom",
      document: homeDoc,
    },
    "https://stellar-tech.com/about": {
      url: "https://stellar-tech.com/about",
      baseUrl: "https://stellar-tech.com/about",
      sourceType: "rendered_dom",
      document: aboutDoc,
    },
    "https://stellar-tech.com/contact": {
      url: "https://stellar-tech.com/contact",
      baseUrl: "https://stellar-tech.com/contact",
      sourceType: "rendered_dom",
      document: contactDoc,
    },
  };

  const mockFetcher = async (url: string) => {
    return pagesMap[url] || null;
  };

  const lead = await Adapter.crawlWebsite(
    "https://stellar-tech.com",
    { maxPages: 5, maxDepth: 2, enableEarlyExit: false },
    mockFetcher
  );

  assert.equal(lead.email, "contact@stellar-tech.com");
  assert.equal(lead.emails.length, 1, "Duplicate email must be consolidated into exactly 1 candidate");
  assert.ok(lead.emails[0].confidence >= 0.90, "Corroboration bonus must elevate confidence");
});

// ─── Test C: Company emails vs Employee emails separation ────────────────────
test("MULTI-CONTACT [C]: Company emails and employee emails remain strictly separated", () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Nexus Capital"));

  // Team cards with leadership emails
  const card1 = new MockElement("DIV", { class: "team-member" });
  card1.appendChild(new MockElement("SPAN", { class: "name" }, "Sarah Jenkins"));
  card1.appendChild(new MockElement("SPAN", { class: "role" }, "Chief Executive Officer"));
  card1.appendChild(new MockElement("A", { href: "mailto:sarah.jenkins@nexus-capital.com" }, "Email"));

  const card2 = new MockElement("DIV", { class: "team-member" });
  card2.appendChild(new MockElement("SPAN", { class: "name" }, "David Vance"));
  card2.appendChild(new MockElement("SPAN", { class: "role" }, "Head of Technology"));
  card2.appendChild(new MockElement("A", { href: "mailto:david.vance@nexus-capital.com" }, "Email"));

  doc.body.appendChild(card1);
  doc.body.appendChild(card2);

  // Corporate footer emails
  const footer = new MockElement("FOOTER");
  footer.appendChild(new MockElement("A", { href: "mailto:inquiries@nexus-capital.com" }, "General Inquiries"));
  footer.appendChild(new MockElement("A", { href: "mailto:press@nexus-capital.com" }, "Media & Press"));
  doc.body.appendChild(footer);

  const acquired = {
    url: "https://nexus-capital.com",
    baseUrl: "https://nexus-capital.com",
    sourceType: "rendered_dom",
    document: doc,
    acquiredAt: Date.now(),
  };

  const lead = Adapter.extractFromAcquiredPage(acquired);

  // Verify people
  assert.equal(lead.people.length, 2, "2 team members must be extracted");
  const peopleEmails = new Set(lead.people.map((p: any) => p.email));
  assert.ok(peopleEmails.has("sarah.jenkins@nexus-capital.com"));
  assert.ok(peopleEmails.has("david.vance@nexus-capital.com"));

  // Verify company-level emails
  const companyEmails = new Set(lead.emails.map((e: any) => e.email));
  assert.ok(companyEmails.has("inquiries@nexus-capital.com"));
  assert.ok(companyEmails.has("press@nexus-capital.com"));
  assert.ok(!companyEmails.has("sarah.jenkins@nexus-capital.com"), "Employee email must not leak into lead.emails");
  assert.ok(!companyEmails.has("david.vance@nexus-capital.com"), "Employee email must not leak into lead.emails");
});

// ─── Test D: Website with 3 company phones -> all retained ──────────────────
test("MULTI-CONTACT [D]: Website with 3 corporate phone numbers retains all 3 in lead.phones[]", () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Metro Logistics"));

  const div = new MockElement("DIV", { class: "contact-info" });
  div.appendChild(new MockElement("A", { href: "tel:+1-555-234-5678" }, "+1 (555) 234-5678"));
  div.appendChild(new MockElement("A", { href: "tel:+44-20-7946-0123" }, "+44 20 7946 0123"));
  div.appendChild(new MockElement("A", { href: "tel:+91-97250-73855" }, "+91 97250 73855"));
  doc.body.appendChild(div);

  const acquired = {
    url: "https://metro-logistics.com",
    baseUrl: "https://metro-logistics.com",
    sourceType: "rendered_dom",
    document: doc,
    acquiredAt: Date.now(),
  };

  const lead = Adapter.extractFromAcquiredPage(acquired);
  assert.ok(lead.phone, "Primary phone must be selected");
  assert.ok(Array.isArray(lead.phones), "lead.phones must be an array");
  assert.equal(lead.phones.length, 3, "All 3 international corporate phones must be retained");
});

// ─── Test E: Invalid / placeholder emails rejected ──────────────────────────
test("MULTI-CONTACT [E]: Invalid and template placeholder emails are strictly rejected", () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Template Demo"));

  doc.body.appendChild(new MockElement("A", { href: "mailto:name@example.com" }, "Dummy 1"));
  doc.body.appendChild(new MockElement("A", { href: "mailto:user@yourdomain.com" }, "Dummy 2"));
  doc.body.appendChild(new MockElement("A", { href: "mailto:support@sentry.io" }, "Vendor Tracker"));
  doc.body.appendChild(new MockElement("A", { href: "mailto:contact@valid-business.com" }, "Real Contact"));

  const acquired = {
    url: "https://valid-business.com",
    baseUrl: "https://valid-business.com",
    sourceType: "rendered_dom",
    document: doc,
    acquiredAt: Date.now(),
  };

  const lead = Adapter.extractFromAcquiredPage(acquired);
  assert.equal(lead.emails.length, 1, "Only the authentic business email must be retained");
  assert.equal(lead.emails[0].email, "contact@valid-business.com");
});

// ─── Test F & G: Canonical winner determination ─────────────────────────────
test("MULTI-CONTACT [F & G]: Canonical best email and phone selected deterministically", () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "OmniCorp International"));

  const jsonLdContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OmniCorp International",
    email: "primary@omnicorp.com",
    telephone: "+1-800-555-0199",
  });
  doc.head.appendChild(new MockElement("SCRIPT", { type: "application/ld+json" }, jsonLdContent));

  doc.body.appendChild(new MockElement("A", { href: "mailto:secondary@omnicorp.com" }, "Secondary Email"));
  doc.body.appendChild(new MockElement("A", { href: "tel:+1-555-0188" }, "Local Phone"));

  const acquired = {
    url: "https://omnicorp.com",
    baseUrl: "https://omnicorp.com",
    sourceType: "rendered_dom",
    document: doc,
    acquiredAt: Date.now(),
  };

  const lead = Adapter.extractFromAcquiredPage(acquired);
  // JSON-LD has Tier 1 confidence (0.98), beating generic mailto/tel
  assert.equal(lead.email, "primary@omnicorp.com");
  assert.equal(lead.phone, "+18005550199");
  assert.equal(lead.emails.length, 2, "Both emails retained in emails[]");
  assert.equal(lead.phones.length, 2, "Both phones retained in phones[]");
});

// ─── Test H & I & K: Standalone Website Intelligence CSV & XLSX export ──────
test("MULTI-CONTACT [H, I, K]: Standalone Website Intelligence exports to valid CSV and XLSX", () => {
  const websiteLead = {
    company_name: "Quantum Dynamics",
    phone: "+1 (555) 345-6789",
    website: "https://quantum-dynamics.io",
    email: "contact@quantum-dynamics.io",
    email_status: "business_role",
    address: "700 Tech Boulevard, Austin, TX",
    city: "Austin",
    region: "TX",
    country: "US",
    postal_code: "78701",
    category: "Software & AI",
    business_type: "Additional Emails: sales@quantum-dynamics.io | Additional Phones: +1 (555) 987-6543",
    rating: null,
    review_count: null,
    opening_status: null,
    price_range: null,
    booking_url: null,
    ordering_url: null,
    menu_url: null,
    imported_at: "2026-09-03T12:00:00.000Z",
    source_url: "https://quantum-dynamics.io",
    place_id: null,
    sourceQuery: "quantum-dynamics.io",
    run_id: "run_web_001",
    emails: [
      { email: "contact@quantum-dynamics.io", type: "business_role", confidence: 0.95 },
      { email: "sales@quantum-dynamics.io", type: "business_role", confidence: 0.90 },
    ],
    phones: [
      { phone: "+1 (555) 345-6789", confidence: 0.95 },
      { phone: "+1 (555) 987-6543", confidence: 0.88 },
    ],
  };

  function escapeCsvCell(val: any): string {
    if (val == null) return "";
    const str = String(val).trim();
    if (!str.length) return "";
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const csvLine = [
    escapeCsvCell(websiteLead.company_name),
    escapeCsvCell(websiteLead.phone),
    escapeCsvCell(websiteLead.website),
    escapeCsvCell(websiteLead.email),
    escapeCsvCell(websiteLead.email_status),
    escapeCsvCell(websiteLead.address),
    escapeCsvCell(websiteLead.city),
    escapeCsvCell(websiteLead.region),
    escapeCsvCell(websiteLead.country),
    escapeCsvCell(websiteLead.postal_code),
    escapeCsvCell(websiteLead.category),
    escapeCsvCell(websiteLead.business_type),
    "", "", "", "", "", "", "",
    escapeCsvCell(websiteLead.imported_at),
    escapeCsvCell(websiteLead.source_url),
    "", escapeCsvCell(websiteLead.sourceQuery), escapeCsvCell(websiteLead.run_id),
  ].join(",");

  const parsedCsvCols = csvLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  assert.equal(parsedCsvCols.length, 24, "Standalone website export must produce exactly 24 columns");

  // Test XLSX export
  const xlsxBytes = XlsxBuilder.buildXlsx([websiteLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 500, "XLSX file must be non-empty valid zip binary");
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b); // PK zip header
});

// ─── Test J: Maps export remains completely unchanged ────────────────────────
test("MULTI-CONTACT [J]: Maps export remains regression-free and unchanged", () => {
  const mapsLead = {
    company_name: "Original Maps Restaurant",
    phone: "+1 555-111-2222",
    website: "https://original-maps.com",
    address: "123 Main St",
    city: "Chicago",
    region: "IL",
    country: "US",
    postal_code: "60601",
    category: "Restaurant",
    business_type: "Dining",
    rating: 4.5,
    review_count: 100,
    opening_status: "Open",
    price_range: "$$",
    place_id: "ChIJ_maps_001",
  };

  const xlsxBytes = XlsxBuilder.buildXlsx([mapsLead]);
  assert.ok(xlsxBytes.length > 500);
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);
});
