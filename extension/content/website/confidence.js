/**
 * RAMOS Website Intelligence — Evidence & Confidence Scoring Engine
 * Deterministic scoring, corroboration calculation, and conflict resolution across pages and sources.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosConfidence = factory();
    if (g && !g.RamosConfidence) g.RamosConfidence = root.RamosConfidence;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Tier 1 to 7 Source Quality Base Scores
  const SOURCE_BASE_CONFIDENCE = {
    "json-ld": 0.96,
    "microdata": 0.90,
    "mailto": 0.92,
    "tel": 0.92,
    "semantic-dom": 0.85,
    "open-graph": 0.82,
    "metadata": 0.80,
    "contextual-label": 0.72,
    "team-card": 0.86,
    "regex-fallback": 0.55,
    "unknown": 0.50,
  };

  // Contextual Page Type Boosts
  const PAGE_TYPE_MODIFIERS = {
    CONTACT: {
      email: 0.08,
      phone: 0.08,
      address: 0.08,
      city: 0.06,
      country: 0.06,
      booking_url: 0.05,
    },
    ABOUT: {
      company_name: 0.06,
      description: 0.08,
      linkedin: 0.05,
    },
    TEAM: {
      people: 0.08,
      linkedin: 0.06,
    },
    HOMEPAGE: {
      company_name: 0.05,
      website: 0.05,
    },
    LEGAL: {
      email: -0.30,
      phone: -0.30,
      address: -0.20,
    },
    BLOG: {
      email: -0.15,
      phone: -0.15,
      address: -0.15,
    },
  };

  /**
   * Computes an initial deterministic confidence score for a single candidate.
   * @param {Object} candidate - { field, value, source, evidence_type, page_url, page_type, validated, ... }
   * @returns {number} Score between 0.00 and 1.00
   */
  function computeInitialConfidence(candidate) {
    if (!candidate || candidate.value == null) return 0.0;

    const source = (candidate.source || "unknown").toLowerCase();
    let score = SOURCE_BASE_CONFIDENCE[source] || 0.50;

    // Specific evidence_type adjustments
    if (candidate.evidence_type === "json-ld-organization") score = 0.98;
    else if (candidate.evidence_type === "json-ld-contactpoint") score = 0.97;
    else if (candidate.evidence_type === "mailto-protocol") score = 0.94;
    else if (candidate.evidence_type === "tel-protocol") score = 0.94;
    else if (candidate.evidence_type === "semantic-address-tag") score = 0.90;
    else if (candidate.evidence_type === "body-regex-fallback") score = 0.55;

    // Page Context modifier
    const pageType = (candidate.page_type || "GENERIC").toUpperCase();
    if (PAGE_TYPE_MODIFIERS[pageType] && PAGE_TYPE_MODIFIERS[pageType][candidate.field]) {
      score += PAGE_TYPE_MODIFIERS[pageType][candidate.field];
    }

    // Role account bonus for company email
    if (candidate.field === "email" && candidate.classification === "business_role") {
      score += 0.05;
    } else if (candidate.field === "email" && candidate.classification === "freemail") {
      // Freemail penalty unless explicitly anchored in JSON-LD or mailto
      if (source !== "mailto" && source !== "json-ld") {
        score -= 0.20;
      }
    }

    return Math.max(0.0, Math.min(1.0, Math.round(score * 1000) / 1000));
  }

  /**
   * Applies cross-page corroboration bonuses to candidates.
   * If identical values appear across independent pages or distinct source types,
   * corroboration increases confidence.
   *
   * @param {Array<Object>} candidates - List of candidate evidence objects
   * @returns {Array<Object>} Updated candidates with corroboration bonuses applied
   */
  function applyCorroboration(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    // Group candidates by field and normalized value
    const groups = new Map();

    for (const cand of candidates) {
      const key = `${cand.field}:::${String(cand.value).toLowerCase().trim()}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(cand);
    }

    // Apply repetition & multi-source bonus
    for (const [, items] of groups.entries()) {
      const uniquePages = new Set(items.map((it) => it.page_url || it.sourceUrl).filter(Boolean));
      const uniqueSources = new Set(items.map((it) => it.source || it.sourceType).filter(Boolean));

      // Page corroboration: +0.03 per additional unique page (max +0.06)
      const pageBonus = Math.min(0.06, Math.max(0, (uniquePages.size - 1) * 0.03));

      // Source corroboration: +0.04 if seen in >= 2 distinct source types (e.g. JSON-LD and mailto)
      const sourceBonus = uniqueSources.size >= 2 ? 0.04 : 0.0;

      const totalCorroboration = pageBonus + sourceBonus;

      for (const item of items) {
        const base = typeof item.confidence === "number" ? item.confidence : computeInitialConfidence(item);
        item.corroboration = {
          uniquePageCount: uniquePages.size,
          uniqueSourceCount: uniqueSources.size,
          bonus: totalCorroboration,
        };
        item.confidence = Math.max(0.0, Math.min(1.0, Math.round((base + totalCorroboration) * 1000) / 1000));
      }
    }

    return candidates;
  }

  /**
   * Resolves conflicting candidates for a given field deterministically.
   *
   * Conflict Resolution Rules:
   * 1. Higher confidence score wins.
   * 2. If confidence is tied:
   *    a. Prefer dedicated page context (/contact over /about over /homepage).
   *    b. Prefer stronger source hierarchy (JSON-LD > mailto/tel > microdata > semantic DOM > regex).
   *    c. Prefer higher unique page corroboration count.
   *    d. Tie-breaker: deterministic alphabetical string sorting.
   *
   * @param {Array<Object>} candidates - Candidates for a single field
   * @returns {{ winner: Object|null, ranked: Array<Object> }}
   */
  function resolveFieldConflict(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { winner: null, ranked: [] };
    }

    // Filter out invalidated or below-threshold candidates
    const eligible = candidates.filter((c) => c && c.value != null && (c.confidence == null || c.confidence >= 0.45));

    if (eligible.length === 0) {
      return { winner: null, ranked: [] };
    }

    const SOURCE_RANK = {
      "json-ld": 10,
      "mailto": 9,
      "tel": 9,
      "microdata": 8,
      "semantic-dom": 7,
      "open-graph": 6,
      "metadata": 5,
      "contextual-label": 4,
      "team-card": 4,
      "regex-fallback": 1,
      "unknown": 0,
    };

    const PAGE_RANK = {
      CONTACT: 5,
      ABOUT: 4,
      TEAM: 3,
      HOMEPAGE: 2,
      GENERIC: 1,
      BLOG: 0,
      LEGAL: -1,
    };

    // Sort descending by deterministic criteria
    const ranked = [...eligible].sort((a, b) => {
      // 1. Confidence comparison (epsilon 0.005)
      const diffConf = (b.confidence || 0) - (a.confidence || 0);
      if (Math.abs(diffConf) > 0.005) {
        return diffConf;
      }

      // 2. Page Type Relevance
      const pA = PAGE_RANK[(a.page_type || "GENERIC").toUpperCase()] ?? 1;
      const pB = PAGE_RANK[(b.page_type || "GENERIC").toUpperCase()] ?? 1;
      if (pB !== pA) {
        return pB - pA;
      }

      // 3. Source Quality
      const sA = SOURCE_RANK[(a.source || "unknown").toLowerCase()] ?? 0;
      const sB = SOURCE_RANK[(b.source || "unknown").toLowerCase()] ?? 0;
      if (sB !== sA) {
        return sB - sA;
      }

      // 4. Corroboration page count
      const cA = a.corroboration ? a.corroboration.uniquePageCount : 1;
      const cB = b.corroboration ? b.corroboration.uniquePageCount : 1;
      if (cB !== cA) {
        return cB - cA;
      }

      // 5. Deterministic tie-breaker
      return String(a.value).localeCompare(String(b.value));
    });

    return {
      winner: ranked[0] || null,
      ranked,
    };
  }

  /**
   * Resolves conflicts across all candidate fields deterministically.
   * Returns a map of field -> winner candidate, while keeping full ranked candidates.
   *
   * @param {Array<Object>} allCandidates - All candidate evidence items across all pages
   * @returns {{ bestCandidates: Object, fieldRankings: Object }}
   */
  function resolveAllCandidates(allCandidates) {
    // 1. Apply corroboration bonuses
    const corroborated = applyCorroboration(allCandidates);

    // 2. Group by field
    const byField = new Map();
    for (const cand of corroborated) {
      if (!cand.field) continue;
      if (!byField.has(cand.field)) {
        byField.set(cand.field, []);
      }
      byField.get(cand.field).push(cand);
    }

    const bestCandidates = {};
    const fieldRankings = {};

    for (const [field, fieldCandidates] of byField.entries()) {
      const { winner, ranked } = resolveFieldConflict(fieldCandidates);
      if (winner) {
        bestCandidates[field] = winner;
      }
      fieldRankings[field] = ranked;
    }

    return {
      bestCandidates,
      fieldRankings,
    };
  }

  return {
    computeInitialConfidence,
    applyCorroboration,
    resolveFieldConflict,
    resolveAllCandidates,
    SOURCE_BASE_CONFIDENCE,
    PAGE_TYPE_MODIFIERS,
  };
});
