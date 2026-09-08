"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LANG_COOKIE, LANGS } from "@/lib/i18n";
import { guideLangFromPath } from "@/lib/guide-routing";

/** Root layouts persist across client navigation; keep the document language in sync. */
export function DocumentLanguage() {
  const pathname = usePathname();
  useEffect(() => {
    const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LANG_COOKIE}=`))?.slice(LANG_COOKIE.length + 1);
    const preferred = LANGS.find((lang) => lang === cookie) ?? "fr";
    document.documentElement.lang = guideLangFromPath(pathname) ?? preferred;
  }, [pathname]);
  return null;
}
