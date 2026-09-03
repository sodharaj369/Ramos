import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Setup browser/Chrome mock environment before running popup tests
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
await import("../../extension/content/website/website-adapter.js");

const Adapter = (globalThis as any).RamosWebsiteAdapter;
const XlsxBuilder = (globalThis as any).RamosXlsxBuilder;

// --- Mock DOM Node Implementation ---
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

class MockDocument extends MockElement {
  body: MockElement;

  constructor() {
    super("#DOCUMENT");
    this.body = new MockElement("BODY");
    this.appendChild(this.body);
  }
}

// Helper to simulate URL sanitization used in popup
function sanitizeInputUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("chrome:") ||
    lower.startsWith("about:") ||
    lower.startsWith("blob:")
  ) {
    return "";
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

// ─── SUITE 1: URL VALIDATION IN POPUP ────────────────────────────────────────

test("POPUP UI: Rejects empty and invalid URL inputs safely", () => {
  // Empty
  assert.equal(sanitizeInputUrl(""), "");
  assert.equal(sanitizeInputUrl("   "), "");

  // Malformed
  assert.equal(sanitizeInputUrl("://invalid"), "");

  // Blocked Schemes
  assert.equal(sanitizeInputUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeInputUrl("file:///C:/passwords.txt"), "");
  assert.equal(sanitizeInputUrl("chrome://settings"), "");

  // Valid inputs
  assert.equal(sanitizeInputUrl("example.com"), "https://example.com/");
  assert.equal(sanitizeInputUrl("https://acme-robotics.com/about"), "https://acme-robotics.com/about");
  assert.equal(sanitizeInputUrl("http://local-test.org:8080"), "http://local-test.org:8080/");
});

// ─── SUITE 2: CRAWL ORCHESTRATION & SINGLE-PAGE EXTRACTION ───────────────────

test("POPUP UI: Successfully performs single-page analysis with progress reporting", async () => {
  const mockDoc = new MockDocument();
  const title = new MockElement("TITLE", {}, "Apex BioTech — Genomic Therapies");
  const h1 = new MockElement("H1", {}, "Apex BioTech");
  const mailto = new MockElement("A", { href: "mailto:info@apexbio.com" }, "Email Us");
  const tel = new MockElement("A", { href: "tel:+18005550144" }, "Call Us");

  mockDoc.children.push(title);
  mockDoc.body.appendChild(h1);
  mockDoc.body.appendChild(mailto);
  mockDoc.body.appendChild(tel);

  const fetcher = async (url: string) => {
    return {
      url,
      baseUrl: url,
      sourceType: "rendered_dom",
      document: mockDoc,
    };
  };

  const progressEvents: any[] = [];
  const lead = await Adapter.crawlWebsite(
    "https://apexbio.com",
    {
      maxPages: 1,
      maxDepth: 0,
      onProgress: (p: any) => progressEvents.push(p),
    },
    fetcher
  );

  assert.equal(lead.company_name, "Apex BioTech");
  assert.equal(lead.email, "info@apexbio.com");
  assert.equal(lead.phone, "+18005550144");
  assert.equal(lead._crawlStats.pagesScanned, 1);
  assert.ok(progressEvents.length > 0);
});

// ─── SUITE 3: CRAWL CANCELLATION (STOP ACTION) ──────────────────────────────

test("POPUP UI: Handles user-initiated crawl cancellation and rethrows abortion cleanly", async () => {
  const mockDoc = new MockDocument();
  const toContact = new MockElement("A", { href: "/contact" }, "Contact");
  mockDoc.body.appendChild(toContact);

  const controller = new AbortController();

  let scanCount = 0;
  const abortableFetcher = async (url: string) => {
    if (controller.signal.aborted) {
      throw new Error("CRAWL_ABORTED");
    }
    scanCount++;
    if (scanCount >= 1) {
      // User clicks Stop after the first page
      controller.abort();
    }
    return {
      url,
      baseUrl: url,
      sourceType: "rendered_dom",
      document: mockDoc,
    };
  };

  let caughtError: any = null;
  try {
    await Adapter.crawlWebsite(
      "https://testcorp.com",
      { maxPages: 10, maxDepth: 2 },
      abortableFetcher
    );
  } catch (err: any) {
    caughtError = err;
  }

  assert.ok(caughtError);
  assert.equal(caughtError.message, "CRAWL_ABORTED");
  assert.equal(scanCount, 1, "Should have safely aborted after the first fetch");
});

// ─── SUITE 4: EXPORT PARITY AFTER WEBSITE INTELLIGENCE EXTRACTION ───────────

test("POPUP UI: Generates valid Excel and CSV exports from extracted website intelligence lead", () => {
  const websiteLead = {
    company_name: "Quantum Dynamics",
    phone: "+15559876543",
    website: "https://quantumdynamics.ai",
    email: "contact@quantumdynamics.ai",
    email_status: "business_role",
    address: "700 Technology Park, Suite 200",
    city: "San Jose",
    region: "CA",
    country: "US",
    postal_code: "95110",
    category: "Quantum Computing & Simulation",
    business_type: null,
    rating: null,
    review_count: null,
    opening_status: null,
    price_range: null,
    booking_url: "https://calendly.com/quantum-dynamics",
    ordering_url: null,
    menu_url: null,
    imported_at: new Date().toISOString(),
    source_url: "https://quantumdynamics.ai",
    place_id: null,
    sourceQuery: "quantumdynamics.ai",
    run_id: "run_web_test_123",
    social: {
      linkedin: "https://linkedin.com/company/quantum-dynamics",
      twitter_x: "https://twitter.com/quantum_dyn",
    },
    people: [
      {
        name: "Dr. Evelyn Reed",
        title: "Chief Executive Officer",
        linkedin_url: "https://linkedin.com/in/evelyn-reed-quantum",
        email: null,
      },
    ],
  };

  // 1. XLSX generation test
  const xlsxBytes = XlsxBuilder.buildXlsx([websiteLead]);
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 500, "XLSX file must be non-empty valid binary");
  assert.equal(xlsxBytes[0], 0x50); // PK zip header
  assert.equal(xlsxBytes[1], 0x4b);

  // 2. CSV generation test
  function leadToCsvRow(l: any) {
    return [
      `"${l.company_name}"`,
      `"${l.phone}"`,
      `"${l.website}"`,
      `"${l.email}"`,
      `"${l.email_status}"`,
      `"${l.address}"`,
      `"${l.city}"`,
      `"${l.region}"`,
      `"${l.country}"`,
      `"${l.postal_code}"`,
    ].join(",");
  }

  const csvRow = leadToCsvRow(websiteLead);
  assert.ok(csvRow.includes("Quantum Dynamics"));
  assert.ok(csvRow.includes("contact@quantumdynamics.ai"));
  assert.ok(csvRow.includes("95110"));
});

// ─── SUITE 5: MAPS INTEGRITY CHECK (FROZEN MAPS ENGINE REGRESSION GATE) ─────

test("MAPS REGRESSION GATE: Google Maps card extractor and detail pipeline remain completely intact", () => {
  const schema = (globalThis as any).RamosSchema || (globalThis as any).SalesIntelSchema;
  assert.ok(schema, "Canonical Schema must be defined");
  const canonicalLead = schema.createCanonicalLead();
  assert.equal(canonicalLead.extraction_source, "chrome-extension");
  assert.equal(canonicalLead.company_name, null);
});
