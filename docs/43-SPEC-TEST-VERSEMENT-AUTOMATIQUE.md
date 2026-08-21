# 43 — Spécification du test connu-négatif de l'écriture compensatoire

> **Statut : SPÉCIFICATION. Zéro code, zéro migration, zéro test écrit.**
> Rédigée le 2026-08-21 contre `origin/main` = `ef67013` — **85 fichiers de
> migration** (le plus haut numéro est `0085`, aucun doublon) et **48 tests
> SQL**, comptés sur l'arbre, pas de mémoire.
>
> *(Une première rédaction annonçait 86 et 49. Les deux chiffres venaient d'un
> arbre de travail portant un fichier de plus. `ls | wc -l` est la seule
> réponse ; le souvenir n'en est pas une.)*
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

## 3. La direction du correctif — trois pièces, et elles tiennent ensemble

> Ajoutée le 2026-08-21 sur revue porteur : **décrire le trou sans décrire la
> sortie laisse la prochaine session inventer la sienne.** Ces trois pièces sont
> spécifiées, pas construites — l'interdit d'étape 0 tient (`docs/42` §1).
>
> Elles ne se choisissent pas à la carte. Une table d'intentions sans sonde
> externe enregistre des `inconnu` que personne ne lève ; une sonde sans table
> d'intentions n'a rien à croiser ; une clé tirée de la réponse du fournisseur
> rend les deux inutiles.

### 3.1 Une table d'intentions, append-only, écrite AVANT l'appel

Nom de travail `zabelie_versement_intentions`. Une ligne naît **avant** que le
moindre octet parte vers MonCash, et son état ne recule jamais :

```
cree ──► envoye ──┬──► confirme
                  ├──► echoue
                  └──► inconnu
```

| État | Ce qu'il affirme | Qui l'écrit |
|---|---|---|
| `cree` | Zabelie a décidé de verser. Rien n'est parti. | Avant l'appel, dans sa propre transaction |
| `envoye` | L'appel est parti. L'issue n'est pas connue. | Juste avant l'appel HTTP |
| `confirme` | Le fournisseur a répondu succès, `transactionId` conservé | Après réponse |
| `echoue` | Le fournisseur a répondu refus — **motif conservé** | Après réponse |
| `inconnu` | Ni succès ni refus : délai dépassé, coupure, réponse illisible | Après réponse, ou par la sonde §3.3 |

Trois propriétés non négociables :

- **Append-only**, protégée par trigger, comme le grand livre (`0025`). Une
  intention qui peut être réécrite ne prouve plus rien sur ce qui s'est passé
  — c'est exactement la raison pour laquelle `wallet_transactions` l'est déjà.
- **`cree` est écrit et COMMITÉ avant l'appel.** Une intention écrite dans la
  même transaction que la suite disparaît au rollback, c'est-à-dire précisément
  dans le cas qu'elle existe pour documenter. C'est ce qui ferme le scénario A :
  il reste une trace même quand tout le reste est perdu.
- **`inconnu` n'est pas un échec.** Le confondre avec `echoue` autorise un
  rejeu, et le rejeu d'un versement peut-être parti est le double paiement.

**L'écriture au grand livre reste ce qu'elle est aujourd'hui** : une ligne
négative, dans la même transaction que le débit du solde, écrite **uniquement**
au passage en `confirme`. L'invariant `Σ(ledger) = balance + pending` ne bouge
pas d'un iota — la table d'intentions vit **à côté**, elle n'y participe pas.

### 3.2 La clé d'idempotence est générée par nous, avant l'appel

Elle vaut l'identifiant de l'intention `cree` — donc elle existe avant que quoi
que ce soit puisse échouer. Le `transactionId` du fournisseur devient une
**preuve conservée**, jamais une clé (§2.2).

⚠️ **Une question conditionne la valeur de tout ceci, et elle part dans le même
courriel** : `/v1/Transfert` accepte-t-il une **référence externe** fournie à
l'appel ? → `docs/42` §1, question 5.

| Réponse Digicel | Conséquence sur cette architecture |
|---|---|
| **Oui, référence externe acceptée** | Le fournisseur déduplique lui-même. Le rejeu après délai dépassé devient sûr, et `inconnu` se résout par un simple rejeu. C'est le régime du topup (`customIdentifier = order.id`, `docs/07`). |
| **Non** | **Aucun rejeu n'est sûr.** `inconnu` ne peut se lever que par un relevé externe (§3.3) ou par une vérification humaine. La table d'intentions cesse d'être un confort et devient la seule chose qui empêche de payer deux fois. |

**On écrit pour le cas « non »**, parce que c'est le pire des deux et que la
réponse n'est pas connue. Si c'est « oui », l'architecture reste correcte et se
simplifie ; l'inverse ne serait pas vrai.

### 3.3 Une sonde de réconciliation EXTERNE — la pièce qui manque aujourd'hui

C'est elle qui répare l'aveuglement de §2.1. Un cron quotidien qui croise **la
table d'intentions** avec **ce que MonCash dit** — relevé, ou endpoint de
consultation par référence si Digicel confirme qu'il en existe un (`docs/42`
§1, question 5, seconde moitié).

Ce qu'elle produit, et rien d'autre :

| Constat | Action |
|---|---|
| `confirme` en base, absent chez MonCash | 🚨 **Alerte.** Écriture au grand livre sans versement réel. |
| Chez MonCash, aucune intention correspondante | 🚨 **Alerte.** Versement hors de tout circuit — le pire cas. |
| `inconnu` depuis plus de **N** heures | 🚨 **Alerte**, avec le montant et le vendeur. |
| `envoye` jamais passé à un état terminal | 🚨 **Alerte** — l'exécution est morte en vol. |

⚠️ **ELLE N'A AUCUN POUVOIR D'ÉCRITURE SUR L'ARGENT. Jamais.** Elle ne
confirme pas, ne rejoue pas, ne compense pas, ne « répare » pas un `inconnu`.
Elle alerte, et un humain tranche. Une sonde qui résoudrait automatiquement un
versement d'issue inconnue serait un mécanisme capable de payer deux fois **de
sa propre initiative**, et à une heure où personne ne regarde.

Trois contraintes qui viennent du dépôt, pas de la théorie :

- **`N` en table de config**, jamais en dur — règle dure n° 3, comme tout
  paramètre commercial.
- **Elle journalise chaque passage, y compris à zéro écart.** Sinon « n'a pas
  tourné » et « a tourné, rien trouvé » produisent le même vide (`CLAUDE.md`,
  corollaire d'observabilité).
- **Elle a un appelant déclaré dans `vercel.json → crons`**, et
  `tests/crons-appelants.test.ts` le croise mécaniquement. `zabelie_purge_search_misses()`
  a vécu quatre mois correcte, révoquée, journalisant même à zéro — et sans
  aucun appelant. Une sonde qui ne tourne pas est indiscernable d'une sonde qui
  ne trouve rien.

⚠️ **Et si Digicel répond qu'aucune consultation de statut n'existe** : cette
sonde ne peut pas être automatisée. Elle devient un **contrôle manuel** au
relevé, inscrit à `OPS_TODO` avec sa cadence — ce qui est une réponse honnête,
et infiniment préférable à un cron qui croiserait la base avec elle-même en
ayant l'air de réconcilier.

### 3.4 Ce que ces trois pièces NE font pas

- Elles ne cantonnent rien (`docs/17` §2.6 reste vrai).
- Elles ne disent rien de la qualification juridique (`docs/42` §2, question 1).
- Elles n'ouvrent pas la billetterie payante (`docs/17` §9.4).
- **Elles n'autorisent aucune ligne de code** : étape 0 non franchie.

---

## 4. Les cas à écrire — `supabase/tests/versement_auto.test.sql`

Nomenclature `VA1…VA8`. Chaque cas porte sa **paire** : ce qui doit passer, et
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

### VA5 — Scénario C : `inconnu` n'est pas `echoue`, et ne se rejoue pas seul

**Positif** : un appel sans réponse laisse l'intention en `inconnu` (§3.1), et
un rejeu portant la même clé interne ne produit **qu'un seul** débit.

**Mutation** : faire retomber `inconnu` dans la branche `echoue` — c'est-à-dire
traiter « je ne sais pas » comme « ça a échoué ». Attendu : le rejeu s'autorise
et un second versement part → rouge.

⚠️ **Cette mutation est plus fidèle que « la même que VA2 »**, qui figurait ici
dans la première rédaction. VA2 éprouve la **provenance** de la clé ; VA5
éprouve la **confusion de deux états**, qui est un défaut distinct et se
produirait même avec une clé parfaitement correcte. Les deux doivent exister.

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

### VA8 — La sonde de réconciliation ALERTE et n'écrit rien

**Positif** : présentée à une intention `confirme` sans contrepartie chez le
fournisseur, la sonde (§3.3) **signale** — et le solde, le grand livre et la
table d'intentions sont **strictement inchangés** après son passage.

**Mutation** : lui donner le droit de « réparer » — passer l'intention à
`echoue` et créditer le solde. Attendu : l'assertion d'immutabilité rougit.

⚠️ **Deux assertions, pas une.** Que la sonde alerte est la moitié facile ;
**qu'elle n'ait rien écrit** est celle qui compte, et elle s'assure en
comparant les trois tables avant et après — jamais en constatant l'absence d'un
message. Une sonde silencieuse et une sonde qui a payé produisent la même
sortie console.

⚠️ Ce cas suppose que Digicel confirme l'existence d'une consultation de statut
(`docs/42` §1, question 5). **Sinon il n'y a pas de sonde à tester** — le
contrôle est manuel, et c'est `OPS_TODO` qui le porte, pas ce fichier.

---

## 5. Protocole de preuve de l'instrument — obligatoire

Aucun de ces huit cas ne compte tant qu'il n'a pas été **vu rouge**. Le
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

### 5.1 Et le protocole s'applique d'abord à ce qui MESURE la mesure

`scripts/zabelie-preflight.mjs` (ajouté le 2026-08-21, `pretest`) compare ce que
`package.json` déclare avec ce que `node_modules` porte, et échoue sur le
moindre écart.

**Pourquoi c'est ici et pas dans un coin outillage** : le 2026-08-21, le
conteneur a démarré avec `node_modules` amputé — `zod` et `serwist` absents. Le
symptôme fut bruyant (`TS2307`), donc inoffensif. Mais une amputation touchant
une dépendance chargée par **un seul** fichier de test aurait fait échouer le
chargement de ce fichier, et la suite aurait rendu un total plus petit.
**« 700/700 vert » ressemble exactement à « 717/717 vert ».** C'est le motif
dominant du dépôt appliqué à l'environnement lui-même : l'échec se présente
comme une réussite.

**Épreuve du 2026-08-21, dans les deux sens :**

| Cas | Geste | Résultat |
|---|---|---|
| Connu-positif | tel quel | `OK — 17/17 dépendances présentes`, sortie **0** |
| **Connu-négatif** | `node_modules/zod` déplacé, absence assurée avant de lire quoi que ce soit | `ÉCHEC — 1 dépendance absente : zod`, sortie **1** |
| Retour | `zod` remis, présence assurée | `OK — 17/17`, sortie **0** |

Deux détails qui font la différence entre ce contrôle et un vœu :

- **Il teste `<paquet>/package.json`, pas `require.resolve`.** Ce dernier échoue
  sur les paquets sans point d'entrée — `@types/*` en tête, c'est-à-dire
  exactement la classe par laquelle la panne d'`npm audit fix --omit=dev` était
  arrivée. Un contrôle aveugle à la classe par laquelle la panne arrive ne
  contrôle rien.
- **Une liste de dépendances vide est un ÉCHEC, pas un succès.** Un manifeste
  mal lu rendrait zéro paquet à vérifier, et zéro manquant sur zéro vérifié
  passerait au vert. « Aucun manquant » et « rien vérifié » doivent être
  distinguables — le corollaire d'observabilité, appliqué au contrôle lui-même.

---

## 6. Pièges déjà connus du dépôt qui s'appliquent ici

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

## 7. Hors périmètre — explicitement

| Sujet | Pourquoi hors périmètre |
|---|---|
| L'appel HTTP à `/v1/Transfert` | Étape 0 non franchie (`docs/42` §1). Rien ne se code. |
| La réconciliation avec le solde RÉEL du compte marchand | Aucun endpoint de solde MonCash n'est connu (`docs/17` §2.6). C'est un contrôle **manuel**, `docs/19` §3.2. |
| La billetterie | Découplée — `docs/17` §9.4. Aucun versement n'ouvre `paiement_ouvert`. |
| La qualification juridique du versement | Question 1 du courriel `docs/42` §2. |

---

## 8. Ce que ce document a changé par rapport à ce qu'on croyait

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
