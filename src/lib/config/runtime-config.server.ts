import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type DB = SupabaseClient<any, "public", any>;

export interface RuntimeConfig {
  discoveryChromeExtensionEnabled: boolean;
  discoveryDefaultLimit: number;
  discoveryMaxLimit: number;
  discoveryDefaultProvider: string;
  discoveryJobTimeoutMs: number;
  discoveryRetryCount: number;
  importBatchSize: number;
  verificationDefaultVerifier: string;
  verificationConcurrency: number;
  verificationTimeoutMs: number;
  verificationEnabled: boolean;
  providersSelfHostedGmapsEnabled: boolean;
  providersAftershipSmtpEnabled: boolean;
  providersBuiltinDnsEnabled: boolean;
  featureFlagsCsvExportEnabled: boolean;
  featureFlagsBulkVerificationEnabled: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  discoveryChromeExtensionEnabled: true,
  discoveryDefaultLimit: 5,
  discoveryMaxLimit: 50,
  discoveryDefaultProvider: "chrome-extension",
  discoveryJobTimeoutMs: 360000,
  discoveryRetryCount: 3,
  importBatchSize: 50,
  verificationDefaultVerifier: "aftership-smtp",
  verificationConcurrency: 3,
  verificationTimeoutMs: 8000,
  verificationEnabled: true,
  providersSelfHostedGmapsEnabled: true,
  providersAftershipSmtpEnabled: true,
  providersBuiltinDnsEnabled: true,
  featureFlagsCsvExportEnabled: true,
  featureFlagsBulkVerificationEnabled: true,
};

let cachedConfig: RuntimeConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5000;

export function invalidateRuntimeConfigCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

export const settingValidationSchemas: Record<string, z.ZodTypeAny> = {
  "discovery.chrome_extension_enabled": z.boolean(),
  "discovery.default_limit": z.number().int().min(1).max(200),
  "discovery.max_limit": z.number().int().min(1).max(500),
  "discovery.default_provider": z.string().min(1),
  "discovery.job_timeout_ms": z.number().int().min(5000).max(1800000),
  "discovery.retry_count": z.number().int().min(0).max(10),
  "import.batch_size": z.number().int().min(1).max(200),
  "verification.default_verifier": z.string().min(1),
  "verification.concurrency": z.number().int().min(1).max(20),
  "verification.timeout_ms": z.number().int().min(1000).max(60000),
  "verification.enabled": z.boolean(),
  "providers.self_hosted_gmaps_enabled": z.boolean(),
  "providers.aftership_smtp_enabled": z.boolean(),
  "providers.builtin_dns_enabled": z.boolean(),
  "feature_flags.csv_export_enabled": z.boolean(),
  "feature_flags.bulk_verification_enabled": z.boolean(),
};

/** Reads centralized runtime configuration with in-memory caching. Falls back to baseline defaults safely. */
export async function getRuntimeConfig(db?: DB | null): Promise<RuntimeConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  if (!db) return DEFAULT_RUNTIME_CONFIG;

  try {
    const { data: rows, error } = await db
      .from("app_settings")
      .select("key, value")
      .eq("is_secret", false);

    if (error || !rows || rows.length === 0) {
      cachedConfig = DEFAULT_RUNTIME_CONFIG;
      cacheExpiresAt = now + CACHE_TTL_MS;
      return DEFAULT_RUNTIME_CONFIG;
    }

    const map = new Map<string, any>(rows.map((r: any) => [r.key, r.value]));

    const config: RuntimeConfig = {
      discoveryChromeExtensionEnabled: Boolean(map.get("discovery.chrome_extension_enabled") ?? DEFAULT_RUNTIME_CONFIG.discoveryChromeExtensionEnabled),
      discoveryDefaultLimit: Number(map.get("discovery.default_limit") ?? DEFAULT_RUNTIME_CONFIG.discoveryDefaultLimit),
      discoveryMaxLimit: Number(map.get("discovery.max_limit") ?? DEFAULT_RUNTIME_CONFIG.discoveryMaxLimit),
      discoveryDefaultProvider: String(map.get("discovery.default_provider") ?? DEFAULT_RUNTIME_CONFIG.discoveryDefaultProvider),
      discoveryJobTimeoutMs: Number(map.get("discovery.job_timeout_ms") ?? DEFAULT_RUNTIME_CONFIG.discoveryJobTimeoutMs),
      discoveryRetryCount: Number(map.get("discovery.retry_count") ?? DEFAULT_RUNTIME_CONFIG.discoveryRetryCount),
      importBatchSize: Number(map.get("import.batch_size") ?? DEFAULT_RUNTIME_CONFIG.importBatchSize),
      verificationDefaultVerifier: String(map.get("verification.default_verifier") ?? DEFAULT_RUNTIME_CONFIG.verificationDefaultVerifier),
      verificationConcurrency: Number(map.get("verification.concurrency") ?? DEFAULT_RUNTIME_CONFIG.verificationConcurrency),
      verificationTimeoutMs: Number(map.get("verification.timeout_ms") ?? DEFAULT_RUNTIME_CONFIG.verificationTimeoutMs),
      verificationEnabled: Boolean(map.get("verification.enabled") ?? DEFAULT_RUNTIME_CONFIG.verificationEnabled),
      providersSelfHostedGmapsEnabled: Boolean(map.get("providers.self_hosted_gmaps_enabled") ?? DEFAULT_RUNTIME_CONFIG.providersSelfHostedGmapsEnabled),
      providersAftershipSmtpEnabled: Boolean(map.get("providers.aftership_smtp_enabled") ?? DEFAULT_RUNTIME_CONFIG.providersAftershipSmtpEnabled),
      providersBuiltinDnsEnabled: Boolean(map.get("providers.builtin_dns_enabled") ?? DEFAULT_RUNTIME_CONFIG.providersBuiltinDnsEnabled),
      featureFlagsCsvExportEnabled: Boolean(map.get("feature_flags.csv_export_enabled") ?? DEFAULT_RUNTIME_CONFIG.featureFlagsCsvExportEnabled),
      featureFlagsBulkVerificationEnabled: Boolean(map.get("feature_flags.bulk_verification_enabled") ?? DEFAULT_RUNTIME_CONFIG.featureFlagsBulkVerificationEnabled),
    };

    // Cross-field validation assertion
    if (config.discoveryMaxLimit < config.discoveryDefaultLimit) {
      config.discoveryMaxLimit = config.discoveryDefaultLimit;
    }

    cachedConfig = config;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return config;
  } catch {
    cachedConfig = DEFAULT_RUNTIME_CONFIG;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return DEFAULT_RUNTIME_CONFIG;
  }
}

/** Updates a setting safely. Enforces Zod schemas, records settings history, and flushes cache. */
export async function updateAppSetting(
  db: DB,
  key: string,
  newValue: unknown,
  userId: string,
): Promise<{ success: boolean; key: string; value: unknown }> {
  // 1. Verify schema
  const schema = settingValidationSchemas[key];
  if (!schema) {
    throw new Error(`Setting key "${key}" is invalid or unknown.`);
  }

  const parsedValue = schema.parse(newValue);

  // 2. Fetch existing row to check bounds and old_value
  const { data: existing } = await db
    .from("app_settings")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  const oldValue = existing ? existing.value : null;

  // 3. Cross-setting validation check if updating limits or providers
  if (key === "discovery.default_limit") {
    const currentMax = existing ? (await getRuntimeConfig(db)).discoveryMaxLimit : 50;
    if ((parsedValue as number) > currentMax) {
      throw new Error(`Default limit (${parsedValue}) cannot exceed maximum limit (${currentMax}).`);
    }
  } else if (key === "discovery.max_limit") {
    const currentDefault = existing ? (await getRuntimeConfig(db)).discoveryDefaultLimit : 5;
    if ((parsedValue as number) < currentDefault) {
      throw new Error(`Maximum limit (${parsedValue}) cannot be lower than default limit (${currentDefault}).`);
    }
  } else if (key === "verification.default_verifier") {
    const isAftershipEnabled = (await getRuntimeConfig(db)).providersAftershipSmtpEnabled;
    const isBuiltinEnabled = (await getRuntimeConfig(db)).providersBuiltinDnsEnabled;
    if (parsedValue === "aftership-smtp" && !isAftershipEnabled) {
      throw new Error('Cannot select "aftership-smtp" as default verifier because it is currently disabled.');
    }
    if (parsedValue === "builtin-dns" && !isBuiltinEnabled) {
      throw new Error('Cannot select "builtin-dns" as default verifier because it is currently disabled.');
    }
  }

  // 4. Perform targeted UPDATE (or insert with canonical defaults if row missing)
  const isSecret = existing?.is_secret ?? false;

  if (existing) {
    // Targeted update of value and audit fields ONLY — preserves label, category, description, value_type, is_secret
    const { data: updatedRows, error: updateErr } = await db
      .from("app_settings")
      .update({
        value: parsedValue,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("key", key)
      .select();

    if (updateErr) {
      throw new Error(`Failed to update setting ${key}: ${updateErr.message}`);
    }

    if (!updatedRows || updatedRows.length === 0) {
      throw new Error(`Permission denied: Admin privileges required to update setting ${key}.`);
    }
  } else {
    // Insert new row supplying full default metadata
    const category = key.split(".")[0] || "general";
    const defaultLabel = key.split(".").slice(1).join(" ").replace(/_/g, " ").toUpperCase();
    const { data: insertedRows, error: insertErr } = await db
      .from("app_settings")
      .insert({
        key,
        label: defaultLabel,
        value: parsedValue,
        category,
        description: `Setting for ${key}`,
        value_type: typeof parsedValue === "boolean" ? "boolean" : typeof parsedValue === "number" ? "number" : "string",
        is_secret: isSecret,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .select();

    if (insertErr) {
      throw new Error(`Failed to insert setting ${key}: ${insertErr.message}`);
    }

    if (!insertedRows || insertedRows.length === 0) {
      throw new Error(`Permission denied: Admin privileges required to insert setting ${key}.`);
    }
  }

  // 5. Record Audit History (never log secret values)
  const auditOld = isSecret ? "[MASKED]" : oldValue;
  const auditNew = isSecret ? "[MASKED]" : parsedValue;

  await db.from("settings_history").insert({
    setting_key: key,
    old_value: auditOld,
    new_value: auditNew,
    changed_by: userId,
  });

  // 6. Invalidate cache
  invalidateRuntimeConfigCache();

  return { success: true, key, value: parsedValue };
}
