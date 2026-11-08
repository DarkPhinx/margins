/**
 * Sets up the Supabase project named in .env (VITE_SUPABASE_URL):
 *  - applies the SQL files in supabase/migrations that haven't run yet
 *    (recorded in private.margins_migrations), in name order;
 *  - sets where sign-in may return to (the site address and local dev);
 *  - turns on Google sign-in when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 *
 * Uses SUPABASE_ACCESS_TOKEN (a personal access token; never a VITE_ variable)
 * with Supabase's Management API, so no database password or Docker is needed.
 *
 *   npm run supabase:setup
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const API = 'https://api.supabase.com/v1';

function projectRef(url: string): string {
  const host = new URL(url).hostname;
  const ref = host.split('.')[0];
  if (!ref || !host.endsWith('.supabase.co')) throw new Error(`VITE_SUPABASE_URL doesn't look like a Supabase project address: ${url}`);
  return ref;
}

async function api(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as unknown) : null;
}

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.VITE_SUPABASE_URL;
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN in .env (Supabase → Account → Access Tokens). Never prefix it with VITE_.');
  if (!url) throw new Error('Set VITE_SUPABASE_URL in .env.');
  const ref = projectRef(url);
  const sql = (query: string) => api(token, `/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

  // Migrations.
  await sql(`
    create schema if not exists private;
    create table if not exists private.margins_migrations (name text primary key, applied_at timestamptz not null default now());
    revoke all on schema private from anon, authenticated;
  `);
  const applied = new Set(((await sql('select name from private.margins_migrations')) as { name: string }[]).map((r) => r.name));
  const dir = join(root, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(dir, file), 'utf8');
    // One request: the migration and its record together, so a failure leaves nothing half-done.
    await sql(`begin;\n${body}\ninsert into private.margins_migrations (name) values ('${file.replace(/'/g, "''")}');\ncommit;`);
    console.log(`Applied ${file}`);
  }
  if (files.every((f) => applied.has(f))) console.log('Database is up to date.');

  // Sign-in settings.
  const siteUrl = process.env.SITE_URL || 'http://localhost:5173';
  const allow = [siteUrl, 'http://localhost:5173', 'http://localhost:4173', ...(process.env.EXTRA_REDIRECT_URLS ?? '').split(',')]
    .map((u) => u.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const auth: Record<string, unknown> = {
    site_url: siteUrl,
    uri_allow_list: [...new Set(allow)].map((u) => `${u}/**`).join(','),
  };
  const googleId = process.env.GOOGLE_CLIENT_ID;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (googleId && googleSecret) {
    Object.assign(auth, { external_google_enabled: true, external_google_client_id: googleId, external_google_secret: googleSecret });
  }
  await api(token, `/projects/${ref}/config/auth`, { method: 'PATCH', body: JSON.stringify(auth) });
  console.log(`Sign-in returns to ${siteUrl} (also allowed: ${allow.join(', ')}).`);
  console.log(
    googleId && googleSecret
      ? 'Google sign-in is on.'
      : `Google sign-in is off: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (redirect URI https://${ref}.supabase.co/auth/v1/callback), then run this again.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
