import { t, type Lang } from "../i18n";

/**
 * Essayage virtuel — les libellés du bouton et de la feuille, traduits côté
 * serveur (un composant client reçoit ses libellés en props :
 * `tests/i18n-client-discipline.test.ts`).
 */
export function libellesEssayage(lang: Lang, titre: string) {
  return {
    bouton: t(lang, "essayage.bouton"),
    titre: t(lang, "essayage.titre"),
    fermer: t(lang, "essayage.fermer"),
    consentementTitre: t(lang, "essayage.consentement.titre"),
    consentementPoints: [t(lang, "essayage.consentement.moi"), t(lang, "essayage.consentement.age"), t(lang, "essayage.consentement.prestataire")],
    accepter: t(lang, "essayage.consentement.accepter"),
    confidentialite: t(lang, "essayage.consentement.confidentialite"),
    conseils: t(lang, "essayage.conseils"),
    prendre: t(lang, "essayage.photo.prendre"),
    choisir: t(lang, "essayage.photo.choisir"),
    garder: t(lang, "essayage.photo.garder"),
    gardee: t(lang, "essayage.photo.gardee"),
    utiliser: t(lang, "essayage.photo.utiliser"),
    effacer: t(lang, "essayage.photo.effacer"),
    effacee: t(lang, "essayage.photo.effacee"),
    attente: t(lang, "essayage.attente"),
    mention: t(lang, "essayage.mention"),
    resultatAlt: t(lang, "essayage.resultat.alt", { titre }),
    autre: t(lang, "essayage.autre"),
    reessayer: t(lang, "essayage.reessayer"),
    reseau: t(lang, "essayage.reseau"),
    erreur: t(lang, "error.generic"),
  };
}

export type LibellesEssayage = ReturnType<typeof libellesEssayage>;
