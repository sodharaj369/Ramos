/**
 * Google Maps Content Script Orchestrator — Mode A Only (Search Result Cards).
 * Mode B (Selected Business Detail Panel) has been removed.
 * This file exposes only bulk search result card discovery.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../../shared/constants"),
      require("../../shared/schema"),
      require("./dom-utils"),
      require("./selectors"),
      require("./validators"),
      require("./address-parser"),
      require("./result-card-extractor"),
      require("./detail-extractor")
    );
  } else {
    root.SalesIntelMapsAdapter = factory(
      root.SalesIntelConstants,
      root.SalesIntelSchema,
      root.SalesIntelDomUtils,
      root.SalesIntelSelectors,
      root.SalesIntelValidators,
      root.SalesIntelAddressParser,
      root.SalesIntelResultCardExtractor,
      root.SalesIntelDetailExtractor
    );
  }
})(typeof self !== "undefined" ? self : this, function (Constants, Schema, DomUtils, Selectors, Validators, AddressParser, ResultCardExtractor, DetailExtractor) {
  "use strict";

  const DEBUG = true;

  function isMapsPage() {
    if (typeof location === "undefined") return false;
    const host = location.hostname.toLowerCase();
    const isGoogle = host === "google.com" || host === "www.google.com" || host === "maps.google.com" || /(^|\.)google\.[a-z.]+$/.test(host);
    const isMaps = location.pathname.startsWith("/maps") || host.startsWith("maps.google.");
    return isGoogle && isMaps;
  }

  function getFeed() {
    if (typeof document === "undefined") return null;
    return DomUtils.first(document, Selectors.feed);
  }

  function getRawCardElements() {
    if (typeof document === "undefined") return [];

    const elementsSet = new Set();
    const cardSelectors = [
      'div[role="article"].Nv2PK',
      'div.Nv2PK',
      'div[role="feed"] div[role="article"]',
      'div[role="article"]',
      'a.hfpxzc',
      'div[jsaction*="mouseover:pane"]',
    ];

    const feed = getFeed();
    const roots = feed ? [feed, document] : [document];

    for (const root of roots) {
      for (const sel of cardSelectors) {
        try {
          const els = root.querySelectorAll(sel);
          for (const el of els) {
            // If el is an anchor a.hfpxzc, get its card container if available
            const cardEl = el.matches && el.matches('a.hfpxzc') ? (el.closest('div[role="article"], div.Nv2PK') || el) : el;
            elementsSet.add(cardEl);
          }
        } catch (e) {}
      }
    }

    return Array.from(elementsSet);
  }

  /**
   * Returns only cards that pass the full business qualification check,
   * deduplicated by Google Maps place ID.
   */
  function getQualifiedCardElements() {
    const rawCards = getRawCardElements();
    if (!rawCards.length) return [];

    const qualified = [];
    const seenPlaceIds = new Set();
    const seenNames = new Set();

    for (const cardEl of rawCards) {
      const qual = ResultCardExtractor.isBusinessResultCard(cardEl);
      if (!qual || !qual.qualified) continue;

      const placeId = qual.placeId || DomUtils.placeIdFromHref(qual.href);
      if (placeId) {
        if (seenPlaceIds.has(placeId)) continue;
        seenPlaceIds.add(placeId);
      } else {
        const norm = (qual.name || "").toLowerCase().trim();
        if (seenNames.has(norm)) continue;
        seenNames.add(norm);
      }

      qualified.push(cardEl);
    }

    return qualified;
  }

  function isSearchResultsPage() {
    if (!isMapsPage()) return false;
    const qualified = getQualifiedCardElements();
    return qualified.length > 0;
  }

  function currentQuery() {
    if (typeof document === "undefined") return null;
    const box =
      DomUtils.first(document, Selectors.searchBox) ||
      document.querySelector('input#searchboxinput, input[name="q"], input[aria-label*="Search" i], input.searchboxinput');
    if (box && box.value && box.value.trim()) return box.value.trim();
    if (typeof location !== "undefined") {
      const m = /\/maps\/search\/([^/@]+)/.exec(location.pathname);
      if (m && m[1]) return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null;
      const mPlace = /\/maps\/place\/([^/@]+)/.exec(location.pathname);
      if (mPlace && mPlace[1]) return decodeURIComponent(mPlace[1].replace(/\+/g, " ")).trim() || null;
      const mHref = /\/maps\/search\/([^/@?]+)/.exec(location.href);
      if (mHref && mHref[1]) return decodeURIComponent(mHref[1].replace(/\+/g, " ")).trim() || null;
    }
    return null;
  }

  function reachedEnd() {
    const feed = getFeed();
    if (!feed) return true;
    return Boolean(DomUtils.first(feed, Selectors.endOfList));
  }

  function localKey(record) {
    if (!record) return null;
    return (
      record.place_id ||
      record.source_url ||
      `${(record.company_name || "").toLowerCase()}|${(record.address || "").toLowerCase()}`
    );
  }

  function extractResultCard(cardEl) {
    const lead = ResultCardExtractor.extractResultCard(cardEl);
    if (DEBUG && lead && typeof console !== "undefined" && console.log) {
      console.group("[Sales Intel] Mode A — Result Card Extracted");
      console.log("Company:", lead.company_name);
      console.log("Category:", lead.category);
      console.log("Address:", lead.address);
      console.log("City:", lead.city);
      console.log("Region:", lead.region);
      console.log("Country:", lead.country);
      console.log("Postal:", lead.postal_code);
      console.log("Rating:", lead.rating);
      console.log("Reviews:", lead.review_count);
      console.log("Price:", lead.price_range);
      console.log("Hours:", lead.opening_status);
      console.log("Website:", lead.website);
      console.log("Phone:", lead.phone);
      console.log("Source URL:", lead.source_url);
      console.groupEnd();
    }
    return lead;
  }

  function extractDetailPanel(expectedName) {
    const detailExt = DetailExtractor || (typeof window !== "undefined" ? window.SalesIntelDetailExtractor : null);
    if (detailExt && detailExt.extractDetailPanel) {
      return detailExt.extractDetailPanel(expectedName);
    }
    return null;
  }

  function findCurrentCardElement(identity) {
    const cards = getRawCardElements();
    if (!cards.length) return null;
    for (const card of cards) {
      const cardLead = ResultCardExtractor.extractResultCard(card);
      if (!cardLead) continue;
      if (identity.place_id && cardLead.place_id === identity.place_id) return card;
      if (identity.source_url && cardLead.source_url === identity.source_url) return card;
      if (identity.company_name && cardLead.company_name &&
          identity.company_name.toLowerCase().trim() === cardLead.company_name.toLowerCase().trim()) {
        return card;
      }
    }
    return null;
  }

  function normalizeName(name) {
    if (!name) return "";
    return String(name).toLowerCase().replace(/['"’]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }

  async function enrichCandidate(cardEl, cardLead, idx = 1) {
    const name = cardLead.company_name;
    console.log(`[SI][LOOP][${idx}][START]\nname=${name}`);

    const identity = {
      place_id: cardLead.place_id,
      source_url: cardLead.source_url,
      company_name: cardLead.company_name,
    };

    const targetCard = cardEl || findCurrentCardElement(identity);
    if (!targetCard) {
      console.log(`[SI][LOOP][${idx}][FAILED] name=${name} reason=card_not_in_dom`);
      return null;
    }

    console.log(`[SI][DETAIL_TEST][CLICK] ${name}`);
    console.log(`[SI][LOOP][${idx}][CLICK]\nname=${name}`);

    try {
      const link = targetCard.querySelector('a.hfpxzc') || targetCard.querySelector('div.qBF1Pd') || targetCard.querySelector('button') || targetCard;
      if (link) {
        if (typeof link.scrollIntoView === "function") {
          link.scrollIntoView({ block: "center" });
        }
        const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
        link.dispatchEvent(evt);
        if (typeof link.click === "function") {
          link.click();
        }
      }
    } catch (e) {
      /* non-fatal click failure */
    }

    // Dynamic Bounded Wait (up to 20 checks x 400ms = 8000ms max)
    let detailLead = null;
    let attempts = 0;
    const maxAttempts = 20;
    let panelReadyLogged = false;

    while (attempts < maxAttempts) {
      await DomUtils.sleep(400);
      attempts++;
      const currentDetail = extractDetailPanel(name);
      if (currentDetail && currentDetail.company_name) {
        if (!panelReadyLogged) {
          console.log(`[SI][LOOP][${idx}][DETAIL_READY]\nname=${name}`);
          panelReadyLogged = true;
        }

        const expectedNorm = normalizeName(cardLead.company_name);
        const actualNorm = normalizeName(currentDetail.company_name);

        if (actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm)) {
          detailLead = currentDetail;
          console.log(`[SI][LOOP][${idx}][IDENTITY_OK]\nname=${name}`);
          break;
        }
      }
    }

    if (detailLead && detailLead.company_name) {
      detailLead.source = "detail";
      const detailSummary = {
        company_name: detailLead.company_name,
        address: detailLead.address || null,
        phone: detailLead.phone || null,
        website: detailLead.website || null,
        opening_status: detailLead.opening_status || null,
      };
      console.log(`[SI][LOOP][${idx}][DETAIL_DATA]`, JSON.stringify(detailSummary));
      console.log(`[SI][LOOP][${idx}][COMPLETE]\nname=${name}`);
      return detailLead;
    }

    console.log(`[SI][LOOP][${idx}][FAILED] name=${name} reason=detail_panel_not_extracted`);
    return null;
  }

  return {
    SELECTORS: Selectors,
    ResultCardExtractor,
    DetailExtractor,
    isMapsPage,
    isSearchResultsPage,
    currentQuery,
    getFeed,
    getVisibleCardElements: getRawCardElements,
    getQualifiedCardElements,
    reachedEnd,
    localKey,
    extractCard: extractResultCard,
    extractResultCard,
    extractDetailPanel,
    enrichCandidate,
    findCurrentCardElement,
    Validators,
  };
});
