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
-- L'AUTO-RÉCEPTION EST UN TRANSFERT DE PROPRIÉTÉ DÉCLENCHÉ PAR LE SILENCE.
-- Un silence ne vaut consentement que si la personne a su que l'horloge
-- tournait. Sans avis à l'acheteur au moment de la déclaration, PUIS rappel
-- avant l'échéance, on ne facture pas un silence : on exproprie quelqu'un qui
-- n'a jamais su. La notification acheteur est donc une DÉPENDANCE de cette
-- migration, pas une suite — d'où la file d'avis du §5.
--
-- BIAIS ASSUMÉ. L'acheteur type arrive par un lien WhatsApp, n'a pas
-- l'habitude du site et n'y reviendra pas ; le vendeur, lui, a un tableau de
-- bord. Le silence est donc structurellement plus probable côté acheteur :
-- le réglage par défaut, c'est « le vendeur est payé ». C'est défendable —
-- une marketplace qui ne paie jamais le vendeur n'a pas de vendeurs — mais
-- c'est un CHOIX, et la relance est ce qui le rend acceptable.
--
-- CE QU'ELLE NE FAIT PAS : aucun litige automatisé, aucune preuve de remise,
-- aucun arbitrage. Un désaccord attend une main humaine — c'est le
-- checkpoint, pas un défaut de conception.
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
   'ANCRE : confirmation du paiement. Délai laissé au vendeur pour DÉCLARER la remise (pas pour que le colis arrive — Zabelie ne suit rien). Passé ce délai, la commande demande une action humaine. 5 jours couvrent un week-end et un déplacement.'),
  ('auto_receive_days', 7,
   'ANCRE : déclaration de remise par le vendeur — JAMAIS le paiement. Les deux délais se CHAÎNENT : si celui-ci partait du paiement, un acheteur dont le vendeur déclare au 5e jour n''aurait que 2 jours pour réagir, et le chiffre ne voudrait rien dire. Passé ce délai sans réponse, la commande est réputée reçue.'),
  ('post_receipt_maturation_days', 0,
   'ANCRE : confirmation de réception. 0 — et l''argument est plus fort que la commodité : MonCash n''a PAS de rétrofacturation. Le J+7 digital protège d''une contestation bancaire qui n''existe pas sur ce rail. Retenir l''argent après une confirmation EXPLICITE de l''acheteur ne protège de rien : ça reconstitue la rétention (docs/17).'),
  ('dispute_weekly_ceiling', 5,
   'SEUIL POSÉ D''AVANCE, avant que la question soit chargée : au-delà de N litiges par semaine, le traitement manuel cesse d''être tenable. Tout litige atterrit chez le porteur, à la main, sans rétrofacturation pour aider. Franchi durablement → suspendre l''ouverture physique ou financer un vrai processus, pas serrer les dents.')
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
  -- « Aksyon obligatwa » : une main humaine doit trancher. VOLONTAIREMENT
  -- NEUTRE — `refund_required` présupposait l'issue. Le vendeur muet a très
  -- souvent remis de la main à la main sans rien cliquer : c'est le cas le
  -- plus fréquent sur ce marché. Nommer l'état « à rembourser » reviendrait à
  -- institutionnaliser le remboursement d'une commande honorée.
  'action_required',
  -- L'acheteur dit ne pas avoir reçu, avant l'échéance. Même traitement
  -- humain ; l'état distingue seulement QUI a levé la main.
  'disputed_by_buyer'
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
  v_recv   integer;
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

  -- Les deux avis à l'acheteur, dans CETTE transaction : l'avis immédiat et
  -- le rappel programmé à mi-parcours. Sans eux, l'auto-réception qui suivra
  -- serait un transfert de propriété sur un silence non informé.
  select coalesce(max(value), 7) into v_recv
    from zabelie_fulfillment_limits where key = 'auto_receive_days';

  insert into zabelie_fulfillment_notices (order_id, kind, due_at)
  values (p_order_id, 'shipped_buyer', now())
  on conflict (order_id, kind) do nothing;

  -- Rappel à mi-délai : assez tôt pour laisser le temps de réagir, assez tard
  -- pour ne pas se confondre avec le premier avis.
  insert into zabelie_fulfillment_notices (order_id, kind, due_at)
  values (p_order_id, 'reminder_buyer',
          now() + make_interval(days => greatest(v_recv / 2, 1)))
  on conflict (order_id, kind) do nothing;

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

  -- Avis final : l'acheteur doit apprendre que le délai a tranché pour lui.
  if p_auto then
    insert into zabelie_fulfillment_notices (order_id, kind, due_at)
    values (p_order_id, 'auto_received', now())
    on conflict (order_id, kind) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'auto', p_auto);
end;
$$;
revoke all on function zabelie_mark_received(uuid, uuid, boolean)
  from public, anon, authenticated;

-- ── 4 bis. Le chemin « je n'ai pas reçu », AVANT l'échéance ─────────────────
-- Sans lui, la seule protection de l'acheteur serait de ne rien faire — or ne
-- rien faire est précisément le geste qui paie le vendeur. Il lui faut un
-- bouton, et il doit exister avant que l'horloge n'expire.

create function zabelie_report_not_received(
  p_order_id uuid,
  p_user_id  uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer  uuid;
  v_status fulfillment_status;
begin
  select o.buyer_id into v_buyer from orders o where o.id = p_order_id;
  if v_buyer is null then
    return jsonb_build_object('ok', false, 'reason', 'commande_introuvable');
  end if;
  if p_user_id is distinct from v_buyer then
    return jsonb_build_object('ok', false, 'reason', 'non_autorise');
  end if;

  select status into v_status from zabelie_fulfillment
   where order_id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'suivi_absent');
  end if;
  if v_status = 'disputed_by_buyer' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- Une fois la réception actée (par lui ou par délai), le litige sort de ce
  -- mécanisme : il se règle hors flux, à la main.
  if v_status = 'received' then
    return jsonb_build_object('ok', false, 'reason', 'deja_receptionne');
  end if;

  update zabelie_fulfillment
     set status = 'disputed_by_buyer',
         shipment_note = coalesce(shipment_note, '') ||
           case when nullif(btrim(coalesce(p_reason, '')), '') is null then ''
                else ' | acheteur : ' || btrim(p_reason) end,
         updated_at = now()
   where order_id = p_order_id;

  -- L'escrow RESTE verrouillé : c'est tout l'intérêt d'avoir levé la main
  -- avant l'échéance.
  update orders set status = 'disputed'
   where id = p_order_id and status = 'paid';

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function zabelie_report_not_received(uuid, uuid, text)
  from public, anon, authenticated;

-- ── 5. File d'AVIS — la condition de légitimité de l'auto-réception ─────────
-- Écrite DANS la transaction qui change l'état ; l'envoi est asynchrone et
-- rejouable. Idempotence par (order_id, kind) : un rejeu ne prévient pas deux
-- fois. Append-only sur le contenu — seul le statut d'envoi évolue.

create type fulfillment_notice_kind as enum (
  'shipped_buyer',    -- « le vendeur déclare avoir remis » + l'horloge tourne
  'reminder_buyer',   -- rappel AVANT l'échéance d'auto-réception
  'auto_received'     -- « faute de réponse, la commande est réputée reçue »
);

create table zabelie_fulfillment_notices (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  kind       fulfillment_notice_kind not null,
  due_at     timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint fulfillment_notice_unique unique (order_id, kind)
);
create index zabelie_notices_due_idx on zabelie_fulfillment_notices (due_at)
  where sent_at is null;

alter table zabelie_fulfillment_notices enable row level security;
revoke all on zabelie_fulfillment_notices from anon, authenticated;

-- ── 6. Le cron des deux silences ────────────────────────────────────────────
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
  v_rappels  integer := 0;
  v_recv     integer;
  v_ship     integer;
  r          record;
begin
  select coalesce(max(value), 7) into v_recv
    from zabelie_fulfillment_limits where key = 'auto_receive_days';
  select coalesce(max(value), 5) into v_ship
    from zabelie_fulfillment_limits where key = 'shipment_deadline_days';

  -- (a) Acheteur silencieux après remise → réception prononcée.
  -- CONDITION DE LÉGITIMITÉ : les deux avis doivent être PARTIS. Un acheteur
  -- qu'on n'a pas pu joindre n'a pas gardé le silence — on ne sait rien de
  -- lui. Tant qu'un avis est en attente ou en échec, la commande reste
  -- `shipped` et l'escrow verrouillé : le vendeur attend, mais personne n'est
  -- exproprié.
  for r in
    select f.order_id from zabelie_fulfillment f
     where f.status = 'shipped'
       and f.shipped_at < now() - make_interval(days => v_recv)
       and not exists (
         select 1 from zabelie_fulfillment_notices n
          where n.order_id = f.order_id
            and n.kind in ('shipped_buyer', 'reminder_buyer')
            and n.sent_at is null)
     for update skip locked
  loop
    perform zabelie_mark_received(r.order_id, null, true);
    v_auto := v_auto + 1;
  end loop;

  -- Avis en attente d'envoi (le compteur sert au journal du cron : un envoi
  -- qui ne part jamais doit se voir).
  select count(*) into v_rappels from zabelie_fulfillment_notices
   where sent_at is null and due_at <= now();

  -- (b) Vendeur silencieux → ACTION REQUISE, pas remboursement. On ne
  -- présuppose rien : sur ce marché, une remise en main propre sans clic est
  -- le cas courant. On marque, un humain tranche entre « relancer le
  -- vendeur », « confirmer la remise » et « rembourser ».
  for r in
    select order_id from zabelie_fulfillment
     where status = 'awaiting_shipment'
       and created_at < now() - make_interval(days => v_ship)
     for update skip locked
  loop
    update zabelie_fulfillment
       set status = 'action_required', updated_at = now()
     where order_id = r.order_id;
    update orders set status = 'disputed'
     where id = r.order_id and status = 'paid';
    v_overdue := v_overdue + 1;
  end loop;

  return jsonb_build_object('auto_recus', v_auto, 'action_requise', v_overdue,
                            'rappels_dus', v_rappels);
end;
$$;
revoke all on function zabelie_fulfillment_sweep() from public, anon, authenticated;

-- File d'attente de l'admin : commandes payées que le vendeur n'a jamais
-- honorées. Même rôle que `zabelie_stock_ruptures` — rendre visible ce qui
-- exige une main humaine.
-- File d'attente humaine — les deux causes réunies : vendeur muet ET acheteur
-- qui signale une non-réception. Le nom ne présume d'aucune issue.
create view zabelie_fulfillment_overdue as
select f.order_id,
       o.order_ref,
       o.amount_htg,
       o.buyer_id,
       p.seller_id,
       p.title as product_title,
       f.status,
       f.created_at as paid_at,
       now() - f.created_at as attente
  from zabelie_fulfillment f
  join orders o   on o.id = f.order_id
  join products p on p.id = o.product_id
 where f.status in ('action_required', 'disputed_by_buyer');

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
