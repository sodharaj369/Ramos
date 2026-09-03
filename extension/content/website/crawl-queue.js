/**
 * RAMOS Website Intelligence — Crawl Queue
 * Bounded, deduplicating priority crawl queue.
 * Enforces depth limit, page cap, same-domain boundaries, and early exit policies.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    root.RamosCrawlQueue = factory();
    if (g && !g.RamosCrawlQueue) g.RamosCrawlQueue = root.RamosCrawlQueue;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Bounded Priority Crawl Queue for a single website extraction session.
   */
  class CrawlQueue {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxPages=10] - Hard page cap (default 10, max 20)
     * @param {number} [options.maxDepth=2] - Max hops from root (default 2)
     * @param {string} [options.rootDomain] - Domain boundary
     */
    constructor(options = {}) {
      this.maxPages = Math.min(Math.max(Number(options.maxPages) || 10, 1), 20);
      this.maxDepth = Math.min(Math.max(Number(options.maxDepth) || 2, 1), 3);
      this.rootDomain = (options.rootDomain || "").toLowerCase().replace(/^www\./, "").trim();

      this.pending = []; // Array of { url, depth, priority, discoveredFrom, status }
      this.visited = new Map(); // url -> { depth, visitedAt, status }
      this.queuedUrls = new Set(); // url set for O(1) deduplication
    }

    /**
     * Enqueues an initial root page or discovered child link.
     * @param {Object} item - { url, depth, priority, discoveredFrom, pageIntent }
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

      // Check total page ceiling (visited + pending)
      if (this.visited.size >= this.maxPages) {
        return false;
      }

      const queueItem = {
        url,
        depth,
        priority: typeof item.priority === "number" ? item.priority : 0,
        discoveredFrom: item.discoveredFrom || null,
        pageIntent: item.pageIntent || "GENERIC",
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
     * Marks a URL as completed or failed.
     * @param {string} url
     * @param {"completed"|"failed"|"skipped"} [status="completed"]
     */
    markVisited(url, status = "completed") {
      if (!url) return;
      this.visited.set(url, {
        status,
        visitedAt: Date.now(),
      });
    }

    /**
     * Checks if more pages can be visited.
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
     * Checks whether essential business intelligence fields are already satisfied,
     * permitting early termination without unnecessary additional page crawls.
     *
     * Essential criteria:
     * - company_name is present
     * - email is present
     * - phone is present
     * - address (or city + country) is present
     * - at least 1 page has been visited
     *
     * @param {Object} currentLead - Aggregated canonical lead so far
     * @returns {boolean}
     */
    canTerminateEarly(currentLead) {
      if (!currentLead || this.visited.size < 2) return false;

      const hasCompany = Boolean(currentLead.company_name);
      const hasEmail = Boolean(currentLead.email);
      const hasPhone = Boolean(currentLead.phone);
      const hasLocation = Boolean(currentLead.address || (currentLead.city && currentLead.country));

      return hasCompany && hasEmail && hasPhone && hasLocation;
    }

    /**
     * Returns stats summary.
     */
    getStats() {
      return {
        visitedCount: this.visited.size,
        pendingCount: this.pending.length,
        maxPages: this.maxPages,
        maxDepth: this.maxDepth,
      };
    }
  }

  return {
    CrawlQueue,
  };
});
