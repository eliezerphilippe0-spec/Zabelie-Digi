import type { Lang } from "@/lib/i18n";
import type { MomentJournee } from "@/lib/moment-journee";

/**
 * Textes de l'accueil du Studio façon Chariow (tasks/plan.md, phase T2).
 * Module à part de `copy.ts`, que la phase 4 (PDF) modifie sur sa branche :
 * deux chantiers, deux fichiers, pas de conflit.
 *
 * Le kreyòl dit « Bonswa » dès midi : c'est l'usage en Haïti, et c'est pour
 * cela que la salutation a trois moments et non deux.
 */
const fr = {
  salut: { matin: "Bonjour, {nom}", apresMidi: "Bonjour, {nom}", soir: "Bonsoir, {nom}" } as Record<MomentJournee, string>,
  salutSansNom: { matin: "Bonjour", apresMidi: "Bonjour", soir: "Bonsoir" } as Record<MomentJournee, string>,
  actionPromo: "Créer un code promo",
  voirBoutique: "Voir ma boutique",
  chiffresTitre: "Vos ventes de produits digitaux",
  masquer: "Masquer les montants",
  montantMasque: "montant masqué",
  carteRevenus: "Revenus nets",
  carteRevenusNote: "Commission déduite, depuis la première vente",
  carte7j: "7 derniers jours",
  carte7jNote: "Revenus nets des sept derniers jours",
  carteClients: "Clients",
  carteClientsNote: "{n} ventes au total",
  carteClientsNote1: "1 vente au total",
  carteClientsNote0: "Aucune vente pour l'instant",
  incomplet: "Total partiel : seules les {n} premières ventes ont été lues.",
  indisponible: "Vos chiffres n'ont pas pu être lus. Rechargez la page dans un instant.",
  meilleursTitre: "Produits les plus vendus",
  meilleursSous: "Classés par nombre de ventes",
  voirTout: "Voir toutes les ventes",
  ventesN: "{n} ventes",
  ventes1: "1 vente",
  aucuneVente: "Pas encore de vente. Vos produits digitaux apparaîtront ici dès la première.",
  navVentes: "Mes ventes",
  navRevenus: "Revenus",
  navPromo: "Codes promo",
  navAide: "Centre d'aide",
};

export type CopieVentes = typeof fr;

const ht: CopieVentes = {
  salut: { matin: "Bonjou, {nom}", apresMidi: "Bonswa, {nom}", soir: "Bonswa, {nom}" },
  salutSansNom: { matin: "Bonjou", apresMidi: "Bonswa", soir: "Bonswa" },
  actionPromo: "Kreye yon kòd pwomo",
  voirBoutique: "Gade boutik mwen",
  chiffresTitre: "Vant pwodwi dijital ou yo",
  masquer: "Kache montan yo",
  montantMasque: "montan kache",
  carteRevenus: "Sa ou rantre nèt",
  carteRevenusNote: "Komisyon an retire, depi premye vant lan",
  carte7j: "7 dènye jou yo",
  carte7jNote: "Sa ou rantre nèt nan sèt dènye jou yo",
  carteClients: "Kliyan",
  carteClientsNote: "{n} vant an tout",
  carteClientsNote1: "1 vant an tout",
  carteClientsNote0: "Poko gen vant",
  incomplet: "Total sa a pa konplè : se sèlman {n} premye vant yo nou li.",
  indisponible: "Nou pa t ka li chif ou yo. Rechaje paj la nan yon ti moman.",
  meilleursTitre: "Pwodwi ki pi vann yo",
  meilleursSous: "Klase dapre kantite vant",
  voirTout: "Gade tout vant yo",
  ventesN: "{n} vant",
  ventes1: "1 vant",
  aucuneVente: "Poko gen vant. Pwodwi dijital ou yo ap parèt la depi premye vant lan.",
  navVentes: "Vant mwen yo",
  navRevenus: "Sa ou rantre",
  navPromo: "Kòd pwomo",
  navAide: "Sant èd",
};

const en: CopieVentes = {
  salut: { matin: "Good morning, {nom}", apresMidi: "Good afternoon, {nom}", soir: "Good evening, {nom}" },
  salutSansNom: { matin: "Good morning", apresMidi: "Good afternoon", soir: "Good evening" },
  actionPromo: "Create a promo code",
  voirBoutique: "View my shop",
  chiffresTitre: "Your digital product sales",
  masquer: "Hide amounts",
  montantMasque: "amount hidden",
  carteRevenus: "Net earnings",
  carteRevenusNote: "After commission, since your first sale",
  carte7j: "Last 7 days",
  carte7jNote: "Net earnings over the last seven days",
  carteClients: "Customers",
  carteClientsNote: "{n} sales in total",
  carteClientsNote1: "1 sale in total",
  carteClientsNote0: "No sales yet",
  incomplet: "Partial total: only the first {n} sales were read.",
  indisponible: "Your figures could not be loaded. Reload the page in a moment.",
  meilleursTitre: "Best-selling products",
  meilleursSous: "Ranked by number of sales",
  voirTout: "See all sales",
  ventesN: "{n} sales",
  ventes1: "1 sale",
  aucuneVente: "No sales yet. Your digital products will show up here after the first one.",
  navVentes: "My sales",
  navRevenus: "Earnings",
  navPromo: "Promo codes",
  navAide: "Help center",
};

const es: CopieVentes = {
  salut: { matin: "Buenos días, {nom}", apresMidi: "Buenas tardes, {nom}", soir: "Buenas noches, {nom}" },
  salutSansNom: { matin: "Buenos días", apresMidi: "Buenas tardes", soir: "Buenas noches" },
  actionPromo: "Crear un código promocional",
  voirBoutique: "Ver mi tienda",
  chiffresTitre: "Tus ventas de productos digitales",
  masquer: "Ocultar importes",
  montantMasque: "importe oculto",
  carteRevenus: "Ingresos netos",
  carteRevenusNote: "Comisión descontada, desde la primera venta",
  carte7j: "Últimos 7 días",
  carte7jNote: "Ingresos netos de los últimos siete días",
  carteClients: "Clientes",
  carteClientsNote: "{n} ventas en total",
  carteClientsNote1: "1 venta en total",
  carteClientsNote0: "Todavía no hay ventas",
  incomplet: "Total parcial: solo se leyeron las primeras {n} ventas.",
  indisponible: "No se pudieron cargar tus cifras. Recarga la página en un momento.",
  meilleursTitre: "Productos más vendidos",
  meilleursSous: "Ordenados por número de ventas",
  voirTout: "Ver todas las ventas",
  ventesN: "{n} ventas",
  ventes1: "1 venta",
  aucuneVente: "Todavía no hay ventas. Tus productos digitales aparecerán aquí desde la primera.",
  navVentes: "Mis ventas",
  navRevenus: "Ingresos",
  navPromo: "Códigos promocionales",
  navAide: "Centro de ayuda",
};

export function copieVentes(lang: Lang): CopieVentes {
  return lang === "ht" ? ht : lang === "en" ? en : lang === "es" ? es : fr;
}
