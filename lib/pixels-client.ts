import { COOKIE_CONSENTEMENT, DUREE_CONSENTEMENT_S, cookiesRegies, domainesCookie, scriptsRegies, type EvenementPixel, type IdsPixels } from "@/lib/pixels";

/**
 * Chargement des pixels dans le navigateur — APRÈS consentement uniquement
 * (l'appelant, `components/seller-pixels.tsx`, le garantit).
 *
 * Les amorces reprennent la logique des extraits officiels (file d'attente
 * avant le chargement du script), réécrite en code ordinaire : aucune chaîne
 * n'est évaluée, les identifiants viennent de `idsPixels` (format strict).
 * Les scripts sont insérés par du code déjà autorisé : la CSP (`strict-dynamic`)
 * les admet, et n'ouvre les domaines des régies que sur ces pages.
 */

type Fenetre = Window & Record<string, unknown>;
type Fn = ((...args: unknown[]) => void) & Record<string, unknown>;

function ajouterScript(doc: Document, src: string) {
  if (doc.querySelector(`script[src="${src.replace(/"/g, "")}"]`)) return;
  const s = doc.createElement("script");
  s.async = true;
  s.src = src;
  doc.head.appendChild(s);
}

function amorceMeta(w: Fenetre) {
  if (w.fbq) return w.fbq as Fn;
  const n = function (...args: unknown[]) {
    if (typeof n.callMethod === "function") (n.callMethod as (...a: unknown[]) => void)(...args);
    else (n.queue as unknown[]).push(args);
  } as Fn;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  return n;
}

function amorceGoogle(w: Fenetre) {
  w.dataLayer = (w.dataLayer as unknown[]) ?? [];
  if (!w.gtag) {
    // gtag exige l'objet `arguments` lui-même, pas un tableau : d'où `function`.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      (w.dataLayer as unknown[]).push(arguments);
    };
  }
  return w.gtag as (...a: unknown[]) => void;
}

const METHODES_TIKTOK = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];

function amorceTiktok(w: Fenetre, id: string) {
  w.TiktokAnalyticsObject = "ttq";
  const ttq = ((w.ttq as unknown[]) ?? []) as unknown[] & Record<string, unknown>;
  w.ttq = ttq;
  for (const m of METHODES_TIKTOK) {
    if (typeof ttq[m] !== "function") ttq[m] = (...args: unknown[]) => { ttq.push([m, ...args]); };
  }
  const instances = (ttq._i as Record<string, unknown>) ?? {};
  ttq._i = instances;
  instances[id] = Object.assign([], { _u: "https://analytics.tiktok.com/i18n/pixel/events.js" });
  ttq._t = { ...((ttq._t as object) ?? {}), [id]: Date.now() };
  ttq._o = { ...((ttq._o as object) ?? {}), [id]: {} };
  return ttq as unknown as Record<string, (...a: unknown[]) => void>;
}

/** Charge les pixels du vendeur et envoie l'événement de la page. Idempotent par page. */
export function chargerPixels(ids: IdsPixels, evenement: EvenementPixel, w: Fenetre = window as unknown as Fenetre, doc: Document = document) {
  const achat = evenement.type === "achat" ? evenement : null;
  // Un achat ne se compte qu'UNE fois par commande, même si la page se recharge.
  if (achat) {
    const cle = `zab_px_achat_${achat.orderId}`;
    try { if (w.localStorage?.getItem(cle)) return; w.localStorage?.setItem(cle, "1"); } catch { /* stockage bloqué : l'eventID dédoublonne côté régie */ }
  }

  if (ids.meta) {
    const fbq = amorceMeta(w);
    fbq("init", ids.meta);
    fbq("track", "PageView");
    if (evenement.type === "produit") fbq("track", "ViewContent", { content_ids: [evenement.productId], content_type: "product", value: evenement.valeurHtg, currency: "HTG" });
    if (achat) fbq("track", "Purchase", { content_ids: [achat.productId], content_type: "product", value: achat.valeurHtg, currency: "HTG" }, { eventID: achat.orderId });
  }
  if (ids.google) {
    const gtag = amorceGoogle(w);
    gtag("js", new Date());
    gtag("config", ids.google);
    if (evenement.type === "produit") gtag("event", "view_item", { currency: "HTG", value: evenement.valeurHtg, items: [{ item_id: evenement.productId }] });
    if (achat) gtag("event", "purchase", { transaction_id: achat.orderId, currency: "HTG", value: achat.valeurHtg, items: [{ item_id: achat.productId }] });
  }
  if (ids.tiktok) {
    const ttq = amorceTiktok(w, ids.tiktok);
    ttq.page();
    if (evenement.type === "produit") ttq.track("ViewContent", { content_id: evenement.productId, content_type: "product", value: evenement.valeurHtg, currency: "HTG" });
    if (achat) ttq.track("CompletePayment", { content_id: achat.productId, content_type: "product", value: achat.valeurHtg, currency: "HTG" }, { event_id: achat.orderId });
  }
  for (const src of scriptsRegies(ids)) ajouterScript(doc, src);
}

/**
 * Enregistre le choix du visiteur (bandeau ou « Gérer les traceurs »). Un
 * REFUS efface aussi les cookies que les régies avaient posés sur notre
 * domaine : le retrait vaut pour l'avenir ET pour l'identifiant déjà déposé.
 */
export function ecrireConsentement(oui: boolean, doc: Document = document, loc: Pick<Location, "protocol" | "hostname"> = location) {
  const secure = loc.protocol === "https:" ? "; Secure" : "";
  doc.cookie = `${COOKIE_CONSENTEMENT}=${oui ? 1 : 0}; Max-Age=${DUREE_CONSENTEMENT_S}; Path=/; SameSite=Lax${secure}`;
  if (oui) return;
  for (const nom of cookiesRegies(doc.cookie)) {
    doc.cookie = `${nom}=; Max-Age=0; Path=/`;
    for (const d of domainesCookie(loc.hostname)) doc.cookie = `${nom}=; Max-Age=0; Path=/; Domain=${d}`;
  }
}
