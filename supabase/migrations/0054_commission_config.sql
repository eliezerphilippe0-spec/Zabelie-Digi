-- ============================================================================
-- 0054 — Commissions en table de configuration (chantier 3, charte v3.1 §9)
-- ============================================================================
-- ⚠️ ÉCRITE, NON APPLIQUÉE. Application manuelle par le porteur, après revue,
--    avec vérification connu-positif / connu-négatif (docs/25).
--
-- CE QU'ELLE CHANGE. Les taux vivaient EN DUR dans `commission_rate_bps`
-- (0005 : `case p_tier when 'elite' then 600 else 1000 end`) — en
-- contradiction avec la règle « tout paramètre commercial vit en table de
-- config » (CLAUDE.md §Argent), assumée jusqu'ici comme dette. Cette
-- migration déplace les taux en base SANS toucher au reste du money-path :
-- `commission_rate_bps` garde sa signature exacte, donc `confirm_payment`
-- (version 0044) et `zabelie_commission_htg` (floor, D-4) la consomment à
-- l'identique, sans être redéployées.
--
-- CE QU'ELLE NE CHANGE PAS. Les VALEURS : 10 % standard / 6 % Elite,
-- inchangées au seed. Changer un taux devient un UPDATE d'exploitation —
-- décision porteur, jamais une migration.
--
-- ⚠️ AFFICHAGE : `lib/commission.ts` (RATE_BPS) porte les mêmes constantes
-- pour l'ESTIMATION côté écran (`net-estimate`). Il ne calcule jamais un
-- montant facturé (SQL = seul calculateur d'argent), mais un taux modifié en
-- base sans mise à jour du fichier fera DIVERGER l'estimation affichée du
-- net réel. Tant qu'aucune API n'expose la config au front, tout UPDATE d'un
-- taux DOIT s'accompagner de la mise à jour de `lib/commission.ts` — inscrit
-- dans le commentaire de chaque ligne de config.

-- ── 1. La table ─────────────────────────────────────────────────────────────
create table zabelie_commission_config (
  tier       creator_tier primary key,
  -- Borne haute 30 % : un fat-finger (60000 au lieu de 600) doit échouer à
  -- l'écriture, pas se découvrir sur le net d'un vendeur.
  rate_bps   integer not null check (rate_bps between 0 and 3000),
  comment    text,
  updated_at timestamptz not null default now()
);

insert into zabelie_commission_config (tier, rate_bps, comment) values
  ('standard', 1000,
   'Taux standard — 10 %. Changer = UPDATE (décision porteur) + mise à jour de lib/commission.ts (estimation affichée).'),
  ('elite', 600,
   'Palier Elite — 6 %. Même règle de mise à jour que standard.')
on conflict (tier) do nothing;  -- rejeu : ne JAMAIS écraser un taux exploité

alter table zabelie_commission_config enable row level security;
revoke all on zabelie_commission_config from anon, authenticated;

-- ── 2. Un taux ne se supprime pas ───────────────────────────────────────────
-- Un DELETE ferait retomber la fonction sur son repli (§3) en silence : le
-- taux affiché en base et le taux appliqué divergeraient sans un signal.
-- Config = UPDATE seulement. (Le service role contourne la RLS, pas un
-- trigger.)
create function zabelie_commission_config_nodelete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'zabelie_commission_config: un taux ne se supprime pas, il se modifie (UPDATE)';
end;
$$;
revoke all on function zabelie_commission_config_nodelete() from public, anon, authenticated;

create trigger zabelie_commission_config_nodelete
  before delete on zabelie_commission_config
  for each row execute function zabelie_commission_config_nodelete();

-- ── 3. La fonction lit la config ────────────────────────────────────────────
-- Même signature que 0005 : tous les appelants (confirm_payment 0044,
-- factures Business) suivent sans redéploiement. `stable`, plus `immutable` :
-- elle lit une table désormais.
--
-- REPLI COALESCE — pourquoi il existe alors que le trigger interdit le
-- DELETE : il couvre le cas qu'aucun trigger ne peut couvrir, une valeur
-- AJOUTÉE à l'énumération `creator_tier` avant sa ligne de config. Sans
-- repli, le premier paiement d'un vendeur du nouveau palier serait une
-- exception sur le money-path — une vente perdue pour une ligne de config
-- manquante. Le repli rend les taux HISTORIQUES (0005), jamais zéro : un
-- oubli de config ne peut pas offrir 0 % de commission.
create or replace function commission_rate_bps(p_tier creator_tier)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select rate_bps from zabelie_commission_config where tier = p_tier),
    case p_tier when 'elite' then 600 else 1000 end
  );
$$;
revoke all on function commission_rate_bps(creator_tier) from public, anon, authenticated;
