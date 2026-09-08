select zabelie_migration_garde('0104_digital_studio.sql');

-- Paid material never enters a publicly readable JSON column. Public manifests
-- contain only filenames, lesson headings and text explicitly marked free.
create table public.zabelie_digital_studio (
  product_id uuid primary key references public.products(id) on delete cascade,
  mode text not null default 'file' check (mode in ('file','bundle','course')),
  preview text not null default '' check (char_length(preview) <= 6000),
  outcomes text not null default '' check (char_length(outcomes) <= 1600),
  prerequisites text not null default '' check (char_length(prerequisites) <= 1200),
  include_updates boolean not null default false,
  lessons jsonb not null default '[]' check (jsonb_typeof(lessons) = 'array' and jsonb_array_length(lessons) <= 40 and octet_length(lessons::text) <= 640000),
  faq jsonb not null default '[]' check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 8),
  updated_at timestamptz not null default now()
);
alter table public.zabelie_digital_studio enable row level security;
revoke all on public.zabelie_digital_studio from public, anon, authenticated;
grant select on public.zabelie_digital_studio to authenticated;
grant all on public.zabelie_digital_studio to service_role;
create policy zabelie_digital_studio_owner on public.zabelie_digital_studio for select to authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = (select auth.uid())));
create trigger zabelie_digital_studio_draft_guard before insert or update on public.zabelie_digital_studio
for each row execute function public.zabelie_digital_details_draft_guard();

create table public.zabelie_digital_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version integer not null check (version > 0),
  title text not null,
  details jsonb not null,
  manifest jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(product_id, version)
);
alter table public.zabelie_digital_releases enable row level security;
revoke all on public.zabelie_digital_releases from public, anon, authenticated;
grant select, insert on public.zabelie_digital_releases to service_role;

create table public.zabelie_digital_entitlements (
  order_id uuid primary key references public.orders(id) on delete restrict,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict
);
create index zabelie_digital_entitlements_release_idx on public.zabelie_digital_entitlements(release_id);
alter table public.zabelie_digital_entitlements enable row level security;
revoke all on public.zabelie_digital_entitlements from public, anon, authenticated;
grant select, insert on public.zabelie_digital_entitlements to service_role;

create function public.zabelie_digital_immutable() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin raise exception 'digital_purchase_snapshot_immutable' using errcode = '23514'; end;
$$;
revoke all on function public.zabelie_digital_immutable() from public, anon, authenticated;
grant execute on function public.zabelie_digital_immutable() to service_role;
create trigger zabelie_digital_release_immutable before update or delete on public.zabelie_digital_releases
for each row execute function public.zabelie_digital_immutable();
create trigger zabelie_digital_entitlement_immutable before update or delete on public.zabelie_digital_entitlements
for each row execute function public.zabelie_digital_immutable();

-- Files are edited only in drafts, serialized against the publication lock.
create unique index zabelie_digital_asset_path_unique on public.product_assets(storage_path);
revoke insert, update, delete on public.product_assets from anon, authenticated;
create function public.zabelie_digital_asset_guard() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid; v_kind public.product_kind; v_status public.product_status;
begin
  v_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  select kind,status into v_kind,v_status from public.products where id=v_id for update;
  if v_kind <> 'fichier' or v_status <> 'draft' or not found then
    raise exception 'digital_asset_draft_required' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then raise exception 'digital_asset_immutable' using errcode='23514'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.product_assets where product_id=v_id) >= 20 then
    raise exception 'digital_asset_limit' using errcode='23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_asset_guard() from public, anon, authenticated;
grant execute on function public.zabelie_digital_asset_guard() to service_role;
create trigger zabelie_digital_asset_guard before insert or update or delete on public.product_assets
for each row execute function public.zabelie_digital_asset_guard();

create function public.zabelie_digital_publish(p_product uuid) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare p public.products; s public.zabelie_digital_studio; v_files jsonb; v_details jsonb;
  v_manifest jsonb; v_version integer; v_id uuid; v_lesson jsonb;
begin
  select * into p from public.products where id=p_product for update;
  if not found or p.kind <> 'fichier' then return null; end if;
  select * into s from public.zabelie_digital_studio where product_id=p.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'storage_path',storage_path,'file_name',file_name,'size_bytes',size_bytes) order by created_at,id),'[]')
    into v_files from public.product_assets where product_id=p.id;
  -- Legacy file fixtures without a deliverable retain their existing fail-closed
  -- API/0059 handling. Studio publications always require actual attached files.
  if jsonb_array_length(v_files)=0 then
    if s.product_id is not null then raise exception 'digital_files_required' using errcode='23514'; end if;
    return null;
  end if;
  if s.mode='bundle' and jsonb_array_length(v_files)<2 then raise exception 'digital_bundle_requires_two_files' using errcode='23514'; end if;
  if s.mode='course' and jsonb_array_length(s.lessons)=0 then raise exception 'digital_course_requires_lessons' using errcode='23514'; end if;
  for v_lesson in select value from jsonb_array_elements(coalesce(s.lessons,'[]')) loop
    if nullif(btrim(v_lesson->>'title'),'') is null or
       (nullif(btrim(v_lesson->>'body'),'') is null and nullif(v_lesson->>'assetId','') is null) then
      raise exception 'digital_lesson_empty' using errcode='23514';
    end if;
    if nullif(v_lesson->>'assetId','') is not null and not exists (
      select 1 from jsonb_array_elements(v_files) f where f->>'id'=v_lesson->>'assetId') then
      raise exception 'digital_lesson_file_missing' using errcode='23514';
    end if;
  end loop;
  select coalesce(to_jsonb(d)-'product_id'-'updated_at','{}') into v_details from public.zabelie_digital_details d where product_id=p.id;
  v_manifest := jsonb_build_object('mode',coalesce(s.mode,'file'),'preview',coalesce(s.preview,''),
    'outcomes',coalesce(s.outcomes,''),'prerequisites',coalesce(s.prerequisites,''),'include_updates',coalesce(s.include_updates,false),
    'faq',coalesce(s.faq,'[]'), 'files',(select jsonb_agg(f-'storage_path') from jsonb_array_elements(v_files) f),
    'lessons',(select coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','chapter',l->>'chapter','title',l->>'title',
      'free',coalesce((l->>'free')::boolean,false),'body',case when (l->>'free')::boolean then l->>'body' else '' end)),'[]') from jsonb_array_elements(coalesce(s.lessons,'[]')) l));
  select coalesce(max(version),0)+1 into v_version from public.zabelie_digital_releases where product_id=p.id;
  insert into public.zabelie_digital_releases(product_id,version,title,details,manifest,payload)
    values(p.id,v_version,p.title,coalesce(v_details,'{}'),v_manifest,jsonb_build_object('files',v_files,'lessons',coalesce(s.lessons,'[]')))
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.zabelie_digital_publish(uuid) from public, anon, authenticated;
grant execute on function public.zabelie_digital_publish(uuid) to service_role;
create function public.zabelie_digital_publication_trigger() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then perform public.zabelie_digital_publish(new.id); end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_publication_trigger() from public, anon, authenticated;
grant execute on function public.zabelie_digital_publication_trigger() to service_role;
create trigger zabelie_digital_publication after insert or update of status on public.products
for each row execute function public.zabelie_digital_publication_trigger();

-- Existing known assets are preserved as the migration baseline; no historical
-- license is invented when a product has no asset. No order status is changed.
select public.zabelie_digital_publish(p.id) from public.products p where p.kind='fichier'
  and exists(select 1 from public.product_assets a where a.product_id=p.id);
insert into public.zabelie_digital_entitlements(order_id,release_id)
  select o.id,r.id from public.orders o join public.zabelie_digital_releases r on r.product_id=o.product_id and r.version=1;
create function public.zabelie_digital_order_snapshot() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_release uuid;
begin
  -- Same product lock as publication: a checkout cannot observe half a release.
  perform 1 from public.products where id=new.product_id for share;
  select id into v_release from public.zabelie_digital_releases where product_id=new.product_id order by version desc limit 1;
  if v_release is not null then insert into public.zabelie_digital_entitlements(order_id,release_id) values(new.id,v_release); end if;
  return new;
end;
$$;
revoke all on function public.zabelie_digital_order_snapshot() from public, anon, authenticated;
grant execute on function public.zabelie_digital_order_snapshot() to service_role;
create trigger zabelie_digital_order_snapshot after insert on public.orders for each row execute function public.zabelie_digital_order_snapshot();

create table public.zabelie_digital_progress (
  order_id uuid not null references public.orders(id) on delete cascade,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict,
  lesson_id uuid not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(order_id,release_id,lesson_id)
);
create index zabelie_digital_progress_release_idx on public.zabelie_digital_progress(release_id);
alter table public.zabelie_digital_progress enable row level security;
revoke all on public.zabelie_digital_progress from public, anon, authenticated;
grant all on public.zabelie_digital_progress to service_role;

create table public.zabelie_digital_accesses (
  order_id uuid not null references public.orders(id) on delete cascade,
  release_id uuid not null references public.zabelie_digital_releases(id) on delete restrict,
  asset_id uuid not null,
  first_requested_at timestamptz not null default now(),
  primary key(order_id,release_id,asset_id)
);
create index zabelie_digital_accesses_release_idx on public.zabelie_digital_accesses(release_id);
alter table public.zabelie_digital_accesses enable row level security;
revoke all on public.zabelie_digital_accesses from public, anon, authenticated;
grant select, insert on public.zabelie_digital_accesses to service_role;

create function public.zabelie_digital_metrics(p_seller uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('started', count(*),
    'confirmed',count(*) filter(where o.status in ('paid','delivered')),
    'pending',count(*) filter(where o.status='pending'),
    'refunded',count(*) filter(where o.status='refunded'),
    'gross_htg',coalesce(sum(o.amount_htg) filter(where o.status in ('paid','delivered')),0),
    'accessed',count(*) filter(where o.status in ('paid','delivered') and exists(select 1 from public.zabelie_digital_accesses a where a.order_id=o.id)))
  from public.orders o join public.products p on p.id=o.product_id where p.seller_id=p_seller and p.kind='fichier';
$$;
revoke all on function public.zabelie_digital_metrics(uuid) from public, anon, authenticated;
grant execute on function public.zabelie_digital_metrics(uuid) to service_role;
