import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

async function seed() {
  console.log("Seeding standard local development accounts...");
  const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });

  const users = [
    { email: "rajsodha@waytoweb.info", password: "LocalTest123!", role: "admin", name: "Raj Sodha (Admin)" },
    { email: "member-test@example.local", password: "LocalTest123!", role: "member", name: "Standard Member" },
  ];

  for (const u of users) {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: { data: { full_name: u.name } },
    });

    const userId = data?.user?.id;
    if (userId) {
      console.log(`Created user ${u.email} (ID: ${userId})`);
      // Auto-confirm email for local dev test account
      execSync(
        `docker exec supabase_db_local psql -U postgres -d postgres -c "UPDATE auth.users SET email_confirmed_at = now(), role = 'authenticated' WHERE id = '${userId}';"`,
        { encoding: "utf8" }
      );
      if (u.role === "admin") {
        execSync(
          `docker exec supabase_db_local psql -U postgres -d postgres -c "INSERT INTO public.user_roles (user_id, role) VALUES ('${userId}', 'admin') ON CONFLICT (user_id, role) DO NOTHING;"`,
          { encoding: "utf8" }
        );
      }
    }
  }
  console.log("Local development accounts seeded successfully!");
}

seed().catch(console.error);
