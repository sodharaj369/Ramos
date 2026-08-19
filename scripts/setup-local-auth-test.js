import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const client = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log("====================================================");
  console.log("   LOCAL SUPABASE AUTH & ROLE SETUP SMOKE TEST");
  console.log("====================================================\n");

  const accounts = [
    { email: "rajsodha@waytoweb.info", password: "LocalTest123!", expectedRole: "admin" },
    { email: "member-test@example.local", password: "LocalTest123!", expectedRole: "member" },
  ];

  for (const acc of accounts) {
    console.log(`--- Setting up local account: ${acc.email} ---`);
    
    // 1. Create or get user
    const { data: created, error: createErr } = await client.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: { full_name: acc.email.split("@")[0] }
    });

    let userId = created?.user?.id;
    if (createErr && createErr.message.includes("already exists")) {
      console.log(`Account ${acc.email} already exists in auth.users.`);
      const { data: users } = await client.auth.admin.listUsers();
      const existing = users.users.find(u => u.email === acc.email);
      userId = existing?.id;
    } else if (createErr) {
      console.error(`Error creating account ${acc.email}:`, createErr.message);
    }

    console.log(`Local user ID for ${acc.email}: ${userId}`);

    // 2. Set user role
    if (acc.expectedRole === "admin") {
      // Upsert admin role
      const { error: roleErr } = await client.from("user_roles").upsert({
        user_id: userId,
        role: "admin"
      }, { onConflict: "user_id,role" });
      
      // Remove any member role assignment for admin
      await client.from("user_roles").delete().eq("user_id", userId).eq("role", "member");

      if (roleErr) console.error("Error setting admin role:", roleErr.message);
      else console.log(`Assigned role: ADMIN to ${acc.email}`);
    } else {
      // Ensure member role
      const { error: roleErr } = await client.from("user_roles").upsert({
        user_id: userId,
        role: "member"
      }, { onConflict: "user_id,role" });

      // Ensure no admin role assignment
      await client.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");

      if (roleErr) console.error("Error setting member role:", roleErr.message);
      else console.log(`Assigned role: MEMBER to ${acc.email}`);
    }

    // 3. Test authentication (Sign in with password)
    const authClient = createClient(LOCAL_URL, LOCAL_ANON_KEY);
    const { data: session, error: loginErr } = await authClient.auth.signInWithPassword({
      email: acc.email,
      password: acc.password
    });

    if (loginErr) {
      console.error(`FAILED login test for ${acc.email}:`, loginErr.message);
    } else {
      console.log(`PASSED login test for ${acc.email}! JWT token issued successfully.`);
      
      // 4. Test RPC has_role
      const { data: hasAdmin, error: rpcErr } = await authClient.rpc("has_role", {
        _user_id: userId,
        _role: "admin"
      });
      console.log(`has_role(..., 'admin') for ${acc.email} => ${hasAdmin} (Expected: ${acc.expectedRole === "admin"})`);
    }

    console.log("\n");
  }

  console.log("====================================================");
  console.log(" [RESULT] Local Auth & Role Setup Completed!");
  console.log("====================================================");
}

main().catch(console.error);
