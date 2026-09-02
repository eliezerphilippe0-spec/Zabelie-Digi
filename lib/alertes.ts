import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailEnabled, sendEmail } from "./zabelie-email";

/**
 * L'ALERTE SORTANTE — C2.3 de `docs/31`, « l'écart le plus dangereux du dépôt ».
 *
 * Jusqu'ici, tout ce que le système savait de grave allait dans `console.error`
 * : un journal Vercel que personne n'ouvre. C'est ce qui a coûté onze jours de
 * silence entre le 11 et le 22 août — sept acheteurs perdus, un verdict
 * `bac_a_sable` calculé chaque nuit par le cron de cohérence, et aucun humain
 * prévenu. « L'absence de signal doit être un signal » vaut aussi pour
 * l'exploitation.
 *
 * ─── CE QUE C'EST ──────────────────────────────────────────────────────────
 * Un e-mail aux comptes `role = 'admin'`, par le même `sendEmail` que les
 * notifications transactionnelles. Pas de nouveau service, pas de nouvelle
 * variable : si `RESEND_API_KEY` est posée, les admins reçoivent ; sinon la
 * fonction le DIT dans sa réponse au lieu de faire semblant.
 *
 * ─── CE QUE CE N'EST PAS ───────────────────────────────────────────────────
 * Ni Sentry (C2.1 — service externe, validation porteur), ni un pager. Le cron
 * de cohérence passe une fois par jour : au pire, une panne est signalée le
 * lendemain matin. C'est un cran au-dessus de « jamais », pas de « tout de
 * suite ».
 *
 * ─── POURQUOI LES ADMINS ET PAS UNE VARIABLE ───────────────────────────────
 * Une adresse en variable d'environnement est une adresse qu'on oublie de
 * changer. Le rôle `admin` en base est déjà la liste des gens qui ont le droit
 * de voir `/api/admin/coherence` ; ce sont eux qui doivent savoir qu'elle a
 * quelque chose à dire.
 *
 * L'adresse e-mail n'est pas dans `profiles` (liste blanche `0015`) : elle se
 * lit par `auth.admin.getUserById`, comme `lib/messagerie-notify.ts`.
 */

export type ResultatAlerte = {
  statut: "envoyee" | "partielle" | "aucun_destinataire" | "email_non_configure" | "echec";
  destinataires: number;
  envoyes: number;
  detail: string;
};

/** Envoi injectable pour les tests — la vraie fonction parle à Resend. */
export type Envoyeur = (input: { to: string; subject: string; html: string }) => Promise<boolean>;

export async function alerterAdmins(
  admin: SupabaseClient,
  sujet: string,
  corpsHtml: string,
  deps: { envoyer?: Envoyeur; emailActif?: () => boolean } = {}
): Promise<ResultatAlerte> {
  const envoyer = deps.envoyer ?? sendEmail;
  const emailActif = deps.emailActif ?? isEmailEnabled;

  if (!emailActif()) {
    return {
      statut: "email_non_configure",
      destinataires: 0,
      envoyes: 0,
      detail: "RESEND_API_KEY absente — l'alerte n'a pas pu partir. Elle est dans les journaux, et nulle part ailleurs.",
    };
  }

  const { data: admins, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  if (error) {
    return { statut: "echec", destinataires: 0, envoyes: 0, detail: `lecture des admins impossible — ${error.message}` };
  }
  const ids = (admins ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) {
    return {
      statut: "aucun_destinataire",
      destinataires: 0,
      envoyes: 0,
      detail: "aucun profil avec role = 'admin' — personne à prévenir",
    };
  }

  let envoyes = 0;
  for (const id of ids) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      const to = data?.user?.email;
      if (!to) continue;
      if (await envoyer({ to, subject: sujet, html: corpsHtml })) envoyes++;
    } catch {
      /* un admin injoignable n'empêche pas les autres d'être prévenus */
    }
  }

  const statut = envoyes === 0 ? "echec" : envoyes < ids.length ? "partielle" : "envoyee";
  return {
    statut,
    destinataires: ids.length,
    envoyes,
    detail: `${envoyes}/${ids.length} admin(s) prévenu(s)`,
  };
}

/** Corps HTML minimal, sans secret, lisible sur un téléphone. */
export function corpsAlerte(titre: string, lignes: Array<[string, string | number | null]>): string {
  const esc = (s: unknown) =>
    String(s ?? "—").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
  const rows = lignes.map(([k, v]) => `<tr><td style="padding:2px 8px 2px 0"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("");
  return `<p>${esc(titre)}</p><table>${rows}</table><p style="color:#666;font-size:12px">Zabelie · /api/admin/coherence</p>`;
}
