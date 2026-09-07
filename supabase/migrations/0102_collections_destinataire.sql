select zabelie_migration_garde('0102_collections_destinataire.sql');

-- Private, account-bound collections. No public popularity counters.
create table public.zabelie_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index zabelie_favorites_recent on public.zabelie_favorites(user_id, created_at desc, product_id);
create index zabelie_favorites_product on public.zabelie_favorites(product_id);
alter table public.zabelie_favorites enable row level security;
revoke all on public.zabelie_favorites from anon, authenticated;
grant select, insert, delete on public.zabelie_favorites to authenticated;
grant all on public.zabelie_favorites to service_role;
create policy zabelie_favorites_read on public.zabelie_favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy zabelie_favorites_delete on public.zabelie_favorites for delete to authenticated
  using (user_id = (select auth.uid()));
create policy zabelie_favorites_add on public.zabelie_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'published'
  ));

create table public.zabelie_shop_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, seller_id),
  check (user_id <> seller_id)
);
create index zabelie_shop_follows_recent on public.zabelie_shop_follows(user_id, created_at desc, seller_id);
create index zabelie_shop_follows_seller on public.zabelie_shop_follows(seller_id);
alter table public.zabelie_shop_follows enable row level security;
revoke all on public.zabelie_shop_follows from anon, authenticated;
grant select, insert, delete on public.zabelie_shop_follows to authenticated;
grant all on public.zabelie_shop_follows to service_role;
create policy zabelie_shop_follows_read on public.zabelie_shop_follows for select to authenticated
  using (user_id = (select auth.uid()));
create policy zabelie_shop_follows_delete on public.zabelie_shop_follows for delete to authenticated
  using (user_id = (select auth.uid()));
create policy zabelie_shop_follows_add on public.zabelie_shop_follows for insert to authenticated
  with check (user_id = (select auth.uid()) and user_id <> seller_id
    and public.zabelie_boutik_public(seller_id, null) is not null);

-- Recipient details are attached to one physical order, not to the buyer profile.
-- The buyer retains payment, receipt and dispute authority. No recipient account.
create table public.zabelie_order_recipients (
  order_id uuid primary key references public.orders(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  phone text not null check (phone ~ '^[34][0-9]{7}$'),
  locality text not null check (char_length(btrim(locality)) between 2 and 160),
  note text not null default '' check (char_length(note) <= 500),
  consented_at timestamptz not null default now()
);
alter table public.zabelie_order_recipients enable row level security;
revoke all on public.zabelie_order_recipients from anon, authenticated;
grant select on public.zabelie_order_recipients to authenticated;
grant all on public.zabelie_order_recipients to service_role;
create policy zabelie_order_recipients_buyer on public.zabelie_order_recipients for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy zabelie_order_recipients_seller on public.zabelie_order_recipients for select to authenticated
  using (exists (select 1 from public.orders o join public.products p on p.id = o.product_id
    where o.id = order_id and p.seller_id = (select auth.uid())
      and o.status in ('paid', 'delivered', 'disputed', 'refunded')));

create function public.zabelie_recipient_physical_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.orders o join public.products p on p.id = o.product_id
                  where o.id = new.order_id and o.status = 'pending' and p.kind = 'physical') then
    raise exception using errcode = '23514', message = 'recipient requires a pending physical order';
  end if;
  return new;
end;
$$;
revoke all on function public.zabelie_recipient_physical_guard() from public, anon, authenticated;
create trigger zabelie_recipient_physical_guard before insert or update on public.zabelie_order_recipients
  for each row execute function public.zabelie_recipient_physical_guard();
