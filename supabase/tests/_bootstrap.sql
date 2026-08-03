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

-- ─────────────── Droits par défaut : reproduire Supabase ────────────────────
-- SANS CECI, LE HARNAIS TESTE AUTRE CHOSE QUE LA PRODUCTION.
--
-- Supabase accorde par défaut les droits DML à `anon` et `authenticated` sur
-- les tables du schéma public, et fait reposer la protection sur la RLS. Le
-- harnais ne le faisait pas : les rôles existaient sans aucun droit. Un
-- `set local role authenticated` s'y heurtait donc au contrôle de PRIVILÈGE,
-- jamais aux POLICIES — et un test qui constatait « refusé » ne prouvait rien
-- sur la RLS.
--
-- Mesuré en production le 2026-08-02 (`information_schema.role_table_grants`),
-- pas déduit :
--   • `orders`   → authenticated a DELETE, INSERT, SELECT, UPDATE. Rien n'est
--     révoqué : ce sont les POLICIES seules qui filtrent, et l'absence de
--     policy d'écriture qui bloque l'écriture.
--   • `products` → authenticated n'a que SELECT. L'écriture est fermée par
--     REVOKE (BL-102), pas par policy — les deux mécanismes coexistent et il
--     faut les deux pour décrire le système.
--
-- `alter default privileges` s'applique aux tables créées ENSUITE par le même
-- rôle : c'est exactement le mécanisme Supabase, et il couvre donc toutes les
-- tables des migrations sans avoir à les énumérer.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);
-- Métadonnées d'inscription : lues par le déclencheur de profil (0045). La
-- vraie table Supabase les porte ; le stub doit les porter aussi, sinon le
-- déclencheur passerait les tests sans jamais exercer son chemin nominal.
alter table auth.users add column if not exists raw_user_meta_data jsonb;
-- `auth.uid()` — stub fidèle au comportement Supabase : la vraie fonction lit
-- la revendication `sub` du JWT porté par la requête. Le stub lit le même
-- réglage de session, ce qui permet à un test d'incarner un utilisateur :
--
--     set local request.jwt.claim.sub = '<uuid>';
--
-- RÉTROCOMPATIBLE : réglage absent → `current_setting(..., true)` rend NULL,
-- donc `auth.uid()` rend NULL exactement comme la version précédente. Les
-- tests écrits avant ce changement ne voient aucune différence — vérifié en
-- les rejouant tous, pas supposé de la forme du code.
--
-- ⚠️ CE QUE CE STUB N'EST PAS : un JWT. Aucune signature n'est émise ni
-- vérifiée, aucun GoTrue n'intervient. Il exerce le MOTEUR DE POLICIES avec
-- une identité choisie — ce qui est beaucoup, et ce n'est pas tout. L'écart
-- est écrit dans `docs/24-API-V1.md` et sa fermeture est une condition
-- d'ouverture dans `OPS_TODO.md`.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

-- Supabase accorde USAGE sur le schéma `auth` et EXECUTE sur `auth.uid()` aux
-- deux rôles clients — vérifié en production le 2026-08-02 :
--   has_schema_privilege('authenticated','auth','USAGE')           → true
--   has_function_privilege('authenticated','auth.uid()','EXECUTE') → true
--   has_schema_privilege('anon','auth','USAGE')                    → true
-- Sans ces droits, une policy qui appelle `auth.uid()` lèverait
-- « permission denied for schema auth » au lieu de filtrer : le harnais
-- rendrait un refus qui n'existe pas en production.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

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
