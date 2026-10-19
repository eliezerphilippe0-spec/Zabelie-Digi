select zabelie_migration_garde('0150_zabelie_essayage.sql');

-- 0150 — Essayage virtuel, pilote (docs/74 ; tasks/essayage-todo.md 3.1 et 3.2).
-- Exige 0001 (products, profiles), 0035 et 0077 (taxonomie), 0036 (physique),
-- 0098 (products.category_id).
--
-- ─── CE QUE LA BASE GARANTIT ───────────────────────────────────────────────
-- 1. Rien de l'essayage n'est lisible ni modifiable par `anon` ou
--    `authenticated` : tables et fonctions au rôle service seul. Le serveur
--    passe l'identité de l'acheteur tirée de la session VÉRIFIÉE, jamais d'une
--    donnée du navigateur. Raison : un acheteur qui pourrait clore lui-même un
--    essai le dirait « échoué », sortirait du quota et obtiendrait des essais
--    payants sans limite.
-- 2. Une fiche n'est éligible que publiée, physique, avec photo principale,
--    d'un vendeur pilote actif, rangée dans un sous-rayon ouvert (niveau 3),
--    et regardée par un autre que son vendeur.
-- 3. Pause, plafond du mois haïtien (global) et quota du jour haïtien (par
--    acheteur) sont vérifiés puis l'essai inscrit sous UN verrou : des
--    réservations simultanées ne dépassent jamais le plafond.
-- 4. Seul un essai ÉCHOUÉ ne compte pas. Un essai abandonné « en cours »
--    compte : le fournisseur facture dès la création.
-- 5. Aucune colonne ne contient de photo, d'URL de photo ou de résultat.
--
-- La sonde `zabelie_objets_requis()` reçoit ces fonctions en fin de fichier,
-- avec leurs appels `.rpc()` (lib/essayage/base.ts, tâche 4.1) ; sans appelant,
-- ce seraient des fantômes (`tests/objets-requis-couverture.test.ts`).

-- ── Réglages du pilote (une ligne) ─────────────────────────────────────────
create table public.zabelie_essayage_config (
  id           boolean primary key default true check (id),
  plafond_mois integer not null default 1000 check (plafond_mois between 0 and 1000000),
  quota_jour   integer not null default 5 check (quota_jour between 0 and 100),
  en_pause     boolean not null default false,
  modifie_le   timestamptz not null default now()
);
insert into public.zabelie_essayage_config (id) values (true) on conflict do nothing;

-- ── Vendeurs pilotes, activés un par un par l'administration ───────────────
create table public.zabelie_essayage_vendeurs (
  seller_id  uuid primary key references public.profiles (id) on delete cascade,
  actif      boolean not null default true,
  active_par uuid references public.profiles (id) on delete set null,
  active_le  timestamptz not null default now()
);

-- ── Sous-rayons ouverts (docs/74 §2.1 ; la même liste que lib/essayage/regles.ts) ──
create table public.zabelie_essayage_rayons (
  category_id uuid primary key references public.zabelie_categories (id) on delete cascade
);
insert into public.zabelie_essayage_rayons (category_id)
select c.id
  from public.zabelie_categories c
  join public.zabelie_categories parent on parent.id = c.parent_id
 where c.level = 3
   and parent.slug in ('rad-fanm', 'rad-gason', 'rad-espo')
   and c.slug in (
     'wob', 'blouz-chemizye', 'pantalon-djin-fanm', 'jip', 'ansanm-taye', 'ves-manto-fanm', 'rad-tradisyonel',
     'chemiz', 'mayo-polo', 'pantalon-djin-gason', 'chot', 'kostim', 'ves-gason',
     'mayo-chot-espo', 'sivetman')
on conflict do nothing;
-- Fermé par défaut : si l'arbre ne rend pas les quinze, la migration s'arrête
-- plutôt que d'ouvrir un rayon de travers ou d'en fermer un sans bruit.
do $$
begin
  if (select count(*) from public.zabelie_essayage_rayons) <> 15 then
    raise exception 'essayage : % sous-rayons trouvés au lieu de 15', (select count(*) from public.zabelie_essayage_rayons);
  end if;
end;
$$;

-- ── Essais : qui, quoi, chez qui, où en est-il. Jamais la photo ni le résultat ──
create table public.zabelie_essayage_essais (
  id          uuid primary key default gen_random_uuid(),
  acheteur_id uuid not null references public.profiles (id) on delete cascade,
  produit_id  uuid not null references public.products (id) on delete cascade,
  vendeur_id  uuid not null references public.profiles (id) on delete cascade,
  fournisseur text not null check (fournisseur in ('genlook', 'fashn', 'simulation')),
  travail_id  text check (travail_id is null or length(travail_id) between 1 and 200),
  statut      text not null default 'en_cours' check (statut in ('en_cours', 'reussi', 'echec')),
  raison      text check (raison is null or raison in ('moderation', 'photo_refusee', 'fournisseur', 'delai')),
  cree_le     timestamptz not null default now(),
  termine_le  timestamptz,
  constraint zabelie_essayage_essais_fin check ((statut = 'en_cours') = (termine_le is null)),
  constraint zabelie_essayage_essais_raison check ((statut = 'echec') = (raison is not null))
);
create index zabelie_essayage_essais_acheteur_idx on public.zabelie_essayage_essais (acheteur_id, cree_le desc);
create index zabelie_essayage_essais_cree_idx on public.zabelie_essayage_essais (cree_le);

-- ── Expositions : première vue d'une fiche éligible, par jour, dans les deux groupes ──
create table public.zabelie_essayage_expositions (
  acheteur_id  uuid not null references public.profiles (id) on delete cascade,
  produit_id   uuid not null references public.products (id) on delete cascade,
  groupe       text not null check (groupe in ('essai', 'temoin')),
  jour         date not null,
  premiere_vue timestamptz not null default now(),
  primary key (acheteur_id, produit_id, jour)
);

-- ── Droits : rôle service seul. RLS active et aucune politique : rien pour les clients ──
alter table public.zabelie_essayage_config enable row level security;
alter table public.zabelie_essayage_vendeurs enable row level security;
alter table public.zabelie_essayage_rayons enable row level security;
alter table public.zabelie_essayage_essais enable row level security;
alter table public.zabelie_essayage_expositions enable row level security;
revoke all on public.zabelie_essayage_config, public.zabelie_essayage_vendeurs, public.zabelie_essayage_rayons,
              public.zabelie_essayage_essais, public.zabelie_essayage_expositions
  from public, anon, authenticated, service_role;
-- L'administration (tâche 5.1) règle le pilote et ses vendeurs ; elle LIT les essais.
grant select, update on public.zabelie_essayage_config to service_role;
grant select, insert, update, delete on public.zabelie_essayage_vendeurs to service_role;
grant select on public.zabelie_essayage_rayons to service_role;
-- Essais et expositions ne s'écrivent QUE par les fonctions ci-dessous.
grant select on public.zabelie_essayage_essais, public.zabelie_essayage_expositions to service_role;

-- ── Éligibilité d'une fiche (et, si l'acheteur est donné, pas la sienne) ───
create function public.zabelie_essayage_eligible(p_produit uuid, p_acheteur uuid default null)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.products p
      join public.zabelie_essayage_vendeurs v on v.seller_id = p.seller_id and v.actif
      join public.zabelie_essayage_rayons r on r.category_id = p.category_id
     where p.id = p_produit
       and p.status = 'published'
       and p.kind = 'physical'
       and nullif(btrim(p.cover_url), '') is not null
       and (p_acheteur is null or p.seller_id <> p_acheteur)
  );
$$;

-- ── Réserver un essai : éligibilité, pause, plafond, quota, inscription ────
-- Rend (essai, null) ou (null, refus) avec refus parmi non_eligible, pause,
-- plafond, quota : les codes de lib/essayage/regles.ts.
create function public.zabelie_essayage_reserver(p_acheteur uuid, p_produit uuid, p_fournisseur text)
returns table (essai uuid, refus text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.zabelie_essayage_config%rowtype;
  v_jour timestamptz := date_trunc('day', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_mois timestamptz := date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince';
  v_n integer;
  v_vendeur uuid;
  v_id uuid;
begin
  if p_acheteur is null or p_produit is null or p_fournisseur is null
     or p_fournisseur not in ('genlook', 'fashn', 'simulation') then
    raise exception 'essayage_demande_invalide' using errcode = '22023';
  end if;
  if not public.zabelie_essayage_eligible(p_produit, p_acheteur) then
    return query select null::uuid, 'non_eligible'::text;
    return;
  end if;

  -- Tout ce qui suit est sérialisé : pause, plafond, quota et inscription.
  perform pg_advisory_xact_lock(hashtext('zabelie_essayage_essais'));

  select * into c from public.zabelie_essayage_config where id;
  if not found then
    raise exception 'essayage_config_absente' using errcode = 'P0001';
  end if;
  if c.en_pause then
    return query select null::uuid, 'pause'::text;
    return;
  end if;
  -- Seul un essai échoué ne compte pas (garantie 4).
  select count(*) into v_n from public.zabelie_essayage_essais where cree_le >= v_mois and statut <> 'echec';
  if v_n >= c.plafond_mois then
    return query select null::uuid, 'plafond'::text;
    return;
  end if;
  select count(*) into v_n from public.zabelie_essayage_essais
   where acheteur_id = p_acheteur and cree_le >= v_jour and statut <> 'echec';
  if v_n >= c.quota_jour then
    return query select null::uuid, 'quota'::text;
    return;
  end if;

  select seller_id into v_vendeur from public.products where id = p_produit;
  insert into public.zabelie_essayage_essais (acheteur_id, produit_id, vendeur_id, fournisseur)
  values (p_acheteur, p_produit, v_vendeur, p_fournisseur)
  returning id into v_id;
  return query select v_id, null::text;
end;
$$;

-- ── Noter le travail du fournisseur, une seule fois, sur un essai en cours ─
create function public.zabelie_essayage_lancer(p_essai uuid, p_travail text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  if p_travail is null or length(p_travail) not between 1 and 200 then
    raise exception 'essayage_travail_invalide' using errcode = '22023';
  end if;
  update public.zabelie_essayage_essais
     set travail_id = p_travail
   where id = p_essai and statut = 'en_cours' and travail_id is null
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ── Clore un essai : en cours → réussi, ou échec avec sa raison. Une fois ──
create function public.zabelie_essayage_terminer(p_essai uuid, p_statut text, p_raison text default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  if p_statut is null or p_statut not in ('reussi', 'echec')
     or (p_statut = 'echec') <> (p_raison is not null)
     or (p_raison is not null and p_raison not in ('moderation', 'photo_refusee', 'fournisseur', 'delai')) then
    raise exception 'essayage_fin_invalide' using errcode = '22023';
  end if;
  update public.zabelie_essayage_essais
     set statut = p_statut, raison = p_raison, termine_le = now()
   where id = p_essai and statut = 'en_cours'
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ── Exposition : une par acheteur, fiche et jour haïtien, fiche éligible seulement ──
create function public.zabelie_essayage_exposer(p_acheteur uuid, p_produit uuid, p_groupe text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_acheteur is null or p_groupe is null or p_groupe not in ('essai', 'temoin') then
    raise exception 'essayage_exposition_invalide' using errcode = '22023';
  end if;
  if not public.zabelie_essayage_eligible(p_produit, p_acheteur) then
    return;
  end if;
  insert into public.zabelie_essayage_expositions (acheteur_id, produit_id, groupe, jour)
  values (p_acheteur, p_produit, p_groupe, (now() at time zone 'America/Port-au-Prince')::date)
  on conflict do nothing;
end;
$$;

revoke all on function public.zabelie_essayage_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_reserver(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_lancer(uuid, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_terminer(uuid, text, text) from public, anon, authenticated;
revoke all on function public.zabelie_essayage_exposer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.zabelie_essayage_eligible(uuid, uuid) to service_role;
grant execute on function public.zabelie_essayage_reserver(uuid, uuid, text) to service_role;
grant execute on function public.zabelie_essayage_lancer(uuid, text) to service_role;
grant execute on function public.zabelie_essayage_terminer(uuid, text, text) to service_role;
grant execute on function public.zabelie_essayage_exposer(uuid, uuid, text) to service_role;

-- ── Sonde de présence (`/api/admin/coherence`) ───────────────────────────
-- Redéfinition COMPLÈTE de la sonde de 0149, avec les cinq fonctions de 0150
-- en plus, maintenant que lib/essayage/base.ts les appelle par `.rpc()`
-- ce seraient des fantômes (`tests/objets-requis-couverture.test.ts`).
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
      ('zabelie_submit_support(uuid,uuid,uuid,text,text,text)', 'les demandes et reponses du support'),
      ('zabelie_accept_account_legal(text,text,boolean,boolean)', 'enregistre les deux déclarations explicites de la première session OAuth (0133)'),
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
  select 'products.zabelie_authoring_project_id', exists(select 1 from pg_attribute where attrelid='public.products'::regclass and attname='zabelie_authoring_project_id' and not attisdropped), 'sans elle, « Soumettre a la revue » ne rattache aucun guide du Studio a sa fiche (0148) : la route rend une erreur';
$$;

-- ── Post-conditions : on asserte l'EFFET ──────────────────────────────────
do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'public.zabelie_essayage_eligible(uuid,uuid)', 'public.zabelie_essayage_reserver(uuid,uuid,text)',
    'public.zabelie_essayage_lancer(uuid,text)', 'public.zabelie_essayage_terminer(uuid,text,text)',
    'public.zabelie_essayage_exposer(uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon', v_f, 'EXECUTE') or has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'ZB150 : % doit rester au rôle service', v_f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.zabelie_essayage_essais', 'SELECT')
     or has_table_privilege('anon', 'public.zabelie_essayage_essais', 'SELECT')
     or has_table_privilege('service_role', 'public.zabelie_essayage_essais', 'INSERT') then
    raise exception 'ZB150 : droits des essais incorrects';
  end if;
  if (select count(*) from zabelie_objets_requis() where objet like 'zabelie_essayage_%' and present) <> 5 then
    raise exception 'ZB150 : sonde non à jour';
  end if;
end;
$$;
