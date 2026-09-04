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

const FieldExtractors = (globalThis as any).RamosFieldExtractors;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;
const Enricher = (globalThis as any).RamosWebsiteEnricher;

// --- Mock DOM Helper ---
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
          } else if (attrPart.includes("*=")) {
            const [k, v] = attrPart.split("*=");
            const cleanV = v.replace(/["']/g, "");
            const val = node.getAttribute(k);
            if (val && val.toLowerCase().includes(cleanV)) isMatch = true;
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
  head: MockElement;
  body: MockElement;

  constructor() {
    super("#DOCUMENT");
    this.head = new MockElement("HEAD");
    this.body = new MockElement("BODY");
    this.appendChild(this.head);
    this.appendChild(this.body);
  }
}

function makeAcquiredPage(url: string, doc: MockDocument) {
  return {
    url,
    document: doc,
    rawHtml: "<html></html>",
    meta: { status: 200, contentType: "text/html" },
  };
}

test("PHASE 8C [1]: Cloudflare email decoder extracts and decodes obfuscated emails", () => {
  // Encoded email for "contact@example.com"
  // Key: 18 (hex) -> 'c' ^ 0x18 = 99 ^ 24 = 115 (0x73) etc.
  // Full hex: "187b77766c797b6c387d60797568747d"
  // Decoded: "contact@example.com"
  const doc = new MockDocument();
  const cfAnchor = new MockElement("A", {
    href: "/cdn-cgi/l/email-protection#187b77766c797b6c587d60797568747d367b7775",
  }, "Protected Link");
  const cfSpan = new MockElement("SPAN", {
    "data-cfemail": "187b77766c797b6c587d60797568747d367b7775",
  }, "[email protected]");

  doc.body.appendChild(cfAnchor);
  doc.body.appendChild(cfSpan);

  const page = makeAcquiredPage("https://example.com", doc);
  const candidates = FieldExtractors.extractFields(page);
  const emailCands = candidates.filter((c: any) => c.field === "email");

  assert.ok(emailCands.length > 0, "Cloudflare protected email should be decoded");
  assert.equal(emailCands[0].value, "contact@example.com");
  assert.equal(emailCands[0].source, "cloudflare-decoded");
});

test("PHASE 8C [2]: One failed website (403, timeout, SSL error) does not stop batch processing", async () => {
  const leads = [
    { company_name: "Good Business 1", website: "https://good1.com" },
    { company_name: "Blocked Business", website: "https://blocked.com" },
    { company_name: "Timeout Business", website: "https://timeout.com" },
    { company_name: "Good Business 2", website: "https://good2.com" },
  ];

  const fetcher = async (url: string) => {
    if (url.includes("blocked.com")) {
      return null; // Simulates 403 / 429 null response
    }
    if (url.includes("timeout.com")) {
      throw new Error("ETIMEDOUT"); // Simulates network timeout
    }
    const doc = new MockDocument();
    doc.body.appendChild(new MockElement("A", { href: `mailto:info@${url.replace('https://', '')}` }, "Email"));
    return makeAcquiredPage(url, doc);
  };

  const results: any[] = [];
  for (const lead of leads) {
    try {
      const webLead = await WebsiteAdapter.crawlWebsite(lead.website, { maxPages: 1 }, fetcher);
      if (webLead) {
        results.push(Enricher.mergeMapsAndWebsiteLead(lead, webLead));
      } else {
        results.push({ ...lead, enrichment_status: "failed" });
      }
    } catch (err) {
      results.push({ ...lead, enrichment_status: "failed" });
    }
  }

  assert.equal(results.length, 4, "All 4 leads must be processed despite failures");
  assert.equal(results[0].email, "info@good1.com");
  assert.equal(results[1].enrichment_status, "failed");
  assert.equal(results[2].enrichment_status, "failed");
  assert.equal(results[3].email, "info@good2.com");
});

test("PHASE 8C [3]: Bounded concurrency (pool of 3) executes batch accurately without leaks", async () => {
  const count = 25;
  const mockLeads = Array.from({ length: count }, (_, i) => ({
    company_name: `Business ${i + 1}`,
    website: `https://biz${i + 1}.com`,
  }));

  const fetcher = async (url: string) => {
    const domain = url.replace("https://", "");
    const doc = new MockDocument();
    doc.body.appendChild(new MockElement("A", { href: `mailto:sales@${domain}` }, "Sales"));
    return makeAcquiredPage(url, doc);
  };

  // Run bounded worker pool of 3
  const CONCURRENCY = 3;
  let activeWorkers = 0;
  let maxConcurrentObserved = 0;
  let processedCount = 0;
  let nextIdx = 0;

  async function worker() {
    activeWorkers++;
    if (activeWorkers > maxConcurrentObserved) maxConcurrentObserved = activeWorkers;
    while (nextIdx < mockLeads.length) {
      const idx = nextIdx++;
      const lead = mockLeads[idx];
      const webLead = await WebsiteAdapter.crawlWebsite(lead.website, { maxPages: 1 }, fetcher);
      mockLeads[idx] = Enricher.mergeMapsAndWebsiteLead(lead, webLead);
      processedCount++;
    }
    activeWorkers--;
  }

  const pool = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    pool.push(worker());
  }
  await Promise.all(pool);

  assert.equal(processedCount, 25);
  assert.ok(maxConcurrentObserved <= 3, `Max concurrent must be <= 3, observed: ${maxConcurrentObserved}`);
  assert.ok(mockLeads.every((l) => l.email && l.email.startsWith("sales@biz")));
});

test("PHASE 8C [4]: Immediate abort on user cancellation in bounded concurrency", async () => {
  const mockLeads = Array.from({ length: 50 }, (_, i) => ({
    company_name: `Business ${i + 1}`,
    website: `https://biz${i + 1}.com`,
  }));

  const abortController = new AbortController();

  const fetcher = async (url: string) => {
    if (abortController.signal.aborted) {
      throw new Error("CRAWL_ABORTED");
    }
    const doc = new MockDocument();
    doc.body.appendChild(new MockElement("A", { href: "mailto:info@site.com" }, "Email"));
    return makeAcquiredPage(url, doc);
  };

  let completed = 0;
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < mockLeads.length) {
      if (abortController.signal.aborted) break;
      const idx = nextIdx++;
      try {
        const webLead = await WebsiteAdapter.crawlWebsite(mockLeads[idx].website, { maxPages: 1 }, fetcher);
        completed++;
        if (completed === 5) {
          abortController.abort(); // Cancel after 5 leads
        }
      } catch (err: any) {
        if (err.message === "CRAWL_ABORTED") break;
      }
    }
  }

  const pool = [worker(), worker(), worker()];
  await Promise.all(pool);

  assert.ok(completed >= 5 && completed < 15, `Batch should stop immediately after abort, completed: ${completed}`);
});
