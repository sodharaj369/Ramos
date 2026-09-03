/**
 * RAMOS Website Intelligence — Website Adapter (Targeted Intelligence Engine)
 * Master orchestrator:
 * - Single-page extraction: extractFromAcquiredPage / extractFromDocument / extractFromHtml
 * - Targeted multi-page crawling: crawlWebsite
 * - Page Acquisition -> Page Analysis -> Structured Data -> Semantic DOM ->
 *   Pattern Extraction -> Link Discovery -> Priority Crawl Queue ->
 *   Multi-Page Evidence Merging -> Canonical RAMOS Lead with Provenance.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./page-acquisition.js"),
      require("./normalizers.js"),
      require("./validators.js"),
      require("./page-analyzer.js"),
      require("./structured-data.js"),
      require("./field-extractors.js"),
      require("./crawl-policy.js"),
      require("./page-priority.js"),
      require("./link-discovery.js"),
      require("./crawl-queue.js"),
      require("./people-extractor.js"),
      require("./confidence.js"),
      require("../../shared/schema.js")
    );
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosWebsiteAdapter = factory(
      root.RamosPageAcquisition || g.RamosPageAcquisition,
      root.RamosWebsiteNormalizers || g.RamosWebsiteNormalizers,
      root.RamosWebsiteValidators || g.RamosWebsiteValidators,
      root.RamosPageAnalyzer || g.RamosPageAnalyzer,
      root.RamosStructuredData || g.RamosStructuredData,
      root.RamosFieldExtractors || g.RamosFieldExtractors,
      root.RamosCrawlPolicy || g.RamosCrawlPolicy,
      root.RamosPagePriority || g.RamosPagePriority,
      root.RamosLinkDiscovery || g.RamosLinkDiscovery,
      root.RamosCrawlQueue || g.RamosCrawlQueue,
      root.RamosPeopleExtractor || g.RamosPeopleExtractor,
      root.RamosConfidence || g.RamosConfidence,
      root.RamosSchema || root.SalesIntelSchema || g.RamosSchema || g.SalesIntelSchema
    );
    if (g && !g.RamosWebsiteAdapter) {
      g.RamosWebsiteAdapter = root.RamosWebsiteAdapter;
    }
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function (
  Acquisition,
  Normalizers,
  Validators,
  PageAnalyzer,
  StructuredData,
  FieldExtractors,
  CrawlPolicy,
  PagePriority,
  LinkDiscovery,
  CrawlQueueModule,
  PeopleExtractor,
  Confidence,
  Schema
) {
  "use strict";

  const CrawlQueue = CrawlQueueModule ? CrawlQueueModule.CrawlQueue : null;

  /**
   * Extracts raw validated field candidates from an AcquiredPage.
   * @param {Object} acquiredPage
   * @param {Object} [options]
   * @returns {{ candidates: Array<Object>, pageMeta: Object }}
   */
  function extractPageCandidates(acquiredPage, options = {}) {
    const doc = acquiredPage.document;
    const url = acquiredPage.url || "";
    const websiteDomain = Normalizers.normalizeDomain(url);

    // 1. Page Analysis
    const pageMeta = PageAnalyzer.analyzePage(acquiredPage);

    // 2. Structured Data Extraction (Tier 1 & Tier 2)
    const structuredCandidates = StructuredData.extractStructuredData(acquiredPage);

    // 3. Semantic & Pattern Extraction (Tier 3 to Tier 7)
    const fieldCandidates = FieldExtractors.extractFields(acquiredPage, options);

    // Combine raw candidates
    const allRaw = [...structuredCandidates, ...fieldCandidates];

    // Add metadata/OpenGraph candidates
    if (pageMeta.openGraph.siteName) {
      allRaw.push({
        field: "company_name",
        value: pageMeta.openGraph.siteName,
        source: "metadata",
        evidence_type: "open-graph-site-name",
        page_url: url,
        confidence: 0.90,
      });
    }

    if (pageMeta.title) {
      const cleanedTitle = cleanTitleBranding(pageMeta.title);
      if (cleanedTitle) {
        allRaw.push({
          field: "company_name",
          value: cleanedTitle,
          source: "metadata",
          evidence_type: "page-title-branding",
          page_url: url,
          confidence: 0.75,
        });
      }
    }

    if (pageMeta.metaDescription || pageMeta.openGraph.description) {
      const desc = pageMeta.metaDescription || pageMeta.openGraph.description;
      allRaw.push({
        field: "description",
        value: desc,
        source: "metadata",
        evidence_type: "meta-description",
        page_url: url,
        confidence: 0.85,
      });
    }

    // Validate & normalize
    const validated = [];
    for (const cand of allRaw) {
      const processed = processAndValidateCandidate(cand, url, websiteDomain, pageMeta.pageType);
      if (processed) {
        validated.push(processed);
      }
    }

    return {
      candidates: validated,
      pageMeta,
    };
  }

  /**
   * Single-page extraction facade.
   * @param {Object} acquiredPage
   * @param {Object} [options]
   * @returns {Object} Canonical RAMOS Lead with internal _evidence
   */
  function extractFromAcquiredPage(acquiredPage, options = {}) {
    if (!acquiredPage || !acquiredPage.document) {
      throw new Error("extractFromAcquiredPage requires a valid AcquiredPage object.");
    }

    const { candidates, pageMeta } = extractPageCandidates(acquiredPage, options);
    const people = PeopleExtractor ? PeopleExtractor.extractPeople(acquiredPage, options) : [];
    const resolved = Confidence && typeof Confidence.resolveAllCandidates === "function"
      ? Confidence.resolveAllCandidates(candidates)
      : { bestCandidates: selectBestCandidates(candidates), fieldRankings: {} };

    const lead = buildCanonicalLead(resolved.bestCandidates, acquiredPage.url, candidates, {
      pagesScanned: 1,
      pageMeta,
      people,
      fieldRankings: resolved.fieldRankings,
    });

    return lead;
  }

  /**
   * Targeted Business-Intelligence Crawler.
   * Crawls same-domain internal pages prioritized by business value (/contact, /about, /team).
   *
   * @param {string} rootUrl - Starting website URL
   * @param {Object} [options] - Crawl options
   * @param {number} [options.maxPages=10] - Max pages cap (default 10, max 20)
   * @param {number} [options.maxDepth=2] - Max crawl depth (default 2)
   * @param {boolean} [options.enableEarlyExit=true] - Stop early when key fields found
   * @param {Function} [options.onProgress] - Optional progress notification callback
   * @param {Function} pageFetcher - Async page fetcher `async (url) => AcquiredPage | null`
   * @returns {Promise<Object>} Canonical RAMOS Lead with aggregated evidence
   */
  async function crawlWebsite(rootUrl, options = {}, pageFetcher) {
    if (!rootUrl || typeof rootUrl !== "string") {
      throw new Error("crawlWebsite requires a valid rootUrl string.");
    }
    if (typeof pageFetcher !== "function") {
      throw new Error("crawlWebsite requires an asynchronous pageFetcher function.");
    }

    const normalizedRoot = Normalizers.normalizeUrl(rootUrl);
    const rootDomain = Normalizers.normalizeDomain(normalizedRoot);

    if (!rootDomain) {
      throw new Error(`Invalid root URL domain: ${rootUrl}`);
    }

    const maxPages = Math.min(Math.max(Number(options.maxPages) || 10, 1), 20);
    const maxDepth = Math.min(Math.max(Number(options.maxDepth) || 2, 1), 3);
    const enableEarlyExit = options.enableEarlyExit !== false;

    const queue = new CrawlQueue({
      maxPages,
      maxDepth,
      rootDomain,
    });

    // Enqueue root page (depth 0, highest priority)
    queue.enqueue({
      url: normalizedRoot,
      depth: 0,
      priority: 1000,
      discoveredFrom: null,
      pageIntent: "HOMEPAGE",
    });

    const allEvidence = [];
    const visitedPagesMeta = [];
    let allPeople = [];
    let stoppedEarly = false;

    while (queue.hasMore()) {
      const nextItem = queue.dequeue();
      if (!nextItem) break;

      if (typeof options.onProgress === "function") {
        options.onProgress({
          status: "scanning",
          currentUrl: nextItem.url,
          pagesScanned: queue.getVisitedCount(),
          pendingPages: queue.pending.length,
        });
      }

      let acquiredPage = null;
      try {
        acquiredPage = await pageFetcher(nextItem.url);
      } catch (err) {
        if (err && (err.message === "CRAWL_ABORTED" || err.name === "AbortError")) {
          throw err;
        }
        queue.markVisited(nextItem.url, "failed");
        continue;
      }

      if (!acquiredPage || !acquiredPage.document) {
        queue.markVisited(nextItem.url, "failed");
        continue;
      }

      // 1. Extract candidates from this page
      const { candidates, pageMeta } = extractPageCandidates(acquiredPage, options);
      visitedPagesMeta.push(pageMeta);

      // Extract people from this page
      const pagePeople = PeopleExtractor ? PeopleExtractor.extractPeople(acquiredPage, options) : [];
      if (pagePeople.length && PeopleExtractor) {
        allPeople = PeopleExtractor.mergePeople(allPeople, pagePeople);
      }

      // Tag candidates with depth and discovered intent
      candidates.forEach((cand) => {
        cand.depth = nextItem.depth;
        cand.discovered_intent = nextItem.pageIntent;
      });

      allEvidence.push(...candidates);
      queue.markVisited(nextItem.url, "completed", nextItem.pageIntent);

      // Compute current extracted state to identify missing fields
      const resolvedTemp = Confidence && typeof Confidence.resolveAllCandidates === "function"
        ? Confidence.resolveAllCandidates(allEvidence)
        : { bestCandidates: selectBestCandidates(allEvidence), fieldRankings: {} };
      const tempLead = buildCanonicalLead(resolvedTemp.bestCandidates, normalizedRoot, allEvidence, {
        pagesScanned: queue.getVisitedCount(),
        people: allPeople,
      });

      const missingFields = {
        missingEmail: !tempLead.email,
        missingPhone: !tempLead.phone,
        missingAddress: !tempLead.address && !(tempLead.city && tempLead.country),
        missingPeople: (!tempLead.people || tempLead.people.length === 0) && options.scope?.people !== false,
        missingCompany: !tempLead.company_name,
        missingSocial: !tempLead.social || Object.values(tempLead.social).every((v) => !v),
      };

      // 2. Discover internal links with field awareness
      if (nextItem.depth < maxDepth && LinkDiscovery) {
        const discovered = LinkDiscovery.discoverLinks(acquiredPage, rootDomain, nextItem.depth, missingFields);
        queue.enqueueMany(discovered);
      }

      // Dynamic queue re-ranking: prioritize remaining discovered pages according to missing fields
      queue.reorderPending(missingFields);

      // 3. Early Termination Check
      if (enableEarlyExit) {
        if (queue.canTerminateEarly(tempLead, options.scope)) {
          stoppedEarly = true;
          break;
        }
      }
    }

    // Resolve best candidates across all crawled pages using deterministic Confidence Engine
    const resolvedFinal = Confidence && typeof Confidence.resolveAllCandidates === "function"
      ? Confidence.resolveAllCandidates(allEvidence)
      : { bestCandidates: selectBestCandidates(allEvidence), fieldRankings: {} };

    const finalLead = buildCanonicalLead(resolvedFinal.bestCandidates, normalizedRoot, allEvidence, {
      pagesScanned: visitedPagesMeta.length,
      pagesBudget: queue.pagesBudget,
      stoppedEarly,
      stopReason: queue.stopReason || (stoppedEarly ? "all_requested_fields_satisfied" : (visitedPagesMeta.length >= queue.maxPages ? "budget_exhausted" : "completed")),
      visitedPagesMeta,
      queueStats: queue.getStats(),
      people: allPeople,
      fieldRankings: resolvedFinal.fieldRankings,
    });

    return finalLead;
  }

  /**
   * Helper: Cleans title string to isolate brand name.
   * Strips common page prefixes like "About", "Contact", "Welcome to", etc.
   */
  function cleanTitleBranding(title) {
    if (!title || typeof title !== "string") return "";
    let clean = title.trim();
    clean = clean.replace(/^(about|contact|welcome to|home of|meet)\s+/i, "").trim();
    const parts = clean.split(/\s*[-|–—:•]\s*/);
    if (parts.length > 1) {
      for (const part of parts) {
        const trimmedPart = part.trim().replace(/^(about|contact|welcome to|home of|meet)\s+/i, "").trim();
        if (Validators.isValidCompanyName(trimmedPart)) {
          return trimmedPart;
        }
      }
    }
    return Validators.isValidCompanyName(clean) ? clean : "";
  }

  /**
   * Normalizes, validates, and contextually weights candidate.
   */
  function processAndValidateCandidate(cand, pageUrl, websiteDomain, pageType) {
    if (!cand || cand.value == null) return null;

    let value = String(cand.value).trim();
    let confidence = typeof cand.confidence === "number" ? cand.confidence : 0.5;
    let extraMeta = {};

    // Page Context Weighting:
    // Finding contact info on a dedicated /contact page gives a contextual boost
    if (pageType === "CONTACT" && (cand.field === "email" || cand.field === "phone" || cand.field === "address")) {
      confidence = Math.min(1.0, confidence + 0.06);
    } else if (pageType === "ABOUT" && (cand.field === "company_name" || cand.field === "description")) {
      confidence = Math.min(1.0, confidence + 0.05);
    }

    switch (cand.field) {
      case "email": {
        const normalized = Normalizers.normalizeEmail(value);
        const evalResult = Validators.evaluateEmail(normalized, websiteDomain);
        if (!evalResult.isValid) return null;

        if (evalResult.classification === "business_role" || evalResult.classification === "business_individual") {
          confidence = Math.min(1.0, confidence + 0.05);
        } else if (evalResult.classification === "freemail") {
          if (cand.source !== "mailto" && cand.source !== "json-ld") {
            confidence = Math.max(0.4, confidence - 0.2);
          }
        }
        value = normalized;
        extraMeta.classification = evalResult.classification;
        break;
      }

      case "phone": {
        const normalized = Normalizers.normalizePhone(value);
        if (!Validators.isValidPhone(normalized)) return null;
        value = normalized;
        break;
      }

      case "company_name": {
        const normalized = Normalizers.normalizeText(value);
        if (!Validators.isValidCompanyName(normalized)) return null;
        value = normalized;
        break;
      }

      case "address":
      case "city":
      case "region":
      case "country":
      case "postal_code":
      case "description": {
        value = Normalizers.normalizeText(value);
        if (!value) return null;
        break;
      }

      case "linkedin":
      case "twitter_x":
      case "facebook":
      case "instagram":
      case "youtube":
      case "github": {
        const normalized = Normalizers.normalizeUrl(value);
        const platformKey = cand.field === "twitter_x" ? "twitter" : cand.field;
        if (!Validators.isSocialProfileUrl(normalized, platformKey)) return null;
        value = normalized;
        break;
      }

      case "booking_url":
      case "ordering_url":
      case "menu_url":
      case "website": {
        const normalized = Normalizers.normalizeUrl(value, pageUrl);
        if (!normalized) return null;
        value = normalized;
        break;
      }

      default:
        value = Normalizers.normalizeText(value);
        break;
    }

    const candidateObj = {
      field: cand.field,
      value,
      sourceUrl: cand.page_url || pageUrl,
      sourceType: cand.source || "unknown",
      method: cand.evidence_type || "unknown",
      pageType: pageType || "GENERIC",
      confidence,
      validated: true,
      // Backward-compatible alias properties
      page_url: cand.page_url || pageUrl,
      source: cand.source || "unknown",
      evidence_type: cand.evidence_type || "unknown",
      page_type: pageType || "GENERIC",
      ...extraMeta,
    };

    if (Confidence && typeof Confidence.computeInitialConfidence === "function") {
      candidateObj.confidence = Confidence.computeInitialConfidence(candidateObj);
    }

    if (candidateObj.confidence < 0.45) return null;
    return candidateObj;
  }

  /**
   * Selects highest confidence candidate for each field.
   */
  function selectBestCandidates(candidates) {
    const best = {};
    for (const cand of candidates) {
      const existing = best[cand.field];
      if (!existing || cand.confidence > existing.confidence) {
        best[cand.field] = cand;
      }
    }
    return best;
  }

  /**
   * Constructs the Canonical RAMOS Lead model with attached internal evidence.
   */
  function buildCanonicalLead(bestCandidates, url, allEvidence = [], meta = {}) {
    const websiteDomain = Normalizers.normalizeDomain(url);

    const lead = Schema && typeof Schema.createCanonicalLead === "function"
      ? Schema.createCanonicalLead()
      : {
          company_name: null,
          category: null,
          business_type: null,
          address: null,
          city: null,
          region: null,
          country: null,
          postal_code: null,
          phone: null,
          website: null,
          rating: null,
          review_count: null,
          opening_status: null,
          booking_url: null,
          ordering_url: null,
          menu_url: null,
          source_url: null,
          place_id: null,
          latitude: null,
          longitude: null,
          price_range: null,
          extraction_mode: "website-intelligence",
          extraction_source: "chrome-extension",
        };

    lead.extraction_mode = meta.pagesScanned && meta.pagesScanned > 1 ? "website-crawler" : "website-single-page";
    lead.source_url = url;
    lead.website = Normalizers.normalizeUrl(url);
    lead.sourceQuery = websiteDomain || url;

    if (bestCandidates.company_name) lead.company_name = bestCandidates.company_name.value;
    if (bestCandidates.phone) lead.phone = bestCandidates.phone.value;
    if (bestCandidates.email) {
      lead.email = bestCandidates.email.value;
      lead.email_status = bestCandidates.email.classification || "valid_syntax";
    } else {
      lead.email = null;
      lead.email_status = null;
    }

    if (bestCandidates.address) lead.address = bestCandidates.address.value;
    if (bestCandidates.city) lead.city = bestCandidates.city.value;
    if (bestCandidates.region) lead.region = bestCandidates.region.value;
    if (bestCandidates.country) lead.country = bestCandidates.country.value;
    if (bestCandidates.postal_code) lead.postal_code = bestCandidates.postal_code.value;
    if (bestCandidates.description) lead.category = bestCandidates.description.value;
    if (bestCandidates.booking_url) lead.booking_url = bestCandidates.booking_url.value;
    if (bestCandidates.ordering_url) lead.ordering_url = bestCandidates.ordering_url.value;
    if (bestCandidates.menu_url) lead.menu_url = bestCandidates.menu_url.value;
    if (bestCandidates.price_range) lead.price_range = bestCandidates.price_range.value;

    lead.social = {
      linkedin: bestCandidates.linkedin ? bestCandidates.linkedin.value : null,
      twitter_x: bestCandidates.twitter_x ? bestCandidates.twitter_x.value : null,
      facebook: bestCandidates.facebook ? bestCandidates.facebook.value : null,
      instagram: bestCandidates.instagram ? bestCandidates.instagram.value : null,
      youtube: bestCandidates.youtube ? bestCandidates.youtube.value : null,
      github: bestCandidates.github ? bestCandidates.github.value : null,
    };

    lead.people = Array.isArray(meta.people) ? meta.people : [];

    // ─── AGGREGATE ALL VALID CORPORATE EMAILS (Preserve All Evidence) ────────
    const employeeEmails = new Set(
      lead.people
        .map((p) => (p && p.email ? String(p.email).toLowerCase().trim() : ""))
        .filter(Boolean)
    );

    const emailMap = new Map();

    // Primary email if present and not belonging to an employee
    if (lead.email && !employeeEmails.has(lead.email.toLowerCase().trim())) {
      emailMap.set(lead.email.toLowerCase().trim(), {
        email: lead.email,
        type: lead.email_status || "business_role",
        confidence: bestCandidates.email?.confidence ?? 0.90,
        sourceUrl: bestCandidates.email?.page_url || url,
        sourceType: bestCandidates.email?.source || "mailto",
      });
    }

    const emailEvidence = (allEvidence || []).filter(
      (c) => c && c.field === "email" && c.value && (c.confidence == null || c.confidence >= 0.45)
    );

    for (const cand of emailEvidence) {
      const rawEmail = String(cand.value).trim();
      const normalized = Normalizers.normalizeEmail(rawEmail);
      const lower = normalized.toLowerCase().trim();

      if (employeeEmails.has(lower)) continue;

      const evalResult = Validators.evaluateEmail(normalized, websiteDomain);
      if (!evalResult.isValid) continue;

      const candObj = {
        email: normalized,
        type: cand.classification || evalResult.classification || "business_role",
        confidence: typeof cand.confidence === "number" ? cand.confidence : 0.70,
        sourceUrl: cand.page_url || cand.sourceUrl || url,
        sourceType: cand.source || cand.sourceType || "mailto",
      };

      if (!emailMap.has(lower)) {
        emailMap.set(lower, candObj);
      } else {
        const existing = emailMap.get(lower);
        if (candObj.confidence > existing.confidence) {
          emailMap.set(lower, candObj);
        }
      }
    }

    lead.emails = Array.from(emailMap.values()).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    if (!lead.email && lead.emails.length > 0) {
      lead.email = lead.emails[0].email;
      lead.email_status = lead.emails[0].type;
    }

    // ─── AGGREGATE ALL VALID CORPORATE PHONES (Preserve All Evidence) ────────
    const employeePhones = new Set(
      lead.people
        .map((p) => (p && p.phone ? String(p.phone).replace(/\D/g, "") : ""))
        .filter(Boolean)
    );

    const phoneMap = new Map();

    if (lead.phone) {
      const digits = lead.phone.replace(/\D/g, "");
      if (digits && !employeePhones.has(digits)) {
        phoneMap.set(digits, {
          phone: lead.phone,
          confidence: bestCandidates.phone?.confidence ?? 0.90,
          sourceUrl: bestCandidates.phone?.page_url || url,
          sourceType: bestCandidates.phone?.source || "tel",
        });
      }
    }

    const phoneEvidence = (allEvidence || []).filter(
      (c) => c && c.field === "phone" && c.value && (c.confidence == null || c.confidence >= 0.45)
    );

    for (const cand of phoneEvidence) {
      const rawPhone = String(cand.value).trim();
      const normalized = Normalizers.normalizePhone(rawPhone);
      if (!Validators.isValidPhone(normalized)) continue;

      const digits = normalized.replace(/\D/g, "");
      if (!digits || employeePhones.has(digits)) continue;

      const candObj = {
        phone: normalized,
        confidence: typeof cand.confidence === "number" ? cand.confidence : 0.70,
        sourceUrl: cand.page_url || cand.sourceUrl || url,
        sourceType: cand.source || cand.sourceType || "tel",
      };

      if (!phoneMap.has(digits)) {
        phoneMap.set(digits, candObj);
      } else {
        const existing = phoneMap.get(digits);
        if (candObj.confidence > existing.confidence) {
          phoneMap.set(digits, candObj);
        }
      }
    }

    lead.phones = Array.from(phoneMap.values()).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    if (!lead.phone && lead.phones.length > 0) {
      lead.phone = lead.phones[0].phone;
    }

    // Deterministic representation for additional values and people in existing canonical schema
    const extraEmails = lead.emails.slice(1).map((e) => e.email);
    const extraPhones = lead.phones.slice(1).map((p) => p.phone);
    const peopleList = (lead.people || []).map((p) => p.name + (p.title ? ` (${p.title})` : ""));
    const extras = [];
    if (extraEmails.length > 0) extras.push(`Additional Emails: ${extraEmails.join(", ")}`);
    if (extraPhones.length > 0) extras.push(`Additional Phones: ${extraPhones.join(", ")}`);
    if (peopleList.length > 0) extras.push(`Leadership / Team: ${peopleList.join(", ")}`);
    if (extras.length > 0 && !lead.business_type) {
      lead.business_type = extras.join(" | ");
    }

    lead._evidence = allEvidence;
    lead._fieldRankings = meta.fieldRankings || null;
    lead._crawlStats = {
      pagesScanned: meta.pagesScanned || 1,
      pagesBudget: meta.pagesBudget || meta.queueStats?.pagesBudget || meta.pagesScanned || 1,
      stoppedEarly: Boolean(meta.stoppedEarly),
      stopReason: meta.stopReason || meta.queueStats?.stopReason || (Boolean(meta.stoppedEarly) ? "all_requested_fields_satisfied" : "completed"),
      pagesSkipped: meta.queueStats?.pagesSkipped || 0,
      highValuePagesVisited: meta.queueStats?.highValuePagesVisited || 0,
      totalEvidenceCount: allEvidence.length,
      queueStats: meta.queueStats || null,
    };

    return lead;
  }

  function extractFromDocument(doc, url) {
    const acquired = Acquisition.acquireFromRenderedDom(doc, url);
    return extractFromAcquiredPage(acquired);
  }

  function extractFromHtml(htmlString, url, customParser) {
    const acquired = Acquisition.acquireFromRawHtml(htmlString, url, customParser);
    return extractFromAcquiredPage(acquired);
  }

  return {
    extractFromAcquiredPage,
    extractFromDocument,
    extractFromHtml,
    crawlWebsite,
    selectBestCandidates,
    extractPageCandidates,
  };
});
