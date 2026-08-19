import fs from 'fs';
import path from 'path';

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

async function main() {
  console.log('Testing Local Supabase Stack at:', LOCAL_URL);

  // 1. Check REST API root
  const restRes = await fetch(`${LOCAL_URL}/rest/v1/`, {
    headers: { 'apikey': LOCAL_ANON_KEY }
  });
  console.log('[LOCAL SUPABASE] REST Gateway status:', restRes.status, restRes.statusText);

  // 2. Check app_settings table via REST API
  const settingsRes = await fetch(`${LOCAL_URL}/rest/v1/app_settings?select=*`, {
    headers: {
      'apikey': LOCAL_ANON_KEY,
      'Authorization': `Bearer ${LOCAL_ANON_KEY}`
    }
  });
  console.log('[LOCAL SUPABASE] app_settings endpoint status:', settingsRes.status, settingsRes.statusText);
  if (settingsRes.ok) {
    const settings = await settingsRes.json();
    console.log('[LOCAL SUPABASE] Seeded app_settings count:', settings.length);
  }

  // 3. Check auth status endpoint
  const authRes = await fetch(`${LOCAL_URL}/auth/v1/health`);
  console.log('[LOCAL SUPABASE] GoTrue Auth health status:', authRes.status, authRes.statusText);
}

main().catch(console.error);
