import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

// GHSA-f88m-g3jw-g9cj : le risque accepté en août est corrigé par Next 16.3.4.
test("sharp installé inclut les correctifs libvips (>= 0.35.0)", () => {
  const version: string = require_("sharp").versions.sharp;
  const [major, minor] = version.split(".").map(Number);
  assert.ok(major > 0 || minor >= 35, `sharp ${version} : correctifs libvips absents`);
});

test("le moteur corrigé décode et redimensionne une image produit", async () => {
  const sharp = require_("sharp");
  const input = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#276749" } }).png().toBuffer();
  const output = await sharp(input).resize(8, 8).webp().toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 8);
  assert.equal(metadata.height, 8);
});
