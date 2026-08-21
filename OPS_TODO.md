# OPS_TODO — Zabelie

Actions opérationnelles côté porteur (aucune n'est du code). Les écarts de
réconciliation topup détectés par le cron doivent aussi être consignés ici.

## 🔴 PV — écriture en production du 2026-08-15 (dépublication)

**Signal porteur** : « Sur la dépublication : oui, sans hésiter. »

```sql
update products set status = 'draft'
 where slug = 'cours-du-creole-dt0ps' and kind = 'fichier'
   and not exists (select 1 from product_assets a where a.product_id = products.id);
-- 1 ligne. Sonde après : fichiers_publiés_sans_livrable = 0.
```

Ce produit était **en vente à 1 200 HTG depuis le 2026-08-11 sans aucun
livrable**. Un acheteur aurait payé et reçu un 404. Aucune commande payée
n'existe à ce jour (1 en attente, 4 annulées, **zéro payée depuis l'origine**),
donc personne n'a été lésé — l'exposition, elle, était ouverte depuis quatre
jours.

⚠️ **Ce n'était pas un trou dans le code.** La porte de
`/api/admin/product-status` refuse bien de publier un fichier à zéro livrable,
et elle a été posée le 2026-08-11 en réponse à ce cas précis. **La ligne déjà
passée n'a jamais été rattrapée.** Poser un filet ne répare pas ce qui est
tombé avant lui — et rien, dans le dépôt, ne croisait l'état de la production
avec les gardes qu'on venait d'y ajouter.

### Le défaut structurel trouvé en cherchant la cause

`/api/products/asset` annonçait **50 Mo** tout en recevant le fichier en
`multipart` — c'est-à-dire à travers la fonction serverless, que
`docs/35` §V1-B déclare explicitement incapable de les porter. La galerie
vidéo avait été construite en deux temps (lien signé + téléversement direct)
pour cette raison exacte ; **le chemin du livrable n'a jamais reçu la même
conclusion.**

Le pire n'est pas l'échec, c'est sa forme : au-delà de la limite, la requête
est refusée **avant** que la fonction s'exécute. Aucun garde ne tourne, rien
ne journalise, le vendeur voit un échec sans cause. C'est « l'absence de
signal » dans sa version la plus coûteuse — trois créations du même produit en
vingt et une secondes le 2026-08-11 à 01:46, puis l'abandon, et pas une ligne
pour le dire.

Corrigé : protocole en deux temps, taille lue **au stockage** (jamais annoncée
par le client), objet retiré si hors contrat. Le chemin dépend désormais d'un
UUID et non du nom du fichier — BL-138 (C-12) disparaît au passage.

⚠️ **Ce que ça ne prouve pas** : que le chemin fonctionne. Les octets ne
transitent plus par la fonction — c'est une propriété du code, vérifiée par
mutation. **Un vrai PDF déposé depuis un vrai téléphone reste à faire**, et
c'est la seule preuve qui compte. `product-files` porte toujours **zéro
objet** ; le catalogue n'a **aucun** produit `fichier` livrable.

### Ce qui n'est PAS fait, et ne peut pas l'être d'ici

La re-livraison de « cours du créole » demande **le fichier du vendeur**.
Attacher un PDF de substitution et republier mettrait en vente un livrable
inventé — le défaut qu'on vient de fermer, retourné. Le vendeur doit redéposer
lui-même ; le produit l'attend en brouillon.

## ⏳ Registre des décisions en attente — `docs/25` §4.1

> **Relu à l'ouverture de chaque chantier, avant de choisir quoi construire.**
> La troisième colonne est la seule qui compte : une décision qui bloque six
> branches et une qui bloque un libellé n'ont pas le même poids, et sans la
> trace rien ne les distingue. Ce tableau est un **index** — le détail de
> chaque ligne est plus bas dans ce fichier, et c'est lui qui fait foi.
>
> Ne figure ici que ce qui attend une DÉCISION. La panne d'inscription
> ci-dessous n'en est pas une : c'est un défaut, et il passe devant.
>
> ⚠️ **CE QUI RESTE À APPLIQUER NE SE LIT PLUS DANS CE TABLEAU — ça s'interroge.**
> Mesuré le **2026-08-21**, une ligne pour chacun des **86 fichiers** :
>
> ```sql
> select filename, statut, preuve from zabelie_schema_migrations
>  where statut <> 'appliquee' order by filename;
> ```
>
> Réponse ce jour-là, et c'est **tout** : `0031` `abandonnee` (fidélité,
> volontairement sautée) · ~~`0051` `redigee`~~ **appliquée le 2026-08-21** ·
> `0056` `redigee`. **Deux lignes**, dont une gelée exprès.
>
> Quatre entrées de ce tableau demandaient d'appliquer une migration **déjà
> appliquée** — `0052`, `0053`, `0054`, `0083`. L'une d'elles portait « vérifié
> en base le 2026-08-09 », ce qui était vrai ce jour-là et faux les douze
> suivants. Un registre qui vieillit sans se contredire devient une consigne
> de refaire ce qui est fait. Corrigées ci-dessous ; la requête reste la source.
>
> ⚠️ **ET IL EN RESTAIT SIX, D'UNE FORME PLUS RETORSE — corrigées le
> 2026-08-21.** `0073`, `0075`, `0076`, `0077`, `0078` et `0079` ne
> *manquaient* pas l'information : leur troisième colonne portait déjà
> « ✅ APPLIQUÉE », avec la date, le journal et le `sha256`. **C'est leur
> PREMIÈRE colonne qui disait encore « Appliquer … rédigée, non appliquée ».**
>
> La ligne se contredisait donc elle-même — et la contradiction se tranchait
> toujours du mauvais côté, parce qu'un index se **survole** : on lit le titre,
> pas le troisième paragraphe d'une cellule de mille caractères. Le défaut
> n'était pas l'absence de preuve, c'était son **enfouissement sous un titre
> qui la démentait**.
>
> Règle qui en découle : **le titre d'une ligne porte l'état, le corps porte le
> détail.** Un titre qui commence par un verbe d'action décrit un geste À FAIRE ;
> dès que le geste est fait, c'est le TITRE qui change, pas seulement le corps.
>
> `0079` est le cas qui montre pourquoi une coche n'aurait pas suffi : la
> migration est appliquée, mais la ligne a toujours sa place ici — il reste à
> **armer** `requis_pour_retrait` et à **trancher la durée de rétention** des
> pièces d'identité. Son titre nomme désormais ces deux décisions au lieu d'un
> geste accompli.
>
> Vérification faite dans les deux sens, jamais sur le registre seul : `0077` et
> `0078` **ne créent aucun objet** — ce sont des migrations de DONNÉES, et
> `to_regclass` aurait rendu « absent » pour deux migrations parfaitement
> appliquées. Sondées sur leurs données (seed de niveau 3, slug
> `sak-de-vwayaj`). C'est le piège `0043`/`zabelie_shipments` de `CLAUDE.md`,
> évité une fois de plus parce qu'on a croisé la LISTE des objets de chaque
> fichier avec la base, au lieu d'un nom retenu de mémoire.

| Décision | Depuis | Ce qu'elle bloque |
|---|---|---|
| 🔴 **`MONCASH_MODE=production` + les 3 URLs du portail MonCash** — ⛔ **zone d'arrêt ferme, hors autorisation permanente** (variable d'environnement). ✅ **CAUSE CONFIRMÉE le 2026-08-21 par le porteur** : la barre d'adresse affiche `sandbox.moncashbutton.digicelgroup.com` au clic sur « Peye ak MonCash ». Les cinq paiements `failed` du 11 au 14 août (`moncash_unknown_48h`, MonCash répond 404) sont expliqués : **le rail encaisse en bac à sable**, aucun compte réel ne peut l'honorer. Ce n'est plus une hypothèse. Le changement exige un **redéploiement**, et la `Return Url` du portail doit suivre (une URL de retour fausse = un paiement réellement débité et jamais confirmé, pire que l'échec actuel). ⚠️ **Et une troisième chose que rien n'enregistre** : `MONCASH_MODE` et `MONCASH_CLIENT_ID`/`SECRET` sont des variables **indépendantes** qui doivent former une paire — les portails bac à sable et production délivrent chacun les leurs, et le code ne peut pas détecter le dépareillage (il enverra les identifiants d'un monde à l'hôte de l'autre → refus d'authentification). Le dépôt ne dit nulle part lesquels sont posés dans Vercel, et l'agent ne peut pas le lire. **Relever le `client_id` du portail production et le comparer à celui de Vercel AVANT de toucher au mode** — trente secondes, et le découvrir après la bascule, c'est une sixième tentative qui échoue pour une raison neuve. → `docs/22` étape 0 bis. ⚠️ Encaisser réellement, c'est aussi **retenir** réellement : `docs/17` est ouvert. → `docs/22` étape 0 bis. | 2026-08-21 | **La première commande réelle** (`docs/22`) — donc TOUT ce que le dépôt a bâti au-dessus de `confirm_payment` : commission, escrow J+7, `0043`, invariant `0033`. **Cette fonction n'a jamais tourné une seule fois en production** : 0 écriture au grand livre, 0 portefeuille, 0 escrow. Bloque aussi `docs/27` étape 3 (paiement groupé), qui ventilerait vers elle. |
| ✅ ~~**Appliquer `0083` (adresse publique de boutique)**~~ — **APPLIQUÉE le 2026-08-17 20:32:31Z**, `preuve = journal_supabase`, constaté au registre le 2026-08-21. La ligne annonçait « rédigée, NON appliquée » quatre jours après son application. | 2026-08-17 | Résolu. Le lien que le vendeur partage sur WhatsApp est `zabelie.com/boutik/mari-jakmel` au lieu d'un UUID. |
| 🎨 **Le hero de l'accueil reste un grand panneau orange** — *reporté sur signal porteur (« laisse le hero on le corrige après »), 2026-08-17.* Dans la référence de design retenue, **aucune grande surface n'est colorée** : l'accent est réservé à un bouton. Le passer en carte sombre avec un seul CTA orange l'alignerait exactement. ⚠️ **Zone d'arrêt** : c'est la porte d'entrée de la marque, donc du **positionnement** (§4 de `docs/25`) — l'agent ne tranche pas. Le reste de la palette est déjà resserré et tenu par `tests/palette-resserree.test.ts` ; ce panneau est la dernière déviation connue. | 2026-08-17 | Rien techniquement — le site est cohérent sans. C'est un choix d'identité, pas un défaut. |
| 🎨 **Trois styles pour le même bouton d'envoi** — `components/search-box.tsx:67` rend la recherche en `bg-brand` (orange), `app/catalogue/page.tsx:194` la même action en `bg-cloud` (crème), et `app/catalogue/page.tsx:258` un filtre secondaire en contour. Le contour est légitime (action secondaire) ; les **deux premiers sont la même action rendue différemment**, ce que la checklist UI interdit. Recommandation : `bg-brand` devient le style primaire UNIQUE. ⚠️ À vérifier à l'écran avant de trancher — la page catalogue afficherait alors **deux** boutons orange (barre + page), ce qui est peut-être la raison d'origine du crème. Correction d'une ligne, décision d'une minute. | 2026-08-17 | Rien. Cohérence visuelle. |
| 🔧 **Supabase → Settings → API : `db_aggregates_enabled` est-il actif ?** — 30 secondes dans le tableau de bord. **Non vérifiable depuis une session d'agent** : le réglage ne figure pas dans `pg_db_role_setting` (Supabase l'applique à la configuration du conteneur PostgREST, pas en base — mesuré le 2026-08-16), et l'egress de session est fermé, donc l'unique test décisif (une vraie requête REST `select("amount_htg.sum()")`) est hors d'atteinte. | 2026-08-16 | Le sort de `lib/somme-htg.ts`. **S'il est ACTIF** : l'agrégat PostgREST rend les mêmes totaux en UNE requête, sans migration — le parcours par lots (50 allers-retours séquentiels par rendu de tableau de bord vendeur, payés à chaque visite) devient une complexité évitable, à retirer. **S'il est INACTIF** : le choix par lots est le bon et le repli « ≥ » est la bonne dégradation. ⚠️ Dans les deux cas le module reste un **pis-aller** : la vraie réponse est un **solde matérialisé** dérivé du grand livre append-only — le total cesse d'être recalculé pour devenir maintenu — à écrire quand une fenêtre de migration s'ouvre. |
| 🔧 **Console Supabase, deux gestes indépendants de tout le reste** — (1) ouvrir à la main une URL `…/storage/v1/render/image/public/product-covers/<obj>?width=640` : si elle répond, les transformations sont dans le plan et `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` fait passer les lectures de 2 241 Ko à ~40 Ko. ⚠️ **Ne pas poser le flag pour tester** — il est inliné au build, et sur un endpoint en erreur il ferait DISPARAÎTRE la seule photo du catalogue (l'en-tête de `lib/product-image.ts` le documente). Preview avant Production. ~~(2) poser une `file_size_limit` sur les trois buckets~~ — ✅ **FAIT le 2026-08-16 par l'agent via le MCP Supabase**, sur le signal porteur « utiliser le MCP Supabase pour pouvoir le débloqué » (répété deux fois dans la session). Écriture de production : `update storage.buckets set file_size_limit = …` sur `product-covers` = **1 536 000** (= `COVER_MAX_OCTETS`), `product-files` = **52 428 800** (= `MAX_BYTES` de la route livrable), `kyc-documents` = **5 242 880** (= `KYC_MAX_BYTES`) ; valeurs relues et croisées à l'attendu dans la même requête, `conforme = true` sur les trois. Retour arrière : `update storage.buckets set file_size_limit = null where id in ('product-covers','product-files','kyc-documents');`. ⚠️ **L'APPLICATION du plafond n'est pas éprouvée** — la valeur est posée dans la table que lit `storage-api`, mais aucun téléversement hors-borne n'a été tenté depuis cette session (l'egress y est fermé). Le connu-négatif reste à faire : pousser un fichier de 60 Mo sur `product-files` et lire le refus. | 2026-08-15 | Le périmètre du reste du chantier images : si les transformations répondent, `next/image` + `sizes` + blur en sortent ; sinon ils y entrent. |
| ✅ ~~**Appliquer `0080` / `0081` / `0082`**~~ — **FAIT le 2026-08-17**, sur le signal porteur « Appliquer 0080 / 0081 / 0082 », appliquées par l'agent via le MCP Supabase. Les trois inscrites au registre `statut = appliquee`, `preuve = journal_supabase` — et cette preuve est la plus forte possible : le **md5 brut du SQL reçu par la base est identique à celui du fichier du dépôt**, octet pour octet, croisé un par un (`06cd1828…` · `abd70744…` · `64812cbb…`). Le garde d'origine de `0081` est passé (le `confirm_payment` de prod portait bien la branche stock de `0038` et pas encore l'affiliation) ; les post-conditions des trois ont passé ; l'invariant `0033` est vrai (0 wallet hors invariant) ; les 7 tables, 3 fonctions et 3 triggers sont croisés présents ; et le garde de rejeu **refuse** désormais les trois (sonde exécutée). ⚠️ **L'affiliation reste DORMANTE** (`actif = false`) : l'armer est un geste distinct, qui viendra avec son UI. Reste ouvert ci-dessous : `0067`. | 2026-08-15 | Résolu. Flash disponible dès la première offre vendeur ; affiliation invisible jusqu'à armement ; points de retrait dès le premier point ouvert. |
| ✅ ~~**`0067_garde_observation.sql` n'est NI appliquée NI inscrite**~~ — **APPLIQUÉE le 2026-08-17** sur le signal porteur « applique 0067 ». `preuve = journal_supabase`, md5 brut du SQL reçu = md5 du fichier (`94ca493a…`). Ses post-conditions ont passé, et elles s'éprouvent elles-mêmes : elles FABRIQUENT leur cas — une ligne de registre `appliquee` créée puis supprimée — plutôt que de dépendre d'un état ambiant. **Le registre porte désormais 82 lignes pour 82 fichiers.** Le carnet `zabelie_garde_observations` est vide et le restera jusqu'à la prochaine migration : `0067` n'a pas pu s'observer elle-même (son garde de tête a tourné sous la version `0065`, avant la réécriture). La première mesure réelle viendra avec `0083`. *Détail du diagnostic conservé ci-dessous.* | 2026-08-17 | Résolu. |
| ~~⚠️ **`0067_garde_observation.sql` n'est NI appliquée NI inscrite au registre**~~ — *diagnostic d'origine, conservé.* Trouvé le 2026-08-17 en préparant les trois ci-dessus. Le registre est censé être COMPLET depuis `0063` (un fichier, une ligne) : `0067` n'a **aucune ligne**, et c'est le seul fichier dans ce cas (81 lignes pour 82 fichiers). ⚠️ **Le piège a failli fonctionner** : le corps déployé de `zabelie_migration_garde` porte un bloc « OBSERVATION SANS ACTION », ce qui se lit comme « 0067 appliquée ». C'est le bloc de `0065`. La table `zabelie_garde_observations` que `0067` crée **n'existe pas** — croiser la LISTE des objets, jamais un commentaire retenu de mémoire. Deux gestes, à votre signal : inscrire la ligne `redigee`/`non_appliquee`, et appliquer `0067` **avant** la prochaine migration si l'on veut qu'elle observe quelque chose (elle n'a rien pu observer des trois d'aujourd'hui). | 2026-08-17 | Le registre n'est pas complet, donc `select … from zabelie_schema_migrations` ne répond pas encore pour tout. |
| ~~**Appliquer `0080` (ventes flash) / `0081` (affiliation, DORMANTE) / `0082` (points de retrait)**~~ — *ligne d'origine, conservée pour le détail technique.* Les trois rédigées, éprouvées par la CI, **non appliquées**. Les bornes flash (24 h · 10–70 % · 3 offres) et les taux affiliation (5–40 %) sont des DÉFAUTS en config, modifiables par UPDATE avant ou après application. ⚠️ `0081` réécrit `confirm_payment` + `refund_order` : le corps de PROD a été lu avant (md5 `67b2603a…` / `f2fb8e88…`), garde d'application qui refuse un corps inattendu, post-condition qui croise stock+coupon+USD+affiliation. L'affiliation reste dormante après application (`actif=false`) — l'armer est un geste distinct, avec son UI. | 2026-08-15 | Rien à l'écran avant application ; après : flash dès la première offre vendeur, affiliation seulement après armement, points de retrait dès le premier point ouvert. |
| ✅ ~~Affiliation — qui paie~~ — **tranché par le signal « implémente tout ce qui manque » : option B construite** (le vendeur choisit, produit par produit — le consentement règle D-6). Reste au porteur : l'ARMEMENT (`update zabelie_affiliate_config set actif = true`), qui viendra avec l'UI. | 2026-08-15 | Plus rien côté code. |
| ✅ ~~Branche de Production Vercel~~ — **RÉPONDU 2026-08-03 : `main`.** Dernier déploiement Production `bb5ee4a`, **2026-07-26**, soit la tête actuelle de `main` : le site en ligne est exactement `main`, sans décalage. | — | **Résolu — et c'est le pire des trois cas.** Le site public dit depuis le 26 juillet « Pièces auto et moto, livrées en Haïti », « digital & talents » et **« Instant »**, en 2 langues. Remplacée par la ligne suivante. |
| ✅ ~~🚨🚨 `SUPABASE_SERVICE_ROLE_KEY`~~ — **RÉSOLU le 2026-08-14 21:14:26Z, par le porteur.** Clé régénérée chez Supabase (l'exposée du 2026-08-04 est morte), posée dans Vercel Production+Preview via Reveal/Copy, redéployée. Preuve mesurée en base : **premier objet jamais écrit dans `storage.objects`** (bucket `product-covers`), premier `cover_url` non nul, brouillon physique créé — le parcours vendeur bloqué depuis l'origine est praticable. Détail du diagnostic de séance : le premier essai a rendu « Création échouée » sur un 409 de compatibilité en double (données du formulaire), PAS sur la clé — les journaux Supabase montraient déjà les 201 service-role. Débloqué d'un coup : TRV-01 (téléversement), couvertures catalogue, livrable du « cours du créole », gate photo PHY-01 (désormais fusionnable), prérequis P-0.1 du chantier Entèlijan. | 2026-08-04 | **RECLASSÉ le 2026-08-11 : ce n'était pas un item de sécurité en attente, c'est LE blocage du catalogue digital, et il précède `docs/22`.** Mesuré en base : `storage.objects` et `storage.buckets` ont `rls_activee = true` et **zéro policy** — donc TOUT passe par service-role, lecture comme écriture, pour tous les kinds. Corroboré : **0 objet dans tous les buckets**, couvertures comprises. Aucune écriture de stockage n'a jamais réussi depuis l'application. Conséquences : aucun vendeur ne peut attacher un livrable (le kind `fichier` est structurellement invendable), ni téléverser une image de couverture. Un vendeur qui essaie sur un BROUILLON lit « Produit introuvable » — la policy `products_seller_read_own` exige `auth.uid()`, qu'un client dégradé n'a pas ; sur un PUBLIÉ, la lecture passe (`products_public_read_published`) et l'échec se déplace au stockage, en message brut de RLS. Trace réelle : trois brouillons de « cours du créole », trois abandons, zéro fichier. ⚠️ L'ancienne estimation — « rien fonctionnellement, le site tourne parfaitement » — décrivait l'absence de symptôme OBSERVÉ, pas l'absence de symptôme : le chemin acheteur est instrumenté, le chemin vendeur ne l'est pas, donc ses échecs ne remontent nulle part. À révoquer chez Supabase et remplacer dans Vercel (Production **et** Preview), puis **retenter un téléversement et lire le message** — il date la panne. |
| ✅ ~~Faire arriver le chantier en ligne~~ — **FAIT 2026-08-03.** PR #55 fusionnée (`53fd939`), puis #56 · #57 · #58 · #59. `main` déployée en Production. | — | Résolu. Le site ne dit plus « Pièces auto et moto » ni « Instant », et porte quatre langues. |
| ✅ ~~Branche par défaut GitHub~~ — **FAIT 2026-08-03**, réglée sur `main`. | — | Résolu. |
| ✅ ~~Protection de `main`~~ — **FAIT 2026-08-03.** `build` · `e2e` · `sql-tests` exigés. | — | Résolu. ⚠️ Le premier réglage visait **toutes** les branches et bloquait toute poussée — les contrôles s'exécutant AU push, aucune branche ne pouvait naître (`GH013`). Corrigé pour ne viser que la branche par défaut. À savoir si la règle est un jour recréée. |
| ✅ ~~D-4 — sens de l'arrondi~~ — **CLOSE le 2026-08-03 : `floor`.** `0044` appliquée en base et au registre, PR #61 fusionnée, sonde à `accord`. Vérifié en base : 25 HTG → commission 2, net vendeur 23 ; les deux copies de la règle appellent le helper unique. | — | Résolu. La première vente réelle n'a plus de préalable décisionnel. |
| ✅ ~~Signature datée du réexamen `sharp`~~ — **SIGNÉE 2026-08-03, réexamen au 2026-11-03.** | — | Résolu. Deux événements rouvrent le dossier, le premier qui arrive gagne : la date, ou le premier téléversement vendeur. |
| **🔴 `Site URL` Supabase + `NEXT_PUBLIC_SITE_URL` Vercel** | 2026-08-04 | **La première commande réelle.** Le lien de confirmation renvoie vers `localhost:3000` — un vendeur qui s'inscrit croit que ça a échoué. Et sans `NEXT_PUBLIC_SITE_URL`, l'aperçu WhatsApp fige le mauvais domaine, avec un cache persistant : à poser **avant** tout partage. |
| ✅ ~~**Appliquer `0051` (clairin)**~~ — **APPLIQUÉE le 2026-08-21 22:55:07Z**, `preuve = journal_supabase`, sur signal direct « applique 0051 ». Post-conditions : **K1** une seule ligne `klerin` (ni zéro — le piège de l'`insert … select` qui n'insère rien en silence — ni deux) · **K2** rattachée à `pwodwi-lokal`, niveau 3 · **K3** **INACTIVE** · **K4** connu-négatif du rejeu : réappliquer avec `active = true` ne crée pas de doublon **et ne réactive pas** le rayon. Mesuré après : 589 catégories, **45 actives au niveau 3 — inchangé**. ⚠️ **Ce que l'application n'a PAS fait** : ouvrir le rayon. Le clairin est un spiritueux, Zabelie ne vérifie pas l'âge et ne livre pas ; le contrôle a lieu à la remise, en main propre, et il appartient au vendeur. **L'ouverture reste un second geste, délibérément séparé** — c'est lui qui engage. ⚠️ **En-tête de la migration périmé, corrigé ici** : il affirmait « `zabelie_policy_acceptances` est vide ». Mesuré à l'application : **une** acceptation, en **`v2`** (2026-08-11 01:46:34Z) — donc la version qui contient déjà la section « Alcool », et `POLICY_VERSION = "v2"` est déjà dans le code déployé. La conclusion de l'en-tête tient, sa prémisse non. | 2026-08-01 | Résolu côté base. Le rayon produits locaux existe, invisible. **Reste une décision, pas un geste technique** : ouvrir ou non le rayon — `update zabelie_categories set active = true where slug in ('klerin','pwodwi-lokal', …)`. C'est une zone d'arrêt (positionnement + engagement produit), pas une application de migration. |
| ✅ ~~**Appliquer `0053` (rétention 90 j)**~~ — **appliquée**, constaté au registre le 2026-08-21. | 2026-08-03 | Résolu. La conservation des termes de recherche en clair est bornée. |
| **Poser `NEXT_PUBLIC_WHATSAPP_NUMBER=50937376615`** (Vercel, Production + Preview) | 2026-08-06 | Toutes les surfaces WhatsApp de la landing v2 (topbar, rail d'accueil, /aide) — masquées tant que la variable est absente. Numéro fourni par le porteur en session ; variable NEXT_PUBLIC → **redéploiement requis** après pose (valeur inlinée au build). |
| ✅ ~~**Appliquer `0075` (rabais — V-4 de `docs/35`)**~~ — **APPLIQUÉE le 2026-08-15 03:48:13Z**, `preuve = journal_supabase`. **Recroisée contre la base le 2026-08-21** : `zabelie_set_discount` et `zabelie_clear_discount` présentes. Éprouvée par la CI (D1–D5 : barré = prix pratiqué, origine conservée, variante unique synchrone, refus multi-variantes, contrainte tenue même en SQL direct) | 2026-08-15 | Les rabais vendeur : sans elle, tout est dormant (aucune surface, route 503). Le vendeur ne saisit QUE le nouveau prix ; le barré est posé par la base depuis le prix réellement pratiqué — le « barré gonflé » est structurellement impossible. ✅ APPLIQUÉE le 2026-08-15 03:48:00Z (journal 20260815034800, sha256 c54d572e…) sur signal « applique 0075 et lance V-5 » — transmise sans commentaires d'en-tête (SQL identique, le cas couvert par le hash canonique), registre à 74. Les rabais sont vivants. |
| ✅ ~~**Appliquer `0076` (coordonnées de livraison — V-5 de `docs/35`)**~~ — **APPLIQUÉE le 2026-08-15 04:01:48Z**, `preuve = journal_supabase`. **Recroisée contre la base le 2026-08-21** : `zabelie_delivery_info` présente. Éprouvée par la CI (L1–L3 : own-row, lecture vendeur UNIQUEMENT sur commande payée, fenêtre refermée après livraison, écriture own-row seule) | 2026-08-15 | Nom/téléphone/adresse de l'acheteur : table SÉPARÉE de `profiles` (qui est en lecture publique — une adresse n'y aurait rien à faire) ; la règle « visible au moment d'envoyer » est encodée dans la RLS, pas dans une bonne intention. Sans 0076 : formulaire masqué, route 503. Politique de confidentialité déjà mise à jour ×4 langues dans la même PR. ✅ APPLIQUÉE le 2026-08-15 04:01:40Z (journal 20260815040140, sha256 a8d9b57a…, 4 policies vérifiées, registre à 75) sur signal « applique 0076 ». Le formulaire de livraison et la vue vendeur sont vivants. |
| ✅ ~~**Appliquer `0077` (taxonomie niveau 3 — V-3 de `docs/35`)**~~ — **APPLIQUÉE le 2026-08-15 12:50:38Z**, `preuve = journal_supabase`. **Recroisée contre la base le 2026-08-21** : elle ne crée **aucun objet**, c'est une migration de DONNÉES — sondée sur son seed (catégories de niveau 3 présentes ; mesuré ce jour-là : **498 au niveau 3, 45 actives**, tous seeds confondus). La sonder par `to_regclass` aurait rendu « absent » pour une migration parfaitement appliquée. 468 sous-catégories, TOUTES inactives (arbitrage porteur 2026-08-15 : « tout seeder, activer par vagues ») ; l'ouverture d'un rayon devient un `UPDATE ... set active = true`, sans migration. KR/EN best-effort agent, relecture native en attente (registre). Post-conditions : plancher 450, zéro activation. ✅ APPLIQUÉE le 2026-08-15 12:50:20Z (journal 20260815125020, sha256 2ea49531…, registre à 76). Mesuré : 452 lignes insérées sur 468 semées, 45 actives INCHANGÉES (vague 1 intacte), 0 orpheline, 73/74 rayons couverts — le 74e (`rechaj-telefon`) est l'exclusion volontaire du catalogue Reloadly. ⚠️ Une ligne perdue en silence, voir la ligne 0078 ci-dessous. | 2026-08-15 | Rien à l'écran tant qu'un rayon n'est pas activé — le seed dort, exactement comme docs/16 le voulait. |
| ✅ ~~**Appliquer `0078` (réparation d'une ligne perdue par `0077`)**~~ — **APPLIQUÉE le 2026-08-15 13:04:23Z**, `preuve = journal_supabase`. **Recroisée contre la base le 2026-08-21** : migration de DONNÉES elle aussi — sondée sur la ligne qu'elle répare, `slug = 'sak-de-vwayaj'` au niveau 3, **présente** | 2026-08-15 | « Sacs de voyage » manque sous « Bagagerie » : son slug `sak-vwayaj` était déjà celui de son parent de niveau 2, et le slug est unique sur toute la table — ligne avalée par `on conflict`, sans erreur ni trace. Aucun impact utilisateur aujourd'hui (le rayon est dormant). La réparation la recrée sous `sak-de-vwayaj`, inactive. L'angle mort du contrôle est fermé (`tests/taxonomie-seed.test.ts` croise désormais les slugs du seed avec ceux des niveaux 1 et 2, exemption datée périmable dans les deux sens, éprouvée par deux mutations). ✅ APPLIQUÉE le 2026-08-15 13:04:10Z (journal 20260815130410, sha256 293bf42c…, registre à 77). Sondes : « Bagagerie » a bien 4 sous-catégories, la ligne réparée est INACTIVE, 45 actives inchangées, niveau 3 à 498. **Compte du déficit bouclé mécaniquement** : 468 semées − 452 insérées = 16 = 13 collisions de concept avec `0035` + 2 avec `0057` (services) + 1 de niveau (réparée). Aucune ligne perdue sans explication. |
| 🔴 **KYC vendeur — ARMER le blocage, et trancher la DURÉE DE RÉTENTION** *(la migration, elle, est faite)* — ~~Appliquer `0079` (V-6 de `docs/35`)~~ ✅ **APPLIQUÉE le 2026-08-15 13:35:15Z** (sha256 626e3486…, registre à 78, `applied_by` renseigné). Signal porteur : « **0079** », réponse directe à la ligne « applique 0079 ». ⚠️ **Le geste (1) est fait, le geste (2) reste entier** : à l'application le blocage est **DORMANT** — mesuré, `requis_pour_retrait = false`, et **aucun vendeur n'est coupé**. Reste : `update zabelie_kyc_config set requis_pour_retrait = true` pour l'armer, **quand les vendeurs auront eu le temps de se faire vérifier** (armer le jour de l'application couperait la voie de sortie de tout le monde). 🔴 **Arbitrage restant : la DURÉE DE RÉTENTION des pièces d'identité** — défaut prudent 90 jours après décision, en table de config ; à confirmer ou changer par `UPDATE`, ce sont des données ultra-sensibles. **La politique de confidentialité décrit désormais cette collecte** (§9 « Pièces d'identité », quatre langues, 2026-08-15) : ce qu'on demande, qui le voit, le stockage privé, le lien signé de cinq minutes, et le fait qu'aucun achat ni aucune publication ne l'exige. ⚠️ **La DURÉE y est un blanc visible** (`{retentionKyc}`, cinquième marqueur `[À COMPLÉTER]`), délibérément : `zabelie_kyc_config.retention_jours` porte un défaut technique de 90 jours, mais une obligation de vigilance anti-blanchiment peut imposer une durée **minimale** de conservation — donc plus longue, pas plus courte. Recopier le 90 d'aujourd'hui publierait un engagement qu'un conseil peut inverser. **Dossier d'arbitrage prêt : `docs/36-DOSSIER-RETENTION-KYC.md`** (2026-08-15) — état du dépôt avec `file:line`, comparatif sourcé GAFI/RGPD, trois questions pour HDIT / Cabinet Volmar. ⚠️ **Il retourne le cadrage** : 90 jours est probablement faux dans les DEUX branches. Si Zabelie est assujettie LBA/FT, le GAFI R.11 impose **cinq ans après la fin de la relation** — 90 j est ~20× trop court. Si elle ne l'est pas, la doctrine CNIL dit de supprimer la pièce **dès l'identité vérifiée** — 90 j devient une conservation « au cas où ». Une seule question commande les deux : l'assujettissement. ✅ **Le trou CGU est comblé** (2026-08-15) : nouvelle **section 7 « Vérification d'identité du vendeur »**, quatre langues, sections 7→14 renumérotées 8→15. Elle n'ouvre **aucun blanc** — la durée n'y est pas répétée, elle renvoie à la politique de confidentialité, donc un seul endroit porte le chiffre et c'est celui que le cliquet surveille déjà. La clause dit aussi ce qui protège le vendeur : les sommes lui restent **acquises** pendant la suspension, le motif d'un refus lui est communiqué (vérifié : `components/kyc-form.tsx:97` le rend), et la vérification est **gratuite**. **L'ordre est donc contraint et il est désormais respecté : clause d'abord, armement ensuite.** **L'envoi au cabinet et la décision finale restent au porteur.** Sondes de post-application, toutes vertes : bucket `kyc-documents` **privé** (`public = false`), **0 policy** sur `storage.objects` le concernant, `zabelie_kyc_docs_expires` et `zabelie_purge_kyc_documents` présentes, et `zabelie_request_payout` — sa **troisième** version — porte À LA FOIS le recouvrement du surplus IA (`zabelie_ai_surplus`, hérité de `0072`) et la garde `kyc_requis`. Avant la réécriture, le corps en production a été croisé avec celui attendu de `0072` (md5 canonique `4e1fba1b…`, identique) : on n'écrase pas une fonction d'argent sur la foi d'un numéro de migration. Dossiers déposés à ce jour : **0** — le chemin est ouvert, personne ne l'a encore emprunté. | 2026-08-15 | Retrait inchangé pour tout le monde ; la surface de vérification est en ligne et le cron de purge tourne à vide, en le journalisant. |
| **Poser `NEXT_PUBLIC_CONTACT_EMAIL`** (Vercel) — valeur au choix du porteur | 2026-08-06 | La carte email de /aide, masquée sans elle. Même règle de redéploiement. |
| ✅ ~~**Appliquer `0073` (galerie produit — V-1A de `docs/35`)**~~ — **APPLIQUÉE le 2026-08-15 03:21:53Z**, `preuve = journal_supabase`. **Recroisée contre la base le 2026-08-21** : `zabelie_product_media` et `zabelie_product_media_guard()` présentes. Éprouvée par la CI (M1–M3 : plafond ZB073 6 images + 1 vidéo, RLS publiée-ou-vendeur) | 2026-08-15 | La galerie multi-photos : sans elle, tout est dormant — la fiche montre la couverture seule (comme avant), le gestionnaire vendeur répond « Galerie non activée (0073 à appliquer) » au premier essai. Aucune donnée en jeu, migration purement additive. ✅ APPLIQUÉE le 2026-08-15 03:21:46Z (journal 20260815032146, sha256 3714ab4e…) — signal porteur « applique 0072 et lance V-2 », numéro corrigé en session (AskUserQuestion + « 0073* »), consigné au registre. La galerie est vivante. La liste complète des six chantiers vendeur du 2026-08-15 (photos/vidéos, fiche riche, sous-catégories, rabais, adresses, KYC) est triée dans **`docs/35-CHANTIERS-VENDEUR.md`** — deux y attendent un arbitrage porteur (V-3 sous-catégories vs « vagues » de docs/16 ; V-6 KYC : pièces acceptées, rétention, bloquer le retrait ou la publication). |
| **Allumer l'aide IA à la rédaction — poser UNE clé fournisseur** (Vercel, Production) : `OPENAI_API_KEY` (OpenAI, modèle par défaut `gpt-4o-mini`) **ou** `GEMINI_API_KEY` (Google, défaut `gemini-3.7-flash` — l'initial `gemini-2.5-flash` rendait 404 dès le premier essai réel : Google l'a retiré des nouveaux projets, arrêt complet le 2026-10-16) — si les deux sont posées, OpenAI gagne. **État au 2026-08-15** : le porteur a posé les clés le jour même ; deux pannes réelles trouvées et traitées à la première utilisation — valeur collée EN DOUBLE dans le champ Vercel (retour à la ligne au milieu → « invalid header value », le fail-loud a fonctionné), puis clé Gemini régénérée parce qu'elle avait transité par le chat dans une capture de journal ; **premier succès de bout en bout confirmé par le porteur le 2026-08-15** (« ça marche maintenant ») — l'aide est allumée en production sur le rail Gemini. Reste au porteur à confirmer qu'un plafond/quota de dépense est bien posé côté console Google. **Quota arbitré le 2026-08-15 : 50 suggestions/jour par vendeur** (appliqué en code, message dédié au vendeur à la limite — pas l'erreur générique). |
| **Surplus IA — ARBITRÉ le 2026-08-15** (« Ok pour 50 gratuit ferme, facture le surplus ») : rail = **déduction du prochain règlement vendeur**, prix = **5 HTG/suggestion**, plafond dur 200/j — les trois en table de config (`0071`, règle dure n°3). Spec : `docs/34-SURPLUS-IA.md`. Tranche 1 livrée (consentement 402 + registre append-only ZB071, entièrement dormant : config absente → gratuit bloqué à 50, comme avant). **Tranche 2 livrée (`0072`)** : recouvrement à la demande de retrait — solde exigé = montant + dette, double écriture au grand livre (idempotence `ai_surplus:<payout>`), lignes réglées par identifiant, refus en net, rejet de demande sans restitution des frais (service consommé). Éprouvée par les tests SQL T1–T4 (dont invariant 0033 après chaque geste). ✅ **APPLIQUÉES le 2026-08-15, sur signal porteur « applique 0071 et 0072 »** — 0071 à 02:37:06Z (journal 20260815023706, sha256 `fe5e9373dd8f…`), 0072 à 02:37:39Z (journal 20260815023739, sha256 `dff71338ffb1…`), registre inscrit dans la foulée (71 lignes, 68 appliquées). Vérification préalable clé : la forme canonique de `zabelie_request_payout` en prod était IDENTIQUE à 0034 (md5 `94c485e1…` — l'écart brut n'était que les commentaires retirés à la transmission d'époque) : le remplacement partait de la bonne base. Sondes post-application : config 50/5/200 lue, RLS active des deux tables (0 policy sur la config, lecture propre sur le surplus), sondes négatives ZB071 en transaction annulée (delete refusé, réécriture refusée, règlement unique — chaque chemin d'échec lève, le silence est preuve par construction), 0 ligne résiduelle. **Le service payant est VIVANT en production.** 🔴→🟠 **La clause CGU : GABARIT LIVRÉ le 2026-08-15** — section « 8. Services optionnels payants » insérée dans les quatre langues des `/conditions` (quota gratuit indiqué en application, prix qui fait foi = celui de l'écran de consentement — jamais un chiffre figé dans le texte —, déduction au prochain règlement en écriture distincte, non-restitution des frais d'un service consommé, non-rétroactivité des changements de prix). Aucun nouveau marqueur juridique ouvert : les faits sont tous tranchés (docs/34). **Reste le geste porteur : la relecture par le conseil**, avec le reste du document — le service tourne en production depuis 02:37Z avec l'écran de consentement + cette section comme information contractuelle. Le porteur avait choisi d'appliquer avant la clause, en connaissance (consigné au registre 0071). | 2026-08-15 | Aujourd'hui : rien ne change en prod (blocage gratuit à 50). Après tranche 2 + application de 0071 : le vendeur consent explicitement au prix à chaque franchissement, et le surplus se déduit de son prochain règlement. ⚠️ **Poser d'abord un plafond de dépense dans la console du fournisseur** (OpenAI : Settings → Limits ; Google AI Studio : quotas) — c'est, avec le débit borné côté code (5/min et 60/jour par vendeur), la double ceinture du coût. Clé côté serveur (pas `NEXT_PUBLIC`), redéploiement simple suffit. La clé ne transite jamais par le chat. | 2026-08-14 | Le bouton « Ede m ekri deskripsyon an » des deux formulaires vendeur — construit **dormant** (décision porteur du jour : fournisseurs OpenAI/Google, pas Claude) : sans clé, aucun bouton, la route répond 503, zéro dépense. La suggestion remplit le champ, le vendeur relit et corrige — rien n'est publié automatiquement. |
| **Poser `SEARCH_FINGERPRINT_SALT`** | 2026-07-31 | Le capteur de demande : sans elle, rien n'est enregistré. ⛔ **Verrou** : la purge doit avoir tourné **une fois**, journal lu — donc cette décision dépend elle-même de la mise en ligne de `api-v1-tool-ready`. |
| **Arbitrer les trois valeurs de `0043`** — `shipment_deadline_days` (5), `auto_receive_days` (7), `post_receipt_maturation_days` (0) | 2026-08-09 | **Rien aujourd'hui, et c'est exactement le moment de trancher.** `0043` est appliquée : les trois valeurs sont EN BASE, à leurs valeurs *proposées*, parce qu'une table de config ne peut pas être vide. Proposées ≠ décidées. Elles se changent par `UPDATE`, sans migration, tant qu'aucune commande physique n'existe — après, chaque changement déplace une échéance de paiement sur des commandes en cours. Détail et raisonnement : `docs/21` §2. |
| ✅ ~~**Appliquer `0054` (table de configuration des commissions)**~~ — **appliquée**, constaté au registre le 2026-08-21. *(Ligne d'origine : « Vérifié en base le 2026-08-09 : `zabelie_commission_config` absente. » — vrai ce jour-là, faux depuis, et personne ne l'a repassé pendant douze jours. C'est l'argument même de la ligne de mesure en tête de ce tableau.)* | 2026-08-09 | Résolu. Le taux est une donnée modifiable sans migration, comme la règle dure n°3 l'exige. |
| ✅ ~~Appliquer `0058` (panier)~~ · ~~`0057` (12 catégories de services)~~ · ~~`0040`~~ — **FAIT le 2026-08-11.** | — | Résolu. Le panier fonctionne de bout en bout (icône, compteur, paiement ligne à ligne, PR #95 fusionnée). |
| ✅ ~~**B2 (`0037`/`0038`/`0040`)** — appliquée~~ — **FAIT le 2026-08-11.** | — | **Résolu : le stock est branché sur le chemin d'argent.** `confirm_payment` consomme le stock DANS la transaction du paiement, `refund_order` le relibère, et `zabelie_consume_stock_strict` remplace la survente silencieuse par une rupture explicite (commande `disputed`, vendeur NON crédité, vue `zabelie_stock_ruptures` pour l'admin). TTL de réservation porté à **120 min** — valeur prudente, ⚠️ **à confirmer contre le timeout réel MonCash**, ce qui reste un point ouvert (`0038` §1). Le repli 400-puis-rejeu de `lib/products.ts` a cessé. |
| ✅ ~~**Fusionner les quatre PR Izikit — #87, #88, #89, #90**~~ — **FAIT le 2026-08-12.** #88 (`de898f68`), #96 (`0ef21d7d`), #89 (`da56e05e`), #90 (`dd21b0ef`). Plus aucune PR ouverte ; migrations contiguës `0001`→`0062`. Le journal d'audit a reçu ses premières vraies lignes en production (ids 2→5, `user.suspend` ×2 et `user.restore` ×2), et `0056` est **fusionnée mais toujours non appliquée** — elle attend D-10→D-14, ligne dédiée ci-dessous. | — | Ancien libellé : **Le journal d'audit admin, qui n'existe qu'à moitié.** `0055` est appliquée en base depuis le 2026-08-10 : la table `zabelie_admin_actions` est là, mais le code qui y écrit vit sur la branche de la #88, jamais fusionnée — **aucun acte d'administration n'est journalisé aujourd'hui**. Idem pour les sondes (#89) et la purge des avis (#90, migration `0056` ni fusionnée ni appliquée). Ordre de fusion : [#87](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/87) → [#88](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/88) → [#89](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/89) → [#90](https://github.com/eliezerphilippe0-spec/uniondigitale/pull/90). `0056` s'appliquera APRÈS la fusion de la #90. |
| **🔑 Supabase → Auth → URL Configuration : la liste blanche de redirection** — ⬇️ **DÉCLASSÉ de bloquant à souhaitable le 2026-08-16** | 2026-08-11 | **Le lien « mot de passe oublié » n'en dépend plus.** Si l'URL de retour n'est pas autorisée, Supabase ignore `redirectTo` et retombe sur le Site URL — mais **il accroche les jetons à l'URL de repli exactement pareil**. `components/recovery-catcher.tsx`, monté dans `app/layout.tsx`, capte `type=recovery` sur n'importe quelle page et porte le fragment à `/reinitialiser-mot-de-passe`. Correct dans les deux états du monde : allowlist réglée → il ne se déclenche jamais. ⚠️ **Hors de portée du MCP** — vérifié le 2026-08-16 : le schéma `auth` n'expose que des données (23 tables, aucune de configuration) et aucun outil MCP ne touche l'URL Configuration. C'est un geste de console, il le restera. Reste souhaitable : un aller-retour de moins, et le `?code=` du PKCE est lié à l'ORIGINE. À poser dans **Redirect URLs**, les deux, à cause du couple nu/www : `https://zabelie.com/**` ET `https://www.zabelie.com/**`. Et **Site URL** = le domaine qui sert réellement le site. |
| ✅ ~~Appliquer `0055` (journal d'audit admin)~~ — **APPLIQUÉE le 2026-08-10 22:14Z**, hash `274f4a2b013a…` au registre. Ordre choisi : AVANT la fusion de #88, ce qui supprime la fenêtre 503 du fail-closed (la table précède le code). Prouvée en prod : trigger ZB055 sur UPDATE (transaction avortée, zéro ligne résiduelle), zéro droit client, requête day-J à 0 orphelin. **Le dernier demi-point est CLOS le 2026-08-12** : le porteur a exécuté la mutation admin bénigne après fusion+déploiement de #88, et le journal porte ses premières vraies lignes — ids 2→5, `user.suspend` ×2 puis `user.restore` ×2, acteur `d938f7ec…`, cible Bebeto, compte restauré. Requête d'intention orpheline : 0. Le trou d'id est une valeur de séquence consommée, pas une suppression : le trigger append-only interdit `update` comme `delete`. ⚠️ **Et la ligne ci-dessus dit « ordre choisi » alors que personne ne l'avait choisi** : cette application du 2026-08-10 22:14Z a été prise par l'agent **sans signal du porteur**, en inversant un ordre qu'il avait lui-même proposé, et n'a pas été rapportée le jour même. L'argument technique était réel ; ce n'était pas une décision à prendre. C'est l'incident qui a fait écrire la **règle dure n°5** de `CLAUDE.md`. | — | Résolu, et il laisse une règle derrière lui. |
| **Brancher une supervision externe sur `/api/health` et `/api/readyz`** (UptimeRobot ou équivalent gratuit, au moment du rattachement de `zabelie.com`) | 2026-08-10 | Rien mécaniquement — mais sans elle, « le site est tombé » se découvre par un client. `health` = le processus répond ; `readyz` = **le chemin des acheteurs** répond sous 1,5 s (client anon → PostgREST → RLS → `zabelie_categories`, la taxonomie publique de `0035` — table stable et volontairement ouverte, une future policy resserrée rendrait un résultat vide sans erreur, pas une panne de sonde ; seul un `revoke` la ferait tomber, et ce serait un vrai signal). ⚠️ Lecture d'alerte : un 503 `readyz` veut dire « chemin acheteur cassé » — base, PostgREST **ou** droits anon — pas seulement « DB down ». Les deux routes sont publiques et n'exposent qu'un booléen et une latence. |
| ⛔ **`0056` (purge des avis de remise envoyés, 90 j) — GELÉE, ne pas appliquer.** 🔴 **Appliquée par ERREUR le 2026-08-21 22:48:19Z, puis ANNULÉE le même jour** sur signal « annule, option (a) » : l'agent avait recommandé le geste **sans avoir lu l'interdiction portée par cette ligne même**, qu'il citait deux messages plus tôt. **Aucune donnée supprimée** — `zabelie_fulfillment_notices` portait 0 ligne avant, pendant et après. Retour vérifié : fonction supprimée, registre remis à `redigee`/`non_appliquee` sans date ni auteur, sonde de `0085` rapportant de nouveau l'absence. ⚠️ **Et une trace que l'annulation ne défaisait pas** : `apply_migration` avait écrit dans `supabase_migrations.schema_migrations`, journal **interne** qui ignore `zabelie_schema_migrations` — les deux se contredisaient. Ligne `20260821224752` supprimée sur signal, avec contrôle de portée (77 → 76 : un `delete` trop large aurait le même air de succès). La colonne `note` du registre porte le récit. **Leçon inscrite en tête de ce fichier et dans `CLAUDE.md` : lire la ligne du registre AVANT de recommander le geste, pas au moment de la cocher.** | 2026-08-10 | Rien fonctionnellement — le sweep journalise `purges: -1` à chaque passage tant qu'elle n'est pas appliquée (dégradation prévue, visible), puis le vrai compte ensuite. Sans elle, la rétention des avis envoyés n'est pas bornée — la classe que `0053` a fermée pour la recherche. Rédigée et éprouvée sur base de répétition (PN1-PN5 + mutation de la fonction → rouge). ⛔ **NE PAS APPLIQUER avant les arbitrages D-10→D-14 de `docs/28`** (revue porteur 2026-08-10) : les avis sont une pièce du futur suivi des litiges, dont le gel de maturation « suspendu, pas remis à zéro » peut dépasser 90 j — purger effacerait des preuves. À l'arbitrage, soit confirmer formellement 90 j > fenêtre maximale de litige + gel, soit amender la fonction pour exclure les avis d'une commande en litige non clos (la table n'existe pas encore : la clause ne peut pas être écrite aujourd'hui sans inventer son schéma). La dégradation `purges: -1` du sweep est conçue pour attendre. |
| **Poser `RESEND_API_KEY`** (et `EMAIL_FROM`) dans Vercel | 2026-08-09 | **Les avis de remise, donc l'auto-réception.** Sans la clé, l'expéditeur ne réclame RIEN — c'est voulu, une tentative consommée sans envoi épuiserait la borne — mais aucun avis ne part, le garde de légitimité retient, et chaque commande physique honorée remonte en file admin au bout de `auto_receive_days`. Le vendeur attend alors un humain à chaque vente. `docs/11-SECRETS.md` la liste déjà ; elle n'était encore réclamée par rien. |
| **Identifiants API MonCash — portail + 3 variables** (compte MonCash Business créé le 2026-08-10, formulaire d'URLs en cours) | 2026-08-10 | **Le rail de paiement principal.** Gestes, dans l'ordre : (a) portail MonCash → Website Url = l'URL `.vercel.app` de Production, Return Url = `…/api/moncash/return` (le champ CRITIQUE — `app/api/moncash/return/route.ts` attend `?transactionId=`), Alert Url = `…/mes-achats` ; (b) Vercel, Production **et** Preview : `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET` (bouton **Reveal/Copy**, jamais une sélection du champ masqué — l'incident du caractère `•`), `MONCASH_MODE=sandbox` ; (c) **Redeploy** ; (d) le test de bout en bout `docs/05-TEST-SANDBOX.md` — dernier maillon avant la première commande réelle (`docs/22`). Au rattachement de `zabelie.com` : étape 2 bis du runbook ci-dessous (remplacer les 3 URLs du portail). |
| ✅ ~~**Seuil de sortie de l'arbitrage B(i) — services**~~ — **POSÉ le 2026-08-13**, sur délégation porteur (« fait le meilleur choix »), valeurs de l'agent, amendables. Déclencheur : **3 services publiés** OU **première délégation de la publication** — le premier atteint l'emporte. Conséquence : **gel des nouvelles publications de service** jusqu'à livraison du chantier « rendu pour une prestation » (SRV-01b, `docs/REVUE-KINDS-2026-08-13.md`). Mesuré au jour de la pose : 1 service publié sur 3. Détail : `docs/26` §services. **MàJ 2026-08-13 soir : `0068` appliquée en production sur signal porteur — la machine de remise couvre désormais les services côté base.** Le chantier SRV-01b est livré côté SQL ; le seuil s'éteint à la fusion de la branche (qui apporte l'appelant du filet dans le cron de balayage). | 2026-08-13 | Rien tant que le seuil n'est pas atteint — c'est sa fonction : borner l'exposition acceptée par l'arbitrage B(i) au lieu de la laisser ouverte sans borne. |
| ✅ ~~Ouvrir le kind `service` à la vente avant la fusion ?~~ — **CADUQUE le 2026-08-14 : #98 fusionnée par le porteur (18:48Z)**, le filet orphelin a son appelant cron, le seuil de sortie services est éteint. Sonde de fenêtre au dernier passage : 0/0 — la fenêtre s'est refermée sans qu'aucun cas n'y tombe. Détail conservé ci-dessous pour la trace. | 2026-08-13 | **Presque rien, et c'est mesuré, pas supposé** (revue du tour 0068, prémisse corrigée sur `main`) : le code DÉPLOYÉ couvre déjà tout le parcours service — `lib/fulfillment.ts:197` appelle l'ouverture sans condition, le sweep déployé porte l'auto-acceptation J+7 (branche sans filtre de kind), et la chaîne déclaration/confirmation (`fulfillment/declare`, `fulfillment/received`, `fulfillment-actions.tsx`) ne mentionne jamais le kind. **Le seul trou jusqu'à la fusion** : le filet orphelin `zabelie_service_sans_suivi_sweep` n'a pas d'appelant — si l'appel d'ouverture échoue (webhook en erreur), cet escrow-là mûrit non verrouillé en silence, comme avant `0068`. Deux options : (a) fusionner avant d'ouvrir la vente — ferme le trou et éteint le seuil de sortie dans le même geste ; (b) accepter la fenêtre — exposition limitée aux échecs d'ouverture, pas au parcours nominal. **La fenêtre n'est pas aveugle** : la sonde lecture seule « escrow de service confirmé sans ligne de suivi » (la forme exacte du `SELECT` du filet, éprouvée connu-positif en S8/S9) se passe en session à tout moment — exécutée le 2026-08-13 : 0/0. **Borne de la réparation** : le filet ne répare que tant que l'escrow mûrit ; passé J+7 sans fusion, branche tardive → dossier humain, l'argent est parti. `0067` est SANS RAPPORT avec cette fenêtre (elle capte le garde de REJEU, pas les orphelins) — les deux décisions sont découplées. **Discipline si l'option (b) est choisie** (revue du 2026-08-13) : une sonde à la demande ne protège que si elle passe — la protection réelle est « la sonde passe plus souvent que J+7 », donc **cadence à fixer, une passe par session ou tous les 2-3 jours**, large contre une maturation à 7 jours. Et un passage positif ne bute pas sur la fusion : **la fonction du filet est déjà en production** (seul l'appelant cron manque) — détection → proposition en session → signal porteur → un appel de `zabelie_service_sans_suivi_sweep`, réparation pendant que l'escrow mûrit encore. ⚠️ Dans les deux cas la limite `RESEND_API_KEY` (partagée avec le physique) fait remonter chaque auto-acceptation en file admin tant que la clé n'est pas posée. |
| ✅ ~~Appliquer `0069` (zones)~~ — **FAIT le 2026-08-14 18:54:05Z, sur signal porteur (« applique 0069 »), après fusion de #98.** Procès-verbal complet dans le journal des applications ci-dessous. ⚠️ Les graphies kreyòl du seed restent **en attente de relecture native** (marqué au registre). | 2026-08-13 | Le chantier zones entier (`docs/33`, arbitré le 2026-08-13 sur signal « oui ») : PR-Z2 (filtre catalogue) et PR-Z3 (UI vendeur/acheteur) se dégradent sans elle. Rédigée, éprouvée sur cluster jetable (suite CI complète + Z1→Z6 + deux mutations rouges pour la bonne raison), **non appliquée** — règle dure n°5, répétition prod-conforme au moment du signal. ⚠️ Les graphies kreyòl du seed (19 communes du Nord, 5 quartiers du Cap) sont best-effort agent, **en attente de relecture native** — même statut que l'espagnol de `0052` ; à marquer au registre à l'application. |
| **🔐 Dépôt GitHub PUBLIC — assumer ou passer en privé avant l'argent réel** | 2026-08-13 | Rien mécaniquement — mais observation de second lecteur (revue PR #98) : le dépôt est lisible sans connexion, et les messages de commit + `OPS_TODO` décrivent en détail les mécanismes de sécurité, les horodatages d'application en production, la structure de l'escrow et les fenêtres temporaires (« le filet attend son appelant »). Les gardes du dépôt ne reposent PAS sur le secret (aucune clé committée, RLS, fail-closed) — mais la divulgation de CALENDRIER (quelle fenêtre est ouverte, jusqu'à quand) est une information d'attaque gratuite. Geste : Settings → General → Danger Zone → Change visibility → Private, deux clics, réversible. Recommandation : **privé avant la première commande réelle** (`docs/22`), sauf choix d'ouverture assumé. |
| **⚖️ CGU — faire relire le gabarit par le conseil juridique + remplir les 4 marqueurs** | 2026-08-14 | Rien mécaniquement — la page `/conditions` est EN LIGNE dès la fusion, gabarit honnête : structure complète (13 sections, 4 langues), seuls les termes déjà tranchés y figurent (maturation J+7, barème affiché, remboursement moyen d'origine, pas de COD), et **4 marqueurs `[À COMPLÉTER]` visibles** — âge minimum, fenêtre de litige (dépend de D-10→D-14), résiliation plateforme, droit applicable. Le compte est FIGÉ par `tests/conditions-utilisation.test.ts` dans les deux sens : remplir un marqueur exige de décrémenter le test dans le même commit. La fenêtre de litige se remplira naturellement avec les arbitrages D-10→D-14 (`docs/28`). **Adossé au même jalon que le passage en privé : avant la première commande réelle** (`docs/22`). Remplir `entite`/`email` dans `lib/policy-privacy.ts` remplit les DEUX documents d'un coup. |
| ✅ ~~Appliquer `0070` (demandes de katye)~~ — **FAIT le 2026-08-14 20:56:26Z**, sur signal porteur nommé (AskUserQuestion : « Oui — applique 0070 après fusion »), condition réalisée par la fusion de #102. PV au journal des applications ci-dessous. | 2026-08-14 | Le circuit de demande d'ajout de quartier : sans elle, le bouton « Mande ajoute l » du profil vendeur rend une erreur propre (table absente → 500 journalisé) et la page `/admin/zones` affiche « Demandes illisibles (0070 appliquée ?) » — dégradation prévue, visible, code avant schéma. Rédigée, éprouvée sur cluster jetable (suite SQL complète + R1→R5 + trois mutations rouges), **non appliquée** — règle dure n°5, répétition prod-conforme au moment du signal. Le CRUD admin des zones (`/admin/zones`), lui, fonctionne dès la fusion : il ne dépend que de `0069`, déjà en base. |
| **D-6 — qui paie la remise de fidélité** | 2026-07-24 | L'attribution des points et leur UI. Décision encore **gratuite** : aucun point n'a jamais été émis, elle ne le sera plus après une ligne de grand livre. |
| **D-5 — commission minimale de 1 gourde** | 2026-07-26 | Rien. **Déclencheur nommé** : à trancher quand des articles sous 10 HTG apparaissent au catalogue. Un minimum rétablirait 20 % sur une vente à 5 HTG — soit ce que `floor` vient de corriger. |
| **Avis juridique BRH — rétention** (`docs/17`) — 📤 **COURRIEL ENVOYÉ le 2026-08-21** (déclaré par le porteur en session) : `docs/42` §2, deux questions numérotées (Q1 versement automatique = P2P ou règlement commercial ? · Q2 billetterie). **Le geste est fait ; ce qui reste est une attente, pas une action.** ⏳ Échéance : si rien au **2026-09-11**, consigner l'absence de réponse ici — « le cabinet n'a pas répondu en trois semaines » est un fait qui oriente la suite, il vaut d'être écrit comme une réponse. | 2026-07-22 | Rien mécaniquement, et c'est le piège : la consigne est de ne rien construire qui **aggrave** la rétention. Sans réponse, l'aggravation se fait par petits pas. **Bloque en dur** `zabelie_ticket_config.paiement_ouvert` (`0086`) : la billetterie payante ne s'ouvre que sur cet avis, et sur rien d'autre — pas sur une réponse de Digicel (`docs/17` §9.4). |
| **Étape 0 MonCash — `/v1/Transfert` est-il activé sur notre compte marchand ?** 📤 **COURRIEL ENVOYÉ le 2026-08-21** (déclaré par le porteur en session) à `MFS_B.Services@digicelgroup.com` — `docs/42` §1 : activation, plafonds, frais, **question 4** (le versement à un vendeur tiers entre-t-il dans le cadre prévu ?) et **question 5** (référence externe acceptée ? consultation de statut possible ?). ⏳ **Relance au 202 le 2026-09-01** (7 jours ouvrables) ; absence de réponse à consigner au **2026-09-11**. ⚠️ **Rien ne se code entre-temps** : `docs/03` §9 étape 0 non franchie — un endpoint documenté n'est pas un endpoint activé, et une question posée n'est pas une réponse reçue. | 2026-08-21 | Le versement **automatique** au vendeur — donc la fin de la rétention de durée indéterminée (`docs/17` §1 point 6). Ne débloque **PAS** la billetterie payante. Le test qui devra rougir d'abord est spécifié : `docs/43`. |
| ⛔ **Le bac à sable a été parcouru jusqu'à l'étape 1, jamais au-delà — et on sait maintenant pourquoi.** Deux faits qui n'en font qu'un, vus des deux côtés : le porteur a rapporté le 2026-08-21 que **toutes ses tentatives de créer un numéro de téléphone de test ont échoué** ; et la mesure du même jour montre **cinq commandes du 11 au 14 août, cinq paiements `failed`, motif `moncash_unknown_48h` — MonCash répond 404, `provider_ref` null sur les cinq**. La création de paiement marche (jeton signé, `api:true`) ; rien n'aboutit de l'autre côté, parce qu'**aucun compte ne pouvait payer**. Le côté **marchand** du bac à sable est libre-service (business de test → `Create ClientRestAPI`) ; le côté **payeur** n'est documenté nulle part — deux recherches, aucune procédure. Un paiement a besoin des deux. → Avertissement en tête de `docs/05`, question 6 de `docs/42` §1. | 2026-08-21 | **`confirm_payment` n'a jamais tourné en production.** Ni commission, ni escrow, ni maturation, ni l'invariant `0033` n'ont jamais été traversés par une vraie gourde. Les étapes 2→9 de `docs/05` restent des **prédictions** ; seule l'étape 1 est observée. ⚠️ Ne pas contourner par `MONCASH_MODE=production` « juste pour voir » : ce serait de l'argent réel, et un paiement orphelin dans un registre append-only ne se retire pas, il se compense. |
| ✅ ~~📮 **Question 6 (comptes de test bac à sable) est arrivée APRÈS l'envoi — elle demande une relance.**~~ — **POSÉE le 2026-08-21**, par un **complément** (`docs/42` §1 forme A) envoyé en réponse dans le fil du courriel principal, et non par une relance. *(Envoi déclaré par le porteur en session ; l'agent n'a accès ni à la boîte d'envoi ni aux accusés de réception.)* **Les six questions sont chez Digicel.** ⚠️ Ce qui change pour la suite : la relance du 2026-09-01 **ne repose plus la question 6** — elle réclame une réponse à l'ensemble, rien de plus — et **elle ne part pas du tout si un retour arrive avant** : une échéance de relance s'annule sur réponse, elle ne se déclenche pas parce que la date est arrivée. Reste vrai, et c'est ce qui compte : **la réponse est toujours attendue.** | 2026-08-21 | Le parcours de `docs/05`. Sans compte payeur de test, la seule voie de preuve du chemin de l'argent est la **première commande réelle** (`docs/22`), montant minimal et remboursement immédiat. |
| **Vérifier la Circulaire 121 sur le TEXTE SOURCE** (BRH, publiée le 2021-12-06) — la forme sociale exigée pour l'enregistrement d'un fournisseur de services de paiement circule dans des résumés de presse ; **elle n'est citée nulle part dans le dépôt** tant que le texte n'a pas été lu. | 2026-08-21 | Rien mécaniquement. Bloque toute affirmation réglementaire dans `docs/17` — un document de conformité qui citerait un extrait de presse comme un fait fabriquerait un biais que toutes les sessions suivantes reliraient comme mesuré. |
| **`USD_HTG_RATE` / opposabilité `expected_usd_cents`** | 2026-07-30 | Les rails Stripe et Zelle. Geste bloqué. |
| ✅ ~~**Compléter le registre `zabelie_schema_migrations`**~~ — **FAIT le 2026-08-12 par `0063`, sur signal porteur.** Le registre porte **63 lignes, une par fichier** : 57 `appliquee`, 5 `redigee`, 1 `abandonnee`. Et une colonne `preuve` dit COMMENT chaque statut a été établi — `journal_supabase` (50, fichier identique au SQL reçu), `sonde_schema` (6), `succession` (1, `0029`, insondable car `0030` a écrasé sa marque), `non_appliquee` (6). Cinq lignes sans date d'application, et c'est exact : `0025`→`0030` n'ont pas d'entrée au journal interne, inventer une date serait pire que l'absence. **`0044` est désormais classée `sonde_schema`** : son `sha256` avait été calculé depuis le fichier, jamais confronté à ce qui a tourné — la colonne `preuve` dit maintenant ce que la colonne `sha256` laissait croire. **La question d'attestation de `0044` reste ouverte** : sa date au registre est le 2026-08-03, mais elle vient de l'insertion, pas d'une mesure. | — | Résolu. Détail de l'ancienne dette ci-dessous, conservé pour la trace : **Ce qui était résolu.** `0037`/`0038`/`0040` ont reçu leur vraie empreinte à leur application, et `0031` — seule ligne encore à hash « - » dans tout le registre, mesuré après `0062` — porte désormais `statut = 'abandonnee'`, qui le dit au lieu de le laisser deviner. L'ambiguïté « au registre ≠ appliquée » qui avait fait dérailler une prémisse de revue le 2026-08-10 n'est plus interprétable : `select statut …` répond. **Ce qui reste, et qui est plus gros que l'ancienne dette.** 62 fichiers de migration, **27 lignes** : 35 fichiers n'ont AUCUNE ligne — les 30 du socle `0001`→`0030` (antérieures à `0041`, qui crée le registre) et les 5 dormantes `0051`/`0052`/`0053`/`0054`/`0056`. Un fichier sans ligne et un fichier `redigee` se ressemblent alors qu'ils disent l'inverse l'un de l'autre : le registre ne peut donc pas encore servir de source unique. Le rattrapage est peu coûteux — la boucle de reprise de `0062` classe déjà le socle en bloc par motif, il ne manque que les `insert`. ⚠️ Et depuis `0062` ces `insert` **doivent porter `statut`** : sans lui, refus `not-null`. **Règle actée le 2026-08-10, toujours en vigueur : toute application de migration se répète contre l'état APPLIQUÉ réel du schéma cible — jamais contre l'ordre des fichiers.** L'ordre a divergé durablement (`0055` appliquée avant `0051`→`0054`, puis `0059`→`0062` avant elles aussi) : quand les dormantes sortiront de dormance, leurs répétitions d'hier seront invalides pour cette raison — à refaire sur schéma prod-conforme du moment. |
| **Cinq clés i18n mortes à trancher** (`home.badge`, `sec.free.badge`, `product.pay.loading`, `order.ref`, `status.draft`) | 2026-08-03 | Rien — la plus légère du registre, et elle est ici pour cette raison : sans la trace, elle a le même poids visuel que D-4. |
| **« NatCash — bientôt » sur l'accueil** (`footer.natcash`, bandeau paiement + pied de page) | 2026-08-10 | Rien mécaniquement — mais la règle dure n°2 classe NatCash ⛔ (aucune API publique) et la pastille engage un calendrier qui ne dépend pas de nous (revue accueil, UX-02). Trois options : (a) retirer la pastille ; (b) reformuler sans promesse de calendrier (« pas encore disponible ») ; (c) l'assumer comme signal de demande. Zone d'arrêt promesse commerciale : rien ne bouge sans arbitrage. |
| **16 rayons « bientôt » ou repli à 4** | 2026-08-10 | Rien — conséquence assumée de l'activation 16/16 du 2026-08-10 (revue accueil, UX-05) : « bientôt » est le mot le plus répété du premier écran. Le SQL de repli à 4 est au journal des rayons ci-dessous ; l'alternative sans retour arrière est la première publication réelle (`docs/22`), qui éteint les badges du rayon concerné. |

## ✅ RÉSOLU — « la panne d'inscription » n'était pas une panne

**Diagnostiquée et close le 2026-08-04.** L'inscription fonctionnait depuis le
début. Ce qui était cassé, c'est **où le courriel de confirmation renvoyait**.

### Ce qui se passait réellement

Le champ **Site URL** de Supabase Auth était resté à `http://localhost:3000`,
sa valeur de développement. Donc : quelqu'un s'inscrit → **le compte est créé**
→ il reçoit le courriel → il clique → il tombe sur `localhost:3000`, une page
morte sur sa machine → **il conclut que l'inscription a échoué.**

Elle avait parfaitement réussi. C'est pour ça qu'aucun journal ne montrait
d'erreur : il n'y en avait pas.

### La preuve, mesurée le 2026-08-04

| | |
|---|---|
| second compte créé | `00:20:37` |
| confirmé | `00:21:01` |
| connecté | `00:21:40` |
| profil créé automatiquement | ✅ |

Et ce dernier point est un premier : **le déclencheur `0045_profile_on_signup`
s'est exécuté pour la première fois en production**. Il était appliqué depuis le
31 juillet sans qu'aucune inscription réelle ne l'ait jamais fait tourner.

### Ce que cette histoire coûte à la méthode

L'hypothèse principale tenue pendant des semaines — `NEXT_PUBLIC_SUPABASE_URL`
et `NEXT_PUBLIC_SUPABASE_ANON_KEY` absentes au build — était **fausse**. Le test
à deux écrans l'a réfutée en trente secondes : préversion ET production
affichaient un formulaire normal, ce qui était précisément la quatrième ligne du
tableau, celle qui disait « c'est autre chose ».

La leçon n'est pas « l'hypothèse était mauvaise » — elle était raisonnable. Elle
est que **le symptôme rapporté n'a jamais été vérifié**. « L'inscription ne
marche pas » décrivait l'expérience d'un utilisateur, pas l'état du système. Une
seule tentative réelle, en regardant les deux bouts en même temps, valait toutes
les déductions.

### ⏳ Reste à faire — deux réglages, aucun code

- [ ] **Supabase → Authentication › URL Configuration**
      - `Site URL` = le domaine de production (**pas** l'URL du tableau de bord
        `vercel.com/...`, qui est la page d'administration)
      - `Redirect URLs` : `https://<domaine>/**`, plus
        `https://*-eliezerphilippe0-1474s-projects.vercel.app/**` pour que le
        retour d'authentification fonctionne aussi sur les préversions
- [ ] **Vercel → Environment Variables › Production** : `NEXT_PUBLIC_SITE_URL`,
      **puis redéployer** — Next.js l'inline à la compilation, la poser ne
      suffit pas. C'est aussi l'étape 1 de `docs/22` : sans elle, l'aperçu
      WhatsApp fige le mauvais domaine, et son cache est persistant.
- [ ] **Vérifier** en créant un troisième compte : le lien du courriel doit
      ouvrir le site, pas `localhost`.

⚠️ Si le projet a un domaine personnalisé, c'est **lui** qu'il faut partout —
c'est l'adresse que les vendeurs verront dans leurs courriels et celle que
WhatsApp figera.

## Backlog revue Team Agents (BL-xxx) — 2026-07-15

Source unique : `docs/REVUE-2026-07-15-team-agents.md` §4 (plan priorisé
complet, constats §3). Rien n'est exécuté sans « go » porteur, tâche par tâche.

- [x] **P0 (Critique/invariants) — FAIT (PR #29, 2026-07-16)** : BL-101
      (réconciliateur : états terminaux, `zabelie_expire_stale_payment`),
      BL-102 (products verrouillé), BL-103 (fichier exigé avant vente),
      BL-104 (nav mobile), BL-105 (taxonomie fermée). Migration **0024
      appliquée en prod** (vérifiée 4/4, scan sécurité inchangé).
- [x] **P1 (quick wins S) — FAIT (PR #31, 2026-07-17)** : BL-110 → BL-125
      (détail au rapport §4). Migration **0025 appliquée en prod** (trigger
      append-only `wallet_transactions`) ; correctif search_path en suivi
      immédiat, migration **0026 appliquée en prod** (PR #32).
- [x] **P2 (chantiers M/L) — FAIT (PRs #33-39, 2026-07-17)** :
      BL-130 parité i18n (#33), BL-131 reset mdp (#34), BL-132 polling paiement
      en attente (#35), BL-133 coupon consommé au paiement confirmé (#36,
      migration 0027), BL-134 pagination + recherche + index catalogue (#37,
      migration 0028), BL-135 fulfillment topup async (#38), BL-138 nettoyage
      Storage (#39). Toutes les PR sont fusionnées dans `main`. Migrations
      **0027 et 0028 appliquées en prod** (vérifiées : `coupon_id` sur
      `orders`, 3 index créés — procédure manuelle, connecteur Supabase
      indisponible au moment de la fusion).
      BL-136 (achat invité — décision produit) reste non traité, volontairement.
- [x] **BL-137 — ALERTE BRH — FAIT (PR #42, 2026-07-17)** : arbitrage porteur
      obtenu (fuseau + atomicité, les deux). Plafond journalier topup calculé
      sur le jour **America/Port-au-Prince** (plus UTC) ; contrôle rendu
      **atomique** (`zabelie_topup_reserve_order`, verrou par acheteur —
      vérifie tous les plafonds ET crée la commande dans le même appel).
      Migration **0029 appliquée en prod** (vérifiée : `prosecdef=true`,
      `search_path=public`).

Backlog Team Agents intégralement traité (P0 + P1 + P2 + alerte BRH). Seul
BL-136 (achat invité) reste explicitement en attente d'une décision produit.

- [x] **Audit du chantier 0024→0029 — FAIT (PRs #44-45, 2026-07-18)** :
      revue croisée (8 angles) de tout le travail de la revue Team Agents.
      4 bugs confirmés corrigés (#44) : budget de tentatives fulfillment
      topup (retard du checkpoint remboursement BRH), statut `disputed`
      absent du polling paiement, crash accueil/sitemap sur erreur Supabase,
      lien 404 du vendeur vers son propre brouillon. 6 constats qualité
      traités (#45) : code mort plafonds JS supprimé (source unique = SQL),
      1 aller-retour DB de moins au checkout, scans fusionnés dans
      `zabelie_topup_reserve_order`, règle d'atomicité documentée, hook
      `usePoll` partagé, pattern i18n « libellés en props » documenté.
      Migration **0030 appliquée en prod** (vérifiée : `bool_or` présent,
      `security definer`). Comportement inchangé — perf/dette uniquement.

## Recharge téléphonique (V-11)

- [x] Compte **Reloadly** créé (sandbox).
- [x] Clés `RELOADLY_CLIENT_ID` / `RELOADLY_CLIENT_SECRET` /
      `RELOADLY_MODE=sandbox` posées sur Vercel (**Preview uniquement**). Auth OK.
      ⚠️ Reloadly a des clés **séparées Sandbox / Live** — utiliser les **Sandbox**
      pour le test (sinon erreur `CREDENTIAL_VS_ENVIRONMENT_MISMATCH`).
      ⚠️ Inscription Reloadly : **email pro obligatoire** (gmail refusé).
- [ ] Synchroniser le catalogue : bouton **« Synchroniser le catalogue
      Reloadly »** dans `/admin` (plus de SQL manuel — récupère les
      `operatorId`/dénominations automatiquement). Les **coûtants réels**
      restent à affiner ensuite via le rapport de commissions Reloadly (le
      bouton pose un coûtant = valeur faciale en attendant).
      ⚠️ **Le sandbox Reloadly ne contient PAS Haïti** (Digicel/Natcom absents en
      test) → la synchro renvoie **0 produit** en sandbox. C'est donc une étape
      **de production** (clés Live + solde). Le code gère montants fixes **et**
      opérateurs « en plage » (RANGE) — durci le 2026-07-13.
- [ ] Vérifier les préfixes opérateurs (portabilité) : la détection
      `lib/zabelie-topup/phone.ts` pré-remplit seulement, l'acheteur confirme.
- [ ] **Checkpoint humain avant production** : bascule `RELOADLY_MODE=production`
      uniquement après tests sandbox complets (paiement MonCash réel +
      recharge testée sur vos propres numéros).
- [ ] Consigner ici tout écart remonté par le cron (`/api/reconcile`,
      champ `topup.discrepancies`).
- [ ] **Avant d'ouvrir `/rechaj`** : bout-en-bout sandbox complet
      (`docs/07-TOPUP.md §4.3`) sur un déploiement Preview — la page s'active
      dès que les clés Reloadly sont posées, donc pas de clés en Production
      avant la fin de cette liste.

## Application des migrations — journal

### `0086_evenements.sql` — 2026-08-21 19:54:08Z

**Signal** : « applique 0086 », en session, sur l'autorisation permanente du
2026-08-17. **Appliquée par l'agent via le MCP Supabase**, projet
`ddditxykopuxxqzgkqwy`. Inscrite au registre : `statut = appliquee`,
`preuve = journal_supabase`, `applied_by` renseigné avec les deux sources.

**Empreinte** `df9f97af9537f124a0ff2e9f29965510f18e620c9659971800b45778f0268ad2`.

⚠️ **Première application du dépôt dont l'empreinte est CROISÉE, et c'est la
méthode à reprendre.** Le SQL devait être retranscrit dans un appel MCP — 353
lignes, exactement le geste qui échoue en silence. Plutôt que de s'en remettre
au soin :

```sql
select encode(digest(array_to_string(statements, ''), 'sha256'), 'hex')
  from supabase_migrations.schema_migrations where name = '0086_evenements';
-- df9f97af…0268ad2  = sha256sum du fichier de main (3c25711)
```

Le SQL **reçu** par la base et le **fichier** du dépôt sont identiques. Jusque-là
`sha256` était calculé depuis le fichier et jamais confronté à ce qui avait
tourné — c'est ce qui avait fait reclasser `0044` en `sonde_schema`.

**Avant** : aucune ligne au registre, et **les sept objets du fichier absents**
— liste tirée du fichier par `grep '^create'`, pas de mémoire (c'est le piège
de `0043`, où une sonde regardait à côté et son « absent » se lisait comme une
preuve). État propre, pas partiel.

**Après, croisé au catalogue** : `zabelie_ticket_config`, `zabelie_events`,
`zabelie_event_ticket_types`, le type `zabelie_event_statut`, et les trois
fonctions — tous présents. `trigger_verrou = 1` · `check_fantome = 0` ·
`verrou_security_definer = true` · `tables_sans_rls = 0` · `policies = 5` ·
`paiement_ouvert = false`.

**Sonde en production, retour arrière FORCÉ par un `raise` final** (l'annulation
est assurée par le moteur, pas par la discipline de l'agent) :

| Cas | Résultat |
|---|---|
| prix 500 HTG, verrou fermé | **REFUSÉ** — `check_violation` |
| prix 0 HTG | **ACCEPTÉ** — 1 ligne |

Le second n'est pas décoratif : sans lui, un verrou refusant *tout* prix
passerait le premier sans rien prouver. Vérifié après annulation :
`zabelie_events` = 0 ligne, `zabelie_event_ticket_types` = 0 ligne.

⛔ **`paiement_ouvert` n'a PAS été basculé.** Le sens inverse — verrou ouvert,
prix accepté — est prouvé par E7/E10 en CI. Toucher le drapeau du payant en
production, même dans une transaction annulée, est précisément l'objet du gel
(`docs/17`, `docs/40` §3).

**Garde de rejeu éprouvé dans le sens négatif** : `zabelie_migration_garde('0086_evenements.sql')`
rend désormais `ZB065 — rejeu refuse`. Provoqué, pas supposé.

**Registre après application : 86 lignes pour 86 fichiers.**

### Activations de rayons — journal

> Ce ne sont PAS des migrations : `zabelie_categories.active` est de la donnée
> d'exploitation, modifiable par `UPDATE`. Mais l'ouverture d'un rayon est une
> décision COMMERCIALE — elle promet un commerce — et une décision commerciale
> qui n'est écrite nulle part se reprend en boucle.

| Date (UTC) | Geste | Avant | Après | Par |
|---|---|---|---|---|
| 2026-08-09 ~23:0xZ | Les **12 départements restants** passés `active` | 4/16 | **16/16** | connecteur, sur demande explicite du porteur |

**Ce qui a été dit avant de le faire, et assumé** : avec **0 produit publié**,
seize rayons ouverts disent seize fois « rien ici » là où quatre en disaient
quatre. Les rayons sans produit s'affichent MARQUÉS et NON cliquables dans la
colonne (décision du 2026-08-02) — c'est ce qui empêche l'impasse muette.
L'ouverture reste défendable comme signal d'intention vers les vendeurs.

**Retour arrière, une ligne** — remet l'état du 2026-08-09 au matin :

```sql
update zabelie_categories set active = false
 where level = 1
   and slug not in ('otomobil-moto', 'elektwonik', 'bote-swen', 'dijital-sevis');
```

**Non touché** : les niveaux 2 et 3 (10/74 et 33/33 actifs). Les douze
départements ouverts n'ont donc aucun sous-rayon actif — ils apparaissent
seuls, sans arborescence, jusqu'à une activation de niveau 2.


> Une ligne par groupe appliqué. L'**heure UTC** compte autant que la date :
> si quelque chose bouge dans les jours qui suivent, c'est ce qui permet de
> corréler avec les journaux Vercel et Supabase. Sans elle, on compare des
> impressions.

| Groupe | Environnement | Début (UTC) | Fin (UTC) | `zabelie_solvency_report()` avant / après | Par |
|---|---|---|---|---|---|
| A (0032-0034) | prod zabelie-digi | 2026-07-26T21:06Z | 21:12Z | zéros / zéros identiques (ok=true) | connecteur (session Claude, go porteur) |
| B1 (0035-0036) + 0039 | prod zabelie-digi | 21:14Z | 21:17Z | inchangé (ok=true) | idem |
| 0042 puis 0041 | prod zabelie-digi | 21:17Z | 21:18Z | inchangé (ok=true) · backfill 0 ligne | idem |
| 0055 (audit admin) | prod zabelie-digi | 2026-08-10T22:14Z | 22:14Z | appliquée AVANT la fusion de #88 (supprime la fenêtre 503 du fail-closed) ; répétée sur schéma prod-conforme (sans les dormantes) avant application | hash `274f4a2b013a` |
| 0043 (suivi de remise) | prod zabelie-digi | 2026-08-09T19:05Z | 19:09Z | base vide : 0 commande, 0 paiement confirmé, 0 escrow, 0 produit physique | connecteur (session assistée, go porteur) |
| 0057 (catégories services) · 0040 (`in_stock`) · 0058 (panier) | prod zabelie-digi | 2026-08-11T03:12Z | 03:20Z | inchangé — aucune de ces trois ne touche un solde | connecteur (session Claude, go porteur) |
| **0037 + 0038 (B2 — stock sur le money-path)** | prod zabelie-digi | 2026-08-11T03:4xZ | 03:47Z | **0 portefeuille en écart, avant comme après** | idem. Empreintes exécutables des 4 fonctions identiques à une répétition CONFORME À L'ÉTAT APPLIQUÉ (0040 avant 0037, comme en prod), sonde éprouvée connu-positif ET connu-négatif |
| _restent : 0031 (fidélité, sautée) · 0051 · 0052 · 0053 · 0054 · 0056 (purge avis, verrouillée D-10→D-14)_ | | | | | |
### ⛔ La mutation bénigne ne peut PAS être exécutée par l'agent

**Constaté le 2026-08-11, après la fusion de #88.** Deux empêchements, aucun
contournable, et le second est le plus important.

1. **Aucune session admin.** La route `/api/admin/user-status` exige
   `getCurrentUser()` avec le rôle admin. L'agent n'a pas de session, et un mot
   de passe ne se demande pas.
2. **Le réseau de la session refuse `zabelie.com`.** Vérifié :
   `gateway answered 403 to CONNECT — host zabelie.com:443`, dans le journal du
   proxy. La production n'est pas joignable en HTTP depuis ici.

⚠️ **ET SURTOUT — il ne faut PAS la simuler.** L'agent a un accès service-role
à la base : il pourrait insérer une ligne dans `zabelie_admin_actions` en une
instruction. **Ce serait un faux.** La ligne serait indiscernable d'une vraie
dans la table, alors que sa provenance ne serait pas le code déployé mais
l'agent lui-même — exactement le geste que la règle dure n°5 existe pour
interdire, commis sur le journal d'audit, et pour sa PREMIÈRE ligne.

Ce qui doit être fait, par le porteur, dans cet ordre :

1. vérifier que Vercel a bien déployé `de898f68` (Production) ;
2. se connecter en admin, aller sur `/admin`, **suspendre puis réactiver** le
   compte de test — deux actes, deux lignes attendues ;
3. le dire ici.

Les quatre preuves seront alors mesurées côté base, dans la même session :
`zabelie_admin_actions` avec horodatage et `actor_id`, la forme `domaine.verbe`
de `action`, la requête intention-orpheline à zéro, et le fait que ces lignes
viennent du code déployé — pas d'une main.

### 📒 Les huit dettes du registre — nommées, aucune entamée (2026-08-11)

Mesurées, chacune avec sa requête. **Aucune ne se referme avant la fusion de
#87/#88** : le prochain geste est la fusion, pas une mesure de plus.

| # | Dette | Périmètre EXACT (mesuré) |
|---|---|---|
| 1 | **Registre incomplet** | **30 lignes** manquantes : `0001`→`0024` (présentes dans `supabase_migrations`, absentes du nôtre) **+ `0025`→`0030`** (dans AUCUN des deux journaux). Les six fichiers existent et leurs objets sont tous en schéma — vérifié : `zabelie_wallet_ledger_guard`, `products_status_created_idx`, `zabelie_topup_reserve_order` avec son `pg_advisory_xact_lock`, `zabelie_coupon_consume` dans `confirm_payment`. Backfill légitime (importer un enregistrement réel n'invente rien). ⚠️ La date d'application de `0025`→`0030` est **déduite par encadrement**, pas attestée : la ligne dira « présence constatée en schéma, application datée par encadrement `[0024, 0041]` », jamais une date. |
| 2 | ✅ ~~**Divergence `0044_commission_floor`**~~ — CLOSE le 2026-08-12 | **Réponse porteur : « c'est possible, je ne me souviens pas ».** C'était l'une des trois réponses que cette ligne déclarait enregistrables, et elle est **définitive** : l'attestation de contenu n'arrivera jamais. `0063` l'inscrit donc `preuve = 'sonde_schema'` — appliquée (sonde : `floor(` dans `zabelie_commission_htg`), empreinte de ce qui a tourné perdue. **Et une mesure a été faite ce jour-là, qui vaut d'être gardée** : sur les 26 lignes dont la date a été SAISIE à la main puis croisée avec le journal interne, l'écart maximum est de **377 secondes** et le moyen de 141 — 26 fois sur 26. La tenue de ce registre a donc été éprouvée contre une source indépendante, et elle tient. ⚠️ Ce qui suit est une **inférence, pas une preuve** : `0044` est la seule ligne appliquée dont la date soit saisie *et* sans journal pour la contredire ; sa date du 3 août est **crédible par la méthode**, pas attestée. Ne pas la promouvoir en fait mesuré. — *Ancien libellé* : Déclarée appliquée chez nous (hash réel, 2026-08-03), **jamais vue par `apply_migration`**. Appliquée par un autre chemin. ⛔ **Attente d'attestation porteur** : « avez-vous appliqué `0044` via l'éditeur SQL vers le 3 août ? » Oui/non/je ne sais plus — les trois sont enregistrables. On inscrit une provenance **attestée**, jamais **déduite**. |
| 3 | ✅ ~~**Les 16 `applied_by = 'postgres'`**~~ — **FAIT le 2026-08-12 par `0064`, sur signal porteur** | **Mesuré avant d'écrire : 15, pas 16.** L'écart est explicable et vérifié — `0031` en faisait partie, et `0063` avait mis son `applied_by` à NULL n'ayant jamais été appliquée. **Le piège était la requalification EN BLOC** : elle aurait rangé `0055_admin_audit.sql` sous « non renseigné », alors que c'est la seule ligne dont la provenance soit connue à la seconde — et que cette provenance EST l'incident qui a fait écrire la règle 5. L'outil chargé de porter la mémoire de la faute l'aurait effacée, proprement. Elle porte donc `agent (sans signal porteur — incident du 2026-08-10 22:14:26Z, regle 5)`, et une post-condition refuse qu'elle tombe dans le fourre-tout. Les 14 autres : `non renseigne (anterieur a regle 5)` — plusieurs sont reconstituables de mémoire, aucune ne l'a été : une provenance se lit dans une trace. Contrainte pour l'avenir : `applied_by <> 'postgres'`, éprouvée en production (insertion refusée, insertion valide acceptée puis retirée). État final : 30 `inconnu` · 14 `non renseigne` · 12 `porteur` · 1 `agent (incident)` · 6 NULL. |
| 4 | **`0031` à classer `abandonnee`** | Seule ligne ni en A, ni en B, ni en C. Hash `-`, absente de Supabase, sautée à dessein. `0062` la classera. |
| 5 | ✅ ~~**Préambule de garde des migrations**~~ — **APPLIQUÉ le 2026-08-12 (`0065`), sur signal porteur** | `select zabelie_migration_garde('<son propre nom>')` en **première instruction exécutable**, à partir de `0066`. Jamais rétroactif : l'injecter dans un fichier déjà haché changerait son empreinte. **Mesuré avant d'écrire, et ça change le discours sans changer la décision** : aucun rejeu n'a jamais eu lieu (51 noms au journal interne, 0 doublon), 29 migrations sur 64 rejoueraient en silence, mais **aucune ne serait endommagée** — les deux seules qui mutent des données posent une valeur absolue. Le garde ne corrige donc rien ; il protège la 65ᵉ migration, comme le bail de `0060` protégeait le 8ᵉ cron. **Limite écrite dans l'en-tête, pas cachée** : il lit le registre tenu à la main, donc « appliquer sans inscrire » le rend muet. **Question laissée ouverte à dessein** : lire le journal interne serait plus sûr, mais on ignore s'il inscrit sa ligne AVANT ou APRÈS l'exécution — un garde qui verrait sa propre ligne bloquerait toute première application. Le garde **compte et journalise** au lieu de parier. **Éprouvé EN PRODUCTION après application** : inconnue → passe · `redigee` → passe (le cas d'une dormante qu'on applique enfin) · `appliquee` → `ZB065` · nom malformé → `ZB065` · zéro droit client. ⚠️ **Limite découverte à l'application, et elle vise le canal, pas le garde** : l'outil MCP **ne remonte pas les `raise notice`**. L'observation du journal interne écrit donc dans un canal illisible d'ici — un instrument qui mesure sans qu'on puisse lire, c'est-à-dire pas un instrument. `0065` est appliquée, son fichier ne bouge plus : **c'est à `0066` de capter l'observation dans une TABLE** au lieu d'un `notice`, et ce sera d'ailleurs son premier passage gardé. |
| 6 | **Chantier des dormantes** | Application ordonnée : lesquelles vivent, lesquelles passent `abandonnee`. Croise D-10→D-14 pour `0056`. |
| 7 | **D-10→D-14, avec la question `disputed`** | Posée dans `docs/28` : l'acheteur d'une commande `disputed` ne reçoit plus rien depuis `0061`. |
| 8 | **Revue des écrivains multiples par statut** | Instrument CANDIDAT (section dédiée plus bas). À passer une fois à la main avant le lancement. |

**Règle amont, appliquée sans exception** : toute assertion d'état sur une
table s'accompagne, **dans le même bloc**, de la requête qui l'a établie. Deux
assertions fausses ont été publiées le 2026-08-11 faute de ce geste — les deux
en lisant la STRUCTURE d'une table et en parlant de ses VALEURS.

### 📏 Règle — schéma et registre divergent : investiguer, jamais régulariser

Deux divergences sont possibles, elles n'ont pas la même gravité, et **aucune
ne se répare en silence**.

**A · Objet en base SANS ligne au registre.** Le cas grave : l'objet n'a pas de
provenance, donc aucun geste officiel ne l'a créé. Dater son arrivée avant
toute chose (journaux Supabase, historique de connexions), identifier le geste,
et n'appliquer la migration correspondante qu'ensuite — l'appliquer par-dessus
régulariserait l'anomalie au lieu de l'élucider. **Jamais constaté à ce jour.**

**B · Migration au registre dont le FICHIER n'est pas dans `main`.** ✅ **RÉSOLU le 2026-08-11** pour `0055` : PR #88 fusionnée (`de898f68`) sur signal porteur — le fichier est dans `main`, et le code qui écrit dans le journal est déployable. Reste `0056`, sur la branche de la #90. Constaté :
`0055_admin_audit.sql`, appliquée le 2026-08-10 22:14:26Z, hash
`274f4a2b013a05ec…` identique au fichier de la branche de #88 (vérifié le
2026-08-11 : table, deux index, trigger `zabelie_admin_actions_immutable`, RLS
active, 0 droit anon, 0 ligne écrite). L'ordre a été inversé **à dessein** —
appliquer avant de fusionner supprimait la fenêtre où le code fail-closed
déployé aurait appelé une table inexistante. C'est la fusion qui n'est pas
venue.

Conséquence à garder en tête : **un acte d'administration sur l'argent ne
laisse aucune trace aujourd'hui**, puisque le code qui écrit dans ce journal
vit sur une branche. `zabelie_admin_actions` compte 0 ligne, et ce zéro-là
n'est pas « rien à signaler » : c'est « personne ne peut écrire ».

⚠️ **Et `0062` dira `appliquee` pour `0055`** — correctement, puisqu'elle sonde
le SCHÉMA, pas le déploiement. Les deux faits sont vrais et distincts ; ne pas
complexifier `0062` pour les confondre. C'est `tests/migrations-suite.test.ts`
qui tient le second, par le trou de numérotation.

### ✅ APPLIQUÉE le 2026-08-14 — `0070` (demandes de katye), sur signal porteur nommé

> **Signal** : donné EN AVANCE le 2026-08-14 via AskUserQuestion — « Oui —
> applique 0070 après fusion » — précisément parce qu'un « procède à la
> suite » ne nomme pas une écriture (règle dure n°5, leçon 0055 : un signal
> se donne, ne se déduit pas). Condition réalisée par la fusion de **#102**
> (atterrissage Z3+Z4 sur main, 19:42:51Z — les fusions empilées #100/#101
> avaient atterri dans les branches, pas dans main ; GitHub ne recible que
> si la branche de base est supprimée, leçon consignée dans #102).
> **Exécutant** : agent, par `apply_migration`, à **20:56:26Z** (journal
> `20260814205626`). Empreinte canonique croisée : **identique**
> (`md5 9b5f65113c3daa9349788e07b9005edb`). Registre : `sha256 879184cb…`,
> ligne inscrite dans le même tour, note citant le signal.

**Ce qu'elle change** : le circuit de modération des katye (arbitrage Z-C)
est vivant de bout en bout — le vendeur propose depuis son profil, l'admin
tranche sur `/admin/zones`, chaque décision journalisée dans
`zabelie_admin_actions`. Gardes en base : ZB070 d'entrée (cible = komin
active), ZB070 de décision (une fois, contenu intouchable), anti-doublon en
attente, RLS en-son-nom/les-siennes.

**Répétition prod-conforme préalable** : socle des **65** migrations
appliquées dans l'ordre réel du journal (58 au journal factice, registre
aligné 68 lignes) · `0070` passe, post-conditions comprises · **R1→R5
verts** · connu-négatif : rejeu refusé **ZB065** à la première instruction.

**Vérifié EN PRODUCTION après application** (lecture seule) : 2 triggers,
2 policies, RLS active, index anti-doublon présent, 0 demande — table neuve.

**Le chantier zones (`docs/33`) est LIVRÉ ENTIER** : 0069 + 0070 en base,
Z1→Z4 sur main, déployé. Reste porteur : la relecture native des graphies
kreyòl (seed + futurs katye acceptés), au registre.

### ✅ APPLIQUÉE le 2026-08-14 — `0069` (zones), sur signal porteur

> **Signal** : « applique 0069 », porteur, en session, 2026-08-14 — après la
> fusion de #98 (18:48Z), conformément à la séquence convenue. **Exécutant** :
> agent, par `apply_migration`, à **18:54:05Z** (journal `20260814185405`).
> Empreinte canonique du SQL reçu croisée avec le fichier du dépôt :
> **identique** (`md5 49588edbc7719000d4e8ba83a778fb49`). Registre :
> `sha256 5947c671…`, `preuve = journal_supabase`, ligne inscrite dans le
> même tour, note portant le marquage kreyòl.

**Répétition prod-conforme, sous le regard du porteur (même tour)** : socle
des **64** migrations appliquées rejoué dans l'ordre réel du journal interne
(57 lignes au journal factice, `0025`→`0030` et `0044` au rang numérique,
registre aligné 67 lignes) · `0069` passe, post-conditions ZB069 comprises ·
**Z1→Z6 verts** · connu-négatif : `0069` pré-inscrite `appliquee` → **rejeu
refusé `ZB065` à la première instruction**.

**Vérifié EN PRODUCTION après application** (lecture seule) : 10 depatman ·
19 komin · 5 katye · **0 orphelin** (la requête jour-J de `docs/33` §7) ·
2 triggers présents · RLS active. `profiles` gagne `zone_id` + `pwen_repe`,
`region_code` (0014) conservé et dérivé — la carte admin continue de compter.

**Ce qui reste** : PR-Z2 (filtre catalogue), PR-Z3 (UI vendeur/acheteur),
PR-Z4 (admin + modération des demandes de quartier) — sur branche neuve.
**Geste porteur** : relecture native des graphies kreyòl du seed (24 noms),
au même registre de dette que l'espagnol de `0052`.

### ✅ APPLIQUÉE le 2026-08-13 — `0068` (rendu de prestation), sur signal porteur

> **Signal** : « applique 0068 », porteur, en session, 2026-08-13 (répété une
> seconde fois pendant l'exécution). **Exécutant** : agent, par
> `apply_migration`, à **17:43:40Z** (journal interne `20260813174340`).
> Empreinte canonique du SQL reçu croisée avec le fichier du dépôt :
> **identique** (`md5 e0dff51d2b67512486546a77611b2e0a` des deux côtés).
> Registre : `sha256 fdb3fe20466ab48cb…`, `preuve = journal_supabase`,
> ligne inscrite dans le même tour.

**Ce qu'elle change** : le kind `service` entre dans la machine de remise de
`0043`. La porte `zabelie_open_fulfillment` admet `('physical', 'service')` —
liste explicite, jamais un « tout sauf » — et le filet orphelin
`zabelie_service_sans_suivi_sweep` couvre les escrow de service sans ligne de
suivi (réparable → ré-ouvert et verrouillé, délai ancré sur le paiement ;
tardif → file humaine, **zéro écriture** sur `escrow_entries`). `fichier`
reste hors machine : sa remise EST le téléchargement (`0059`).

**Répétition prod-conforme préalable** : socle des 63 migrations appliquées
rejoué dans l'**ordre réel** du journal interne (56 lignes au journal factice,
`0025`→`0030` et `0044` placées au rang numérique, registre aligné ligne à
ligne sur la production) · `0068` passe, post-conditions ZB068 comprises ·
suite **S1→S10 verte** (porte, verrou, déclaration, acceptation,
auto-acceptation par le sweep de `0043` NON modifié, filet réparable ancré sur
le paiement, tardif à instantané d'escrow intact champ par champ, identité
`0033`) · connu-négatif : `0068` pré-inscrite `appliquee` → **rejeu refusé
`ZB065` à la première instruction**.

**Vérifié EN PRODUCTION après application** (lecture seule) : la porte admet
le service PAR SA CONDITION et `fichier` reste dehors (les deux sondées sur
`pg_get_functiondef`) · ACL du filet = `postgres` + `service_role` seulement ·
`zabelie_fulfillment` à 0 ligne et 0 escrow de service — **aucun dossier
rétroactif touché**, exactement comme l'en-tête l'annonce.

**Ce qui reste en dehors de ce geste** : (a) l'**appelant** du filet — le bloc
`services` de `app/api/fulfillment/sweep/route.ts` vit sur la branche
`claude/zabelie-talent-geolocation-map-74apxa`, il tournera à la prochaine
fusion ; d'ici là le filet est dans le même état « fonction sans appelant »
que `0047` jadis, mais **tracé ici** et gardé par `tests/service-rendu.test.ts`
qui échouera si le câblage disparaît. (b) `0067` reste **rédigée non
appliquée** (aucun signal) : l'observation du garde de `0068` est donc partie
dans le canal `notice`, illisible par MCP — première application qui aurait pu
la capter en table, et c'est mesuré, pas regretté : `0067` attend son signal.

**Addendum (revue du tour, mesuré sur `origin/main`)** : la fenêtre
« fonction sans appelant » est PLUS ÉTROITE que le paragraphe (a) pouvait le
laisser croire. Le code déployé couvre déjà tout le parcours nominal d'un
service payé — ouverture appelée sans condition par les trois rails
(`lib/fulfillment.ts:197`), auto-acceptation J+7 par le sweep déployé (branche
sans filtre de kind), déclaration et confirmation sans mention de kind
(`fulfillment/declare` · `fulfillment/received` · `fulfillment-actions.tsx`,
0 occurrence chacun). Seul l'échec de l'appel d'ouverture reste sans filet
jusqu'à la fusion. La décision d'ouvrir la vente avant ou après est au
registre des décisions, ci-dessus.

### ✅ APPLIQUÉES le 2026-08-12 — `0054` puis `0066`, sur signal porteur

> **Signal** : demandé en session le 2026-08-12, **après levée d'ambiguïté** —
> le message disait « applique 004 puis 0056 ». `004` n'existe pas, et `0056`
> porte un arrêt que le porteur avait posé lui-même (D-10→D-14). Question
> posée, réponse : **`0054` puis `0066`**. `0056` **reste bloquée**.
> **Exécutant** : agent, par `apply_migration`. Empreintes exécutables du SQL
> reçu croisées avec les fichiers du dépôt : **identiques pour les deux**.

**Les valeurs ne changent pas** : 10 % standard, 6 % Elite, commission sur
25 HTG toujours à 2 (règle `floor`, D-4). Ce qui change, c'est qu'un futur
`UPDATE` du taux sera **suivi par l'écran** au lieu d'être trahi par lui.

| | rôle |
|---|---|
| `0054` | la table de config, le trigger anti-suppression, la borne à 30 %, et `commission_rate_bps` qui lit la table |
| `0066` | **première migration gardée par `0065`** — expose les taux à l'écran vendeur par une fonction `security definer`, `authenticated` seulement |

**Éprouvé EN PRODUCTION après application** : suppression d'un taux →
**refusée** · taux à 60000 (le fat-finger) → **refusé** par la borne ·
`UPDATE` à 850 → **affiché et facturé passent tous deux à 850**, puis valeur
restaurée à 1000 dans la même transaction · 0 exposition à `anon` · invariant
`0033` à 0.

Cas connu-négatif joué en répétition : **`0066` sans `0054` lève `ZB066`** et
dit quoi appliquer d'abord.

⚠️ **Ce que ça ne prouve pas** : que l'écran affiche le bon chiffre. La chaîne
TypeScript est gardée par `tests/commission-config.test.ts` (quatre mutations,
quatre rouges), mais la preuve d'écran est un vendeur qui saisit un prix — et
elle attend `docs/22`.

**Registre après** : 63 `appliquee` · 2 `redigee` (`0051`, `0056`) ·
1 `abandonnee`.

### ✅ APPLIQUÉES le 2026-08-12 — `0053` puis `0052`, sur signal porteur

> **Signal** : « applique 0053 puis 0052 », porteur, en session, 2026-08-12.
> **Exécutant** : agent, par `apply_migration`. Empreintes exécutables du SQL
> reçu croisées avec les fichiers du dépôt : **identiques pour les deux**.
> `applied_by = 'porteur (session assistee)'`.

| | empreinte canonique | effet mesuré après |
|---|---|---|
| `0053` | `5d13a074932273d7…` | `retention_days` **180 → 90**, table à 0 ligne, garde `ZB053` franchie |
| `0052` | `2f938dc02aedcc62…` ⚠️ **nouvelle** | colonne `label_es` créée, **135 catégories traduites, 0 sans traduction** |

**La répétition contre l'état appliqué réel a payé, et c'est le fait du
tour.** `0052` a été écrite le 2026-08-02 et couvrait 124 slugs. `0057` a été
appliquée le 2026-08-11 et a créé 12 feuilles sous `sevis-pwofesyonel`. La
production en portait donc **135** : la garde `ZB052` — celle qui échoue si
une seule catégorie reste sans traduction — **refusait l'application**. Cas
connu-négatif joué sur socle prod-conforme : l'ancienne version est refusée et
la garde **nomme les douze**. Le fichier a été complété le jour même, d'où une
empreinte nouvelle au registre.

⚠️ **Les douze traductions espagnoles sont de l'agent**, calquées sur les
libellés français et anglais déjà en base, **non relues par un hispanophone**.
C'est écrit dans le fichier. `bote-ak-swen` reprend volontairement le libellé
du département `bote-swen` : le français et l'anglais le font déjà, et lever
l'ambiguïté serait une décision de nommage, pas une traduction.

**Ce que `0052` supprime au passage** : le double aller-retour SQL de
`lireCategories`. Chaque lecture de catégories tentait la requête avec
`label_es`, recevait `42703`, puis la rejouait sans la colonne. Le menu
d'accueil, la taxonomie et `/vendre` payaient deux requêtes là où une suffit.

**Ce que `0053` verrouille** : appliquée **avant** la pose de
`SEARCH_FINGERPRINT_SALT`, donc aucun terme de recherche n'aura jamais été
conservé sous l'ancienne règle de 180 jours. Appliquée après, une cohorte
l'aurait été — c'est le seul point où attendre coûtait quelque chose
d'irréversible.

**Registre après** : 61 `appliquee` · 3 `redigee` (`0051`, `0054`, `0056`) ·
1 `abandonnee`. Invariant comptable `0033` : 0 écart.

### 🗂️ CHANTIER DES DORMANTES — état MESURÉ le 2026-08-12

> Les cinq dormantes ne sont pas cinq fois la même question. Deux sont
> mécaniques, une est un piège si on l'applique seule, une reporte sa propre
> décision, une reste bloquée. Mesuré une par une, jamais relu du registre.

| # | ce qu'elle fait vraiment | ce que coûte le statu quo | nature |
|---|---|---|---|
| **`0052`** `label_es` | ajoute la colonne + traduit 123 rayons | ⚠️ **un aller-retour SQL DOUBLÉ à chaque lecture de catégories.** `lireCategories` (`lib/taxonomy.ts:301`) tente la requête avec `label_es`, reçoit `42703`, et **rejoue sans la colonne**. Le repli est correct et documenté — il paie juste deux requêtes là où une suffirait, sur un marché défini par la bande passante faible. Concerne le menu d'accueil, la taxonomie et `/vendre`. | **mécanique** — aucun arbitrage |
| **`0053`** rétention 90 j | 180 → 90 jours sur les termes de recherche | rien aujourd'hui : `zabelie_search_misses` = **0 ligne**, la capture est éteinte (`SEARCH_FINGERPRINT_SALT` absente). ⭐ **Mais l'ordre compte** : appliquée MAINTENANT, sur table vide, aucun terme ne sera jamais conservé sous l'ancienne règle de 180 j. Appliquée après la pose du sel, une cohorte aura été capturée sous 180. | **mécanique**, et le bon moment est *avant* |
| **`0054`** config commission | crée `zabelie_commission_config` | ⛔ **PIÈGE : aucun lecteur, ni TypeScript ni SQL.** Vérifié. Le taux vit dans `lib/commission.ts` (`standard: 1000, elite: 600`). L'appliquer seule créerait une table que personne ne lit, avec l'apparence de satisfaire la règle dure n°3 — et quiconque changerait la table plus tard ne verrait **aucun effet**. Classe « artefact sans appelant », version la plus coûteuse : sur un paramètre d'argent. | **à appliquer AVEC son câblage**, jamais seule |
| **`0051`** rayon klerin | insère UNE catégorie, `active = false` | rien — et c'est le point : le rayon serait **invisible**. L'appliquer n'engage donc rien ; la décision (clairin = alcool : cadre légal, règles des rails de paiement) se prend le jour où quelqu'un passe `active = true`. | **reporte sa propre décision** |
| **`0056`** purge des avis | purge les avis envoyés > 90 j | rien : **0 avis envoyé**, 0 ligne de `zabelie_fulfillment`, 4 commandes au total. Le sweep journalise `purges: -1`, dégradation prévue et visible. | ⛔ **bloquée** par D-10→D-14 (`docs/28`) — un avis est une pièce du futur suivi des litiges |

**Ce que ce tableau ne dit pas** : aucune de ces cinq n'est sur le chemin de
la première vente. Le blocage réel reste `SUPABASE_SERVICE_ROLE_KEY`.

⚠️ **Une fausse alerte, consignée parce qu'elle vaut la mesure.** En traçant
`0052`, un `grep` a montré `label_es` dans le `select` de
`lireRayonsPublication`, appelée par `/vendre` — donc, apparemment, un
formulaire vendeur dont la liste de rayons revenait vide et un `<select
required>` insubmersible. Faux : `lireCategories` est le helper TOLÉRANT, et
son repli était écrit le 2026-08-10 en citant l'état mesuré de la production.
Un `grep` qui montre une colonne dans une requête ne prouve pas que la
requête échoue.

### ✅ APPLIQUÉE le 2026-08-12 — `0063`, le registre complet

> **Signal** : « complète le registre avec les 35 lignes manquantes »,
> porteur, en session, le 2026-08-12. **Exécutant** : agent, par
> `apply_migration` sur `ddditxykopuxxqzgkqwy`. Empreinte canonique
> `9f6940d9c7eac64b…`, `applied_by = 'porteur (session assistee)'`.

**Fidélité de transcription** : empreinte exécutable du SQL reçu par la base
croisée avec le fichier du dépôt — **identiques**. **Invariant `0033`** :
0 écart. **Sondes négatives en production**, dans un bloc à exception donc
sans résidu : `preuve` hors énumération → refusée · `redigee` avec une preuve
d'application → refusée · `appliquee` sans preuve → refusée.

**Ce que la répétition a trouvé et que la relecture n'avait pas vu — trois
défauts, dont deux auraient été invisibles en production :**

1. **`applied_at` porte `default now()` depuis `0041`.** Omettre la colonne à
   l'insertion datait TRENTE migrations de juillet du jour où le registre a
   été rempli. Le SQL était correct à lire, faux à exécuter.
2. **`0062` porte une sonde MORTE pour `0053`** — `where key = 'retention_days'`
   sur `zabelie_search_config`, une table à ligne unique qui n'a ni `key` ni
   `value`. Elle n'a jamais tourné, faute de ligne `0053` au registre, donc
   rien ne l'a signalée. `0063` l'avait recopiée ; la répétition CI l'a fait
   tomber. `0062` est appliquée, son fichier ne bouge plus : la sonde corrigée
   vit dans `0063`.
3. **Une première version vérifiait « 62 lignes dont 56 appliquées ».** Verte
   en production, elle aurait cassé `sql-tests` au premier passage : la CI
   applique tout dans l'ordre des noms et les cinq dormantes y sont
   appliquées. Ce qui dépend de l'environnement est désormais SONDÉ.

Et un quatrième, trouvé en relisant le fichier généré et non par une
répétition : le générateur passait `null` à sa fonction de citation, qui
rendait fidèlement la CHAÎNE `'null'` — 49 notes en étaient remplies, et les
quatre répétitions étaient vertes parce que **rien n'assertait sur `note`**.

**Éprouvée dans les deux mondes** : CI (ordre des fichiers, suite SQL verte)
et socle prod-conforme reconstitué à l'identique — 27 lignes, ordre
d'application réel, faux journal interne pour que les post-conditions fortes
s'exécutent vraiment au lieu d'être sautées. **Quatre cas connus-négatifs,
tous rouges** : sonde cassée, classification divergente de `0062`, ligne
`journal_supabase` sans entrée au journal, ligne inconnue de `0063`.

⚠️ **Ce que ça ne prouve pas.** Que le fichier du dépôt soit ce qui a tourné
pour `0025`→`0030` et `0044` : leur empreinte est perdue, et `preuve =
'sonde_schema'` le dit au lieu de le masquer.

### ✅ APPLIQUÉES le 2026-08-12 — `0059`→`0062`, sur signal porteur

> **Règle dure n°5 — la trace du « qui a autorisé », écrite dans le tour où
> l'écriture a eu lieu.**
>
> **Signal** : « applique 0059 à 0062 avec statut renseigné », porteur, en
> session, le 2026-08-12. **Exécutant** : agent, par `apply_migration` sur le
> projet `ddditxykopuxxqzgkqwy`, une migration par appel.

| # | empreinte canonique (sha256, commentaires retirés) | `statut` inscrit |
|---|---|---|
| `0059_fichier_sans_livrable.sql` | `8385574ab8c7623a2b…` | `appliquee` |
| `0060_cron_leases.sql` | `fd72322aa965806b6f…` | `appliquee` |
| `0061_outbox_notifications.sql` | `05bd4f4f81c02b15f7…` | `appliquee` |
| `0062_registre_statut.sql` | `b8a0ff69218d9fe51f…` | `appliquee` |

`applied_by = 'porteur (session assistee)'` sur les quatre lignes, et le
`note` de chacune porte la phrase du signal. La colonne `applied_by` existait
depuis `0041` et n'avait jamais servi à ça.

**Ce qui a été vérifié APRÈS, et comment :**

* **Fidélité de transcription** — l'empreinte exécutable de ce que la base a
  reçu (`supabase_migrations.schema_migrations.statements`, commentaires
  retirés, espaces réduits) a été comparée à celle des fichiers du dépôt :
  **identiques sur les quatre**. Sans ce croisement, le hash inscrit décrirait
  le fichier et non ce qui a tourné — exactement l'écart que
  `scripts/zabelie-migration-hash.mjs` a été écrit pour fermer.
* **Objets** — `zabelie_fichier_sans_livrable_sweep`, `zabelie_cron_leases`,
  `zabelie_outbox`, ses 2 lignes de seed, et le trigger
  `zabelie_outbox_paiement_confirme` (post-condition `ZB061` franchie à
  l'application). **0 droit** résiduel `anon`/`authenticated` sur les trois
  nouvelles tables.
* **Registre** — 27 lignes : **26 `appliquee`, 1 `abandonnee`** (`0031`).
  Conforme à la répétition (22 + 4 = 26).
* **Invariant comptable `0033`** — **0 compte en écart** après le lot.
* **Sondes NÉGATIVES en production**, parce qu'un garde jamais mis en échec
  n'a rien démontré : ligne sans `statut` → refusée (`not_null_violation`) ;
  `statut = 'peut-etre'` → refusé (`check_violation`) ; `statut = 'redigee'` →
  acceptée, puis ligne d'essai retirée. Les trois dans un bloc à exception,
  donc sans résidu.
* **File humaine** — `action_required` à **0** : `0059` crée la fonction, elle
  ne l'exécute pas. Le premier passage sera celui du cron, et son journal
  (`fichiers_signales`) est la preuve d'exécution — pas ceci.

⚠️ **Ce que cette application ne prouve pas.** Que le code déployé appelle ces
objets. `lib/outbox.ts`, `lib/cron-lease.ts` et le balayage digital sont dans
`main`, mais **le déploiement Vercel doit avoir promu `main` après la fusion
de #90** pour que l'outbox soit drainée. `zabelie_outbox` à 0 ligne est
attendu tant qu'aucune commande ne passe à `paid` — et ne se distingue pas
d'un trigger qui ne tirerait pas. La distinction se fera à la première vente.

### ✅ RÉPÉTITION FAITE le 2026-08-12 — `0059`→`0062` sur état appliqué réel : PRÊTES

Socle **prod-conforme** : uniquement les migrations appliquées, dans l'ordre
d'application constaté, **et les 23 lignes du registre recopiées depuis la
production** — sans elles la boucle de reprise de `0062` ne classe rien, la
limite exacte que la CI avait rendue visible.

| scénario | résultat |
|---|---|
| **1** · `0059`→`0062` dans l'ordre | ✅ les quatre s'appliquent. Classement : `0031` → **abandonnee**, les 22 autres → **appliquee** |
| **2** · `0062` SEULE, sans `0059`/`0060`/`0061` | ✅ `0051`, `0054`, `0056`, `0059`, `0060`, `0061` → **redigee**. Les sondes des lignes 51-52 et suivantes ont été exécutées pour la PREMIÈRE fois, et elles discriminent |
| **3** · état du registre PENDANT la migration | ⚠️ voir ci-dessous |
| **4** · objet déjà présent, `0055` rejouée | ✅ échoue bruyamment : `relation "zabelie_admin_actions" already exists` |
| suite SQL complète | **28 verts, 2 rouges** — `commission_config` (réclame `0054`) et `points_caps` (réclame `0031`), tous deux ÉTRANGERS à ce lot |

**Scénario 3 — la réponse dépend de l'outil d'application, et ça se décide.**
`0062` procède en trois temps : colonne ajoutée *nullable*, remplie, puis
contrainte `not null`. Appliquée par `apply_migration`, le tout tient dans UNE
transaction : aucun lecteur ne voit d'état mi-classé. Appliquée par `psql`
sans `-1`, chaque instruction est sa propre transaction et une fenêtre existe
où `statut` est NULL pour certaines lignes. → **appliquer `0062` par
`apply_migration`**, pas au fil de l'eau.

**⚠️ DÉCOUVERTE que le plan ne prévoyait pas.** Après `0062`, insérer une
ligne de registre **sans `statut` est REFUSÉ** :

```
ERROR: null value in column "statut" violates not-null constraint
```

C'est fail-closed et c'est voulu — on ne peut plus ajouter une migration au
registre sans dire son état. Mais la conséquence est immédiate et pratique :
**les lignes de `0059`, `0060`, `0061` et `0062` elles-mêmes devront porter
`statut` à l'insertion.** Sans quoi le geste habituel échouera, bruyamment,
juste après l'application. C'est exactement le genre de chose qu'une
répétition existe pour trouver — le plan ne la contenait pas.

### 🧪 Scénarios que la répétition de `0060`/`0061`/`0062` DOIT couvrir

Sur socle prod-conforme à l'état appliqué réel, et pas seulement « ça passe » :

1. **`0062` appliquée après `0060`/`0061`** → les deux classées `appliquee`.
2. **`0062` appliquée SEULE**, sans `0060`/`0061` → les deux classées
   `redigee`, sans échec. Les sondes existent dans la migration ; elles n'ont
   **jamais été exécutées**.
3. **Ce que rend le registre PENDANT que `0062` le migre** — la colonne est
   ajoutée nullable, remplie, puis contrainte : vérifier qu'aucune lecture
   concurrente ne voit un état mi-classé.
4. **Objet déjà présent, version divergente** — le jour où #88 fusionne,
   `0055` sera rejouée sur une table qui existe. Elle utilise `create table`
   sans `if not exists` : elle **échouera bruyamment**, ce qui est le bon
   comportement — mais il faut l'avoir vu une fois plutôt que le découvrir.

### 🔬 Instrument CANDIDAT — revue des écrivains multiples par statut

**Non construit. Noté pendant que la liste est fraîche, à mesurer avant de
l'outiller — la même discipline que pour le reste.**

D'où ça vient : la meilleure prise du 2026-08-11 n'a été trouvée ni par la CI,
ni par le harnais de mutation, mais par une **question de forme fixe** —
*« combien de fois cette colonne de statut change-t-elle, et dans quelles
branches ? »*. Posée sur `payments.status`, elle a révélé que `confirm_payment`
écrit `'confirmed'` en DEUX endroits (`0038:176` et `0038:189`), et que le
premier est la branche de rupture de stock. Un trigger posé là aurait envoyé un
reçu de vente pour une marchandise que l'acheteur ne recevrait jamais.

Ce qui rend la question outillable : elle ne dépend d'aucune connaissance
métier. Elle se pose **mécaniquement sur n'importe quelle colonne de statut du
schéma** — `orders.status`, `payments.status`, `escrow_entries.status`,
`zabelie_fulfillment.status`, `zabelie_topup_orders`… : lister tous les sites
d'écriture, et pour chaque valeur cible, vérifier que les branches qui y mènent
sont bien celles qu'on croit.

**À faire tourner UNE FOIS avant le lancement**, à la main s'il le faut. Si la
passe manuelle trouve quelque chose, alors seulement écrire l'outil : un
instrument construit avant d'avoir mesuré son trou rendrait zéro et paraîtrait
sain.

### ⚠️ `confirm_payment` rouge peut vouloir dire « outbox », pas « MonCash »

**À savoir AVANT le premier incident, pas pendant.** Depuis `0061`, le dépôt du
reçu se fait par trigger DANS la transaction de `confirm_payment`. C'est ce qui
rend le reçu inséparable du commit de l'argent — et c'est donc du **fail-closed
sur le reçu** : si l'insertion en outbox échoue, `confirm_payment` échoue avec
elle, et le paiement n'est pas confirmé.

Choix assumé, pour une raison précise : un paiement **non confirmé** est
exactement le cas que le réconciliateur (`/api/reconcile`, 12:00) sait
reprendre — l'inverse du cas fermé par `0061`, où la commande déjà réclamée ne
repassait jamais. L'argent a bien quitté MonCash ; il sera confirmé au passage
suivant.

**Lecture d'incident.** Un `confirm_payment` en erreur ne désigne pas
forcément l'opérateur. Regarder aussi `zabelie_outbox` et `auth.users` (le
trigger y lit les adresses). Une adresse introuvable ne bloque rien — le
trigger n'insère alors aucune ligne, à dessein.

### Contrôle day-J — outbox des confirmations de vente (0061)

⚠️ **À lire dès le lendemain de l'application de `0061`, et pas plus tard.**
`RESEND_API_KEY` n'est pas posée : les lignes vont donc s'accumuler **par
construction**, et cette accumulation doit être un chiffre qu'on lit, pas un
silence. Un compteur à zéro sur cette requête ne voudra rien dire tant que la
clé manque — c'est « aucun cas possible », pas « aucun cas ».

```sql
-- Confirmations de vente en souffrance. Trois colonnes, trois lectures.
select
  count(*) filter (where sent_at is null and abandonne_a is null
                     and created_at < now() - interval '1 hour') as pendantes_1h,
  count(*) filter (where abandonne_a is not null)                as abandon_terminal,
  count(*) filter (where sent_at is not null)                    as parties
from zabelie_outbox;

-- Le détail de ce qui est mort, avec la raison — jamais un simple total.
select order_id, kind, attempts, left(last_error, 120) as erreur, abandonne_a
  from zabelie_outbox
 where abandonne_a is not null
 order by abandonne_a desc
 limit 20;
```

**Lecture.** `abandon_terminal > 0` veut dire qu'un acheteur a payé et n'a
jamais su que son argent était arrivé — cinq tentatives épuisées. Ce n'est pas
une statistique, c'est une liste de personnes à recontacter, et `last_error`
dit pourquoi. `pendantes_1h` élevé avec `abandon_terminal = 0` désigne le
fournisseur, pas les messages.
### Contrôle day-J — intentions d'audit orphelines (fail-closed 0055)

Le fail-closed écrit la trace AVANT la RPC : une ligne d'intention sans
résultat corrélé signifie « un admin a ordonné un acte d'argent qui n'a pas
abouti » — à lire au jour le jour, pas à découvrir en incident. La clé de
jointure est `target_id` = `orders.id` (qui joint `payments.idempotency_key`
et `orders.order_ref`). À exécuter chaque matin tant qu'un tableau de bord
ne le porte pas :

```sql
-- Intentions refund/confirm-zelle des dernières 24 h sans résultat corrélé.
-- 0 ligne = tout ce qui a été ordonné a abouti (ou était un doublon idempotent).
select a.created_at, a.action, a.actor_id, a.target_id, o.order_ref
from zabelie_admin_actions a
left join orders o on o.id::text = a.target_id
where a.created_at > now() - interval '24 hours'
  and (
    (a.action = 'order.refund'
       and (o.id is null or o.status <> 'refunded'))
    or
    (a.action = 'payment.confirm_zelle'
       and not exists (
         select 1 from payments p
         where p.idempotency_key = a.target_id
           and p.status = 'confirmed'))
  )
order by a.created_at desc;
```

Lecture : `order.refund` orphelin = la RPC a refusé (commande introuvable,
état invalide) APRÈS que l'ordre a été tracé — c'est le comportement voulu,
la tentative est l'événement. Un volume anormal d'orphelins, en revanche,
est un signal (admin qui insiste, bug de route, base qui refuse).


⚠️ **Trois contrôles restent NON ÉPROUVÉS** — la base était vide le jour de
l'application : le rapport de solvabilité à `ok=true` sur zéro ligne, le
contrôle croisé avant/après (zéro comparé à zéro), et le backfill de
`order_ref` (0 ligne touchée). Ils prouvent que le code s'exécute, pas qu'il
calcule juste. **Leur premier vrai test aura lieu à la première commande** —
relire les trois à ce moment-là, pas avant.

- [ ] **Corriger les empreintes du registre** — exécuter
      `ops/registre-empreintes-canoniques.sql` (8 lignes). Les empreintes
      enregistrées sont celles des fichiers alors que la chaîne appliquée
      avait des en-têtes abrégés : un signal de dérive qui se déclenche dès
      le premier jour est un signal qu'on apprend à ignorer.
- [ ] **Trancher l'accès en écriture de l'agent à la base de production.**
      Le connecteur Supabase a permis d'appliquer les migrations du 2026-07-26
      directement. Le « go » du porteur couvrait CES migrations ; il ne vaut
      pas autorisation permanente. À décider : on retire l'accès, on le garde
      en lecture seule, ou on le garde en écriture avec go explicite par lot.
      Tant que ce n'est pas tranché, aucune écriture supplémentaire.

Procédure : `docs/20-APPLICATION-MIGRATIONS-0032-0038.md` §B1.
La sortie de `zabelie_solvency_report()` va dans un **fichier horodaté**
(`ops/solvabilite-<phase>-<horodatage>.txt`), jamais seulement à l'écran :
c'est la référence de comparaison, elle doit survivre à la session.

- [ ] **`0046_policy_acceptance.sql` — attestation vendeur (R3).** Écrite,
      éprouvée sur Postgres jetable, **non appliquée**. Sans elle, les deux
      routes de création répondent 500 « Enregistrement de l'attestation
      impossible » : la case est déjà exigée côté serveur, mais la fonction
      `zabelie_record_policy_acceptance` n'existe pas encore en base.
      **Donc : appliquer 0046 AVANT de déployer, ou déployer et appliquer dans
      le même geste.** C'est le seul endroit de ce chantier où le code est en
      avance sur le schéma d'une façon qui BLOQUE, au lieu de dégrader.
      ⚠️ **Le coût d'une erreur d'ordre n'est pas une fiche, c'est une
      personne.** Les fiches qui échoueraient sont celles des vingt premiers
      vendeurs, recrutés un par un : un 500 à la publication devant l'un
      d'eux ne se répare pas par un correctif le lendemain.
      **Deux ceintures, qui ne remplacent pas l'ordre de déploiement :**
      `/api/admin/coherence` porte désormais `schemaRequis` — il crie si
      `0046` manque au journal, AVANT qu'un vendeur soit dans la pièce ; et
      si personne n'a regardé, la route de création journalise l'identifiant
      `0046` côté serveur pendant que le vendeur, lui, ne lit qu'une phrase
      courte (503, rien d'enregistré, réessayer).

- [ ] **`0047_search_demand.sql` — capteur de demande (lot S).** Écrite,
      éprouvée, **non appliquée**. Sans elle, la recherche fonctionne
      exactement comme avant : le rattrapage flou et le journal dégradent en
      silence (aucune erreur visible). Rien ne bloque.
      **Le cron de purge existe désormais** : `/api/search/purge`, déclaré dans
      `vercel.json` à 14 h 15 UTC. Il appelle `zabelie_purge_search_misses()`.
      Auparavant la fonction n'avait **aucun appelant** — elle était prouvée par
      les tests SQL et n'avait jamais tourné. Le croisement qui aurait dû le
      dire existe maintenant aussi : `tests/crons-appelants.test.ts`.
      **La sortie à lire chaque semaine** : `GET /api/admin/search-demand?jours=7`
      — et **au démarrage, `?jours=30&min_sessions=1`** : à faible trafic
      presque aucun terme n'atteint 3 sessions distinctes en 7 jours, la
      sortie par défaut resterait vide des mois durant et on croirait le
      capteur muet. Le mode ouvert est étiqueté `fiable: false` dans la
      réponse — il mélange demande réelle, robots et vendeurs qui testent
      leur fiche.
      ⛔ **NE PAS POSER LE POIVRE AVANT D'AVOIR LU LE JOURNAL DE LA PURGE.**
      L'ordre n'est pas un confort, c'est un préalable : poser le poivre ouvre
      la collecte de termes **en clair** à côté d'un `session_hash`, et la
      promesse de `0047` (« l'empreinte tourne chaque jour, ce n'est pas un
      suivi ») ne tient que si la rétention est effectivement bornée. Or **un
      cron déclaré n'est pas un cron exécuté** — secret absent, déploiement non
      promu, chemin renommé laissent tous l'entrée en place et ne produisent
      rien.
      ⚠️ **CE VERROU A UNE DÉPENDANCE QU'IL FAUT CONNAÎTRE MAINTENANT.** Le
      cron ne s'exécutera pas tant que le code n'est pas **déployé en
      Production**. Or ce cron vit sur `claude/api-v1-tool-ready` — la plus
      large et la moins relue des branches en attente. Le verrou place donc de
      fait le poivre **derrière la fusion d'une grosse PR**.
      Ce n'est pas un problème aujourd'hui : sans trafic, le capteur n'a rien à
      enregistrer avant la diffusion sur WhatsApp. Mais autant le savoir
      maintenant que le découvrir dans trois semaines. Si le poivre devient
      urgent avant cette fusion, la sortie est de porter les trois fichiers du
      cron (`app/api/search/purge/route.ts`, l'entrée `vercel.json`,
      `tests/crons-appelants.test.ts`) sur une branche minuscule et de fusionner
      celle-là — le cron ne dépend d'aucun autre morceau de cette branche.
      Préalable commun aux deux voies : **savoir quelle branche Vercel sert en
      Production** (première ligne des conditions ci-dessous).

      Ce qui compte comme preuve, et rien d'autre : dans les journaux Vercel,
      une ligne
      `[search/purge] {"at":"…","issue":"termine","purgees":N,"dureeMs":…}`
      — `N = 0` convient parfaitement, c'est la LIGNE qui prouve, pas le
      chiffre. La présence de `/api/search/purge` dans `vercel.json` ne prouve
      rien. Si rien n'apparaît le lendemain de la mise en production, vérifier
      `CRON_SECRET` puis déclencher à la main :
      `curl -X POST -H "Authorization: Bearer $RECONCILE_SECRET" https://…/api/search/purge`
      ⚠️ **`SEARCH_FINGERPRINT_SALT` — REQUISE (≥ 16 caractères), sans repli.**
      Sans elle, **rien n'est enregistré** et le journal reste vide : c'est
      voulu, mais ça se confond avec « personne ne cherche ». Le serveur
      journalise un avertissement au premier appel, et la réponse admin porte
      `collecte: "désactivée"` — regarde ce champ AVANT de conclure quoi que
      ce soit d'une liste vide.
      Aucun repli sur `SUPABASE_SERVICE_ROLE_KEY` : une rotation de clé
      casserait le comptage de sessions en milieu de fenêtre sans rien
      signaler, et une fuite reconstruirait rétroactivement les empreintes de
      tous les jours passés.
      **Rotation du poivre — au basculement de journée en Haïti, jamais en
      milieu d'après-midi.** Changer ce secret coupe le comptage de sessions
      distinctes des 7 jours suivants : une même personne compte deux fois de
      part et d'autre. En le faisant tourner à minuit America/Port-au-Prince,
      la discontinuité coïncide avec celle de l'empreinte quotidienne au lieu
      de s'y ajouter.
- [ ] **Après TOUTE modification de `zabelie_search_normalize`** : réindexer
      `zabelie_products_title_norm_trgm_idx` et `..._desc_norm_trgm_idx`, puis
      mettre à jour `zabelie_search_index_guard`. Sans ça les index gardent
      les valeurs de l'ancienne définition et le rattrapage écarte des
      produits **en silence** — PostgreSQL exige `IMMUTABLE` mais ne vérifie
      pas la promesse. Contrôle : `select * from zabelie_search_index_integrity();`
      **Il tourne déjà tous les jours** dans `/api/admin/coherence` (champ
      `indexRecherche`) : c'est le seul endroit où la dérive peut naître, la
      CI ne la verra jamais — sa base a toujours un index et une fonction
      fraîchement créés, donc toujours d'accord. **À relire juste après avoir
      appliqué une migration qui touche la fonction**, sans attendre le cron.
      — chaque terme vient avec un message Kreyòl prêt à coller dans WhatsApp.
      C'est le livrable, pas la recherche.
      ⚠️ **Ce capteur ne vaut rien à catalogue vide** : il mesurera que le
      catalogue est vide. Il devient utile entre 20 et 200 fiches — la fenêtre
      où une marketplace meurt d'habitude.

- [ ] **🔴 Protéger `main` — la CI existe et ne bloque rien.** Vérifié le
      2026-07-27 : `.github/workflows/ci.yml` exécute typecheck, tests, build,
      e2e et SQL ; et `main` est **`protected: false`**. Rien n'empêche donc
      de fusionner au rouge. C'est le détecteur non branché, une couche
      au-dessus du code — et le point de contrôle humain du dépôt est
      justement la PR.
      À faire dans les réglages GitHub : exiger les vérifications de statut
      avant fusion sur `main`.
- [ ] **⚠️ La branche par défaut du dépôt est `claude/install-skills-eGRxy`,
      pas `main` — et c'est un réglage égaré, pas une seconde ligne.**
      Mesuré le 2026-07-27 : `main` porte le dernier travail fusionné
      (« Merge pull request #54 », 2026-07-26) ; la branche marquée par défaut
      date du **2026-06-22** et ne contient même pas `lib/product-kind.ts`.
      **`main` est donc bien la ligne de production**, et le défaut pointe sur
      une branche abandonnée depuis un mois.
      Conséquence immédiate : une PR ouverte sans base explicite vise la
      mauvaise branche. **Remettre le défaut sur `main` AVANT de protéger quoi
      que ce soit** — protéger `main` pendant que le défaut est ailleurs ne
      protège rien.
      Bonne nouvelle pour l'ordre des gestes : la branche de travail est
      **42 commits en avance sur `main`, avec zéro divergence**. Protéger
      `main` maintenant ne bloque donc aucun travail en cours.
- [x] **`0048_objets_requis.sql`** — ✅ **APPLIQUÉE le 2026-07-31 23:30 UTC**
      (registre : `statut = appliquee`, `preuve = journal_supabase`).
      `/api/admin/coherence` répond donc bien `source: "présence"`.
      ⚠️ **Cette case est restée cochée « à faire » deux semaines de trop.**
      L'en-tête de la migration, lui, était corrigé dès le 2026-08-04 : les
      deux documents se contredisaient, et c'est ce fichier-ci qui avait tort.
      Constaté le 2026-08-18 en interrogeant le registre plutôt qu'un
      document. Rien de grave ici — mais c'est exactement la divergence
      déclaration/constat que `0048` existe pour traquer, reproduite un étage
      au-dessus, dans la prose.
      ⚠️ **Le vrai sujet : elle ne surveillait que 2 objets.** Écrite quand le
      dépôt comptait 48 migrations, jamais étendue depuis ; le code déployé en
      appelle **53**. Étendue à 54 par **`0085_objets_requis_v2.sql`**, et
      tenue synchrone du code par `tests/objets-requis-couverture.test.ts`,
      dans les deux sens.

## Les trois boucles manuelles — et leur somme

> Elles arrivent au même moment, sur la même personne. Le plafond de Zabelie
> n'est aucun des trois seuils pris isolément : **c'est leur somme.**

| Boucle | Coût unitaire | À 100 vendeurs actifs | À 300 |
|---|---|---|---|
| **Versements** MonCash (virement + consignation) | ~3 min | ~5 h/sem | ~25 h/sem |
| **Revue des fiches** (photo, prix, catégorie, politique) | ~3 min | ~2 h/sem | ~7 h/sem |
| **Litiges / `action_required`** (`0043`) | ~10 min | ~1 h/sem | ~3 h/sem |
| **Total** | — | **~8 h/sem** | **~35 h/sem** |

⚠️ **Ce tableau est de l'arithmétique, pas une mesure.** Les coûts unitaires
sont estimés ; 4 fiches/vendeur/mois et 1 retrait/vendeur/semaine sont des
hypothèses. La première commande réelle donnera le premier chiffre vrai.

**Conclusion opérationnelle** : le plafond d'une personne seule est autour de
**150 à 200 vendeurs actifs**, pas les 300 que le seul versement laissait
espérer.

### Seuil de la revue systématique — posé maintenant

**Au-delà de ~60 fiches par semaine**, la revue de chaque fiche cesse d'être
tenable en même temps que les deux autres boucles. À ce seuil, deux sorties,
et **une seule est honnête** :

- **un second relecteur** — la revue reste systématique, la promesse tient ;
- **une revue par échantillon** (priorité aux nouveaux vendeurs et aux
  catégories à risque) — mais alors **`/produits-interdits` §8 devient faux**.
  Ce paragraphe promet publiquement que chaque fiche est examinée avant sa
  mise en ligne. Le relâcher exige de **publier une v2 de la politique**, pas
  de changer discrètement de pratique : c'est précisément ce que la version
  sert à empêcher.

C'est la même mécanique que l'apurement manuel : une boucle qui ne casse
jamais franchement, qu'on saute une semaine chargée, puis deux.

## 🔒 CONDITIONS D'OUVERTURE — à lever AVANT la première transaction réelle

> Ce ne sont **pas des tâches**. Une tâche peut glisser d'une semaine à l'autre
> sans que rien ne se casse ; une condition d'ouverture a un moment de
> fermeture nommé, et ce moment est **la première commande réelle**
> (`docs/22-PREMIERE-COMMANDE-REELLE.md`).
>
> Pourquoi cette distinction plutôt qu'une case à cocher de plus : un écart
> consigné sans échéance devient une conformité par usure. Au bout de trois
> mois, plus personne ne se souvient que le contrôle n'a jamais tourné, et le
> vert de la CI se lit comme une preuve qu'il a tourné.

- [ ] **⚖️ D-4 — le sens de l'arrondi.** Déjà détaillée plus bas dans
      « Paiements ». Reprise ici parce qu'elle partage le même moment de
      fermeture : la ligne n°1 du registre doit dire sous quelle règle elle a
      été produite.

- [ ] **🔐 Isolation RLS des commandes — exécuter le test sous un VRAI JWT.**

      **Ce qui EST fait** (2026-08-02) : `supabase/tests/orders_rls_isolation.test.sql`
      exerce les policies réelles de `orders` sur un Postgres 16, avec six cas,
      et il est éprouvé par trois mutations qui le font tomber chacune sur le
      cas visé (policy acheteur retirée → cas 1 ; policy rendue permissive →
      cas 2 ; policy vendeur retirée → cas 4).

      **Ce qui N'EST PAS fait, et qu'il ne faut jamais présenter comme une
      conformité** : aucun JWT n'est émis, signé ni vérifié. `auth.uid()` est
      un **stub** qui lit un réglage de session (`supabase/tests/_bootstrap.sql`).
      Ce qui est exercé, c'est le **moteur de policies** avec une identité
      choisie — pas la chaîne complète « jeton GoTrue → PostgREST → policy ».

      **Pourquoi ça n'a pas été fait** : le test réel exige une branche
      Supabase, réservée au plan Pro (constaté le 2026-08-02 :
      `PaymentRequiredException — Branching is supported only on the Pro plan
      or above`). Le coût de la branche elle-même est négligeable —
      **0,01344 $/heure**, soit quatre centimes pour trois heures — mais
      l'abonnement mensuel ne l'est pas, et il a été jugé, à raison, un mauvais
      échange pour protéger un chemin que personne n'emprunte : **0 commande,
      0 produit, 1 profil** en base au moment de la décision.

      **Comment la lever, le jour venu** : passer le projet en Pro le temps
      d'une branche éphémère, y rejouer les migrations, créer deux acheteurs et
      un vendeur via GoTrue (vrais comptes, vrais jetons), appeler
      `/api/v1/get_user_orders` avec le jeton de chacun, vérifier qu'un
      acheteur ne voit que ses achats **et qu'un vendeur ne voit aucun achat**.
      Puis détruire la branche — et le **vérifier** par `list_branches`, pas le
      prévoir.

      **Ce que ça garde ouvert entre-temps** : si Supabase changeait la façon
      dont `auth.uid()` résout la revendication, ou si PostgREST cessait de
      propager le rôle `authenticated`, aucun test actuel ne le verrait.

- [ ] **💱 `USD_HTG_RATE` — POSER CETTE VARIABLE EST UN GESTE BLOQUÉ.**

      Aujourd'hui elle est vide (`.env.example:16`), et le checkout USD répond
      **422** plutôt que d'inventer un taux. C'est le bon comportement, et il
      rend le risque **dormant, pas absent**.

      **Le jour où tu la poses, tu fais trois choses d'un coup**, et rien dans
      le dépôt ne le dira à celui qui la posera — peut-être toi, dans trois
      mois, sans ce contexte : tu ouvres le rail **Stripe**, tu ouvres le rail
      **Zelle**, et tu **démarres une horloge** que personne ne surveille.

      **Deux préalables, à lever AVANT de renseigner la variable :**

      1. **Séparer les deux fonctions.** `usdCentsFromHtg` est aujourd'hui
         appelée sur un chemin d'AFFICHAGE (fiche produit, formulaire de
         recharge) **et** sur un chemin d'ÉCRITURE — `app/api/checkout/route.ts:209`
         → `payments.expected_usd_cents`, et
         `app/api/zabelie/topup/orders/route.ts:117` →
         `zabelie_topup_orders.expected_usd_cents`. Même fonction, même
         variable d'environnement, deux natures. Il faut deux fonctions
         distinctes, pour que le compilateur puisse dire laquelle est appelée
         où — sinon la garantie « affichage seulement » repose sur la
         vigilance.

      2. **Un mécanisme de fraîcheur.** Le bon comportement existe déjà, il
         suffit de l'étendre : ajouter `USD_HTG_RATE_AS_OF` à côté de la
         valeur, et rendre le **même 422** au-delà de N jours. Refuser plutôt
         qu'inventer, exactement comme le fait déjà l'absence de taux.

      **Pourquoi c'est plus grave qu'une réclamation.** `expected_usd_cents`
      est figé au checkout. La confirmation Zelle
      (`app/api/admin/confirm-zelle/route.ts:62`) et le webhook Stripe
      comparent le montant reçu à **ce chiffre figé**. Un taux périmé ne
      produit donc pas une erreur visible : il produit une **CONFIRMATION**.
      Le système déclare que tout va bien pendant que la plateforme absorbe
      l'écart de change.

- [ ] **⚖️ QUESTION OUVERTE — combien de temps `expected_usd_cents` reste-t-il
      opposable ?** (arbitrage porteur, du même genre que D-4)

      Un virement Zelle met plusieurs jours à arriver. Le montant en dollars
      est figé au moment du checkout. Donc :

      * **s'il n'expire jamais** — un acheteur peut virer trois semaines plus
        tard, au taux d'il y a trois semaines, et c'est la plateforme qui
        absorbe l'écart ;
      * **si le délai est trop court** — on invalide des paiements
        légitimement en route, ce qui est pire : l'argent est parti.

      Ce n'est pas un défaut à corriger, c'est un **nombre à choisir**. Et il
      doit être choisi **avant** d'écrire la séparation des deux fonctions,
      sinon la séparation sera à réécrire.

      Ni Claude ni personne d'autre que le porteur ne tranche ce nombre.

- [ ] **🧾 Première commande réelle** — `docs/22-PREMIERE-COMMANDE-REELLE.md`.
      C'est l'événement qui ferme les deux conditions ci-dessus. Il n'a pas
      lieu tant qu'elles ne sont pas levées **ou explicitement acceptées par
      écrit** — l'accepter est un choix légitime, l'oublier ne l'est pas.

- [ ] **`sharp` — risque ACCEPTÉ le 2026-08-02, à revoir avant le premier
      téléversement vendeur.**

      **Accepté sur un fait mesuré, pas sur une impression** : la base contient
      **0 produit**. Aucune image vendeur n'a jamais été téléversée, donc
      l'entrée non fiable qui atteindrait libvips **n'existe pas encore**. Le
      risque est réel mais entièrement FUTUR.

      `sharp@0.34.5` — version de l'arbre **INSTALLÉ**, pas de `package.json` :
      elle n'y figure pas, elle arrive par `next@16.2.10`. Avis
      GHSA-f88m-g3jw-g9cj, quatre CVE dans libvips, corrigé en `>= 0.35.0`.

      **Pourquoi ça n'a pas été corrigé.** `npm audit fix --force` proposerait
      un RECUL de `next` 16.2.10 → 14.2.35, incompatible avec React 19 —
      vérifié en `--dry-run`, jamais exécuté. Et forcer `sharp` par un
      `overrides` que Next n'a pas validé échangerait un risque futur contre un
      risque de rendu sur les photos produit, c'est-à-dire sur l'actif qu'on
      n'a pas encore.

      **Moment d'activation identifiable** : le PREMIER téléversement vendeur.
      Avant d'ouvrir cette surface, revérifier `sharp`.

      **Surveillance en place, sans rien à relire** :
      `tests/sharp-avis-securite.test.ts` est un test **INVERSÉ** — il échoue
      le jour où `sharp >= 0.35` apparaît dans l'arbre installé, et son message
      dit quoi faire. Une ligne de suivi demande qu'on pense à la relire ; ce
      test ne demande rien.

      ---

      ### ✍️ Signature — acceptation datée

      > **Réexamen fixé au 2026-11-03.** Accepté par **eliezerphilippe0-spec**
      > (porteur), le 2026-08-03.
      >
      > **Ce n'est pas une acceptation, c'est un report avec une échéance.** La
      > différence n'est pas rhétorique : une acceptation ne demande plus rien à
      > personne, un report a une date à laquelle quelqu'un doit revenir. Sans
      > cette date, l'avis GHSA-f88m-g3jw-g9cj cesse d'exister le jour où cette
      > ligne descend dans le fichier.
      >
      > **Deux événements rouvrent le dossier, et le premier qui arrive gagne :**
      >
      > 1. **Le 2026-11-03**, quelle que soit l'activité de la plateforme.
      > 2. **Le premier téléversement vendeur**, même s'il arrive demain — c'est
      >    lui qui crée l'entrée non fiable vers libvips, donc le risque réel.
      >
      > **Ce qu'il faudra refaire ce jour-là**, et pas seulement relire : mesurer
      > la version de `sharp` dans l'arbre **installé**
      > (`node -p "require('./node_modules/sharp/package.json').version"`, pas
      > `package.json`, où elle ne figure pas), vérifier si `next` a rattrapé
      > `sharp >= 0.35`, et refaire un `npm audit fix --force --dry-run` pour
      > voir si le recul de `next` 16 → 14 est toujours le prix à payer.
      >
      > ⚠️ **Si la date passe sans que personne ne revienne, ce fichier ne le
      > dira pas.** Une date écrite dans un markdown n'est pas un mécanisme —
      > c'est la limite connue de cette signature, et elle est écrite ici plutôt
      > que découverte en novembre.

## ⚠️ Risque de FUSION — la promesse de livraison corrigée sur DEUX branches

La promesse « livraison instantanée » a été retirée à deux endroits, sur deux
branches différentes, à quelques heures d'intervalle :

* `claude/promesse-livraison-instantanee` (depuis `main`) — corrige
  `home.stat3.v`, `product.delivery` et `home.sub` en **fr** et **ht** ;
* `claude/api-v1-tool-ready` — corrige `product.delivery` en **fr**, **ht**,
  **en** et **es**, et porte la garde `tests/promesse-livraison.test.ts`.

**Les deux touchent les mêmes clés de `lib/i18n.ts`.** Une fusion mal résolue
peut donc RESSUSCITER la promesse — c'est exactement ce qui s'est déjà produit
une fois : `home.stat3.v` avait été corrigée, `product.delivery` oubliée, puis
traduite en anglais et en espagnol. La promesse a gagné deux langues pendant
qu'on la croyait supprimée.

**Ce qui protège** : `tests/promesse-livraison.test.ts` échoue si une clé de
livraison reprend une formule de délai, dans n'importe laquelle des quatre
langues. Il vit sur `api-v1-tool-ready` — donc **tant que cette branche n'est
pas fusionnée, `main` n'a aucune garde**. À vérifier au moment de la fusion :
la suite doit être verte APRÈS résolution des conflits, pas seulement avant.

**Question de fond qui n'appartient qu'au porteur** — voir aussi ci-dessous :
`main` porte encore, en kreyòl, la proposition de valeur d'AVANT le pivot
(« Modèl, fòmasyon, beat, akonpayman… »), quand le français décrit déjà une
marketplace de pièces détachées. Ce n'est pas une traduction en retard, c'est
le pivot à moitié propagé — et c'est la langue de référence du marché qui le
montre le plus. `home.h1.a` → `home.h1.d` (« Vendez vos produits digitaux et
vos talents ») portent la même chose dans les DEUX langues. La question n'est
pas « quel libellé » mais **quelle est la promesse d'accueil de Zabelie
maintenant, en kreyòl d'abord**.

## Rétention du capteur de demande — tranché à 90 jours

- [ ] **`0053_search_retention_90j.sql` — écrite, NON APPLIQUÉE.** Passe
      `zabelie_search_config.retention_days` de **180 à 90**.

      **Pourquoi ce n'est pas un arbitrage** : le seul lecteur de la table est
      déjà plafonné à 90 jours — `app/api/admin/search-demand/route.ts:40`,
      `Math.min(90, …)` — et `zabelie_search_demand` est révoquée pour `anon`
      et `authenticated` (`0047:248`), donc il n'existe aucun autre chemin de
      lecture. Les jours 91 à 180 étaient conservés **sans que quiconque
      puisse les voir** : que du risque, aucun usage. 180 n'avait d'ailleurs
      jamais été choisi — c'était le défaut écrit d'un trait avec
      `min_sessions` et `min_length`.

      Ce que ça réduit concrètement : la fenêtre pendant laquelle des termes
      **en clair** (`0047` nomme les cas — « klinik avòtman », « tès VIH »,
      « avoka pou divòs ») coexistent sous une même empreinte de session. À
      faible trafic, une suite de recherches reste distinctive même sans
      identifiant qui traverse les jours ; c'est le seul paramètre qu'on
      contrôle, on le divise par deux.

      **Si le plafond de la route bouge un jour, c'est LUI qu'il faudra
      rediscuter, et cette rétention avec.**

      La migration ne supprime rien elle-même : elle change un paramètre, et
      c'est le passage suivant de la purge qui applique la borne. Elle affiche
      le compte des lignes concernées **avant** de modifier quoi que ce soit,
      et échoue (`ZB053`) si `retention_days` ne vaut pas 90 après coup.

- [ ] **`zabelie_fulfillment_sweep` (`0043`) n'a toujours aucun appelant** —
      même défaut que la purge, encore ouvert. Elle est exemptée dans
      `tests/crons-appelants.test.ts` pour une raison précise : `0043` est
      **non appliquée** et porte trois valeurs à arbitrer (`docs/21`), donc un
      cron déclaré aujourd'hui appellerait une fonction absente de la base et
      échouerait chaque jour.
      **Condition, pas tâche : la route et l'entrée `vercel.json` se câblent
      DANS LE MÊME GESTE que l'application de `0043`**, et l'exemption se
      retire alors du test — qui échouera de lui-même si on l'oublie dans
      l'autre sens (une exemption dont la fonction a gagné un appelant est
      signalée comme périmée).

## Accueil — ce que le croisement des clés i18n a mis au jour

> `tests/i18n-cles-mortes.test.ts` croise chaque clé de `lib/i18n.ts` avec ses
> sites d'appel. Deux clés mortes ont produit des défauts VISIBLES, corrigés :
> `home.cta.sell` (bouton vendeur disparu du hero — c'est ce qui faisait lire
> le `h1` acheteur comme un choix de positionnement) et `nav.logout`
> (`sign-out-button.tsx` affichait « Déconnexion » **en dur**, donc en français
> à un utilisateur kreyòl). Restent **cinq clés à trancher**, exemptées avec
> leur raison dans le test — le test les rappelle à chaque exécution, et
> l'exemption échoue d'elle-même si la clé regagne un appelant.

- [ ] **`home.badge`** (« La marketplace haïtienne ») — résidu de
      l'assainissement du hero. Supprimer des quatre langues, ou rebrancher.
- [ ] **`sec.free.badge`** (« GRATUIT ») — `sec.free` et `sec.free.sub` sont
      rendues, la pastille ne l'est pas. Écart d'affichage, pas un résidu.
- [ ] **`product.pay.loading`** (« Redirection vers MonCash… ») — jamais rendu :
      le bouton ne montre rien pendant la redirection. **À vérifier sur le
      chemin réel** : sur 3G, un bouton qui ne réagit pas se reclique.
- [ ] **`order.ref`** (« N° de commande ») — la référence `ZB-…` de `0042` est
      lue et affichée, jamais avec ce libellé.
- [ ] **`status.draft`** — supplantée par une décision produit explicite
      (`app/vendre/page.tsx:126`), conservée si la revue humaine cesse un jour
      d'être systématique. La seule des cinq qui ne demande rien.

- [ ] **🔴 `components/account-actions.tsx` est un îlot entièrement en
      français** — « Supprimer votre compte ? », « Exporter mes données », et
      le texte du `window.confirm` qui explique l'anonymisation légale. Aucune
      clé i18n, donc **le croisement ne le voit pas** : il ferme « traduit mais
      jamais branché », pas « jamais traduit ». C'est l'écran de SUPPRESSION DE
      COMPTE — celui où un malentendu de langue coûte le plus cher.

- [ ] **Débord horizontal à 360 px en FR et ES** (`scrollWidth` 371 / 372 pour
      360 de viewport) — la barre de navigation : le bouton « Vendre » /
      « Vender » plus le sélecteur de langue. **Mesuré, et pré-existant** : la
      même mesure sur l'état d'avant ce chantier rend exactement 371 / 372.
      Ne se voit **ni en kreyòl ni en anglais** (« Vann », « Sell » tiennent,
      `scrollWidth` = 360 pile) — c'est la vérification en QUATRE langues qui
      le révèle, pas trois. Même famille que RES-01.
      Le `h1` nouveau, lui, tient dans les quatre : 320 px de large, bord droit
      340, et le bouton vendeur du hero fait 44 px de haut (seuil BL-124).
      Asymétrie connue et acceptée : le `h1` prend 2 lignes en kreyòl, 3 en
      anglais et espagnol, **4 en français** — la langue de référence est la
      plus courte, ce qui est le bon sens de l'écart.

## Observabilité — signaux non bloquants à ajouter

### Audit externe Codex (2026-08-10) — verdict après contre-vérification

> ⚠️ **L'audit a mélangé DEUX projets.** Les chemins qu'il cite
> (`C:/Users/Philippe/marketplace-hub/vite.config.ts`, `src/services/
> monCashService.ts`, React Router, 82 tests, 50 fichiers `@ts-nocheck`)
> appartiennent à **marketplace-hub** — l'application Vite de `zabely.com`,
> sur le poste du porteur. **AUCUN de ces fichiers n'existe dans
> `uniondigitale`** (vérifié : ni vite.config, ni src/, ni react-router,
> ni un seul `@ts-nocheck` ; 263 tests, pas 82). La base examinée, elle,
> est bien `zabelie-digi` (les comptes concordent). Le « feu rouge » agrège
> donc les défauts d'un AUTRE dépôt avec notre base.

- [ ] 🚨 **TRANCHÉ le 2026-08-10 : ARCHIVER `marketplace-hub` / zabely.com.**
      Décision demandée au connecteur par le porteur (« choisis la meilleure
      option »), rendue avec ses motifs — le porteur peut la casser, mais
      qu'elle soit écrite :

      **Pourquoi archiver plutôt que repointer.** (1) La décision d'identité
      du 2026-07-24 dit qu'il n'existe QU'UN projet Zabelie — ce dépôt, celui
      qui porte l'infrastructure financière ; repointer marketplace-hub vers
      une autre base le maintiendrait comme SECOND magasin sous une marque
      quasi identique, et tout ce que l'audit lui reproche (source map
      publique qui expose le code, CSP affaiblie, 50 fichiers hors typage,
      dernier commit GitHub le 27 AVRIL + 128 changements locaux jamais
      commités) resterait à corriger dans un dépôt que plus personne ne
      maintient. (2) Son nom public viole la règle de nommage (« Ne jamais
      écrire Zabely »). (3) Ses promesses sont celles que Zabelie a refusées
      pièce par pièce : NatCash (⛔), PayPal, « −20 % », « livraison rapide »,
      numéro WhatsApp faux. (4) Repointer coûte du travail récurrent ;
      archiver en coûte une fois.

      **Ce qui a été vérifié avant de trancher** : le dépôt GitHub est
      `eliezerphilippe0-spec/Zabelie` (privé, dernier push 2026-04-27 — la
      date exacte que l'audit cite). La liaison du bundle zabely.com à
      `zabelie-digi` n'a PAS pu être confirmée d'ici (réseau sortant du
      conteneur bloqué vers ce domaine) — c'est l'étape 0 ci-dessous.

      **Précision porteur (2026-08-10) : `zabelie.com` est LE domaine acheté
      du projet.** Il doit donc finir branché sur CE dépôt (uniondigitale sur
      Vercel) — et l'hypothèse la plus probable est qu'il sert AUJOURD'HUI la
      vieille application Vite : l'audit ouvre sur « zabelie.com est
      accessible » en décrivant le bundle de marketplace-hub, et l'incident
      « catalogue indisponible » du 2026-08-09 renvoyait le HTML du site
      Zabély quand l'app interrogeait sa variable `NEXT_PUBLIC_SUPABASE_URL` —
      ce qui arrive précisément si cette variable a reçu le domaine du site au
      lieu de l'URL Supabase. À VÉRIFIER à l'étape 0, pas à supposer.

      **Exécution — gestes du porteur, dans l'ordre :**
      ✅ **BASCULE FAITE le 2026-08-10, vérifiée de l'extérieur** : zabelie.com
      rend « Zabelie — La marketplace haïtienne » (`_next/` présent, zéro
      « Zabely »). Découverte en chemin : le vieux site Vite était hébergé
      sur VERCEL (pas Hostinger) depuis avril, domaine accroché à ce vieux
      projet — le geste réel a été un TRANSFERT de domaine entre projets du
      même compte, pas un changement DNS. Étape 3 réalisée par le transfert
      même (l'ancien projet a perdu le domaine). Étape 6 TOMBÉE : le vieux
      bundle (1 Mo, index-6JaXkId_.js) audité de l'extérieur — librairie
      supabase-js présente (8 mentions, grep à connu-positif) mais AUCUNE
      URL *.supabase.co, ni ddditxykopuxxqzgkqwy, ni oqnt : buildé sans
      base configurée (d'où sa page noire), rien à révoquer. Restent : (a)
      NEXT_PUBLIC_SITE_URL + Redeploy · (b) Site URL Supabase · (c) URLs
      MonCash (2 bis) · étapes 4-5 (archiver le dépôt Zabelie, pauser oqnt).
      0. Ce que sert `zabelie.com` aujourd'hui : afficher son code source.
         `/assets/index-….js` + « Zabély » = la vieille app Vite ;
         `/_next/` = déjà la bonne. Chercher aussi « supabase.co » : si
         `ddditxykopuxxqzgkqwy` figure dans le bundle VITE, il tourne sur
         NOTRE base → suite urgente.
      1. **Brancher `zabelie.com` sur le projet Vercel d'uniondigitale**
         (Vercel → Settings → Domains → Add). C'est un RATTACHEMENT, pas une
         redirection : le domaine acheté doit servir la vraie marketplace.
         Si `zabely.com` est aussi possédé : 301 → `zabelie.com`.
      2. Après rattachement : `NEXT_PUBLIC_SITE_URL=https://zabelie.com`
         (Vercel, Production+Preview) et Supabase Auth → Site URL =
         `https://zabelie.com`, puis REDÉPLOYER — variable NEXT_PUBLIC,
         inlinée au build.
      2 bis. **Revenir dans le portail MonCash Business** et remplacer les
         trois URLs posées avec le domaine `.vercel.app` :
         Website Url → `https://zabelie.com` ·
         Return Url → `https://zabelie.com/api/moncash/return` ·
         Alert Url → `https://zabelie.com/mes-achats`.
         ⚠️ Tant que ce geste n'est pas fait, un paiement lancé depuis
         `zabelie.com` renvoie l'acheteur vers l'ancien domaine — le
         paiement est confirmé (la vérité est serveur-à-serveur), mais
         l'acheteur atterrit ailleurs que là où il a payé.
      3. Mettre hors ligne l'ancien déploiement Vite (son hébergeur), une fois
         le domaine détaché.
      4. Archiver le dépôt GitHub `eliezerphilippe0-spec/Zabelie`
         (Settings → Danger Zone → Archive). Le dossier local
         `marketplace-hub` : zipper puis supprimer, ou garder hors de tout
         déploiement.
      5. Mettre en pause le projet Supabase « Zabelie » (`oqnt…`) — APRÈS
         l'étape 3, jamais avant.
      6. Si l'étape 0 a confirmé la liaison à `zabelie-digi` : la rotation de
         la clé anon legacy (déjà au registre via la migration vers les clés
         `sb_…`) fermera l'accès résiduel du vieux bundle.
- [x] **RPC facture par jeton sans garde de forme ni débit** — constat RETENU,
      corrigé côté application le 2026-08-10 : `estTokenFacture` (24 car.
      base64url exacts, vérifié contre 0 jeton historique) + 30 lectures/min
      par IP AVANT la RPC. `tests/facture-token.test.ts`, mutation au rouge.
- [ ] **Advisors performance Supabase** (~25 politiques RLS ré-évaluant
      `auth.uid()` par ligne, ~16 FK non indexées, ~15 politiques permissives
      multiples) — plausible, non bloquant à 0 commande. À traiter par UNE
      migration dédiée (index FK + `(select auth.uid())`) quand le trafic
      existera, jamais en catimini dans un autre lot.
- [ ] **Protection « mots de passe compromis » désactivée** (Supabase Auth →
      HaveIBeenPwned) — un interrupteur dans le tableau de bord, déjà relevé
      par notre propre passage d'advisors du 2026-08-09.

**Constats de l'audit NON retenus pour ce dépôt, et pourquoi** :
« Aucun cron » — les 7 crons Vercel existent et sont visibles dans le tableau
de bord (capture porteur du 2026-08-09) ; le compte de l'auditeur n'avait
simplement pas accès au projet Vercel. « Storage sans politique RLS » — par
CONSTRUCTION : les fichiers partent exclusivement en URL signée service-role
via /api/download, aucun client ne touche le bucket. « 400 sur in_stock /
label_es » — déjà documenté ici même : `label_es` corrigé (PR #80),
`in_stock` attend B2. « Source map publique, CSP unsafe-inline, npm audit
React Router/ws/nanoid, ESLint 54 erreurs » — marketplace-hub, pas nous
(notre npm audit : 3 high, toutes `sharp`/libvips, dossier signé jusqu'au
2026-11-03).

- [ ] **`/mes-achats` est encore à moitié en français en dur** — le bloc de
      remise ajouté par le lot « surfaces » passe par `lib/i18n.ts` (quatre
      langues), mais le titre de la page et les libellés statiques
      (« Remise à convenir avec le vendeur », « Service · mise en relation »)
      sont antérieurs et ne sont pas traduits. Un acheteur kreyòl voit donc une
      page mixte. Six clés à ajouter ; aucun mécanisme ne le signalera —
      `Record<I18nKey, string>` vérifie que chaque langue porte chaque clé,
      jamais qu'un écran passe par une clé.

- [ ] **Deux projets Supabase, et celui qui s'appelle « Zabelie » n'est PAS la
      base de Zabelie.** Constaté le 2026-08-09 en cherchant où appliquer
      `0043`. Le projet nommé **`Zabelie`** (`oqnt…`, us-east-1) porte un tout
      autre schéma — `vendors`, `affiliates`, `courses`, `rentals`,
      `registries` — sans aucune table `zabelie_*` ni registre de migrations.
      La production de ce dépôt est le projet nommé **`zabelie-digi`**
      (`dddi…`). Un jour de fatigue, l'éditeur SQL ouvert sur le mauvais
      projet, et une migration part dans une base étrangère : le nom est le
      seul repère visible dans l'interface, et il désigne l'inverse de ce
      qu'on croit. À renommer, ou à archiver s'il ne sert plus.

- [ ] **Quatre fonctions de `0042` ont un `search_path` mutable** —
      `zabelie_order_ref_candidate`, `zabelie_assign_order_ref`,
      `zabelie_orders_ref_on_insert`, `zabelie_orders_ref_immutable`. Relevé
      par le linter Supabase (WARN), antérieur au 2026-08-09 et sans rapport
      avec `0043`. C'est la règle dure n°4 (« `search_path` épinglé ») non
      tenue sur un lot. Correctif : une migration qui refait les quatre avec
      `set search_path = public`, rien d'autre.

- [ ] **`seller_is_active` est exécutable par `anon` en `security definer`** —
      même relevé. Peut être délibéré (elle sert l'affichage public d'une
      fiche vendeur), mais aucune trace ne le dit. À confirmer ou révoquer,
      comme `0049` et `0050` l'ont fait pour deux oublis du même genre.
      `zabelie_biz_get_invoice_by_token` est dans le même cas et paraît, elle,
      volontairement publique (facture consultable par jeton) — à écrire noir
      sur blanc plutôt qu'à laisser deviner.

- [ ] **Catégories sans `label_es`** — la garde de `0052` est un contrôle
      PONCTUEL : elle ne voit que les catégories existant à sa position dans
      la suite des migrations. Une catégorie créée ensuite s'affichera en
      français **sans que rien ne le dise** — le repli `label_es || label_fr`
      est silencieux par construction.

      Y répondre en durcissant la garde transformerait le `nullable` en
      décoration et bloquerait une migration produit sur une question de
      vocabulaire. La bonne forme est un contrôle **quotidien et non
      bloquant**, du même genre que `zabelie_objets_requis` (`0048`) :
      compter et NOMMER les catégories non traduites dans
      `/api/admin/coherence`. Vaut aussi pour `label_en` et `label_kr`.

## Paiements (rappels)

> **Une seule de ces décisions bloque la première commande : D-4.** Un produit
> à 25 gourdes, sans coupon, sous la règle actuelle, traverse tout le parcours
> — D-5 (seuil zéro), D-6 (qui paie la remise de fidélité) et le palier Elite
> ne s'y opposent pas. Elles gagnent même à être tranchées **après**, avec ce
> que la vente aura appris.
>
> D-4 n'est pas plus bloquante — elle est seulement plus simple à prendre
> avant. Un registre append-only accueille très bien un changement de règle
> dans le temps : c'est même sa raison d'être. Ce qu'il exige, c'est que
> chaque ligne dise **sous quelle règle** elle a été produite — et ça, rien ne
> l'enregistre aujourd'hui. Donc deux chemins valables : trancher D-4 avant
> (le plus simple), ou **acheter d'abord et noter à la main que la ligne n°1 a
> été produite sous `round`**. Ce qu'il ne faut pas faire, c'est changer la
> règle sans que personne ne sache laquelle s'appliquait à quoi.

- [ ] **🔴 `0045_profile_on_signup.sql` — À APPLIQUER, et à vérifier AVANT la
      première commande.** Le profil n'était créé qu'à un seul endroit :
      l'insert côté client de `connexion-form.tsx`, et **uniquement** dans la
      branche où `signUp` renvoie une session — donc uniquement si la
      confirmation par e-mail est **désactivée**. Aucun déclencheur en base ne
      prenait le relais.
      **Si la confirmation est active : aucun acheteur n'obtient jamais de
      profil.** Ce n'est pas un cas de test, c'est le parcours d'inscription
      entier. Le réglage se lit en un clic dans les paramètres Auth de
      Supabase — commence par là.
      **Forme de l'échec, vérifiée** : `orders.buyer_id` référence
      `profiles(id)`, donc l'achat échoue en violation de clé étrangère et
      `/api/checkout` renvoie « Création commande échouée » (500). **Rien
      n'est écrit** — pas de commande orpheline, pas de ligne de grand livre.
      Bénin pour le registre, bloquant pour l'acheteur, et illisible pour lui.
      **⚠️ Ne PAS désactiver la confirmation e-mail pour débloquer** : toute
      la légitimité de l'auto-réception de `0043` repose sur un avis envoyé à
      une adresse joignable. Le contournement le plus tentant casse le
      mécanisme d'expédition.
      **Exposition de `display_name` — mesurée le 2026-07-27, avant d'allonger
      quoi que ce soit.** Le nom n'apparaît sur **aucune page publique** (ni
      fiche produit, ni avis) ; les e-mails vendeur ne portent **pas** le nom
      de l'acheteur ; il n'existe **aucune messagerie**. Donc aujourd'hui
      **aucun chemin ne mène d'un compte renommé à un autre utilisateur**, et
      l'usurpation a peu de portée. C'est pour ça que le filtre actuel suffit
      — et c'est aussi pourquoi allonger la liste (« MonCash », « Digicel »)
      serait du théâtre : `Zabelye`, un « I » à la place du « l » ou une
      lettre cyrillique passent tous.
      **Conséquence assumée, à ne pas découvrir plus tard** : le filtre est
      sans exemption de rôle, donc **la plateforme elle-même** ne peut plus
      créer de compte affiché « Zabelie » ou « Support Zabelie » — ni depuis
      l'app, ni en back-office avec la clé de service. C'est voulu. Si un
      compte support devient nécessaire, la voie n'est PAS de retirer le
      filtre : c'est d'ajouter une colonne de marquage officiel, de l'afficher
      partout où le nom l'est, puis de n'autoriser le nom réservé qu'aux
      lignes marquées. Le nom d'abord et le marqueur ensuite laisserait une
      fenêtre où « Support Zabelie » n'est vérifiable par personne.
      **À traiter DANS le même geste que le marqueur** : le repli d'inscription
      est « Kont » pour tout le monde. Invisible aujourd'hui, puisque le nom
      n'est exposé nulle part — mais le jour où il s'affiche, plusieurs
      comptes « Kont » indistinguables apparaîtront ensemble. La réponse
      (suffixe, nom déduit autrement, invitation à se nommer) se décide avec
      l'exposition, pas avant : c'est le même chantier.
      **⚖️ La vraie décision arrive avec la première exposition** : le jour où
      `display_name` s'affiche sur une fiche boutique, dans un avis ou dans un
      message reçu par un vendeur, aucune liste ne suffira — il faudra un
      **marqueur visuel de compte officiel**. À trancher AVANT d'exposer le
      nom, pas après.
      Le nom affiché vient du navigateur, sans validation serveur : un compte
      « Support Zabelie » qui écrit à des vendeurs est le scénario le plus
      coûteux sur un marché où la confiance passe par WhatsApp. `0045` refuse
      les variantes de `zabelie`/`zabely` (comparaison sur une forme
      normalisée, donc « Z-a-b-e-l-i-e » aussi) et **replie** sur l'e-mail
      plutôt que de rejeter — un rejet fermerait l'inscription, ce qu'un
      déclencheur ne doit jamais faire. Restent deux choix qui te
      reviennent : **la liste** (faut-il y ajouter « MonCash », « Digicel »,
      des noms d'employés ?) et **la sanction** (repli silencieux, ou refus
      explicite en amont, côté formulaire, où l'on peut expliquer).
      Contrôle à passer une fois appliquée :
      `select u.email, u.email_confirmed_at, p.id as profil from auth.users u
       left join profiles p on p.id = u.id order by u.created_at desc limit 5;`
      — aucun `profil` à `null`.
- [ ] **⚖️ D-4 — TRANCHER LE SENS DE L'ARRONDI (décision porteur).** `round`
      (état actuel, la fraction va à la plateforme) ou `floor` (elle va au
      vendeur, ≤ 1 HTG par vente). Personne n'a tranché : le porteur a donné
      un avis (`floor`) sans « go », l'agent recommande `floor`. À décider
      **avant la première vente** — le registre est append-only, chaque ligne
      écrite avant porte l'ancienne règle pour toujours. Analyse chiffrée :
      `docs/02` §D-4.
      **Si `floor` : trois gestes, et l'ORDRE est la sécurité** —
      (1) appliquer `0044_commission_floor.sql` ; (2) passer
      `ROUNDING_IN_FORCE` à `"floor"` dans `lib/commission.ts` ;
      (3) redéployer. Dans cet ordre, l'intervalle donne au vendeur **plus**
      que ce qui lui est annoncé. Dans l'autre, il lui promet une gourde qu'on
      ne verse pas. Puis inscrire l'empreinte au registre `0041` — c'est ce
      que lit la sonde d'arrondi de `/api/admin/coherence`, qui signale un
      désaccord entre la constante et le journal. Les annonces (FAQ,
      estimation vendeur, console pro, FR + KR) suivent automatiquement la
      constante — rien à réécrire à la main.
      **Si `round` : rien à faire**, `0044` reste au dépôt.
- [ ] **📋 Jour J `0043` + PR 2/2 — les contrôles du premier passage,
      écrits AVANT d'en avoir besoin** (revue 2026-08-08). L'ordre gravé :
      #70 → #71 → #64 rebasée → appliquer `0043` (registre `0041` vérifié) →
      signal à l'agent → PR 2/2 le même jour → déploiement → `docs/22`.
      Trois lectures au premier passage du balayage, dans cet ordre :

      **(0) Noter ICI l'horodatage exact du déploiement de la PR 2/2** — il
      n'existe qu'à cet instant et ne se reconstruit pas après coup :
      `DEPLOIEMENT_PR22 = ____-__-__T__:__:__Z`

      **(1) Le journal du balayage** : les six compteurs existent (clé
      absente = `null`, jamais « rien à faire ») ; `orphelins_repares` =
      nombre de commandes physiques payées pendant la fenêtre ;
      `orphelins_tardifs` **= 0, sinon SIGNAL D'ARRÊT** — un tardif au
      premier passage contredit l'hypothèse même de la fenêtre courte et
      invalide le déroulé, pas une ligne.

      **(2) L'ancrage, instrument calibré** — deux régimes, et le seuil est
      une TOLÉRANCE PRAGMATIQUE (retries, routes lentes), pas la frontière
      exacte : une ligne à 2 min n'appartient à aucun régime et passe sans
      signal — l'instrument ne la voit pas, c'est dit ici pour être su :
      ```sql
      -- réparée (F16) : delta = 0 exactement · nominale : quelques secondes
      select f.order_id, f.created_at, f.created_at - a.ancre as delta
        from zabelie_fulfillment f
        cross join lateral (
          select min(p.confirmed_at) as ancre from payments p
           where p.order_id = f.order_id and p.status = 'confirmed') a
       where f.created_at < a.ancre
          or f.created_at - a.ancre > interval '5 minutes';
      -- zéro ligne attendu
      ```

      **(3) Le contrôle de fenêtre, EXÉCUTABLE** — remplacer le paramètre
      par la valeur du (0) : toute ligne née de la fenêtre n'a pu venir que
      du filet, donc delta = 0 exactement :
      ```sql
      select f.order_id, f.created_at - a.ancre as delta
        from zabelie_fulfillment f
        cross join lateral (
          select min(p.confirmed_at) as ancre from payments p
           where p.order_id = f.order_id and p.status = 'confirmed') a
       where a.ancre < 'DEPLOIEMENT_PR22'::timestamptz
         and f.created_at <> a.ancre;
      -- zéro ligne attendu ; toute ligne = F16 réel ≠ F16 testé
      ```
- [ ] **🔐 Audit transversal des routes service-role (chantier, pas urgent
      avant lancement — inscrit 2026-08-08, revue PR #71).** Les 13 routes
      `app/api/admin/**` (menu-counts compris) tiennent toutes sur le même
      étage unique : garde applicative `getCurrentUser()` puis
      `createAdminClient()` — c'est-à-dire sur l'hypothèse « la garde est
      correcte et la clé service-role ne fuit jamais ».
      `protect_profile_privileges` (0015) ferme le chemin « devenir admin »,
      pas le chemin « contourner la garde » : un bug de garde ou une clé dans
      un journal = lecture-écriture totale. Le point a été jugé NON bloquant
      pour menu-counts (compteurs agrégés, sans PII ni montants) précisément
      parce que durcir la route la moins sensible en laissant refund et
      confirm-zelle sur l'étage unique serait du théâtre. Périmètre du
      chantier, arbitré en revue :
      (1) inventaire des routes service-role ; (2) classement par sensibilité
      — les MUTATIONS FINANCIÈRES d'abord (refund, confirm-zelle, payouts,
      topup) ; (3) décision PAR CLASSE : garde renforcée, RLS admin, ou statu
      quo documenté. ⚠️ Piège connu à ne pas reproduire : une RPC à contrôle
      `auth.uid()` interne appelée via service role ne vérifie rien —
      `auth.uid()` y est NULL. Les deux étages n'existent qu'avec le client
      SESSION. C'est exactement le genre de dette qui devient invisible parce
      que « c'est le motif du dépôt ».
- [ ] **⚖️ D-6 — Qui paie la remise de fidélité ? (décision porteur).** La
      commission porte sur `orders.amount_htg`, le prix **remisé**. Pour un
      coupon vendeur (`zabelie_coupons`) c'est juste : il l'a créé lui-même.
      Pour un coupon de fidélité (`coupons`, `0021`) il n'y a **pas de
      vendeur** — c'est un engagement de la plateforme, et le vendeur en
      paierait la note sans l'avoir choisi ni pouvoir le distinguer d'une
      baisse de prix. Rien n'est câblé aujourd'hui (vérifié) et aucun point
      n'a jamais été émis : la décision est encore **gratuite**, elle ne le
      sera plus après une ligne de grand livre. Trois sorties dans `docs/02`
      §D-6. Garde en place : `tests/fidelite-discipline.test.ts` empêche le
      câblage par inadvertance, pas le programme.
- [ ] **⚖️ D-5 — Commission minimale de 1 gourde ? (décision porteur).** Une
      vente assez petite ne rapporte rien à la plateforme : moins de 5 HTG
      sous `round`, moins de 10 (17 en Elite) sous `floor`. Sur un marché où
      des recharges à 25 gourdes existent, découper une vente en petites
      unités devient une stratégie. Deux sorties : **prix plancher** ou
      **commission minimale de 1 HTG dès qu'il y a vente** — la seconde ferme
      le seuil sans abîmer l'argument « l'arrondi va au vendeur ». Aucune
      n'est codée : c'est une règle commerciale. L'interface, elle, n'annonce
      plus « aucune commission à ce prix » — ne pas enseigner le
      contournement n'est pas le fermer.
- [ ] **Formulaire `/vendre/physique` — français en dur, sur une plateforme
      Kreyòl-first.** Tout le formulaire (libellés, aides, messages d'erreur)
      est écrit en FR dans `components/physical-product-form.tsx`, sans passer
      par `lib/i18n.ts`. C'est la surface vendeur du chantier physique. La
      ligne financière ajoutée le 2026-07-27 (estimation du net) passe, elle,
      par i18n — mais le reste reste à traduire, et c'est un chantier à part
      entière, à faire avant l'ouverture de la vente physique.
- [ ] **Palier Elite — décision porteur en attente (V-16).** Le taux 6 % n'est
      plus annoncé nulle part : `tier` est gelé côté client (`0015`/`0017`) et
      **aucun chemin n'attribue `elite`** — ni code, ni écran d'admin — et
      aucun document ne dit ce qui y donne droit. Pour le réannoncer il faut
      d'abord **écrire le critère** (ancienneté ? volume ? sélection à la
      main ?), puis la porte qui l'applique. Règle commerciale : c'est ta
      décision, pas la mienne. Sans urgence — aucun vendeur n'est concerné.

- [x] Migrations `0001` → `0019` appliquées sur Supabase (dont `0009`/`0010`
      topup) — `supabase/schema.sql` reste la concaténation à jour si besoin
      de rejouer sur un nouvel environnement.
- [x] Migrations `0020` → `0023` **appliquées** sur la prod Supabase le
      2026-07-13 (page service, points, Zabelie Business, durcissement du trigger
      fidélité) — via le SQL Editor (`docs/14-MIGRATIONS-SUPABASE.md`). Scan
      sécurité Supabase (`get_advisors`) : **propre** (alertes restantes = par
      conception, cf. session).
- [ ] **`NEXT_PUBLIC_SITE_URL` en Production AVANT tout test WhatsApp** —
      variable, redéploiement, puis UN lien envoyé. L'ordre est imposé par le
      cache d'aperçu persistant de WhatsApp (`docs/20`, § vérification
      production) : tester avant de la poser fige un aperçu `*.vercel.app`.
- [ ] **Transformations d'image Supabase** — vérifier qu'elles sont incluses
      dans le plan (Storage → Image Transformations). Si oui, poser
      `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=1` : les photos produits passent
      d'une taille brute (jusqu'à 5 Mo) à ~40 Ko servis par le CDN, sans quota
      Vercel. Sans la variable, l'URL d'origine est servie telle quelle — plus
      lourd, jamais cassé. **Ne pas activer sans vérifier le plan** :
      l'endpoint `render/image` répond en erreur s'il n'est pas inclus, et les
      photos disparaîtraient.
- [ ] **⭐ LA PREMIÈRE COMMANDE RÉELLE — priorité n°1, ne dépend de rien.**
      Publier un produit digital à 25 HTG et l'acheter soi-même en MonCash
      réel. Éprouve d'un coup les SEPT choses qui n'ont jamais traversé la
      production : `order_ref` sur une vraie ligne, `zabelie_solvency_report()`
      sur des données non nulles, l'identité de `0033`, la maturation d'escrow,
      le webhook MonCash réel, `/mes-achats` et les e-mails, la carte de
      partage WhatsApp. Un seul préalable, D-4 (l'arrondi), et il est
      décisionnel, pas technique — ni B2 ni B3. Mode d'emploi complet :
      `docs/22-PREMIERE-COMMANDE-REELLE.md`. **À faire avant tout nouveau
      développement.**
- [ ] **⚠️ D-4 avant la première vente** — voir §Paiements. `0044` est écrite,
      éprouvée et **non appliquée** ; elle est sûre dans les deux ordres (son
      remplacement de `confirm_payment` est conditionnel et s'abstient si une
      version B2/B3 avec stock est déjà en place). Ce qui manque n'est pas le
      code, c'est l'arbitrage.
- [ ] **Garde anti-auto-achat — avant toute mise en avant par le volume.**
      Vérifié : `app/api/checkout/route.ts` ne compare jamais
      `product.seller_id` à `user.id`. Un vendeur peut acheter son propre
      produit et gonfler ventes et avis. Sans conséquence aujourd'hui (aucun
      classement ne s'appuie sur le volume) — c'est précisément pourquoi
      « meilleures ventes / meilleurs vendeurs » doit rester hors périmètre
      tant que la garde n'existe pas.
- [ ] **Checkout invité — décision autonome.** Le checkout exige aujourd'hui
      une inscription. Ce que `0043` exige réellement n'est pas un COMPTE mais
      **un contact joignable enregistré à la commande** — ce qu'un checkout
      invité standard collecte. La décision peut donc se prendre **sans
      attendre** celle du canal, à la condition unique que le champ contact
      reste **obligatoire**. ⚠️ Non démontré comme contrainte active : il n'y
      a aujourd'hui aucun produit publié et **un seul compte** (le porteur) —
      personne n'a atteint le formulaire. Le chiffre à surveiller quand des
      liens circuleront : comptes créés **sans commande aboutie**.
- [ ] **Canal des avis acheteur — décision distincte, avant B3.** L'e-mail
      existe mais une adresse créée pour acheter n'est pas une adresse lue :
      l'acheteur type vit sur WhatsApp. SMS/WhatsApp = fournisseur, interdit
      sans validation (règle du dépôt). Voir `docs/21` §3 bis.
- [ ] Zelle : `USD_HTG_RATE`, `ZELLE_RECIPIENT`, `ZELLE_RECIPIENT_NAME`.
- [ ] Stripe (optionnel) : nécessite une entité US — voir `docs/04 §2 bis`.

## 🚨 Incidents de secrets — journal (`docs/11-SECRETS.md` §5)

> Une ligne par incident. **Jamais la valeur de la clé**, même partielle, même
> « juste le début » : un préfixe suffit souvent à identifier le projet, et ce
> fichier est dans Git.

### 2026-08-04 — clé secrète Supabase collée dans une conversation

| | |
|---|---|
| **Clé** | `SUPABASE_SERVICE_ROLE_KEY`, forme `sb_secret_…` |
| **Cause** | collée en clair dans un échange, pour illustrer une consigne |
| **Portée** | contourne toute la RLS : comptes, commandes, grand livre, en lecture **et** en écriture |
| **Dépôt touché ?** | **Non** — vérifié, aucune occurrence dans les fichiers suivis par Git |

- [ ] **1. Révoquer et regénérer** — Supabase → *Settings › API Keys*.
- [ ] **2. Remplacer** dans Vercel → *Environment Variables*, **Production ET
      Preview** (deux environnements distincts, l'un ne met pas l'autre à jour).
- [ ] **3. Redéployer** — la variable n'est lue qu'au démarrage.
- [ ] **4. Vérifier** que `/api/admin/coherence` répond encore : c'est la route
      qui utilise la clé de service. Si elle rend 500, la nouvelle valeur n'est
      pas arrivée.

**Ce qui rend cet incident sournois** : rien ne casse. Le site tourne
exactement pareil avec une clé compromise qu'avec une clé saine — il n'y a
aucun symptôme à attendre, aucune alerte à guetter. C'est pourquoi la rotation
se fait **maintenant** et pas « quand on aura le temps ».

**Ce qui n'aurait servi à rien** : supprimer le message. Une clé sortie du
coffre est sortie. La seule protection est de la rendre inutile.

## Écarts de réconciliation topup

_(à compléter au fil de l'eau — date, order_id, nature de l'écart, résolution)_

## Dossiers juridiques — REPORTÉS par le porteur (2026-08-01)

Les deux existaient en prose (`docs/17`, `docs/03`) mais dans **aucune liste
d'action**. C'est la façon la plus sûre d'oublier quelque chose : le texte
reste juste, et personne ne le rouvre. Ils sont donc inscrits ici, au statut
que le porteur leur a donné — **reportés, pas clos**.

- [ ] **Encaissement USD par Zelle** — `ZELLE_RECIPIENT` est un e-mail ou
      téléphone **US** enrôlé Zelle, adossé à un compte bancaire américain.
      Les fonds diaspora atterrissent donc aux États-Unis, ce qui appelle le
      même *merchant of record* que Stripe. La différence entre les deux rails
      est **opérationnelle** (API contre confirmation manuelle), pas juridique
      — ouvrir Zelle ne contourne pas le blocage Stripe. → `docs/03` §1 et
      « Rails diaspora USD ».
      ⚠️ **À instruire en premier des deux** : c'est le seul des deux flux qui
      dépend d'un tiers — la banque — **qui n'a jamais été consulté**. Un flux
      dont une partie ignore qu'elle y participe n'a pas d'accord à révoquer,
      donc rien ne l'a jamais validé. La rétention, elle, est mal cadrée mais
      interne : on sait qui décide.
- [ ] **Rétention des fonds vendeurs (escrow, maturation J+7)** — compte
      marchand unique, fonds vendeurs et revenus plateforme mêlés, aucun
      cantonnement. → `docs/17`.

**Ce que ces deux dossiers ont en commun, et qui interdit de les « corriger »
côté texte** : les phrases de façade qui les décrivent sont **vraies**.
`why.1.b` (escrow), `why.3.b` (Zelle), `faq.a1` (Zelle), `faq.a4` (J+7) —
dans les deux langues — décrivent fidèlement ce que le code fait. Les
réécrire sans changer le flux ne réduirait pas le risque : ça le déplacerait
vers l'écart entre la page et la réalité, qui est le pire endroit où le
loger, parce que plus personne ne l'y voit.

Ne rien construire qui **aggrave** l'un ou l'autre sans avis écrit.
