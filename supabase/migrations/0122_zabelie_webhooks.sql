select zabelie_migration_garde('0122_zabelie_webhooks.sql');

-- 0122 — Webhooks sortants vers le site du vendeur (brique C de l'API vendeur).
--
-- ─── CE QUE ÇA FAIT ────────────────────────────────────────────────────────
-- Quand une commande passe à `paid` ou à `refunded`, chaque point de
-- terminaison actif du VENDEUR reçoit un événement `sale.paid` /
-- `sale.refunded`, signé HMAC-SHA256.
--
-- ─── POURQUOI UN TRIGGER, ET POURQUOI IL NE PEUT PAS BLOQUER UN PAIEMENT ──
-- Huit chemins confirment un paiement (MonCash, Kobara, Stripe, Zelle,
-- réconciliateurs, gratuit) et trois remboursent. Un trigger sur `orders`
-- les couvre tous, dans la MÊME transaction : pas d'événement sans vente,
-- pas de vente sans événement.
--
-- ⚠️ Mais le trigger vit sur la table de l'argent. S'il levait, il annulerait
-- la confirmation du paiement. Son corps est donc enveloppé : une erreur
-- d'enfilement devient un WARNING journalisé, jamais un échec de paiement.
-- Perdre un webhook se rattrape (le vendeur relit `seller_sales`) ; perdre
-- une confirmation de paiement ne se rattrape pas.
--
-- ─── LE SECRET ─────────────────────────────────────────────────────────────
-- Contrairement à une clé d'API, le secret de signature doit être RELU pour
-- signer : il est stocké tel quel (comme le fait Stripe). Il n'est lisible que
-- par le service : la colonne `secret` est retirée des privilèges de
-- `authenticated` (privilège de colonne), et `anon` n'a rien.
--
-- ─── RELANCES ──────────────────────────────────────────────────────────────
-- 6 tentatives au plus (1 + 5 relances : 1 min, 5 min, 30 min, 2 h, 12 h au
-- plus tôt), puis `dead`. Trois événements `dead` d'affilée désactivent le
-- point de terminaison. Les délais sont des PLANCHERS : l'envoi part après
-- chaque confirmation de paiement et au passage quotidien du cron.

create table zabelie_webhook_endpoints (
  id               uuid primary key default gen_random_uuid(),
  seller_id        uuid not null references profiles(id) on delete cascade,
  url              text not null check (url ~ '^https://[^\s/?#@]+(/[^\s]*)?$' and char_length(url) <= 500),
  secret           text not null check (secret ~ '^whsec_[A-Za-z0-9_-]{43}$'),
  events           text[] not null default array['sale.paid', 'sale.refunded']
                   check (cardinality(events) between 1 and 2
                          and events <@ array['sale.paid', 'sale.refunded']),
  created_at       timestamptz not null default now(),
  disabled_at      timestamptz,
  disabled_reason  text check (disabled_reason in ('seller', 'echecs')),
  consecutive_dead integer not null default 0 check (consecutive_dead >= 0),
  check ((disabled_at is null) = (disabled_reason is null))
);

create index zabelie_webhook_endpoints_seller_idx on zabelie_webhook_endpoints (seller_id) where disabled_at is null;

create table zabelie_webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references zabelie_webhook_endpoints(id) on delete cascade,
  event_id        uuid not null,
  event_type      text not null check (event_type in ('sale.paid', 'sale.refunded', 'webhook.test')),
  order_id        uuid references orders(id) on delete set null,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'dead')),
  attempts        integer not null default 0 check (attempts between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  lease_until     timestamptz,
  last_status     integer,
  last_error      text check (char_length(last_error) <= 300),
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

-- Un événement de vente par (point de terminaison, type, commande) : un
-- rejeu de confirmation ne double pas le webhook.
create unique index zabelie_webhook_deliveries_unique
  on zabelie_webhook_deliveries (endpoint_id, event_type, order_id)
  where order_id is not null;
create index zabelie_webhook_deliveries_due
  on zabelie_webhook_deliveries (next_attempt_at) where status = 'pending';
create index zabelie_webhook_deliveries_endpoint
  on zabelie_webhook_deliveries (endpoint_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table zabelie_webhook_endpoints enable row level security;
alter table zabelie_webhook_deliveries enable row level security;

create policy zabelie_webhook_endpoints_owner_select on zabelie_webhook_endpoints
  for select to authenticated using (seller_id = auth.uid());
create policy zabelie_webhook_deliveries_owner_select on zabelie_webhook_deliveries
  for select to authenticated using (exists (
    select 1 from zabelie_webhook_endpoints e
     where e.id = endpoint_id and e.seller_id = auth.uid()));

revoke all on zabelie_webhook_endpoints, zabelie_webhook_deliveries from anon, authenticated;
grant select (id, seller_id, url, events, created_at, disabled_at, disabled_reason, consecutive_dead)
  on zabelie_webhook_endpoints to authenticated;
grant select (id, endpoint_id, event_id, event_type, order_id, status, attempts, next_attempt_at,
              last_status, last_error, created_at, delivered_at)
  on zabelie_webhook_deliveries to authenticated;

-- ── Plafond : 3 points de terminaison actifs par vendeur ─────────────────────
create or replace function zabelie_webhook_endpoints_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_actifs integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('zabelie_webhook_endpoints:' || new.seller_id::text));
    select count(*) into v_actifs from zabelie_webhook_endpoints
     where seller_id = new.seller_id and disabled_at is null;
    if v_actifs >= 3 then
      raise exception 'ZB122 : 3 points de terminaison actifs au plus par vendeur'
        using errcode = 'ZB122';
    end if;
    return new;
  end if;
  if new.seller_id is distinct from old.seller_id
     or new.url is distinct from old.url
     or new.secret is distinct from old.secret
     or new.events is distinct from old.events then
    raise exception 'ZB122 : un point de terminaison ne change ni d''adresse ni de secret'
      using errcode = 'ZB122';
  end if;
  if old.disabled_at is not null and new.disabled_at is null then
    raise exception 'ZB122 : un point de terminaison désactivé le reste'
      using errcode = 'ZB122';
  end if;
  return new;
end;
$$;

create trigger zabelie_webhook_endpoints_garde
  before insert or update on zabelie_webhook_endpoints
  for each row execute function zabelie_webhook_endpoints_garde();

-- ── Enfilement sur changement de statut de commande ─────────────────────────
create or replace function zabelie_webhook_enfiler_vente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type   text;
  v_seller uuid;
  v_event  uuid := gen_random_uuid();
begin
  if new.status is not distinct from old.status then return new; end if;
  v_type := case new.status when 'paid' then 'sale.paid' when 'refunded' then 'sale.refunded' else null end;
  if v_type is null then return new; end if;

  begin
    select seller_id into v_seller from products where id = new.product_id;
    insert into zabelie_webhook_deliveries (endpoint_id, event_id, event_type, order_id, payload)
    select e.id, v_event, v_type, new.id,
           jsonb_build_object(
             'id', v_event,
             'type', v_type,
             'created_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'data', jsonb_build_object(
               'order_id', new.id,
               'order_ref', new.order_ref,
               'product_id', new.product_id,
               'amount_htg', new.amount_htg,
               'discount_htg', new.discount_htg,
               'currency', 'HTG',
               'status', new.status,
               'live', new.zabelie_payment_is_live))
      from zabelie_webhook_endpoints e
     where e.seller_id = v_seller
       and e.disabled_at is null
       and v_type = any (e.events)
    on conflict do nothing;
  exception when others then
    -- Jamais au prix du paiement : voir l'en-tête.
    raise warning 'ZB122 : webhook non enfilé pour la commande % (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger zabelie_webhook_enfiler_vente
  after update of status on orders
  for each row execute function zabelie_webhook_enfiler_vente();

-- ── Réclamation d'un lot à envoyer (bail de 2 minutes, sans double envoi) ──
create or replace function zabelie_webhook_claim(p_limit integer default 25)
returns table (delivery_id uuid, url text, secret text, event_id uuid, event_type text, payload jsonb, attempts integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Un point de terminaison désactivé ne reçoit plus rien : ses envois en
  -- attente sont clos, pas abandonnés en silence.
  update zabelie_webhook_deliveries d
     set status = 'dead', last_error = 'endpoint_disabled', lease_until = null
    from zabelie_webhook_endpoints e
   where e.id = d.endpoint_id and d.status = 'pending' and e.disabled_at is not null;

  return query
  with lot as (
    select d.id
      from zabelie_webhook_deliveries d
     where d.status = 'pending'
       and d.next_attempt_at <= now()
       and (d.lease_until is null or d.lease_until < now())
     order by d.next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 25), 100))
     for update skip locked
  ), pris as (
    update zabelie_webhook_deliveries d
       set attempts = d.attempts + 1, lease_until = now() + interval '2 minutes'
      from lot where d.id = lot.id
    returning d.id, d.endpoint_id, d.event_id, d.event_type, d.payload, d.attempts
  )
  select pris.id, e.url, e.secret, pris.event_id, pris.event_type, pris.payload, pris.attempts
    from pris join zabelie_webhook_endpoints e on e.id = pris.endpoint_id;
end;
$$;

-- ── Résultat d'un envoi ─────────────────────────────────────────────────────
create or replace function zabelie_webhook_record(
  p_delivery uuid, p_ok boolean, p_status integer, p_error text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_d   zabelie_webhook_deliveries%rowtype;
  v_dead integer;
  v_delais interval[] := array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours'];
begin
  select * into v_d from zabelie_webhook_deliveries where id = p_delivery for update;
  if not found then raise exception 'ZB122 : envoi % inconnu', p_delivery using errcode = 'ZB122'; end if;
  if v_d.status <> 'pending' then return v_d.status; end if;

  if p_ok then
    update zabelie_webhook_deliveries
       set status = 'delivered', delivered_at = now(), last_status = p_status, last_error = null, lease_until = null
     where id = p_delivery;
    update zabelie_webhook_endpoints set consecutive_dead = 0 where id = v_d.endpoint_id;
    return 'delivered';
  end if;

  if v_d.attempts >= 6 then
    update zabelie_webhook_deliveries
       set status = 'dead', last_status = p_status, last_error = left(p_error, 300), lease_until = null
     where id = p_delivery;
    -- Le test d'un vendeur ne compte pas dans la désactivation.
    if v_d.event_type <> 'webhook.test' then
      update zabelie_webhook_endpoints set consecutive_dead = consecutive_dead + 1
       where id = v_d.endpoint_id returning consecutive_dead into v_dead;
      if v_dead >= 3 then
        update zabelie_webhook_endpoints set disabled_at = now(), disabled_reason = 'echecs'
         where id = v_d.endpoint_id and disabled_at is null;
      end if;
    end if;
    return 'dead';
  end if;

  update zabelie_webhook_deliveries
     set next_attempt_at = now() + v_delais[v_d.attempts], last_status = p_status,
         last_error = left(p_error, 300), lease_until = null
   where id = p_delivery;
  return 'pending';
end;
$$;

-- ── Rétention : 30 jours pour les envois clos ──────────────────────────────
create or replace function zabelie_webhook_purge()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  delete from zabelie_webhook_deliveries
   where status in ('delivered', 'dead') and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  raise log 'zabelie_webhook_purge : % envoi(s) supprimé(s)', n;
  return n;
end;
$$;

-- ── Sonde de présence : les objets de 0121 et 0122 rejoignent la liste ─────
-- Copie EXACTE de la définition de `0115` (appliquée, donc intouchable), plus
-- les fonctions RPC, tables et triggers de l'API vendeur.
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
    ('zabelie_webhook_deliveries','la file des envois webhook (0122)')
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
    ('zabelie_webhook_enfiler_vente','enfile les webhooks a chaque vente payee ou remboursee (0122)')
  ) v(objet,pourquoi);
$$;

revoke all on function zabelie_webhook_endpoints_garde() from public, anon, authenticated;
revoke all on function zabelie_webhook_enfiler_vente() from public, anon, authenticated;
revoke all on function zabelie_webhook_claim(integer) from public, anon, authenticated;
revoke all on function zabelie_webhook_record(uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function zabelie_webhook_purge() from public, anon, authenticated;
