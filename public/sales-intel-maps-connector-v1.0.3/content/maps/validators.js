/**
 * Data Validation Layer for Sales Intel Chrome Extension.
 * Enforces strict non-negotiable data rules BEFORE leads leave the extension.
 * Includes Plus Code rejection, UI filtering, rating/review rejection, address cleaning, and website validation.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelValidators = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const UI_TITLE_BLACKLIST = new Set([
    "results",
    "search",
    "filters",
    "all filters",
    "nearby",
    "directions",
    "save",
    "share",
    "send to phone",
    "menu",
    "reviews",
    "overview",
    "about",
    "more",
    "back",
    "next",
    "showing results",
    "search instead for",
    "loading",
    "map options",
    "layers",
    "copy address",
    "copied",
  ]);

  const OPEN_STATUS_RE = /\b(open\s*soon|closed\s*·\s*opens|closes\s*\d{1,2}(:\d{2})?\s*(am|pm)?|opens\s*\d{1,2}(:\d{2})?\s*(am|pm)?|open|closed|temporarily\s*closed|permanently\s*closed)\b/i;
  const PLUS_CODE_RE = /\b[2-9CFGHJKMPQRVWX0-9]{4,7}\+[2-9CFGHJKMPQRVWX0-9]{2,4}\b/i;

  const GOOGLE_MAPS_URL_RE = /(google\.[^/]+\/maps|maps\.google\.|goo\.gl\/maps)/i;
  const DOMAIN_TEXT_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;

  function cleanUnicode(str) {
    if (!str) return "";
    return String(str)
      .replace(/[\uFFFD\u2605\u2b50★\u25A1□]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPlusCodeText(part) {
    if (!part) return false;
    const p = cleanUnicode(part);
    if (!p) return false;
    return PLUS_CODE_RE.test(p);
  }

  function isUIElementTitle(str) {
    if (!str) return true;
    const cleaned = cleanUnicode(str).toLowerCase();
    if (!cleaned.length) return true;
    if (UI_TITLE_BLACKLIST.has(cleaned)) return true;
    if (/^(showing results|search instead for|results for|copy address|copied)\b/i.test(cleaned)) return true;
    return false;
  }

  function isRatingOrReviewText(part) {
    if (!part) return false;
    const p = cleanUnicode(part);
    if (!p) return false;

    // 5 or 6 digit postal codes (e.g. 380057, 380049, 02138) are NOT ratings!
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

  function isWebsiteText(val) {
    if (!val || typeof val !== "string") return false;
    const cleaned = cleanUnicode(val).trim();
    if (!cleaned.length) return false;
    if (GOOGLE_MAPS_URL_RE.test(cleaned)) return false;
    if (isPlusCodeText(cleaned) || isRatingOrReviewText(cleaned) || isPriceRangeText(cleaned) || isUIElementTitle(cleaned)) {
      return false;
    }
    return DOMAIN_TEXT_RE.test(cleaned);
  }

  function sanitizeOpeningStatus(val) {
    if (!val) return null;
    const cleaned = cleanUnicode(val);
    if (!cleaned.length) return null;
    if (cleaned.length > 60) return null;
    if (/^(brunch|dinner|lunch|breakfast|dine-in|takeout|delivery|drive-through|in-store pickup)$/i.test(cleaned)) {
      return null;
    }
    if (/\b(chain|known|pizza|restaurant|food|shop|store|service|family|friendly|cozy|casual|popular|serving|located)\b/i.test(cleaned)) {
      return null;
    }
    if (OPEN_STATUS_RE.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  function sanitizeUrl(val) {
    if (!val) return null;
    let strVal = String(val).trim();
    if (!strVal.length) return null;

    if (strVal.startsWith("[") && strVal.endsWith("]")) {
      try {
        const parsed = JSON.parse(strVal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed.find((item) => typeof item === "string" && /^https?:\/\//i.test(item.trim()));
          if (first) strVal = String(first).trim();
        }
      } catch {
        const m = /(https?:\/\/[^\s"',\]]+)/i.exec(strVal);
        if (m) strVal = m[1];
      }
    }

    if (GOOGLE_MAPS_URL_RE.test(strVal)) return null;

    if (!/^https?:\/\//i.test(strVal)) {
      if (DOMAIN_TEXT_RE.test(strVal)) {
        strVal = `https://${strVal}`;
      } else {
        return null;
      }
    }

    try {
      const u = new URL(strVal);
      if (u.hostname && u.hostname.includes(".")) {
        return u.href.endsWith("/") && u.pathname === "/" ? u.href.slice(0, -1) : u.href;
      }
    } catch {
      return null;
    }

    return null;
  }

  function isValidUrl(url) {
    return Boolean(sanitizeUrl(url));
  }

  function cleanAddress(rawAddress, detectedOpeningStatus) {
    if (!rawAddress) return null;
    let addr = cleanUnicode(rawAddress);

    addr = addr
      .replace(/^(copy address|address:?|location:?)\s*/i, "")
      .replace(/\s*(copy address|copied)$/i, "")
      .replace(/[\u25A1□]/g, "")
      .trim();

    if (!addr.length || isPlusCodeText(addr) || isRatingOrReviewText(addr) || isPriceRangeText(addr) || isUIElementTitle(addr)) {
      return null;
    }

    if (detectedOpeningStatus) {
      const escapedStatus = detectedOpeningStatus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const statusRegex = new RegExp(`${escapedStatus}$`, "i");
      addr = addr.replace(statusRegex, "").trim();
    }

    addr = addr
      .replace(/(open\s*soon|closed\s*·\s*opens|closes\s*\d{1,2}(:\d{2})?\s*(am|pm)?|opens\s*\d{1,2}(:\d{2})?\s*(am|pm)?|open|closed|temporarily\s*closed|permanently\s*closed)$/i, "")
      .replace(/[\s,·\-]+$/, "")
      .trim();

    if (!addr.length || isPlusCodeText(addr) || isRatingOrReviewText(addr) || isPriceRangeText(addr)) {
      return null;
    }

    return addr;
  }

  function sanitizeField(val) {
    if (val == null) return null;
    const cleaned = cleanUnicode(val);
    if (!cleaned.length || isPlusCodeText(cleaned) || isRatingOrReviewText(cleaned) || isPriceRangeText(cleaned) || isUIElementTitle(cleaned)) {
      return null;
    }
    return cleaned;
  }

  function validateAndCleanLead(rawLead) {
    if (!rawLead || typeof rawLead !== "object") {
      return { valid: false, reason: "Empty or invalid record", lead: null };
    }

    const companyName = cleanUnicode(rawLead.company_name);
    if (!companyName || isUIElementTitle(companyName)) {
      return { valid: false, reason: "Invalid or blacklisted UI title", lead: null };
    }

    const cleaned = Object.assign({}, rawLead);

    cleaned.company_name = companyName;
    cleaned.opening_status = sanitizeOpeningStatus(rawLead.opening_status);
    cleaned.address = cleanAddress(cleaned.address, cleaned.opening_status);

    cleaned.category = sanitizeField(cleaned.category);
    cleaned.business_type = sanitizeField(cleaned.business_type || cleaned.category);
    cleaned.city = sanitizeField(cleaned.city);
    cleaned.region = sanitizeField(cleaned.region);
    cleaned.country = sanitizeField(cleaned.country);

    // Postal Code
    if (cleaned.postal_code != null) {
      const postalStr = String(cleaned.postal_code).trim();
      if (!postalStr.length || isRatingOrReviewText(postalStr) || isPriceRangeText(postalStr) || isPlusCodeText(postalStr)) {
        cleaned.postal_code = null;
      } else {
        cleaned.postal_code = postalStr;
      }
    } else {
      cleaned.postal_code = null;
    }

    // Phone
    if (cleaned.phone != null) {
      const phoneStr = cleanUnicode(cleaned.phone);
      if (!phoneStr.length || isRatingOrReviewText(phoneStr) || isPriceRangeText(phoneStr) || isPlusCodeText(phoneStr)) {
        cleaned.phone = null;
      } else {
        cleaned.phone = phoneStr;
      }
    } else {
      cleaned.phone = null;
    }

    // Rating & Reviews
    if (cleaned.rating != null) {
      const r = Number(cleaned.rating);
      cleaned.rating = Number.isFinite(r) && r >= 1.0 && r <= 5.0 ? r : null;
    } else {
      cleaned.rating = null;
    }

    if (cleaned.review_count != null) {
      const rc = Number(cleaned.review_count);
      cleaned.review_count = Number.isFinite(rc) && rc >= 0 ? Math.floor(rc) : null;
    } else {
      cleaned.review_count = null;
    }

    // Website
    if (cleaned.website != null) {
      cleaned.website = sanitizeUrl(cleaned.website);
    } else {
      cleaned.website = null;
    }

    // URLs
    cleaned.booking_url = sanitizeUrl(cleaned.booking_url);
    cleaned.ordering_url = sanitizeUrl(cleaned.ordering_url);
    cleaned.menu_url = sanitizeUrl(cleaned.menu_url);
    cleaned.source_url = sanitizeUrl(cleaned.source_url);

    // Price Range
    if (cleaned.price_range != null) {
      const pr = cleanUnicode(cleaned.price_range);
      cleaned.price_range = pr.length && isPriceRangeText(pr) ? pr : null;
    } else {
      cleaned.price_range = null;
    }

    // Coordinates
    if (cleaned.latitude != null) {
      const lat = Number(cleaned.latitude);
      cleaned.latitude = Number.isFinite(lat) ? lat : null;
    }
    if (cleaned.longitude != null) {
      const lng = Number(cleaned.longitude);
      cleaned.longitude = Number.isFinite(lng) ? lng : null;
    }

    return { valid: true, reason: null, lead: cleaned };
  }

  return {
    cleanUnicode,
    isPlusCodeText,
    isUIElementTitle,
    isRatingOrReviewText,
    isPriceRangeText,
    isWebsiteText,
    isValidUrl,
    cleanAddress,
    sanitizeField,
    validateAndCleanLead,
  };
});
