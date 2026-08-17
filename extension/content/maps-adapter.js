/**
 * Forwarding adapter for backward compatibility.
 * Delegates directly to window.SalesIntelMapsAdapter.
 */
(function () {
  "use strict";

  if (typeof window !== "undefined" && window.SalesIntelMapsAdapter) {
    // Already defined by content/maps/maps-adapter.js
    return;
  }
})();
