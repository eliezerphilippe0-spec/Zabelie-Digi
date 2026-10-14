"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { commissionAuTaux } from "@/lib/commission";
import { monterDefilement } from "@/lib/etal-defilement";
import { EtalDessin } from "@/components/etal-dessin";

/**
 * « OUVRIR MA BOUTIQUE » : la page, côté navigateur (V-23).
 *
 * Tous les libellés arrivent en props, déjà traduits et déjà chiffrés par la
 * page serveur (`tests/i18n-client-discipline.test.ts`) : le taux lu en base,
 * les jours de maturation, l'état réel de MonCash. Ce composant ne connaît
 * aucun chiffre commercial ; il ne fait qu'un calcul d'AFFICHAGE, avec
 * `commissionAuTaux` (l'arrondi en vigueur) sur le taux qu'on lui donne.
 *
 * ─── RIEN NE QUITTE LA PAGE ─────────────────────────────────────────────────
 * Le nom de la boutique est saisi, peint sur l'enseigne, repris au calcul et au
 * colophon, et gardé dans CE navigateur (`localStorage`). Pas de `<form>`, pas
 * de requête : Entrée n'envoie rien, l'URL ne change pas.
 */

export type EtalLabels = {
  /** « Aller au contenu » (`a11y.skip`) : la page n'a pas `SiteNav`, elle porte le sien. */
  evitement: string;
  folioRetour: string;
  chapitres: { titre: string; faire: string; main: string; etal: string; argent: string; loin: string; colophon: string };
  devise: string;
  titre: string;
  nomLabel: string;
  nomPlaceholder: string;
  nomDefaut: string;
  nomDefautMilieu: string;
  cta: string;
  faire: { titre: string; lede: string; familles: { t: string; d: string }[] };
  main: { titre: string; lignes: string[]; seul: string };
  etal: { titre: string; lede: string; nomMini: string; fig: string; fin: string };
  argent: {
    titre: string;
    calcul: string;
    prix: string;
    etapes: { texte: string; etat: string }[];
    note: string[];
    voirFrais: string;
  };
  loin: { titre: string; lede: string; carte: string };
  colo: {
    titre: string;
    cta: string;
    petit: string[];
    aide: string | null;
    marque: string;
    liens: { href: string; label: string }[];
  };
};

/** Le barème affiché au chapitre IV, tel que la page serveur l'a lu. */
export type EtalTarifs =
  | { mode: "taux"; bps: number; exemple: number }
  | { mode: "bareme" }
  | { mode: "indisponible" };

const CLE_NOM = "zabelie-etal-nom";
const MAX_NOM = 32;
const PRIX_MAX = 100_000_000;

/** Les villes : des noms propres, identiques dans les quatre langues. */
const VILLES_LOIN = ["Montréal", "New York", "Paris", "Boston"];
const VILLES_MI = ["Miami", "Santiago", "Santo Domingo"];
const VILLES_PRES = ["Port-au-Prince", "Cap-Haïtien", "Jacmel", "Les Cayes", "Gonaïves"];

const gourdes = new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 0 });
const propre = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, MAX_NOM);

/** Remplace `{cle}` dans un libellé par des nœuds React, dans l'ordre de la langue. */
function gabarit(texte: string, valeurs: Record<string, ReactNode>): ReactNode[] {
  return texte.split(/(\{[a-z]+\})/).map((morceau, i) => {
    const m = /^\{([a-z]+)\}$/.exec(morceau);
    return m && m[1] in valeurs ? <span key={i}>{valeurs[m[1]]}</span> : morceau;
  });
}

export function EtalPage({
  labels: L,
  tarifs,
  bareme,
  ctaHref,
  aideLiens,
}: {
  labels: EtalLabels;
  tarifs: EtalTarifs;
  /** Le panneau officiel du barème (rendu serveur), quand il est activé. */
  bareme?: ReactNode;
  ctaHref: string;
  aideLiens: { href: string; label: string }[];
}) {
  const racine = useRef<HTMLDivElement>(null);
  const titre = useRef<HTMLElement>(null);
  const enseigne = useRef<SVGTextElement>(null);
  const vignette = useRef<SVGTextElement>(null);
  const sortieNet = useRef<HTMLSpanElement>(null);

  const [nom, setNom] = useState("");
  const [saisie, setSaisie] = useState("");
  const [chapitre, setChapitre] = useState<{ id: string; label: string; fond: string }>({ id: "titre", label: L.chapitres.titre, fond: "clair" });
  const [prix, setPrix] = useState(tarifs.mode === "taux" ? String(tarifs.exemple) : "");
  const [netAffiche, setNetAffiche] = useState<number | null>(null);

  const a = nom.length > 0;
  const nomOuDefaut = a ? nom : L.nomDefaut;

  // Le nom gardé dans ce navigateur, relu au montage (jamais au rendu serveur).
  useEffect(() => {
    try {
      const garde = propre(localStorage.getItem(CLE_NOM) ?? "");
      if (garde) {
        // Stockage du navigateur : lu après l'hydratation, jamais au rendu
        // serveur (même forme que components/offline-marketplace.tsx).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNom(garde);
        setSaisie(garde);
      }
    } catch {
      /* stockage bloqué : la page marche sans */
    }
  }, []);

  const changerNom = (v: string) => {
    setSaisie(v.slice(0, MAX_NOM));
    const n = propre(v);
    setNom(n);
    try {
      if (n) localStorage.setItem(CLE_NOM, n);
      else localStorage.removeItem(CLE_NOM);
    } catch {
      /* idem */
    }
  };

  // Le défilement : monté une fois, démonté à la navigation.
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Un ATTRIBUT et non une classe : React réécrit `className` à chaque rendu
    // (le nom tapé change `a-nom`), et effaçait une classe posée ici. Mesuré :
    // la scène de l'étal cessait de s'épingler dès la première lettre.
    if (!reduit) el.setAttribute("data-etal-anime", "");
    const demonter = monterDefilement(el, reduit);

    const chapitres = Array.from(el.querySelectorAll<HTMLElement>("[data-chapitre]"));
    let image = 0;
    const suivre = () => {
      image = 0;
      const ligne = 48;
      const trouve = chapitres.find((c) => {
        const r = c.getBoundingClientRect();
        return r.top <= ligne && r.bottom > ligne;
      }) ?? chapitres[0];
      if (!trouve) return;
      setChapitre((avant) =>
        avant.id === trouve.id ? avant : { id: trouve.id, label: trouve.dataset.chapitre ?? "", fond: trouve.dataset.fond ?? "clair" },
      );
    };
    const planifier = () => {
      if (!image) image = requestAnimationFrame(suivre);
    };
    window.addEventListener("scroll", planifier, { passive: true });
    suivre();

    // La page de titre répond au pointeur, et seulement à une souris fine.
    const fin = window.matchMedia("(hover: hover) and (pointer: fine)");
    const hero = titre.current;
    let cible = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    let boucle = 0;
    const pas = () => {
      pos.x += (cible.x - pos.x) * 0.08;
      pos.y += (cible.y - pos.y) * 0.08;
      hero?.style.setProperty("--mx", pos.x.toFixed(4));
      hero?.style.setProperty("--my", pos.y.toFixed(4));
      boucle = Math.abs(cible.x - pos.x) + Math.abs(cible.y - pos.y) > 0.002 ? requestAnimationFrame(pas) : 0;
    };
    const bouger = (e: PointerEvent) => {
      if (reduit || !fin.matches || e.pointerType !== "mouse") return;
      cible = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 };
      if (!boucle) boucle = requestAnimationFrame(pas);
    };
    const quitter = () => {
      cible = { x: 0, y: 0 };
      if (!boucle) boucle = requestAnimationFrame(pas);
    };
    hero?.addEventListener("pointermove", bouger);
    hero?.addEventListener("pointerleave", quitter);

    return () => {
      demonter();
      window.removeEventListener("scroll", planifier);
      hero?.removeEventListener("pointermove", bouger);
      hero?.removeEventListener("pointerleave", quitter);
      if (image) cancelAnimationFrame(image);
      if (boucle) cancelAnimationFrame(boucle);
    };
  }, []);

  // Le nom tient sur la planche ; sa largeur guide le pinceau.
  useLayoutEffect(() => {
    const ajuster = () => {
      for (const t of [enseigne.current, vignette.current]) {
        if (!t) continue;
        t.setAttribute("font-size", "30");
        let w = t.getComputedTextLength();
        if (w > 218) {
          t.setAttribute("font-size", Math.max(12, (30 * 218) / w).toFixed(2));
          w = t.getComputedTextLength();
        }
        const svg = t.ownerSVGElement;
        svg?.style.setProperty("--x0", (240 - w / 2).toFixed(1));
        svg?.style.setProperty("--w", w.toFixed(1));
      }
    };
    ajuster();
    document.fonts?.ready.then(ajuster);
  }, [nomOuDefaut]);

  // Le net : calculé à l'affichage sur le taux reçu, jamais un chiffre écrit.
  const bps = tarifs.mode === "taux" ? tarifs.bps : 0;
  const p = Math.floor(Number(prix));
  const prixValide = Number.isFinite(p) && p >= 1 && p <= PRIX_MAX;
  const net = prixValide ? p - commissionAuTaux(p, bps) : null;

  // Le compteur : une fois, à l'entrée du chiffre ; jamais en mouvement réduit.
  const compteFait = useRef(false);
  useEffect(() => {
    const el = sortieNet.current;
    if (tarifs.mode !== "taux" || !el || compteFait.current) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduit || typeof IntersectionObserver === "undefined") {
      compteFait.current = true;
      return;
    }
    let image = 0;
    const io = new IntersectionObserver(
      (vus) => {
        if (!vus.some((v) => v.isIntersecting) || compteFait.current) return;
        compteFait.current = true;
        io.disconnect();
        const cibleNet = net ?? 0;
        const debut = performance.now();
        const tic = (t: number) => {
          const k = Math.min(1, (t - debut) / 1200);
          setNetAffiche(Math.round(cibleNet * (1 - Math.pow(1 - k, 3))));
          image = k < 1 ? requestAnimationFrame(tic) : 0;
          if (k >= 1) setNetAffiche(null);
        };
        image = requestAnimationFrame(tic);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (image) cancelAnimationFrame(image);
    };
    // Le compte part une fois, sur la valeur affichée à l'entrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifs.mode]);

  const nomMilieu = a ? nom : L.nomDefautMilieu;
  const champNom = (id: string, label: string, placeholder: string) => (
    <div className="etal-champ">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={saisie}
        maxLength={MAX_NOM}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => changerNom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );

  return (
    <div ref={racine} className={`page-etal ${a ? "a-nom" : ""}`} data-fond-courant={chapitre.fond}>
      <a href="#main" className="etal-evitement">
        {L.evitement}
      </a>
      <header className="etal-folio-bande">
        <a className={`etal-folio ${chapitre.id === "titre" ? "" : "est-visible"}`} href="#titre" aria-label={L.folioRetour}>
          <Marque />
          <span className="etal-folio-nom">Zabelie</span>
          <span className="etal-folio-ch">{chapitre.id === "titre" ? L.chapitres.faire : chapitre.label}</span>
        </a>
      </header>

      <main id="main">
        {/* PAGE DE TITRE · trois plans : le soleil loin, le titre, l'auvent devant. */}
        <section ref={titre} id="titre" className="etal-titre" data-etal-acte="flux" data-chapitre={L.chapitres.titre} data-fond="clair">
          <div className="etal-titre-soleil" aria-hidden="true">
            <svg viewBox="0 0 200 200" focusable="false">
              <circle cx="100" cy="100" r="54" fill="#f6c9a6" />
              <path d="M100 22V6M100 178v16M22 100H6M178 100h16M45 45 34 34M155 155l11 11M45 155l-11 11M155 45l11-11" fill="none" stroke="#f6c9a6" strokeWidth="9" strokeLinecap="round" />
            </svg>
          </div>
          <div className="etal-auvent" aria-hidden="true">
            <div className="etal-auvent-barre" />
            <div className="etal-auvent-toile" />
            <div className="etal-auvent-festons" />
          </div>
          <div className="etal-titre-contenu etal-cadre">
            <p className="etal-masthead">
              <Marque />
              <span className="etal-masthead-nom">Zabelie</span>
              <span className="etal-masthead-devise">{L.devise}</span>
            </p>
            <h1 className="etal-h1">
              <span className="etal-masque">
                <span>{L.titre}</span>
              </span>
            </h1>
            {champNom("etal-nom", L.nomLabel, L.nomPlaceholder)}
            <a className="etal-cta" href={ctaHref}>
              {L.cta}
            </a>
          </div>
          <div className="etal-frise" aria-hidden="true" />
        </section>

        {/* I · Reconnaissance. */}
        <section id="savoir-faire" className="etal-ch etal-faire" data-chapitre={L.chapitres.faire} data-fond="clair">
          <div className="etal-cadre etal-faire-grille">
            <div className="etal-pile" data-etal-entree>
              <h2 className="etal-h2">{L.faire.titre}</h2>
              <p className="etal-lede">{L.faire.lede}</p>
            </div>
            <dl className="etal-familles" data-etal-entree>
              {L.faire.familles.map((fam, i) => (
                <div key={fam.t} className="etal-famille">
                  <dt>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      {ICONES[i]}
                    </svg>
                    {fam.t}
                  </dt>
                  <dd>{fam.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* II · Malaise. Le rideau tombe, les lignes sortent de leur masque. */}
        <section id="main-a-main" className="etal-main" data-etal-acte="flux" data-chapitre={L.chapitres.main} data-fond="sombre">
          <div className="etal-rideau" data-etal-rideau="0.03 0.26" aria-hidden="true" />
          <div className="etal-cadre etal-main-texte">
            <h2 className="etal-h2 etal-masque">
              <span data-etal-ligne="0.2">{L.main.titre}</span>
            </h2>
            <div className="etal-main-lignes">
              {L.main.lignes.map((l, i) => (
                <p key={l} className="etal-masque">
                  <span data-etal-ligne={(0.26 + i * 0.04).toFixed(2)}>{l}</span>
                </p>
              ))}
            </div>
            <p className="etal-main-seul etal-masque">
              <span data-etal-ligne="0.52">{L.main.seul}</span>
            </p>
          </div>
        </section>

        {/* III · LE PIC. Le seul acte tenu : l'étal se dessine, le nom est peint. */}
        <section id="etal" className="etal-pic" data-etal-acte="epingle" data-etal-duree="3.6" data-chapitre={L.chapitres.etal} data-fond="clair">
          <div className="etal-scene">
            <div className="etal-scene-texte">
              <h2 className="etal-h2">{L.etal.titre}</h2>
              <p className="etal-scene-lede">{L.etal.lede}</p>
              <div className="etal-champ-mini">{champNom("etal-nom-enseigne", L.etal.nomMini, L.nomDefaut)}</div>
            </div>
            <figure className="etal-figure">
              <EtalDessin nom={nomOuDefaut} anime texteRef={enseigne} />
              <figcaption>
                <span>{gabarit(L.etal.fig, { nom: <span className="etal-nom-cite">{nomMilieu}</span> })}</span>
                <span className="etal-fin">{L.etal.fin}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* IV · Soulagement. Les vrais chiffres, lus par la page serveur. */}
        <section id="argent" className="etal-ch etal-argent" data-chapitre={L.chapitres.argent} data-fond="clair">
          <div className="etal-frise etal-frise--haut" aria-hidden="true" />
          <div className="etal-cadre etal-argent-grille">
            <div className="etal-pile" data-etal-entree>
              <h2 className="etal-h2">{L.argent.titre}</h2>
              {tarifs.mode === "taux" && (
                <p className="etal-calcul">
                  {gabarit(L.argent.calcul, {
                    prix: (
                      <label className="etal-calcul-prix">
                        <span className="etal-sr">{L.argent.prix}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={PRIX_MAX}
                          step={1}
                          value={prix}
                          onChange={(e) => setPrix(e.target.value)}
                        />
                      </label>
                    ),
                    nom: <span className="etal-nom-cite">{nomMilieu}</span>,
                    net: (
                      <output className="etal-calcul-net" aria-live="polite">
                        <span ref={sortieNet}>{net === null ? "…" : gourdes.format(netAffiche ?? net)}</span> HTG
                      </output>
                    ),
                  })}
                </p>
              )}
              {tarifs.mode === "bareme" && <div className="etal-bareme">{bareme}</div>}
            </div>

            <ol className="etal-registre" data-etal-entree>
              {L.argent.etapes.map((e, i) => (
                <li key={e.etat}>
                  <span className="etal-registre-n">{i + 1}</span>
                  <span className="etal-registre-txt">{e.texte}</span>
                  <span className={`etal-registre-etat ${i === L.argent.etapes.length - 1 ? "etal-registre-etat--fin" : ""}`}>{e.etat}</span>
                </li>
              ))}
            </ol>

            <div className="etal-note" data-etal-entree>
              {L.argent.note.map((n) => (
                <p key={n}>{n}</p>
              ))}
              {tarifs.mode === "indisponible" && (
                <p>
                  <a className="etal-lien" href={ctaHref}>
                    {L.argent.voirFrais}
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* V · Appartenance. Trois plans de villes, trois vitesses. */}
        <section id="ici-et-la-bas" className="etal-ch etal-loin" data-etal-acte="flux" data-chapitre={L.chapitres.loin} data-fond="sombre">
          <div className="etal-cadre etal-loin-grille">
            <div className="etal-pile" data-etal-entree>
              <h2 className="etal-h2">{L.loin.titre}</h2>
              <p className="etal-lede">{L.loin.lede}</p>
              <p className="etal-petit">{L.loin.carte}</p>
            </div>
            <div className="etal-villes" aria-hidden="true">
              <ul className="etal-plan etal-plan-loin" data-etal-parallaxe="-1.7">
                {VILLES_LOIN.map((v) => <li key={v}>{v}</li>)}
              </ul>
              <ul className="etal-plan etal-plan-mi" data-etal-parallaxe="-0.8">
                {VILLES_MI.map((v) => <li key={v}>{v}</li>)}
              </ul>
              <ul className="etal-plan etal-plan-pres" data-etal-parallaxe="0.3">
                {VILLES_PRES.map((v) => <li key={v}>{v}</li>)}
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* COLOPHON · Résolution : le plus petit caractère, l'étal fini, une ligne. */}
      <footer id="colophon" className="etal-ch etal-colophon" data-chapitre={L.chapitres.colophon} data-fond="clair">
        <div className="etal-cadre etal-colophon-grille">
          <EtalDessin nom={nomOuDefaut} texteRef={vignette} className="etal-vignette" />
          <div className="etal-colophon-texte" data-etal-entree>
            <p className="etal-colophon-titre">{gabarit(L.colo.titre, { nom: <span className="etal-nom-cite">{nomOuDefaut}</span> })}</p>
            <p className="etal-colophon-cta">
              {gabarit(L.colo.cta, {
                lien: (
                  <a className="etal-lien-cta" href={ctaHref}>
                    {L.cta}
                  </a>
                ),
              })}
            </p>
            {L.colo.petit.map((t) => (
              <p key={t} className="etal-colophon-petit">
                {t}
              </p>
            ))}
            {L.colo.aide && aideLiens.length > 0 && (
              <p className="etal-colophon-petit">
                {L.colo.aide}{" "}
                {aideLiens.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && " · "}
                    <a className="etal-lien" href={l.href}>
                      {l.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
            <p className="etal-colophon-liens">
              {L.colo.liens.map((l, i) => (
                <span key={l.href}>
                  {i > 0 && " · "}
                  <a className="etal-lien" href={l.href}>
                    {l.label}
                  </a>
                </span>
              ))}
            </p>
            <p className="etal-colophon-marque">{L.colo.marque}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const ICONES = [
  <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></>,
  <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12h18" /></>,
];

function Marque() {
  return (
    <svg className="etal-marque" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="46" height="46" rx="11" fill="#17123a" stroke="#e0580f" strokeOpacity=".4" strokeWidth="2" />
      <path d="M14 15h20l-13 12h13l-2 6H13l13-12H14z" fill="#e0580f" />
    </svg>
  );
}
