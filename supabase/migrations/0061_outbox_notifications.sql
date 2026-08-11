-- ============================================================================
-- 0061 — OUTBOX DES NOTIFICATIONS DE VENTE
-- ============================================================================
-- Pattern repris d'Izikit (`outbox`), RÉÉCRIT pour Supabase — et surtout
-- calqué sur un mécanisme qui existe DÉJÀ ici et qui marche :
-- `zabelie_fulfillment_notices` (0043), avec ses `attempts`, son `last_error`,
-- son recul exponentiel et sa borne de tentatives. On ne remplace rien : on
-- étend à l'endroit qui en est dépourvu.
--
-- ─── LE TROU, MESURÉ ────────────────────────────────────────────────────────
-- `notifyOrderPaid` (lib/zabelie-notify.ts) fait, dans cet ordre :
--
--     const { data: claimed } = await rpc("zabelie_claim_notification", …)
--     if (!claimed) return;              -- la réclamation est CONSOMMÉE ici
--     …
--     await Promise.allSettled(jobs);    -- le résultat est jeté
--     } catch { /* best-effort */ }      -- l'échec est avalé
--
-- La réclamation est donc consommée AVANT l'envoi, `allSettled` ne regarde
-- même pas si les messages sont partis, et le `catch` vide efface la trace.
-- Fournisseur en panne, clé absente, coupure réseau : l'acheteur n'apprend
-- jamais que son argent est arrivé, le vendeur n'apprend jamais sa vente, et
-- AUCUNE ligne nulle part n'en garde le souvenir.
--
-- C'est le message le plus important du système — sur ce marché il tient lieu
-- de reçu — et c'était le seul sans filet, pendant que l'avis de remise, lui,
-- en avait un complet. L'asymétrie n'était pas voulue : elle est le résultat
-- d'avoir instrumenté un chemin et pas l'autre.
--
-- ─── CE QUE CETTE MIGRATION NE CHANGE PAS ───────────────────────────────────
-- Aucune ligne d'argent. Aucun statut de commande. `confirm_payment` n'est pas
-- touchée. Une notification qui échoue n'a jamais empêché une vente d'aboutir
-- et ne le fera pas davantage : l'outbox rend l'échec RATTRAPABLE, pas
-- bloquant.
--
-- ⚠️ La réclamation de `0012` reste en place et garde son rôle : un seul
-- passage crée la ligne d'outbox. L'outbox ne dédoublonne pas, il persiste.
-- ============================================================================

create type zabelie_outbox_kind as enum (
  'order_paid_buyer',
  'order_paid_seller'
);

create table zabelie_outbox (
  id         uuid primary key default gen_random_uuid(),
  kind       zabelie_outbox_kind not null,
  order_id   uuid not null references orders (id) on delete cascade,
  -- Destinataire résolu À L'ÉMISSION : l'adresse au moment de la vente, pas
  -- celle du jour où la reprise tourne. Un acheteur qui change d'email entre
  -- les deux doit recevoir la confirmation de SA commande.
  destinataire text not null,
  due_at     timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer     not null default 0,
  last_error text,
  -- ÉTAT TERMINAL EXPLICITE. La borne de tentatives vivait côté TypeScript
  -- seul : la base ne savait pas qu'un message était mort, donc aucune requête
  -- ne pouvait le compter. Un abandon qu'on ne peut pas interroger est un
  -- abandon silencieux — le défaut qu'on vient de corriger, un cran plus haut.
  abandonne_a timestamptz,
  -- BAIL DE LIGNE (même idée que 0060) : l'envoi immédiat et le drain du cron
  -- sont DEUX écrivains sur la même ligne. Sans réclamation, le cron peut
  -- prendre une ligne dont l'envoi immédiat est encore en vol → l'acheteur
  -- reçoit deux reçus, et deux reculs concurrents s'écrasent.
  reclame_a  timestamptz,
  created_at timestamptz not null default now(),
  -- Un seul message de chaque type par commande. C'est la même garantie que
  -- `fulfillment_notice_unique`, et elle rend la ré-émission inoffensive.
  constraint zabelie_outbox_unique unique (order_id, kind)
);

-- Borne de tentatives EN BASE : deux appelants (envoi immédiat, drain) doivent
-- appliquer la même règle, et une borne écrite deux fois diverge toujours.
create table zabelie_outbox_limits (
  cle    text primary key,
  valeur integer not null
);
insert into zabelie_outbox_limits (cle, valeur) values
  ('max_tentatives', 5),
  ('bail_secondes', 300)
on conflict (cle) do nothing;
alter table zabelie_outbox_limits enable row level security;
revoke all on zabelie_outbox_limits from anon, authenticated;

create index zabelie_outbox_du_idx on zabelie_outbox (due_at)
  where sent_at is null;

alter table zabelie_outbox enable row level security;
-- RLS active, aucune policy : réservé au service-role. Une notification porte
-- l'adresse email d'un acheteur — personne d'autre n'a à la lire.
revoke all on zabelie_outbox from anon, authenticated;

/**
 * Dépose un message. Idempotent : re-déposer ne crée pas de doublon et ne
 * réarme pas un message déjà parti.
 */
create function zabelie_outbox_enqueue(
  p_order_id     uuid,
  p_kind         zabelie_outbox_kind,
  p_destinataire text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_destinataire is null or p_destinataire = '' then
    raise exception 'zabelie_outbox_enqueue: destinataire vide' using errcode = 'ZB061';
  end if;

  insert into zabelie_outbox (order_id, kind, destinataire)
  values (p_order_id, p_kind, p_destinataire)
  on conflict (order_id, kind) do nothing
  returning id into v_id;

  -- `do nothing` ne rend rien : on relit pour que l'appelant ait TOUJOURS un
  -- identifiant, qu'il vienne de créer la ligne ou qu'elle existait déjà.
  if v_id is null then
    select id into v_id from zabelie_outbox
     where order_id = p_order_id and kind = p_kind;
  end if;
  return v_id;
end;
$$;

/**
 * Marque un message parti. Le `where sent_at is null` rend l'appel rejouable
 * sans écraser l'horodatage du premier envoi réussi.
 */
create function zabelie_outbox_mark_sent(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update zabelie_outbox set sent_at = now(), last_error = null
   where id = p_id and sent_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

/**
 * Enregistre un échec et REPOUSSE la prochaine tentative.
 *
 * Le recul est calculé EN BASE plutôt que côté application : c'est la seule
 * façon que deux appelants différents — l'envoi immédiat et le drain du cron —
 * appliquent la même règle. Un recul écrit deux fois diverge toujours.
 *
 * 2^(n-1) heures, plafonné à 24. Sans plafond, la sixième tentative tomberait
 * à 32 h et la huitième à une semaine : un message de confirmation de vente
 * arrivé huit jours plus tard n'est plus une confirmation, c'est une énigme.
 */
create function zabelie_outbox_mark_failed(p_id uuid, p_erreur text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  -- `attempts` N'EST PLUS incrémenté ici : la réclamation le fait à la PRISE.
  -- Compter à l'échec laissait un envoyeur qui plante en vol réessayer sans
  -- fin, puisque le compteur n'avançait jamais.
  update zabelie_outbox
     set last_error = left(coalesce(p_erreur, 'inconnue'), 500),
         reclame_a  = null,
         due_at     = now() + make_interval(
                        hours => least(power(2, greatest(attempts - 1, 0))::integer, 24))
   where id = p_id and sent_at is null
  returning attempts into v_attempts;
  return coalesce(v_attempts, 0);
end;
$$;

/**
 * RÉCLAME une ligne avant d'envoyer — chemin de sortie UNIQUE.
 *
 * L'envoi immédiat et le drain du cron sont deux écrivains ; sans ce passage
 * obligé, le cron peut prendre une ligne dont l'envoi immédiat est encore en
 * vol. L'acheteur reçoit alors deux reçus, et deux `mark_failed` concurrents
 * s'écrasent — ce qui ruine le recul qu'on a justement calculé en base.
 *
 * La réclamation est un BAIL COURT sur la ligne, exactement comme `0060` sur
 * un cron : elle expire, donc un envoyeur qui meurt en vol ne bloque pas la
 * ligne pour toujours. Elle incrémente `attempts` au moment de la PRISE, pas
 * de l'échec : une tentative qui n'aboutit jamais doit se compter, sinon un
 * envoyeur qui plante en boucle réessaie indéfiniment sans jamais atteindre
 * la borne.
 */
create function zabelie_outbox_claim(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max  integer;
  v_bail integer;
  v_ok   boolean;
begin
  select valeur into v_max  from zabelie_outbox_limits where cle = 'max_tentatives';
  select valeur into v_bail from zabelie_outbox_limits where cle = 'bail_secondes';

  update zabelie_outbox
     set reclame_a = now(),
         attempts  = attempts + 1
   where id = p_id
     and sent_at is null
     and abandonne_a is null
     and attempts < coalesce(v_max, 5)
     and (reclame_a is null
          or reclame_a < now() - make_interval(secs => coalesce(v_bail, 300)))
  returning true into v_ok;

  -- Atteinte de la borne : on marque l'ABANDON, on ne le laisse pas deviner.
  update zabelie_outbox
     set abandonne_a = now()
   where id = p_id
     and sent_at is null
     and abandonne_a is null
     and attempts >= coalesce(v_max, 5);

  return coalesce(v_ok, false);
end;
$$;

revoke all on function zabelie_outbox_claim(uuid) from public, anon, authenticated;

revoke all on function zabelie_outbox_enqueue(uuid, zabelie_outbox_kind, text)
  from public, anon, authenticated;
revoke all on function zabelie_outbox_mark_sent(uuid) from public, anon, authenticated;
revoke all on function zabelie_outbox_mark_failed(uuid, text)
  from public, anon, authenticated;

comment on table zabelie_outbox is
  'Notifications de vente en attente d''envoi. Comble l''asymétrie mesurée le 2026-08-11 : l''avis de remise avait attempts/last_error/recul, la confirmation de vente — le message qui tient lieu de reçu — n''avait rien et perdait ses échecs en silence.';

-- ─────────── DÉPÔT ATOMIQUE AVEC LA CONFIRMATION DU PAIEMENT ────────────────
--
-- Le défaut que ce trigger ferme, mesuré `file:line` le 2026-08-11 :
--
--   app/api/moncash/return/route.ts:131   confirm_payment      ← transaction A
--   app/api/moncash/return/route.ts:166   notifyOrderPaid(…)   ← même pas awaited
--   lib/zabelie-notify.ts:33              claim_notification   ← transaction B
--   lib/zabelie-notify.ts:98,107,119      INSERT outbox        ← transaction C
--
-- Trois transactions, et la réclamation de `0012` est consommée en B alors que
-- le dépôt a lieu en C. Un plantage entre les deux perd le reçu DÉFINITIVEMENT
-- — le réconciliateur ne repasse pas, la commande est déjà réclamée. « Déposer
-- avant d'envoyer » ne suffisait donc pas : il fallait déposer avant de
-- COMMITER l'argent.
--
-- Le trigger écrit la ligne dans la MÊME transaction que le passage du
-- paiement à `confirmed`, sans toucher `confirm_payment` — qui vient d'être
-- réécrite par `0038` et qu'on n'ouvre pas pour ça.
--
-- L'adresse est résolue ICI, à la vente : un acheteur qui change d'email plus
-- tard doit recevoir la confirmation de SA commande, à l'adresse qu'il avait.
-- Adresse introuvable → aucune ligne, plutôt qu'une ligne inenvoyable qui
-- consommerait cinq tentatives pour rien.

create function zabelie_outbox_on_payment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_buyer_email  text;
  v_seller_email text;
  v_seller       uuid;
begin
  if new.status <> 'confirmed' or coalesce(old.status, '') = 'confirmed' then
    return new;
  end if;

  select u.email into v_buyer_email
    from orders o join auth.users u on u.id = o.buyer_id
   where o.id = new.order_id;

  select p.seller_id into v_seller
    from orders o join products p on p.id = o.product_id
   where o.id = new.order_id;
  select email into v_seller_email from auth.users where id = v_seller;

  if v_buyer_email is not null then
    perform zabelie_outbox_enqueue(new.order_id, 'order_paid_buyer', v_buyer_email);
  end if;
  if v_seller_email is not null then
    perform zabelie_outbox_enqueue(new.order_id, 'order_paid_seller', v_seller_email);
  end if;
  return new;
end;
$$;

revoke all on function zabelie_outbox_on_payment_confirmed()
  from public, anon, authenticated;

create trigger zabelie_outbox_paiement_confirme
  after update of status on payments
  for each row
  execute function zabelie_outbox_on_payment_confirmed();

-- ⚠️ POST-CONDITION DE LA MIGRATION — le trigger doit exister, sinon tout ce
-- qui précède est une table que personne ne remplit.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'zabelie_outbox_paiement_confirme'
  ) then
    raise exception 'ZB061 : trigger de dépôt absent après création';
  end if;
end $$;
