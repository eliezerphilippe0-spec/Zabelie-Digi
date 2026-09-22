# Audit de la supervision TypeSafe / Jev — 2026-09-21

Demande : « utiliser TypeSafe AI pour auditer Zabelie ». Ce document dit ce que
l'instrument a rendu, et surtout **ce qu'il n'a pas pu rendre**.

⚠️ **Il n'existe aucun plugin Claude Code « TypeSafe AI »** — ni activé sur le
compte (catalogue interrogé le 2026-09-21 : zéro plugin activé), ni installé
dans `~/.claude/plugins/`, ni dans `.claude/` du dépôt. TypeSafe n'est pas un
outil d'audit qu'on branche : c'est un **fournisseur de classification** déjà
intégré à Zabelie sous le nom **Jev**, par deux surfaces distinctes :

| Surface | Fichier | Rôle |
|---|---|---|
| Connecteur support | `lib/jev.ts`, `app/api/admin/jev/route.ts` | classer un message client (catégorie + urgence) |
| Agent de supervision | `scripts/jev-supervisor.mjs`, `.github/workflows/jev-supervision.yml` | sonder le site, prioriser, recommander |

Seule la seconde est un instrument d'audit. C'est elle qui est examinée ici.

## 1. Le fait qui commande : le superviseur n'a JAMAIS tourné

Mesuré par l'API GitHub Actions, pas déduit :

```
workflow « Zabelie - Supervision Jev » (id 363023594) — state: active
  run #1  2026-09-21T03:26Z  workflow_dispatch  conclusion: skipped
  run #2  2026-09-21T09:57Z  schedule           conclusion: skipped
  job « supervise » du run #2 : created 09:57:02 → completed 09:57:02, skipped
```

**Deux exécutions, deux `skipped`, zéro seconde de travail.** Aucune sonde n'a
été tirée, aucun appel Jev émis, aucun rapport produit. La cause est la garde
du workflow (`jev-supervision.yml:20`) :

```yaml
if: github.repository == '…/Zabelie-Digi' && github.ref == 'refs/heads/main'
    && vars.JEV_SUPERVISION_ENABLED == 'true'
```

Le dépôt et la branche sont conformes sur les deux runs ; **la variable
`JEV_SUPERVISION_ENABLED` n'est pas posée.** C'est la seule clause qui puisse
être fausse. Le secret `TYPESAFE_API_KEY` n'entre même pas en jeu : la garde
tombe avant.

⚠️ **Et un `skipped` s'affiche comme un run non rouge dans l'onglet Actions.**
`docs/JEV-SUPERVISION.md:42` l'avait écrit — « Un workflow "skipped" signifie
que l'agent n'a pas tourné, pas que le site est sain ». Le piège était prédit
par sa propre documentation, et il est actif depuis la fusion de #255/#256.

C'est exactement la classe nommée dans `CLAUDE.md` : *le code sans appelant*, et
son corollaire *un appelant n'est pas une exécution*. Ici le workflow existe, il
est déclenché, il est même planifié — et il ne s'exécute pas. Le test qui
gardait ce point vérifiait que la garde était **écrite** ; aucun ne vérifiait
qu'elle **laisse passer**. Un test structurel de plus qui porte sur le texte et
non sur ce qui commande.

→ **Corrigé le 2026-09-21, §7.** L'activation ne garde plus le job : le script
la lit et rapporte `inactive` en sortant en échec. Le silence était le défaut,
il n'est plus possible. **Poser la variable et le secret reste ton geste (§6) —
la correction rend l'absence visible, elle ne la comble pas.**

## 2. Le chemin de sonde est impraticable depuis une session agent

Depuis cette session, `zabelie.com:443` est refusé par la politique du proxy
sortant — 403 sur CONNECT, confirmé par `curl: (56)` et par le journal du proxy
(`connect_rejected`, « gateway answered 403 »). `api.github.com` répond 200 :
ce n'est pas une panne réseau générale, c'est un refus ciblé.

Conséquence mesurée — `node scripts/jev-supervisor.mjs` exécuté ici rend :

```
État : incident · Priorité : P1 · Jev : not_configured
home fail 403 · health fail — · database fail — · deployment fail —
access PASS 403 · ci unknown · jev unknown
```

**Ce rapport est faux.** Les quatre `fail` sont le refus du proxy ; aucun paquet
n'a atteint Zabelie. Un agent qui lancerait cette commande et recopierait sa
sortie annoncerait une panne de production qui n'existe pas. Le même mur est
déjà consigné dans `docs/49` (« aucune page du site ouverte — proxy »).

**La supervision ne peut donc être établie que depuis le runner GitHub Actions,
jamais depuis une session agent.** Toute conclusion d'ici sur la santé du site
est sans valeur.

## 3. Défaut de sonde : `access` atteste une autorisation qu'il n'a pas vue

La sonde `access` (POST non authentifié sur `/api/admin/jev`) conclut `pass` dès
que le statut est 401 ou 403 (`jev-supervisor.mjs:59`). **Elle ne vérifie pas
que la réponse vient de Zabelie.** Un 403 d'intermédiaire — proxy d'entreprise,
WAF, Vercel Deployment Protection, filtrage d'IP du runner — se lit comme
« le contrôle d'accès fonctionne ».

Éprouvé sur les trois cas, fetcher injecté, aucun appel réseau réel :

| Cas | Statut vu | Verdict sonde |
|---|---|---|
| Zabelie sain, 401 authentique *(connu-positif)* | 401 | `pass` ✅ attendu |
| Accès réellement ouvert, POST accepté *(connu-négatif)* | 200 | `fail` ✅ rougit bien |
| Intermédiaire 403, rien n'atteint Zabelie | 403 | **`pass`** ⚠️ défaut |

Le cas connu-négatif rougit : la sonde n'est **pas** toujours-passante, et son
intention (« seul un 2xx lève l'alarme », `jev-supervisor.mjs:97-98`) est
respectée. Le défaut est plus étroit, et il faut le dire exactement :

**Portée réelle, mesurée — la conséquence est BORNÉE.** Sous intermédiaire 403,
le rapport global sort en `P1 / incident`, pas en vert : les autres sondes
échouent bruyamment. Le défaut ne produit donc **pas** de silence. Ce qu'il
produit est une **ligne fausse dans un rapport par ailleurs juste** — `access :
pass` affirme une vérification d'autorisation qui n'a pas eu lieu, au moment
précis où le lecteur cherche à savoir si l'admin est exposé.

C'est le motif « un objet vérifié n'est pas le bon objet » de `CLAUDE.md` :
la sonde ne ment pas, elle regarde à côté, et son « pass » se lit comme une
preuve.

### Correctif appliqué le 2026-09-21

`pass` n'est désormais accordé que sur une **preuve positive d'origine
applicative** : un corps JSON de la forme `{ error: "<chaîne non vide>" }`,
c'est-à-dire ce que rend `erreurTraduite()` — le contrat réel de la route,
lu dans `lib/api-erreur.ts:33`, pas supposé. Tout le reste devient `unknown`,
un verdict qui existait déjà dans le vocabulaire de la sonde et ne déclenche
aucune fausse alarme.

⚠️ **L'assertion porte sur la FORME du corps, jamais sur son texte.** Le
message d'erreur est traduit selon le cookie de langue ; un motif sur le
libellé serait aveugle en kreyòl exactement comme `\b` l'est contre `vandè`.
Le test couvre les quatre langues pour que cette propriété soit gardée et non
seulement écrite.

Résultat après correctif, mêmes trois cas :

| Cas | Avant | Après |
|---|---|---|
| Zabelie sain, 401/403 applicatif *(connu-positif)* | `pass` | `pass` ✅ |
| Accès réellement ouvert, 200 *(connu-négatif)* | `fail` → P0 | `fail` → P0 ✅ |
| Intermédiaire 403, rien n'atteint Zabelie | **`pass`** ⚠️ | **`unknown`** → P2 ✅ |

**L'instrument a été éprouvé, pas seulement écrit.** Les deux mutations du
garde ont été passées, post-condition assurée avant lecture :

| Mutation | Résultat |
|---|---|
| garde **supprimé** (`&& refusApplicatif(…)` retiré) | test #7 rouge, 16/17 |
| garde rendu **inatteignable** (`refusApplicatif` → `return true`) | test #7 rouge, 16/17 |

Les deux formes échouent, et seul le test visé rougit — l'assertion isole le
défaut au lieu de l'entourer. Validation : `tsc --noEmit` propre, lint à
0 erreur, **suite complète 1141/1141 verte**.

## 4. Ce qui est sain, et qui mérite d'être dit

- **Aucune dépendance tierce.** `tests/jev-supervisor.test.ts` passe ici avec
  `node_modules` entièrement absent — 15 assertions vertes. Le superviseur
  n'utilise que des modules natifs, comme le workflow le revendique
  (`jev-supervision.yml:30`). C'est vérifié, pas cru.
- **Jev ne peut pas minimiser une alarme.** `jev-supervisor.mjs:165-166` prend
  le **minimum** entre la priorité déterministe et celle du modèle : le modèle
  peut aggraver, jamais adoucir. Et il n'est écouté qu'au-dessus de 0,8 de
  confiance, contre une liste fermée de choix validés.
- **Aucune sortie du modèle n'est exécutée.** Priorité et runbook sont des
  choix contraints, jamais du code ni une URL.
- **Surface de données minimale.** Seuls `{id, status}` partent chez TypeSafe
  (`jev-supervisor.mjs:131`) — jamais de HTML, de journaux, de message client ni
  de secret. Côté connecteur support, `lib/jev.ts:30,37` traite le message
  client comme donnée non fiable et interdit explicitement d'en suivre les
  instructions.
- **Mode observation strict** : `mutationsPerformed: 0`, aucune écriture, aucun
  merge, aucun déploiement. Permissions du workflow en lecture seule.

⚠️ **Non vérifié** : un échec de test local sur `tests/jev.test.ts`
(`Cannot find module 'zod'`) est un **artefact de bac à sable** —
`node_modules` est absent de cette session alors que `zod` est correctement
déclaré dans `package.json`. Ce n'est **pas** un défaut du dépôt et n'a pas été
compté comme tel.

## 5. Ce que cet audit NE dit pas

- Rien sur la santé réelle de zabelie.com : le chemin est bloqué (§2).
- Rien sur les paiements, les soldes, le grand livre ou les données clients —
  hors périmètre du superviseur, qui l'écrit lui-même dans ses `limitations`.
- Rien sur la qualité des réponses de Jev : **aucun appel n'a été émis**, ici ni
  en production. Le modèle `jev-latest` n'a jamais classé un seul signal Zabelie.

## 6. Zones d'arrêt — rien de ceci n'a été fait

Trois gestes sont nécessaires pour que la supervision existe. **Les trois sont
des arrêts fermes de la règle dure n°5** et aucun n'est « une commande que
l'agent suggère et exécute » : ils touchent des variables d'environnement, un
secret et une dépense.

1. Poser la **variable** `JEV_SUPERVISION_ENABLED = true` (GitHub → Settings →
   Secrets and variables → **Actions**, onglet *Variables*).
2. Poser le **secret** `TYPESAFE_API_KEY` (même écran, onglet *Secrets*). Clé
   dédiée ; si l'ancienne a circulé dans une conversation, la révoquer d'abord
   (`docs/JEV-INTEGRATION.md:17`).
3. Accepter la **dépense** : ~24 appels TypeSafe par jour en régime horaire,
   plus les lancements manuels (`docs/JEV-SUPERVISION.md:75-77`).

Puis Actions → *Zabelie - Supervision Jev* → Run workflow → `main`, et vérifier
que le premier rapport porte `jev: ok`. **Un run `skipped` n'est pas une
réussite** — c'est l'état actuel.

Une variable Vercel ou un `.env.local` ne configure pas GitHub Actions.

## 7. Le silence supprimé — correctif du 2026-09-21

Le défaut de §1 n'est pas que la variable manque : c'est que **son absence ne
produisait aucun signal**. GitHub rendait un `skipped`, qui ne s'affiche pas en
rouge, et `docs/JEV-SUPERVISION.md:46` promettait pourtant « Aucun succès
silencieux ». **C'est la garde elle-même qui défaisait la promesse de sa doc.**

L'activation a donc été déplacée du `if:` du job vers le script :

```diff
-    if: … && github.ref == 'refs/heads/main' && vars.JEV_SUPERVISION_ENABLED == 'true'
+    if: … && github.ref == 'refs/heads/main'
         env:
+          JEV_SUPERVISION_ENABLED: ${{ vars.JEV_SUPERVISION_ENABLED }}
```

Le job tourne désormais toujours. Sans activation, `main()` écrit un rapport
`status: "inactive"` portant une seule ligne — `activation: fail` — avec la
bannière « ⛔ SUPERVISION INACTIVE — aucune sonde n'a été tirée », et sort en
**code 2**, ce qui rougit l'étape.

**L'opt-in du porteur est intact, et c'est le point qui compte** : sans
activation, aucune sonde n'est tirée, aucun appel TypeSafe n'est émis, rien
n'est facturé. La correction rend l'absence *visible*, elle ne la *comble* pas.
Les trois gestes du §6 restent entiers et restent les tiens.

⚠️ **Conséquence à connaître** : tant que la variable n'est pas posée, le run
horaire est **rouge** au lieu d'être sauté. C'est l'intention — un agent de
supervision inerte doit se voir — mais c'est une notification par heure. Si le
bruit est excessif avant activation, désactiver le workflow dans Actions est la
bonne réponse ; ne pas remettre la garde dans le `if:`, qui ramènerait le
silence.

La même règle vaut en local : `JEV_SUPERVISION_ENABLED=true` est désormais
requis pour sonder. Une règle unique évite le piège d'un comportement qui
diffère entre local et CI.

### Instrument éprouvé

| Mutation | Tests rouges |
|---|---|
| garde d'activation **supprimée** (`supervise()` toujours appelé) | #17, #18 |
| bannière d'inactivité rendue **inatteignable** | #17, #19 |
| garde **remise dans le `if:` du job** *(la régression d'origine)* | #20 |

Les trois échouent, chacune sur les tests qui la visent. La troisième est la
plus importante : elle garde exactement la faute mesurée aujourd'hui, de sorte
qu'un retour à l'ancienne forme rougisse au lieu de repasser inaperçu.

Le test #17 exerce le **vrai chemin du CLI** en sous-processus, pas seulement
`supervise()` : il assure que `report.checks` ne porte **que** `activation` —
sept entrées signifieraient que le site a été sondé sans opt-in.

Validation : `tsc --noEmit` propre, lint 0 erreur, suite complète verte.
