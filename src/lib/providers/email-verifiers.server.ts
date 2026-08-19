/**
 * Pluggable Email Verifier architecture.
 *
 * Add a verifier by implementing EmailVerifier and registering it below.
 * Results are always honest: a verifier never reports "valid" for a check it
 * could not actually perform.
 */
import type { ProviderDescriptor, VerificationResult } from "@/lib/domain-types";
import {
  ProviderNotConfiguredError,
  ProviderUnavailableError,
  fetchWithTimeout,
  withRetry,
} from "./runtime.server";
import { getServiceConfig, verifyWithAfterShip } from "./aftership-smtp.server";

export interface EmailVerifier {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  estimatedCostPerUnit?: number | null;
  configurationHint?: string;
  /** Bounded concurrency for bulk jobs (keeps simultaneous SMTP sessions low). */
  maxConcurrency?: number;
  isConfigured(): boolean;
  verify(email: string): Promise<VerificationResult>;
}

const SYNTAX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
]);

const ROLE_PREFIXES = new Set([
  "info",
  "admin",
  "support",
  "sales",
  "contact",
  "hello",
  "office",
  "enquiries",
  "inquiries",
  "billing",
  "accounts",
  "help",
  "team",
  "marketing",
  "noreply",
  "no-reply",
  "postmaster",
  "webmaster",
]);

async function dnsQuery(name: string, type: "MX" | "A"): Promise<unknown[]> {
  const res = await fetchWithTimeout(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new ProviderUnavailableError(`DNS lookup failed (${res.status})`);
  const json = (await res.json()) as { Answer?: unknown[] };
  return json.Answer ?? [];
}

/**
 * Built-in verifier: syntax, DNS/MX, disposable and role checks.
 * SMTP mailbox probing is NOT possible from this runtime, so mailbox
 * existence is reported as unknown rather than guessed.
 */
const builtinVerifier: EmailVerifier = {
  id: "builtin-dns",
  name: "Free DNS Verification",
  description:
    "Checks syntax, domain resolution, MX records, disposable domains and role accounts. Cannot probe SMTP mailboxes.",
  capabilities: ["syntax", "domain", "mx", "disposable", "role account"],
  estimatedCostPerUnit: 0,
  isConfigured() {
    return true;
  },
  async verify(email) {
    const normalized = email.trim().toLowerCase();
    const syntaxValid = SYNTAX.test(normalized);
    const base: VerificationResult = {
      email: normalized,
      status: "unknown",
      reason: "",
      confidence: 0,
      provider: this.id,
      syntax_valid: syntaxValid,
      domain_valid: null,
      mx_valid: null,
      smtp_result: null,
      disposable: null,
      role_account: null,
      catch_all: null,
    };

    if (!syntaxValid) {
      return { ...base, status: "invalid", reason: "Email address is not syntactically valid.", confidence: 95 };
    }

    const [local, domain] = normalized.split("@") as [string, string];
    const roleAccount = ROLE_PREFIXES.has(local);
    const disposable = DISPOSABLE_DOMAINS.has(domain);

    let mxRecords: unknown[] = [];
    let aRecords: unknown[] = [];
    try {
      mxRecords = await withRetry(() => dnsQuery(domain, "MX"));
      if (mxRecords.length === 0) aRecords = await withRetry(() => dnsQuery(domain, "A"));
    } catch {
      return {
        ...base,
        disposable,
        role_account: roleAccount,
        status: "unknown",
        reason: "DNS lookup failed, so the domain could not be checked. Try again later.",
        confidence: 0,
      };
    }

    const mxValid = mxRecords.length > 0;
    const domainValid = mxValid || aRecords.length > 0;

    if (!domainValid) {
      return {
        ...base,
        domain_valid: false,
        mx_valid: false,
        disposable,
        role_account: roleAccount,
        status: "invalid",
        reason: "The domain does not resolve, so it cannot receive email.",
        confidence: 90,
      };
    }
    if (!mxValid) {
      return {
        ...base,
        domain_valid: true,
        mx_valid: false,
        disposable,
        role_account: roleAccount,
        status: "invalid",
        reason: "The domain resolves but publishes no MX records, so it cannot accept email.",
        confidence: 80,
      };
    }
    if (disposable) {
      return {
        ...base,
        domain_valid: true,
        mx_valid: true,
        disposable: true,
        role_account: roleAccount,
        status: "disposable",
        reason: "The domain is a known disposable/temporary email provider.",
        confidence: 75,
      };
    }

    return {
      ...base,
      domain_valid: true,
      mx_valid: true,
      disposable: false,
      role_account: roleAccount,
      smtp_result: "not_attempted",
      status: roleAccount ? "role" : "unknown",
      reason: roleAccount
        ? "Syntax, domain and MX are valid, but this is a shared role account (not a person). SMTP verification could not establish mailbox existence."
        : "Syntax, domain and MX are valid. SMTP verification could not establish mailbox existence, so deliverability is not confirmed.",
      confidence: roleAccount ? 45 : 55,
      metadata: { mx_record_count: mxRecords.length },
    };
  },
};

/**
 * Free SMTP Verification — self-hosted Go service (email-verifier-service/)
 * wrapping the MIT-licensed AfterShip/email-verifier library.
 * Performs DNS + MX + SMTP RCPT probing. Never sends email, never uses a paid API.
 */
const aftershipSmtpVerifier: EmailVerifier = {
  id: "aftership-smtp",
  name: "Free SMTP Verification",
  description:
    "Self-hosted open-source verifier (AfterShip/email-verifier): syntax, DNS, MX, disposable, role and a real SMTP mailbox probe. Catch-all domains are reported as catch-all, never valid.",
  capabilities: ["syntax", "domain", "mx", "smtp", "catch-all", "disposable", "role account"],
  estimatedCostPerUnit: 0,
  maxConcurrency: 2,
  configurationHint:
    "Deploy email-verifier-service/ on a host with outbound SMTP port 25 and set the EMAIL_VERIFIER_URL secret (plus EMAIL_VERIFIER_API_KEY if the service requires one).",
  isConfigured() {
    return Boolean(getServiceConfig().baseUrl);
  },
  verify(email) {
    return verifyWithAfterShip(email);
  },
};

const VERIFIERS: EmailVerifier[] = [aftershipSmtpVerifier, builtinVerifier];

export function listEmailVerifiers(): ProviderDescriptor[] {
  return VERIFIERS.map((verifier) => ({
    id: verifier.id,
    name: verifier.name,
    kind: "email_verifier" as const,
    description: verifier.description,
    configured: verifier.isConfigured(),
    configurationHint: verifier.configurationHint,
    capabilities: verifier.capabilities,
    estimatedCostPerUnit: verifier.estimatedCostPerUnit ?? null,
  }));
}

/** Preferred verifier: the first configured one (external before built-in). */
export function getEmailVerifier(id?: string | null): EmailVerifier {
  if (id) {
    const found = VERIFIERS.find((v) => v.id === id);
    if (!found) throw new ProviderNotConfiguredError(`Verifier "${id}"`, "Unknown verifier.");
    if (!found.isConfigured()) {
      throw new ProviderNotConfiguredError(found.name, "Verifier is currently disabled or unconfigured.");
    }
    return found;
  }
  const configured = VERIFIERS.find((v) => v.isConfigured());
  if (!configured) throw new ProviderNotConfiguredError("Email verification", "No verifier configured or active.");
  return configured;
}
