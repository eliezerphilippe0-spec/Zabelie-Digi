select zabelie_migration_garde('0128_zabelie_paiement_groupe.sql');

-- 0128 — Panier multi-vendeurs : UN paiement pour N commandes.
--
-- Instruction porteur du 2026-10-04 (« Passe au panier multi vendeurs ») et
-- arbitrages du même jour :
--   • construit maintenant, mais DÉSACTIVÉ (`zabelie_panier_config.
--     paiement_groupe = false`) tant qu'une vente réelle n'a pas eu lieu —
--     l'arbitrage du 2026-08-21 (`docs/27` étape 3, `docs/22` étape 0 bis)
--     est levé pour la construction, pas pour l'activation ;
--   • rails : MonCash, NatCash (Kobara) et Stripe ensemble ; Zelle plus tard ;
--   • zéro frais plateforme ; un code promo ne réduit que les articles de
--     son vendeur.
--
-- ─── LA SCISSION, PAS LA REFONTE (`docs/27` §1) ─────────────────────────────
-- Le groupe est une couche AU-DESSUS : N commandes de la forme existante
-- (une par produit, un vendeur), chacune avec SON paiement, SON escrow, SA
-- maturation, SON suivi, SON remboursement. Rien du chemin de l'argent n'est
-- réécrit : `confirm_payment` et `zabelie_expire_stale_payment` reçoivent
-- chacune UNE branche, insérée dans leur définition EN BASE (méthode de
-- `0108`), jamais par recopie d'un fichier.
--
-- ⚠️ Pourquoi pas une recopie : `0108` ne redéfinit pas `confirm_payment`,
-- elle la RÉÉCRIT dynamiquement (`pg_get_functiondef` + `replace`) pour y
-- brancher la tarification vendeur. La dernière définition « écrite » (0081)
-- n'est donc PAS la fonction en service. La première version de cette
-- migration l'a recopiée : la suite SQL l'a refusée (`seller_pricing`,
-- « sandbox fee mismatch »). Les gardes ci-dessous rendent cette erreur
-- impossible à reproduire en silence.
--
-- ─── LA COMMANDE MENEUSE ────────────────────────────────────────────────────
-- L'opérateur reçoit UNE référence : celle de la première commande du groupe
-- (la « meneuse »), dont le paiement porte le vrai rail. Les autres paiements
-- portent le rail `groupe` : aucun réconciliateur ne les réclame, aucun
-- opérateur ne les connaît. Conséquence voulue : les SIX sites qui confirment
-- un paiement (retour MonCash, webhooks Kobara et Stripe, trois
-- réconciliateurs) restent INCHANGÉS — ils appellent `confirm_payment` sur la
-- meneuse avec le montant reçu, et la branche ci-dessous fait le reste.
--
-- ─── LES GARANTIES ──────────────────────────────────────────────────────────
-- • Montant : le TOTAL reçu est comparé au total du groupe, figé à la
--   préparation à partir des montants des commandes (eux-mêmes lus en base).
--   Écart → toutes les commandes en litige, stock relâché, aucun crédit.
-- • Tout ou rien : le groupe se confirme en UNE transaction ; une erreur dans
--   une commande annule tout. Une rupture de stock suit la voie existante
--   (commande payée en litige, remboursement à faire), jamais en silence.
-- • Rejeu : un groupe confirmé est un no-op.
-- • Invariant : Σ(commandes du groupe) = total du groupe, vérifié à la
--   confirmation — un écart annule la transaction.
-- • Expiration : la meneuse expire tout le groupe (stock relâché).

alter type payment_rail add value if not exists 'groupe';

-- Réglages : désactivé par défaut. L'activation est un `update` explicite.
create table zabelie_panier_config (
  id boolean primary key default true check (id),
  paiement_groupe boolean not null default false,
  max_articles integer not null default 10 check (max_articles between 2 and 50)
);
alter table zabelie_panier_config enable row level security;
revoke all on zabelie_panier_config from public, anon, authenticated;
grant all on zabelie_panier_config to service_role;
create policy zabelie_panier_config_server on zabelie_panier_config
  for all to service_role using (true) with check (true);
insert into zabelie_panier_config (id) values (true);

create table zabelie_order_groups (
  id                 uuid primary key default gen_random_uuid(),
  buyer_id           uuid not null references profiles (id) on delete restrict,
  rail               payment_rail not null check (rail in ('moncash', 'kobara', 'stripe')),
  status             text not null default 'preparation'
                     check (status in ('preparation', 'pending', 'confirmed', 'failed')),
  leader_order_id    uuid,
  total_htg          integer check (total_htg is null or total_htg > 0),
  expected_usd_cents integer check (expected_usd_cents is null or expected_usd_cents > 0),
  provider_ref       text,
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  -- Un groupe abandonné pendant la préparation (un article refusé) n'a jamais
  -- eu de meneuse : `failed` est admis sans elle. Trouvé par le test G9.
  check (status in ('preparation', 'failed') or (leader_order_id is not null and total_htg is not null)),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
alter table zabelie_order_groups enable row level security;
revoke all on zabelie_order_groups from public, anon, authenticated;
grant select on zabelie_order_groups to authenticated;
grant all on zabelie_order_groups to service_role;
create policy zabelie_order_groups_buyer_select on zabelie_order_groups
  for select to authenticated using (buyer_id = (select auth.uid()));
create policy zabelie_order_groups_server on zabelie_order_groups
  for all to service_role using (true) with check (true);

alter table orders add column group_id uuid references zabelie_order_groups (id) on delete restrict;
create index orders_group_idx on orders (group_id) where group_id is not null;
alter table zabelie_order_groups
  add constraint zabelie_order_groups_leader_fkey
  foreign key (leader_order_id) references orders (id) on delete set null;

-- Ouverture d'un groupe (service seul, l'acheteur vient de la session).
create function zabelie_group_create(p_buyer uuid, p_rail payment_rail)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (select paiement_groupe from zabelie_panier_config where id) then
    raise exception 'zabelie_group_create: paiement groupé désactivé' using errcode = 'P0001';
  end if;
  insert into zabelie_order_groups (buyer_id, rail) values (p_buyer, p_rail) returning id into v_id;
  return v_id;
end $$;
revoke all on function zabelie_group_create(uuid, payment_rail) from public, anon, authenticated;
grant execute on function zabelie_group_create(uuid, payment_rail) to service_role;

-- Scellement : les commandes sont prêtes, le total est FIGÉ depuis la base.
-- Exige : ≥ 2 commandes, toutes `pending`, toutes de l'acheteur du groupe, un
-- paiement chacune, exactement UNE meneuse (vrai rail) et les autres en rail
-- `groupe`, aucune commande gratuite.
create function zabelie_group_seal(p_group uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_g zabelie_order_groups;
  v_n integer; v_total bigint; v_usd bigint; v_usd_null integer;
  v_leader uuid; v_meneuses integer; v_bad integer;
begin
  select * into v_g from zabelie_order_groups where id = p_group for update;
  if not found or v_g.status <> 'preparation' then
    raise exception 'zabelie_group_seal: groupe absent ou déjà scellé';
  end if;
  select count(*), coalesce(sum(o.amount_htg), 0),
         coalesce(sum(p.expected_usd_cents), 0), count(*) filter (where p.expected_usd_cents is null),
         count(*) filter (where p.rail::text <> 'groupe'),
         count(*) filter (where o.status <> 'pending' or p.status <> 'pending'
                            or o.buyer_id <> v_g.buyer_id or o.amount_htg <= 0
                            or (p.rail::text <> 'groupe' and p.rail <> v_g.rail))
    into v_n, v_total, v_usd, v_usd_null, v_meneuses, v_bad
    from orders o join payments p on p.order_id = o.id
   where o.group_id = p_group;
  if v_n < 2 then raise exception 'zabelie_group_seal: un groupe compte au moins deux commandes'; end if;
  if v_meneuses <> 1 then raise exception 'zabelie_group_seal: il faut exactement une commande meneuse'; end if;
  if v_bad > 0 then raise exception 'zabelie_group_seal: commande non conforme dans le groupe'; end if;
  if v_n <> (select count(*) from orders where group_id = p_group) then
    raise exception 'zabelie_group_seal: commande sans paiement dans le groupe';
  end if;
  if v_g.rail = 'stripe' and v_usd_null > 0 then
    raise exception 'zabelie_group_seal: montant USD attendu manquant';
  end if;
  select o.id into v_leader from orders o join payments p on p.order_id = o.id
   where o.group_id = p_group and p.rail::text <> 'groupe';
  update zabelie_order_groups
     set status = 'pending', leader_order_id = v_leader, total_htg = v_total,
         expected_usd_cents = case when v_g.rail = 'stripe' then v_usd end
   where id = p_group;
  return jsonb_build_object('leader_order_id', v_leader, 'total_htg', v_total,
                            'expected_usd_cents', case when v_g.rail = 'stripe' then v_usd end,
                            'commandes', v_n);
end $$;
revoke all on function zabelie_group_seal(uuid) from public, anon, authenticated;
grant execute on function zabelie_group_seal(uuid) to service_role;

-- Abandon AVANT paiement (préparation ratée, opérateur indisponible) : les
-- commandes en attente sont annulées, leur stock relâché. Jamais sur un
-- groupe confirmé.
create function zabelie_group_abort(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_g zabelie_order_groups; v_o record;
begin
  select * into v_g from zabelie_order_groups where id = p_group for update;
  if not found then return 'absent'; end if;
  if v_g.status = 'confirmed' then return 'deja_confirme'; end if;
  update payments p set status = 'failed',
         raw = coalesce(p.raw, '{}'::jsonb) || jsonb_build_object('groupe_abandonne', true, 'at', now())
    from orders o where o.id = p.order_id and o.group_id = p_group and p.status = 'pending';
  for v_o in select id from orders where group_id = p_group and status = 'pending' loop
    update orders set status = 'cancelled' where id = v_o.id;
    perform zabelie_release_stock(v_o.id);
  end loop;
  update zabelie_order_groups set status = 'failed' where id = p_group;
  return 'abandonne';
end $$;
revoke all on function zabelie_group_abort(uuid) from public, anon, authenticated;
grant execute on function zabelie_group_abort(uuid) to service_role;

-- La confirmation du groupe. Appelée par la branche de `confirm_payment`.
create function zabelie_confirm_group_payment(
  p_group uuid, p_provider_ref text, p_raw jsonb, p_amount integer, p_usd_cents integer
) returns payments language plpgsql security definer set search_path = public as $$
declare
  v_g zabelie_order_groups; v_leader payments; v_o record; v_somme bigint;
begin
  select * into v_g from zabelie_order_groups where id = p_group for update;
  if not found or v_g.leader_order_id is null then
    raise exception 'zabelie_confirm_group_payment: groupe % absent ou non scellé', p_group;
  end if;
  select * into v_leader from payments where order_id = v_g.leader_order_id;
  if v_g.status = 'confirmed' then
    return v_leader; -- rejeu : no-op
  end if;

  -- Garde-fou de montant, au niveau du GROUPE (HTG puis USD).
  if (p_amount is not null and p_amount <> v_g.total_htg)
     or (p_usd_cents is not null and (v_g.expected_usd_cents is null or p_usd_cents <> v_g.expected_usd_cents)) then
    update payments p
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, p.provider_ref),
           raw = coalesce(p_raw, p.raw)
      from orders o where o.id = p.order_id and o.group_id = p_group and p.status <> 'confirmed';
    for v_o in select id from orders where group_id = p_group and status in ('pending', 'cancelled') loop
      update orders set status = 'disputed' where id = v_o.id;
      perform zabelie_release_stock(v_o.id);
    end loop;
    update zabelie_order_groups set status = 'failed', provider_ref = coalesce(p_provider_ref, provider_ref)
     where id = p_group;
    select * into v_leader from payments where order_id = v_g.leader_order_id;
    return v_leader;
  end if;

  -- Montant juste : chaque commande passe par `confirm_payment` INCHANGÉE,
  -- avec SON montant. Le marqueur empêche la branche groupe de se rappeler.
  perform set_config('zabelie.groupe_en_cours', p_group::text, true);
  for v_o in
    select p.idempotency_key, o.amount_htg
      from orders o join payments p on p.order_id = o.id
     where o.group_id = p_group
     order by (o.id = v_g.leader_order_id) desc, o.created_at, o.id
  loop
    perform confirm_payment(v_o.idempotency_key, p_provider_ref, p_raw, v_o.amount_htg, null);
  end loop;
  perform set_config('zabelie.groupe_en_cours', '', true);

  select coalesce(sum(o.amount_htg), 0) into v_somme
    from orders o join payments p on p.order_id = o.id
   where o.group_id = p_group and p.status = 'confirmed';
  if v_somme <> v_g.total_htg then
    raise exception 'zabelie_confirm_group_payment: Σ commandes confirmées (%) ≠ total du groupe (%)', v_somme, v_g.total_htg;
  end if;

  -- Les articles payés quittent le panier, dans la transaction de l'argent :
  -- un panier qui montre encore ce qu'on vient de payer invite à payer deux fois.
  delete from zabelie_cart_items ci
   using zabelie_carts c
   where c.id = ci.cart_id and c.buyer_id = v_g.buyer_id
     and ci.product_id in (select product_id from orders where group_id = p_group);

  update zabelie_order_groups
     set status = 'confirmed', confirmed_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_group;
  select * into v_leader from payments where order_id = v_g.leader_order_id;
  return v_leader;
end $$;
revoke all on function zabelie_confirm_group_payment(uuid, text, jsonb, integer, integer) from public, anon, authenticated;

-- ── confirm_payment : branche groupe insérée dans la définition EN BASE ─────
do $patch$
declare
  src text;
  ancre text := 'select * into v_order from orders where id = v_payment.order_id;';
  branche text := ancre || $b$

  -- 0128 : COMMANDE D'UN GROUPE. L'opérateur a encaissé le TOTAL du groupe
  -- sur la clé de la commande meneuse : la confirmation passe par le groupe,
  -- qui vérifie le total puis rappelle CETTE fonction pour chaque commande,
  -- marqueur de transaction posé (le rappel ne revient donc pas ici).
  if v_order.group_id is not null
     and coalesce(current_setting('zabelie.groupe_en_cours', true), '') <> v_order.group_id::text then
    return zabelie_confirm_group_payment(v_order.group_id, p_provider_ref, p_raw, p_amount, p_usd_cents);
  end if;$b$;
begin
  src := pg_get_functiondef('public.confirm_payment(text,text,jsonb,integer,integer)'::regprocedure);
  if (length(src) - length(replace(src, ancre, ''))) / length(ancre) <> 1
     or position('zabelie_settle_order_pricing' in src) = 0
     or position('zabelie_consume_stock_strict' in src) = 0
     or position('affiliate_credit:' in src) = 0
     or position('zabelie.groupe_en_cours' in src) > 0 then
    raise exception '0128 : corps de confirm_payment inattendu';
  end if;
  execute replace(src, ancre, branche);
  src := pg_get_functiondef('public.confirm_payment(text,text,jsonb,integer,integer)'::regprocedure);
  if position('zabelie.groupe_en_cours' in src) = 0 or position('zabelie_settle_order_pricing' in src) = 0 then
    raise exception '0128 : la branche groupe n''est pas dans confirm_payment';
  end if;
end;
$patch$;

-- ── zabelie_expire_stale_payment : branche groupe, même méthode ─────────────
do $patch$
declare
  src text;
  decl text := $d$declare
  v_payment payments;
begin$d$;
  decl2 text := $d$declare
  v_payment payments;
  v_group   uuid;
  v_o       record;
begin$d$;
  ancre text := $a$if v_payment.created_at > now() - interval '48 hours' then
    return v_payment;
  end if;$a$;
  branche text := ancre || $b$

  -- 0128 : la meneuse d'un groupe expire TOUT le groupe. Les autres commandes
  -- (rail `groupe`) ne sont jamais réclamées par un réconciliateur : sans
  -- cette branche, leur stock resterait réservé et elles, en attente.
  select group_id into v_group from orders where id = v_payment.order_id;
  if v_group is not null then
    update payments p
       set status = 'failed',
           raw = coalesce(p.raw, '{}'::jsonb)
                 || jsonb_build_object('expired_reason', p_reason, 'expired_at', now(), 'groupe', v_group)
      from orders o
     where o.id = p.order_id and o.group_id = v_group and p.status = 'pending';
    for v_o in select id from orders where group_id = v_group and status = 'pending' loop
      update orders set status = 'cancelled' where id = v_o.id;
      perform zabelie_release_stock(v_o.id);
    end loop;
    update zabelie_order_groups set status = 'failed' where id = v_group and status = 'pending';
    select * into v_payment from payments where id = v_payment.id;
    return v_payment;
  end if;$b$;
begin
  src := pg_get_functiondef('public.zabelie_expire_stale_payment(text,text)'::regprocedure);
  if (length(src) - length(replace(src, ancre, ''))) / length(ancre) <> 1
     or (length(src) - length(replace(src, decl, ''))) / length(decl) <> 1
     or position('zabelie_release_stock' in src) = 0
     or position('v_group' in src) > 0 then
    raise exception '0128 : corps de zabelie_expire_stale_payment inattendu';
  end if;
  execute replace(replace(src, decl, decl2), ancre, branche);
  src := pg_get_functiondef('public.zabelie_expire_stale_payment(text,text)'::regprocedure);
  if position('v_group' in src) = 0 then
    raise exception '0128 : la branche groupe n''est pas dans zabelie_expire_stale_payment';
  end if;
end;
$patch$;

-- ── L'échec de la meneuse est l'échec du groupe, QUEL QUE SOIT le chemin ─────
-- Session Stripe expirée (`zabelie_stripe_payment_failed`), refus Kobara,
-- montant rejeté, expiration 48 h : chaque chemin marque le paiement de la
-- meneuse `failed` à sa façon. Plutôt que de patcher chacun — et d'oublier le
-- prochain —, un trigger porte la règle à l'endroit où tous passent. Sans lui,
-- les autres commandes resteraient `pending` à jamais : leur rail `groupe`
-- n'est réclamé par aucun réconciliateur, et leur stock resterait tenu.
-- Jamais sur un groupe confirmé. Pas de récursion : les paiements qu'il touche
-- sont en rail `groupe`, que la condition du trigger écarte.
create function zabelie_group_leader_failed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group uuid; v_o record;
begin
  select o.group_id into v_group from orders o where o.id = new.order_id;
  if v_group is null then return null; end if;
  -- Aucun garde de statut du groupe ici, et c'est voulu : chaque écriture
  -- ci-dessous ne touche que du `pending`. Un groupe confirmé n'en a plus —
  -- G10 le prouve ; un garde de plus serait un mutant équivalent, invérifiable.
  update payments p
     set status = 'failed',
         raw = coalesce(p.raw, '{}'::jsonb) || jsonb_build_object('meneuse_en_echec', new.order_id, 'at', now())
    from orders o
   where o.id = p.order_id and o.group_id = v_group and p.status = 'pending';
  for v_o in select id from orders where group_id = v_group and status = 'pending' loop
    update orders set status = 'cancelled' where id = v_o.id;
    perform zabelie_release_stock(v_o.id);
  end loop;
  update zabelie_order_groups set status = 'failed' where id = v_group and status in ('preparation', 'pending');
  return null;
end $$;
revoke all on function zabelie_group_leader_failed() from public, anon, authenticated;

create trigger zabelie_group_leader_failed
  after update of status on payments
  for each row
  when (new.status = 'failed' and old.status is distinct from 'failed' and new.rail::text <> 'groupe')
  execute function zabelie_group_leader_failed();


-- ── Sonde de présence : les objets de 0128 rejoignent la liste ─────────────
-- Copie EXACTE de la définition de `0125` (appliquée, donc intouchable), plus
-- les quatre fonctions et les deux tables du paiement groupé.
create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_product_recommendations(uuid,uuid)', 'les recommandations basees sur les achats reels'),
      ('zabelie_configure_product_offers(uuid,uuid,jsonb,boolean)', 'le choix vendeur et les suggestions automatiques'),
      ('zabelie_recommendation_stats(uuid)', 'les ventes attribuees aux recommandations'),
      ('zabelie_save_product_offers(uuid,uuid,jsonb)', 'la configuration des offres associees du vendeur'),
      ('zabelie_offers_public(uuid,uuid)', 'les offres disponibles sur la fiche produit'),
      ('zabelie_offer_stats(uuid)', 'les ventes confirmees issues des offres associees'),
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      ('zabelie_webhook_claim(integer)', 'sans elle, aucun webhook vendeur ne part plus : ventes payees jamais signalees aux sites branches (0122)'),
      ('zabelie_webhook_record(uuid,boolean,integer,text)', 'sans elle, un webhook envoye reste en attente et repart en boucle (0122)'),
      ('zabelie_webhook_purge()', 'sans elle, le journal des envois webhook grossit sans fin (0122)'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
      ('zabelie_claim_pending_payments(payment_rail)', 'la rotation des paiements en attente'),
      ('zabelie_order_participant(uuid)', 'la verification de propriete des dossiers'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'sans elle, le retour effectif des fonds ne peut plus etre documente'),
      ('zabelie_operations_queue(integer,integer)', 'sans elle, les commandes bloquees disparaissent du suivi administrateur'),
      ('zabelie_market_metrics(integer)', 'sans elle, les ventes reelles par zone et categorie ne sont plus mesurables'),
      ('zabelie_stripe_payment_failed(uuid,text,text)', 'libere le stock apres un echec Stripe differe'),
      ('confirm_payment(text,text,jsonb,integer,integer)',
       'la confirmation serveur-à-serveur (invariant b) : absente, un paiement encaissé ne crée ni commande payée ni escrow'),
      ('refund_order(uuid)',
       'le remboursement : absente, un litige ne peut plus être résolu que par une écriture manuelle — donc hors ledger'),
      ('mature_wallets()',
       'la maturation J+7 : absente, aucun solde ne devient jamais retirable et le cron 13:00 échoue en silence'),
      ('zabelie_expire_stale_payment(text,text)',
       'expire les paiements qui n''aboutiront jamais : absente, les commandes en attente s''accumulent et le stock reste réservé'),
      ('zabelie_solvency_report()',
       'le rapport de solvabilité lu par /api/admin/coherence : absente, l''invariant 0033 n''est plus contrôlé du tout'),
      ('purge_payment_raw(integer)',
       'purge les charges brutes de paiement : absente, des données de paiement s''accumulent sans limite de rétention'),

      -- ── Retrait vendeur (chantier 0) ─────────────────────────────────────
      ('zabelie_request_payout(uuid,bigint)',
       'la demande de retrait : absente, la voie de sortie vendeur est fermée — le grief central du dossier BRH'),
      ('zabelie_settle_payout(uuid,payout_method,text,uuid,text)',
       'le règlement d''un retrait : absente, une demande acceptée ne peut plus être soldée'),
      ('zabelie_reject_payout(uuid,text,uuid)',
       'le refus motivé d''un retrait : absente, un refus se ferait sans trace ni motif'),
      ('zabelie_record_manual_payout(uuid,bigint,payout_method,text,uuid,text,timestamp with time zone)',
       'inscrit un versement fait à la main : absente, un paiement réel sortirait du ledger'),

      -- ── Stock ────────────────────────────────────────────────────────────
      ('zabelie_release_stock(uuid)',
       'libère une réservation : absente, un article annulé reste indisponible pour toujours'),
      ('zabelie_expire_stock_reservations()',
       'expire les réservations abandonnées (cron 13:45) : absente, le stock se vide sans qu''une vente ait eu lieu'),

      -- ── Expédition et remise (0043) ──────────────────────────────────────
      ('zabelie_open_fulfillment(uuid)',
       'ouvre le suivi d''une commande physique : absente, une commande payée n''entre jamais en expédition'),
      ('zabelie_declare_shipment(uuid,uuid,text)',
       'le vendeur déclare l''expédition : absente, il ne peut plus rien déclarer'),
      ('zabelie_mark_received(uuid,uuid,boolean)',
       'l''acheteur confirme la réception : absente, l''escrow ne se verrouille jamais'),
      ('zabelie_report_not_received(uuid,uuid,text)',
       'l''acheteur signale la non-réception : absente, le seul recours acheteur disparaît'),
      ('zabelie_fulfillment_sweep()',
       'le filet des commandes oubliées (cron 12:30) : absente, une commande payée peut rester orpheline sans que rien ne le dise'),

      -- ── Panier et rabais ─────────────────────────────────────────────────
      ('zabelie_cart_add(uuid)',    'ajout au panier : absente, le panier ne se remplit plus'),
      ('zabelie_cart_remove(uuid)', 'retrait du panier : absente, on ne peut plus retirer un article'),
      ('zabelie_set_variant_discount(uuid,uuid,uuid,bigint)', 'pose le rabais de la variante choisie en conservant son prix historique'),
      ('zabelie_clear_variant_discount(uuid,uuid,uuid)', 'retire le prix barre de la variante sans augmenter son prix courant'),
      ('zabelie_set_discount(uuid,uuid,bigint)',
       'pose un rabais vendeur : absente, la promotion est impossible côté vendeur'),
      ('zabelie_clear_discount(uuid,uuid)',
       'retire un rabais : absente, un rabais posé ne peut plus être annulé — un prix reste bas indéfiniment'),
      ('expire_coupons_job()',
       'expire les coupons (cron) : absente, un coupon périmé reste utilisable'),

      -- ── Fidélité (dormante, mais appelée par un cron) ────────────────────
      ('expire_points_batch_job()',
       'expire les lots de points (cron 14:00) : le système est débranché, mais le cron l''appelle — absente, le cron échoue et son échec masque les autres'),

      -- ── Notifications (0061) ─────────────────────────────────────────────
      ('zabelie_outbox_enqueue(uuid,zabelie_outbox_kind,text)',
       'met un avis en file : absente, plus aucune notification n''est jamais émise — et rien ne le signale'),
      ('zabelie_outbox_claim(uuid)',
       'réserve un avis à envoyer : absente, la file se remplit sans jamais se vider'),
      ('zabelie_outbox_mark_sent(uuid)',
       'marque l''avis envoyé : absente, le même avis serait renvoyé en boucle'),
      ('zabelie_outbox_mark_failed(uuid,text)',
       'marque l''échec d''envoi : absente, un échec devient indistinguable d''un envoi réussi'),
      ('zabelie_claim_notification(uuid)',
       'réserve une notification côté lecteur : absente, la lecture des avis se bloque'),

      -- ── Baux de cron (0060) ──────────────────────────────────────────────
      ('zabelie_cron_lease_acquire(text,text,integer)',
       'prend le bail d''un cron : absente, deux exécutions simultanées peuvent traiter la même chose deux fois'),
      ('zabelie_cron_lease_release(text,text)',
       'rend le bail : absente, un bail non rendu bloque le cron suivant jusqu''à expiration'),

      -- ── Recherche ────────────────────────────────────────────────────────
      ('zabelie_search_normalize(text)',
       'normalise une requête de recherche (0047) : absente, le capteur de demande dégrade en silence'),
      ('zabelie_record_search_miss(text,text,text)',
       'enregistre une recherche sans résultat : absente, on cesse de savoir ce que les acheteurs cherchent en vain'),
      ('zabelie_search_demand(integer,integer)',
       'restitue la demande non servie au tableau admin : absente, la page se vide sans erreur visible'),
      ('zabelie_search_fuzzy(text,integer)',
       'la recherche approximative : absente, une faute de frappe ne trouve plus rien'),
      -- ── Relances de paiement abandonné (0124) ────────────────────────────
      ('zabelie_relances_dues(integer)',
       'liste les relances dues (cron 15:30) : absente, aucune relance ne part et le journal paraît sain'),
      ('zabelie_email_jeton(uuid)',
       'le jeton de désabonnement de chaque e-mail : absente, aucune relance ne part'),
      ('zabelie_email_desabonner(uuid)',
       'le désabonnement en un clic : absente, un acheteur ne peut plus arrêter les relances'),
      -- ── Domaine personnalisé (0125) ──────────────────────────────────────
      ('zabelie_domaine_demander(uuid,text)',
       'la demande de domaine du vendeur : absente, le formulaire échoue'),
      ('zabelie_domaine_retirer(uuid)',
       'le retrait du domaine par le vendeur : absente, un vendeur ne peut plus débrancher son domaine'),
      ('zabelie_domaine_decider(uuid,boolean,text)',
       'la décision admin : absente, aucun domaine ne peut être activé ni refusé'),
      ('zabelie_domaine_boutik(text)',
       'hôte vers boutique, lu à chaque visite d''un domaine vendeur : absente, tous les domaines actifs répondent 404'),
      ('zabelie_group_create(uuid,payment_rail)',
       'ouvre un paiement groupé du panier (0128) : absente, « payer tout le panier » échoue en 409'),
      ('zabelie_group_seal(uuid)',
       'scelle le total d''un panier depuis la base (0128) : absente, aucun paiement groupé ne part vers l''opérateur'),
      ('zabelie_group_abort(uuid)',
       'abandonne un groupe raté avant paiement (0128) : absente, ses commandes restent pending et tiennent le stock'),
      ('zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)',
       'confirme chaque commande d''un panier payé (0128) : absente, confirm_payment lève sur la meneuse — l''argent du panier est encaissé et AUCUNE commande ne passe payée'),
      ('zabelie_purge_search_misses()',
       'purge la rétention 90 j des recherches (cron 14:15) : absente, des requêtes utilisateurs sont conservées au-delà de la durée annoncée'),

      -- ── KYC (0079) ───────────────────────────────────────────────────────
      ('zabelie_kyc_docs_expires()',
       'liste les pièces d''identité à purger : absente, la purge ne trouve rien et paraît saine'),
      ('zabelie_purge_kyc_documents(uuid[])',
       'purge les pièces d''identité (cron 14:45) : absente, des documents ultra-sensibles sont conservés au-delà de la durée annoncée'),

      -- ── Conformité et garde-fous ─────────────────────────────────────────
      ('zabelie_record_policy_acceptance(uuid,text)',
       'sans elle, TOUTE création de fiche échoue (0046) — et l''échec tombe devant l''un des vingt premiers vendeurs, recrutés un par un'),
      ('zabelie_rate_limit(text,integer,integer)',
       'le plafonnement d''appels : absente, les plafonds cessent d''exister sans qu''aucune erreur ne soit levée'),
      ('zabelie_objets_requis()',
       'cette sonde elle-même : absente, /api/admin/coherence retombe sur le registre, qui déclare au lieu de constater'),

      -- ── Topup (V-11) ─────────────────────────────────────────────────────
      ('zabelie_topup_confirm_payment(uuid,text,jsonb,integer,integer)',
       'confirme une recharge : absente, un client paie sa recharge et ne la reçoit jamais'),
      ('zabelie_topup_transition(uuid,topup_status,jsonb)',
       'la machine à états des recharges : absente, une commande de recharge reste figée'),

      -- ── Business (0022) ──────────────────────────────────────────────────
      ('zabelie_biz_get_invoice_by_token(text)',
       'le portail public de facture : absente, tout lien de facture envoyé à un client tombe'),
      ('zabelie_biz_upsert_item(uuid,text,integer,bigint,uuid)',
       'ajoute une ligne de facture : absente, l''éditeur de facture ne peut plus rien enregistrer'),
      ('zabelie_biz_recompute_invoice(uuid)',
       'recalcule les totaux serveur : absente, un total pourrait être cru sur parole du client'),
      ('zabelie_biz_send_invoice(uuid)',
       'passe la facture à « envoyée » et fige son contenu : absente, une facture envoyée resterait modifiable'),
      ('zabelie_biz_void_invoice(uuid)',
       'annule une facture non payée : absente, une facture erronée ne peut plus être retirée'),
      ('zabelie_biz_confirm_invoice_payment(uuid,payment_rail,text,bigint,text)',
       'confirme le paiement MonCash d''une facture pro : absente, un client paie sa facture et elle reste « envoyée »'),

      -- ── Les sept que le grep à la main avait manqués ─────────────────────
      -- Elles sont appelées avec des apostrophes simples ou sur plusieurs
      -- lignes. C'est le garde `tests/objets-requis-couverture.test.ts` qui
      -- les a trouvées, pas l'œil : un `.rpc()` est un artefact adressé par
      -- CHAÎNE, et une liste tenue à la main en oublie toujours.
      ('zabelie_reserve_stock(uuid,uuid,integer)',
       'réserve le stock à la commande, atomiquement : absente, deux acheteurs peuvent acheter le dernier article'),
      ('zabelie_topup_reserve_order(uuid,uuid,text,topup_operator,integer,integer,integer,payment_rail,integer)',
       'crée une commande de recharge sous plafonds : absente, plus aucune recharge ne peut être commandée'),
      ('zabelie_search_index_integrity()',
       'contrôle l''intégrité de l''index de recherche, lu par /api/admin/coherence : absente, ce contrôle-là devient muet'),
      ('zabelie_fichier_sans_livrable_sweep()',
       'rattrape les fiches fichier sans livrable (0059) : absente, un acheteur peut payer un fichier qui n''existe pas'),
      ('zabelie_service_sans_suivi_sweep()',
       'rattrape les services sans suivi ouvert : absente, une prestation payée reste sans canal de remise'),
      ('zabelie_purge_sent_notices(integer)',
       'purge à 90 j les avis de remise envoyés (0056) : absente, des avis sont conservés au-delà de la durée annoncée — c''est le cas AUJOURD''HUI, voir la liste des absences attendues ci-dessous'),

      -- ── Les deux de `0084`, ajoutées PAR LE GARDE lui-même ───────────────
      -- Le croisement code × sonde les a nommées à la première exécution sur
      -- la branche de `0084`, avant qu'on y pense. C'est la démonstration que
      -- le garde vaut mieux qu'une liste tenue à la main : il a trouvé un cas
      -- réel, pas une mutation fabriquée pour lui plaire.
      ('zabelie_boutik_public(uuid,text)',
       'la fiche publique d''une boutique (0084) : absente, /createur/[id] et /boutik/[slug] répondent 404 pour tout le monde — la panne exacte que 0084 répare'),
      ('zabelie_vande_nan_zon(uuid[])',
       'les marchands d''une zone (0084) : absente, le filtre acheteur par zone rend zéro vendeur en journalisant « introuvables », ce qui se lit comme « cette zone est vide »'),

      -- ── Ajoutée PAR LE GARDE, une seconde fois (0099) ────────────────────
      -- Le croisement code × sonde a nommé celle-ci dès la première exécution,
      -- exactement comme les deux de `0084` ci-dessus. Deux fois sur deux, il a
      -- trouvé un cas réel avant qu'on y pense.
      ('zabelie_save_product_commitment(uuid,uuid,text,text,integer,text,date,boolean)',
       'enregistre les engagements de remise et la disponibilite declaree par le vendeur (0107)'),
      ('zabelie_est_rechaj(uuid)',
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non'),
      ('zabelie_age_minimum(uuid)',
       'age minimum d''une fiche par l''ascendance de son rayon (0115) : absente, /api/checkout refuse en 503 toute fiche portant un sous-rayon, et la fiche produit perd sa mention 18+')
    ) as v(objet, pourquoi)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_support_cases','les dossiers de commandes'),
    ('zabelie_support_messages','les messages des dossiers'),
    ('zabelie_refund_receipts','les justificatifs de remboursement'),
    ('zabelie_operations_config','les seuils de suivi'),
    ('zabelie_payment_checks','la rotation des paiements'),
    ('zabelie_seller_pricing_config','configuration des tarifs vendeurs'),
    ('zabelie_seller_launch','eligibilite et compteur des 30 jours'),
    ('zabelie_order_pricing','tarif fige a la commande'),
    ('zabelie_product_commitments','les engagements publics de remise et de disponibilite (0107)'),
    ('zabelie_digital_studio','les brouillons de packs et de formations'),
    ('zabelie_digital_releases','les versions acquises et leurs fichiers privés'),
    ('zabelie_digital_entitlements','le contenu attaché à chaque commande'),
    ('zabelie_digital_progress','la progression privée des acheteurs'),
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées'),
    ('zabelie_order_age_attestations','les attestations d''age des acheteurs (0115)'),
    ('zabelie_api_keys','les cles d''API vendeur (0121)'),
    ('zabelie_webhook_endpoints','les adresses webhook des vendeurs (0122)'),
    ('zabelie_webhook_deliveries','la file des envois webhook (0122)'),
    ('zabelie_seller_domains','les domaines personnalises des boutiques (0125)'),
    ('zabelie_order_groups','les paniers payes en une fois (0128)'),
    ('zabelie_panier_config','le drapeau du paiement groupe (0128)')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_support_message_immutable','les messages non modifiables'),
    ('zabelie_refund_receipt_immutable','les justificatifs non modifiables'),
    ('zabelie_order_seller_guard','interdit les commandes des vendeurs suspendus'),
    ('zabelie_record_seller_launch','enregistre la premiere offre'),
    ('zabelie_start_waiting_launches','demarre les lancements eligibles'),
    ('zabelie_snapshot_order_pricing','fige les frais a la commande'),
    ('zabelie_guard_order_pricing','protege le tarif fige'),
    ('zabelie_protect_test_account','empêche un compte de retirer sa marque d''essai'),
    ('zabelie_digital_order_snapshot','fige la version lors de la commande'),
    ('zabelie_digital_publication','crée une version après modération'),
    ('zabelie_digital_release_immutable','interdit la réécriture des versions achetées'),
    ('zabelie_digital_entitlement_immutable','interdit le remplacement du contrat acheté'),
    ('zabelie_digital_asset_guard','interdit de modifier un livrable publié'),
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons'),
    ('zabelie_order_age_attestation_immutable','interdit la reecriture d''une attestation d''age (0115)'),
    ('zabelie_api_keys_garde','plafond et immuabilite des cles d''API (0121)'),
    ('zabelie_webhook_endpoints_garde','plafond et immuabilite des adresses webhook (0122)'),
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)'),
    ('zabelie_group_leader_failed','propage l''echec de la meneuse a tout le panier (0128) : absent, les autres commandes restent pending et tiennent le stock')
  ) v(objet,pourquoi);
$$;
