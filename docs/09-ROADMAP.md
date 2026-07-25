# Zabelie — Feuille de route (7,5 → 9)

> Priorisée par **effet de levier** : chaque effort va au jalon le plus bas non
> terminé. Les jalons sont **séquentiels**, pas parallèles.
> Évaluation de référence : socle technique fort (rail paiement, sécurité,
> conformité) ; ce qui manque, c'est le **passage à la réalité** (prod, premiers
> utilisateurs, retraits).

---

## Où on en est (résumé de la notation)

| Dimension | Note | Commentaire |
|---|---|---|
| Architecture paiement | 9/10 | Idempotence en base, confirmation S2S, réconciliation, escrow J+7, tests SQL exécutables. |
| Sécurité | 8/10 | 3 failles `profiles` fermées (audit) + tests anti-régression. Reste du non-vérifié en prod. |
| Conformité (BRH/RGPD) | 7/10 | Discipline BRH réelle ; RGPD structurel mais placeholders légaux vides. |
| Rigueur d'ingénierie | 8/10 | CI, migrations versionnées, tests JS + SQL, oracle/vérité monétaire séparés. |
| Maturité produit / traction | 4/10 | 0 utilisateur, 0 vente réelle, pas en prod, MonCash pas live. **Plafonne la note.** |
| Cohérence stratégique | 6/10 | Tension Afrique/Haïti corrigée, base de branche périmée : pilotage à resserrer. |

**Global : ~7,5 / 10** (pré-lancement).

---

## Jalon 1 — « Ça tourne en vrai » *(le plus gros levier)*

Rien d'autre ne compte tant que ce n'est pas fait.

1. **Déployer en prod.** Supabase prod + Vercel : appliquer les **17 migrations
   dans l'ordre**, brancher les variables d'env (voir `.env.example`). Puis
   passer les **advisors Supabase** — l'audit fait était statique ; la prod peut
   révéler d'autres RLS manquantes.
2. **Premier paiement MonCash de bout en bout, en réel.** `MONCASH_MODE=production`.
   Un achat réel : checkout → redirect → `confirm_payment` → escrow crédité →
   download signé. **C'est LE jalon** — tant qu'un vrai HTG n'a pas transité, le
   rail reste théorique.
3. **Vérifier les 2 réserves ouvertes** : comportement réel de `ban_duration` /
   `deleteUser` (Supabase Auth) sur la suppression RGPD et la suspension vendeur.

→ Effet : maturité 4→7, sécurité 8→9. **Global ≈ 8,3.**

## Jalon 2 — « Boucle économique + conformité réelles »

Le vendeur encaisse mais **ne peut pas retirer** : la boucle est incomplète.

4. **Débloquer les retraits (dépendance BRH).** (a) avancer le dossier BRH
   payouts, ou (b) en attendant, **retrait manuel avec checkpoint humain** (moyen
   d'origine, traçé) — comme les remboursements topup. Sans ça, aucun vendeur ne
   reste.
5. **Remplir les placeholders légaux** (`/confidentialite` : entité, contact,
   hébergement, durée de rétention). Court mais **bloquant** pour le RGPD.
6. **Réconciliation en alerte.** `/api/reconcile` tourne — mais alimenter
   `OPS_TODO.md` + une notif (email/Slack) sur tout paiement orphelin ou
   `disputed`. Réconciliation sans alerte = détecteur de fumée débranché.

→ Effet : conformité 7→9, maturité 7→8. **Global ≈ 8,7.**

## Jalon 3 — « Traction & robustesse »

7. **Offre avant demande.** Onboarder **10–20 vrais talents haïtiens** avec du
   contenu réel *avant* l'acquisition d'acheteurs — sinon catalogue et carte géo
   vides (mauvais signal).
8. **E2E sur le chemin critique.** Renforcer le money-path : achat → confirmation
   → livraison contre un MonCash mocké. Le SQL est couvert, le *parcours* non.
9. **Tableau de bord ops** : conversion, paiements en attente > X min, escrows à
   maturité, écarts de réconciliation. Piloter avec des chiffres.

→ Effet : maturité 8→9, cohérence 6→8. **Global ≈ 9.**

---

## À NE PAS prioriser maintenant

- **Nouvelles fonctionnalités.** Avis, coupons, topup existent déjà — assez.
  Résister à en ajouter tant que le Jalon 1 n'est pas fait. Le risque n°1 à ce
  stade : empiler des features au lieu de mettre en prod.

## Règle d'or

Tout converge vers **« un vrai paiement MonCash qui passe en prod »**. C'est le
seul jalon qui transforme un très bon prototype en produit.
