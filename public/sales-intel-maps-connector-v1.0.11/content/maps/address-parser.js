/**
 * Dedicated Address & Location Parser for Sales Intel Chrome Extension.
 * Operates ONLY on valid address strings. Never uses search queries or page text as fallbacks.
 * Postal codes MUST ALWAYS remain strings (preserves leading zeros and exact formatted representations).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelAddressParser = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5,6}(?:-\d{4})?)\b/;

  function cleanUnicode(str) {
    if (!str) return "";
    return String(str)
      .replace(/[\uFFFD\u2605\u2b50★]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isRatingOrReviewText(part) {
    if (!part) return false;
    const p = cleanUnicode(part);
    if (!p) return false;
    if (/^\d{5,6}(-\d{4})?$/.test(p)) return false;
    return (
      /^\d(\.\d)?\s*\([\d,]+\s*(reviews?)?\)$/i.test(p) ||
      /^\d\.\d$/i.test(p) ||
      /^\([\d,]+\s*(reviews?)?\)$/i.test(p) ||
      /^[\d,]+\s*reviews?$/i.test(p) ||
      /^\d(\.\d)?\s*stars?$/i.test(p) ||
      /\b\d\.\d\s*\([\d,]+\)/.test(p) ||
      /^\d{1,4}$/.test(p)
    );
  }

  function isPriceRangeText(part) {
    if (!part) return false;
    const p = cleanUnicode(part);
    if (!p) return false;
    if (!/[$\u20b9\u20ac\u00a3\u00a5€£¥₹]/.test(p)) return false;
    return (
      /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹\s]+$/i.test(p) ||
      /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹\s]*\d+[\d–\s\-,.]*$/i.test(p) ||
      /^[$\u20b9\u20ac\u00a3\u00a5€£¥₹]\d+([–\-]\d+)?$/i.test(p) ||
      /^\$\$\$?\$?$/i.test(p) ||
      /^₹\s*\d+([–\-,]\d+)?$/i.test(p) ||
      /\b[$\u20b9\u20ac\u00a3\u00a5€£¥₹]\d+[\d–\s\-,.]*\b/.test(p)
    );
  }

  function parseAddress(rawAddress) {
    if (!rawAddress || typeof rawAddress !== "string") {
      return { address: null, city: null, region: null, country: null, postal_code: null };
    }

    const clean = cleanUnicode(rawAddress);
    if (!clean.length || isRatingOrReviewText(clean) || isPriceRangeText(clean)) {
      return { address: null, city: null, region: null, country: null, postal_code: null };
    }

    // Extract Postal Code — MUST REMAIN A STRING!
    const postcodeMatch = POSTCODE_RE.exec(clean);
    const postalCode = postcodeMatch ? String(postcodeMatch[1]).trim() : null;

    // Split by comma
    const parts = clean
      .split(",")
      .map((p) => cleanUnicode(p))
      .filter((p) => Boolean(p.length) && !isRatingOrReviewText(p) && !isPriceRangeText(p));

    if (parts.length === 0) {
      return { address: null, city: null, region: null, country: null, postal_code: postalCode };
    }

    let city = null;
    let region = null;
    let country = null;

    if (parts.length === 1) {
      city = parts[0];
    } else if (parts.length === 2) {
      city = parts[0];
      region = parts[1];
    } else if (parts.length === 3) {
      city = parts[0];
      region = parts[1];
      country = parts[2];
    } else {
      city = parts[parts.length - 3] || parts[0];
      region = parts[parts.length - 2] || parts[1];
      country = parts[parts.length - 1] || null;
    }

    // Strip postal code from region or country if present
    if (region && postalCode && region.includes(postalCode)) {
      region = cleanUnicode(region.replace(postalCode, ""));
    }
    if (country && postalCode && country.includes(postalCode)) {
      country = cleanUnicode(country.replace(postalCode, ""));
    }

    return {
      address: clean,
      city: city || null,
      region: region || null,
      country: country || null,
      postal_code: postalCode,
    };
  }

  return {
    parseAddress,
  };
});
