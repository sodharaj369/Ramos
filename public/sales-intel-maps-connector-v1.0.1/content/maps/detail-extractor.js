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

  function inspectDetailPanelDiagnostic(panel) {
    if (!panel || typeof console === "undefined" || !console.log) return;

    console.log("[SI][DETAIL_TEST][PANEL_READY]");

    // 1. Phone
    const phoneEl = panel.querySelector('button[data-item-id^="phone"], [data-item-id^="phone"], button[aria-label*="Phone"], button[aria-label*="phone"], a[href^="tel:"]');
    if (phoneEl) {
      console.log("[SI][DETAIL_TEST][PHONE]", {
        found: true,
        selector: phoneEl.getAttribute("data-item-id") ? `[data-item-id="${phoneEl.getAttribute("data-item-id")}"]` : phoneEl.tagName,
        ariaLabel: phoneEl.getAttribute("aria-label"),
        textContent: (phoneEl.textContent || "").trim(),
        href: phoneEl.getAttribute("href"),
      });
    } else {
      console.log("[SI][DETAIL_TEST][PHONE]", "NOT_FOUND in active div[role='main']");
    }

    // 2. Website
    const websiteEl = panel.querySelector('a[data-item-id="authority"], [data-item-id="authority"], a[aria-label*="Website"], a[aria-label*="website"]');
    if (websiteEl) {
      console.log("[SI][DETAIL_TEST][WEBSITE]", {
        found: true,
        selector: websiteEl.getAttribute("data-item-id") ? `[data-item-id="${websiteEl.getAttribute("data-item-id")}"]` : websiteEl.tagName,
        ariaLabel: websiteEl.getAttribute("aria-label"),
        textContent: (websiteEl.textContent || "").trim(),
        href: websiteEl.getAttribute("href"),
      });
    } else {
      console.log("[SI][DETAIL_TEST][WEBSITE]", "NOT_FOUND in active div[role='main']");
    }

    // 3. Address
    const addressEl = panel.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label*="Address"], button[aria-label*="address"]');
    if (addressEl) {
      console.log("[SI][DETAIL_TEST][ADDRESS]", {
        found: true,
        ariaLabel: addressEl.getAttribute("aria-label"),
        textContent: (addressEl.textContent || "").trim(),
      });
    } else {
      console.log("[SI][DETAIL_TEST][ADDRESS]", "NOT_FOUND in active div[role='main']");
    }

    // 4. Opening Status
    const hoursEl = panel.querySelector('div[data-item-id="oh"], button[aria-label*="Hours"], div.t3bW0d, span.ZDu9vd');
    if (hoursEl) {
      console.log("[SI][DETAIL_TEST][OPENING]", {
        found: true,
        ariaLabel: hoursEl.getAttribute("aria-label"),
        textContent: (hoursEl.textContent || "").trim(),
      });
    } else {
      console.log("[SI][DETAIL_TEST][OPENING]", "NOT_FOUND in active div[role='main']");
    }
  }

  function extractDetailPanel() {
    if (typeof document === "undefined") return null;

    const panel = DomUtils.first(document, Selectors.detailPanel);
    if (!panel) return null;

    inspectDetailPanelDiagnostic(panel);

    const rawName = DomUtils.text(DomUtils.first(panel, Selectors.detailTitle));
    if (!rawName) return null;

    const companyName = DomUtils.cleanUnicode(rawName);
    if (!companyName.length || Validators.isUIElementTitle(companyName)) return null;

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

    // 6. Address (Query semantic address control inside active detail panel)
    const addressBtn = panel.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label*="Address"], button[aria-label*="address"]');
    if (addressBtn) {
      const ioText = addressBtn.querySelector('.Io6YTe');
      const rawAddr = ioText ? ioText.textContent.trim() : (addressBtn.getAttribute("aria-label") || DomUtils.text(addressBtn) || "");
      const cleanAddr = Validators.cleanAddress(DomUtils.cleanPrefix(rawAddr, /^Address:\s*/i), lead.opening_status);
      if (cleanAddr) {
        const parsedLoc = AddressParser.parseAddress(cleanAddr);
        lead.address = parsedLoc.address || cleanAddr;
        lead.city = parsedLoc.city;
        lead.region = parsedLoc.region;
        lead.country = parsedLoc.country;
        lead.postal_code = parsedLoc.postal_code;
      }
    }

    // 7. Phone (Extract in order: 1. .Io6YTe text, 2. aria-label, 3. a[href^="tel:"])
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

    // 8. Website (Extract genuine website anchors from active detail panel)
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

    // Validate and Clean
    const valResult = Validators.validateAndCleanLead(lead);
    if (!valResult.valid) return null;

    const finalLead = valResult.lead;
    if (typeof console !== "undefined" && console.log) {
      console.log(`[SI][ENRICH][BUSINESS] company=${finalLead.company_name}`);
      const checkFields = ["address", "phone", "website", "menu_url", "opening_status", "price_range", "rating", "review_count"];
      for (const f of checkFields) {
        if (finalLead[f] != null) {
          console.log(`[SI][ENRICH][FIELD] ${f}=FOUND`);
        } else {
          console.log(`[SI][ENRICH][FIELD] ${f}=NOT_FOUND reason=no dedicated ${f} control or extraction failed`);
        }
      }
    }

    return finalLead;
  }

  return {
    extractDetailPanel,
  };
});
