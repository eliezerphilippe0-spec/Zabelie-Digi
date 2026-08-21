# 43 — Spécification du test connu-négatif de l'écriture compensatoire

> **Statut : SPÉCIFICATION. Zéro code, zéro migration, zéro test écrit.**
> Rédigée le 2026-08-21 contre `origin/main` = `ef67013` (86 migrations,
> 49 tests SQL), objets lus dans le dépôt — pas de mémoire.
>
> ⚠️ **Ce document ne lève aucun gel.** Il décrit le test qui devra rougir
> AVANT qu'une ligne de versement automatique soit écrite. Le versement
> automatique lui-même reste interdit tant que Digicel n'a pas confirmé
> l'activation de `/v1/Transfert` (`docs/42` §1, `docs/03` §9 étape 0).

---

## 1. Ce qui existe déjà — mesuré, pas supposé

**La première chose à écrire est celle qui rend ce document plus court :
l'écriture compensatoire existe, elle est testée, et son test connu-négatif
existe aussi.** Le spécifier de nouveau serait construire un doublon.

### 1.1 L'écriture compensatoire — `0032`

`zabelie_record_manual_payout(p_wallet_id, p_amount_htg, p_method,
p_reference, p_recorded_by, p_note, p_paid_at)` fait déjà exactement ce que la
règle du dépôt exige — **corriger un solde par une écriture de plus, jamais par
une modification du grand livre** :

- trace opposable dans `payouts` (reçu, méthode, auteur, date) ;
- `update wallets set balance_htg = balance_htg - montant` ;
- **ligne négative** au grand livre : `insert into wallet_transactions … (-montant)`,
  clé `'payout:' || référence`, immuable par le trigger append-only de `0025`.

L'identité `Σ(wallet_transactions) = balance_htg + pending_htg` est donc
préservée **par construction** : le débit du solde et l'écriture négative sont
dans la même transaction.

### 1.2 Les tests existants — et le connu-négatif est déjà là

`supabase/tests/manual_payouts.test.sql` — six cas :

| Cas | Ce qu'il éprouve |
|---|---|
| PM1 | Règlement tracé, solde débité, ledger à −3000 |
| PM2 | Rejeu du même reçu → no-op, aucun double débit |
| PM3 | Montant > solde **disponible** → refus, rien d'écrit |
| PM4 | Le solde **en attente** n'est pas décaissable |
| PM5 | Référence vide → refus (opposabilité) |
| PM6 | Ledger immuable — l'`update` est refusé |

`supabase/tests/wallet_coherence.test.sql` — cinq cas, et **WC4 est un
connu-négatif au sens strict** :

```sql
-- WC4 : écriture directe hors grand livre (bug ou intervention manuelle).
update wallets set balance_htg = balance_htg + 2500 where id = v_wallet;
select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_wallet;
assert v_ecart = 2500, …
```

Il **casse délibérément l'invariant** et exige que la sonde le voie. WC5 exige
en plus que `zabelie_solvency_report()` bascule `ok = false`. WC3 vérifie que le
règlement manuel, lui, **ne crée aucun écart**.

**Conclusion de §1 : pour le règlement MANUEL, l'instrument a été passé sur un
cas connu-positif (WC3) et un cas connu-négatif (WC4/WC5). Il n'y a rien à
ajouter.**

---

## 2. Ce que le versement AUTOMATIQUE ajoute, et que rien ne couvre

Le versement automatique n'est pas « le règlement manuel, sans l'humain ». Il
introduit un mode de panne que le règlement manuel **ne peut pas avoir**.

### 2.1 Le mode de panne : la panne partielle entre deux systèmes

Dans le règlement manuel, l'argent part **d'abord** (virement MonCash fait à la
main), et l'admin **enregistre ensuite** ce qui a déjà eu lieu. Une seule
écriture, dans une seule transaction, après coup. Il n'y a pas de fenêtre.

Dans le versement automatique, deux systèmes bougent : **MonCash** et **la
base**. Entre les deux, tout peut s'arrêter.

| Scénario | Ce qui se passe | Conséquence |
|---|---|---|
| **A — versement OK, écriture KO** | `Transfert` réussit, la connexion tombe avant l'`insert` | L'argent est parti, le grand livre l'ignore. Le vendeur reste créditeur d'une somme déjà reçue. **Il sera payé deux fois.** |
| **B — écriture OK, versement KO** | Le débit est écrit, `Transfert` échoue ou est refusé | Débit fantôme : le vendeur est débité de fonds qu'il n'a jamais reçus. |
| **C — timeout, issue inconnue** | `Transfert` ne répond pas. A-t-il eu lieu ? | Le pire des trois : rejouer risque A, ne pas rejouer risque B. |

⚠️ **Aucun de ces trois scénarios ne casse l'identité de cohérence.** Dans le
scénario A, `Σ(ledger)` et `balance + pending` restent parfaitement égaux — il
ne manque rien *dans la base*. `zabelie_wallet_coherence` rendra `ecart = 0`, et
`zabelie_solvency_report()` rendra `ok = true`.

**C'est le point qui justifie ce document entier** : la sonde de cohérence
existante est aveugle à la classe de pannes que le versement automatique
introduit. Elle croise la base avec elle-même. Elle ne croise rien avec MonCash.
C'est le motif « un filet sur un chemin impraticable mesure zéro », déplacé
d'un cran : ici le filet est sur le bon chemin, mais il regarde du mauvais côté
de la frontière.

### 2.2 Le défaut structurel : la clé d'idempotence n'existe pas encore

`0032` construit sa clé ainsi :

```sql
v_key := 'payout:' || v_ref;    -- v_ref = la référence du reçu
```

Pour un règlement manuel, la référence est le reçu MonCash — **il existe déjà**
quand la fonction est appelée. Pour un versement automatique, la référence
naturelle serait le `transactionId` rendu par `Transfert` — **il n'existe
qu'APRÈS l'appel**, c'est-à-dire après la fenêtre où la panne se produit.

Une clé dérivée de la réponse du fournisseur ne protège de rien : au scénario C,
le rejeu n'a pas de clé à comparer et paie une seconde fois.

**Contrainte qui en découle, et elle est architecturale** : la clé d'idempotence
doit être **calculée avant l'appel, à partir de données que Zabelie possède**
— typiquement l'identifiant de l'entrée d'escrow ou du lot de versement. Le
`transactionId` du fournisseur devient une **preuve conservée**, jamais une clé.
C'est le même choix que le topup, où `customIdentifier = order.id` est transmis
au fournisseur (`docs/07`) — et non l'inverse.

---

## 3. Les cas à écrire — `supabase/tests/versement_auto.test.sql`

Nomenclature `VA1…VA7`. Chaque cas porte sa **paire** : ce qui doit passer, et
la mutation sous laquelle il doit rougir. Un cas sans mutation n'entre pas dans
ce fichier.

> Ces cas supposent une fonction de versement encore inexistante — appelée ici
> `zabelie_enregistrer_versement_auto(...)` à titre de nom de travail. **Sa
> signature n'est pas arrêtée par ce document** ; seul l'est ce qu'elle doit
> subir.

### VA1 — Chemin nominal : l'identité tient

**Positif** : un versement enregistré débite `balance_htg` et écrit une ligne
négative au grand livre, dans la même transaction. `ecart_htg = 0` après.

**Mutation qui doit faire rougir** : retirer l'`insert into wallet_transactions`
en gardant l'`update wallets`. Attendu : `ecart_htg = −montant`, WC-style.

⚠️ **Ne pas muter en supprimant l'`update wallets`** : les deux mutations ne
sont pas symétriques et seule la première éprouve ce qu'on croit éprouver.

### VA2 — Idempotence sur une clé POSSÉDÉE, pas reçue

**Positif** : deux appels portant la même clé interne → un seul débit, un seul
`payouts`, la seconde réponse marquée `duplicate`.

**Mutation** : faire dériver la clé du `transactionId` fourni en paramètre
plutôt que de l'identifiant interne. Attendu : deux appels avec deux
`transactionId` différents pour le **même** escrow produisent **deux débits** —
le test doit rougir.

⚠️ **C'est LA mutation qui compte dans ce fichier.** C'est la seule qui
distingue une idempotence réelle d'une idempotence apparente, et elle échouera
silencieusement si on ne l'écrit pas : les deux formes passent VA2-positif.

### VA3 — Scénario A : versement parti, écriture perdue

**Positif** : après une panne simulée entre l'appel fournisseur et l'écriture,
il existe une trace « versement initié, issue inconnue » — la ligne d'intention
est écrite **avant** l'appel, pas après.

**Mutation** : supprimer l'écriture d'intention préalable. Attendu : plus aucune
trace du versement en base après la panne — le test doit rougir sur l'absence,
pas sur la présence.

⚠️ **Assertion structurelle** : porter sur la **condition et l'ordre**, jamais
sur un libellé. Chercher la présence du mot « initie » dans le fichier resterait
vert avec un code devenu inatteignable (`CLAUDE.md`, le piège de sous-chaîne).

### VA4 — Scénario B : débit écrit, versement refusé

**Positif** : un refus du fournisseur laisse le solde **intact** et le grand
livre **sans ligne négative**, ou bien porte une écriture compensatoire de
l'écriture compensatoire — jamais un débit orphelin.

**Mutation** : faire écrire le débit avant l'appel fournisseur et ne rien
annuler au refus. Attendu : le solde du vendeur baisse sans qu'il ait reçu quoi
que ce soit → rouge.

### VA5 — Scénario C : le timeout ne paie pas deux fois

**Positif** : un appel sans réponse, rejoué, ne produit **qu'un seul** débit —
la clé de VA2 le garantit.

**Mutation** : la même que VA2. VA5 est l'expression métier de VA2 ; les deux
rougissent ensemble ou l'instrument ment.

### VA6 — Le solde en attente reste non décaissable

**Positif** : reprise de PM4 sur le chemin automatique — un escrow non maturé ne
peut pas être versé.

**Mutation** : remplacer `balance_htg` par `balance_htg + pending_htg` dans le
contrôle de suffisance. Attendu : rouge.

⚠️ **Ce cas doit exister même s'il duplique PM4.** Le chemin automatique est un
appelant distinct ; un garde éprouvé sur un chemin ne prouve rien sur l'autre.

### VA7 — Plafonds en table de config, jamais en dur

**Positif** : les plafonds de versement (par transaction, par jour) sont lus
depuis la table de configuration, et un dépassement est refusé.

**Mutation** : changer la valeur **en base** et vérifier que le comportement
change. Si le comportement ne change pas, le plafond est en dur quelque part —
rouge.

⚠️ **La mutation porte sur la DONNÉE, pas sur le code.** C'est la seule forme
qui distingue « lit la config » de « contient la même valeur que la config ».

---

## 4. Protocole de preuve de l'instrument — obligatoire

Aucun de ces sept cas ne compte tant qu'il n'a pas été **vu rouge**. Le
protocole, dans l'ordre, et chaque étape assure sa post-condition avant de lire
la suivante :

1. Écrire le cas. Le lancer. Il passe.
2. Appliquer la mutation décrite **et afficher la ligne mutée** avant de
   relancer — `CLAUDE.md`, « la mutation qui n'a pas muté » : quatre fois dans
   une seule session, une édition a rendu un succès sans avoir changé le
   fichier, et le vert s'est lu comme une résistance à la mutation.
3. Relancer. **Lire le message d'échec**, pas seulement le code de sortie :
   « 0 test passé » n'est pas « le test a échoué », c'est souvent « le fichier
   ne compile plus ».
4. Retirer la mutation. Relancer. Il repasse.
5. Consigner dans l'en-tête du fichier de test **quelle mutation** a fait
   rougir quel cas. Sans cette ligne, la prochaine session devra tout refaire
   pour savoir si l'instrument a jamais été éprouvé.

---

## 5. Pièges déjà connus du dépôt qui s'appliquent ici

Relevés parce qu'ils ont **déjà mordu** dans ce dépôt, pas par principe :

- **`set local` est transactionnel, pas par bloc.** Un `request.jwt.claim.sub`
  posé dans VA1 survit jusqu'à VA7 dans le même fichier. C'est ce qui a produit
  un faux `E3 KO` dans `evenements.test.sql` et failli faire corriger une
  politique parfaitement correcte.
- **Un intervalle `[\s\S]{0,N}` ne prouve rien seul.** Si une assertion
  structurelle est ajoutée côté TypeScript, une de ses deux extrémités doit
  porter la **liaison** — l'affectation, pas l'usage.
- **Un compteur à zéro ne distingue pas « aucun cas » de « aucun cas
  possible ».** Une suite de versement qui ne verse jamais rien passe au vert.
  Chaque cas doit produire une écriture observable, et l'absence d'écriture doit
  être une assertion, pas un silence.

---

## 6. Hors périmètre — explicitement

| Sujet | Pourquoi hors périmètre |
|---|---|
| L'appel HTTP à `/v1/Transfert` | Étape 0 non franchie (`docs/42` §1). Rien ne se code. |
| La réconciliation avec le solde RÉEL du compte marchand | Aucun endpoint de solde MonCash n'est connu (`docs/17` §2.6). C'est un contrôle **manuel**, `docs/19` §3.2. |
| La billetterie | Découplée — `docs/17` §9.4. Aucun versement n'ouvre `paiement_ouvert`. |
| La qualification juridique du versement | Question 1 du courriel `docs/42` §2. |

---

## 7. Ce que ce document a changé par rapport à ce qu'on croyait

Écrit ici parce que la correction vaut plus que la spécification.

**On partait de** : « il faut spécifier le test connu-négatif de l'écriture
compensatoire ».

**On a mesuré** : l'écriture compensatoire existe (`0032`), et son connu-négatif
aussi (WC4/WC5). Le spécifier de nouveau aurait produit un doublon vert —
exactement le genre d'instrument qui rassure sans rien mesurer.

**Le vrai trou est ailleurs, et il est plus grave** : la sonde de cohérence
croise la base **avec elle-même**. Les trois pannes qu'un versement automatique
introduit (§2.1) laissent toutes `ecart = 0` et `ok = true`. Un versement parti
sans écriture est, pour tous les instruments actuels du dépôt, **indiscernable
d'un versement qui n'a jamais eu lieu**.
