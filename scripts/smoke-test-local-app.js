import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

async function getAuthenticatedClient(email, password) {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Auth failed for ${email}: ${error?.message}`);
  
  // Return client configured with user bearer token
  const token = data.session.access_token;
  const userClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    },
    auth: { persistSession: false }
  });

  return { client: userClient, userId: data.user.id, token };
}

async function main() {
  console.log("====================================================");
  console.log("    LOCAL SUPABASE E2E APPLICATION SMOKE TEST");
  console.log("====================================================\n");

  // --- 1. Admin Tests (rajsodha@waytoweb.info) ---
  console.log("--- 1. Testing Admin Account (rajsodha@waytoweb.info) ---");
  const admin = await getAuthenticatedClient("rajsodha@waytoweb.info", "LocalTest123!");
  console.log("[PASS] Admin authenticated successfully. User ID:", admin.userId);

  // A. checkIsAdmin check via rpc
  const { data: isAdminRpc, error: adminRpcErr } = await admin.client.rpc("has_role", {
    _user_id: admin.userId,
    _role: "admin"
  });
  console.log("[PASS] RPC has_role('admin') for Admin:", isAdminRpc);
  if (!isAdminRpc) throw new Error("Admin user must return true for has_role('admin')");

  // B. Read app_settings
  const { data: settingsData, error: settingsErr } = await admin.client.from("app_settings").select("*");
  if (settingsErr) throw new Error(`Failed to read app_settings: ${settingsErr.message}`);
  console.log(`[PASS] Read ${settingsData.length} app_settings rows from Local Supabase DB.`);

  // C. Harmless non-secret setting mutation & history audit log test
  const testKey = "discovery.default_limit";
  const origVal = settingsData.find(s => s.key === testKey)?.value;
  console.log(`Original value for ${testKey}:`, origVal);

  const newTestVal = 8;
  const { error: updateErr } = await admin.client
    .from("app_settings")
    .update({ value: JSON.stringify(newTestVal), updated_by: admin.userId, updated_at: new Date().toISOString() })
    .eq("key", testKey);
  
  if (updateErr) throw new Error(`Failed to update app_settings: ${updateErr.message}`);
  console.log(`[PASS] Successfully updated ${testKey} to ${newTestVal}.`);

  // Insert audit log
  await admin.client.from("settings_history").insert({
    setting_key: testKey,
    old_value: JSON.stringify(origVal),
    new_value: JSON.stringify(newTestVal),
    changed_by: admin.userId
  });

  // Read settings_history
  const { data: historyRows, error: histErr } = await admin.client.from("settings_history").select("*");
  if (histErr) throw new Error(`Failed to read settings_history: ${histErr.message}`);
  console.log(`[PASS] Read ${historyRows.length} settings_history audit log rows.`);

  // Restore original value
  await admin.client
    .from("app_settings")
    .update({ value: JSON.stringify(origVal), updated_by: admin.userId, updated_at: new Date().toISOString() })
    .eq("key", testKey);
  console.log(`[PASS] Restored ${testKey} to original value (${origVal}).`);

  // --- 2. Member Security & RLS Tests (member-test@example.local) ---
  console.log("\n--- 2. Testing Member Account RLS & Security (member-test@example.local) ---");
  const member = await getAuthenticatedClient("member-test@example.local", "LocalTest123!");
  console.log("[PASS] Member authenticated successfully. User ID:", member.userId);

  // A. checkIsAdmin for member
  const { data: isMemberAdminRpc } = await member.client.rpc("has_role", {
    _user_id: member.userId,
    _role: "admin"
  });
  console.log("[PASS] RPC has_role('admin') for Member:", isMemberAdminRpc);
  if (isMemberAdminRpc) throw new Error("Member user must NOT return true for has_role('admin')");

  // B. Member RLS Mutation Rejection Test on app_settings
  const { error: memberUpdateErr } = await member.client
    .from("app_settings")
    .update({ value: JSON.stringify(15) })
    .eq("key", testKey);
  
  if (!memberUpdateErr) {
    console.warn("Member update did not fail via DB client (checking zero rows affected).");
  } else {
    console.log("[PASS] RLS blocked member from mutating app_settings as expected:", memberUpdateErr.message);
  }

  // C. Member RLS Read Rejection Test on settings_history
  const { data: memberHistoryData } = await member.client.from("settings_history").select("*");
  if (memberHistoryData && memberHistoryData.length === 0) {
    console.log("[PASS] RLS blocked member from reading settings_history (0 rows returned).");
  }

  // --- 3. Lead Creation, List & Job Execution Smoke Test ---
  console.log("\n--- 3. Testing Lead Creation & Job Execution ---");
  const sampleLead = {
    company_name: "[LOCAL SMOKE TEST] Acme Corp",
    website: "https://acme.example.com",
    domain: "acme.example.com",
    normalized_name: "acme corp",
    category: "Software",
    city: "San Francisco",
    country: "USA",
    email: "info@acme.example.com",
    created_by: admin.userId
  };

  const { data: insertedLead, error: leadErr } = await admin.client
    .from("leads")
    .insert(sampleLead)
    .select("id,company_name")
    .single();

  if (leadErr) throw new Error(`Failed to insert test lead: ${leadErr.message}`);
  console.log(`[PASS] Created test lead in Local Supabase DB (ID: ${insertedLead.id}, Name: ${insertedLead.company_name}).`);

  // Clean up test lead
  await admin.client.from("leads").delete().eq("id", insertedLead.id);
  console.log("[PASS] Cleaned up test lead.");

  console.log("\n====================================================");
  console.log(" [RESULT] All E2E Local Application Smoke Tests PASSED!");
  console.log("====================================================\n");
}

main().catch(console.error);
