-- Zabelie Digi — Avis d'acheteurs VÉRIFIÉS (différenciateur de confiance)
-- Règle dure : seul un acheteur ayant une commande PAYÉE peut laisser un avis,
-- et UN SEUL avis par commande (contrainte UNIQUE en base, pas seulement en API).
-- Marché à faible confiance → la preuve sociale doit être invérolable.

create table product_reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  buyer_id   uuid not null references profiles (id) on delete cascade,
  order_id   uuid not null unique references orders (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);
create index reviews_product_idx on product_reviews (product_id);

-- Agrégats maintenus par trigger (lecture catalogue sans jointure coûteuse).
alter table products
  add column rating_count integer not null default 0,
  add column rating_sum   integer not null default 0;

create or replace function apply_review_aggregates()
returns trigger
language plpgsql
as $$
begin
  update products
     set rating_count = rating_count + 1,
         rating_sum   = rating_sum + new.rating
   where id = new.product_id;
  return new;
end;
$$;

create trigger product_reviews_aggregate
  after insert on product_reviews
  for each row execute function apply_review_aggregates();

-- RLS : lecture publique (preuve sociale), écriture UNIQUEMENT côté serveur
-- (l'API vérifie que la commande appartient au demandeur et est payée/livrée).
alter table product_reviews enable row level security;
create policy "reviews_public_read"
  on product_reviews for select using (true);
