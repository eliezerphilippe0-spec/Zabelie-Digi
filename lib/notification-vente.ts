/**
 * Le TEXTE de la notification de vente, écrit par le service worker (le signal
 * arrive vide, `lib/web-push.ts`). Module pur, sans dépendance : il est
 * embarqué dans `app/sw.ts`, qui ne doit pas tirer tout `lib/i18n.ts`.
 *
 * Le service worker ne connaît ni le cookie de langue ni le compte : il lit la
 * langue du NAVIGATEUR. Anglais et espagnol ont leur texte ; sinon kreyòl ET
 * français, côte à côte — les deux langues du marché, et la langue de
 * référence du produit en premier.
 */
export const URL_VENTES = "/mes-ventes";

export function texteNotificationVente(langueNavigateur: string | undefined): { titre: string; corps: string } {
  const l = (langueNavigateur ?? "").toLowerCase();
  if (l.startsWith("en")) return { titre: "Zabelie: new sale!", corps: "Open My sales to see the order." };
  if (l.startsWith("es")) return { titre: "Zabelie: ¡nueva venta!", corps: "Abra Mis ventas para ver el pedido." };
  return { titre: "Zabelie : Nouvo vant ! Nouvelle vente !", corps: "Louvri Vant mwen yo. Ouvrez Mes ventes." };
}

/* Types STRUCTURELS minimaux : ce module ne tire ni le DOM ni le webworker, il
 * reste testable tel quel et embarquable dans `app/sw.ts`. */
type Enregistrement = { showNotification(titre: string, options: { body: string; icon: string; data: { url: string } }): Promise<void> };
type Fenetre = { url: string; focus(): Promise<unknown> };
type Clients = {
  matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly Fenetre[]>;
  openWindow(url: string): Promise<unknown>;
};

/** À chaque signal, UNE notification (sans `tag` : chaque vente alerte, aucune ne remplace la précédente en silence). */
export function afficherNotificationVente(enregistrement: Enregistrement, langueNavigateur: string | undefined): Promise<void> {
  const { titre, corps } = texteNotificationVente(langueNavigateur);
  return enregistrement.showNotification(titre, { body: corps, icon: "/icons/icon-192.png", data: { url: URL_VENTES } });
}

/** Un clic : remet au premier plan un onglet « Mes ventes » déjà ouvert, sinon en ouvre un. */
export async function ouvrirMesVentes(clients: Clients, origine: string): Promise<unknown> {
  for (const fenetre of await clients.matchAll({ type: "window", includeUncontrolled: true })) {
    const url = new URL(fenetre.url);
    if (url.origin === origine && url.pathname === URL_VENTES) return fenetre.focus();
  }
  return clients.openWindow(URL_VENTES);
}
