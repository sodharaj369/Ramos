/**
 * RAMOS Website Intelligence — Crawl Queue
 * Dynamic, deduplicating priority crawl queue.
 * Enforces dynamic re-ranking, crawl budget, skip counting, and field-aware early termination.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./page-priority.js"));
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosCrawlQueue = factory(root.RamosPagePriority || g.RamosPagePriority);
    if (g && !g.RamosCrawlQueue) g.RamosCrawlQueue = root.RamosCrawlQueue;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function (PagePriority) {
  "use strict";

  /**
   * Dynamic Priority Crawl Queue for a single website extraction session.
   */
  class CrawlQueue {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxPages=10] - Hard page budget ceiling (1, 5, 10, or 20)
     * @param {number} [options.maxDepth=2] - Max hops from root (default 2)
     * @param {string} [options.rootDomain] - Domain boundary
     */
    constructor(options = {}) {
      this.maxPages = Math.min(Math.max(Number(options.maxPages) || 10, 1), 20);
      this.pagesBudget = this.maxPages;
      this.maxDepth = Math.min(Math.max(Number(options.maxDepth) || 2, 1), 3);
      this.rootDomain = (options.rootDomain || "").toLowerCase().replace(/^www\./, "").trim();

      this.pending = []; // Array of { url, depth, priority, discoveredFrom, pageIntent, containerTag, anchorText, status }
      this.visited = new Map(); // url -> { depth, visitedAt, status, pageIntent }
      this.queuedUrls = new Set(); // url set for O(1) deduplication

      this.pagesSkipped = 0;
      this.highValuePagesVisited = 0;
      this.stoppedEarly = false;
      this.stopReason = null;
    }

    /**
     * Enqueues an initial root page or discovered child link.
     * Rejects utility/legal paths that would waste crawl budget.
     * @param {Object} item - { url, depth, priority, discoveredFrom, pageIntent, containerTag, anchorText }
     * @returns {boolean} Whether item was added
     */
    enqueue(item) {
      if (!item || !item.url) return false;

      const url = item.url.trim();

      // Check depth limit
      const depth = typeof item.depth === "number" ? item.depth : 0;
      if (depth > this.maxDepth) {
        return false;
      }

      // Check duplicate
      if (this.queuedUrls.has(url) || this.visited.has(url)) {
        return false;
      }

      // Do NOT waste crawl budget on utility/legal paths
      const priority = typeof item.priority === "number" ? item.priority : 0;
      if (priority <= -40) {
        this.pagesSkipped++;
        return false;
      }

      // Check total page ceiling
      if (this.visited.size >= this.maxPages) {
        return false;
      }

      const queueItem = {
        url,
        depth,
        priority,
        discoveredFrom: item.discoveredFrom || null,
        pageIntent: item.pageIntent || "GENERIC",
        containerTag: item.containerTag || "",
        anchorText: item.anchorText || "",
        status: "pending",
      };

      this.queuedUrls.add(url);
      this.pending.push(queueItem);

      // Sort pending descending by priority
      this.pending.sort((a, b) => b.priority - a.priority);

      return true;
    }

    /**
     * Enqueues an array of discovered links.
     * @param {Array<Object>} items
     * @returns {number} Number of items accepted
     */
    enqueueMany(items) {
      if (!Array.isArray(items)) return 0;
      let count = 0;
      for (const item of items) {
        if (this.enqueue(item)) count++;
      }
      return count;
    }

    /**
     * Dynamically recalculates the priority of all pending queue items
     * based on currently unsatisfied fields, then re-sorts descending.
     * @param {Object} missingFields - { missingEmail, missingPhone, missingAddress, missingPeople, missingCompany, missingSocial }
     */
    reorderPending(missingFields) {
      if (!PagePriority || typeof PagePriority.scoreLink !== "function") return;
      if (!this.pending.length) return;

      for (const item of this.pending) {
        const res = PagePriority.scoreLink(
          item.url,
          item.anchorText || "",
          item.depth || 1,
          item.containerTag || "",
          missingFields
        );
        item.priority = res.score;
        item.pageIntent = res.pageIntent;
      }

      // Re-sort pending descending by new dynamic priority
      this.pending.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Retrieves the highest priority unvisited page from the queue.
     * @returns {Object|null}
     */
    dequeue() {
      if (this.pending.length === 0 || this.visited.size >= this.maxPages) {
        return null;
      }
      const next = this.pending.shift();
      if (!next) return null;

      next.status = "in_progress";
      return next;
    }

    /**
     * Marks a URL as completed, failed, or skipped, tracking high-value visits.
     * @param {string} url
     * @param {"completed"|"failed"|"skipped"} [status="completed"]
     * @param {string} [pageIntent="GENERIC"]
     */
    markVisited(url, status = "completed", pageIntent = "GENERIC") {
      if (!url) return;
      this.visited.set(url, {
        status,
        pageIntent,
        visitedAt: Date.now(),
      });

      if (status === "completed" && ["CONTACT", "TEAM", "ABOUT", "LOCATION"].includes(pageIntent)) {
        this.highValuePagesVisited++;
      }
    }

    /**
     * Checks if more pages can be visited within the allocated budget.
     * @returns {boolean}
     */
    hasMore() {
      return this.pending.length > 0 && this.visited.size < this.maxPages;
    }

    /**
     * Returns total visited page count.
     * @returns {number}
     */
    getVisitedCount() {
      return this.visited.size;
    }

    /**
     * Evaluates whether essential business intelligence fields have sufficiently
     * strong evidence, permitting early termination without wasting remaining budget.
     *
     * @param {Object} currentLead - Aggregated canonical lead so far
     * @param {Object} [scope={}] - Target extraction scope
     * @returns {{ canStop: boolean, reason?: string }}
     */
    canTerminateEarly(currentLead, scope = {}) {
      if (!currentLead || this.visited.size < 2) {
        return false;
      }

      const hasCompany = Boolean(currentLead.company_name);
      const hasEmail = Boolean(currentLead.email);
      const hasPhone = Boolean(currentLead.phone);
      const hasLocation = Boolean(currentLead.address || (currentLead.city && currentLead.country));

      const wantsPeople = scope.people !== false;
      const hasPeople = !wantsPeople || (Array.isArray(currentLead.people) && currentLead.people.length > 0);

      // Early stop condition 1: All primary target fields are satisfied
      if (hasCompany && hasEmail && hasPhone && hasLocation && hasPeople) {
        this.stoppedEarly = true;
        this.stopReason = "all_requested_fields_satisfied";
        return true;
      }

      // Early stop condition 2: No high-value pages remain in pending queue and key contacts already acquired
      if (this.pending.length > 0) {
        const hasPendingHighValue = this.pending.some((p) => p.priority >= 40);
        if (!hasPendingHighValue && hasCompany && hasEmail && hasPhone) {
          this.stoppedEarly = true;
          this.stopReason = "no_more_relevant_pages";
          return true;
        }
      }

      return false;
    }

    /**
     * Returns transparent crawl statistics summary.
     */
    getStats() {
      return {
        pagesScanned: this.visited.size,
        pagesBudget: this.pagesBudget,
        stoppedEarly: this.stoppedEarly,
        stopReason: this.stopReason || (this.visited.size >= this.maxPages ? "budget_exhausted" : "completed"),
        pagesSkipped: this.pagesSkipped,
        highValuePagesVisited: this.highValuePagesVisited,
        pendingCount: this.pending.length,
      };
    }
  }

  return {
    CrawlQueue,
  };
});
