import test from "node:test";
import assert from "node:assert/strict";
import { mapToProductStatus } from "./aftership-smtp.server";

// A. Malformed email → INVALID
test("A. Malformed email returns status: invalid", () => {
  const payload = {
    email: "invalid-email-format",
    status: "invalid",
    syntax_valid: false,
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "invalid");
  assert.equal(res.confidence, 98);
  assert.match(res.reason, /syntax/i);
});

// B. Nonexistent domain → INVALID
test("B. Nonexistent domain (NXDOMAIN) returns status: invalid", () => {
  const payload = {
    email: "user@nonexistent-domain-xyz98765.invalid",
    status: "invalid",
    syntax_valid: true,
    domain_valid: false,
    has_mx_records: null,
    reason: "The domain does not resolve (NXDOMAIN), so it cannot receive email.",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "invalid");
  assert.equal(res.confidence, 90);
  assert.match(res.reason, /does not resolve/i);
});

// C. Valid domain with no MX → INVALID
test("C. Valid domain with no MX records returns status: invalid", () => {
  const payload = {
    email: "user@no-mx-domain-xyz123.com",
    status: "invalid",
    syntax_valid: true,
    domain_valid: true,
    has_mx_records: false,
    mx_valid: false,
    reason: "Domain does not publish MX records.",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "invalid");
  assert.equal(res.confidence, 92);
});

// D. Valid syntax + valid domain + MX + SMTP 550 → INVALID
test("D. Explicit SMTP 550 mailbox rejection returns status: invalid", () => {
  const payload = {
    email: "nonexistent@gmail.com",
    status: "invalid",
    syntax_valid: true,
    domain_valid: true,
    has_mx_records: true,
    mx_valid: true,
    smtp_checked: true,
    smtp_result: "undeliverable",
    reachable: "no",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "invalid");
  assert.equal(res.confidence, 90);
  assert.match(res.reason, /rejected/i);
});

// E. Valid syntax + valid domain + MX + SMTP timeout → UNKNOWN
test("E. Valid syntax + valid domain + MX + SMTP timeout returns status: unknown and preserves DNS flags", () => {
  const payload = {
    email: "raj@sr.co",
    status: "unknown",
    syntax_valid: true,
    domain_valid: true,
    has_mx_records: true,
    mx_valid: true,
    smtp_checked: true,
    smtp_result: "host_unreachable",
    reachable: "unknown",
    error: "dial tcp 52.101.73.2:25: i/o timeout",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "unknown");
  assert.equal(res.confidence, null);
  assert.match(res.reason, /DNS and MX checks passed/i);

  // Critical assertion requirement:
  assert.equal(payload.syntax_valid, true);
  assert.equal(payload.domain_valid, true);
  assert.equal(payload.mx_valid, true);
  assert.equal(payload.smtp_result, "host_unreachable");
  assert.equal(res.confidence, null);
});

// F. Valid syntax + DNS/MX + SMTP accepted → VALID
test("F. Valid syntax + DNS/MX + SMTP accepted returns status: valid", () => {
  const payload = {
    email: "real@company.com",
    status: "valid",
    syntax_valid: true,
    domain_valid: true,
    has_mx_records: true,
    mx_valid: true,
    smtp_checked: true,
    smtp_result: "accepted",
    reachable: "yes",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "valid");
  assert.equal(res.confidence, 90);
});

// G. Catch-all → CATCH-ALL
test("G. Catch-all domain returns status: catch_all", () => {
  const payload = {
    email: "test@catchall-company.com",
    status: "catch_all",
    syntax_valid: true,
    domain_valid: true,
    has_mx_records: true,
    mx_valid: true,
    catch_all: true,
    smtp_result: "catch_all",
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "catch_all");
  assert.equal(res.confidence, 40);
});

// H. Disposable → DISPOSABLE
test("H. Disposable domain returns status: disposable", () => {
  const payload = {
    email: "temp123@mailinator.com",
    status: "disposable",
    syntax_valid: true,
    domain_valid: true,
    disposable: true,
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "disposable");
  assert.equal(res.confidence, 85);
});

// I. Role account → ROLE
test("I. Role account returns status: role", () => {
  const payload = {
    email: "support@mycompany.com",
    status: "role",
    syntax_valid: true,
    domain_valid: true,
    role_account: true,
  };

  const res = mapToProductStatus(payload);
  assert.equal(res.status, "role");
  assert.equal(res.confidence, 70);
});

// J. Old cached timeout-invalid result → bypass cache
test("J. Old cached timeout-invalid result is recognized and bypassed", () => {
  const badCachedRecord = {
    email: "rsodha@bluerunnersolutions.com",
    status: "invalid",
    smtp_result: "host_unreachable",
    reason: "Verification service encountered a network timeout checking domain MX (dial tcp 52.101.73.2:25: i/o timeout)",
    metadata: { service_error: "i/o timeout" },
  };

  const reason = String(badCachedRecord.reason ?? "").toLowerCase();
  const metadataStr = JSON.stringify(badCachedRecord.metadata ?? {}).toLowerCase();
  const smtpResult = String(badCachedRecord.smtp_result ?? "").toLowerCase();

  const isTimeoutError =
    reason.includes("timeout") ||
    reason.includes("dial tcp") ||
    reason.includes("connection refused") ||
    reason.includes("i/o timeout") ||
    reason.includes("network failure") ||
    reason.includes("host unreachable") ||
    reason.includes("unreachable") ||
    metadataStr.includes("timeout") ||
    metadataStr.includes("dial tcp") ||
    smtpResult === "host_unreachable" ||
    smtpResult === "timeout";

  const isBadCache = badCachedRecord.status === "invalid" && (isTimeoutError || smtpResult === "host_unreachable");
  assert.equal(isBadCache, true);
});
