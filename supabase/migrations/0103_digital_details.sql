select zabelie_migration_garde('0103_digital_details.sql');

-- Public product facts only: no asset paths, tokens or buyer information.
create table public.zabelie_digital_details (
  product_id uuid primary key references public.products(id) on delete cascade,
  formats text not null default '' check (char_length(formats) <= 100),
  language text not null default '' check (char_length(language) <= 80),
  compatibility text not null default '' check (char_length(compatibility) <= 500),
  license text not null default '' check (char_length(license) <= 1200),
  contents text not null default '' check (char_length(contents) <= 1600),
  updates text not null default '' check (char_length(updates) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.zabelie_digital_details enable row level security;
revoke all on public.zabelie_digital_details from public, anon, authenticated;
grant select on public.zabelie_digital_details to anon, authenticated;
grant all on public.zabelie_digital_details to service_role;
create policy zabelie_digital_details_read on public.zabelie_digital_details
  for select to anon, authenticated using (exists (
    select 1 from public.products p where p.id = product_id
      and (p.status = 'published' or p.seller_id = (select auth.uid()))
  ));

-- Writes go through the authenticated seller API. Lock the parent so a
-- concurrent publication cannot slip between the status check and this write.
create function public.zabelie_digital_details_draft_guard() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_kind public.product_kind; v_status public.product_status;
begin
  if tg_op = 'UPDATE' and new.product_id <> old.product_id then
    raise exception 'digital_details_product_immutable' using errcode = '23514';
  end if;
  select kind, status into v_kind, v_status from public.products
    where id = new.product_id for share;
  if not found or v_kind <> 'fichier' or v_status <> 'draft' then
    raise exception 'digital_details_draft_required' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.zabelie_digital_details_draft_guard() from public, anon, authenticated;
grant execute on function public.zabelie_digital_details_draft_guard() to service_role;
create trigger zabelie_digital_details_draft_guard before insert or update
  on public.zabelie_digital_details for each row
  execute function public.zabelie_digital_details_draft_guard();
