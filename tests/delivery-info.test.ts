import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, type Lang } from "../lib/i18n";
import { POLITIQUE } from "../lib/policy-privacy";

/**
 * Coordonnées de livraison (V-5, docs/35) — le cœur est la RLS de 0076,
 * testée en SQL (L1-L3, CI). Ici : les invariants d'architecture que la
 * revue de code doit pouvoir tenir sans relire toute la pile.
 */

test("0076 : l'adresse ne vit PAS sur profiles (lecture publique) — table dédiée, 4 policies", () => {
  const sql = readFileSync("supabase/migrations/0076_delivery_info.sql", "utf8");
  assert.match(sql, /create table zabelie_delivery_info/);
  assert.ok(
    !/alter table profiles add column/.test(sql),
    "une adresse sur profiles serait publique"
  );
  // La règle porteur encodée en policy : commande PAYÉE, et rien d'autre.
  assert.match(sql, /o\.status = 'paid'/);
  assert.match(sql, /p\.seller_id = auth\.uid\(\)/);
});

test("route delivery-info : client de SESSION — jamais service-role (la RLS est le garde)", () => {
  const src = readFileSync("app/api/delivery-info/route.ts", "utf8");
  assert.ok(!/createAdminClient/.test(src), "le service-role contournerait la RLS 0076");
  assert.match(src, /\.upsert\(\{[\s\S]{0,80}user_id: user\.id/);
  assert.match(src, /isMissingTable\(error\)[\s\S]{0,300}status: 503/);
});

test("mes-ventes : lecture des coordonnées via le client de SESSION, jamais l'admin", () => {
  const src = readFileSync("app/mes-ventes/page.tsx", "utf8");
  assert.match(src, /from\("zabelie_delivery_info"\)/);
  assert.ok(
    !/createAdminClient/.test(src),
    "mes-ventes doit laisser la policy seller_read décider"
  );
  // Le bloc n'apparaît qu'au moment d'expédier.
  assert.match(src, /v\.status === "awaiting_shipment" &&[\s\S]{0,200}livParAcheteur/);
});

test("tableau de bord : le formulaire est masqué tant que 0076 n'est pas appliquée", () => {
  const src = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(src, /\{livInfo !== undefined && \(/);
  assert.match(src, /isMissingTable\(livErr\)/);
});

test("la politique de confidentialité décrit la collecte, dans les quatre langues", () => {
  const collecte: Record<Lang, { titre: string; gardes: RegExp[] }> = {
    fr: { titre: "Coordonnées de remise", gardes: [/nom complet/u, /téléphone/u, /adresse/u, /vendeur \*uniquement\*/u, /commande payée/u, /jamais publics/u, /Zabelie ne livre pas les produits/u] },
    ht: { titre: "Kòdone pou remiz la", gardes: [/non konplè/u, /telefòn/u, /adrès/u, /vandè a wè yo \*sèlman\*/u, /kòmand ou peye a/u, /pa janm piblik/u, /Zabelie pa livre pwodwi yo/u] },
    en: { titre: "Handover details", gardes: [/full name/u, /phone/u, /address/u, /seller \*only\*/u, /paid order/u, /never public/u, /Zabelie does not deliver products/u] },
    es: { titre: "Datos para la entrega", gardes: [/nombre completo/u, /teléfono/u, /dirección/u, /vendedor \*solo\*/u, /pedido pagado/u, /nunca públicos/u, /Zabelie no entrega los productos/u] },
  };
  for (const lang of LANGS) {
    const section = POLITIQUE[lang].sections.find(s => s.titre.startsWith("2."));
    assert.ok(section, `${lang} : section collecte absente`);
    const ligne = section.blocs.flatMap(b => "ul" in b ? b.ul : [])
      .find(texte => texte.includes(`**${collecte[lang].titre}**`));
    assert.ok(ligne, `${lang} : coordonnées de remise absentes de la collecte`);
    for (const garde of collecte[lang].gardes) assert.match(ligne, garde, `${lang} : collecte ou restriction absente`);
  }
});
