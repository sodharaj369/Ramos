/**
 * RAMOS Lead Enricher (v1.0.5)
 * Deterministic Merger for Google Maps Leads & Website Intelligence.
 *
 * PRECEDENCE RULES:
 * 1. Maps remains authoritative for physical Maps fields (company name, phone, address).
 * 2. Website Intelligence enriches missing fields (email, social, people, booking URLs).
 * 3. Never overwrites populated Maps phone, address, or company name.
 * 4. Never lets employee personal contact info overwrite company email/phone.
 * 5. Attaches comprehensive field-level _provenance dictionary.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./people-extractor.js"),
      require("./lead-scorer.js")
    );
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    const instance = factory(
      root.RamosPeopleExtractor || g.RamosPeopleExtractor,
      root.RamosLeadScorer || g.RamosLeadScorer
    );
    root.RamosWebsiteEnricher = instance;
    if (g && !g.RamosWebsiteEnricher) g.RamosWebsiteEnricher = instance;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (PeopleExtractor, LeadScorer) {
  "use strict";

  function isNonEmptyString(val) {
    return typeof val === "string" && val.trim().length > 0;
  }

  /**
   * Deterministically merges a Google Maps lead with Website Intelligence extraction data.
   * @param {object} mapsLead - Original canonical lead from Google Maps.
   * @param {object|null} websiteLead - Extracted business intelligence from website.
   * @returns {object} Combined enriched lead with intact canonical 24 columns and _provenance.
   */
  function mergeMapsAndWebsiteLead(mapsLead, websiteLead) {
    if (!mapsLead || typeof mapsLead !== "object") {
      throw new Error("Invalid mapsLead provided to mergeMapsAndWebsiteLead");
    }

    // Clone base Maps lead
    const merged = { ...mapsLead };
    const provenance = {};

    // Initialize Maps provenance for populated base fields
    const mapsFields = [
      "company_name", "phone", "website", "email", "email_status",
      "address", "city", "region", "country", "postal_code",
      "category", "business_type", "rating", "review_count",
      "opening_status", "price_range", "booking_url", "ordering_url",
      "menu_url", "place_id", "source_url", "sourceQuery", "run_id"
    ];

    for (const f of mapsFields) {
      if (merged[f] != null && merged[f] !== "") {
        provenance[f] = { source: "GOOGLE_MAPS" };
      }
    }

    // If websiteLead is missing or empty, return original Maps lead with provenance
    if (!websiteLead || typeof websiteLead !== "object") {
      merged._provenance = provenance;
      merged.enrichment_status = (merged.website && typeof merged.website === "string" && merged.website.trim().length > 0) ? "failed" : "skipped_no_website";
      return merged;
    }

    const fieldRankings = websiteLead._fieldRankings || {};

    // 1. Company Name: Maps always has authority unless empty
    if (!isNonEmptyString(merged.company_name) && isNonEmptyString(websiteLead.company_name)) {
      merged.company_name = websiteLead.company_name;
      provenance.company_name = {
        source: "WEBSITE",
        confidence: fieldRankings.company_name?.[0]?.confidence ?? 0.85,
      };
    }

    // 2. Phone: Maps phone is preserved; website phone fills ONLY if missing
    if (!isNonEmptyString(merged.phone) && isNonEmptyString(websiteLead.phone)) {
      merged.phone = websiteLead.phone;
      provenance.phone = {
        source: "WEBSITE",
        confidence: fieldRankings.phone?.[0]?.confidence ?? 0.85,
      };
    }

    // 3. Address: Maps address is preserved; website fills ONLY if missing
    if (!isNonEmptyString(merged.address) && isNonEmptyString(websiteLead.address)) {
      merged.address = websiteLead.address;
      provenance.address = {
        source: "WEBSITE",
        confidence: fieldRankings.address?.[0]?.confidence ?? 0.80,
      };
    }

    // 4. Address Components (city, region, country, postal_code)
    const locProps = ["city", "region", "country", "postal_code"];
    for (const prop of locProps) {
      if (!isNonEmptyString(merged[prop]) && isNonEmptyString(websiteLead[prop])) {
        merged[prop] = websiteLead[prop];
        provenance[prop] = {
          source: "WEBSITE",
          confidence: fieldRankings[prop]?.[0]?.confidence ?? 0.80,
        };
      }
    }

    // 5. Website URL: Keep Maps website or canonical website
    if (!isNonEmptyString(merged.website) && isNonEmptyString(websiteLead.website)) {
      merged.website = websiteLead.website;
      provenance.website = { source: "WEBSITE", confidence: 1.0 };
    }

    // 6. Email: Maps rarely provides email. Website email fills if missing.
    // If Maps somehow had an email, do NOT overwrite it.
    if (isNonEmptyString(websiteLead.email)) {
      if (!isNonEmptyString(merged.email)) {
        merged.email = websiteLead.email;
        merged.email_status = websiteLead.email_status || "verified";
        const emailConf = fieldRankings.email?.[0]?.confidence ?? 0.90;
        const emailSrc = fieldRankings.email?.[0]?.sourceUrl ?? websiteLead.website;
        provenance.email = {
          source: "WEBSITE",
          confidence: emailConf,
          url: emailSrc,
        };
        provenance.email_status = { source: "WEBSITE" };
      }
    }

    // 7. Industry / Category
    if (!isNonEmptyString(merged.category) && isNonEmptyString(websiteLead.category)) {
      merged.category = websiteLead.category;
      provenance.category = { source: "WEBSITE", confidence: 0.75 };
    }

    // 8. Action URLs (booking, ordering, menu)
    const urlProps = ["booking_url", "ordering_url", "menu_url"];
    for (const prop of urlProps) {
      if (!isNonEmptyString(merged[prop]) && isNonEmptyString(websiteLead[prop])) {
        merged[prop] = websiteLead[prop];
        provenance[prop] = { source: "WEBSITE", confidence: 0.85 };
      }
    }

    // 9. Social Profiles (Website-only dimension - preserve only discovered URLs)
    const rawSocial = {
      ...(mapsLead.social || {}),
      ...(websiteLead.social || {}),
    };
    const cleanSocial = {};
    for (const [k, v] of Object.entries(rawSocial)) {
      if (typeof v === "string" && v.trim().length > 0) {
        cleanSocial[k] = v.trim();
      }
    }
    merged.social = cleanSocial;
    if (Object.keys(merged.social).length > 0) {
      provenance.social = { source: "WEBSITE" };
    }

    // 10. People / Leadership (Website-only dimension) & Decision Maker (Phase 8A)
    // CRITICAL ISOLATION: People data attaches to lead.people ONLY.
    // Employee email/phone NEVER overwrites company primary email/phone.
    const websitePeople = Array.isArray(websiteLead.people) ? websiteLead.people : [];
    const PeopleExt = PeopleExtractor || (typeof root !== "undefined" && root.RamosPeopleExtractor) || (typeof globalThis !== "undefined" ? globalThis.RamosPeopleExtractor : null);
    const rankedPeople = PeopleExt && typeof PeopleExt.rankPeopleBySeniority === "function"
      ? PeopleExt.rankPeopleBySeniority(websitePeople)
      : websitePeople;

    merged.people = rankedPeople.map((p) => ({
      name: p.name,
      title: p.title || null,
      linkedin_url: p.linkedin_url || null,
      email: p.email || null,
      phone: p.phone || null,
      seniorityScore: p.seniorityScore,
    }));
    merged.people_count = merged.people.length;

    const primaryDm = PeopleExt && typeof PeopleExt.selectPrimaryDecisionMaker === "function"
      ? PeopleExt.selectPrimaryDecisionMaker(merged.people)
      : (merged.people[0] || null);

    merged.decision_maker_name = primaryDm ? primaryDm.name : (websiteLead.decision_maker_name || null);
    merged.decision_maker_title = primaryDm ? (primaryDm.title || null) : (websiteLead.decision_maker_title || null);
    merged.decision_maker_email = primaryDm ? (primaryDm.email || null) : (websiteLead.decision_maker_email || null);
    merged.decision_maker_linkedin = primaryDm ? (primaryDm.linkedin_url || null) : (websiteLead.decision_maker_linkedin || null);

    if (merged.people.length > 0) {
      provenance.people = { source: "WEBSITE", count: merged.people.length };
    }

    // 11. Website Description & Metadata
    if (isNonEmptyString(websiteLead.description)) {
      merged.description = websiteLead.description;
      provenance.description = { source: "WEBSITE" };
    }

    // 12. Corporate Emails & Phones arrays (deterministic primary + additional[])
    if (isNonEmptyString(merged.email)) {
      const lowerMerged = merged.email.toLowerCase().trim();
      const webEmails = Array.isArray(websiteLead.emails) ? websiteLead.emails : [];
      const distinctWebEmails = webEmails.filter((e) => {
        const emStr = typeof e === "string" ? e : e.email;
        return emStr && emStr.toLowerCase().trim() !== lowerMerged;
      });
      merged.emails = [{ email: merged.email, type: merged.email_status || "verified", confidence: 1.0 }, ...distinctWebEmails];
      merged.additional_emails = distinctWebEmails.map((e) => (typeof e === "string" ? e : e.email)).filter(Boolean);
    } else {
      merged.emails = [];
      merged.additional_emails = [];
    }

    if (isNonEmptyString(merged.phone)) {
      const mergedDigits = String(merged.phone).replace(/\D/g, "");
      const webPhones = Array.isArray(websiteLead.phones) ? websiteLead.phones : [];
      const distinctWebPhones = webPhones.filter((p) => {
        const phStr = typeof p === "string" ? p : p.phone;
        return phStr && phStr.replace(/\D/g, "") !== mergedDigits;
      });
      merged.phones = [{ phone: merged.phone, confidence: 1.0, sourceType: "primary" }, ...distinctWebPhones];
      merged.additional_phones = distinctWebPhones.map((p) => (typeof p === "string" ? p : p.phone)).filter(Boolean);
    } else {
      merged.phones = [];
      merged.additional_phones = [];
    }

    // 13. Retain Raw Evidence & Set Enriched Status
    merged.enrichment_status = "enriched";
    merged.enriched_at = new Date().toISOString();
    merged._provenance = provenance;

    // Preserve all underlying evidence
    merged._evidence = [
      ...(Array.isArray(mapsLead._evidence) ? mapsLead._evidence : []),
      ...(Array.isArray(websiteLead._evidence) ? websiteLead._evidence : []),
    ];

    // 14. Compute Lead Quality Score (0-100) & Quality Tier (Phase 8A)
    const Scorer = LeadScorer || (typeof root !== "undefined" && root.RamosLeadScorer) || (typeof globalThis !== "undefined" ? globalThis.RamosLeadScorer : null);
    if (Scorer && typeof Scorer.computeLeadScore === "function") {
      const scoreRes = Scorer.computeLeadScore(merged);
      merged.lead_score = scoreRes.score;
      merged.quality_tier = scoreRes.tier;
      provenance.lead_score = scoreRes.breakdown;
    } else {
      merged.lead_score = 0;
      merged.quality_tier = "LOW";
    }

    return merged;
  }

  return {
    mergeMapsAndWebsiteLead,
  };
});
