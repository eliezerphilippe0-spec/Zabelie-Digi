-- Tests du journal d'audit admin (0055) — append-only prouvé dans les DEUX sens.
-- Transaction annulée : rien ne persiste.
begin;

-- AA1 — connu-négatif : une écriture bien formée passe.
do $$
begin
  insert into zabelie_admin_actions (actor_id, action, target_type, target_id, reason)
  values (gen_random_uuid(), 'order.refund', 'order', gen_random_uuid()::text, 'test');
  raise notice 'OK — AA1 insertion acceptée';
end;
$$;

-- AA2 — connu-positif : UPDATE interdit, et c'est ZB055 qui le dit.
do $$
begin
  update zabelie_admin_actions set reason = 'reecrit' where action = 'order.refund';
  raise exception 'AA2: l''update aurait du echouer (append-only)';
exception
  when sqlstate 'ZB055' then
    raise notice 'OK — AA2 update refusé par le trigger (ZB055)';
end;
$$;

-- AA3 — connu-positif : DELETE interdit pareil.
do $$
begin
  delete from zabelie_admin_actions where action = 'order.refund';
  raise exception 'AA3: le delete aurait du echouer (append-only)';
exception
  when sqlstate 'ZB055' then
    raise notice 'OK — AA3 delete refusé par le trigger (ZB055)';
end;
$$;

-- AA4 — la forme `domaine.verbe` est une contrainte, pas une convention.
do $$
begin
  insert into zabelie_admin_actions (actor_id, action)
  values (gen_random_uuid(), 'PasLaBonneForme');
  raise exception 'AA4: l''action mal formée aurait du etre refusée';
exception
  when check_violation then
    raise notice 'OK — AA4 forme domaine.verbe imposée par la contrainte';
end;
$$;

-- AA5 — le service seul : anon et authenticated n'ont AUCUN droit.
do $$
declare v_droits integer;
begin
  select count(*) into v_droits
  from information_schema.role_table_grants
  where table_name = 'zabelie_admin_actions'
    and grantee in ('anon', 'authenticated');
  if v_droits > 0 then
    raise exception 'AA5: % droit(s) accordé(s) à anon/authenticated', v_droits;
  end if;
  raise notice 'OK — AA5 aucun droit anon/authenticated';
end;
$$;

rollback;
