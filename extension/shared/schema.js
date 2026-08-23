/**
 * Canonical Schema for RAMOS Standalone Chrome Extension.
 * Defines authoritative lead model structure for Google Maps business extraction.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RamosSchema = factory();
    root.SalesIntelSchema = root.RamosSchema; // Alias for backward compatibility during migration
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createCanonicalLead() {
    return {
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
      extraction_mode: "result-card", // "result-card" | "detail-panel"
      extraction_source: "chrome-extension",
    };
  }

  return {
    createCanonicalLead,
  };
});
