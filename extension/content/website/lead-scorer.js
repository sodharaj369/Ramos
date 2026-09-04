/**
 * RAMOS Lead Quality Scorer (v1.0.5 / Phase 8A)
 * Deterministic Lead Scoring Engine (0-100) & Quality Tiering.
 *
 * Scoring Rubric (100 Maximum Points):
 * - Company Identity:    10 pts (Valid non-empty company name)
 * - Direct Reachability: 35 pts (Primary Email: 20 pts, Primary Phone: 15 pts)
 * - Physical Address:    10 pts (Full street address: 10 pts, City/Region: 5 pts)
 * - Digital Footprint:   15 pts (Website: 5 pts, Social Profile: 10 pts)
 * - Key Decision Maker:  15 pts (Owner/CEO/Founder/Executive identified in people[])
 * - Corroboration:       15 pts (Phone/Address corroborated across Maps & Web: 10 pts, Business Email: 5 pts)
 *
 * Quality Tiers:
 * - HIGH:   75 - 100
 * - MEDIUM: 45 - 74
 * - LOW:    0 - 44
 *
 * Zero-Hallucination: Missing fields receive 0 pts. Never manufacture values.
 */
(function (root, factory) {
  const instance = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = instance;
  }
  if (root) {
    root.RamosLeadScorer = instance;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isNonEmptyString(val) {
    return typeof val === "string" && val.trim().length > 0;
  }

  /**
   * Computes deterministic lead score (0-100), quality tier, and component breakdown.
   * @param {Object} lead - Canonical or enriched lead object.
   * @returns {{ score: number, tier: string, breakdown: Object }}
   */
  function computeLeadScore(lead) {
    if (!lead || typeof lead !== "object") {
      return {
        score: 0,
        tier: "LOW",
        breakdown: {
          company_name: 0,
          phone: 0,
          email: 0,
          address: 0,
          website: 0,
          social: 0,
          decision_maker: 0,
          corroboration: 0,
        },
      };
    }

    const breakdown = {
      company_name: 0,
      phone: 0,
      email: 0,
      address: 0,
      website: 0,
      social: 0,
      decision_maker: 0,
      corroboration: 0,
    };

    // 1. Company Name (10 pts)
    if (isNonEmptyString(lead.company_name)) {
      breakdown.company_name = 10;
    }

    // 2. Direct Reachability: Phone (15 pts) & Email (20 pts)
    if (isNonEmptyString(lead.phone)) {
      breakdown.phone = 15;
    }

    if (isNonEmptyString(lead.email)) {
      breakdown.email = 20;
    }

    // 3. Physical Address (10 pts)
    if (isNonEmptyString(lead.address)) {
      breakdown.address = 10;
    } else if (isNonEmptyString(lead.city) && isNonEmptyString(lead.postal_code)) {
      breakdown.address = 7;
    } else if (isNonEmptyString(lead.city) || isNonEmptyString(lead.region)) {
      breakdown.address = 4;
    }

    // 4. Digital Footprint: Website (10 pts) & Social (10 pts)
    if (isNonEmptyString(lead.website)) {
      breakdown.website = 10;
    }

    const social = lead.social || {};
    const hasSocial = Object.values(social).some((url) => isNonEmptyString(url));
    if (hasSocial) {
      breakdown.social = 10;
    }

    // 5. Key Decision Maker (15 pts)
    if (isNonEmptyString(lead.decision_maker_name)) {
      breakdown.decision_maker = 15;
    } else if (Array.isArray(lead.people) && lead.people.length > 0) {
      // Check if any person has a recognized title or name
      const hasTitledPerson = lead.people.some((p) => p && isNonEmptyString(p.name) && isNonEmptyString(p.title));
      breakdown.decision_maker = hasTitledPerson ? 12 : 8;
    }

    // 6. Corroboration & Quality Verification (15 pts)
    const prov = lead._provenance || {};
    let corroborationPts = 0;

    // Multi-source presence (e.g. phone/address from Maps, email from Website)
    const hasMapsSource = Object.values(prov).some((p) => p && p.source === "GOOGLE_MAPS");
    const hasWebSource = Object.values(prov).some((p) => p && p.source === "WEBSITE");
    if (hasMapsSource && hasWebSource) {
      corroborationPts += 10;
    }

    // Professional/corporate email verification status
    if (lead.email_status && (lead.email_status === "business_role" || lead.email_status === "verified" || lead.email_status === "sales")) {
      corroborationPts += 5;
    } else if (isNonEmptyString(lead.email) && !corroborationPts) {
      corroborationPts += 3;
    }

    breakdown.corroboration = Math.min(15, corroborationPts);

    // Calculate total score bounded strictly between 0 and 100
    const rawScore =
      breakdown.company_name +
      breakdown.phone +
      breakdown.email +
      breakdown.address +
      breakdown.website +
      breakdown.social +
      breakdown.decision_maker +
      breakdown.corroboration;

    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    let tier = "LOW";
    if (score >= 75) {
      tier = "HIGH";
    } else if (score >= 45) {
      tier = "MEDIUM";
    }

    return {
      score,
      tier,
      breakdown,
    };
  }

  return {
    computeLeadScore,
  };
});
