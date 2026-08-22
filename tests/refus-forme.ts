/**
 * « RENDRE UN REFUS AVEC LE STATUT N » — la FORME, pas le littéral.
 *
 * ⚠️ NÉ D'UNE RÉGRESSION D'INSTRUMENT, le 2026-08-22, et c'est la troisième
 * fois que ce dépôt paie la même erreur.
 *
 * La traduction serveur des messages d'API a remplacé, dans seize routes :
 *
 *     return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
 *     return erreurTraduite("api.access.denied", 403);
 *
 * **Le refus n'a pas bougé d'une ligne.** Même condition, même statut, même
 * effet pour l'appelant. Cinq tests ont pourtant rougi — parce qu'ils
 * cherchaient la sous-chaîne `status: 403`, c'est-à-dire le TEXTE PRODUIT et
 * non ce qui le COMMANDE. C'est exactement le piège que `CLAUDE.md` décrit, et
 * il s'est présenté ici sous sa forme la plus trompeuse : un rouge qui ressemble
 * à une régression alors que rien n'a régressé.
 *
 * Le symétrique est bien pire, et c'est lui qui justifie ce fichier : un garde
 * rendu INATTEIGNABLE (`if (false)`) aurait laissé `status: 403` dans le
 * fichier, et ces mêmes tests seraient restés VERTS.
 *
 * D'où la règle appliquée ici : **le fragment ne s'emploie JAMAIS seul.** Il se
 * place à droite d'une condition — la garde de rôle, le `!user`, l'échec de
 * trace — et l'intervalle qui les sépare porte alors une liaison réelle :
 *
 *     new RegExp(`me\\.role !== "admin"[\\s\\S]{0,160}${refus(403)}`)
 *
 * Ce que ce fragment ne prétend PAS être : une preuve que le refus est atteint.
 * Il dit « cette forme de refus, avec ce statut, suit cette condition ». La
 * preuve qu'il mord se fait par mutation, et elle est écrite dans
 * `tests/refus-forme.test.ts` — cas connu-positif ET cas connu-négatif, dans
 * les deux formes.
 */

/**
 * Fragment de motif reconnaissant un refus HTTP de statut `status`, sous les
 * deux formes en usage dans le dépôt :
 *
 *   - `NextResponse.json({ error: … }, { status: 403 })` — routes non encore
 *     converties, et routes dont l'erreur n'est pas un message d'interface ;
 *   - `erreurTraduite("api.…", 403)` / `erreurAvecLangue(lang, "api.…", 403)`
 *     — routes traduites (`lib/api-erreur.ts`).
 *
 * ⚠️ Le statut est lié à sa POSITION d'argument (`, 403)` ou `, 403,`), jamais
 * cherché librement : sans cela, `erreurTraduite("api.x", 400)` situé à côté
 * d'un `slice(0, 403)` aurait suffi à faire passer le motif.
 *
 * ⚠️ `\b` après le nombre : sans lui, `refus(40)` matcherait `status: 403`.
 */
export function refus(status: number): string {
  const n = String(status);
  return (
    "(?:" +
    `status:\\s*${n}\\b` +
    "|" +
    `erreur(?:Traduite|AvecLangue)\\([^()]{0,120},\\s*${n}\\s*[,)]` +
    ")"
  );
}

/** Même chose, prête à l'emploi quand aucune condition ne précède. */
export function refusRe(status: number): RegExp {
  // Pas de drapeau `g` : ce motif sert de PRÉDICAT, et un regex `g` porte un
  // `lastIndex` qui le fait mentir un appel sur deux (`CLAUDE.md`).
  return new RegExp(refus(status));
}
