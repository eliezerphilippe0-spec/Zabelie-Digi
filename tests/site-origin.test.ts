import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { siteOrigin } from "../lib/site-origin";

/**
 * `siteOrigin` est une fonction de SÉCURITÉ autant que de confort : elle
 * décide vers quel hôte on renvoie un utilisateur après authentification ou
 * après paiement. Elle est donc testée comme `safeNext` — sur ce qu'elle
 * accepte ET sur ce qu'elle refuse.
 *
 * ⚠️ Le cas nominal est le MOINS intéressant. Ce qui compte :
 *   • apex ↔ www doit garder l'origine de la REQUÊTE (sinon cookie perdu) ;
 *   • un hôte étranger ne doit JAMAIS être suivi (sinon open redirect via
 *     l'en-tête `Host`, que `safeNext` referme sur le chemin et qu'on
 *     rouvrirait par l'hôte).
 * Ces deux exigences tirent dans des directions opposées : c'est pour ça que
 * la règle est étroite, et c'est ce que ce fichier épingle.
 */

const CONFIG = "https://zabelie.com";

test("apex ↔ www — l'origine de la requête est conservée dans les deux sens", () => {
  assert.equal(
    siteOrigin("https://www.zabelie.com/auth/callback?code=x", CONFIG),
    "https://www.zabelie.com",
    "visiteur sur www, config apex : le renvoyer sur l'apex lui ferait perdre le cookie posé sur www"
  );
  assert.equal(
    siteOrigin("https://zabelie.com/auth/callback?code=x", "https://www.zabelie.com"),
    "https://zabelie.com",
    "le sens inverse casse exactement pareil"
  );
});

test("même hôte — l'origine configurée, inchangée", () => {
  assert.equal(
    siteOrigin("https://zabelie.com/auth/callback", CONFIG),
    "https://zabelie.com"
  );
  assert.equal(
    siteOrigin("https://zabelie.com/x", "https://zabelie.com/"),
    "https://zabelie.com",
    "une barre finale dans la variable ne doit pas produire une double barre"
  );
});

test("hôte ÉTRANGER — jamais suivi, on impose l'origine configurée", () => {
  /* C'est le cas qui empêche l'open redirect. `url.origin` dérive de
     l'en-tête `Host`, fourni par le client : si on le suivait largement, un
     `Host: evil.com` détournerait la redirection post-connexion — un lien de
     phishing parti d'un domaine de confiance, exactement ce que `safeNext`
     referme du côté du chemin. */
  for (const hostile of [
    "https://evil.com/auth/callback?code=x",
    "https://zabelie.com.evil.com/auth/callback",
    "https://wwwzabelie.com/auth/callback",
    "https://www.zabelie.com.evil.com/auth/callback",
  ]) {
    assert.equal(
      siteOrigin(hostile, CONFIG),
      "https://zabelie.com",
      `${hostile} ne doit pas être suivi`
    );
  }
});

test("le protocole compte — http ne devient pas une variante de https", () => {
  assert.equal(
    siteOrigin("http://www.zabelie.com/auth/callback", CONFIG),
    "https://zabelie.com",
    "un saut http→https n'est pas une simple variation d'hôte : on impose la configuration"
  );
});

test("variable absente ou malformée — repli sur la requête, jamais une URL cassée", () => {
  assert.equal(
    siteOrigin("https://www.zabelie.com/x", undefined),
    "https://www.zabelie.com",
    "sans variable, c'est le comportement d'avant"
  );
  assert.equal(siteOrigin("https://www.zabelie.com/x", "   "), "https://www.zabelie.com");
  assert.equal(
    siteOrigin("https://www.zabelie.com/x", "pas-une-url"),
    "https://www.zabelie.com",
    "rediriger vers une URL invalide serait pire que le repli"
  );
});

test("les deux routes de retour passent par siteOrigin — et aucune autre ne refait le calcul à la main", () => {
  /* L'assertion porte sur ce qui COMMANDE. Une des deux routes pourrait être
     corrigée et l'autre pas : c'est très exactement ce qui s'est produit le
     2026-08-11, quand le mot de passe oublié a été réparé et que ces deux-ci
     sont restées en l'état pendant neuf jours. */
  for (const f of ["app/auth/callback/route.ts", "app/api/moncash/return/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /const site = siteOrigin\(url, process\.env\.NEXT_PUBLIC_SITE_URL\)/,
      `${f} doit passer par siteOrigin : forcer l'hôte configuré fait perdre le cookie de session sur le saut apex ↔ www`
    );
  }

  // Et le motif fautif ne doit réapparaître nulle part.
  const fautifs: string[] = [];
  const pile = ["app", "lib", "components"];
  const vus: string[] = [];
  while (pile.length) {
    const d = pile.pop()!;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        if (e !== "node_modules" && e !== ".next") pile.push(p);
      } else if (/\.(ts|tsx)$/.test(e)) vus.push(p);
    }
  }
  for (const f of vus) {
    if (f.endsWith("lib/site-origin.ts")) continue;
    const src = readFileSync(f, "utf8");
    if (/process\.env\.NEXT_PUBLIC_SITE_URL\s*\?\?\s*url\.origin/.test(src)) {
      fautifs.push(f);
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    `Le motif « NEXT_PUBLIC_SITE_URL ?? url.origin » est revenu :\n  ${fautifs.join(
      "\n  "
    )}\nIl force l'hôte configuré même quand la requête arrive sur la variante www, ce qui perd le cookie de session. Passez par siteOrigin().`
  );
  assert.ok(vus.length > 50, `parcours cassé : ${vus.length} fichier(s) lus`);
});
