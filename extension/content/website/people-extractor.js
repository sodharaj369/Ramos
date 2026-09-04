/**
 * RAMOS Website Intelligence — People & Leadership Extractor
 * Extracts structured team and executive profiles (name, title, profile_url, linkedin_url, direct contact)
 * using an evidence-based approach without guessing or hallucinations.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./normalizers.js"),
      require("./validators.js")
    );
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosPeopleExtractor = factory(
      root.RamosWebsiteNormalizers || g.RamosWebsiteNormalizers,
      root.RamosWebsiteValidators || g.RamosWebsiteValidators
    );
    if (g && !g.RamosPeopleExtractor) g.RamosPeopleExtractor = root.RamosPeopleExtractor;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function (
  Normalizers,
  Validators
) {
  "use strict";

  // Recognized professional job title keywords and patterns
  const TITLE_REGEX =
    /\b(chief\s+[a-z\s]+officer|c[eotmfpir]o|founder|co-founder|president|vice\s+president|vp|director|head\s+of\s+[a-z\s&]+|managing\s+director|partner|principal|lead|manager|architect|consultant|specialist|engineer|designer|chairperson|general\s+manager|advisor|counsel)\b/i;

  const NON_NAME_TOKENS = new Set([
    "about", "about us", "team", "our team", "leadership", "people", "management",
    "board", "advisors", "contact", "read more", "view bio", "learn more", "profile",
    "view profile", "meet the team", "executives", "staff", "menu", "home",
    "services", "products", "careers", "jobs", "join us", "blog", "news",
    "inc", "llc", "ltd", "corp", "corporation", "technologies", "solutions",
    "systems", "services", "company", "group", "holdings"
  ]);

  /**
   * Extracts structured personnel profiles from an AcquiredPage or DOM Document.
   * @param {Object|Document} pageOrDoc - AcquiredPage or DOM Document
   * @param {Object} [options]
   * @returns {Array<Object>} List of validated ExtractedPerson objects
   */
  function extractPeople(pageOrDoc, options = {}) {
    const doc = pageOrDoc.document || pageOrDoc;
    const pageUrl = pageOrDoc.url || "";
    const baseUrl = pageOrDoc.baseUrl || pageUrl;

    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }

    const rawPeople = [];

    // 1. JSON-LD Person Extraction (Tier 1)
    extractJsonLdPersons(doc, pageUrl, rawPeople);

    // 2. Schema.org Microdata Person Extraction (Tier 2)
    extractMicrodataPersons(doc, pageUrl, rawPeople);

    // 3. Structural Team Cards & Containers (Tier 3 & Tier 4)
    extractTeamCards(doc, pageUrl, baseUrl, rawPeople);

    // Filter, validate, and deduplicate people
    return deduplicateAndCleanPeople(rawPeople);
  }

  /**
   * Extracts JSON-LD Person entities.
   */
  function extractJsonLdPersons(doc, pageUrl, results) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const text = (scripts[i].textContent || "").trim();
      if (!text) continue;

      try {
        const parsed = JSON.parse(text);
        traverseJsonLdForPersons(parsed, pageUrl, results);
      } catch {
        // Skip malformed JSON
      }
    }
  }

  function traverseJsonLdForPersons(node, pageUrl, results) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => traverseJsonLdForPersons(item, pageUrl, results));
      return;
    }
    if (typeof node !== "object") return;

    if (Array.isArray(node["@graph"])) {
      node["@graph"].forEach((item) => traverseJsonLdForPersons(item, pageUrl, results));
      return;
    }

    const rawType = node["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isPerson = types.some((t) => typeof t === "string" && t.toLowerCase() === "person");

    if (isPerson && node.name) {
      const name = Normalizers.normalizeText(node.name);
      if (isValidPersonName(name)) {
        let linkedin = null;
        if (node.sameAs) {
          const links = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
          for (const l of links) {
            if (typeof l === "string" && l.includes("linkedin.com/in/")) {
              linkedin = Normalizers.normalizeUrl(l);
              break;
            }
          }
        }

        results.push({
          name,
          title: node.jobTitle ? Normalizers.normalizeText(node.jobTitle) : null,
          profile_url: node.url ? Normalizers.normalizeUrl(node.url, pageUrl) : null,
          linkedin_url: linkedin,
          email: node.email ? Normalizers.normalizeEmail(node.email) : null,
          phone: node.telephone ? Normalizers.normalizePhone(node.telephone) : null,
          confidence: 0.98,
          source: "json-ld",
          page_url: pageUrl,
        });
      }
    }

    // Check nested employee / member / founder arrays inside Organization
    for (const key of ["employee", "founder", "founders", "alumni", "member", "members"]) {
      if (node[key]) {
        traverseJsonLdForPersons(node[key], pageUrl, results);
      }
    }
  }

  /**
   * Extracts Microdata Person entities.
   */
  function extractMicrodataPersons(doc, pageUrl, results) {
    const personScopes = doc.querySelectorAll('[itemscope][itemtype*="schema.org/Person" i]');
    for (let i = 0; i < personScopes.length; i++) {
      const scope = personScopes[i];

      const nameEl = scope.querySelector('[itemprop="name"]');
      const name = nameEl ? Normalizers.normalizeText(nameEl.textContent) : "";
      if (!isValidPersonName(name)) continue;

      const titleEl = scope.querySelector('[itemprop="jobTitle"]');
      const title = titleEl ? Normalizers.normalizeText(titleEl.textContent) : null;

      const emailEl = scope.querySelector('[itemprop="email"]');
      const email = emailEl ? Normalizers.normalizeEmail(emailEl.getAttribute("href") || emailEl.textContent) : null;

      const phoneEl = scope.querySelector('[itemprop="telephone"]');
      const phone = phoneEl ? Normalizers.normalizePhone(phoneEl.getAttribute("href") || phoneEl.textContent) : null;

      const sameAsEl = scope.querySelector('[itemprop="sameAs"][href*="linkedin.com/in/"]');
      const linkedin = sameAsEl ? Normalizers.normalizeUrl(sameAsEl.getAttribute("href")) : null;

      results.push({
        name,
        title,
        profile_url: null,
        linkedin_url: linkedin,
        email,
        phone,
        confidence: 0.94,
        source: "microdata",
        page_url: pageUrl,
      });
    }
  }

  /**
   * Extracts team cards from structured DOM containers.
   */
  function extractTeamCards(doc, pageUrl, baseUrl, results) {
    // Selectors for card elements
    const cardSelectors = [
      "[class*='team-member' i]",
      "[class*='team_member' i]",
      "[class*='team-card' i]",
      "[class*='member-card' i]",
      "[class*='person-card' i]",
      "[class*='leadership-card' i]",
      "[class*='speaker-card' i]",
      "[class*='bio-card' i]",
      "[class*='team-grid' i] > *",
      "[class*='leadership-grid' i] > *",
      "[id*='team' i] article",
      "[id*='leadership' i] article",
      "[class*='team' i] li",
      "[class*='leadership' i] li",
    ];

    const cards = doc.querySelectorAll(cardSelectors.join(", "));
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      // Ignore nested cards or huge containers (e.g. the entire team section itself)
      if (card.children.length === 0 || card.textContent.length > 2500) continue;

      const person = parsePersonFromCard(card, pageUrl, baseUrl);
      if (person) {
        results.push(person);
      }
    }
  }

  /**
   * Parses a single team card element.
   */
  function parsePersonFromCard(cardEl, pageUrl, baseUrl) {
    // Look for name element: h2, h3, h4, h5, strong, or element with class name
    const nameCandidates = cardEl.querySelectorAll("h2, h3, h4, h5, strong, [class*='name' i]");
    let name = "";
    let nameEl = null;

    for (let i = 0; i < nameCandidates.length; i++) {
      const candText = Normalizers.normalizeText(nameCandidates[i].textContent);
      // If string contains a separator e.g. "Jane Smith - CEO", separate them
      const separated = splitNameAndTitle(candText);
      if (isValidPersonName(separated.name)) {
        name = separated.name;
        nameEl = nameCandidates[i];
        break;
      }
    }

    if (!name) return null;

    // Look for title element: prioritize elements with explicit role/title class
    let title = null;
    const explicitTitleEl = cardEl.querySelector("[class*='title' i], [class*='role' i], [class*='position' i], [class*='designation' i]");
    if (explicitTitleEl && explicitTitleEl !== nameEl && !nameEl.contains(explicitTitleEl)) {
      const explicitText = Normalizers.normalizeText(explicitTitleEl.textContent);
      if (isValidJobTitle(explicitText)) {
        title = explicitText;
      }
    }

    if (!title) {
      const otherCandidates = cardEl.querySelectorAll("p, span, div, h4, h5");
      for (let i = 0; i < otherCandidates.length; i++) {
        const el = otherCandidates[i];
        if (el === nameEl || nameEl.contains(el)) continue;
        const tText = Normalizers.normalizeText(el.textContent);
        if (isValidJobTitle(tText)) {
          title = tText;
          break;
        }
      }
    }

    // If title was part of the name string e.g. "Jane Smith — CEO"
    if (!title) {
      const separated = splitNameAndTitle(nameEl.textContent);
      if (separated.title && isValidJobTitle(separated.title)) {
        title = separated.title;
      }
    }

    // Look for LinkedIn link strictly inside this card
    let linkedin = null;
    const liLink = cardEl.querySelector('a[href*="linkedin.com/in/"]');
    if (liLink) {
      linkedin = Normalizers.normalizeUrl(liLink.getAttribute("href") || "");
    }

    // Look for Profile link inside this card
    let profileUrl = null;
    const profileLink = cardEl.querySelector('a[href*="/team/"], a[href*="/people/"], a[href*="/bio/"]');
    if (profileLink) {
      profileUrl = Normalizers.normalizeUrl(profileLink.getAttribute("href") || "", baseUrl);
    }

    // Look for direct Email strictly inside this card
    let email = null;
    const mailtoLink = cardEl.querySelector('a[href^="mailto:"]');
    if (mailtoLink) {
      const rawEmail = (mailtoLink.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0].trim();
      const userPart = rawEmail.split("@")[0].toLowerCase();
      const isGenericRoleAccount = /^(info|sales|contact|support|hello|team|admin|help|office|inquiries|press|careers|billing)$/i.test(userPart);
      const websiteDomain = Normalizers.normalizeDomain(pageUrl);
      const evalRes = Validators.evaluateEmail(rawEmail, websiteDomain);

      // Strictly reject generic company-wide emails on team cards to avoid attributing sales@ or info@ to an employee
      if (evalRes.isValid && !isGenericRoleAccount && evalRes.classification !== "business_role") {
        email = Normalizers.normalizeEmail(rawEmail);
      }
    }

    // Look for direct Phone strictly inside this card
    let phone = null;
    const telLink = cardEl.querySelector('a[href^="tel:"]');
    if (telLink) {
      const rawPhone = (telLink.getAttribute("href") || "").replace(/^tel:/i, "").split("?")[0].trim();
      if (Validators.isValidPhone(rawPhone)) {
        phone = Normalizers.normalizePhone(rawPhone);
      }
    }

    return {
      name,
      title: title || null,
      profile_url: profileUrl,
      linkedin_url: linkedin,
      email,
      phone,
      confidence: title ? 0.90 : 0.75,
      source: "team-card",
      page_url: pageUrl,
    };
  }

  /**
   * Helper: Splits combined strings like "Jane Smith — Chief Executive Officer".
   */
  function splitNameAndTitle(str) {
    if (!str || typeof str !== "string") return { name: "", title: null };
    const parts = str.split(/\s*[-|–—:•]\s*/);
    if (parts.length >= 2) {
      const p1 = Normalizers.normalizeText(parts[0]);
      const p2 = Normalizers.normalizeText(parts[1]);
      if (isValidPersonName(p1) && TITLE_REGEX.test(p2)) {
        return { name: p1, title: p2 };
      }
      if (isValidPersonName(p2) && TITLE_REGEX.test(p1)) {
        return { name: p2, title: p1 };
      }
    }
    return { name: Normalizers.normalizeText(str), title: null };
  }

  /**
   * Validates whether a text string represents a legitimate professional job title
   * rather than a narrative sentence or bio paragraph.
   */
  function isValidJobTitle(text) {
    if (!text || typeof text !== "string") return false;
    const clean = Normalizers.normalizeText(text);
    if (clean.length > 70) return false;

    // Reject sentences ending with periods, question marks, or exclamation marks
    if (/[.!?]$/.test(clean)) return false;

    // Professional titles rarely exceed 7 words
    const words = clean.split(/\s+/);
    if (words.length > 7) return false;

    // Narrative bio words indicate descriptive text, not title
    if (/\b(joined|founded in|graduated|holds|brings|pioneer|serving|served|previously|experience in|career|responsible for|oversees)\b/i.test(clean)) {
      return false;
    }

    return TITLE_REGEX.test(clean);
  }

  /**
   * Validates person name syntax, preventing corporate words, buttons, or single-word noise.
   */
  function isValidPersonName(name) {
    if (!name || typeof name !== "string") return false;
    const clean = Normalizers.normalizeText(name);
    const lower = clean.toLowerCase();

    // Check non-name blacklist
    if (NON_NAME_TOKENS.has(lower)) return false;

    // Person name should typically have 2 to 4 words
    const words = clean.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;

    // Reject if contains corporate symbols or numbers
    if (/[0-9@#$%^&*()_+=\[\]{};:"\\|<>\/?]/.test(clean)) return false;

    // Check that each word starts with a capital letter (or common prefix e.g. van, de)
    const validWordPattern = /^(?:[A-ZÀ-ÖØ-ß][a-zà-öø-ÿ'.-]*|de|van|von|der|da|di|la|le|du)$/;
    for (const w of words) {
      if (!validWordPattern.test(w)) return false;
    }

    // Check if any word is a corporate suffix
    for (const w of words) {
      if (NON_NAME_TOKENS.has(w.toLowerCase())) return false;
    }

    return true;
  }

  /**
   * Deduplicates and cleans people array, merging entries for the same individual across pages.
   */
  function deduplicateAndCleanPeople(peopleList) {
    const peopleMap = new Map();

    for (const person of peopleList) {
      if (!person || !isValidPersonName(person.name)) continue;

      const normName = person.name.toLowerCase();
      if (!peopleMap.has(normName)) {
        peopleMap.set(normName, {
          name: person.name,
          title: person.title || null,
          profile_url: person.profile_url || null,
          linkedin_url: person.linkedin_url || null,
          email: person.email || null,
          phone: person.phone || null,
          confidence: person.confidence || 0.75,
          evidence: [
            {
              source: person.source,
              page_url: person.page_url,
              confidence: person.confidence,
            },
          ],
        });
      } else {
        const existing = peopleMap.get(normName);
        // Merge richer details
        if (!existing.title && person.title) existing.title = person.title;
        if (!existing.linkedin_url && person.linkedin_url) existing.linkedin_url = person.linkedin_url;
        if (!existing.profile_url && person.profile_url) existing.profile_url = person.profile_url;
        if (!existing.email && person.email) existing.email = person.email;
        if (!existing.phone && person.phone) existing.phone = person.phone;
        existing.confidence = Math.max(existing.confidence, person.confidence || 0.75);
        existing.evidence.push({
          source: person.source,
          page_url: person.page_url,
          confidence: person.confidence,
        });
      }
    }

    return Array.from(peopleMap.values());
  }

  /**
   * Merges two lists of people (e.g. across multiple crawled pages).
   */
  function mergePeople(listA = [], listB = []) {
    return deduplicateAndCleanPeople([...listA, ...listB]);
  }

  /**
   * Evaluates job title against executive seniority tiers.
   * @param {string} title
   * @returns {number} Score from 0.40 to 1.00
   */
  function scoreSeniority(title) {
    if (!title || typeof title !== "string") return 0.40;
    const lower = title.toLowerCase().trim();

    // Tier 1: Ownership, C-Suite & Top Executive Leadership (1.00)
    if (/\b(founder|co-founder|owner|co-owner|ceo|chief executive officer|president|managing director|executive director|managing partner|principal|sole proprietor)\b/.test(lower)) {
      return 1.0;
    }

    // Tier 2: Executive Leadership & Other C-Level (0.90)
    if (/\b(coo|cfo|cto|cmo|cro|cio|chief operating|chief financial|chief technology|chief marketing|chief revenue|chief information|chief medical|chief officer)\b/.test(lower)) {
      return 0.90;
    }

    // Tier 4: Vice Presidents / Heads (0.85)
    if (/\b(vice president|vp|svp|evp|head of|divisional head)\b/.test(lower)) {
      return 0.85;
    }

    // Tier 5: Directors / Partners / GMs (0.80)
    if (/\b(director|partner|general manager|practice leader|branch manager)\b/.test(lower)) {
      return 0.80;
    }

    // Tier 6: Managers / Team Leads (0.65)
    if (/\b(manager|lead|supervisor|team leader|senior)\b/.test(lower)) {
      return 0.65;
    }

    // Tier 7: Staff / Associates (0.50)
    return 0.50;
  }

  /**
   * Ranks an array of people by executive seniority score and contact richness.
   * @param {Array<Object>} peopleList
   * @returns {Array<Object>} Sorted people array with seniorityScore attached
   */
  function rankPeopleBySeniority(peopleList = []) {
    if (!Array.isArray(peopleList)) return [];

    const scored = peopleList.map((p) => {
      const copy = { ...p };
      copy.seniorityScore = typeof copy.seniorityScore === "number" ? copy.seniorityScore : scoreSeniority(copy.title);
      return copy;
    });

    return scored.sort((a, b) => {
      // 1. Primary sort: Seniority Score
      if (b.seniorityScore !== a.seniorityScore) {
        return b.seniorityScore - a.seniorityScore;
      }
      // 2. Secondary sort: Has direct email
      const aHasEmail = Boolean(a.email && a.email.trim());
      const bHasEmail = Boolean(b.email && b.email.trim());
      if (bHasEmail !== aHasEmail) return bHasEmail ? 1 : -1;

      // 3. Tertiary sort: Has LinkedIn URL
      const aHasLi = Boolean(a.linkedin_url && a.linkedin_url.trim());
      const bHasLi = Boolean(b.linkedin_url && b.linkedin_url.trim());
      if (bHasLi !== aHasLi) return bHasLi ? 1 : -1;

      // 4. Quaternary sort: General confidence
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  /**
   * Selects the highest-ranking decision maker from a list of people.
   * @param {Array<Object>} peopleList
   * @returns {Object|null} Top decision maker or null
   */
  function selectPrimaryDecisionMaker(peopleList = []) {
    const ranked = rankPeopleBySeniority(peopleList);
    return ranked.length > 0 ? ranked[0] : null;
  }

  return {
    extractPeople,
    mergePeople,
    scoreSeniority,
    rankPeopleBySeniority,
    selectPrimaryDecisionMaker,
    isValidPersonName,
    splitNameAndTitle,
    TITLE_REGEX,
  };
});
