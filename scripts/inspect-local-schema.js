import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("====================================================");
  console.log("   LOCAL SUPABASE DATABASE SCHEMA INSPECTOR");
  console.log("====================================================\n");

  // Query table columns for app_settings and settings_history
  const { data: sampleRow, error: err1 } = await client.from("app_settings").select("*").limit(1);
  console.log("app_settings sample row keys:", sampleRow && sampleRow.length > 0 ? Object.keys(sampleRow[0]) : "NO ROWS or ERROR", err1?.message || "");

  const { data: allRows, error: err2 } = await client.from("app_settings").select("*");
  console.log("app_settings total rows in local DB:", allRows ? allRows.length : 0);
  if (allRows && allRows.length > 0) {
    console.log("Current app_settings keys:", allRows.map(r => r.key));
    console.log("Sample row structure:", JSON.stringify(allRows[0], null, 2));
  }
}

main().catch(console.error);
