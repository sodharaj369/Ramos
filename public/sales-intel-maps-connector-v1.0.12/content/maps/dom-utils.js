/**
 * Safe DOM querying and parsing utilities for Google Maps extraction.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelDomUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function cleanUnicode(str) {
    if (!str) return "";
    return str
      .replace(/[\uFFFD\u2605\u2b50★]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function first(rootEl, selectors) {
    if (!rootEl) return null;
    for (const sel of selectors) {
      try {
        const el = rootEl.querySelector(sel);
        if (el) return el;
      } catch {
        /* invalid selector fallback */
      }
    }
    return null;
  }

  function all(rootEl, selectors) {
    if (!rootEl) return [];
    for (const sel of selectors) {
      try {
        const els = rootEl.querySelectorAll(sel);
        if (els && els.length) return Array.from(els);
      } catch {
        /* invalid selector fallback */
      }
    }
    return [];
  }

  function text(el) {
    if (!el || !el.textContent) return null;
    const cleaned = cleanUnicode(el.textContent);
    return cleaned.length ? cleaned : null;
  }

  function num(v) {
    if (v == null) return null;
    const str = String(v).replace(/[^\d.]/g, "");
    if (!str.length) return null;
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }

  function coordsFromHref(href) {
    if (!href) return { latitude: null, longitude: null };
    const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(href);
    if (!m) return { latitude: null, longitude: null };
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return {
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    };
  }

  function placeIdFromHref(href) {
    if (!href) return null;
    const m = /!19s([^!?]+)/.exec(href) || /place_id[:=]([A-Za-z0-9_-]+)/.exec(href);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function cleanPrefix(val, prefixRegex) {
    if (!val) return null;
    const cleaned = cleanUnicode(val);
    return cleaned.replace(prefixRegex, "").trim() || null;
  }

  return {
    cleanUnicode,
    first,
    all,
    text,
    num,
    coordsFromHref,
    placeIdFromHref,
    cleanPrefix,
  };
});
