import type { Lang } from "@/lib/i18n";
const fr = {
  title: "Offres associées", intro: "Choisissez jusqu’à trois offres de votre boutique. Chaque achat reste un choix explicite.",
  upsell: "Version supérieure", cross_sell: "Produit complémentaire", downsell: "Alternative économique",
  none: "Aucune", save: "Enregistrer les offres", saving: "Enregistrement…", saved: "Offres enregistrées.",
  rules: "Version supérieure et alternative : même type de produit, prix supérieur ou inférieur. Les offres indisponibles ou en vente flash sont masquées.",
  invalid: "Choisissez des produits publiés de votre boutique, sans doublon, avec des prix cohérents.",
  unavailable: "Les offres associées sont momentanément indisponibles.", sales: "Ventes confirmées", salesHint: "Achats confirmés depuis le lien de cette offre ; les remboursements sont exclus.",
  buyerTitle: "À découvrir dans cette boutique", view: "Voir cette offre", cheaper: "Voir une option plus accessible",
  separate: "Ce complément se commande séparément.", replacement: "Découvrez cette offre avant de choisir celle qui vous convient.",
  after: "Pour compléter votre achat", from: "À partir de", empty: "Publiez une autre offre pour pouvoir l’associer.",
};
export type OfferCopy = typeof fr;
const ht: OfferCopy = {
  title: "Òf ki mache ansanm", intro: "Chwazi jiska twa òf nan boutik ou. Achtè a dwe chwazi chak acha.",
  upsell: "Vèsyon ki pi konplè", cross_sell: "Pwodui konplemantè", downsell: "Opsyon ki pi bon mache",
  none: "Okenn", save: "Anrejistre òf yo", saving: "Ap anrejistre…", saved: "Òf yo anrejistre.",
  rules: "Vèsyon ki pi konplè ak opsyon pi bon mache a dwe menm kalite pwodui, ak yon pri pi wo oswa pi ba. Òf ki pa disponib oswa ki nan vant flash yo pa parèt.",
  invalid: "Chwazi pwodui ki pibliye nan boutik ou, san doublon, ak pri ki koresponn.",
  unavailable: "Òf ki mache ansanm yo pa disponib kounye a.", sales: "Vant konfime", salesHint: "Acha konfime ki soti nan lyen òf la ; acha ranbouse yo pa konte.",
  buyerTitle: "Dekouvri lòt òf nan boutik sa a", view: "Gade òf sa a", cheaper: "Gade yon opsyon pi bon mache",
  separate: "Ou achte pwodui konplemantè sa a apa.", replacement: "Gade òf sa a anvan ou chwazi sa ki bon pou ou.",
  after: "Pou konplete acha ou", from: "Apati", empty: "Pibliye yon lòt òf pou ou ka asosye li.",
};
const en: OfferCopy = {
  title: "Related offers", intro: "Choose up to three offers from your shop. Every purchase remains an explicit choice.",
  upsell: "Upgraded version", cross_sell: "Complementary product", downsell: "Lower-cost alternative",
  none: "None", save: "Save offers", saving: "Saving…", saved: "Offers saved.",
  rules: "Upgrades and alternatives must be the same product type, at a higher or lower price. Unavailable offers and flash sales are hidden.",
  invalid: "Choose published products from your shop, without duplicates and with matching prices.",
  unavailable: "Related offers are temporarily unavailable.", sales: "Confirmed sales", salesHint: "Confirmed purchases from this offer link; refunds are excluded.",
  buyerTitle: "Discover more from this shop", view: "View this offer", cheaper: "See a more affordable option",
  separate: "This complementary product is purchased separately.", replacement: "Explore this offer before choosing the one that suits you.",
  after: "Complement your purchase", from: "From", empty: "Publish another offer to link it here.",
};
const es: OfferCopy = {
  title: "Ofertas relacionadas", intro: "Elige hasta tres ofertas de tu tienda. Cada compra requiere una elección explícita.",
  upsell: "Versión superior", cross_sell: "Producto complementario", downsell: "Alternativa económica",
  none: "Ninguna", save: "Guardar ofertas", saving: "Guardando…", saved: "Ofertas guardadas.",
  rules: "Las versiones superiores y alternativas deben ser del mismo tipo, con un precio mayor o menor. Las ofertas no disponibles o en venta flash se ocultan.",
  invalid: "Elige productos publicados de tu tienda, sin duplicados y con precios coherentes.",
  unavailable: "Las ofertas relacionadas no están disponibles por el momento.", sales: "Ventas confirmadas", salesHint: "Compras confirmadas desde el enlace de esta oferta; se excluyen los reembolsos.",
  buyerTitle: "Descubre más en esta tienda", view: "Ver esta oferta", cheaper: "Ver una opción más económica",
  separate: "Este complemento se compra por separado.", replacement: "Descubre esta oferta antes de elegir la que te conviene.",
  after: "Completa tu compra", from: "Desde", empty: "Publica otra oferta para poder asociarla.",
};
export function offerCopy(lang: Lang): OfferCopy { return ({ fr, ht, en, es })[lang]; }
