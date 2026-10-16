import type { Contenu, LangueContenu } from "./schema";

/**
 * Modèles de guide du Studio de création éditoriale (docs/70, tâche 2.6 ;
 * idée validée par le porteur le 2026-10-15, inspirée de CreateurSuite ;
 * refaits en modèles de savoir-faire le 2026-10-16, tâche T.1).
 *
 * Un modèle est un PLAN prêt à remplir : des titres de section et le résultat
 * attendu de chacune, dans la langue du guide. Aucun corps de texte, aucune
 * IA, aucune promesse : le créateur écrit, le modèle lui évite la page vide.
 * Même principe que les modèles de prestation (`lib/service-starters.ts`).
 *
 * Les identifiants de section sont fabriqués À LA CRÉATION par l'appelant
 * (serveur) : deux projets nés du même modèle n'ont jamais les mêmes.
 */

export const IDS_MODELES = ["activite", "metier", "methode", "kit"] as const;
export type IdModele = (typeof IDS_MODELES)[number];

type Plan = { titre: string; resultat: string }[];

// Des produits de SAVOIR-FAIRE, comme ceux que vendent formateurs, coachs,
// couturières ou coiffeurs (décision du 2026-10-16, inspirée de Tunafrik) :
// rien qui ressemble à un produit physique.
const MODELES: Record<IdModele, Record<LangueContenu, Plan>> = {
  activite: {
    ht: [
      { titre: "Poukisa aktivite sa a ka mache", resultat: "Lektè a konnen ki bezwen aktivite a reponn ak ki moun ki ka achte." },
      { titre: "Sa pou w genyen anvan ou kòmanse", resultat: "Lektè a gen lis kòb, zouti ak papye li bezwen." },
      { titre: "Premye etap yo, semèn pa semèn", resultat: "Lektè a konnen sa pou l fè chak semèn." },
      { titre: "Jwenn premye kliyan yo", resultat: "Lektè a gen yon plan pou l fè premye vant li." },
      { titre: "Swiv kòb ou", resultat: "Lektè a konnen konbyen li depanse ak konbyen li fè." },
      { titre: "Erè pou evite", resultat: "Lektè a pa pèdi kòb sou erè moun deja konnen." },
      { titre: "Plan aksyon 30 jou", resultat: "Lektè a fini ak yon plan li ka kòmanse demen." },
    ],
    fr: [
      { titre: "Pourquoi cette activité peut marcher", resultat: "Le lecteur sait à quel besoin répond l’activité et qui peut acheter." },
      { titre: "Ce qu’il faut avant de commencer", resultat: "Le lecteur a la liste de l’argent, des outils et des papiers nécessaires." },
      { titre: "Les premières étapes, semaine par semaine", resultat: "Le lecteur sait quoi faire chaque semaine." },
      { titre: "Trouver ses premiers clients", resultat: "Le lecteur a un plan pour faire sa première vente." },
      { titre: "Suivre son argent", resultat: "Le lecteur sait combien il dépense et combien il gagne." },
      { titre: "Erreurs à éviter", resultat: "Le lecteur ne perd pas d’argent sur des erreurs connues." },
      { titre: "Plan d’action sur 30 jours", resultat: "Le lecteur repart avec un plan qu’il peut commencer demain." },
    ],
  },
  metier: {
    ht: [
      { titre: "Sa w pral aprann", resultat: "Lektè a konnen ki rezilta li pral rive fè." },
      { titre: "Zouti ak materyèl", resultat: "Lektè a gen tout sa li bezwen anvan li kòmanse." },
      { titre: "Metòd la, etap pa etap", resultat: "Lektè a ka swiv chak etap san li pa pèdi." },
      { titre: "Erè pou evite", resultat: "Lektè a konnen erè ki pi souvan yo ak kijan pou l evite yo." },
      { titre: "Egzèsis pratik", resultat: "Lektè a pratike sou yon ka reyèl." },
      { titre: "Viv ak metye a", resultat: "Lektè a konnen kijan pou l jwenn premye kliyan l ak konbyen pou l mande." },
    ],
    fr: [
      { titre: "Ce que vous allez apprendre", resultat: "Le lecteur connaît le résultat qu’il atteindra." },
      { titre: "Outils et matériel", resultat: "Le lecteur a tout ce qu’il faut avant de commencer." },
      { titre: "La méthode, pas à pas", resultat: "Le lecteur suit chaque étape sans se perdre." },
      { titre: "Erreurs à éviter", resultat: "Le lecteur connaît les erreurs les plus courantes et comment les éviter." },
      { titre: "Exercice pratique", resultat: "Le lecteur s’entraîne sur un cas réel." },
      { titre: "Vivre de ce métier", resultat: "Le lecteur sait trouver ses premiers clients et fixer ses prix." },
    ],
  },
  methode: {
    ht: [
      { titre: "Pwoblèm nan, klè", resultat: "Lektè a rekonèt pwoblèm pa l nan sa w ap dekri a." },
      { titre: "Metòd la an kout", resultat: "Lektè a konprann metòd la an kèk liy." },
      { titre: "Etap yo, youn apre lòt", resultat: "Lektè a aplike chak etap nan bon lòd." },
      { titre: "Yon egzanp toutbon", resultat: "Lektè a wè metòd la ap mache sou yon ka reyèl." },
      { titre: "Egzèsis", resultat: "Lektè a eseye metòd la poukont li." },
      { titre: "Lè sa pa mache", resultat: "Lektè a konnen sa pou l fè si li bloke." },
      { titre: "Plan aksyon", resultat: "Lektè a konnen sa pou l fè depi jodi a." },
    ],
    fr: [
      { titre: "Le problème, clairement", resultat: "Le lecteur reconnaît son problème dans votre description." },
      { titre: "La méthode en bref", resultat: "Le lecteur comprend la méthode en quelques lignes." },
      { titre: "Les étapes, une à une", resultat: "Le lecteur applique chaque étape dans le bon ordre." },
      { titre: "Un exemple réel", resultat: "Le lecteur voit la méthode fonctionner sur un cas concret." },
      { titre: "Exercices", resultat: "Le lecteur essaie la méthode seul." },
      { titre: "Quand ça bloque", resultat: "Le lecteur sait quoi faire s’il est bloqué." },
      { titre: "Plan d’action", resultat: "Le lecteur sait quoi faire dès aujourd’hui." },
    ],
  },
  kit: {
    ht: [
      { titre: "Kijan pou w sèvi ak kit la", resultat: "Lektè a konnen nan ki lòd pou l itilize chak pyès." },
      { titre: "Lis kontwòl yo", resultat: "Lektè a koche chak pwen youn apre lòt." },
      { titre: "Modèl pou ranpli", resultat: "Lektè a gen paj li ka kopye epi ranpli." },
      { titre: "Yon egzanp ki deja ranpli", resultat: "Lektè a wè kijan yon modèl ranpli sanble." },
      { titre: "Kesyon moun poze souvan", resultat: "Lektè a jwenn repons pou kesyon li genyen yo." },
    ],
    fr: [
      { titre: "Comment utiliser ce kit", resultat: "Le lecteur sait dans quel ordre utiliser chaque pièce." },
      { titre: "Les listes de contrôle", resultat: "Le lecteur coche chaque point un à un." },
      { titre: "Les modèles à remplir", resultat: "Le lecteur a des pages à recopier et à remplir." },
      { titre: "Un exemple déjà rempli", resultat: "Le lecteur voit à quoi ressemble un modèle rempli." },
      { titre: "Questions fréquentes", resultat: "Le lecteur trouve les réponses à ses questions." },
    ],
  },
};

export function estIdModele(valeur: unknown): valeur is IdModele {
  return typeof valeur === "string" && (IDS_MODELES as readonly string[]).includes(valeur);
}

/** Le plan du modèle, dans la langue du guide, avec des identifiants neufs. */
export function contenuDepuisModele(id: IdModele, langue: LangueContenu, nouvelId: () => string): Contenu {
  return {
    objectif: "",
    sections: MODELES[id][langue].map((s) => ({ id: nouvelId(), titre: s.titre, resultat: s.resultat, corps: "" })),
  };
}
