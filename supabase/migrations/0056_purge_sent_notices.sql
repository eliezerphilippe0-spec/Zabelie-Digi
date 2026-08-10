-- 0056 — Purge de rétention des avis de remise ENVOYÉS (docs/30, P2).
--
-- Constat : zabelie_fulfillment_notices (0043) n'avait AUCUNE borne de
-- conservation — seule la cascade sur orders supprimait des lignes. Un avis
-- envoyé ne sert plus à rien passé le délai d'audit : le garder indéfiniment
-- est la même classe de rétention non bornée que 0053 a fermée pour la
-- recherche. Modèle : purge_payment_raw (0016).
--
-- Ce qu'on NE purge PAS, et pourquoi :
--   • sent_at IS NULL : un avis non parti est un TRAVAIL EN COURS — c'est le
--     balayage et la borne temporelle qui décident de son sort, jamais une
--     purge ;
--   • les lignes récentes : last_error et attempts sont la matière d'un
--     diagnostic (« pourquoi l'acheteur dit ne rien avoir reçu ? ») tant que
--     la commande peut encore être disputée.
--
-- Post-condition ZB056 : la fonction refuse un délai plus court que le cycle
-- de vie d'une commande (auto_receive_days + marge) — une purge trop hâtive
-- effacerait la preuve qu'un avis EST parti pendant qu'un litige est ouvert.

create or replace function zabelie_purge_sent_notices(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days < 30 then
    raise exception 'zabelie_purge_sent_notices: délai % j sous le plancher de 30 j', p_days
      using errcode = 'ZB056';
  end if;

  delete from zabelie_fulfillment_notices
   where sent_at is not null
     and sent_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Réservé au service role (cron), jamais exposé au client.
revoke all on function zabelie_purge_sent_notices(integer) from public, anon, authenticated;
