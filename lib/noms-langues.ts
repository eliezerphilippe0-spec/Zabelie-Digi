import type { Lang } from "@/lib/i18n";

/**
 * Le nom de chaque langue, écrit DANS cette langue : quelqu'un qui ne lit pas
 * le français doit reconnaître « Kreyòl ayisyen ». C'est ce que font Wikipédia
 * et Google dans leurs sélecteurs, et ce que faisait déjà `lang-toggle`.
 *
 * Module à part, sans dictionnaire : il s'importe aussi bien depuis le
 * sélecteur client que depuis une page serveur, sans rien ajouter au bundle.
 * `Record<Lang, …>` : ajouter une langue sans son nom ne compile pas.
 */
export const NOMS_LANGUES: Record<Lang, string> = {
  fr: "Français",
  ht: "Kreyòl ayisyen",
  en: "English",
  es: "Español",
};
