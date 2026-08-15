import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * UN FICHIER SANS FICHIER — LE DÉFAUT VU À SES DEUX BOUTS.
 *
 * Mesuré en production le 2026-08-11, pas déduit :
 *
 *   « cours du créole » · kind = fichier · status = published · livrables = 0
 *
 * Le seul produit `fichier` publié du catalogue n'avait aucun livrable. Le
 * chemin d'après est mécanique : l'acheteur paie, `/api/download` rend 404,
 * `orders.status` ne devient jamais `delivered`, et `mature_wallets()` paie le
 * vendeur à J+7 parce que sa condition est `not gated_on_delivery`. Le filet
 * de `0043` filtre sur `kind = 'physical'` et ne voit rien.
 *
 * Trois surfaces le tiennent désormais, et ce test les croise toutes les trois
 * parce qu'aucune ne suffit seule :
 *
 *   1. la PORTE — `/api/admin/product-status` refuse de publier un `fichier`
 *      sans livrable (le seul endroit où un humain décide de la mise en vente) ;
 *   2. l'AUTRE PORTE — le remplacement de livrable insère avant de supprimer,
 *      pour qu'un `insert` en échec ne laisse pas le produit à zéro ;
 *   3. le FILET — `0059` porte à la file humaine ce qui est déjà passé.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Il lit du texte, pas un comportement :
 * il atteste que les gardes sont ÉCRITS, jamais qu'ils s'exécutent. La preuve
 * d'exécution du filet est le journal du cron (`fichiers_signales`), et celle
 * de la porte est un refus 422 observé. Les deux sont nécessaires.
 */

const PORTE = readFileSync("app/api/admin/product-status/route.ts", "utf8");
const UPLOAD = readFileSync("app/api/products/asset/route.ts", "utf8");
const CRON = readFileSync("app/api/fulfillment/sweep/route.ts", "utf8");
const LIVRABLE_UI = readFileSync("components/upload-asset.tsx", "utf8");
const MIG_BRUT = readFileSync("supabase/migrations/0059_fichier_sans_livrable.sql", "utf8");

/**
 * Le SQL EXÉCUTABLE seul — commentaires retirés.
 *
 * Écrit après un faux positif de ce fichier : l'assertion « 0059 ne touche
 * aucune table d'argent » rougissait sur `mature_wallets` et `escrow_entries`
 * cités dans l'en-tête de la migration, qui EXPLIQUE justement la chaîne à ne
 * pas reproduire. Une sonde qui ne distingue pas ce qu'un fichier fait de ce
 * qu'il raconte finit par interdire d'expliquer le défaut qu'elle surveille.
 */
const MIG = MIG_BRUT.replace(/--[^\n]*/g, "");

test("la publication d'un fichier vérifie qu'un livrable existe", () => {
  assert.match(
    PORTE,
    /isDownloadable\(/,
    "Le garde doit passer par `lib/product-kind.ts` — comparer le type de " +
      "produit hors du module est interdit (product-kind-discipline)."
  );
  assert.match(
    PORTE,
    /from\("product_assets"\)/,
    "Sans lecture de `product_assets`, le garde ne peut rien vérifier."
  );
  /* LE REFUS DOIT ÊTRE ATTEINT PAR UN COMPTAGE, pas seulement écrit.
   *
   * Première version de cette assertion : `assert.match(PORTE, /livrable_
   * manquant/)`. Elle est restée VERTE sous la mutation qui remplaçait
   * `if ((count ?? 0) === 0)` par `if (false)` — le message était toujours
   * dans le fichier, simplement plus jamais rendu. Un garde inatteignable et
   * un garde absent produisent le même texte ; seule la condition les
   * distingue. Même aveuglement de sous-chaîne que sur `CartPayButton`. */
  assert.match(
    PORTE,
    /count[^;]{0,40}===\s*0[\s\S]{0,400}livrable_manquant/,
    "Le refus 422 doit être commandé par un comptage de `product_assets` à " +
      "zéro. Le message seul ne prouve rien : il survit intact à un garde " +
      "qu'on a rendu inatteignable."
  );
});

/* ── LE LIVRABLE NE TRAVERSE PAS LA FONCTION ────────────────────────────────
 *
 * Ajouté le 2026-08-15, après avoir mesuré que la suite restait VERTE pendant
 * qu'on remplaçait le protocole d'envoi de bout en bout. Elle ne vérifiait que
 * l'ordre insert/delete — vrai avant, vrai après, et parfaitement aveugle au
 * reste.
 *
 * Le défaut couvert ici : la route annonçait 50 Mo tout en recevant le fichier
 * en `multipart`. Au-delà de la limite serverless, la requête est refusée
 * AVANT que le code s'exécute — donc aucune de ces lignes ne tourne, rien ne
 * journalise, et le vendeur voit un échec sans cause. `docs/35` §V1-B avait
 * déjà tiré la conclusion pour la vidéo ; ce chemin-ci ne l'avait jamais reçue.
 */
test("le fichier livrable ne transite JAMAIS par la fonction", () => {
  // La CONDITION, pas le commentaire : une route qui lit un formulaire
  // multipart reçoit les octets, quoi qu'elle en dise ailleurs.
  assert.ok(
    !/formData\(\)/.test(UPLOAD),
    "La route lit un formulaire multipart : les octets traversent de nouveau " +
      "la fonction, et la limite serverless refusera le fichier avant que le " +
      "moindre garde d'ici s'exécute."
  );
  assert.match(
    UPLOAD,
    /createSignedUploadUrl\(/,
    "Sans lien signé, le navigateur n'a aucun moyen d'écrire au stockage."
  );
  assert.match(
    LIVRABLE_UI,
    /uploadToSignedUrl\(/,
    "Le client doit téléverser directement — sinon la route a beau offrir un " +
      "lien signé, personne ne l'emprunte."
  );
});

test("la taille est lue AU STOCKAGE, jamais annoncée par le client", () => {
  /* Un client qui déclare « 2 Mo » et dépose 800 Mo passerait tous les
   * contrôles faits à la demande : à cet instant le fichier n'est pas encore
   * parti. La seule taille qui existe est celle de l'objet réellement écrit,
   * et elle se lit après coup. */
  /* ⚠️ PREMIÈRE VERSION FAUSSE, gardée en mémoire ici parce qu'elle a passé
   * la mutation : `/\.list\(dossier[\s\S]{0,700}taille > MAX_BYTES/`. Elle
   * n'exigeait que le VOISINAGE de deux chaînes. Remplacer
   * `const taille = Number((objet.metadata …))` par
   * `const taille = Number(body.tailleAnnoncee ?? 1)` laissait les deux
   * intactes et la suite verte — la borne portait alors sur un chiffre fourni
   * par le client. Encore une assertion sur ce qui est PRODUIT plutôt que sur
   * ce qui COMMANDE. La forme correcte lie la variable à sa source. */
  assert.match(
    UPLOAD,
    /const taille = Number\(\(objet\.metadata[^;]{0,140};[\s\S]{0,240}taille > MAX_BYTES/,
    "La borne de 50 Mo doit porter sur une taille LUE dans les métadonnées de " +
      "l'objet réellement écrit, jamais sur une valeur venue de la requête."
  );
  assert.match(
    UPLOAD,
    /\.list\(dossier/,
    "Sans lecture du stockage, il n'y a aucune taille réelle à lire."
  );
  // Et un objet hors contrat ne laisse pas de ligne derrière lui.
  assert.match(
    UPLOAD,
    /taille > MAX_BYTES[\s\S]{0,300}\.remove\(\[path\]\)/,
    "Un fichier refusé doit être retiré : sinon le bucket garde un objet que " +
      "plus rien n'adresse, et que rien ne purge."
  );
});

test("seule la mise en vente est gardée : retirer un produit reste possible", () => {
  assert.match(
    PORTE,
    /if \(status === "published"\)/,
    "Le garde doit être borné à `published`. S'il portait sur tous les " +
      "statuts, on ne pourrait plus repasser en brouillon un produit " +
      "indélivrable — c'est-à-dire réparer exactement le cas visé."
  );
});

test("le garde de publication est fail-closed", () => {
  // Publier dans le doute met en vente un produit peut-être indélivrable ;
  // refuser dans le doute fait patienter un admin. Les deux erreurs n'ont pas
  // le même prix.
  const zone = PORTE.slice(PORTE.indexOf('if (status === "published")'));
  assert.match(
    zone,
    /eAssets[\s\S]{0,200}status: 503/,
    "Une erreur de lecture de `product_assets` doit REFUSER la publication, " +
      "pas la laisser passer."
  );
});

test("le remplacement d'un livrable insère AVANT de supprimer", () => {
  const iInsert = UPLOAD.indexOf('.from("product_assets").insert(');
  const iDelete = UPLOAD.indexOf('.from("product_assets")\n      .delete()');
  assert.ok(iInsert > 0, "insertion du livrable introuvable");
  assert.ok(iDelete > 0, "suppression de l'ancien livrable introuvable");
  assert.ok(
    iInsert < iDelete,
    "L'ordre `delete` puis `insert` détruit le livrable existant quand " +
      "l'insertion échoue : le vendeur croit remplacer son fichier et le perd, " +
      "et un produit publié devient indélivrable en silence."
  );
});

test("la suppression de l'ancien livrable est ciblée, pas globale", () => {
  assert.doesNotMatch(
    UPLOAD,
    /\.from\("product_assets"\)\s*\.delete\(\)\s*\.eq\("product_id"/,
    "Supprimer PAR `product_id` efface aussi la ligne qu'on vient d'insérer. " +
      "La suppression doit viser l'ancien identifiant."
  );
  assert.match(UPLOAD, /\.delete\(\)\s*\.eq\("id", oldAsset\.id\)/);
});

test("le filet digital est appelé par le cron déclaré", () => {
  assert.match(
    CRON,
    /rpc\(\s*"zabelie_fichier_sans_livrable_sweep"/,
    "La fonction de `0059` sans appelant serait exactement le défaut que " +
      "`crons-appelants` traque : correcte, révoquée, et jamais exécutée."
  );
  for (const compteur of ["fichiers_signales", "fichiers_leves"]) {
    assert.ok(
      CRON.includes(`${compteur}: digital.${compteur} ?? 0`),
      `Le compteur \`${compteur}\` doit sortir au journal MÊME À ZÉRO — sinon ` +
        `« le balayage n'a pas tourné » et « il n'a rien trouvé » se ressemblent.`
    );
  }
});

test("le filet digital n'écrit ni argent ni statut de commande", () => {
  // La détection précède le verrou (arbitrage porteur 2026-08-11). Une
  // écriture sur `escrow_entries` ou un passage en `disputed` déplacerait la
  // paie d'un vendeur — ce que cette migration s'interdit explicitement.
  assert.doesNotMatch(
    MIG,
    /escrow_entries|wallets|wallet_transactions/,
    "0059 ne doit toucher AUCUNE table d'argent."
  );
  assert.doesNotMatch(
    MIG,
    /update orders\s+set status/,
    "0059 ne doit pas basculer la commande en `disputed` : `/api/download` " +
      "exige `status in ('paid','delivered')`, et fermer cette porte " +
      "punirait le vendeur au moment même où il téléverse enfin son fichier."
  );
});

test("le filet lève son signalement quand le livrable arrive", () => {
  assert.match(
    MIG,
    /delete from zabelie_fulfillment/,
    "Une file qui ne sait que grandir devient une file qu'on ne lit plus. " +
      "Le signalement doit partir quand la commande est réparée — c'est la " +
      "péremption dans les deux sens, appliquée à une file de travail."
  );
  assert.match(
    MIG,
    /p\.kind = 'fichier'[\s\S]{0,400}delete from zabelie_fulfillment/,
    "La levée doit être bornée à `kind = 'fichier'` : un `action_required` " +
      "physique a une tout autre cause et ne doit jamais être effacé par ici."
  );
});
