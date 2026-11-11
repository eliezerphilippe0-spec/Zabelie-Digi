select zabelie_migration_garde('0171_zabelie_fiches_preparees.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0171 — FICHES PRÉPARÉES PAR UN ASSISTANT (lot 3b, 2026-11-11).
--
-- POURQUOI. Demande du porteur (« go lot 3b ») : qu'un vendeur puisse démarrer
-- une fiche depuis n'importe quel assistant qui parle MCP. Trois décisions
-- étaient ouvertes ; elles sont prises ici dans le sens que l'agent avait
-- recommandé, et la PR qui porte ce fichier est marquée À ARBITRER.
--
-- LE CHOIX QUI COMMANDE TOUT LE RESTE. Un assistant ne crée PAS de produit.
-- Créer une fiche exige que le vendeur accepte la politique des produits
-- interdits, et cette acceptation est enregistrée comme attestation opposable
-- (`zabelie_record_policy_acceptance`, 0046). Une case cochée par un programme
-- n'atteste rien. L'assistant dépose donc une FICHE PRÉPARÉE — un titre, un
-- texte, un prix proposé — dans cette table, et rien dans `products`. Le
-- vendeur l'ouvre sur Zabelie, la relit dans le formulaire habituel, accepte
-- lui-même la politique et envoie. La création, la revue humaine et la
-- publication ne changent pas d'une ligne.
--
-- CE QUE LA TABLE GARDE : le type, le titre, la description, un prix proposé
-- en gourdes entières. Ni photo, ni fichier, ni stock, ni rayon : ils se
-- saisissent dans le formulaire.
--
-- ─── 1. LA PORTÉE ──────────────────────────────────────────────────────────
-- `products:prepare` s'ajoute aux quatre portées de 0121. Elle n'est PAS dans
-- les portées par défaut d'une clé : le vendeur la choisit à la création.
-- Une clé existante ne la gagne jamais (0121 fige les portées d'une clé).
--
-- ─── 2. ACCÈS ──────────────────────────────────────────────────────────────
-- RLS dès la création. Le vendeur LIT ses fiches préparées ; il n'écrit rien
-- en direct. Le dépôt passe par l'API vendeur (service role, clé vérifiée),
-- la reprise par une route de session. `anon` : rien.
--
-- ─── 3. BORNES (techniques, comme le plafond de clés de 0121) ──────────────
-- * 20 fiches EN ATTENTE par vendeur (ni reprises, ni expirées), imposé par
--   trigger sous verrou consultatif : deux dépôts simultanés ne le
--   franchissent pas. Reprendre une fiche libère une place.
-- * une fiche expire après 7 jours. Les fiches expirées d'un vendeur sont
--   supprimées à son dépôt suivant : pas de tâche planifiée, donc pas de
--   purge sans appelant.
-- * le contenu d'une fiche déposée ne change plus ; seule la reprise
--   s'écrit, une fois.
--
-- ⚠️ ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner le code
-- qui crée des clés portant `products:prepare`. Sans elle, la création d'une
-- telle clé est refusée par la contrainte de 0121 (la route rend 503), et
-- les clés ordinaires continuent de marcher.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. La portée ────────────────────────────────────────────────────────────
alter table zabelie_api_keys drop constraint zabelie_api_keys_scopes_check;
alter table zabelie_api_keys add constraint zabelie_api_keys_scopes_check
  check (cardinality(scopes) between 1 and 5
         and scopes <@ array['products:read', 'sales:read', 'links:write', 'webhooks:manage', 'products:prepare']);

-- ── 2. La table ─────────────────────────────────────────────────────────────
create table zabelie_fiches_preparees (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references profiles(id) on delete cascade,
  -- La clé qui a déposé la fiche. Révoquer ou supprimer la clé ne supprime pas la fiche.
  api_key_id  uuid references zabelie_api_keys(id) on delete set null,
  kind        product_kind not null,
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  description text check (description is null or char_length(description) <= 5000),
  -- Prix PROPOSÉ, en gourdes entières. Le prix d'une fiche reste celui que le
  -- vendeur envoie par le formulaire, revalidé par la route de création.
  price_htg   integer check (price_htg is null or price_htg >= 0),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  reprise_at  timestamptz,
  check (expires_at > created_at)
);

create index zabelie_fiches_preparees_seller_idx on zabelie_fiches_preparees (seller_id, created_at desc);

alter table zabelie_fiches_preparees enable row level security;

create policy zabelie_fiches_preparees_owner_select on zabelie_fiches_preparees
  for select to authenticated
  using (seller_id = auth.uid());

revoke all on zabelie_fiches_preparees from anon;
revoke insert, update, delete on zabelie_fiches_preparees from authenticated;

-- ── 3. Le garde : plafond, ménage des expirées, contenu figé ────────────────
create or replace function zabelie_fiches_preparees_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_attente integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('zabelie_fiches_preparees:' || new.seller_id::text));
    delete from zabelie_fiches_preparees
     where seller_id = new.seller_id and expires_at <= now();
    select count(*) into v_attente
      from zabelie_fiches_preparees
     where seller_id = new.seller_id and reprise_at is null and expires_at > now();
    if v_attente >= 20 then
      raise exception 'ZB171 : 20 fiches préparées en attente au plus par vendeur'
        using errcode = 'ZB171';
    end if;
    return new;
  end if;

  -- UPDATE : seule la reprise s'écrit, une fois.
  if new.id is distinct from old.id
     or new.seller_id is distinct from old.seller_id
     -- La clé peut seulement se DÉTACHER (suppression de la clé : on delete set null).
     or (new.api_key_id is distinct from old.api_key_id and new.api_key_id is not null)
     or new.kind is distinct from old.kind
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.price_htg is distinct from old.price_htg
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'ZB171 : le contenu d''une fiche préparée ne change pas'
      using errcode = 'ZB171';
  end if;
  if old.reprise_at is not null and new.reprise_at is distinct from old.reprise_at then
    raise exception 'ZB171 : une fiche reprise le reste'
      using errcode = 'ZB171';
  end if;
  return new;
end;
$$;

create trigger zabelie_fiches_preparees_garde
  before insert or update on zabelie_fiches_preparees
  for each row execute function zabelie_fiches_preparees_garde();

revoke all on function zabelie_fiches_preparees_garde() from public, anon, authenticated;

-- ── 4. Post-conditions ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.zabelie_api_keys'::regclass
       and conname = 'zabelie_api_keys_scopes_check'
       and pg_get_constraintdef(oid) like '%products:prepare%'
       and pg_get_constraintdef(oid) like '%webhooks:manage%'
  ) then
    raise exception 'ZB171 : la contrainte de portées n''admet pas products:prepare' using errcode = 'ZB171';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.zabelie_fiches_preparees'::regclass and relrowsecurity) then
    raise exception 'ZB171 : RLS absente sur zabelie_fiches_preparees' using errcode = 'ZB171';
  end if;
  if has_table_privilege('anon', 'public.zabelie_fiches_preparees', 'select')
     or has_table_privilege('authenticated', 'public.zabelie_fiches_preparees', 'insert')
     or has_table_privilege('authenticated', 'public.zabelie_fiches_preparees', 'update')
     or has_table_privilege('authenticated', 'public.zabelie_fiches_preparees', 'delete') then
    raise exception 'ZB171 : zabelie_fiches_preparees est lisible par anon ou inscriptible par un client' using errcode = 'ZB171';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.zabelie_fiches_preparees'::regclass
       and tgname = 'zabelie_fiches_preparees_garde' and not tgisinternal
  ) then
    raise exception 'ZB171 : trigger de garde absent' using errcode = 'ZB171';
  end if;
end $$;

commit;
