-- Margins, Phase 5: each person's study items, synced from their devices.
--
-- The app saves everything on the device first (IndexedDB) and syncs here.
-- A row holds one item (note, question, highlight, journal entry, link) as
-- JSON, exactly as the app stores it. Each row has a version number that goes
-- up by one on every change, so a device can tell whether the copy it edited
-- is still the latest (if not, it's a conflict and the person is asked).
-- Items are never deleted here, only marked deleted, so a deletion reaches
-- every device.

create sequence if not exists public.study_items_seq;

create table if not exists public.study_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null,
  -- The item as the app stores it (without device-only sync fields).
  data jsonb not null,
  -- 1 for a new item, +1 on each change.
  version integer not null,
  -- The item's own change time (ms since 1970), as set on the device.
  updated_at bigint not null,
  deleted boolean not null default false,
  -- Order of changes across the server: a device asks for everything after the last one it saw.
  seq bigint not null default nextval('public.study_items_seq'),
  primary key (user_id, id)
);

create index if not exists study_items_user_seq on public.study_items (user_id, seq);

alter table public.study_items enable row level security;

-- Each person sees and changes only their own items. There's no delete: deletions are a flag.
drop policy if exists "own items: read" on public.study_items;
create policy "own items: read" on public.study_items for select to authenticated using (user_id = auth.uid());
drop policy if exists "own items: add" on public.study_items;
create policy "own items: add" on public.study_items for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own items: change" on public.study_items;
create policy "own items: change" on public.study_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.study_items from anon;
grant select, insert, update on public.study_items to authenticated;
grant usage on sequence public.study_items_seq to authenticated;

-- Saves one item from a device. `p_base` is the version the device's copy was
-- based on (null if it has never been synced). If the server's copy has moved
-- on since then, nothing is saved and the server's copy comes back as a
-- conflict for the device to settle.
create or replace function public.push_item(p_id text, p_data jsonb, p_base integer)
returns table (status text, version integer, data jsonb, seq bigint)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  cur public.study_items%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_data->>'id' is distinct from p_id then
    raise exception 'item id does not match';
  end if;

  select * into cur from public.study_items s where s.user_id = uid and s.id = p_id for update;

  if not found then
    insert into public.study_items as s (user_id, id, kind, data, version, updated_at, deleted)
    values (uid, p_id, p_data->>'kind', p_data, 1, (p_data->>'updatedAt')::bigint, p_data->>'deletedAt' is not null)
    on conflict on constraint study_items_pkey do nothing
    returning s.version, s.seq into cur.version, cur.seq;
    if cur.version is null then
      -- Another device added it at the same moment: compare with that copy.
      select * into cur from public.study_items s where s.user_id = uid and s.id = p_id;
      return query select 'conflict'::text, cur.version, cur.data, cur.seq;
      return;
    end if;
    return query select 'ok'::text, cur.version, p_data, cur.seq;
    return;
  end if;

  if p_base is null or cur.version <> p_base then
    return query select 'conflict'::text, cur.version, cur.data, cur.seq;
    return;
  end if;

  update public.study_items s
  set data = p_data,
      kind = p_data->>'kind',
      version = s.version + 1,
      updated_at = (p_data->>'updatedAt')::bigint,
      deleted = p_data->>'deletedAt' is not null,
      seq = nextval('public.study_items_seq')
  where s.user_id = uid and s.id = p_id
  returning s.version, s.seq into cur.version, cur.seq;
  return query select 'ok'::text, cur.version, p_data, cur.seq;
end;
$$;

revoke all on function public.push_item(text, jsonb, integer) from public, anon;
grant execute on function public.push_item(text, jsonb, integer) to authenticated;

-- Other devices hear about changes straight away (Supabase Realtime).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_items'
  ) then
    alter publication supabase_realtime add table public.study_items;
  end if;
end;
$$;
