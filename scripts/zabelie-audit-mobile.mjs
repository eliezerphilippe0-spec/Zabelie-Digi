/**
 * SONDE MOBILE — ce qui casse à 360 px, mesuré et non jugé.
 *
 * Terrain déclaré du produit : Android d'entrée de gamme, 3G. 360×740 est la
 * largeur la plus répandue de ce parc.
 *
 * Trois défauts MÉCANIQUES seulement — pas d'opinion de design :
 *   1. débordement horizontal : la page défile de côté (scrollWidth > innerWidth)
 *   2. cibles tactiles < 44 px : la convention du dépôt est `min-h-11`
 *   3. texte < 12 px : illisible sur ce parc
 *
 * ⚠️ La sonde s'éprouve elle-même AVANT de mesurer quoi que ce soit
 * (`autotest`) : un élément volontairement trop large, un bouton volontairement
 * trop petit. Une sonde qui n'a jamais rien trouvé n'a pas démontré qu'elle
 * pouvait.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const LARGEUR = Number(process.env.W || 360);
const HAUTEUR = 740;

const PAGES = ["/", "/catalogue", "/vendre", "/aide", "/conditions", "/mes-achats", "/produit/pack-presets-lightroom-afro", "/panier", "/connexion"];

const SONDE = (seuilTactile) => {
  const doc = document.documentElement;
  // ⚠️ `window.innerWidth` MENT en émulation mobile : Chromium élargit la
  // fenêtre pour faire tenir un contenu trop large (mesuré : 900 au lieu de
  // 360). La seule référence fiable est la largeur du viewport CSS.
  const vw = document.documentElement.clientWidth;

  // 1 — DÉBORDEMENT. On nomme les coupables, pas seulement le fait.
  const coupables = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const st = getComputedStyle(el);
      if (st.position === "fixed" || st.visibility === "hidden") continue;
      // ⚠️ FAUX POSITIF RETIRÉ. Un rail à défilement horizontal (`overflow-x:
      // auto`) contient DÉLIBÉRÉMENT des enfants hors écran — c'est le motif
      // des onglets de rayons. Les compter revenait à traiter un carrousel
      // comme une casse de mise en page.
      let dansUnRail = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll") { dansUnRail = true; break; }
      }
      if (dansUnRail) continue;
      coupables.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 110),
        txt: (el.textContent || "").trim().slice(0, 45),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  }
  // Seuls les débordements les PLUS EXTERNES comptent : un enfant qui déborde
  // parce que son parent déborde n'est pas une cause distincte.
  const racines = coupables.filter(
    (c) => !coupables.some((p) => p !== c && p.left <= c.left && p.right >= c.right && p.w > c.w)
  );

  // 2 — CIBLES TACTILES.
  const petites = [];
  for (const el of document.querySelectorAll(
    'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea'
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    if (r.height < seuilTactile || r.width < seuilTactile) {
      petites.push({
        tag: el.tagName.toLowerCase(),
        txt: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        cls: (el.className || "").toString().slice(0, 90),
        h: Math.round(r.height),
        w: Math.round(r.width),
      });
    }
  }

  // 3 — TEXTE MINUSCULE.
  const minuscules = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length) continue;
    const direct = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 2
    );
    if (!direct) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) {
      minuscules.push({
        px: Math.round(px * 10) / 10,
        txt: el.textContent.trim().slice(0, 45),
        cls: (el.className || "").toString().slice(0, 80),
      });
    }
  }

  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: vw,
    innerWidth: window.innerWidth,
    deborde: doc.scrollWidth > vw + 1,
    racines: racines.slice(0, 12),
    petites: petites.slice(0, 20),
    nbPetites: petites.length,
    minuscules: minuscules.slice(0, 10),
    nbMinuscules: minuscules.length,
  };
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({
  viewport: { width: LARGEUR, height: HAUTEUR },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 10; SM-A105F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
});

// ── AUTOTEST : la sonde doit TROUVER sur un cas fabriqué ────────────────────
{
  const p = await ctx.newPage();
  await p.setContent(`<head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">
    <div style="width:900px;height:20px">trop large</div>
    <button style="width:20px;height:20px">x</button>
    <p style="font-size:9px">minuscule ici</p>
  </body>`);
  const r = await p.evaluate(SONDE, 44);
  const ok =
    r.deborde && r.racines.length >= 1 && r.nbPetites >= 1 && r.nbMinuscules >= 1;
  console.log(
    `AUTOTEST connu-positif : ${ok ? "OK" : "ÉCHEC"} ` +
      `(déborde=${r.deborde} racines=${r.racines.length} petites=${r.nbPetites} minuscules=${r.nbMinuscules})`
  );
  if (!ok) {
    console.log("La sonde ne voit pas un défaut fabriqué — rien de ce qui suit ne vaut.");
    process.exit(1);
  }
  // Connu-négatif : une page saine ne doit RIEN rendre.
  await p.setContent(`<head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">
    <div style="width:300px">sage</div>
    <button style="width:60px;height:48px">ok</button>
    <p style="font-size:16px">texte lisible</p>
  </body>`);
  const s = await p.evaluate(SONDE, 44);
  const propre = !s.deborde && s.racines.length === 0 && s.nbPetites === 0 && s.nbMinuscules === 0;
  console.log(`AUTOTEST connu-négatif : ${propre ? "OK" : "ÉCHEC — faux positifs"}`);
  if (!propre) process.exit(1);
  await p.close();
}

console.log(`\n=== ${LARGEUR}×${HAUTEUR}, seuil tactile 44 px ===\n`);

for (const chemin of PAGES) {
  const p = await ctx.newPage();
  const erreurs = [];
  p.on("pageerror", (e) => erreurs.push(e.message.slice(0, 90)));
  try {
    const rep = await p.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 45000 });
    await p.waitForTimeout(600);
    const r = await p.evaluate(SONDE, 44);
    console.log(`── ${chemin}  [HTTP ${rep?.status()}]`);
    console.log(
      `   défilement latéral : ${r.deborde ? `OUI (${r.scrollWidth} px pour ${r.clientWidth})` : "non"}`
    );
    for (const c of r.racines) {
      console.log(`     ⤷ ${c.tag} w=${c.w} [${c.left}→${c.right}] "${c.txt}" .${c.cls}`);
    }
    console.log(`   cibles < 44 px : ${r.nbPetites}`);
    for (const t of r.petites.slice(0, 8)) {
      console.log(`     ⤷ ${t.tag} ${t.w}×${t.h} "${t.txt}" .${t.cls}`);
    }
    console.log(`   texte < 12 px : ${r.nbMinuscules}`);
    for (const m of r.minuscules.slice(0, 5)) {
      console.log(`     ⤷ ${m.px}px "${m.txt}"`);
    }
    if (erreurs.length) console.log(`   erreurs JS : ${erreurs.join(" | ")}`);
    console.log();
  } catch (e) {
    console.log(`── ${chemin}  ÉCHEC : ${String(e).slice(0, 160)}\n`);
  }
  await p.close();
}

await nav.close();
