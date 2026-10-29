select zabelie_migration_garde('0164_zabelie_service_zone_terms.sql');

-- 0164 — Les CONDITIONS d'une zone de service : frais annoncés, délai annoncé, pause
-- (docs/77 §12, lot D ; demande directe du porteur du 2026-10-29).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- 0158 dit OÙ le vendeur déclare livrer. L'acheteur veut savoir deux choses de plus,
-- et ce sont celles que Mercado Libre Flex et Jumia affichent avant tout : COMBIEN
-- et EN COMBIEN DE TEMPS. Et le vendeur a besoin d'une troisième : une PAUSE — un
-- barrage, une panne de carburant, une zone devenue impraticable ne doivent pas le
-- forcer à supprimer puis re-déclarer ses zones, ni à laisser l'écran promettre ce
-- qu'il ne peut pas tenir.
--
-- ─── CE QUE C'EST — et ce que ça n'est pas ─────────────────────────────────
-- • Des DÉCLARATIONS du vendeur, attribuées à lui : « frais annoncés par le vendeur »,
--   « délai annoncé ». Zabelie ne garantit ni l'un ni l'autre.
-- • ⚠️ LES FRAIS NE FONT PAS PARTIE DU PAIEMENT. `fee_htg` est une information
--   affichée ; elle n'est ajoutée à aucun montant de commande, ne passe par aucun
--   rail, n'entre dans aucun escrow ni grand livre. Les ajouter au paiement serait
--   une décision d'argent (commission sur les frais ? séquestre des frais ?) liée au
--   dossier BRH de rétention (docs/17) — elle appartient au porteur et n'est pas
--   prise ici. Cette migration ne touche ni `orders`, ni les paiements, ni les soldes.
-- • Pas une donnée personnelle : une information commerciale que le vendeur choisit
--   de publier, comme la zone elle-même.
--
-- ─── LA PAUSE EST BORNÉE ───────────────────────────────────────────────────
-- `paused_until` est une DATE, pas un drapeau : la pause expire d'elle-même, et un
-- vendeur qui oublie de la lever ne disparaît pas des résultats pour toujours. Sa
-- durée maximale est un paramètre commercial (`max_pause_days`, config, 30 par
-- défaut — jamais en dur). Le garde ZB164 la refuse au-delà.
--
-- ─── QUI ÉCRIT ─────────────────────────────────────────────────────────────
-- Le vendeur sur SES lignes, sous sa session (RLS). Le droit de modification est
-- limité PAR COLONNE aux trois nouvelles : `zone_id` et `seller_id` restent
-- immuables (une zone se pose ou se retire, elle ne se déplace pas ; 0158).
-- La lecture reste publique, comme celle des zones : les conditions s'affichent à
-- l'acheteur, c'est leur seul usage.
--
-- Aucune fonction `security definer`, aucun `drop`.

begin;

alter table zabelie_service_zone_config
  add column max_pause_days integer not null default 30
    check (max_pause_days between 1 and 90);

alter table zabelie_seller_service_zones
  add column fee_htg      integer check (fee_htg is null or fee_htg between 0 and 100000),
  add column delay_hours  integer check (delay_hours is null or delay_hours between 1 and 720),
  add column paused_until timestamptz;

comment on column zabelie_seller_service_zones.fee_htg is
  'Frais de remise ANNONCES par le vendeur pour cette zone, en HTG entiers (0 = offerts, NULL = a convenir). Information affichee : AUCUN lien avec le paiement Zabelie (0164).';
comment on column zabelie_seller_service_zones.delay_hours is
  'Delai de remise ANNONCE par le vendeur pour cette zone, en heures (NULL = non precise). Zabelie ne le garantit pas (0164).';
comment on column zabelie_seller_service_zones.paused_until is
  'Pause temporaire de la zone par le vendeur : jusqu a cette date, la zone ne compte plus comme desservie. Bornee par max_pause_days (ZB164), expire d elle-meme (0164).';

-- Modifier : le vendeur, SES lignes, et seulement les trois colonnes ci-dessus.
create policy zabelie_seller_service_zones_update on zabelie_seller_service_zones
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());
grant update (fee_htg, delay_hours, paused_until) on zabelie_seller_service_zones to authenticated;

-- Le garde de la pause (ZB164) : jamais plus longue que la config, à l'insertion comme à la modification.
create function zabelie_service_zone_terms_garde()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max integer;
begin
  if new.paused_until is not null then
    select max_pause_days into v_max from zabelie_service_zone_config where id;
    if new.paused_until > now() + make_interval(days => coalesce(v_max, 30)) then
      raise exception 'ZB164 : pause de plus de % jours refusee', coalesce(v_max, 30)
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function zabelie_service_zone_terms_garde() from public, anon, authenticated;

create trigger zabelie_service_zone_terms_garde_trg
  before insert or update on zabelie_seller_service_zones
  for each row execute function zabelie_service_zone_terms_garde();

do $$
begin
  if not has_column_privilege('authenticated', 'zabelie_seller_service_zones', 'fee_htg', 'update')
     or not has_column_privilege('authenticated', 'zabelie_seller_service_zones', 'delay_hours', 'update')
     or not has_column_privilege('authenticated', 'zabelie_seller_service_zones', 'paused_until', 'update') then
    raise exception '0164 KO: le vendeur doit pouvoir modifier ses conditions';
  end if;
  if has_column_privilege('authenticated', 'zabelie_seller_service_zones', 'zone_id', 'update')
     or has_column_privilege('authenticated', 'zabelie_seller_service_zones', 'seller_id', 'update') then
    raise exception '0164 KO: zone_id et seller_id doivent rester immuables';
  end if;
  if has_table_privilege('anon', 'zabelie_seller_service_zones', 'update')
     or has_column_privilege('anon', 'zabelie_seller_service_zones', 'fee_htg', 'update') then
    raise exception '0164 KO: anon ne modifie rien';
  end if;
  if (select prosecdef from pg_proc where proname = 'zabelie_service_zone_terms_garde') then
    raise exception '0164 KO: le garde reste SECURITY INVOKER';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'zabelie_seller_service_zones'::regclass
                    and tgname = 'zabelie_service_zone_terms_garde_trg') then
    raise exception '0164 KO: trigger de garde absent';
  end if;
  if (select max_pause_days from zabelie_service_zone_config where id) <> 30 then
    raise exception '0164 KO: la duree maximale de pause doit valoir 30 par defaut';
  end if;
  raise notice '0164 OK — conditions de zone posees';
end $$;

commit;
