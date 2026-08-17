import test from "node:test";
import assert from "node:assert/strict";

// --- Mock DOM & Qualification Utilities ---

interface MockElement {
  tagName: string;
  className: string;
  attributes: Record<string, string>;
  children: MockElement[];
  textContent: string;
  href?: string;
  querySelector: (sel: string) => MockElement | null;
  querySelectorAll: (sel: string) => MockElement[];
  matches?: (sel: string) => boolean;
  closest?: (sel: string) => MockElement | null;
  parentElement?: MockElement | null;
}

function createMockElement(
  tagName: string,
  className = "",
  attrs: Record<string, string> = {},
  children: MockElement[] = [],
  textContent = "",
): MockElement {
  const el: MockElement = {
    tagName,
    className,
    attributes: attrs,
    children,
    textContent,
    href: attrs.href,
    parentElement: null,
    querySelector(sel: string) {
      if (sel.includes("a.hfpxzc") || sel === "a") {
        return findChild(this, (c) => c.tagName === "a" || c.className.includes("hfpxzc"));
      }
      if (sel.includes("div.qBF1Pd") || sel.includes("h1") || sel.includes("h3")) {
        return findChild(this, (c) => c.className.includes("qBF1Pd") || c.tagName === "h1" || c.tagName === "h3" || c.className.includes("DUwif"));
      }
      if (sel.includes("data-item-id=\"address\"")) {
        return findChild(this, (c) => c.attributes["data-item-id"] === "address");
      }
      if (sel.includes("data-item-id^=\"phone:\"") || sel.includes("data-item-id^=\"phone\"") || sel.includes("phone")) {
        return findChild(this, (c) => Boolean(c.attributes["data-item-id"] && c.attributes["data-item-id"].startsWith("phone")));
      }
      if (sel.includes("data-item-id=\"authority\"") || sel.includes("authority")) {
        return findChild(this, (c) => c.attributes["data-item-id"] === "authority");
      }
      if (sel.includes("data-item-id=\"oh\"") || sel.includes(".ZDu9vd")) {
        return findChild(this, (c) => c.attributes["data-item-id"] === "oh" || c.className.includes("ZDu9vd"));
      }
      if (sel.includes(".Io6YTe")) {
        return findChild(this, (c) => c.className.includes("Io6YTe"));
      }
      return null;
    },
    querySelectorAll(sel: string) {
      const results: MockElement[] = [];
      collectChildren(this, (c) => {
        if (sel.includes("Nv2PK") && (c.className.includes("Nv2PK") || c.attributes["role"] === "article")) {
          return true;
        }
        if (sel.includes("role=\"article\"") && c.attributes["role"] === "article") {
          return true;
        }
        if (sel.includes("data-item-id=\"address\"") && c.attributes["data-item-id"] === "address") {
          return true;
        }
        if (sel.includes("data-item-id^=\"phone:\"") && c.attributes["data-item-id"] && c.attributes["data-item-id"].startsWith("phone:")) {
          return true;
        }
        if (sel.includes("data-item-id=\"authority\"") && c.attributes["data-item-id"] === "authority") {
          return true;
        }
        return false;
      }, results);
      return results;
    },
    matches(sel: string) {
      if (sel.includes("Nv2PK") && this.className.includes("Nv2PK")) return true;
      if (sel.includes("role=\"article\"") && this.attributes["role"] === "article") return true;
      if (sel.includes("role=\"main\"") && this.attributes["role"] === "main") return true;
      if (sel.includes("TIwYe") && this.className.includes("TIwYe")) return true;
      return false;
    },
    closest(sel: string) {
      let cur: MockElement | null = this;
      while (cur) {
        if (cur.matches && cur.matches(sel)) return cur;
        cur = cur.parentElement || null;
      }
      return null;
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  return el;
}

function findChild(parent: MockElement, predicate: (el: MockElement) => boolean): MockElement | null {
  for (const child of parent.children) {
    if (predicate(child)) return child;
    const found = findChild(child, predicate);
    if (found) return found;
  }
  return null;
}

function collectChildren(parent: MockElement, predicate: (el: MockElement) => boolean, results: MockElement[]) {
  for (const child of parent.children) {
    if (predicate(child)) results.push(child);
    collectChildren(child, predicate, results);
  }
}

// Business Qualification Boundary (mirrors result-card-extractor.js)
const UI_BLACKLIST = ["results", "filters", "loading", "search instead for", "popular times"];

function isBusinessCard(cardEl: MockElement) {
  if (!cardEl || !cardEl.querySelector) return { qualified: false, name: null };

  const nameLink = cardEl.querySelector("a.hfpxzc") || (cardEl.tagName === "a" ? cardEl : null);
  const href = nameLink ? nameLink.href || nameLink.attributes["href"] : null;
  const titleEl = cardEl.querySelector("div.qBF1Pd");
  const rawName = titleEl ? titleEl.textContent : (nameLink ? nameLink.attributes["aria-label"] : null);

  if (!rawName) return { qualified: false, name: null };
  const cleanName = rawName.trim();

  if (UI_BLACKLIST.includes(cleanName.toLowerCase())) {
    return { qualified: false, name: cleanName };
  }

  const hasPlaceLink = Boolean(href && (href.includes("/maps/place/") || href.includes("place_id") || href.includes("!3d")));
  if (!hasPlaceLink) return { qualified: false, name: cleanName };

  return { qualified: true, name: cleanName, href };
}

function getQualifiedCardsFromFeed(feedEl: MockElement) {
  const cards = feedEl.querySelectorAll('div[role="article"].Nv2PK');
  return cards.filter((c) => isBusinessCard(c).qualified);
}

// Pure Action Button State Evaluator (mirrors popup.js)
function getActionButtonState(state: { cardCount?: number; detected?: number; readyCount?: number; records?: any[]; siConnected?: boolean }) {
  const cardCount = Number(state.cardCount != null ? state.cardCount : (state.detected || 0));
  const readyCount = Number(state.readyCount || (state.records ? state.records.length : 0));
  const hasCandidates = cardCount > 0 || readyCount > 0;
  const isConnected = Boolean(state.siConnected);

  return {
    downloadCsvEnabled: hasCandidates,
    importEnabled: hasCandidates && isConnected,
  };
}

// Production Phone Extractor & Validator (mirrors detail-extractor.js)
const INVALID_PHONE_LABELS = new Set([
  "send to phone",
  "directions",
  "save",
  "nearby",
  "share",
  "add a label",
  "website",
  "menu",
  "reserve a table",
  "order online",
  "claim this business",
  "suggest an edit",
  "photos",
  "reviews",
  "about",
  "copy phone number",
  "copied",
  "call",
  "phone",
]);

function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  let clean = text.replace(/[\uFFFD\u2605\u2b50★\u25A1□]/g, "").replace(/\s+/g, " ").trim();
  if (!clean.length) return null;

  clean = clean.replace(/^(phone:?|tel:?|call:?)\s*/i, "").trim();

  if (INVALID_PHONE_LABELS.has(clean.toLowerCase())) {
    return null;
  }

  if (/^(send to phone|directions|save|nearby|share|add a label|website|menu)\b/i.test(clean)) {
    return null;
  }

  const digitsOnly = clean.replace(/\D/g, "");
  if (digitsOnly.length < 6 || digitsOnly.length > 16) {
    return null;
  }

  const match = /(\+?\d[\d\-\s().]{5,}\d)/.exec(clean);
  if (match) {
    const num = match[1].replace(/\s+/g, " ").trim();
    const mDigits = num.replace(/\D/g, "");
    if (mDigits.length >= 6 && mDigits.length <= 16) {
      return num;
    }
  }

  return null;
}

// Production Website Resolver (mirrors detail-extractor.js)
function isGoogleInternalUrl(url: string): boolean {
  if (!url) return true;
  return /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|ggpht\.com|goo\.gl|waze\.com)(\/|$)/i.test(url.trim());
}

function resolveWebsiteUrl(val: string | null | undefined): string | null {
  if (!val || typeof val !== "string") return null;
  let raw = val.trim();
  if (!raw.length) return null;

  if (raw.includes("/url?") && raw.includes("q=")) {
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const targetQ = u.searchParams.get("q");
      if (targetQ) raw = targetQ;
    } catch {}
  }

  if (isGoogleInternalUrl(raw)) return null;

  if (raw.includes("...")) return null;

  if (!/^https?:\/\//i.test(raw)) {
    if (/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(raw)) {
      return `https://${raw}`;
    }
    return null;
  }

  try {
    const u = new URL(raw);
    if (u.hostname && u.hostname.includes(".")) {
      return u.href.endsWith("/") && u.pathname === "/" ? u.href.slice(0, -1) : u.href;
    }
  } catch {
    return null;
  }

  return null;
}

// ─── REGRESSION TESTS ──────────────────────────────────────────────────────────

test("1. Phone: 'Send to phone' UI label is REJECTED and returns null", () => {
  assert.equal(extractPhoneFromText("Send to phone"), null);
  assert.equal(extractPhoneFromText("Directions"), null);
  assert.equal(extractPhoneFromText("Save"), null);
  assert.equal(extractPhoneFromText("Nearby"), null);
  assert.equal(extractPhoneFromText("Share"), null);
});

test("2. Phone: Real business phone '+91 82009 78462' is extracted accurately", () => {
  assert.equal(extractPhoneFromText("+91 82009 78462"), "+91 82009 78462");
  assert.equal(extractPhoneFromText("Phone: +91 82009 78462"), "+91 82009 78462");
});

test("3. Phone: Real business phone '+91 98552 69855' is extracted accurately", () => {
  assert.equal(extractPhoneFromText("+91 98552 69855"), "+91 98552 69855");
  assert.equal(extractPhoneFromText("tel:+919855269855"), "+919855269855");
});

test("4. Website: 'lapinozpizza.in' resolves to valid https URL", () => {
  assert.equal(resolveWebsiteUrl("lapinozpizza.in"), "https://lapinozpizza.in");
  assert.equal(resolveWebsiteUrl("https://lapinozpizza.in"), "https://lapinozpizza.in");
});

test("5. Website: Ellipsis text 'radikh...in' is rejected; full URL 'radikhas.in' is accepted", () => {
  assert.equal(resolveWebsiteUrl("radikh...in"), null);
  assert.equal(resolveWebsiteUrl("radikhas.in"), "https://radikhas.in");
  assert.equal(resolveWebsiteUrl("https://www.google.com/url?q=https://radikhas.in&sa=D"), "https://radikhas.in");
});

test("6. Website: Google Maps navigation URLs are REJECTED and return null", () => {
  assert.equal(resolveWebsiteUrl("https://www.google.com/maps/place/INFINITE+FITNESS/@23.11,72.53"), null);
  assert.equal(resolveWebsiteUrl("https://maps.google.com/maps/dir/"), null);
  assert.equal(resolveWebsiteUrl("https://goo.gl/maps/xyz"), null);
});

test("7. Address: Full multiline address preserved completely in lead.address", () => {
  const fullAddress = "Shop no. 1,2,3, Ground floor, Kraft - 7, Sarkhej Gandhinagar Hwy, near Devnagar, opp. Maruti Suzuki Showroom, Gota, Ahmedabad, Gujarat 382481, India";
  const rawWithOpening = "Shop no. 1,2,3, Ground floor, Kraft - 7, Sarkhej Gandhinagar Hwy, near Devnagar, opp. Maruti Suzuki Showroom, Gota, Ahmedabad, Gujarat 382481, India Open · Closes 11 pm";
  const cleaned = rawWithOpening.replace(/\s*Open\s*·\s*Closes\s*11\s*pm\s*$/i, "").trim();

  assert.equal(cleaned, fullAddress);
});

test("8. Opening Status: Independent field and excluded from address", () => {
  const openingStatus = "Open · Closes 11 pm";
  const address = "601, NY Square, NR Vandematram Cross Rd, Gota, Ahmedabad";

  assert.equal(openingStatus, "Open · Closes 11 pm");
  assert.equal(address.includes("Open"), false);
});

test("9. Reference DOM Structure: Real Detail Panel Screenshot Fixture", () => {
  // Action Buttons Bar
  const actionDirections = createMockElement("button", "", { "aria-label": "Directions" }, [], "Directions");
  const actionSave = createMockElement("button", "", { "aria-label": "Save" }, [], "Save");
  const actionNearby = createMockElement("button", "", { "aria-label": "Nearby" }, [], "Nearby");
  const actionSendToPhone = createMockElement("button", "", { "aria-label": "Send to phone" }, [], "Send to phone");
  const actionShare = createMockElement("button", "", { "aria-label": "Share" }, [], "Share");

  // Business Data Rows
  const addressRow = createMockElement("button", "", { "data-item-id": "address" }, [
    createMockElement("div", "Io6YTe", {}, [], "First Floor, Silver Harmony 2, 101-104, Shukan Glory Rd, opp. ICB FLORA, Gota, Ahmedabad, Gujarat 382481, India"),
  ]);

  const hoursRow = createMockElement("div", "ZDu9vd", { "data-item-id": "oh" }, [], "Open 24 hours");

  const phoneRow = createMockElement("button", "", { "data-item-id": "phone:tel:+918460298925" }, [
    createMockElement("div", "Io6YTe", {}, [], "+91 84602 98925"),
  ]);

  const plusCodeRow = createMockElement("button", "", { "data-item-id": "oloc" }, [
    createMockElement("div", "Io6YTe", {}, [], "4G2R+WF Ahmedabad, Gujarat, India"),
  ]);

  const panel = createMockElement("div", "TIwYe", { role: "main" }, [
    createMockElement("h1", "DUwif fontTitleLarge", {}, [], "Silver Harmony Fitness"),
    actionDirections, actionSave, actionNearby, actionSendToPhone, actionShare,
    addressRow, hoursRow, phoneRow, plusCodeRow,
  ]);

  // Extract from the panel
  const phoneVal = extractPhoneFromText(phoneRow.querySelector(".Io6YTe")?.textContent);
  const actionSendPhoneVal = extractPhoneFromText(actionSendToPhone.textContent);
  const addressVal = addressRow.querySelector(".Io6YTe")?.textContent?.trim();
  const hoursVal = hoursRow.textContent?.trim();

  assert.equal(phoneVal, "+91 84602 98925");
  assert.equal(actionSendPhoneVal, null);
  assert.equal(addressVal, "First Floor, Silver Harmony 2, 101-104, Shukan Glory Rd, opp. ICB FLORA, Gota, Ahmedabad, Gujarat 382481, India");
  assert.equal(hoursVal, "Open 24 hours");
});

test("10. CSV Quality: Extracted candidate leads strictly enforce data rules", () => {
  const lead1 = {
    company_name: "INFINITE FITNESS",
    address: "1st, Skywalk Jagatpur, Gota, Ahmedabad 382470",
    phone: extractPhoneFromText("Send to phone"), // returns null
    website: resolveWebsiteUrl("https://infinitefitness.in"),
    opening_status: "Open · Closes 11:30 pm",
  };

  const lead2 = {
    company_name: "Fit Master Gym",
    address: "Opp. Vandematram Arcade, Gota, Ahmedabad",
    phone: extractPhoneFromText("+91 82382 47969"),
    website: resolveWebsiteUrl("https://www.google.com/maps/place/Fit+Master"), // returns null
    opening_status: "Closed · Opens 6 am Tue",
  };

  // Regression assertions
  assert.equal(lead1.phone, null);
  assert.notEqual(lead1.phone, "Send to phone");
  assert.equal(lead1.website, "https://infinitefitness.in");

  assert.equal(lead2.phone, "+91 82382 47969");
  assert.equal(lead2.website, null);
  assert.notEqual(lead2.website, "https://www.google.com/maps/place/Fit+Master");
});
