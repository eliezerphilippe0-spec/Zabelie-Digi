# 64 — Les API du Studio Créatif et de Jev : ce qu'il me faut

Pour chaque service : la **documentation** à me transmettre (c'est elle qui
bloque, pas la clé), puis **où poser la clé**. Aucune clé ne se colle dans la
conversation.

État au 2026-09-23 : le code de la Phase 2 est écrit **sans** aucune de ces
API (interfaces, mocks, fetch sécurisé). Les quatre implémentations réelles
attendent ce document rempli.

---

## Comment me transmettre la documentation

Au choix :

1. **Copier-coller** les pages dans la conversation (texte, ou captures
   d'écran lisibles). C'est le plus rapide.
2. **Autoriser les domaines** dans la politique réseau de l'environnement
   Claude Code (menu de l'environnement cloud → Modifier → réseau), pour que je
   les lise moi-même :
   `docs.higgsfield.ai`, `api.higgsfield.ai`, `docs.firecrawl.dev`,
   `api.firecrawl.dev`, `docs.typesafe.ai`, `api.typesafe.ai`, `openrouter.ai`.

Sans l'une ou l'autre, chaque point reste marqué `NON VÉRIFIÉ` et rien n'est
branché — c'est la règle, pas un choix.

---

## 1. Higgsfield — génération des visuels (priorité 1)

**Pages à me donner :**

- [ ] **Authentification** : format exact de l'en-tête (des sources
      secondaires parlent de `Authorization: Key {id}:{secret}` — à confirmer).
- [ ] **Génération d'image** : l'URL exacte, et pour le modèle recommandé :
  - [ ] le champ du **prompt** ;
  - [ ] le champ du **prompt négatif** (existe-t-il ?) ;
  - [ ] le champ de l'**image de référence du produit** (URL ou fichier ?
        c'est indispensable : sans lui, pas de fidélité au produit) ;
  - [ ] le **format / ratio** (`1:1`, `4:5`, `9:16` sont-ils acceptés ?).
- [ ] **Suivi** : comment connaître l'état (`GET …/status` ? webhook ?) et la
      liste des états possibles.
- [ ] **Idempotence** : existe-t-il une clé qui empêche de payer deux fois la
      même génération ?
- [ ] **Erreurs et limites** : codes d'erreur, limite de débit (429 ?).
- [ ] **Tarif** par image, pour le modèle choisi.
- [ ] **Conservation** : combien de temps Higgsfield garde les images et les
      photos envoyées ; les utilise-t-il pour entraîner ses modèles ?
- [ ] **Droits** : à qui appartiennent les images générées (usage commercial
      par le vendeur ?).

**Clés** (créées dans le tableau de bord Higgsfield) :

| Variable | Où |
|---|---|
| `HF_API_KEY_ID` | environnement Claude Code (pour les essais) + Vercel (production) |
| `HF_API_KEY_SECRET` | idem |

---

## 2. Jev (TypeSafe) — juge des briefs et triage du support

Ton compte TypeSafe suffit ; OpenRouter n'est pas nécessaire.

**Pages à me donner :**

- [ ] **Référence de l'endpoint** `/v1/systemone` : structure complète de la
      requête (`model`, `state`, `questions`) et de la réponse (`answers`).
- [ ] Les trois **types de question** et leurs champs :
  - [ ] `choice` (déjà utilisé : `criteria`, `choice`, `confidence` — à confirmer) ;
  - [ ] `noul` (déjà utilisé : valeur `noul` — est-ce la probabilité de « vrai » ?) ;
  - [ ] `score` (**jamais vu** : c'est lui qui noterait les briefs du Studio).
- [ ] **Coût** : la réponse donne-t-elle le coût de l'appel ?
- [ ] **Limites** : débit, codes 429 / 529.
- [ ] **Images** : Jev peut-il juger une image, ou seulement du texte ?
- [ ] **Conservation des données** envoyées (pour le Cabinet Volmar : il
      s'agit de messages clients).

**Clé :**

| Variable | Où |
|---|---|
| `TYPESAFE_API_KEY` | une clé **renouvelée** (l'ancienne a circulé en conversation) : environnement Claude Code + Vercel + `.env.local` pour l'évaluation |

---

## 3. Firecrawl — récupération des pubs de référence (optionnel)

Le Studio sait déjà récupérer une page **lui-même**, avec toutes les
protections (Phase 2, `lib/creative/providers/safe-fetch.ts`). Firecrawl
n'apporte que deux choses : nos serveurs ne contactent plus l'URL, et il
passe mieux les plateformes qui bloquent (Facebook, Instagram, TikTok).

**Pages à me donner, seulement si tu le retiens :**

- [ ] Endpoint de **scrape** : requête, réponse (HTML ? capture d'écran ?).
- [ ] Ce qu'il renvoie pour une pub Facebook / Instagram / TikTok.
- [ ] Tarif, limites, conservation des pages.

**Clé :** `FIRECRAWL_API_KEY` (environnement Claude Code + Vercel).

---

## 4. LLM d'analyse des pubs de référence

Le dépôt a déjà des clés **OpenAI** ou **Gemini** pour les descriptions de
produits (`lib/ai-description.ts`), mais seulement pour du texte.

**À me dire :**

- [ ] Lequel des deux est configuré en production aujourd'hui.
- [ ] La page de doc de son **analyse d'image** (vision) et de sa **sortie
      JSON contrainte** (schéma).

Le choix définitif se fait sur le banc d'essai de la Phase 5 ; il me faut
juste de quoi écrire une première implémentation.

---

## Décisions qui ne sont pas des API, mais qui bloquent aussi

Rappel de `docs/62` §7 — les cinq arbitrages de la Phase 3 :

1. Domaines autorisés pour les liens de référence (ou : capture d'écran seule).
2. Quota de générations par vendeur et par jour.
3. Durée de conservation des visuels et des pages récupérées.
4. Contrôle des images générées : vendeur seul, LLM, ou les deux.
5. Qui paie Higgsfield à terme.

Et le texte intégral de **R-STUDIO-01**.
