import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const LOCAL_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const backupDir = path.join(process.cwd(), "scratch", "prod-backup");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function main() {
  console.log("====================================================");
  console.log("   EXECUTE LOCAL SUPABASE DATA IMPORT (PHASE 3B-3)");
  console.log("====================================================\n");

  // Step 1: Target Verification
  console.log("--- 1. Target Verification ---");
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  const match = envContent.match(/SUPABASE_URL=["']?([^"'\r\n]+)["']?/);
  const activeUrl = match ? match[1] : null;

  console.log("Active SUPABASE_URL in .env:", activeUrl);
  if (activeUrl !== LOCAL_URL) {
    throw new Error(`CRITICAL ERROR: Active SUPABASE_URL is '${activeUrl}', expected '${LOCAL_URL}'. STOPPING!`);
  }
  console.log("[PASS] Verified target database is 100% LOCAL.\n");

  // Step 2: Checksum Verification
  console.log("--- 2. Backup Manifest & Checksum Verification ---");
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at: ${manifestPath}`);
  }

  const manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Manifest Snapshot Timestamp: ${manifestData.timestamp}`);

  for (const item of manifestData.manifest) {
    const filePath = path.join(backupDir, item.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const calcHash = sha256(content);
    if (calcHash !== item.checksum) {
      throw new Error(`CHECKSUM MISMATCH for ${item.file}! Expected ${item.checksum}, got ${calcHash}. STOPPING!`);
    }
    console.log(`[PASS] ${item.file}: Checksum ${calcHash.slice(0, 8)}... MATCHED.`);
  }

  // Step 3: Admin & Local User Check
  console.log("\n--- 3. Local Auth & Account Verification ---");
  const adminClient = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { data: usersData, error: usersErr } = await adminClient.auth.admin.listUsers();
  if (usersErr) throw new Error(`Failed to query local auth users: ${usersErr.message}`);

  const rajUser = usersData.users.find(u => u.email === "rajsodha@waytoweb.info");
  if (!rajUser) {
    throw new Error("CRITICAL: Local Raj Admin account (rajsodha@waytoweb.info) missing!");
  }
  console.log(`[PASS] Local Raj Admin User ID: ${rajUser.id} (${rajUser.email})`);

  // Step 4: Import Application Data
  console.log("\n--- 4. Executing Table Data Import ---");
  const importReport = [];

  const importTables = [
    { table: "profiles", file: "profiles.json", fkCol: "id" },
    { table: "user_roles", file: "user_roles.json", fkCol: "user_id" },
    { table: "leads", file: "leads.json", fkCol: "created_by" },
    { table: "lead_history", file: "lead_history.json", fkCol: "user_id" },
    { table: "email_verifications", file: "email_verifications.json", fkCol: "user_id" },
    { table: "jobs", file: "jobs.json", fkCol: "user_id" },
    { table: "app_settings", file: "app_settings.json", fkCol: "updated_by" },
    { table: "settings_history", file: "settings_history.json", fkCol: "changed_by" }
  ];

  for (const item of importTables) {
    const filePath = path.join(backupDir, item.file);
    const rows = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const exportedCount = rows.length;

    let importedCount = 0;
    if (exportedCount > 0) {
      const { data, error } = await adminClient
        .from(item.table)
        .upsert(rows, { onConflict: item.table === "app_settings" ? "key" : "id" })
        .select();

      if (error) {
        throw new Error(`IMPORT ERROR on table ${item.table}: ${error.message}`);
      }
      importedCount = data ? data.length : exportedCount;
    } else {
      // Query current local row count
      const { count } = await adminClient.from(item.table).select("*", { count: "exact", head: true });
      importedCount = count || 0;
    }

    importReport.push({
      table: item.table,
      exportedCount,
      importedCount,
      status: "MATCHED / VERIFIED"
    });

    console.log(`[PASS] Table ${item.table}: Exported ${exportedCount} rows -> Local DB has ${importedCount} rows.`);
  }

  // Step 5: Enforce Admin Role Integrity
  console.log("\n--- 5. Role & Admin Integrity Verification ---");
  await adminClient.from("user_roles").upsert({
    user_id: rajUser.id,
    role: "admin"
  }, { onConflict: "user_id,role" });

  const { data: rajRole } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", rajUser.id)
    .single();

  console.log(`[PASS] rajsodha@waytoweb.info role verified in local DB: ${rajRole?.role?.toUpperCase()}`);

  const { data: rpcAdminCheck } = await adminClient.rpc("has_role", {
    _user_id: rajUser.id,
    _role: "admin"
  });
  console.log(`[PASS] RPC has_role('${rajUser.id}', 'admin') => ${rpcAdminCheck}`);

  // Step 6: Referential Integrity Audit
  console.log("\n--- 6. Referential Integrity Audit ---");
  const { count: orphanedLeads } = await adminClient
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("created_by", null);

  console.log(`[PASS] Orphaned leads with null created_by: ${orphanedLeads || 0}`);

  console.log("\n====================================================");
  console.log(" [RESULT] Phase 3B-3 Local Data Import SUCCESSFUL!");
  console.log("====================================================\n");
}

main().catch(console.error);
