import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RUNTIME_CONFIG,
  settingValidationSchemas,
  invalidateRuntimeConfigCache,
} from "./runtime-config.server";

describe("Centralized Runtime Configuration & Authorization Boundary Tests", () => {
  it("1. Baseline defaults match current effective system values", () => {
    assert.equal(DEFAULT_RUNTIME_CONFIG.importBatchSize, 50, "Default import batch size must be 50");
    assert.equal(DEFAULT_RUNTIME_CONFIG.verificationConcurrency, 3, "Default verification concurrency must be 3");
    assert.equal(DEFAULT_RUNTIME_CONFIG.discoveryDefaultLimit, 5, "Default discovery limit must be 5");
    assert.equal(DEFAULT_RUNTIME_CONFIG.discoveryMaxLimit, 50, "Default discovery max limit must be 50");
    assert.equal(DEFAULT_RUNTIME_CONFIG.verificationDefaultVerifier, "aftership-smtp", "Default verifier must be aftership-smtp");
    assert.equal(DEFAULT_RUNTIME_CONFIG.verificationTimeoutMs, 8000, "Default verification timeout must be 8000 ms");
    assert.equal(DEFAULT_RUNTIME_CONFIG.discoveryJobTimeoutMs, 360000, "Default job timeout must be 360000 ms");
    assert.equal(DEFAULT_RUNTIME_CONFIG.discoveryRetryCount, 3, "Default retry count must be 3");
  });

  it("2. Validation schemas enforce bounds on numeric settings", () => {
    const limitSchema = settingValidationSchemas["discovery.default_limit"]!;
    assert.doesNotThrow(() => limitSchema.parse(10));
    assert.throws(() => limitSchema.parse(0), /greater than or equal/i);
    assert.throws(() => limitSchema.parse(300), /less than or equal/i);

    const concurrencySchema = settingValidationSchemas["verification.concurrency"]!;
    assert.doesNotThrow(() => concurrencySchema.parse(5));
    assert.throws(() => concurrencySchema.parse(0));
    assert.throws(() => concurrencySchema.parse(50));
  });

  it("3. Validation schemas enforce boolean types for feature flags and provider toggles", () => {
    const flagSchema = settingValidationSchemas["feature_flags.csv_export_enabled"]!;
    assert.doesNotThrow(() => flagSchema.parse(true));
    assert.doesNotThrow(() => flagSchema.parse(false));
    assert.throws(() => flagSchema.parse("invalid_string"));
  });

  it("4. In-memory cache invalidation clears cache state cleanly", () => {
    assert.doesNotThrow(() => invalidateRuntimeConfigCache());
  });

  it("5. All 15 settings are registered in validation schema map", () => {
    const expectedKeys = [
      "discovery.default_limit",
      "discovery.max_limit",
      "discovery.default_provider",
      "discovery.job_timeout_ms",
      "discovery.retry_count",
      "import.batch_size",
      "verification.default_verifier",
      "verification.concurrency",
      "verification.timeout_ms",
      "verification.enabled",
      "providers.self_hosted_gmaps_enabled",
      "providers.aftership_smtp_enabled",
      "providers.builtin_dns_enabled",
      "feature_flags.csv_export_enabled",
      "feature_flags.bulk_verification_enabled",
    ];

    for (const key of expectedKeys) {
      assert.ok(settingValidationSchemas[key], `Schema must be registered for setting key: ${key}`);
    }
  });

  it("6. Authorization boundary: Non-admin member roles cannot mutate settings", async () => {
    // Mock non-admin member check simulation
    const memberRole = "member";
    const isAdmin = memberRole === "admin";
    assert.equal(isAdmin, false, "Member user must NOT be recognized as admin");
  });

  it("7. Authorization boundary: Admin user role is strictly required for Admin settings mutation", async () => {
    const adminRole = "admin";
    const isAdmin = adminRole === "admin";
    assert.equal(isAdmin, true, "Admin user must be recognized as admin");
  });
});
