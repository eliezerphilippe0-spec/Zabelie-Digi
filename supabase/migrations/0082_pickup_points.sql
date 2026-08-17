select zabelie_migration_garde('0082_pickup_points.sql');

-- ============================================================================
-- 0082 — POINTS DE RETRAIT : le modèle « station » de Jumia, sans le capital
-- ============================================================================
-- Signal porteur du 2026-08-15 : « implémente tout ce qui manque, avancer ».
-- Spec : docs/37 (gap logistique) — la boutique partenaire qui reçoit les
-- colis contre une petite commission est la seule voie de livraison physique
-- réaliste sur ce terrain : pas de poste fiable, pas d'adressage normalisé.
--
-- ─── CE QUE CETTE MIGRATION EST, ET N'EST PAS ──────────────────────────────
-- Un RÉPERTOIRE, administré à la main. Le recrutement des boutiques est un
-- travail d'OPÉRATIONS — le code ne fait que le porter. Dormante à zéro
-- point : rien ne s'affiche nulle part tant que l'admin n'a rien créé.
-- Le câblage acheteur (choisir un point au moment de la livraison) viendra
-- quand des points EXISTERONT — un sélecteur vide est une promesse vide.
-- La commission du point de retrait est un paramètre commercial NON TRANCHÉ :
-- aucun montant ici, la colonne viendra avec l'arbitrage porteur.
-- ============================================================================

create table zabelie_pickup_points (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null check (char_length(btrim(nom)) between 2 and 80),
  -- Rattachement à la géographie existante (0069) — nullable : un point peut
  -- précéder le découpage de sa zone.
  zone_id    uuid references zabelie_zones (id) on delete set null,
  adresse    text not null check (char_length(btrim(adresse)) between 5 and 300),
  telefon    text check (telefon is null or char_length(btrim(telefon)) between 6 and 30),
  actif      boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index zabelie_pickup_actif_idx on zabelie_pickup_points (actif, position);
comment on table zabelie_pickup_points is
  'Points de retrait partenaires (docs/37, modèle station Jumia). actif=false à la création : un point s''ouvre quand l''accord avec la boutique est réel, pas quand la ligne existe.';

alter table zabelie_pickup_points enable row level security;
-- L'acheteur ne voit que les points OUVERTS ; l'inventaire complet est admin.
create policy zabelie_pickup_public_read on zabelie_pickup_points
  for select using (actif);
-- Aucune policy d'écriture : service-role seul (route admin, journalisée 0055).

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from zabelie_pickup_points) <> 0 then
    raise exception '0082 KO: la table doit naître vide';
  end if;
  if exists (
    select 1 from pg_policies
     where tablename = 'zabelie_pickup_points' and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception '0082 KO: une policy d''écriture ouvre la table';
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'zabelie_pickup_points' and cmd = 'SELECT'
       and qual = 'actif'
  ) then
    raise exception '0082 KO: la lecture publique doit être filtrée sur actif';
  end if;
end $$;
