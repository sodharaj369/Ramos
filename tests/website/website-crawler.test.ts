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
await import("../../extension/shared/schema.js");
await import("../../extension/content/website/website-adapter.js");

const CrawlPolicy = (globalThis as any).RamosCrawlPolicy;
const PagePriority = (globalThis as any).RamosPagePriority;
const LinkDiscovery = (globalThis as any).RamosLinkDiscovery;
const { CrawlQueue } = (globalThis as any).RamosCrawlQueue;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;

// --- Mock Element & Document Helpers ---
class MockElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: MockElement[];
  parentElement: MockElement | null = null;

  constructor(tagName: string, attributes: Record<string, string> = {}, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.textContent = textContent;
    this.children = [];
  }

  getAttribute(attr: string) {
    return this.attributes[attr.toLowerCase()] ?? null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
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

      if (lowerSel === node.tagName.toLowerCase()) {
        isMatch = true;
      } else if (lowerSel.includes("[") && lowerSel.endsWith("]")) {
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
    this.appendChild(this.body);
  }
}

// ─── SUITE 1: CRAWL POLICY ──────────────────────────────────────────────────

test("CRAWL POLICY: Rejects blocked schemes, external domains, and binary file types", () => {
  const root = "acme-robotics.com";

  // Blocked schemes
  assert.equal(CrawlPolicy.isUrlAllowed("javascript:alert(1)", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("data:text/html,hello", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("file:///etc/passwd", root).allowed, false);

  // External domains
  assert.equal(CrawlPolicy.isUrlAllowed("https://facebook.com/acme", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("https://evil-phishing.com/about", root).allowed, false);

  // Same domain and subdomains
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/about", root).allowed, true);
  assert.equal(CrawlPolicy.isUrlAllowed("https://www.acme-robotics.com/contact", root).allowed, true);
  assert.equal(CrawlPolicy.isUrlAllowed("https://blog.acme-robotics.com/tech", root).allowed, true);

  // Excluded file extensions
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/docs/spec.pdf", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/images/hero.png", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/archive.zip", root).allowed, false);

  // Ignored paths (cart, checkout, login)
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/cart", root).allowed, false);
  assert.equal(CrawlPolicy.isUrlAllowed("https://acme-robotics.com/login", root).allowed, false);
});

// ─── SUITE 2: PAGE PRIORITY SCORING ─────────────────────────────────────────

test("PAGE PRIORITY: Scores high-value business intelligence pages over generic and legal pages", () => {
  const contactScore = PagePriority.scoreLink("https://acme.com/contact-us", "Contact Us", 1, "NAV");
  assert.ok(contactScore.score > 150, "Contact page in nav must have very high priority score");
  assert.equal(contactScore.pageIntent, "CONTACT");

  const teamScore = PagePriority.scoreLink("https://acme.com/our-team", "Meet Our Team", 1, "NAV");
  assert.ok(teamScore.score > 140, "Team page in nav must have high priority score");
  assert.equal(teamScore.pageIntent, "TEAM");

  const aboutScore = PagePriority.scoreLink("https://acme.com/about", "About Us", 1, "HEADER");
  assert.ok(aboutScore.score > 120, "About page must have high priority score");
  assert.equal(aboutScore.pageIntent, "ABOUT");

  const blogScore = PagePriority.scoreLink("https://acme.com/blog/article-1", "Read Post", 1);
  assert.ok(blogScore.score < 50, "Blog article should have modest score");

  const privacyScore = PagePriority.scoreLink("https://acme.com/privacy-policy", "Privacy Policy", 1, "FOOTER");
  assert.ok(privacyScore.score < 0, "Privacy policy should have negative score");
});

// ─── SUITE 3: LINK DISCOVERY ────────────────────────────────────────────────

test("LINK DISCOVERY: Discovers, normalizes, and prioritizes same-domain links from page DOM", () => {
  const mockDoc = new MockDocument();

  const nav = new MockElement("NAV");
  const a1 = new MockElement("A", { href: "/contact-us" }, "Contact Us");
  const a2 = new MockElement("A", { href: "/about-us" }, "About Us");
  const a3 = new MockElement("A", { href: "/team" }, "Leadership Team");
  nav.appendChild(a1);
  nav.appendChild(a2);
  nav.appendChild(a3);

  const footer = new MockElement("FOOTER");
  const aExt = new MockElement("A", { href: "https://twitter.com/acme" }, "Twitter");
  const aPdf = new MockElement("A", { href: "/downloads/whitepaper.pdf" }, "Whitepaper");
  const aPrivacy = new MockElement("A", { href: "/privacy-policy" }, "Privacy");
  footer.appendChild(aExt);
  footer.appendChild(aPdf);
  footer.appendChild(aPrivacy);

  mockDoc.body.appendChild(nav);
  mockDoc.body.appendChild(footer);

  const discovered = LinkDiscovery.discoverLinks(
    {
      document: mockDoc,
      url: "https://acme.com/",
      baseUrl: "https://acme.com/",
    },
    "acme.com",
    0
  );

  // External Twitter link and PDF file must be filtered out
  assert.ok(!discovered.some((d: any) => d.url.includes("twitter.com")));
  assert.ok(!discovered.some((d: any) => d.url.includes("whitepaper.pdf")));

  // Highest priority should be contact or team
  assert.ok(discovered.length >= 3);
  assert.equal(discovered[0].url, "https://acme.com/contact-us");
  assert.equal(discovered[0].pageIntent, "CONTACT");
  assert.equal(discovered[0].depth, 1);
});

// ─── SUITE 4: CRAWL QUEUE DYNAMICS ──────────────────────────────────────────

test("CRAWL QUEUE: Enforces priority ordering, deduplication, depth limits, and early exit check", () => {
  const queue = new CrawlQueue({
    maxPages: 5,
    maxDepth: 2,
    rootDomain: "acme.com",
  });

  // Enqueue items with different priorities
  queue.enqueue({ url: "https://acme.com/blog", depth: 1, priority: 20 });
  queue.enqueue({ url: "https://acme.com/contact", depth: 1, priority: 190 });
  queue.enqueue({ url: "https://acme.com/about", depth: 1, priority: 150 });

  // Duplicate enqueue must be rejected
  const dupResult = queue.enqueue({ url: "https://acme.com/contact", depth: 1, priority: 190 });
  assert.equal(dupResult, false);

  // Depth > 2 must be rejected
  const depthResult = queue.enqueue({ url: "https://acme.com/deep/page", depth: 3, priority: 100 });
  assert.equal(depthResult, false);

  // Dequeue must return highest priority first (/contact then /about then /blog)
  const first = queue.dequeue();
  assert.equal(first.url, "https://acme.com/contact");
  queue.markVisited(first.url);

  const second = queue.dequeue();
  assert.equal(second.url, "https://acme.com/about");
  queue.markVisited(second.url);

  // Early termination test: when essential fields are satisfied and >= 2 pages visited
  const completeLead = {
    company_name: "Acme",
    email: "info@acme.com",
    phone: "+15551234567",
    address: "123 Main St",
  };
  assert.equal(queue.canTerminateEarly(completeLead), true);

  const incompleteLead = {
    company_name: "Acme",
    email: null,
    phone: "+15551234567",
  };
  assert.equal(queue.canTerminateEarly(incompleteLead), false);
});

// ─── SUITE 5: TARGETED MULTI-PAGE CRAWLER INTEGRATION ───────────────────────

test("TARGETED CRAWLER: Crawls multi-page site, follows priority, aggregates evidence, and terminates safely", async () => {
  // Simulate 3 site pages
  // 1. Homepage: Company title, links to /contact and /about
  const homeDoc = new MockDocument();
  const homeTitle = new MockElement("TITLE", {}, "Apex Cyber Systems — Enterprise Security");
  const homeNav = new MockElement("NAV");
  const toContact = new MockElement("A", { href: "/contact" }, "Contact Sales");
  const toAbout = new MockElement("A", { href: "/about" }, "About Apex");
  homeNav.appendChild(toContact);
  homeNav.appendChild(toAbout);
  homeDoc.children.push(homeTitle);
  homeDoc.body.appendChild(homeNav);

  // 2. Contact Page: Contains verified official email and phone
  const contactDoc = new MockDocument();
  const contactTitle = new MockElement("TITLE", {}, "Contact Apex Cyber Systems");
  const mailtoEl = new MockElement("A", { href: "mailto:sales@apexcybersystems.com" }, "Email Sales");
  const telEl = new MockElement("A", { href: "tel:+18005559876" }, "Call Headquarters");
  const addrEl = new MockElement("ADDRESS", {}, "400 Security Plaza, Suite 800, Boston, MA 02110");
  contactDoc.children.push(contactTitle);
  contactDoc.body.appendChild(mailtoEl);
  contactDoc.body.appendChild(telEl);
  contactDoc.body.appendChild(addrEl);

  // 3. About Page: Company overview and LinkedIn profile
  const aboutDoc = new MockDocument();
  const aboutTitle = new MockElement("TITLE", {}, "About Apex Cyber Systems");
  const liEl = new MockElement("A", { href: "https://linkedin.com/company/apex-cyber" }, "LinkedIn");
  aboutDoc.children.push(aboutTitle);
  aboutDoc.body.appendChild(liEl);

  const pagesMap: Record<string, any> = {
    "https://apexcybersystems.com": {
      url: "https://apexcybersystems.com",
      baseUrl: "https://apexcybersystems.com",
      sourceType: "rendered_dom",
      document: homeDoc,
    },
    "https://apexcybersystems.com/contact": {
      url: "https://apexcybersystems.com/contact",
      baseUrl: "https://apexcybersystems.com/contact",
      sourceType: "rendered_dom",
      document: contactDoc,
    },
    "https://apexcybersystems.com/about": {
      url: "https://apexcybersystems.com/about",
      baseUrl: "https://apexcybersystems.com/about",
      sourceType: "rendered_dom",
      document: aboutDoc,
    },
  };

  const mockFetcher = async (url: string) => {
    return pagesMap[url] || null;
  };

  const lead = await WebsiteAdapter.crawlWebsite(
    "https://apexcybersystems.com",
    {
      maxPages: 5,
      maxDepth: 2,
      enableEarlyExit: true,
    },
    mockFetcher
  );

  // Verify aggregated canonical fields
  assert.equal(lead.company_name, "Apex Cyber Systems");
  assert.equal(lead.email, "sales@apexcybersystems.com");
  assert.equal(lead.email_status, "business_role");
  assert.equal(lead.phone, "+18005559876");
  assert.ok(lead.address.includes("400 Security Plaza"));
  assert.equal(lead.extraction_mode, "website-crawler");

  // Verify crawl stats
  assert.ok(lead._crawlStats);
  assert.ok(lead._crawlStats.pagesScanned >= 2);
  assert.ok(lead._crawlStats.totalEvidenceCount > 0);

  // Verify multi-page provenance: email should trace to /contact page
  const emailEv = lead._evidence.find((e: any) => e.field === "email");
  assert.ok(emailEv);
  assert.equal(emailEv.value, "sales@apexcybersystems.com");
  assert.equal(emailEv.page_url, "https://apexcybersystems.com/contact");
});
