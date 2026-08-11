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
  created_at timestamptz not null default now(),
  -- Un seul message de chaque type par commande. C'est la même garantie que
  -- `fulfillment_notice_unique`, et elle rend la ré-émission inoffensive.
  constraint zabelie_outbox_unique unique (order_id, kind)
);

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
  update zabelie_outbox
     set attempts   = attempts + 1,
         last_error = left(coalesce(p_erreur, 'inconnue'), 500),
         due_at     = now() + make_interval(
                        hours => least(power(2, greatest(attempts, 0))::integer, 24))
   where id = p_id and sent_at is null
  returning attempts into v_attempts;
  return coalesce(v_attempts, 0);
end;
$$;

revoke all on function zabelie_outbox_enqueue(uuid, zabelie_outbox_kind, text)
  from public, anon, authenticated;
revoke all on function zabelie_outbox_mark_sent(uuid) from public, anon, authenticated;
revoke all on function zabelie_outbox_mark_failed(uuid, text)
  from public, anon, authenticated;

comment on table zabelie_outbox is
  'Notifications de vente en attente d''envoi. Comble l''asymétrie mesurée le 2026-08-11 : l''avis de remise avait attempts/last_error/recul, la confirmation de vente — le message qui tient lieu de reçu — n''avait rien et perdait ses échecs en silence.';
