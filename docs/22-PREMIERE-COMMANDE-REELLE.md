# La première commande réelle

> **Ce document vaut plus que le prochain contrôle automatisé.**
> Quinze tests SQL ne diront pas ce que cette commande dira : elle est la
> seule chose de tout le chantier qui n'a **jamais traversé la production**.

---

## ⛔ Étape 0 bis — LA TENTATIVE A DÉJÀ EU LIEU CINQ FOIS

> **Mesuré en production le 2026-08-21, à l'ouverture du chantier.** Ce bloc
> passe devant tout le reste du document, parce qu'il change ce qu'il faut
> faire : la suite décrit comment **réussir** la première commande, et
> personne n'avait relevé qu'on avait déjà **échoué** cinq fois, au même
> endroit, pour ce qui ressemble à une seule et même raison.

```
paniers créés ......... 2      ← le chemin acheteur EST praticable
commandes ............. 5      ← toutes `cancelled`
commandes payées ...... 0
paiements ............. 5      ← toutes `failed`, rail moncash
écritures grand livre . 0
portefeuilles ......... 0
escrows ............... 0
```

Cinq tentatives entre le **2026-08-11 et le 2026-08-14**. Les cinq portent le
même motif dans `payments.raw` :

```json
{ "expired_reason": "moncash_unknown_48h", "payment_token": "eyJ…" }
```

**Ce que ce motif dit exactement**, d'après `lib/reconcile.ts:85` — et il faut
le lire précisément, parce que les deux branches ne veulent pas dire la même
chose : `moncash_unknown_48h` est émis quand MonCash répond **404, il ne
connaît pas cette transaction**. Ce n'est PAS `moncash_not_successful_48h`,
qui serait « transaction connue, non aboutie ».

Et `provider_ref` est **null** sur les cinq.

**Donc** : la création du paiement fonctionne — MonCash rend bien un jeton
signé, le JWT porte `"api": true` — et rien n'aboutit jamais de l'autre côté.

⚠️ **Conséquence qui commande le choix du chantier : `confirm_payment` n'a
jamais tourné une seule fois en production.** Zéro écriture au grand livre,
zéro portefeuille, zéro escrow, depuis l'origine du projet. Tout ce que le
dépôt a construit au-dessus de cette fonction — commission, maturation J+7,
`0043`, l'invariant `0033` — n'a jamais été traversé par une vraie gourde.

*(Le bon côté, qui mérite d'être dit : le RÉCONCILIATEUR, lui, a tourné et a
fait son travail. Les cinq paiements ont été menés proprement à un état
terminal, aucun orphelin. La moitié qui surveille marche ; c'est la moitié qui
confirme qui n'a jamais servi.)*

### La cause la plus probable, et comment la trancher en cinq secondes

`lib/moncash.ts:38` :

```ts
const mode = (process.env.MONCASH_MODE as MonCashMode) ?? "sandbox";
```

Le défaut est **`sandbox`**. Et `OPS_TODO` (registre des identifiants MonCash,
2026-08-10) demande explicitement de poser `MONCASH_MODE=sandbox` dans Vercel,
Production **et** Preview — c'était le bon réglage à l'époque, pour
`docs/05-TEST-SANDBOX.md`.

**Un paiement lancé en mode sandbox part sur
`sandbox.moncashbutton.digicelgroup.com`.** Aucun compte MonCash réel ne peut
l'honorer, et la vérification serveur-à-serveur interroge le même hôte : d'où
un 404, d'où `moncash_unknown_48h`, exactement cinq fois.

> ## ✅ CONFIRMÉ LE 2026-08-21 — c'était bien `sandbox`
>
> **Observation du porteur, en session** : au clic sur « Peye ak MonCash », la
> barre d'adresse affiche `sandbox.moncashbutton.digicelgroup.com`.
>
> L'hypothèse ci-dessous devient un **fait**, et les cinq échecs sont
> expliqués : le rail encaissait en bac à sable, aucun compte MonCash réel ne
> pouvait honorer ces paiements, et la vérification serveur-à-serveur
> interrogeait le même hôte — d'où le 404, cinq fois.
>
> ⚠️ **Ce qui a tranché n'est pas un instrument, c'est un humain devant un
> navigateur.** Aucune ligne en base ne distinguait « mode sandbox » de
> « l'acheteur a renoncé » : `payments.raw` portait le jeton et le motif
> d'expiration, jamais l'hôte demandé. C'est le défaut instrumenté ci-dessous.

⚠️ **CE QUI SUIT ÉTAIT UNE HYPOTHÈSE AU MOMENT DE L'ÉCRIRE, et le texte est
conservé tel quel** — c'est le raisonnement qui a mené à la bonne question,
pas une conclusion. L'agent **ne peut pas lire les variables d'environnement
de Vercel** : la sortie réseau du conteneur est bloquée, et il n'a aucun accès
au tableau de bord. Ce qui était mesuré, c'était le défaut du code et ce que
`OPS_TODO` disait avoir été posé.

### L'instrument qui manquait — posé le 2026-08-21

Le diagnostic a coûté un aller-retour humain pour une information que la base
aurait dû porter. Corrigé : `payments.raw` inscrit désormais, **à la création
du paiement**, le mode et l'hôte réellement utilisés.

```sql
-- Ce qui aurait répondu en dix secondes le 2026-08-11 :
select raw->>'moncash_mode' as mode, raw->>'moncash_host' as hote,
       status, count(*)
  from payments group by 1, 2, 3 order by 4 desc;
```

Deux points qui séparent ce garde d'un vœu, tous deux éprouvés par mutation
(`tests/moncash-mode-journalise.test.ts`) :

* **L'hôte inscrit est tiré de `redirectUrl`**, c'est-à-dire de l'URL
  réellement remise à l'acheteur — pas recalculé depuis l'environnement. Deux
  dérivations peuvent diverger sans que rien ne le dise ; celle-ci ne le peut
  pas. **Mutation passée** : rebrancher `gatewayHost` sur une autre source en
  gardant tout le reste → le test rougit.
* **L'assertion structurelle porte sur la LIAISON**, pas sur la présence du
  mot : elle exige que `mode` vienne de la déstructuration de `createPayment`
  avant d'être inscrit. **Mutation passée** : remplacer `moncash_mode: mode`
  par une constante en dur → le test rougit, alors qu'un `grep` de
  « moncash_mode » serait resté vert.

⚠️ **Cet instrument ne répare rien** — il ne change pas le mode, il le
consigne. Il existe pour que la **prochaine** panne du rail se lise en une
requête au lieu de demander un humain et un navigateur.

**La trancher coûte cinq secondes, et personne n'a besoin d'un agent pour ça.**
Ouvrir la fiche produit, cliquer « Peye ak MonCash », et **lire l'hôte dans la
barre d'adresse** de la page où le navigateur atterrit :

| Ce qu'affiche la barre d'adresse | Verdict |
|---|---|
| `sandbox.moncashbutton.digicelgroup.com/…` | **Mode sandbox** — l'hypothèse est confirmée, aucun paiement réel n'est possible |
| `moncashbutton.digicelgroup.com/…` (sans `sandbox.`) | Mode production — la cause est ailleurs, et il faut chercher |

Ne pas payer : l'hôte suffit, et il se lit avant de saisir quoi que ce soit.

### Le geste qui débloque, et il n'est pas à l'agent

⛔ **`MONCASH_MODE=production` est une variable d'environnement — zone d'arrêt
ferme, explicitement HORS de l'autorisation permanente du 2026-08-17.** Aucun
agent ne la pose. Elle se change dans Vercel, Production, **puis un
redéploiement** (une variable ne prend effet qu'au déploiement suivant).

Et elle ne se change pas seule. Le portail MonCash Business porte trois URLs
(Website / Return / Alert) qui pointent aujourd'hui vers ce qui a servi aux
essais sandbox. **La `Return Url` est la critique** :
`app/api/moncash/return/route.ts` attend `?transactionId=` — une URL de retour
fausse produirait un paiement réellement débité et jamais confirmé, ce qui est
strictement pire que l'échec actuel. → `OPS_TODO`, runbook MonCash, étape 2 bis.

#### ⚠️ Et une troisième chose, que RIEN dans ce dépôt n'enregistre

**Le mode et les identifiants sont deux variables INDÉPENDANTES, et ils doivent
former une paire.** `lib/moncash.ts` choisit l'hôte d'après `MONCASH_MODE` ;
`MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET` viennent de leurs propres
variables et **ne sont contraints par rien**. Le code ne peut pas détecter le
dépareillage : il enverra des identifiants d'un monde à l'hôte de l'autre, et
recevra un refus d'authentification.

Or les deux portails délivrent chacun les leurs — le portail bac à sable
(*business* de test → `Create ClientRestAPI`) et le portail production, dont
le compte a été créé le 2026-08-10.

**Le dépôt ne dit nulle part lesquels sont posés dans Vercel aujourd'hui.**
`docs/11-SECRETS.md` liste les deux noms de variables et rien de plus ; le
runbook d'`OPS_TODO` dit de les poser sans dire d'où ils viennent. Et l'agent
ne peut pas le lire : sortie réseau bloquée, aucun accès au tableau de bord.

Les deux dépareillages possibles, et ce qu'ils produisent :

| `MONCASH_MODE` | Identifiants | Résultat |
|---|---|---|
| `production` | **de bac à sable** | Refus d'authentification sur `/oauth/token`. Aucun paiement ne se crée. |
| `production` | **de production** | ✅ Le seul cas qui encaisse réellement. |
| `sandbox` | de production | Ce qui a peut-être produit les cinq 404 — création acceptée, transaction inconnue de l'hôte interrogé. |

⚠️ **Ne pas conclure de ce tableau que les cinq échecs sont expliqués par le
dépareillage.** Ce qui est CONFIRMÉ, c'est l'hôte bac à sable, lu à la barre
d'adresse. La provenance des identifiants n'a jamais été mesurée — c'est
précisément le trou que ce paragraphe signale.

**Geste, avant de toucher au mode** : ouvrir le portail MonCash Business
**production**, y relever le `client_id`, et le comparer à celui posé dans
Vercel. S'ils diffèrent, ce sont les deux qu'il faut changer, dans le même
déploiement. Trente secondes ; et découvrir le dépareillage après avoir basculé
en production, c'est une sixième tentative qui échoue pour une nouvelle raison,
sur un rail qu'on croit désormais réel.

⚠️ **Le `client_secret` se copie par le bouton *Reveal/Copy*, jamais par une
sélection du champ masqué** — l'incident du caractère `•` est au runbook.

⚠️ **Passer en production, c'est encaisser de l'argent réel.** Le dossier de
rétention (`docs/17`) est ouvert et sans réponse : la première gourde encaissée
est aussi la première gourde retenue sur un compte non cantonné. Elle est de
**300 HTG** et elle est indispensable ; elle n'est pas anodine.

### 🔴 L'ORDRE EXACT — trois consoles, quatre gestes

> Écrit le 2026-08-21. Les éléments étaient déjà tous dans ce document ; ils
> étaient **dispersés**, et l'un d'eux — le `Site URL` de Supabase — n'y
> figurait pas du tout. Cette section ne les répète pas : elle les **ordonne**,
> et dit ce que chaque inversion coûterait.
>
> **Aucun de ces quatre gestes n'est à l'agent.** Variables d'environnement et
> portail fournisseur : zone d'arrêt ferme, explicitement hors de
> l'autorisation permanente du 2026-08-17.

| # | Console | Geste | Nature |
|---|---|---|---|
| **1** | Portail **MonCash Business — production** | **Relever** le `client_id` | lecture seule |
| **2** | **Supabase** → Auth → URL Configuration | Poser `Site URL` (+ liste blanche de redirection) | écriture, effet immédiat |
| **3** | Portail **MonCash Business — production** | Poser les **3 URLs** (Website / **Return** / Alert) | écriture |
| **4** | **Vercel** → Environment Variables | `MONCASH_MODE=production` · `NEXT_PUBLIC_SITE_URL` · les identifiants **si** le geste 1 a révélé un écart — **puis UN SEUL redéploiement** | écriture + déploiement |

#### Pourquoi cet ordre, et ce que chaque inversion coûte

**1 avant 4 — la seule raison est le dépareillage.** Le mode et les
identifiants sont deux variables indépendantes que rien ne contraint à former
une paire (voir le §« troisième chose » ci-dessus). Si le `client_id` de
production diffère de celui posé dans Vercel, il faut changer **les deux dans
le même déploiement**. Basculer le mode d'abord, c'est un redéploiement qui
échoue à l'authentification — **une sixième tentative ratée pour une raison
neuve, sur un rail qu'on croit désormais réel.** Trente secondes de lecture
l'évitent.

**2 avant 4 — parce que ce geste-là ne coûte pas de déploiement.** Le `Site
URL` de Supabase prend effet **immédiatement**, sans redéploiement : le poser
tôt ne gaspille rien, et le poser tard laisse une fenêtre où un vendeur qui
s'inscrit reçoit un lien de confirmation vers `localhost:3000` et croit que
l'inscription a échoué. C'est le seul des quatre gestes dont l'oubli frappe
**les vendeurs** et non les acheteurs — et le chemin vendeur n'est instrumenté
nulle part, donc personne ne le verrait.

**3 avant 4 — et c'est l'ordre le plus coûteux à inverser.** Tant que
`MONCASH_MODE` vaut `sandbox`, une `Return Url` périmée est sans conséquence :
aucun argent réel ne circule. Dès que le mode bascule, une `Return Url` fausse
produit **un paiement réellement débité et jamais confirmé** —
`app/api/moncash/return/route.ts` attend `?transactionId=`. C'est strictement
pire que les cinq échecs actuels, qui n'ont coûté à personne.

**4 en dernier, et en UN seul redéploiement.** C'est le geste qui rend l'argent
réel. Grouper toutes les variables dans un unique déploiement évite les états
intermédiaires — un mode `production` déployé pendant que `NEXT_PUBLIC_SITE_URL`
est encore absente, par exemple.

#### Après le geste 4 : la question se vérifie, elle ne se suppose plus

C'est neuf depuis le 2026-08-21, et c'est ce qui a manqué pendant cinq semaines.
Chaque paiement inscrit désormais **le mode et l'hôte réellement utilisés** dans
`payments.raw` (`app/api/checkout/route.ts`) :

```sql
select raw->>'moncash_mode' as mode,
       raw->>'moncash_host' as hote,
       count(*)
  from payments
 group by 1, 2 order by 3 desc;
```

Les cinq paiements de 2026-08-11→14 n'ont **pas** ces clés : elles n'existaient
pas. Un `null` en tête de liste, c'est l'ancien monde ; toute ligne portant
`production` / `moncashbutton.digicelgroup.com` est postérieure à la bascule.

⚠️ **`moncash_host` est tiré de `new URL(redirectUrl).host`** — donc de l'URL
réellement remise à l'acheteur, jamais recalculée depuis l'environnement. Deux
dérivations peuvent diverger ; celle-ci ne le peut pas. C'est ce qui distingue
« la variable dit production » de « l'acheteur est parti chez production ».

⚠️ **Une valeur malformée ne lève RIEN.** `lib/moncash.ts` fait
`mode === "production" ? … : …` — un `else` binaire. `Production` avec une
majuscule, un espace en fin de champ, une chaîne vide (que le `?? "sandbox"` ne
rattrape pas, une chaîne vide n'étant pas `null`) retombent **silencieusement en
bac à sable**. La cause n'est pas gardée ; seul l'effet est désormais lisible.
**La requête ci-dessus est donc le contrôle, pas la valeur affichée dans
Vercel.**

### Ce que cette commande produira, aux chiffres près

Le catalogue ne porte **qu'un seul produit publié**, et il est parfait pour
cet essai — pas de stock, pas d'expédition, un petit montant :

| | |
|---|---|
| Produit | « cours francisation » — `/produit/cours-francisation-apwpm` |
| Nature | `service` (ni stock ni livraison à gérer) |
| Prix | **300 HTG** |
| Vendeur | Bebeto (`creator`) |
| Image | ❌ **aucune** (`cover_url` est null) — voir l'étape 0 ci-dessous |

**Acheter depuis un SECOND compte**, comme le demande ce document : trois
profils existent, et le bon est **Ruby** (`buyer`) — ni le vendeur, ni le
compte admin.

Chiffres attendus, à comparer un par un après le paiement :

| Grandeur | Valeur attendue | D'où elle vient |
|---|---|---|
| `orders.amount_htg` | **300** | le prix lu en base, jamais du client |
| Commission | **30** | `zabelie_commission_config`, `standard = 1000 bps` |
| Net vendeur | **270** | 300 − 30 |
| `wallet_transactions` | **1 ligne, +270** | de 0 à 1 : l'objectif vérifiable du chantier |
| `wallets.pending_htg` | **270** | escrow non maturé |
| Maturation | **J+7** | `escrow_entries.matures_at` |

⚠️ **D-4 (le sens de l'arrondi) ne mord pas sur cette commande** : 10 % de 300
font **30 exactement**, il n'y a rien à arrondir. La décision est tranchée
depuis le 2026-08-03 (`floor`, `0044` appliquée) et l'essai ne la met donc pas
à l'épreuve — c'est à noter, pour ne pas croire qu'elle l'a été.

### L'objectif vérifiable, en une requête

```sql
select count(*) from wallet_transactions;   -- 0 aujourd'hui, 1 après
```

Pas « ça a marché » : **une ligne, ou rien**.

---

## ⭐ Étape 0 — la première image, avant la première commande

> **Ajouté le 2026-08-11, et ça déplace tout ce qui suit d'un cran.**
>
> ✅ **LEVÉE le 2026-08-14, constatée le 2026-08-21.** `storage.objects` porte
> **1 objet**, écrit le 2026-08-14 à 21:14 dans `product-covers` — la première
> écriture Storage réussie de l'histoire du projet, rendue possible par la
> régénération de `SUPABASE_SERVICE_ROLE_KEY`. Le chemin vendeur est
> **praticable** : ce n'est plus une hypothèse, il y a une ligne en base.
>
> ⚠️ **Mais UN seul objet depuis l'origine, et il n'est attaché à aucune fiche
> publiée** : le seul produit publié du catalogue (« cours francisation ») a
> `cover_url` **null**. Le blocage est levé, le chemin n'est pas fréquenté.
>
> **Ce que ça change pour la première commande : rien ne l'empêche plus.**
> L'étape 0 disait « il n'existe pas encore de produit vendable » — il en
> existe un. La fiche s'affichera sans photo, ce qui est laid et pas bloquant.
> Le vrai blocage a changé de nature et il est décrit en **étape 0 bis**,
> ci-dessus : le mode MonCash.
>
> *(Ce paragraphe est daté et signé plutôt que substitué au texte d'origine —
> celui-ci est conservé tel quel ci-dessous. Un document de chantier qui
> efface ses états successifs perd ce qui fait sa valeur : la trace de ce
> qu'on croyait, et de ce qui l'a corrigé.)*

La suite de ce document dit que le flux digital « est complet en production
depuis longtemps ». **C'était faux, et la mesure l'a montré :**

```
storage.objects   rls_activee = true   policies = 0
objets, tous buckets confondus                  : 0
produits du catalogue avec une image téléversée : 0   (cover_url NULL partout)
```

Tout le stockage passe par service-role, et la clé posée en production n'en est
pas une. **Aucun vendeur n'a jamais pu franchir la première étape** — la photo,
qui vient avant le livrable, avant la revue, avant la publication. Il n'existe
donc pas encore de produit vendable, et la première commande réelle est
impossible tant que ce geste n'est pas fait (`OPS_TODO`, item clé).

**Ce qu'il faut faire de cette image quand elle apparaîtra.** Ce ne sera pas
une vérification de plus : ce sera **la première écriture Storage réussie de
l'histoire du projet**, et donc la ligne en base qui prouve que le chemin
vendeur est praticable — exactement ce que la règle 3 de `CLAUDE.md` exige
avant d'instrumenter quoi que ce soit. Sans elle, tout compteur à zéro sur ce
chemin atteste seulement qu'on n'a rien vu.

→ **Coller la capture d'écran de cette première image ICI, en tête de ce
document, avec sa date et l'identifiant du produit.** Elle est la pièce
d'ouverture : la première commande réelle commence par la première image
réelle.

## Pourquoi maintenant, et pourquoi ça ne dépend de rien

Un seul préalable, et il est **décisionnel, pas technique** : D-4, le sens de
l'arrondi de la commission (voir l'ordre ci-dessous). Il tient au fait que le
registre est append-only. **Ni B2, ni B3, ni le reste des migrations en
attente.** Un produit
**digital ou service** suffit : ce flux est complet en production depuis
longtemps, et il emprunte exactement les mêmes rails que le physique jusqu'au
crédit du vendeur.

Ce qu'une seule commande à 25 HTG éprouve, et qu'aucun test ne peut éprouver :

| Ce qui n'a jamais tourné en production | Pourquoi les tests ne suffisent pas |
|---|---|
| `order_ref` sur une vraie ligne | Le backfill a touché **0 ligne**. Le trigger n'a jamais généré de numéro en production. |
| `zabelie_solvency_report()` sur des données **non nulles** | `ok=true` sur zéro ligne prouve que la fonction s'exécute, pas qu'elle calcule juste (`OPS_TODO`). |
| Maturation d'escrow J+7 | Aucune entrée n'a jamais existé. |
| Webhook MonCash **réel** | Le sandbox n'est pas la production : signatures, délais, reprises. |
| L'identité comptable de `0033` | Elle n'a jamais été vraie sur autre chose que des zéros. |
| `/mes-achats`, e-mails, facture | Jamais rendus avec une vraie commande. |
| **La carte de partage WhatsApp** | Jamais testée. Cache persistant : à vérifier **avant** que des liens circulent. |

## Ordre — les variables d'abord, sinon le cache fige le mauvais aperçu

0. ✅ **D-4 TRANCHÉE le 2026-08-03 : `floor`.** `0044` appliquée en base
   (registre + catalogue vérifiés), `ROUNDING_IN_FORCE` basculée, sonde
   d'arrondi à `accord`. **Sur une vente à 25 HTG le vendeur reçoit 23** —
   c'est le chiffre à retrouver à l'étape 6. Le reste de ce point est
   conservé pour mémoire :

   ~~Trancher D-4~~ — le sens de l'arrondi (`docs/02`). *Facultatif si tu
   préfères vendre d'abord* : un registre append-only accueille un changement
   de règle dans le temps, à condition que chaque ligne dise laquelle l'a
   produite. Rien ne l'enregistre aujourd'hui, donc si tu achètes avant de
   trancher, **note à la main que la ligne n°1 a été produite sous `round`**.
   Trancher avant reste le chemin le plus simple, pas le seul.
   Si la réponse est `round` : **rien à faire**, `0044` reste au dépôt.
   Si la réponse est `floor`, **l'ordre des trois gestes n'est pas neutre** :

   | | Geste | Ce qu'il se passe entre ce geste et le suivant |
   |---|---|---|
   | 1 | Appliquer `0044` en base | La base donne 23, l'app annonce 22. Le vendeur **touche plus** que promis. Sens sûr. |
   | 2 | `ROUNDING_IN_FORCE = "floor"` | — |
   | 3 | Redéployer | Annonce et base s'accordent à nouveau. |

   Dans l'autre ordre, l'intervalle promet 23 et verse 22 : une gourde
   annoncée et non versée, sur chaque vente concernée. C'est la seule
   différence entre les deux ordres, et elle ne coûte rien à respecter.
   Puis inscrire l'empreinte au registre `0041` — c'est aussi ce que lit la
   sonde d'arrondi (`/api/admin/coherence`) pour contredire la constante si
   les deux se désaccordent.
1. **Les quatre gestes de console, dans l'ordre** → §« 🔴 L'ORDRE EXACT »
   ci-dessus. **Ils précèdent tout le reste de cette liste** : sans eux le
   paiement de l'étape 5 part en bac à sable, comme les cinq précédents.

   `NEXT_PUBLIC_SITE_URL` y est le geste 4, groupé avec `MONCASH_MODE` dans un
   unique redéploiement — ne pas la poser séparément, ce serait un déploiement
   de plus pour rien. Sans elle, `lib/site-url.ts` retombe sur le domaine
   `*.vercel.app` et l'aperçu WhatsApp le fige. Facultatif mais souhaitable au
   même moment :
   `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` (vérifier d'abord que les
   transformations d'image sont incluses dans le plan Supabase).
2. **Publier un produit digital ou un service** à petit prix — 25 HTG suffit.
   Par `/vendre`, avec une photo : elle éprouve aussi le bucket `0039` et
   l'affichage des visuels, tout juste branchés.
3. **Ouvrir la fiche et relever son `og:image`** avant tout partage.
4. **S'envoyer le lien sur WhatsApp** — un seul. Attendu : vignette 1200×630
   avec titre et prix, titre portant le nom du produit et son prix.
5. **Acheter depuis un SECOND compte**, avec un vrai paiement MonCash.
   Voir §« Deux pièges connus » ci-dessous — ce point n'est pas neutre.
6. **Relever immédiatement** les contrôles ci-dessous.

## Deux pièges connus — vérifiés dans le code avant l'essai

### 1. Acheter son propre produit : rien ne l'empêche

Avec un seul compte en base, on serait acheteur **et** vendeur. Vérifié :
`app/api/checkout/route.ts` **ne comporte aucune garde** comparant
`product.seller_id` à `user.id`.

Deux conséquences, à ne pas confondre le jour de l'essai :

- **le parcours ne sera pas bloqué** — donc un blocage éventuel serait un
  *vrai* bug, pas la garde attendue ;
- c'est un **vecteur de wash trading confirmé** : un vendeur peut gonfler ses
  propres ventes et ses avis. Sans conséquence tant qu'aucun classement ni
  aucune mise en avant ne s'appuie sur le volume de ventes — raison de plus
  pour que « meilleures ventes / meilleurs vendeurs » reste hors périmètre
  jusqu'à ce que cette garde existe. **À traiter avant toute mise en avant
  fondée sur le volume.**

→ **PRÉREQUIS, pas confort : créer un second compte acheteur.** Ce n'est pas
une commodité de test. Sans lui, **la toute première ligne du grand livre est
une vente de soi à soi-même** — et le registre est **append-only** : elle y
reste pour toujours, elle fausse le premier `zabelie_solvency_report()` non
nul, le premier taux de commission observé, la première maturation, et tout
ce qu'on regardera ensuite en pensant regarder une vraie vente. Il n'existe
pas de « on corrigera après » : la correction elle-même serait une écriture de
plus, pas un effacement.

Bénéfice second, réel mais second : le parcours d'inscription se **chronomètre**
au passage — la mesure du mur d'entrée qu'on n'a jamais pu prendre
(`docs/21` §3 bis).

### 2. L'arrondi de la commission — les chiffres attendus dépendent de D-4

⚠️ **`0044_commission_floor.sql` est écrite et NON APPLIQUÉE, et la décision
elle-même n'est pas prise** (`docs/02`, D-4). Ce n'est pas un oubli
d'exécution : c'est une règle commerciale qui attend l'arbitrage du porteur.

`commission = arrondi(brut × bps / 10000)`, `net = brut − commission`.
**Le registre ne peut pas diverger** dans les deux cas : `net` est défini par
soustraction, donc `commission + net = brut` par construction, quel que soit
l'arrondi. Vérifié sur `0..5000` HTG, aux deux taux : **aucune divergence
entre le calcul SQL et l'oracle TypeScript**.

**Ce qu'il faut attendre sur 25 HTG :**

| | `round` — état actuel de la base | `floor` — si D-4 bascule et `0044` est appliquée |
|---|---|---|
| Commission | **3** | 2 |
| Net vendeur | **22** | 23 |
| Taux réel | 12 % | 8 % |

Relever 23 sans avoir appliqué `0044`, ou 22 après l'avoir appliquée, est un
**vrai signal** : la fonction en base n'est pas celle qu'on croit. C'est le
seul endroit de ce document où deux résultats sont acceptables — vérifier
d'abord dans lequel des deux mondes on teste.

Le taux effectif sur les petits montants, sous la règle **actuelle** :

| Brut | Commission (`round`) | Net | Taux réel |
|---|---|---|---|
| 5 HTG | 1 | 4 | **20 %** |
| 15 HTG | 2 | 13 | 13,3 % |
| **25 HTG** | **3** | **22** | **12 %** |
| 105 HTG | 11 | 94 | 10,5 % |
| 1 500 HTG | 150 | 1 350 | 10,0 % |

**L'annonce suit automatiquement la règle déployée.** La FAQ (`faq.a3`) et
l'estimation vendeur dérivent de `ROUNDING_IN_FORCE` (`lib/commission.ts`),
dans les deux langues : elles disent aujourd'hui « arrondis à la gourde la
plus proche », et basculeront sur « l'arrondi est toujours en votre faveur »
le jour où la constante change. Personne n'a à penser à réécrire un texte.

Depuis le 2026-07-27, le vendeur voit son net **pendant qu'il saisit son
prix** (`components/net-estimate.tsx`, sur les deux formulaires) : « Vous
recevez 22 HTG · commission 3 HTG », suivi de la mention que c'est une
**estimation au prix plein** — un code promo réduit le montant payé, donc
aussi le net. Vérifié dans `0027` : la commission se calcule sur
`orders.amount_htg`, qui est le **prix remisé** figé au checkout. Le 6 %
Elite, lui, a été retiré de la FAQ (V-16) : aucun chemin n'attribue ce palier.

**C'est ce relevé qui vérifie vraiment la constante.** `ROUNDING_IN_FORCE` est
un miroir réglé à la main ; la sonde de `/api/admin/coherence` le confronte au
journal des migrations, mais ce journal est lui aussi tenu à la main. La seule
boucle qui se ferme est celle-ci : **noter le net affiché à la publication,
puis le comparer au net crédité au grand livre après la vente**. Ce sont deux
chemins indépendants — TypeScript à l'écran, SQL dans la transaction — et
c'est la première fois qu'ils peuvent se contredire sur de l'argent réel.

À noter au moment de publier, avant d'oublier :

```
prix saisi : ......... HTG     net affiché : ......... HTG
```

et à comparer, après la vente, au `net_vendeur` de la requête 4 ci-dessous.
Un écart de 1 HTG = la constante et la base ne disent pas la même chose.
Un écart plus grand = un code promo est passé par là (la commission porte sur
le prix **remisé**), ou autre chose, et là il faut chercher.

## Ce qu'il faut relever, tout de suite après

```sql
-- 1. Le numéro lisible existe et respecte le format.
select order_ref, status, amount_htg, created_at from orders order by created_at desc limit 5;
-- Attendu : ZB-YYMMDD-XXXXX, la date du jour, aucun caractère ambigu (0/1/8/B/O/I/L).

-- 2. LE contrôle qui n'a jamais rien prouvé jusqu'ici : le rapport sur des
--    données NON NULLES.
select zabelie_solvency_report();
-- Attendu : ok=true, ecarts=0, du_total_htg = net vendeur de la commande.
-- Un écart ici est un vrai signal — pour la première fois.

-- 3. L'identité comptable de 0033, sur une vraie ligne.
select * from zabelie_wallet_coherence;
-- Attendu : ecart_htg = 0.

-- 4. La commission a-t-elle été prélevée au bon taux ?
select o.order_ref, o.amount_htg as brut,
       (select amount_htg from wallet_transactions
         where idempotency_key = 'order_credit:' || o.id) as net_vendeur,
       e.matures_at, e.status
  from orders o left join escrow_entries e on e.order_id = o.id
 order by o.created_at desc limit 5;
-- Attendu sur 25 HTG sous la règle actuelle (`round`) : net = 22, commission 3.
-- Si 0044 a été appliquée (D-4 → `floor`) : net = 23, commission 2.
-- matures_at = paiement + 7 jours, status 'maturing'.

-- 5. Aucun paiement orphelin (invariant de réconciliation).
select p.status, count(*) from payments p group by p.status;
```

Puis, à **J+7**, vérifier que la maturation a bien basculé `pending_htg` vers
`balance_htg` — c'est le cron `mature_wallets()`, jamais exécuté sur des
données réelles.

## Ce qu'il faut regarder à l'écran, pas seulement en base

- `/mes-achats` côté acheteur : le numéro de commande s'affiche-t-il ?
- Tableau de bord vendeur : la vente apparaît-elle, avec son numéro ?
- Les deux e-mails (acheteur, vendeur) : arrivent-ils, et le numéro y est-il ?
- La facture, le téléchargement du fichier si c'est un produit digital.
- **Le parcours d'inscription lui-même** : combien d'écrans, combien de
  champs, combien de temps sur un téléphone d'entrée de gamme. C'est la
  mesure du « mur à l'entrée » (`docs/21` §3 bis) — la seule qui vaille,
  puisque personne ne l'a encore franchi.

## Ce que ça règle, et ce que ça ne règle pas

**Règle** : les sept lignes du tableau du haut cessent d'être « non éprouvé ».
`OPS_TODO` porte trois contrôles marqués comme tels ; cette commande les
transforme en contrôles réels.

**Ne règle pas** : le physique (B2 + B3 restent requis), le canal de
notification, le checkout invité. Mais elle donne le seul retour que ces
décisions n'ont pas encore — à quoi ressemble le flux quand il porte de
l'argent.

## Le risque, dit franchement

Un vrai paiement MonCash de 25 HTG, sur le compte marchand, avec commission
prélevée et net vendeur inscrit au registre. Si quelque chose casse, c'est
**25 gourdes** et une ligne à corriger par écriture compensatoire — jamais
par modification du grand livre (règle du dépôt). C'est le coût le plus bas
auquel on saura si tout ce qui précède fonctionne.
