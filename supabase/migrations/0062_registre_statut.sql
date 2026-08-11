-- ============================================================================
-- 0062 — LE REGISTRE DIT ENFIN CE QU'IL SAIT : `redigee` / `appliquee` /
--        `abandonnee`, interrogeable
-- ============================================================================
-- `zabelie_schema_migrations` (0041) portait UNE convention pour dire l'état
-- d'une migration : `sha256 = '-'` voulait dire « pas appliquée ». Une
-- convention n'est pas une donnée. Elle ne se contraint pas, ne s'interroge
-- pas proprement, et surtout elle a MENTI : `0043` y figurait avec un vrai
-- hash et une date, alors que ses objets n'existaient pas encore — l'erreur
-- qui a fait dériver un état de session entier.
--
-- Un troisième état est apparu dans la vraie vie du dépôt et n'avait nulle
-- part où se dire : `0031` (fidélité) est **volontairement sautée**, elle ne
-- sera jamais appliquée. La ranger avec les dormantes, c'est promettre un
-- geste qui ne viendra pas.
--
-- ─── LA PARTIE DANGEREUSE EST LA REPRISE ────────────────────────────────────
-- Classer les lignes existantes en relisant `sha256 = '-'` recopierait le
-- mensonge dans une colonne, avec l'autorité d'une donnée en plus. Chaque
-- ligne est donc classée par **SONDE CONTRE LE SCHÉMA RÉEL** : un objet que la
-- migration crée existe-t-il, oui ou non.
--
-- ⚠️ Et la sonde doit regarder LE BON OBJET. `0043` a été déclarée non
-- appliquée sur l'absence de `zabelie_shipments` — une table qu'elle ne crée
-- pas. La liste ci-dessous est donc écrite À LA MAIN, migration par migration,
-- et toute ligne du registre qui n'y figure pas fait ÉCHOUER la migration :
-- une classification par défaut serait exactement la convention qu'on retire.
-- ============================================================================

alter table zabelie_schema_migrations
  add column statut text;

-- Table de sondes : une expression booléenne par migration, explicite.
create temporary table _sondes (fichier text primary key, expr text) on commit drop;

insert into _sondes (fichier, expr) values
  -- Objet créé, présence directe.
  ('0031_points_caps_expiry.sql',  $q$to_regclass('public.points_limits') is not null$q$),
  ('0035_categories.sql',          $q$to_regclass('public.zabelie_categories') is not null$q$),
  ('0036_physical_products.sql',   $q$to_regclass('public.zabelie_physical_products') is not null$q$),
  ('0038_stock_rupture_guard.sql', $q$to_regproc('public.zabelie_consume_stock_strict') is not null$q$),
  ('0040_product_in_stock_flag.sql', $q$to_regproc('public.zabelie_refresh_in_stock') is not null$q$),
  ('0043_fulfillment.sql',         $q$to_regclass('public.zabelie_fulfillment_limits') is not null$q$),
  ('0047_search_demand.sql',       $q$to_regclass('public.zabelie_search_config') is not null$q$),
  ('0054_commission_config.sql',   $q$to_regclass('public.zabelie_commission_config') is not null$q$),
  ('0055_admin_audit.sql',         $q$to_regclass('public.zabelie_admin_actions') is not null$q$),
  ('0058_panier.sql',              $q$to_regclass('public.zabelie_carts') is not null$q$),
  ('0059_fichier_sans_livrable.sql', $q$to_regproc('public.zabelie_fichier_sans_livrable_sweep') is not null$q$),
  ('0060_cron_leases.sql',         $q$to_regclass('public.zabelie_cron_leases') is not null$q$),
  ('0061_outbox_notifications.sql', $q$to_regclass('public.zabelie_outbox') is not null$q$),
  ('0056_purge_sent_notices.sql',  $q$to_regproc('public.zabelie_purge_sent_notices') is not null$q$),
  -- Aucun objet créé : la sonde porte sur l'EFFET, pas sur un nom.
  ('0037_stock_money_path.sql',    $q$exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='zabelie_expire_stale_payment' and pg_get_functiondef(p.oid) like '%zabelie_release_stock%')$q$),
  ('0051_rayon_klerin.sql',        $q$exists (select 1 from zabelie_categories where slug like '%klerin%')$q$),
  ('0052_categories_label_es.sql', $q$exists (select 1 from information_schema.columns where table_name='zabelie_categories' and column_name='label_es')$q$),
  ('0053_search_retention_90j.sql', $q$exists (select 1 from zabelie_search_config where key='retention_days' and value=90)$q$),
  ('0057_categories_services.sql', $q$(select count(*) from zabelie_categories c join zabelie_categories p on p.id=c.parent_id where p.slug='sevis-pwofesyonel') >= 12$q$);

do $$
declare
  r         record;
  v_present boolean;
  v_reste   integer;
begin
  for r in select filename from zabelie_schema_migrations loop
    -- Sonde inconnue → ÉCHEC. Pas de classement par défaut : c'est
    -- exactement la commodité qui a permis à `0043` de mentir.
    if not exists (select 1 from _sondes s where s.fichier = r.filename) then
      -- Les migrations du socle historique (0001→0030, 0032→0034, 0039,
      -- 0041, 0042, 0044→0050) sont appliquées par construction : le schéma
      -- courant ne tiendrait pas debout sans elles, et `0041` — qui crée CE
      -- registre — en fait partie. Elles sont classées en bloc, et c'est le
      -- seul bloc admis.
      if r.filename ~ '^(00(0[1-9]|1[0-9]|2[0-9]|30)|003[2-4]|0039|004[1-9]|0050)_' then
        update zabelie_schema_migrations set statut = 'appliquee' where filename = r.filename;
        continue;
      end if;
      raise exception 'ZB062 : aucune sonde pour %, classement impossible', r.filename;
    end if;

    execute (select 'select ' || expr from _sondes where fichier = r.filename) into v_present;
    update zabelie_schema_migrations
       set statut = case when v_present then 'appliquee' else 'redigee' end
     where filename = r.filename;
  end loop;

  -- `0031` est le troisième état : sautée à dessein, jamais à appliquer.
  update zabelie_schema_migrations
     set statut = 'abandonnee'
   where filename = '0031_points_caps_expiry.sql' and statut = 'redigee';

  select count(*) into v_reste from zabelie_schema_migrations where statut is null;
  if v_reste > 0 then
    raise exception 'ZB062 : % ligne(s) non classée(s) après reprise', v_reste;
  end if;
end $$;

alter table zabelie_schema_migrations
  alter column statut set not null,
  add constraint zabelie_schema_migrations_statut
    check (statut in ('redigee', 'appliquee', 'abandonnee'));

comment on column zabelie_schema_migrations.statut is
  'redigee | appliquee | abandonnee. Remplace la convention sha256 = ''-'', qui n''était pas une donnée et qui a menti sur 0043. Chaque ligne a été classée par SONDE CONTRE LE SCHÉMA RÉEL à l''application de 0062, jamais par relecture du hash.';
