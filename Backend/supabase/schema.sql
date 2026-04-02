-- Run this once in Supabase SQL editor.
-- If you use only publishable/anon key, keep the policies below enabled.

create table if not exists public.users (
  id uuid primary key,
  name text not null,
  region text not null check (region in ('Almaty', 'Astana')),
  birth_date date not null,
  role text not null check (role in ('Participant', 'Coordinator')),
  photo_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.events (
  id uuid primary key,
  name text not null,
  description text not null,
  region text not null check (region in ('Almaty', 'Astana')),
  photo_url text not null,
  coordinator_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.joins (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.users(id) on delete cascade,
  shift text not null check (shift in ('Morning', 'Afternoon', 'Night')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (event_id, participant_id)
);

alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.joins enable row level security;

drop policy if exists "public users full access" on public.users;
drop policy if exists "public events full access" on public.events;
drop policy if exists "public joins full access" on public.joins;

create policy "public users full access"
on public.users
for all
to anon, authenticated
using (true)
with check (true);

create policy "public events full access"
on public.events
for all
to anon, authenticated
using (true)
with check (true);

create policy "public joins full access"
on public.joins
for all
to anon, authenticated
using (true)
with check (true);

-- Supabase Storage (for profile and event images)
insert into storage.buckets (id, name, public)
values ('ngo-assets', 'ngo-assets', true)
on conflict (id) do nothing;

drop policy if exists "public storage read" on storage.objects;
drop policy if exists "public storage insert" on storage.objects;
drop policy if exists "public storage update" on storage.objects;
drop policy if exists "public storage delete" on storage.objects;

create policy "public storage read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'ngo-assets');

create policy "public storage insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'ngo-assets');

create policy "public storage update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'ngo-assets')
with check (bucket_id = 'ngo-assets');

create policy "public storage delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'ngo-assets');
