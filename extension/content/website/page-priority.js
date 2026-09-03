/**
 * RAMOS Website Intelligence — Page Priority Scorer
 * Scores internal URLs and anchor text for targeted business intelligence crawling.
 * Prioritizes Contact, About, Team, Leadership, and Location pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosPagePriority = factory();
    if (g && !g.RamosPagePriority) g.RamosPagePriority = root.RamosPagePriority;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // URL Path Weight Rules
  const PATH_RULES = [
    { regex: /\/(contact|contact-us|reach-us|get-in-touch|contactus)\b/i, score: 100, label: "CONTACT" },
    { regex: /\/(about|about-us|aboutus|who-we-are|our-story|company)\b/i, score: 80, label: "ABOUT" },
    { regex: /\/(team|our-team|leadership|people|staff|management|executives)\b/i, score: 85, label: "TEAM" },
    { regex: /\/(locations|location|stores|branches|find-us|offices)\b/i, score: 70, label: "LOCATION" },
    { regex: /\/(services|products|solutions|what-we-do|menu|pricing)\b/i, score: 40, label: "SERVICES" },
    { regex: /\/(faq|help|support)\b/i, score: 25, label: "SUPPORT" },
    { regex: /\/(blog|news|articles|press|media|posts)\b/i, score: 5, label: "BLOG" },
    { regex: /\/(privacy|terms|legal|disclaimer|cookies|cookie-policy|privacy-policy)\b/i, score: -50, label: "LEGAL" },
    { regex: /\/(tag|category|author|page\/\d+)\b/i, score: -30, label: "PAGINATION" },
  ];

  // Anchor Text Weight Rules
  const ANCHOR_RULES = [
    { regex: /\b(contact(\s*us)?|get in touch|reach us)\b/i, bonus: 90 },
    { regex: /\b(meet our team|our team|leadership|executive team|people)\b/i, bonus: 80 },
    { regex: /\b(about(\s*us)?|who we are|our story|company)\b/i, bonus: 75 },
    { regex: /\b(find a location|our locations|branches|stores|offices)\b/i, bonus: 70 },
    { regex: /\b(our services|what we do|products|solutions)\b/i, bonus: 35 },
    { regex: /\b(privacy policy|terms of service|terms & conditions|cookie preferences)\b/i, bonus: -60 },
  ];

  /**
   * Computes priority score for a discovered link candidate.
   * @param {string} url - Target normalized URL
   * @param {string} [anchorText] - Text content of the link
   * @param {number} [depth=1] - Distance from root page (1 or 2)
   * @param {string} [containerTag] - Parent container tag (e.g. "NAV", "HEADER", "FOOTER")
   * @returns {{ score: number, pageIntent: string }}
   */
  function scoreLink(url, anchorText = "", depth = 1, containerTag = "") {
    let score = 20; // Default base score for internal links
    let detectedIntent = "GENERIC";

    // 1. URL Path Scoring
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch {
      path = (url || "").toLowerCase();
    }

    for (const rule of PATH_RULES) {
      if (rule.regex.test(path)) {
        score += rule.score;
        detectedIntent = rule.label;
        break;
      }
    }

    // 2. Anchor Text Scoring
    const cleanAnchor = (anchorText || "").trim();
    if (cleanAnchor) {
      for (const aRule of ANCHOR_RULES) {
        if (aRule.regex.test(cleanAnchor)) {
          score += aRule.bonus;
          break;
        }
      }
    }

    // 3. Container Context Bonus
    const upperContainer = (containerTag || "").toUpperCase();
    if (upperContainer === "HEADER" || upperContainer === "NAV") {
      score += 15;
    } else if (upperContainer === "FOOTER") {
      score += 5;
    }

    // 4. Depth Penalty
    if (depth > 1) {
      score -= (depth - 1) * 20;
    }

    return {
      score: Math.max(-100, Math.min(200, score)),
      pageIntent: detectedIntent,
    };
  }

  return {
    scoreLink,
    PATH_RULES,
    ANCHOR_RULES,
  };
});
