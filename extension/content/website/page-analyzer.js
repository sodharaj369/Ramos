/**
 * RAMOS Website Intelligence — Page Analyzer
 * Analyzes page metadata, OpenGraph, Twitter Cards, canonical tags, and page classification.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosPageAnalyzer = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Analyzes an AcquiredPage or DOM Document.
   * @param {Document|Object} pageOrDoc
   * @returns {Object}
   */
  function analyzePage(pageOrDoc) {
    const doc = pageOrDoc.document || pageOrDoc;
    const url = pageOrDoc.url || (doc.location ? doc.location.href : "");

    if (!doc || typeof doc.querySelector !== "function") {
      return {
        url: url || "",
        pageType: "GENERIC",
        title: "",
        metaDescription: "",
        openGraph: {},
        twitter: {},
        canonicalUrl: "",
        language: "",
      };
    }

    const titleEl = doc.querySelector("title");
    const rawTitle = titleEl ? (titleEl.textContent || "").trim() : "";

    // Helper for meta tags
    function getMetaContent(selector) {
      const el = doc.querySelector(selector);
      return el ? (el.getAttribute("content") || "").trim() : "";
    }

    const metaDescription =
      getMetaContent('meta[name="description"]') ||
      getMetaContent('meta[name="Description"]');

    const metaKeywords = getMetaContent('meta[name="keywords"]');
    const metaAuthor = getMetaContent('meta[name="author"]');

    const openGraph = {
      siteName: getMetaContent('meta[property="og:site_name"]'),
      title: getMetaContent('meta[property="og:title"]'),
      description: getMetaContent('meta[property="og:description"]'),
      image: getMetaContent('meta[property="og:image"]'),
      url: getMetaContent('meta[property="og:url"]'),
      type: getMetaContent('meta[property="og:type"]'),
    };

    const twitter = {
      card: getMetaContent('meta[name="twitter:card"]'),
      site: getMetaContent('meta[name="twitter:site"]'),
      title: getMetaContent('meta[name="twitter:title"]'),
      description: getMetaContent('meta[name="twitter:description"]'),
    };

    const canonicalEl = doc.querySelector('link[rel="canonical"]');
    const canonicalUrl = canonicalEl ? (canonicalEl.getAttribute("href") || "").trim() : "";

    const htmlEl = doc.querySelector("html");
    const language = htmlEl ? (htmlEl.getAttribute("lang") || "").trim() : "";

    // Classify page type based on URL path and title
    const pageType = classifyPageType(url, rawTitle);

    return {
      url: url || "",
      pageType,
      title: rawTitle,
      metaDescription,
      metaKeywords,
      metaAuthor,
      openGraph,
      twitter,
      canonicalUrl,
      language,
    };
  }

  /**
   * Classifies page intent (HOMEPAGE, CONTACT, ABOUT, TEAM, LOCATION, SERVICES, GENERIC).
   * @param {string} url
   * @param {string} title
   * @returns {"HOMEPAGE" | "CONTACT" | "ABOUT" | "TEAM" | "LOCATION" | "SERVICES" | "GENERIC"}
   */
  function classifyPageType(url, title) {
    const urlLower = (url || "").toLowerCase();
    const titleLower = (title || "").toLowerCase();

    // Check pathname
    let path = "";
    try {
      if (urlLower.startsWith("http")) {
        path = new URL(urlLower).pathname;
      } else {
        path = urlLower;
      }
    } catch {
      path = urlLower;
    }

    if (
      path === "" ||
      path === "/" ||
      path === "/index.html" ||
      path === "/index.htm" ||
      path === "/home"
    ) {
      return "HOMEPAGE";
    }

    if (
      path.includes("/contact") ||
      path.includes("/reach-us") ||
      path.includes("/get-in-touch") ||
      titleLower.includes("contact us")
    ) {
      return "CONTACT";
    }

    if (
      path.includes("/team") ||
      path.includes("/leadership") ||
      path.includes("/people") ||
      path.includes("/our-team") ||
      path.includes("/staff") ||
      titleLower.includes("our team") ||
      titleLower.includes("leadership")
    ) {
      return "TEAM";
    }

    if (
      path.includes("/about") ||
      path.includes("/who-we-are") ||
      path.includes("/company") ||
      path.includes("/story") ||
      titleLower.includes("about us")
    ) {
      return "ABOUT";
    }

    if (
      path.includes("/location") ||
      path.includes("/stores") ||
      path.includes("/branches") ||
      path.includes("/find-us")
    ) {
      return "LOCATION";
    }

    if (
      path.includes("/services") ||
      path.includes("/products") ||
      path.includes("/solutions") ||
      path.includes("/features")
    ) {
      return "SERVICES";
    }

    return "GENERIC";
  }

  return {
    analyzePage,
    classifyPageType,
  };
});
