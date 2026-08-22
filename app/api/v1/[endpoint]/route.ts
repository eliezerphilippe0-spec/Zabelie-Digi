import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { V1_ENDPOINTS, ApiErrorOutput, type V1EndpointName } from "@/lib/api/v1/schemas";
import { ErreurApi, V1_HANDLERS, type Contexte } from "@/lib/api/v1/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API v1 — la porte unique.
 * =============================================================================
 * ⚠️ **UNE SEULE ROUTE, PILOTÉE PAR LE REGISTRE**, et ce n'est pas un raccourci
 * d'écriture.
 *
 * `V1_ENDPOINTS` dit de lui-même sa raison d'être : « ajouter un endpoint sans
 * l'inscrire ici le laisserait hors de toute vérification, et c'est exactement
 * le trou qu'on ferme en le centralisant ». Neuf fichiers de route auraient
 * rouvert ce trou : rien n'empêche d'écrire `app/api/v1/autre/route.ts` sans
 * jamais toucher au registre. Ici, un nom absent du registre **ne peut pas être
 * servi** — il rend 404 avant d'atteindre le moindre code.
 *
 * ── POURQUOI `POST` POUR UNE API DE LECTURE ─────────────────────────────────
 * Contre-intuitif, et c'est le contrat qui tranche, pas le goût.
 *
 * Les entrées sont typées en JSON strict : `limit: z.number().int()`,
 * `ids: z.array(UuidSchema)`. Une chaîne de requête ne transporte que du texte,
 * donc `?limit=20` arriverait en `"20"` et serait REFUSÉ. Servir en `GET`
 * exigerait d'insérer une couche de coercition entre l'appelant et le schéma —
 * c'est-à-dire de deviner ce que l'appelant voulait dire, dans la seule couche
 * qui existe pour ne rien deviner. Et `compare_products` prend un TABLEAU, que
 * les chaînes de requête ne savent pas représenter sans convention.
 *
 * L'alternative honnête serait de passer les schémas en `z.coerce` — mais
 * « modifier un champ existant est une rupture qui exige `/v2/` ».
 *
 * Le corps JSON transporte les types tels quels. Aucune coercition, aucune
 * devinette. Ces requêtes ne mutent rien : `POST` y désigne le transport, pas
 * un effet.
 *
 * ── CE QUE LA ROUTE GARANTIT, DANS L'ORDRE ──────────────────────────────────
 *   1. endpoint inscrit au registre, sinon 404 ;
 *   2. corps JSON lisible, sinon `invalid_input` ;
 *   3. entrée conforme au schéma d'ENTRÉE, sinon `invalid_input` + champ ;
 *   4. cadence bornée, sinon `rate_limited` ;
 *   5. handler exécuté ;
 *   6. ⚠️ sortie conforme au schéma de SORTIE, **sinon `internal`** — jamais
 *      une réponse approximative. C'est la promesse entière de cette couche :
 *      « un `select` qui renvoie une colonne en moins […] le type reste vrai
 *      sur le papier et la réponse part quand même ». Ici, elle ne part pas.
 */

const CODE_HTTP: Record<string, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  unsupported_state: 409,
  internal: 500,
};

/**
 * Réponse d'erreur, elle-même validée.
 *
 * ⚠️ Une erreur mal formée est une erreur quand même : si `ApiErrorOutput`
 * refuse ce qu'on s'apprêtait à rendre, on rend un `internal` minimal plutôt
 * que d'échapper au contrat par la porte de service. Le chemin d'échec est
 * précisément celui qu'on n'éprouve jamais.
 */
function erreur(code: string, message: string, field?: string): NextResponse {
  const corps = { type: "error" as const, code, message, ...(field ? { field } : {}) };
  const v = ApiErrorOutput.safeParse(corps);
  if (!v.success) {
    console.error("[api/v1] erreur non conforme au contrat", code, v.error.issues);
    return NextResponse.json(
      { type: "error", code: "internal", message: "Erreur interne." },
      { status: 500 }
    );
  }
  return NextResponse.json(v.data, { status: CODE_HTTP[code] ?? 500 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  const { endpoint } = await params;

  // 1 — Le registre EST la liste blanche.
  if (!Object.prototype.hasOwnProperty.call(V1_ENDPOINTS, endpoint)) {
    return erreur("not_found", `Endpoint inconnu : ${endpoint}`);
  }
  const nom = endpoint as V1EndpointName;
  const { input: schemaEntree, output: schemaSortie } = V1_ENDPOINTS[nom];

  // 2 — Corps JSON. Un corps vide est un objet vide, pas une erreur : plusieurs
  // entrées n'ont que des champs optionnels.
  let brut: unknown;
  try {
    const texte = await req.text();
    brut = texte.trim() === "" ? {} : JSON.parse(texte);
  } catch {
    return erreur("invalid_input", "Corps JSON illisible.");
  }

  // 3 — Entrée. Le premier champ fautif est nommé : une erreur de validation
  // sans le champ oblige l'appelant à deviner lequel.
  const entree = schemaEntree.safeParse(brut);
  if (!entree.success) {
    const p = entree.error.issues[0];
    return erreur(
      "invalid_input",
      p?.message ?? "Entrée invalide.",
      p?.path.length ? String(p.path[0]) : undefined
    );
  }

  /* ⚠️ DÉFAUT TROUVÉ EN PARCOURANT LE CHEMIN, le 2026-08-22, et pas en le
   * relisant : ces deux appels LÈVENT quand `NEXT_PUBLIC_SUPABASE_URL` ou la
   * clé manquent (`lib/supabase/server.ts:147`). Ils étaient hors du `try`, et
   * la requête rendait alors **un 500 au corps VIDE** — mesuré, `curl` à
   * l'appui.
   *
   * Une API dont le chemin d'échec échappe à son propre contrat est
   * précisément ce que ce contrat existe pour empêcher : l'appelant reçoit du
   * vide là où toute la couche promet `{ type: "error", code, message }`. Et
   * c'est le chemin qu'on n'éprouve jamais, donc celui où le défaut dort.
   *
   * `createAdminClient()` est dans la même boucle pour la même raison. */
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let admin: ReturnType<typeof createAdminClient>;
  let user: { id: string } | null;
  try {
    supabase = await createClient();
    admin = createAdminClient();
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id } : null;
  } catch (e) {
    console.error(
      "[api/v1] CLIENT SUPABASE INDISPONIBLE — variables d'environnement absentes ?",
      e
    );
    return erreur("internal", "Service indisponible.");
  }

  /* 4 — Cadence. Bornée par UTILISATEUR quand il y en a un, par ENDPOINT
   * sinon.
   *
   * ⚠️ Cette borne anonyme est GROSSIÈRE et c'est écrit plutôt que caché : sans
   * identité, tous les appelants non connectés partagent le même compteur. Elle
   * protège la base d'un emballement, elle ne distingue pas deux visiteurs. Une
   * limitation par IP demanderait de traiter `x-forwarded-for`, qui se
   * falsifie — et une borne qu'on croit par-appelant alors qu'elle ne l'est pas
   * serait pire que celle-ci, qui ne prétend rien.
   *
   * Le compteur vit en base (`rateLimit`), donc il exige le client
   * d'administration — c'est le seul usage du service role sur ce chemin, et il
   * ne porte aucune donnée d'utilisateur. Il est créé plus haut, dans la
   * même garde que le client de session. */
  const cle = user ? `apiv1:${user.id}` : `apiv1:anon:${nom}`;
  if (!(await rateLimit(admin, cle, user ? 120 : 60))) {
    return erreur("rate_limited", "Trop de requêtes. Réessayez dans une minute.");
  }

  // 5 — Handler.
  const ctx: Contexte = { supabase, userId: user?.id ?? null };
  let resultat: unknown;
  try {
    resultat = await (V1_HANDLERS[nom] as (i: unknown, c: Contexte) => Promise<unknown>)(
      entree.data,
      ctx
    );
  } catch (e) {
    if (e instanceof ErreurApi) return erreur(e.code, e.message, e.field);
    console.error(`[api/v1/${nom}] exception non prévue`, e);
    return erreur("internal", "Erreur interne.");
  }

  /* 6 — Sortie. LE point de tout ce fichier.
   *
   * Le journal porte le nom de l'endpoint ET les problèmes rencontrés : une
   * sortie refusée signale presque toujours un écart entre la base et le
   * contrat — colonne disparue, valeur d'énumération ajoutée, migration non
   * appliquée. C'est un signal d'exploitation, pas un bogue de sérialisation,
   * et il doit être lisible sans rejouer la requête. */
  const sortie = schemaSortie.safeParse(resultat);
  if (!sortie.success) {
    console.error(
      `[api/v1/${nom}] SORTIE NON CONFORME AU CONTRAT — la réponse est retenue.`,
      JSON.stringify(sortie.error.issues.slice(0, 5))
    );
    return erreur("internal", "Réponse non conforme au contrat.");
  }

  return NextResponse.json(sortie.data, {
    status: 200,
    // Lecture seule, données publiques ou personnelles selon l'endpoint : on ne
    // met RIEN en cache partagé. `get_order` en cache serait une fuite.
    headers: { "Cache-Control": "no-store" },
  });
}
