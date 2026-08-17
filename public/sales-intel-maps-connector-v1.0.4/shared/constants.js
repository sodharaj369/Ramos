/**
 * Shared constants and definitions for Sales Intel Chrome Extension.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelConstants = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EXTRACTION_MODES = {
    RESULT_CARD: "result-card",
    DETAIL_PANEL: "detail-panel",
  };

  const ERROR_CODES = {
    NO_MAPS_PAGE: "NO_MAPS_PAGE",
    NO_SEARCH_RESULTS: "NO_SEARCH_RESULTS",
    NO_DETAIL_PANEL: "NO_DETAIL_PANEL",
    EXTRACTION_FAILED: "EXTRACTION_FAILED",
    INVALID_LEAD: "INVALID_LEAD",
    DUPLICATE_LEAD: "DUPLICATE_LEAD",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
    EXTENSION_CONTEXT_INVALID: "EXTENSION_CONTEXT_INVALID",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
  };

  const HARD_MAX_RESULTS = 50;

  return {
    EXTRACTION_MODES,
    ERROR_CODES,
    HARD_MAX_RESULTS,
  };
});
