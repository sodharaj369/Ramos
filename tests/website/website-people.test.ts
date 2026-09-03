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
await import("../../extension/shared/schema.js");
await import("../../extension/content/website/website-adapter.js");

const PeopleExtractor = (globalThis as any).RamosPeopleExtractor;
const WebsiteAdapter = (globalThis as any).RamosWebsiteAdapter;

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

  contains(other: MockElement): boolean {
    if (this === other) return true;
    for (const c of this.children) {
      if (c.contains(other)) return true;
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

class MockDocument extends MockElement {
  body: MockElement;

  constructor() {
    super("#DOCUMENT");
    this.body = new MockElement("BODY");
    this.appendChild(this.body);
  }
}

// ─── SUITE 1: JSON-LD PERSON EXTRACTION ─────────────────────────────────────

test("PEOPLE EXTRACTOR: Extracts structured Person entities from JSON-LD schema", () => {
  const mockDoc = new MockDocument();
  const script = new MockElement(
    "SCRIPT",
    { type: "application/ld+json" },
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Quantix AI",
      employee: [
        {
          "@type": "Person",
          name: "Dr. Elena Rostova",
          jobTitle: "Chief Technology Officer & Co-Founder",
          email: "elena.rostova@quantix.ai",
          telephone: "+1-415-555-0144",
          url: "https://quantix.ai/team/elena-rostova",
          sameAs: ["https://linkedin.com/in/elena-rostova-cto"],
        },
        {
          "@type": "Person",
          name: "Marcus Vance",
          jobTitle: "VP of Enterprise Engineering",
          sameAs: "https://linkedin.com/in/marcus-vance",
        },
      ],
    })
  );
  mockDoc.appendChild(script);

  const people = PeopleExtractor.extractPeople({
    document: mockDoc,
    url: "https://quantix.ai/about",
  });

  assert.equal(people.length, 2);

  const elena = people.find((p: any) => p.name === "Dr. Elena Rostova");
  assert.ok(elena);
  assert.equal(elena.title, "Chief Technology Officer & Co-Founder");
  assert.equal(elena.email, "elena.rostova@quantix.ai");
  assert.equal(elena.phone, "+14155550144");
  assert.equal(elena.linkedin_url, "https://linkedin.com/in/elena-rostova-cto");
  assert.equal(elena.confidence, 0.98);

  const marcus = people.find((p: any) => p.name === "Marcus Vance");
  assert.ok(marcus);
  assert.equal(marcus.title, "VP of Enterprise Engineering");
  assert.equal(marcus.linkedin_url, "https://linkedin.com/in/marcus-vance");
});

// ─── SUITE 2: MICRODATA PERSON EXTRACTION ───────────────────────────────────

test("PEOPLE EXTRACTOR: Extracts Schema.org Microdata Person elements", () => {
  const mockDoc = new MockDocument();

  const personScope = new MockElement("DIV", {
    itemscope: "",
    itemtype: "https://schema.org/Person",
  });
  const nameEl = new MockElement("H3", { itemprop: "name" }, "David Chen");
  const titleEl = new MockElement("SPAN", { itemprop: "jobTitle" }, "Head of Product");
  const sameAsEl = new MockElement("A", {
    itemprop: "sameAs",
    href: "https://linkedin.com/in/davidchen-product",
  }, "LinkedIn");

  personScope.appendChild(nameEl);
  personScope.appendChild(titleEl);
  personScope.appendChild(sameAsEl);
  mockDoc.body.appendChild(personScope);

  const people = PeopleExtractor.extractPeople({
    document: mockDoc,
    url: "https://acme.com/team",
  });

  assert.equal(people.length, 1);
  assert.equal(people[0].name, "David Chen");
  assert.equal(people[0].title, "Head of Product");
  assert.equal(people[0].linkedin_url, "https://linkedin.com/in/davidchen-product");
  assert.equal(people[0].confidence, 0.94);
});

// ─── SUITE 3: DOM TEAM CARDS & TITLE SEPARATION ─────────────────────────────

test("PEOPLE EXTRACTOR: Extracts team member cards with clean name and title separation", () => {
  const mockDoc = new MockDocument();

  const card = new MockElement("DIV", { class: "team-card" });
  const nameHeader = new MockElement("H3", { class: "member-name" }, "Sarah Connor — Chief Executive Officer");
  const bio = new MockElement("P", {}, "Leading automated robotics engineering since 2018.");
  const li = new MockElement("A", { href: "https://linkedin.com/in/sarah-connor-ceo" }, "LinkedIn Profile");
  const directMail = new MockElement("A", { href: "mailto:sarah@acmerobotics.com" }, "Email Sarah");

  card.appendChild(nameHeader);
  card.appendChild(bio);
  card.appendChild(li);
  card.appendChild(directMail);
  mockDoc.body.appendChild(card);

  const people = PeopleExtractor.extractPeople({
    document: mockDoc,
    url: "https://acmerobotics.com/leadership",
  });

  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Sarah Connor");
  assert.equal(people[0].title, "Chief Executive Officer");
  assert.equal(people[0].linkedin_url, "https://linkedin.com/in/sarah-connor-ceo");
  assert.equal(people[0].email, "sarah@acmerobotics.com");
  assert.equal(people[0].confidence, 0.90);
});

// ─── SUITE 4: NO GUESSING & FALSE-POSITIVE REJECTION ────────────────────────

test("PEOPLE EXTRACTOR: Does not guess role if title missing and rejects corporate words", () => {
  // 1. Name without title: title must remain null, NOT guessed as CEO
  const mockDoc = new MockDocument();
  const card = new MockElement("DIV", { class: "team-member" });
  const nameHeader = new MockElement("H3", {}, "Robert Walker");
  const bio = new MockElement("P", {}, "Joined the advisory board recently.");
  card.appendChild(nameHeader);
  card.appendChild(bio);
  mockDoc.body.appendChild(card);

  const people = PeopleExtractor.extractPeople({
    document: mockDoc,
    url: "https://acme.com/advisors",
  });

  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Robert Walker");
  assert.equal(people[0].title, null, "Must NOT guess CEO or role when unstated");

  // 2. Reject corporate titles and UI strings
  assert.equal(PeopleExtractor.isValidPersonName("Acme Technologies Inc."), false);
  assert.equal(PeopleExtractor.isValidPersonName("Read More"), false);
  assert.equal(PeopleExtractor.isValidPersonName("Leadership Team"), false);
  assert.equal(PeopleExtractor.isValidPersonName("Contact Us"), false);
  assert.equal(PeopleExtractor.isValidPersonName("Global Solutions LLC"), false);
  assert.equal(PeopleExtractor.isValidPersonName("John"), false); // Single name
});

// ─── SUITE 5: COMPANY VS EMPLOYEE CONTACT ISOLATION ─────────────────────────

test("PEOPLE EXTRACTOR: Does not attach generic company sales/info email to individual people", () => {
  const mockDoc = new MockDocument();

  // Team card with only a name
  const card = new MockElement("DIV", { class: "team-member" });
  const nameHeader = new MockElement("H3", {}, "Alice Morgan");
  const role = new MockElement("P", { class: "role" }, "Managing Director");
  // A generic company email placed near the card
  const genericEmail = new MockElement("A", { href: "mailto:info@acme.com" }, "info@acme.com");

  card.appendChild(nameHeader);
  card.appendChild(role);
  card.appendChild(genericEmail);
  mockDoc.body.appendChild(card);

  const people = PeopleExtractor.extractPeople({
    document: mockDoc,
    url: "https://acme.com/team",
  });

  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Alice Morgan");
  assert.equal(people[0].title, "Managing Director");
  // info@acme.com must NOT be attached to Alice as her direct email
  assert.equal(people[0].email, null);
});

// ─── SUITE 6: DEDUPLICATION & MULTI-PAGE PEOPLE MERGING ─────────────────────

test("PEOPLE EXTRACTOR: Merges same person discovered across multiple pages into single comprehensive record", () => {
  // Page 1: Homepage featured founder mention (name + title only)
  const p1 = [
    {
      name: "Marcus Brody",
      title: "Co-Founder & CEO",
      linkedin_url: null,
      email: null,
      confidence: 0.85,
      source: "team-card",
      page_url: "https://acme.com/",
    },
  ];

  // Page 2: /team full card (name + linkedin + direct email)
  const p2 = [
    {
      name: "Marcus Brody",
      title: "Co-Founder & CEO",
      linkedin_url: "https://linkedin.com/in/marcus-brody",
      email: "marcus.brody@acme.com",
      confidence: 0.90,
      source: "team-card",
      page_url: "https://acme.com/team",
    },
    {
      name: "Helen Miller",
      title: "Chief Financial Officer",
      linkedin_url: "https://linkedin.com/in/helen-miller",
      email: null,
      confidence: 0.90,
      source: "team-card",
      page_url: "https://acme.com/team",
    },
  ];

  const merged = PeopleExtractor.mergePeople(p1, p2);

  assert.equal(merged.length, 2, "Must deduplicate Marcus Brody");

  const marcus = merged.find((p: any) => p.name === "Marcus Brody");
  assert.ok(marcus);
  assert.equal(marcus.title, "Co-Founder & CEO");
  assert.equal(marcus.linkedin_url, "https://linkedin.com/in/marcus-brody");
  assert.equal(marcus.email, "marcus.brody@acme.com");
  assert.equal(marcus.evidence.length, 2, "Must preserve multi-page evidence history");

  const helen = merged.find((p: any) => p.name === "Helen Miller");
  assert.ok(helen);
  assert.equal(helen.title, "Chief Financial Officer");
});

// ─── SUITE 7: END-TO-END PIPELINE SEPARATION (COMPANY VS PEOPLE) ────────────

test("WEBSITE ADAPTER: End-to-end extraction cleanly isolates lead company contacts from lead.people", () => {
  const mockDoc = new MockDocument();

  // Header with company name and general email
  const titleEl = new MockElement("TITLE", {}, "Vanguard Aerospace — Defense & Space");
  const mailtoEl = new MockElement("A", { href: "mailto:contact@vanguard-aero.com" }, "Company Contact");
  mockDoc.children.push(titleEl);
  mockDoc.body.appendChild(mailtoEl);

  // Team section with distinct employees
  const card1 = new MockElement("DIV", { class: "team-card" });
  const name1 = new MockElement("H3", {}, "General Thomas Vance");
  const title1 = new MockElement("P", {}, "President & CEO");
  const li1 = new MockElement("A", { href: "https://linkedin.com/in/thomas-vance-aero" }, "LinkedIn");
  card1.appendChild(name1);
  card1.appendChild(title1);
  card1.appendChild(li1);

  const card2 = new MockElement("DIV", { class: "team-card" });
  const name2 = new MockElement("H3", {}, "Sarah Jenkins");
  const title2 = new MockElement("P", {}, "VP of Systems Engineering");
  const email2 = new MockElement("A", { href: "mailto:s.jenkins@vanguard-aero.com" }, "Email Sarah");
  card2.appendChild(name2);
  card2.appendChild(title2);
  card2.appendChild(email2);

  mockDoc.body.appendChild(card1);
  mockDoc.body.appendChild(card2);

  const acquired = {
    url: "https://vanguard-aero.com/leadership",
    baseUrl: "https://vanguard-aero.com/leadership",
    sourceType: "rendered_dom",
    document: mockDoc,
  };

  const lead = WebsiteAdapter.extractFromAcquiredPage(acquired);

  // 1. Company contact info must remain the official company email
  assert.equal(lead.company_name, "Vanguard Aerospace");
  assert.equal(lead.email, "contact@vanguard-aero.com");

  // 2. People must be isolated in lead.people
  assert.ok(Array.isArray(lead.people));
  assert.equal(lead.people.length, 2);

  const thomas = lead.people.find((p: any) => p.name === "General Thomas Vance");
  assert.ok(thomas);
  assert.equal(thomas.title, "President & CEO");
  assert.equal(thomas.linkedin_url, "https://linkedin.com/in/thomas-vance-aero");
  assert.equal(thomas.email, null); // Thomas has no direct email

  const sarah = lead.people.find((p: any) => p.name === "Sarah Jenkins");
  assert.ok(sarah);
  assert.equal(sarah.title, "VP of Systems Engineering");
  assert.equal(sarah.email, "s.jenkins@vanguard-aero.com");

  // Critical test: Sarah's email must NOT leak into lead.email
  assert.notEqual(lead.email, sarah.email);
});
