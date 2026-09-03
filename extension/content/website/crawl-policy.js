/**
 * RAMOS Website Intelligence — Crawl Policy
 * Enforces safety boundaries, same-domain isolation, scheme sanitation,
 * file-type exclusions, and login/auth wall detection.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./normalizers.js"));
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosCrawlPolicy = factory(root.RamosWebsiteNormalizers || g.RamosWebsiteNormalizers);
    if (g && !g.RamosCrawlPolicy) g.RamosCrawlPolicy = root.RamosCrawlPolicy;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function (Normalizers) {
  "use strict";

  const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "chrome:", "chrome-extension:", "blob:", "about:"]);

  const EXCLUDED_EXTENSIONS = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
    "mp4", "webm", "avi", "mov", "mp3", "wav",
    "zip", "tar", "gz", "rar", "7z",
    "exe", "dmg", "apk", "iso",
    "css", "js", "map", "xml", "json"
  ]);

  const IGNORED_PATH_PATTERNS = [
    /\/wp-content\/plugins\//i,
    /\/wp-includes\//i,
    /\/cdn-cgi\//i,
    /\/cart\b/i,
    /\/checkout\b/i,
    /\/basket\b/i,
    /\/my-account\b/i,
    /\/account\b/i,
    /\/login\b/i,
    /\/signin\b/i,
    /\/signup\b/i,
    /\/register\b/i,
    /\/password-reset\b/i,
    /\/logout\b/i,
    /\/feed\b/i,
    /\/rss\b/i,
    /\/search\b/i,
    /\/privacy-policy\b/i,
    /\/terms-of-service\b/i,
    /\/terms-and-conditions\b/i,
    /\/terms-of-use\b/i,
    /\/cookie-policy\b/i,
    /\/disclaimer\b/i,
    /\/page\/\d+\b/i,
    /\/tag\//i,
    /\/category\//i,
    /\/author\//i,
    /\/archive\//i,
    /\/\d{4}\/\d{2}\//i,
  ];

  /**
   * Checks whether a target URL is allowed to be crawled according to policy.
   * @param {string} targetUrl - URL to evaluate
   * @param {string} rootDomain - Canonical root domain (e.g. "example.com")
   * @returns {{ allowed: boolean, reason?: string, normalizedUrl?: string }}
   */
  function isUrlAllowed(targetUrl, rootDomain) {
    if (!targetUrl || typeof targetUrl !== "string") {
      return { allowed: false, reason: "Empty or invalid URL" };
    }

    const trimmed = targetUrl.trim();

    // 1. Scheme Check
    const lowerTrimmed = trimmed.toLowerCase();
    for (const scheme of BLOCKED_SCHEMES) {
      if (lowerTrimmed.startsWith(scheme)) {
        return { allowed: false, reason: `Blocked protocol: ${scheme}` };
      }
    }

    if (!lowerTrimmed.startsWith("http://") && !lowerTrimmed.startsWith("https://")) {
      return { allowed: false, reason: "Non-HTTP/HTTPS protocol" };
    }

    // 2. Parse & Domain Matching
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { allowed: false, reason: "Malformed URL syntax" };
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const cleanRoot = (rootDomain || "").toLowerCase().replace(/^www\./, "").trim();

    if (!cleanRoot) {
      return { allowed: false, reason: "Root domain not specified" };
    }

    // Strict same-domain or direct subdomain matching
    const isSameDomain = host === cleanRoot || host.endsWith("." + cleanRoot);
    if (!isSameDomain) {
      return { allowed: false, reason: `External domain: ${host} (root: ${cleanRoot})` };
    }

    // 3. File Extension Exclusion
    const pathname = parsed.pathname.toLowerCase();
    const lastSlashIdx = pathname.lastIndexOf("/");
    const lastSegment = lastSlashIdx !== -1 ? pathname.substring(lastSlashIdx + 1) : pathname;
    const dotIdx = lastSegment.lastIndexOf(".");
    if (dotIdx !== -1 && dotIdx < lastSegment.length - 1) {
      const ext = lastSegment.substring(dotIdx + 1);
      if (EXCLUDED_EXTENSIONS.has(ext)) {
        return { allowed: false, reason: `Excluded file extension: .${ext}` };
      }
    }

    // 4. Ignored Path Patterns (login, cart, feed)
    for (const pattern of IGNORED_PATH_PATTERNS) {
      if (pattern.test(pathname)) {
        return { allowed: false, reason: `Excluded system path: ${pathname}` };
      }
    }

    // 5. Search query parameters exclusion
    if (parsed.searchParams.has("s") || parsed.searchParams.has("q") || parsed.searchParams.has("search")) {
      return { allowed: false, reason: "Search query result URL" };
    }

    // 6. Clean URL (strip hash and tracking params)
    const normalizedUrl = Normalizers ? Normalizers.normalizeUrl(trimmed) : parsed.origin + parsed.pathname;

    return {
      allowed: true,
      normalizedUrl,
    };
  }

  return {
    isUrlAllowed,
    BLOCKED_SCHEMES,
    EXCLUDED_EXTENSIONS,
  };
});
