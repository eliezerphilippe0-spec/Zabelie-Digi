/** Rasterise the existing header mark; never redraw the Z or change its colours.
 * Run: node scripts/generate-brand-icons.mjs
 * app/icon.svg is already checked against BrandMark by logo-deux-copies.test.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../app/icon.svg", import.meta.url));
const source = svg.toString("utf8");
const background = source.match(/<rect[^>]*fill="(#[0-9a-f]+)"/i)?.[1];
const mark = source.match(/<path\b[^>]*\/>/)?.[0];
if (!background || !mark) throw new Error("Zabelie SVG mark or background missing");
const png = (input, size) => sharp(input, { density: size * 72 / 48 }).resize(size, size).png().toBuffer();
const save = (path, data) => writeFile(new URL(`../${path}`, import.meta.url), data);

for (const [path, size] of [
  ["public/favicon.png", 96],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
]) await save(path, await png(svg, size));

// iOS applies its own rounded mask; supply an opaque background.
const appleIcon = await sharp(svg, { density: 270 })
  .resize(180, 180).flatten({ background }).png().toBuffer();
// Root names are also discovered automatically by Safari and older Web Clips.
for (const path of [
  "public/apple-touch-icon.png",
  "public/apple-touch-icon-precomposed.png",
  "public/icons/apple-touch-icon.png",
]) await save(path, appleIcon);
// The original Z lies entirely inside the central 80% safe circle.
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="${background}"/>${mark}</svg>`);
await save("public/icons/maskable-512.png", await png(maskable, 512));

// ICO directory with PNG frames: 0 encodes 256 px in the one-byte dimension.
const sizes = [16, 32, 48, 96, 256];
const frames = await Promise.all(sizes.map(size => png(svg, size)));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = sizes[index] % 256;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await save("public/favicon.ico", Buffer.concat([directory, ...frames]));
console.log("Zabelie: ICO 16/32/48/96/256, PNG 96, Apple 180, PWA 192/512 and maskable 512 generated from app/icon.svg.");
