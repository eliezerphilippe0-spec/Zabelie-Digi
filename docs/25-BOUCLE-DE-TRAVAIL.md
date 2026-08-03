# 25 — La boucle Zabelie

> Boucle de travail pour tout chantier sur Zabelie — physique, digital, services.
> À coller en tête de session Claude Code, ou à charger depuis `CLAUDE.md`.

---

## 0. Avant d'entrer dans la boucle

Rien ne démarre sans ces trois éléments écrits. Si l'un manque, la première action est de le réclamer, pas de commencer.

**L'objectif vérifiable.** Pas « améliore le checkout » mais une phrase qu'une machine peut trancher : quel test passe, quelle requête renvoie quoi, quel élément est visible à 360 px. Si tu ne peux pas écrire la condition d'arrêt, tu n'as pas d'objectif, tu as une envie.

**L'arrêt ferme.** Un nombre de tours maximum, annoncé avant de commencer. Cinq par défaut. Au cinquième, la boucle s'arrête et rend compte, même inachevée. Une boucle sans plafond ne s'arrête pas parce qu'elle a fini, elle s'arrête parce que quelqu'un l'a coupée.

**Le périmètre.** Quels fichiers, quelle branche, quelle base. Explicitement : ce qui est hors périmètre.

---

## 1. Le cycle

```
        OBJECTIF VÉRIFIABLE
               │
               ▼
         ┌──────────┐
         │ RAISONNER│  ce que je vais faire, et comment je saurai
         └────┬─────┘
              ▼
         ┌──────────┐
         │   AGIR   │  une seule mutation à la fois
         └────┬─────┘
              ▼
         ┌──────────┐
         │ OBSERVER │  ← la phase qui compte (§2)
         └────┬─────┘
              ▼
          terminé ?
        ┌─────┴─────┐
       non         oui
        │           │
        └──► tour+1  ▼
                  ARRÊT + compte rendu
```

Un tour = une mutation + son observation. Jamais deux mutations avant une observation : si les deux cassent, on ne sait pas laquelle.

---

## 2. Observer — les huit contrôles

C'est ici que le travail se gagne ou se perd. Chaque ligne vient d'un défaut réellement rencontré sur ce projet.

> **Règle de sortie — cette liste ne doit jamais dépasser dix lignes.**
> Dès qu'un contrôle est automatisable, il quitte cette section et devient un test qui échoue tout seul (`crons-appelants`, `i18n-cles-mortes`, `promesse-vendeur` sont déjà partis par ce chemin). Le §2 ne garde que ce qui exige un jugement humain à chaque fois.
> Une liste de vingt contrôles ne se lit pas — elle se saute, et une liste sautée est pire qu'une liste courte : elle donne l'impression d'être couverte.

**2.1 — La mutation a-t-elle eu lieu ?**
Après chaque édition, relire la zone et **assurer la post-condition** avant de lire quoi que ce soit d'autre. Une commande qui rend un code de sortie 0 sans avoir modifié le fichier est indiscernable d'un succès. Pas « vérifier », une assertion qui échoue.

**2.2 — L'instrument discrimine-t-il dans les deux sens ?**
Tout test, tout `grep`, toute sonde doit être exercé sur un **cas connu-positif** et un **cas connu-négatif**. Un instrument qui ne trouve rien peut être juste, ou trop serré. Une regex devenue muette rend tous ses tests verts.

**2.3 — L'instrument est-il aveugle quelque part ?**
Les frontières de mot (`\b`) ne fonctionnent pas contre un accent en **position de frontière** : `vandè`, `bò`, `lè`, `café`, `déjà`. Un accent au milieu passe (`vérifiés`). Le motif marche donc 90 % du temps et échoue toujours au même endroit — en kreyòl, la langue de référence. Cas de test à choisir par la **position** de l'accent, pas à l'œil. Ajouter `u` **et** `i`.

**2.4 — Le vert vient-il d'une vérification ou d'un vide ?**
Un préfixe dynamique vide rend toutes les clés « utilisées ». Une concaténation avant assertion masque la perte d'une moitié. Une liste filtrée jusqu'à zéro élément valide tout. Toujours se demander : combien d'éléments ce test a-t-il réellement examinés ?

**2.5 — Le déclaré est-il l'existant ?**
Un fichier de migration dans le dépôt ne prouve rien sur Postgres. Le registre `zabelie_schema_migrations` fait foi. Une fonction définie ne prouve pas qu'elle est appelée. Une entrée de cron ne prouve pas qu'il tourne — c'est la ligne de journal qui le prouve.

**2.6 — La commande fait-elle ce que son nom annonce ?**
Un drapeau qui filtre une sortie et un drapeau qui modifie un état portent souvent le même nom. Vérifier lequel **avant**, pas après.

**2.7 — Sur quel arbre ai-je mesuré ?**
Après toute réinitialisation d'environnement, resynchroniser et **rejouer** ce qui en dépend. Nommer, constat par constat, le commit de vérification. Ce qui n'a pas été rejoué est marqué `NON VÉRIFIÉ`, pas supposé valide.

**2.8 — Est-ce que je raisonne au lieu de mesurer ?**
« Ça n'a pas pu changer » n'est pas une vérification. Si c'est mesurable, mesure.

---

## 3. Le correcteur séparé

Le créateur ne se note jamais lui-même. Sur un chantier où la qualité compte, la relecture est confiée à une instance fraîche qui n'a que ce rôle et ne connaît pas les raccourcis pris.

Sur Zabelie, le correcteur a un mandat fixe :

- il **constate, il ne répare pas** ;
- toute affirmation porte une citation `file:line` ;
- il publie ses propres ratés d'instrument en annexe — un rapport qui cache ses erreurs invite à croire le suivant sans le vérifier ;
- il nomme sa limite dure : ce qu'il n'a pas pu mesurer et pourquoi.

---

## 4. Les zones où la boucle s'arrête et demande

La boucle est autonome à l'intérieur de son périmètre. Elle **s'arrête net** dès qu'elle touche l'un de ces points, et rend la main.

| Zone | Pourquoi |
|---|---|
| **Argent** | montant, commission, arrondi, ledger, escrow, taux de change |
| **Migration à appliquer** | écrire oui, appliquer non — c'est un geste humain |
| **Variable d'environnement** | poser un secret ouvre souvent un rail ; voir les gestes bloqués d'`OPS_TODO.md` |
| **Promesse commerciale** | délai, vérification vendeur, garantie, gratuité — toute affirmation opposable |
| **Positionnement** | `h1`, proposition de valeur, arbitrage acheteur/vendeur |
| **Dépense** | plan payant, branche facturée, service tiers |
| **Merge** | le checkpoint humain est la PR, jamais le commit |

Devant l'une de ces zones : écrire l'analyse, proposer les options avec leurs conséquences, **ne pas trancher**.

### 4.1 — Ce qui se passe après l'arrêt

S'arrêter proprement ne suffit pas. Une décision en attente depuis trois semaines coûte autant qu'une boucle qui déraille — elle coûte juste plus discrètement.

Toute décision rendue à l'humain s'inscrit dans un registre unique, avec trois colonnes :

| Décision | Depuis | Ce qu'elle bloque |
|---|---|---|

La troisième colonne est la seule qui compte. Une décision qui bloque six branches et une qui bloque un libellé n'ont pas le même poids, et sans la trace, rien ne les distingue. Le registre est relu à l'ouverture de chaque chantier — avant de choisir quoi construire, on regarde ce qui attend.

> **Emplacement du registre : `OPS_TODO.md`, en tête de fichier** — « registre unique » exige un seul endroit, et c'est celui que le porteur ouvre déjà.

---

## 5. Invariants Zabelie — jamais rediscutés dans la boucle

- Next.js App Router + Supabase + Vercel. Préfixe `zabelie_`. RLS toujours active.
- Handlers sous le **JWT de l'appelant**. Jamais `service_role` sur un chemin atteignable par requête utilisateur.
- Tous les calculs de prix **côté serveur**. Aucun montant accepté du client.
- Ledger financier append-only, protégé par trigger.
- **Kreyòl d'abord**, puis français, anglais, espagnol. La langue de référence est celle du marché.
- Contenu vendeur = **entrée non fiable**, isolée des champs de confiance.
- Une promesse d'interface doit être adossée à un objet qui existe en base.
- Vérification responsive à **360 px**, dans toutes les langues actives.

---

## 6. Le journal

Chaque tour consigne : ce qui était visé, la mutation faite, ce qui a été observé, et la décision — continuer ou arrêter. Assez pour déboguer à 3 h du matin sans reconstituer.

Et une règle qui vient de la purge : **journaliser aussi quand il ne s'est rien passé.** « N'a pas tourné » et « a tourné, rien à faire » ne doivent pas produire le même silence.

---

## 7. Le contrôleur — ce qui ferme la boucle

À la fin d'un chantier, une dernière passe qui ne porte pas sur le travail mais sur **la méthode**.

Question unique : *ce qui m'a fait perdre du temps cette fois, est-ce un accident ou un motif ?*

Si c'est un motif, il devient un contrôle mécanique et il s'écrit dans `CLAUDE.md`. Les huit contrôles du §2 sont tous nés comme ça. C'est ce retour qui distingue un agent qui exécute d'un système qui apprend — et c'est la seule partie de la boucle qui améliore les suivantes.

### 7.1 — Le cas connu-négatif de la boucle elle-même

Cette boucle exige un cas connu-négatif pour tout instrument. Elle est elle-même un instrument, et sans cette section elle n'en aurait aucun.

Chaque chantier se termine donc par une ligne : **quels contrôles du §2 ont réellement attrapé quelque chose, et lesquels ne se sont jamais déclenchés ?**

Un contrôle qui n'a rien attrapé sur dix chantiers est dans l'un de deux états, et ils demandent l'inverse l'un de l'autre :

- **inutile** — le défaut n'existe plus dans ce projet, le contrôle sort de la liste ;
- **aveugle** — le défaut existe et le contrôle ne le voit pas, comme `\b` contre `vandè`. Il faut le réparer, pas le retirer.

Trancher entre les deux exige de fabriquer le défaut exprès et de vérifier que le contrôle le nomme. Sans cette mesure, une liste de contrôles vieillit exactement comme la liste de contre-exemples de `isLang` : elle continue d'affirmer, elle a cessé de vérifier.

---

## 8. Le coût

Commencer petit et borné, élargir ensuite. Surveiller les premiers passages plutôt que de lancer large et découvrir la facture. Une boucle qui n'atteint jamais « terminé » brûle jusqu'à ce que l'arrêt ferme la coupe — c'est à ça qu'il sert.

---

## Rappel de périmètre

**Services** : les tools et écrans de services, freelances, missions et devis relèvent de **Zabelie Business**, pas de Zabelie. Si un chantier les mélange, la boucle s'arrête au §4 et demande l'arbitrage avant d'écrire.

---

## Journal des chantiers — §7.1

> Une ligne par chantier : quels contrôles du §2 ont attrapé quelque chose.
> Un contrôle qui ne se déclenche jamais est *inutile* ou *aveugle*, et les deux
> demandent l'inverse l'un de l'autre. Sans cette trace, on ne peut pas trancher.

### 2026-08-03 — Cron de purge, accueil vendeur, gardes i18n

Déclenchés, avec ce qu'ils ont attrapé :

- **2.1** (post-condition) — `pkill` a tué le shell avant `python3` ; code de
  sortie 144, `CLAUDE.md` inchangé. Attrapé par la relecture, pas par le code
  de retour.
- **2.2** (deux sens) — le connu-vrai de `promesse-vendeur` portait
  `payout_phone`, qui n'existe dans aucune migration de la branche. Un contrôle
  qui ne sait que dire « non » aurait validé n'importe quel adossement.
- **2.3** (aveuglement) — `\b` contre `vandè`. Le détecteur fonctionnait en
  anglais et ratait le kreyòl. **Ce contrôle est né de ce chantier.**
- **2.4** (vert creux) — préfixe dynamique vide : 307 clés « utilisées »,
  0 clé morte, vert parfait, rien de vérifié.
- **2.5** (déclaré ≠ existant) — `zabelie_purge_search_misses` définie depuis
  `0047`, prouvée par les tests SQL, **jamais appelée**. Et
  `zabelie_fulfillment_sweep` dans le même état, trouvée par le croisement
  dès sa première exécution.
- **2.7** (quel arbre) — `zod` déclaré dans `package.json`, absent du
  `node_modules` du conteneur ; `npm run typecheck | tail -5` ne montrait que
  des avis npm et cachait l'erreur.
- **2.8** (mesurer) — le débord à 360 px en FR et ES a été attribué au nouveau
  `h1` jusqu'à ce qu'un `git stash` montre 371/372 px **avant** le chantier.

Non déclenché : **2.6** (drapeau qui filtre / drapeau qui agit). Aucune commande
à double sens n'a été utilisée ce tour. Statut : **indéterminé** — il a attrapé
`npm audit fix --omit=dev` au chantier précédent, donc ni inutile ni prouvé
aveugle. À reconsidérer s'il reste muet sur plusieurs chantiers d'affilée.
