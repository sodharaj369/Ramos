/**
 * RAMOS Website Intelligence — Link Discovery
 * Discovers, filters, normalizes, and prioritizes same-domain links from an acquired page.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./normalizers.js"),
      require("./crawl-policy.js"),
      require("./page-priority.js")
    );
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosLinkDiscovery = factory(
      root.RamosWebsiteNormalizers || g.RamosWebsiteNormalizers,
      root.RamosCrawlPolicy || g.RamosCrawlPolicy,
      root.RamosPagePriority || g.RamosPagePriority
    );
    if (g && !g.RamosLinkDiscovery) g.RamosLinkDiscovery = root.RamosLinkDiscovery;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function (
  Normalizers,
  CrawlPolicy,
  PagePriority
) {
  "use strict";

  /**
   * Discovers and prioritizes same-domain links on an AcquiredPage.
   * @param {Object} acquiredPage - AcquiredPage object
   * @param {string} rootDomain - Canonical root domain of the target site
   * @param {number} [currentDepth=0] - Current depth of the acquired page
   * @returns {Array<Object>} Discovered link candidates sorted by priority
   */
  function discoverLinks(acquiredPage, rootDomain, currentDepth = 0) {
    const doc = acquiredPage.document || acquiredPage;
    const pageUrl = acquiredPage.url || "";
    const baseUrl = acquiredPage.baseUrl || pageUrl;

    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }

    const anchors = doc.querySelectorAll("a[href]");
    const discoveredMap = new Map();
    const childDepth = currentDepth + 1;

    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const rawHref = (anchor.getAttribute("href") || "").trim();
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) continue;

      // Normalize relative to base
      const normalized = Normalizers.normalizeUrl(rawHref, baseUrl);
      if (!normalized) continue;

      // Check against crawl policy
      const policyResult = CrawlPolicy.isUrlAllowed(normalized, rootDomain);
      if (!policyResult.allowed) continue;

      const cleanUrl = policyResult.normalizedUrl || normalized;

      // Ignore links to current page itself
      if (cleanUrl === pageUrl || cleanUrl === baseUrl) continue;

      const anchorText = Normalizers.normalizeText(anchor.textContent || "");

      // Identify nearest structural parent container
      let containerTag = "";
      let parent = anchor.parentElement;
      while (parent && parent.tagName !== "BODY" && parent.tagName !== "HTML") {
        const tag = parent.tagName.toUpperCase();
        if (tag === "NAV" || tag === "HEADER" || tag === "FOOTER") {
          containerTag = tag;
          break;
        }
        parent = parent.parentElement;
      }

      // Compute priority score
      const priorityInfo = PagePriority.scoreLink(cleanUrl, anchorText, childDepth, containerTag);

      // Keep highest score if duplicate URL appears multiple times on page
      if (discoveredMap.has(cleanUrl)) {
        const existing = discoveredMap.get(cleanUrl);
        if (priorityInfo.score > existing.priority) {
          existing.priority = priorityInfo.score;
          existing.anchorText = anchorText || existing.anchorText;
          existing.pageIntent = priorityInfo.pageIntent;
        }
      } else {
        discoveredMap.set(cleanUrl, {
          url: cleanUrl,
          anchorText,
          depth: childDepth,
          priority: priorityInfo.score,
          pageIntent: priorityInfo.pageIntent,
          discoveredFrom: pageUrl,
          status: "pending",
        });
      }
    }

    // Convert map to array sorted by priority descending
    const results = Array.from(discoveredMap.values());
    results.sort((a, b) => b.priority - a.priority);

    return results;
  }

  return {
    discoverLinks,
  };
});
