import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Talks to the "Sales Intel Maps Connector" Chrome extension using Chrome's
 * `externally_connectable` webpage-to-extension messaging mechanism.
 * Falls back to window.postMessage bridge if chrome.runtime is unavailable.
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

export function useExtensionBridge(): ExtensionBridgeState {
  const [status, setStatus] = useState<ExtensionStatus>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    setStatus("checking");
    setError(null);

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
          setVersion(res.version || "1.0.0");
          setLastChecked(new Date());
          if (res.connected) {
            setStatus("connected");
            setEmail(res.email || null);
          } else {
            setStatus("installed-not-connected");
            setEmail(null);
          }
          return;
        }
      } catch {
        // Fall through to window.postMessage check if direct message fails
      }
    }

    // 2. Window.postMessage bridge check (fallback for injected content script)
    const handlePong = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL || data.type !== "PONG") return;

      window.removeEventListener("message", handlePong);
      setLastChecked(new Date());
      setVersion("1.0.0");

      if (data.connected) {
        setStatus("connected");
        setEmail(data.email || null);
      } else {
        setStatus("installed-not-connected");
        setEmail(null);
      }
    };

    window.addEventListener("message", handlePong);
    window.postMessage({ channel: CHANNEL, type: "PING" }, window.location.origin);

    setTimeout(() => {
      window.removeEventListener("message", handlePong);
      setStatus((s) => {
        if (s === "checking") {
          setLastChecked(new Date());
          return "not-installed";
        }
        return s;
      });
    }, 600);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        setBusy(false);
        const err = "You need to be signed in to connect the extension.";
        setError(err);
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
          setStatus("connected");
          setEmail(session.user.email ?? null);
          if (res.version) setVersion(res.version);
          setLastChecked(new Date());
          setBusy(false);
          return { ok: true };
        } else if (res && res.error) {
          setBusy(false);
          setError(res.error);
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
            setStatus("connected");
            setEmail(session.user.email ?? null);
            setLastChecked(new Date());
            resolve({ ok: true });
          } else {
            const errMsg = d.error || "Failed to connect extension.";
            setError(errMsg);
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
          resolve({ ok: false, error: "Connection request timed out. Please verify extension is installed." });
        }, 3000);
      });

      setBusy(false);
      return result;
    } catch (err) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "Connection failed.";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
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

    // Always attempt window message as well
    window.postMessage({ channel: CHANNEL, type: "DISCONNECT" }, window.location.origin);

    // Immediately update UI to disconnected
    setStatus("installed-not-connected");
    setEmail(null);
    setLastChecked(new Date());
    setBusy(false);
    return { ok: true };
  }, []);

  return {
    status,
    email,
    version,
    environment: getCurrentEnvironment(),
    lastChecked,
    error,
    busy,
    connect,
    disconnect,
    refresh: checkStatus,
  };
}
