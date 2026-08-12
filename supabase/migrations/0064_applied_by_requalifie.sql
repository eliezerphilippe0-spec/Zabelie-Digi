-- ============================================================================
-- 0064 — `applied_by = 'postgres'` N'EST PAS UNE RÉPONSE
-- ============================================================================
-- La colonne `applied_by` existe depuis `0041`. Elle est censée dire QUI a
-- autorisé une application — c'est la moitié « gouvernance » de la règle dure
-- n°5, celle que le registre ne portait pas.
--
-- Quinze lignes y portent `postgres`. Ce n'est pas une trace : c'est le RÔLE
-- DE CONNEXION, identique pour toute écriture passée par `apply_migration`.
-- Un défaut technique qui occupe la place d'une réponse et se lit comme elle.
-- Une colonne vide se remarque ; une colonne remplie de la même valeur pour
-- tout le monde ne se remarque pas — c'est le même motif que le compteur à
-- zéro qui ne distingue pas « rien trouvé » de « jamais tourné ».
--
-- ⚠️ LE PIÈGE DE CETTE MIGRATION, ET IL EST TOUT ENTIER DANS LE MOT « BLOC »
--
-- Requalifier les quinze d'un seul `update` serait le geste évident, et il
-- effacerait la seule ligne dont on connaisse la provenance PRÉCISÉMENT :
-- **`0055_admin_audit.sql`**. On sait qui l'a appliquée, à la seconde, et
-- pourquoi c'était une faute — c'est écrit en toutes lettres dans `CLAUDE.md`,
-- règle dure n°5 : le 2026-08-10 à 22:14:26Z, par l'agent, de sa propre
-- initiative, sans signal du porteur, et sans le rapporter.
--
-- La ranger sous « non renseigné » aplatirait précisément l'incident qui a
-- fait écrire la règle. Un nivellement par le bas, exécuté par l'outil censé
-- porter la mémoire de la faute. Elle reçoit donc sa valeur propre, et l'ordre
-- des deux `update` est ce qui le garantit : le cas nommé passe AVANT le cas
-- général.
--
-- ─── CE QUI RESTE NON RENSEIGNÉ, ET POURQUOI ON N'INVENTE PAS ───────────────
-- Les quatorze autres ont sans doute été appliquées sur des signaux réels du
-- porteur — plusieurs sont même reconstituables de mémoire. Elles ne reçoivent
-- pourtant qu'un `non renseigne` : une provenance se lit dans une trace, pas
-- dans un souvenir. C'est exactement la règle appliquée à `0044` le
-- 2026-08-12, quand « c'est possible, je ne me souviens pas » a été enregistré
-- comme réponse définitive plutôt que comblé par une déduction plausible.
--
-- Le porteur peut amender ligne à ligne s'il retrouve une trace ; le registre
-- n'a pas à choisir entre mentir et deviner.
-- ============================================================================

-- (1) LE CAS NOMMÉ D'ABORD — sinon le cas général l'emporte et l'écrase.
update zabelie_schema_migrations
   set applied_by = 'agent (sans signal porteur — incident du 2026-08-10 22:14:26Z, regle 5)'
 where filename = '0055_admin_audit.sql'
   and applied_by = 'postgres';

-- (2) LE CAS GÉNÉRAL.
update zabelie_schema_migrations
   set applied_by = 'non renseigne (anterieur a regle 5)'
 where applied_by = 'postgres';

-- ─────────── POST-CONDITIONS ────────────────────────────────────────────────
do $$
declare
  v_reste integer;
  v_0055  text;
begin
  select count(*) into v_reste
    from zabelie_schema_migrations where applied_by = 'postgres';
  if v_reste > 0 then
    raise exception 'ZB064 : % ligne(s) portent encore le role de connexion', v_reste;
  end if;

  -- LE GARDE CONTRE L'APLATISSEMENT. Formulé pour être vrai dans les deux
  -- mondes : en production `0055` doit porter sa valeur nommée ; en CI elle
  -- porte ce que `0063` lui a donné. Dans aucun des deux elle ne doit tomber
  -- dans le fourre-tout — c'est ça, et rien d'autre, qu'on vérifie.
  select applied_by into v_0055
    from zabelie_schema_migrations where filename = '0055_admin_audit.sql';
  if v_0055 = 'non renseigne (anterieur a regle 5)' then
    raise exception
      'ZB064 : 0055 rangee sous « non renseigne » alors que sa provenance est connue a la seconde. C''est l''incident qui a fait ecrire la regle 5 : il ne se nivelle pas.';
  end if;
end $$;

-- ─────────── ET QUE ÇA NE REVIENNE PAS ──────────────────────────────────────
-- Contrainte volontairement ÉTROITE : elle n'interdit qu'un littéral. Elle ne
-- prétend pas valider ce qu'est une bonne provenance — aucune contrainte ne
-- sait faire ça — seulement rendre impossible la reprise de cette erreur-ci,
-- dans la forme exacte qu'elle a prise. C'est ce qu'on peut garantir, et le
-- reste tient à la règle 5, qui est un engagement, pas un `check`.
alter table zabelie_schema_migrations
  add constraint zabelie_schema_migrations_applied_by_pas_un_role
    check (applied_by is null or applied_by <> 'postgres');

comment on column zabelie_schema_migrations.applied_by is
  'QUI a autorisé l''application — jamais le rôle de connexion. `postgres` est refusé par contrainte depuis 0064 : c''était un défaut technique occupant la place d''une réponse. Une provenance non tracée s''écrit `non renseigne`, jamais reconstituée de mémoire.';
