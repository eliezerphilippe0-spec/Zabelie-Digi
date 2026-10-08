import type { Lang } from "./i18n";
import type { OptionCategorie, OptionSousRayon } from "./product-categories";

export type ServiceStarter = {
  id: string;
  title: string;
  description: string;
  includes: string[];
  category: string;
  categoryId: string;
};
type StarterText = { slug: string; id: string; title: string; description: string; includes: string[] };
type ServiceCopy = {
  heading: string; hint: string; confirmReplace: string;
  buyerTitle: string; buyerSteps: string[]; sell: string;
  templates: StarterText[];
};

const copy: Record<Lang, ServiceCopy> = {
  ht: {
    heading: "Kòmanse ak yon modèl sèvis", hint: "Chwazi sèlman yon sèvis ou ka fè. Adapte sa ki ladan l, pri, delè, komin ak zòn ou sèvi anvan ou pibliye.",
    confirmReplace: "Ranplase tit, deskripsyon ak sa ki ladan sèvis la ak modèl sa a? Pri ak delè a ap rete vid.",
    buyerTitle: "Prepare sèvis ou anvan ou peye", sell: "Mwen vle vann yon sèvis",
    buyerSteps: ["Konfime travay la, sa w ap resevwa, delè ak kantite koreksyon ak vandè a nan mesaj Zabelie.", "Pou yon sèvis sou plas, konfime komin, katye ak frè deplasman. Pou dyagnostik, mande pri reparasyon ak pyès separeman.", "Si se pou yon pwòch, konfime moun k ap benefisye a ak vandè a epi jwenn akò li anvan ou pataje kontak li. Ou menm kòm achtè kenbe swivi kòmand lan."],
    templates: [
      { id: "visuals", slug: "grafik-ak-design", title: "10 vizyèl pou komès mwen", description: "Vizyèl pou WhatsApp ak rezo sosyal. Konfime tèks, foto, fòma, lang (kreyòl oswa franse), delè ak kantite koreksyon anvan kòmand lan. Pri a se pou pakè ki dekri a.", includes: ["10 vizyèl dijital", "Fichye pare pou WhatsApp ak rezo sosyal", "Yon koreksyon enkli"] },
      { id: "repair", slug: "reparasyon", title: "Dyagnostik telefòn oswa òdinatè", description: "Dyagnostik sèlman. Presize aparèy, pwoblèm, komin ak kote randevou a. Reparasyon, pyès ak deplasman pa ladan l sof si sa ekri. Bay yon devis apa anvan nenpòt reparasyon; pri kòmand sa a se pou dyagnostik la.", includes: ["Tès aparèy ki dakò a", "Rapò sou pwoblèm yo jwenn", "Devis reparasyon apa, pou kliyan apwouve"] },
      { id: "energy", slug: "reparasyon", title: "Dyagnostik sistèm solè oswa envètè", description: "Dyagnostik sèlman, pa enstalasyon. Presize ekipman, komin, zòn ou sèvi, kondisyon aksè ak frè deplasman anvan kòmand lan. Pyès ak travay pa ladan l. Se sèlman yon teknisyen ki kalifye pou ekipman sa a ki dwe fè entèvansyon an.", includes: ["Evalyasyon ekipman ki dakò a", "Rapò ak rekòmandasyon", "Devis apa pou pyès ak travay"] },
    ],
  },
  fr: {
    heading: "Partir d’un modèle de service", hint: "Choisissez une prestation que vous pouvez réaliser. Adaptez le contenu, le prix, le délai, la commune et la zone desservie avant de publier.",
    confirmReplace: "Remplacer le titre, la description et les prestations incluses par ce modèle ? Le prix et le délai seront vidés.",
    buyerTitle: "Préparer votre service avant de payer", sell: "Proposer un service",
    buyerSteps: ["Confirmez le travail, les livrables, le délai et les révisions avec le vendeur dans la messagerie Zabelie.", "Pour une intervention sur place, confirmez commune, quartier et frais de déplacement. Pour un diagnostic, demandez séparément le devis des travaux et des pièces.", "Pour un proche, convenez du bénéficiaire avec le vendeur et obtenez son accord avant de partager ses coordonnées. Vous restez l’acheteur responsable du suivi de la commande."],
    templates: [
      { id: "visuals", slug: "grafik-ak-design", title: "10 visuels pour mon commerce", description: "Visuels pour WhatsApp et les réseaux sociaux. Confirmer textes, photos, formats, langue (kreyòl ou français), délai et nombre de révisions avant la commande. Le prix correspond au forfait décrit.", includes: ["10 visuels numériques", "Fichiers prêts pour WhatsApp et les réseaux sociaux", "Une révision incluse"] },
      { id: "repair", slug: "reparasyon", title: "Diagnostic téléphone ou ordinateur", description: "Diagnostic uniquement. Préciser l’appareil, la panne, la commune et le lieu du rendez-vous. Réparation, pièces et déplacement exclus sauf mention explicite. Fournir un devis distinct avant toute réparation ; le prix de cette commande couvre le diagnostic.", includes: ["Tests sur l’appareil convenu", "Compte rendu du diagnostic", "Devis de réparation séparé, soumis à accord"] },
      { id: "energy", slug: "reparasyon", title: "Diagnostic solaire ou onduleur", description: "Diagnostic uniquement, sans installation. Préciser équipements, commune, zone desservie, conditions d’accès et frais de déplacement avant commande. Pièces et travaux exclus. Intervention réservée aux techniciens qualifiés pour ces équipements.", includes: ["Évaluation des équipements convenus", "Compte rendu et recommandations", "Devis distinct pour pièces et travaux"] },
    ],
  },
  en: {
    heading: "Start with a service template", hint: "Choose work you can deliver. Adapt the scope, price, deadline, town and service area before publishing.",
    confirmReplace: "Replace the title, description and included work with this template? The price and deadline will be cleared.",
    buyerTitle: "Prepare your service before paying", sell: "Offer a service",
    buyerSteps: ["Agree on the work, deliverables, deadline and revisions with the seller in Zabelie messages.", "For on-site work, confirm the town, neighbourhood and travel fees. For a diagnosis, request a separate quote for repairs and parts.", "For a relative, agree on the beneficiary with the seller and obtain their permission before sharing contact details. You remain the buyer responsible for tracking the order."],
    templates: [
      { id: "visuals", slug: "grafik-ak-design", title: "10 visuals for my business", description: "Visuals for WhatsApp and social media. Agree on text, photos, formats, language (Haitian Creole or French), deadline and revisions before ordering. The price covers the described package.", includes: ["10 digital visuals", "Files ready for WhatsApp and social media", "One revision included"] },
      { id: "repair", slug: "reparasyon", title: "Phone or computer diagnosis", description: "Diagnosis only. Specify the device, fault, town and appointment location. Repairs, parts and travel excluded unless stated. Provide a separate quote before repairs; this order pays for the diagnosis.", includes: ["Tests on the agreed device", "Diagnostic report", "Separate repair quote for approval"] },
      { id: "energy", slug: "reparasyon", title: "Solar or inverter diagnosis", description: "Diagnosis only, no installation. Specify equipment, town, service area, access conditions and travel fees before ordering. Parts and work excluded. Only technicians qualified for this equipment should carry out the intervention.", includes: ["Assessment of agreed equipment", "Report and recommendations", "Separate quote for parts and work"] },
    ],
  },
  es: {
    heading: "Empezar con una plantilla de servicio", hint: "Elige un trabajo que puedas realizar. Adapta contenido, precio, plazo, municipio y zona atendida antes de publicar.",
    confirmReplace: "¿Reemplazar título, descripción y prestaciones incluidas por esta plantilla? Se borrarán el precio y el plazo.",
    buyerTitle: "Preparar tu servicio antes de pagar", sell: "Ofrecer un servicio",
    buyerSteps: ["Acuerda trabajo, entregables, plazo y revisiones con el vendedor en los mensajes de Zabelie.", "Para servicios presenciales, confirma municipio, barrio y gastos de desplazamiento. Para un diagnóstico, solicita un presupuesto separado para reparaciones y piezas.", "Para un familiar, acuerda el beneficiario con el vendedor y obtén su permiso antes de compartir sus datos. Sigues siendo el comprador responsable del seguimiento del pedido."],
    templates: [
      { id: "visuals", slug: "grafik-ak-design", title: "10 diseños para mi comercio", description: "Diseños para WhatsApp y redes sociales. Confirmar textos, fotos, formatos, idioma (criollo haitiano o francés), plazo y revisiones antes del pedido. El precio cubre el paquete descrito.", includes: ["10 diseños digitales", "Archivos listos para WhatsApp y redes sociales", "Una revisión incluida"] },
      { id: "repair", slug: "reparasyon", title: "Diagnóstico de teléfono u ordenador", description: "Solo diagnóstico. Precisar dispositivo, avería, municipio y lugar de cita. Reparación, piezas y desplazamiento excluidos salvo indicación expresa. Dar un presupuesto separado antes de reparar; este pedido cubre el diagnóstico.", includes: ["Pruebas del dispositivo acordado", "Informe del diagnóstico", "Presupuesto de reparación separado para aprobar"] },
      { id: "energy", slug: "reparasyon", title: "Diagnóstico solar o de inversor", description: "Solo diagnóstico, sin instalación. Precisar equipos, municipio, zona atendida, acceso y gastos de desplazamiento antes del pedido. Piezas y trabajos excluidos. Intervención reservada a técnicos cualificados para estos equipos.", includes: ["Evaluación de equipos acordados", "Informe y recomendaciones", "Presupuesto separado para piezas y trabajos"] },
    ],
  },
};

export function serviceStarterCopy(lang: Lang): ServiceCopy { return copy[lang]; }

/** Models never introduce their own categories or publish products. */
export function availableServiceStarters(lang: Lang, categories: OptionCategorie[], sousRayons: OptionSousRayon[]): ServiceStarter[] {
  return copy[lang].templates.flatMap(({ slug, ...template }) => {
    const category = sousRayons.find((s) => s.slug === slug && s.level === 3 && categories.some((c) => c.value === s.departement));
    return category ? [{ ...template, category: category.departement, categoryId: category.id }] : [];
  });
}

