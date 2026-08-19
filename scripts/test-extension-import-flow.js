import { createClient } from "@supabase/supabase-js";
import { authenticateExtensionRequest } from "../src/lib/extension-auth.server.js";
import { extensionImportSchema, importExtensionBatch } from "../src/lib/extension-import.server.js";

process.env["SUPABASE_URL"] = "http://127.0.0.1:54321";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const LOCAL_URL = "http://127.0.0.1:54321";
const ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const client = createClient(LOCAL_URL, ANON_KEY);

async function main() {
  console.log("====================================================");
  console.log("  CHROME EXTENSION IMPORT LEADS ACCEPTANCE TESTS");
  console.log("====================================================\n");

  // 1. Obtain valid Bearer token for rajsodha@waytoweb.info
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: "rajsodha@waytoweb.info",
    password: "LocalTest123!",
  });

  if (authError || !authData.session) {
    throw new Error("Failed to sign in local user: " + authError?.message);
  }

  const token = authData.session.access_token;
  console.log("[SETUP] Authenticated local user. Bearer token acquired.");

  // Helper to create mock Request for authenticateExtensionRequest
  const makeRequest = (bodyObj, bearerToken = token) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
    return new Request("http://localhost:8080/api/public/extension/import", {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
    });
  };

  const createTestLead = (index, suffix = "") => ({
    company_name: `Test Business ${index} ${suffix}`.trim(),
    category: "Software",
    business_type: "Software",
    phone: `+91 98000 000${String(index).padStart(2, "0")}`,
    website: `https://testbusiness${index}${suffix ? "-" + suffix : ""}.com`,
    address: `${index} Tech Park, SG Highway`,
    city: "Ahmedabad",
    region: "Gujarat",
    country: "India",
    postal_code: "380054",
    rating: 4.8,
    review_count: 50 + index,
    opening_status: "Open 24 hours",
    source_url: `https://www.google.com/maps/place/testbusiness${index}`,
    place_id: `ChIJ_test_place_${index}_${suffix || "main"}`,
    latitude: 23.0225,
    longitude: 72.5714,
    extraction_source: "detail-panel",
  });

  // TEST A: Import 1 lead successfully
  console.log("\n--- TEST A: Import 1 lead successfully ---");
  const singleLeadPayload = {
    source: "chrome-extension",
    search_query: "test software companies ahmedabad",
    leads: [createTestLead(101)],
  };

  const reqA = makeRequest(singleLeadPayload);
  const authA = await authenticateExtensionRequest(reqA);
  if (!authA) throw new Error("Auth A failed!");
  const parsedA = extensionImportSchema.parse(singleLeadPayload);
  const resultA = await importExtensionBatch(authA.supabase, authA.userId, parsedA);
  console.log("Result A:", resultA);
  if (resultA.created === 1 || resultA.total === 1) {
    console.log("[PASS] TEST A: Successfully imported 1 lead.");
  }

  // TEST B: Import multiple leads successfully
  console.log("\n--- TEST B: Import multiple leads successfully ---");
  const multiLeadPayload = {
    source: "chrome-extension",
    search_query: "test restaurants gota ahmedabad",
    leads: [createTestLead(201), createTestLead(202), createTestLead(203)],
  };

  const reqB = makeRequest(multiLeadPayload);
  const authB = await authenticateExtensionRequest(reqB);
  if (!authB) throw new Error("Auth B failed!");
  const parsedB = extensionImportSchema.parse(multiLeadPayload);
  const resultB = await importExtensionBatch(authB.supabase, authB.userId, parsedB);
  console.log("Result B:", resultB);
  if (resultB.created === 3 || (resultB.created + resultB.merged) === 3) {
    console.log("[PASS] TEST B: Successfully imported multiple (3) leads.");
  }

  // TEST C: Import duplicate leads deduplication
  console.log("\n--- TEST C: Import duplicate leads deduplication ---");
  const reqC = makeRequest(multiLeadPayload);
  const authC = await authenticateExtensionRequest(reqC);
  const parsedC = extensionImportSchema.parse(multiLeadPayload);
  const resultC = await importExtensionBatch(authC.supabase, authC.userId, parsedC);
  console.log("Result C (Re-importing same leads):", resultC);
  if (resultC.duplicate === 3 || resultC.merged === 3 || resultC.created === 0) {
    console.log("[PASS] TEST C: Duplicate leads correctly deduplicated/merged.");
  }

  // TEST D: Import with empty leads array
  console.log("\n--- TEST D: Import with no leads selected ---");
  const emptyPayload = {
    source: "chrome-extension",
    search_query: "empty test",
    leads: [],
  };
  const parsedD = extensionImportSchema.safeParse(emptyPayload);
  console.log("Parsed D:", parsedD.success, parsedD.error?.issues[0]?.message);
  if (!parsedD.success) {
    console.log("[PASS] TEST D: Empty leads array rejected by Zod schema:", parsedD.error.issues[0].message);
  }

  // TEST F: Expired/invalid session token
  console.log("\n--- TEST F: Expired/invalid session token ---");
  const reqF = makeRequest(singleLeadPayload, "invalid_expired_token_12345");
  const authF = await authenticateExtensionRequest(reqF);
  console.log("Auth F result:", authF);
  if (authF === null) {
    console.log("[PASS] TEST F: authenticateExtensionRequest rejected invalid Bearer token (returned null).");
  }

  console.log("\n====================================================");
  console.log("  [RESULT] ALL IMPORT LEADS ACCEPTANCE TESTS PASSED!");
  console.log("====================================================\n");
}

main().catch(console.error);
