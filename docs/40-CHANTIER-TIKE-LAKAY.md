# 40 — Chantier « Tikè Lakay » — billetterie événementielle

> **Statut : SPÉCIFICATION. Aucune ligne de code, aucune migration.**
> Rédigée le 2026-08-18 contre `origin/main` = `2f3806e` et la production
> `ddditxykopuxxqzgkqwy`, mesurée — pas déduite.
>
> **Deux verrous avant toute implémentation, dont un que le brief n'avait pas
> vu et qui est le plus lourd du dossier.** → §2.

---

## 1. Résumé exécutif

Tikè Lakay ajoute la vente de billets d'événement à Zabelie : un organisateur
publie un événement, vend des billets par catégories (Gratis / Estanda / VIP),
l'acheteur reçoit un billet à QR, un agent de porte le scanne, l'organisateur
est payé après l'événement.

Le socle existe et se réutilise presque intégralement : commande, paiement
MonCash, ledger append-only, commission, escrow, zones, rôles admin, portail
public par jeton opaque. **Ce chantier n'invente pas de money-path, il en
branche un nouveau produit dessus.**

Trois faits mesurés commandent tout le reste :

1. **Un billet vendu 60 jours avant l'événement, c'est 60 jours de rétention
   de fonds sur un compte marchand unique sans cantonnement.** C'est
   littéralement le dossier juridique ouvert de `docs/17`, poussé à son
   maximum. `CLAUDE.md` interdit de l'aggraver sans avis écrit. **Verrou.**
2. **`orders` porte un produit, un vendeur, et aucune quantité.** Acheter
   trois billets, aujourd'hui, ce sont trois commandes.
3. **La maturation J+7 est écrite en dur à huit endroits, dans sept
   migrations** (`0081` en porte deux). Une
   maturation événementielle différente n'est pas un `UPDATE` de config : c'est
   une neuvième copie, ou le moment de paramétrer.

Le reste — QR, scan, anti-fraude, PDF — est du travail ordinaire et sans
surprise, à condition de partir des briques existantes plutôt que de celles
que le brief imagine.

---

## 2. Prérequis et état vérifié

### 2.1 Ce que le brief affirme, et ce que le dépôt dit

Rien de ce qui suit n'est un reproche : un brief se rédige de mémoire, un
dépôt se mesure. C'est exactement pourquoi cette section passe en premier.

| Affirmation du brief | Mesuré le 2026-08-18 |
|---|---|
| livrable `docs/34-CHANTIER-TIKE-LAKAY.md`, « vérifier que 34 est libre » | **34 est PRIS** — `docs/34-SURPLUS-IA.md`. 31, 38, 39 sont réservés par les PR #137/#139/#140. **→ ce document est `docs/40`.** |
| respecter `MASTER_PROMPT_ZABELIE_AI.md` | **Fichier absent du dépôt.** |
| « les 7 invariants agents », « invariant 7 (anti-duplicate) » | Aucun document ne les énonce. Une seule occurrence, `docs/29-FACTURATION-VENDEUR.md:28`, et elle désigne *le brief d'un autre chantier*, pas une charte du dépôt. **La règle anti-doublon existe bel et bien — elle est dans `CLAUDE.md` (« Méthode ») et dans `docs/25`.** C'est la référence qui est fausse, pas l'exigence. |
| « aucune régression sur C1–C6 de `docs/29-CHECKLIST-PRODUCTION-READY.md` » | `docs/29` est **FACTURATION-VENDEUR**. La checklist C1–C6 est **`docs/31-CHECKLIST-PRODUCTION.md`**, ouverte en **PR #137**, pas encore sur `main`. |
| **P0 — `SUPABASE_SERVICE_ROLE_KEY` non régénérée, storage bloqué, chantier gelé** | ❌ **Faux depuis le 2026-08-14.** La clé a été réparée ; `storage.objects` porte **1 objet**, dans `product-covers`. Le verrou P0 du brief est **levé**. ⚠️ Mais un seul objet depuis l'origine : le chemin est ouvert, quasiment pas emprunté — voir §2.3. |
| `0043` appliquée en production | ✅ `statut = 'appliquee'` au registre. |
| vérification post-`0055` faite | ✅ `0055` appliquée. |
| suivre le pattern `create_pending_order` | ❌ **Cette fonction n'existe pas** — et `supabase/migrations/0042_order_ref.sql:18-22` le dit déjà, mot pour mot, à propos d'un brief antérieur qui demandait la même chose. Voir §2.2. |
| billet à **token HMAC/signature serveur** | Le dépôt n'a **aucun** pattern HMAC. Son pattern de jeton public est `randomBytes(18).toString("base64url")` (`lib/business.ts:73`), opaque et aléatoire. Introduire HMAC est un choix défendable — mais c'est un **nouveau** pattern, à décider, pas à hériter. Voir §6.2. |
| scanner **PWA** | `docs/32-PWA-SERVICE-WORKER.md` : « **SPÉCIFIÉ, NON COMMENCÉ** », et il qualifie le service worker de « **pire artefact adressé par chaîne du répertoire** ». Une page de secours existe déjà (`app/sw-desinstaller/page.tsx`). Voir §5.4. |
| Eventbrite ~291,8 M$ / >3 Md$ GTV | **Non vérifiable ici** (egress fermé, `CONNECT 403`). Ces chiffres ne sont ni confirmés ni infirmés — ils ne servent d'appui à aucune décision de ce document. |

**Dernier numéro de migration** — ⚠️ **corrigé le 2026-08-20, et la
correction fait partie de PR-T1.** La rédaction initiale annonçait `0085`
comme premier numéro libre. Entre-temps `0084_boutique_publique.sql` et
`0085_objets_requis_v2.sql` ont été **appliquées** (registre : `journal_supabase`).
**Le premier numéro libre est donc `0086`**, et c'est celui que PR-T1 occupe.

Un document de spécification qui annonce un mauvais numéro de migration est
exactement la dérive que le registre SHA-256 existe pour empêcher : il
inviterait la prochaine session à écraser un fichier déjà appliqué.
Non appliquées et assumées : `0031` (fidélité, sautée), `0051`, `0056`.

### 2.2 Le fantôme `create_pending_order`

C'est la deuxième fois qu'un brief demande de brancher un chantier sur cette
fonction. `0042` avait déjà tranché, et sa réponse vaut ici sans un mot de
changement :

> « ÉCART assumé avec le brief : il demandait la génération « dans
> `create_pending_order` ». Cette fonction **N'EXISTE PAS** — les commandes
> naissent d'un insert direct (`app/api/checkout/route.ts:220`). L'intention
> […] est réalisée par un **trigger BEFORE INSERT** sur `orders` : même
> garantie, quel que soit le chemin d'insertion, présent ou futur. »
> — `supabase/migrations/0042_order_ref.sql:18-22`

La ligne a bougé depuis : l'insert est aujourd'hui à
**`app/api/checkout/route.ts:252-260`**. La leçon, elle, ne bouge pas :
**une garantie qui doit tenir quel que soit le chemin se met dans un trigger,
jamais dans une fonction que le brief suppose.** C'est la forme que prendra
l'émission de billet (§5.2).

L'exigence de fond du brief — *« server-side price lookup + `auth.uid()` sur
tout RPC financier »* — est juste et déjà tenue : le prix est lu en base et
figé (`checkout/route.ts:256`, `finalPriceHtg`), et `confirm_payment` fait la
triple vérification des montants.

### 2.3 Storage : le verrou est levé, la sonde ne l'est pas

`product-covers` (public), `product-files` (privé), `kyc-documents` (privé)
existent, la clé fonctionne, **un** objet a été écrit. Pour Tikè Lakay, deux
conséquences :

- l'affiche d'événement et le billet PDF ne sont **pas** bloqués ;
- mais aucun chemin de téléversement n'a d'usage réel derrière lui. Le premier
  test grandeur nature de Tikè Lakay sera aussi le premier test grandeur
  nature du storage. À prévoir comme tel, pas à découvrir.

`docs/32` §1 verrouillait le chantier PWA sur exactement ce point, mesuré au
2026-08-11 (« zéro objet »). **Ce verrou-là est levé ; l'arbitrage `docs/32`
§1 (V-2), lui, reste ouvert.**

---

## 3. ⛔ Le verrou que le brief n'a pas vu : la rétention

**C'est le point d'arrêt de ce document, au sens du garde-fou « si un conflit
avec un invariant apparaît, stopper et le signaler ».**

`CLAUDE.md` :

> ⚠️ **Dossier juridique ouvert, sans réponse à ce jour** : la plateforme
> encaisse sur un **compte marchand unique** (fonds vendeurs et revenus
> plateforme **mêlés**, aucun cantonnement) et retient le net vendeur jusqu'au
> règlement. […] **Ne rien construire qui *aggrave* la rétention sans avis
> écrit.**

Le brief dit, en invariant 5 : « les fonds organisateurs suivent le modèle
escrow existant » — puis, en arbitrage 1, demande **une maturation à J+2 après
la date de l'événement**.

Mis bout à bout, cela veut dire : **encaisser l'argent d'un acheteur en
janvier pour un concert de mars, et le garder jusqu'en mars.** Le modèle
marketplace actuel retient au pire ~7 jours après une livraison. La
billetterie porte cette durée à **la distance entre la vente et l'événement**
— structurellement non bornée, et c'est le cœur même du produit, pas un cas
limite.

Ce n'est pas un détail d'implémentation : **la billetterie maximise très
exactement la variable que le dossier BRH interroge.** Sur ce point, la
recommandation du brief (J+2 après l'événement) est *techniquement* la bonne —
payer l'organisateur avant l'événement exposerait Zabelie au risque
d'annulation — et c'est bien pour ça que le problème est réel : **la seule
conception techniquement prudente est aussi la plus exposée juridiquement.**

**Conséquence opérationnelle** : l'avis de HDIT / Cabinet Volmar cesse d'être
un jalon parallèle et devient un **prérequis d'implémentation**. Le dossier
existe déjà et n'attend qu'un envoi (`docs/17`, `docs/36`). La question à y
ajouter tient en une phrase :

> *La conservation, sur un compte marchand unique non cantonné, du produit de
> la vente de billets jusqu'à la tenue de l'événement — soit potentiellement
> plusieurs mois — relève-t-elle d'un service de paiement au sens de la
> Circulaire 121 ?*

**Le verrou est désormais EN BASE, pas seulement dans ce document.** `0086`
pose `zabelie_ticket_config.paiement_ouvert = false` et une contrainte
`check (prix_htg = 0 or zabelie_paiement_billets_ouvert())` : tant que le
drapeau est faux, **aucune catégorie de billet ne peut porter un prix non
nul**. Une note dans un document s'oublie ; une contrainte, non. Le jour où
l'avis arrive, un seul `UPDATE` l'ouvre — aucune migration.

**Ce qui reste faisable sans attendre l'avis**, parce que ça ne retient rien :
la spécification (ce document), le modèle de données, l'émission et le
contrôle de billets **gratuits** (0 HTG, aucun flux financier), et le scanner.
C'est un V0 réel, utile aux églises et aux événements communautaires, et il
n'aggrave rien. → §7, PR-T1 à PR-T4.

---

### 3 bis. La question à envoyer, telle quelle

Prête à copier dans un courriel. Elle ne demande pas un mandat : elle demande
l'annotation de deux pages qui existent déjà (`docs/17`, `docs/36`).

> **Objet — Qualification d'une billetterie événementielle au regard de la
> Circulaire 121**
>
> Zabelie encaisse sur un **compte marchand unique**, sans cantonnement, et
> reverse au vendeur après une période de maturation. Nous envisageons d'y
> ajouter la vente de **billets d'événement**.
>
> La différence tient en une variable : pour un produit, la plateforme retient
> les fonds environ sept jours après la livraison. Pour un billet, elle les
> retiendrait **de la vente jusqu'à la tenue de l'événement** — soit
> potentiellement plusieurs mois, et cette durée est le cœur du produit, pas un
> cas limite. Payer l'organisateur avant l'événement nous exposerait au risque
> d'annulation ; c'est pourquoi la conception techniquement prudente est aussi
> celle qui allonge le plus la rétention.
>
> **La question : cette conservation relève-t-elle d'un service de paiement au
> sens de la Circulaire 121 ?** Et si oui, quelles conditions (cantonnement,
> agrément, plafond de durée) la rendraient admissible ?
>
> Nous ne construisons **aucune** fonctionnalité payante avant votre réponse —
> le verrou est posé en base (`zabelie_ticket_config.paiement_ouvert = false`),
> pas seulement dans nos notes.

⚠️ **À envoyer maintenant, quel que soit le sort de PR-T1.** Le délai d'un
cabinet se compte en semaines : c'est le chemin critique du payant, et le
lancer en parallèle ne préjuge de rien.

## 4. Périmètre

### V0 — sans flux financier (ne dépend d'aucun avis juridique)
- Événement, catégories de billets, billets **gratuits** uniquement.
- Émission, QR, scan, journal de scans, révocation.
- Page organisateur, page scanner.

### V1 — billets payants (dépend du §3)
- Achat via le flux commande existant, **MonCash uniquement** (rail validé).
- Escrow événementiel (arbitrage A1).
- Frais fixe + commission (arbitrage A4).
- Billet imprimable PDF/HTML.
- **Up-sell événementiel** — ajouté sur demande du porteur, 2026-08-18 : voir
  §4 bis.

### V2 — différé, documenté
Programme d'affiliation événementiel (le socle `0081` existe déjà) ·
publicité · abonnement organisateur · location d'appareils · places numérotées
et plans de salle · mode hors-ligne du scanner · avance partielle à
l'organisateur.

### Hors périmètre, avec la raison
- **NatCash** : ⛔ aucune API publique (`CLAUDE.md`, dépendances bloquantes).
  Ce n'est pas « différé », c'est **impossible en l'état** — la checklist
  `docs/03` §9 étape 0 est éliminatoire.
- **Stripe / PayPal** : construit mais suspendu à une entité *merchant of
  record* étrangère. Jalon, pas fonctionnalité.

### 4 bis. Up-sell — « ajou up-sell », 2026-08-18

Mesuré avant d'écrire : **aucun up-sell n'existe dans le dépôt.** Les seules
correspondances sont du bruit (fil d'Ariane « chemin recommandé », suggestions
de rayons de `components/search-box.tsx`). Aucune recommandation produit,
aucun panier complémentaire, nulle part.

Il y a **deux up-sell différents**, et les confondre ferait un mauvais
chantier :

**(a) Up-sell événementiel** — surclassement Estanda → VIP, billet + produit
dérivé du même organisateur, billet + option (parking, repas). Il appartient à
Tikè Lakay V1 et il bute sur le même mur que la quantité de billets :
`orders` porte **un produit, un vendeur, aucune quantité**
(`orders.product_id`, escrow `unique (order_id)` — `0006:19`). Un up-sell est
par définition une commande à plusieurs lignes.

**(b) Up-sell marketplace** — « vous aimerez aussi » sur la fiche produit,
complémentaires au panier. C'est un **chantier distinct**, sans dépendance à
Tikè Lakay, et il s'appuie sur ce qui existe déjà : la taxonomie 16 rayons
(`docs/16`, `zabelie_categories`) et l'historique de commandes. ⚠️ Il ne
s'appuie **pas** sur un index de recherche : mesuré, il n'y a **aucun
`tsvector`** dans le dépôt — `zabelie_search_misses` enregistre les recherches
sans résultat, `zabelie_search_index_guard` garde l'intégrité, mais la
recherche elle-même est du `ilike` et du trigramme (`profiles_display_name_trgm_idx`,
`pg_trgm`). Une recommandation par similarité de texte partirait donc de plus
loin que ce qu'on croit.

**Les deux passent par la même porte** : `docs/27-PANIER-ET-COMMANDES-MULTIVENDEURS.md`,
« spec, rien d'implémenté », dont les **deux prérequis sont désormais
satisfaits** — `0043` appliquée ✅ et B2 (`0037`/`0038`/`0040`) appliquées ✅
(vérifié au registre : seules `0031`, `0051`, `0056` ne le sont pas).
**Le chantier 4 est débloqué et personne ne l'a vu.** C'est la dépendance à
regarder avant d'ouvrir l'un ou l'autre up-sell.

---

## 5. Modèle de données et flux

### 5.1 Tables proposées

Toutes préfixées `zabelie_`, RLS active à la création, policies explicites.
**Estimation : 3 migrations** — `0086` structure + RLS + config (**livrée**,
PR-T1), `0087` fonctions d'émission et de scan (PR-T3/T4), `0088` plafonds si
le payant s'ouvre.

| Table | Rôle | RLS |
|---|---|---|
| `zabelie_events` | organisateur, titre, description, **zone** (`zabelie_zones`, niveau `komin`/`katye` — `docs/33`), dates début/fin, statut (`bouyon · pibliye · anile · fini`), affiche (storage) | lecture publique des `pibliye` non annulés ; écriture organisateur propriétaire |
| `zabelie_event_ticket_types` | catégorie, **prix HTG serveur**, quota, fenêtre de vente | lecture publique si l'événement l'est ; écriture organisateur |
| `zabelie_event_tickets` | un billet émis : commande, type, porteur, **hash du jeton**, statut | lecture par le porteur **et** par l'organisateur de l'événement ; **aucune écriture directe** |
| `zabelie_ticket_scans` | append-only strict, trigger anti-UPDATE/DELETE | lecture organisateur ; écriture par fonction uniquement |
| `zabelie_ticket_limits` | plafonds et frais, en table de config | fermée (aucune policy) |

Deux points non négociables, hérités :

- **`zabelie_ticket_scans` append-only par trigger**, sur le modèle exact de
  `zabelie_topup_ledger` et du ledger vendeur. Un journal de contrôle d'accès
  qu'on peut réécrire ne vaut rien le jour d'une contestation.
- **Le jeton n'est jamais stocké en clair.** La colonne porte
  `encode(digest(token,'sha256'),'hex')`. Un accès en lecture à la base ne doit
  pas permettre de fabriquer des billets. Le brief le demande déjà — c'est
  juste, on le confirme.

**Toute action admin** (annulation d'événement, remboursement de masse) passe
par `zabelie_admin_actions`, fail-closed, comme le reste.

### 5.2 L'émission d'un billet : un trigger, pas une route

Reprise directe de la leçon `0042` (§2.2). Le billet ne naît pas dans le
handler de paiement : il naît d'un **trigger sur la transition de la
commande vers `paid`**, dans la même transaction que l'escrow.

```
achat → orders (pending) → MonCash → confirm_payment (serveur-à-serveur)
                                          │
                                          ├─ ledger + escrow  (existant, intouché)
                                          └─ TRIGGER → zabelie_event_tickets (emis)
```

Même garantie quel que soit le chemin d'insertion, présent ou futur — et
surtout : **aucune commande payée sans billet, aucun billet sans commande
payée.** Une route qui émettrait le billet « après » aurait une fenêtre où
l'argent est pris et le billet absent.

### 5.3 Machine à états

`emis → skane → itilize` · `anile` · `ranbouse`

Transitions gardées en base, pas dans le handler. Un remboursement **révoque**
le billet : le scan d'un billet remboursé doit être refusé, et la révocation
doit être atomique avec le remboursement — sinon un remboursé entre quand
même.

### 5.4 Le scanner — et pourquoi « PWA » n'est pas un mot gratuit

`docs/32` est catégorique : un service worker « vit dans le navigateur du
client, survit aux déploiements, et un SW défectueux sert du HTML périmé
**indéfiniment** — sans qu'aucun journal de la plateforme ne s'en aperçoive ».
La page de secours `app/sw-desinstaller/page.tsx` existe pour cette raison.

**Recommandation : le scanner V0/V1 est une page web ordinaire**, caméra via
`getUserMedia`, vérification **serveur** à chaque scan. Pas de service worker.
Un agent de porte sans réseau ne scanne pas — et c'est mieux qu'un agent de
porte dont le scanner sert un cache périmé et laisse entrer des billets
révoqués.

Le **mode hors-ligne est V2**, et il change de nature le choix du jeton (§6.2).

---

## 6. Menaces et anti-fraude

| Menace | Réponse |
|---|---|
| Faux billet fabriqué | Le jeton n'est pas devinable (144 bits d'aléa) et son hash seul est en base. |
| **Rejeu / capture d'écran partagée** | La menace réelle : un QR se photographie et s'envoie sur WhatsApp. Seule défense qui tienne : **usage unique + détection de double scan**, avec le premier scan qui gagne et le second refusé en nommant l'heure et la porte du premier. Le journal `zabelie_ticket_scans` est ce qui rend l'arbitrage humain possible à l'entrée. |
| Double scan concurrent (deux portes) | Verrouillage en base sur la transition `emis → skane`, pas de contrôle applicatif. |
| Billet remboursé présenté | Révocation atomique au remboursement (§5.3). |
| Scan par un non-agent | Le droit de scanner est porté par l'événement, pas par un rôle global. |
| Énumération de jetons | Aucune route ne prend un jeton en `GET` public ; rate-limit via `zabelie_rate_limits` (existant). |

### 6.2 Le choix du jeton — décision, pas héritage

Le brief demande HMAC. Le dépôt fait de l'aléa opaque (`lib/business.ts:73`).
Les deux sont solides ; ils ne répondent pas à la même question :

- **Aléa opaque + hash en base** — pattern existant, plus simple, rien à
  compromettre côté secret. **Exige la base à chaque scan.**
- **HMAC signé** — permet de vérifier un billet **sans réseau**, donc c'est le
  seul qui rende le mode hors-ligne possible. En contrepartie : une clé de
  signature à gérer, à faire tourner, et un billet signé reste valide même
  révoqué tant que le scanner n'a pas la liste de révocation.

**Recommandation : aléa opaque en V0/V1** (le pattern du dépôt, et le scanner
est en ligne). **HMAC seulement si le mode hors-ligne est retenu** — et alors
c'est un chantier à part entière, avec sa liste de révocation signée, pas une
option de configuration.

---

## 7. Plan de PRs

Une PR = un périmètre vérifiable. Estimation : **3 migrations, ~9 routes, 0
nouveau cron** (la clôture d'événement s'accroche au cron `maturation`
existant, 13:00 UTC).

| PR | Périmètre | Dépend de | Critère d'acceptation |
|---|---|---|---|
| **PR-T1** ✅ | `0086` — `zabelie_events`, `zabelie_event_ticket_types`, `zabelie_ticket_config`, RLS. Aucune UI. **Livrée le 2026-08-20**, migration **rédigée non appliquée**. | — | `rls_toutes_tables` vert · `colonnes_liste_blanche` vert · `supabase/tests/evenements.test.sql` : E1 connu-positif, **E2 connu-négatif**, E3/E4 anon, E5 écriture croisée, **E6/E7 le verrou du payant dans les deux sens**, E8 zone `depatman` refusée |
| **PR-T2** | Console organisateur : créer/publier un événement, catégories. Kreyòl d'abord. | T1 | `i18n-chaines-en-dur` vert ; l'affiche se téléverse **et** se relit (preuve = un 201 dans les journaux Supabase, pas « ça a l'air bon ») |
| **PR-T3** | `0086` — émission par **trigger** sur `orders → paid`, jeton haché, machine à états | T1 | test SQL : commande payée ⇒ billet émis ; **mutation : trigger retiré ⇒ le test échoue** |
| **PR-T4** | Scanner + `zabelie_ticket_scans` append-only + double scan | T3 | test SQL : `update`/`delete` sur le journal **refusés** ; second scan refusé en nommant le premier |
| **PR-T5** | ⛔ **Billets payants** — escrow événementiel, frais, commission | **§3 tranché** | invariant `0033` (Σ ledger = soldes) vrai après vente, après annulation, après remboursement |
| **PR-T6** | Billet imprimable PDF/HTML | T3 | rendu lisible sur Android d'entrée de gamme |
| **PR-T7** | Up-sell événementiel (§4 bis a) | **`docs/27` chantier 4** | — |

**PR-T1 à PR-T4 sont livrables sans attendre l'avis juridique** : elles ne
retiennent aucun fonds. PR-T5 est le premier euro, et le §3 la commande.

### Requêtes de vérification jour-J

```sql
-- 1. Aucun billet orphelin : tout billet a une commande payée.
select count(*) from zabelie_event_tickets t
  left join orders o on o.id = t.order_id
 where o.id is null or o.status not in ('paid','delivered');   -- attendu 0

-- 2. Aucune commande de billet payée sans billet (le miroir — sans lui, la 1 ne prouve rien).
select count(*) from orders o
 where o.status = 'paid' and o.product_id in (select id from products where kind = 'tike')
   and not exists (select 1 from zabelie_event_tickets t where t.order_id = o.id);  -- attendu 0

-- 3. Aucun billet utilisé deux fois.
select ticket_id, count(*) from zabelie_ticket_scans
 where resultat = 'accepte' group by 1 having count(*) > 1;    -- attendu 0 ligne

-- 4. Invariant 0033 après vente de billets (le seul qui parle d'argent).
--    Déjà porté par /api/admin/coherence — à ne PAS réécrire, à observer.
```

---

## 8. Arbitrages

| # | Question | Recommandation | Risque accepté |
|---|---|---|---|
| **A0** | **Rétention (§3)** — la billetterie aggrave-t-elle le dossier BRH ? | **Envoyer la question au cabinet avant PR-T5.** Livrer T1→T4 (gratuit) entre-temps. | Aucun côté technique. Le risque est de *ne pas* poser la question et de découvrir la réponse après avoir encaissé. |
| **A1** | Maturation événementielle | **J+2 après la date de fin de l'événement**, pas après l'achat. | ⚠️ Coût technique réel : `now() + interval '7 days'` est **écrit en dur à 8 endroits, dans 7 migrations** — `0081` en porte deux (`0006:109`, `0009:114`, `0027:124`, `0037:137`, `0038:216`, `0044:181`, `0081:289` et `:323`) et l'est encore dans `confirm_payment` en production. Un délai différent = une 9ᵉ copie, **ou** le moment de porter la maturation en table de config comme l'exige `CLAUDE.md` règle 3. **Recommandation : paramétrer.** |
| **A2** | Annulation d'événement | Remboursement intégral automatique. **Zabelie absorbe le frais fixe** — le facturer à un acheteur pour un événement qui n'a pas eu lieu détruit la confiance pour un gain nul. | Coût direct par annulation. Borné : mettre le seuil en table de config, pas en dur. |
| **A3** | Rôle organisateur | **Extension du rôle `creator`**, pas de nouveau rôle. `user_role` vaut `('buyer','creator','admin')` (`0001:14`) ; ajouter une valeur touche la RLS de tout le dépôt. Un organisateur est un vendeur qui vend un `kind` particulier. | Un organisateur voit la console vendeur. Acceptable en V1. |
| **A3 bis** | `product_kind` | Un billet est-il un 4ᵉ `kind` (`tike`) ? **Oui, probablement** — mais alors `CLAUDE.md` impose la liste complète : `lib/product-kind.ts`, `lib/sample-data.ts`, `lib/database.types.ts`, la liste `KINDS` de `tests/product-kind-discipline.test.ts`, et l'énum SQL. **Aucune compilation ne cassera si on en oublie un** — c'est écrit dans `CLAUDE.md`, c'est le piège nommé. | À traiter comme une checklist, jamais de mémoire. |
| **A4** | Commission | **Grille dédiée en table** (`zabelie_ticket_limits`), pas la grille 10 %/6 %. La marge d'un organisateur n'est pas celle d'un vendeur de produits. Billet gratuit = 0 frais. | Deux grilles à maintenir. Le contraire — un chiffre en dur — est interdit par `CLAUDE.md` règle 3. |
| **A5** | Diaspora | **MonCash dès V1**, achat par un proche en Haïti. L'USD attend la LLC. | Le cœur de cible diaspora n'est servi qu'indirectement en V1. |
| **A6** | Quantité de billets | `orders` = un produit, un vendeur, **sans quantité**. Trois billets = trois commandes, trois escrows (`0006:19`, `unique (order_id)`). **Recommandation V1 : assumer une commande par billet**, et ne pas toucher au money-path. La quantité vient avec `docs/27`. | Parcours d'achat pénible au-delà de 2–3 billets. C'est un vrai coût produit : à mesurer avant de le nier. |

---

## 9. Impacts sur `docs/31` (la checklist)

Pas de nouveau **C7**. Tikè Lakay est un chantier V2 et le brief a raison de
le dire : il ne passe pas devant C1–C6. Deux items existants s'étendent
naturellement :

- **C3** (anti-fuite RLS) : les cinq tables entrent dans la matrice `docs/39`
  et dans le garde `rls_toutes_tables`. Aucun travail supplémentaire — c'est
  le bénéfice d'avoir posé les gardes avant le chantier, pas après.
- **C4** (chaîne financière vendeur) : l'escrow événementiel est un cas de
  plus de l'invariant `0033`, pas un nouveau système comptable.

Et une dette qui n'est pas de ce chantier mais qu'il révèle : **la maturation
J+7 en dur, huit fois.** Elle n'est un problème pour personne aujourd'hui.
Elle le devient au premier produit dont la maturation diffère — c'est-à-dire
celui-ci.
