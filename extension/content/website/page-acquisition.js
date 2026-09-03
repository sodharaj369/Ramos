/**
 * RAMOS Website Intelligence — Page Acquisition Abstraction
 * Decouples page acquisition (DOM vs raw HTML string) from the extraction engine.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosPageAcquisition = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Represents a standardized acquired page ready for analysis and extraction.
   * @typedef {Object} AcquiredPage
   * @property {string} url - The URL of the page
   * @property {string} baseUrl - Base URL for relative link resolution
   * @property {"rendered_dom" | "raw_html"} sourceType - Acquisition state
   * @property {Document} document - The DOM Document representation
   * @property {string} title - Page title
   * @property {number} acquiredAt - Timestamp of acquisition
   */

  /**
   * Acquire page representation from live browser-rendered Document.
   * Preserves client-side rendered DOM, shadow DOM, dynamic modifications.
   *
   * @param {Document} [doc] - Active document, defaults to global window.document
   * @param {string} [url] - Optional override URL
   * @returns {AcquiredPage}
   */
  function acquireFromRenderedDom(doc, url) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) {
      throw new Error("No DOM Document available in the current context.");
    }

    const resolvedUrl = url || (typeof location !== "undefined" ? location.href : "");
    const baseEl = documentRef.querySelector("base[href]");
    const baseUrl = baseEl ? baseEl.getAttribute("href") : resolvedUrl;

    return {
      url: resolvedUrl,
      baseUrl: baseUrl || resolvedUrl,
      sourceType: "rendered_dom",
      document: documentRef,
      title: documentRef.title || "",
      acquiredAt: Date.now(),
    };
  }

  /**
   * Acquire page representation from a raw HTML string.
   * Uses DOMParser in browser or provided parser in test environments.
   *
   * @param {string} htmlString - Raw HTML content
   * @param {string} url - Target URL
   * @param {Object} [customParser] - Optional DOMParser implementation for Node tests
   * @returns {AcquiredPage}
   */
  function acquireFromRawHtml(htmlString, url, customParser) {
    if (typeof htmlString !== "string") {
      throw new Error("acquireFromRawHtml requires an HTML string.");
    }

    let parsedDoc = null;

    if (customParser && typeof customParser.parseFromString === "function") {
      parsedDoc = customParser.parseFromString(htmlString, "text/html");
    } else if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      parsedDoc = parser.parseFromString(htmlString, "text/html");
    } else {
      throw new Error("DOMParser is not available in the current environment.");
    }

    const baseEl = parsedDoc.querySelector("base[href]");
    const baseUrl = baseEl ? baseEl.getAttribute("href") : url;

    return {
      url: url || "",
      baseUrl: baseUrl || url || "",
      sourceType: "raw_html",
      document: parsedDoc,
      title: parsedDoc.title || "",
      acquiredAt: Date.now(),
    };
  }

  return {
    acquireFromRenderedDom,
    acquireFromRawHtml,
  };
});
