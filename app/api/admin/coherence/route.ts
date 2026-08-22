import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluerArrondi } from "@/lib/rounding-probe";
import { isEmailEnabled } from "@/lib/zabelie-email";
import { isStripeEnabled } from "@/lib/stripe";
import { verdictObjets, type ObjetRequis } from "@/lib/schema-requis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contrôle de cohérence du registre (chantier 0, lot 0.c.1 — docs/19 §3.1).
 * Vérifie l'identité Σ(grand livre) = disponible + en attente, portefeuille par
 * portefeuille. Un écart = un solde qui a bougé hors du grand livre : à savoir
 * AVANT de régler un vendeur, pas après.
 *
 * Accès : cron Vercel (Bearer $CRON_SECRET), appel manuel (Bearer
 * $RECONCILE_SECRET), ou administrateur connecté.
 *
 * ⚠️ Purement interne : ne dit rien du solde RÉEL du compte marchand MonCash
 * (contrôle de solvabilité, docs/19 §3.2 — manuel tant qu'aucun endpoint de
 * solde n'existe côté Digicel).
 */
async function authorize(req: Request): Promise<boolean> {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  const user = await getCurrentUser();
  return user?.role === "admin";
}

async function handle(req: Request) {
  if (!(await authorize(req))) {
    return erreurTraduite("api.access.denied", 401);
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_solvency_report");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Un écart ne doit pas passer inaperçu : trace dans les logs serveur, que
    // l'appel vienne du cron ou d'un humain. (L'alerte e-mail suppose une
    // adresse de destination à configurer — décision porteur.)
    if (data && data.ok === false) {
      console.error(
        "[coherence] ÉCART REGISTRE détecté",
        JSON.stringify({
          ecarts: data.ecarts,
          ecart_total_htg: data.ecart_total_htg,
        })
      );
    }

    // Sonde d'arrondi : la constante `ROUNDING_IN_FORCE` s'accorde-t-elle avec
    // ce que le journal des migrations dit avoir été appliqué ? Elle ne touche
    // pas au verdict du registre — un désaccord d'annonce n'est pas un écart
    // comptable — mais elle ne doit pas non plus passer sous silence.
    const { data: journal, error: erreurJournal } = await admin
      .from("zabelie_schema_migrations")
      .select("filename");
    const arrondi = evaluerArrondi({
      lignes: (journal as { filename: string }[] | null) ?? null,
      erreur: erreurJournal,
    });
    // Le contrôle à plus fort levier du lot : il attrape l'absence de `0046`
    // AVANT qu'un vendeur soit dans la pièce. Le message d'erreur de la route
    // de création reste utile en second rideau, pour le cas où personne n'a
    // regardé ceci.
    //
    // Deux sources, et l'ordre compte : `zabelie_objets_requis()` (0048)
    // CONSTATE la présence dans le catalogue ; le registre `0041`, lui, ne
    // fait que DÉCLARER — seule `0041` s'y inscrit, les autres migrations
    // sont enregistrées à la main. Un registre qui affirme une fonction
    // absente est le seul cas vert-mais-cassé, et c'est celui qu'on ferme.
    const { data: objets, error: erreurObjets } = await admin.rpc("zabelie_objets_requis");
    const schemaRequis = verdictObjets({
      objets: (objets as ObjetRequis[] | null) ?? null,
      erreurObjets,
      lignesRegistre: (journal as { filename: string }[] | null) ?? null,
      erreurRegistre: erreurJournal,
    });

    if (schemaRequis.statut === "manquant") {
      console.error(
        `[coherence] OBJET REQUIS MANQUANT (${schemaRequis.source}) —`,
        schemaRequis.message
      );
    } else if (schemaRequis.statut === "indetermine") {
      console.warn("[coherence] SCHÉMA REQUIS — indéterminé :", schemaRequis.message);
    } else {
      // Journalisé même quand tout va bien, ET avec la source : « vert par
      // constat » et « vert par déclaration » ne valent pas la même chose.
      console.info(`[coherence] schéma requis complet (${schemaRequis.source})`);
    }

    if (arrondi.statut === "desaccord") {
      console.error("[coherence] ARRONDI — annonce et base divergent", arrondi.message);
    } else if (arrondi.statut === "indetermine") {
      // Journalisé même quand il n'y a rien à dire : sinon « la sonde n'a pas
      // tourné » et « la sonde n'a rien trouvé » produisent le même vide.
      console.warn("[coherence] ARRONDI — indéterminé :", arrondi.raison);
    }

    // Intégrité des index d'expression du capteur de demande (0047).
    //
    // Ce contrôle ne peut PAS être utile en CI : la base de test a un index
    // fraîchement construit et une fonction fraîchement définie, ils
    // s'accorderont toujours. La dérive qu'il existe pour attraper ne naît
    // qu'ici — quand une migration remplace `zabelie_search_normalize` sans
    // réindexer. Non branché sur la vraie base, il ne serait qu'un détecteur
    // de fumée posé dans un tiroir, dont la seule fonction serait de rassurer.
    let indexRecherche: { ok: boolean; detail: string } | { statut: string } = {
      statut: "indéterminé",
    };
    const { data: integrite, error: erreurIntegrite } = await admin.rpc(
      "zabelie_search_index_integrity"
    );
    if (erreurIntegrite) {
      // `0047` pas encore appliquée : la fonction n'existe pas. Ce n'est pas
      // une panne, mais ça ne doit pas passer pour un contrôle réussi.
      indexRecherche = { statut: `indéterminé — ${erreurIntegrite.message}` };
      console.warn("[coherence] INDEX RECHERCHE — indéterminé :", erreurIntegrite.message);
    } else {
      const ligne = (Array.isArray(integrite) ? integrite[0] : integrite) as
        | { ok: boolean; detail: string }
        | undefined;
      if (ligne) {
        indexRecherche = ligne;
        if (!ligne.ok) {
          console.error("[coherence] INDEX RECHERCHE PÉRIMÉ —", ligne.detail);
        } else {
          // Journalisé même quand tout va bien : sinon « le contrôle n'a pas
          // tourné » et « il a tourné, rien à signaler » se ressemblent.
          console.info("[coherence] index recherche alignés sur la fonction");
        }
      }
    }

    /* ── INTÉGRATIONS : les clés qui décident si un tuyau débouche ──────────
     *
     * ⚠️ NÉ D'UNE QUESTION SANS RÉPONSE, le 2026-08-22 : « vérifie
     * RESEND_API_KEY ». Personne ne pouvait y répondre depuis le dépôt.
     * L'agent n'a pas d'accès Vercel, `readyz` n'expose délibérément qu'un
     * booléen de base, et rien nulle part ne disait si les notifications
     * partaient. La seule façon de savoir était d'ouvrir la console Vercel.
     *
     * Or ce n'est pas une curiosité : `zabelie_outbox` (0061) enfile des
     * relances de remise, et `lib/messagerie-notify.ts` (0090) prévient d'un
     * message reçu. Les deux passent par `isEmailEnabled()`. **Sans la clé,
     * les deux files se drainent dans le VIDE** — le cron rend
     * `outbox_envoyes: 0`, et zéro se lit comme « rien à signaler » plutôt
     * que « rien n'est jamais parti ». C'est le corollaire d'observabilité de
     * `CLAUDE.md` : l'absence de signal doit être un signal.
     *
     * ⚠️ AUCUNE VALEUR DE CLÉ N'EST RENDUE, jamais — seulement un booléen de
     * présence. Une route d'administration reste une surface, et un secret qui
     * transite par une réponse HTTP a cessé d'être un secret. C'est aussi
     * pourquoi ce bloc n'est PAS dans `readyz`, qui est public par conception.
     *
     * Ce que ça NE prouve pas, et il faut le dire : que la clé soit VALIDE.
     * Une clé révoquée est présente et n'envoie rien. Seul un envoi réel le
     * dirait — ici on distingue « pas configuré » de « configuré », ce qui est
     * exactement le doute qu'on ne savait pas lever. */
    const integrations = {
      email: {
        configure: isEmailEnabled(),
        consequenceSiAbsent:
          "outbox (0061) et notifications de messagerie (0090) se drainent sans rien envoyer",
      },
      moncash: { configure: Boolean(process.env.MONCASH_CLIENT_ID) },
      stripe: { configure: isStripeEnabled() },
    };
    if (!integrations.email.configure) {
      console.error(
        "[coherence] RESEND_API_KEY ABSENTE — aucune notification ne part. " +
          "Ni l'acheteur ni le vendeur n'est prévenu de quoi que ce soit."
      );
    } else {
      // Journalisé aussi quand tout va bien, même raison que les deux
      // contrôles ci-dessus.
      console.info("[coherence] e-mail configuré (présence de la clé, pas sa validité)");
    }

    return NextResponse.json({
      ...data,
      arrondi,
      schemaRequis,
      indexRecherche,
      integrations,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
