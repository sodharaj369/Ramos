/**
 * MODE B — SELECTED DETAIL PANEL ENGINE (v1.0.10)
 * Strict identity matching: prevents false-positive word overlaps across distinct business names.
 * Two-stage panel transition validation and overarching container extraction.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../../shared/constants"),
      require("../../shared/schema"),
      require("./dom-utils"),
      require("./selectors"),
      require("./validators"),
      require("./address-parser")
    );
  } else {
    root.SalesIntelDetailExtractor = factory(
      root.SalesIntelConstants,
      root.SalesIntelSchema,
      root.SalesIntelDomUtils,
      root.SalesIntelSelectors,
      root.SalesIntelValidators,
      root.SalesIntelAddressParser
    );
  }
})(typeof self !== "undefined" ? self : this, function (Constants, Schema, DomUtils, Selectors, Validators, AddressParser) {
  "use strict";

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

  const GENERIC_IDENTITY_STOPWORDS = new Set([
    "la",
    "le",
    "el",
    "al",
    "les",
    "das",
    "der",
    "die",
    "del",
    "della",
    "de",
    "di",
    "the",
    "and",
    "or",
    "in",
    "at",
    "of",
    "to",
    "for",
    "near",
    "by",
    "on",
    "nr",
    "opp",
    "road",
    "rd",
    "street",
    "st",
    "cross",
    "circle",
    "highway",
    "express",
    "complex",
    "mall",
    "pizza",
    "pizzeria",
    "restaurant",
    "cafe",
    "coffee",
    "bistro",
    "bakery",
    "kitchen",
    "dhaba",
    "dining",
    "food",
    "foods",
    "gym",
    "fitness",
    "crossfit",
    "club",
    "studio",
    "center",
    "centre",
    "academy",
    "spa",
    "salon",
    "hotel",
    "inn",
    "suites",
    "resort",
    "motel",
    "shop",
    "store",
    "mart",
    "supermarket",
    "bazaar",
    "outlet",
    "emporium",
    "services",
    "service",
    "solutions",
    "enterprise",
    "agency",
    "firm",
    "associates",
    "pvt",
    "ltd",
    "limited",
    "llp",
    "inc",
    "co",
    "company",
    "corp",
    "corporation",
    "india",
    "ahmedabad",
    "gujarat",
    "gota",
    "satellite",
    "shyamal",
    "sg",
    "bopal",
    "thaltej",
    "vastrapur",
    "bodakdev",
    "prahladnagar",
    "navrangpura",
    "maninagar",
    "chandkheda",
  ]);

  function isGoogleInternalUrl(url) {
    if (!url || typeof url !== "string") return true;
    return /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|ggpht\.com|goo\.gl|waze\.com)(\/|$)/i.test(url.trim());
  }

  function isIdentityMatch(actual, expected) {
    if (!actual || !expected) return false;
    const cleanA = DomUtils.cleanUnicode(actual).toLowerCase().replace(/['"’]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const cleanB = DomUtils.cleanUnicode(expected).toLowerCase().replace(/['"’]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    if (cleanA === cleanB) return true;

    // Filter out generic category, article, and geographic stopwords
    const tokensA = cleanA.split(" ").filter((w) => w.length >= 2 && !GENERIC_IDENTITY_STOPWORDS.has(w));
    const tokensB = cleanB.split(" ").filter((w) => w.length >= 2 && !GENERIC_IDENTITY_STOPWORDS.has(w));

    const coreA = tokensA.join(" ");
    const coreB = tokensB.join(" ");

    if (coreA && coreB) {
      if (coreA === coreB) return true;
      if (coreA.includes(coreB) || coreB.includes(coreA)) {
        return true;
      }
    }

    if (tokensA.length === 0 || tokensB.length === 0) {
      return cleanA === cleanB;
    }

    // Check distinctive primary core brand token (e.g. "milano" vs "pinoz")
    const primaryA = tokensA[0];
    const primaryB = tokensB[0];
    if (primaryA !== primaryB && !primaryA.includes(primaryB) && !primaryB.includes(primaryA)) {
      return false;
    }

    // Check distinctive token overlap
    const commonDistinct = tokensA.filter((w) => tokensB.includes(w));
    const minTokens = Math.min(tokensA.length, tokensB.length);
    if (minTokens === 1) {
      return commonDistinct.length === 1;
    }
    return commonDistinct.length >= Math.ceil(minTokens * 0.6);
  }

  function extractPhoneFromText(text) {
    if (!text || typeof text !== "string") return null;
    let clean = DomUtils.cleanUnicode(text).trim();
    if (!clean.length) return null;

    clean = DomUtils.cleanPrefix(clean, /^(phone:?|tel:?|call:?)\s*/i).trim();

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

  function resolveWebsiteUrl(val) {
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

    const cleaned = DomUtils.cleanUnicode(raw).replace(/^(https?:\/\/)?(www\.)?/i, "");
    if (Validators.isUIElementTitle(cleaned) || Validators.isRatingOrReviewText(cleaned) || Validators.isPriceRangeText(cleaned)) {
      return null;
    }

    if (raw.includes("...")) {
      return null;
    }

    try {
      if (typeof Validators.sanitizeUrl === "function") {
        const sanitized = Validators.sanitizeUrl(raw);
        if (sanitized && !isGoogleInternalUrl(sanitized)) {
          return sanitized;
        }
      }
    } catch {}

    if (Validators.isWebsiteText(raw)) {
      return `https://${raw.replace(/^https?:\/\//i, "")}`;
    }

    return null;
  }

  function extractPhoneFromPanel(panel) {
    if (!panel) return null;

    const phoneEls = Array.from(
      panel.querySelectorAll('[data-item-id^="phone:"], [data-item-id="phone"], a[href^="tel:"], button[data-item-id^="phone:"]')
    );
    for (const el of phoneEls) {
      const candidates = [];
      const href = el.getAttribute("href") || "";
      if (href.startsWith("tel:")) candidates.push(href.replace(/^tel:/i, ""));

      const ioText = el.querySelector(".Io6YTe");
      if (ioText && ioText.textContent) candidates.push(ioText.textContent.trim());

      const dataItemId = el.getAttribute("data-item-id") || "";
      if (dataItemId.startsWith("phone:tel:")) candidates.push(dataItemId.replace(/^phone:tel:/i, ""));

      const aria = el.getAttribute("aria-label");
      if (aria) candidates.push(aria);

      const txt = DomUtils.text(el);
      if (txt) candidates.push(txt);

      for (const cand of candidates) {
        const phone = extractPhoneFromText(cand);
        if (phone) {
          return phone;
        }
      }
    }

    const telLinks = Array.from(panel.querySelectorAll('a[href^="tel:"], button[aria-label^="Phone:" i], button[aria-label^="Call " i]'));
    for (const el of telLinks) {
      const cand = el.getAttribute("href")?.replace(/^tel:/i, "") || el.getAttribute("aria-label") || DomUtils.text(el);
      const phone = extractPhoneFromText(cand);
      if (phone) {
        return phone;
      }
    }

    return null;
  }

  function extractWebsiteFromPanel(panel) {
    if (!panel) return null;

    const authorityEl = panel.querySelector('[data-item-id="authority"], a[data-item-id="authority"]');
    if (authorityEl) {
      const candidates = [];
      const href = authorityEl.getAttribute("href") || authorityEl.href;
      if (href) candidates.push(href);

      const ioText = authorityEl.querySelector(".Io6YTe");
      if (ioText && ioText.textContent) candidates.push(ioText.textContent.trim());

      const aria = authorityEl.getAttribute("aria-label");
      if (aria) candidates.push(DomUtils.cleanPrefix(aria, /^(website:?|web site:?)\s*/i).trim());

      const txt = DomUtils.text(authorityEl);
      if (txt) candidates.push(DomUtils.cleanPrefix(txt, /^(website:?|web site:?)\s*/i).trim());

      for (const cand of candidates) {
        const resolved = resolveWebsiteUrl(cand);
        if (resolved) {
          return resolved;
        }
      }
    }

    const websiteAnchors = Array.from(
      panel.querySelectorAll('a[aria-label*="Website" i], a[aria-label*="website" i], a[data-tooltip*="website" i]')
    );
    for (const a of websiteAnchors) {
      const href = a.getAttribute("href") || a.href;
      if (href) {
        const resolved = resolveWebsiteUrl(href);
        if (resolved) {
          return resolved;
        }
      }
    }

    const allLinks = Array.from(panel.querySelectorAll('a[href^="http"]'));
    for (const a of allLinks) {
      const href = a.getAttribute("href") || a.href;
      if (!href || isGoogleInternalUrl(href)) continue;

      const resolved = resolveWebsiteUrl(href);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  function getActiveDetailPanel(expectedName) {
    if (typeof document === "undefined") return null;

    const headings = Array.from(
      document.querySelectorAll('h1.DUwif, h1.fontTitleLarge, h1.section-hero-header-title-title, div[role="main"] h1, h1')
    );
    let matchedH1 = null;
    let matchedName = "";

    for (const h1 of headings) {
      const rawText = DomUtils.text(h1);
      if (!rawText) continue;
      const cleanName = DomUtils.cleanUnicode(rawText);
      if (!cleanName.length || Validators.isUIElementTitle(cleanName)) continue;

      if (!expectedName || isIdentityMatch(cleanName, expectedName)) {
        matchedH1 = h1;
        matchedName = cleanName;
        break;
      }
    }

    let panel = null;
    if (matchedH1) {
      panel =
        matchedH1.closest('div[role="main"], div.TIwYe, div.widget-pane-content, div.widget-pane') ||
        matchedH1.closest("div.m6QErb") ||
        matchedH1.parentElement;
    } else {
      const semanticAnchor = document.querySelector('[data-item-id="address"], [data-item-id^="phone:"], [data-item-id="authority"]');
      if (semanticAnchor) {
        panel = semanticAnchor.closest('div[role="main"], div.TIwYe, div.widget-pane-content, div.widget-pane, body');
        const h1 = panel?.querySelector("h1");
        if (h1) matchedName = DomUtils.cleanUnicode(DomUtils.text(h1));
      }
    }

    if (!panel) {
      panel = document.querySelector('div[role="main"], div.TIwYe');
    }

    if (panel && matchedName) {
      return { panel, companyName: matchedName };
    }

    return null;
  }

  function extractDetailPanel(expectedName) {
    if (typeof document === "undefined") return null;

    const detailRoot = getActiveDetailPanel(expectedName);
    if (!detailRoot || !detailRoot.panel) return null;

    const panel = detailRoot.panel;
    const scopeContainer = panel.closest('div[role="main"], div.TIwYe, body') || panel;
    const companyName = detailRoot.companyName;

    const lead = Schema.createCanonicalLead();
    lead.company_name = companyName;
    lead.extraction_mode = Constants.EXTRACTION_MODES.DETAIL_PANEL;
    lead.source = "detail";

    const currentHref = typeof location !== "undefined" ? location.href : "";
    lead.source_url = Validators.isValidUrl(currentHref) ? currentHref : null;
    lead.place_id = DomUtils.placeIdFromHref(currentHref);

    const coords = DomUtils.coordsFromHref(currentHref);
    lead.latitude = coords.latitude;
    lead.longitude = coords.longitude;

    // 1. Opening Hours / Status
    const hoursEl =
      DomUtils.first(panel, Selectors.detailHours) ||
      scopeContainer.querySelector('[data-item-id="oh"], span.ZDu9vd, div.t3bW0d');
    const hoursText = DomUtils.text(hoursEl);
    if (hoursText) lead.opening_status = DomUtils.cleanUnicode(hoursText);

    // 2. Rating
    const ratingEl = DomUtils.first(panel, Selectors.detailRating) || DomUtils.first(scopeContainer, Selectors.detailRating);
    let ratingVal = DomUtils.num(DomUtils.text(ratingEl));
    if (ratingVal == null) {
      const container = scopeContainer.querySelector('div[aria-label*="stars"], span[aria-label*="stars"], div[aria-label*="rating"]');
      if (container) {
        const aria = container.getAttribute("aria-label") || "";
        const m = /(\d+\.\d+)/.exec(aria);
        if (m) ratingVal = Number(m[1]);
      }
    }
    lead.rating = ratingVal;

    // 3. Review Count
    const reviewEl = DomUtils.first(panel, Selectors.detailReviews) || DomUtils.first(scopeContainer, Selectors.detailReviews);
    let reviewCountVal = DomUtils.num(DomUtils.text(reviewEl));
    if (reviewCountVal == null) {
      const container = scopeContainer.querySelector('button[aria-label*="reviews"], span[aria-label*="reviews"]');
      if (container) {
        const aria = container.getAttribute("aria-label") || "";
        const m = /([\d,]+)\s*reviews?/i.exec(aria);
        if (m) reviewCountVal = Number(m[1].replace(/,/g, ""));
      }
    }
    lead.review_count = reviewCountVal;

    // 4. Category
    const catEl = DomUtils.first(panel, Selectors.detailCategory) || DomUtils.first(scopeContainer, Selectors.detailCategory);
    const rawCat = DomUtils.text(catEl);
    if (rawCat && !Validators.isPriceRangeText(rawCat) && !Validators.isRatingOrReviewText(rawCat) && !Validators.isPlusCodeText(rawCat)) {
      lead.category = rawCat;
      lead.business_type = rawCat;
    }

    // 5. Price Range
    const priceEl = DomUtils.first(panel, Selectors.detailPrice) || DomUtils.first(scopeContainer, Selectors.detailPrice);
    const rawPrice = DomUtils.text(priceEl);
    if (rawPrice && Validators.isPriceRangeText(rawPrice)) {
      lead.price_range = rawPrice;
    }

    // 6. Address
    const addressBtn =
      panel.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label*="Address"], button[aria-label*="address"]') ||
      scopeContainer.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label*="Address"], button[aria-label*="address"]');
    if (addressBtn) {
      const ioText = addressBtn.querySelector(".Io6YTe");
      const rawAddr = ioText ? ioText.textContent.trim() : addressBtn.getAttribute("aria-label") || DomUtils.text(addressBtn) || "";
      const cleanAddr = Validators.cleanAddress(DomUtils.cleanPrefix(rawAddr, /^Address:\s*/i), lead.opening_status);
      if (cleanAddr) {
        const parsedLoc = AddressParser.parseAddress(cleanAddr);
        lead.address = cleanAddr;
        lead.city = parsedLoc.city;
        lead.region = parsedLoc.region;
        lead.country = parsedLoc.country;
        lead.postal_code = parsedLoc.postal_code;
      }
    }

    // 7. Phone
    try {
      lead.phone = extractPhoneFromPanel(scopeContainer);
    } catch (err) {
      console.warn("[SI][DETAIL][PHONE_ERROR]", err?.message || err);
      lead.phone = null;
    }

    // 8. Website
    try {
      lead.website = extractWebsiteFromPanel(scopeContainer);
    } catch (err) {
      console.warn("[SI][DETAIL][WEBSITE_ERROR]", err?.message || err);
      lead.website = null;
    }

    // 9. Booking URL
    try {
      const bookingEl = DomUtils.first(panel, Selectors.detailBooking) || DomUtils.first(scopeContainer, Selectors.detailBooking);
      if (bookingEl && bookingEl.href && /^https?:\/\//i.test(bookingEl.href)) {
        lead.booking_url = bookingEl.href.trim();
      }
    } catch {
      lead.booking_url = null;
    }

    // 10. Ordering URL
    try {
      const orderingEl = DomUtils.first(panel, Selectors.detailOrdering) || DomUtils.first(scopeContainer, Selectors.detailOrdering);
      if (orderingEl && orderingEl.href && /^https?:\/\//i.test(orderingEl.href)) {
        lead.ordering_url = orderingEl.href.trim();
      }
    } catch {
      lead.ordering_url = null;
    }

    // 11. Menu URL
    try {
      const menuEl = DomUtils.first(panel, Selectors.detailMenu) || DomUtils.first(scopeContainer, Selectors.detailMenu);
      if (menuEl && menuEl.href && /^https?:\/\//i.test(menuEl.href)) {
        lead.menu_url = menuEl.href.trim();
      }
    } catch {
      lead.menu_url = null;
    }

    const valResult = Validators.validateAndCleanLead(lead);
    if (!valResult.valid) return null;

    const finalLead = valResult.lead;

    console.log(
      "[SI][DETAIL][FIELDS]",
      JSON.stringify({
        company_name: finalLead.company_name,
        address: finalLead.address || null,
        phone: finalLead.phone || null,
        website: finalLead.website || null,
        opening_status: finalLead.opening_status || null,
        rating: finalLead.rating || null,
        review_count: finalLead.review_count || null,
      })
    );

    return finalLead;
  }

  return {
    GENERIC_IDENTITY_STOPWORDS,
    isIdentityMatch,
    extractPhoneFromText,
    resolveWebsiteUrl,
    getActiveDetailPanel,
    extractDetailPanel,
  };
});
