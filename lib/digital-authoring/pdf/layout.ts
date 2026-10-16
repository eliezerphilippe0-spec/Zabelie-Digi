import { LARGEURS, VERTICALES, largeurTexte, type PoliceStandard } from "./metrics";
import { NL, versOctets } from "./winansi";

/**
 * Mise en page d'un guide (Studio de création, tâche 4.1 ; décision D1-A).
 *
 * Format A5 portrait : la page qui se lit le mieux sur un téléphone, le
 * support réel des acheteurs. Texte aligné à gauche, coupure au mot, mot trop
 * long coupé avec un trait d'union, listes à puces et numérotées, chaque
 * section sur une page neuve, sommaire en deux passes (la longueur du sommaire
 * fixe le numéro de la première page, qui fixe les numéros du sommaire).
 *
 * Tout est déterministe : aucune date, aucun aléa, des nombres arrondis au
 * centième. Deux rendus du même guide donnent les mêmes lignes au même endroit.
 * Les textes reçus sont déjà normalisés et vérifiés (`winansi.ts`).
 */

export const FORMAT = { largeur: 419.53, hauteur: 595.28 } as const;
export const MARGES = { gauche: 48, droite: 48, haut: 56, bas: 64 } as const;
export const LARGEUR_UTILE = FORMAT.largeur - MARGES.gauche - MARGES.droite;

export type Style = { police: PoliceStandard; taille: number; interligne: number; gris: boolean };

export const STYLES = {
  titreDoc: { police: "Helvetica-Bold", taille: 22, interligne: 27, gris: false },
  objectifDoc: { police: "Helvetica-Oblique", taille: 12, interligne: 16, gris: true },
  auteur: { police: "Helvetica", taille: 11, interligne: 15, gris: false },
  titreSommaire: { police: "Helvetica-Bold", taille: 16, interligne: 22, gris: false },
  entreeSommaire: { police: "Helvetica", taille: 10.5, interligne: 15, gris: false },
  titreSection: { police: "Helvetica-Bold", taille: 15, interligne: 19, gris: false },
  resultat: { police: "Helvetica-Oblique", taille: 10, interligne: 14, gris: true },
  corps: { police: "Helvetica", taille: 10.5, interligne: 15, gris: false },
  pied: { police: "Helvetica", taille: 9, interligne: 12, gris: true },
} as const satisfies Record<string, Style>;

export type Ligne = {
  x: number;
  y: number;
  police: PoliceStandard;
  taille: number;
  texte: string;
  gris: boolean;
  /** Pour les lignes du corps : le bloc d'origine et le rang de la ligne dans ce bloc (vérifications de mise en page). */
  bloc?: { id: number; rang: number; total: number };
};
export type PageMiseEnPage = { lignes: Ligne[]; numero: number | null };
export type MiseEnPage = { pages: PageMiseEnPage[]; sommaire: { titre: string; page: number }[] };

export type GuideNormalise = {
  langue: "ht" | "fr";
  titre: string;
  objectif: string;
  auteur: string;
  sections: { titre: string; resultat: string; corps: string }[];
};

const LIBELLES = { ht: { sommaire: "Somè" }, fr: { sommaire: "Sommaire" } } as const;

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function largeur(texte: string, s: Style): number {
  return largeurTexte(versOctets(texte), s.police, s.taille);
}

/** Coupe un texte en lignes d'au plus `max` points ; un mot plus large que la ligne est coupé avec « - ». */
export function couperEnLignes(texte: string, s: Style, max: number): string[] {
  const mots = texte.split(" ").filter((m) => m.length > 0);
  const lignes: string[] = [];
  let courante = "";
  for (const mot of mots) {
    const essai = courante ? courante + " " + mot : mot;
    if (largeur(essai, s) <= max) {
      courante = essai;
      continue;
    }
    if (courante) lignes.push(courante);
    courante = "";
    let reste = mot;
    while (largeur(reste, s) > max) {
      const car = Array.from(reste);
      let n = 1;
      while (n < car.length - 1 && largeur(car.slice(0, n + 1).join("") + "-", s) <= max) n++;
      lignes.push(car.slice(0, n).join("") + "-");
      reste = car.slice(n).join("");
    }
    courante = reste;
  }
  if (courante) lignes.push(courante);
  return lignes;
}

export type Bloc = { type: "paragraphe"; lignes: string[] } | { type: "puce"; marque: string; texte: string };

/** Marque de liste en tête de ligne : « - », « * », « • », ou « 12. » / « 12) ». */
function marqueDeListe(ligne: string): { marque: string; reste: string } | null {
  const t = ligne.trimStart();
  for (const m of ["- ", "* ", String.fromCodePoint(0x2022) + " "]) {
    if (t.startsWith(m)) return { marque: String.fromCodePoint(0x2022), reste: t.slice(m.length).trim() };
  }
  let i = 0;
  while (i < t.length && i < 3 && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++;
  if (i > 0 && (t[i] === "." || t[i] === ")") && t[i + 1] === " ") {
    return { marque: t.slice(0, i) + ".", reste: t.slice(i + 2).trim() };
  }
  return null;
}

/** Le corps d'une section en blocs : paragraphes (sauts de ligne conservés) et éléments de liste. */
export function blocsDuCorps(corps: string): Bloc[] {
  const blocs: Bloc[] = [];
  let paragraphe: string[] = [];
  const fermer = () => {
    if (paragraphe.length) blocs.push({ type: "paragraphe", lignes: paragraphe });
    paragraphe = [];
  };
  for (const brute of corps.split(NL)) {
    if (!brute.trim()) {
      fermer();
      continue;
    }
    const liste = marqueDeListe(brute);
    if (liste) {
      fermer();
      if (liste.reste) blocs.push({ type: "puce", marque: liste.marque, texte: liste.reste });
      continue;
    }
    paragraphe.push(brute.trim());
  }
  fermer();
  return blocs;
}

/** Le compositeur : un curseur vertical sur la page courante. */
class Composeur {
  pages: PageMiseEnPage[] = [];
  private curseur = 0;
  private page: PageMiseEnPage | null = null;

  constructor(private numeroSuivant: number | null) {}

  nouvellePage(numerotee = true): void {
    this.page = { lignes: [], numero: numerotee ? this.numeroSuivant : null };
    if (numerotee && this.numeroSuivant !== null) this.numeroSuivant++;
    this.pages.push(this.page);
    this.curseur = FORMAT.hauteur - MARGES.haut;
  }

  /** Combien de lignes de ce style tiennent encore sur la page courante (0 sans page). La seule règle de la marge basse. */
  capacite(s: Style): number {
    if (!this.page) return 0;
    return Math.max(0, Math.floor((this.curseur - MARGES.bas) / s.interligne + 1e-9));
  }

  /** Reste-t-il la place pour `n` lignes de ce style ? */
  tient(s: Style, n = 1): boolean {
    return this.capacite(s) >= n;
  }

  ligne(texte: string, s: Style, x: number = MARGES.gauche, bloc?: Ligne["bloc"]): void {
    if (!this.tient(s)) this.nouvellePage();
    const base = this.curseur - (s.taille * VERTICALES[s.police].ascendante) / 1000;
    const l: Ligne = { x: arrondi(x), y: arrondi(base), police: s.police, taille: s.taille, texte, gris: s.gris };
    if (bloc) l.bloc = bloc;
    this.page!.lignes.push(l);
    this.curseur -= s.interligne;
  }

  espace(points: number): void {
    this.curseur -= points;
  }

  placer(y: number): void {
    this.curseur = y;
  }

  get numeroCourant(): number | null {
    return this.page?.numero ?? null;
  }
}

function sectionTitre(i: number, titre: string) {
  return `${i + 1}. ${titre}`;
}

/** Le sommaire, avec des numéros de page donnés (des « 000 » pour la première passe). */
function composerSommaire(g: GuideNormalise, numeros: string[], premierNumero: number): PageMiseEnPage[] {
  const c = new Composeur(premierNumero);
  const s = STYLES.entreeSommaire;
  const reserve = largeur("000", s) + 12;
  c.nouvellePage();
  c.ligne(LIBELLES[g.langue].sommaire, STYLES.titreSommaire);
  c.espace(6);
  g.sections.forEach((sec, i) => {
    const lignes = couperEnLignes(sectionTitre(i, sec.titre), s, LARGEUR_UTILE - reserve);
    if (!c.tient(s, lignes.length)) c.nouvellePage();
    lignes.forEach((l, k) => {
      c.ligne(l, s);
      if (k === lignes.length - 1) {
        // Points de conduite et numéro, sur la ligne qui vient d'être posée.
        const page = c.pages[c.pages.length - 1];
        const posee = page.lignes[page.lignes.length - 1];
        const num = numeros[i];
        const xNum = MARGES.gauche + LARGEUR_UTILE - largeur(num, s);
        const debut = MARGES.gauche + largeur(l, s) + 6;
        const point = largeur(".", s);
        const n = Math.max(0, Math.floor((xNum - 6 - debut) / point));
        if (n > 0) page.lignes.push({ ...posee, x: arrondi(debut), texte: ".".repeat(n), gris: true });
        page.lignes.push({ ...posee, x: arrondi(xNum), texte: num, gris: false });
      }
    });
  });
  return c.pages;
}

/** Le corps du guide : une page neuve par section. */
function composerCorps(g: GuideNormalise, premierNumero: number) {
  const c = new Composeur(premierNumero);
  const debuts: number[] = [];
  let idBloc = 0;
  g.sections.forEach((sec, i) => {
    c.nouvellePage();
    debuts.push(c.numeroCourant ?? 0);
    for (const l of couperEnLignes(sectionTitre(i, sec.titre), STYLES.titreSection, LARGEUR_UTILE)) c.ligne(l, STYLES.titreSection);
    if (sec.resultat.trim()) {
      c.espace(2);
      for (const l of couperEnLignes(sec.resultat, STYLES.resultat, LARGEUR_UTILE)) c.ligne(l, STYLES.resultat);
    }
    c.espace(10);
    const blocs = blocsDuCorps(sec.corps);
    blocs.forEach((b, j) => {
      const id = ++idBloc;
      // Une liste se détache du texte qui la suit, comme deux paragraphes entre eux.
      if (b.type === "paragraphe" && blocs[j - 1]?.type === "puce") c.espace(3);
      if (b.type === "paragraphe") {
        poserSansVeuve(c, b.lignes.flatMap((l) => couperEnLignes(l, STYLES.corps, LARGEUR_UTILE)), MARGES.gauche, id);
        c.espace(6);
        return;
      }
      // Toute la liste partage le même retrait, assez large pour sa plus longue marque (« 10. »).
      let fin = j;
      while (blocs[fin + 1]?.type === "puce") fin++;
      let debut = j;
      while (blocs[debut - 1]?.type === "puce") debut--;
      const marques = blocs.slice(debut, fin + 1).map((x) => (x.type === "puce" ? largeur(x.marque, STYLES.corps) : 0));
      const retrait = Math.max(RETRAIT_LISTE, Math.max(...marques) + ECART_MARQUE + 2);
      const xTexte = MARGES.gauche + retrait;
      const xMarque = arrondi(xTexte - ECART_MARQUE - largeur(b.marque, STYLES.corps));
      poserSansVeuve(c, couperEnLignes(b.texte, STYLES.corps, LARGEUR_UTILE - retrait), xTexte, id, (page, posee) =>
        page.lignes.push({ x: xMarque, y: posee.y, police: posee.police, taille: posee.taille, texte: b.marque, gris: posee.gris }),
      );
      c.espace(3);
    });
  });
  return { pages: c.pages, debuts };
}

const RETRAIT_LISTE = 18;
const ECART_MARQUE = 5;

/**
 * Pose les lignes d'un bloc sans ligne isolée : jamais la première seule en
 * bas de page, jamais la dernière seule en haut de la suivante. Un bloc de
 * trois lignes qui ne tient pas passe entier à la page suivante.
 */
function poserSansVeuve(
  c: Composeur,
  lignes: string[],
  x: number,
  id: number,
  marquer?: (page: PageMiseEnPage, premiere: Ligne) => void,
): void {
  const s = STYLES.corps;
  const n = lignes.length;
  if (n === 0) return;
  let place = c.capacite(s);
  if (place < Math.min(2, n)) {
    c.nouvellePage();
    place = c.capacite(s);
  }
  let coupure = n;
  if (n > place) coupure = n - place === 1 ? (place > 2 ? place - 1 : 0) : place;
  lignes.forEach((l, k) => {
    if (k === coupure) c.nouvellePage();
    c.ligne(l, s, x, { id, rang: k, total: n });
    if (k === 0 && marquer) {
      const page = c.pages[c.pages.length - 1];
      marquer(page, page.lignes[page.lignes.length - 1]);
    }
  });
}

/** La page de titre, sans numéro. */
function composerTitre(g: GuideNormalise): PageMiseEnPage {
  const c = new Composeur(null);
  c.nouvellePage(false);
  c.placer(FORMAT.hauteur * 0.66);
  for (const l of couperEnLignes(g.titre, STYLES.titreDoc, LARGEUR_UTILE)) c.ligne(l, STYLES.titreDoc);
  if (g.objectif.trim()) {
    c.espace(10);
    for (const l of couperEnLignes(g.objectif, STYLES.objectifDoc, LARGEUR_UTILE)) c.ligne(l, STYLES.objectifDoc);
  }
  if (g.auteur.trim()) {
    c.espace(22);
    for (const l of couperEnLignes(g.auteur, STYLES.auteur, LARGEUR_UTILE)) c.ligne(l, STYLES.auteur);
  }
  return c.pages[0];
}

/** Le numéro de page, centré en pied. */
function ajouterPied(page: PageMiseEnPage): void {
  if (page.numero === null) return;
  const s = STYLES.pied;
  const texte = String(page.numero);
  page.lignes.push({
    x: arrondi((FORMAT.largeur - largeur(texte, s)) / 2),
    y: arrondi(MARGES.bas - 28),
    police: s.police,
    taille: s.taille,
    texte,
    gris: true,
  });
}

export function mettreEnPage(g: GuideNormalise): MiseEnPage {
  const titre = composerTitre(g);
  // Passe 1 : la longueur du sommaire, avec des numéros de largeur maximale.
  const essai = composerSommaire(g, g.sections.map(() => "000"), 2);
  const premierCorps = 2 + essai.length;
  const corps = composerCorps(g, premierCorps);
  // Passe 2 : les vrais numéros. Leur largeur ne dépasse pas « 000 » : les
  // titres se coupent exactement comme à la passe 1, la longueur ne change pas.
  const sommaire = composerSommaire(g, corps.debuts.map(String), 2);
  if (sommaire.length !== essai.length) throw new Error("pdf: sommaire instable entre les deux passes");
  const pages = [titre, ...sommaire, ...corps.pages];
  pages.forEach(ajouterPied);
  return { pages, sommaire: g.sections.map((s, i) => ({ titre: sectionTitre(i, s.titre), page: corps.debuts[i] })) };
}

/** Exposé pour les tests : la table des chasses est bien celle d'Adobe. */
export const _largeurEspace = LARGEURS.Helvetica[0];
