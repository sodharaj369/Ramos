import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CLOUD_URL = 'https://euvnzjtndwpeuvluvxgi.supabase.co';
const CLOUD_KEY = 'sb_publishable_NO76C9iPeBa7IxjDXtm3vQ_PFHpVwgy';

const exportDir = path.join(process.cwd(), 'scratch', 'prod-backup');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

const tables = [
  'profiles',
  'user_roles',
  'leads',
  'lead_history',
  'email_verifications',
  'jobs',
  'usage_logs',
  'app_settings',
  'settings_history'
];

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function fetchTable(table) {
  const url = `${CLOUD_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: {
      'apikey': CLOUD_KEY,
      'Authorization': `Bearer ${CLOUD_KEY}`
    }
  });

  if (!res.ok) {
    return { table, status: res.status, statusText: res.statusText, rows: [], error: true };
  }

  const rows = await res.json();
  return { table, status: res.status, statusText: res.statusText, rows: Array.isArray(rows) ? rows : [], error: false };
}

async function main() {
  console.log("====================================================");
  console.log("   SAFE PRODUCTION DATA EXPORT (LOVABLE CLOUD)");
  console.log("   Snapshot Timestamp:", new Date().toISOString());
  console.log("====================================================\n");

  const manifest = [];

  for (const table of tables) {
    console.log(`Fetching table: ${table}...`);
    const result = await fetchTable(table);
    
    const filePath = path.join(exportDir, `${table}.json`);
    const jsonStr = JSON.stringify(result.rows, null, 2);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
    
    const hash = sha256(jsonStr);

    manifest.push({
      table,
      status: result.status,
      error: result.error,
      count: result.rows.length,
      file: `${table}.json`,
      bytes: Buffer.byteLength(jsonStr),
      checksum: hash
    });

    console.log(` -> ${table}: ${result.rows.length} rows exported (Status ${result.status}, Checksum: ${hash.slice(0, 8)}...)`);
  }

  const manifestPath = path.join(exportDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ timestamp: new Date().toISOString(), manifest }, null, 2), 'utf-8');

  console.log("\n====================================================");
  console.log(" [RESULT] Export Complete! Saved to:", exportDir);
  console.log("====================================================\n");
}

main().catch(console.error);
