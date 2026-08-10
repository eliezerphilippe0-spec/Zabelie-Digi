import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";
import { whatsappAffichage } from "@/lib/whatsapp";

/**
 * L'ACCUEIL NE PROMET QUE CE QUE LA PLATEFORME TIENT.
 *
 * La maquette porteur du 2026-08-09 proposait cinq arguments de confiance dont
 * quatre n'existent pas : « Livraison rapide partout en Haïti », « Produits de
 * qualité — vendeurs vérifiés », « Satisfait ou remboursé », « Support 7j/7 ».
 * Ils ont été remplacés par cinq promesses adossées à un mécanisme réel
 * (components/trust-bar.tsx).
 *
 * Ce test empêche le retour en arrière. Il ne dit pas « n'écrivez jamais ces
 * mots » — il dit « pas dans le bandeau de confiance de l'accueil », qui est
 * l'endroit où une phrase pèse le plus lourd : juste sous le hero, avant le
 * premier produit.
 *
 * ⚠️ Frontières `(?<!\p{L})…(?!\p{L})` avec les drapeaux `u` ET `i`, jamais
 * `\b` : en JavaScript `\w` vaut `[A-Za-z0-9_]`, et une frontière posée contre
 * `è` ou `é` tombe du mauvais côté. « livrée » finit par un `e` nu et passerait
 * — « vandè verifye » non. Le connu-positif ci-dessous porte les deux cas.
 */

const CLES_CONFIANCE = [
  "trust.1.t", "trust.1.b", "trust.2.t", "trust.2.b", "trust.3.t",
  "trust.3.b", "trust.4.t", "trust.4.b", "trust.5.t", "trust.5.b",
] as const;

/** Ce qu'aucun de ces dix libellés ne doit affirmer. */
const PROMESSES_NON_TENUES =
  /(?<!\p{L})(livraison|livrée|livré|livre|verifye|vérifiés|vérifié|verified|verificados?|remboursé|rembourse|refund|reembols|7j\/7|24\/7)(?!\p{L})/iu;

test("le détecteur voit une promesse non tenue, accents en frontière compris", () => {
  // Connu-positif — les quatre langues, et les mots dont l'accent touche le bord.
  for (const s of [
    "Livraison rapide partout en Haïti",
    "Produits de qualité — vendeurs vérifiés",
    "Vandè verifye toupre w",
    "Satisfait ou remboursé sous conditions",
    "Support 7j/7 à votre écoute",
    "Fast delivery, verified sellers",
    "Vendedores verificados",
  ]) {
    assert.ok(PROMESSES_NON_TENUES.test(s), `le motif ne voit pas « ${s} »`);
  }
  // Connu-négatif — ce qui EST tenu ne doit pas être attrapé.
  for (const s of [
    "Paiement sécurisé avec MonCash",
    "Le vendeur n'est payé qu'après la remise",
    "Vandè a pa touche anvan li remèt li",
    "Prix en gourdes",
    "Une vraie personne vous répond",
  ]) {
    assert.ok(!PROMESSES_NON_TENUES.test(s), `faux positif sur « ${s} »`);
  }
});

test("aucun libellé du bandeau de confiance n'annonce ce qui n'existe pas", () => {
  for (const cle of CLES_CONFIANCE) {
    for (const lang of LANGS) {
      const texte = DICT[lang][cle];
      assert.ok(texte && texte.trim().length > 0, `${cle} vide en ${lang}`);
      assert.ok(
        !PROMESSES_NON_TENUES.test(texte),
        `${cle} (${lang}) promet ce que la plateforme ne tient pas : « ${texte} »`
      );
    }
  }
});

/**
 * La grille des rayons est devenue PERMANENTE (elle ne s'affichait qu'à
 * catalogue vide). Le capteur de demande, lui, doit rester conditionné au
 * catalogue vide : demander « qu'est-ce qui vous manque ? » sous des rangées
 * bien remplies serait une question déplacée.
 *
 * Les deux tenaient sur la MÊME condition ; les séparer est exactement le
 * genre de changement qu'une relecture ultérieure défait sans le voir.
 */
test("la grille des rayons est permanente, le capteur reste conditionnel", () => {
  const src = readFileSync("app/page.tsx", "utf8");
  assert.match(
    src,
    /\{rayons\.length > 0 && \(\s*\n\s*<section id="kategori"/,
    "la grille des rayons n'est plus permanente — elle a retrouvé une condition"
  );
  assert.ok(
    src.includes("{products.length === 0 && (\n          <div"),
    "le capteur de demande n'est plus conditionné au catalogue vide"
  );
});

test("le numéro WhatsApp s'affiche au format haïtien, ou pas du tout", () => {
  const avant = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  try {
    // Absent → rien. Une surface de contact vers personne est pire que rien.
    delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    assert.equal(whatsappAffichage(), null);

    // Tronqué → rien non plus : un numéro incomplet n'est pas un numéro.
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "509373";
    assert.equal(whatsappAffichage(), null);

    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "50937376615";
    assert.equal(whatsappAffichage(), "+509 3737 6615");

    // Déjà formaté par le porteur → même rendu, pas de double espacement.
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+509 3737 6615";
    assert.equal(whatsappAffichage(), "+509 3737 6615");

    // Autre indicatif → rendu tel quel, jamais déformé par la règle haïtienne.
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "13475551234";
    assert.equal(whatsappAffichage(), "+13475551234");
  } finally {
    if (avant === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    else process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = avant;
  }
});

/**
 * LE SECOND GESTE DE LA BANNIÈRE — découvert non testé par une mutation.
 *
 * `secondGeste` décide si la bannière vendeur affiche le bouton WhatsApp. La
 * logique vivait en ligne dans `app/page.tsx`, donc dans un composant serveur,
 * donc hors de portée d'un test : retirer la garde du numéro ne faisait rougir
 * RIEN. Conséquence d'un tel oubli : un bouton de contact vers personne —
 * exactement ce que `lib/whatsapp.ts` s'engage à ne jamais produire.
 *
 * Elle a été extraite pour être éprouvable. C'est la mutation qui l'a exigé,
 * pas une relecture.
 */
test("le geste WhatsApp de la bannière : les deux champs, ou aucun", async () => {
  const { secondGeste, LANDING_SLIDES } = await import("@/lib/landing-slides");
  const vendeur = LANDING_SLIDES.find((s) => s.whatsapp);
  assert.ok(vendeur, "aucun slide ne porte le second geste — le contrôle est vide");
  const sansWa = LANDING_SLIDES.find((s) => !s.whatsapp);
  assert.ok(sansWa, "tous les slides portent WhatsApp — le connu-négatif est vide");

  const avant = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  try {
    // Numéro absent → AUCUN geste. C'est le cas que la mutation a révélé.
    delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    assert.equal(secondGeste(vendeur!, "bonjou"), null);

    // Numéro tronqué → aucun geste non plus.
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "5093";
    assert.equal(secondGeste(vendeur!, "bonjou"), null);

    // Numéro posé → les DEUX champs, jamais un seul.
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "50937376615";
    const g = secondGeste(vendeur!, "bonjou");
    assert.ok(g, "geste attendu avec un numéro valide");
    assert.ok(g!.href.startsWith("https://wa.me/50937376615"), `href inattendu : ${g!.href}`);
    assert.equal(g!.cta, "+509 3737 6615");

    // Un slide qui ne demande pas WhatsApp n'en reçoit pas, numéro ou non.
    assert.equal(secondGeste(sansWa!, "bonjou"), null);
  } finally {
    if (avant === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    else process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = avant;
  }
});

/**
 * LE MENU DES RAYONS SURVIT À `label_es` ABSENTE — la panne réelle du
 * 2026-08-10, mesurée en production : `0052` n'est pas appliquée, la requête
 * échouait en 42703, le menu revenait vide, et la colonne des rayons comme la
 * grille des catégories DISPARAISSAIENT de l'accueil. Les 16 rayons activés
 * en base ne se sont jamais affichés.
 *
 * Même règle que le repli `in_stock` de lib/products.ts : le code devance le
 * schéma, une requête se dégrade, elle ne tombe pas.
 */
test("lireCategories rejoue sans label_es quand la colonne manque", async () => {
  const { lireCategories } = await import("@/lib/taxonomy");

  const faux = (reponses: Record<string, { data: unknown[] | null; error: { code?: string; message?: string } | null }>) => {
    const appels: string[] = [];
    const client = {
      from: () => ({
        select: (cols: string) => {
          appels.push(cols);
          const r = reponses[cols.includes("label_es") ? "avec" : "sans"];
          return { eq: () => Promise.resolve(r), in: () => Promise.resolve(r), then: (f: (v: unknown) => unknown) => Promise.resolve(r).then(f) };
        },
      }),
    };
    return { client: client as never, appels };
  };
  const filtre = (q: { eq: (a: string, b: unknown) => unknown }) => q.eq("active", true);

  // Connu-positif : 42703 sur label_es → rejeu sans, lignes complétées à null.
  const cas1 = faux({
    avec: { data: null, error: { code: "42703", message: "column label_es does not exist" } },
    sans: { data: [{ slug: "a", label_fr: "A" }], error: null },
  });
  const r1 = await lireCategories(cas1.client, "id, slug, label_fr, label_es, level", filtre as never);
  assert.equal(cas1.appels.length, 2, "le rejeu n'a pas eu lieu");
  assert.ok(!cas1.appels[1].includes("label_es"), "le rejeu porte encore label_es");
  assert.deepEqual(r1.data, [{ slug: "a", label_fr: "A", label_es: null }]);

  // Connu-négatif 1 : succès direct → UN seul appel, données intactes.
  const cas2 = faux({ avec: { data: [{ slug: "b", label_es: "B" }], error: null }, sans: { data: [], error: null } });
  const r2 = await lireCategories(cas2.client, "id, label_es", filtre as never);
  assert.equal(cas2.appels.length, 1, "un rejeu a eu lieu sans raison");
  assert.deepEqual(r2.data, [{ slug: "b", label_es: "B" }]);

  // Connu-négatif 2 : une AUTRE erreur ne déclenche pas le rejeu — la
  // dégradation vise la colonne absente, pas les pannes en général.
  const cas3 = faux({ avec: { data: null, error: { code: "57014", message: "timeout" } }, sans: { data: [], error: null } });
  const r3 = await lireCategories(cas3.client, "id, label_es", filtre as never);
  assert.equal(cas3.appels.length, 1);
  assert.equal(r3.error?.code, "57014", "l'erreur réelle a été avalée");
});
