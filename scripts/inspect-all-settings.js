import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("====================================================");
  console.log("   READ-ONLY AUDIT: ALL APP SETTINGS IN DB");
  console.log("====================================================\n");

  const { data: rows, error } = await client.from("app_settings").select("*").order("category").order("key");
  if (error) {
    console.error("Failed to query app_settings:", error.message);
    process.exit(1);
  }

  console.log(`Total settings count in DB: ${rows.length}\n`);
  console.table(rows.map(r => ({
    key: r.key,
    label: r.label,
    category: r.category,
    value: JSON.stringify(r.value),
    value_type: r.value_type,
    is_secret: r.is_secret
  })));
}

main().catch(console.error);
