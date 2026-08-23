import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Talks to the "Sales Intel Maps Connector" Chrome extension using Chrome's
 * `externally_connectable` webpage-to-extension messaging mechanism.
 * Falls back to window.postMessage bridge if chrome.runtime is unavailable.
 *
 * Uses a unified module store so all subscriber components (AppShell, Settings, Finder)
 * maintain 100% synchronized connection state across route changes.
 */
export const DEFAULT_EXTENSION_ID = "lecchpiegelmgkgganainjdmoanjgii";
const CHANNEL = "sales-intel-extension";

export type ExtensionStatus =
  | "checking"
  | "not-installed"
  | "installed-not-connected"
  | "connected"
  | "error";

export interface ExtensionBridgeState {
  status: ExtensionStatus;
  email: string | null;
  version: string | null;
  environment: "Local" | "Production";
  lastChecked: Date | null;
  error: string | null;
  busy: boolean;
  connect: () => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

interface GlobalExtensionStore {
  status: ExtensionStatus;
  email: string | null;
  version: string | null;
  lastChecked: Date | null;
  error: string | null;
  busy: boolean;
}

let globalStore: GlobalExtensionStore = {
  status: "checking",
  email: null,
  version: null,
  lastChecked: null,
  error: null,
  busy: false,
};

const listeners = new Set<() => void>();

function updateGlobalStore(partial: Partial<GlobalExtensionStore>) {
  globalStore = { ...globalStore, ...partial };
  listeners.forEach((fn) => fn());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): GlobalExtensionStore {
  return globalStore;
}

export function getExtensionId(): string {
  if (typeof window !== "undefined" && (window as any).__SALES_INTEL_EXTENSION_ID__) {
    return (window as any).__SALES_INTEL_EXTENSION_ID__;
  }
  return import.meta.env["VITE_EXTENSION_ID"] || DEFAULT_EXTENSION_ID;
}

export function getCurrentEnvironment(): "Local" | "Production" {
  if (typeof window === "undefined") return "Local";
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" ? "Local" : "Production";
}

let isCheckPending = false;

async function performStatusCheck() {
  if (typeof window === "undefined" || isCheckPending) return;
  isCheckPending = true;

  updateGlobalStore({ status: "checking", error: null });

  const extId = getExtensionId();

  // 1. Direct Chrome webpage-to-extension messaging (externally_connectable)
  if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
    try {
      const res = await new Promise<any>((resolve) => {
        try {
          chrome.runtime.sendMessage(extId, { type: "SI_CONNECTION_STATE" }, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response || null);
            }
          });
        } catch {
          resolve(null);
        }
      });

      if (res && res.installed) {
        updateGlobalStore({
          status: res.connected ? "connected" : "installed-not-connected",
          email: res.connected ? res.email || null : null,
          version: res.version || "1.0.0",
          lastChecked: new Date(),
        });
        isCheckPending = false;
        return;
      }
    } catch {
      /* Fall through to postMessage check */
    }
  }

  // 2. Window.postMessage bridge check (fallback for injected content script)
  let resolved = false;

  const handlePong = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.type !== "PONG") return;

    resolved = true;
    window.removeEventListener("message", handlePong);
    updateGlobalStore({
      status: data.connected ? "connected" : "installed-not-connected",
      email: data.connected ? data.email || null : null,
      version: "1.0.0",
      lastChecked: new Date(),
    });
    isCheckPending = false;
  };

  window.addEventListener("message", handlePong);
  window.postMessage({ channel: CHANNEL, type: "PING" }, window.location.origin);

  setTimeout(() => {
    if (!resolved) {
      window.removeEventListener("message", handlePong);
      if (globalStore.status === "checking") {
        updateGlobalStore({
          status: "not-installed",
          lastChecked: new Date(),
        });
      }
      isCheckPending = false;
    }
  }, 600);
}

export function useExtensionBridge(): ExtensionBridgeState {
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (store.lastChecked === null && store.status === "checking") {
      void performStatusCheck();
    }
  }, [store.lastChecked, store.status]);

  const connect = useCallback(async () => {
    updateGlobalStore({ busy: true, error: null });
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        const err = "You need to be signed in to connect the extension.";
        updateGlobalStore({ busy: false, error: err });
        return { ok: false, error: err };
      }

      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        email: session.user.email,
        supabase_url: import.meta.env["VITE_SUPABASE_URL"],
        publishable_key: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      };

      const extId = getExtensionId();

      if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
        const res = await new Promise<any>((resolve) => {
          try {
            chrome.runtime.sendMessage(
              extId,
              { type: "SI_CONNECT", session: payload, apiBase: window.location.origin },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                } else {
                  resolve(response || null);
                }
              },
            );
          } catch {
            resolve(null);
          }
        });

        if (res && res.ok) {
          updateGlobalStore({
            status: "connected",
            email: session.user.email ?? null,
            version: res.version || store.version || "1.0.0",
            lastChecked: new Date(),
            busy: false,
          });
          return { ok: true };
        } else if (res && res.error) {
          updateGlobalStore({ busy: false, error: res.error });
          return { ok: false, error: res.error };
        }
      }

      // Fallback: window.postMessage
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const handleResponse = (event: MessageEvent) => {
          if (event.source !== window || event.origin !== window.location.origin) return;
          const d = event.data;
          if (!d || d.channel !== CHANNEL || d.type !== "CONNECTED") return;
          window.removeEventListener("message", handleResponse);
          if (d.ok) {
            updateGlobalStore({
              status: "connected",
              email: session.user.email ?? null,
              lastChecked: new Date(),
              busy: false,
            });
            resolve({ ok: true });
          } else {
            const errMsg = d.error || "Failed to connect extension.";
            updateGlobalStore({ busy: false, error: errMsg });
            resolve({ ok: false, error: errMsg });
          }
        };
        window.addEventListener("message", handleResponse);
        window.postMessage(
          { channel: CHANNEL, type: "CONNECT", session: payload },
          window.location.origin,
        );
        setTimeout(() => {
          window.removeEventListener("message", handleResponse);
          const timeoutErr = "Connection request timed out. Please verify extension is installed.";
          updateGlobalStore({ busy: false, error: timeoutErr });
          resolve({ ok: false, error: timeoutErr });
        }, 3000);
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed.";
      updateGlobalStore({ busy: false, error: msg });
      return { ok: false, error: msg };
    }
  }, [store.version]);

  const disconnect = useCallback(async () => {
    updateGlobalStore({ busy: true, error: null });
    const extId = getExtensionId();

    if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
      try {
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(extId, { type: "SI_DISCONNECT" }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        });
      } catch {
        /* ignore */
      }
    }

    window.postMessage({ channel: CHANNEL, type: "DISCONNECT" }, window.location.origin);

    updateGlobalStore({
      status: "installed-not-connected",
      email: null,
      lastChecked: new Date(),
      busy: false,
    });
    return { ok: true };
  }, []);

  const refresh = useCallback(async () => {
    await performStatusCheck();
  }, []);

  return {
    status: store.status,
    email: store.email,
    version: store.version,
    environment: getCurrentEnvironment(),
    lastChecked: store.lastChecked,
    error: store.error,
    busy: store.busy,
    connect,
    disconnect,
    refresh,
  };
}
