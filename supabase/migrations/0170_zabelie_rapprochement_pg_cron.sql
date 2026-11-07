select zabelie_migration_garde('0170_zabelie_rapprochement_pg_cron.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0170 — LE RAPPROCHEMENT DES PAIEMENTS TOUTES LES 5 MINUTES, PAR LA BASE.
--
-- POURQUOI. Décision du porteur le 2026-11-07 (« pg_cron Supabase »), après
-- une mesure : sur 174 déclenchements planifiés de `.github/workflows/
-- reconcile.yml` depuis le 2026-10-06, GitHub n'en a lancé que 3 à 8 par jour
-- au lieu de 288 — écart médian 4 h 30, maximum 10 h. MonCash n'a PAS de
-- webhook : un acheteur qui paie puis ferme l'application sans revenir sur
-- `/api/moncash/return` n'est découvert que par le rapprochement. Vercel
-- Hobby limite ses crons à un par jour (`docs/04` §3).
--
-- CE QUE ÇA FAIT, ET RIEN DE PLUS. `pg_cron` appelle toutes les 5 minutes
-- `zabelie_rapprochement_declencher()`, qui envoie par `pg_net` un
-- `POST /api/reconcile` au site — LA MÊME route que GitHub et que le cron
-- quotidien Vercel, avec son bail (`0060`) et son idempotence. Aucune logique
-- d'argent ici : la base ne fait que sonner.
--
-- INERTE PAR DÉFAUT (fail-closed). Le jeton vit dans le coffre Supabase
-- (Vault), sous le nom `zabelie_reconcile_secret`, et AUCUNE migration ne
-- l'écrit. Tant que le porteur ne l'a pas posé, chaque passage note
-- `secret_absent` et n'appelle rien. Geste d'activation, dans l'éditeur SQL :
--
--     select vault.create_secret('<valeur de RECONCILE_SECRET>',
--                                'zabelie_reconcile_secret');
--
-- La valeur est celle de `RECONCILE_SECRET` en Production Vercel et dans les
-- secrets Actions. Vercel la stocke en « sensible » : si elle est perdue, en
-- générer une nouvelle et la poser aux TROIS endroits (`docs/11` §2.1).
--
-- OBSERVABLE. Chaque passage écrit son issue dans `zabelie_rapprochement_
-- config` (`dernier_passage`, `derniere_issue`, `derniere_requete`). La
-- réponse HTTP se lit dans `net._http_response` par `derniere_requete` :
-- « n'a pas tourné » et « a tourné, refusé » ne produisent plus le même vide.
--
-- CI. Postgres nu n'a ni `pg_cron`, ni `pg_net`, ni Vault : les extensions et
-- la planification sont posées seulement si elles existent, et la fonction
-- répond `pg_net_absent` / `vault_absent` sans lever d'erreur. Le test
-- `supabase/tests/rapprochement_pg_cron.test.sql` simule Vault et `pg_net`
-- pour éprouver l'appel lui-même.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Extensions, là où Supabase les attend — seulement si disponibles ─────
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  else
    raise notice '0170 : pg_net indisponible (Postgres nu, CI) — extension non posée';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice '0170 : pg_cron indisponible (Postgres nu, CI) — extension non posée';
  end if;
end $$;

-- ── 2. Configuration : une ligne, aucun secret ──────────────────────────────
create table if not exists zabelie_rapprochement_config (
  id               boolean primary key default true check (id),
  site_url         text not null default 'https://zabelie.com'
                     check (site_url ~ '^https://[a-z0-9.-]+$'),
  delai_ms         integer not null default 295000
                     check (delai_ms between 5000 and 300000),
  dernier_passage  timestamptz,
  derniere_issue   text,
  derniere_requete bigint,
  updated_at       timestamptz not null default now()
);
insert into zabelie_rapprochement_config (id) values (true) on conflict (id) do nothing;
alter table zabelie_rapprochement_config enable row level security;
revoke all on zabelie_rapprochement_config from public, anon, authenticated;
grant select on zabelie_rapprochement_config to service_role;
comment on table zabelie_rapprochement_config is
  'Declencheur pg_cron du rapprochement (0170). site_url : origine appelee (POST /api/reconcile). delai_ms : attente maximale de la reponse, sous le maxDuration de 300 s de la route. Les trois colonnes dernier_* disent ce que le dernier passage a fait. Aucun secret ici : le jeton vit dans Vault (zabelie_reconcile_secret).';

-- ── 3. Le déclencheur ───────────────────────────────────────────────────────
-- Requêtes DYNAMIQUES vers `vault` et `net` : ces schémas n'existent pas en CI,
-- et leur présence est vérifiée avant chaque usage. Le jeton ne sort jamais de
-- la fonction : ni retour, ni journal, ni colonne.
create or replace function public.zabelie_rapprochement_declencher()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     zabelie_rapprochement_config;
  v_secret  text;
  v_requete bigint;
  v_issue   text;
begin
  select * into v_cfg from zabelie_rapprochement_config where id;
  if not found then
    return 'config_absente';
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    v_issue := 'pg_net_absent';
  elsif to_regclass('vault.decrypted_secrets') is null then
    v_issue := 'vault_absent';
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
       into v_secret using 'zabelie_reconcile_secret';
    if v_secret is null or length(btrim(v_secret)) < 16 then
      v_issue := 'secret_absent';
    else
      execute 'select net.http_post(url := $1, body := $2, params := $3, headers := $4, timeout_milliseconds := $5)'
         into v_requete
        using v_cfg.site_url || '/api/reconcile',
              '{}'::jsonb,
              '{}'::jsonb,
              jsonb_build_object('Authorization', 'Bearer ' || btrim(v_secret),
                                 'Content-Type', 'application/json'),
              v_cfg.delai_ms;
      v_issue := 'appel_envoye';
    end if;
  end if;

  update zabelie_rapprochement_config
     set dernier_passage  = now(),
         derniere_issue   = v_issue,
         derniere_requete = v_requete,
         updated_at       = now()
   where id;
  return v_issue;
end;
$$;
revoke all on function public.zabelie_rapprochement_declencher() from public, anon, authenticated;
comment on function public.zabelie_rapprochement_declencher() is
  'Appele par pg_cron toutes les 5 minutes (0170). Envoie POST /api/reconcile avec le jeton de Vault, ou note pourquoi il ne l''a pas fait (pg_net_absent, vault_absent, secret_absent). Aucune logique d''argent : la route garde son bail et son idempotence.';

-- ── 4. La planification — seulement si pg_cron est là ───────────────────────
-- Minutes 2, 7, …, 57 : hors du début d'heure, comme le workflow GitHub.
-- `cron.schedule` avec un nom existant met le job à jour : rejouable.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zabelie-rapprochement', '2-59/5 * * * *',
                          'select public.zabelie_rapprochement_declencher()');
  else
    raise notice '0170 : pg_cron absent — planification non posée (attendu en CI)';
  end if;
end $$;

-- ── 5. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_job integer;
begin
  if not exists (select 1 from zabelie_rapprochement_config where id) then
    raise exception 'ZB170 : ligne de configuration absente' using errcode = 'ZB170';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'zabelie_rapprochement_declencher'
       and p.prosecdef
       and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  ) then
    raise exception 'ZB170 : declencheur absent, ou sans security definer / search_path' using errcode = 'ZB170';
  end if;
  if has_function_privilege('anon', 'public.zabelie_rapprochement_declencher()', 'execute')
     or has_function_privilege('authenticated', 'public.zabelie_rapprochement_declencher()', 'execute') then
    raise exception 'ZB170 : declencheur executable par un client' using errcode = 'ZB170';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select count(*) from cron.job where jobname = $1 and schedule = $2'
       into v_job using 'zabelie-rapprochement', '2-59/5 * * * *';
    if v_job <> 1 then
      raise exception 'ZB170 : job pg_cron absent ou mal planifie (%)', v_job using errcode = 'ZB170';
    end if;
  end if;
end $$;

commit;
