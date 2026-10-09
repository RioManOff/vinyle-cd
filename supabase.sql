-- À coller dans Supabase > SQL Editor > New query, puis "Run".

-- 1) Table des vinyles et CD
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('vinyl', 'cd')),
  title text not null default '',
  artist text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);

-- 2) Sécurité : seules les personnes connectées peuvent lire / écrire
alter table public.items enable row level security;

drop policy if exists "items_authenticated_all" on public.items;
create policy "items_authenticated_all"
  on public.items
  for all
  to authenticated
  using (true)
  with check (true);

-- 3) Dossier privé pour les photos
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
