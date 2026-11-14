// Проверка, какой из ключей проекта работает с REST API.
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('frontend/.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}
const url = env.SUPABASE_URL;
const token = env.SUPABASE_SERVICE_ROLE_KEY;
const ref = new URL(url).hostname.split('.')[0];

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { apikey: token, Authorization: `Bearer ${token}` },
});
const keys = await res.json();

for (const k of keys) {
  const value = k.api_key ?? '';
  const masked = value.includes('•') || value.includes('*');
  const rest = await fetch(`${url}/rest/v1/catalog_snapshots?select=id&limit=1`, {
    headers: { apikey: value, Authorization: `Bearer ${value}` },
  });
  console.log(
    `${k.name} (${k.type}) len=${value.length} masked=${masked} -> REST ${rest.status} ${(await rest.text()).slice(0, 120)}`,
  );
}
