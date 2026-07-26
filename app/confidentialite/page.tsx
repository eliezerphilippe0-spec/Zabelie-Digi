import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Politique de confidentialité — Zabelie",
};

// Dernière mise à jour de la politique (à actualiser à chaque changement).
const LAST_UPDATE = "7 juillet 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-mist">
        {children}
      </div>
    </section>
  );
}

export default function ConfidentialitePage() {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-black tracking-tight">
          Politique de confidentialité
        </h1>
        <p className="mt-2 text-sm text-mist">
          Dernière mise à jour : {LAST_UPDATE}
        </p>

        <Section title="1. Responsable du traitement">
          <p>
            Zabelie (« nous ») exploite cette marketplace de produits
            digitaux et de talents. Responsable du traitement :{" "}
            <strong className="text-cloud">[À COMPLÉTER : entité juridique,
            adresse]</strong>. Pour toute question relative à vos données,
            contactez-nous à{" "}
            <strong className="text-cloud">[À COMPLÉTER : e-mail de contact]</strong>.
          </p>
        </Section>

        <Section title="2. Données que nous collectons">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-cloud">Compte</strong> : adresse e-mail et
              mot de passe (chiffré), à l&apos;inscription.
            </li>
            <li>
              <strong className="text-cloud">Profil</strong> : nom d&apos;affichage,
              bio, avatar, pays et — pour Haïti — département, si vous les
              renseignez.
            </li>
            <li>
              <strong className="text-cloud">Localisation approximative</strong> :
              nous déduisons votre <em>pays</em> (jamais votre position précise) à
              partir de votre adresse IP au moment d&apos;un achat ou d&apos;une
              publication (voir §4).
            </li>
            <li>
              <strong className="text-cloud">Paiement</strong> : références de
              transaction MonCash nécessaires à la confirmation et à la
              réconciliation de vos paiements.
            </li>
            <li>
              <strong className="text-cloud">Activité</strong> : produits publiés,
              commandes passées, solde du wallet vendeur.
            </li>
          </ul>
        </Section>

        <Section title="3. Finalités et bases légales">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Fournir le service (compte, catalogue, achat, livraison,
              wallet) — <em>exécution du contrat</em>.
            </li>
            <li>
              Traiter et réconcilier les paiements — <em>exécution du contrat</em>{" "}
              et <em>obligation légale</em> (comptabilité).
            </li>
            <li>
              Comprendre la répartition géographique agrégée de notre communauté —{" "}
              <em>intérêt légitime</em> (statistiques, jamais à l&apos;échelle
              individuelle sur nos tableaux de bord).
            </li>
            <li>
              Prévenir la fraude et sécuriser la plateforme —{" "}
              <em>intérêt légitime</em>.
            </li>
          </ul>
        </Section>

        <Section title="4. Localisation par adresse IP">
          <p>
            Lors d&apos;un achat ou d&apos;une publication, nous déterminons votre{" "}
            <strong className="text-cloud">pays</strong> à partir de votre adresse
            IP (via notre hébergeur), uniquement si vous ne l&apos;avez pas déjà
            renseigné. Nous ne conservons <strong>pas</strong> votre adresse IP à
            cette fin, ni de coordonnées GPS : seul le code pays est enregistré.
            Nos cartes internes sont <strong>agrégées</strong> et n&apos;affichent
            jamais d&apos;utilisateur individuel. Vous pouvez corriger ou effacer
            ce pays à tout moment depuis votre profil.
          </p>
        </Section>

        <Section title="5. Durée de conservation">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Données de compte et de profil : tant que votre compte est actif.
            </li>
            <li>
              Données de paiement et de commande : conservées pour la durée légale
              applicable (obligations comptables), puis supprimées ou anonymisées.
            </li>
            <li>
              Détails techniques du paiement (payload opérateur) : minimisés à la
              confirmation (l&apos;identifiant du payeur n&apos;est pas conservé) et
              purgés après <strong className="text-cloud">[À COMPLÉTER : durée,
              ex. 90 jours]</strong>.
            </li>
          </ul>
        </Section>

        <Section title="6. Destinataires et sous-traitants">
          <p>
            Nous ne vendons pas vos données. Elles sont traitées par des
            sous-traitants strictement nécessaires au service :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-cloud">Supabase</strong> — base de données,
              authentification et stockage.
            </li>
            <li>
              <strong className="text-cloud">Vercel</strong> — hébergement de
              l&apos;application.
            </li>
            <li>
              <strong className="text-cloud">MonCash (Digicel)</strong> —
              traitement des paiements.
            </li>
          </ul>
          <p>
            Certains sous-traitants peuvent héberger des données hors de votre pays.
            <strong className="text-cloud"> [À COMPLÉTER : région d&apos;hébergement
            et garanties de transfert applicables.]</strong>
          </p>
        </Section>

        <Section title="7. Vos droits">
          <p>
            Selon la réglementation applicable (notamment le RGPD pour les
            résidents de l&apos;Union européenne), vous disposez des droits
            d&apos;accès, de rectification, d&apos;effacement, de portabilité et
            d&apos;opposition.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-cloud">Accès / portabilité</strong> :
              exportez vos données depuis votre tableau de bord.
            </li>
            <li>
              <strong className="text-cloud">Rectification</strong> : modifiez votre
              profil à tout moment.
            </li>
            <li>
              <strong className="text-cloud">Effacement</strong> : supprimez votre
              compte depuis votre tableau de bord. Les données strictement
              nécessaires à nos obligations légales (paiements) sont alors{" "}
              <em>anonymisées</em> plutôt que supprimées, comme le permet la
              réglementation.
            </li>
          </ul>
          <p>
            Les résidents de l&apos;UE peuvent introduire une réclamation auprès de
            leur autorité de contrôle (en France, la CNIL).
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            Nous utilisons uniquement des cookies{" "}
            <strong className="text-cloud">strictement nécessaires</strong> au
            maintien de votre session d&apos;authentification. Aucun cookie
            publicitaire ni de traçage tiers.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            Pour exercer vos droits ou pour toute question :{" "}
            <strong className="text-cloud">[À COMPLÉTER : e-mail de contact]</strong>.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
