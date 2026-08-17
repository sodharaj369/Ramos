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
      require("./result-card-extractor")
    );
  } else {
    root.SalesIntelMapsAdapter = factory(
      root.SalesIntelConstants,
      root.SalesIntelSchema,
      root.SalesIntelDomUtils,
      root.SalesIntelSelectors,
      root.SalesIntelValidators,
      root.SalesIntelAddressParser,
      root.SalesIntelResultCardExtractor
    );
  }
})(typeof self !== "undefined" ? self : this, function (Constants, Schema, DomUtils, Selectors, Validators, AddressParser, ResultCardExtractor) {
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
    const feed = getFeed();
    const rootEl = feed || (typeof document !== "undefined" ? document : null);
    if (!rootEl) return [];
    const sels = Selectors.card;
    for (const sel of sels) {
      const els = rootEl.querySelectorAll(sel);
      if (els && els.length) return Array.from(els);
    }
    return [];
  }

  /**
   * Returns only cards that pass the full business qualification check.
   * Used for Detected Cards count — prevents false positives on Maps home screen.
   */
  function getQualifiedCardElements() {
    const rawCards = getRawCardElements();
    if (!rawCards.length) return [];
    return rawCards.filter((cardEl) => {
      const qual = ResultCardExtractor.isBusinessResultCard(cardEl);
      return Boolean(qual && qual.qualified);
    });
  }

  function isSearchResultsPage() {
    if (!isMapsPage()) return false;
    const qualified = getQualifiedCardElements();
    return qualified.length > 0;
  }

  function currentQuery() {
    if (typeof document === "undefined") return null;
    const box = DomUtils.first(document, Selectors.searchBox);
    if (box && box.value && box.value.trim()) return box.value.trim();
    if (typeof location !== "undefined") {
      const m = /\/maps\/search\/([^/@]+)/.exec(location.pathname);
      if (m && m[1]) return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null;
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

  return {
    SELECTORS: Selectors,
    ResultCardExtractor,
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
  };
});
