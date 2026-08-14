select zabelie_migration_garde('0068_service_rendu.sql');

-- ============================================================================
-- 0068 — « RENDU » POUR UNE PRESTATION : le service entre dans la machine
-- ============================================================================
-- SRV-01b de `docs/REVUE-KINDS-2026-08-13.md`, le constat 🔴 du kind `service` :
-- un service payé mûrissait au chronomètre — `zabelie_open_fulfillment`
-- rendait `false` pour tout ce qui n'est pas `physical` (`0043:202-204`), donc
-- aucun état de remise, aucun verrou d'escrow, le vendeur payé à J+7 pour une
-- prestation que rien n'oblige à rendre, et l'acheteur sans état où accrocher
-- un litige. Le cahier des charges documente cette exposition mot pour mot
-- (`docs/26` §services) et l'avait acceptée SOUS CONDITION d'un seuil de
-- sortie — posé le 2026-08-13. Cette migration livre le chantier que le seuil
-- borne.
--
-- ─── LA DÉCOUVERTE QUI RÉDUIT CE CHANTIER AU DIXIÈME DE SA TAILLE ───────────
-- Mesuré avant d'écrire : la machine de `0043` est déjà AGNOSTIQUE AU KIND
-- dans toutes ses entrailles. `zabelie_declare_shipment` vérifie le vendeur et
-- l'état, jamais le kind ; `zabelie_mark_received` fait déjà tout (commande
-- `delivered`, déverrouillage, échéance de maturation, avis d'auto-réception) ;
-- et DEUX des trois branches du sweep — l'auto-réception au silence de
-- l'acheteur (`0043:561-573`) et le vendeur silencieux (`0043:616-628`) — ne
-- filtrent PAS par kind : elles opèrent sur les lignes de suivi, quelles
-- qu'elles soient.
--
-- Le kind n'est comparé qu'à DEUX endroits : la porte d'entrée
-- (`open_fulfillment`) et la branche orpheline du sweep (qui balaie les escrow
-- SANS ligne de suivi, `0043:518`). Ouvrir la porte aux services suffit donc à
-- leur donner TOUTE la machine — déclaration, acceptation, auto-acceptation,
-- avis, légitimité, escalade. Il ne manque que leur filet orphelin, écrit ici
-- en fonction séparée, pour la même raison que `0059` : on ne rouvre pas
-- 180 lignes de money-path pour en ajouter vingt.
--
-- ─── LES CHOIX, ET CE QU'ILS COÛTENT ────────────────────────────────────────
-- • **Mêmes délais que le physique** (`shipment_deadline_days` = 5,
--   `auto_receive_days` = 7). Le modèle Fiverr accepte à J+3 ; 7 jours est
--   plus protecteur pour l'acheteur, et surtout : un délai propre au service
--   exigerait de brancher par kind la branche d'auto-réception du sweep —
--   rouvrir le money-path. Les valeurs vivent en table de config : les
--   différencier plus tard est une décision porteur + une migration bornée,
--   pas un préalable.
-- • **Mêmes états, mêmes libellés**. « Le vendeur déclare avoir remis » couvre
--   honnêtement une prestation rendue, en quatre langues (`ship.state.*`,
--   `sales.declare.*` disent « remise », jamais « expédition »). Un vocabulaire
--   service dédié est de la finition, pas un préalable — et il se fera dans la
--   couche i18n, pas ici.
-- • **La sémantique de `received` change de nature, pas de mécanique** : pour
--   un physique c'est « j'ai le colis », pour un service « la prestation a eu
--   lieu ». Le garde de `mark_received` — on ne confirme que ce qui a été
--   déclaré — vaut identiquement : un acheteur ne peut pas libérer les fonds
--   d'une prestation que le vendeur n'a pas déclarée rendue.
--
-- ─── CE QUE CETTE MIGRATION NE CHANGE PAS ───────────────────────────────────
-- Aucune ligne d'argent, aucun taux, aucun état d'une commande EXISTANTE.
-- Mesuré le 2026-08-13 : 0 commande de service payée, 0 escrow — le premier
-- service payé après cette migration naîtra verrouillé ; aucun dossier
-- rétroactif n'existe. Le kind `fichier` reste hors machine (sa remise EST le
-- téléchargement, `0059` porte son filet).
-- ============================================================================

-- ── 1. La porte d'entrée admet les services ─────────────────────────────────
-- Signature inchangée : les trois rails (`moncash/return`, `stripe/webhook`,
-- `admin/confirm-zelle`) passent par `lib/fulfillment.ts:197` et suivent sans
-- redéploiement.
create or replace function zabelie_open_fulfillment(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind product_kind;
begin
  select p.kind into v_kind
    from orders o join products p on p.id = o.product_id
   where o.id = p_order_id;

  -- `physical` : la remise d'un colis. `service` : la prestation (0068).
  -- `fichier` reste dehors — sa remise EST le téléchargement, et son filet
  -- vit dans 0059. Liste EXPLICITE, jamais un `<>` : un kind ajouté à
  -- l'énumération ne doit pas hériter d'un verrou d'escrow par accident.
  if v_kind is null or v_kind not in ('physical', 'service') then
    return false;
  end if;

  insert into zabelie_fulfillment (order_id)
  values (p_order_id)
  on conflict (order_id) do nothing;   -- idempotent : webhook rejoué

  update escrow_entries
     set gated_on_delivery = true
   where order_id = p_order_id and status = 'maturing';

  return true;
end;
$$;
revoke all on function zabelie_open_fulfillment(uuid) from public, anon, authenticated;

comment on function zabelie_open_fulfillment(uuid) is
  'Ouvre le suivi de remise et verrouille la maturation. physical (0043) et service (0068) ; fichier reste hors machine — sa remise est le téléchargement (0059). Idempotent.';

-- ── 2. Le filet orphelin des services ───────────────────────────────────────
-- Miroir de la branche orpheline de `0043` (`kind = 'physical'`), pour les
-- services : un escrow confirmé depuis plus de `orphan_grace_hours` SANS ligne
-- de suivi est un service que la machine n'a pas vu — appel d'ouverture omis
-- ou raté. Fonction séparée, comme `0059` : adjacente à l'argent, jamais
-- dedans.
create function zabelie_service_sans_suivi_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace    integer;
  v_repare   integer := 0;
  v_tardif   integer := 0;
  r          record;
begin
  select coalesce(max(value), 6) into v_grace
    from zabelie_fulfillment_limits where key = 'orphan_grace_hours';

  for r in
    select e.order_id,
           e.status as escrow_status,
           c.confirmed_at
      from escrow_entries e
      join orders   o on o.id = e.order_id
      join products p on p.id = o.product_id
      cross join lateral (
        select min(pay.confirmed_at) as confirmed_at
          from payments pay
         where pay.order_id = e.order_id and pay.status = 'confirmed'
      ) c
     where p.kind = 'service'
       and c.confirmed_at is not null
       and c.confirmed_at < now() - make_interval(hours => v_grace)
       and not exists (
         select 1 from zabelie_fulfillment f where f.order_id = e.order_id)
       and (e.status <> 'maturing' or e.gated_on_delivery = false)
     for update of e skip locked
  loop
    if r.escrow_status = 'maturing' then
      -- RÉPARABLE : l'argent est encore là — on ouvre et on verrouille.
      perform zabelie_open_fulfillment(r.order_id);
      -- Le délai vendeur part de la confirmation du PAIEMENT, pas de l'heure
      -- où le filet a réparé (même règle que 0043:532-537) : un oubli de la
      -- plateforme n'offre pas au vendeur autant de jours qu'elle a mis à
      -- s'en apercevoir.
      update zabelie_fulfillment
         set created_at = r.confirmed_at
       where order_id = r.order_id and created_at > r.confirmed_at;
      v_repare := v_repare + 1;
    else
      -- TARDIF : l'escrow a mûri, l'argent est parti. AUCUNE écriture sur
      -- `escrow_entries` — re-verrouiller un escrow mûri romprait l'identité
      -- de 0033 sans rien récupérer (même règle que 0043). Un humain prend
      -- le dossier.
      insert into zabelie_fulfillment (order_id, status, created_at)
      values (r.order_id, 'action_required', r.confirmed_at)
      on conflict (order_id)
        do update set status = 'action_required', updated_at = now();
      update orders set status = 'disputed'
       where id = r.order_id and status = 'paid';
      v_tardif := v_tardif + 1;
    end if;
  end loop;

  -- Les compteurs sortent MÊME À ZÉRO — sans eux, « le filet n'a pas tourné »
  -- et « il n'a rien trouvé » produisent le même vide.
  return jsonb_build_object('services_repares', v_repare,
                            'services_tardifs', v_tardif);
end;
$$;
revoke all on function zabelie_service_sans_suivi_sweep()
  from public, anon, authenticated;

comment on function zabelie_service_sans_suivi_sweep() is
  'Filet orphelin des services (0068, miroir de la branche physical de 0043) : un escrow de service confirmé sans ligne de suivi est réparé (ré-ouvert et verrouillé) tant que l''argent est là, porté à la file humaine sinon. N''écrit jamais sur escrow_entries dans le cas tardif.';

-- ── 3. POST-CONDITIONS — la migration prouve ce qu'elle affirme ─────────────
do $$
declare
  v_def text;
begin
  -- La porte admet le service PAR SA CONDITION, pas par un commentaire.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'zabelie_open_fulfillment';
  if v_def not like '%not in (''physical'', ''service'')%' then
    raise exception 'ZB068 : zabelie_open_fulfillment n''admet pas le kind service';
  end if;

  -- Et `fichier` reste DEHORS : le déclarer admis verrouillerait la paie de
  -- chaque vente de fichier derrière une « réception » que personne ne
  -- prononce — le téléchargement ne passe pas par la machine.
  if v_def like '%''fichier''%' then
    raise exception 'ZB068 : fichier est entre dans la machine de remise — sa remise est le telechargement (0059)';
  end if;

  if to_regproc('public.zabelie_service_sans_suivi_sweep') is null then
    raise exception 'ZB068 : filet orphelin service absent';
  end if;
end $$;
