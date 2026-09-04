/**
 * RAMOS Website Intelligence — Field Extractors
 * Semantic DOM, anchor protocol, contextual label, and pattern extractors.
 * Generates evidence-backed candidates for company, contact, address, and social fields.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosFieldExtractors = factory();
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SOCIAL_PLATFORMS = [
    { key: "linkedin", domainRegex: /linkedin\.com\/(company|in)\//i },
    { key: "twitter_x", domainRegex: /(twitter\.com|x\.com)\/[a-zA-Z0-9_]+/i },
    { key: "facebook", domainRegex: /facebook\.com\/[a-zA-Z0-9_.-]+/i },
    { key: "instagram", domainRegex: /instagram\.com\/[a-zA-Z0-9_.-]+/i },
    { key: "youtube", domainRegex: /(youtube\.com\/(@|channel\/|c\/)|youtu\.be\/)/i },
    { key: "github", domainRegex: /github\.com\/[a-zA-Z0-9_.-]+/i },
  ];

  /**
   * Extracts semantic, anchor, and text candidates from a DOM Document.
   * @param {Document|Object} pageOrDoc
   * @param {Object} [options]
   * @returns {Array<Object>}
   */
  function extractFields(pageOrDoc, options) {
    const doc = pageOrDoc.document || pageOrDoc;
    const pageUrl = pageOrDoc.url || "";
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }

    const candidates = [];

    // 1. Anchor Protocol Extraction (mailto: and tel:)
    extractAnchorProtocols(doc, pageUrl, candidates);

    // 2. Social Media & Action Links
    extractSocialAndActionLinks(doc, pageUrl, candidates);

    // 3. Semantic <address> tag
    extractAddressTag(doc, pageUrl, candidates);

    // 4. Contextual & Labelled text
    extractContextualFields(doc, pageUrl, candidates);

    // 5. Body text regex patterns (with contextual boundaries)
    extractTextPatterns(doc, pageUrl, candidates);

    return candidates;
  }

  /**
   * Extracts explicit mailto: and tel: anchors.
   */
  function extractAnchorProtocols(doc, pageUrl, candidates) {
    // Mailto anchors
    const mailtoLinks = doc.querySelectorAll('a[href^="mailto:"]');
    for (let i = 0; i < mailtoLinks.length; i++) {
      const rawHref = mailtoLinks[i].getAttribute("href") || "";
      const rawEmail = rawHref.replace(/^mailto:/i, "").split("?")[0].trim();
      if (rawEmail) {
        candidates.push({
          field: "email",
          value: rawEmail,
          source: "mailto",
          evidence_type: "anchor-mailto",
          page_url: pageUrl,
          confidence: 0.95,
          raw_snippet: rawHref,
        });
      }
    }

    // Tel anchors
    const telLinks = doc.querySelectorAll('a[href^="tel:"]');
    for (let i = 0; i < telLinks.length; i++) {
      const rawHref = telLinks[i].getAttribute("href") || "";
      const rawPhone = rawHref.replace(/^tel:/i, "").split("?")[0].trim();
      if (rawPhone) {
        candidates.push({
          field: "phone",
          value: rawPhone,
          source: "tel",
          evidence_type: "anchor-tel",
          page_url: pageUrl,
          confidence: 0.95,
          raw_snippet: rawHref,
        });
      }
    }
  }

  /**
   * Extracts social links and action booking/ordering URLs.
   */
  function extractSocialAndActionLinks(doc, pageUrl, candidates) {
    const anchors = doc.querySelectorAll("a[href]");
    const seenSocials = new Set();

    for (let i = 0; i < anchors.length; i++) {
      const href = (anchors[i].getAttribute("href") || "").trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;

      // Check social platforms
      for (const platform of SOCIAL_PLATFORMS) {
        if (platform.domainRegex.test(href)) {
          if (!seenSocials.has(href)) {
            seenSocials.add(href);
            let conf = 0.92;
            if (platform.key === "linkedin") {
              const isOrg = /linkedin\.com\/(?:company|school)\//i.test(href);
              conf = isOrg ? 0.95 : 0.85;
            }
            candidates.push({
              field: platform.key,
              value: href,
              source: "semantic-dom",
              evidence_type: `social-link-${platform.key}`,
              page_url: pageUrl,
              confidence: conf,
            });
          }
        }
      }

      // Check Action Links (Booking, Ordering, Menu)
      const lowerHref = href.toLowerCase();
      const linkText = (anchors[i].textContent || "").toLowerCase().trim();

      if (
        lowerHref.includes("calendly.com/") ||
        lowerHref.includes("chilipiper.com/") ||
        linkText === "book now" ||
        linkText === "book online" ||
        linkText === "schedule demo"
      ) {
        candidates.push({
          field: "booking_url",
          value: href,
          source: "semantic-dom",
          evidence_type: "action-link-booking",
          page_url: pageUrl,
          confidence: 0.88,
        });
      } else if (
        lowerHref.includes("/order") ||
        lowerHref.includes("/shop") ||
        linkText === "order online" ||
        linkText === "shop now"
      ) {
        candidates.push({
          field: "ordering_url",
          value: href,
          source: "semantic-dom",
          evidence_type: "action-link-ordering",
          page_url: pageUrl,
          confidence: 0.85,
        });
      } else if (
        lowerHref.includes("/menu") ||
        linkText === "view menu" ||
        linkText === "our menu"
      ) {
        candidates.push({
          field: "menu_url",
          value: href,
          source: "semantic-dom",
          evidence_type: "action-link-menu",
          page_url: pageUrl,
          confidence: 0.85,
        });
      }
    }
  }

  /**
   * Extracts <address> tag content.
   */
  function extractAddressTag(doc, pageUrl, candidates) {
    const addressEls = doc.querySelectorAll("address");
    for (let i = 0; i < addressEls.length; i++) {
      const text = (addressEls[i].textContent || "").trim();
      if (text.length > 5 && text.length < 300) {
        candidates.push({
          field: "address",
          value: text.replace(/\s+/g, " "),
          source: "semantic-dom",
          evidence_type: "semantic-html-address-tag",
          page_url: pageUrl,
          confidence: 0.88,
          raw_snippet: text,
        });
      }
    }
  }

  /**
   * Extracts text adjacent to explicit semantic labels (e.g. "Email:", "Phone:").
   */
  function extractContextualFields(doc, pageUrl, candidates) {
    const textNodesWithLabels = doc.querySelectorAll("p, span, div, li, td, th");
    const emailLabelRegex = /^(email|e-mail|write to us|contact email)\s*[:\-]\s*(.+)$/i;
    const phoneLabelRegex = /^(phone|tel|telephone|call us|mobile|contact number)\s*[:\-]\s*(.+)$/i;
    const addressLabelRegex = /^(address|headquarters|location|office|visit us)\s*[:\-]\s*(.+)$/i;

    for (let i = 0; i < textNodesWithLabels.length; i++) {
      const el = textNodesWithLabels[i];
      // Only check leaf or near-leaf elements
      if (el.children.length > 2) continue;
      const text = (el.textContent || "").trim();
      if (!text || text.length > 200) continue;

      const emailMatch = text.match(emailLabelRegex);
      if (emailMatch && emailMatch[2]) {
        candidates.push({
          field: "email",
          value: emailMatch[2].trim(),
          source: "contextual-label",
          evidence_type: "label-email-text",
          page_url: pageUrl,
          confidence: 0.82,
          raw_snippet: text,
        });
      }

      const phoneMatch = text.match(phoneLabelRegex);
      if (phoneMatch && phoneMatch[2]) {
        candidates.push({
          field: "phone",
          value: phoneMatch[2].trim(),
          source: "contextual-label",
          evidence_type: "label-phone-text",
          page_url: pageUrl,
          confidence: 0.82,
          raw_snippet: text,
        });
      }

      const addressMatch = text.match(addressLabelRegex);
      if (addressMatch && addressMatch[2]) {
        candidates.push({
          field: "address",
          value: addressMatch[2].trim(),
          source: "contextual-label",
          evidence_type: "label-address-text",
          page_url: pageUrl,
          confidence: 0.80,
          raw_snippet: text,
        });
      }
    }
  }

  /**
   * Fallback pattern extraction in body text.
   */
  function extractTextPatterns(doc, pageUrl, candidates) {
    const body = doc.body;
    if (!body) return;

    // Isolate footer or contact containers for higher relevance
    const contactContainers = doc.querySelectorAll("footer, [id*='contact' i], [class*='contact' i], [id*='footer' i], [class*='footer' i]");
    const targetEl = contactContainers.length > 0 ? contactContainers[0] : body;
    const text = (targetEl.textContent || "").slice(0, 100000);

    // Email regex with word boundaries
    const emailRegex = /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\b/g;
    let match;
    const seenEmails = new Set();
    while ((match = emailRegex.exec(text)) !== null) {
      const email = match[0];
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        candidates.push({
          field: "email",
          value: email,
          source: "regex-pattern",
          evidence_type: "body-regex-email",
          page_url: pageUrl,
          confidence: 0.65,
          raw_snippet: email,
        });
      }
    }

    // Phone regex (international + national styles)
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    const seenPhones = new Set();
    while ((match = phoneRegex.exec(text)) !== null) {
      const phone = match[0];
      if (!seenPhones.has(phone)) {
        seenPhones.add(phone);
        candidates.push({
          field: "phone",
          value: phone,
          source: "regex-pattern",
          evidence_type: "body-regex-phone",
          page_url: pageUrl,
          confidence: 0.60,
          raw_snippet: phone,
        });
      }
    }
  }

  return {
    extractFields,
    SOCIAL_PLATFORMS,
  };
});
