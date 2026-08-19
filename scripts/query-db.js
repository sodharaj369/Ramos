import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w_]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
  if (match) env[match[1]] = match[2];
}

const url = env['SUPABASE_URL'];
const key = env['SUPABASE_PUBLISHABLE_KEY'];

async function main() {
  const res = await fetch(`${url}/rest/v1/app_settings?select=*`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  console.log('app_settings HTTP Status:', res.status, res.statusText);
  const json = await res.json();
  console.log('app_settings response:', json);
}

main().catch(console.error);
