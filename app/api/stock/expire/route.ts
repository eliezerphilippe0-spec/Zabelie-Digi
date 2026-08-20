import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expiration des réservations de stock (chantier B, 0036).
 * Une réservation dont le paiement n'a pas abouti dans le TTL configuré
 * (30 min par défaut) est relibérée : l'unité redevient vendable.
 *
 * Sans ce cron, un panier abandonné immobiliserait le stock indéfiniment —
 * sur un catalogue de pièces détachées où le vendeur n'a souvent qu'une ou
 * deux unités, c'est du chiffre d'affaires perdu en silence.
 *
 *   - GET  → cron Vercel (Authorization: Bearer $CRON_SECRET)
 *   - POST → appel manuel (Authorization: Bearer $RECONCILE_SECRET)
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  return false;
}

/**
 * Journal d'exécution — émis à CHAQUE passage, y compris quand il n'y a rien
 * à libérer.
 *
 * Sans ligne systématique, « le cron n'a pas tourné » (secret absent, cron non
 * déclaré, déploiement cassé) et « il a tourné, rien à libérer » produisent le
 * même journal : rien. Vérifier `CRON_SECRET` une fois à la main ne protège
 * pas dans six semaines ; un signal régulier, si. Même principe que le défaut
 * observable de `lib/product-kind.ts` : l'absence de signal doit être un
 * signal.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[stock/expire]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function handle(req: Request) {
  const debut = Date.now();
  if (!authorize(req)) {
    // Journalisé aussi : un cron mal configuré se voit ici, pas dans le silence.
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    /* BAIL D'EXÉCUTION (`0060`) — un seul porteur à la fois.
     *
     * ⚠️ Ajouté le 2026-08-20. `lib/cron-lease.ts` a été écrit pour que « le
     * huitième cron en hérite sans y penser » — et il ne servait qu'à UNE
     * route sur huit. Le plan Hobby annonce par ailleurs une « flexible time
     * window » d'une heure : deux créneaux espacés de 30 minutes peuvent donc
     * se chevaucher, ou s'inverser.
     *
     * Fail-open si `0060` manque (voir `lib/cron-lease.ts`) : un bail est une
     * garantie ADDITIONNELLE, jamais une condition de correction. */
    const { avecBail } = await import("@/lib/cron-lease");
    const { bail, resultat: data } = await avecBail(
      admin,
      "stock_expire",
      `stock-${debut}`,
      async () => {
        const { data: d, error: e } = await admin.rpc("zabelie_expire_stock_reservations");
        if (e) throw new Error(e.message);
        return d;
      },
      { journal: (champs) => journal({ issue: "bail", ...champs }) }
    );
    if (!bail.autorise) {
      journal({ issue: "ignore_bail_tenu", dureeMs: Date.now() - debut });
      return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
    }
    /* L'échec de la RPC est désormais levé DANS le travail sous bail, donc
       rattrapé par le `catch` du bas — qui journalise et rend 500. Garder ici
       un `if (error)` sur une valeur toujours nulle aurait été exactement le
       garde inatteignable que ce dépôt traque partout ailleurs. */
    const released = data ?? 0;
    journal({ issue: "termine", liberees: released, dureeMs: Date.now() - debut });
    return NextResponse.json({ released });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "exception", message, dureeMs: Date.now() - debut });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
