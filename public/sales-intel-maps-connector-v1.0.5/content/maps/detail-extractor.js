/**
 * MODE B — SELECTED DETAIL PANEL ENGINE (v1.0.5)
 * Dynamically locates the active place detail panel surface by business identity.
 * Scoped strictly to the active detail surface.
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

  const PHONE_RE = /(\+?\d[\d\-\s().]{6,}\d)/;

  /**
   * Authoritative Detail Panel Surface Locator.
   * Locates the active business detail surface using semantic business identity anchors.
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
    const semanticAnchor = document.querySelector('[data-item-id="address"], [data-item-id^="phone"], [data-item-id="authority"], [data-item-id="oh"]');
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
      const phoneCount = panel.querySelectorAll('[data-item-id^="phone"], [aria-label*="Phone"], a[href^="tel:"]').length;
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

    // 1. Opening Hours / Status
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

    // 6. Address (Full String Preserved)
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

    // 7. Phone (Optional, non-fatal)
    const phoneBtn = panel.querySelector('button[data-item-id^="phone"], [data-item-id^="phone"], button[aria-label*="Phone"], button[aria-label*="phone"], a[href^="tel:"]');
    if (phoneBtn) {
      const ioText = phoneBtn.querySelector('.Io6YTe');
      let rawPhone = ioText ? ioText.textContent.trim() : (phoneBtn.getAttribute("aria-label") || phoneBtn.getAttribute("href") || DomUtils.text(phoneBtn) || "");
      rawPhone = DomUtils.cleanPrefix(rawPhone, /^(Phone:?|tel:?)\s*/i);

      if (rawPhone) {
        const pm = PHONE_RE.exec(rawPhone);
        if (pm) lead.phone = pm[1].trim();
        else if (!rawPhone.toLowerCase().includes("copy")) lead.phone = rawPhone.trim();
      }
    }

    // 8. Website (Optional, non-fatal)
    const websiteEl = panel.querySelector('a[data-item-id="authority"], [data-item-id="authority"], a[aria-label*="Website"], a[aria-label*="website"]');
    if (websiteEl) {
      const href = websiteEl.href || websiteEl.getAttribute("href") || "";
      if (href && /^https?:\/\//i.test(href) && Validators.isWebsiteText(href)) {
        lead.website = href.trim();
      } else {
        const ioText = websiteEl.querySelector('.Io6YTe');
        const textVal = ioText ? ioText.textContent.trim() : (DomUtils.text(websiteEl) || websiteEl.getAttribute("aria-label") || "");
        const cleanVal = DomUtils.cleanPrefix(textVal, /^(website:?|web site:?)\s*/i);
        if (Validators.isWebsiteText(cleanVal)) {
          lead.website = cleanVal;
        }
      }
    }

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

    // Validate and Clean (Missing phone/website/address does NOT fail the lead)
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
    getActiveDetailPanel,
    extractDetailPanel,
  };
});
