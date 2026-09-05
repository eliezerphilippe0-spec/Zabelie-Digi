import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEUIL_RANGEE,
  SEUIL_RANGEE_DESKTOP,
  SEUIL_VENDEURS,
  classesRangee,
  rangeeVisible,
  titreCarte,
  vendeursAffichables,
} from "../lib/home-sections";

/**
 * Accueil premium, Phase 3 — la structure et la règle des seuils (brief §4.2,
 * §4.3, §4.5, §4.6), telles que le code les COMMANDE.
 *
 * Mutations éprouvées :
 *   S1  `nombre >= SEUIL_RANGEE` → `nombre > 0`                          → rouge
 *   S2  `avecVente.length >= SEUIL_VENDEURS ? avecVente : []` → toujours  → rouge
 *   S3  titreCarte : condition d'URL retirée                             → rouge
 *   S4  `if (!rangeeVisible(items.length)) return null;` retiré (page)    → rouge
 *   S5  `<main id="main">` retiré de la page                             → rouge
 *   S6  `{heroImage && (` → `{true && (` (image sans fichier)            → rouge
 *   S7  WhatsAppFab : `if (!href) return null;` retiré                   → rouge
 */

const PAGE = readFileSync("app/page.tsx", "utf8");
const FAB = readFileSync("components/whatsapp-fab.tsx", "utf8");
function sansCommentaires(s: string): string {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}
const page = sansCommentaires(PAGE);

test("S1 — une rangée n'est visible qu'à partir de 4 items : connu-positif ET connu-négatif", () => {
  assert.equal(SEUIL_RANGEE, 4);
  assert.equal(SEUIL_RANGEE_DESKTOP, 6);
  assert.equal(rangeeVisible(0), false);
  assert.equal(rangeeVisible(3), false, "trois cartes sous un titre : c'est ce que le brief interdit");
  assert.equal(rangeeVisible(4), true);
  // Desktop : masquée au-delà de lg sous six.
  assert.equal(classesRangee(4), "lg:hidden");
  assert.equal(classesRangee(5), "lg:hidden");
  assert.equal(classesRangee(6), "");
});

test("S2 — « Meilleurs vendeurs » : trois vendeurs avec une vente PAYÉE chacun, sinon rien", () => {
  assert.equal(SEUIL_VENDEURS, 3);
  const v = (n: number) => ({ nom: `v${n}`, ventesPayees: n });
  // Connu-négatif : un seul vendeur avec vente (l'état de la base le 2026-09-04).
  assert.deepEqual(vendeursAffichables([v(1), v(0), v(0)]), []);
  // Trois vendeurs, mais deux sans vente payée : rien.
  assert.deepEqual(vendeursAffichables([v(2), v(0), v(0), v(0)]), []);
  // Connu-positif : trois avec vente, le sans-vente est écarté.
  assert.deepEqual(vendeursAffichables([v(1), v(2), v(0), v(3)]).map((x) => x.nom), ["v1", "v2", "v3"]);
});

test("S3 — une carte n'affiche jamais une URL brute ni un titre vide, et le manque est journalisé", () => {
  const journal: string[] = [];
  const j = (m: string) => journal.push(m);
  assert.equal(titreCarte("/catalogue?cat=Beauté & soins", "Produit", j, "x"), "Produit");
  assert.equal(titreCarte("/produit/cours-francisation-apwpm", "Produit", j, "y"), "Produit");
  assert.equal(titreCarte("https://exemple.test/x", "Produit", j), "Produit");
  assert.equal(titreCarte("   ", "Produit", j), "Produit");
  assert.equal(titreCarte(null, "Pwodui", j), "Pwodui");
  assert.equal(journal.length, 5, "chaque repli doit laisser une trace");
  assert.match(journal[0], /sans titre exploitable/);
  // Connu-positif : un vrai titre passe intact, sans journal.
  assert.equal(titreCarte("Cours de francisation", "Produit", j), "Cours de francisation");
  assert.equal(journal.length, 5);
});

test("S4 — la page applique le seuil à CHAQUE rangée, par le helper, pas à la main", () => {
  assert.match(page, /if \(!rangeeVisible\(items\.length, primary\)\) return null;/);
  assert.match(page, /className=\{`mx-auto max-w-6xl px-3 pt-6 \$\{classesRangee\(items\.length, primary\)\}`\}/);
  // Les vendeurs passent par le helper aussi, sur des ventes PAYÉES.
  assert.match(page, /vendeursAffichables\(\[\.\.\.sellerMap\.values\(\)\]\)/);
  assert.match(page, /\.eq\("status", "paid"\)/);
  // Plus d'état vide « invitation à vendre » sur une rangée : la rangée s'efface.
  assert.doesNotMatch(page, /empty=\{\{/);
  // Plus de « bientôt » ni de grille des rayons sur l'accueil.
  assert.doesNotMatch(page, /menu\.empty|sec\.cats|home\.demand/);
});

test("S5 — un seul h1, dans la bannière, un seul CTA, et un <main id=\"main\">", () => {
  const h1 = page.match(/<h1\b/g) ?? [];
  assert.equal(h1.length, 1, "la bannière porte le SEUL h1");
  assert.match(page, /<h1 className="[^"]*">\s*\{t\(lang, "hero\.s1\.t"\)\}/);
  assert.match(page, /<main id="main">/);
  // Plus de carrousel, plus de titre séparé, plus de rail ni de bandeau paiement.
  assert.doesNotMatch(page, /HeroCarousel|LANDING_SLIDES|home\.h1b|home\.pay|CategorySidebar/);
  // Sections déplacées : FAQ et « comment ça marche » ne sont plus que des liens.
  assert.doesNotMatch(page, /<FaqList/);
  assert.match(page, /href="\/aide#faq"/);
  assert.match(page, /href="\/aide#comment"/);
  assert.match(page, /href="\/vendre#comment"/);
  assert.match(readFileSync("app/aide/page.tsx", "utf8"), /id="comment"[\s\S]{0,200}home\.how\.buy/);
  assert.match(readFileSync("app/vendre/page.tsx", "utf8"), /id="comment"[\s\S]{0,200}home\.how\.sell/);
});

test("S6 — l'image de la bannière n'est rendue que si le fichier du porteur existe (jamais générée)", () => {
  assert.match(page, /function heroImageDisponible\(\): boolean \{\s*return existsSync\(join\(process\.cwd\(\), "public", HERO_IMAGE\)\);/);
  assert.match(page, /const heroImage = heroImageDisponible\(\);/);
  assert.match(page, /\{heroImage && \(\s*<Image\s+src=\{HERO_IMAGE\}[\s\S]{0,120}priority/);
  assert.match(page, /style=\{heroImage \? undefined : \{ backgroundImage: "var\(--brand-gradient\)" \}\}/);
});

test("S7 — le bouton WhatsApp flottant : 48 px, bas droite, absent sans numéro", () => {
  const fab = sansCommentaires(FAB);
  assert.match(fab, /if \(!href\) return null;/);
  assert.match(fab, /className="fixed bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full/);
  assert.match(page, /<WhatsAppFab href=\{wa\} label=\{t\(lang, "wa\.chat"\)\} \/>/);
});

test("S8 — la barre de confiance compacte : quatre repères, aucun sous-texte, sous la bannière", () => {
  const iHero = page.indexOf('"hero.s1.t"');
  const iTrust = page.indexOf("<TrustBar");
  const iRow = page.indexOf("<HomeRow");
  assert.ok(iHero > 0 && iHero < iTrust && iTrust < iRow, "ordre attendu : bannière → confiance → produits");
  const bloc = page.slice(iTrust, page.indexOf("/>", iTrust));
  assert.match(bloc, /\bcompact\b/);
  assert.equal((bloc.match(/icone: "/g) ?? []).length, 4);
  assert.doesNotMatch(bloc, /\bb: /, "aucun sous-texte dans la forme compacte");
});


test("la sélection principale affiche de 1 à 5 produits sur tous les écrans, sans rangée vide", () => {
  assert.equal(rangeeVisible(0, true), false);
  for (const count of [1, 2, 3, 4, 5, 6, 12]) {
    assert.equal(rangeeVisible(count, true), true);
    assert.equal(classesRangee(count, true), "");
  }
  assert.equal(rangeeVisible(3), false);
  assert.equal(classesRangee(4), "lg:hidden");
  assert.match(page, /<HomeRow primary title=\{t\(lang, "home.products"\)\}/);
});
