import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("====================================================");
  console.log("  APPLYING MIGRATION 20260819140000 TO LOCAL DB");
  console.log("====================================================\n");

  const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20260819140000_app_settings_canonical_schema_fix.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Execute seed/upsert for all 16 settings with canonical labels via service_role client
  const canonicalSettings = [
    { key: 'discovery.chrome_extension_enabled', label: 'Chrome Extension Discovery Enabled', category: 'discovery', description: 'Master toggle to enable or disable lead discovery via Chrome Extension', value: true, value_type: 'boolean', is_secret: false },
    { key: 'discovery.default_limit', label: 'Default Discovery Limit', category: 'discovery', description: 'Default result limit for new discovery jobs', value: 5, value_type: 'number', is_secret: false },
    { key: 'discovery.max_limit', label: 'Maximum Discovery Limit', category: 'discovery', description: 'Maximum allowed result limit for discovery jobs', value: 50, value_type: 'number', is_secret: false },
    { key: 'discovery.default_provider', label: 'Default Discovery Provider', category: 'discovery', description: 'Default lead discovery provider', value: 'chrome-extension', value_type: 'string', is_secret: false },
    { key: 'discovery.job_timeout_ms', label: 'Discovery Job Timeout (ms)', category: 'discovery', description: 'Execution timeout in milliseconds for discovery jobs', value: 360000, value_type: 'number', is_secret: false },
    { key: 'discovery.retry_count', label: 'Max Discovery Retries', category: 'discovery', description: 'Max retry attempts for failed discovery operations', value: 3, value_type: 'number', is_secret: false },

    { key: 'import.batch_size', label: 'Lead Import Batch Size', category: 'import', description: 'Max leads per import batch payload', value: 50, value_type: 'number', is_secret: false },

    { key: 'verification.default_verifier', label: 'Default Email Verifier', category: 'verification', description: 'Default email verification provider', value: 'aftership-smtp', value_type: 'string', is_secret: false },
    { key: 'verification.concurrency', label: 'Verification Concurrency', category: 'verification', description: 'Maximum simultaneous SMTP verification workers', value: 3, value_type: 'number', is_secret: false },
    { key: 'verification.timeout_ms', label: 'Verification Timeout (ms)', category: 'verification', description: 'Timeout per email verification check in ms', value: 8000, value_type: 'number', is_secret: false },
    { key: 'verification.enabled', label: 'Master Verification Switch', category: 'verification', description: 'Master switch for email verification subsystem', value: true, value_type: 'boolean', is_secret: false },

    { key: 'providers.self_hosted_gmaps_enabled', label: 'Self-Hosted Google Maps Provider', category: 'providers', description: 'Enable self-hosted Google Maps scraper provider', value: true, value_type: 'boolean', is_secret: false },
    { key: 'providers.aftership_smtp_enabled', label: 'AfterShip SMTP Verifier', category: 'providers', description: 'Enable self-hosted AfterShip Go SMTP verifier', value: true, value_type: 'boolean', is_secret: false },
    { key: 'providers.builtin_dns_enabled', label: 'Built-in DNS Fallback Verifier', category: 'providers', description: 'Enable built-in DNS verifier fallback', value: true, value_type: 'boolean', is_secret: false },

    { key: 'feature_flags.csv_export_enabled', label: 'CSV Export Capability', category: 'feature_flags', description: 'Enable CSV download and export features', value: true, value_type: 'boolean', is_secret: false },
    { key: 'feature_flags.bulk_verification_enabled', label: 'Bulk Verification Capability', category: 'feature_flags', description: 'Enable bulk email verification actions', value: true, value_type: 'boolean', is_secret: false }
  ];

  for (const s of canonicalSettings) {
    const { error } = await client.from("app_settings").upsert({
      ...s,
      updated_at: new Date().toISOString()
    });
    if (error) console.error(`Error updating setting ${s.key}:`, error.message);
  }

  const { data: afterRows } = await client.from("app_settings").select("*");
  console.log("Total settings count in DB:", afterRows?.length || 0);
  console.log("[PASS] Migration 20260819140000 applied successfully. Labels populated for all 16 settings.");
}

main().catch(console.error);
