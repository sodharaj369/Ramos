import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("====================================================");
  console.log("  EXACT POSTGRESQL SCHEMA AUDIT: public.app_settings");
  console.log("====================================================\n");

  const { data: cols, error } = await client.rpc("has_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" });

  // Query table sample directly
  const { data: row } = await client.from("app_settings").select("*").limit(1).single();
  console.log("Actual keys present on row object from SELECT *:", Object.keys(row || {}));
}

main().catch(console.error);
