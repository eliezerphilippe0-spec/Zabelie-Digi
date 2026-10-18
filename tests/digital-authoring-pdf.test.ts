import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { mentionExemplaire, rendreExemplairePdf, rendreExtraitPdf, rendreGuidePdf } from "../lib/digital-authoring/pdf/guide-pdf";
import { FORMAT, LARGEUR_UTILE, MARGES, STYLES, blocsDuCorps, couperEnLignes, largeur, mettreEnPage, type GuideNormalise } from "../lib/digital-authoring/pdf/layout";
import { LARGEURS } from "../lib/digital-authoring/pdf/metrics";
import { caracteresNonPrisEnCharge, normaliserPourPdf, pointDepuisOctet } from "../lib/digital-authoring/pdf/winansi";
import { GUIDE_ESSAI } from "./helpers/guide-essai";

/**
 * Moteur PDF interne du Studio (tâche 4.1 ; décision D1-A). Le guide d'essai
 * fait une trentaine de pages en kreyòl ; ses pages ont aussi été inspectées
 * une à une (captures jointes à la PR). Ces tests rendent les garanties
 * permanentes : octets déterministes, structure valide, aucune ligne hors de
 * la page, aucun caractère perdu, refus explicite de l'indessinable.
 */

const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);

function normaliser(g: typeof GUIDE_ESSAI): GuideNormalise {
  return {
    langue: g.langue,
    titre: normaliserPourPdf(g.titre).trim(),
    objectif: normaliserPourPdf(g.objectif).trim(),
    auteur: normaliserPourPdf(g.auteur).trim(),
    sections: g.sections.map((s) => ({ titre: normaliserPourPdf(s.titre).trim(), resultat: normaliserPourPdf(s.resultat).trim(), corps: normaliserPourPdf(s.corps) })),
  };
}

function rendre() {
  const r = rendreGuidePdf(GUIDE_ESSAI);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

/**
 * Les chaînes `( … ) Tj` d'un PDF, décodées comme le ferait un lecteur : une
 * parenthèse NON échappée ouvre un niveau qu'une autre doit refermer (règle
 * de la norme PDF), sinon la chaîne déborde et le texte relu ne correspond plus.
 */
function textesDuPdf(octets: Uint8Array): string[] {
  const src = Buffer.from(octets).toString("latin1");
  const textes: string[] = [];
  let i = 0;
  while ((i = src.indexOf(" Td (", i)) !== -1) {
    i += 5;
    let s = "";
    let niveau = 1;
    while (i < src.length) {
      if (src[i] === "(") niveau++;
      if (src[i] === ")" && --niveau === 0) break;
      if (src[i] === BS) {
        const suite = src.slice(i + 1, i + 4);
        if (suite.length === 3 && [...suite].every((c) => c >= "0" && c <= "7")) {
          s += String.fromCodePoint(pointDepuisOctet(parseInt(suite, 8)));
          i += 4;
        } else {
          s += src[i + 1];
          i += 2;
        }
      } else {
        s += src[i];
        i++;
      }
    }
    textes.push(s);
  }
  return textes;
}

test("chasses : celles d'Adobe (espace 278, « m » 833, « è » comme « e »)", () => {
  const h = LARGEURS.Helvetica;
  assert.equal(h.length, 224);
  assert.equal(h[0x20 - 0x20], 278);
  assert.equal(h["m".charCodeAt(0) - 0x20], 833);
  assert.equal(h[0xe8 - 0x20], h["e".charCodeAt(0) - 0x20]);
  assert.equal(LARGEURS["Helvetica-Bold"]["m".charCodeAt(0) - 0x20], 889);
});

test("déterminisme : deux rendus du même guide, les mêmes octets et la même empreinte", () => {
  const a = rendre();
  const b = rendre();
  assert.equal(Buffer.compare(Buffer.from(a.octets), Buffer.from(b.octets)), 0);
  assert.equal(a.empreinte, b.empreinte);
  assert.match(a.empreinte, /^[0-9a-f]{64}$/);
});

test("guide d'essai : une trentaine de pages, bien au-dessous de 5 Mio", () => {
  const r = rendre();
  assert.ok(r.pages >= 28 && r.pages <= 40, `${r.pages} pages`);
  assert.ok(r.octets.length <= 5 * 1024 * 1024);
  assert.ok(r.octets.length < 200 * 1024, `${r.octets.length} octets`);
});

test("structure : en-tête, table xref exacte, nombre de pages, identifiant, fin de fichier", () => {
  const r = rendre();
  const src = Buffer.from(r.octets).toString("latin1");
  assert.ok(src.startsWith("%PDF-1.4" + NL));
  assert.ok(src.endsWith("%%EOF" + NL));
  const posXref = Number(src.slice(src.lastIndexOf("startxref") + 10).split(NL)[0]);
  assert.ok(src.startsWith("xref" + NL, posXref), "startxref vise la table");
  const entete = src.slice(posXref).split(NL);
  const total = Number(entete[1].split(" ")[1]);
  for (let n = 1; n < total; n++) {
    const decalage = Number(entete[2 + n].slice(0, 10));
    assert.ok(src.startsWith(`${n} 0 obj`, decalage), `objet ${n} à ${decalage}`);
    assert.equal(entete[2 + n].length, 19, "entrée xref de 20 octets avec son saut de ligne");
  }
  assert.equal((src.match(/\/Type \/Page /g) ?? []).length, r.pages);
  assert.match(src, new RegExp(`/Count ${r.pages} `));
  assert.match(src, /\/ID \[<[0-9A-F]{32}> <[0-9A-F]{32}>\]/);
  assert.ok(!src.includes("CreationDate") && !src.includes("ModDate"), "aucune date : octets déterministes");
});

test("aucune ligne hors de la page, aucune ligne qui en chevauche une autre", () => {
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  for (const [p, page] of mep.pages.entries()) {
    const ys: number[] = [];
    for (const l of page.lignes) {
      const w = largeur(l.texte, { police: l.police, taille: l.taille, interligne: 0, gris: false });
      assert.ok(l.x >= MARGES.gauche - 0.01, `page ${p + 1} : marge gauche (${l.texte})`);
      assert.ok(l.x + w <= FORMAT.largeur - MARGES.droite + 0.01, `page ${p + 1} : marge droite (${l.texte})`);
      assert.ok(l.y >= MARGES.bas - 30 && l.y <= FORMAT.hauteur - MARGES.haut, `page ${p + 1} : hauteur (${l.texte})`);
      if (l.taille !== STYLES.pied.taille && l.taille !== STYLES.exemplaire.taille) {
        assert.ok(l.y >= MARGES.bas - 0.01, `page ${p + 1} : texte dans la marge du bas (${l.texte})`);
        ys.push(l.y);
      }
    }
    const lignesDistinctes = [...new Set(ys)].sort((a, b) => b - a);
    for (let k = 1; k < lignesDistinctes.length; k++) {
      assert.ok(lignesDistinctes[k - 1] - lignesDistinctes[k] >= 11.9, `page ${p + 1} : lignes trop proches`);
    }
  }
});

test("aucun caractère perdu : le PDF relu contient tout le texte du guide, dans l'ordre", () => {
  const r = rendre();
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  // 1. L'écriture est fidèle : chaque ligne posée se relit à l'identique dans le fichier.
  assert.deepEqual(textesDuPdf(r.octets), mep.pages.flatMap((p) => p.lignes.map((l) => l.texte)));
  // 2. La mise en page n'a rien laissé tomber : mêmes caractères, dans le même ordre,
  //    une fois retirés les blancs et les traits d'union ajoutés aux coupures.
  const g = normaliser(GUIDE_ESSAI);
  const retenir = (t: string) => [...t].filter((c) => c !== " " && c !== "-" && c !== String.fromCharCode(0xa0)).join("");
  const attendu = retenir(
    g.sections
      .map((s, i) => `${i + 1}. ${s.titre}` + s.resultat + blocsDuCorps(s.corps).map((b) => (b.type === "puce" ? b.marque + b.texte : b.lignes.join(""))).join(""))
      .join(""),
  );
  const premiere = mep.sommaire[0].page;
  const corps = mep.pages
    .filter((p) => (p.numero ?? 0) >= premiere)
    .flatMap((p) => p.lignes.filter((l) => l.taille !== STYLES.pied.taille))
    .map((l) => l.texte);
  // Les marques de liste sont posées après le texte de leur première ligne : on remet l'ordre de lecture.
  const ordonne: string[] = [];
  for (let k = 0; k < corps.length; k++) {
    const marque = corps[k + 1];
    if (marque && (marque === String.fromCodePoint(0x2022) || /^[0-9]{1,3}[.]$/.test(marque))) {
      ordonne.push(marque, corps[k]);
      k++;
    } else ordonne.push(corps[k]);
  }
  assert.equal(retenir(ordonne.join("")), attendu);
});

test("sommaire : chaque numéro est la page réelle du début de sa section", () => {
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  for (const e of mep.sommaire) {
    const page = mep.pages.find((p) => p.numero === e.page);
    assert.ok(page, `page ${e.page}`);
    const premiere = couperEnLignes(e.titre, STYLES.titreSection, LARGEUR_UTILE)[0];
    assert.equal(page.lignes[0].texte, premiere, e.titre);
  }
});

test("sommaire imprimé : chaque entrée porte son numéro de page réel, aligné à droite", () => {
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  const s = STYLES.entreeSommaire;
  const pagesSommaire = mep.pages.filter((p) => p.numero !== null && p.numero < mep.sommaire[0].page);
  const numeros = pagesSommaire.flatMap((p) => p.lignes.filter((l) => l.taille === s.taille && !l.gris && /^[0-9]+$/.test(l.texte)));
  assert.deepEqual(numeros.map((l) => Number(l.texte)), mep.sommaire.map((e) => e.page));
  for (const l of numeros) assert.ok(Math.abs(l.x + largeur(l.texte, s) - (FORMAT.largeur - MARGES.droite)) < 0.02, l.texte);
});

test("listes : la marque ne touche jamais le texte ; une liste se détache du paragraphe qui la suit", () => {
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  const s = STYLES.corps;
  let marques = 0;
  for (const p of mep.pages.filter((x) => (x.numero ?? 0) >= mep.sommaire[0].page)) {
    const corps = p.lignes.filter((l) => l.taille === s.taille && l.police === "Helvetica" && !l.gris);
    for (const m of corps.filter((l) => l.texte === String.fromCodePoint(0x2022) || /^[0-9]{1,3}[.]$/.test(l.texte))) {
      const texte = corps.find((l) => l.y === m.y && l.x > m.x);
      assert.ok(texte, `page ${p.numero} : marque sans texte`);
      assert.ok(m.x + largeur(m.texte, s) <= texte.x - 4, `page ${p.numero} : « ${m.texte} » touche le texte`);
      // Marques alignées à droite, à 5 points du texte : « 9. » et « 10. » finissent au même endroit.
      assert.ok(Math.abs(m.x + largeur(m.texte, s) - (texte.x - 5)) < 0.02, `page ${p.numero} : « ${m.texte} » mal alignée`);
      marques++;
    }
    // Ligne de liste (en retrait) suivie d'un paragraphe (à la marge) : plus qu'un simple interligne.
    const lignes = corps.filter((l) => !(l.texte === String.fromCodePoint(0x2022) || /^[0-9]{1,3}[.]$/.test(l.texte))).sort((a, b) => b.y - a.y);
    for (let k = 1; k < lignes.length; k++) {
      if (lignes[k - 1].x > MARGES.gauche + 1 && lignes[k].x === MARGES.gauche) {
        assert.ok(lignes[k - 1].y - lignes[k].y >= s.interligne + 5.9, `page ${p.numero} : liste collée au paragraphe`);
      }
    }
  }
  assert.ok(marques > 50, `${marques} marques vérifiées`);
});

test("ni veuve ni orpheline : un bloc de plusieurs lignes ne laisse jamais une ligne seule d'un côté de la page", () => {
  const mep = mettreEnPage(normaliser(GUIDE_ESSAI));
  let coupures = 0;
  for (const p of mep.pages) {
    const corps = p.lignes.filter((l) => l.bloc).sort((a, b) => b.y - a.y);
    if (corps.length === 0) continue;
    const haut = corps[0].bloc!;
    const bas = corps[corps.length - 1].bloc!;
    if (haut.total > 1 && haut.rang > 0) {
      coupures++;
      assert.notEqual(haut.rang, haut.total - 1, `page ${p.numero} : dernière ligne seule en haut (veuve)`);
    }
    if (bas.total > 1 && bas.rang < bas.total - 1) assert.notEqual(bas.rang, 0, `page ${p.numero} : première ligne seule en bas (orpheline)`);
  }
  assert.ok(coupures > 0, "le guide d'essai coupe bien des blocs entre deux pages");
});

test("ni veuve ni orpheline, quelle que soit la position du bloc sur la page", () => {
  // Une ligne courte de plus à chaque essai : le bloc de trois lignes finit par
  // tomber à chaque position possible en bas de page.
  const trois = "Premye liy yon paragraf ki long ase pou l pran twa liy sou paj la, menm lè fraz la kontinye ankò ak lòt mo ki fè l pi long toujou pou nou rive sou twazyèm liy lan.";
  assert.equal(couperEnLignes(trois, STYLES.corps, LARGEUR_UTILE).length, 3);
  for (let decalage = 0; decalage < 32; decalage++) {
    const corps = [...Array(decalage).fill("Yon liy."), ...Array(40).fill(trois)].join(NL + NL);
    const mep = mettreEnPage({ langue: "ht", titre: "Gid", objectif: "", auteur: "", sections: [{ titre: "Seksyon", resultat: "", corps }] });
    for (const p of mep.pages) {
      const lignes = p.lignes.filter((l) => l.bloc).sort((a, b) => b.y - a.y);
      if (!lignes.length) continue;
      const haut = lignes[0].bloc!;
      const bas = lignes[lignes.length - 1].bloc!;
      assert.ok(!(haut.total > 1 && haut.rang > 0 && haut.rang === haut.total - 1), `décalage ${decalage}, page ${p.numero} : veuve`);
      assert.ok(!(bas.total > 1 && bas.rang === 0), `décalage ${decalage}, page ${p.numero} : orpheline`);
    }
  }
});

test("mot plus large que la page : coupé avec un trait d'union, jamais débordant", () => {
  const s = STYLES.corps;
  const mot = "tèt".repeat(40);
  const lignes = couperEnLignes(`Avan ${mot} apre`, s, LARGEUR_UTILE);
  assert.ok(lignes.length >= 3);
  for (const l of lignes) assert.ok(largeur(l, s) <= LARGEUR_UTILE + 0.01, l);
  assert.equal(lignes.slice(0, -1).filter((l) => l.endsWith("-")).length >= 1, true);
  assert.equal(lignes.map((l) => (l.endsWith("-") ? l.slice(0, -1) : l + " ")).join("").replace(/ +/g, " ").trim(), `Avan ${mot} apre`);
});

test("indessinable : refusé en nommant l'endroit et le caractère, jamais remplacé en silence", () => {
  const emoji = String.fromCodePoint(0x1f600);
  const coche = String.fromCodePoint(0x2713);
  const han = String.fromCodePoint(0x4e2d);
  const r = rendreGuidePdf({
    ...GUIDE_ESSAI,
    titre: `Gid ${emoji}`,
    sections: [GUIDE_ESSAI.sections[0], { ...GUIDE_ESSAI.sections[1], corps: `Wi ${coche} ${han} ${coche}` }],
  });
  assert.equal(r.ok, false);
  if (r.ok || r.code !== "caracteres_non_pris_en_charge") return;
  assert.deepEqual(r.problemes, [
    { ou: "titre", section: null, caracteres: [emoji] },
    { ou: "section", section: 2, caracteres: [coche, han] },
  ]);
});

test("équivalents explicites : espace fine insécable, trait d'union conditionnel, tabulation", () => {
  const fine = String.fromCodePoint(0x202f);
  const conditionnel = String.fromCodePoint(0x00ad);
  const t = normaliserPourPdf(`a${fine}b koun${conditionnel}nen c` + String.fromCharCode(9) + "d");
  assert.equal(t, `a${String.fromCharCode(0xa0)}b kounnen c d`);
  assert.deepEqual(caracteresNonPrisEnCharge(t), []);
  // Kreyòl et français : tout tient dans WinAnsi.
  const typo = [0x00e8, 0x00f2, 0x00e0, 0x00e9, 0x00e7, 0x0153, 0x00ab, 0x00bb, 0x2019, 0x2014, 0x2026, 0x20ac].map((p) => String.fromCodePoint(p)).join("");
  assert.deepEqual(caracteresNonPrisEnCharge(normaliserPourPdf(typo)), []);
});

test("guide vide : refusé (aucun titre ou aucune section)", () => {
  assert.deepEqual(rendreGuidePdf({ ...GUIDE_ESSAI, sections: [] }), { ok: false, code: "guide_vide" });
  assert.deepEqual(rendreGuidePdf({ ...GUIDE_ESSAI, titre: "   " }), { ok: false, code: "guide_vide" });
});

test("extrait (4.4) : titre, sommaire complet, première section à l'identique, page de fin ; rien d'autre", () => {
  const g = normaliser(GUIDE_ESSAI);
  const complet = mettreEnPage(g);
  const extrait = mettreEnPage(g, { extrait: true });
  const debut2 = complet.sommaire[1].page;
  const section1 = complet.pages.filter((p) => p.numero !== null && p.numero >= complet.sommaire[0].page && p.numero < debut2);
  const sommaire = complet.pages.filter((p) => p.numero !== null && p.numero < complet.sommaire[0].page);
  assert.equal(extrait.pages.length, 1 + sommaire.length + section1.length + 1);
  // Le sommaire et la première section sont ceux du guide complet, ligne pour ligne, numéros compris.
  assert.deepEqual(extrait.pages.slice(1, 1 + sommaire.length + section1.length), [...sommaire, ...section1]);
  assert.ok(extrait.pages.every((p) => p.numero === null || p.numero < debut2), "aucune page d'une autre section");
  // Page de titre marquée, page de fin qui dit ce que contient le guide complet.
  assert.ok(extrait.pages[0].lignes.some((l) => l.texte.startsWith("Ekstrè gratis")));
  const fin = extrait.pages[extrait.pages.length - 1];
  assert.equal(fin.numero, null);
  assert.equal(fin.lignes[0].texte, "Fen ekstrè a");
  assert.ok(fin.lignes.map((l) => l.texte).join(" ").includes(`${complet.pages.length} paj ak ${g.sections.length} seksyon`));
});

test("extrait : octets déterministes, bien plus léger que le guide, mêmes refus", () => {
  const a = rendreExtraitPdf(GUIDE_ESSAI);
  const b = rendreExtraitPdf(GUIDE_ESSAI);
  const complet = rendre();
  assert.ok(a.ok && b.ok);
  assert.equal(a.empreinte, b.empreinte);
  assert.notEqual(a.empreinte, complet.empreinte);
  assert.ok(a.octets.length < complet.octets.length / 3, `${a.octets.length} octets`);
  const coche = String.fromCodePoint(0x2713);
  const refus = rendreExtraitPdf({ ...GUIDE_ESSAI, sections: [GUIDE_ESSAI.sections[0], { ...GUIDE_ESSAI.sections[1], corps: coche }] });
  assert.equal(refus.ok, false, "l'extrait n'existe que si le guide complet se rend");
});

test("exemplaire (4.5) : le corps est ligne pour ligne celui du guide ; seule la mention s'ajoute en pied", () => {
  const g = normaliser(GUIDE_ESSAI);
  const mention = mentionExemplaire("ht", "Jean-Robert Pierre-Louis", "ZB-2026-0042");
  assert.equal(mention, "Kopi pou Jean-Robert P. · kòmand ZB-2026-0042");
  const complet = mettreEnPage(g);
  const exemplaire = mettreEnPage(g, { exemplaire: mention });
  assert.equal(exemplaire.pages.length, complet.pages.length);
  exemplaire.pages.forEach((p, i) => {
    const pied = p.lignes.filter((l) => l.taille === STYLES.exemplaire.taille);
    assert.equal(pied.length, 1, `page ${i + 1} : une mention`);
    assert.equal(pied[0].texte, mention);
    assert.ok(pied[0].x >= MARGES.gauche && pied[0].x + largeur(mention, STYLES.exemplaire) <= FORMAT.largeur - MARGES.droite);
    assert.ok(pied[0].y >= 12 && pied[0].y < MARGES.bas - 30, "sous le numéro de page");
    assert.deepEqual(p.lignes.filter((l) => l.taille !== STYLES.exemplaire.taille), complet.pages[i].lignes);
  });
});

test("exemplaire : prénom et initiale seulement ; ni chiffre, ni caractère sans dessin, ni balise", () => {
  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(mentionExemplaire("fr", "Marie", "ZB-1"), "Exemplaire de Marie · commande ZB-1");
  assert.equal(mentionExemplaire("fr", `Ti ${emoji} Jak Bazil 3712 4455`, "ZB 7;<b>"), "Exemplaire de Ti B. · commande ZB7b");
  assert.equal(mentionExemplaire("ht", "   ", ""), "Kopi pou ? · kòmand ?");
  const a = rendreExemplairePdf(GUIDE_ESSAI, { nom: "Marie Jean", commande: "ZB-1" });
  const b = rendreExemplairePdf(GUIDE_ESSAI, { nom: "Marie Jean", commande: "ZB-1" });
  const c = rendreExemplairePdf(GUIDE_ESSAI, { nom: "Paul Jean", commande: "ZB-2" });
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(a.empreinte, b.empreinte, "même acheteur, mêmes octets");
  assert.notEqual(a.empreinte, c.empreinte, "deux acheteurs, deux exemplaires");
  assert.notEqual(a.empreinte, rendre().empreinte, "l'exemplaire n'est pas le fichier approuvé");
});

test("source : aucune dépendance, aucune date, aucun aléa dans le moteur", () => {
  for (const f of ["layout.ts", "writer.ts", "guide-pdf.ts", "winansi.ts", "metrics.ts"]) {
    const src = readFileSync(`lib/digital-authoring/pdf/${f}`, "utf8");
    for (const interdit of ["Date(", "Math.random", "randomUUID", "performance.now"]) assert.ok(!src.includes(interdit), `${f} : ${interdit}`);
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    assert.ok(imports.every((i) => i.startsWith("./") || i === "node:crypto"), `${f} : ${imports.join(", ")}`);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /pdf/i.test(d)), "aucune bibliothèque PDF");
});
