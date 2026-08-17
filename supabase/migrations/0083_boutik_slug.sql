select zabelie_migration_garde('0083_boutik_slug.sql');

-- ============================================================================
-- 0083 — L'ADRESSE PUBLIQUE D'UNE BOUTIQUE
-- ============================================================================
-- L'écran « votre boutique est ouverte » (25667f8) met un lien dans un message
-- WhatsApp. Ce lien vaut aujourd'hui :
--     zabelie.com/createur/8f3a1c22-7b90-4d1e-9a55-0e2d7c41b8f6
-- Personne ne colle ça dans une conversation, et surtout personne ne le retape
-- sous la dictée — or c'est exactement comme ça qu'une boutique circule ici.
-- Une URL est de l'interface, pas de la plomberie.
--
-- ─── CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE REFUSE DE FAIRE ────────────
-- Elle ajoute une colonne NULLABLE, remplit ce qu'elle peut, et s'arrête là.
-- Un profil dont le nom ne laisse rien d'utilisable (vide, emoji, deux
-- caractères) garde `null` : le code retombe alors sur l'ancienne URL, qui
-- continue de fonctionner. Aucune adresse n'est INVENTÉE pour combler un
-- trou — un slug tiré d'un identifiant serait aussi illisible que l'UUID.
--
-- ─── LE DÉPLIAGE DES ACCENTS EST LA PARTIE RISQUÉE ─────────────────────────
-- `Jakmèl` doit donner `jakmel`, pas `jakml` : retirer la lettre accentuée au
-- lieu de la déplier mutile le mot, et ça ne se voit qu'en kreyòl ou en
-- français. `translate()` exige deux chaînes de MÊME longueur — une erreur d'un
-- caractère décale tout l'alphabet en silence.
--
-- ⚠️ C'est pour ça que la post-condition ci-dessous n'est pas décorative :
-- elle relit CHAQUE slug écrit et casse la migration si un seul ne respecte
-- pas la forme. Un dépliage faux échoue bruyamment au lieu d'écrire des
-- adresses publiques abîmées.
--
-- ─── L'UNICITÉ EST TRANCHÉE EN BASE, PAS DANS LE CODE ──────────────────────
-- Le code propose (`lib/boutik-slug.ts`), l'index unique dispose. Deux
-- vendeurs qui s'appellent pareil obtiennent `mari-jakmel` et
-- `mari-jakmel-2` — le suffixe est un COMPTEUR, jamais un aléa : une reprise
-- après erreur doit redonner la même adresse, sinon l'ancienne circulerait
-- encore sur WhatsApp en pointant nulle part.
-- ============================================================================

-- ── 1. La colonne ───────────────────────────────────────────────────────────
alter table profiles add column if not exists boutik_slug text;

comment on column profiles.boutik_slug is
  'Adresse publique de la boutique : /boutik/<slug>. NULL = pas d''adresse lisible, le code retombe sur /createur/<id>. Forme et réservations redites par la contrainte ZB083.';

-- ── 2. Remplissage — déterministe, et seulement ce qui est utilisable ───────
with base as (
  select
    p.id,
    -- Dépliage des accents, puis tout ce qui n'est ni lettre ni chiffre
    -- devient une césure. Les deux chaînes de `translate` font 52 caractères.
    rtrim(
      left(
        btrim(
          regexp_replace(
            lower(
              translate(
                coalesce(p.display_name, ''),
                'àâäáãåèéêëìíîïòóôöõùúûüçñýÀÂÄÁÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑÝ',
                'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'
              )
            ),
            '[^a-z0-9]+', '-', 'g'
          ),
          '-'
        ),
        40
      ),
      '-'
    ) as candidat
  from profiles p
  where p.boutik_slug is null
),
utilisable as (
  -- Un slug d'une lettre ne se dicte pas ; un nom réservé entrerait en
  -- collision avec une route. Les deux sortent du remplissage — le code leur
  -- attribuera une adresse au prochain enregistrement de profil.
  select id, candidat
    from base
   where length(candidat) between 2 and 40
     and candidat not in (
       'admin','api','boutik','catalogue','createur','connexion','aide',
       'vendre','panier','rechaj','pro','talents','produit','nouveau','new'
     )
),
numerote as (
  -- `id` départage : deux exécutions sur le même état donnent le même
  -- résultat. Un `random()` ou un `ctid` fabriquerait une adresse différente
  -- à chaque reprise.
  select id, candidat,
         row_number() over (partition by candidat order by id) as rang
    from utilisable
)
update profiles p
   set boutik_slug = case
         when n.rang = 1 then n.candidat
         else rtrim(left(n.candidat, 40 - length('-' || n.rang::text)), '-')
              || '-' || n.rang::text
       end
  from numerote n
 where p.id = n.id;

-- ── 3. La forme, redite en base ─────────────────────────────────────────────
alter table profiles
  add constraint zabelie_boutik_slug_forme
  check (
    boutik_slug is null
    or (
      boutik_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(boutik_slug) between 2 and 40
      and boutik_slug not in (
        'admin','api','boutik','catalogue','createur','connexion','aide',
        'vendre','panier','rechaj','pro','talents','produit','nouveau','new'
      )
    )
  );

-- ── 4. L'unicité — l'autorité, pas une suggestion ──────────────────────────
create unique index zabelie_boutik_slug_uniq
  on profiles (boutik_slug)
  where boutik_slug is not null;

-- ── 5. Post-conditions ──────────────────────────────────────────────────────
do $$
declare
  v_mauvais integer;
  v_doublons integer;
  v_remplis integer;
  v_total integer;
begin
  -- CHAQUE slug écrit est relu. Un `translate` décalé d'un caractère aurait
  -- produit des adresses abîmées en silence ; ici la migration casse.
  select count(*) into v_mauvais
    from profiles
   where boutik_slug is not null
     and (boutik_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          or length(boutik_slug) not between 2 and 40);
  if v_mauvais > 0 then
    raise exception '0083 KO: % slug(s) mal formes — depliage d''accents suspect', v_mauvais;
  end if;

  select count(*) into v_doublons from (
    select boutik_slug from profiles
     where boutik_slug is not null
     group by boutik_slug having count(*) > 1
  ) d;
  if v_doublons > 0 then
    raise exception '0083 KO: % slug(s) en double malgre l''index unique', v_doublons;
  end if;

  if not exists (
    select 1 from pg_indexes where indexname = 'zabelie_boutik_slug_uniq'
  ) then
    raise exception '0083 KO: index unique absent';
  end if;

  -- OBSERVABILITÉ : « aucun slug » et « aucun profil » ne se distinguent pas
  -- d'eux-mêmes. On dit les deux nombres plutôt que de laisser un zéro muet.
  select count(*) filter (where boutik_slug is not null), count(*)
    into v_remplis, v_total from profiles;
  raise notice '0083 OK: % adresse(s) sur % profil(s) — les autres gardent /createur/<id>',
    v_remplis, v_total;
end $$;
