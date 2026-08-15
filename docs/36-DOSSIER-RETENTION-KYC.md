# Dossier d'arbitrage — rétention des pièces d'identité vendeur

> **Destinataire** : HDIT / Cabinet Volmar (droit bancaire et financier haïtien).
> **Rédigé le** : 2026-08-15 · **Statut** : en attente d'envoi par le porteur.
> **Ce document ne tranche rien.** Il expose l'état du code, cite les cadres
> voisins avec leurs sources, et pose les questions que seul un conseil peut
> trancher. Aucune affirmation sur le droit haïtien n'y est faite.

## En une phrase

Le défaut technique actuel — **90 jours après décision** — est
**vraisemblablement faux dans les deux branches** de la seule question qui
compte, et il est faux dans des directions opposées. Si Zabelie est assujettie
aux obligations de vigilance LBA/FT, 90 jours est environ **vingt fois trop
court**. Si elle ne l'est pas, la doctrine RGPD dit de supprimer la pièce
**dès l'identité vérifiée**, et 90 jours devient une conservation « au cas où ».

---

## Volet 1 — L'état exact du dépôt

### Ce qui est collecté

| Quoi | Où | Détail |
|---|---|---|
| Deux documents parmi CIN, passeport, **selfie** | `supabase/migrations/0079_kyc_vendeur.sql:75` | `check (kind in ('cin', 'paspo', 'selfie'))` |
| Nombre exigé | `0079:40` | `docs_requis` = **2** (bornes 1–4) |
| Durée de conservation | `0079:41` | `retention_jours` = **90** (bornes 1–3650) |
| Blocage du retrait | `0079:37` | `requis_pour_retrait` = **false** — dormant, personne n'est coupé |

### Où vivent les pièces

Bucket **privé** `kyc-documents` (`0079:86`, `public = false`), **aucune policy
RLS** — accès service-role uniquement, vérifié en post-condition. L'admin ouvre
chaque pièce par **URL signée de 300 secondes** (`app/api/admin/kyc/route.ts`).
Aucune surface ne rend d'image : garde figée par
`tests/kyc.test.ts:120`. Chaque décision est horodatée, attribuée, et journalisée
dans `zabelie_admin_actions` (0055).

### Quand elles sont détruites

`zabelie_kyc_docs_expires()` (`0079:240`) ne retient que les dossiers **décidés**
(`decided_at is not null`) dont la décision est plus vieille que
`retention_jours`. Un dossier en attente n'est jamais purgé. Le cron
`/api/kyc/purge` supprime **les objets d'abord, les lignes ensuite** — l'ordre
inverse laisserait des pièces sans trace.

### Ce que les documents publics disent — et ne disent pas

- **Politique de confidentialité** : décrit la collecte depuis le 2026-08-15
  (§9, quatre langues, `lib/policy-privacy.ts`). La **durée y est un blanc
  visible** : `{retentionKyc}` → `[À COMPLÉTER : durée de conservation des
  pièces d'identité]` (`lib/policy-privacy.ts:67`), compté par
  `tests/politique-confidentialite.test.ts` qui échoue dans les deux sens.
- ⚠️ **Les CGU ne mentionnent PAS la vérification d'identité.**
  `lib/policy-terms.ts` ne contient aucune occurrence de « identité »,
  « vérification » ou « KYC ». Le document qui porte les **obligations du
  vendeur** ne dit nulle part qu'un retrait peut en exiger une. Les cinq
  marqueurs `[À COMPLÉTER]` des CGU (`policy-terms.ts:52, 144, 171, 179`)
  concernent l'âge minimum, la fenêtre de litige, la résiliation et le droit
  applicable — aucun ne couvre le KYC.

### Volumétrie réelle

**Zéro dossier déposé à ce jour.** Aucune pièce d'identité n'est en base ni au
stockage. L'arbitrage se rend donc **avant** que la première donnée sensible
existe — c'est la position la plus confortable possible, et elle ne durera pas.

---

## Volet 2 — Les cadres voisins, avec leurs sources

> Aucun de ces cadres n'est le droit haïtien. Ils sont donnés comme **points de
> comparaison**, parce que la pratique haïtienne s'aligne historiquement sur le
> GAFI et que la diaspora place une partie des utilisateurs sous RGPD.

### a) GAFI / FATF — Recommandation 11 : **au moins cinq ans**

La R.11 impose aux institutions financières et aux EPNFD de conserver les
données d'identification — copies de passeports, cartes d'identité, permis —
**au moins cinq ans après la fin de la relation d'affaires** ou après une
transaction occasionnelle, avec un niveau de détail permettant de reconstituer
les opérations pour une enquête pénale.

### b) RGPD / CNIL — la direction **inverse**

L'article 5 impose la **minimisation** : adéquates, pertinentes, limitées à ce
qui est nécessaire. La CNIL rappelle que conserver une copie de pièce d'identité
ne peut se justifier par une simple éventualité — stocker « au cas où »
contrevient à l'exigence de nécessité et de proportionnalité. La doctrine
pratique est de **supprimer la copie une fois l'identité confirmée**, sauf
obligation légale spécifique. Et c'est précisément l'obligation LBA/FT qui, pour
les établissements financiers, justifie les cinq ans.

**Les deux cadres ne se contredisent donc pas** : ils sont les deux branches
d'une même alternative, et le commutateur est l'assujettissement.

### c) Haïti — ce que je n'ai PAS pu établir

Un **décret du 20 avril 2023** sur le blanchiment et le financement du
terrorisme existe, et la BRH a émis une **circulaire 129-1** sur les mesures
préventives. Je n'ai **pas** pu établir depuis les sources publiques
consultables si ces obligations s'étendent à une marketplace qui n'est ni
banque, ni émetteur de monnaie électronique, ni prestataire de services de
paiement. **C'est exactement le point à trancher, et il n'est pas
documentable de l'extérieur.**

---

## Volet 3 — Recommandation par défaut et questions

### La recommandation d'attente

**Ne rien changer, et ne rien publier.** Le `retention_jours = 90` reste en base
comme défaut technique, le blanc `[À COMPLÉTER]` reste visible dans la
politique. Rien n'est engagé publiquement, aucune donnée sensible n'existe
encore, et l'ajustement final sera un `UPDATE` d'une ligne — pas une migration,
pas une PR.

**Ce qui peut avancer sans attendre la réponse** : la mécanique est déjà
paramétrée (`retention_jours` en table de config, bornes 1–3650), le cron de
purge tourne et journalise à vide, et la garde de retrait est dormante. Il n'y a
donc rien à coder qui dépende de l'arbitrage.

### Les trois questions pour le cabinet

**Q1 — Assujettissement.** Zabelie exploite une marketplace encaissant sur un
compte marchand unique et retenant le net vendeur jusqu'au règlement (voir
`docs/17-DOSSIER-BRH-RETENTION.md`). Est-elle soumise aux obligations de
vigilance et de conservation du décret de 2023 / de la circulaire BRH 129-1 ?
*C'est la question qui commande les deux autres.*

- Si **oui** → la durée est plancher, pas plafond : à quel délai exact, et à
  partir de quel événement (dernière transaction, clôture du compte vendeur) ?
- Si **non** → la doctrine RGPD s'applique seule : peut-on supprimer la pièce
  **dès la décision d'approbation**, en ne conservant que la trace de la
  décision (déjà journalisée dans `zabelie_admin_actions`) ?

**Q2 — Base légale à publier.** La politique de confidentialité §9 annonce
aujourd'hui **deux** bases : *intérêt légitime* (prévention de la fraude) et
*obligation légale* (« nos obligations de vigilance là où elles s'appliquent »).
Si la réponse à Q1 est « non », la mention d'obligation légale devient inexacte
et doit être retirée du texte publié.

**Q3 — Le selfie.** Le dispositif accepte une photo du visage comme l'une des
deux pièces, aux fins de la rapprocher du document présenté. Ce rapprochement
peut-il être qualifié de traitement biométrique aux fins d'identification unique
— et si oui, faut-il le retirer du dispositif plutôt que de l'encadrer ? *Le
retirer coûterait peu : `KYC_TYPES` est une liste dans `lib/kyc.ts` et une
contrainte `check` dans `0079`.*

### Une question annexe, non juridique

Les CGU ne mentionnent pas la vérification d'identité (volet 1). Indépendamment
de l'arbitrage sur la durée, une clause doit y être ajoutée avant l'armement du
blocage : un vendeur ne peut pas se voir refuser un retrait sur le fondement
d'une exigence que le contrat n'énonce nulle part. **Le gabarit de cette clause
peut être rédigé sans attendre la réponse** — seule sa durée dépend de Q1.

---

## Sources

- [The FATF Recommendations (PDF officiel)](https://www.fatf-gafi.org/content/dam/fatf-gafi/recommendations/FATF%20Recommendations%202012.pdf.coredownload.inline.pdf)
- [FATF Recommendation 11 — Record-Keeping (FinancialCrime.lu)](https://financialcrime.lu/col_slider/2025-11-15-FATF-Recommendation-11/)
- [Understanding Data Retention in AML Compliance (Flagright)](https://www.flagright.com/post/understanding-data-retention-in-aml-compliance)
- [Gestion des copies de pièces d'identité (fiche pratique RGPD)](https://rreva-na.fr/sites/default/files/public/2020-12/Fiche%20gestion%20PI.pdf)
- [Délibération CNIL SAN-2020-003 du 28 juillet 2020 (Légifrance)](https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000042203965/)
- [BRH — Supervision bancaire, normes prudentielles](https://www.brh.ht/supervision-bancaire/normes-prudentielles/)
- [Loi sur le blanchiment des avoirs (texte haïtien, VERTIC)](http://www.vertic.org/media/National%20Legislation/Haiti/HT_Loi_Blanchiment_des_Avoirs.pdf)
- [Circulaire BRH 131 aux institutions financières (HaitiDocs)](https://www.haitidocs.org/doc/brh-circulaires-131?lang=fr)

## Ce que ce dossier ne fait pas

Il ne dit pas ce qu'exige le droit haïtien — aucune des sources ci-dessus n'est
haïtienne à l'exception des deux dernières, qui n'ont pas été lues intégralement
et ne sont citées que comme points d'entrée. Il ne remplace pas l'avis du
cabinet : il lui donne un texte de deux pages à annoter plutôt qu'un mandat
ouvert. **L'envoi et la décision finale appartiennent au porteur.**
