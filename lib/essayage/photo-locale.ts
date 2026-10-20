/**
 * Essayage virtuel — ce qui reste SUR LE TÉLÉPHONE de l'acheteur (tâche 4.4).
 *
 *   • la version du consentement acceptée (localStorage) ;
 *   • la photo, seulement si l'acheteur a coché « Garder ma photo sur ce
 *     téléphone » (IndexedDB : un Blob, sans passage en base64).
 *
 * Rien de tout cela ne part au serveur de lui-même. La photo gardée n'est lue
 * qu'au moment d'un essai, et `effacerPhoto` la supprime de la base du
 * navigateur (contrôlé dans l'e2e, tâche 4.5).
 *
 * Toute lecture ou écriture peut échouer (navigation privée, stockage plein,
 * stockage refusé) : chaque fonction se replie sur « rien de gardé » au lieu
 * de lever, et l'essayage marche sans.
 */

/** À changer quand le texte du consentement change : tous les acheteurs le revoient. */
export const VERSION_CONSENTEMENT = "2026-10-19";

const CLE_CONSENTEMENT = "zabelie.essayage.consentement";
const BASE = "zabelie-essayage";
const MAGASIN = "photo";
const CLE_PHOTO = "moi";

export function consentementDonne(): boolean {
  try {
    return window.localStorage.getItem(CLE_CONSENTEMENT) === VERSION_CONSENTEMENT;
  } catch {
    return false;
  }
}

export function donnerConsentement(): void {
  try {
    window.localStorage.setItem(CLE_CONSENTEMENT, VERSION_CONSENTEMENT);
  } catch {
    // Stockage refusé : le consentement vaut pour cette visite, et sera redemandé.
  }
}

function ouvrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const demande = window.indexedDB.open(BASE, 1);
      demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN);
      demande.onsuccess = () => resolve(demande.result);
      demande.onerror = () => resolve(null);
      demande.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function operation<T>(mode: IDBTransactionMode, agir: (magasin: IDBObjectStore) => IDBRequest, lire: (r: IDBRequest) => T, repli: T): Promise<T> {
  const base = await ouvrir();
  if (!base) return repli;
  return new Promise<T>((resolve) => {
    try {
      const transaction = base.transaction(MAGASIN, mode);
      const requete = agir(transaction.objectStore(MAGASIN));
      transaction.oncomplete = () => {
        base.close();
        resolve(lire(requete));
      };
      transaction.onerror = transaction.onabort = () => {
        base.close();
        resolve(repli);
      };
    } catch {
      base.close();
      resolve(repli);
    }
  });
}

export function lirePhoto(): Promise<Blob | null> {
  return operation("readonly", (m) => m.get(CLE_PHOTO), (r) => (r.result instanceof Blob ? r.result : null), null);
}

export function garderPhoto(photo: Blob): Promise<boolean> {
  return operation("readwrite", (m) => m.put(photo, CLE_PHOTO), () => true, false);
}

export function effacerPhoto(): Promise<boolean> {
  return operation("readwrite", (m) => m.delete(CLE_PHOTO), () => true, false);
}
