/**
 * MODE A — SEARCH RESULT CARD ENGINE
 * Extracts business information strictly within an individual Google Maps result card element.
 * Scope: ONE CARD AT A TIME. Queries descendants of cardEl ONLY.
 * Implements structural business qualification boundary (isBusinessResultCard).
 * Never queries whole document, neighboring cards, or active detail panel.
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
    root.SalesIntelResultCardExtractor = factory(
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
  const OPEN_STATUS_RE = /\b(open\s*soon|closed\s*·\s*opens|closes\s*\d{1,2}(:\d{2})?\s*(am|pm)?|opens\s*\d{1,2}(:\d{2})?\s*(am|pm)?|open|closed|temporarily\s*closed|permanently\s*closed)\b/i;

  function isInsideDetailPanel(cardEl) {
    if (!cardEl || !cardEl.closest) return false;

    // Elements inside the search results feed are NEVER detail panels
    if (cardEl.closest('div[role="feed"], div[aria-label*="Results for" i], div[aria-label*="Search results" i]')) {
      return false;
    }

    // Direct result card classes are never detail panels
    if (cardEl.classList && (cardEl.classList.contains("Nv2PK") || cardEl.classList.contains("hfpxzc"))) {
      return false;
    }

    // Active detail panel contains specific business detail headers (h1.DUwif, address button)
    const mainPanel = cardEl.closest('div[role="main"]');
    if (mainPanel) {
      if (mainPanel.getAttribute("role") === "feed" || (mainPanel.getAttribute("aria-label") || "").toLowerCase().includes("results")) {
        return false;
      }
      const hasDetailHeader = Boolean(mainPanel.querySelector('h1.DUwif, h1.fontTitleLarge, button[data-item-id="address"]'));
      return hasDetailHeader;
    }

    return false;
  }

  function isBusinessResultCard(cardEl) {
    if (!cardEl || !cardEl.querySelector) {
      return { qualified: false, reason: "Not a valid DOM element", name: null };
    }

    if (cardEl.matches && cardEl.matches("a.hfpxzc")) {
      const parentCard = cardEl.closest('div.Nv2PK, div[role="article"]');
      if (parentCard) cardEl = parentCard;
    }

    // Exclude elements inside the active detail panel
    if (isInsideDetailPanel(cardEl)) {
      return { qualified: false, reason: "Inside active detail panel", name: null };
    }

    const nameLink = DomUtils.first(cardEl, Selectors.cardLink) || (cardEl.matches && cardEl.matches("a.hfpxzc") ? cardEl : null);
    const href = nameLink ? (nameLink.href || nameLink.getAttribute("href")) : null;
    const placeId = DomUtils.placeIdFromHref(href);

    const rawName = DomUtils.text(DomUtils.first(cardEl, Selectors.cardTitle)) || (nameLink && nameLink.getAttribute("aria-label")) || (cardEl.getAttribute && cardEl.getAttribute("aria-label")) || null;
    if (!rawName) {
      return { qualified: false, reason: "Missing company title", name: null };
    }

    const companyName = DomUtils.cleanUnicode(rawName);
    if (Validators.isUIElementTitle(companyName)) {
      return { qualified: false, reason: `UI element blacklisted title: "${companyName}"`, name: companyName };
    }

    return { qualified: true, reason: null, name: companyName, href, placeId };
  }

  function extractOpeningStatus(cardEl) {
    const rows = DomUtils.all(cardEl, Selectors.cardRows);
    for (const row of rows) {
      const textContent = DomUtils.text(row);
      if (!textContent) continue;
      const match = OPEN_STATUS_RE.exec(textContent);
      if (match) {
        return DomUtils.cleanUnicode(match[0]);
      }
    }
    return null;
  }

  function extractResultCard(cardEl) {
    const qual = isBusinessResultCard(cardEl);
    if (!qual.qualified) return null;

    const lead = Schema.createCanonicalLead();
    lead.company_name = qual.name;
    lead.source_url = qual.href || null;
    lead.place_id = qual.placeId || DomUtils.placeIdFromHref(qual.href);

    const coords = DomUtils.coordsFromHref(qual.href);
    lead.latitude = coords.latitude;
    lead.longitude = coords.longitude;
    lead.extraction_mode = Constants.EXTRACTION_MODES.RESULT_CARD;

    const rows = DomUtils.all(cardEl, Selectors.cardRows);

    let ratingVal = null;
    let reviewCountVal = null;
    let priceRangeVal = null;
    let categoryVal = null;
    let addressSnippetVal = null;
    let phoneVal = null;

    const ratingEl = DomUtils.first(cardEl, Selectors.cardRating);
    if (ratingEl) {
      ratingVal = DomUtils.num(DomUtils.text(ratingEl));
    }

    const reviewEl = DomUtils.first(cardEl, Selectors.cardReviews);
    if (reviewEl) {
      reviewCountVal = DomUtils.num(DomUtils.text(reviewEl));
    }

    // Direct phone element query inside result card
    const phoneEl = cardEl.querySelector('button[data-item-id^="phone"], [data-item-id^="phone"], [aria-label*="Phone"], [aria-label*="phone"], a[href^="tel:"]');
    if (phoneEl) {
      const href = phoneEl.getAttribute("href") || "";
      const aria = phoneEl.getAttribute("aria-label") || "";
      const text = DomUtils.text(phoneEl) || "";
      if (href.startsWith("tel:")) {
        phoneVal = href.replace(/^tel:/i, "").trim();
      } else if (PHONE_RE.test(aria)) {
        const pm = PHONE_RE.exec(aria);
        if (pm) phoneVal = pm[1].trim();
      } else if (PHONE_RE.test(text)) {
        const pm = PHONE_RE.exec(text);
        if (pm) phoneVal = pm[1].trim();
      }
    }

    const openingStatus = extractOpeningStatus(cardEl);
    lead.opening_status = openingStatus;

    for (const row of rows) {
      const textContent = DomUtils.text(row);
      if (!textContent) continue;

      const parts = textContent
        .split(/[·\n]/)
        .map((p) => DomUtils.cleanUnicode(p))
        .filter(Boolean);

      for (const part of parts) {
        if (!ratingVal || !reviewCountVal) {
          const rrMatch = /^(\d\.\d)\s*\(([\d,]+)\)$/.exec(part);
          if (rrMatch) {
            if (!ratingVal) ratingVal = Number(rrMatch[1]);
            if (!reviewCountVal) reviewCountVal = Number(rrMatch[2].replace(/,/g, ""));
            continue;
          }
        }

        if (!ratingVal && /^(\d\.\d)$/.exec(part)) {
          ratingVal = Number(part);
          continue;
        }

        if (!reviewCountVal && /^\(([\d,]+)\)$/.exec(part)) {
          reviewCountVal = Number(part.replace(/[^\d]/g, ""));
          continue;
        }

        if (!priceRangeVal && Validators.isPriceRangeText(part)) {
          priceRangeVal = part;
          continue;
        }

        if (!phoneVal && PHONE_RE.test(part)) {
          const pm = PHONE_RE.exec(part);
          if (pm) phoneVal = pm[1].trim();
          continue;
        }

        if (OPEN_STATUS_RE.test(part)) continue;

        if (/^(dine-in|takeaway|delivery|in-store pickup|curbside pickup|drive-through)$/i.test(part)) {
          continue;
        }

        if (!Validators.isRatingOrReviewText(part) && !Validators.isPriceRangeText(part) && !Validators.isUIElementTitle(part) && !Validators.isPlusCodeText(part)) {
          if (!categoryVal && !/\d/.test(part) && part.length < 50) {
            categoryVal = part;
          } else if (!addressSnippetVal && part !== categoryVal && part !== qual.name) {
            addressSnippetVal = part;
          }
        }
      }
    }

    // Website link inside card strictly if present
    const websiteEl = cardEl.querySelector('a[data-item-id="authority"], a[aria-label*="Website"], a[aria-label*="website"], a[data-value="Website"]');
    if (websiteEl) {
      const href = websiteEl.href || websiteEl.getAttribute("href") || "";
      if (href && /^https?:\/\//i.test(href) && Validators.isWebsiteText(href)) {
        lead.website = href.trim();
      } else {
        const textVal = DomUtils.text(websiteEl);
        if (Validators.isWebsiteText(textVal)) {
          lead.website = textVal;
        }
      }
    }

    lead.rating = ratingVal;
    lead.review_count = reviewCountVal;
    lead.price_range = priceRangeVal;
    lead.category = categoryVal;
    lead.business_type = categoryVal;
    lead.phone = phoneVal;

    const cleanAddr = Validators.cleanAddress(addressSnippetVal, openingStatus);
    if (cleanAddr) {
      const parsedLoc = AddressParser.parseAddress(cleanAddr);
      lead.address = parsedLoc.address;
      lead.city = parsedLoc.city;
      lead.region = parsedLoc.region;
      lead.country = parsedLoc.country;
      lead.postal_code = parsedLoc.postal_code;
    } else {
      lead.address = null;
      lead.city = null;
      lead.region = null;
      lead.country = null;
      lead.postal_code = null;
    }

    const valResult = Validators.validateAndCleanLead(lead);
    if (!valResult.valid) return null;

    return valResult.lead;
  }

  return {
    isBusinessResultCard,
    extractOpeningStatus,
    extractResultCard,
  };
});
