import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("Checking columns of app_settings via RPC / PostgREST...");

  // Try updating discovery.default_limit to see the exact error response from Supabase DB
  const { data, error } = await client
    .from("app_settings")
    .update({ value: 5 })
    .eq("key", "discovery.default_limit")
    .select();

  console.log("Update result:", data);
  console.log("Update error:", error);
}

main().catch(console.error);
