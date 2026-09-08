import type { Lang } from "@/lib/i18n";
export function guideLangFromPath(path: string): Lang | undefined {
  return /^\/guides\/(fr|ht|en|es)(?:\/|$)/.exec(path)?.[1] as Lang | undefined;
}
export function guideLanguagePath(path: string, lang: Lang): string | null {
  return guideLangFromPath(path) ? path.replace(/^\/guides\/(fr|ht|en|es)(?=\/|$)/, `/guides/${lang}`) : null;
}
