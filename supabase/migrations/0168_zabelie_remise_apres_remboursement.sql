select zabelie_migration_garde('0168_zabelie_remise_apres_remboursement.sql');

-- ─────────────────────────────────────────────────────────────────────────────
-- 0168 — UN REMBOURSEMENT SORT LA REMISE DU CIRCUIT.
--
-- POURQUOI. Trouvé le 2026-10-30 en clôturant le litige du 2026-08-22 (audit
-- n° 140), décision du porteur le 2026-10-31 (« go pour la décision qui reste
-- ouverte »). `refund_order` passe la commande en `refunded` et l'escrow en
-- `reversed`, mais ne touche pas `zabelie_fulfillment`. Les fonctions de remise
-- ne lisent QUE l'état de remise : une commande remboursée avant l'envoi restait
-- donc déclarable par le vendeur (`zabelie_declare_shipment`), confirmable par
-- code (`zabelie_handover_confirm`) et réceptionnable. Aucun argent ne bougeait
-- (escrow `reversed`, commande hors `paid`), mais la marchandise pouvait partir.
--
-- LE GESTE. Au passage d'une commande en `refunded`, sa remise encore OUVERTE
-- (`awaiting_shipment`, `shipped`) passe en `action_required` — l'état qu'aucune
-- de ces fonctions n'accepte, et celui que le balayage (0043, branche
-- « orphelin tardif ») donnait déjà aux commandes PHYSIQUES remboursées, un
-- passage plus tard. Pour un service, rien ne le faisait. La file
-- d'opérations exclut déjà les commandes remboursées (0113) : aucun bruit.
--
-- ─── CE QUE ÇA NE CHANGE PAS ───────────────────────────────────────────────
-- Aucune fonction d'argent : ni `refund_order`, ni `zabelie_mark_received`, ni
-- l'escrow, ni le grand livre. Une remise `received` ou `disputed_by_buyer`
-- reste telle quelle. Les avis de remise déjà programmés ne sont PAS touchés :
-- les marquer « sans objet » est la décision ouverte sur `reminder_buyer`
-- (`docs/77` §12.8 n° 2), et les supprimer heurte la rétention gelée par
-- D-10→D-14 (`0056`).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create or replace function zabelie_remise_sur_remboursement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update zabelie_fulfillment
     set status = 'action_required', updated_at = now()
   where order_id = new.id
     and status in ('awaiting_shipment', 'shipped');
  return null;
end;
$$;
revoke all on function zabelie_remise_sur_remboursement() from public, anon, authenticated;
comment on function zabelie_remise_sur_remboursement() is
  'Une commande qui passe en refunded sort du circuit de remise : sa remise ouverte (awaiting_shipment, shipped) passe en action_required, que ni la declaration d''envoi, ni le code de remise, ni la reception n''acceptent (0168). Aucune ecriture d''argent.';

-- `create or replace`, pas `drop` puis `create` : même état final, et aucune
-- instruction destructive (la confirmation que le MCP exige pour un `drop` est
-- inrépondable depuis une session d'agent — mesuré le 2026-10-31, même cas que 0152).
create or replace trigger zabelie_remise_sur_remboursement
  after update of status on orders
  for each row
  when (new.status = 'refunded' and old.status is distinct from 'refunded')
  execute function zabelie_remise_sur_remboursement();

-- Les commandes DÉJÀ remboursées : même règle, une fois. Mesuré le 2026-10-31 :
-- aucune en production (la seule, `c797080d…`, est déjà `action_required`).
update zabelie_fulfillment f
   set status = 'action_required', updated_at = now()
  from orders o
 where o.id = f.order_id
   and o.status = 'refunded'
   and f.status in ('awaiting_shipment', 'shipped');

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'zabelie_remise_sur_remboursement'
       and tgrelid = 'public.orders'::regclass
       and tgfoid = 'public.zabelie_remise_sur_remboursement()'::regprocedure
       and tgenabled = 'O' and not tgisinternal) then
    raise exception '0168 KO: déclencheur absent ou désactivé';
  end if;
  if has_function_privilege('anon', 'public.zabelie_remise_sur_remboursement()', 'execute')
     or has_function_privilege('authenticated', 'public.zabelie_remise_sur_remboursement()', 'execute') then
    raise exception '0168 KO: la fonction du déclencheur est exécutable par un client';
  end if;
  if exists (
    select 1 from zabelie_fulfillment f join orders o on o.id = f.order_id
     where o.status = 'refunded' and f.status in ('awaiting_shipment', 'shipped')) then
    raise exception '0168 KO: une commande remboursée garde une remise ouverte';
  end if;
  raise notice '0168 OK — une commande remboursée sort du circuit de remise';
end $$;

commit;
