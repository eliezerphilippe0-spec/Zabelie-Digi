select zabelie_migration_garde('0104_digital_studio.sql');

-- Paid material never enters a publicly readable JSON column. Public manifests
-- contain only filenames, lesson headings and text explicitly marked free.
create table public.zabelie_digital_studio (
  product_id uuid primary key references public.products(id) on delete cascade,
  mode text not null default 'file' check (mode in ('file','bundle','course')),
  preview text not null default '' check (char_length(preview) <= 6000),
  outcomes text not null default '' check (char_length(outcomes) <= 1600),
  prerequisites text not null default '' check (char_length(prerequisites) <= 1200),
  include_updates boolean not null default false,
  lessons jsonb not null default '[]' check (jsonb_typeof(lessons) = 'array' and jsonb_array_length(lessons) <= 40 and octet_length(lessons::text) <= 640000),
  faq jsonb not null default '[]' check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 8),
  updated_at timestamptz not null default now()
);
alter table public.zabelie_digital_studio enable row level security;
revoke all on public.zabelie_digital_studio from public, anon, authenticated;
grant select on public.zabelie_digital_studio to authenticated;
grant all on public.zabelie_digital_studio to service_role;
create policy zabelie_digital_studio_owner on public.zabelie_digital_studio for select to authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = (select auth.uid())));
create trigger zabelie_digital_studio_draft_guard before insert or update on public.zabelie_digital_studio
for each row execute function public.zabelie_digital_details_draft_guard();

create table public.zabelie_digital_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  details jsonb not null,
  manifest jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(product_id, version)
);
alter table public.zabelie_digital_releases enable row level security;
revoke all on public.zabelie_digital_releases from public, anon, authenticated;
grant select, insert on public.zabelie_digital_releases to service_role;

create table public.zabelie_digital_entitlements (
  order_id uuid primary key references public.orders(id) on delete restrict,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict
);
create index zabelie_digital_entitlements_release_idx on public.zabelie_digital_entitlements(release_id);
alter table public.zabelie_digital_entitlements enable row level security;
revoke all on public.zabelie_digital_entitlements from public, anon, authenticated;
grant select, insert on public.zabelie_digital_entitlements to service_role;

create function public.zabelie_digital_immutable() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  -- Deleting an unsold product/account can cascade. A purchased product is
  -- already protected by orders.product_id RESTRICT and entitlement FKs.
  if tg_table_name='zabelie_digital_releases' and tg_op='DELETE' then
    if not exists(select 1 from public.products where id=old.product_id) then return old; end if;
  end if;
  raise exception 'digital_purchase_snapshot_immutable' using errcode = '23514';
end;
$$;
revoke all on function public.zabelie_digital_immutable() from public, anon, authenticated;
grant execute on function public.zabelie_digital_immutable() to service_role;
create trigger zabelie_digital_release_immutable before update or delete on public.zabelie_digital_releases
for each row execute function public.zabelie_digital_immutable();
create trigger zabelie_digital_entitlement_immutable before update or delete on public.zabelie_digital_entitlements
for each row execute function public.zabelie_digital_immutable();

-- Files are edited only in drafts, serialized against the publication lock.
create unique index zabelie_digital_asset_path_unique on public.product_assets(storage_path);
revoke insert, update, delete on public.product_assets from anon, authenticated;
create function public.zabelie_digital_asset_guard() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid; v_kind public.product_kind; v_status public.product_status;
begin
  v_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  select kind,status into v_kind,v_status from public.products where id=v_id for update;
  if not found then
    if tg_op='DELETE' then return old; end if;
    raise exception 'digital_asset_product_required' using errcode='23514';
  end if;
  if v_kind <> 'fichier' or v_status <> 'draft' then
    raise exception 'digital_asset_draft_required' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then raise exception 'digital_asset_immutable' using errcode='23514'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.product_assets where product_id=v_id) >= 20 then
    raise exception 'digital_asset_limit' using errcode='23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_asset_guard() from public, anon, authenticated;
grant execute on function public.zabelie_digital_asset_guard() to service_role;
create trigger zabelie_digital_asset_guard before insert or update or delete on public.product_assets
for each row execute function public.zabelie_digital_asset_guard();

create function public.zabelie_digital_publish(p_product uuid) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.products; s public.zabelie_digital_studio; v_files jsonb; v_details jsonb;
  v_manifest jsonb; v_version integer; v_id uuid; v_lesson jsonb;
begin
  select * into p from public.products where id=p_product for update;
  if not found or p.kind <> 'fichier' then return null; end if;
  select * into s from public.zabelie_digital_studio where product_id=p.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'storage_path',storage_path,'file_name',file_name,'size_bytes',size_bytes) order by created_at,id),'[]')
    into v_files from public.product_assets where product_id=p.id;
  -- Legacy file fixtures without a deliverable retain their existing fail-closed
  -- API/0059 handling. Studio publications always require actual attached files.
  if jsonb_array_length(v_files)=0 then
    if s.product_id is not null then raise exception 'digital_files_required' using errcode='23514'; end if;
    return null;
  end if;
  if s.mode='bundle' and jsonb_array_length(v_files)<2 then raise exception 'digital_bundle_requires_two_files' using errcode='23514'; end if;
  if s.mode='course' and jsonb_array_length(s.lessons)=0 then raise exception 'digital_course_requires_lessons' using errcode='23514'; end if;
  for v_lesson in select value from jsonb_array_elements(coalesce(s.lessons,'[]')) loop
    if nullif(btrim(v_lesson->>'title'),'') is null or
       (nullif(btrim(v_lesson->>'body'),'') is null and nullif(v_lesson->>'assetId','') is null) then
      raise exception 'digital_lesson_empty' using errcode='23514';
    end if;
    if nullif(v_lesson->>'assetId','') is not null and not exists (
      select 1 from jsonb_array_elements(v_files) f where f->>'id'=v_lesson->>'assetId') then
      raise exception 'digital_lesson_file_missing' using errcode='23514';
    end if;
  end loop;
  select coalesce(to_jsonb(d)-'product_id'-'updated_at','{}') into v_details from public.zabelie_digital_details d where product_id=p.id;
  v_manifest := jsonb_build_object('mode',coalesce(s.mode,'file'),'preview',coalesce(s.preview,''),
    'outcomes',coalesce(s.outcomes,''),'prerequisites',coalesce(s.prerequisites,''),'include_updates',coalesce(s.include_updates,false),
    'faq',coalesce(s.faq,'[]'), 'files',(select jsonb_agg(f-'storage_path') from jsonb_array_elements(v_files) f),
    'lessons',(select coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','chapter',l->>'chapter','title',l->>'title',
      'free',coalesce((l->>'free')::boolean,false),'body',case when (l->>'free')::boolean then l->>'body' else '' end)),'[]') from jsonb_array_elements(coalesce(s.lessons,'[]')) l));
  select coalesce(max(version),0)+1 into v_version from public.zabelie_digital_releases where product_id=p.id;
  insert into public.zabelie_digital_releases(product_id,version,title,details,manifest,payload)
    values(p.id,v_version,p.title,coalesce(v_details,'{}'),v_manifest,jsonb_build_object('files',v_files,'lessons',coalesce(s.lessons,'[]')))
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.zabelie_digital_publish(uuid) from public, anon, authenticated;
grant execute on function public.zabelie_digital_publish(uuid) to service_role;
create function public.zabelie_digital_publication_trigger() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then perform public.zabelie_digital_publish(new.id); end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_publication_trigger() from public, anon, authenticated;
grant execute on function public.zabelie_digital_publication_trigger() to service_role;
create trigger zabelie_digital_publication after insert or update of status on public.products
for each row execute function public.zabelie_digital_publication_trigger();

-- Existing known assets are preserved as the migration baseline; no historical
-- license is invented when a product has no asset. No order status is changed.
select public.zabelie_digital_publish(p.id) from public.products p where p.kind='fichier'
  and exists(select 1 from public.product_assets a where a.product_id=p.id);
insert into public.zabelie_digital_entitlements(order_id,release_id)
  select o.id,r.id from public.orders o join public.zabelie_digital_releases r on r.product_id=o.product_id and r.version=1;
create function public.zabelie_digital_order_snapshot() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_release uuid;
begin
  -- Same product lock as publication: a checkout cannot observe half a release.
  perform 1 from public.products where id=new.product_id for share;
  select id into v_release from public.zabelie_digital_releases where product_id=new.product_id order by version desc limit 1;
  if v_release is not null then insert into public.zabelie_digital_entitlements(order_id,release_id) values(new.id,v_release); end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_order_snapshot() from public, anon, authenticated;
grant execute on function public.zabelie_digital_order_snapshot() to service_role;
create trigger zabelie_digital_order_snapshot after insert on public.orders for each row execute function public.zabelie_digital_order_snapshot();

create table public.zabelie_digital_progress (
  order_id uuid not null references public.orders(id) on delete cascade,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict,
  lesson_id uuid not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(order_id,release_id,lesson_id)
);
create index zabelie_digital_progress_release_idx on public.zabelie_digital_progress(release_id);
alter table public.zabelie_digital_progress enable row level security;
revoke all on public.zabelie_digital_progress from public, anon, authenticated;
grant all on public.zabelie_digital_progress to service_role;

create table public.zabelie_digital_accesses (
  order_id uuid not null references public.orders(id) on delete cascade,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict,
  asset_id uuid not null,
  first_requested_at timestamptz not null default now(),
  primary key(order_id,release_id,asset_id)
);
create index zabelie_digital_accesses_release_idx on public.zabelie_digital_accesses(release_id);
alter table public.zabelie_digital_accesses enable row level security;
revoke all on public.zabelie_digital_accesses from public, anon, authenticated;
grant select, insert on public.zabelie_digital_accesses to service_role;

create function public.zabelie_digital_metrics(p_seller uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('started', count(*),
    'confirmed',count(*) filter(where o.status in ('paid','delivered')),
    'pending',count(*) filter(where o.status='pending'),
    'refunded',count(*) filter(where o.status='refunded'),
    'gross_htg',coalesce(sum(o.amount_htg) filter(where o.status in ('paid','delivered')),0),
    'accessed',count(*) filter(where o.status in ('paid','delivered') and exists(select 1 from public.zabelie_digital_accesses a where a.order_id=o.id)))
  from public.orders o join public.products p on p.id=o.product_id where p.seller_id=p_seller and p.kind='fichier';
$$;
revoke all on function public.zabelie_digital_metrics(uuid) from public, anon, authenticated;
grant execute on function public.zabelie_digital_metrics(uuid) to service_role;

-- Keep the presence probe synchronized with the new delivery contracts.
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
      ('zabelie_est_rechaj(uuid)',
       'decide si une fiche exige un numero a recharger (0099) : absente, /api/checkout leve sur toute fiche portant un sous-rayon — c''est-a-dire que PLUS AUCUN achat ne passe, recharge ou non')
    ) as v(objet, pourquoi)
  union all
  select v.objet, to_regclass('public.' || v.objet) is not null, v.pourquoi
  from (values
    ('zabelie_digital_studio','les brouillons de packs et de formations'),
    ('zabelie_digital_releases','les versions acquises et leurs fichiers privés'),
    ('zabelie_digital_entitlements','le contenu attaché à chaque commande'),
    ('zabelie_digital_progress','la progression privée des acheteurs'),
    ('zabelie_digital_accesses','les demandes de téléchargement mesurées')
  ) v(objet,pourquoi)
  union all
  select v.objet, exists(select 1 from pg_trigger g where g.tgname=v.objet and not g.tgisinternal and g.tgenabled <> 'D'), v.pourquoi
  from (values
    ('zabelie_digital_order_snapshot','fige la version lors de la commande'),
    ('zabelie_digital_publication','crée une version après modération'),
    ('zabelie_digital_release_immutable','interdit la réécriture des versions achetées'),
    ('zabelie_digital_entitlement_immutable','interdit le remplacement du contrat acheté'),
    ('zabelie_digital_asset_guard','interdit de modifier un livrable publié'),
    ('zabelie_digital_studio_draft_guard','réserve la modification des leçons aux brouillons')
  ) v(objet,pourquoi);
$$;
