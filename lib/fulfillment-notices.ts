/**
 * L'EXPÉDITEUR D'AVIS — ce qui rend l'auto-réception légitime.
 *
 * `0043` écrit les avis DANS la transaction qui change l'état ; personne ne les
 * envoyait. Conséquence exacte, tant que ce module n'existait pas : le garde de
 * légitimité du balayage (« ne pas prononcer la réception tant qu'un avis n'est
 * pas parti ») bloquait TOUTE auto-réception, et au bout de `auto_receive_days`
 * la borne dure faisait remonter chaque commande honorée en file admin.
 * Personne n'était exproprié — mais le vendeur attendait un humain à chaque
 * vente.
 *
 * ─── LA RÉCLAMATION ATOMIQUE, SANS MIGRATION ────────────────────────────────
 * Deux passages simultanés (le cron et un appel manuel) ne doivent pas envoyer
 * deux fois le même avis. Il n'existe pas de RPC de réclamation, et en écrire
 * une supposerait une migration que le porteur devrait appliquer avant que ce
 * cron ne serve à quoi que ce soit.
 *
 * `attempts` sert donc de NUMÉRO DE VERSION : on lit `(id, attempts)`, puis on
 * écrit `attempts = n + 1` en exigeant `attempts = n` ET `sent_at is null`. Un
 * seul des deux passages voit sa ligne revenir ; l'autre en obtient zéro et
 * passe son chemin. C'est un compare-et-échange, et Postgres le rend atomique
 * par ligne sans qu'on ait rien à ajouter.
 *
 * Effet de bord VOULU : le compteur monte AVANT l'envoi. Un processus tué en
 * plein vol a donc consommé sa tentative — c'est ce qu'on veut d'une borne de
 * tentatives, sinon un plantage systématique tournerait en boucle éternelle.
 *
 * ─── CE QUI BORNE VRAIMENT ──────────────────────────────────────────────────
 * `notice_max_attempts` n'est PAS la vraie borne : la borne dure est
 * temporelle, et elle vit dans le balayage (`shipped_at + auto_receive_days` →
 * escalade en file admin). Ce module ne fait qu'arrêter de s'acharner.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEmailEnabled,
  sendEmail,
  shippedNoticeEmail,
  reminderNoticeEmail,
  autoReceivedNoticeEmail,
} from "./zabelie-email";
import { lireLimiteRemise } from "./fulfillment";

/** Les trois valeurs de l'énumération SQL `fulfillment_notice_kind` (0043 §5). */
export const GENRES_AVIS = ["shipped_buyer", "reminder_buyer", "auto_received"] as const;
export type GenreAvis = (typeof GENRES_AVIS)[number];

export function estGenreAvis(v: unknown): v is GenreAvis {
  return (GENRES_AVIS as readonly unknown[]).includes(v);
}

export type CompteursAvis = {
  /** Avis échus vus par ce passage (avant réclamation). */
  dus: number;
  envoyes: number;
  echecs: number;
  /** Réclamés par un autre passage — normal, pas une anomalie. */
  concurrents: number;
  /** Tentatives épuisées : on n'essaie plus, le balayage escalade. */
  abandonnes: number;
};

type AvisRow = {
  id: string;
  order_id: string;
  kind: string;
  attempts: number;
  order: {
    order_ref: string | null;
    buyer_id: string;
    products: { title: string } | null;
    /** Le suivi porte `shipped_at` — l'ancre RÉELLE de l'échéance. */
    zabelie_fulfillment: { shipped_at: string | null }[] | { shipped_at: string | null } | null;
  } | null;
};

/**
 * Compose le message. `switch` EXHAUSTIF : ajouter un genre à l'énumération SQL
 * ne casserait aucune compilation sans le `never` final — l'avis partirait vide,
 * ou pas du tout, en silence. Croisé avec le SQL par
 * `tests/fulfillment-avis.test.ts`.
 */
export function composerAvis(
  genre: GenreAvis,
  champs: { productTitle: string; orderRef: string | null; deadlineLabel: string; purchasesUrl: string }
): { subject: string; html: string } {
  switch (genre) {
    case "shipped_buyer":
      return shippedNoticeEmail(champs);
    case "reminder_buyer":
      return reminderNoticeEmail(champs);
    case "auto_received":
      return autoReceivedNoticeEmail({
        productTitle: champs.productTitle,
        orderRef: champs.orderRef,
        purchasesUrl: champs.purchasesUrl,
      });
    default: {
      const jamais: never = genre;
      throw new Error(`genre d'avis inconnu : ${String(jamais)}`);
    }
  }
}

/**
 * Recul entre deux tentatives, en HEURES.
 *
 * Le cron passe une fois par jour : à cette cadence le recul ne change rien, et
 * c'est voulu — il n'existe que pour l'appel MANUEL, où rien n'empêcherait
 * d'épuiser les cinq tentatives en cinq secondes et de déclarer mort un
 * fournisseur qui hoquetait. Plafonné : au-delà, c'est la borne temporelle du
 * balayage qui tranche, pas nous.
 */
export function reculHeures(tentatives: number): number {
  return Math.min(2 ** Math.max(tentatives - 1, 0), 24);
}

function journal(champs: Record<string, unknown>) {
  console.log("[fulfillment/avis]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

export async function envoyerAvisDus(
  admin: SupabaseClient,
  options: { limite?: number } = {}
): Promise<CompteursAvis> {
  const c: CompteursAvis = { dus: 0, envoyes: 0, echecs: 0, concurrents: 0, abandonnes: 0 };

  // Fournisseur absent → on ne réclame RIEN. Incrémenter `attempts` sans
  // pouvoir envoyer épuiserait la borne en cinq jours et ferait remonter en
  // file admin des commandes dont le seul tort est que la clé n'est pas posée.
  if (!isEmailEnabled()) {
    journal({ issue: "fournisseur_absent", ...c });
    return c;
  }

  const maxTentatives = await lireLimiteRemise(admin, "notice_max_attempts", 5);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joursReception = await lireLimiteRemise(admin, "auto_receive_days", 7);

  const { data, error } = await admin
    .from("zabelie_fulfillment_notices")
    .select(
      "id, order_id, kind, attempts, order:orders(order_ref, buyer_id, products(title), zabelie_fulfillment(shipped_at))"
    )
    .is("sent_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(options.limite ?? 50);

  if (error) {
    journal({ issue: "lecture_impossible", message: error.message, ...c });
    return c;
  }

  const avis = (data ?? []) as unknown as AvisRow[];
  c.dus = avis.length;

  for (const a of avis) {
    if (a.attempts >= maxTentatives) {
      // On n'insiste plus. Rien à écrire : le balayage voit toujours un avis
      // non parti et escalade — c'est LUI qui sort la commande du limbe.
      c.abandonnes += 1;
      continue;
    }
    if (!estGenreAvis(a.kind)) {
      journal({ issue: "genre_inconnu", avis: a.id, recu: a.kind });
      c.echecs += 1;
      continue;
    }

    // Compare-et-échange : `attempts` fait office de numéro de version.
    const { data: reclame } = await admin
      .from("zabelie_fulfillment_notices")
      .update({ attempts: a.attempts + 1 })
      .eq("id", a.id)
      .eq("attempts", a.attempts)
      .is("sent_at", null)
      .select("id");

    if (!reclame || reclame.length === 0) {
      c.concurrents += 1;
      continue;
    }

    const produit = a.order?.products;
    const titre = (Array.isArray(produit) ? produit[0]?.title : produit?.title) ?? "Votre commande";
    /* ⚠️ L'ÉCHÉANCE S'ANCRE SUR `shipped_at`, PAS SUR MAINTENANT.
     * Le rappel est programmé à MI-DÉLAI : calculée depuis l'instant de
     * l'envoi, la date annoncée serait ~3 jours et demi TROP TARD — on
     * écrirait à l'acheteur une échéance qui n'est pas la sienne, dans le
     * message même dont le seul rôle est de la lui faire connaître.
     * Repli sur maintenant uniquement si le suivi est illisible : mieux vaut
     * une date prudente qu'aucune. */
    const suivi = a.order?.zabelie_fulfillment;
    const shippedAt = (Array.isArray(suivi) ? suivi[0]?.shipped_at : suivi?.shipped_at) ?? null;
    const ancre = shippedAt ? new Date(shippedAt).getTime() : Date.now();
    const echeance = new Date(ancre + joursReception * 86_400_000).toLocaleDateString("fr-HT");

    let destinataire: string | undefined;
    try {
      const { data: u } = await admin.auth.admin.getUserById(a.order?.buyer_id ?? "");
      destinataire = u.user?.email ?? undefined;
    } catch {
      destinataire = undefined;
    }

    let parti = false;
    let motif = "";
    if (!destinataire) {
      motif = "acheteur sans adresse e-mail";
    } else {
      const message = composerAvis(a.kind, {
        productTitle: titre,
        orderRef: a.order?.order_ref ?? null,
        deadlineLabel: echeance,
        purchasesUrl: `${site}/mes-achats`,
      });
      parti = await sendEmail({ to: destinataire, ...message });
      if (!parti) motif = "refus du fournisseur";
    }

    if (parti) {
      await admin
        .from("zabelie_fulfillment_notices")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", a.id);
      c.envoyes += 1;
    } else {
      // ⚠️ AUCUNE ADRESSE DANS `last_error` : le motif dit ce qui a échoué,
      // jamais À QUI. Un journal d'exploitation n'est pas un carnet d'adresses.
      await admin
        .from("zabelie_fulfillment_notices")
        .update({
          last_error: motif.slice(0, 200),
          due_at: new Date(
            Date.now() + reculHeures(a.attempts + 1) * 3_600_000
          ).toISOString(),
        })
        .eq("id", a.id);
      c.echecs += 1;
    }
  }

  // Journal à CHAQUE passage, y compris tout à zéro : sans ligne systématique,
  // « l'expéditeur n'a pas tourné » et « il a tourné, rien à envoyer » rendent
  // le même vide.
  journal({ issue: "termine", ...c });
  return c;
}
