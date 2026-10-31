import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";

/**
 * Le bouton « notifications de vente » (niveau 2), rendu sur son code réel :
 * rien sans clé ; navigateur sans notifications, on le DIT ; l'activation
 * abonne avec la clé publique et inscrit l'adresse ; un refus du serveur ne
 * laisse pas d'abonnement orphelin.
 */
type Element = { type: unknown; props: Record<string, unknown> };
const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function texte(arbre: unknown): string {
  if (Array.isArray(arbre)) return arbre.map(texte).join(" ");
  if (typeof arbre === "string") return arbre;
  if (!arbre || typeof arbre !== "object") return "";
  return texte((arbre as Element).props?.children);
}
function bouton(arbre: unknown, libelle: string): Element | undefined {
  if (Array.isArray(arbre)) return arbre.map((c) => bouton(c, libelle)).find(Boolean);
  if (!arbre || typeof arbre !== "object") return undefined;
  const n = arbre as Element;
  if (n.type === "button" && n.props.children === libelle) return n;
  return bouton(n.props?.children, libelle);
}
const LABELS = { activer: "Activer", actif: "Actif", desactiver: "Désactiver", nonSupporte: "Non supporté", refuse: "Bloqué", erreur: "Erreur", enCours: "…" };
const CLE = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");

function monter(options: { supporte?: boolean; permission?: string; existant?: boolean; serveurOk?: boolean } = {}) {
  const slots: unknown[] = [];
  let curseur = 0;
  const effets: Array<() => unknown> = [];
  const react = {
    useState(initial: unknown) {
      const i = curseur++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v: unknown) => { slots[i] = v; }];
    },
    useEffect(effet: () => unknown) { curseur++; effets.push(effet); },
  };
  const journal = { abonnements: [] as Array<{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }>, appels: [] as Array<{ method: string; body: string }>, desabonnes: 0 };
  const abonnement = { endpoint: "https://fcm.googleapis.com/fcm/send/appareil", unsubscribe: async () => { journal.desabonnes += 1; return true; } };
  const pushManager = {
    getSubscription: async () => (options.existant ? abonnement : null),
    subscribe: async (o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => { journal.abonnements.push(o); return abonnement; },
  };
  const reg = { pushManager };
  const supporte = options.supporte !== false;
  const navigateur = supporte ? { serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg } } : {};
  const fenetre: Record<string, unknown> = supporte ? { PushManager: {}, Notification: {} } : {};
  const Notification = { permission: options.permission ?? "default", requestPermission: async () => "granted" };
  const source = loadRoute("components/notifications-vente.tsx", {
    react, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  }, {}, {
    navigator: navigateur, window: fenetre, Notification, atob, setTimeout, Uint8Array, ArrayBuffer,
    fetch: async (_url: string, init: { method: string; body: string }) => { journal.appels.push(init); return { ok: options.serveurOk !== false }; },
  }) as unknown as { NotificationsVente(p: { clePublique: string | null; labels: typeof LABELS }): Element | null };
  const rendre = (cle: string | null = CLE) => { curseur = 0; return source.NotificationsVente({ clePublique: cle, labels: LABELS }); };
  const vider = async () => { for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r)); };
  const lancer = async () => { rendre(); for (const e of effets.splice(0)) e(); await vider(); return rendre(); };
  return { journal, rendre, lancer, vider };
}

test("sans clé publique (clés VAPID non posées) : rien n'est rendu, rien n'est appelé", async () => {
  const m = monter();
  assert.equal(m.rendre(null), null);
  assert.equal(m.journal.appels.length, 0);
});

test("navigateur sans notifications : on le dit (geste iPhone compris), aucun bouton", async () => {
  const arbre = await monter({ supporte: false }).lancer();
  assert.match(texte(arbre), /Non supporté/);
  assert.equal(bouton(arbre, LABELS.activer), undefined);
});

test("notifications bloquées dans les réglages : on le dit", async () => {
  assert.match(texte(await monter({ permission: "denied" }).lancer()), /Bloqué/);
});

test("un appareil déjà abonné est réinscrit à la visite et s'affiche actif", async () => {
  const m = monter({ existant: true });
  assert.match(texte(await m.lancer()), /Actif/);
  assert.equal(m.journal.appels[0].method, "POST");
  assert.equal(JSON.parse(m.journal.appels[0].body).endpoint, "https://fcm.googleapis.com/fcm/send/appareil");
});

test("activation : abonnement visible avec la clé publique (65 octets), adresse inscrite, état actif", async () => {
  const m = monter();
  const arbre = await m.lancer();
  await (bouton(arbre, LABELS.activer)!.props.onClick as () => Promise<void>)();
  await m.vider();
  assert.equal(m.journal.abonnements.length, 1);
  assert.equal(m.journal.abonnements[0].userVisibleOnly, true, "chaque signal affiche une notification");
  assert.equal(m.journal.abonnements[0].applicationServerKey.length, 65);
  assert.equal(m.journal.abonnements[0].applicationServerKey[0], 4);
  assert.equal(m.journal.appels.at(-1)!.method, "POST");
  assert.match(texte(m.rendre()), /Actif/);
});

test("activation refusée par le serveur : l'abonnement est retiré, l'erreur est dite", async () => {
  const m = monter({ serveurOk: false });
  const arbre = await m.lancer();
  await (bouton(arbre, LABELS.activer)!.props.onClick as () => Promise<void>)();
  await m.vider();
  assert.equal(m.journal.desabonnes, 1, "pas d'abonnement orphelin");
  assert.match(texte(m.rendre()), /Erreur/);
});
