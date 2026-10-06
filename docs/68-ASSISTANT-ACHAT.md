# Assistant d’achat Zabelie — V1 (6 octobre 2026)

Demande directe du porteur : « Implémenté ». La V1 ajoute un assistant sur
`/assistant`, accessible depuis le menu du site. Chaque vitrine dispose du
même assistant limité à son catalogue via `/assistant?vendeur=<uuid>`.

## Parcours

L’acheteur fournit produit recherché, budget entier en HTG, usage et localité.
Le dialogue extrait uniquement ces critères avec le fournisseur OpenAI ou
Gemini déjà prévu dans `lib/ai-description.ts`. Sans clé, la recherche guidée
fonctionne avec les mêmes critères ; aucune fausse conversation IA n’est simulée.
Un filtre explicite permet de choisir physique, fichier digital ou service. Les
fichiers digitaux n’exigent pas de quantité physique ; la carte invite à vérifier
formats, licence et accès sur la fiche existante.
Les libellés et questions sont disponibles en français, kreyòl, anglais et espagnol.

`POST /api/ai/shopping` est une lecture publique : schéma strict, corps borné
par le lecteur API existant, refus des origines étrangères et quotas Postgres
fail-closed. Les modèles n’ont aucun outil, aucun accès aux clés et aucun accès
au paiement. Les sorties structurées sont validées ; une devise étrangère
n’est jamais convertie automatiquement en gourdes.

La sélection utilise le catalogue publié existant sous RLS. Elle recherche
jusqu’à huit termes, lit au maximum 60 fiches récentes et vérifie les variantes
des 24 premières. Le physique n’est retenu que si une variante active dispose
de stock ; son prix de référence est le minimum parmi ces variantes. Le
classement applique budget et boutique comme contraintes, puis privilégie les
correspondances textuelles, les avis et le prix. Il déduplique et retourne zéro
à trois offres ; il ne complète jamais une sélection avec des produits fictifs.

La comparaison expose description déclarée, correspondances textuelles,
prix de référence, écart avec le premier choix et avis réellement présents.
Le résultat ne prétend pas être le meilleur de tout le catalogue. Les textes
vendeurs sont échappés par React et ne sont jamais transmis au modèle.

« Choisir et payer » ouvre la fiche existante : choix des variantes, destinataire,
conditions et rails réellement disponibles, puis checkout existant. Le bouton
secondaire réutilise le panier existant, dont l’ouverture reste gouvernée par
ses gardes actuelles. Aucun nouveau rail, aucune écriture financière et aucune
migration ne sont ajoutés. Les prix finaux, rabais et stocks restent revérifiés
par le checkout et la base, pas par le modèle.

## Localité et confidentialité

La localité est un critère déclaré par l’acheteur, pas une preuve de couverture.
Le système ne la confond pas avec la zone de résidence du vendeur et ne promet
aucune livraison Zabelie. La remise et une éventuelle livraison restent organisées
par le vendeur, selon `docs/26` §0. Pour le digital, aucune livraison physique
n’est inférée.

Pas de table de conversation ni de stockage navigateur persistant. Le contexte
courant existe dans la mémoire de la page, et le dialogue envoie critères et
message au fournisseur configuré. L’interface le précise avant saisie. Les
journaux de cette route ne contiennent ni messages, ni localités, ni secrets.
Les quotas utilisent l’empreinte SHA-256 de l’IP fournie par le proxy de confiance.

## Activation et limites

La PR ne modifie aucune variable d’environnement. Le dialogue dépend de
`OPENAI_API_KEY`/`OPENAI_MODEL` ou `GEMINI_API_KEY`/`GEMINI_MODEL` existants.
Le serveur doit disposer de la clé de service existante pour les quotas ; les
lectures catalogue continuent d’utiliser le client de session sous RLS.
L’absence de configuration Supabase renvoie une indisponibilité, jamais des
fixtures, même si le drapeau de démonstration du catalogue est activé.

La V1 utilise une recherche lexicale et une shortlist récente : pas de vecteurs,
pas de recherche exhaustive ni de traduction automatique du catalogue. Le mode
boutique filtre les produits, mais n’ajoute pas de configuration vendeur,
d’abonnement Premium, de FAQ conversationnelle ou de support après-vente.
WhatsApp, Messenger, la mémoire client persistante et la communication entre
agents restent des extensions ultérieures ; aucun canal externe n’est connecté
par cette PR.

## Vérification

- Tests unitaires : collecte progressive, bornes/schéma, zéro budget, stock,
  pertinence, déduplication, budget, séparation vendeurs, quatre langues et
  refus des sorties modèle contenant produits/liens de paiement.
- Test Playwright : `e2e/parcours-physique-assistant.spec.ts` utilise le backend
  local existant, compare une offre réelle de fixture et ouvre la fiche d’achat
  à 390 px ; le second scénario vérifie un résultat vide hors budget.
- Le test ne contacte aucun fournisseur IA et n’effectue aucun paiement réel.

Validation locale : 1 572 tests unitaires verts, TypeScript et build de
production réussis, lint sans nouvelle alerte et contraste AA vérifié.
Les requêtes HTTP avec le stub Supabase vérifient recommandations, budget,
scope vendeur, schéma, origine, fournisseur absent et rendu dans quatre langues.
Le navigateur Playwright n’a pas pu être téléchargé (archive tronquée dans cet
environnement) : rendu à 390 px et interactions sont couverts par la suite CI
ajoutée, mais leur exécution locale n’est pas revendiquée. Le plugin Browser
n’est pas disponible dans cette session. Aucun appel IA ni paiement réel
n’a été exécuté pendant ces contrôles.
