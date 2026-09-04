/**
 * RAMOS Lead Deduplication Engine (v1.0.5 / Phase 8D)
 * Conservative, High-Precision Duplicate Lead Detection & Merging.
 *
 * Rules:
 * 1. Match by place_id: identical Google Maps place_id guarantees duplicate listing.
 *    Distinct place_ids mean distinct Google Maps entities; NEVER merge them.
 * 2. Match by domain + phone: identical root domain AND matching phone digits.
 * 3. Match by domain + high name similarity: identical root domain AND name token similarity >= 0.75
 *    (as long as neither record has conflicting different phone numbers).
 * 4. NEGATIVE RULE: Never merge businesses based only on similar names if domains differ or are missing.
 *    Two "Starbucks" or "Apex Dental" with different locations/websites are distinct businesses!
 * 5. Merging preserves the richer record and unions all discovered corporate emails, phones,
 *    social profiles, and executive people records without data loss.
 */
(function (root, factory) {
  const instance = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = instance;
  }
  if (root) {
    root.RamosDeduplicator = instance;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  const Normalizers = (root && root.RamosWebsiteNormalizers) || {
    normalizeDomain: function (url) {
      if (!url || typeof url !== "string") return "";
      try {
        let target = url.trim();
        if (!/^https?:\/\//i.test(target)) target = "https://" + target;
        const parsed = new URL(target);
        return parsed.hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return "";
      }
    },
    normalizePhone: function (phone) {
      return String(phone || "").replace(/\D/g, "");
    },
    normalizeEmail: function (email) {
      return String(email || "").toLowerCase().trim();
    },
  };

  const PeopleExtractor = (root && root.RamosPeopleExtractor) || null;
  const LeadScorer = (root && root.RamosLeadScorer) || null;

  const STOP_WORDS = new Set([
    "inc",
    "llc",
    "ltd",
    "corp",
    "corporation",
    "co",
    "the",
    "and",
    "&",
    "group",
    "services",
    "service",
    "company",
    "solutions",
    "holdings",
  ]);

  function tokenizeName(name) {
    if (!name || typeof name !== "string") return [];
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  }

  function computeNameSimilarity(nameA, nameB) {
    const tokensA = tokenizeName(nameA);
    const tokensB = tokenizeName(nameB);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersectionCount = 0;
    for (const t of setA) {
      if (setB.has(t)) intersectionCount++;
    }

    const unionCount = new Set([...tokensA, ...tokensB]).size;
    const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0;

    // Check subset containment (e.g. "Acme Dental" inside "Acme Dental Care")
    const isSubset =
      tokensA.every((t) => setB.has(t)) || tokensB.every((t) => setA.has(t));
    if (isSubset && Math.min(tokensA.length, tokensB.length) >= 2) {
      return Math.max(jaccard, 0.85);
    }

    return jaccard;
  }

  function getDomain(lead) {
    if (!lead || typeof lead !== "object") return "";
    const site = lead.website || lead.domain || "";
    return Normalizers.normalizeDomain(site);
  }

  function getPhoneDigits(phone) {
    if (!phone) return "";
    return String(phone).replace(/\D/g, "");
  }

  /**
   * Evaluates if two leads are conservative duplicates.
   * @param {Object} leadA
   * @param {Object} leadB
   * @returns {{ isDuplicate: boolean, reason: string | null }}
   */
  function areDuplicates(leadA, leadB) {
    if (!leadA || !leadB || typeof leadA !== "object" || typeof leadB !== "object") {
      return { isDuplicate: false, reason: null };
    }

    const pidA = String(leadA.place_id || leadA.placeId || "").trim();
    const pidB = String(leadB.place_id || leadB.placeId || "").trim();

    // 1. Google Maps place_id rule
    if (pidA && pidB) {
      if (pidA.toLowerCase() === pidB.toLowerCase()) {
        return { isDuplicate: true, reason: "place_id" };
      }
      // If both have different place_ids, they are explicitly distinct Google Maps listings
      return { isDuplicate: false, reason: null };
    }

    // 2. Domain checks
    const domA = getDomain(leadA);
    const domB = getDomain(leadB);

    // NEGATIVE RULE: If domain is missing on either or they differ, do NOT merge by name alone
    if (!domA || !domB || domA !== domB) {
      return { isDuplicate: false, reason: null };
    }

    // Same domain verified! Now check phones.
    const phoneA = getPhoneDigits(leadA.phone);
    const phoneB = getPhoneDigits(leadB.phone);

    const hasPhoneA = phoneA.length >= 7;
    const hasPhoneB = phoneB.length >= 7;

    if (hasPhoneA && hasPhoneB) {
      // Both have phones: match if digits match (or last 7 match)
      if (
        phoneA === phoneB ||
        phoneA.endsWith(phoneB.slice(-7)) ||
        phoneB.endsWith(phoneA.slice(-7))
      ) {
        return { isDuplicate: true, reason: "domain_phone" };
      }
      // Conflicting phones on the same domain indicate distinct branch locations or independent offices!
      return { isDuplicate: false, reason: null };
    }

    // 3. Domain + High Name Similarity
    const nameA = leadA.name || leadA.company_name || "";
    const nameB = leadB.name || leadB.company_name || "";
    const similarity = computeNameSimilarity(nameA, nameB);

    if (similarity >= 0.75) {
      return { isDuplicate: true, reason: "domain_name_similarity" };
    }

    return { isDuplicate: false, reason: null };
  }

  /**
   * Merges a source lead into a target lead, preserving all discovered contacts and details.
   * @param {Object} target
   * @param {Object} source
   * @returns {Object} Target with unioned data.
   */
  function mergeDuplicateLeads(target, source) {
    if (!target || !source) return target || source;

    // Fill missing primitive fields into target
    const primitiveFields = [
      "website",
      "address",
      "phone",
      "rating",
      "reviews_count",
      "category",
      "description",
      "place_id",
      "google_maps_url",
    ];

    primitiveFields.forEach((field) => {
      if ((target[field] == null || target[field] === "") && source[field] != null && source[field] !== "") {
        target[field] = source[field];
      }
    });

    // 1. Merge Emails
    const existingEmails = new Set();
    if (target.email) existingEmails.add(Normalizers.normalizeEmail(target.email));
    if (Array.isArray(target.additional_emails)) {
      target.additional_emails.forEach((e) => existingEmails.add(Normalizers.normalizeEmail(e)));
    } else {
      target.additional_emails = [];
    }

    const candidateEmails = [
      source.email,
      ...(Array.isArray(source.additional_emails) ? source.additional_emails : []),
    ];

    candidateEmails.forEach((raw) => {
      if (!raw) return;
      const normalized = Normalizers.normalizeEmail(raw);
      if (!normalized) return;
      if (!target.email) {
        target.email = raw;
        existingEmails.add(normalized);
      } else if (!existingEmails.has(normalized)) {
        target.additional_emails.push(raw);
        existingEmails.add(normalized);
      }
    });

    // 2. Merge Phones
    const existingPhones = new Set();
    if (target.phone) existingPhones.add(getPhoneDigits(target.phone));
    if (Array.isArray(target.additional_phones)) {
      target.additional_phones.forEach((p) => existingPhones.add(getPhoneDigits(p)));
    } else {
      target.additional_phones = [];
    }

    const candidatePhones = [
      source.phone,
      ...(Array.isArray(source.additional_phones) ? source.additional_phones : []),
    ];

    candidatePhones.forEach((raw) => {
      if (!raw) return;
      const digits = getPhoneDigits(raw);
      if (digits.length < 7) return;
      if (!target.phone) {
        target.phone = raw;
        existingPhones.add(digits);
      } else if (!existingPhones.has(digits)) {
        target.additional_phones.push(raw);
        existingPhones.add(digits);
      }
    });

    // 3. Merge People
    const peopleMap = new Map();
    const addPerson = (p) => {
      if (!p || typeof p !== "object" || !p.name) return;
      const key = (p.email ? p.email.toLowerCase() : p.name.toLowerCase()).trim();
      if (!peopleMap.has(key)) {
        peopleMap.set(key, { ...p });
      } else {
        const existing = peopleMap.get(key);
        if (!existing.title && p.title) existing.title = p.title;
        if (!existing.email && p.email) existing.email = p.email;
        if (!existing.linkedin_url && p.linkedin_url) existing.linkedin_url = p.linkedin_url;
      }
    };

    if (Array.isArray(target.people)) target.people.forEach(addPerson);
    if (Array.isArray(source.people)) source.people.forEach(addPerson);

    let mergedPeople = Array.from(peopleMap.values());
    if (PeopleExtractor && typeof PeopleExtractor.rankPeopleBySeniority === "function") {
      mergedPeople = PeopleExtractor.rankPeopleBySeniority(mergedPeople);
    }
    target.people = mergedPeople;
    target.people_count = mergedPeople.length;

    if (mergedPeople.length > 0) {
      const topDm = mergedPeople[0];
      target.decision_maker_name = topDm.name || null;
      target.decision_maker_title = topDm.title || null;
      target.decision_maker_email = topDm.email || null;
      target.decision_maker_linkedin = topDm.linkedin_url || null;
    }

    // 4. Merge Socials
    const socialPlatforms = [
      "linkedin",
      "facebook",
      "instagram",
      "twitter",
      "youtube",
      "github",
      "pinterest",
    ];

    socialPlatforms.forEach((platform) => {
      if (!target[platform] && source[platform]) {
        target[platform] = source[platform];
      }
    });

    // 5. Recompute Lead Score & Quality Tier
    if (LeadScorer && typeof LeadScorer.computeLeadScore === "function") {
      const scoreResult = LeadScorer.computeLeadScore(target);
      target.lead_score = scoreResult.score;
      target.quality_tier = scoreResult.tier;
    }

    return target;
  }

  /**
   * Deduplicates a list of leads conservatively.
   * @param {Array<Object>} leads
   * @returns {{ deduplicatedLeads: Array<Object>, duplicatesRemoved: number }}
   */
  function deduplicateLeads(leads) {
    if (!Array.isArray(leads) || leads.length === 0) {
      return { deduplicatedLeads: [], duplicatesRemoved: 0 };
    }

    const result = [];
    let duplicatesRemoved = 0;

    for (const lead of leads) {
      if (!lead || typeof lead !== "object") continue;

      let foundDuplicate = false;
      for (let i = 0; i < result.length; i++) {
        const existing = result[i];
        const match = areDuplicates(existing, lead);
        if (match.isDuplicate) {
          mergeDuplicateLeads(existing, lead);
          duplicatesRemoved++;
          foundDuplicate = true;
          break;
        }
      }

      if (!foundDuplicate) {
        // Clone lead to avoid mutating original collection
        result.push(JSON.parse(JSON.stringify(lead)));
      }
    }

    return { deduplicatedLeads: result, duplicatesRemoved };
  }

  return {
    areDuplicates,
    mergeDuplicateLeads,
    deduplicateLeads,
  };
});
