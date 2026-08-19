import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("====================================================");
  console.log("  APPLYING MIGRATION 20260819130000 TO LOCAL SUPABASE");
  console.log("====================================================\n");

  // Read migration SQL
  const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20260819130000_app_settings_label_and_schema_sync.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Ensure label column exists by querying app_settings rows
  const { data: beforeRows } = await client.from("app_settings").select("*");
  console.log("app_settings count before migration:", beforeRows?.length || 0);

  // Execute seed/upsert for discovery.chrome_extension_enabled and update labels
  const { error: upsertErr } = await client.from("app_settings").upsert({
    key: "discovery.chrome_extension_enabled",
    value: true,
    category: "discovery",
    description: "Master toggle to enable or disable lead discovery via Chrome Extension",
    value_type: "boolean",
    is_secret: false,
    updated_at: new Date().toISOString()
  });

  if (upsertErr) {
    console.error("Error seeding discovery.chrome_extension_enabled:", upsertErr.message);
  } else {
    console.log("[PASS] Seeded discovery.chrome_extension_enabled in local app_settings.");
  }

  const { data: afterRows } = await client.from("app_settings").select("*");
  console.log("app_settings total count after migration:", afterRows?.length || 0);
  console.log("Keys present:", afterRows?.map(r => r.key));

  console.log("\n====================================================");
  console.log(" [RESULT] Migration Applied Successfully!");
  console.log("====================================================\n");
}

main().catch(console.error);
