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

  // URL Path Weight Rules (Ranked by business intelligence value)
  const PATH_RULES = [
    { regex: /\/(contact|contact-us|reach-us|get-in-touch|contactus|connect|touch|write-to-us|talk-to-us|customer-service)\b/i, score: 120, label: "CONTACT" },
    { regex: /\/(team|our-team|leadership|people|our-people|meet-the-team|meet-our-team|staff|management|executives|board|directors|advisors)\b/i, score: 110, label: "TEAM" },
    { regex: /\/(about|about-us|aboutus|who-we-are|our-story|company|overview|corporate|mission|profile)\b/i, score: 90, label: "ABOUT" },
    { regex: /\/(locations|location|stores|branches|find-us|our-locations|offices|headquarters|office|store-locator)\b/i, score: 80, label: "LOCATION" },
    { regex: /\/(services|our-services|products|solutions|what-we-do|offerings|capabilities|menu|pricing)\b/i, score: 50, label: "SERVICES" },
    { regex: /\/(careers|jobs|join-us|work-with-us|opportunities)\b/i, score: 35, label: "CAREERS" },
    { regex: /\/(faq|help|support|client-support|help-center)\b/i, score: 25, label: "SUPPORT" },
    { regex: /\/(blog|news|articles|press|media|posts|insights|updates|events)\b/i, score: 5, label: "BLOG" },
    { regex: /\/(tag|category|author|page\/\d+|archive|\/\d{4}\/\d{2})\b/i, score: -40, label: "PAGINATION" },
    { regex: /\/(privacy|terms|legal|disclaimer|cookies|cookie-policy|privacy-policy|terms-of-service|terms-of-use|tos)\b/i, score: -80, label: "LEGAL" },
  ];

  // Anchor Text Weight Rules
  const ANCHOR_RULES = [
    { regex: /\b(contact(\s*us)?|get in touch|reach us|talk to us|speak with us|write to us|connect with us)\b/i, bonus: 100 },
    { regex: /\b(our people|meet the team|meet our team|our team|leadership|executive team|management|people|team)\b/i, bonus: 90 },
    { regex: /\b(about(\s*us)?|who we are|our story|company overview|about the company)\b/i, bonus: 80 },
    { regex: /\b(find us|find a location|our locations|branches|stores|offices|headquarters)\b/i, bonus: 75 },
    { regex: /\b(our services|what we do|products|solutions|capabilities)\b/i, bonus: 40 },
    { regex: /\b(careers|join our team|join us|work with us)\b/i, bonus: 25 },
    { regex: /\b(privacy policy|terms of service|terms & conditions|cookie preferences|legal notices)\b/i, bonus: -90 },
  ];

  /**
   * Computes deterministic priority score for a discovered link candidate.
   * Dynamically factors in currently missing extraction fields.
   *
   * @param {string} url - Target normalized URL
   * @param {string} [anchorText=""] - Text content of the link
   * @param {number} [depth=1] - Distance from root page (1 or 2)
   * @param {string} [containerTag=""] - Parent container tag or class (e.g. "NAV", "HEADER", "FOOTER", "MAIN", "BUTTON")
   * @param {Object} [missingFields={}] - Currently unsatisfied fields { missingEmail, missingPhone, missingAddress, missingPeople, missingCompany, missingSocial }
   * @returns {{ score: number, pageIntent: string }}
   */
  function scoreLink(url, anchorText = "", depth = 1, containerTag = "", missingFields = {}) {
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
          if (detectedIntent === "GENERIC") {
            if (aRule.bonus >= 95) detectedIntent = "CONTACT";
            else if (aRule.bonus >= 85) detectedIntent = "TEAM";
            else if (aRule.bonus >= 75) detectedIntent = "ABOUT";
            else if (aRule.bonus >= 65) detectedIntent = "LOCATION";
          }
          break;
        }
      }
    }

    // 3. Container Context Bonus
    const upperContainer = (containerTag || "").toUpperCase();
    if (upperContainer.includes("NAV") || upperContainer.includes("HEADER") || upperContainer.includes("MENU")) {
      score += 15;
    } else if (upperContainer.includes("FOOTER")) {
      score += 8;
    } else if (upperContainer.includes("BUTTON") || upperContainer.includes("CTA")) {
      score += 10;
    }

    // 4. Field-Aware Dynamic Weighting
    if (missingFields) {
      if ((missingFields.missingEmail || missingFields.missingPhone || missingFields.missingAddress) && (detectedIntent === "CONTACT" || detectedIntent === "LOCATION")) {
        score += 40;
      }
      if (missingFields.missingPeople && detectedIntent === "TEAM") {
        score += 45;
      }
      if (missingFields.missingCompany && detectedIntent === "ABOUT") {
        score += 35;
      }
      if (missingFields.missingSocial && (upperContainer.includes("FOOTER") || /social|follow/i.test(cleanAnchor))) {
        score += 20;
      }
    }

    // 5. Depth Penalty
    if (depth > 1) {
      score -= (depth - 1) * 20;
    }

    return {
      score: Math.max(-100, Math.min(300, score)),
      pageIntent: detectedIntent,
    };
  }

  return {
    scoreLink,
    PATH_RULES,
    ANCHOR_RULES,
  };
});
