/**
 * Canonical Schema and Backend Contract Adapter for Sales Intel Chrome Extension.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelSchema = factory();
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

  function toBackendImportPayload(canonicalLead) {
    if (!canonicalLead) return null;

    return {
      company_name: canonicalLead.company_name,
      category: canonicalLead.category || canonicalLead.business_type || null,
      business_type: canonicalLead.business_type || canonicalLead.category || null,
      phone: canonicalLead.phone || null,
      website: canonicalLead.website || null,
      address: canonicalLead.address || null,
      city: canonicalLead.city || null,
      region: canonicalLead.region || null,
      country: canonicalLead.country || null,
      postal_code: canonicalLead.postal_code != null ? String(canonicalLead.postal_code) : null,
      rating: typeof canonicalLead.rating === "number" && Number.isFinite(canonicalLead.rating) ? canonicalLead.rating : null,
      review_count: typeof canonicalLead.review_count === "number" && Number.isFinite(canonicalLead.review_count) ? canonicalLead.review_count : null,
      opening_status: canonicalLead.opening_status || null,
      opening_hours: canonicalLead.opening_status || null,
      source_url: canonicalLead.source_url || null,
      place_id: canonicalLead.place_id || null,
      latitude: typeof canonicalLead.latitude === "number" && Number.isFinite(canonicalLead.latitude) ? canonicalLead.latitude : null,
      longitude: typeof canonicalLead.longitude === "number" && Number.isFinite(canonicalLead.longitude) ? canonicalLead.longitude : null,
      price_range: canonicalLead.price_range || null,
      menu: canonicalLead.menu_url || null,
      ordering_url: canonicalLead.ordering_url || null,
      booking_url: canonicalLead.booking_url || null,
      extraction_source: canonicalLead.extraction_mode || "result-card",
    };
  }

  return {
    createCanonicalLead,
    toBackendImportPayload,
  };
});
