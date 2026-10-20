select zabelie_migration_garde('0151_zabelie_stripe_disputes.sql');

-- Signed Stripe dispute receipts, not a second support workflow. Nothing here
-- refunds, debits a seller, changes an order status or releases a hold.
-- Retention beyond J+7 stays DORMANT pending the decision in docs/26 section 0.
alter table public.zabelie_operations_config
  add column stripe_dispute_freeze_enabled boolean not null default false;
alter table public.escrow_entries add column dispute_frozen_at timestamptz;

create table public.zabelie_stripe_dispute_events (
  event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9_]{1,200}$'),
  event_type text not null check(event_type in
    ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed',
     'charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated')),
  dispute_id text not null check(dispute_id ~ '^(du|dp)_[A-Za-z0-9_]{1,200}$'),
  payment_intent_id text check(payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,200}$'),
  charge_id text not null check(charge_id ~ '^ch_[A-Za-z0-9_]{1,200}$'),
  dispute_status text not null check(dispute_status ~ '^[a-z_]{1,64}$'),
  amount_usd_cents bigint not null check(amount_usd_cents between 1 and 9007199254740991),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  livemode boolean not null,
  received_at timestamptz not null default clock_timestamp()
);
comment on column public.zabelie_stripe_dispute_events.amount_usd_cents is
  'Provider minor-unit amount; only comparable with expected_usd_cents when currency=usd. Never converted to HTG.';
create index zabelie_stripe_dispute_events_dispute_idx
  on public.zabelie_stripe_dispute_events(dispute_id);
create index zabelie_stripe_dispute_events_intent_idx
  on public.zabelie_stripe_dispute_events(payment_intent_id);
alter table public.zabelie_stripe_dispute_events enable row level security;
revoke all on public.zabelie_stripe_dispute_events from public,anon,authenticated,service_role;
grant select on public.zabelie_stripe_dispute_events to service_role;

create function public.zabelie_stripe_dispute_event_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Stripe dispute receipts are append-only' using errcode='42501';
end $$;
revoke all on function public.zabelie_stripe_dispute_event_immutable() from public,anon,authenticated;
create trigger zabelie_stripe_dispute_event_immutable
  before update or delete on public.zabelie_stripe_dispute_events
  for each row execute function public.zabelie_stripe_dispute_event_immutable();
create trigger zabelie_stripe_dispute_event_no_truncate
  before truncate on public.zabelie_stripe_dispute_events
  for each statement execute function public.zabelie_stripe_dispute_event_immutable();

create function public.zabelie_record_stripe_dispute(
  p_event_id text, p_event_type text, p_dispute_id text,
  p_payment_intent_id text, p_charge_id text, p_status text,
  p_amount_usd_cents bigint, p_currency text, p_livemode boolean
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_receipt zabelie_stripe_dispute_events;
  v_payment payments;
  v_order orders;
  v_group zabelie_order_groups;
  v_payment_ids uuid[];
  v_orders uuid[];
  v_duplicate boolean;
  v_enabled boolean;
  v_terminal_no_new_hold boolean;
  v_expected bigint;
  v_frozen integer := 0;
  v_matured integer := 0;
  v_reversed integer := 0;
  v_missing integer;
  v_base jsonb;
begin
  -- Validation precedes the receipt. Valid but unmatched/incompatible events
  -- are retained below and return a retryable result, never an exception.
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]{1,200}$'
     or p_event_type is null or p_event_type not in
       ('charge.dispute.created','charge.dispute.updated','charge.dispute.closed',
        'charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated')
     or p_dispute_id is null or p_dispute_id !~ '^(du|dp)_[A-Za-z0-9_]{1,200}$'
     or (p_payment_intent_id is not null and p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{1,200}$')
     or p_charge_id is null or p_charge_id !~ '^ch_[A-Za-z0-9_]{1,200}$'
     or p_status is null or p_status !~ '^[a-z_]{1,64}$'
     or p_amount_usd_cents is null or p_amount_usd_cents not between 1 and 9007199254740991
     or p_currency is null or p_currency !~ '^[a-z]{3}$' or p_livemode is null then
    raise exception 'Invalid Stripe dispute receipt' using errcode='22023';
  end if;

  -- Serialise receipts for the same PaymentIntent, including distinct disputes.
  -- No ordering assumption is made about Stripe event.created or delivery order.
  perform pg_advisory_xact_lock(hashtextextended('zabelie_stripe_dispute_id:' || p_dispute_id,0));
  if p_payment_intent_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('zabelie_stripe_dispute:' || p_payment_intent_id,0));
  end if;
  insert into zabelie_stripe_dispute_events
    (event_id,event_type,dispute_id,payment_intent_id,charge_id,dispute_status,amount_usd_cents,currency,livemode)
  values(p_event_id,p_event_type,p_dispute_id,p_payment_intent_id,p_charge_id,p_status,p_amount_usd_cents,p_currency,p_livemode)
  on conflict(event_id) do nothing;
  v_duplicate := not found;
  select * into strict v_receipt from zabelie_stripe_dispute_events where event_id=p_event_id;
  select stripe_dispute_freeze_enabled into v_enabled from zabelie_operations_config where id;
  v_base := jsonb_build_object('event_id',p_event_id,'duplicate',v_duplicate,
    'freeze_enabled',coalesce(v_enabled,false),'frozen_count',0,'matured_count',0,
    'reversed_count',0,'requires_review',true);
  if row(v_receipt.event_type,v_receipt.dispute_id,v_receipt.payment_intent_id,v_receipt.charge_id,
         v_receipt.dispute_status,v_receipt.amount_usd_cents,v_receipt.currency,v_receipt.livemode)
     is distinct from row(p_event_type,p_dispute_id,p_payment_intent_id,p_charge_id,
                          p_status,p_amount_usd_cents,p_currency,p_livemode) then
    return v_base || jsonb_build_object('ok',false,'retryable',false,'reason','event_payload_conflict');
  end if;
  if exists(select 1 from zabelie_stripe_dispute_events e where e.dispute_id=p_dispute_id
    and (row(e.charge_id,e.currency,e.livemode) is distinct from row(p_charge_id,p_currency,p_livemode)
      or (e.payment_intent_id is not null and p_payment_intent_id is not null
          and e.payment_intent_id is distinct from p_payment_intent_id))) then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','dispute_identity_incompatible');
  end if;
  if p_currency <> 'usd' then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','currency_incompatible');
  end if;
  if p_status not in('needs_response','under_review','won','lost','warning_needs_response',
                     'warning_under_review','warning_closed','prevented') then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','status_incompatible');
  end if;

  -- No metadata supplied by a browser/dispute object chooses an order. The
  -- confirmed operator reference is authoritative, and must be unique.
  select array_agg(id order by id) into v_payment_ids from payments
    where rail='stripe' and provider_ref=p_payment_intent_id;
  if coalesce(cardinality(v_payment_ids),0) <> 1 then
    return v_base || jsonb_build_object('ok',false,'retryable',true,
      'reason',case when coalesce(cardinality(v_payment_ids),0)=0 then 'payment_unmatched' else 'payment_ambiguous' end);
  end if;
  select * into v_payment from payments where id=v_payment_ids[1] for update;
  if not found or v_payment.rail <> 'stripe' or v_payment.provider_ref is distinct from p_payment_intent_id then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','payment_unmatched');
  end if;
  v_base := v_base || jsonb_build_object('order_id',v_payment.order_id);
  if v_payment.status <> 'confirmed' then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','payment_not_confirmed');
  end if;
  -- New confirmations persist this server-observed provider boolean. Historical
  -- orders.zabelie_payment_is_live is deliberately NOT used as a Stripe proof.
  if v_payment.raw ? 'stripe_livemode' and
     (jsonb_typeof(v_payment.raw->'stripe_livemode') is distinct from 'boolean'
      or v_payment.raw->'stripe_livemode' is distinct from to_jsonb(p_livemode)) then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','livemode_incompatible');
  end if;
  v_base := v_base || jsonb_build_object('livemode_verified',coalesce(v_payment.raw ? 'stripe_livemode',false));
  select * into v_order from orders where id=v_payment.order_id;
  if not found then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','order_unavailable');
  end if;
  v_orders := array[v_order.id];
  v_expected := v_payment.expected_usd_cents;
  if v_order.group_id is not null then
    select * into v_group from zabelie_order_groups where id=v_order.group_id for update;
    v_base := v_base || jsonb_build_object('group_id',v_order.group_id);
    if not found or v_group.leader_order_id is distinct from v_order.id
       or v_group.rail <> 'stripe' or v_group.status <> 'confirmed'
       or v_group.provider_ref is distinct from p_payment_intent_id then
      return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','group_incompatible');
    end if;
    select array_agg(id order by id) into v_orders from orders where group_id=v_group.id;
    if cardinality(v_orders)<2 or exists(
      select 1 from orders o where o.group_id=v_group.id and not exists(
        select 1 from payments p where p.order_id=o.id and p.status='confirmed'
          and p.provider_ref=p_payment_intent_id
          and p.rail=case when o.id=v_order.id then 'stripe'::payment_rail else 'groupe'::payment_rail end)) then
      return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','group_payment_incompatible');
    end if;
    v_expected := v_group.expected_usd_cents;
  end if;
  if v_expected is null or v_expected<=0 then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','amount_incompatible');
  end if;
  -- Stripe disputes can exceed the original amount (FX/grouped transactions).
  -- This diagnostic must not bypass protection of the uniquely matched escrow.
  v_base := v_base || jsonb_build_object('amount_exceeds_payment',p_amount_usd_cents>v_expected);
  if exists(select 1 from orders where id=any(v_orders) and status not in('paid','delivered','disputed','refunded')) then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','order_incompatible');
  end if;

  -- Lock the SAME rows updated by mature_wallets before inspecting status.
  -- If maturation won the race, it remains matured: never claw back a seller.
  perform 1 from escrow_entries where order_id=any(v_orders) order by id for update;
  select count(*) into v_missing from unnest(v_orders) o(id)
    where not exists(select 1 from escrow_entries e where e.order_id=o.id);
  if v_missing>0 then
    return v_base || jsonb_build_object('ok',false,'retryable',true,'reason','escrow_unavailable');
  end if;
  select count(*) filter(where status='matured'),count(*) filter(where status='reversed')
    into v_matured,v_reversed from escrow_entries where order_id=any(v_orders);
  select exists(select 1 from zabelie_stripe_dispute_events
    where dispute_id=p_dispute_id and dispute_status in('won','warning_closed','prevented'))
    into v_terminal_no_new_hold;
  -- A resolved/prevented dispute delivered before created prevents a new hold.
  -- Terminal/closed receipts NEVER clear a hold already placed (human decision).
  if coalesce(v_enabled,false) and not v_terminal_no_new_hold then
    update escrow_entries set dispute_frozen_at=coalesce(dispute_frozen_at,v_receipt.received_at)
      where order_id=any(v_orders) and status='maturing' and dispute_frozen_at is null;
    get diagnostics v_frozen=row_count;
  end if;
  return v_base || jsonb_build_object('ok',true,'retryable',false,
    'reason',case when v_terminal_no_new_hold then 'terminal_recorded' when not coalesce(v_enabled,false) then 'freeze_disabled'
                  when v_matured>0 then 'post_maturation_review' else 'recorded' end,
    'frozen_count',v_frozen,'matured_count',v_matured,'reversed_count',v_reversed,
    'requires_review',true);
end $$;
revoke all on function public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)
  from public,anon,authenticated;
grant execute on function public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean) to service_role;

-- Extend the live definition, preserving every delivery/wallet mechanism.
do $patch$
declare src text; anchor text := 'and not gated_on_delivery';
begin
  src := pg_get_functiondef('public.mature_wallets()'::regprocedure);
  if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1
     or position('dispute_frozen_at' in src)>0 then
    raise exception '0151: unexpected mature_wallets definition';
  end if;
  execute replace(src,anchor,anchor || E'\n       and dispute_frozen_at is null');
end $patch$;

-- Existing six queues, unchanged, plus one technical line per dispute (not
-- per webhook delivery). Identifiers are text to also represent Stripe dp_*.
create or replace function public.zabelie_operations_queue(p_limit integer default 30,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path=public as $$
 with existing as (
  select 'payment_pending'::text kind,p.id::text id,o.id order_id,o.order_ref reference,o.amount_htg::bigint amount_htg,p.rail::text rail,p.created_at since
   from payments p join orders o on o.id=p.order_id
   where p.status='pending' and p.created_at<now()-make_interval(mins=>(select pending_minutes from zabelie_operations_config where id))
  union all
  select 'payment_review',p.id::text,o.id,o.order_ref,o.amount_htg,p.rail::text,p.confirmed_at
   from payments p join orders o on o.id=p.order_id where p.status='confirmed' and o.status in('pending','disputed')
  union all
  select 'handover',f.order_id::text,o.id,o.order_ref,o.amount_htg,null,f.updated_at
   from zabelie_fulfillment f join orders o on o.id=f.order_id
   where f.status in('action_required','disputed_by_buyer') and o.status<>'refunded'
  union all
  select 'support',c.id::text,o.id,o.order_ref,o.amount_htg,null,c.created_at
   from zabelie_support_cases c join orders o on o.id=c.order_id where c.status<>'resolved'
  union all
  select 'refund',o.id::text,o.id,o.order_ref,o.amount_htg,null,o.created_at from orders o
   where o.status='refunded' and o.amount_htg>0 and not exists(select 1 from zabelie_refund_receipts r where r.order_id=o.id)
  union all
  select 'payout',p.id::text,null,null,p.amount_htg,null,p.created_at from payouts p where p.status in('requested','processing')
 ), disputes as (
  select dispute_id,min(received_at) since,
    string_agg(distinct dispute_status,' / ' order by dispute_status) stripe_status,
    string_agg(distinct event_type,' / ' order by event_type) stripe_event_type,
    case when count(distinct payment_intent_id)=1 then min(payment_intent_id) end payment_intent_id
  from zabelie_stripe_dispute_events group by dispute_id
 ), mappings as (
  select d.*,m.order_id from disputes d left join lateral (
   select (array_agg(p.order_id))[1] order_id from payments p
    where p.rail='stripe' and p.provider_ref=d.payment_intent_id having count(*)=1
  ) m on true
 ), rows as (
  select e.*,null::text stripe_status,null::text stripe_event_type,null::text payment_intent_id,
    null::boolean freeze_active,null::boolean freeze_enabled,null::boolean requires_review from existing e
  union all
  select 'stripe_dispute',d.dispute_id,o.id,o.order_ref,o.amount_htg,'stripe',d.since,
    d.stripe_status,d.stripe_event_type,d.payment_intent_id,
    exists(select 1 from escrow_entries e join orders eo on eo.id=e.order_id
      where e.status='maturing' and e.dispute_frozen_at is not null and
        (eo.id=o.id or (o.group_id is not null and eo.group_id=o.group_id))),
    (select stripe_dispute_freeze_enabled from zabelie_operations_config where id),true
  from mappings d left join orders o on o.id=d.order_id
 ), page as (
  select * from rows order by since,id,kind limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,least(coalesce(p_offset,0),100000))
 )
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;
revoke all on function public.zabelie_operations_queue(integer,integer) from public,anon,authenticated;
grant execute on function public.zabelie_operations_queue(integer,integer) to service_role;

-- Explicit snapshot of the existing probe (0150), extended without removing
-- any prior object; the code/probe coverage guard reads this migration.
create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  -- Presence of the gate/table family means this module is installed (or
  -- partially installed). Its objects remain required even while the gate
  -- is closed: it can open automatically after the first real sale.
  with panier_installe as (
    select to_regprocedure('public.zabelie_panier_groupe_ouvert()') is not null
        or to_regclass('public.zabelie_panier_config') is not null
        or to_regclass('public.zabelie_order_groups') is not null as oui
  )
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
      ('zabelie_avis_produit(uuid,integer)', 'sans elle, les fiches produit n''affichent plus aucun avis (0137) : la lecture directe des auteurs est fermee'),
      ('zabelie_identites_verifiees(uuid[])', 'sans elle, aucun badge Identite verifiee ne s''affiche (0138) : silencieux, la page reste correcte'),
      ('zabelie_repondre_avis(uuid,text)', 'sans elle, un vendeur ne peut plus repondre a un avis (0139) : la route rend une erreur'),
      ('zabelie_authoring_creer_projet(text,text,text,text)', 'sans elle, aucun vendeur ne cree de projet dans le Studio de creation (0141) : la route rend une erreur'),
      ('zabelie_authoring_approuver_plan(uuid,integer)', 'sans elle, aucun plan de guide ne s''approuve (0141) : la redaction reste bloquee'),
      ('zabelie_authoring_archiver(uuid)', 'sans elle, un projet du Studio ne s''archive plus (0141) : le plafond de projets actifs devient un mur'),
      ('zabelie_authoring_demander(uuid,text,uuid,uuid)', 'sans elle, aucune suggestion ne peut etre demandee (0142) : quotas et idempotence ne sont plus tenus'),
      ('zabelie_authoring_annuler(uuid)', 'sans elle, une demande en attente ne s''annule plus (0142)'),
      ('zabelie_authoring_quota()', 'sans elle, le compteur de suggestions restantes ne s''affiche plus (0142)'),
      ('zabelie_authoring_prendre_bail(uuid,uuid)', 'sans elle, aucune suggestion n''est traitee (0142) : les demandes restent en attente'),
      ('zabelie_authoring_marquer_soumis(uuid,uuid,text)', 'sans elle, rien ne part vers le fournisseur (0142) : la verification avant envoi est le seul passage'),
      ('zabelie_authoring_conclure(uuid,uuid,text,jsonb,text,integer,integer)', 'sans elle, aucun resultat n''est enregistre (0142) : les operations restent en cours puis deviennent incertaines'),
      ('zabelie_authoring_opportunites()', 'sans elle, le tableau du Studio n''affiche plus aucune opportunite (0143) : silencieux, l''etat vide s''affiche'),
      ('zabelie_authoring_approuver_revision(uuid,integer,boolean)', 'sans elle, aucun guide ne s''approuve avant export (0146) : l''export reste ferme'),
      ('zabelie_authoring_enregistrer_export(uuid,uuid,integer,text,text,integer,integer,text,integer,integer)', 'sans elle, aucun PDF du Studio n''est enregistre (0147) : la route rend une erreur, le fichier depose reste sans ligne'),
      ('zabelie_authoring_approuver_export(uuid,text)', 'sans elle, aucun PDF du Studio ne s''approuve (0147) : rien ne peut partir vers une fiche produit'),
      ('zabelie_authoring_supprimer_projet(uuid,boolean)', 'sans elle, un projet archive du Studio ne se supprime plus (0149) : la route rend une erreur'),
      ('zabelie_authoring_purge_candidats(integer)', 'sans elle, les projets des comptes fermes ne sont plus reperes (0149) : guides et PDF restent apres la fermeture'),
      ('zabelie_authoring_purge_comptes_fermes(uuid[])', 'sans elle, les projets des comptes fermes ne sont plus supprimes (0149) : les PDF sont retires mais les lignes restent'),
      -- ── Essayage virtuel (0150) : appelées par lib/essayage/base.ts ──
      ('zabelie_essayage_eligible(uuid,uuid)', 'sans elle, aucune fiche ne propose l''essayage (0150) : le bouton disparait, rien ne casse'),
      ('zabelie_essayage_reserver(uuid,uuid,text)', 'sans elle, aucun essai ne demarre (0150) : la route rend une erreur, rien n''est facture'),
      ('zabelie_essayage_lancer(uuid,text)', 'sans elle, un essai cree chez le fournisseur n''est plus suivi (0150) : il echoue au bout de 60 s, deja facture'),
      ('zabelie_essayage_terminer(uuid,text,text)', 'sans elle, un essai ne se clot plus (0150) : les echecs comptent dans le quota et le plafond'),
      ('zabelie_essayage_exposer(uuid,uuid,text)', 'sans elle, la mesure du pilote perd ses expositions (0150) : resultats faux, silencieux'),
      ('zabelie_essayage_compteur()', 'sans elle, l''administration ne voit plus le compteur du mois (0150) : le panneau rend une erreur, l''essayage continue'),
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_accept_account_legal(text,text,boolean,boolean)', 'enregistre les deux déclarations explicites de la première session OAuth (0133)'),
      ('zabelie_record_refund_receipt(uuid,uuid,text,text,timestamp with time zone)', 'sans elle, le retour effectif des fonds ne peut plus etre documente'),
      ('zabelie_operations_queue(integer,integer)', 'sans elle, les commandes bloquees disparaissent du suivi administrateur'),
      ('zabelie_market_metrics(integer)', 'sans elle, les ventes reelles par zone et categorie ne sont plus mesurables'),
      ('zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)', 'signed Stripe dispute receipts and dormant pre-maturation hold (0151)'),
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
      ('zabelie_purge_search_misses()',
       'purge la rétention 90 j des recherches (cron 14:15) : absente, des requêtes utilisateurs sont conservées au-delà de la durée annoncée'),

      -- ── KYC (0079) ───────────────────────────────────────────────────────
      ('zabelie_register_kyc_document(uuid,text,text,jsonb)',
       'le depot atomique des pieces KYC (0130) : absente, aucun document ne peut etre depose sans perdre la protection des decisions concurrentes'),
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
    ('zabelie_seller_domains','les domaines personnalises des boutiques (0125)')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_support_message_immutable','les messages non modifiables'),
    ('zabelie_refund_receipt_immutable','les justificatifs non modifiables'),
    ('zabelie_order_seller_guard','interdit les commandes des vendeurs suspendus'),
    ('zabelie_original_payment_method_guard','conserve le moyen d’origine après purge du payload (0132)'),
    ('zabelie_preserve_account_closure','conserve la date de fermeture au rejeu'),
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
    ('zabelie_products_projet_garde','un produit ne se rattache qu''au projet de son propre vendeur, et ce lien ne change plus (0148)')
  ) v(objet,pourquoi)
  union all
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_panier_groupe_ouvert()',
     'le gate du panier groupe (0128) : absent apres installation, le panier ne peut plus respecter son ouverture conditionnelle'),
    ('zabelie_group_create(uuid,payment_rail)',
     'ouvre un paiement groupe du panier (0128) : absente apres installation, la preparation du panier echoue'),
    ('zabelie_group_seal(uuid)',
     'scelle le total du panier depuis la base (0128) : absente apres installation, aucun paiement groupe ne part vers l''operateur'),
    ('zabelie_group_abort(uuid)',
     'abandonne un groupe avant paiement (0128) : absente apres installation, ses commandes restent pending et tiennent le stock'),
    ('zabelie_confirm_group_payment(uuid,text,jsonb,integer,integer)',
     'confirme les commandes d''un panier paye (0128) : absente apres installation, un encaissement groupe ne confirme aucune commande')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_order_groups','les paniers payes en une fois (0128) : absente apres installation, le regroupement des commandes est impossible'),
    ('zabelie_panier_config','le gate du paiement groupe (0128) : absente apres installation, la condition d''ouverture ne peut plus etre verifiee')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_group_leader_failed','propage l''echec de la meneuse au panier (0128) : absent apres installation, les autres commandes restent pending et tiennent le stock')
  ) v(objet,pourquoi)
  where (select oui from panier_installe)
  union all
  select 'payments.zabelie_original_method', exists(select 1 from pg_attribute where attrelid='public.payments'::regclass and attname='zabelie_original_method' and not attisdropped), 'conserve le moyen d’origine sans payload personnel (0132)'
  union all
  select 'zabelie_stripe_dispute_event_immutable()',to_regprocedure('public.zabelie_stripe_dispute_event_immutable()') is not null,'immutable Stripe receipts (0151)'
  union all
  select 'zabelie_stripe_dispute_events',to_regclass('public.zabelie_stripe_dispute_events') is not null,'durable Stripe receipt journal (0151)'
  union all
  select 'zabelie_stripe_dispute_event_immutable',exists(select 1 from pg_trigger where tgname='zabelie_stripe_dispute_event_immutable' and not tgisinternal and tgenabled<>'D'),'append-only Stripe receipt guard (0151)'
  union all
  select 'zabelie_stripe_dispute_event_no_truncate',exists(select 1 from pg_trigger where tgname='zabelie_stripe_dispute_event_no_truncate' and not tgisinternal and tgenabled<>'D'),'Stripe receipt truncate guard (0151)'
  union all
  select 'escrow_entries.dispute_frozen_at',exists(select 1 from pg_attribute where attrelid='public.escrow_entries'::regclass and attname='dispute_frozen_at' and not attisdropped),'independent escrow dispute hold (0151)'
  union all
  select 'zabelie_operations_config.stripe_dispute_freeze_enabled',exists(select 1 from pg_attribute where attrelid='public.zabelie_operations_config'::regclass and attname='stripe_dispute_freeze_enabled' and not attisdropped),'dormant dispute hold gate (0151)'
  union all
  select 'products.zabelie_authoring_project_id', exists(select 1 from pg_attribute where attrelid='public.products'::regclass and attname='zabelie_authoring_project_id' and not attisdropped), 'sans elle, « Soumettre a la revue » ne rattache aucun guide du Studio a sa fiche (0148) : la route rend une erreur';
$$;

do $$
begin
  if has_function_privilege('anon','public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)','EXECUTE')
     or not has_function_privilege('service_role','public.zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)','EXECUTE')
     or has_table_privilege('anon','public.zabelie_stripe_dispute_events','SELECT')
     or has_table_privilege('authenticated','public.zabelie_stripe_dispute_events','SELECT')
     or has_table_privilege('service_role','public.zabelie_stripe_dispute_events','INSERT') then
    raise exception '0151: Stripe dispute privileges must remain service-only through RPC';
  end if;
  if exists(select 1 from zabelie_operations_config where stripe_dispute_freeze_enabled) then
    raise exception '0151: dispute retention must remain dormant';
  end if;
  if (select count(*) from zabelie_objets_requis() where present and
      (objet like 'zabelie_stripe_dispute_%' or objet like 'zabelie_record_stripe_dispute(%'
       or objet='escrow_entries.dispute_frozen_at' or objet='zabelie_operations_config.stripe_dispute_freeze_enabled'))<>7 then
    raise exception '0151: Stripe dispute probe incomplete';
  end if;
end $$;
