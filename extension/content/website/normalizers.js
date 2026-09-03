/**
 * RAMOS Website Intelligence — Normalizers
 * Robust data normalizers for URLs, emails, phone numbers, text, and domain entities.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosWebsiteNormalizers = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Cleans text, normalizes whitespace, preserves Unicode characters, and strips control chars.
   * @param {any} val
   * @returns {string}
   */
  function normalizeText(val) {
    if (val == null) return "";
    return String(val)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Normalizes an email address: lowercased, trimmed, percent-decoded, trailing punctuation stripped.
   * @param {string} email
   * @returns {string}
   */
  function normalizeEmail(email) {
    if (!email || typeof email !== "string") return "";
    let cleaned = email.trim();
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
      // Keep as-is if malformed percent encoding
    }
    cleaned = cleaned.toLowerCase().trim();
    // Strip trailing periods, commas, or semicolons often captured from sentences
    cleaned = cleaned.replace(/[.,;:!?)>\]]+$/, "");
    // Strip mailto: prefix if present
    cleaned = cleaned.replace(/^mailto:/i, "");
    // Remove query params (e.g. ?subject=...)
    const queryIdx = cleaned.indexOf("?");
    if (queryIdx !== -1) {
      cleaned = cleaned.substring(0, queryIdx);
    }
    return cleaned.trim();
  }

  /**
   * Resolves a URL against a base URL and removes tracking query parameters.
   * @param {string} urlStr
   * @param {string} [baseUrl]
   * @returns {string}
   */
  function normalizeUrl(urlStr, baseUrl) {
    if (!urlStr || typeof urlStr !== "string") return "";
    const trimmed = urlStr.trim();
    if (/^(javascript|data|file|chrome|blob):/i.test(trimmed)) {
      return "";
    }

    try {
      let resolved;
      if (baseUrl && !/^https?:\/\//i.test(trimmed)) {
        resolved = new URL(trimmed, baseUrl);
      } else {
        // If protocol-relative e.g. //example.com
        if (trimmed.startsWith("//")) {
          resolved = new URL("https:" + trimmed);
        } else if (!/^https?:\/\//i.test(trimmed)) {
          resolved = new URL("https://" + trimmed);
        } else {
          resolved = new URL(trimmed);
        }
      }

      // Strip common tracking and session parameters
      const paramsToStrip = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "ref",
        "trk",
      ];
      paramsToStrip.forEach((param) => resolved.searchParams.delete(param));

      // Strip URL fragment / hash to prevent duplicate crawls of page sections
      resolved.hash = "";

      // Remove trailing slash if path is just "/"
      let result = resolved.toString();
      if (resolved.pathname === "/" && !resolved.search) {
        result = `${resolved.protocol}//${resolved.host}`;
      }
      return result;
    } catch {
      return "";
    }
  }

  /**
   * Normalizes a phone number into clean, consistent text preserving international country codes.
   * Preserves raw format without numeric-leading-zero loss.
   * @param {string} phoneStr
   * @returns {string}
   */
  function normalizePhone(phoneStr) {
    if (!phoneStr || typeof phoneStr !== "string") return "";
    let cleaned = phoneStr.trim();
    // Strip tel: prefix
    cleaned = cleaned.replace(/^tel:/i, "");
    // Remove query params
    const queryIdx = cleaned.indexOf("?");
    if (queryIdx !== -1) {
      cleaned = cleaned.substring(0, queryIdx);
    }

    // Preserve leading + if present
    const hasPlus = cleaned.startsWith("+");
    // Remove excessive symbols but keep dashes/parens if cleanly formatted, or standardize digits
    const digitsOnly = cleaned.replace(/\D/g, "");
    if (digitsOnly.length < 7) return "";

    // Standardize spacing for readable international numbers
    if (hasPlus) {
      return `+${digitsOnly}`;
    }

    // Return sanitized text
    return cleaned.replace(/[^\d+()\-\s.]/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Extracts the base domain/hostname from a URL (e.g. "https://sub.example.com/path" -> "sub.example.com", or base "example.com").
   * @param {string} urlStr
   * @returns {string}
   */
  function normalizeDomain(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return "";
    try {
      let target = urlStr.trim();
      if (!/^https?:\/\//i.test(target)) target = "https://" + target;
      const parsed = new URL(target);
      return parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  /**
   * Strips HTML tags from text.
   * @param {string} html
   * @returns {string}
   */
  function stripHtml(html) {
    if (!html || typeof html !== "string") return "";
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  return {
    normalizeText,
    normalizeEmail,
    normalizeUrl,
    normalizePhone,
    normalizeDomain,
    stripHtml,
  };
});
