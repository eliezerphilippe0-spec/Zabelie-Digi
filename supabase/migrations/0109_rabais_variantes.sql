select zabelie_migration_garde('0109_rabais_variantes.sql');

-- Le prix barré vient uniquement du prix pratiqué par cette variante.
alter table public.zabelie_product_variants
  add column compare_at_htg bigint
  check (compare_at_htg is null or compare_at_htg > price_htg);

-- Les rabais antérieurs d'une variante unique gardent leur origine.
update public.zabelie_product_variants v
set compare_at_htg = p.compare_at_htg
from public.products p
where p.id = v.product_id and v.active and p.compare_at_htg > v.price_htg
  and p.price_htg = v.price_htg
  and (select count(*) from public.zabelie_product_variants a
       where a.product_id = p.id and a.active) = 1;

create function public.zabelie_set_variant_discount(
  p_user_id uuid, p_product_id uuid, p_variant_id uuid, p_new_price_htg bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_product products;
  v_variant zabelie_product_variants;
  v_min zabelie_product_variants;
  v_count integer;
begin
  -- Même ordre de verrouillage que le rabais classique : produit puis variante.
  select * into v_product from products
    where id = p_product_id and seller_id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  select * into v_variant from zabelie_product_variants
    where id = p_variant_id and product_id = p_product_id and active for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  if p_new_price_htg is null or p_new_price_htg <= 0 or p_new_price_htg > 2147483647 then
    return jsonb_build_object('ok', false, 'reason', 'prix_invalide');
  end if;
  if p_new_price_htg >= v_variant.price_htg then
    return jsonb_build_object('ok', false, 'reason', 'pas_une_baisse');
  end if;
  if exists(select 1 from zabelie_flash_sales where product_id=p_product_id
    and annulee_a is null and fin > now()) then
    return jsonb_build_object('ok', false, 'reason', 'flash_active');
  end if;
  update zabelie_product_variants
    set compare_at_htg = coalesce(compare_at_htg, price_htg), price_htg = p_new_price_htg
    where id = p_variant_id;
  select * into v_min from zabelie_product_variants where product_id=p_product_id and active
    order by price_htg, position, id limit 1;
  select count(*) into v_count from zabelie_product_variants where product_id=p_product_id and active;
  -- Le catalogue affiche le minimum. Plusieurs variantes n'ont pas un ancien prix commun.
  update products set price_htg=v_min.price_htg,
    compare_at_htg=case when v_count=1 then v_min.compare_at_htg else null end
    where id=p_product_id;
  return jsonb_build_object('ok', true, 'ancien_htg', coalesce(v_variant.compare_at_htg, v_variant.price_htg),
    'nouveau_htg', p_new_price_htg);
end;
$$;
revoke all on function public.zabelie_set_variant_discount(uuid,uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.zabelie_set_variant_discount(uuid,uuid,uuid,bigint) to service_role;

create function public.zabelie_clear_variant_discount(
  p_user_id uuid, p_product_id uuid, p_variant_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_variant zabelie_product_variants; v_count integer;
begin
  perform 1 from products where id=p_product_id and seller_id=p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  select * into v_variant from zabelie_product_variants
    where id=p_variant_id and product_id=p_product_id and active for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  update zabelie_product_variants set compare_at_htg=null where id=p_variant_id;
  select count(*) into v_count from zabelie_product_variants where product_id=p_product_id and active;
  if v_count=1 then update products set compare_at_htg=null where id=p_product_id; end if;
  -- Retirer le barré ne remonte jamais le prix.
  return jsonb_build_object('ok', true, 'prix_htg', v_variant.price_htg);
end;
$$;
revoke all on function public.zabelie_clear_variant_discount(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.zabelie_clear_variant_discount(uuid,uuid,uuid) to service_role;

create or replace function zabelie_set_discount(
  p_user_id      uuid,
  p_product_id   uuid,
  p_new_price_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products;
  v_variants integer;
begin
  select * into v_product from products
   where id = p_product_id and seller_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  if p_new_price_htg is null or p_new_price_htg <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'prix_invalide');
  end if;
  if p_new_price_htg >= v_product.price_htg then
    return jsonb_build_object('ok', false, 'reason', 'pas_une_baisse',
                              'prix_actuel_htg', v_product.price_htg);
  end if;

  select count(*) into v_variants from zabelie_product_variants
   where product_id = p_product_id and active;
  if v_variants > 1 then
    return jsonb_build_object('ok', false, 'reason', 'variantes_multiples');
  end if;

  update products
     set compare_at_htg = coalesce(compare_at_htg, price_htg),
         price_htg = p_new_price_htg
   where id = p_product_id;

  -- Le chemin d'argent physique lit la VARIANTE : elle suit, même geste.
  if v_variants = 1 then
    update zabelie_product_variants
       set compare_at_htg = coalesce(compare_at_htg, price_htg), price_htg = p_new_price_htg
     where product_id = p_product_id and active;
  end if;

  return jsonb_build_object('ok', true,
    'ancien_htg', coalesce(v_product.compare_at_htg, v_product.price_htg),
    'nouveau_htg', p_new_price_htg);
end;
$$;
revoke all on function zabelie_set_discount(uuid, uuid, bigint)
  from public, anon, authenticated;

-- ── RPC : retirer le rabais ─────────────────────────────────────────────────
create or replace function zabelie_clear_discount(
  p_user_id    uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_product products;
begin
  select * into v_product from products
   where id = p_product_id and seller_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  update products set compare_at_htg = null where id = p_product_id;
  if (select count(*) from zabelie_product_variants where product_id=p_product_id and active) <= 1 then
    update zabelie_product_variants set compare_at_htg=null where product_id=p_product_id and active;
  end if;
  return jsonb_build_object('ok', true, 'prix_htg', v_product.price_htg);
end;
$$;
revoke all on function zabelie_clear_discount(uuid, uuid)
  from public, anon, authenticated;


create or replace function zabelie_objets_requis()
returns table (objet text, present boolean, pourquoi text)
language sql
stable
set search_path = public, pg_temp
as $$
  select v.objet, to_regprocedure(v.objet) is not null, v.pourquoi
    from (values
      ('zabelie_digital_metrics(uuid)', 'les statistiques des commandes digitales du vendeur'),
      -- ── Le chemin de l'argent. Absente = l'argent entre et rien ne bouge ──
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
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non')
    ) as v(objet, pourquoi)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_seller_pricing_config','configuration des tarifs vendeurs'),
    ('zabelie_seller_launch','eligibilite et compteur des 30 jours'),
    ('zabelie_order_pricing','tarif fige a la commande'),
    ('zabelie_product_commitments','les engagements publics de remise et de disponibilite (0107)'),
    ('zabelie_digital_studio','les brouillons de packs et de formations'),
    ('zabelie_digital_releases','les versions acquises et leurs fichiers privés'),
    ('zabelie_digital_entitlements','le contenu attaché à chaque commande'),
    ('zabelie_digital_progress','la progression privée des acheteurs'),
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
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
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons')
  ) v(objet,pourquoi);
$$;
