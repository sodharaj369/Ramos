/**
 * Background Service Worker for Sales Intel Chrome Extension.
 * Handles authentication handshake, token refresh, and batch lead imports.
 *
 * Connection contract (web app → extension):
 *   SI_CONNECT    { session: { access_token, refresh_token, expires_at, email, ... }, apiBase }
 *   SI_DISCONNECT {}
 *   SI_CONNECTION_STATE {}  → { installed: true, connected, email, apiBase, version }
 *   SI_GET_STATUS {}        → { ok, connected, user }
 *   SI_BATCH_IMPORT { leads[] }
 */
importScripts("shared/constants.js", "shared/environment.js", "shared/schema.js");

const EXTENSION_VERSION = "1.0.0";

const STORAGE_KEYS = {
  TOKEN: "sales_intel_token",
  USER: "sales_intel_user",
  API_BASE: "sales_intel_api_base",
};

async function getAuthData() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.USER,
    STORAGE_KEYS.API_BASE,
  ]);
  return {
    token: data[STORAGE_KEYS.TOKEN] || null,
    user: data[STORAGE_KEYS.USER] || null,
    apiBase: data[STORAGE_KEYS.API_BASE] || null,
  };
}

async function setAuthData(token, user, apiBase) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.TOKEN]: token || null,
    [STORAGE_KEYS.USER]: user || null,
    [STORAGE_KEYS.API_BASE]: apiBase || null,
  });
}

async function clearAuth() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.USER,
    STORAGE_KEYS.API_BASE,
  ]);
}

function resolveApiBase(apiBase) {
  if (!apiBase) {
    // Use environment detection from shared/environment.js (SalesIntelEnv)
    if (self.SalesIntelEnv) {
      const detected = self.SalesIntelEnv.resolveEnvironment(null, null);
      return detected.origin;
    }
    return "http://localhost:8080";
  }
  return apiBase;
}

async function sendBatchImportToBackend(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    return { ok: false, error: "No leads provided for import." };
  }

  const { token, apiBase } = await getAuthData();
  const base = resolveApiBase(apiBase);
  const endpoint = `${base}/api/public/extension/import`;

  const importPayloads = leads.map((lead) => {
    return self.SalesIntelSchema ? self.SalesIntelSchema.toBackendImportPayload(lead) : lead;
  });

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ leads: importPayloads }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || errJson.message || `HTTP error ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, imported: data.created || data.processed || importPayloads.length, data };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Network error" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  // --- SI_CONNECT ---
  // Sent by bridge.js (window.postMessage path) and by web app directly.
  // Payload: { type: "SI_CONNECT", session: { access_token, email, ... }, apiBase }
  if (message.type === "SI_CONNECT") {
    const session = message.session || {};
    const token = session.access_token || message.token || null;
    const email = session.email || message.email || null;
    const apiBase = message.apiBase || null;
    setAuthData(token, email, apiBase).then(() => {
      console.log("[SI][CONNECTION] Connected:", email, "via", apiBase);
      sendResponse({ ok: true, connected: true, version: EXTENSION_VERSION });
    });
    return true;
  }

  // --- SI_DISCONNECT ---
  if (message.type === "SI_DISCONNECT") {
    clearAuth().then(() => {
      console.log("[SI][CONNECTION] Disconnected");
      sendResponse({ ok: true, connected: false });
    });
    return true;
  }

  // --- SI_CONNECTION_STATE ---
  // Called by bridge.js / web app to check if extension is installed and connected.
  if (message.type === "SI_CONNECTION_STATE") {
    getAuthData().then(({ token, user, apiBase }) => {
      sendResponse({
        installed: true,
        connected: Boolean(token),
        email: user || null,
        apiBase: apiBase || null,
        version: EXTENSION_VERSION,
      });
    });
    return true;
  }

  // --- SI_GET_STATUS ---
  // Called by popup.js to populate the connection banner.
  if (message.type === "SI_GET_STATUS") {
    getAuthData().then(({ token, user, apiBase }) => {
      sendResponse({
        ok: true,
        connected: Boolean(token),
        user: user || (token ? "Connected User" : null),
        apiBase: apiBase || null,
      });
    });
    return true;
  }

  // --- SI_BATCH_IMPORT ---
  if (message.type === "SI_BATCH_IMPORT") {
    sendBatchImportToBackend(message.leads).then(sendResponse);
    return true;
  }

  return undefined;
});
