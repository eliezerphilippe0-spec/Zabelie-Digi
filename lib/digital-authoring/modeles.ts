import type { Contenu, LangueContenu } from "./schema";

/**
 * Modèles de guide du Studio de création éditoriale (docs/70, tâche 2.6 ;
 * idée validée par le porteur le 2026-10-15, inspirée de CreateurSuite).
 *
 * Un modèle est un PLAN prêt à remplir : des titres de section et le résultat
 * attendu de chacune, dans la langue du guide. Aucun corps de texte, aucune
 * IA, aucune promesse : le créateur écrit, le modèle lui évite la page vide.
 * Même principe que les modèles de prestation (`lib/service-starters.ts`).
 *
 * Les identifiants de section sont fabriqués À LA CRÉATION par l'appelant
 * (serveur) : deux projets nés du même modèle n'ont jamais les mêmes.
 */

export const IDS_MODELES = ["recette", "metier", "demarche", "liste"] as const;
export type IdModele = (typeof IDS_MODELES)[number];

type Plan = { titre: string; resultat: string }[];

const MODELES: Record<IdModele, Record<LangueContenu, Plan>> = {
  recette: {
    ht: [
      { titre: "Engredyan ak materyèl", resultat: "Lektè a konnen sa pou l achte ak sa pou l pare." },
      { titre: "Preparasyon, etap pa etap", resultat: "Lektè a ka fè resèt la poukont li." },
      { titre: "Konsève ak sèvi", resultat: "Lektè a konnen konbyen tan manje a kenbe ak kijan pou l sèvi l." },
      { titre: "Varyant ak konsèy", resultat: "Lektè a ka adapte resèt la ak sa li jwenn." },
    ],
    fr: [
      { titre: "Ingrédients et matériel", resultat: "Le lecteur sait quoi acheter et quoi préparer." },
      { titre: "Préparation, pas à pas", resultat: "Le lecteur réalise la recette seul." },
      { titre: "Conservation et service", resultat: "Le lecteur sait combien de temps le plat se garde et comment le servir." },
      { titre: "Variantes et astuces", resultat: "Le lecteur adapte la recette à ce qu’il trouve." },
    ],
  },
  metier: {
    ht: [
      { titre: "Sa w pral aprann", resultat: "Lektè a konnen ki rezilta li pral rive fè." },
      { titre: "Zouti ak materyèl", resultat: "Lektè a gen tout sa li bezwen anvan li kòmanse." },
      { titre: "Metòd la, etap pa etap", resultat: "Lektè a ka swiv chak etap san li pa pèdi." },
      { titre: "Erè pou evite", resultat: "Lektè a konnen erè ki pi souvan yo ak kijan pou l evite yo." },
      { titre: "Egzèsis pratik", resultat: "Lektè a pratike sou yon ka reyèl." },
      { titre: "Pwochen etap", resultat: "Lektè a konnen kijan pou l kontinye avanse." },
    ],
    fr: [
      { titre: "Ce que vous allez apprendre", resultat: "Le lecteur connaît le résultat qu’il atteindra." },
      { titre: "Outils et matériel", resultat: "Le lecteur a tout ce qu’il faut avant de commencer." },
      { titre: "La méthode, pas à pas", resultat: "Le lecteur suit chaque étape sans se perdre." },
      { titre: "Erreurs à éviter", resultat: "Le lecteur connaît les erreurs les plus courantes et comment les éviter." },
      { titre: "Exercice pratique", resultat: "Le lecteur s’entraîne sur un cas réel." },
      { titre: "Pour aller plus loin", resultat: "Le lecteur sait comment continuer à progresser." },
    ],
  },
  demarche: {
    ht: [
      { titre: "Pou ki moun gid sa a ye", resultat: "Lektè a konnen si gid la fèt pou li." },
      { titre: "Sa pou w prepare", resultat: "Lektè a rasanble dokiman ak enfòmasyon li bezwen." },
      { titre: "Etap yo, youn apre lòt", resultat: "Lektè a fè demach la nan bon lòd." },
      { titre: "Pyèj pou evite", resultat: "Lektè a pa pèdi tan ni lajan sou erè moun deja konnen." },
      { titre: "Lis kontwòl final", resultat: "Lektè a verifye li pa bliye anyen." },
    ],
    fr: [
      { titre: "À qui s’adresse ce guide", resultat: "Le lecteur sait si le guide est fait pour lui." },
      { titre: "Ce qu’il faut préparer", resultat: "Le lecteur réunit les documents et informations nécessaires." },
      { titre: "Les étapes, une à une", resultat: "Le lecteur suit la démarche dans le bon ordre." },
      { titre: "Pièges à éviter", resultat: "Le lecteur ne perd ni temps ni argent sur des erreurs connues." },
      { titre: "Liste de contrôle finale", resultat: "Le lecteur vérifie qu’il n’a rien oublié." },
    ],
  },
  liste: {
    ht: [
      { titre: "Anvan ou kòmanse", resultat: "Lektè a konnen nan ki kondisyon pou l sèvi ak lis la." },
      { titre: "Lis kontwòl la", resultat: "Lektè a koche chak pwen youn apre lòt." },
      { titre: "Kijan pou w konnen ou fini", resultat: "Lektè a rekonèt siy ki montre travay la byen fèt." },
      { titre: "Apre sa", resultat: "Lektè a konnen sa pou l fè apre." },
    ],
    fr: [
      { titre: "Avant de commencer", resultat: "Le lecteur connaît les conditions d’utilisation de la liste." },
      { titre: "La liste de contrôle", resultat: "Le lecteur coche chaque point un à un." },
      { titre: "Savoir que c’est terminé", resultat: "Le lecteur reconnaît les signes d’un travail bien fait." },
      { titre: "Et ensuite", resultat: "Le lecteur sait quoi faire après." },
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
