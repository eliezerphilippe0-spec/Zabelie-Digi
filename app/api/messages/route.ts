import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { getSuspension } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { isMissingTable } from "@/lib/product-media";
import { MESSAGE_MAX } from "@/lib/messagerie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/messages — envoyer un message à un vendeur.
 * =============================================================================
 * Deux formes, une seule route :
 *   { productId, body }       → ouvre le fil si besoin, puis écrit (acheteur)
 *   { conversationId, body }  → écrit dans un fil existant (les deux côtés)
 *
 * ⚠️ CETTE ROUTE NE PORTE AUCUN GARDE D'AUTORISATION, ET C'EST VOULU.
 *
 * Tout passe par le client de SESSION, donc par les policies de `0090` :
 *   • `seller_id` est CONTRAINT d'être celui du produit — un client qui le
 *     forgerait est refusé en base, pas ici ;
 *   • l'expéditeur est CONTRAINT d'être l'appelant ;
 *   • un tiers ne peut pas écrire dans un fil.
 *
 * C'est l'inverse du choix fait pour l'API v1, et la différence est exactement
 * celle que `0090` §4 explique : là-bas la RLS laissait passer plus que ce que
 * le contrat annonçait (`orders_seller_read`), donc il fallait filtrer par-dessus.
 * Ici, l'invariant s'écrit ENTIÈREMENT dans un `with check` — l'écrire en SQL le
 * rend vrai pour tout appelant, l'écrire ici le rendrait vrai pour cette route.
 *
 * Reproduire les gardes dans le code serait pire qu'inutile : deux copies d'une
 * même règle divergent, et c'est toujours la copie applicative qui reste en
 * arrière.
 */
export async function POST(req: Request) {
  /* ⚠️ LA MÊME GARDE QUE `app/api/v1/[endpoint]/route.ts`, ET ELLE MANQUAIT ICI.
   *
   * Trouvée le 2026-08-22 par `scripts/zabelie-verifier-deploiement.mjs`, pas
   * par une relecture : `createClient()` LÈVE quand les variables Supabase
   * manquent, et cet appel était hors de tout `try`. La route rendait alors un
   * **500 au corps VIDE** — la réponse échappait au contrat que toutes les
   * autres erreurs de ce fichier respectent.
   *
   * ⚠️ ET C'EST UNE CLASSE, PAS UN CAS. Mesuré le même jour : **35 routes**
   * d'`app/api` appellent `createClient()` hors d'un `try`. J'avais corrigé
   * l'INSTANCE dans la route v1 deux heures plus tôt et je ne l'avais pas
   * généralisé — le réflexe est de réparer ce qu'on voit.
   *
   * Pourquoi les 34 autres ne sont PAS réécrites ici : ce chemin ne se
   * déclenche que si l'environnement est mal configuré, ce qui n'arrive pas en
   * production — le site répond. Réécrire 35 fichiers sur une panne qui n'a
   * jamais eu lieu ajouterait 35 diffs pour zéro défaut mesuré. La classe est
   * NOMMÉE dans `OPS_TODO`, avec sa gravité réelle, plutôt que traitée en
   * masse. Celle-ci est corrigée parce qu'elle est neuve et que la sonde la
   * désigne. */
  /* ⚠️ LA LANGUE SE RÉSOUT AVANT LA BASE, ET SÉPARÉMENT. `getLang()` lit un
   * COOKIE — il ne dépend pas de Supabase. Les mettre dans le même `try`
   * rendait la langue indisponible au moment précis où il faut parler à
   * l'utilisateur, et j'y avais répondu par un « Service indisponible. » EN
   * DUR — que le cliquet `tests/i18n-api-cliquet.test.ts` a immédiatement
   * attrapé. Le garde a fait exactement son travail sur celui qui l'a écrit. */
  const lang = await getLang();

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id } : null;
  } catch (e) {
    console.error("[messages] CLIENT SUPABASE INDISPONIBLE — variables absentes ?", e);
    return erreurAvecLangue(lang, "api.unavailable", 503);
  }
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  if (await getSuspension(user.id)) {
    return erreurAvecLangue(lang, "api.suspended", 403);
  }

  let corps: { productId?: string; conversationId?: string; body?: string };
  try {
    corps = await req.json();
  } catch {
    return erreurAvecLangue(lang, "api.json.invalid", 400);
  }

  const texte = typeof corps.body === "string" ? corps.body.trim() : "";
  // Borné ICI **et** en base (`check (length(btrim(body)) between 1 and 2000)`).
  // La borne applicative donne un message lisible ; celle de la base est ce qui
  // tient face à n'importe quel autre appelant.
  if (!texte || texte.length > MESSAGE_MAX) {
    return erreurAvecLangue(lang, "api.message.invalid", 400);
  }
  if (!corps.productId && !corps.conversationId) {
    return erreurAvecLangue(lang, "api.params.invalid", 400);
  }

  const admin = createAdminClient();

  /* Deux cadences, deux abus différents — et c'est la SECONDE qui compte.
   *
   * Écrire beaucoup dans un fil ouvert est une négociation. Ouvrir dix fils
   * avec dix vendeurs en une journée est du démarchage. Une seule borne
   * globale confondrait les deux et gênerait le cas légitime pour rater
   * l'autre.
   *
   * Les valeurs vivent en table de config (`zabelie_message_limits`), jamais en
   * dur — règle dure n° 3. */
  const limites = await lireLimites(admin);
  if (!(await rateLimit(admin, `msg:${user.id}`, limites.parHeure, 3600))) {
    return erreurAvecLangue(lang, "api.message.throttled", 429);
  }

  let conversationId = corps.conversationId ?? null;

  if (!conversationId) {
    if (!(await rateLimit(admin, `msg:fils:${user.id}`, limites.filsParJour, 86400))) {
      return erreurAvecLangue(lang, "api.message.threads", 429);
    }

    /* Le vendeur du produit est lu EN BASE. Il n'est pas là pour être cru — la
     * policy le revérifie — mais parce qu'il faut bien poser une valeur dans
     * la colonne. Si le client en fournissait une autre, la base refuserait. */
    const { data: prod, error: eProd } = await supabase
      .from("products")
      .select("id, seller_id")
      .eq("id", corps.productId!)
      .eq("status", "published")
      .maybeSingle();
    if (eProd) return erreurAvecLangue(lang, "api.read.failed", 500);
    if (!prod) return erreurAvecLangue(lang, "api.product.notfound", 404);

    const p = prod as { id: string; seller_id: string };
    if (p.seller_id === user.id) {
      // Le garde existe aussi en base (`check (buyer_id <> seller_id)`), mais
      // un vendeur qui clique sur sa propre fiche mérite une phrase, pas une
      // contrainte Postgres brute — c'est la leçon du 2026-08-22.
      return erreurAvecLangue(lang, "api.message.self", 400);
    }

    /* Fil EXISTANT d'abord. `unique (product_id, buyer_id)` garantit qu'il n'y
     * en a qu'un ; le chercher évite de compter une réouverture comme un
     * nouveau fil dans la cadence ci-dessus. */
    const { data: dejaLa } = await supabase
      .from("zabelie_conversations")
      .select("id")
      .eq("product_id", p.id)
      .eq("buyer_id", user.id)
      .maybeSingle();

    if (dejaLa) {
      conversationId = (dejaLa as { id: string }).id;
    } else {
      const { data: neuf, error: eConv } = await supabase
        .from("zabelie_conversations")
        .insert({ product_id: p.id, buyer_id: user.id, seller_id: p.seller_id })
        .select("id")
        .single();
      if (eConv || !neuf) {
        if (eConv && isMissingTable(eConv)) {
          console.error(
            "[messages] MIGRATION 0090 NON APPLIQUÉE — zabelie_conversations introuvable :",
            eConv.code
          );
          return erreurAvecLangue(lang, "api.feature.off", 503);
        }
        // Un refus de policy arrive ici. On ne le distingue pas d'un autre
        // échec d'écriture : le client n'a pas à savoir laquelle des règles
        // l'a arrêté.
        console.error("[messages] ouverture de fil refusée", eConv);
        return erreurAvecLangue(lang, "api.write.failed", 403);
      }
      conversationId = (neuf as { id: string }).id;
    }
  }

  const { data: msg, error } = await supabase
    .from("zabelie_messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body: texte })
    .select("id, created_at")
    .single();
  if (error || !msg) {
    if (error && isMissingTable(error)) {
      console.error(
        "[messages] MIGRATION 0090 NON APPLIQUÉE — zabelie_messages introuvable :",
        error.code
      );
      return erreurAvecLangue(lang, "api.feature.off", 503);
    }
    console.error("[messages] envoi refusé", error);
    return erreurAvecLangue(lang, "api.write.failed", 403);
  }

  /* Notification au destinataire — BEST-EFFORT INTÉGRAL, jamais bloquante.
   *
   * ⚠️ POURQUOI PAS L'OUTBOX (`0061`), alors qu'elle existe : elle est adossée
   * à une COMMANDE — `order_id not null`, et `unique (order_id, kind)`. Une
   * question posée AVANT l'achat n'a pas de commande, et « un seul message par
   * commande et par type » est l'inverse de ce qu'il faut ici. L'y faire
   * entrer aurait demandé de déformer une table appliquée en production pour
   * un usage qu'elle n'a pas.
   *
   * Même forme que `notifyOrderPaid` : aucune erreur ne remonte au flux. */
  try {
    const { notifierMessage } = await import("@/lib/messagerie-notify");
    await notifierMessage(admin, conversationId!, user.id);
  } catch (e) {
    console.error("[messages] notification non envoyée", e);
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: (msg as { id: string }).id,
  });
}

/** Les deux bornes, lues en config. Défauts si la table manque encore. */
async function lireLimites(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ parHeure: number; filsParJour: number }> {
  const defauts = { parHeure: 30, filsParJour: 10 };
  try {
    const { data, error } = await admin
      .from("zabelie_message_limits")
      .select("key, value");
    if (error || !data) return defauts;
    const m = new Map((data as { key: string; value: number }[]).map((r) => [r.key, r.value]));
    return {
      parHeure: m.get("messages_par_heure") ?? defauts.parHeure,
      filsParJour: m.get("fils_ouverts_par_jour") ?? defauts.filsParJour,
    };
  } catch {
    return defauts;
  }
}
