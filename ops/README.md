# `ops/` — relevés d'exploitation

Sorties horodatées conservées comme **référence de comparaison**, pas comme
documentation : un rapport de solvabilité relevé avant une migration ne vaut
que s'il survit à la session qui l'a produit.

Convention : `solvabilite-<phase>-<horodatage UTC>.txt`
(ex. `solvabilite-avant-B1-20260726T190000Z.txt`).

```bash
psql "$DATABASE_URL" -At \
  -c "select now(), zabelie_solvency_report();" \
  | tee "ops/solvabilite-avant-B1-$(date -u +%Y%m%dT%H%M%SZ).txt"
```

## ⚠️ Ce que ce dossier NE contient JAMAIS

Ce dossier vit dans **git**. Un commit est permanent : un fichier supprimé
reste dans l'historique, et un dépôt rendu public l'expose entièrement,
rétroactivement.

Deux catégories de relevés, deux destins :

| | Contenu | Destination |
|---|---|---|
| **Solvabilité, cohérence** | montants **agrégés**, aucun identifiant | ici, dans le dépôt |
| **Journal d'apurement** | identifiants vendeurs, numéros MonCash, références de virement | **JAMAIS ici — jamais dans git** |

Le journal d'apurement (qui a été payé, combien, sur quel numéro, contre quel
reçu) se tient **hors du dépôt** : document local du porteur, sauvegardé par un
autre canal. `OPS_TODO.md` peut y faire référence (« apurement du 2026-07-26
effectué, N vendeurs, total X HTG — journal détenu par le porteur ») mais ne
porte ni numéro ni nom.

Le `.gitignore` bloque `ops/apurement*` par défense en profondeur — mais la
règle est comportementale, pas technique : **si un fichier contient un
identifiant de personne ou un numéro de compte, il n'entre pas dans git**,
quel que soit son nom.
