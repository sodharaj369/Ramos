import test from "node:test";
import assert from "node:assert/strict";

interface ExtMessage {
  type: string;
  session?: any;
  apiBase?: string | null;
}

// Simulates background.js message handling logic for unit testing
function handleExternalMessage(message: ExtMessage, origin: string, connState: any) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "invalid message" };
  }

  const validOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://biz-intel-tool.lovable.app",
  ];

  if (!validOrigins.includes(origin)) {
    return { ok: false, error: "wrong origin" };
  }

  const version = "1.0.0";

  if (message.type === "SI_PING" || message.type === "SI_CONNECTION_STATE") {
    return {
      installed: true,
      version,
      connected: Boolean(connState.current),
      email: connState.current ? connState.current.email : null,
      apiBase: connState.current ? connState.current.apiBase : null,
    };
  }

  if (message.type === "SI_CONNECT") {
    if (!message.session || !message.session.access_token) {
      return { installed: true, version, ok: false, error: "Invalid session handover." };
    }
    connState.current = {
      email: message.session.email || "user@example.com",
      apiBase: message.apiBase || origin,
    };
    return { installed: true, version, ok: true };
  }

  if (message.type === "SI_DISCONNECT") {
    connState.current = null;
    return { installed: true, version, ok: true };
  }

  return { ok: false, error: "unknown message type" };
}

test("Extension Connection: PING when not connected", () => {
  const connState = { current: null };
  const res = handleExternalMessage({ type: "SI_PING" }, "http://localhost:8080", connState);
  assert.equal(res.installed, true);
  assert.equal(res.version, "1.0.0");
  assert.equal(res.connected, false);
  assert.equal(res.email, null);
});

test("Extension Connection: CONNECT flow", () => {
  const connState = { current: null };
  const connectRes = handleExternalMessage(
    {
      type: "SI_CONNECT",
      session: { access_token: "mock-access-token", email: "user@example.com" },
      apiBase: "http://localhost:8080",
    },
    "http://localhost:8080",
    connState,
  );

  assert.equal(connectRes.ok, true);
  assert.equal(connectRes.installed, true);

  const pingRes = handleExternalMessage({ type: "SI_PING" }, "http://localhost:8080", connState);
  assert.equal(pingRes.connected, true);
  assert.equal(pingRes.email, "user@example.com");
  assert.equal(pingRes.apiBase, "http://localhost:8080");
});

test("Extension Connection: DISCONNECT flow", () => {
  const connState = { current: { email: "user@example.com", apiBase: "http://localhost:8080" } };
  const disconnRes = handleExternalMessage({ type: "SI_DISCONNECT" }, "http://localhost:8080", connState);
  assert.equal(disconnRes.ok, true);

  const pingRes = handleExternalMessage({ type: "SI_PING" }, "http://localhost:8080", connState);
  assert.equal(pingRes.connected, false);
  assert.equal(pingRes.email, null);
});

test("Extension Connection: Reject invalid message or wrong origin", () => {
  const connState = { current: null };
  const badOrigin = handleExternalMessage({ type: "SI_PING" }, "http://malicious-site.com", connState);
  assert.equal(badOrigin.ok, false);
  assert.equal(badOrigin.error, "wrong origin");

  const badMsg = handleExternalMessage({ type: "" }, "http://localhost:8080", connState);
  assert.equal(badMsg.ok, false);
});

test("Extension Connection: Context Invalidation Safety Guard", () => {
  // Simulates content script checking chrome.runtime context validity
  function safeSendMessage(extId: string, msg: any): { sent: boolean; error?: string } {
    let chromeObj: any = null; // context invalidated
    try {
      if (!chromeObj || !chromeObj.runtime) {
        return { sent: false, error: "Extension context invalidated" };
      }
      return { sent: true };
    } catch {
      return { sent: false, error: "Extension context invalidated" };
    }
  }

  const result = safeSendMessage("lecchpiegelmgkgganainjdmoanjgii", { type: "SI_PING" });
  assert.equal(result.sent, false);
  assert.equal(result.error, "Extension context invalidated");
});
