/**
 * The connection to the person's account (Supabase). The project address and
 * its public "anon" key come from .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
 * the anon key is meant to be public — row-level security on the server keeps
 * each person's data their own.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StudyItem } from '../study/types';
import type { AccountRecord, SettingsRemote } from '../settings';
import type { PushResult, Remote, RemoteRow } from './engine';

/** Where the signed-in session is kept (localStorage), so the app opens offline too. */
export const AUTH_STORAGE_KEY = 'margins.auth';

let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function supabase(): SupabaseClient {
  if (!client) {
    if (!isConfigured()) throw new Error('Accounts are not set up: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing.');
    client = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
      auth: { storageKey: AUTH_STORAGE_KEY, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

interface PushRow {
  status: 'ok' | 'conflict';
  version: number;
  data: StudyItem;
  seq: number;
}

export function supabaseRemote(sb: SupabaseClient = supabase()): Remote {
  return {
    async push(item, base): Promise<PushResult> {
      const { data, error } = await sb.rpc('push_item', { p_id: item.id, p_data: item, p_base: base });
      if (error) throw new Error(`Couldn't save ${item.id}: ${error.message}`);
      const row = (data as PushRow[])[0];
      if (!row) throw new Error(`No answer saving ${item.id}`);
      return row.status === 'ok'
        ? { status: 'ok', version: row.version, seq: Number(row.seq) }
        : { status: 'conflict', row: { id: item.id, version: row.version, data: row.data, seq: Number(row.seq) } };
    },
    async pull(since, limit): Promise<RemoteRow[]> {
      const { data, error } = await sb.from('study_items').select('id, version, data, seq').gt('seq', since).order('seq').limit(limit);
      if (error) throw new Error(`Couldn't fetch changes: ${error.message}`);
      return (data as RemoteRow[]).map((r) => ({ ...r, seq: Number(r.seq) }));
    },
  };
}

/** The account's settings (scope "account" in src/settings/registry.ts): merged on the server, newer change wins per setting. */
export function supabaseSettingsRemote(sb: SupabaseClient = supabase()): SettingsRemote {
  return {
    async exchange(changes): Promise<AccountRecord> {
      const { data, error } = await sb.rpc('merge_account_settings', { p_changes: changes });
      // PGRST202/PGRST205: the server hasn't had supabase/migrations/0002 yet.
      if (error?.code === 'PGRST202' || error?.code === 'PGRST205')
        throw new Error('Settings sync isn’t set up on the server yet (run npm run supabase:setup). Notes and highlights still sync.');
      if (error) throw new Error(`Couldn't sync settings: ${error.message}`);
      return (data ?? {}) as AccountRecord;
    },
  };
}
