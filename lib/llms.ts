import { BUYING_GUIDES, guideHref } from "@/lib/buying-guides";
import { EDITORIAL_PATHS } from "@/lib/editorial-routing";
import { LANGS, t } from "@/lib/i18n";

/**
 * `/llms.txt` — le résumé du site pour les assistants IA (GEO), au format
 * proposé par llmstxt.org : un titre, une phrase, puis des listes de liens.
 *
 * ⚠️ TOUT CE QUI EST ÉCRIT ICI EST UNE AFFIRMATION PUBLIQUE, reprise telle
 * quelle par des moteurs de réponse. Rien n'y est inventé : chaque phrase
 * reprend ce que le site dit déjà (fiches examinées avant publication, prix en
 * gourdes, remise convenue avec le vendeur, téléchargements dans « Mes
 * achats », moyens de paiement = ceux proposés au paiement). AUCUN moyen de
 * paiement n'est nommé comme disponible : leur ouverture est une décision du
 * porteur (docs/25 §4). Chaque lien est croisé avec une route existante par
 * `tests/llms-txt.test.ts`.
 */
export function llmsTxt(base: string): string {
  const guides = BUYING_GUIDES.map((g) => `- [${t("en", g.title)}](${base}${guideHref("en", g.slug)}): ${t("en", g.intro)}`);
  const NOMS: Record<(typeof EDITORIAL_PATHS)[number], string> = { "/aide": "Help", "/a-propos": "About Zabelie", "/recharges": "Top-ups and payments" };
  const editorial = EDITORIAL_PATHS.map((p) => `- ${NOMS[p]}: ${LANGS.map((l) => `[${l}](${base}/${l}${p})`).join(" · ")}`);
  return [
    "# Zabelie",
    "",
    "> The Haitian marketplace: physical products, digital files and services offered by Haitian sellers, with prices in Haitian gourdes (HTG). The site is available in Haitian Creole, French, English and Spanish.",
    "",
    "Key facts, as stated on the site:",
    "",
    "- Sellers prepare their listings; each listing is reviewed before it is published.",
    "- Physical products: prices in gourdes; the handover is arranged directly with the seller.",
    "- Digital files: after the purchase is confirmed, downloads are available in “My purchases”.",
    "- Payment: only the methods offered during checkout can be used.",
    "- Some items cannot be sold on Zabelie (see the rules below).",
    "",
    "## Buying guides",
    "",
    ...guides,
    `- All guides: ${LANGS.map((l) => `[${l}](${base}${guideHref(l)})`).join(" · ")}`,
    "",
    "## Help and information",
    "",
    ...editorial,
    `- [What cannot be sold](${base}/produits-interdits)`,
    `- [Terms of use](${base}/conditions)`,
    `- [Privacy policy](${base}/confidentialite)`,
    "",
    "## Catalogue",
    "",
    `- [Catalogue](${base}/catalogue)`,
    `- [All categories](${base}/categories)`,
    `- [Sell on Zabelie](${base}/vendre)`,
    "",
    "## Optional",
    "",
    `- [Public API (read-only, no key)](${base}/developpeurs)`,
    `- [OpenAPI contract](${base}/api/v1/openapi.json)`,
    "",
  ].join("\n");
}
