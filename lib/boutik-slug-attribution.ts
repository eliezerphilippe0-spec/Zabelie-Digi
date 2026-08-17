import { slugLibre, SLUG_MAX } from "@/lib/boutik-slug";

/**
 * ATTRIBUER UNE ADRESSE — l'entrée du chemin que `0083` a ouvert.
 *
 * ─── LE DÉFAUT QUE CE MODULE RÉPARE ────────────────────────────────────────
 * `0083` a rempli les profils EXISTANTS et s'est arrêtée là. Un vendeur qui
 * s'inscrit demain n'aurait aucune adresse, et repartagerait un UUID sur
 * WhatsApp — tout le chantier annulé pour les seules personnes qui comptent,
 * les prochaines. Une colonne qui ne se remplit qu'une fois, à la migration,
 * est un artefact sans appelant : le dépôt connaît ce motif
 * (`zabelie_purge_search_misses`, quatre mois sans jamais tourner).
 *
 * ─── L'ADRESSE NE CHANGE JAMAIS TOUTE SEULE ────────────────────────────────
 * Elle est attribuée quand elle manque, et plus jamais touchée — même si le
 * vendeur renomme sa boutique. Une adresse qui suit le nom casserait tous les
 * liens déjà envoyés dans des conversations, et ces liens-là ne se
 * rattrapent pas : personne ne revient corriger un message WhatsApp de la
 * semaine dernière. Renommer sa boutique et déménager sont deux gestes
 * différents ; celui-ci ne fait que le premier.
 *
 * ─── BEST-EFFORT, TOUJOURS ─────────────────────────────────────────────────
 * Aucun échec ici ne doit faire échouer l'enregistrement du profil. Quelqu'un
 * qui corrige son nom a fait ce qu'il voulait faire ; lui rendre une erreur
 * parce qu'une adresse n'a pas pu être calculée serait punir la bonne action.
 */

/** Ce que l'attribution a fait — pour le journal, et pour les tests. */
export type ResultatAttribution =
  | "attribue"
  | "deja"
  | "sans_matiere"
  | "colonne_absente"
  | "echec";

/** Le strict minimum qu'on demande au client Supabase, pour rester testable. */
type ClientProfils = {
  from(table: "profiles"): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): PromiseLike<{
          data: { boutik_slug?: string | null } | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
      like(col: string, motif: string): {
        limit(n: number): PromiseLike<{
          data: { boutik_slug: string | null }[] | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
    update(patch: { boutik_slug: string }): {
      eq(col: string, val: string): {
        is(col2: string, val2: null): PromiseLike<{
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
};

/** Combien de collisions on tente avant d'abandonner. */
export const ESSAIS_MAX = 5;

export async function attribuerSlug(
  supabase: ClientProfils,
  userId: string,
  displayName: string
): Promise<ResultatAttribution> {
  // 1. A-t-il déjà une adresse ? Et la colonne existe-t-elle seulement ?
  const actuel = await supabase
    .from("profiles")
    .select("boutik_slug")
    .eq("id", userId)
    .maybeSingle();

  if (actuel.error) {
    // 42703 = colonne inconnue : `0083` pas encore appliquée sur cet
    // environnement. Le code part avant les migrations, par construction.
    journal(userId, "colonne_absente", actuel.error.message ?? "");
    return "colonne_absente";
  }
  if (actuel.data?.boutik_slug) return "deja";

  // 2. Les adresses déjà prises qui pourraient entrer en collision. On ne lit
  //    QUE le voisinage du candidat — inutile de rapatrier tout le répertoire
  //    pour savoir si « mari-jakmel » est libre.
  const base = slugLibre(displayName, new Set());
  if (!base) {
    journal(userId, "sans_matiere", displayName.slice(0, 40));
    return "sans_matiere";
  }
  const racine = base.replace(/-\d+$/, "").slice(0, SLUG_MAX);
  const voisins = await supabase
    .from("profiles")
    .select("boutik_slug")
    .like("boutik_slug", `${racine}%`)
    .limit(200);
  const pris = new Set(
    (voisins.data ?? []).map((r) => r.boutik_slug).filter((s): s is string => Boolean(s))
  );

  /* 3. La boucle. La lecture ci-dessus n'est pas une réservation : deux
   *    inscriptions simultanées peuvent viser le même slug. L'index unique de
   *    `0083` tranche, et on reprend au candidat suivant — c'est LUI
   *    l'autorité, pas notre instantané. */
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    const candidat = slugLibre(displayName, pris);
    if (!candidat) break;

    const { error } = await supabase
      .from("profiles")
      .update({ boutik_slug: candidat })
      // `is("boutik_slug", null)` : on n'écrase JAMAIS une adresse existante,
      // même si la lecture du dessus a été prise de vitesse.
      .eq("id", userId)
      .is("boutik_slug", null);

    if (!error) return "attribue";

    // 23505 = violation d'unicité : quelqu'un a pris ce slug entre-temps.
    if (error.code === "23505") {
      pris.add(candidat);
      continue;
    }
    journal(userId, "echec", error.message ?? "");
    return "echec";
  }

  journal(userId, "echec", `${ESSAIS_MAX} collisions consecutives`);
  return "echec";
}

/* Corollaire d'observabilité : on ne journalise PAS le cas ordinaire
 * (« attribué », « déjà ») — ce serait une ligne par enregistrement de
 * profil. Tout ce qui empêche une adresse d'exister, en revanche, porte une
 * trace nommée : sans elle, « ce vendeur partage un UUID » n'aurait aucune
 * explication consultable. */
function journal(userId: string, issue: ResultatAttribution, detail: string) {
  console.log(
    "[boutik]",
    JSON.stringify({
      at: new Date().toISOString(),
      code: "ZB087",
      issue,
      user: userId.slice(0, 8),
      detail,
    })
  );
}
