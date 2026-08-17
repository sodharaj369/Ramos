/**
 * MODE B — SELECTED DETAIL PANEL ENGINE (v1.0.6)
 * Dynamically locates the active place detail panel surface by business identity.
 * Strict phone validation: NEVER accepts UI labels like "Send to phone".
 * Strict website extraction: captures external business domains, never Google Maps URLs.
 * Non-fatal field extraction: missing phone/website/address returns null without failing the lead.
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

  function isGoogleInternalUrl(url) {
    if (!url || typeof url !== "string") return true;
    return /^(https?:\/\/)?([a-z0-9-]+\.)*(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|ggpht\.com|goo\.gl|waze\.com)(\/|$)/i.test(url.trim());
  }

  /**
   * Validates and extracts a pure telephone number from raw text.
   * Rejects all UI button labels like "Send to phone", "Directions", etc.
   */
  function extractPhoneFromText(text) {
    if (!text || typeof text !== "string") return null;
    let clean = DomUtils.cleanUnicode(text).trim();
    if (!clean.length) return null;

    // Strip leading "Phone:", "tel:", etc.
    clean = DomUtils.cleanPrefix(clean, /^(phone:?|tel:?|call:?)\s*/i).trim();

    if (INVALID_PHONE_LABELS.has(clean.toLowerCase())) {
      return null;
    }

    if (/^(send to phone|directions|save|nearby|share|add a label|website|menu)\b/i.test(clean)) {
      return null;
    }

    // Phone must contain between 6 and 16 digits
    const digitsOnly = clean.replace(/\D/g, "");
    if (digitsOnly.length < 6 || digitsOnly.length > 16) {
      return null;
    }

    // Plausible telephone format regex
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

  /**
   * Resolves a genuine external website URL/domain.
   * Strips Google redirect wrappers and rejects all Google Maps/Google search URLs.
   */
  function resolveWebsiteUrl(val) {
    if (!val || typeof val !== "string") return null;
    let raw = val.trim();
    if (!raw.length) return null;

    // Unwrap Google redirect parameters e.g. /url?q=https://example.com
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

    const sanitized = Validators.sanitizeUrl(raw);
    if (sanitized && !isGoogleInternalUrl(sanitized)) {
      return sanitized;
    }

    if (Validators.isWebsiteText(raw)) {
      return `https://${raw.replace(/^https?:\/\//i, "")}`;
    }

    return null;
  }

  /**
   * Scoped phone extractor for the active detail panel.
   */
  function extractPhoneFromPanel(panel) {
    if (!panel) return null;

    // Strategy 1: Semantic phone controls (excluding send_to_phone)
    const phoneEls = Array.from(panel.querySelectorAll('[data-item-id^="phone:"], [data-item-id="phone"], a[href^="tel:"], button[data-item-id^="phone:"]'));
    for (const el of phoneEls) {
      const candidates = [];
      const href = el.getAttribute("href") || "";
      if (href.startsWith("tel:")) candidates.push(href.replace(/^tel:/i, ""));

      const ioText = el.querySelector('.Io6YTe');
      if (ioText && ioText.textContent) candidates.push(ioText.textContent.trim());

      const dataItemId = el.getAttribute("data-item-id") || "";
      if (dataItemId.startsWith("phone:tel:")) candidates.push(dataItemId.replace(/^phone:tel:/i, ""));

      const aria = el.getAttribute("aria-label");
      if (aria) candidates.push(aria);

      const txt = DomUtils.text(el);
      if (txt) candidates.push(txt);

      for (const cand of candidates) {
        console.log(`[SI][DETAIL][PHONE_CANDIDATE]\nvalue=${cand}`);
        const phone = extractPhoneFromText(cand);
        if (phone) {
          console.log(`[SI][DETAIL][PHONE_ACCEPTED]\nvalue=${phone}`);
          return phone;
        } else {
          console.log(`[SI][DETAIL][PHONE_ACCEPTED]\nvalue=null`);
        }
      }
    }

    // Strategy 2: Tel link or button with aria-label starting strictly with "Phone:" or "Call "
    const telLinks = Array.from(panel.querySelectorAll('a[href^="tel:"], button[aria-label^="Phone:" i], button[aria-label^="Call " i]'));
    for (const el of telLinks) {
      const cand = el.getAttribute("href")?.replace(/^tel:/i, "") || el.getAttribute("aria-label") || DomUtils.text(el);
      console.log(`[SI][DETAIL][PHONE_CANDIDATE]\nvalue=${cand}`);
      const phone = extractPhoneFromText(cand);
      if (phone) {
        console.log(`[SI][DETAIL][PHONE_ACCEPTED]\nvalue=${phone}`);
        return phone;
      }
    }

    console.log(`[SI][DETAIL][PHONE_ACCEPTED]\nvalue=null`);
    return null;
  }

  /**
   * Scoped website extractor for the active detail panel.
   */
  function extractWebsiteFromPanel(panel) {
    if (!panel) return null;

    // Strategy 1: Dedicated semantic authority control
    const authorityEl = panel.querySelector('[data-item-id="authority"], a[data-item-id="authority"]');
    if (authorityEl) {
      const candidates = [];
      const href = authorityEl.getAttribute("href") || authorityEl.href;
      if (href) candidates.push(href);

      const ioText = authorityEl.querySelector('.Io6YTe');
      if (ioText && ioText.textContent) candidates.push(ioText.textContent.trim());

      const aria = authorityEl.getAttribute("aria-label");
      if (aria) candidates.push(DomUtils.cleanPrefix(aria, /^(website:?|web site:?)\s*/i).trim());

      const txt = DomUtils.text(authorityEl);
      if (txt) candidates.push(DomUtils.cleanPrefix(txt, /^(website:?|web site:?)\s*/i).trim());

      for (const cand of candidates) {
        console.log(`[SI][DETAIL][WEBSITE_CANDIDATE]\nvalue=${cand}`);
        const resolved = resolveWebsiteUrl(cand);
        if (resolved) {
          console.log(`[SI][DETAIL][WEBSITE_ACCEPTED]\nvalue=${resolved}`);
          return resolved;
        }
      }
    }

    // Strategy 2: Anchors with aria-label="Website" or data-tooltip="Open website"
    const websiteAnchors = Array.from(panel.querySelectorAll('a[aria-label*="Website" i], a[aria-label*="website" i], a[data-tooltip*="website" i]'));
    for (const a of websiteAnchors) {
      const href = a.getAttribute("href") || a.href;
      if (href) {
        console.log(`[SI][DETAIL][WEBSITE_CANDIDATE]\nvalue=${href}`);
        const resolved = resolveWebsiteUrl(href);
        if (resolved) {
          console.log(`[SI][DETAIL][WEBSITE_ACCEPTED]\nvalue=${resolved}`);
          return resolved;
        }
      }
    }

    // Strategy 3: Any external link inside panel that is NOT Google/Maps/Plus/Review
    const allLinks = Array.from(panel.querySelectorAll('a[href^="http"]'));
    for (const a of allLinks) {
      const href = a.getAttribute("href") || a.href;
      if (!href || isGoogleInternalUrl(href)) continue;

      console.log(`[SI][DETAIL][WEBSITE_CANDIDATE]\nvalue=${href}`);
      const resolved = resolveWebsiteUrl(href);
      if (resolved) {
        console.log(`[SI][DETAIL][WEBSITE_ACCEPTED]\nvalue=${resolved}`);
        return resolved;
      }
    }

    console.log(`[SI][DETAIL][WEBSITE_ACCEPTED]\nvalue=null`);
    return null;
  }

  /**
   * Authoritative Detail Panel Surface Locator.
   */
  function getActiveDetailPanel(expectedName) {
    if (typeof document === "undefined") return null;

    const candidatePanels = [];

    // Strategy A: Find active business heading (h1)
    const headings = Array.from(document.querySelectorAll('h1.DUwif, h1.fontTitleLarge, h1.section-hero-header-title-title, h1'));
    for (const h1 of headings) {
      const rawText = DomUtils.text(h1);
      if (!rawText) continue;
      const cleanName = DomUtils.cleanUnicode(rawText);
      if (!cleanName.length || Validators.isUIElementTitle(cleanName)) continue;

      if (expectedName) {
        const normActual = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normExpected = String(expectedName).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!normActual.includes(normExpected) && !normExpected.includes(normActual)) {
          continue;
        }
      }

      let container = h1.closest('div[role="main"], div.TIwYe, div.bJ181e, div.m6QErb, div.widget-pane-content, div[jsaction*="pane"]');
      if (!container) container = h1.parentElement?.parentElement || h1.parentElement;
      if (container && !candidatePanels.includes(container)) {
        candidatePanels.push(container);
      }
    }

    // Strategy B: Find container enclosing semantic action buttons
    const semanticAnchor = document.querySelector('[data-item-id="address"], [data-item-id^="phone:"], [data-item-id="authority"], [data-item-id="oh"]');
    if (semanticAnchor) {
      let container = semanticAnchor.closest('div[role="main"], div.TIwYe, div.bJ181e, div.m6QErb, div.widget-pane-content, div[jsaction*="pane"]');
      if (!container) container = semanticAnchor.parentElement?.parentElement?.parentElement || semanticAnchor.parentElement;
      if (container && !candidatePanels.includes(container)) {
        candidatePanels.push(container);
      }
    }

    // Strategy C: Generic detailPanel selectors
    for (const sel of Selectors.detailPanel) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (!candidatePanels.includes(el)) {
          candidatePanels.push(el);
        }
      }
    }

    console.log(`[SI][DETAIL][ROOT_CANDIDATES]\ncount=${candidatePanels.length}`);

    // Score and select the best candidate root panel
    for (const panel of candidatePanels) {
      const titleEl = DomUtils.first(panel, Selectors.detailTitle) || panel.querySelector('h1');
      const rawName = DomUtils.text(titleEl);
      if (!rawName) continue;
      const cleanName = DomUtils.cleanUnicode(rawName);
      if (!cleanName.length || Validators.isUIElementTitle(cleanName)) continue;

      if (expectedName) {
        const normActual = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normExpected = String(expectedName).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!normActual.includes(normExpected) && !normExpected.includes(normActual)) {
          continue;
        }
      }

      const addrCount = panel.querySelectorAll('[data-item-id="address"], [aria-label*="Address"], [data-item-id*="address"]').length;
      const phoneCount = panel.querySelectorAll('[data-item-id^="phone:"], [data-item-id="phone"], a[href^="tel:"]').length;
      const websiteCount = panel.querySelectorAll('[data-item-id="authority"], [aria-label*="Website"], a[href^="http"]').length;

      console.log(`[SI][DETAIL][ROOT_SELECTED]\ntag=${panel.tagName.toLowerCase()}\nrole=${panel.getAttribute("role") || "none"}\nclass=${panel.className || "none"}\nname=${cleanName}`);
      console.log(`[SI][DETAIL][ROOT_VERIFY]\nname=${cleanName}\naddressElements=${addrCount}\nphoneElements=${phoneCount}\nwebsiteElements=${websiteCount}`);

      if (addrCount === 0 && phoneCount === 0 && websiteCount === 0) {
        console.log(`[SI][DETAIL][ROOT_SUSPECT]\nname=${cleanName}\nreason=no_detail_elements_in_root`);
        const broaderPane = panel.closest('div.m6QErb, div.TIwYe, div[role="main"], body') || panel;
        return { panel: broaderPane, companyName: cleanName };
      }

      return { panel, companyName: cleanName };
    }

    return null;
  }

  function extractDetailPanel(expectedName) {
    if (typeof document === "undefined") return null;

    const detailRoot = getActiveDetailPanel(expectedName);
    if (!detailRoot || !detailRoot.panel) return null;

    const panel = detailRoot.panel;
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

    // 1. Opening Hours / Status (Independent field)
    const hoursEl = DomUtils.first(panel, Selectors.detailHours) || panel.querySelector('[data-item-id="oh"], span.ZDu9vd, div.t3bW0d');
    const hoursText = DomUtils.text(hoursEl);
    if (hoursText) lead.opening_status = DomUtils.cleanUnicode(hoursText);

    // 2. Rating
    const ratingEl = DomUtils.first(panel, Selectors.detailRating);
    let ratingVal = DomUtils.num(DomUtils.text(ratingEl));
    if (ratingVal == null) {
      const container = panel.querySelector('div[aria-label*="stars"], span[aria-label*="stars"], div[aria-label*="rating"]');
      if (container) {
        const aria = container.getAttribute("aria-label") || "";
        const m = /(\d+\.\d+)/.exec(aria);
        if (m) ratingVal = Number(m[1]);
      }
    }
    lead.rating = ratingVal;

    // 3. Review Count
    const reviewEl = DomUtils.first(panel, Selectors.detailReviews);
    let reviewCountVal = DomUtils.num(DomUtils.text(reviewEl));
    if (reviewCountVal == null) {
      const container = panel.querySelector('button[aria-label*="reviews"], span[aria-label*="reviews"]');
      if (container) {
        const aria = container.getAttribute("aria-label") || "";
        const m = /([\d,]+)\s*reviews?/i.exec(aria);
        if (m) reviewCountVal = Number(m[1].replace(/,/g, ""));
      }
    }
    lead.review_count = reviewCountVal;

    // 4. Category
    const catEl = DomUtils.first(panel, Selectors.detailCategory);
    const rawCat = DomUtils.text(catEl);
    if (rawCat && !Validators.isPriceRangeText(rawCat) && !Validators.isRatingOrReviewText(rawCat) && !Validators.isPlusCodeText(rawCat)) {
      lead.category = rawCat;
      lead.business_type = rawCat;
    }

    // 5. Price Range
    const priceEl = DomUtils.first(panel, Selectors.detailPrice);
    const rawPrice = DomUtils.text(priceEl);
    if (rawPrice && Validators.isPriceRangeText(rawPrice)) {
      lead.price_range = rawPrice;
    }

    // 6. Address (Full string preserved as primary address)
    const addressBtn = panel.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label*="Address"], button[aria-label*="address"], [data-item-id*="address"]');
    if (addressBtn) {
      const ioText = addressBtn.querySelector('.Io6YTe');
      const rawAddr = ioText ? ioText.textContent.trim() : (addressBtn.getAttribute("aria-label") || DomUtils.text(addressBtn) || "");
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

    // 7. Phone (Strict: rejects UI actions like "Send to phone")
    lead.phone = extractPhoneFromPanel(panel);

    // 8. Website (Strict: captures external business domain, never Google Maps URLs)
    lead.website = extractWebsiteFromPanel(panel);

    // 9. Booking URL
    const bookingEl = DomUtils.first(panel, Selectors.detailBooking);
    if (bookingEl && bookingEl.href && /^https?:\/\//i.test(bookingEl.href)) {
      lead.booking_url = bookingEl.href.trim();
    }

    // 10. Ordering URL
    const orderingEl = DomUtils.first(panel, Selectors.detailOrdering);
    if (orderingEl && orderingEl.href && /^https?:\/\//i.test(orderingEl.href)) {
      lead.ordering_url = orderingEl.href.trim();
    }

    // 11. Menu URL
    const menuEl = DomUtils.first(panel, Selectors.detailMenu);
    if (menuEl && menuEl.href && /^https?:\/\//i.test(menuEl.href)) {
      lead.menu_url = menuEl.href.trim();
    }

    // Validate and Clean
    const valResult = Validators.validateAndCleanLead(lead);
    if (!valResult.valid) return null;

    const finalLead = valResult.lead;

    console.log("[SI][DETAIL][FIELDS]", JSON.stringify({
      company_name: finalLead.company_name,
      address: finalLead.address || null,
      phone: finalLead.phone || null,
      website: finalLead.website || null,
      opening_status: finalLead.opening_status || null,
    }));

    return finalLead;
  }

  return {
    extractPhoneFromText,
    resolveWebsiteUrl,
    getActiveDetailPanel,
    extractDetailPanel,
  };
});
