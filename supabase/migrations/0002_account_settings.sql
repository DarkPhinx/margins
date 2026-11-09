-- Margins: each person's account settings (scope "account" in src/settings/registry.ts),
-- the same on every device. Device settings (dark mode, text size, window size,
-- reading position) never come here.
--
-- One row per person. `data` maps each setting's name to its value and when it
-- last changed: {"redLetters": {"value": false, "at": 1762560000000}, ...}.
-- Devices send only the settings they changed; per setting, the later change
-- wins, so changing one setting on a phone and another on a laptop keeps both.

create table if not exists public.account_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.account_settings enable row level security;

drop policy if exists "own settings: read" on public.account_settings;
create policy "own settings: read" on public.account_settings for select to authenticated using (user_id = auth.uid());
drop policy if exists "own settings: add" on public.account_settings;
create policy "own settings: add" on public.account_settings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own settings: change" on public.account_settings;
create policy "own settings: change" on public.account_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.account_settings from anon;
grant select, insert, update on public.account_settings to authenticated;

-- Merges a device's changed settings into the account's and returns all of
-- them. With no changes it's a plain read (and stores nothing).
create or replace function public.merge_account_settings(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur jsonb;
  k text;
  v jsonb;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'settings must be an object';
  end if;

  if p_changes = '{}'::jsonb then
    select s.data into cur from public.account_settings s where s.user_id = uid;
    return coalesce(cur, '{}'::jsonb);
  end if;

  insert into public.account_settings (user_id) values (uid) on conflict (user_id) do nothing;
  select s.data into cur from public.account_settings s where s.user_id = uid for update;

  for k, v in select * from jsonb_each(p_changes) loop
    if jsonb_typeof(v) <> 'object' or not (v ? 'value') or jsonb_typeof(v->'at') <> 'number' then
      raise exception 'setting % is not {value, at}', k;
    end if;
    -- The later change wins; on a tie the account keeps what it has.
    if not (cur ? k) or (v->>'at')::numeric > coalesce((cur->k->>'at')::numeric, -1) then
      cur := jsonb_set(cur, array[k], jsonb_build_object('value', v->'value', 'at', v->'at'));
    end if;
  end loop;

  update public.account_settings s set data = cur, updated_at = now() where s.user_id = uid;
  return cur;
end;
$$;

revoke all on function public.merge_account_settings(jsonb) from public, anon;
grant execute on function public.merge_account_settings(jsonb) to authenticated;

-- Other devices hear about changes straight away (Supabase Realtime).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_settings'
  ) then
    alter publication supabase_realtime add table public.account_settings;
  end if;
end;
$$;
