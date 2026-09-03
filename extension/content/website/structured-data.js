/**
 * RAMOS Website Intelligence — Structured Data Extractor
 * Extracts and traverses JSON-LD and Schema.org Microdata.
 * Produces structured field candidates with high confidence and provenance.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosStructuredData = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TARGET_ORG_TYPES = new Set([
    "organization",
    "corporation",
    "localbusiness",
    "store",
    "restaurant",
    "medicalbusiness",
    "financialservice",
    "professionalservice",
    "automotivebusiness",
    "lodgingbusiness",
    "foodestablishment",
    "dentist",
    "physician",
    "attorney",
    "legalagency",
    "realestateagent",
    "bakery",
    "cafe",
  ]);

  /**
   * Extracts structured data from an AcquiredPage or DOM Document.
   * @param {Document|Object} pageOrDoc
   * @returns {Array<Object>} List of structured entity candidates with evidence
   */
  function extractStructuredData(pageOrDoc) {
    const doc = pageOrDoc.document || pageOrDoc;
    const pageUrl = pageOrDoc.url || "";
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }

    const candidates = [];

    // 1. JSON-LD Extraction
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
      const script = jsonLdScripts[i];
      const rawText = (script.textContent || "").trim();
      if (!rawText) continue;

      try {
        const parsed = JSON.parse(rawText);
        traverseJsonLd(parsed, pageUrl, candidates);
      } catch {
        // Skip malformed JSON without crashing
      }
    }

    // 2. Schema.org Microdata Extraction
    extractMicrodata(doc, pageUrl, candidates);

    return candidates;
  }

  /**
   * Recursively traverses JSON-LD nodes to locate target organizations and contact points.
   * @param {any} node
   * @param {string} pageUrl
   * @param {Array<Object>} candidates
   */
  function traverseJsonLd(node, pageUrl, candidates) {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach((item) => traverseJsonLd(item, pageUrl, candidates));
      return;
    }

    if (typeof node !== "object") return;

    // Handle @graph containers
    if (Array.isArray(node["@graph"])) {
      node["@graph"].forEach((item) => traverseJsonLd(item, pageUrl, candidates));
      return;
    }

    const rawType = node["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isTargetEntity = types.some(
      (t) => typeof t === "string" && TARGET_ORG_TYPES.has(t.toLowerCase().replace(/[^a-z]/g, ""))
    );

    if (isTargetEntity || node.name || node.telephone || node.email || node.address) {
      processEntityNode(node, types[0] || "Thing", "json-ld", pageUrl, candidates);
    }

    // Check nested objects (e.g. contactPoint, address, department)
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "object" && node[key] !== null) {
        if (key === "contactPoint" || key === "department" || key === "subOrganization") {
          traverseJsonLd(node[key], pageUrl, candidates);
        }
      }
    }
  }

  /**
   * Processes a recognized entity node into field candidates.
   */
  function processEntityNode(node, typeName, source, pageUrl, candidates) {
    const confidence = source === "json-ld" ? 0.98 : 0.92;

    // Company Name
    const name = node.name || node.legalName || node.alternateName;
    if (name && typeof name === "string" && name.trim()) {
      candidates.push({
        field: "company_name",
        value: name.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-name`,
        page_url: pageUrl,
        confidence,
      });
    }

    // Email
    const email = node.email;
    if (email && typeof email === "string" && email.trim()) {
      candidates.push({
        field: "email",
        value: email.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-email`,
        page_url: pageUrl,
        confidence,
      });
    }

    // Phone / Telephone
    const phone = node.telephone;
    if (phone && (typeof phone === "string" || typeof phone === "number")) {
      candidates.push({
        field: "phone",
        value: String(phone).trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-phone`,
        page_url: pageUrl,
        confidence,
      });
    }

    // Address
    if (node.address) {
      processAddressNode(node.address, typeName, source, pageUrl, candidates, confidence);
    }

    // Website URL
    const url = node.url;
    if (url && typeof url === "string" && url.trim()) {
      candidates.push({
        field: "website",
        value: url.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-url`,
        page_url: pageUrl,
        confidence,
      });
    }

    // Social URLs (sameAs)
    if (node.sameAs) {
      const links = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
      links.forEach((link) => {
        if (typeof link === "string" && link.trim()) {
          candidates.push({
            field: "same_as_url",
            value: link.trim(),
            source,
            evidence_type: `${source}-${typeName.toLowerCase()}-sameas`,
            page_url: pageUrl,
            confidence: 0.95,
          });
        }
      });
    }

    // Description / Industry
    const desc = node.description;
    if (desc && typeof desc === "string" && desc.trim()) {
      candidates.push({
        field: "description",
        value: desc.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-description`,
        page_url: pageUrl,
        confidence: 0.90,
      });
    }

    // Price Range
    if (node.priceRange && typeof node.priceRange === "string") {
      candidates.push({
        field: "price_range",
        value: node.priceRange.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-pricerange`,
        page_url: pageUrl,
        confidence: 0.90,
      });
    }
  }

  /**
   * Processes PostalAddress objects.
   */
  function processAddressNode(addr, typeName, source, pageUrl, candidates, confidence) {
    if (typeof addr === "string" && addr.trim()) {
      candidates.push({
        field: "address",
        value: addr.trim(),
        source,
        evidence_type: `${source}-${typeName.toLowerCase()}-address-str`,
        page_url: pageUrl,
        confidence,
      });
      return;
    }

    if (typeof addr !== "object" || addr === null) return;

    const street = addr.streetAddress || "";
    const locality = addr.addressLocality || "";
    const region = addr.addressRegion || "";
    const postal = addr.postalCode || "";
    const country = typeof addr.addressCountry === "object" ? addr.addressCountry.name : addr.addressCountry || "";

    const parts = [street, locality, region, postal, country].filter(Boolean);
    if (parts.length > 0) {
      candidates.push({
        field: "address",
        value: parts.join(", "),
        source,
        evidence_type: `${source}-postal-address-full`,
        page_url: pageUrl,
        confidence,
        components: {
          street: street || null,
          city: locality || null,
          region: region || null,
          postal_code: postal ? String(postal) : null,
          country: country || null,
        },
      });
    }

    if (locality) {
      candidates.push({
        field: "city",
        value: locality.trim(),
        source,
        evidence_type: `${source}-postal-locality`,
        page_url: pageUrl,
        confidence,
      });
    }

    if (region) {
      candidates.push({
        field: "region",
        value: region.trim(),
        source,
        evidence_type: `${source}-postal-region`,
        page_url: pageUrl,
        confidence,
      });
    }

    if (postal) {
      candidates.push({
        field: "postal_code",
        value: String(postal).trim(),
        source,
        evidence_type: `${source}-postal-code`,
        page_url: pageUrl,
        confidence,
      });
    }

    if (country) {
      candidates.push({
        field: "country",
        value: country.trim(),
        source,
        evidence_type: `${source}-postal-country`,
        page_url: pageUrl,
        confidence,
      });
    }
  }

  /**
   * Microdata parser using in-DOM itemscope/itemprop.
   */
  function extractMicrodata(doc, pageUrl, candidates) {
    const itemScopes = doc.querySelectorAll("[itemscope]");
    for (let i = 0; i < itemScopes.length; i++) {
      const scope = itemScopes[i];
      const itemType = scope.getAttribute("itemtype") || "";
      if (!itemType.toLowerCase().includes("schema.org")) continue;

      const propEls = scope.querySelectorAll("[itemprop]");
      for (let j = 0; j < propEls.length; j++) {
        const propEl = propEls[j];
        const propName = propEl.getAttribute("itemprop");
        if (!propName) continue;

        let val = "";
        if (propEl.tagName === "META") {
          val = propEl.getAttribute("content") || "";
        } else if (propEl.tagName === "A" || propEl.tagName === "LINK") {
          val = propEl.getAttribute("href") || "";
        } else {
          val = propEl.textContent || "";
        }
        val = val.trim();
        if (!val) continue;

        if (propName === "name") {
          candidates.push({
            field: "company_name",
            value: val,
            source: "microdata",
            evidence_type: "microdata-itemprop-name",
            page_url: pageUrl,
            confidence: 0.90,
          });
        } else if (propName === "telephone") {
          candidates.push({
            field: "phone",
            value: val,
            source: "microdata",
            evidence_type: "microdata-itemprop-telephone",
            page_url: pageUrl,
            confidence: 0.90,
          });
        } else if (propName === "email") {
          candidates.push({
            field: "email",
            value: val,
            source: "microdata",
            evidence_type: "microdata-itemprop-email",
            page_url: pageUrl,
            confidence: 0.90,
          });
        }
      }
    }
  }

  return {
    extractStructuredData,
    TARGET_ORG_TYPES,
  };
});
