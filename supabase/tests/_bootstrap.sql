-- Bootstrap pour exécuter les migrations Zabelie Digi sur un Postgres nu
-- (CI / local), sans Supabase. Stube le strict minimum référencé par les
-- migrations : schéma auth (users + uid()) et storage (buckets).
-- En production Supabase, ces objets existent déjà — ce fichier n'y est PAS appliqué.

-- Rôles Supabase (référencés par les REVOKE des fonctions).
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);
-- Métadonnées d'inscription : lues par le déclencheur de profil (0045). La
-- vraie table Supabase les porte ; le stub doit les porter aussi, sinon le
-- déclencheur passerait les tests sans jamais exercer son chemin nominal.
alter table auth.users add column if not exists raw_user_meta_data jsonb;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id     text primary key,
  name   text,
  public boolean
);
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text
);
