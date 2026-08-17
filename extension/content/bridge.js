/**
 * Connection Bridge injected ONLY on authenticated Sales Intel web app origins.
 * Handshakes extension connection, stores token sessions, and guards against
 * extension context invalidations safely.
 */
(function () {
  "use strict";

  function isContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.channel !== "sales-intel-extension") return;

    if (!isContextValid()) {
      window.postMessage(
        {
          channel: "sales-intel-extension",
          type: "PONG",
          installed: false,
          connected: false,
          error: "EXTENSION_CONTEXT_INVALID",
        },
        location.origin,
      );
      return;
    }

    try {
      if (data.type === "PING") {
        chrome.runtime.sendMessage({ type: "SI_CONNECTION_STATE" }, (res) => {
          if (chrome.runtime.lastError) {
            window.postMessage(
              {
                channel: "sales-intel-extension",
                type: "PONG",
                installed: true,
                connected: false,
                error: chrome.runtime.lastError.message,
              },
              location.origin,
            );
            return;
          }
          window.postMessage(
            {
              channel: "sales-intel-extension",
              type: "PONG",
              installed: true,
              connected: Boolean(res && res.connected),
              email: (res && res.email) || null,
              apiBase: (res && res.apiBase) || null,
            },
            location.origin,
          );
        });
        return;
      }

      if (data.type === "CONNECT") {
        chrome.runtime.sendMessage(
          {
            type: "SI_CONNECT",
            session: data.session,
            apiBase: location.origin,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              window.postMessage(
                {
                  channel: "sales-intel-extension",
                  type: "CONNECTED",
                  ok: false,
                  error: chrome.runtime.lastError.message,
                },
                location.origin,
              );
              return;
            }
            window.postMessage(
              {
                channel: "sales-intel-extension",
                type: "CONNECTED",
                ok: Boolean(res && res.ok),
                error: (res && res.error) || null,
              },
              location.origin,
            );
          },
        );
        return;
      }

      if (data.type === "DISCONNECT") {
        chrome.runtime.sendMessage({ type: "SI_DISCONNECT" }, (res) => {
          if (chrome.runtime.lastError) return;
          window.postMessage(
            {
              channel: "sales-intel-extension",
              type: "DISCONNECTED",
              ok: Boolean(res && res.ok),
            },
            location.origin,
          );
        });
      }
    } catch {
      /* Context invalidation safe fallback */
    }
  });
})();
