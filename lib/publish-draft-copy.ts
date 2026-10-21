import type { Lang } from "@/lib/i18n";

const fr = {
  saved: "Brouillon conservé dans cet onglet pendant 30 minutes.",
  unavailable: "Le stockage de cet onglet est indisponible. Gardez cette page ouverte pour conserver votre saisie.",
  discard: "Effacer le brouillon",
  confirmDiscard: "Effacer les champs de ce brouillon ?",
  uncertain: "La création doit être vérifiée. Consultez vos produits avant de recommencer.",
  checkProducts: "Vérifier mes produits",
  resume: "J’ai vérifié mes produits : reprendre la saisie",
};

export type PublishDraftCopy = typeof fr;

const ht: PublishDraftCopy = {
  saved: "Bouyon an konsève nan onglet sa a pandan 30 minit.",
  unavailable: "Espas depo onglet sa a pa disponib. Kenbe paj sa a ouvè pou konsève sa ou antre yo.",
  discard: "Efase bouyon an",
  confirmDiscard: "Efase chan bouyon sa a yo?",
  uncertain: "Verifye si pwodui a te kreye. Gade pwodui ou yo anvan ou rekòmanse.",
  checkProducts: "Verifye pwodui mwen yo",
  resume: "Mwen verifye pwodui mwen yo: kontinye ranpli fòm nan",
};

const en: PublishDraftCopy = {
  saved: "Draft kept in this tab for 30 minutes.",
  unavailable: "Storage for this tab is unavailable. Keep this page open to preserve what you have entered.",
  discard: "Clear the draft",
  confirmDiscard: "Clear the fields in this draft?",
  uncertain: "The creation needs to be verified. Check your products before starting again.",
  checkProducts: "Check my products",
  resume: "I have checked my products: resume editing",
};

const es: PublishDraftCopy = {
  saved: "Borrador conservado en esta pestaña durante 30 minutos.",
  unavailable: "El almacenamiento de esta pestaña no está disponible. Mantén esta página abierta para conservar lo que has introducido.",
  discard: "Borrar el borrador",
  confirmDiscard: "¿Borrar los campos de este borrador?",
  uncertain: "Hay que verificar la creación. Consulta tus productos antes de volver a empezar.",
  checkProducts: "Verificar mis productos",
  resume: "He verificado mis productos: continuar la edición",
};

export function publishDraftCopy(lang: Lang): PublishDraftCopy {
  return ({ fr, ht, en, es })[lang];
}
