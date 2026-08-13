import { DesinstallerSW } from "@/components/desinstaller-sw";

export const metadata = {
  title: "Désinstaller le service worker — Zabelie",
  // Cette page ne s'adresse à personne d'autre qu'à un dépanneur.
  robots: { index: false, follow: false },
};

/**
 * LA SORTIE DE SECOURS (`docs/32` §3).
 *
 * Un service worker survit aux déploiements : il s'installe chez l'utilisateur
 * et reste. Le jour où une version défectueuse part en production, redéployer
 * ne suffit pas toujours — le SW cassé peut intercepter les requêtes qui
 * serviraient à le remplacer. **C'est la seule panne de ce chantier qui ne se
 * répare pas depuis le serveur.**
 *
 * D'où cette page, et deux propriétés qui la rendent utile :
 *
 *   • elle est déclarée `NetworkOnly` dans `app/sw.ts`, donc jamais servie
 *     depuis un cache — un SW cassé ne peut pas la remplacer par une version
 *     périmée d'elle-même ;
 *   • elle ne dépend de rien : ni base, ni session, ni langue. Écrite en
 *     français, volontairement, parce qu'un dépanneur la lit une fois et que
 *     la faire dépendre du système de langue reviendrait à la faire dépendre
 *     de ce qui est peut-être en train de casser.
 *
 * ⚠️ Elle ne vide pas les caches par politesse : elle désinscrit le SW ET
 * supprime tous les caches. Un SW désinscrit dont les caches survivent laisse
 * des réponses périmées derrière lui.
 */
export default function DesinstallerSWPage() {
  return (
    <div className="bg-grain flex min-h-screen flex-col justify-center">
      <main className="mx-auto w-full max-w-lg px-5 py-16">
        <h1 className="text-2xl font-black tracking-tight">
          Désinstaller le service worker
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          Cette page retire le service worker de Zabelie de ce navigateur et
          vide tous ses caches. À utiliser si le site se comporte de façon
          incohérente après une mise à jour — pages figées, contenu qui ne se
          rafraîchit plus.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          Aucune donnée de compte n&apos;est touchée : ni session, ni panier, ni
          commande. Seuls les fichiers mis en cache par le navigateur partent.
        </p>
        <DesinstallerSW />
      </main>
    </div>
  );
}
