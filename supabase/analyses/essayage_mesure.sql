-- Mesure du pilote d'essayage virtuel (docs/74 §7 ; tasks/essayage-todo.md 6.2).
--
-- LECTURE SEULE : aucune donnée n'est modifiée. La seule écriture est une vue
-- TEMPORAIRE, qui disparaît avec la session. À lancer dans l'éditeur SQL de
-- Supabase, ou par `psql -f supabase/analyses/essayage_mesure.sql`.
--
-- Unité : une paire (acheteur, fiche) à sa PREMIÈRE exposition, dans le groupe
-- où le hachage a rangé l'acheteur (essai ou témoin). Les issues comptées sont
-- les commandes de cette paire créées à partir du jour (heure d'Haïti) de
-- cette première exposition.
--
--   essayees          paires où l'acheteur a obtenu au moins un aperçu (essai réussi)
--   au_panier         paires dont la fiche est ENCORE dans le panier : borne basse,
--                     le panier n'a pas d'historique (un article payé en sort)
--   commandes_payees  commandes payées, livrées, remboursées ou en litige
--   livrees           commandes remises à l'acheteur (`delivered`)
--   remboursees       commandes remboursées, refus à la remise compris
--   litiges           commandes en litige (`disputed`, le marqueur actuel)
--   taux_achat_pct    part des paires avec au moins une commande payée
--   taux_retour_pct   (remboursées + litiges) / commandes payées
--
-- Le seuil de décision (docs/74 §7, question 5) se lit sur `taux_retour_pct` :
-- le groupe essai doit faire mieux que le témoin, pas seulement sur l'achat.
create or replace temp view essayage_mesure as
with paires as (
  select groupe, acheteur_id, produit_id, min(jour) as premier_jour
    from public.zabelie_essayage_expositions
   group by groupe, acheteur_id, produit_id
),
issues as (
  select p.groupe, p.acheteur_id, p.produit_id,
         exists (select 1 from public.zabelie_essayage_essais e
                  where e.acheteur_id = p.acheteur_id and e.produit_id = p.produit_id and e.statut = 'reussi') as essaye,
         exists (select 1 from public.zabelie_cart_items i join public.zabelie_carts c on c.id = i.cart_id
                  where c.buyer_id = p.acheteur_id and i.product_id = p.produit_id) as au_panier,
         count(o.id) filter (where o.status in ('paid', 'delivered', 'refunded', 'disputed')) as payees,
         count(o.id) filter (where o.status = 'delivered') as livrees,
         count(o.id) filter (where o.status = 'refunded') as remboursees,
         count(o.id) filter (where o.status = 'disputed') as litiges
    from paires p
    left join public.orders o
      on o.buyer_id = p.acheteur_id and o.product_id = p.produit_id
     and (o.created_at at time zone 'America/Port-au-Prince')::date >= p.premier_jour
   group by p.groupe, p.acheteur_id, p.produit_id
)
select groupe,
       count(*)::integer as paires,
       (count(*) filter (where essaye))::integer as essayees,
       (count(*) filter (where au_panier))::integer as au_panier,
       sum(payees)::integer as commandes_payees,
       sum(livrees)::integer as livrees,
       sum(remboursees)::integer as remboursees,
       sum(litiges)::integer as litiges,
       round(100.0 * count(*) filter (where payees > 0) / nullif(count(*), 0), 1) as taux_achat_pct,
       round(100.0 * sum(remboursees + litiges) / nullif(sum(payees), 0), 1) as taux_retour_pct
  from issues
 group by groupe;

select * from essayage_mesure order by groupe;
