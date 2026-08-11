-- 0058 — Le PANIER (docs/27 §2, étape 2 de l'ordre d'implémentation).
--
-- Ce que cette migration fait, et surtout ce qu'elle NE fait PAS : elle crée
-- le panier persistant de l'acheteur. Elle ne touche à AUCUN chemin d'argent.
-- Le paiement groupé (`zabelie_order_groups`, `confirm_group_payment`) est la
-- migration suivante, et il aura sa propre PR avec ses tests money-path —
-- c'est l'ordre que la spec impose, pour la raison qu'elle donne : le panier
-- se regarde, le paiement se prouve.
--
-- ─── AUCUN PRIX AU PANIER, ET C'EST LA RÈGLE ────────────────────────────────
-- `zabelie_cart_items` ne porte ni prix ni total. Le prix se lit en base au
-- moment du paiement, jamais d'un instantané que le client pourrait avoir
-- modifié — c'est la règle dure n°3 du dépôt (« tout calcul de prix est
-- serveur »). Un panier qui mémorise un prix est un panier qu'on négocie.
--
-- ─── POURQUOI PAS DE `quantity` POUR L'INSTANT ──────────────────────────────
-- La quantité n'a de sens que pour le physique, dont le stock est géré par
-- B2 (`0037`/`0038`/`0040`). La colonne existe, contrainte à 1 tant que le
-- physique n'est pas ouvert : la lever sera un `alter` d'une ligne, alors
-- qu'ajouter la colonne plus tard demanderait de reprendre chaque appelant.
--
-- RLS : le propriétaire seul, en lecture ET en écriture. Un panier est une
-- intention d'achat — personne d'autre n'a à la voir, pas même un vendeur.

create table zabelie_carts (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un seul panier ouvert par acheteur : le panier est un lieu, pas un
  -- historique. L'historique, ce sont les commandes.
  constraint zabelie_carts_un_par_acheteur unique (buyer_id)
);

create table zabelie_cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references zabelie_carts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity   integer not null default 1
    constraint zabelie_cart_items_quantite check (quantity = 1),
  added_at   timestamptz not null default now(),
  -- Deux fois le même produit n'est pas deux lignes : c'est une quantité.
  constraint zabelie_cart_items_unique unique (cart_id, product_id)
);

create index zabelie_cart_items_cart_idx on zabelie_cart_items (cart_id);

alter table zabelie_carts enable row level security;
alter table zabelie_cart_items enable row level security;

create policy "carts_self_all" on zabelie_carts
  for all to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()));

create policy "cart_items_self_all" on zabelie_cart_items
  for all to authenticated
  using (
    exists (
      select 1 from zabelie_carts c
      where c.id = cart_id and c.buyer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from zabelie_carts c
      where c.id = cart_id and c.buyer_id = (select auth.uid())
    )
  );

revoke all on zabelie_carts from anon;
revoke all on zabelie_cart_items from anon;

/**
 * Ajoute un produit au panier de l'appelant, en créant le panier au besoin.
 *
 * `security definer` avec `search_path` épinglé, et l'acheteur vient de
 * `auth.uid()` — JAMAIS d'un paramètre : une fonction qui accepterait un
 * `buyer_id` permettrait de remplir le panier d'autrui.
 *
 * Refuse ce qui n'est pas achetable : produit non publié, ou son propre
 * produit (un vendeur n'achète pas chez lui — l'escrow n'aurait aucun sens).
 * Idempotente : rajouter le même produit ne crée pas de doublon.
 */
create or replace function zabelie_cart_add(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_cart  uuid;
  v_seller uuid;
  v_status text;
begin
  if v_buyer is null then
    raise exception 'zabelie_cart_add: authentification requise'
      using errcode = 'ZB058';
  end if;

  select seller_id, status into v_seller, v_status
  from products where id = p_product_id;

  if v_seller is null then
    raise exception 'zabelie_cart_add: produit introuvable' using errcode = 'ZB058';
  end if;
  if v_status <> 'published' then
    raise exception 'zabelie_cart_add: produit non publié' using errcode = 'ZB058';
  end if;
  if v_seller = v_buyer then
    raise exception 'zabelie_cart_add: un vendeur n''achète pas son propre produit'
      using errcode = 'ZB058';
  end if;

  insert into zabelie_carts (buyer_id) values (v_buyer)
  on conflict (buyer_id) do update set updated_at = now()
  returning id into v_cart;

  insert into zabelie_cart_items (cart_id, product_id) values (v_cart, p_product_id)
  on conflict (cart_id, product_id) do nothing;

  return v_cart;
end;
$$;

/** Retire une ligne. Le `where` porte sur le panier de l'appelant : viser la
 *  ligne d'autrui ne supprime rien plutôt que d'échouer bruyamment. */
create or replace function zabelie_cart_remove(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'zabelie_cart_remove: authentification requise'
      using errcode = 'ZB058';
  end if;
  delete from zabelie_cart_items i
  using zabelie_carts c
  where i.cart_id = c.id
    and c.buyer_id = auth.uid()
    and i.product_id = p_product_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function zabelie_cart_add(uuid) from public, anon;
revoke all on function zabelie_cart_remove(uuid) from public, anon;
grant execute on function zabelie_cart_add(uuid) to authenticated;
grant execute on function zabelie_cart_remove(uuid) to authenticated;
