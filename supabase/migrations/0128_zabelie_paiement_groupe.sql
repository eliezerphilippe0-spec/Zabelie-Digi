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
