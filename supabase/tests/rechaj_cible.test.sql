-- Tests du numéro à recharger (0099). Transaction annulée à la fin.
--
--   R1. `zabelie_est_rechaj` répond par l'ASCENDANCE, pas par le libellé : une
--       fiche sous « Recharge Digicel » (niveau 3) rend vrai, une fiche d'un
--       autre rayon rend faux, une fiche sans sous-rayon rend faux.
--   R2. LE CŒUR : le vendeur ne lit la cible QU'UNE FOIS LA COMMANDE PAYÉE.
--       Une commande `pending` n'ouvre rien — sinon il suffirait de créer des
--       commandes jamais payées pour collecter des numéros de téléphone.
--   R3. L'acheteur relit la sienne, et ne lit pas celle d'un autre.
--   R4. Aucune écriture directe, `update` compris : un numéro modifiable après
--       paiement serait un numéro sur lequel le vendeur ne peut pas s'appuyer.
--   R5. La contrainte de forme est en BASE, pas seulement en TypeScript.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a9901', 'r.achte@test.local'),
  ('00000000-0000-0000-0000-0000000a9902', 'r.vande@test.local'),
  ('00000000-0000-0000-0000-0000000a9903', 'r.kirye@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000a9901', 'Achte Rechaj'),
  ('00000000-0000-0000-0000-0000000a9902', 'Vande Rechaj'),
  ('00000000-0000-0000-0000-0000000a9903', 'Kirye Rechaj')
on conflict (id) do nothing;

-- Deux fiches : l'une sous « Recharge Digicel » (niveau 3, donc l'ascendance
-- doit être remontée sur DEUX crans), l'autre sous un rayon quelconque.
insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id)
select '00000000-0000-0000-0000-0000000a9910',
       '00000000-0000-0000-0000-0000000a9902',
       'rechaj-250', 'Rechaj Digicel 250 HTG', 'service', 250, 'published', c.id
  from zabelie_categories c where c.slug = 'rechaj-digicel';

insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id)
values ('00000000-0000-0000-0000-0000000a9911',
        '00000000-0000-0000-0000-0000000a9902',
        'liv-kreyol', 'Liv Kreyol', 'fichier', 500, 'published', null);

-- Une commande PAYÉE sur la recharge, une PENDING sur la même fiche.
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000a9920', '00000000-0000-0000-0000-0000000a9901',
   '00000000-0000-0000-0000-0000000a9910', 250, 'paid'),
  ('00000000-0000-0000-0000-0000000a9921', '00000000-0000-0000-0000-0000000a9901',
   '00000000-0000-0000-0000-0000000a9910', 250, 'pending');

insert into zabelie_rechaj_cible (order_id, msisdn) values
  ('00000000-0000-0000-0000-0000000a9920', '34123456'),
  ('00000000-0000-0000-0000-0000000a9921', '40765432');

-- ── R1 — l'ascendance, pas le libellé ───────────────────────────────────────
do $$
declare v_oui boolean; v_non boolean; v_nul boolean;
begin
  select zabelie_est_rechaj('00000000-0000-0000-0000-0000000a9910') into v_oui;
  select zabelie_est_rechaj('00000000-0000-0000-0000-0000000a9911') into v_non;
  select zabelie_est_rechaj('00000000-0000-0000-0000-0000000a99ff') into v_nul;
  if v_oui is not true then
    raise exception 'R1 KO : une fiche sous rechaj-digicel (niveau 3) devrait exiger un numero';
  end if;
  if v_non is not false then
    raise exception 'R1 KO : une fiche sans sous-rayon exige un numero (%)', v_non;
  end if;
  if v_nul is not false then
    raise exception 'R1 KO : une fiche inexistante exige un numero (%)', v_nul;
  end if;
  raise notice 'R1 OK — ascendance remontee, faux ailleurs';
end $$;

-- ── R2 — le moment de recharger, et rien d'autre ────────────────────────────
do $$
declare v_count int;
begin
  -- Le vendeur, sur sa commande PAYÉE : il voit.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a9902';
  select count(*) into v_count from zabelie_rechaj_cible
   where order_id = '00000000-0000-0000-0000-0000000a9920';
  if v_count <> 1 then
    raise exception 'R2 KO : le vendeur ne voit pas la cible d''une commande payee (%)', v_count;
  end if;

  -- LA MÊME FICHE, LE MÊME VENDEUR, une commande PENDING : rien. C'est la
  -- seule assertion qui distingue « la policy filtre » de « la policy laisse
  -- passer tout ce qui appartient au vendeur ».
  select count(*) into v_count from zabelie_rechaj_cible
   where order_id = '00000000-0000-0000-0000-0000000a9921';
  if v_count <> 0 then
    raise exception 'R2 KO : une commande PENDING ouvre la cible (%)', v_count;
  end if;
  reset role;

  -- Un curieux sans aucune commande : rien du tout.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a9903';
  select count(*) into v_count from zabelie_rechaj_cible;
  if v_count <> 0 then
    raise exception 'R2 KO : un tiers lit % cible(s)', v_count;
  end if;
  reset role;
  raise notice 'R2 OK — payee seulement, vendeur seulement';
end $$;

-- ── R3 — l'acheteur relit la sienne ─────────────────────────────────────────
do $$
declare v_count int; v_msisdn text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a9901';
  -- Les DEUX siennes, payée comme pending : c'est ce qui lui permet de voir
  -- son erreur pendant que la commande est encore en attente.
  select count(*) into v_count from zabelie_rechaj_cible;
  if v_count <> 2 then
    raise exception 'R3 KO : l''acheteur lit % de ses 2 cibles', v_count;
  end if;
  select msisdn into v_msisdn from zabelie_rechaj_cible
   where order_id = '00000000-0000-0000-0000-0000000a9920';
  if v_msisdn <> '34123456' then
    raise exception 'R3 KO : numero relu « % »', v_msisdn;
  end if;
  reset role;
  raise notice 'R3 OK — l''acheteur relit ce qu''il a saisi';
end $$;

-- ── R4 — aucune écriture directe ────────────────────────────────────────────
do $$
declare v_ok boolean;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a9901';

  -- Insertion : refusée (droit révoqué, pas seulement absence de policy).
  v_ok := false;
  begin
    insert into zabelie_rechaj_cible (order_id, msisdn)
    values ('00000000-0000-0000-0000-0000000a9921', '39999999');
    v_ok := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_ok then
    raise exception 'R4 KO : un compte connecte a INSERE une cible';
  end if;

  -- Mise à jour de SA PROPRE ligne : refusée aussi. C'est le point qui compte —
  -- « c'est la mienne » n'est pas un droit de la changer une fois payee.
  v_ok := false;
  begin
    update zabelie_rechaj_cible set msisdn = '39999999'
     where order_id = '00000000-0000-0000-0000-0000000a9920';
    v_ok := true;
  exception when insufficient_privilege then
    null;
  end;
  if v_ok then
    raise exception 'R4 KO : l''acheteur a MODIFIE la cible d''une commande payee';
  end if;
  reset role;
  raise notice 'R4 OK — ni insert ni update depuis un compte connecte';
end $$;

-- ── R5 — la forme est gardée en base ────────────────────────────────────────
do $$
declare v_ok boolean;
begin
  -- Un fixe (préfixe 2) : refusé par la contrainte, même en service-role. Sans
  -- cette assertion, la borne ne vivrait qu'en TypeScript et une route future
  -- qui oublierait de valider écrirait un numéro impossible à recharger.
  v_ok := false;
  begin
    insert into zabelie_rechaj_cible (order_id, msisdn)
    values ('00000000-0000-0000-0000-0000000a9921', '22345678');
    v_ok := true;
  exception when check_violation then
    null;
  end;
  if v_ok then
    raise exception 'R5 KO : un numero fixe (2xxxxxxx) est entre en base';
  end if;

  v_ok := false;
  begin
    insert into zabelie_rechaj_cible (order_id, msisdn)
    values ('00000000-0000-0000-0000-0000000a9921', '3412345');
    v_ok := true;
  exception when check_violation then
    null;
  end;
  if v_ok then
    raise exception 'R5 KO : sept chiffres sont entres en base';
  end if;
  raise notice 'R5 OK — la contrainte de forme tient en base';
end $$;

rollback;
