-- ============================================================================
-- 0042 — Numéro de commande lisible : `orders.order_ref`, format ZB-YYMMDD-XXXXX
-- ============================================================================
-- Objectif de conception (et contrainte principale) : un identifiant que le
-- vendeur et l'acheteur SE LISENT AU TÉLÉPHONE et se collent dans WhatsApp.
--
-- Préfixe « ZB- » : décision porteur 2026-07-26 — « Digi » est éliminé du
-- naming, le préfixe s'aligne sur « Zabelie » seul.
--
-- Alphabet du suffixe : Crockford base32 (déjà sans I, L, O, U) moins les
-- ambigus supplémentaires 0, 1, 8 et B → 28 caractères :
--     2 3 4 5 6 7 9 A C D E F G H J K M N P Q R S T V W X Y Z
-- Un numéro dicté au téléphone se retape sans erreur. 28^5 ≈ 17,2 millions de
-- combinaisons PAR JOUR — la partie aléatoire n'expose aucun compteur : un
-- numéro n'apprend rien du volume de la plateforme.
--
-- ÉCART assumé avec le brief : il demandait la génération « dans
-- create_pending_order ». Cette fonction N'EXISTE PAS — les commandes naissent
-- d'un insert direct (app/api/checkout/route.ts:220). L'intention (numéro
-- généré en base, dans la même transaction, jamais de commande sans numéro)
-- est réalisée par un trigger BEFORE INSERT sur `orders` : même garantie,
-- quel que soit le chemin d'insertion, présent ou futur.
-- ============================================================================

-- ── 1. Colonne + contrainte de forme + unicité ──────────────────────────────
-- Nullable d'abord : le backfill remplit, puis NOT NULL verrouille (§4).

alter table orders add column order_ref text;

alter table orders add constraint orders_order_ref_format
  check (order_ref is null
         or order_ref ~ '^ZB-[0-9]{6}-[2345679ACDEFGHJKMNPQRSTVWXYZ]{5}$');

-- L'index unique est posé AVANT tout remplissage : c'est le filet contre la
-- course résiduelle (deux transactions qui tirent le même candidat entre le
-- contrôle d'existence et l'insert — improbable à ~17 M/jour, pas impossible).
create unique index orders_order_ref_key on orders (order_ref);

-- ── 2. Génération ───────────────────────────────────────────────────────────

-- Un candidat. pgcrypto (gen_random_bytes) plutôt que random() : pas de graine
-- observable. Le modulo 28 sur un octet introduit un biais infime (256 % 28 =
-- 4) — sans conséquence ici : l'aléa sert l'opacité, pas la cryptographie.
create function zabelie_order_ref_candidate(p_date date)
returns text
language plpgsql
as $$
declare
  alphabet constant text := '2345679ACDEFGHJKMNPQRSTVWXYZ';
  v_bytes  bytea := gen_random_bytes(5);
  v_suffix text  := '';
begin
  for i in 0..4 loop
    v_suffix := v_suffix || substr(alphabet, (get_byte(v_bytes, i) % 28) + 1, 1);
  end loop;
  return 'ZB-' || to_char(p_date, 'YYMMDD') || '-' || v_suffix;
end;
$$;
revoke all on function zabelie_order_ref_candidate(date) from public, anon, authenticated;

-- Attribution avec retry borné : 5 candidats, puis erreur EXPLICITE — on ne
-- réutilise jamais un numéro et on n'échoue jamais en silence. Le contrôle
-- d'existence traite le cas réaliste (collision avec une ligne déjà écrite) ;
-- l'index unique du §1 attrape la course résiduelle entre deux transactions.
create function zabelie_assign_order_ref(p_date date)
returns text
language plpgsql
as $$
declare
  v_ref text;
begin
  for i in 1..5 loop
    v_ref := zabelie_order_ref_candidate(p_date);
    if not exists (select 1 from orders where order_ref = v_ref) then
      return v_ref;
    end if;
  end loop;
  raise exception
    'order_ref: 5 collisions consecutives pour la date % — espace de noms sature ou generateur defaillant',
    p_date
    using errcode = 'ZB042';
end;
$$;
revoke all on function zabelie_assign_order_ref(date) from public, anon, authenticated;

-- ── 3. Triggers : naissance obligatoire, immuabilité ensuite ────────────────

-- BEFORE INSERT : la base est le SEUL auteur du numéro. Toute valeur fournie
-- par l'application est écrasée — pas de spoof, pas de compteur déguisé, pas
-- de chemin d'insertion qui « oublie » le numéro.
create function zabelie_orders_ref_on_insert()
returns trigger
language plpgsql
as $$
begin
  new.order_ref := zabelie_assign_order_ref(coalesce(new.created_at::date, current_date));
  return new;
end;
$$;
revoke all on function zabelie_orders_ref_on_insert() from public, anon, authenticated;

create trigger zabelie_orders_ref_insert
  before insert on orders
  for each row execute function zabelie_orders_ref_on_insert();

-- BEFORE UPDATE : immuable, cohérent avec la discipline append-only. La seule
-- transition permise est NULL → valeur (c'est le backfill du §4).
create function zabelie_orders_ref_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.order_ref is not null
     and new.order_ref is distinct from old.order_ref then
    raise exception 'order_ref est immuable (commande %)', old.id
      using errcode = 'ZB043';
  end if;
  return new;
end;
$$;
revoke all on function zabelie_orders_ref_immutable() from public, anon, authenticated;

create trigger zabelie_orders_ref_guard
  before update on orders
  for each row execute function zabelie_orders_ref_immutable();

-- ── 4. Backfill — la date RÉELLE de chaque commande dans YYMMDD ─────────────
-- Relevé du 2026-07-26 sur la production (lecture seule, connecteur) :
-- `orders` contient 0 ligne — le backfill est un no-op aujourd'hui. Il reste
-- écrit et testé : cette migration doit être correcte sur N'IMPORTE QUELLE
-- base, pas seulement celle du jour où elle a été rédigée.

do $$
declare
  r record;
begin
  for r in select id, created_at from orders where order_ref is null loop
    update orders
       set order_ref = zabelie_assign_order_ref(r.created_at::date)
     where id = r.id;
  end loop;
end;
$$;

-- Verrou final : une commande sans numéro ne peut plus exister.
alter table orders alter column order_ref set not null;

-- ── 5. Lecture / recherche ──────────────────────────────────────────────────
-- Normalisation : ÉCRITURE toujours en majuscules (l'alphabet l'est) ;
-- la RECHERCHE accepte les deux casses en normalisant l'entrée — c'est le rôle
-- de l'appelant (admin) : `upper(trim(saisie))`, puis égalité stricte. Aucune
-- fonction SQL supplémentaire nécessaire : l'index unique sert la recherche.
