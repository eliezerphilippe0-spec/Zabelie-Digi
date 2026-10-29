select zabelie_migration_garde('0161_zabelie_order_zones.sql');

-- 0161 — La zone de remise d'une commande physique (docs/77 §12, lot A ;
-- demande directe du porteur du 2026-10-29).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- Zabelie ne livre pas : le vendeur remet lui-même. Jusqu'ici, ce que le vendeur
-- savait de l'endroit était du TEXTE LIBRE (`zabelie_order_recipients.locality`,
-- `zabelie_delivery_info.adres_liv`) — lisible par un humain, inutilisable par le
-- logiciel. Sans une zone STRUCTURÉE sur la commande, on ne peut ni grouper les
-- remises d'un vendeur par zone, ni mesurer un délai par zone, ni comparer la
-- zone de remise aux zones que le vendeur déclare desservir (0158).
--
-- Et la zone utile n'est pas celle de l'acheteur : un acheteur de la diaspora
-- commande pour un proche resté en Haïti. C'est la zone de REMISE, choisie à
-- chaque commande — pas celle de l'appareil.
--
-- ─── CE QUE C'EST, CE QUE ÇA N'EST PAS ─────────────────────────────────────
-- • Une zone approximative (commune ou quartier), jamais une coordonnée. Un
--   département seul est refusé : trop large pour organiser quoi que ce soit.
-- • Une CLASSIFICATION, pas un verrou : l'écriture est « au mieux » côté code
--   (une zone qui ne s'enregistre pas ne bloque jamais un paiement), et rien ne
--   refuse une commande parce que le vendeur ne déclare pas livrer là.
-- • Pas une nouvelle catégorie de donnée : c'est la même « adresse de remise »
--   que la politique de confidentialité décrit déjà (§3, « Coordonnées de
--   remise »), montrée au vendeur dans les mêmes conditions que les autres
--   coordonnées de la commande — commande PAYÉE seulement.
--
-- ─── QUI ÉCRIT, QUI LIT ────────────────────────────────────────────────────
-- • Écriture : le service-role seulement (la route de paiement), jamais le
--   client. Aucun `update` : une zone de remise se pose à la création de la
--   commande ; une erreur se corrige par une nouvelle commande, pas par une
--   réécriture de l'historique de remise.
-- • Lecture : l'acheteur de la commande ; le vendeur du produit, une fois la
--   commande payée (même fenêtre que `zabelie_order_recipients`, 0102).
--
-- ─── LE GARDE (ZB161) ──────────────────────────────────────────────────────
-- Commande physique ET encore en attente de paiement, zone connue, ACTIVE et de
-- niveau commune ou quartier. Le service-role contourne la RLS de
-- `zabelie_zones` : l'état « active » est donc vérifié explicitement ici.
--
-- Aucune fonction `security definer`, aucun `drop`. Elle ne touche ni les
-- paiements, ni les soldes, ni le grand livre.

begin;

create table zabelie_order_zones (
  order_id   uuid primary key references orders (id) on delete cascade,
  zone_id    uuid not null references zabelie_zones (id),
  created_at timestamptz not null default now()
);
create index zabelie_order_zones_zone_idx on zabelie_order_zones (zone_id);
comment on table zabelie_order_zones is
  'Zone approximative (commune ou quartier) ou le vendeur remet une commande physique (0161). Classification, pas verrou : jamais une coordonnee. Ecrite par le service-role a la creation de la commande, jamais modifiee.';

alter table zabelie_order_zones enable row level security;

create policy zabelie_order_zones_buyer_read on zabelie_order_zones
  for select to authenticated
  using (exists (select 1 from orders o
                  where o.id = order_id and o.buyer_id = (select auth.uid())));

create policy zabelie_order_zones_seller_read on zabelie_order_zones
  for select to authenticated
  using (exists (select 1 from orders o
                   join products p on p.id = o.product_id
                  where o.id = order_id
                    and p.seller_id = (select auth.uid())
                    and o.status in ('paid', 'delivered', 'disputed', 'refunded')));

revoke all on zabelie_order_zones from public, anon, authenticated;
grant select on zabelie_order_zones to authenticated;
grant all on zabelie_order_zones to service_role;

create function zabelie_order_zones_garde()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1
                   from orders o join products p on p.id = o.product_id
                  where o.id = new.order_id and o.status = 'pending' and p.kind = 'physical') then
    raise exception 'ZB161 : une zone de remise ne se pose que sur une commande physique en attente'
      using errcode = '23514';
  end if;
  if not exists (select 1 from zabelie_zones z
                  where z.id = new.zone_id and z.is_active and z.level in ('komin', 'katye')) then
    raise exception 'ZB161 : zone de remise inconnue, fermee, ou trop large (commune ou quartier requis)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function zabelie_order_zones_garde() from public, anon, authenticated;

create trigger zabelie_order_zones_garde_trg
  before insert or update on zabelie_order_zones
  for each row execute function zabelie_order_zones_garde();

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'zabelie_order_zones'::regclass) then
    raise exception '0161 KO: RLS inactive sur zabelie_order_zones';
  end if;
  if has_table_privilege('anon', 'zabelie_order_zones', 'select')
     or has_table_privilege('anon', 'zabelie_order_zones', 'insert') then
    raise exception '0161 KO: anon ne doit rien voir ni ecrire';
  end if;
  if has_table_privilege('authenticated', 'zabelie_order_zones', 'insert')
     or has_table_privilege('authenticated', 'zabelie_order_zones', 'update')
     or has_table_privilege('authenticated', 'zabelie_order_zones', 'delete') then
    raise exception '0161 KO: le client ne s''ecrit pas : lecture seule';
  end if;
  if not has_table_privilege('authenticated', 'zabelie_order_zones', 'select') then
    raise exception '0161 KO: authenticated doit lire (sous RLS)';
  end if;
  if (select prosecdef from pg_proc where proname = 'zabelie_order_zones_garde') then
    raise exception '0161 KO: le garde reste SECURITY INVOKER';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'zabelie_order_zones'::regclass
                    and tgname = 'zabelie_order_zones_garde_trg') then
    raise exception '0161 KO: trigger de garde absent';
  end if;
  raise notice '0161 OK — zones de remise posees';
end $$;

commit;
