#!/usr/bin/env node
/**
 * SONDE DE DÉPLOIEMENT — parcourir ce qui n'a jamais été parcouru.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE, ET C'EST UN AVEU. Le 2026-08-22, l'API v1 et
 * la messagerie ont été livrées en production sans que leur CHEMIN DE DONNÉES
 * ait jamais répondu à une requête réelle : le conteneur de l'agent n'a pas de
 * clés Supabase, et sa politique réseau refuse `zabelie.com` (403 sur CONNECT
 * — vérifié, le domaine résout bien vers Vercel).
 *
 * C'est exactement le défaut que `CLAUDE.md` nomme : « avant d'instrumenter un
 * chemin, le parcourir une fois de bout en bout ». Ne pouvant pas le parcourir,
 * on écrit l'instrument qui le parcourt — et on le donne au porteur.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   BASE=https://zabelie.com node scripts/zabelie-verifier-deploiement.mjs
 *
 * Aucune dépendance, aucun jeton, aucune écriture. Toutes les requêtes sont
 * des lectures ou des refus attendus : rien de ce script ne crée de commande,
 * de fil ni de message.
 *
 * ── CE QU'IL DISTINGUE, ET POURQUOI ÇA COMPTE ───────────────────────────────
 *
 * Trois verdicts, jamais deux :
 *
 *   OK           — le contrôle a été fait et il passe
 *   ÉCHEC        — le contrôle a été fait et il ne passe pas
 *   INDÉTERMINÉ  — le contrôle n'a PAS pu être fait
 *
 * Le troisième est le plus important, et c'est celui que la plupart des scripts
 * omettent. « Aucun défaut trouvé » et « rien n'a été vérifié » produisent le
 * même silence, et ce silence se lit comme une bonne nouvelle. Ici il porte un
 * nom.
 */

const BASE = (process.env.BASE || "").replace(/\/+$/, "");
if (!BASE) {
  console.error("BASE manquant.  Exemple :  BASE=https://zabelie.com node scripts/zabelie-verifier-deploiement.mjs");
  process.exit(2);
}

let ok = 0;
let echecs = 0;
let indetermines = 0;

function dire(verdict, titre, detail) {
  const marque = { OK: "  ✅", ÉCHEC: "  ❌", "INDÉTERMINÉ": "  ⚠️ " }[verdict];
  console.log(`${marque} ${titre}`);
  if (detail) console.log(`      ${detail}`);
  if (verdict === "OK") ok++;
  else if (verdict === "ÉCHEC") echecs++;
  else indetermines++;
}

async function poster(endpoint, corps) {
  const r = await fetch(`${BASE}/api/v1/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* corps illisible : `json` reste null, et l'appelant le verra */
  }
  return { status: r.status, json };
}

console.log(`\n═══ Sonde de déploiement — ${BASE} ═══\n`);

// ── 1. L'API v1 répond-elle seulement ? ─────────────────────────────────────
console.log("── API v1 — chemin de VALIDATION (ne touche pas la base) ──");

try {
  const r = await poster("inventer_un_nom", {});
  if (r.status === 404 && r.json?.code === "not_found") {
    dire("OK", "un endpoint hors registre rend 404", "le registre est bien la liste blanche");
  } else {
    dire("ÉCHEC", "endpoint inconnu mal traité", `HTTP ${r.status} · ${JSON.stringify(r.json)}`);
  }
} catch (e) {
  dire("INDÉTERMINÉ", "l'API v1 est injoignable", String(e).slice(0, 120));
}

for (const [titre, corps, champAttendu] of [
  ["une limite au-dessus du cap est REFUSÉE, pas tronquée", { limit: 50 }, "limit"],
  ["un intervalle de prix inversé est refusé", { minPriceHtg: 500, maxPriceHtg: 100 }, "minPriceHtg"],
  ["le type `service` est refusé en filtre", { kind: "service" }, "kind"],
]) {
  try {
    const r = await poster("search_products", corps);
    if (r.status === 400 && r.json?.code === "invalid_input" && r.json?.field === champAttendu) {
      dire("OK", titre, `champ nommé : ${r.json.field}`);
    } else {
      dire("ÉCHEC", titre, `HTTP ${r.status} · ${JSON.stringify(r.json)}`);
    }
  } catch (e) {
    dire("INDÉTERMINÉ", titre, String(e).slice(0, 120));
  }
}

// ── 2. Le chemin de DONNÉES — celui qui n'a jamais tourné ───────────────────
console.log("\n── API v1 — chemin de DONNÉES (touche la base) ──");

try {
  const r = await poster("search_products", { limit: 3 });
  if (r.status === 200 && r.json?.type === "product_results") {
    const n = r.json.results?.length ?? 0;
    dire(
      "OK",
      `search_products répond — ${n} produit(s)`,
      n === 0
        ? "⚠️ zéro résultat : le catalogue est vide OU le filtre `kind` exclut tout. " +
          "La v1 n'expose PAS les prestations (décision porteur 2026-08-01) — " +
          "un catalogue de services seuls rendrait légitimement zéro."
        : `premier : ${r.json.results[0].untrusted?.title ?? "(sans titre)"} · ` +
          `${r.json.results[0].priceHtg} HTG`
    );
    // La frontière de confiance est-elle bien là dans la VRAIE réponse ?
    const p = r.json.results?.[0];
    if (p) {
      if (p.untrusted && typeof p.untrusted.title === "string" && !("title" in p)) {
        dire("OK", "la frontière `untrusted` tient en production", "le texte du vendeur est isolé du prix et du stock");
      } else {
        dire("ÉCHEC", "la frontière `untrusted` a fondu", JSON.stringify(Object.keys(p)));
      }
    }
  } else if (r.status === 500) {
    // Même règle que partout ici : « la base est injoignable » n'est pas un
    // défaut du code, c'est un contrôle qui n'a pas pu être fait.
    const env =
      typeof r.json?.message === "string" && r.json.message.startsWith("Service indisponible");
    dire(
      env ? "INDÉTERMINÉ" : "ÉCHEC",
      env
        ? "search_products : la base n'a pas pu être interrogée"
        : "search_products rend 500 pour une raison INTERNE",
      env
        ? "500 « Service indisponible » — variables Supabase absentes sur ce " +
          "déploiement. Le chemin de données reste NON PARCOURU."
        : `${JSON.stringify(r.json)} — le handler ou la validation de sortie a ` +
          "échoué. Le journal de la route nomme l'endpoint et les écarts."
    );
  } else {
    dire("ÉCHEC", "search_products rend une forme inattendue", `HTTP ${r.status} · ${JSON.stringify(r.json)}`);
  }
} catch (e) {
  dire("INDÉTERMINÉ", "search_products injoignable", String(e).slice(0, 120));
}

try {
  const r = await poster("get_user_orders", {});
  if (r.status === 401 && r.json?.code === "unauthenticated") {
    dire("OK", "get_user_orders exige une session", "un anonyme ne voit aucune commande");
  } else if (r.status === 500) {
    /* ⚠️ CLASSIFICATION CORRIGÉE le 2026-08-22, après que la sonde a annoncé
     * « c'est une fuite si des commandes sortent » sur un HTTP 500. Un 500
     * n'est pas une fuite : la base était injoignable et l'authentification
     * n'a jamais été atteinte. Traiter les deux pareil aurait envoyé le
     * porteur chercher une faille de sécurité là où il manquait une variable
     * d'environnement — le pire usage possible de son temps. */
    dire(
      "INDÉTERMINÉ",
      "get_user_orders : l'authentification n'a pas pu être atteinte",
      "HTTP 500 — la base est injoignable, donc ce contrôle ne dit RIEN sur " +
        "l'authentification. Ce n'est pas une fuite ; c'est un contrôle non fait."
    );
  } else {
    dire(
      "ÉCHEC",
      "get_user_orders ne refuse PAS un appel anonyme",
      `HTTP ${r.status} · ${JSON.stringify(r.json)} — c'est une fuite si des commandes sortent`
    );
  }
} catch (e) {
  dire("INDÉTERMINÉ", "get_user_orders injoignable", String(e).slice(0, 120));
}

// ── 3. La messagerie — les surfaces existent-elles ? ────────────────────────
console.log("\n── Messagerie (0090) ──");

try {
  const r = await fetch(`${BASE}/messages`, { redirect: "manual" });
  if (r.status >= 300 && r.status < 400) {
    const dest = r.headers.get("location") ?? "";
    if (dest.includes("/connexion")) {
      dire("OK", "/messages renvoie un anonyme vers la connexion", dest);
    } else {
      dire("ÉCHEC", "/messages redirige ailleurs que la connexion", dest);
    }
  } else if (r.status === 200) {
    dire("ÉCHEC", "/messages rend 200 à un ANONYME", "la boîte ne doit jamais s'afficher sans session");
  } else {
    dire("INDÉTERMINÉ", `/messages rend ${r.status}`, "ni redirection ni page — à regarder");
  }
} catch (e) {
  dire("INDÉTERMINÉ", "/messages injoignable", String(e).slice(0, 120));
}

try {
  const r = await fetch(`${BASE}/api/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId: "00000000-0000-0000-0000-000000000000", body: "sonde" }),
  });
  const j = await r.json().catch(() => null);
  if (r.status === 401) {
    dire("OK", "POST /api/messages refuse un anonyme", "401, aucun fil créé");
  } else if (r.status === 503) {
    /* ⚠️ DEUX 503 DIFFÉRENTS, DEUX GESTES DIFFÉRENTS — et les confondre
     * enverrait le porteur appliquer une migration déjà appliquée. Le corps
     * les sépare :
     *   « Service indisponible. »  → variables Supabase absentes (env)
     *   tout autre message          → `api.feature.off`, donc 0090 manquante
     * La seconde est un ÉCHEC réel ; la première dit seulement que le
     * contrôle n'a pas pu être fait. */
    const env = typeof j?.error === "string" && j.error.startsWith("Service indisponible");
    if (env) {
      dire(
        "INDÉTERMINÉ",
        "POST /api/messages : le refus n'a pas pu être atteint",
        "503 « Service indisponible » — les variables Supabase manquent sur ce " +
          "déploiement. Rien n'est dit sur l'autorisation."
      );
    } else {
      dire(
        "ÉCHEC",
        "POST /api/messages rend 503 — fonctionnalité inactive",
        "`api.feature.off` : la migration 0090 n'est pas appliquée sur la base " +
          "de CE déploiement. Elle l'est sur le projet zabelie-digi depuis le " +
          "2026-08-22 19:33:46 UTC — vérifiez que le déploiement pointe bien dessus."
      );
    }
  } else if (r.status === 500) {
    dire(
      "INDÉTERMINÉ",
      "POST /api/messages : le refus n'a pas pu être atteint",
      "HTTP 500 — si le corps est VIDE, la route lève avant de pouvoir répondre " +
        "(`createClient()` hors du `try`). Sur ce déploiement, cela signale des " +
        "variables Supabase absentes, pas un défaut d'autorisation."
    );
  } else {
    dire("ÉCHEC", "POST /api/messages ne refuse pas un anonyme", `HTTP ${r.status} · ${JSON.stringify(j)}`);
  }
} catch (e) {
  dire("INDÉTERMINÉ", "POST /api/messages injoignable", String(e).slice(0, 120));
}

// ── 4. Les notifications partent-elles ? ────────────────────────────────────
console.log("\n── Notifications ──");
console.log(
  "  ⚠️  `RESEND_API_KEY` ne se lit PAS d'ici : /api/admin/coherence est réservée\n" +
    "      au rôle admin. Connectez-vous et lisez `integrations.email.configure`.\n" +
    "      Sans elle, outbox (0061) et messagerie (0090) se drainent dans le vide."
);

// ── Verdict ────────────────────────────────────────────────────────────────
console.log(`\n═══ ${ok} OK · ${echecs} échec(s) · ${indetermines} indéterminé(s) ═══`);
if (indetermines > 0) {
  console.log(
    "⚠️  Un INDÉTERMINÉ n'est pas un succès. Il dit qu'un contrôle n'a pas pu\n" +
      "    être fait — et « aucun défaut trouvé » ne doit jamais se confondre\n" +
      "    avec « rien n'a été vérifié »."
  );
}
process.exit(echecs > 0 ? 1 : 0);
