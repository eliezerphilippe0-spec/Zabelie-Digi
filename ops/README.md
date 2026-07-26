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

⚠️ Ces fichiers contiennent des **montants agrégés**, jamais d'identifiant
d'acheteur ni de coordonnée. Ne rien y ajouter qui ne respecte pas cette règle.
