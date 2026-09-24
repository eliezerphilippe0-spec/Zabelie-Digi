# 62 — Chantier « Studio Créatif » : Phase 0, reconnaissance (2026-09-23)

Demande : `PROMPT-ZABELIE-STUDIO-CREATIF.md` v1.0 (pubs IA pour vendeurs,
règle R-STUDIO-01). Phase 0 seule : **lecture, aucun code**. Ce document dit
ce qui existe, ce qui manque, ce qui contredit la demande, et ce qui reste à
trancher. **Rien n'est décidé ici.** La Phase 1 attend un « go ».

## 0. Le fait qui commande : le Studio n'aurait aujourd'hui aucun utilisateur

Mesuré en lecture seule sur la production (`ddditxykopuxxqzgkqwy`), le 2026-09-23 :

```
products  draft      7   (1 avec cover_url)
products  archived   3   (0 avec cover_url)
products  published  0
profiles  role = creator            1   (non suspendu)
storage.objects                     1
```

Le Studio part d'un **produit du catalogue** et exige la **fidélité au
produit** (R-STUDIO-01, priorité n°1). Or il n'y a **aucun produit publié**,
**un seul vendeur**, et **une seule image de produit** dans toute la base. Un
moteur d'image ne peut pas être fidèle à un produit qu'il n'a jamais vu : sans
photo, le « visuel publicitaire du produit » serait une invention, exactement
ce que R-STUDIO-01 interdit.

C'est le cas que `CLAUDE.md` nomme « un filet sur un chemin impraticable » :
tout le pipeline pourrait être construit, testé et vert, et ne servir personne.
Même constat que `docs/47` (« 2 produits publiés, 0 image ») et `docs/46`
(« rien avant la première gourde »).

**Recommandation, qui n'est pas une décision :** ne pas ouvrir la Phase 1
tant qu'il n'existe pas quelques produits publiés **avec photo**. Si le
chantier démarre quand même, la Phase 1 (code pur, sans dépense ni fournisseur)
est la seule qui ne coûte rien à attendre.

## 1. Contradictions avec la demande

1. **`MASTER_PROMPT_ZABELIE_AI.md` n'existe pas** dans le dépôt, ni dans
   aucune branche ou aucun commit (constaté pour `docs/61`, reconstaté ici).
   **« Zabelie Entelijan » non plus** : `CHANTIER-ZABELIE-ENTELIJAN.md` est une
   référence morte (`docs/31-CHECKLIST-PRODUCTION.md:17-18`), et **aucun rôle
   Postgres dédié n'existe** dans les migrations (aucun `create role`). Le
   « test de confinement de rôle, sur le modèle d'Entelijan » (invariant 5)
   n'a donc **pas de modèle à suivre**. Le seul précédent réel est celui du
   triage Jev : confinement **par le code**, prouvé par test, plus privilèges
   SQL restreints (`0117`, PR #269, pas encore sur `main`).
2. **Le texte intégral de R-STUDIO-01 n'est pas dans le dépôt**, et le prompt
   n'en donne qu'un résumé (§2). Le prompt demande de le placer dans
   `docs/NN-RULE-R-STUDIO-01.md` : **je ne peux pas l'écrire sans l'inventer**.
   Il faut me fournir le texte.
3. **`RESTRICTED` et `CLOSED` ne sont pas des états codés.** `RESTRICTED` est
   explicitement différé (`docs/23-SYSTEME-VENDEUR.md:35`). `CLOSED` figure
   dans le schéma d'états (`docs/23:15-19`) mais aucune colonne ne le porte dans
   le code lu. Le garde existant est `requireActiveAccount` (`lib/auth.ts:53-59`),
   qui distingue **suspendu** (403) et **état illisible** (503), et
   `seller_is_active()` (`0017`, cité `docs/23:154`). Des tests « pour chaque
   état » ne peuvent porter que sur les états qui existent.
4. **Jev n'est pas branché via OpenRouter**, mais en TypeSafe direct
   (`lib/jev.ts:21`). Le transport configurable (`JEV_BASE_URL`, relances
   bornées) existe dans `lib/jev/client.ts` — **sur la PR #269, pas encore sur
   `main`**. Le Studio en dépendrait.
5. **Collision de nom.** Le dépôt a déjà un « Atelier numérique » /
   `digital-studio` (`docs/54`, `lib/digital-studio.ts`, `0104_digital_studio.sql`),
   qui n'a rien à voir (packs et formations). Nommer ce chantier « studio »
   dans le code créerait des `studio` ambigus. Proposé : préfixe
   `creative`/`kreyatif` dans le code, jamais `studio` seul.
6. **Une branche par phase** : ce document est sur `claude/studio-creatif-phase0`,
   créée depuis `main`, conformément au prompt. La session avait une branche
   désignée différente (`claude/sharp-brahmagupta-fkl8fg`, qui porte la PR Jev
   #269) : je signale l'écart plutôt que de mêler les deux chantiers.

## 2. Inventaire de l'existant

| Brique demandée | Existant | Réutilisable ? |
|---|---|---|
| Code Studio Créatif | **aucun** (`git grep -i` sur `studio` : seul l'Atelier numérique, §1.5) | — |
| Intégration Higgsfield | **aucune dans le code**. Higgsfield est une décision **de design** (`docs/02-DECISIONS.md:18`, V-7 ; `CLAUDE.md:41`) utilisée via MCP pour produire les visuels du site, jamais appelée par l'application | non : tout est à écrire |
| Modèle de provider | `TopupProvider` (`lib/zabelie-topup/provider.ts:50-56`) : nom, opérations typées, résultat `ok/retryable`, statut, réconciliation ; `getTopupProvider()` renvoie `null` si non configuré (`lib/zabelie-topup/fulfill.ts:18`) | **oui, comme modèle** pour `CreativeProvider` |
| Fournisseur LLM existant | `lib/ai-description.ts:49,78-80` : OpenAI ou Gemini, choisi par la présence de la clé ; route `app/api/ai/description/route.ts` | **partiellement** : le choix de clé et le transport, pas la route (voir ligne suivante) |
| Quotas | `rateLimit` atomique (`lib/zabelie-rate-limit.ts:10`) : rafale et quota journalier (`app/api/ai/description/route.ts:82,94-95`) | **oui** pour le compteur. ⚠️ **Ne pas reprendre la suite de la route** : au-delà du quota elle **facture** (402 + surplus, `route.ts:105-111`, `docs/34`), ce que l'invariant 6 interdit ici |
| Drapeaux | motif `=== "true"`, défaut fermé (`lib/topup-flag.ts:44-45`, `lib/jev/triage.ts` sur #269) | oui |
| Garde vendeur | `requireActiveAccount` (`lib/auth.ts:53-59`), `seller_is_active()` (`0017`) | oui |
| i18n | 4 langues `fr`/`ht`/`en`/`es` (`lib/i18n.ts:18-20`), parité gardée (`tests/i18n.test.ts`). ⚠️ Le **défaut technique est `fr`** (`lib/i18n.ts:2`) : « Kreyòl-first » est une règle de rédaction, pas un défaut du code | oui |
| Thème | `app/zabelie-theme.css` source unique, contraste bloquant en CI (`app/zabelie-theme.css:1-8`) | oui |
| Masquage de texte avant tiers | `lib/jev/redact.ts` (#269) | oui, pour les pages de référence envoyées au LLM |
| Migrations | garde `zabelie_migration_garde` en tête (`tests/migration-garde-rejeu.test.ts`), empreinte canonique `scripts/zabelie-migration-hash.mjs`, suite contiguë (`tests/migrations-suite.test.ts`) | oui |
| Journal append-only | modèle `0113` (support) et `0117` (#269) : trigger `before update or delete` + `before truncate`, et **`revoke … from service_role` avant `grant`** (défaut mesuré en #269 : les privilèges par défaut ouvrent la réécriture) | oui |
| Stockage des visuels | `storage.objects` : **1 objet** en tout. `CLAUDE.md` consigne des buckets RLS sans policy au 2026-08-11 | **à vérifier** avant tout stockage de visuels générés |
| Fetch sécurisé (SSRF) | **aucun** module de fetch d'URL arbitraire côté serveur | tout est à écrire |

**Prochain numéro de migration** — ⚠️ corrigé le 2026-09-23 : ce paragraphe
annonçait `0115`, et c'est exactement le piège que `CLAUDE.md` décrit. Entre
l'écriture et la relecture, `main` a reçu `0114`→`0116` (clairin, #273 et #274),
et la PR #269 a dû renuméroter son journal en `0117`. Le Studio prendrait donc
**`0118`** si #269 est fusionnée d'abord. **Le numéro ne s'écrit pas ici, il se
lit au moment d'écrire la migration** : `ls supabase/migrations | tail -1`.

## 3. Documentation externe : tout est `NON VÉRIFIÉ`

Depuis cette session, le proxy sortant refuse `docs.higgsfield.ai`,
`platform.higgsfield.ai`, `docs.firecrawl.dev`, `api.firecrawl.dev`,
`openrouter.ai`, `docs.typesafe.ai` (403 sur CONNECT, mesuré). Le MCP
Higgsfield demande une authentification que la session ne peut pas faire ;
la clé du MCP Firecrawl est invalide.

| Fournisseur | Ce que disent des sources **secondaires** (résultats de recherche) | Statut |
|---|---|---|
| Higgsfield | `https://api.higgsfield.ai`, en-tête `Authorization: Key {id}:{secret}`, `POST /{model_id}` puis `GET /requests/{id}/status` ou webhook | **NON VÉRIFIÉ** — rien sur l'idempotence, le prompt négatif, l'image de référence produit, la rétention, le prix |
| Jev (Decisions) | OpenRouter `POST /api/alpha/decisions` (alpha, ~15 % d'appels bloqués signalés) ; TypeSafe `/v1/systemone` | **NON VÉRIFIÉ** ; **rien ne dit que Jev juge des images** — le contrôle post-génération est donc hors Jev |
| Firecrawl | — | **NON VÉRIFIÉ** (aucune lecture possible) |
| LLM multimodal d'analyse | OpenAI / Gemini déjà configurés pour le texte (`lib/ai-description.ts`) ; leur usage en vision n'est pas dans le code | **NON VÉRIFIÉ** |

Conformément à l'invariant 1, **je m'arrête sur ces points** : aucun contrat
de provider ne s'écrit avant que la doc soit lue (la coller, ou autoriser les
domaines dans la politique réseau de l'environnement).

Sources secondaires : [docs.higgsfield.ai](https://docs.higgsfield.ai/docs)
(non ouverte), [open.higgsfield.ai quick start](https://open.higgsfield.ai/quick-start)
(non ouverte), [apidog — How to use Higgsfield API](https://apidog.com/blog/higgsfield-api/).

## 4. Risques

1. **Pas d'utilisateur, pas de photo** (§0) — le risque qui domine tous les
   autres.
2. **Données de tiers.** Les liens de référence sont des pubs d'autres
   marques : récupérer, analyser et « s'inspirer » touche au droit d'auteur et
   aux marques. Le schéma de sortie qui interdit slogans et marques (§3.2 du
   prompt) réduit le risque, il ne le supprime pas. Question pour un conseil,
   pas pour l'agent.
3. **Personnes générées.** R-STUDIO-01 interdit les personnes réelles
   identifiables et le colorisme ; aucun moteur ne le garantit. Seule une revue
   humaine le vérifie — d'où l'arbitrage n°4.
4. **Coût sans revenu.** Chaque génération Higgsfield a un prix (non vérifié)
   et le chantier interdit toute facturation (invariant 6). Le quota est donc
   la seule borne de dépense.
5. **SSRF.** Un fetch d'URL fournie par l'utilisateur est la surface d'attaque
   la plus classique d'un serveur ; le contrat §3.1 du prompt est le bon, et
   il doit être éprouvé avant d'exister en production.
6. **Dépendance à la PR #269** (transport Jev, masquage, journal `0117`).

## 5. Schéma de tables proposé (non écrit)

Une seule table au départ, sur le modèle de `0117` (#269) :

`zabelie_creative_generations` — journal append-only, une ligne par
génération : `id`, `seller_id` → `profiles`, `product_id` → `products`,
`params` (jsonb validé : audience, profil, langue, direction, marché),
`reference_urls` (≤ 3, `https`), `analysis` (jsonb structurel, jamais de
texte verbatim), `briefs` (jsonb, 8 à 10), `jev_scores` (jsonb, nullable),
`final_prompt`, `negative_prompt`, `provider`, `provider_ref`, `rule_version`
(`'R-STUDIO-01'`), `status` (`requested`/`generating`/`completed`/`failed`),
`vendor_choice` (nullable), `created_at`.

⚠️ **Append-only et machine d'états se contredisent** : `status` et
`vendor_choice` changent après l'insertion. Deux façons de tenir les deux :
une table d'**événements** (une ligne par transition, jamais modifiée) plus une
vue de l'état courant, ou une table principale figée plus une table
`zabelie_creative_events`. Proposé : **événements**, parce que c'est la forme
que le trigger anti-UPDATE peut réellement garder.

RLS : le vendeur lit ses propres lignes ; aucune écriture client ; `service_role`
en `select, insert` seulement. Aucune colonne financière, aucune clé vers
commande, paiement, escrow, ledger, retrait, KYC ou recharge.

## 6. Plan des phases (inchangé sur le fond, précisé)

| Phase | Contenu | Dépend de |
|---|---|---|
| 1 | R-STUDIO-01 en code : enums, défauts, Prompt Builder pur, tests | **texte intégral de R-STUDIO-01** |
| 2 | Providers + mocks, fetch SSRF, tests d'injection | doc Higgsfield / Firecrawl / LLM lue (§3) |
| 3 | migration (numéro lu au moment d'écrire), RLS, journal d'événements, routes, garde vendeur, quotas | arbitrages 1 à 5 (§7) ; #269 fusionnée |
| 4 | Interface kreyòl-first | Phase 3 |
| 5 | Banc d'essai (20 pubs, 20 briefs, 80 générations) | clés fournisseurs, dépense acceptée, **produits avec photo** |

## 7. Arbitrages bloquants — options et conséquences, sans décision

**1. Domaines autorisés pour les liens de référence**

| Option | Conséquence |
|---|---|
| Aucun lien en v1, capture d'écran seule | supprime la surface SSRF et le fetch externe ; le vendeur fait une capture lui-même, ce qu'il fait déjà sur WhatsApp |
| Réseaux publics (`facebook.com`, `instagram.com`, `tiktok.com`) | ce sont les pubs que les vendeurs voient ; mais ces plateformes bloquent souvent le fetch sans session → échec fréquent, repli capture de toute façon |
| Liste libre | surface SSRF maximale ; contraire au contrat §3.1 |

**2. Quota par vendeur et par jour** — sans prix Higgsfield vérifié, le coût
d'un quota n'est pas calculable. Options : 3/jour (≈ une génération complète
de 2–3 visuels), 10/jour, ou quota global plateforme en plus du quota
vendeur (borne de dépense absolue).

**3. Conservation** des visuels et des pages récupérées : 30 jours, 90 jours
(aligné sur la rétention de recherche `0047`), ou jusqu'à suppression par le
vendeur. Les pages de référence n'ont pas de raison d'être gardées au-delà de
l'analyse ; seul le JSON structurel se garde.

**4. Contrôle des images après génération** : revue vendeur seule (gratuit,
mais le vendeur n'est pas juge du colorisme ou de la caricature), LLM
multimodal (coût, et fiabilité non mesurée), ou les deux. Jev est exclu tant
que sa doc ne prouve pas qu'il juge des images (§3).

**5. Qui paie Higgsfield à terme** — hors périmètre, mais il fixe le quota.

## 8. Ce qui est rendu au porteur

1. Le **texte intégral de R-STUDIO-01**.
2. `MASTER_PROMPT_ZABELIE_AI.md`, ou la confirmation qu'il est caduc.
3. La documentation des fournisseurs (§3), ou l'ouverture des domaines.
4. Les cinq arbitrages (§7).
5. **La question préalable** : ouvrir ce chantier avant qu'existent des
   produits publiés avec photo (§0) ?

Stop. Aucun code écrit ; la Phase 1 attend un « go ».

## 9. Phase 3 — faite le 2026-09-24, et les choix pris par défaut

Le porteur a dit « go » sans trancher les arbitrages du §7. Chacun a donc reçu
la valeur **la plus prudente**, et tout est **réversible sans code** : le
Studio reste éteint tant que `ZABELIE_STUDIO_ENABLED` ne vaut pas `true`, et
l'allumer (clés Higgsfield comprises) est une **dépense**, donc un geste du
porteur.

| Arbitrage (§7) | Choix par défaut | Où le changer |
|---|---|---|
| 1. Liens de référence | **aucun en v1** : la route n'en accepte pas | Phase ultérieure (le fetch SSRF de la Phase 2 est prêt, sans appelant) |
| 2. Quotas | **3 images/vendeur/jour**, **30/jour pour la plateforme** (≈ 0,32 $/jour au prix console, docs/65 §2) | `zabelie_studio_config` (règle dure 3) |
| 3. Conservation | Zabelie ne **copie** aucune image : le journal garde l'URL rendue par Higgsfield. Leur rétention reste NON VÉRIFIÉE (docs/65 §6) | à revoir quand `/docs/concepts/requests` sera lue |
| 4. Contrôle des images | **revue vendeur seule** ; les interdits sont écrits dans le prompt, faute de champ négatif | Phase 4 (interface) |
| 5. Qui paie | la plateforme, **bornée par le quota global** | décision porteur avant allumage |

Ce qui est construit :

- `0118_studio_creatif.sql` : une ligne figée par génération et une ligne par
  transition, toutes deux append-only. L'idempotence (unique vendeur + clé),
  les quotas (jour civil haïtien, sous verrou) et l'ordre des transitions sont
  gardés **en base**. Une suppression de compte ou de produit emporte ses
  générations. Rédigée, **non appliquée**.
- `POST /api/studio/generations` : la ligne est inscrite **avant** l'appel
  payant, et une clé rejouée ne soumet rien.
- `GET /api/studio/generations/[id]` : un sondage par lecture. Au-delà de
  5 min sans soumission constatée, la génération est `soumission_perdue` ;
  au-delà de 15 min de génération, `delai_depasse`. Jamais de relance.
- Prompt Builder : le portrait passe de `4:5` à **`3:4`** (docs/65 §3.2).

Reste, dans l'ordre : appliquer `0118` · la Phase 4 (interface kreyòl-first) ·
l'allumage, qui est au porteur (clés dans Vercel, drapeau, quotas confirmés).
