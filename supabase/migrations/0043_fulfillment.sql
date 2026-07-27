-- ============================================================================
-- 0043 — État d'EXPÉDITION et maturation liée à la remise (produits physiques)
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. Trois valeurs commerciales attendent l'arbitrage du
--    porteur (§0). Elles vivent en table de config, jamais en dur.
--
-- LE TROU QU'ELLE FERME. Aujourd'hui :
--   • `orders.status` n'atteint `delivered` que par la route de
--     téléchargement — une commande physique reste `paid` À VIE ;
--   • `mature_wallets()` ne regarde que `matures_at <= now()` : le vendeur
--     d'une pièce détachée est payé au chronomètre, que l'objet ait changé de
--     mains ou non.
-- Les deux ensemble institutionnalisent « m te peye, m pa janm resevwa » :
-- l'acheteur a payé, le vendeur est crédité, et rien dans le système ne sait
-- si la remise a eu lieu.
--
-- CE QU'ON NE PEUT PAS FAIRE, ET POURQUOI ÇA CADRE LA CONCEPTION.
-- Zabelie ne livre pas : ni flotte, ni entrepôt, ni contrat transporteur, ni
-- numéro de suivi à interroger. La plateforme n'OBSERVE donc jamais la
-- remise — elle ne peut qu'enregistrer ce que les deux parties DÉCLARENT.
-- Toute la machine à états découle de là : deux déclarations, un délai qui
-- tranche en cas de silence, et une sortie dans les deux sens.
--
-- SYMÉTRIE DES SILENCES — le point qui compte le plus.
--   • L'acheteur se tait après remise → au bout de `auto_receive_days`, la
--     commande est réputée reçue. Sans ça, un acheteur distrait bloquerait le
--     vendeur indéfiniment.
--   • LE VENDEUR se tait → au bout de `shipment_deadline_days`, la commande
--     bascule en remboursement. C'est la moitié qu'on oublie toujours : sans
--     elle, une commande jamais honorée garderait l'argent de l'acheteur sur
--     le compte marchand SANS LIMITE DE DURÉE — exactement la rétention que
--     le dossier BRH décrit (docs/17). Un état d'expédition qui n'a pas de
--     sortie côté vendeur ne fait que déplacer le problème.
--
-- CE QU'ELLE NE FAIT PAS : aucun litige automatisé, aucune preuve de remise,
-- aucun arbitrage. Un désaccord va en `disputed` et se règle à la main —
-- c'est le checkpoint humain, pas un défaut de conception.
-- ============================================================================

-- ── 0. Paramètres — EN ATTENTE D'ARBITRAGE PORTEUR ──────────────────────────
-- Valeurs proposées, pas décidées. Elles se changent par UPDATE, sans
-- migration. Ce qui suit est le raisonnement derrière chaque proposition ;
-- le porteur tranche.

create table zabelie_fulfillment_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);

insert into zabelie_fulfillment_limits (key, value, comment) values
  ('shipment_deadline_days', 5,
   'Délai laissé au vendeur pour DÉCLARER la remise après paiement. Passé ce délai, la commande devient remboursable — c''est la sortie côté acheteur. 5 jours : de quoi couvrir un week-end et un déplacement en province sans immobiliser l''argent une semaine entière. À ARBITRER.'),
  ('auto_receive_days', 7,
   'Délai après déclaration de remise au terme duquel la commande est réputée reçue faute de réponse de l''acheteur. Protège le vendeur d''un acheteur silencieux. 7 jours : au-delà, on retient l''argent d''une vente probablement honorée. À ARBITRER.'),
  ('post_receipt_maturation_days', 0,
   'Délai supplémentaire entre la réception confirmée et la disponibilité des fonds. 0 = le J+7 d''escrow a déjà couru pendant l''expédition, inutile d''en ajouter. Mettre > 0 seulement si l''on veut une fenêtre de réclamation APRÈS réception. À ARBITRER.')
on conflict (key) do nothing;  -- config d'exploitation : jamais réécrite au rejeu

alter table zabelie_fulfillment_limits enable row level security;
revoke all on zabelie_fulfillment_limits from anon, authenticated;

-- ── 1. La machine à états, dans sa propre table ─────────────────────────────
-- `order_status` n'est PAS étendue : ajouter une valeur à une énumération est
-- une porte à sens unique (leçon de `0036`), et `delivered` y signifie déjà
-- « remis ». Table séparée = additif, réversible, et le flux digital n'est
-- pas touché d'une ligne.

create type fulfillment_status as enum (
  'awaiting_shipment',  -- payé, le vendeur n'a rien déclaré
  'shipped',            -- le vendeur déclare avoir remis / expédié
  'received',           -- l'acheteur confirme (ou délai d'auto-réception)
  'refund_required'     -- le vendeur n'a rien déclaré à temps
);

create table zabelie_fulfillment (
  order_id      uuid primary key references orders (id) on delete cascade,
  status        fulfillment_status not null default 'awaiting_shipment',
  -- Ce que le vendeur déclare. Texte libre et court : « remis en main propre
  -- à Delmas », « envoyé par Sanon Express ». Zabelie n'en vérifie rien et ne
  -- doit pas laisser croire le contraire.
  shipment_note text,
  shipped_at    timestamptz,
  received_at   timestamptz,
  -- Qui a mis fin à l'attente : le déclarant, ou le système par délai.
  received_by   uuid references profiles (id),
  auto_received boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index zabelie_fulfillment_due_idx
  on zabelie_fulfillment (status, shipped_at, created_at);

alter table zabelie_fulfillment enable row level security;

-- Lecture : l'acheteur de la commande et le vendeur du produit.
create policy zabelie_fulfillment_buyer_read on zabelie_fulfillment
  for select using (
    exists (select 1 from orders o
             where o.id = zabelie_fulfillment.order_id and o.buyer_id = auth.uid())
  );
create policy zabelie_fulfillment_seller_read on zabelie_fulfillment
  for select using (
    exists (select 1 from orders o
              join products p on p.id = o.product_id
             where o.id = zabelie_fulfillment.order_id and p.seller_id = auth.uid())
  );
-- Aucune écriture directe : tout passe par les RPC ci-dessous.
revoke insert, update, delete on zabelie_fulfillment from anon, authenticated;

-- ── 2. Escrow : ne plus mûrir au chronomètre pour un physique ───────────────
-- `gated_on_delivery` bloque la maturation tant que la remise n'est pas
-- actée. `mature_wallets()` l'ignore ; la réception le lève en fixant
-- `matures_at`. Le montant, lui, ne bouge pas : on ne touche pas au grand
-- livre, on déplace une échéance.

alter table escrow_entries
  add column gated_on_delivery boolean not null default false;

create or replace function mature_wallets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with matured as (
    update escrow_entries
       set status = 'matured'
     where status = 'maturing'
       and matures_at <= now()
       -- SEULE ligne ajoutée : une entrée dont la remise n'est pas actée ne
       -- mûrit pas, quel que soit le temps écoulé.
       and not gated_on_delivery
    returning wallet_id, amount_htg
  ), agg as (
    select wallet_id, sum(amount_htg) as amt, count(*) as n
      from matured group by wallet_id
  ), upd as (
    update wallets w
       set pending_htg = w.pending_htg - a.amt,
           balance_htg = w.balance_htg + a.amt
      from agg a
     where w.id = a.wallet_id
    returning a.n
  )
  select coalesce(sum(n), 0) into v_count from upd;
  return v_count;
end;
$$;
revoke all on function mature_wallets() from public, anon, authenticated;

-- ── 3. Ouverture du suivi à la confirmation de paiement ─────────────────────
-- Appelée par `confirm_payment` (branchement en §6). Ne fait rien pour un
-- produit non physique : le flux digital reste identique au bit près.

create function zabelie_open_fulfillment(p_order_id uuid)
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

  if v_kind is distinct from 'physical' then
    return false;
  end if;

  insert into zabelie_fulfillment (order_id)
  values (p_order_id)
  on conflict (order_id) do nothing;   -- idempotent : webhook rejoué

  -- L'escrow de cette commande ne mûrira pas au chronomètre.
  update escrow_entries
     set gated_on_delivery = true
   where order_id = p_order_id and status = 'maturing';

  return true;
end;
$$;
revoke all on function zabelie_open_fulfillment(uuid) from public, anon, authenticated;

-- ── 4. Déclarations ─────────────────────────────────────────────────────────

-- Le VENDEUR déclare la remise. Vérifie qu'il est bien le vendeur : un
-- identifiant fourni par le client ne fait jamais autorité.
create function zabelie_declare_shipment(
  p_order_id uuid,
  p_user_id  uuid,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_status fulfillment_status;
begin
  select p.seller_id into v_seller
    from orders o join products p on p.id = o.product_id
   where o.id = p_order_id;
  if v_seller is null then
    return jsonb_build_object('ok', false, 'reason', 'commande_introuvable');
  end if;
  if v_seller <> p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'non_autorise');
  end if;

  select status into v_status from zabelie_fulfillment
   where order_id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'suivi_absent');
  end if;
  if v_status = 'shipped' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_status <> 'awaiting_shipment' then
    return jsonb_build_object('ok', false, 'reason', 'etat_incompatible',
                              'status', v_status::text);
  end if;

  update zabelie_fulfillment
     set status = 'shipped',
         shipped_at = now(),
         shipment_note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where order_id = p_order_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_declare_shipment(uuid, uuid, text)
  from public, anon, authenticated;

-- Réception : confirmée par l'ACHETEUR, ou prononcée par le système au terme
-- du délai. Un seul chemin d'écriture pour les deux, donc un seul endroit où
-- l'escrow se débloque.
create function zabelie_mark_received(
  p_order_id uuid,
  p_user_id  uuid default null,   -- null = prononcé par le système
  p_auto     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer  uuid;
  v_status fulfillment_status;
  v_delay  integer;
begin
  select o.buyer_id into v_buyer from orders o where o.id = p_order_id;
  if v_buyer is null then
    return jsonb_build_object('ok', false, 'reason', 'commande_introuvable');
  end if;
  if not p_auto and (p_user_id is null or p_user_id <> v_buyer) then
    return jsonb_build_object('ok', false, 'reason', 'non_autorise');
  end if;

  select status into v_status from zabelie_fulfillment
   where order_id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'suivi_absent');
  end if;
  if v_status = 'received' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- On ne confirme que ce qui a été déclaré remis : sinon un acheteur pourrait
  -- libérer les fonds d'une commande que le vendeur n'a pas honorée.
  if v_status <> 'shipped' then
    return jsonb_build_object('ok', false, 'reason', 'pas_encore_expedie',
                              'status', v_status::text);
  end if;

  update zabelie_fulfillment
     set status = 'received', received_at = now(),
         received_by = case when p_auto then null else p_user_id end,
         auto_received = p_auto, updated_at = now()
   where order_id = p_order_id;

  -- La commande atteint enfin `delivered` — l'impasse de /mes-achats se ferme.
  update orders set status = 'delivered'
   where id = p_order_id and status = 'paid';

  -- L'escrow peut mûrir : on lève le verrou et on fixe l'échéance.
  select coalesce(max(value), 0) into v_delay
    from zabelie_fulfillment_limits where key = 'post_receipt_maturation_days';
  update escrow_entries
     set gated_on_delivery = false,
         matures_at = greatest(matures_at, now() + make_interval(days => v_delay))
   where order_id = p_order_id and status = 'maturing';

  return jsonb_build_object('ok', true, 'duplicate', false, 'auto', p_auto);
end;
$$;
revoke all on function zabelie_mark_received(uuid, uuid, boolean)
  from public, anon, authenticated;

-- ── 5. Le cron des deux silences ────────────────────────────────────────────
-- Un seul passage traite les deux côtés. Journalise ses compteurs même à
-- zéro (règle d'observabilité, CLAUDE.md) : c'est la route qui le fait.

create function zabelie_fulfillment_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto     integer := 0;
  v_overdue  integer := 0;
  v_recv     integer;
  v_ship     integer;
  r          record;
begin
  select coalesce(max(value), 7) into v_recv
    from zabelie_fulfillment_limits where key = 'auto_receive_days';
  select coalesce(max(value), 5) into v_ship
    from zabelie_fulfillment_limits where key = 'shipment_deadline_days';

  -- (a) Acheteur silencieux après remise → réception prononcée.
  for r in
    select order_id from zabelie_fulfillment
     where status = 'shipped'
       and shipped_at < now() - make_interval(days => v_recv)
     for update skip locked
  loop
    perform zabelie_mark_received(r.order_id, null, true);
    v_auto := v_auto + 1;
  end loop;

  -- (b) Vendeur silencieux → la commande devient remboursable. On NE
  -- rembourse pas ici : `refund_order` touche le grand livre et la décision
  -- de rendre l'argent mérite un passage humain (même principe que la vue
  -- des ruptures, 0038). On marque, l'admin exécute.
  for r in
    select order_id from zabelie_fulfillment
     where status = 'awaiting_shipment'
       and created_at < now() - make_interval(days => v_ship)
     for update skip locked
  loop
    update zabelie_fulfillment
       set status = 'refund_required', updated_at = now()
     where order_id = r.order_id;
    update orders set status = 'disputed'
     where id = r.order_id and status = 'paid';
    v_overdue := v_overdue + 1;
  end loop;

  return jsonb_build_object('auto_recus', v_auto, 'a_rembourser', v_overdue);
end;
$$;
revoke all on function zabelie_fulfillment_sweep() from public, anon, authenticated;

-- File d'attente de l'admin : commandes payées que le vendeur n'a jamais
-- honorées. Même rôle que `zabelie_stock_ruptures` — rendre visible ce qui
-- exige une main humaine.
create view zabelie_fulfillment_overdue as
select f.order_id,
       o.order_ref,
       o.amount_htg,
       o.buyer_id,
       p.seller_id,
       p.title as product_title,
       f.created_at as paid_at,
       now() - f.created_at as attente
  from zabelie_fulfillment f
  join orders o   on o.id = f.order_id
  join products p on p.id = o.product_id
 where f.status = 'refund_required';

revoke all on zabelie_fulfillment_overdue from anon, authenticated;

-- ── 6. Branchement dans confirm_payment ─────────────────────────────────────
-- ⚠️ REMPLACE `confirm_payment`. À appliquer APRÈS `0038` (dont elle reprend
-- le corps à l'identique) — l'ajout tient en un appel, juste après l'escrow.
-- Le flux digital est inchangé : `zabelie_open_fulfillment` sort tout de suite
-- si le produit n'est pas physique.

-- NOTE D'APPLICATION : le corps complet de `confirm_payment` version 0038 doit
-- être recopié ici avec l'appel ajouté. Il n'est PAS dupliqué dans ce fichier
-- tant que les trois paramètres du §0 ne sont pas arbitrés — recopier une
-- fonction du money-path pour la laisser diverger d'une revue à l'autre est
-- précisément ce qu'on cherche à éviter. Voir docs/21 §5.
