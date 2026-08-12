-- ============================================================================
-- 0059 — L'ANGLE MORT DU FILET SUR LES PRODUITS DIGITAUX
-- ============================================================================
-- Mesuré le 2026-08-11 sur la base de production, pas déduit :
--
--   « cours du créole » · kind = fichier · status = published · livrables = 0
--
-- Le seul produit `fichier` publié du catalogue n'avait aucun fichier attaché.
-- Le chemin complet, si quelqu'un l'achetait :
--
--   1. paiement confirmé → escrow `maturing`, `gated_on_delivery = false` ;
--   2. l'acheteur clique → `/api/download` rend 404 « Aucun fichier livrable » ;
--   3. `orders.status` ne passe donc JAMAIS à `delivered` ;
--   4. J+7, `mature_wallets()` paie le vendeur — sa condition est
--      `not gated_on_delivery`, et elle est vraie ;
--   5. `zabelie_fulfillment_sweep()` filtre sur `p.kind = 'physical'` et ne
--      voit rien.
--
-- L'acheteur a payé, n'a rien, et le vendeur est payé. Aucune main ne se lève
-- à aucune étape. Ce n'est pas propre à `fichier` : `0043` a été écrite pour
-- le physique et son filet n'a jamais prétendu couvrir autre chose — mais
-- personne n'avait mesuré ce que « non couvert » voulait dire côté digital.
--
-- ─── POURQUOI PAS UN SEUIL DE TEMPS ─────────────────────────────────────────
-- La tentation était de recopier `orphan_grace_hours`. C'eût été une faute.
-- Pour un physique, l'orphelin est un DÉFAUT DE PLATEFORME : l'escrow aurait
-- dû être gelé et ne l'a pas été. Pour un fichier, « pas encore téléchargé »
-- est un ACHETEUR QUI N'A PAS ENCORE CLIQUÉ — parfaitement sain. Un filet
-- temporel aurait mis `disputed` sur des commandes normales et rempli la file
-- humaine de bruit, ce qui est la façon la plus sûre de tuer un filet : on
-- apprend à l'ignorer, et il ne protège plus rien.
--
-- Le critère juste est STRUCTUREL, pas temporel : **un fichier sans livrable
-- ne pourra jamais être remis**, ni dans six heures ni dans six mois. Le faux
-- positif est impossible par construction.
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST DÉLIBÉRÉ ──────────────────
-- Elle N'ÉCRIT AUCUNE LIGNE D'ARGENT et ne pose AUCUN verrou de maturation.
-- Détecter est gratuit ; geler déplace le moment où un vendeur touche sa
-- paie. `docs/22` — la première commande réelle — n'a pas encore eu lieu :
-- éprouver un verrou de paiement sur le dos du premier vendeur, avant d'avoir
-- vu le chemin nominal fonctionner une seule fois, c'est tester en production
-- sur la personne qu'on peut le moins se permettre de décevoir. Arbitrage
-- porteur du 2026-08-11 : détection maintenant, verrou après `docs/22`.
--
-- Elle ne met PAS non plus la commande en `disputed`, contrairement à la
-- branche tardive du filet physique. Raison mesurée : `/api/download` exige
-- `status in ('paid','delivered')`. Basculer en `disputed` fermerait la porte
-- au moment même où le vendeur téléverse enfin son fichier — on punirait la
-- réparation. La commande reste `paid`, le téléchargement redevient possible
-- dès que le livrable arrive, et seule la file humaine s'allume.
-- ============================================================================

create function zabelie_fichier_sans_livrable_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signale integer := 0;   -- commandes nouvellement portées à la file humaine
  v_leve    integer := 0;   -- signalements retirés : le livrable est arrivé
  r         record;
begin
  -- (1) SIGNALEMENT — payé, non livrable, et rien ne l'a encore dit.
  for r in
    select o.id as order_id
      from orders   o
      join products p on p.id = o.product_id
     where p.kind = 'fichier'
       and o.status = 'paid'
       and exists (
         select 1 from payments pay
          where pay.order_id = o.id and pay.status = 'confirmed')
       -- LE critère : aucun livrable. Pas « pas encore téléchargé ».
       and not exists (
         select 1 from product_assets a where a.product_id = p.id)
       and not exists (
         select 1 from zabelie_fulfillment f
          where f.order_id = o.id and f.status = 'action_required')
     for update of o skip locked
  loop
    insert into zabelie_fulfillment (order_id, status)
    values (r.order_id, 'action_required')
    on conflict (order_id)
      do update set status = 'action_required', updated_at = now();
    v_signale := v_signale + 1;
  end loop;

  -- (2) LEVÉE — le livrable est arrivé, le signalement doit partir.
  --
  -- Une file qui ne sait que grandir devient une file qu'on ne lit plus : même
  -- défaut que les exemptions qui ne se périment que dans un sens. Un vendeur
  -- qui téléverse enfin son fichier a réparé la commande ; laisser la ligne
  -- allumée ferait douter d'un dossier qui n'a plus rien à trancher.
  --
  -- La suppression est bornée à `kind = 'fichier'` : un `action_required`
  -- physique a une tout autre cause et ne doit jamais être effacé par ici.
  for r in
    select f.order_id
      from zabelie_fulfillment f
      join orders   o on o.id = f.order_id
      join products p on p.id = o.product_id
     where p.kind = 'fichier'
       and f.status = 'action_required'
       and exists (
         select 1 from product_assets a where a.product_id = p.id)
     for update of f skip locked
  loop
    delete from zabelie_fulfillment where order_id = r.order_id;
    v_leve := v_leve + 1;
  end loop;

  -- Les deux compteurs sortent MÊME À ZÉRO : sans eux, « le balayage n'a pas
  -- tourné » et « il a tourné, rien trouvé » produisent le même vide.
  return jsonb_build_object('fichiers_signales', v_signale,
                            'fichiers_leves', v_leve);
end;
$$;

revoke all on function zabelie_fichier_sans_livrable_sweep()
  from public, anon, authenticated;

comment on function zabelie_fichier_sans_livrable_sweep() is
  'Porte à la file humaine les commandes payées d''un produit `fichier` sans livrable — et les en retire quand le livrable arrive. N''écrit aucune ligne d''argent et ne gèle aucune maturation : la détection précède le verrou (arbitrage 2026-08-11, verrou après docs/22).';
