# Chantier 0 — Voie de sortie vendeur

> **Priorité absolue, avant le chantier A (rebrand).** Construire une
> marketplace de produits physiques par-dessus un mécanisme où le vendeur ne
> peut pas être payé revient à multiplier le volume d'un problème non résolu.
> Le rebrand peut attendre une semaine ; la voie de sortie, non.
>
> **Statut : PLAN. Aucun code écrit.** Rédigé le 2026-07-24.

---

## 0. Rappel du problème

Les vendeurs ont de l'argent chez la plateforme et ne peuvent pas y toucher.
La table `payouts` existe (`0001_schema.sql:119-126`) mais aucune fonction ni
interface ne l'alimente ; le commentaire du schéma dit lui-même « ⛔ Retraits
BLOQUÉS en Vague 1 ».

**Ce n'est pas d'abord un sujet réglementaire.** Dans un marché où le commerce
se fait sur WhatsApp, **un seul vendeur qui écrit « Zabelie kenbe lajan m »
coûte plus cher que n'importe quelle sanction.** La confiance vendeur est
l'actif principal, et elle est engagée maintenant.

---

## 1. ⚡ Priorité absolue : 0.a — enregistrer les règlements manuels

> **Découverte en lisant le schéma : c'est le lot le plus urgent, et il est
> petit.**

L'apurement manuel commence aujourd'hui (virements MonCash directs contre
reçu). **Si ces paiements ne sont pas enregistrés dans le registre, celui-ci
continuera d'afficher une dette déjà payée** — le solde vendeur restera
créditeur, le vendeur pourra réclamer deux fois, et toute réconciliation
ultérieure partira d'une base fausse. L'écart deviendrait permanent.

Il faut donc, **avant ou en parallèle immédiat du premier virement**, un moyen
d'inscrire : « payé X HTG au vendeur Y le date D, référence MonCash Z ».

### Ce que le schéma actuel ne permet pas
`payouts` ne contient que `wallet_id`, `amount_htg`, `status`, `created_at`.
**Il manque** : le moyen de paiement, la **référence du reçu**, la date de
règlement effectif, et l'identité de l'administrateur qui l'enregistre —
c'est-à-dire tout ce qui rend le règlement **opposable** (question Q7 du
dossier juridique).

### Contenu du lot 0.a
1. **Migration `0032`** — enrichir `payouts` : `method` (`moncash` | `especes`
   | `autre`), `reference` (n° de reçu), `paid_at`, `recorded_by`, `note`.
2. **Fonction `zabelie_record_manual_payout`** (`security definer`, révoquée du
   client) : sous verrou du portefeuille, vérifie que le montant n'excède pas
   `available_htg`, débite, insère la ligne `payouts` (statut `paid`) **et**
   l'écriture `wallet_transactions` de type `payout` — laquelle est déjà
   protégée en append-only (trigger de `0025`). Clé d'idempotence obligatoire
   (`payout:<reference>`) pour qu'un double enregistrement soit sans effet.
3. **Écran admin minimal** : sélection du vendeur, montant, référence, note →
   enregistrement. Pas de design, une table et un formulaire.
4. **Tests SQL** : débit correct · refus si montant > disponible · rejeu
   idempotent sans double débit · immuabilité de l'écriture.

**Effort : S/M.** C'est le lot à livrer en premier.

---

## 2. 0.b — Retrait self-service (le vrai décaissement)

Une fois l'urgence traitée, la voie de sortie pérenne.

1. **Demande de retrait par le vendeur** : route API + interface dans le
   tableau de bord (aujourd'hui, `app/tableau-de-bord/page.tsx:241` affiche
   « Les retraits arriveront avec la suite »).
2. **Seuil minimum** — en **table de config** (`zabelie_payout_limits`), jamais
   en dur : montant minimum de retrait, éventuel plafond par demande, délai
   entre deux demandes. *(Valeur de départ à fixer par le porteur.)*
3. **Machine à états** `requested → processing → paid` / `rejected` —
   l'énumération `payout_status` existe déjà (`0001_schema.sql:21`).
   Chaque transition journalisée, aucune transition arbitraire.
4. **Débit atomique** sous verrou, au moment de la demande (le montant est
   immobilisé), restitué si la demande est rejetée.
5. **Exécution du versement** : manuelle au départ (l'admin vire puis marque
   `paid` avec référence — même fonction qu'en 0.a). L'automatisation suppose
   une **API de versement MonCash**, à vérifier auprès de Digicel : elle
   n'existe pas dans le code actuel (`lib/moncash.ts` n'expose que création et
   vérification de paiement).
6. **Blocage vendeur suspendu** : `0017_seller_suspension.sql` prévoit déjà que
   la suspension doit bloquer le décaissement — à honorer ici.

**Effort : M.**

---

## 3. 0.c — Réconciliation registre ↔ compte marchand

> Le point le plus important du chantier, et celui qu'il vaut mieux découvrir
> maintenant que devant un avocat.

### 3.1 Contrôle de cohérence interne (automatisable)

Identité qui doit être vraie à tout instant :

```
Σ(net vendeur crédité) − Σ(escrows annulés) − Σ(payouts payés)
    = Σ(wallets.pending_htg + available_htg)
```

et, côté encaissement :

```
Σ(orders payées) − Σ(remboursements)
    = Σ(platform_earnings.commission) + Σ(soldes vendeurs) + Σ(payouts payés)
```

→ Route de contrôle protégée (même garde que `/api/reconcile`), exécutée en
cron, qui **alerte** en cas d'écart. Purement interne : ne nécessite aucun
accès externe.

### 3.2 Contrôle de solvabilité (le nombre qui compte)

```
Solde réel du compte marchand MonCash   ≥   Σ(soldes vendeurs)
```

**Si cette inégalité est fausse, la plateforme ne peut pas honorer ce qu'elle
doit à ses vendeurs.** C'est le chiffre à connaître en premier, et il n'a
jamais été calculé.

⚠️ **Limite technique honnête** : aucun endpoint de solde ou de relevé n'est
implémenté, et j'ignore si MonCash en expose un. Tant que ce point n'est pas
vérifié auprès de Digicel, **ce contrôle se fait à la main** : relevé du compte
marchand exporté depuis l'interface MonCash, comparé au total du registre.
À faire **une fois immédiatement**, puis à automatiser si l'API le permet.

### 3.3 Ce que la réconciliation ne corrigera pas
Elle mesure un écart, elle ne l'explique pas. Si écart il y a, l'origine
(paiement encaissé hors commande, remboursement non tracé, prélèvement sur le
compte) relève d'une investigation manuelle.

---

## 3 bis. Le point de fond — le bouton est un palliatif, pas le correctif

L'exposition n'est pas « un bouton manquant » : la plateforme **détient des
fonds de tiers sans mécanisme de sortie** — exactement le risque Circulaire 121
que l'architecture évite partout ailleurs (Business sans rétention, wallet en
registre comptable). Ce module est le seul endroit où le risque a été
reconstitué, par accident.

La bonne réponse est donc de **réduire la durée de détention**, pas seulement
d'ajouter une action vendeur :

- **Correctif cible : versement AUTOMATIQUE à maturité** — dès que l'escrow
  J+7 mature, le net part vers le numéro MonCash du vendeur, sans qu'il ait
  rien à demander. (« Automatique » peut être un humain chaque lundi au début —
  l'essentiel est que ça arrive sans demande du vendeur. Ne promettre ce
  comportement aux vendeurs que s'il est tenable dès la semaine de la
  promesse.)
- **Palliatif : le bouton de retrait** (lot 0.b) — utile immédiatement,
  insuffisant seul.
- ⚠️ **La dépendance API ne conditionne PAS la faisabilité.** Le versement
  sans demande est tenable dès cette semaine, à la main, depuis le compte
  marchand — il ne tient qu'à la discipline de l'exécuter. L'API de VERSEMENT
  MonCash (à confirmer auprès de Digicel — le code actuel ne sait qu'encaisser
  et vérifier) change le **coût et l'échelle**, pas la possibilité. Corollaire
  pour la communication : la promesse « lajan w ap vin jwenn ou san ou pa
  bezwen mande » n'attend aucune API — mais ne la prononcer que si la
  discipline hebdomadaire est réellement engagée.

## 3 ter. Protocole d'apurement manuel (avant application de 0032)

1. **Payer d'abord, écrire ensuite.** « M sot voye w lajan an, referans X »
   est incontestable ; « m ap voye w » est une promesse de plus à quelqu'un qui
   attend déjà. N'écrire qu'aux vendeurs payables le jour même — écrire à
   douze et en payer trois transforme un problème silencieux en neuf témoins
   actifs.
2. **Décomposer le montant** dans chaque message : brut vendu, commission au
   taux réellement appliqué à chaque vente, net versé — et distinguer la part
   encore en maturation J+7 s'il y en a une. Un net sans détail se lit comme
   une retenue supplémentaire.
3. **Vérifier le numéro MonCash** s'il arrive par le fil de discussion :
   comparer à celui du dossier, sinon la porte à l'usurpation est ouverte.
4. **Journal durable dès le premier virement**, une ligne par règlement :
   `identifiant vendeur · brut · commission · net · horodatage · référence
   MonCash`. Quand `0032` sera appliquée, la régularisation s'écrit comme des
   **entrées nouvelles** (`zabelie_record_manual_payout`, une par ligne du
   journal) — **jamais** comme une correction de soldes : contourner
   l'append-only pour rattraper l'historique ferait perdre au registre la
   propriété pour laquelle il existe.

## 4. Ordre d'exécution proposé

| # | Lot | Effort | Bloquant pour |
|---|---|---|---|
| 1 | **0.a** — enregistrement des règlements manuels | S/M | L'apurement en cours : sans lui, le registre ment |
| 2 | **0.c.2** — relevé MonCash comparé au registre (manuel, une fois) | S | Connaître la solvabilité réelle |
| 3 | **0.b** — retrait self-service + seuil en config | M | La sortie pérenne |
| 4 | **0.c.1** — contrôle de cohérence automatisé + alerte | M | La surveillance continue |

Puis seulement : chantier A (rebrand), puis B→F.

---

## 5. Décision — continuer ou suspendre l'accumulation

**Le critère n'est pas la taille de l'écart.** Tant qu'aucune sortie ne
fonctionne, chaque vente aggrave l'exposition — c'est **l'existence de la
sortie** qui décide, pas son montant. Les trois requêtes SQL (§6 du dossier)
disent l'**urgence du décaissement** (qui payer d'abord, en combien de temps),
pas s'il faut continuer d'encaisser.

| Une sortie fonctionne-t-elle dès aujourd'hui ? (l'apurement manuel discipliné
du §3 ter compte comme sortie) | Conduite |
|---|---|
| **Oui** — les vendeurs sont payés sans demande, à cadence tenue | Continuer d'encaisser |
| **Non** | **Suspendre les nouvelles commandes** qui créditent le registre, quelle que soit la taille de l'encours |

> **Ne pas laisser le compteur tourner pendant que le dossier circule.**

Techniquement, la suspension est simple : la plateforme dispose déjà d'un
mécanisme de masquage des produits (`0017_seller_suspension.sql`) et le
checkout refuse proprement un rail indisponible. Une bascule de configuration
suffirait — **à spécifier seulement si cette option est retenue.**

---

## 6. Ce qui est attendu pour démarrer

1. **Les trois requêtes SQL** du dossier §6 — tout le reste en dépend.
2. Le **relevé du compte marchand MonCash** (§3.2) — pour la solvabilité.
3. La **décision §5** : on continue ou on suspend l'accumulation.
4. Le **seuil minimum de retrait** (§2.2) — valeur de départ.
5. Le `go` sur ce plan, lot par lot.
