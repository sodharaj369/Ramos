import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

async function main() {
  console.log("Checking RLS policies on app_settings...");
  const { data: memberUser } = await client.auth.admin.listUsers();
  const mem = memberUser.users.find(u => u.email === "member-test@example.local");

  console.log("Member user ID:", mem?.id);
  const { data: hasAdmin } = await client.rpc("has_role", { _user_id: mem?.id, _role: "admin" });
  console.log("Member has admin role?", hasAdmin);

  // Authenticate as member
  const anonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  const memAuthClient = createClient(LOCAL_URL, anonKey);
  const { data: sess } = await memAuthClient.auth.signInWithPassword({
    email: "member-test@example.local",
    password: "LocalTest123!"
  });

  const memberDb = createClient(LOCAL_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } }
  });

  const { data: updateRes, error: updateErr } = await memberDb
    .from("app_settings")
    .update({ value: 12 })
    .eq("key", "discovery.default_limit")
    .select();

  console.log("Member update select result:", updateRes);
  console.log("Member update error:", updateErr);
}

main().catch(console.error);
