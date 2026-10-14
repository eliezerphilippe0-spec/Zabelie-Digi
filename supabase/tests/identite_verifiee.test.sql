-- Badge « Identité vérifiée » (0138 ; audit docs/69, lot 2). Transaction annulée.
-- Éprouvé sous le rôle anon, chaque cas positif avec son connu-négatif :
--
--   I1  le marchand approuvé sort ;
--   I2  le marchand EN ATTENTE et le marchand REFUSÉ ne sortent pas ;
--   I3  un ACHETEUR approuvé (non marchand) ne sort pas : la fonction n'apprend
--       rien sur les acheteurs ;
--   I4  un marchand approuvé mais SUSPENDU ne sort pas ;
--   I5  un identifiant inconnu, un tableau vide ou nul ne rendent rien ;
--   I6  la table des dossiers reste illisible en direct pour anon (RLS 0079).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'approuve138@test.local'),
  ('00000000-0000-0000-0000-0000000d0002', 'attente138@test.local'),
  ('00000000-0000-0000-0000-0000000d0003', 'refuse138@test.local'),
  ('00000000-0000-0000-0000-0000000d0004', 'acheteur138@test.local'),
  ('00000000-0000-0000-0000-0000000d0005', 'suspendu138@test.local')
  on conflict do nothing;

delete from profiles where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
  '00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d0004',
  '00000000-0000-0000-0000-0000000d0005');
insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-0000000d0001', 'creator', 'Approuve'),
  ('00000000-0000-0000-0000-0000000d0002', 'creator', 'Attente'),
  ('00000000-0000-0000-0000-0000000d0003', 'creator', 'Refuse'),
  ('00000000-0000-0000-0000-0000000d0004', 'buyer',   'Acheteur'),
  ('00000000-0000-0000-0000-0000000d0005', 'creator', 'Suspendu');
update profiles set suspended_at = now() where id = '00000000-0000-0000-0000-0000000d0005';

insert into zabelie_kyc_submissions (user_id, status, decided_at) values
  ('00000000-0000-0000-0000-0000000d0001', 'approved', now()),
  ('00000000-0000-0000-0000-0000000d0002', 'pending',  null),
  ('00000000-0000-0000-0000-0000000d0003', 'rejected', now()),
  ('00000000-0000-0000-0000-0000000d0004', 'approved', now()),
  ('00000000-0000-0000-0000-0000000d0005', 'approved', now());

-- ── I1 → I4 ─────────────────────────────────────────────────────────────────
do $$
declare v uuid[];
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select coalesce(array_agg(x order by x), '{}') into v
    from zabelie_identites_verifiees(array[
      '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
      '00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d0004',
      '00000000-0000-0000-0000-0000000d0005']::uuid[]) x;
  reset role;
  assert v = array['00000000-0000-0000-0000-0000000d0001']::uuid[],
    format('I1-I4 KO : %s — seul le marchand approuve et actif devait sortir (ni attente, ni refus, ni acheteur, ni suspendu)', v);
  raise notice 'I1-I4 OK — seul le marchand approuve et actif porte le badge';
end $$;

-- ── I5. Rien demandé, rien rendu ────────────────────────────────────────────
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from zabelie_identites_verifiees(array['00000000-0000-0000-0000-0000000dffff']::uuid[]);
  assert n = 0, format('I5 KO : un identifiant inconnu rend %s ligne', n);
  select count(*) into n from zabelie_identites_verifiees('{}'::uuid[]);
  assert n = 0, 'I5 KO : un tableau vide rend quelque chose';
  select count(*) into n from zabelie_identites_verifiees(null);
  assert n = 0, 'I5 KO : un tableau nul rend quelque chose';
  reset role;
  raise notice 'I5 OK — rien demandé, rien rendu';
end $$;

-- ── I6. La table des dossiers reste fermée en direct ────────────────────────
do $$
declare n integer := 0;
begin
  begin
    set local role anon;
    select count(*) into n from zabelie_kyc_submissions;
  exception when insufficient_privilege then
    n := 0;  -- refus de privilège : encore plus fermé que la RLS, c'est bon
  end;
  reset role;
  assert n = 0, format('I6 KO : anon lit %s dossier(s) KYC en direct', n);
  raise notice 'I6 OK — anon ne lit aucun dossier en direct, seul le badge sort';
end $$;

rollback;
