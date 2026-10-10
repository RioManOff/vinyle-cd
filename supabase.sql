-- ============================================================
--  Ma Collection : base de données
--
--  À coller dans Supabase > SQL Editor > New query, puis "Run".
--  Tu peux le relancer autant de fois que tu veux : rien n'est
--  supprimé, tes vinyles, tes CD et tes photos sont conservés.
-- ============================================================

-- 1) Table des vinyles et CD
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('vinyl', 'cd')),
  title text not null default '',
  artist text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);

-- 2) Nouvelles colonnes (ignorées si elles existent déjà)
alter table public.items add column if not exists year integer;
alter table public.items add column if not exists genre text;
alter table public.items add column if not exists notes text;
alter table public.items add column if not exists favorite boolean not null default false;
alter table public.items add column if not exists thumb_path text;
alter table public.items add column if not exists cover_url text;

alter table public.items drop constraint if exists items_year_range;
alter table public.items
  add constraint items_year_range check (year is null or (year >= 1900 and year <= 2100));

-- 3) Sécurité : seules les personnes connectées peuvent lire / écrire
alter table public.items enable row level security;

drop policy if exists "items_authenticated_all" on public.items;
create policy "items_authenticated_all"
  on public.items
  for all
  to authenticated
  using (true)
  with check (true);

-- 4) Dossier privé pour les photos
insert into storage.buckets (id, name, public)
values ('covers', 'covers', false)
on conflict (id) do nothing;

drop policy if exists "covers_select" on storage.objects;
create policy "covers_select" on storage.objects
  for select to authenticated using (bucket_id = 'covers');

drop policy if exists "covers_insert" on storage.objects;
create policy "covers_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers');

drop policy if exists "covers_delete" on storage.objects;
create policy "covers_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'covers');

-- 5) Synchronisation en direct : ce que l'un ajoute apparaît
--    tout de suite sur le téléphone de l'autre
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end
$$;
