-- Lecture des taux de commission (0054 + 0066) — EXÉCUTÉE, connu-positif et
-- connu-négatif. Transaction annulée : rien ne persiste.
--
-- Ce que ce fichier prouve et que `tests/commission-config.test.ts` ne peut
-- pas : que la fonction rend ce que la TABLE contient, et qu'elle SUIT un
-- changement de taux. Un `select 1000` écrit en dur passerait tous les
-- contrôles de forme du côté TypeScript.
begin;

do $$
declare
  v_std   integer;
  v_elite integer;
  v_apres integer;
  v_n     integer;
begin
  -- ── P1 — la fonction rend les valeurs de la table ─────────────────────────
  select rate_bps into v_std   from zabelie_commission_taux() where tier = 'standard';
  select rate_bps into v_elite from zabelie_commission_taux() where tier = 'elite';
  if v_std is distinct from (select rate_bps from zabelie_commission_config where tier = 'standard')
     or v_elite is distinct from (select rate_bps from zabelie_commission_config where tier = 'elite') then
    raise exception 'ECHEC P1 : la fonction ne rend pas les valeurs de la table (% / %)', v_std, v_elite;
  end if;

  -- ── P2 — LE POINT DE TOUT LE CHANTIER : elle SUIT un UPDATE ───────────────
  -- C'est ce qui distingue une lecture d'une constante déguisée. Si ce bloc
  -- tombe, l'écran du vendeur resterait figé pendant que le grand livre
  -- facturerait autre chose.
  update zabelie_commission_config set rate_bps = 777 where tier = 'standard';
  select rate_bps into v_apres from zabelie_commission_taux() where tier = 'standard';
  if v_apres <> 777 then
    raise exception
      'ECHEC P2 : apres UPDATE a 777, la fonction rend encore % — elle ne lit pas la table', v_apres;
  end if;

  -- Et `commission_rate_bps`, le taux du chemin d'ARGENT, doit suivre le même
  -- UPDATE. Les deux lectures partagent la table : c'est là toute la garantie
  -- que l'affiché et le facturé ne peuvent plus diverger.
  if commission_rate_bps('standard') <> 777 then
    raise exception
      'ECHEC P2bis : le taux du money-path ne suit pas la config (% au lieu de 777)',
      commission_rate_bps('standard');
  end if;

  -- ── N1 — un taux ne se supprime pas (trigger de 0054) ─────────────────────
  begin
    delete from zabelie_commission_config where tier = 'elite';
    raise exception 'ECHEC N1 : la suppression d''un taux a ete ACCEPTEE';
  exception when others then
    if sqlerrm like 'ECHEC N1%' then raise; end if;
  end;

  -- ── N2 — la borne haute de 0054 refuse le fat-finger ──────────────────────
  begin
    update zabelie_commission_config set rate_bps = 60000 where tier = 'standard';
    raise exception 'ECHEC N2 : un taux de 600 %% a ete ACCEPTE';
  exception when check_violation then
    null;
  end;

  -- ── N3 — la fonction reste fermée a anon ──────────────────────────────────
  select count(*) into v_n
    from information_schema.role_routine_grants
   where routine_name = 'zabelie_commission_taux' and grantee in ('anon', 'PUBLIC');
  if v_n > 0 then
    raise exception 'ECHEC N3 : zabelie_commission_taux exposee a anon/PUBLIC';
  end if;

  raise notice 'OK — taux : P1 lit la table, P2 suit l''UPDATE (affichage ET money-path), N1/N2/N3 refusent';
end $$;

rollback;
