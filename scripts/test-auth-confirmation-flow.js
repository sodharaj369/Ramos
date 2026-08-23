import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const MAILPIT_MESSAGES_URL = "http://127.0.0.1:54324/api/v1/messages";

function getAuthUserRoleFromDb(email) {
  try {
    const cmd = `docker exec supabase_db_local psql -U postgres -d postgres -t -c "SELECT role FROM auth.users WHERE email = '${email}';"`;
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (err) {
    console.error("Failed to query auth.users role via docker psql:", err.message);
    return null;
  }
}

function getEmailConfirmedAtFromDb(email) {
  try {
    const cmd = `docker exec supabase_db_local psql -U postgres -d postgres -t -c "SELECT email_confirmed_at FROM auth.users WHERE email = '${email}';"`;
    const output = execSync(cmd, { encoding: "utf8" }).trim();
    if (!output || output === "" || output === "null") return null;
    return output;
  } catch (err) {
    console.error("Failed to query DB via docker psql:", err.message);
    return null;
  }
}

async function main() {
  console.log(`\n====================================================`);
  console.log(`   FULL AUTHENTICATION LIFECYCLE & CONFIRMATION TEST`);
  console.log(`====================================================\n`);

  const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });

  const testEmail1 = `newmember_${Date.now()}@waytoweb.info`;
  const testPassword = "TestPassword123!";

  // ----------------------------------------------------
  // TEST A: SIGNUP WITH NEW EMAIL
  // ----------------------------------------------------
  console.log(`[TEST A] Signing up new user: ${testEmail1}`);
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail1,
    password: testPassword,
    options: {
      emailRedirectTo: "http://localhost:8080/dashboard",
      data: { full_name: "Test New Member" },
    },
  });

  if (signUpErr) {
    console.error("[FAIL] Signup failed with error:", signUpErr.message);
    process.exit(1);
  }

  console.log(`[PASS] Signup response received.`);
  console.log(`       User ID: ${signUpData.user?.id}`);
  console.log(`       Session value before confirmation: ${signUpData.session}`);

  if (signUpData.session !== null) {
    console.error("[FAIL] ERROR: Session is NOT null on signup! Unconfirmed user was auto-logged in!");
    process.exit(1);
  } else {
    console.log(`[PASS] Session is NULL as expected. User is NOT automatically logged in.`);
  }

  // ----------------------------------------------------
  // TEST B: CHECK DATABASE AUTH ROLE & CONFIRMATION STATE
  // ----------------------------------------------------
  console.log(`\n[TEST B] Checking DB auth.users.role & email_confirmed_at state...`);
  const dbAuthRole = getAuthUserRoleFromDb(testEmail1);
  console.log(`[PASS] DB auth.users.role: "${dbAuthRole}"`);
  if (dbAuthRole !== "authenticated") {
    console.error(`[FAIL] ERROR: auth.users.role is "${dbAuthRole}" instead of "authenticated"!`);
    process.exit(1);
  }

  const confirmedAtPre = getEmailConfirmedAtFromDb(testEmail1);
  console.log(`[PASS] DB email_confirmed_at BEFORE confirmation: ${confirmedAtPre ?? "NULL"}`);
  if (confirmedAtPre !== null && confirmedAtPre !== "") {
    console.error("[FAIL] ERROR: User email is already confirmed in DB before confirmation link!");
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST C & D: CHECK MAILPIT FOR CONFIRMATION EMAIL & VERIFY OTP
  // ----------------------------------------------------
  console.log(`\n[TEST C & D] Checking Mailpit for confirmation email...`);
  await new Promise((r) => setTimeout(r, 1000));

  const res = await fetch(MAILPIT_MESSAGES_URL);
  if (!res.ok) {
    console.error(`[FAIL] Mailpit API failed with status ${res.status}`);
    process.exit(1);
  }

  const messagesData = await res.json();
  const messages = messagesData.messages || messagesData || [];
  const matchedMsgHeader = messages.find((m) =>
    m.To && m.To.some((recipient) => recipient.Address === testEmail1),
  );

  if (!matchedMsgHeader) {
    console.error(`[FAIL] No confirmation email found in Mailpit for ${testEmail1}`);
    process.exit(1);
  }

  console.log(`[PASS] Confirmation email delivered to Mailpit.`);
  console.log(`       Subject: "${matchedMsgHeader.Subject}"`);
  console.log(`       To: ${matchedMsgHeader.To[0].Address}`);

  const msgRes = await fetch(`http://127.0.0.1:54324/api/v1/message/${matchedMsgHeader.ID}`);
  const msgData = await msgRes.json();
  const htmlBody = msgData.HTML || msgData.Text || "";

  const linkMatch = htmlBody.match(/href="([^"]+)"/);
  if (!linkMatch) {
    console.error("[FAIL] Could not extract href from confirmation email!");
    process.exit(1);
  }

  const rawConfirmUrl = linkMatch[1].replace(/&amp;/g, "&");
  console.log(`[PASS] Extracted confirmation link: ${rawConfirmUrl}`);

  const parsedUrl = new URL(rawConfirmUrl);
  const redirectToParam = parsedUrl.searchParams.get("redirect_to");
  console.log(`[PASS] Confirmation link redirect_to parameter: ${redirectToParam}`);

  if (redirectToParam && !redirectToParam.startsWith("http://localhost:8080")) {
    console.error(`[FAIL] ERROR: redirect_to points to non-localhost URL: ${redirectToParam}`);
    process.exit(1);
  }

  const tokenHash = parsedUrl.searchParams.get("token");
  const type = parsedUrl.searchParams.get("type") || "signup";

  console.log(`\n[TEST D] Verifying OTP / Token with Supabase Auth...`);
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type,
  });

  if (verifyErr) {
    console.error("[FAIL] OTP verification failed:", verifyErr.message);
    process.exit(1);
  }

  console.log(`[PASS] OTP Token verified successfully!`);

  const confirmedAtPost = getEmailConfirmedAtFromDb(testEmail1);
  console.log(`[PASS] DB email_confirmed_at AFTER confirmation: ${confirmedAtPost}`);

  if (!confirmedAtPost) {
    console.error("[FAIL] ERROR: User is still not confirmed after token verification!");
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST E: CONFIRMED USER LOGIN & JWT CLAIM VERIFICATION
  // ----------------------------------------------------
  console.log(`\n[TEST E] Attempting login with confirmed user ${testEmail1}...`);
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: testEmail1,
    password: testPassword,
  });

  if (signInErr || !signInData.session) {
    console.error("[FAIL] Confirmed user login failed:", signInErr?.message);
    process.exit(1);
  }

  const token = signInData.session.access_token;
  const payloadBase64 = token.split(".")[1];
  const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
  const payload = JSON.parse(payloadJson);

  console.log(`[PASS] Confirmed user logged in successfully!`);
  console.log(`       JWT role claim: "${payload.role}"`);

  if (payload.role !== "authenticated") {
    console.error(`[FAIL] ERROR: JWT role claim is "${payload.role}" instead of "authenticated"!`);
    process.exit(1);
  }
  console.log(`[PASS] JWT claim "role" is strictly "authenticated".`);

  // ----------------------------------------------------
  // TEST E2: APPLICATION QUERY EXECUTION (LEADS / JOBS / DASHBOARD)
  // ----------------------------------------------------
  console.log(`\n[TEST E2] Testing Application Queries as New Confirmed Member...`);
  const userClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: leadsQuery, error: leadsErr } = await userClient.from("leads").select("id").limit(5);
  if (leadsErr) {
    console.error(`[FAIL] Leads query failed for new member: ${leadsErr.message}`);
    process.exit(1);
  }
  console.log(`[PASS] Leads query succeeded! Count: ${leadsQuery?.length}`);

  const { data: jobsQuery, error: jobsErr } = await userClient.from("jobs").select("id").limit(5);
  if (jobsErr) {
    console.error(`[FAIL] Jobs query failed for new member: ${jobsErr.message}`);
    process.exit(1);
  }
  console.log(`[PASS] Jobs query succeeded! Count: ${jobsQuery?.length}`);

  // ----------------------------------------------------
  // TEST F: NEGATIVE TEST (UNCONFIRMED USER LOGIN REJECTION)
  // ----------------------------------------------------
  const testEmail2 = `unconfirmed_${Date.now()}@waytoweb.info`;
  console.log(`\n[TEST F] Creating second unconfirmed user: ${testEmail2}`);

  const { data: signUp2Data } = await supabase.auth.signUp({
    email: testEmail2,
    password: testPassword,
  });

  console.log(`[PASS] Created second unconfirmed user. ID: ${signUp2Data.user?.id}`);

  console.log(`[TEST F] Attempting login with UNCONFIRMED user ${testEmail2}...`);
  const { data: signIn2Data, error: signIn2Err } = await supabase.auth.signInWithPassword({
    email: testEmail2,
    password: testPassword,
  });

  if (signIn2Err) {
    console.log(`[PASS] Unconfirmed login correctly REJECTED with error message: "${signIn2Err.message}"`);
  } else {
    console.error("[FAIL] ERROR: Unconfirmed user was allowed to log in!", signIn2Data);
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST G: EXISTING ADMIN & MEMBER LOGIN REGRESSION TEST
  // ----------------------------------------------------
  console.log(`\n[TEST G] Regression testing existing accounts...`);

  const { data: adminLogin, error: adminErr } = await supabase.auth.signInWithPassword({
    email: "rajsodha@waytoweb.info",
    password: "LocalTest123!",
  });

  if (adminErr || !adminLogin.session) {
    console.error("[FAIL] Existing Admin login failed:", adminErr?.message);
    process.exit(1);
  }
  console.log(`[PASS] Existing Admin (rajsodha@waytoweb.info) logged in successfully.`);

  const { data: memberLogin, error: memberErr } = await supabase.auth.signInWithPassword({
    email: "member-test@example.local",
    password: "LocalTest123!",
  });

  if (memberErr || !memberLogin.session) {
    console.error("[FAIL] Existing Member login failed:", memberErr?.message);
    process.exit(1);
  }
  console.log(`[PASS] Existing Member (member-test@example.local) logged in successfully.`);

  console.log(`\n====================================================`);
  console.log(` [RESULT] ALL AUTHENTICATION LIFECYCLE TESTS PASSED!`);
  console.log(`====================================================\n`);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
