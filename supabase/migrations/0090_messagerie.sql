select zabelie_migration_garde('0090_messagerie.sql');

-- ============================================================================
-- 0090 — Messagerie acheteur ↔ vendeur
-- ============================================================================
-- ⚠️ ÉTAT : RÉDIGÉE, NON APPLIQUÉE. Le porteur l'applique.
--
-- POURQUOI — le manque le plus coûteux de `docs/44` §3.1.
--
-- Sur ce marché la confiance est le frein numéro un, et un acheteur qui a une
-- question sur un produit n'a AUCUN chemin dans le produit : il sort, ou il
-- n'achète pas.
--
-- ⚠️ ET CE N'EST PAS UN DOUBLON DE WHATSAPP — correction d'une inquiétude que
-- `docs/44` portait à tort. `lib/whatsapp.ts` contacte **la plateforme**, pas
-- le vendeur ; son en-tête le dit : « Ici c'est la plateforme qu'on contacte ».
-- Aucun canal acheteur ↔ vendeur n'existe aujourd'hui, nulle part.
--
-- ── LE PÉRIMÈTRE, ET CE QU'IL LAISSE DEHORS ─────────────────────────────────
--
-- Un fil par (PRODUIT, ACHETEUR). Pas par commande : la question qui compte
-- arrive AVANT l'achat, et c'est tout l'objet. Un fil ouvert avant l'achat
-- reste le même après — l'acheteur n'a pas à chercher où sa conversation est
-- passée une fois la commande créée.
--
-- ⛔ Ce que cette migration NE fait PAS, délibérément :
--   • aucune pièce jointe — le stockage vendeur n'a AUCUNE policy
--     (`docs/44`, mesuré : `storage.objects` RLS active, 0 policy) ;
--   • aucun accusé de lecture visible à l'autre — `zabelie_conversation_reads`
--     sert le compteur « non lus » de son PROPRE titulaire, rien d'autre. Un
--     « vu » exposé est une promesse sociale qu'on ne veut pas faire ici ;
--   • aucun détecteur de coordonnées. Voir §5.
--
-- ── §1. LA TABLE DES FILS ───────────────────────────────────────────────────
--
-- `seller_id` est DÉNORMALISÉ depuis `products`, et ce n'est pas un confort de
-- jointure : c'est ce qui rend la policy de lecture évaluable sans sous-requête
-- sur `products`, donc sans dépendre de la policy de `products`. Un produit
-- dépublié ne doit pas faire disparaître un fil en cours — la conversation a eu
-- lieu, et l'acheteur garde le droit de la relire.
-- ============================================================================

create table zabelie_conversations (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products (id) on delete cascade,
  buyer_id        uuid not null references profiles (id) on delete cascade,
  seller_id       uuid not null references profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  -- UN SEUL fil par (produit, acheteur). Sans cette contrainte, deux clics sur
  -- « Poser une question » créeraient deux fils, et la réponse du vendeur
  -- atterrirait dans celui que l'acheteur ne regarde pas.
  constraint zabelie_conversations_unique unique (product_id, buyer_id),
  -- ⚠️ Un vendeur n'ouvre pas de fil sur son propre produit. Sans ce garde, il
  -- pourrait s'écrire à lui-même — inoffensif, mais toute ligne dont le sens
  -- est indéfini finit par être lue de travers par quelque chose.
  constraint zabelie_conversations_pas_soi_meme check (buyer_id <> seller_id)
);

create index zabelie_conversations_buyer_idx
  on zabelie_conversations (buyer_id, last_message_at desc);
create index zabelie_conversations_seller_idx
  on zabelie_conversations (seller_id, last_message_at desc);

-- ── §2. LES MESSAGES — APPEND-ONLY ──────────────────────────────────────────
-- Même discipline que le grand livre : ce qui est dit est dit. Un message
-- modifiable après coup rendrait le fil inutilisable comme preuve le jour d'un
-- litige (`docs/28`), et c'est précisément l'usage qu'on veut lui garder.

create table zabelie_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references zabelie_conversations (id) on delete cascade,
  sender_id       uuid not null references profiles (id) on delete cascade,
  -- Borné EN BASE, pas seulement dans la route : une borne applicative se
  -- contourne par n'importe quel autre appelant.
  body            text not null check (length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

create index zabelie_messages_conv_idx
  on zabelie_messages (conversation_id, created_at desc, id desc);

/* ⚠️ UPDATE SEULEMENT — ET LA DIFFÉRENCE AVEC LE GRAND LIVRE EST VOULUE.
 *
 * `0025` bloque UPDATE **et** DELETE sur `wallet_transactions` : l'historique
 * d'argent ne doit jamais disparaître, et une correction s'y fait par écriture
 * compensatoire. Reprendre ce trigger tel quel ici aurait paru cohérent, et
 * aurait été faux — pour une raison mesurable : le trigger `before delete`
 * frappe AUSSI les suppressions en CASCADE. Un compte supprimé ferait tomber
 * la cascade sur ses messages, et la suppression de compte échouerait.
 *
 * Or `app/api/account` et `components/account-actions.tsx` promettent
 * exactement cela — « Téléchargez une copie de vos données ou supprimez… ».
 * Une trace financière ne s'efface pas ; les messages d'une personne qui ferme
 * son compte, si.
 *
 * ⚠️ Le DELETE reste donc interdit AUX CLIENTS, mais par la RLS et le `revoke`
 * du §4, pas par ce trigger. La différence : la RLS distingue l'appelant, le
 * trigger non. C'est le seul endroit du dépôt où append-only signifie
 * « non modifiable » plutôt que « non modifiable ni supprimable », et il fallait
 * que ce soit écrit, pas déduit. Le cas est éprouvé sous un vrai rôle dans
 * `supabase/tests/messagerie.test.sql`. */
create function zabelie_messages_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ZB090 : zabelie_messages est append-only — un message envoye ne se '
    'reecrit pas. Le fil doit rester opposable en cas de litige.'
    using errcode = 'ZB090';
end;
$$;

create trigger zabelie_messages_no_update
  before update on zabelie_messages
  for each row execute function zabelie_messages_append_only();

-- Le fil remonte quand il bouge : c'est ce qui trie les deux boîtes.
create function zabelie_messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update zabelie_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger zabelie_messages_touch
  after insert on zabelie_messages
  for each row execute function zabelie_messages_touch_conversation();

-- ── §3. LES LECTURES — le compteur de non-lus, et rien d'autre ──────────────

create table zabelie_conversation_reads (
  conversation_id uuid not null references zabelie_conversations (id) on delete cascade,
  user_id         uuid not null references profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ── §4. RLS — LE GARDE EST EN BASE, PAS DANS LA ROUTE ───────────────────────
--
-- ⚠️ CHOIX DÉLIBÉRÉ, et il diffère de `orders`. Les commandes s'écrivent côté
-- serveur parce que les invariants de paiement l'exigent. Un message, lui, n'a
-- qu'un invariant : **l'expéditeur est l'appelant, et il participe au fil**.
-- Cet invariant s'exprime entièrement dans un `with check`. L'écrire en SQL le
-- rend vrai pour TOUT appelant ; l'écrire dans une route le rend vrai pour
-- cette route-là.
--
-- C'est la leçon de l'API v1, une couche plus bas : « la RLS est un plancher,
-- pas un filtre ». Ici on fait de ce plancher le mur porteur.

alter table zabelie_conversations       enable row level security;
alter table zabelie_messages            enable row level security;
alter table zabelie_conversation_reads  enable row level security;

-- Les DEUX participants lisent le fil.
create policy zabelie_conversations_read on zabelie_conversations
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

/* L'ACHETEUR ouvre le fil, et `seller_id` NE VIENT PAS DU CLIENT.
 *
 * ⚠️ C'est le cœur de cette policy. Sans la sous-requête, un client forgerait
 * `seller_id` et ouvrirait un fil au nom de n'importe qui — le vendeur verrait
 * une conversation qu'il n'a pas, et l'acheteur écrirait à quelqu'un qui n'est
 * pas le bon. Le `seller_id` est donc CONTRAINT d'être celui du produit, tel
 * que la base le connaît.
 *
 * Et `status = 'published'` : on n'ouvre pas de fil sur un brouillon. Un
 * brouillon n'est pas une offre. */
create policy zabelie_conversations_open on zabelie_conversations
  for insert with check (
    auth.uid() = buyer_id
    and exists (
      select 1 from products p
       where p.id = product_id
         and p.seller_id = zabelie_conversations.seller_id
         and p.status = 'published'
    )
  );

-- Aucune policy UPDATE ni DELETE : un fil ne se modifie pas.

create policy zabelie_messages_read on zabelie_messages
  for select using (
    exists (
      select 1 from zabelie_conversations c
       where c.id = conversation_id
         and (auth.uid() = c.buyer_id or auth.uid() = c.seller_id)
    )
  );

/* L'invariant, en une expression : l'expéditeur est l'appelant ET il
 * participe au fil. Les deux moitiés comptent — sans la première, un
 * participant pourrait écrire au nom de l'autre. */
create policy zabelie_messages_send on zabelie_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from zabelie_conversations c
       where c.id = conversation_id
         and (auth.uid() = c.buyer_id or auth.uid() = c.seller_id)
    )
  );

create policy zabelie_reads_own on zabelie_conversation_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Les triggers portent la cohérence ; personne d'autre n'écrit ces colonnes.
revoke update, delete on zabelie_conversations      from anon, authenticated;
revoke update, delete on zabelie_messages           from anon, authenticated;

-- ── §5. CADENCE ET DÉSINTERMÉDIATION ────────────────────────────────────────

create table zabelie_message_limits (
  key        text primary key,
  value      integer not null,
  comment    text,
  updated_at timestamptz not null default now()
);

insert into zabelie_message_limits (key, value, comment) values
  ('messages_par_heure', 30,
   'Messages qu''un compte peut envoyer par heure, tous fils confondus. Borne anti-spam, pas anti-usage : une negociation active depasse rarement 30 tours en une heure.'),
  ('fils_ouverts_par_jour', 10,
   'Fils NEUFS qu''un acheteur peut ouvrir par jour. C''est la borne qui compte : ecrire beaucoup dans un fil existant est une conversation, ouvrir dix fils avec dix vendeurs est un demarchage.')
on conflict (key) do nothing;

alter table zabelie_message_limits enable row level security;
create policy zabelie_message_limits_read on zabelie_message_limits
  for select using (true);
revoke insert, update, delete on zabelie_message_limits from anon, authenticated;

-- ⚠️ AUCUN DÉTECTEUR DE COORDONNÉES DANS CETTE MIGRATION, ET C'EST UN CHOIX
-- QUI SE DISCUTE — donc il est écrit ici plutôt que tranché en silence.
--
-- Le risque est réel et il touche l'argent : deux participants qui s'échangent
-- un numéro et règlent hors Zabelie font perdre la commission À LA PLATEFORME
-- et l'escrow À L'ACHETEUR. Sur une marketplace dont toute la posture BRH
-- repose sur le fait d'ÊTRE le chemin de paiement (`docs/17`), ce n'est pas un
-- détail commercial.
--
-- Ce qui n'est pas fait, et pourquoi : un filtre qui bloque les chiffres
-- casserait « ma boutique est au 12 de la rue X » et « il m'en faut 3 » ; un
-- filtre qui les tolère ne bloque rien. Un classifieur a des faux positifs, et
-- un faux positif ici est un vendeur qui ne peut pas répondre à son client.
--
-- ⛔ ARBITRAGE PORTEUR (docs/28) : bloquer, marquer, ou ne rien faire. En
-- attendant, la seule mesure prise est HONNÊTE et non technique — l'écran
-- rappelle que payer hors Zabelie fait perdre la protection de l'escrow. On
-- informe, on n'empêche pas.

-- ── §6. Post-conditions — connu-positif ET connu-négatif ────────────────────
-- Une contrainte qu'on n'a pas vue REFUSER n'a pas démontré qu'elle pouvait.
do $$
declare
  v_a uuid;
  v_b uuid;
  v_prod uuid;
  v_conv uuid;
  v_msg uuid;
  v_ok boolean;
begin
  select id into v_a from profiles order by created_at limit 1;
  select id into v_b from profiles where id <> v_a order by created_at limit 1;

  if v_a is null or v_b is null then
    raise notice '0090 : moins de deux profils, contraintes non eprouvees ICI '
                 '(elles le sont dans supabase/tests/messagerie.test.sql)';
    return;
  end if;

  select id into v_prod from products where seller_id = v_b limit 1;
  if v_prod is null then
    select id into v_prod from products limit 1;
  end if;
  if v_prod is null then
    raise notice '0090 : aucun produit, contraintes non eprouvees ICI';
    return;
  end if;

  -- P1 — CONNU-POSITIF : un fil s'ouvre, un message s'insère.
  insert into zabelie_conversations (id, product_id, buyer_id, seller_id)
  values ('00000000-0000-0000-0000-0000000d0090', v_prod, v_a, v_b)
  returning id into v_conv;

  insert into zabelie_messages (conversation_id, sender_id, body)
  values (v_conv, v_a, 'Sonde 0090') returning id into v_msg;

  -- P2 — le fil a REMONTÉ (le trigger a tourné).
  if (select last_message_at from zabelie_conversations where id = v_conv)
     <= (select created_at from zabelie_conversations where id = v_conv) - interval '1 second'
  then
    raise exception '0090 KO: last_message_at n''a pas suivi l''insertion'
      using errcode = 'ZB090';
  end if;

  -- P3 — CONNU-NÉGATIF : un message ne se modifie pas.
  v_ok := false;
  begin
    update zabelie_messages set body = 'reecrit' where id = v_msg;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '0090 KO: un message a ete MODIFIE — le fil n''est plus '
                    'opposable' using errcode = 'ZB090';
  end if;

  -- P4 — la SUPPRESSION n'est PAS testée ici, et c'est exact : ce bloc tourne
  -- en propriétaire, où elle est permise par construction. Ce qui la refuse aux
  -- clients est la RLS (aucune policy DELETE) et le `revoke` du §4 — deux
  -- gardes qui dependent du RÔLE, donc inéprouvables sans en changer.
  -- `supabase/tests/messagerie.test.sql` le fait sous `authenticated`.

  -- P5 — CONNU-NÉGATIF : un corps vide est refusé.
  v_ok := false;
  begin
    insert into zabelie_messages (conversation_id, sender_id, body)
    values (v_conv, v_a, '   ');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '0090 KO: un message VIDE a ete accepte' using errcode = 'ZB090';
  end if;

  -- P6 — CONNU-NÉGATIF : on ne s'écrit pas à soi-même.
  v_ok := false;
  begin
    insert into zabelie_conversations (product_id, buyer_id, seller_id)
    values (v_prod, v_a, v_a);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '0090 KO: un fil avec soi-meme a ete accepte'
      using errcode = 'ZB090';
  end if;

  -- Nettoyage : la cascade emporte les messages.
  delete from zabelie_conversations where id = v_conv;

  raise notice '0090 OK: fil ouvert, message insere, reecriture refusee, '
               'corps vide et fil-avec-soi-meme refuses';
end $$;
