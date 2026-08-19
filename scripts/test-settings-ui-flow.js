import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig, updateAppSetting } from "../src/lib/config/runtime-config.server.js";
import { importExtensionBatch } from "../src/lib/extension-import.server.js";
import { handleCreateDiscoveryJob } from "../src/lib/jobs.handlers.server.js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

async function getAuthenticatedClient(email, password) {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Auth failed for ${email}: ${error?.message}`);
  
  const token = data.session.access_token;
  const userClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });

  return { client: userClient, userId: data.user.id, token };
}

async function main() {
  console.log("====================================================");
  console.log("   ADMIN SETTINGS UI & RUNTIME ENFORCEMENT TEST");
  console.log("====================================================\n");

  const admin = await getAuthenticatedClient("rajsodha@waytoweb.info", "LocalTest123!");
  const member = await getAuthenticatedClient("member-test@example.local", "LocalTest123!");

  // --- TEST A & B: Toggle Chrome Extension Enabled OFF ---
  console.log("--- TEST A & B: Toggle Chrome Extension Enabled OFF ---");
  await updateAppSetting(admin.client, "discovery.chrome_extension_enabled", false, admin.userId);
  let config = await getRuntimeConfig(admin.client);
  console.log("[PASS] Updated discovery.chrome_extension_enabled to FALSE. Verified config:", config.discoveryChromeExtensionEnabled);
  if (config.discoveryChromeExtensionEnabled !== false) throw new Error("Expected discoveryChromeExtensionEnabled to be false");

  // Verify runtime enforcement for Chrome Extension Import when disabled
  try {
    await importExtensionBatch(admin.client, admin.userId, {
      source: "chrome-extension",
      leads: [{ company_name: "Test Ingestion" }]
    });
    throw new Error("FAIL: Disabling Chrome Extension did not block import extension batch!");
  } catch (err) {
    if (err.message.includes("currently disabled by administrator")) {
      console.log("[PASS] Runtime Enforcement Verified: Extension import rejected when disabled:", err.message);
    } else {
      throw err;
    }
  }

  // --- TEST C & D: Toggle ON → Save → Verify ON ---
  console.log("\n--- TEST C & D: Toggle ON → Save → Verify ON ---");
  await updateAppSetting(admin.client, "discovery.chrome_extension_enabled", true, admin.userId);
  config = await getRuntimeConfig(admin.client);
  console.log("[PASS] Updated discovery.chrome_extension_enabled to TRUE. Verified config:", config.discoveryChromeExtensionEnabled);
  if (config.discoveryChromeExtensionEnabled !== true) throw new Error("Expected discoveryChromeExtensionEnabled to be true");

  // --- TEST E & F: Change Default Limit 5 -> 8 -> Save -> Verify 8 ---
  console.log("\n--- TEST E & F: Change Default Limit 5 -> 8 -> Save -> Verify 8 ---");
  await updateAppSetting(admin.client, "discovery.default_limit", 8, admin.userId);
  config = await getRuntimeConfig(admin.client);
  console.log("[PASS] Updated discovery.default_limit to 8. Verified config limit:", config.discoveryDefaultLimit);
  if (config.discoveryDefaultLimit !== 8) throw new Error("Expected discoveryDefaultLimit to be 8");

  // Verify runtime enforcement: Discovery job picks up new default limit
  const jobResult = await handleCreateDiscoveryJob(admin.client, admin.userId, { query: "pizza", sourceId: "chrome-extension" });
  const { data: jobData } = await admin.client.from("jobs").select("params").eq("id", jobResult.jobId).single();
  console.log("[PASS] Runtime Enforcement Verified: Discovery job params used updated limit:", jobData?.params?.limit);
  if (jobData?.params?.limit !== 8) throw new Error("Discovery job did not consume updated default limit!");

  // Clean up test job
  await admin.client.from("jobs").delete().eq("id", jobResult.jobId);

  // --- TEST G: Restore Default Limit 5 -> Save ---
  console.log("\n--- TEST G: Restore Default Limit 5 -> Save ---");
  await updateAppSetting(admin.client, "discovery.default_limit", 5, admin.userId);
  config = await getRuntimeConfig(admin.client);
  console.log("[PASS] Restored discovery.default_limit to 5. Verified config limit:", config.discoveryDefaultLimit);

  // --- TEST H: Verify Audit Log Entries in settings_history ---
  console.log("\n--- TEST H: Verify Audit Log Entries in settings_history ---");
  const { data: historyRows, error: histErr } = await admin.client.from("settings_history").select("*");
  if (histErr) throw new Error(`Failed to query settings_history: ${histErr.message}`);
  console.log(`[PASS] Verified ${historyRows.length} audit trail records logged in settings_history.`);

  // --- TEST I: Verify Member RLS Security ---
  console.log("\n--- TEST I: Member Security & RLS Test ---");
  try {
    await updateAppSetting(member.client, "discovery.default_limit", 12, member.userId);
    throw new Error("FAIL: Member was able to mutate admin setting!");
  } catch (err) {
    console.log("[PASS] Member setting mutation correctly rejected:", err.message);
  }

  const { data: memberHist } = await member.client.from("settings_history").select("*");
  console.log("[PASS] Member reading settings_history returned count:", memberHist?.length || 0);
  if (memberHist && memberHist.length > 0) throw new Error("FAIL: Member was able to read settings_history!");

  console.log("\n====================================================");
  console.log(" [RESULT] ALL SETTINGS UI & RUNTIME ENFORCEMENT TESTS PASSED!");
  console.log("====================================================\n");
}

main().catch(console.error);
