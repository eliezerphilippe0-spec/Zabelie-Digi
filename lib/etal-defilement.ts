/**
 * DÉFILEMENT DE « OUVRIR MA BOUTIQUE » (V-23, décision porteur du 2026-10-14).
 *
 * Le prototype de cette page a été construit avec le moteur ScrollCraft (MIT).
 * Le porteur a choisi de NE PAS l'embarquer (« réécrire le nécessaire ») : une
 * dépendance tierce de 63 Ko, dont la moitié sert la vidéo et le monde continu,
 * pour une page qui n'en utilise ni l'un ni l'autre. Ce fichier en garde
 * exactement ce que la page emploie, et rien d'autre :
 *
 *   • l'ACTE : une section `data-etal-acte="flux|epingle"` publie sa
 *     progression 0→1 dans `--etal-p`. Un acte épinglé reçoit sa hauteur
 *     (`data-etal-duree` écrans) ; sa scène colle en CSS (`position: sticky`) ;
 *   • la LIGNE : `data-etal-ligne="0.3"` monte de derrière son masque quand
 *     l'acte passe 0.3 ;
 *   • le RIDEAU : `data-etal-rideau="0.03 0.26"`, un `clip-path` qui tombe ;
 *   • la PARALLAXE : `data-etal-parallaxe="-1.7"`, en centaines de pixels sur
 *     la traversée de l'acte (même unité que ScrollCraft) ;
 *   • l'ENTRÉE : `data-etal-entree` reçoit `est-entre` une fois, à l'entrée.
 *
 * ─── CE QUI NE BOUGE JAMAIS : L'OPACITÉ D'UN TEXTE ──────────────────────────
 * Garde-fou V2 de l'accueil vivant, repris par V-23 : axe-core mesure le
 * contraste juste après `networkidle` (`e2e/accessibilite.spec.ts`), et un
 * texte à demi transparent à cet instant est une violation. Tout ce qui porte
 * du texte apparaît donc par `transform` (une ligne sort de son masque) ; le
 * seul `clip-path` est celui du rideau, qui n'en porte pas.
 *
 * ─── L'ÉTAT DE REPOS EST LE CONTENU COMPLET ─────────────────────────────────
 * Sans JavaScript, rien de ceci ne tourne : aucune hauteur n'est posée, aucune
 * ligne n'est cachée, et `--etal-p` absent vaut « fini » dans le CSS. En
 * mouvement réduit, les lignes restent en place, le rideau reste ouvert, la
 * parallaxe ne s'applique pas, et l'acte épinglé ne s'épingle PAS : l'étal y
 * est dessiné fini d'emblée, le tenir trois écrans ne montrerait rien de plus.
 */

export type ModeActe = "flux" | "epingle";

const borne = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lisse = (x: number) => {
  const t = borne(x);
  return t * t * (3 - 2 * t);
};

/**
 * Progression d'un acte, 0 → 1.
 *
 * Épinglé : de l'instant où son haut touche le haut de l'écran jusqu'à celui où
 * son bas touche le bas. Le dénominateur ne descend jamais sous 1 px : un acte
 * d'un seul écran sauterait sinon de 0 à 1 entre deux crans de molette.
 * Flux : de l'entrée par le bas à la sortie par le haut.
 */
export function progressionActe(mode: ModeActe, y: number, haut: number, hauteur: number, vh: number): number {
  if (mode === "epingle") return borne((y - haut) / Math.max(hauteur - vh, 1));
  return borne((y + vh - haut) / Math.max(hauteur + vh, 1));
}

/** `"0.03 0.26"` → `[0.03, 0.26]` ; une valeur absente ou illisible vaut `repli`. */
export function lireFenetre(attr: string | null, repli: [number, number]): [number, number] {
  const [a, b] = (attr ?? "").trim().split(/\s+/).map(Number);
  return [Number.isFinite(a) ? a : repli[0], Number.isFinite(b) ? b : repli[1]];
}

type Acte = {
  el: HTMLElement;
  mode: ModeActe;
  duree: number;
  haut: number;
  hauteur: number;
  p: number;
  parallaxes: { el: HTMLElement; vitesse: number }[];
  rideaux: { el: HTMLElement; de: number; a: number }[];
  lignes: { el: HTMLElement; de: number }[];
};

/**
 * Monte le défilement sous `racine` et rend la fonction qui le démonte. Aucune
 * boucle permanente : on ne relit qu'au défilement et au redimensionnement.
 */
export function monterDefilement(racine: HTMLElement, reduit: boolean): () => void {
  const actes: Acte[] = Array.from(racine.querySelectorAll<HTMLElement>("[data-etal-acte]")).map((el) => {
    const mode: ModeActe = el.dataset.etalActe === "epingle" ? "epingle" : "flux";
    const duree = Number(el.dataset.etalDuree) || 1.5;
    return {
      el,
      mode,
      duree,
      haut: 0,
      hauteur: 0,
      p: -1,
      parallaxes: Array.from(el.querySelectorAll<HTMLElement>("[data-etal-parallaxe]")).map((p) => ({
        el: p,
        vitesse: Number(p.dataset.etalParallaxe) || 0,
      })),
      rideaux: Array.from(el.querySelectorAll<HTMLElement>("[data-etal-rideau]")).map((r) => {
        const [de, a] = lireFenetre(r.dataset.etalRideau ?? null, [0, 0.3]);
        return { el: r, de, a };
      }),
      lignes: Array.from(el.querySelectorAll<HTMLElement>("[data-etal-ligne]")).map((l) => ({
        el: l,
        de: Number(l.dataset.etalLigne) || 0,
      })),
    };
  });

  let vh = window.innerHeight;
  let largeur = window.innerWidth;
  let image = 0;

  function mesurer() {
    vh = window.innerHeight;
    if (!reduit) for (const a of actes) if (a.mode === "epingle") a.el.style.height = `${Math.round(a.duree * vh)}px`;
    const y = window.scrollY;
    for (const a of actes) {
      const r = a.el.getBoundingClientRect();
      a.haut = r.top + y;
      a.hauteur = r.height;
      a.p = -1;
    }
  }

  function lire() {
    image = 0;
    const y = window.scrollY;
    for (const a of actes) {
      const p = progressionActe(a.mode, y, a.haut, a.hauteur, vh);
      if (Math.abs(p - a.p) < 0.0001) continue;
      a.p = p;
      a.el.style.setProperty("--etal-p", p.toFixed(4));
      if (reduit) continue;
      for (const q of a.parallaxes) q.el.style.transform = `translate3d(0, ${(q.vitesse * (p - 0.5) * 100).toFixed(1)}px, 0)`;
      for (const r of a.rideaux) {
        const t = lisse((p - r.de) / Math.max(r.a - r.de, 0.001));
        r.el.style.clipPath = `inset(0 0 ${((1 - t) * 100).toFixed(2)}% 0)`;
      }
      for (const l of a.lignes) {
        const v = lisse((p - l.de) / 0.08);
        l.el.style.transform = v >= 1 ? "" : `translate3d(0, ${((1 - v) * 108).toFixed(1)}%, 0)`;
      }
    }
  }

  const planifier = () => {
    if (!image) image = requestAnimationFrame(lire);
  };
  const auRedimensionnement = () => {
    // Sur téléphone, la barre d'adresse change la hauteur à chaque geste :
    // remesurer sur ce seul changement ferait sauter la page sous le pouce.
    const tactile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (tactile && window.innerWidth === largeur) return;
    largeur = window.innerWidth;
    mesurer();
    lire();
  };

  // L'ENTRÉE : une fois, jamais de re-masquage en remontant.
  const entrees = Array.from(racine.querySelectorAll<HTMLElement>("[data-etal-entree]"));
  let io: IntersectionObserver | null = null;
  if (reduit || typeof IntersectionObserver === "undefined") {
    for (const e of entrees) e.classList.add("est-entre");
  } else {
    io = new IntersectionObserver(
      (vus) => {
        for (const v of vus) {
          if (!v.isIntersecting) continue;
          v.target.classList.add("est-entre");
          io?.unobserve(v.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const e of entrees) io.observe(e);
  }

  mesurer();
  lire();
  window.addEventListener("scroll", planifier, { passive: true });
  window.addEventListener("resize", auRedimensionnement, { passive: true });
  let vivant = true;
  document.fonts?.ready.then(() => {
    if (!vivant) return;
    mesurer();
    lire();
  });

  return () => {
    vivant = false;
    window.removeEventListener("scroll", planifier);
    window.removeEventListener("resize", auRedimensionnement);
    if (image) cancelAnimationFrame(image);
    io?.disconnect();
  };
}
