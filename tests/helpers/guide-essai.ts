import type { GuidePourPdf } from "../../lib/digital-authoring/pdf/guide-pdf";

/**
 * Le guide d'ESSAI du moteur PDF (tâche 4.1) : une trentaine de pages en
 * kreyòl, avec ce qui casse d'habitude une mise en page — longs paragraphes,
 * listes à puces et numérotées, un lien très long, un mot sans espace plus
 * large que la page, des sauts de ligne voulus, des guillemets, des tirets,
 * des points de suspension et une espace insécable étroite (convertie).
 * Texte d'essai, écrit pour l'épreuve : il ne sort jamais de la suite de tests.
 */

const NL = String.fromCharCode(10);
const FINE = String.fromCodePoint(0x202f);
const LONG_TIRET = String.fromCodePoint(0x2014);
const POINTS = String.fromCodePoint(0x2026);
const APOS = String.fromCodePoint(0x2019);
const G_OUV = String.fromCodePoint(0x00ab);
const G_FERM = String.fromCodePoint(0x00bb);

const PARAGRAPHES = [
  "Anvan ou kòmanse vann sou entènèt, chita pran tan pou w ekri sou yon fèy papye kisa ou vle vann, pou ki moun, ak konbyen kòb ou bezwen pou premye mwa a. Pifò moun ki echwe se paske yo te kòmanse san yo pa t konnen ki pwoblèm kliyan yo genyen. Ou menm, w ap pran yon lòt chemen.",
  "Yon boutik sou entènèt pa mande ou gen yon gwo depo. Ou ka kòmanse ak sa ou genyen lakay ou, ak yon telefòn, ak yon kont pou resevwa lajan. Sa ki pi enpòtan se pou moun yo fè ou konfyans : bon foto, bon deskripsyon, epi repons rapid lè yo poze w kesyon.",
  "Chak semèn, chwazi yon sèl bagay pou amelyore. Yon semèn se foto yo, yon lòt semèn se pri yo, yon lòt ankò se fason ou reponn kliyan yo. Si ou eseye chanje tout bagay anmenm tan, ou p ap konnen kisa ki te mache ak kisa ki pa t mache.",
  "Kenbe yon ti kaye kote ou ekri chak vant : dat la, sa ou vann, pri a, ak kijan kliyan an te jwenn ou. Apre yon mwa, ou pral wè klè ki pwodui ki vann plis, ki jou nan semèn nan ki pi bon, ak ki rezo sosyal ki voye plis moun ba ou.",
  "Pa bliye kalkile tout depans ou : transpò, done entènèt, anbalaj, ak tan ou pase ap reponn mesaj. Yon pri ki sanble bon sou papye ka fè ou pèdi kòb si ou pa konte ti depans sa yo. Pi bon pri a se pa toujou pi ba a : se sa ki kouvri depans ou epi ki kite yon ti benefis.",
  "Lè yon kliyan pa kontan, pa fache. Koute l, mande l kisa ki pa t mache, epi chèche yon solisyon. Yon kliyan ou te byen trete apre yon pwoblèm souvan vin tounen kliyan ki pi fidèl ou, e li pral pale de ou bay zanmi l.",
]

const LISTE = [
  "- Yon telefòn ki ka pran bon foto, menm si li pa nouvo",
  "- Yon kont MonCash oswa NatCash pou resevwa peman",
  "- Yon ti kaye pou swiv vant ak depans",
  "• Yon lis kliyan ou deja konnen nan katye a",
  "* Twa pwodui ou konnen byen e ou ka eksplike san ezite",
].join(NL);

const ETAPES = [
  "1. Ekri sa ou vle vann ak pou ki moun.",
  "2. Pran foto nan bon limyè, sou yon fon klè.",
  "3. Ekri yon deskripsyon ki reponn kesyon kliyan an anvan li poze l.",
  "4. Mete yon pri ki kouvri tout depans ou.",
  "10) Mezire chak semèn, epi chanje yon sèl bagay a la fwa.",
].join(NL);

const SPECIAL =
  `Kliyan yo di souvan : ${G_OUV}${FINE}Mwen pa konnen si m ka fè ou konfyans${FINE}${G_FERM}. Repons ou dwe kout ${LONG_TIRET} epi onèt${POINTS} ` +
  `Gade paj sa a : https://zabelie.com/boutik/mari-jakmel/pwodui/gid-pou-lanse-boutik-sou-entenet-nan-trant-jou-ak-tout-etap-yo ` +
  `pou w wè yon egzanp. Mo sa a twò long pou yon sèl liy : ${"tèt".repeat(20)}fen. ` +
  `Yon fraz ak yon apostwòf : sa a se boutik Mari${APOS}s. Pri a se 1${String.fromCodePoint(0x00a0)}500 goud. ` +
  // Les trois caractères que la syntaxe PDF oblige à échapper : ( ) et l'antislash.
  `(Pa egzanp, dosye a rele C:${String.fromCharCode(92)}Gid${String.fromCharCode(92)}boutik.)`;

function corps(i: number): string {
  const blocs: string[] = [];
  for (let k = 0; k < 17; k++) blocs.push(PARAGRAPHES[(i + k) % PARAGRAPHES.length]);
  blocs.splice(2, 0, LISTE);
  blocs.splice(5, 0, ETAPES);
  if (i === 2) blocs.splice(1, 0, SPECIAL);
  // Des sauts de ligne voulus, à l'intérieur d'un même paragraphe.
  blocs.push(["Rezime :", "Ekri. Mezire. Chanje yon sèl bagay.", "Rekòmanse semèn pwochèn."].join(NL));
  return blocs.join(NL + NL);
}

const TITRES = [
  "Poukisa aktivite sa a ka mache",
  "Sa pou w genyen anvan ou kòmanse",
  "Premye etap yo, semèn pa semèn : yon plan detaye pou chak jou nan premye mwa a, san ou pa bliye anyen",
  "Jwenn premye kliyan yo",
  "Swiv kòb ou",
  "Erè pou evite",
  "Plan aksyon 30 jou",
  "Kesyon moun poze souvan",
];

export const GUIDE_ESSAI: GuidePourPdf = {
  langue: "ht",
  titre: "Lanse boutik ou sou entènèt nan 30 jou",
  objectif: "Yon gid pratik, etap pa etap, pou moun ki vle kòmanse vann sou entènèt ann Ayiti san gwo kapital.",
  auteur: "Mari Jakmèl, Okap",
  sections: TITRES.map((titre, i) => ({
    titre,
    resultat: "Lektè a konnen sa pou l fè, epi li gen yon plan li ka kòmanse demen.",
    corps: corps(i),
  })),
};
