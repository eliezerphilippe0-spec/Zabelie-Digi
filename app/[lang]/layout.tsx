import { LANGS } from "@/lib/i18n";

// Ferme les segments inconnus avant le streaming HTML (véritable statut 404).
export const dynamicParams = false;
export function generateStaticParams() { return LANGS.map((lang) => ({ lang })); }
export default function LocalizedLayout({ children }: { children: React.ReactNode }) { return children; }
