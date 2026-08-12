-- Garde de rejeu (0065) — connu-positif ET connu-négatif, EXÉCUTÉS.
-- Transaction annulée : rien ne persiste.
--
-- Pourquoi ce fichier existe, et il vaut d'être écrit. `tests/migration-garde-
-- rejeu.test.ts` vérifie que chaque migration APPELLE le garde. C'est
-- nécessaire et ça ne suffit pas : passé sous la mutation qui remplace
-- `if v_statut = 'appliquee'` par `if false`, ce test restait VERT. Il
-- surveillait les sites d'appel, jamais le garde lui-même — un garde rendu
-- inatteignable et un garde présent laissent exactement le même texte dans les
-- fichiers appelants.
--
-- Ici, la fonction est EXÉCUTÉE. Un `if false` fait rougir la ligne N1.
begin;

do $$
declare
  v_ok boolean;
begin
  -- Décor : deux lignes de registre, une appliquée, une seulement rédigée.
  insert into zabelie_schema_migrations
    (filename, sha256, applied_at, applied_by, statut, preuve)
  values
    ('9001_tes_appliquee.sql', '-', now(), 'tes', 'appliquee', 'sonde_schema'),
    ('9002_tes_redigee.sql',   '-', null,  null,  'redigee',   'non_appliquee');

  -- ── P1 — jamais inscrite : le garde laisse passer. ────────────────────────
  perform zabelie_migration_garde('9003_tes_inconnue.sql');

  -- ── P2 — inscrite `redigee` : le garde laisse passer. ─────────────────────
  -- C'est le cas d'une dormante qu'on applique ENFIN. Un garde qui bloquerait
  -- ici rendrait les cinq dormantes du dépôt inapplicables.
  perform zabelie_migration_garde('9002_tes_redigee.sql');

  -- ── N1 — inscrite `appliquee` : le garde DOIT lever. ──────────────────────
  -- C'est LA ligne que la mutation `if false` fait tomber.
  begin
    perform zabelie_migration_garde('9001_tes_appliquee.sql');
    raise exception
      'ECHEC N1 : le garde a laisse passer une migration deja inscrite APPLIQUEE — le rejeu est ouvert';
  exception when sqlstate 'ZB065' then
    null;
  end;

  -- ── N2 — nom de fichier malformé : le garde DOIT lever. ───────────────────
  -- Le copié-collé approximatif, qui produirait un garde surveillant une clé
  -- qui n'existe dans aucun registre : muet par construction.
  begin
    perform zabelie_migration_garde('ma_migration.sql');
    raise exception 'ECHEC N2 : nom de fichier malforme ACCEPTE';
  exception when sqlstate 'ZB065' then
    null;
  end;

  begin
    perform zabelie_migration_garde(null);
    raise exception 'ECHEC N2bis : nom NULL ACCEPTE';
  exception when sqlstate 'ZB065' then
    null;
  end;

  raise notice 'OK — garde de rejeu : P1/P2 passent, N1/N2/N2bis levent ZB065';
end $$;

-- Droits : la fonction est `security definer`, donc son exposition compte.
do $$
declare v_reste integer;
begin
  select count(*) into v_reste
    from information_schema.role_routine_grants
   where routine_name = 'zabelie_migration_garde'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_reste > 0 then
    raise exception
      'ECHEC : zabelie_migration_garde reste executable par % role(s) client', v_reste;
  end if;
  raise notice 'OK — garde de rejeu : aucun droit anon/authenticated/PUBLIC';
end $$;

rollback;
