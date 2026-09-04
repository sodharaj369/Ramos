/**
 * RAMOS Real-World QA & Hardening Suite — Realistic Fixtures
 * 
 * Validates the 12 realistic business website scenarios:
 * 1. One-page business
 * 2. 3-page business
 * 3. 10+ page business
 * 4. Multiple emails (primary + additional emails[])
 * 5. Multiple phones (primary + additional phones[])
 * 6. Multiple social links (actual URLs preserved, no nulls)
 * 7. Team page with several people (employee isolation)
 * 8. No team page
 * 9. No contact page
 * 10. Conflicting JSON-LD / DOM data
 * 11. Broken page (network failure / 500 error resilience)
 * 12. Website with only a few useful pages
 */
import test from "node:test";
import assert from "node:assert/strict";

if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

await import("../../extension/shared/constants.js");
await import("../../extension/shared/schema.js");
await import("../../extension/shared/xlsx-builder.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/structured-data.js");
await import("../../extension/content/website/field-extractors.js");
await import("../../extension/content/website/page-analyzer.js");
await import("../../extension/content/website/page-priority.js");
await import("../../extension/content/website/page-acquisition.js");
await import("../../extension/content/website/people-extractor.js");
await import("../../extension/content/website/crawl-policy.js");
await import("../../extension/content/website/link-discovery.js");
await import("../../extension/content/website/crawl-queue.js");
await import("../../extension/content/website/confidence.js");
await import("../../extension/content/website/website-adapter.js");
await import("../../extension/content/website/enricher.js");

const Adapter = (globalThis as any).RamosWebsiteAdapter;
const Enricher = (globalThis as any).RamosWebsiteEnricher;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

// --- Robust Mock DOM Node Implementation ---
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

  getAttribute(attr: string) {
    return this.attributes[attr.toLowerCase()] ?? null;
  }

  contains(other: MockElement): boolean {
    if (!other) return false;
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
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

    const matchesOne = (node: MockElement, rawSel: string): boolean => {
      let sel = rawSel.trim().toLowerCase();
      // Strip trailing case insensitive flag e.g. [class*='foo' i]
      if (sel.endsWith(" i]")) {
        sel = sel.slice(0, -3) + "]";
      }

      if (sel.startsWith("[") && sel.endsWith("]")) {
        const inner = sel.slice(1, -1);
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

      if (sel.includes("[") && sel.endsWith("]")) {
        const tag = sel.split("[")[0];
        const attrPart = sel.slice(sel.indexOf("[") + 1, -1);
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

      if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        const classes = (node.getAttribute("class") || "").toLowerCase().split(/\s+/);
        return classes.includes(cls);
      }

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

function makeAcquiredPage(url: string, doc: MockDocument) {
  return {
    url,
    baseUrl: url,
    sourceType: "rendered_dom",
    document: doc,
    title: doc.querySelector("title")?.textContent || "",
    acquiredAt: Date.now(),
  };
}

function createPageFetcher(pagesMap: Record<string, any>) {
  return async (url: string) => {
    const cleanUrl = url.split("?")[0].replace(/\/$/, "");
    for (const [k, v] of Object.entries(pagesMap)) {
      const cleanK = k.split("?")[0].replace(/\/$/, "");
      if (cleanUrl === cleanK) return v;
    }
    return null;
  };
}

// ─── 1. ONE-PAGE BUSINESS ────────────────────────────────────────────────────
test("FIXTURE 1: One-page business extracts completely and finishes in 1 page", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Apex Coffee Roasters | Artisanal SF"));
  const jsonLd = new MockElement(
    "SCRIPT",
    { type: "application/ld+json" },
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Apex Coffee Roasters",
      telephone: "+1-415-555-0188",
      email: "hello@apexcoffee.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "456 Castro St",
        addressLocality: "San Francisco",
        addressRegion: "CA",
        postalCode: "94114",
        addressCountry: "US",
      },
    })
  );
  doc.head.appendChild(jsonLd);

  const footer = new MockElement("FOOTER");
  footer.appendChild(new MockElement("A", { href: "mailto:hello@apexcoffee.com" }, "Email Us"));
  footer.appendChild(new MockElement("A", { href: "tel:+14155550188" }, "Call Us"));
  footer.appendChild(new MockElement("A", { href: "https://instagram.com/apexcoffeeroasters" }, "Instagram"));
  doc.body.appendChild(footer);

  const pagesMap: Record<string, any> = {
    "https://apexcoffee.com": makeAcquiredPage("https://apexcoffee.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://apexcoffee.com", { maxPages: 5 }, fetcher);

  assert.equal(lead.company_name, "Apex Coffee Roasters");
  assert.equal(lead.email, "hello@apexcoffee.com");
  assert.ok(lead.phone.includes("4155550188"));
  assert.equal(lead.city, "San Francisco");
  assert.equal(lead.region, "CA");
  assert.equal(lead.social.instagram, "https://instagram.com/apexcoffeeroasters");
  assert.equal(lead._crawlStats.pagesScanned, 1);
});

// ─── 2. 3-PAGE BUSINESS ──────────────────────────────────────────────────────
test("FIXTURE 2: 3-page business stops after visiting its 3 useful pages", async () => {
  const homeDoc = new MockDocument();
  homeDoc.head.appendChild(new MockElement("TITLE", {}, "Trio Legal Group"));
  const nav = new MockElement("NAV");
  nav.appendChild(new MockElement("A", { href: "https://trio-legal.com/about" }, "About Us"));
  nav.appendChild(new MockElement("A", { href: "https://trio-legal.com/contact" }, "Contact"));
  homeDoc.body.appendChild(nav);

  const aboutDoc = new MockDocument();
  aboutDoc.head.appendChild(new MockElement("TITLE", {}, "About Trio Legal"));
  aboutDoc.body.appendChild(new MockElement("P", {}, "Founded in 2012."));

  const contactDoc = new MockDocument();
  contactDoc.head.appendChild(new MockElement("TITLE", {}, "Contact Us"));
  contactDoc.body.appendChild(new MockElement("A", { href: "mailto:inquiries@trio-legal.com" }, "inquiries@trio-legal.com"));
  contactDoc.body.appendChild(new MockElement("A", { href: "tel:+12125550199" }, "(212) 555-0199"));
  contactDoc.body.appendChild(new MockElement("ADDRESS", {}, "100 Broadway, New York, NY 10005"));

  const pagesMap: Record<string, any> = {
    "https://trio-legal.com": makeAcquiredPage("https://trio-legal.com", homeDoc),
    "https://trio-legal.com/about": makeAcquiredPage("https://trio-legal.com/about", aboutDoc),
    "https://trio-legal.com/contact": makeAcquiredPage("https://trio-legal.com/contact", contactDoc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://trio-legal.com", { maxPages: 10 }, fetcher);

  assert.ok(lead.company_name.includes("Trio Legal"));
  assert.equal(lead.email, "inquiries@trio-legal.com");
  assert.ok(lead.phone.includes("2125550199"));
  assert.ok(lead._crawlStats.pagesScanned <= 3, `Expected <= 3 pages, scanned: ${lead._crawlStats.pagesScanned}`);
});

// ─── 3. 10+ PAGE BUSINESS ────────────────────────────────────────────────────
test("FIXTURE 3: 10+ page business respects maxPages ceiling and prioritizes high-value pages", async () => {
  const homeDoc = new MockDocument();
  homeDoc.head.appendChild(new MockElement("TITLE", {}, "MegaCorp Solutions"));
  const nav = new MockElement("NAV");
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/contact" }, "Contact"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/about" }, "About"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/team" }, "Leadership"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/locations" }, "Locations"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/services" }, "Services"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/blog/post-1" }, "Blog 1"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/blog/post-2" }, "Blog 2"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/privacy" }, "Privacy"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/cart" }, "Cart"));
  nav.appendChild(new MockElement("A", { href: "https://megacorp.com/login" }, "Login"));
  homeDoc.body.appendChild(nav);

  const contactDoc = new MockDocument();
  contactDoc.head.appendChild(new MockElement("TITLE", {}, "Contact MegaCorp"));
  contactDoc.body.appendChild(new MockElement("A", { href: "mailto:info@megacorp.com" }, "info@megacorp.com"));
  contactDoc.body.appendChild(new MockElement("A", { href: "tel:+18005550100" }, "1-800-555-0100"));

  const aboutDoc = new MockDocument();
  aboutDoc.head.appendChild(new MockElement("TITLE", {}, "About MegaCorp"));

  const teamDoc = new MockDocument();
  teamDoc.head.appendChild(new MockElement("TITLE", {}, "Leadership"));
  const card1 = new MockElement("DIV", { class: "team-card" });
  card1.appendChild(new MockElement("H3", {}, "Alice Wong"));
  card1.appendChild(new MockElement("SPAN", { class: "title" }, "Chief Executive Officer"));
  const card2 = new MockElement("DIV", { class: "team-card" });
  card2.appendChild(new MockElement("H3", {}, "Bob Smith"));
  card2.appendChild(new MockElement("SPAN", { class: "title" }, "CTO"));
  teamDoc.body.appendChild(card1);
  teamDoc.body.appendChild(card2);

  const pagesMap: Record<string, any> = {
    "https://megacorp.com": makeAcquiredPage("https://megacorp.com", homeDoc),
    "https://megacorp.com/contact": makeAcquiredPage("https://megacorp.com/contact", contactDoc),
    "https://megacorp.com/about": makeAcquiredPage("https://megacorp.com/about", aboutDoc),
    "https://megacorp.com/team": makeAcquiredPage("https://megacorp.com/team", teamDoc),
    "https://megacorp.com/locations": makeAcquiredPage("https://megacorp.com/locations", new MockDocument()),
    "https://megacorp.com/services": makeAcquiredPage("https://megacorp.com/services", new MockDocument()),
  };

  for (let i = 1; i <= 10; i++) {
    pagesMap[`https://megacorp.com/blog/post-${i}`] = makeAcquiredPage(`https://megacorp.com/blog/post-${i}`, new MockDocument());
  }

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://megacorp.com", { maxPages: 5 }, fetcher);

  assert.ok(lead.company_name.includes("MegaCorp"));
  assert.equal(lead.email, "info@megacorp.com");
  assert.ok(lead.phone.includes("8005550100"));
  assert.ok(lead.people.length >= 2, "Extracted team members");
  assert.ok(lead._crawlStats.pagesScanned <= 5, "Strictly capped at maxPages: 5");
});

// ─── 4. MULTIPLE EMAILS ──────────────────────────────────────────────────────
test("FIXTURE 4: Multiple emails produce deterministic primary and additional_emails[]", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "TechCorp Solutions"));
  const body = doc.body;
  body.appendChild(new MockElement("A", { href: "mailto:sales@techcorp.io" }, "sales@techcorp.io"));
  body.appendChild(new MockElement("A", { href: "mailto:support@techcorp.io" }, "support@techcorp.io"));
  body.appendChild(new MockElement("A", { href: "mailto:info@techcorp.io" }, "info@techcorp.io"));

  const pagesMap: Record<string, any> = {
    "https://techcorp.io": makeAcquiredPage("https://techcorp.io", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://techcorp.io", { maxPages: 1 }, fetcher);

  assert.ok(lead.email, "Has primary email");
  assert.ok(Array.isArray(lead.additional_emails), "Has additional_emails array");
  assert.ok(lead.additional_emails.length >= 2, "Contains at least 2 additional emails");
  assert.ok(!lead.additional_emails.includes(lead.email), "Primary email not duplicated in additional_emails");

  // Verify survival in enrichment merge
  const mapsLead = { company_name: "TechCorp Maps", phone: "+1-555-0123" };
  const merged = Enricher.mergeMapsAndWebsiteLead(mapsLead, lead);

  assert.equal(merged.email, lead.email);
  assert.deepEqual(merged.additional_emails, lead.additional_emails);

  // Verify XLSX export
  const xlsxBytes = XlsxBuilder.buildWebsiteXlsx([merged]);
  assert.ok(xlsxBytes.length > 500);
});

// ─── 5. MULTIPLE PHONES ──────────────────────────────────────────────────────
test("FIXTURE 5: Multiple phones produce deterministic primary and additional_phones[]", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Auto Repair Pros"));
  const body = doc.body;
  body.appendChild(new MockElement("A", { href: "tel:+15551112222" }, "(555) 111-2222"));
  body.appendChild(new MockElement("A", { href: "tel:+15553334444" }, "(555) 333-4444"));
  body.appendChild(new MockElement("A", { href: "tel:+15555556666" }, "(555) 555-6666"));

  const pagesMap: Record<string, any> = {
    "https://autorepairpros.com": makeAcquiredPage("https://autorepairpros.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://autorepairpros.com", { maxPages: 1 }, fetcher);

  assert.ok(lead.phone, "Has primary phone");
  assert.ok(Array.isArray(lead.additional_phones), "Has additional_phones array");
  assert.ok(lead.additional_phones.length >= 2, "Contains additional phones");

  // Merge with Maps lead having its own Maps phone
  const mapsLead = { company_name: "Auto Repair Pros", phone: "+1-555-999-0000" };
  const merged = Enricher.mergeMapsAndWebsiteLead(mapsLead, lead);

  // Maps phone preserved as primary
  assert.equal(merged.phone, "+1-555-999-0000");
  // Website phones become additional phones
  assert.ok(merged.additional_phones.length >= 2);
  assert.ok(!merged.additional_phones.includes("+1-555-999-0000"));
});

// ─── 6. MULTIPLE SOCIAL LINKS ────────────────────────────────────────────────
test("FIXTURE 6: Social links store only discovered URLs without null keys", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Brand Hub"));
  const body = doc.body;
  body.appendChild(new MockElement("A", { href: "https://linkedin.com/company/brandhub" }, "LinkedIn"));
  body.appendChild(new MockElement("A", { href: "https://twitter.com/brandhub" }, "Twitter"));
  body.appendChild(new MockElement("A", { href: "https://facebook.com/brandhub" }, "Facebook"));

  const pagesMap: Record<string, any> = {
    "https://brandhub.com": makeAcquiredPage("https://brandhub.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://brandhub.com", { maxPages: 1 }, fetcher);

  assert.equal(lead.social.linkedin, "https://linkedin.com/company/brandhub");
  assert.equal(lead.social.twitter_x, "https://twitter.com/brandhub");
  assert.equal(lead.social.facebook, "https://facebook.com/brandhub");
  assert.equal(lead.social.instagram, undefined, "Undiscovered platforms must not be stored as null");
  assert.equal(lead.social.youtube, undefined);
  assert.equal(lead.social.github, undefined);
});

// ─── 7. TEAM PAGE WITH SEVERAL PEOPLE ────────────────────────────────────────
test("FIXTURE 7: Team page people remain isolated inside people[]", async () => {
  const homeDoc = new MockDocument();
  homeDoc.head.appendChild(new MockElement("TITLE", {}, "Summit Consulting"));
  const nav = new MockElement("NAV");
  nav.appendChild(new MockElement("A", { href: "https://consulting.com/team" }, "Our Team"));
  homeDoc.body.appendChild(nav);

  const teamDoc = new MockDocument();
  teamDoc.head.appendChild(new MockElement("TITLE", {}, "Our Team"));
  const member1 = new MockElement("DIV", { class: "team-card" });
  member1.appendChild(new MockElement("H3", {}, "Dr. Robert Vance"));
  member1.appendChild(new MockElement("SPAN", { class: "title" }, "Managing Director"));
  member1.appendChild(new MockElement("A", { href: "mailto:robert.vance@consulting.com" }, "Email"));
  member1.appendChild(new MockElement("A", { href: "tel:+15554443333" }, "Direct"));

  const member2 = new MockElement("DIV", { class: "team-card" });
  member2.appendChild(new MockElement("H3", {}, "Elena Rostova"));
  member2.appendChild(new MockElement("SPAN", { class: "title" }, "Principal Partner"));
  member2.appendChild(new MockElement("A", { href: "https://linkedin.com/in/elenarostova" }, "LinkedIn"));

  teamDoc.body.appendChild(member1);
  teamDoc.body.appendChild(member2);

  const pagesMap: Record<string, any> = {
    "https://consulting.com": makeAcquiredPage("https://consulting.com", homeDoc),
    "https://consulting.com/team": makeAcquiredPage("https://consulting.com/team", teamDoc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://consulting.com", { maxPages: 5 }, fetcher);

  assert.equal(lead.people.length, 2);
  assert.equal(lead.people[0].name, "Dr. Robert Vance");
  assert.equal(lead.people[0].email, "robert.vance@consulting.com");
  assert.ok(lead.people[0].phone.includes("5554443333"));

  // Employee email/phone must NOT be assigned to company corporate email/phone
  assert.notEqual(lead.email, "robert.vance@consulting.com");
  assert.notEqual(lead.phone, "+15554443333");
});

// ─── 8. NO TEAM PAGE ─────────────────────────────────────────────────────────
test("FIXTURE 8: Website without team page extracts company data with empty people[]", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Hardware Express"));
  doc.body.appendChild(new MockElement("A", { href: "mailto:sales@hardwareexpress.com" }, "sales@hardwareexpress.com"));

  const pagesMap: Record<string, any> = {
    "https://hardwareexpress.com": makeAcquiredPage("https://hardwareexpress.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://hardwareexpress.com", { maxPages: 3 }, fetcher);

  assert.equal(lead.company_name, "Hardware Express");
  assert.equal(lead.email, "sales@hardwareexpress.com");
  assert.deepEqual(lead.people, []);
});

// ─── 9. NO CONTACT PAGE ──────────────────────────────────────────────────────
test("FIXTURE 9: Website without /contact page extracts contact info from footer", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Quick Plumbing"));
  const footer = new MockElement("FOOTER", { class: "site-footer" });
  footer.appendChild(new MockElement("A", { href: "tel:+15557778888" }, "Call us: (555) 777-8888"));
  footer.appendChild(new MockElement("A", { href: "mailto:dispatch@quickplumbing.com" }, "Email: dispatch@quickplumbing.com"));
  footer.appendChild(new MockElement("P", {}, "123 Pipe Lane, Houston, TX 77001"));
  doc.body.appendChild(footer);

  const pagesMap: Record<string, any> = {
    "https://quickplumbing.com": makeAcquiredPage("https://quickplumbing.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://quickplumbing.com", { maxPages: 3 }, fetcher);

  assert.equal(lead.company_name, "Quick Plumbing");
  assert.equal(lead.email, "dispatch@quickplumbing.com");
  assert.ok(lead.phone.includes("5557778888") || lead.phone.includes("555"));
});

// ─── 10. CONFLICTING JSON-LD / DOM DATA ──────────────────────────────────────
test("FIXTURE 10: Conflicting JSON-LD and DOM data resolves deterministically", async () => {
  const doc = new MockDocument();
  doc.head.appendChild(new MockElement("TITLE", {}, "Canonical Software"));
  const jsonLd = new MockElement(
    "SCRIPT",
    { type: "application/ld+json" },
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Corporation",
      name: "Canonical Software Inc",
      email: "corporate@canonicalsoftware.com",
      telephone: "+1-888-555-0199",
    })
  );
  doc.head.appendChild(jsonLd);

  // Lower tier DOM text
  doc.body.appendChild(new MockElement("P", {}, "Old email: info@canonicalsoftware.com"));
  doc.body.appendChild(new MockElement("P", {}, "Old phone: (555) 123-4567"));

  const pagesMap: Record<string, any> = {
    "https://canonicalsoftware.com": makeAcquiredPage("https://canonicalsoftware.com", doc),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://canonicalsoftware.com", { maxPages: 1 }, fetcher);

  // Structured data JSON-LD (Tier 1) wins over raw text regex (Tier 3)
  assert.equal(lead.company_name, "Canonical Software Inc");
  assert.equal(lead.email, "corporate@canonicalsoftware.com");
  assert.ok(lead.phone.includes("8885550199"));
});

// ─── 11. BROKEN PAGE RESILIENCE ──────────────────────────────────────────────
test("FIXTURE 11: Broken pages (network/500 errors) are skipped without halting crawl", async () => {
  const homeDoc = new MockDocument();
  homeDoc.head.appendChild(new MockElement("TITLE", {}, "Resilient Corp"));
  const nav = new MockElement("NAV");
  nav.appendChild(new MockElement("A", { href: "https://resilient.io/broken" }, "Broken Page"));
  nav.appendChild(new MockElement("A", { href: "https://resilient.io/working" }, "Working Page"));
  homeDoc.body.appendChild(nav);

  const workingDoc = new MockDocument();
  workingDoc.head.appendChild(new MockElement("TITLE", {}, "Working Page"));
  workingDoc.body.appendChild(new MockElement("A", { href: "mailto:contact@resilient.io" }, "contact@resilient.io"));

  let callCount = 0;
  const fetcher = async (url: string) => {
    callCount++;
    if (url.includes("/broken")) {
      throw new Error("HTTP 500 Internal Server Error");
    }
    if (url === "https://resilient.io") {
      return makeAcquiredPage("https://resilient.io", homeDoc);
    }
    if (url.includes("/working")) {
      return makeAcquiredPage("https://resilient.io/working", workingDoc);
    }
    return null;
  };

  const lead = await Adapter.crawlWebsite("https://resilient.io", { maxPages: 5 }, fetcher);

  assert.equal(lead.company_name, "Resilient Corp");
  assert.equal(lead.email, "contact@resilient.io");
  assert.ok(callCount >= 2, "Continued crawling after encountering broken page");
});

// ─── 12. WEBSITE WITH ONLY A FEW USEFUL PAGES ────────────────────────────────
test("FIXTURE 12: Website with only 3 useful pages finishes cleanly without hunting for 10", async () => {
  const homeDoc = new MockDocument();
  homeDoc.head.appendChild(new MockElement("TITLE", {}, "Small Biz LLC"));
  const nav = new MockElement("NAV");
  nav.appendChild(new MockElement("A", { href: "https://smallbiz.com/about" }, "About"));
  nav.appendChild(new MockElement("A", { href: "https://smallbiz.com/contact" }, "Contact"));
  nav.appendChild(new MockElement("A", { href: "https://smallbiz.com/privacy-policy" }, "Privacy"));
  nav.appendChild(new MockElement("A", { href: "https://smallbiz.com/terms-of-service" }, "Terms"));
  homeDoc.body.appendChild(nav);

  const aboutDoc = new MockDocument();
  aboutDoc.head.appendChild(new MockElement("TITLE", {}, "About Small Biz"));

  const contactDoc = new MockDocument();
  contactDoc.head.appendChild(new MockElement("TITLE", {}, "Contact Us"));
  contactDoc.body.appendChild(new MockElement("A", { href: "mailto:hi@smallbiz.com" }, "hi@smallbiz.com"));

  const pagesMap: Record<string, any> = {
    "https://smallbiz.com": makeAcquiredPage("https://smallbiz.com", homeDoc),
    "https://smallbiz.com/about": makeAcquiredPage("https://smallbiz.com/about", aboutDoc),
    "https://smallbiz.com/contact": makeAcquiredPage("https://smallbiz.com/contact", contactDoc),
    "https://smallbiz.com/privacy-policy": makeAcquiredPage("https://smallbiz.com/privacy-policy", new MockDocument()),
    "https://smallbiz.com/terms-of-service": makeAcquiredPage("https://smallbiz.com/terms-of-service", new MockDocument()),
  };

  const fetcher = createPageFetcher(pagesMap);
  const lead = await Adapter.crawlWebsite("https://smallbiz.com", { maxPages: 10 }, fetcher);

  assert.ok(lead.company_name.includes("Small Biz"));
  assert.equal(lead.email, "hi@smallbiz.com");
  assert.ok(lead._crawlStats.pagesScanned <= 3, `Scanned ${lead._crawlStats.pagesScanned} pages, expected <= 3`);
});
