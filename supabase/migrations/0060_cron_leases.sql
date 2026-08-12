-- ============================================================================
-- 0060 — BAIL D'EXÉCUTION DES CRONS (« leader lease »)
-- ============================================================================
-- Pattern repris d'Izikit (`leader-lease`), RÉÉCRIT pour Supabase : ni Prisma,
-- ni Redis, ni service tiers — une table et deux fonctions dans la base qui
-- porte déjà toute la vérité du projet.
--
-- ─── CE QUE ÇA NE CORRIGE PAS, ET IL FAUT LE DIRE ───────────────────────────
-- Mesuré avant d'écrire une ligne : les sept crons du dépôt sont DÉJÀ sûrs en
-- concurrence, un par un. `mature_wallets()` fait tout son travail dans une
-- seule instruction dont le `update … where status = 'maturing' … returning`
-- verrouille la ligne : une seconde transaction rejoue la condition sur la
-- version à jour, ne trouve rien, et ne crédite pas deux fois. Les balayages
-- portent `for update skip locked`. La purge est idempotente. Le rapport de
-- cohérence ne fait que lire.
--
-- Ce bail ne répare donc AUCUN défaut existant, et le présenter autrement
-- serait un filet posé sur un chemin déjà gardé.
--
-- ─── CE QUE ÇA APPORTE ──────────────────────────────────────────────────────
-- Ces sept sûretés sont sept DÉCISIONS INDIVIDUELLES, bien prises, et rien ne
-- les rend obligatoires. Le huitième cron — écrit dans six mois, par quelqu'un
-- qui n'aura pas lu ces migrations — n'hérite de rien du tout. Le bail
-- transforme une discipline en garantie : un seul porteur à la fois, quel que
-- soit le soin apporté au SQL en dessous.
--
-- Second gain, immédiat celui-là : deux exécutions qui se chevauchent font
-- aujourd'hui le travail DEUX FOIS sans dégât — mais aussi sans que rien ne le
-- signale. Le compteur `prises` ci-dessous rend le chevauchement visible.
--
-- ─── LES DEUX PIÈGES DU PATTERN, ÉCRITS PARCE QU'ILS SE PAIENT CHER ─────────
-- 1. TTL TROP COURT. Un bail qui expire pendant que son détenteur travaille
--    encore laisse entrer un second porteur : on obtient exactement ce qu'on
--    voulait interdire, avec en prime la certitude de ne pas s'en apercevoir.
--    Le TTL doit majorer la durée d'exécution la plus longue plausible, pas la
--    durée observée.
-- 2. LIBÉRATION NON QUALIFIÉE. `release(clé)` sans vérifier QUI détient le
--    bail permet à une exécution lente et périmée de libérer le bail de celle
--    qui a pris sa place. La libération porte donc sur le couple
--    (clé, détenteur) — jamais sur la clé seule.
-- ============================================================================

create table zabelie_cron_leases (
  cle        text primary key,
  -- Identifiant du porteur : sert UNIQUEMENT à qualifier la libération.
  -- Aucune donnée personnelle, aucun secret — un identifiant d'exécution.
  detenteur  text        not null,
  acquis_a   timestamptz not null default now(),
  expire_a   timestamptz not null,
  -- Nombre de fois où le bail a été REPRIS alors qu'il était expiré. Un
  -- compteur qui grimpe vite dit qu'une exécution dépasse son TTL.
  reprises   integer     not null default 0,
  -- Nombre de fois où une exécution s'est vue REFUSER le bail. Zéro en marche
  -- normale ; au-dessus, deux crons se chevauchent réellement.
  refus      integer     not null default 0
);

alter table zabelie_cron_leases enable row level security;
-- Aucune policy : cette table n'appartient à personne d'autre qu'au
-- service-role. RLS active et zéro policy = fermé à `anon` comme à
-- `authenticated`, sans qu'aucune règle ait à l'énumérer.
revoke all on zabelie_cron_leases from anon, authenticated;

/**
 * Tente de prendre le bail. Renvoie TRUE si l'appelant peut travailler.
 *
 * Une seule instruction, donc atomique : `on conflict … do update … where`
 * ne met à jour que si la condition tient, et le `returning` ne rend une
 * ligne que si la mise à jour a eu lieu. Deux appels simultanés ne peuvent
 * pas réussir tous les deux — le second attend le verrou de ligne du premier,
 * puis relit `expire_a` déjà repoussé et échoue.
 */
create function zabelie_cron_lease_acquire(
  p_cle       text,
  p_detenteur text,
  p_ttl_secondes integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pris boolean := false;
begin
  if p_ttl_secondes is null or p_ttl_secondes <= 0 then
    raise exception 'zabelie_cron_lease_acquire: TTL invalide (%)', p_ttl_secondes
      using errcode = 'ZB060';
  end if;

  insert into zabelie_cron_leases (cle, detenteur, expire_a)
  values (p_cle, p_detenteur, now() + make_interval(secs => p_ttl_secondes))
  on conflict (cle) do update
     set detenteur = excluded.detenteur,
         acquis_a  = now(),
         expire_a  = excluded.expire_a,
         reprises  = zabelie_cron_leases.reprises + 1
   where zabelie_cron_leases.expire_a < now()
  returning true into v_pris;

  if not coalesce(v_pris, false) then
    -- Refus : on le COMPTE. Sans ce compteur, « aucun chevauchement » et
    -- « des chevauchements que personne ne mesure » se ressemblent.
    update zabelie_cron_leases set refus = refus + 1 where cle = p_cle;
    return false;
  end if;
  return true;
end;
$$;

/**
 * Rend le bail — uniquement si l'appelant le détient encore.
 *
 * Le `and detenteur = p_detenteur` est le garde qui compte : sans lui, une
 * exécution qui a dépassé son TTL libérerait le bail de celle qui travaille
 * à sa place, et un troisième porteur entrerait aussitôt.
 */
create function zabelie_cron_lease_release(
  p_cle       text,
  p_detenteur text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update zabelie_cron_leases
     set expire_a = now()
   where cle = p_cle
     and detenteur = p_detenteur
     and expire_a > now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function zabelie_cron_lease_acquire(text, text, integer)
  from public, anon, authenticated;
revoke all on function zabelie_cron_lease_release(text, text)
  from public, anon, authenticated;

comment on table zabelie_cron_leases is
  'Bail d''exécution des crons : un seul porteur à la fois par clé. Ne corrige aucun défaut existant — les sept crons sont déjà sûrs en concurrence, un par un — mais transforme sept décisions individuelles en garantie structurelle pour le huitième.';
