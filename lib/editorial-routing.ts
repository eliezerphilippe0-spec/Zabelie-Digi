import { LANGS, type Lang } from "@/lib/i18n";
export const EDITORIAL_PATHS = ["/aide", "/a-propos", "/recharges"] as const;
export type EditorialPath = (typeof EDITORIAL_PATHS)[number];
export function editorialLangFromPath(path: string): Lang | undefined {
  return /^\/(fr|ht|en|es)\/(aide|a-propos|recharges)\/?$/.exec(path)?.[1] as Lang | undefined;
}
export function editorialLanguagePath(path: string, lang: Lang): string | null {
  const base = path.replace(/^\/(fr|ht|en|es)(?=\/)/, "").replace(/\/$/, "");
  return EDITORIAL_PATHS.some((item) => item === base) ? `/${lang}${base}` : null;
}
export function editorialAlternates(path: EditorialPath, lang: Lang) {
  return { canonical: `/${lang}${path}`, languages: { ...Object.fromEntries(LANGS.map((l) => [l, `/${l}${path}`])), "x-default": `/fr${path}` } };
}
