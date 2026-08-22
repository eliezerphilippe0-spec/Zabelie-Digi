-- ============================================================================
-- Messagerie acheteur ↔ vendeur (0090) — ce qui doit rester vrai
-- ============================================================================
-- Ce fichier existe pour les gardes que la migration NE PEUT PAS éprouver
-- elle-même : son bloc de post-condition tourne en PROPRIÉTAIRE, où la RLS ne
-- s'applique pas. Une policy n'est jamais prouvée par du SQL exécuté sous le
-- rôle qui la contourne.
--
-- Deux propriétés commandent tout le reste :
--
--   1. `seller_id` NE VIENT PAS DU CLIENT. La policy d'ouverture le contraint
--      à être celui du produit, tel que la base le connaît. Sans ça, un
--      acheteur ouvrirait un fil « avec » n'importe qui.
--   2. L'expéditeur EST l'appelant. Sans ça, un participant écrirait au nom
--      de l'autre — dans un fil dont on veut qu'il reste opposable.
--
-- ⚠️ MÊME LIMITE QUE `orders_rls_isolation.test.sql`, et elle doit voyager avec
-- ce fichier : `auth.uid()` est un STUB qui lit un réglage de session
-- (`_bootstrap.sql`). Aucun JWT n'est émis, signé ni vérifié. Ce qui est exercé
-- est le MOTEUR DE POLICIES avec une identité choisie — pas la chaîne
-- « jeton GoTrue → PostgREST → policy ». L'écart est nommé dans `docs/24`.
-- ============================================================================

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000aca1'),  -- acheteur A
  ('00000000-0000-0000-0000-00000000aca2'),  -- acheteur B
  ('00000000-0000-0000-0000-0000000e5e11'),  -- vendeur S
  ('00000000-0000-0000-0000-0000000e5e12')   -- vendeur T
on conflict (id) do nothing;

insert into profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-00000000aca1', 'buyer',   'Acheteur A'),
  ('00000000-0000-0000-0000-00000000aca2', 'buyer',   'Acheteur B'),
  ('00000000-0000-0000-0000-0000000e5e11', 'creator', 'Vendeur S'),
  ('00000000-0000-0000-0000-0000000e5e12', 'creator', 'Vendeur T')
on conflict (id) do update set display_name = excluded.display_name;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000090d1',
   '00000000-0000-0000-0000-0000000e5e11',
   'msg-produit-publie', 'Produit publié de S', 'physical', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000090d2',
   '00000000-0000-0000-0000-0000000e5e11',
   'msg-produit-brouillon', 'Brouillon de S', 'physical', 1000, 'draft'),
  -- ⚠️ Un SECOND produit publié, et il existe pour une raison précise : le
  -- cas 2 doit porter sur un couple (produit, acheteur) NEUF. Voir son
  -- en-tête — c'est le défaut que la mutation a révélé dans ce fichier même.
  ('00000000-0000-0000-0000-0000000090d3',
   '00000000-0000-0000-0000-0000000e5e11',
   'msg-produit-publie-2', 'Second produit publié de S', 'physical', 900, 'published');

-- ───── 1. CONNU-POSITIF : l'acheteur ouvre un fil sur un produit publié ─────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca1';
  insert into zabelie_conversations (id, product_id, buyer_id, seller_id)
  values ('00000000-0000-0000-0000-00000000c001',
          '00000000-0000-0000-0000-0000000090d1',
          '00000000-0000-0000-0000-00000000aca1',
          '00000000-0000-0000-0000-0000000e5e11');
  select count(*) into v_n from zabelie_conversations
   where id = '00000000-0000-0000-0000-00000000c001';
  reset role;
  assert v_n = 1, format('CAS 1 : le fil n''a pas été ouvert (%s)', v_n);
  raise notice 'OK — 1. l''acheteur ouvre un fil sur un produit publié';
end $$;

-- ───── 2. CONNU-NÉGATIF : `seller_id` FORGÉ est refusé ──────────────────────
-- LE cas qui justifie la sous-requête de la policy. Un acheteur qui désigne
-- un autre vendeur que celui du produit ouvrirait un fil « avec » quelqu'un
-- qui n'a jamais rien vendu — et ce quelqu'un le verrait dans sa boîte.
--
-- ⚠️ CE CAS NE PROUVAIT RIEN DANS SA PREMIÈRE VERSION, et c'est la mutation
-- qui l'a dit — pas la relecture. Il réutilisait le couple (produit d1,
-- acheteur A) du cas 1, déjà pris. En retirant la sous-requête de la policy,
-- l'insertion n'a PAS été refusée par la policy : elle est tombée sur
-- `zabelie_conversations_unique`. Autrement dit, le vert du cas 2 pouvait
-- venir de la contrainte d'unicité et non du garde qu'il prétend éprouver.
--
-- Pire — et c'est la version dangereuse : si `unique_violation` avait figuré
-- dans le `exception when`, le cas serait resté VERT avec le garde RETIRÉ.
-- Le test aurait attesté une protection absente.
--
-- Il porte donc sur le produit **d3**, couple neuf : seule la policy peut
-- refuser. Vérifié dans les deux sens le 2026-08-22.
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca1';
  begin
    insert into zabelie_conversations (product_id, buyer_id, seller_id)
    values ('00000000-0000-0000-0000-0000000090d3',
            '00000000-0000-0000-0000-00000000aca1',
            '00000000-0000-0000-0000-0000000e5e12');  -- vendeur T, pas le sien
  -- `unique_violation` est DÉLIBÉRÉMENT absent : s'il survenait, il doit faire
  -- ÉCHOUER le test bruyamment plutôt que d'être compté comme un refus.
  exception when insufficient_privilege or check_violation then v_ok := true;
  end;
  reset role;
  assert v_ok, 'CAS 2 : FUITE — un seller_id forgé a été accepté';
  raise notice 'OK — 2. un seller_id qui n''est pas celui du produit est refusé';
end $$;

-- ───── 3. CONNU-NÉGATIF : pas de fil sur un BROUILLON ───────────────────────
-- Un brouillon n'est pas une offre. Ouvrir un fil dessus reviendrait à
-- solliciter un vendeur sur quelque chose qu'il n'a pas mis en vente.
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca1';
  begin
    insert into zabelie_conversations (product_id, buyer_id, seller_id)
    values ('00000000-0000-0000-0000-0000000090d2',
            '00000000-0000-0000-0000-00000000aca1',
            '00000000-0000-0000-0000-0000000e5e11');
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  assert v_ok, 'CAS 3 : un fil a été ouvert sur un BROUILLON';
  raise notice 'OK — 3. aucun fil sur un produit non publié';
end $$;

-- ───── 4. CONNU-NÉGATIF : un tiers ne voit pas le fil ───────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca2';
  select count(*) into v_n from zabelie_conversations;
  reset role;
  assert v_n = 0, format('CAS 4 : FUITE — B voit %s fil(s) qui ne le regardent pas', v_n);
  raise notice 'OK — 4. un tiers ne voit aucun fil';
end $$;

-- ───── 5. Les DEUX participants voient le fil ───────────────────────────────
-- Symétrique du cas 4 : une policy qui ne rendrait rien à personne passerait
-- le cas 4 sans rien garder. « Aucun cas » et « aucun cas possible » ne se
-- distinguent pas d'eux-mêmes.
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e5e11';
  select count(*) into v_n from zabelie_conversations;
  reset role;
  assert v_n = 1, format('CAS 5 : le VENDEUR ne voit pas son fil (%s)', v_n);
  raise notice 'OK — 5. le vendeur voit le fil ouvert avec lui';
end $$;

-- ───── 6. CONNU-POSITIF : chaque participant peut écrire ────────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca1';
  insert into zabelie_messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c001',
          '00000000-0000-0000-0000-00000000aca1', 'Bonjou, li disponib?');
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e5e11';
  insert into zabelie_messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c001',
          '00000000-0000-0000-0000-0000000e5e11', 'Wi, li disponib.');
  select count(*) into v_n from zabelie_messages
   where conversation_id = '00000000-0000-0000-0000-00000000c001';
  reset role;
  assert v_n = 2, format('CAS 6 : %s message(s) au lieu de 2', v_n);
  raise notice 'OK — 6. les deux participants écrivent et lisent le fil';
end $$;

-- ───── 7. CONNU-NÉGATIF : on n'écrit PAS au nom de l'autre ──────────────────
-- La moitié de la policy que le cas 6 ne prouve pas. Sans `auth.uid() =
-- sender_id`, un vendeur pourrait fabriquer un message signé de son acheteur —
-- dans un fil dont l'intérêt est justement d'être opposable.
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e5e11';
  begin
    insert into zabelie_messages (conversation_id, sender_id, body)
    values ('00000000-0000-0000-0000-00000000c001',
            '00000000-0000-0000-0000-00000000aca1', 'Message forgé');
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  assert v_ok, 'CAS 7 : FUITE — un participant a écrit au nom de l''autre';
  raise notice 'OK — 7. l''expéditeur est forcément l''appelant';
end $$;

-- ───── 8. CONNU-NÉGATIF : un tiers n'écrit pas dans un fil ──────────────────
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca2';
  begin
    insert into zabelie_messages (conversation_id, sender_id, body)
    values ('00000000-0000-0000-0000-00000000c001',
            '00000000-0000-0000-0000-00000000aca2', 'Je m''invite');
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  assert v_ok, 'CAS 8 : FUITE — un tiers a écrit dans un fil';
  raise notice 'OK — 8. un tiers n''écrit pas dans un fil';
end $$;

-- ───── 9. CONNU-NÉGATIF : un message ne se RÉÉCRIT pas ──────────────────────
-- Ici c'est le TRIGGER qui refuse, pas la RLS — et il refuse même le
-- propriétaire. C'est ce qui rend le fil opposable en cas de litige.
do $$
declare v_ok boolean := false;
begin
  begin
    update zabelie_messages set body = 'réécrit'
     where conversation_id = '00000000-0000-0000-0000-00000000c001';
  exception when others then v_ok := true;
  end;
  assert v_ok, 'CAS 9 : un message a été RÉÉCRIT — le fil n''est plus opposable';
  raise notice 'OK — 9. append-only : un message ne se réécrit pas';
end $$;

-- ───── 10. CONNU-NÉGATIF : un client ne SUPPRIME pas un message ─────────────
-- ⚠️ LE CAS QUE LA MIGRATION NE POUVAIT PAS ÉPROUVER, et la raison d'être de
-- ce fichier. Le trigger de `0090` ne couvre PAS le DELETE — délibérément,
-- pour que la suppression de compte puisse cascader. Ce qui protège ici est
-- donc la RLS (aucune policy DELETE) et le `revoke`. Deux gardes qui dépendent
-- du RÔLE : inéprouvables sous le propriétaire, exactement comme le cas 9 est
-- inéprouvable par la RLS.
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aca1';
  begin
    delete from zabelie_messages
     where conversation_id = '00000000-0000-0000-0000-00000000c001';
    -- Une RLS sans policy DELETE ne LÈVE pas : elle ne trouve simplement
    -- aucune ligne à supprimer. Le silence est donc le succès attendu, et il
    -- faut le VÉRIFIER plutôt que de le supposer — d'où le comptage.
    v_ok := true;
  exception when insufficient_privilege then v_ok := true;
  end;
  reset role;
  assert v_ok, 'CAS 10 : erreur inattendue';
end $$;

do $$
declare v_n integer;
begin
  select count(*) into v_n from zabelie_messages
   where conversation_id = '00000000-0000-0000-0000-00000000c001';
  assert v_n = 2,
    format('CAS 10 : FUITE — un client a supprimé des messages (%s restants sur 2)', v_n);
  raise notice 'OK — 10. un client ne supprime aucun message';
end $$;

-- ───── 11. La suppression de COMPTE cascade bien ────────────────────────────
-- Le corollaire du choix de `0090` : si ce cas échoue, un utilisateur ne peut
-- plus fermer son compte, et la promesse de `components/account-actions.tsx`
-- devient fausse.
do $$
declare v_n integer;
begin
  delete from profiles where id = '00000000-0000-0000-0000-00000000aca1';
  select count(*) into v_n from zabelie_conversations
   where id = '00000000-0000-0000-0000-00000000c001';
  assert v_n = 0,
    format('CAS 11 : le fil survit à la suppression du compte (%s)', v_n);
  raise notice 'OK — 11. supprimer un compte emporte ses fils et ses messages';
end $$;

rollback;
