/**
 * RAMOS Website Intelligence — Comprehensive Crawler Intelligence Test Suite
 *
 * Validates deterministic priority-based crawling, field-aware dynamic scoring,
 * crawl budget enforcement, waste reduction, dynamic queue re-ranking, and transparency.
 *
 * Requirements:
 * A. 30 links where Contact/Team/About are buried among blog links.
 * B. Alternative page names such as /get-in-touch, /who-we-are, /our-people, /meet-the-team, /find-us.
 * C. Missing email boosts /contact page priority.
 * D. Missing people boosts /leadership page priority.
 * E. 50 blog pages must not consume the crawl budget.
 * F. Website where all required data is found after 4 pages and crawler must stop early.
 * G. Website where relevant pages are only discovered after another high-value page is crawled.
 * H. Duplicate/tracking URL variants.
 * I. 1, 5, 10, and 20 page budgets strictly enforced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Ensure self is defined in Node environment before loading extension UMD scripts
if (typeof (globalThis as any).self === "undefined") {
  (globalThis as any).self = globalThis;
}

// Bootstrap required modules in order
await import("../../extension/shared/constants.js");
await import("../../extension/content/website/normalizers.js");
await import("../../extension/content/website/validators.js");
await import("../../extension/content/website/structured-data.js");
await import("../../extension/content/website/field-extractors.js");
await import("../../extension/content/website/page-analyzer.js");
await import("../../extension/content/website/page-acquisition.js");
await import("../../extension/content/website/confidence.js");
await import("../../extension/content/website/people-extractor.js");
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

// --- Mock DOM Environment ---
class MockElement {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  children: MockElement[];
  parentElement: MockElement | null = null;

  constructor(tagName: string, attributes: Record<string, string> = {}, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = Object.fromEntries(
      Object.entries(attributes).map(([k, v]) => [k.toLowerCase(), v])
    );
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

  contains(other: MockElement): boolean {
    if (!other) return false;
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const matches: MockElement[] = [];
    const parts = selector.split(",").map((p) => p.trim()).filter(Boolean);

    const matchSingleSelector = (node: MockElement, sel: string): boolean => {
      const attrRegex = /\[([a-zA-Z0-9_-]+)(?:([*^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?(?:\s+i)?\]/g;
      const bracketIdx = sel.indexOf("[");
      const tag = bracketIdx === -1 ? sel.trim() : sel.substring(0, bracketIdx).trim();

      if (tag && tag !== "*" && node.tagName.toLowerCase() !== tag.toLowerCase()) {
        return false;
      }

      let m;
      let hasAttr = false;
      while ((m = attrRegex.exec(sel)) !== null) {
        hasAttr = true;
        const attrName = m[1].toLowerCase();
        const op = m[2];
        const val = (m[3] ?? m[4] ?? m[5] ?? "").toLowerCase();

        const nodeVal = node.getAttribute(attrName);
        if (nodeVal === null) return false;

        const lowerNodeVal = nodeVal.toLowerCase();
        if (op === "=" && lowerNodeVal !== val) return false;
        if (op === "*=" && !lowerNodeVal.includes(val)) return false;
        if (op === "^=" && !lowerNodeVal.startsWith(val)) return false;
        if (op === "$=" && !lowerNodeVal.endsWith(val)) return false;
      }

      return hasAttr || Boolean(tag);
    };

    const checkNode = (node: MockElement) => {
      const isMatch = parts.some((p) => matchSingleSelector(node, p));
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

class MockDocument {
  head: MockElement;
  body: MockElement;
  children: MockElement[];

  constructor() {
    this.head = new MockElement("HEAD");
    this.body = new MockElement("BODY");
    this.children = [this.head, this.body];
  }

  querySelector(selector: string): MockElement | null {
    if (selector.toLowerCase() === "title") {
      for (const child of this.children) {
        if (child.tagName === "TITLE") return child;
        const found = child.querySelector("title");
        if (found) return found;
      }
    }
    return this.head.querySelector(selector) || this.body.querySelector(selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)];
  }
}

function createPage(url: string, titleStr: string, anchors: Array<{ href: string; text?: string; container?: string }>) {
  const doc = new MockDocument();
  const titleEl = new MockElement("TITLE", {}, titleStr);
  doc.children.push(titleEl);

  const containerMap = new Map<string, MockElement>();

  anchors.forEach((a) => {
    const aEl = new MockElement("A", { href: a.href }, a.text || "");
    const cName = (a.container || "BODY").toUpperCase();
    if (cName === "BODY") {
      doc.body.appendChild(aEl);
    } else {
      if (!containerMap.has(cName)) {
        const cEl = new MockElement(cName);
        doc.body.appendChild(cEl);
        containerMap.set(cName, cEl);
      }
      containerMap.get(cName)!.appendChild(aEl);
    }
  });

  return {
    url,
    baseUrl: url,
    sourceType: "rendered_dom",
    document: doc,
  };
}

// ─── TEST A: 30 LINKS WITH HIGH-VALUE PAGES BURIED IN BLOG LINKS ───────────

test("CRAWLER [A]: 30 links where Contact/Team/About are buried among blog links crawl in priority order", async () => {
  // Home page with 27 blog links, and 3 buried links: /blog/post-14, /our-team, /blog/post-15, /get-in-touch, /company
  const links = [];
  for (let i = 1; i <= 10; i++) {
    links.push({ href: `/blog/post-${i}`, text: `Blog Article ${i}`, container: "MAIN" });
  }
  links.push({ href: "/get-in-touch", text: "Get in Touch", container: "MAIN" });
  for (let i = 11; i <= 20; i++) {
    links.push({ href: `/blog/post-${i}`, text: `Blog Article ${i}`, container: "MAIN" });
  }
  links.push({ href: "/our-team", text: "Our Team", container: "MAIN" });
  for (let i = 21; i <= 28; i++) {
    links.push({ href: `/blog/post-${i}`, text: `Blog Article ${i}`, container: "MAIN" });
  }
  links.push({ href: "/company", text: "Company Overview", container: "MAIN" });

  const homePage = createPage("https://nexus.io", "Nexus Technologies", links);
  const discovered = LinkDiscovery.discoverLinks(homePage, "nexus.io", 0);

  // High-value links must be ordered ahead of ALL 27 blog posts
  const top3 = discovered.slice(0, 3).map((d: any) => d.url);
  assert.ok(top3.includes("https://nexus.io/get-in-touch"), "Contact page must be in top 3");
  assert.ok(top3.includes("https://nexus.io/our-team"), "Team page must be in top 3");
  assert.ok(top3.includes("https://nexus.io/company"), "Company/About page must be in top 3");

  // Verify first link is Contact
  assert.equal(discovered[0].url, "https://nexus.io/get-in-touch");
});

// ─── TEST B: SEMANTIC ALTERNATIVE PAGE NAMES ───────────────────────────────

test("CRAWLER [B]: Semantic alternative page names (/get-in-touch, /who-we-are, /our-people, /meet-the-team, /find-us) score high", () => {
  const urls = [
    { url: "https://example.com/get-in-touch", expectedIntent: "CONTACT" },
    { url: "https://example.com/who-we-are", expectedIntent: "ABOUT" },
    { url: "https://example.com/our-people", expectedIntent: "TEAM" },
    { url: "https://example.com/meet-the-team", expectedIntent: "TEAM" },
    { url: "https://example.com/find-us", expectedIntent: "LOCATION" },
    { url: "https://example.com/reach-us", expectedIntent: "CONTACT" },
    { url: "https://example.com/our-story", expectedIntent: "ABOUT" },
  ];

  for (const item of urls) {
    const scoreInfo = PagePriority.scoreLink(item.url, "");
    assert.equal(scoreInfo.pageIntent, item.expectedIntent, `Expected ${item.expectedIntent} for ${item.url}`);
    assert.ok(scoreInfo.score >= 90, `Score for ${item.url} should be >= 90, got ${scoreInfo.score}`);
  }
});

// ─── TEST C: MISSING EMAIL BOOSTS /CONTACT PRIORITY ─────────────────────────

test("CRAWLER [C]: Missing email dynamically boosts /contact page priority", () => {
  const contactUrl = "https://example.com/contact-us";
  const aboutUrl = "https://example.com/about-us";

  // Score without missing fields
  const scoreBase = PagePriority.scoreLink(contactUrl, "Contact", 1, "NAV", {});

  // Score with missing email
  const scoreMissingEmail = PagePriority.scoreLink(contactUrl, "Contact", 1, "NAV", { missingEmail: true });

  assert.ok(
    scoreMissingEmail.score > scoreBase.score,
    `Missing email score (${scoreMissingEmail.score}) should exceed base score (${scoreBase.score})`
  );
  assert.equal(scoreMissingEmail.score - scoreBase.score, 40, "Dynamic missing email boost should be +40");
});

// ─── TEST D: MISSING PEOPLE BOOSTS /LEADERSHIP PRIORITY ─────────────────────

test("CRAWLER [D]: Missing people dynamically boosts /leadership page priority", () => {
  const leadershipUrl = "https://example.com/leadership";

  const scoreBase = PagePriority.scoreLink(leadershipUrl, "Leadership Team", 1, "NAV", {});
  const scoreMissingPeople = PagePriority.scoreLink(leadershipUrl, "Leadership Team", 1, "NAV", { missingPeople: true });

  assert.ok(
    scoreMissingPeople.score > scoreBase.score,
    `Missing people score (${scoreMissingPeople.score}) should exceed base score (${scoreBase.score})`
  );
  assert.equal(scoreMissingPeople.score - scoreBase.score, 45, "Dynamic missing people boost should be +45");
});

// ─── TEST E: 50 BLOG PAGES MUST NOT CONSUME CRAWL BUDGET ────────────────────

test("CRAWLER [E]: 50 blog pages must not consume the crawl budget when high-value pages exist", async () => {
  const blogLinks = [];
  for (let i = 1; i <= 50; i++) {
    blogLinks.push({ href: `/blog/article-${i}`, text: `Article ${i}` });
  }
  // High-value links in nav
  const navLinks = [
    { href: "/contact", text: "Contact", container: "NAV" },
    { href: "/team", text: "Team", container: "NAV" },
    { href: "/about", text: "About", container: "NAV" },
  ];

  const allLinks = [...navLinks, ...blogLinks];
  const homePage = createPage("https://enterprise.org", "Enterprise Corp", allLinks);

  const pagesMap: Record<string, any> = {
    "https://enterprise.org": homePage,
    "https://enterprise.org/contact": createPage("https://enterprise.org/contact", "Contact Enterprise", [
      { href: "mailto:sales@enterprise.org", text: "Email Us" },
    ]),
    "https://enterprise.org/team": createPage("https://enterprise.org/team", "Our Leadership Team", []),
    "https://enterprise.org/about": createPage("https://enterprise.org/about", "About Enterprise Corp", []),
  };

  // Add dummy blog pages
  for (let i = 1; i <= 50; i++) {
    pagesMap[`https://enterprise.org/blog/article-${i}`] = createPage(
      `https://enterprise.org/blog/article-${i}`,
      `Article ${i}`,
      []
    );
  }

  const crawledUrls: string[] = [];
  const mockFetcher = async (url: string) => {
    crawledUrls.push(url);
    return pagesMap[url] || null;
  };

  const lead = await WebsiteAdapter.crawlWebsite(
    "https://enterprise.org",
    {
      maxPages: 5,
      maxDepth: 2,
    },
    mockFetcher
  );

  // High-value pages MUST be crawled before any blog pages
  assert.ok(crawledUrls.includes("https://enterprise.org/contact"), "Must crawl /contact");
  assert.ok(crawledUrls.includes("https://enterprise.org/team"), "Must crawl /team");
  assert.ok(crawledUrls.includes("https://enterprise.org/about"), "Must crawl /about");

  // Blog pages must NOT push out contact, team, or about
  const blogVisits = crawledUrls.filter((u) => u.includes("/blog/"));
  assert.ok(blogVisits.length <= 1, `Blog visits must not exceed 1 with 5-page budget, got ${blogVisits.length}`);
});

// ─── TEST F: EARLY TERMINATION WHEN DATA SATISFIED ─────────────────────────

test("CRAWLER [F]: Website where all required data is found after 4 pages stops early", async () => {
  const pagesMap: Record<string, any> = {
    "https://solarsystems.com": createPage("https://solarsystems.com", "Solar Systems Inc", [
      { href: "/contact", text: "Contact Us", container: "NAV" },
      { href: "/about", text: "About Us", container: "NAV" },
      { href: "/team", text: "Our Team", container: "NAV" },
      { href: "/blog/post-1", text: "Post 1" },
      { href: "/blog/post-2", text: "Post 2" },
      { href: "/blog/post-3", text: "Post 3" },
      { href: "/blog/post-4", text: "Post 4" },
      { href: "/blog/post-5", text: "Post 5" },
    ]),
    "https://solarsystems.com/contact": {
      url: "https://solarsystems.com/contact",
      baseUrl: "https://solarsystems.com/contact",
      sourceType: "rendered_dom",
      document: (() => {
        const d = new MockDocument();
        d.children.push(new MockElement("TITLE", {}, "Contact Solar Systems"));
        d.body.appendChild(new MockElement("A", { href: "mailto:info@solarsystems.com" }, "info@solarsystems.com"));
        d.body.appendChild(new MockElement("A", { href: "tel:+18005551234" }, "Call Us"));
        d.body.appendChild(new MockElement("ADDRESS", {}, "100 Solar Way, Austin, TX 78701"));
        return d;
      })(),
    },
    "https://solarsystems.com/about": createPage("https://solarsystems.com/about", "About Solar Systems", []),
    "https://solarsystems.com/team": {
      url: "https://solarsystems.com/team",
      baseUrl: "https://solarsystems.com/team",
      sourceType: "rendered_dom",
      document: (() => {
        const d = new MockDocument();
        d.children.push(new MockElement("TITLE", {}, "Leadership Team — Solar Systems"));
        const card = new MockElement("DIV", { class: "team-card" });
        card.appendChild(new MockElement("H3", {}, "Elena Vance"));
        card.appendChild(new MockElement("P", { class: "title" }, "Chief Executive Officer"));
        d.body.appendChild(card);
        return d;
      })(),
    },
  };

  let pagesVisitedCount = 0;
  const mockFetcher = async (url: string) => {
    pagesVisitedCount++;
    return pagesMap[url] || null;
  };

  const lead = await WebsiteAdapter.crawlWebsite(
    "https://solarsystems.com",
    {
      maxPages: 10, // Budget 10
      maxDepth: 2,
      enableEarlyExit: true,
    },
    mockFetcher
  );

  // Must stop early because company, email, phone, address, and people are all satisfied
  assert.equal(lead._crawlStats.stoppedEarly, true, "Crawler must report stoppedEarly = true");
  assert.equal(lead._crawlStats.stopReason, "all_requested_fields_satisfied");
  assert.ok(pagesVisitedCount < 10, `Pages visited (${pagesVisitedCount}) must be strictly less than budget (10)`);
  assert.equal(lead.email, "info@solarsystems.com");
  assert.equal(lead.phone, "+18005551234");
});

// ─── TEST G: RELEVANT PAGES DISCOVERED AFTER ANOTHER HIGH-VALUE PAGE ────────

test("CRAWLER [G]: Deep relevant page discovered on child page is prioritized immediately", async () => {
  // Home links ONLY to /company (depth 1) and 5 blog posts
  // /company links to /company/executives (depth 2)
  const home = createPage("https://cyber.io", "Cyber Defense", [
    { href: "/company", text: "Company", container: "NAV" },
    { href: "/blog/p1", text: "Article 1" },
    { href: "/blog/p2", text: "Article 2" },
    { href: "/blog/p3", text: "Article 3" },
  ]);

  const company = createPage("https://cyber.io/company", "About Cyber Defense", [
    { href: "/company/executives", text: "Meet Our Executives", container: "NAV" },
  ]);

  const executives = createPage("https://cyber.io/company/executives", "Cyber Defense Leadership", []);

  const pagesMap: Record<string, any> = {
    "https://cyber.io": home,
    "https://cyber.io/company": company,
    "https://cyber.io/company/executives": executives,
    "https://cyber.io/blog/p1": createPage("https://cyber.io/blog/p1", "P1", []),
    "https://cyber.io/blog/p2": createPage("https://cyber.io/blog/p2", "P2", []),
    "https://cyber.io/blog/p3": createPage("https://cyber.io/blog/p3", "P3", []),
  };

  const visitOrder: string[] = [];
  const mockFetcher = async (url: string) => {
    visitOrder.push(url);
    return pagesMap[url] || null;
  };

  await WebsiteAdapter.crawlWebsite(
    "https://cyber.io",
    {
      maxPages: 5,
      maxDepth: 2,
    },
    mockFetcher
  );

  // Once /company is crawled, /company/executives must jump ahead of the remaining blog links!
  const execIdx = visitOrder.indexOf("https://cyber.io/company/executives");
  const p1Idx = visitOrder.indexOf("https://cyber.io/blog/p1");

  assert.ok(execIdx !== -1, "Executives page must be crawled");
  assert.ok(execIdx < p1Idx || p1Idx === -1, "Executives page must be crawled before blog posts");
});

// ─── TEST H: DUPLICATE & TRACKING URL VARIANTS ─────────────────────────────

test("CRAWLER [H]: Duplicate and tracking URL variants are filtered and crawled only once", async () => {
  const home = createPage("https://retail.com", "Retail Hub", [
    { href: "/contact?utm_source=facebook&utm_medium=cpc", text: "Contact" },
    { href: "/contact?ref=twitter#map", text: "Contact Us" },
    { href: "/contact", text: "Get in Touch" },
    { href: "/about?fbclid=12345", text: "About" },
    { href: "/about#team", text: "About Us" },
  ]);

  const crawled: string[] = [];
  const mockFetcher = async (url: string) => {
    crawled.push(url);
    if (url === "https://retail.com") return home;
    return createPage(url, "Subpage", []);
  };

  await WebsiteAdapter.crawlWebsite(
    "https://retail.com",
    {
      maxPages: 10,
      maxDepth: 2,
    },
    mockFetcher
  );

  const contactVisits = crawled.filter((u) => u.startsWith("https://retail.com/contact"));
  const aboutVisits = crawled.filter((u) => u.startsWith("https://retail.com/about"));

  assert.equal(contactVisits.length, 1, "Contact page must be crawled exactly once despite tracking params");
  assert.equal(aboutVisits.length, 1, "About page must be crawled exactly once despite hashes/fbclid");
});

// ─── TEST I: 1, 5, 10, 20 PAGE BUDGETS STRICTLY ENFORCED ──────────────────

test("CRAWLER [I]: 1, 5, 10, and 20 page budgets are strictly enforced as ceilings", async () => {
  const makeSite = (count: number) => {
    const map: Record<string, any> = {};
    const links = [];
    for (let i = 1; i <= count; i++) {
      links.push({ href: `/page-${i}`, text: `Page ${i}` });
      map[`https://scale.io/page-${i}`] = createPage(`https://scale.io/page-${i}`, `Page ${i}`, []);
    }
    map["https://scale.io"] = createPage("https://scale.io", "Scale IO", links);
    return map;
  };

  const site = makeSite(40);

  const testBudgets = [1, 5, 10, 20];
  for (const budget of testBudgets) {
    let visits = 0;
    const mockFetcher = async (url: string) => {
      visits++;
      return site[url] || null;
    };

    const lead = await WebsiteAdapter.crawlWebsite(
      "https://scale.io",
      {
        maxPages: budget,
        maxDepth: 2,
        enableEarlyExit: false, // Force budget test
      },
      mockFetcher
    );

    assert.equal(visits, budget, `Expected exactly ${budget} visits for budget ${budget}, got ${visits}`);
    assert.equal(lead._crawlStats.pagesBudget, budget);
    assert.equal(lead._crawlStats.pagesScanned, budget);
  }
});
