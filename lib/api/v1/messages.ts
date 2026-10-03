import type { Lang } from "@/lib/i18n";

/**
 * Messages de l'API (publique ET vendeur), dans les QUATRE langues du produit.
 *
 * Le `code` d'erreur reste la vérité machine (stable, à tester côté client) ;
 * le `message` est pour l'humain qui lit la réponse, dans sa langue :
 * `?lang=` d'abord, puis `Accept-Language`, sinon le français.
 * `tests/api-seller.test.ts` et `tests/api-v1-langues.test.ts` exigent les
 * quatre traductions de chaque clé.
 */
export const LANGUES_API: readonly Lang[] = ["fr", "ht", "en", "es"];

export function langueApi(headers: Headers, url?: string): Lang {
  const demandee = url ? new URL(url).searchParams.get("lang") : null;
  if (demandee && (LANGUES_API as readonly string[]).includes(demandee)) return demandee as Lang;
  for (const morceau of (headers.get("accept-language") ?? "").split(",")) {
    const tag = morceau.split(";")[0].trim().toLowerCase().split("-")[0];
    if ((LANGUES_API as readonly string[]).includes(tag)) return tag as Lang;
  }
  return "fr";
}

type Texte = Record<Lang, string>;

export const MESSAGES = {
  key_missing: {
    fr: "Clé d'API absente ou mal formée (Authorization: Bearer zb_live_…).",
    ht: "Kle API a manke oswa li pa byen fòme (Authorization: Bearer zb_live_…).",
    en: "API key missing or malformed (Authorization: Bearer zb_live_…).",
    es: "Clave de API ausente o mal formada (Authorization: Bearer zb_live_…).",
  },
  key_invalid: {
    fr: "Clé d'API invalide ou révoquée.",
    ht: "Kle API a pa valab oswa yo anile l.",
    en: "Invalid or revoked API key.",
    es: "Clave de API no válida o revocada.",
  },
  scope_missing: {
    fr: "Cette clé n'a pas la portée {scope}.",
    ht: "Kle sa a pa gen dwa {scope}.",
    en: "This key does not have the {scope} scope.",
    es: "Esta clave no tiene el alcance {scope}.",
  },
  endpoint_unknown: {
    fr: "Endpoint inconnu : {name}.",
    ht: "Nou pa konnen endpoint sa a : {name}.",
    en: "Unknown endpoint: {name}.",
    es: "Endpoint desconocido: {name}.",
  },
  unavailable: {
    fr: "Service momentanément indisponible.",
    ht: "Sèvis la pa disponib pou kounye a.",
    en: "Service temporarily unavailable.",
    es: "Servicio no disponible por el momento.",
  },
  rate_limited: {
    fr: "Trop de requêtes. Réessayez dans une minute.",
    ht: "Twòp demann. Eseye ankò nan yon minit.",
    en: "Too many requests. Try again in one minute.",
    es: "Demasiadas solicitudes. Inténtalo de nuevo en un minuto.",
  },
  body_invalid: {
    fr: "Corps JSON illisible ou supérieur à 16 Kio.",
    ht: "Kò JSON la pa lizib oswa li depase 16 Kio.",
    en: "Unreadable JSON body or larger than 16 KiB.",
    es: "Cuerpo JSON ilegible o mayor de 16 KiB.",
  },
  input_invalid: {
    fr: "Entrée invalide (champ : {field}).",
    ht: "Done yo pa valab (chan : {field}).",
    en: "Invalid input (field: {field}).",
    es: "Entrada no válida (campo: {field}).",
  },
  cursor_invalid: {
    fr: "Curseur illisible. Reprenez `nextCursor` tel quel.",
    ht: "Kisè a pa lizib. Reprann `nextCursor` jan li ye a.",
    en: "Unreadable cursor. Pass `nextCursor` back unchanged.",
    es: "Cursor ilegible. Devuelve `nextCursor` sin modificarlo.",
  },
  read_failed: {
    fr: "Lecture impossible pour le moment.",
    ht: "Nou pa ka li done yo kounye a.",
    en: "Unable to read the data right now.",
    es: "No se pueden leer los datos en este momento.",
  },
  product_not_found: {
    fr: "Produit introuvable dans votre boutique.",
    ht: "Nou pa jwenn pwodui sa a nan boutik ou.",
    en: "Product not found in your shop.",
    es: "Producto no encontrado en tu tienda.",
  },
  product_not_published: {
    fr: "Le produit n'est pas publié.",
    ht: "Pwodui a poko pibliye.",
    en: "The product is not published.",
    es: "El producto no está publicado.",
  },
  product_out_of_stock: {
    fr: "Le produit est en rupture de stock.",
    ht: "Pwodui a fini nan stòk.",
    en: "The product is out of stock.",
    es: "El producto está agotado.",
  },
  internal: {
    fr: "Erreur interne.",
    ht: "Erè entèn.",
    en: "Internal error.",
    es: "Error interno.",
  },
  contract: {
    fr: "Réponse retenue : non conforme au contrat.",
    ht: "Nou kenbe repons lan : li pa respekte kontra a.",
    en: "Response withheld: it does not match the contract.",
    es: "Respuesta retenida: no cumple el contrato.",
  },
  auth_required: {
    fr: "Authentification requise.",
    ht: "Ou dwe konekte.",
    en: "Authentication required.",
    es: "Se requiere autenticación.",
  },
  product_unknown: {
    fr: "Produit introuvable.",
    ht: "Nou pa jwenn pwodui a.",
    en: "Product not found.",
    es: "Producto no encontrado.",
  },
  seller_unknown: {
    fr: "Vendeur introuvable.",
    ht: "Nou pa jwenn vandè a.",
    en: "Seller not found.",
    es: "Vendedor no encontrado.",
  },
  order_unknown: {
    fr: "Commande introuvable.",
    ht: "Nou pa jwenn kòmand lan.",
    en: "Order not found.",
    es: "Pedido no encontrado.",
  },
  compare_too_few: {
    fr: "Moins de deux produits comparables : au moins un identifiant est introuvable ou non publié.",
    ht: "Mwens pase de pwodui pou konpare : omwen youn nan idantifyan yo pa egziste oswa li pa pibliye.",
    en: "Fewer than two comparable products: at least one identifier is unknown or not published.",
    es: "Menos de dos productos comparables: al menos un identificador no existe o no está publicado.",
  },
  use_post: {
    fr: "Utilisez POST avec un corps JSON.",
    ht: "Sèvi ak POST ak yon kò JSON.",
    en: "Use POST with a JSON body.",
    es: "Usa POST con un cuerpo JSON.",
  },
} satisfies Record<string, Texte>;

export type CleMessage = keyof typeof MESSAGES;

export function estCleMessage(v: string): v is CleMessage {
  return Object.prototype.hasOwnProperty.call(MESSAGES, v);
}

export function message(lang: Lang, cle: CleMessage, vars: Record<string, string> = {}): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), MESSAGES[cle][lang]);
}
