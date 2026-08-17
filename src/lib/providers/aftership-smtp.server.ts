import {
  EmailStatus,
  VerificationResult,
} from "@/lib/domain-types";

import { EmailVerifier } from "./types";
import {
  ProviderNotConfiguredError,
  fetchWithTimeout,
  withRetry,
} from "./runtime.server";

export interface AfterShipVerifyResponse {
  email?: string;
  status?: string;
  reachable?: string;
  syntax_valid?: boolean | null;
  domain_valid?: boolean | null;
  mx_valid?: boolean | null;
  has_mx_records?: boolean | null;
  smtp_checked?: boolean | null;
  smtp_result?: string;
  catch_all?: boolean | null;
  disposable?: boolean | null;
  role_account?: boolean | null;
  confidence?: number | null;
  reason?: string;
  error?: string;
}

export const AFTERSHIP_TIMEOUT_MS = 45_000;

export function getServiceConfig() {
  const raw = process.env["EMAIL_VERIFIER_URL"] ?? process.env["EMAIL_VERIFIER_ENDPOINT"] ?? "";
  const baseUrl = raw.trim().replace(/\/+$/, "");
  const apiKey = process.env["EMAIL_VERIFIER_API_KEY"]?.trim() ?? "";
  return { baseUrl, apiKey };
}

/**
 * Product status mapping. `catch_all` is NEVER promoted to `valid`.
 */
export function mapToProductStatus(payload: AfterShipVerifyResponse): {
  status: EmailStatus;
  reason: string;
  confidence: number | null;
} {
  const errorMsg = (payload.error ?? "").toLowerCase();
  const isNetworkTimeout =
    payload.status === "unknown" ||
    errorMsg.includes("timeout") ||
    errorMsg.includes("dial tcp") ||
    errorMsg.includes("connection refused") ||
    errorMsg.includes("i/o timeout") ||
    payload.smtp_result === "host_unreachable" ||
    payload.smtp_result === "timeout";

  const SYNTAX_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  const isRegexValid = payload.email ? SYNTAX_REGEX.test(payload.email) : false;

  const syntaxExplicitlyInvalid = !isRegexValid || (payload.syntax_valid === false && !isNetworkTimeout);

  if (syntaxExplicitlyInvalid) {
    return { status: "invalid", reason: "Email address has invalid syntax.", confidence: 98 };
  }

  if (payload.domain_valid === false && !isNetworkTimeout) {
    return {
      status: "invalid",
      reason: payload.reason || "The domain does not resolve (NXDOMAIN), so it cannot receive email.",
      confidence: 90,
    };
  }

  if (payload.has_mx_records === false && payload.mx_valid === false && !isNetworkTimeout) {
    return {
      status: "invalid",
      reason: payload.reason || "Domain does not publish MX records.",
      confidence: 92,
    };
  }

  if (payload.disposable === true) {
    return {
      status: "disposable",
      reason: "The domain is a known disposable/temporary email provider.",
      confidence: 85,
    };
  }

  if (payload.role_account === true) {
    return {
      status: "role",
      reason: "This is a shared role account, not a personal mailbox.",
      confidence: 70,
    };
  }

  if (payload.catch_all === true || payload.smtp_result === "catch_all") {
    return {
      status: "catch_all",
      reason:
        "The domain accepts mail for any recipient (catch-all), so this specific mailbox cannot be confirmed.",
      confidence: 40,
    };
  }

  if (
    isNetworkTimeout ||
    !payload.smtp_checked ||
    payload.smtp_result === "not_attempted" ||
    payload.smtp_result === "host_unreachable" ||
    payload.reachable === "unknown" ||
    !payload.reachable
  ) {
    return {
      status: "unknown",
      reason:
        "DNS and MX checks passed, but SMTP verification timed out. This does not mean the email address is invalid.",
      confidence: null,
    };
  }

  if ((payload.smtp_result === "accepted" || payload.smtp_result === "deliverable") && payload.reachable === "yes") {
    return {
      status: "valid",
      reason: "The recipient mail server accepted this mailbox during an SMTP check.",
      confidence: 90,
    };
  }

  if ((payload.smtp_result === "rejected" || payload.smtp_result === "undeliverable" || payload.reachable === "no") && !isNetworkTimeout) {
    return {
      status: "invalid",
      reason: "The recipient mail server explicitly rejected this mailbox during an SMTP check.",
      confidence: 90,
    };
  }

  return {
    status: "unknown",
    reason: "DNS and MX checks passed, but SMTP verification timed out. This does not mean the email address is invalid.",
    confidence: null,
  };
}

export async function callVerifierService(email: string): Promise<AfterShipVerifyResponse> {
  const { baseUrl, apiKey } = getServiceConfig();
  if (!baseUrl) {
    throw new ProviderNotConfiguredError(
      "Free SMTP Verification",
      "Set EMAIL_VERIFIER_URL=http://localhost:8081 in process environment.",
    );
  }

  const endpoint = `${baseUrl}/verify`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const res = await withRetry(
    () =>
      fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ email }),
        },
        AFTERSHIP_TIMEOUT_MS,
      ),
    2,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Verifier service responded HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function verifyWithAfterShip(email: string): Promise<VerificationResult> {
  const normalized = email.trim().toLowerCase();
  const payload = await callVerifierService(normalized);
  const { status, reason, confidence } = mapToProductStatus(payload);

  const errorMsg = (payload.error ?? "").toLowerCase();
  const isNetworkTimeout =
    payload.status === "unknown" ||
    errorMsg.includes("timeout") ||
    errorMsg.includes("dial tcp") ||
    errorMsg.includes("connection refused") ||
    errorMsg.includes("i/o timeout") ||
    payload.smtp_result === "host_unreachable" ||
    payload.smtp_result === "timeout";

  const SYNTAX_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  const syntaxValid = payload.syntax_valid ?? (SYNTAX_REGEX.test(normalized) ? true : null);
  const domainValid = payload.domain_valid ?? (isNetworkTimeout ? (syntaxValid ? true : null) : (payload.has_mx_records ?? null));
  const mxValid = payload.mx_valid ?? payload.has_mx_records ?? (isNetworkTimeout ? (domainValid ? true : null) : null);

  return {
    email: normalized,
    status,
    reason: isNetworkTimeout
      ? "DNS and MX checks passed, but SMTP verification timed out. This does not mean the email address is invalid."
      : reason,
    confidence: confidence ?? null,
    provider: "aftership-smtp",
    syntax_valid: syntaxValid,
    domain_valid: domainValid,
    mx_valid: mxValid,
    smtp_result: isNetworkTimeout ? "host_unreachable" : payload.smtp_result ?? null,
    disposable: payload.disposable ?? null,
    role_account: payload.role_account ?? null,
    catch_all: payload.catch_all ?? null,
    metadata: {
      reachable: payload.reachable ?? "unknown",
      smtp_checked: payload.smtp_checked ?? false,
      engine: "AfterShip/email-verifier (self-hosted)",
      service_error: payload.error ?? null,
    },
  };
}

export const aftershipSmtpProvider: EmailVerifier = {
  id: "aftership-smtp",
  name: "Free SMTP Verification",
  description:
    "Self-hosted Go microservice checking syntax, DNS/MX, disposable domains, role accounts, and SMTP reachability without sending email.",
  estimatedCostPerUnit: 0,
  isConfigured: () => Boolean(getServiceConfig().baseUrl),
  configurationHint: "Set EMAIL_VERIFIER_URL=http://localhost:8081 in process environment.",
  verify: verifyWithAfterShip,
};

export async function serviceHealth(): Promise<{ ok: boolean; message: string }> {
  const { baseUrl } = getServiceConfig();
  if (!baseUrl) {
    return { ok: false, message: "EMAIL_VERIFIER_URL is not set." };
  }
  try {
    const res = await fetchWithTimeout(`${baseUrl}/health`, {}, 3000);
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const body = (await res.json()) as { status?: string };
    if (body.status === "ok") return { ok: true, message: "Service healthy" };
    return { ok: false, message: `Unexpected payload: ${JSON.stringify(body)}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Service unreachable",
    };
  }
}
