/**
 * MODE B — SELECTED DETAIL PANEL ENGINE
 * Extracts business information strictly from the active place detail panel (div[role="main"]).
 * Scope: ACTIVE DETAIL PANEL ONLY.
 * Trust dedicated semantic controls ONLY. Missing fields remain null.
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

  function extractDetailPanel() {
    if (typeof document === "undefined") return null;

    const panel = DomUtils.first(document, Selectors.detailPanel);
    if (!panel) return null;

    const rawName = DomUtils.text(DomUtils.first(panel, Selectors.detailTitle));
    if (!rawName) return null;

    const companyName = DomUtils.cleanUnicode(rawName);
    if (!companyName.length || Validators.isUIElementTitle(companyName)) return null;

    const lead = Schema.createCanonicalLead();
    lead.company_name = companyName;
    lead.extraction_mode = Constants.EXTRACTION_MODES.DETAIL_PANEL;

    const currentHref = typeof location !== "undefined" ? location.href : "";
    lead.source_url = Validators.isValidUrl(currentHref) ? currentHref : null;
    lead.place_id = DomUtils.placeIdFromHref(currentHref);

    const coords = DomUtils.coordsFromHref(currentHref);
    lead.latitude = coords.latitude;
    lead.longitude = coords.longitude;

    // 1. Opening Hours / Status
    const hoursEl = DomUtils.first(panel, Selectors.detailHours);
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

    // 6. Address (Query semantic address control ONLY)
    const addressBtn = DomUtils.first(panel, Selectors.detailAddress);
    if (addressBtn) {
      const aria = addressBtn.getAttribute("aria-label") || DomUtils.text(addressBtn) || "";
      const rawAddr = DomUtils.cleanPrefix(aria, /^Address:\s*/i);
      const cleanAddr = Validators.cleanAddress(rawAddr, lead.opening_status);
      if (cleanAddr) {
        const parsedLoc = AddressParser.parseAddress(cleanAddr);
        lead.address = parsedLoc.address;
        lead.city = parsedLoc.city;
        lead.region = parsedLoc.region;
        lead.country = parsedLoc.country;
        lead.postal_code = parsedLoc.postal_code;
      }
    }

    // 7. Phone (Query semantic phone control ONLY)
    const phoneBtn = DomUtils.first(panel, Selectors.detailPhone);
    if (phoneBtn) {
      const aria = phoneBtn.getAttribute("aria-label") || DomUtils.text(phoneBtn) || "";
      const cleanedPhone = DomUtils.cleanPrefix(aria, /^Phone:\s*/i);
      if (cleanedPhone) {
        const pm = PHONE_RE.exec(cleanedPhone);
        if (pm) lead.phone = pm[1].trim();
        else if (!cleanedPhone.toLowerCase().includes("copy")) lead.phone = cleanedPhone;
      }
    }

    // 8. Website (Semantic Priority: 1. Authority href, 2. Visible Domain Text inside authority control)
    const websiteEl = DomUtils.first(panel, Selectors.detailWebsite) || panel.querySelector('[data-item-id="authority"], [aria-label*="Website"], [aria-label*="website"]');
    if (websiteEl) {
      const href = websiteEl.href || websiteEl.getAttribute("href") || "";
      if (href && /^https?:\/\//i.test(href) && Validators.isWebsiteText(href)) {
        lead.website = href.trim();
      } else {
        const textVal = DomUtils.text(websiteEl) || websiteEl.getAttribute("aria-label") || "";
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

    // Validate and Clean
    const valResult = Validators.validateAndCleanLead(lead);
    if (!valResult.valid) return null;

    return valResult.lead;
  }

  return {
    extractDetailPanel,
  };
});
