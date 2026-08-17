/**
 * Environment detection and routing for Sales Intel Chrome Extension.
 * Ensures LOCAL users stay on localhost/127.0.0.1 and PRODUCTION users stay on Lovable app.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SalesIntelEnv = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROD_APP_URL = "https://biz-intel-tool.lovable.app";
  const DEV_APP_URL_LOCAL = "http://localhost:8080";
  const DEV_APP_URL_LOOPBACK = "http://127.0.0.1:8080";

  function isLocalExtension() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        return !manifest.update_url;
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  function resolveEnvironment(apiBase, currentUrl) {
    const candidates = [apiBase, currentUrl].filter(Boolean);
    for (const url of candidates) {
      if (url.startsWith(DEV_APP_URL_LOOPBACK)) {
        return { env: "LOCAL", origin: DEV_APP_URL_LOOPBACK };
      }
      if (url.startsWith(DEV_APP_URL_LOCAL)) {
        return { env: "LOCAL", origin: DEV_APP_URL_LOCAL };
      }
      if (url.startsWith(PROD_APP_URL)) {
        return { env: "PRODUCTION", origin: PROD_APP_URL };
      }
    }

    if (isLocalExtension()) {
      return { env: "LOCAL", origin: DEV_APP_URL_LOCAL };
    }
    return { env: "PRODUCTION", origin: PROD_APP_URL };
  }

  function getAppUrl(envObj, path) {
    const base = (envObj && envObj.origin) || DEV_APP_URL_LOCAL;
    const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
    return `${base}${cleanPath}`;
  }

  return {
    PROD_APP_URL,
    DEV_APP_URL_LOCAL,
    DEV_APP_URL_LOOPBACK,
    isLocalExtension,
    resolveEnvironment,
    getAppUrl,
  };
});
