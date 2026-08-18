-- Garde C3.4 (docs/31) : AUCUNE table du schéma public sans RLS — et le garde
-- se prouve lui-même avant de prouver quoi que ce soit.
--
-- POURQUOI CE GARDE EXISTE. La règle « RLS dès la création » est tenue par
-- discipline depuis 0002 : mesuré en production le 2026-08-18, 70 tables,
-- 0 sans RLS. Mais une règle tenue par discipline se rompt le jour où
-- quelqu'un est pressé — et une table sans RLS ne casse RIEN : elle sert
-- toutes ses lignes à tout le monde, en silence. C'est le défaut invisible
-- par construction, même famille que `storage.objects` à zéro policy
-- (2026-08-11) : aucune erreur, aucune trace, rien à voir tant qu'on ne
-- regarde pas. Ce fichier regarde, à chaque commit.
--
-- Le périmètre est TOUT le schéma public, pas seulement `zabelie_*` : les
-- tables héritées (products, orders, wallets, profiles…) portent la RLS
-- depuis 0002 et doivent la garder.
--
--   R1. Connu-POSITIF : une table-témoin créée SANS RLS doit être vue, et
--       elle seule. Sans R1, une sonde trop filtrée rendrait « zéro défaut »
--       pour toujours — le vert qui ne vérifie rien.
--   R2. Le témoin retiré, la sonde doit rendre ZÉRO table sans RLS, en
--       NOMMANT les fautives s'il y en a.
--
-- Transaction annulée : le témoin ne survit jamais, même si le test échoue.

begin;

-- ── R1 — le garde sait-il voir ? ────────────────────────────────────────────
create table zabelie_temoin_sans_rls (id int);

do $$
declare
  v_fautives text;
  v_n        int;
begin
  select count(*), string_agg(tablename, ', ' order by tablename)
    into v_n, v_fautives
    from pg_tables
   where schemaname = 'public' and not rowsecurity;

  if v_n = 0 then
    raise exception 'R1 KO : la table-témoin SANS RLS n''a pas été vue — la sonde est aveugle, son zéro ne prouve rien';
  end if;
  if v_fautives <> 'zabelie_temoin_sans_rls' then
    raise exception 'R1 KO : la sonde voit « % » au lieu du seul témoin — soit le dépôt porte déjà une table sans RLS (voir R2), soit la sonde sur-attrape', v_fautives;
  end if;
  raise notice 'R1 OK : le témoin sans RLS est vu, et lui seul';
end $$;

drop table zabelie_temoin_sans_rls;

-- ── R2 — l'invariant réel ───────────────────────────────────────────────────
do $$
declare
  v_fautives text;
  v_n        int;
  v_total    int;
begin
  select count(*) into v_total from pg_tables where schemaname = 'public';

  select count(*), string_agg(tablename, ', ' order by tablename)
    into v_n, v_fautives
    from pg_tables
   where schemaname = 'public' and not rowsecurity;

  if v_n > 0 then
    raise exception 'R2 KO : % table(s) du schéma public SANS RLS : %. Une table sans RLS sert toutes ses lignes à tout le monde, sans erreur ni trace. `alter table … enable row level security` dès la migration qui la crée — puis ses policies, ou ses revoke.', v_n, v_fautives;
  end if;

  -- La sonde a-t-elle lu quelque chose ? Un harnais qui n'aurait appliqué
  -- aucune migration rendrait « zéro fautive » sur zéro table — le même vide
  -- que le vert honnête. Plancher volontairement bas : il date, il ne prédit
  -- pas (70 tables en prod au 2026-08-18).
  if v_total < 40 then
    raise exception 'R2 KO : % table(s) lues seulement — le harnais n''a pas appliqué les migrations, ce zéro ne prouve rien', v_total;
  end if;

  raise notice 'R2 OK : % tables public, toutes sous RLS', v_total;
end $$;

rollback;
