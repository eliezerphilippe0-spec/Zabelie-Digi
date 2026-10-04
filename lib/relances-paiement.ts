import type { SupabaseClient } from "@supabase/supabase-js";
import { LANGS, t, type Lang } from "@/lib/i18n";

/**
 * RELANCE DES PAIEMENTS ABANDONNÉS (0124).
 *
 * Un e-mail, une seule fois par acheteur et par produit, quand un paiement
 * RÉEL n'a pas abouti. La sélection vit en base (`zabelie_relances_dues`) :
 * ici, seulement le texte et l'ordre des gestes.
 *
 * ⚠️ L'ORDRE COMPTE : la relance est RÉSERVÉE (ligne unique en base) AVANT
 * l'envoi. Deux passages concurrents ne peuvent donc pas écrire deux fois ;
 * au pire, un envoi qui échoue après réservation n'est pas retenté — un
 * e-mail manqué vaut mieux qu'un acheteur harcelé.
 *
 * ⚠️ LE TITRE EST ÉCRIT PAR UN VENDEUR : échappé avant d'entrer dans le HTML.
 */

export type RelanceDue = {
  order_id: string;
  buyer_id: string;
  product_id: string;
  email: string;
  lang: string;
  titre: string;
  slug: string;
  prix_htg: number;
  jeton: string | null;
};

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** `12500` → `12 500` (espace fine insécable, lisible dans les quatre langues). */
export function montant(htg: number): string {
  return String(Math.trunc(htg)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function langueRelance(brute: string): Lang {
  return (LANGS as string[]).includes(brute) ? (brute as Lang) : "ht";
}

export function emailRelance(r: { lang: Lang; titre: string; slug: string; prixHtg: number; jeton: string; base: string }) {
  const titre = echapper(r.titre);
  const vars = { titre, prix: montant(r.prixHtg) };
  const fiche = `${r.base}/produit/${encodeURIComponent(r.slug)}`;
  const desabo = `${r.base}/desabonnement/${encodeURIComponent(r.jeton)}`;
  const html =
    `<p>${t(r.lang, "relance.hello")}</p>` +
    `<p>${t(r.lang, "relance.body", vars)}</p>` +
    `<p><a href="${fiche}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600">${t(r.lang, "relance.cta")}</a></p>` +
    `<p style="color:#555;font-size:13px">${t(r.lang, "relance.note")}</p>` +
    `<p style="color:#888;font-size:12px">${t(r.lang, "relance.why")} <a href="${desabo}">${t(r.lang, "relance.unsubscribe")}</a></p>`;
  return {
    // Le sujet n'est pas du HTML : le titre y entre brut, sans retour à la ligne.
    subject: t(r.lang, "relance.subject", { titre: r.titre.replace(/[\r\n]+/g, " ").slice(0, 120) }),
    html,
    headers: {
      "List-Unsubscribe": `<${r.base}/api/desabonnement?jeton=${encodeURIComponent(r.jeton)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export type BilanRelances = { dues: number; envoyees: number; echecs: number; dejaReservees: number; erreurBase: boolean };

/** Un passage : lit les relances dues, réserve, envoie, marque. */
export async function envoyerRelances(
  admin: SupabaseClient,
  envoyer: (m: { to: string; subject: string; html: string; headers: Record<string, string> }) => Promise<boolean>,
  base: string,
  limite = 50,
): Promise<BilanRelances> {
  const bilan: BilanRelances = { dues: 0, envoyees: 0, echecs: 0, dejaReservees: 0, erreurBase: false };
  const { data, error } = await admin.rpc("zabelie_relances_dues", { p_limite: limite });
  if (error || !data) return { ...bilan, erreurBase: true };
  const dues = data as RelanceDue[];
  bilan.dues = dues.length;
  for (const r of dues) {
    const { data: reservee, error: errRes } = await admin
      .from("zabelie_relances_paiement")
      .insert({ buyer_id: r.buyer_id, product_id: r.product_id, order_id: r.order_id })
      .select("id")
      .maybeSingle();
    if (errRes || !reservee) {
      // 23505 : un autre passage l'a prise. Toute autre erreur : on n'envoie pas.
      if (errRes?.code === "23505") bilan.dejaReservees++;
      else bilan.erreurBase = true;
      continue;
    }
    const jeton = r.jeton ?? ((await admin.rpc("zabelie_email_jeton", { p_user: r.buyer_id })).data as string | null);
    const ok = jeton
      ? await envoyer({ to: r.email, ...emailRelance({ lang: langueRelance(r.lang), titre: r.titre, slug: r.slug, prixHtg: r.prix_htg, jeton, base }) })
      : false;
    await admin
      .from("zabelie_relances_paiement")
      .update(ok ? { statut: "envoyee", envoyee_at: new Date().toISOString() } : { statut: "echec" })
      .eq("id", (reservee as { id: string }).id);
    if (ok) bilan.envoyees++;
    else bilan.echecs++;
  }
  return bilan;
}
