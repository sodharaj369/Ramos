/**
 * Centralized Google Maps Selector Registry.
 * Prefers semantic indicators (role, aria-label, data-item-id, href patterns).
 * Do not scatter Google Maps selectors across content scripts.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelSelectors = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SELECTORS = {
    // Mode A — Search Result Cards & Feed
    feed: ['div[role="feed"]', 'div[aria-label^="Results for"]', '.m6QErb[aria-label]'],
    card: ['div[role="article"].Nv2PK', 'div[role="article"]', 'div.Nv2PK', 'div[jsaction*="mouseover:pane"]'],
    cardTitle: ['div.qBF1Pd', 'div.fontHeadlineSmall', 'h3'],
    cardLink: ['a.hfpxzc'],
    cardRows: ['div.W4Efsd'],
    cardRating: ['span.MW43ec', 'span[aria-label*="stars"]', 'span.ceW3r'],
    cardReviews: ['span.UY7F9', 'span[aria-label*="reviews"]'],

    // Mode B — Active Business Detail Panel
    detailPanel: ['div[role="main"]', 'div.TIwYe', 'div.bJ181e'],
    detailTitle: ['h1.DUwif', 'h1.fontTitleLarge', 'h1.section-hero-header-title-title', 'h1'],
    detailCategory: ['button.DkEaL', 'span.DkEaL', 'button[jsaction*="category"]', 'button[aria-label*="Category"]'],
    detailRating: ['div.F7vFfd span.fontBodyMedium', 'span.ceW3r', 'div.fontBodyMedium span[aria-hidden="true"]'],
    detailReviews: ['button.HH2ffc span', 'span[aria-label*="reviews"]', 'button[aria-label*="reviews"]'],
    detailPrice: ['span.mgr77e span', 'span[aria-label*="Price"]', 'span[aria-label*="Cost"]'],
    detailAddress: [
      'button[data-item-id="address"]',
      '[data-item-id="address"]',
      'button[aria-label*="Address"]',
      'button[aria-label*="address"]',
      '[aria-label*="Address:"]',
    ],
    detailPhone: [
      'button[data-item-id^="phone"]',
      '[data-item-id^="phone"]',
      'button[aria-label*="Phone"]',
      'button[aria-label*="phone"]',
    ],
    detailWebsite: [
      'a[data-item-id="authority"]',
      '[data-item-id="authority"]',
      'a[aria-label*="Website"]',
      'a[aria-label*="website"]',
    ],
    detailMenu: ['a[data-item-id="menu"]', 'a[aria-label*="Menu"]', 'a[aria-label*="menu"]'],
    detailOrdering: ['a[data-item-id*="order"]', 'a[aria-label*="Order"]', 'a[aria-label*="Order online"]', 'button[aria-label*="Order"]'],
    detailBooking: ['a[data-item-id*="reserve"]', 'a[aria-label*="Reserve"]', 'a[aria-label*="Reserve a table"]', 'a[aria-label*="Book"]'],
    detailHours: ['div[data-item-id="oh"]', 'button[aria-label*="Hours"]', 'div.t3bW0d', 'span.ZDu9vd'],
    detailPlusCode: ['button[data-item-id="oloc"]', 'button[aria-label*="Plus code"]'],

    // UI & Navigation
    backBtn: ['button[aria-label="Back"]', 'button[aria-label="Close"]', 'button[jsaction*="back"]'],
    searchBox: ['input#searchboxinput', 'input[name="q"]'],
    endOfList: ['span.HlvSq', 'div.PbZDve'],
  };

  return SELECTORS;
});
