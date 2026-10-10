import type { Lang } from "./i18n";

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ, EN QUATRE LANGUES.
 *
 * Pourquoi un module de données plutôt que des clés dans `lib/i18n.ts` : ce
 * n'est pas de l'habillage d'interface, c'est un DOCUMENT. Le découper en
 * cinquante clés plates rendrait invisible l'ordre des sections, et une
 * section oubliée dans une langue ne se verrait nulle part. Ici, le type
 * impose la même structure aux quatre versions.
 *
 * ─── CE QUI ÉTAIT CASSÉ, MESURÉ LE 2026-08-12 ───────────────────────────────
 * `app/confidentialite/page.tsx` portait 208 lignes de français EN DUR : ni
 * `getLang`, ni `t(lang, …)`. Un utilisateur kreyòl — c'est-à-dire le public
 * principal de ce produit — lisait sa politique de confidentialité en
 * français. Le pied de page faisait pareil sur « Légal » et
 * « Confidentialité », deux chaînes en dur au milieu de voisines traduites.
 *
 * ─── LES CINQ BLANCS, ET POURQUOI ILS SONT ICI PLUTÔT QUE DANS LE TEXTE ─────
 * La politique publiée contenait cinq marqueurs `[À COMPLÉTER]` — entité
 * juridique, e-mail de contact (deux fois), durée de purge du payload
 * opérateur, région d'hébergement. **Ils étaient EN LIGNE, visibles de
 * n'importe qui.**
 *
 * Traduire le document sans les regrouper les aurait multipliés par quatre.
 * Or ces valeurs ne dépendent pas de la langue : une raison sociale et une
 * adresse e-mail s'écrivent pareil en kreyòl et en espagnol. Elles vivent
 * donc dans `IDENTITE` ci-dessous, référencées par `{entite}`, `{email}`,
 * `{hebergement}` dans les quatre versions. **Les remplir une fois les
 * remplit partout.**
 *
 * ⚖️ 2026-10-02 — `purge` QUITTE `IDENTITE`. Ce n'était pas un fait que le
 * porteur connaît, c'était un fait du CODE : `app/api/maturation/route.ts`
 * appelle chaque jour `purge_payment_raw` avec `p_days: 90` (`0016`). Et une
 * durée n'est pas indépendante de la langue (« 90 jours », « 90 jou »,
 * « 90 days », « 90 días ») : elle s'écrit donc dans chaque version, et
 * `tests/politique-confidentialite.test.ts` la relie au cron. Rédigé par
 * l'agent sur mandat du porteur — à valider avec le reste du texte.
 *
 * ⚖️ 2026-10-04 — `hebergement` et `retentionKyc` QUITTENT `IDENTITE`, pour
 * la même raison que `purge` : ce sont des faits mesurés, écrits dans chaque
 * langue.
 *   • Région : MESURÉE le 2026-10-04 — Supabase `us-east-1` (`get_project`),
 *     fonctions Vercel `iad1` (en-tête `x-vercel-id` de zabelie.com). La
 *     phrase ne promet AUCUNE garantie de transfert : ni clauses types ni
 *     accord signé n'ont été constatés, donc rien n'est affirmé.
 *   • Pièces d'identité : 5 ans, décision porteur du 2026-10-04. `0131`
 *     compte cinq années calendaires après fermeture, en conservant les
 *     pièces d'un compte actif. Le cadre BRH reste à qualifier (`docs/17`) ;
 *     `tests/politique-confidentialite.test.ts` relie la phrase au réglage.
 *
 * ⚖️ 2026-10-10 (second passage) — **`v3` GROUPÉ, décision du porteur.** Le
 * relevé `docs/69` a mesuré HUIT tiers appelés par le code, pas quatre :
 * Reloadly et Kobara n'étaient dans aucune liste, et Stripe serait passé à
 * travers une recherche d'URL puisqu'il n'en écrit aucune. Aucun n'était
 * déclaré. Tout entre ici en UNE version, pour ne faire payer qu'UNE
 * ré-acceptation au lieu de deux.
 *   • Le §6 est désormais COUPÉ EN DEUX, et ce n'est pas du vocabulaire.
 *     Les sous-traitants reçoivent des données que NOUS leur transmettons.
 *     Les services de paiement n'en reçoivent aucune : mesuré, Stripe ne
 *     reçoit qu'`order_id`, un montant et un libellé (`lib/stripe.ts:47`),
 *     Kobara qu'un montant et un `order_id` (`lib/kobara.ts:167`), et
 *     `redactKobaraPayment` retire même le téléphone du payeur avant écriture.
 *     L'utilisateur saisit ses moyens de paiement CHEZ EUX.
 *   • ⚖️ **MonCash change donc de rubrique** — il passe des sous-traitants aux
 *     destinataires de paiement. C'est un changement de QUALIFICATION, pas de
 *     formulation : à faire valider par le conseil avant mise en ligne.
 *   • AUCUNE région d'hébergement n'est affirmée pour les sept tiers ajoutés :
 *     aucune n'a été mesurée, contrairement à Supabase et Vercel.
 *   • Zelle reste absent, et c'est exact : aucun appel sortant dans le code.
 *
 * ⚖️ 2026-10-10 (premier passage) — **TypeSafe ENTRE au §6.** Ce n'est pas un ajout de confort :
 * `lib/jev.ts` envoie `untrusted_customer_message` — les mots mêmes du client —
 * à `api.typesafe.ai`. Le triage est livré et son drapeau est fermé ; l'ouvrir
 * sans cette ligne transmettrait des messages clients à un tiers non déclaré.
 * `tests/politique-confidentialite.test.ts` croise désormais les deux dans LES
 * DEUX SENS : tant que ce code transmet, TypeSafe doit être nommé ; si la
 * transmission disparaît, la ligne doit partir. Rédigé par l'agent sur mandat
 * du porteur — à valider par le conseil.
 *   • AUCUNE région d'hébergement n'est affirmée pour TypeSafe : elle n'a pas
 *     été mesurée, contrairement à Supabase et Vercel. Ne pas en inventer une.
 *   • ⚠️ RESTENT ABSENTS, et ce n'est PAS réglé ici : Resend, Stripe,
 *     Higgsfield, OpenAI/Gemini. Chacun demande de constater d'abord s'il
 *     traite réellement des données aujourd'hui — déclarer un sous-traitant
 *     inactif est aussi faux que d'en taire un actif.
 *
 * ⚠️ Tant qu'un champ vaut `null`, le rendu affiche le marqueur — visible,
 * jamais silencieux. `tests/politique-confidentialite.test.ts` compte les
 * champs vides : le compte ne peut pas grossir sans que quelqu'un le voie.
 *
 * ─── CE QUE CE MODULE N'EST PAS ─────────────────────────────────────────────
 * Un avis juridique. Les versions kreyòl, anglaise et espagnole sont des
 * traductions fidèles du texte français par l'agent, **non relues par un
 * juriste ni par un locuteur natif**. Le français reste la version de
 * référence tant que le porteur n'en décide pas autrement — et ce choix
 * lui-même est une décision qui lui revient, pas une convention qu'on
 * installe en passant.
 */

/**
 * Les quatre faits que la politique promet et que le dépôt ne connaît pas.
 * `null` = non renseigné : le rendu le montre.
 */
export const IDENTITE: Record<"entite" | "email", string | null> = {
  entite: null,
  email: "contact@zabelie.com",
};

/** Ce qu'on affiche à la place d'un champ vide, par langue. */
const MANQUANT: Record<Lang, Record<keyof typeof IDENTITE, string>> = {
  fr: {
    entite: "[À COMPLÉTER : entité juridique et adresse]",
    email: "[À COMPLÉTER : e-mail de contact]",
  },
  ht: {
    entite: "[POU KONPLETE : antite jiridik ak adrès]",
    email: "[POU KONPLETE : imèl kontak]",
  },
  en: {
    entite: "[TO BE COMPLETED: legal entity and address]",
    email: "[TO BE COMPLETED: contact e-mail]",
  },
  es: {
    entite: "[POR COMPLETAR: entidad jurídica y dirección]",
    email: "[POR COMPLETAR: correo de contacto]",
  },
};

/** Remplace `{entite}` et `{email}`. */
export function resoudre(texte: string, lang: Lang): string {
  return texte.replace(/\{(entite|email)\}/g, (_, cle) => {
    const k = cle as keyof typeof IDENTITE;
    return IDENTITE[k] ?? MANQUANT[lang][k];
  });
}

/** Nombre de faits encore non renseignés — lu par le test et par l'admin. */
export function champsManquants(): (keyof typeof IDENTITE)[] {
  return (Object.keys(IDENTITE) as (keyof typeof IDENTITE)[]).filter((k) => !IDENTITE[k]);
}

export type Bloc = { p: string } | { ul: string[] };
/** `ancre` : identifiant d'ancre de la section (`/confidentialite#traceurs`), le même dans les quatre langues. */
export type SectionPolitique = { titre: string; ancre?: "traceurs"; blocs: Bloc[] };
export type Politique = {
  titre: string;
  majLabel: string;
  /** Avertissement affiché sur les versions traduites. Absent en français. */
  avisTraduction?: string;
  sections: SectionPolitique[];
};

/** `**gras**` et `*italique*` — la seule mise en forme admise dans le texte. */

const fr: Politique = {
  titre: "Politique de confidentialité",
  majLabel: "Dernière mise à jour",
  sections: [
    {
      titre: "1. Responsable du traitement",
      blocs: [
        {
          p: "Zabelie (« nous ») exploite cette marketplace de produits physiques, de produits digitaux et de services. Responsable du traitement : **{entite}**. Pour toute question relative à vos données, contactez-nous à **{email}**.",
        },
      ],
    },
    {
      titre: "2. Données que nous collectons",
      blocs: [
        {
          ul: [
            "**Compte** : adresse e-mail et mot de passe (chiffré), à l'inscription.",
            "**Profil** : nom d'affichage, bio, avatar, pays et — pour Haïti — département, si vous les renseignez.",
            "**Localisation approximative** : nous déduisons votre *pays* (jamais votre position précise) à partir de votre adresse IP au moment d'un achat ou d'une publication (voir §4).",
            "**Paiement** : références de transaction MonCash nécessaires à la confirmation et à la réconciliation de vos paiements.",
            "**Activité** : produits publiés, commandes passées, écritures du registre comptable vendeur.",
            "**Déclarations sur les documents** : identifiant du compte, version des conditions acceptées, version de la politique de confidentialité portée à votre connaissance et date enregistrée par le serveur. Ni adresse IP ni agent utilisateur pour cette trace. Il ne s’agit pas d’un consentement général au traitement des données ni d’une signature électronique certifiée.",
            "**Coordonnées de remise** (si vous les renseignez) : nom complet, téléphone et adresse — montrés au vendeur *uniquement* pour organiser la remise de votre commande payée, jamais publics. Zabelie ne livre pas les produits.",
            "**Pièces d'identité** (vendeurs seulement, lorsqu'une vérification est demandée) : documents officiels et photo, conservés à part et jamais publics — voir §9.",
          ],
        },
      ],
    },
    {
      titre: "3. Finalités et bases légales",
      blocs: [
        {
          ul: [
            "Fournir le service (compte, catalogue, achat, coordonnées pour la remise par le vendeur, registre comptable vendeur) — *exécution du contrat*.",
            "Traiter et réconcilier les paiements — *exécution du contrat* et *obligation légale* (comptabilité).",
            "Comprendre la répartition géographique agrégée de notre communauté — *intérêt légitime* (statistiques, jamais à l'échelle individuelle sur nos tableaux de bord).",
            "Prévenir la fraude et sécuriser la plateforme — *intérêt légitime*.",
            "Vous envoyer **un seul rappel** par e-mail quand un paiement n'aboutit pas, pour le produit concerné — *intérêt légitime*. Chaque rappel porte un lien qui les arrête en un clic.",
          ],
        },
      ],
    },
    {
      titre: "4. Localisation par adresse IP",
      blocs: [
        {
          p: "Lors d'un achat ou d'une publication, nous déterminons votre **pays** à partir de votre adresse IP (via notre hébergeur), uniquement si vous ne l'avez pas déjà renseigné. Nous ne conservons **pas** votre adresse IP à cette fin, ni de coordonnées GPS : seul le code pays est enregistré. Nos cartes internes sont **agrégées** et n'affichent jamais d'utilisateur individuel. Vous pouvez corriger ou effacer ce pays à tout moment depuis votre profil.",
        },
      ],
    },
    {
      titre: "5. Durée de conservation",
      blocs: [
        {
          ul: [
            "Données de compte et de profil : tant que votre compte est actif.",
            "Déclarations sur les documents : conservées dans un registre non modifiable, y compris après la fermeture du compte. Aucune purge automatique de ces traces n’est actuellement prévue ; vous pouvez adresser une demande à **{email}**. Un compte qui porte ces traces est fermé et ses coordonnées sont anonymisées plutôt que supprimé entièrement.",
            "Données de paiement et de commande : conservées pour la durée légale applicable (obligations comptables), puis supprimées ou anonymisées.",
            "Détails techniques du paiement (payload opérateur) : minimisés à la confirmation (l'identifiant du payeur n'est pas conservé) et purgés **90 jours** après la clôture du paiement (confirmé ou échoué).",
            "Termes de recherche non aboutis : conservés **90 jours**, puis purgés automatiquement.",
            "Pièces d'identité d'un vendeur : voir **§9**, qui en détaille la durée séparément.",
          ],
        },
      ],
    },
    {
      titre: "6. Destinataires et sous-traitants",
      blocs: [
        { p: "Nous ne vendons pas vos données. Elles sont traitées par des sous-traitants strictement nécessaires au service :" },
        {
          ul: [
            "**Supabase** — base de données, authentification et stockage.",
            "**Vercel** — hébergement de l'application.",
            "**Resend** — envoi des e-mails de service : votre adresse et le contenu du message.",
            "**Reloadly** — recharge téléphonique : le numéro du bénéficiaire que vous indiquez.",
            "**OpenAI** ou **Google (Gemini)**, selon le fournisseur configuré — assistant d'achat et aide à la rédaction : le texte que vous écrivez.",
            "**Higgsfield** — génération de visuels pour les vendeurs : le texte et l'image de référence fournis.",
            "**TypeSafe** — classement automatique des messages de support, lorsque cette aide est activée.",
          ],
        },
        { p: "Les services de paiement sont des destinataires **distincts** : vous saisissez vos moyens de paiement chez eux, sur leur propre page. Nous ne leur transmettons que le montant, la référence de commande et le libellé de l'achat." },
        {
          ul: [
            "**MonCash (Digicel)** — paiement en gourdes.",
            "**Stripe** — paiement par carte.",
            "**Kobara** — paiement en gourdes.",
          ],
        },
        { p: "Certains sous-traitants peuvent héberger des données hors de votre pays. **Vos données sont hébergées aux États-Unis : la base de données chez Supabase (région us-east-1, Virginie du Nord) et l'application chez Vercel (région iad1, Washington).**" },
        { p: "Avec votre accord seulement, et uniquement sur les pages d'un vendeur qui les a activés, des données de navigation peuvent être transmises à **Meta, Google ou TikTok** (voir la section 8). Ces régies ne sont pas nos sous-traitants : elles traitent ces données pour leur propre compte." },
      ],
    },
    {
      titre: "7. Vos droits",
      blocs: [
        {
          p: "Zabelie s'adresse d'abord au public haïtien. Cette politique tient compte du **droit haïtien** de la protection des données, notamment de l'arrêté fixant les règles relatives à la protection des données à caractère personnel (*Le Moniteur* n° 87 du 15 mai 2018). Les règles d'un autre pays s'appliquent lorsque leurs conditions d'application sont réunies ; la résidence à l'étranger ne suffit pas, à elle seule, à déterminer ce régime.",
        },
        {
          p: "Zabelie propose les outils ci-dessous pour consulter, exporter, corriger et supprimer vos données, indépendamment des droits supplémentaires que la réglementation applicable peut vous accorder. Vous pouvez aussi nous adresser une demande à **{email}**.",
        },
        {
          ul: [
            "**Accès / portabilité** : exportez vos données depuis votre tableau de bord.",
            "**Rectification** : modifiez votre profil à tout moment.",
            "**Effacement** : supprimez votre compte depuis votre tableau de bord. Les données de paiement conservées pour nos obligations légales sont alors *anonymisées* plutôt que supprimées. Les pièces d'identité d'un vendeur restent conservées jusqu'au terme prévu au **§9**, puis supprimées automatiquement.",
          ],
        },
        { p: "Lorsqu'une réglementation applicable vous ouvre un droit de réclamation auprès d'une autorité compétente, les outils Zabelie et le contact ci-dessus ne limitent pas ce droit." },
      ],
    },
    {
      titre: "8. Cookies et traceurs",
      ancre: "traceurs",
      blocs: [
        { p: "Nous utilisons trois catégories de cookies." },
        { p: "**Nécessaires au fonctionnement** (sans consentement, car le site ne peut pas fonctionner sans eux) :" },
        {
          ul: [
            "la **session de connexion**, tant que vous restez connecté ;",
            "vos **préférences de langue et d'apparence** (zabelie_lang, zab_theme).",
          ],
        },
        { p: "**Attribution des ventes** (sans donnée publicitaire, jamais transmis à un tiers) :" },
        {
          ul: [
            "zab_ref : retient pendant **7 jours** le lien d'affiliation par lequel vous êtes arrivé, pour rémunérer la personne qui vous a recommandé le produit ;",
            "zabelie_sale_sources : retient pendant **30 jours au plus** que vous avez découvert un produit sur Zabelie, pour calculer les frais du vendeur.",
          ],
        },
        { p: "**Pixels publicitaires des vendeurs** (uniquement avec votre accord) :" },
        {
          ul: [
            "Un vendeur peut ajouter à sa boutique les outils de mesure de **Meta** (Facebook, Instagram), **Google** ou **TikTok**, pour mesurer l'effet de ses publicités.",
            "Ces outils ne se chargent que sur **ses** fiches produit, **sa** boutique et la page de confirmation de **vos** achats chez lui, et **seulement si vous cliquez « Accepter »** dans le bandeau qui s'affiche alors.",
            "Ils transmettent alors à la régie concernée : la page consultée, le produit, son prix et, après un achat, le montant et un identifiant de commande. Ils ne transmettent ni votre nom, ni votre téléphone, ni votre adresse.",
            "Chaque régie traite ensuite ces données selon sa propre politique de confidentialité.",
            "Le vendeur qui active un pixel le choisit pour sa propre publicité et **répond de l'usage qu'il en fait** auprès de la régie. Zabelie fournit l'outil, recueille votre accord et limite ce qui est transmis.",
            "Votre choix est conservé **180 jours** dans le cookie zab_pub, y compris un refus : nous ne vous le redemandons pas pendant cette période. Vous pouvez le changer à tout moment avec **Gérer les traceurs**, en bas de chaque page ou juste en dessous. Un refus efface aussi les cookies que ces outils avaient déposés sur zabelie.com.",
          ],
        },
        { p: "Zabelie n'installe **aucun pixel publicitaire pour son propre compte**." },
      ],
    },
    {
      titre: "9. Pièces d'identité (vérification vendeur)",
      blocs: [
        {
          p: "Pour retirer les sommes gagnées sur Zabelie, un vendeur peut avoir à faire **vérifier son identité**. Cette vérification est **manuelle** : aucune administration haïtienne ne propose aujourd'hui de service permettant de contrôler automatiquement une pièce d'identité. Un membre de notre équipe examine le dossier, et sa décision est horodatée et attribuée dans notre journal interne.",
        },
        {
          ul: [
            "**Ce que nous demandons** : deux documents parmi une *carte d'identification nationale*, un *passeport* et une *photo de vous* permettant de vous rapprocher du document présenté.",
            "**Qui les voit** : uniquement les membres de notre équipe chargés de la vérification. Elles ne sont **jamais** publiées, ni montrées aux acheteurs, ni montrées aux autres vendeurs.",
            "**Comment elles sont conservées** : dans un espace de stockage **privé**, qu'aucun lien public n'ouvre. Notre équipe y accède par un lien signé qui **expire au bout de cinq minutes**.",
            "**Combien de temps** : pendant la relation liée au compte, puis **5 ans** après la fermeture du compte. Le délai compte en années calendaires ; la décision sur le dossier ne le déclenche pas. Le fichier et sa trace sont ensuite supprimés automatiquement.",
            "**Pourquoi** : prévenir la fraude et sécuriser les retraits d'argent — *intérêt légitime* — et satisfaire nos obligations de vigilance là où elles s'appliquent — *obligation légale*.",
          ],
        },
        {
          p: "Déposer une pièce d'identité n'est **jamais** nécessaire pour acheter, pour ouvrir un compte, ni pour publier un produit. Vous pouvez demander la suppression de votre dossier à tout moment en écrivant à **{email}** ; nous ne garderons alors que ce qu'une obligation légale nous impose de conserver, et un retrait de vos gains pourra vous être refusé tant qu'aucune vérification n'a abouti.",
        },
      ],
    },
    {
      titre: "10. Contact",
      blocs: [{ p: "Pour exercer vos droits ou pour toute question : **{email}**." }],
    },
  ],
};

const ht: Politique = {
  titre: "Politik konfidansyalite",
  majLabel: "Dènye mizajou",
  avisTraduction:
    "Vèsyon sa a se yon tradiksyon. An ka de diferans, se tèks fransè a ki fè lwa.",
  sections: [
    {
      titre: "1. Responsab tretman an",
      blocs: [
        {
          p: "Zabelie (« nou ») ap opere mache sa a pou pwodwi fizik, pwodwi dijital ak sèvis. Responsab tretman an : **{entite}**. Pou nenpòt kesyon sou done ou yo, ekri nou nan **{email}**.",
        },
      ],
    },
    {
      titre: "2. Done nou ranmase",
      blocs: [
        {
          ul: [
            "**Kont** : adrès imèl ak modpas (chifre), lè ou enskri.",
            "**Pwofil** : non ki parèt, bio, foto, peyi epi — pou Ayiti — depatman, si ou mete yo.",
            "**Kote ou ye apeprè** : nou dedwi *peyi* ou (pa janm pozisyon egzak ou) apati adrès IP ou lè ou achte oswa lè ou pibliye (gade §4).",
            "**Peman** : referans tranzaksyon MonCash ki nesesè pou konfime epi rekonsilye peman ou yo.",
            "**Aktivite** : pwodwi ou pibliye, kòmand ou pase, ekriti nan rejis kontab vandè a.",
            "**Deklarasyon sou dokiman yo** : idantifyan kont lan, vèsyon kondisyon ou aksepte yo, vèsyon règleman sou vi prive nou fè ou konnen an, ak dat sèvè a anrejistre. Nou pa mete adrès IP ni ajan itilizatè nan tras sa a. Sa pa yon konsantman jeneral pou tretman done ni yon siyati elektwonik sètifye.",
            "**Kòdone pou remiz la** (si ou mete yo) : non konplè, telefòn ak adrès — vandè a wè yo *sèlman* pou òganize remiz kòmand ou peye a, yo pa janm piblik. Zabelie pa livre pwodwi yo.",
            "**Pyès idantite** (vandè sèlman, lè nou mande yon verifikasyon) : dokiman ofisyèl ak foto, kenbe apa epi yo pa janm piblik — gade §9.",
          ],
        },
      ],
    },
    {
      titre: "3. Rezon ak baz legal",
      blocs: [
        {
          ul: [
            "Bay sèvis la (kont, katalòg, acha, kòdone pou vandè a remèt pwodwi a, rejis kontab vandè a) — *egzekisyon kontra a*.",
            "Trete epi rekonsilye peman yo — *egzekisyon kontra a* ak *obligasyon legal* (kontabilite).",
            "Konprann repatisyon jeyografik global kominote nou an — *enterè lejitim* (estatistik, pa janm sou yon moun an patikilye nan tablo nou yo).",
            "Anpeche fwod epi sekirize plataform lan — *enterè lejitim*.",
            "Voye **yon sèl rapèl** ba ou pa imèl lè yon peman pa pase, pou pwodui sa a — *enterè lejitim*. Chak rapèl gen yon lyen ki kanpe yo nan yon sèl klik.",
          ],
        },
      ],
    },
    {
      titre: "4. Kote ou ye selon adrès IP",
      blocs: [
        {
          p: "Lè ou achte oswa lè ou pibliye, nou detèmine **peyi** ou apati adrès IP ou (atravè ebèjè nou an), sèlman si ou pa te deja mete l. Nou **pa** konsève adrès IP ou pou sa, ni okenn kòdone GPS : se sèlman kòd peyi a ki anrejistre. Kat entèn nou yo **rasanble** done yo epi yo pa janm montre yon itilizatè an patikilye. Ou ka korije oswa efase peyi sa a nenpòt lè nan pwofil ou.",
        },
      ],
    },
    {
      titre: "5. Konbyen tan nou kenbe done yo",
      blocs: [
        {
          ul: [
            "Done kont ak pwofil : toutotan kont ou aktif.",
            "Deklarasyon sou dokiman yo : kenbe nan yon rejis ki pa ka modifye, menm apre kont lan fèmen. Pa gen efasman otomatik pou tras sa yo kounye a ; ou ka voye yon demann nan **{email}**. Yon kont ki gen tras sa yo fèmen epi kòdone li anonimize olye kont lan efase nèt.",
            "Done peman ak kòmand : konsève pou dire legal ki aplikab (obligasyon kontab), apre sa efase oswa anonimize.",
            "Detay teknik peman an (payload operatè a) : redwi lè konfimasyon an fèt (idantifyan moun ki peye a pa konsève) epi efase **90 jou** apre peman an fini (konfime oswa echwe).",
            "Mo rechèch ki pa bay rezilta : konsève **90 jou**, apre sa efase otomatikman.",
            "Pyès idantite yon vandè : gade **§9**, ki bay dire a apa.",
          ],
        },
      ],
    },
    {
      titre: "6. Kilès ki resevwa done yo",
      blocs: [
        { p: "Nou pa vann done ou yo. Se sèlman patnè ki estriktèman nesesè pou sèvis la ki trete yo :" },
        {
          ul: [
            "**Supabase** — baz done, otantifikasyon ak depo.",
            "**Vercel** — ebèjman aplikasyon an.",
            "**Resend** — voye imèl sèvis yo : adrès ou ak kontni mesaj la.",
            "**Reloadly** — rechaj telefòn : nimewo moun w ap rechaje a.",
            "**OpenAI** oswa **Google (Gemini)**, selon founisè ki konfigire a — asistan acha ak èd pou ekri : tèks ou ekri a.",
            "**Higgsfield** — kreyasyon imaj pou vandè yo : tèks ak imaj referans ou bay.",
            "**TypeSafe** — klasman otomatik mesaj sipò yo, lè èd sa a aktive.",
          ],
        },
        { p: "Sèvis peman yo se destinatè **apa** : se lakay yo ou antre mwayen peman ou, sou pwòp paj pa yo. Nou voye ba yo sèlman montan an, referans kòmand lan ak non acha a." },
        {
          ul: [
            "**MonCash (Digicel)** — peman an goud.",
            "**Stripe** — peman ak kat.",
            "**Kobara** — peman an goud.",
          ],
        },
        { p: "Kèk patnè ka ebèje done deyò peyi ou. **Done ou yo ebèje Ozetazini : baz done a lakay Supabase (rejyon us-east-1, Nò Vijini) ak aplikasyon an lakay Vercel (rejyon iad1, Washington).**" },
        { p: "Sèlman si ou dakò, epi sèlman sou paj yon vandè ki aktive yo, done navigasyon ka ale bay **Meta, Google oswa TikTok** (gade seksyon 8). Platfòm sa yo pa patnè pa nou : yo trete done sa yo pou pwòp kont pa yo." },
      ],
    },
    {
      titre: "7. Dwa ou yo",
      blocs: [
        {
          p: "Zabelie vize piblik ayisyen an anvan tout bagay. Politik sa a pran an konsiderasyon **lwa ayisyen** sou pwoteksyon done, sitou arete ki fikse règ pou pwoteksyon done pèsonèl yo (*Le Moniteur* nimewo 87, 15 me 2018). Règ yon lòt peyi aplikab lè kondisyon yo pou aplike yo reyini ; lefètke ou rete aletranje pa sifi, poukont li, pou detèmine rejim sa a.",
        },
        {
          p: "Zabelie bay zouti ki anba yo pou ou konsilte, ekspòte, korije ak efase done ou yo, kèlkeswa dwa anplis règleman ki aplikab la ka ba ou. Ou ka voye yon demann tou nan **{email}**.",
        },
        {
          ul: [
            "**Aksè / pòtabilite** : ekspòte done ou yo depi tablo ou.",
            "**Koreksyon** : chanje pwofil ou nenpòt lè.",
            "**Efasman** : efase kont ou depi tablo ou. Done peman nou konsève pou obligasyon legal nou yo *anonimize* olye yo efase. Pyès idantite yon vandè rete konsève jiska dat ki prevwa nan **§9** la, apre sa yo efase otomatikman.",
          ],
        },
        { p: "Lè yon règleman ki aplikab ba ou dwa depoze yon plent bò kote yon otorite ki konpetan, zouti Zabelie yo ak kontak ki anwo a pa limite dwa sa a." },
      ],
    },
    {
      titre: "8. Cookies ak siveyans",
      ancre: "traceurs",
      blocs: [
        { p: "Nou itilize twa kalite cookies." },
        { p: "**Nesesè pou sit la mache** (san konsantman, paske sit la pa ka mache san yo) :" },
        {
          ul: [
            "**sesyon koneksyon** ou, toutotan ou rete konekte ;",
            "**preferans lang ak aparans** ou (zabelie_lang, zab_theme).",
          ],
        },
        { p: "**Atribisyon vant** (pa gen done piblisite, nou pa janm voye yo bay lòt moun) :" },
        {
          ul: [
            "zab_ref : kenbe pandan **7 jou** lyen afilyasyon ki mennen ou sou sit la, pou nou peye moun ki rekòmande pwodui a ba ou ;",
            "zabelie_sale_sources : kenbe pandan **30 jou pi plis** ke ou te dekouvri yon pwodui sou Zabelie, pou kalkile frè vandè a.",
          ],
        },
        { p: "**Piksèl piblisite vandè yo** (sèlman si ou dakò) :" },
        {
          ul: [
            "Yon vandè ka ajoute nan boutik li zouti mezi **Meta** (Facebook, Instagram), **Google** oswa **TikTok**, pou mezire efè piblisite li.",
            "Zouti sa yo chaje sèlman sou fich pwodui **li**, boutik **li** ak paj konfimasyon acha **ou** fè lakay li, epi **sèlman si ou klike « Aksepte »** nan bann ki parèt lè sa a.",
            "Lè sa a, yo voye bay platfòm piblisite a : paj ou gade a, pwodui a, pri li, epi apre yon acha, montan an ak yon idantifyan kòmand. Yo pa voye ni non ou, ni telefòn ou, ni adrès ou.",
            "Chak platfòm trete done sa yo dapre pwòp politik konfidansyalite pa li.",
            "Vandè ki mete yon piksèl la chwazi l pou pwòp piblisite pa l, epi **se li ki reponn pou jan li sèvi avè l** devan platfòm piblisite a. Zabelie bay zouti a, mande w si ou dakò, epi limite sa ki voye.",
            "Nou kenbe chwa ou pandan **180 jou** nan cookie zab_pub, menm si ou refize : nou p ap mande w ankò pandan tan sa a. Ou ka chanje l nenpòt ki lè ak **Jere siveyans yo**, anba chak paj oswa jis anba a. Si ou refize, nou efase tou cookies zouti sa yo te mete sou zabelie.com.",
          ],
        },
        { p: "Zabelie pa mete **okenn piksèl piblisite pou pwòp kont pa li**." },
      ],
    },
    {
      titre: "9. Pyès idantite (verifikasyon vandè)",
      blocs: [
        {
          p: "Pou yon vandè retire lajan li fè sou Zabelie, nou ka mande l **verifye idantite l**. Verifikasyon sa a fèt **alamen** : jodi a pa gen okenn administrasyon ayisyen ki ofri yon sèvis pou kontwole yon pyès idantite otomatikman. Se yon manm ekip nou an ki egzamine dosye a, epi desizyon l enskri ak dat li ak non li nan jounal entèn nou an.",
        },
        {
          ul: [
            "**Sa nou mande** : de dokiman pami yon *kat idantifikasyon nasyonal*, yon *paspò* ak yon *foto ou* ki pèmèt nou konpare ou ak dokiman an.",
            "**Kilès ki wè yo** : sèlman manm ekip nou an ki responsab verifikasyon an. Yo pa **janm** pibliye, ni montre bay achtè, ni montre bay lòt vandè.",
            "**Kijan nou kenbe yo** : nan yon depo **prive**, okenn lyen piblik pa ouvri l. Ekip nou an ouvri yo ak yon lyen siyen ki **ekspire apre senk minit**.",
            "**Konbyen tan** : pandan relasyon ki lye ak kont lan, epi **5 an** apre kont lan fèmen. Delè a konte an ane kalandriye ; desizyon sou dosye a pa fè l kòmanse. Apre sa, fichye a ak tras li efase otomatikman.",
            "**Poukisa** : anpeche fwod epi sekirize retrè lajan — *enterè lejitim* — epi respekte obligasyon vijilans nou yo kote yo aplikab — *obligasyon legal*.",
          ],
        },
        {
          p: "Ou **pa janm** bezwen depoze yon pyès idantite pou achte, pou louvri yon kont, ni pou pibliye yon pwodwi. Ou ka mande efasman dosye ou nenpòt lè nan **{email}** ; lè sa a nou ap kenbe sèlman sa yon obligasyon legal fòse nou kenbe, epi nou ka refize yon retrè sou lajan ou toutotan okenn verifikasyon pa abouti.",
        },
      ],
    },
    {
      titre: "10. Kontak",
      blocs: [{ p: "Pou egzèse dwa ou oswa pou nenpòt kesyon : **{email}**." }],
    },
  ],
};

const en: Politique = {
  titre: "Privacy policy",
  majLabel: "Last updated",
  avisTraduction:
    "This version is a translation. In case of discrepancy, the French text prevails.",
  sections: [
    {
      titre: "1. Data controller",
      blocs: [
        {
          p: "Zabelie (“we”) operates this marketplace for physical products, digital products and services. Data controller: **{entite}**. For any question about your data, contact us at **{email}**.",
        },
      ],
    },
    {
      titre: "2. Data we collect",
      blocs: [
        {
          ul: [
            "**Account**: e-mail address and password (encrypted), at sign-up.",
            "**Profile**: display name, bio, avatar, country and — for Haiti — department, if you provide them.",
            "**Approximate location**: we infer your *country* (never your precise position) from your IP address at the time of a purchase or a publication (see §4).",
            "**Payment**: MonCash transaction references required to confirm and reconcile your payments.",
            "**Activity**: products published, orders placed, entries in the seller accounting ledger.",
            "**Document declarations**: account identifier, version of the terms accepted, version of the privacy information acknowledged and server-recorded date. No IP address or user agent is collected for this receipt. This is not blanket consent to data processing or a certified electronic signature.",
            "**Handover details** (if you provide them): full name, phone and address — shown to the seller *only* to arrange handover of your paid order, never public. Zabelie does not deliver products.",
            "**Identity documents** (sellers only, when a verification is requested): official documents and photo, stored separately and never public — see §9.",
          ],
        },
      ],
    },
    {
      titre: "3. Purposes and legal bases",
      blocs: [
        {
          ul: [
            "Provide the service (account, catalogue, purchase, details for handover by the seller, seller accounting ledger) — *performance of the contract*.",
            "Process and reconcile payments — *performance of the contract* and *legal obligation* (accounting).",
            "Understand the aggregate geographic spread of our community — *legitimate interest* (statistics, never at individual level on our dashboards).",
            "Prevent fraud and secure the platform — *legitimate interest*.",
            "Send you **a single reminder** by email when a payment doesn't go through, for that product — *legitimate interest*. Each reminder has a link that stops them in one click.",
          ],
        },
      ],
    },
    {
      titre: "4. Location from IP address",
      blocs: [
        {
          p: "When you make a purchase or publish, we determine your **country** from your IP address (via our host), only if you have not already provided it. We do **not** keep your IP address for this purpose, nor any GPS coordinates: only the country code is stored. Our internal maps are **aggregated** and never show an individual user. You can correct or erase this country at any time from your profile.",
        },
      ],
    },
    {
      titre: "5. Retention periods",
      blocs: [
        {
          ul: [
            "Account and profile data: for as long as your account is active.",
            "Document declarations: kept in an immutable registry, including after account closure. No automatic purge of these receipts is currently provided; you may send a request to **{email}**. An account carrying these receipts is closed and its contact details anonymised rather than fully deleted.",
            "Payment and order data: kept for the applicable statutory period (accounting obligations), then deleted or anonymised.",
            "Technical payment details (operator payload): minimised at confirmation (the payer identifier is not kept) and purged **90 days** after the payment is closed (confirmed or failed).",
            "Unsuccessful search terms: kept **90 days**, then purged automatically.",
            "A seller's identity documents: see **§9**, which sets out their retention separately.",
          ],
        },
      ],
    },
    {
      titre: "6. Recipients and processors",
      blocs: [
        { p: "We do not sell your data. It is processed by processors strictly necessary to the service:" },
        {
          ul: [
            "**Supabase** — database, authentication and storage.",
            "**Vercel** — application hosting.",
            "**Resend** — sending service emails: your address and the message content.",
            "**Reloadly** — phone top-up: the beneficiary number you provide.",
            "**OpenAI** or **Google (Gemini)**, depending on the configured provider — shopping assistant and writing help: the text you write.",
            "**Higgsfield** — image generation for sellers: the text and reference image provided.",
            "**TypeSafe** — automatic classification of support messages, when this assistance is enabled.",
          ],
        },
        { p: "Payment services are **separate** recipients: you enter your payment details on their own pages. We send them only the amount, the order reference and the purchase label." },
        {
          ul: [
            "**MonCash (Digicel)** — payment in gourdes.",
            "**Stripe** — card payment.",
            "**Kobara** — payment in gourdes.",
          ],
        },
        { p: "Some processors may host data outside your country. **Your data is hosted in the United States: the database with Supabase (us-east-1 region, Northern Virginia) and the application with Vercel (iad1 region, Washington).**" },
        { p: "Only with your consent, and only on the pages of a seller who has enabled them, browsing data may be sent to **Meta, Google or TikTok** (see section 8). These platforms are not our processors: they process this data on their own behalf." },
      ],
    },
    {
      titre: "7. Your rights",
      blocs: [
        {
          p: "Zabelie serves the Haitian public first. This policy takes into account **Haitian law** on data protection, including the order setting the rules for the protection of personal data (*Le Moniteur* no. 87 of 15 May 2018). Another country's rules apply when their conditions of application are met; residence abroad alone does not determine that regime.",
        },
        {
          p: "Zabelie offers the tools below to view, export, correct and delete your data, independently of any additional rights that applicable regulation may grant you. You may also send us a request at **{email}**.",
        },
        {
          ul: [
            "**Access / portability**: export your data from your dashboard.",
            "**Rectification**: edit your profile at any time.",
            "**Erasure**: delete your account from your dashboard. Payment data retained for our legal obligations is then *anonymised* rather than deleted. A seller's identity documents are kept until the term set in **§9**, then deleted automatically.",
          ],
        },
        { p: "Where applicable regulation grants you a right to complain to a competent authority, the Zabelie tools and the contact above do not limit that right." },
      ],
    },
    {
      titre: "8. Cookies and trackers",
      ancre: "traceurs",
      blocs: [
        { p: "We use three categories of cookies." },
        { p: "**Necessary for the site to work** (no consent needed, because the site cannot work without them):" },
        {
          ul: [
            "your **login session**, for as long as you stay signed in;",
            "your **language and appearance preferences** (zabelie_lang, zab_theme).",
          ],
        },
        { p: "**Sales attribution** (no advertising data, never shared with third parties):" },
        {
          ul: [
            "zab_ref: keeps for **7 days** the affiliate link you arrived through, so the person who recommended the product can be paid;",
            "zabelie_sale_sources: keeps for **up to 30 days** the fact that you discovered a product on Zabelie, to calculate the seller's fees.",
          ],
        },
        { p: "**Sellers' advertising pixels** (only with your consent):" },
        {
          ul: [
            "A seller can add measurement tools from **Meta** (Facebook, Instagram), **Google** or **TikTok** to their shop, to measure how their ads perform.",
            "These tools load only on **that seller's** product pages, **their** shop and the confirmation page of **your** purchases from them, and **only if you click \"Accept\"** in the banner shown there.",
            "They then send the ad platform: the page viewed, the product, its price and, after a purchase, the amount and an order identifier. They do not send your name, phone number or address.",
            "Each platform then processes this data under its own privacy policy.",
            "The seller who turns on a pixel chooses it for their own advertising and **is answerable for how they use it** to the platform. Zabelie provides the tool, collects your consent and limits what is sent.",
            "Your choice is kept for **180 days** in the zab_pub cookie, including a refusal: we will not ask again during that period. You can change it at any time with **Manage trackers**, at the bottom of every page or just below. Refusing also deletes the cookies these tools had set on zabelie.com.",
          ],
        },
        { p: "Zabelie installs **no advertising pixel on its own behalf**." },
      ],
    },
    {
      titre: "9. Identity documents (seller verification)",
      blocs: [
        {
          p: "To withdraw the money they have earned on Zabelie, a seller may be asked to **verify their identity**. This verification is **manual**: no Haitian authority currently offers a service that checks an identity document automatically. A member of our team reviews the file, and their decision is timestamped and attributed in our internal log.",
        },
        {
          ul: [
            "**What we ask for**: two documents among a *national identification card*, a *passport* and a *photo of you* that lets us match you to the document presented.",
            "**Who sees them**: only the members of our team responsible for verification. They are **never** published, shown to buyers, or shown to other sellers.",
            "**How they are stored**: in a **private** storage area that no public link opens. Our team reaches them through a signed link that **expires after five minutes**.",
            "**For how long**: during the account relationship, then **5 years** after account closure. The period uses calendar years; the dossier decision does not start it. The file and its record are then deleted automatically.",
            "**Why**: to prevent fraud and secure money withdrawals — *legitimate interest* — and to meet our due-diligence obligations where they apply — *legal obligation*.",
          ],
        },
        {
          p: "Submitting an identity document is **never** required to buy, to open an account, or to publish a product. You may request deletion of your file at any time by writing to **{email}**; we will then keep only what a legal obligation requires us to keep, and a withdrawal of your earnings may be refused for as long as no verification has succeeded.",
        },
      ],
    },
    {
      titre: "10. Contact",
      blocs: [{ p: "To exercise your rights or for any question: **{email}**." }],
    },
  ],
};

const es: Politique = {
  titre: "Política de privacidad",
  majLabel: "Última actualización",
  avisTraduction:
    "Esta versión es una traducción. En caso de discrepancia, prevalece el texto en francés.",
  sections: [
    {
      titre: "1. Responsable del tratamiento",
      blocs: [
        {
          p: "Zabelie («nosotros») opera este mercado de productos físicos, productos digitales y servicios. Responsable del tratamiento: **{entite}**. Para cualquier consulta sobre sus datos, escríbanos a **{email}**.",
        },
      ],
    },
    {
      titre: "2. Datos que recopilamos",
      blocs: [
        {
          ul: [
            "**Cuenta**: dirección de correo y contraseña (cifrada), al registrarse.",
            "**Perfil**: nombre visible, biografía, avatar, país y —para Haití— departamento, si los indica.",
            "**Ubicación aproximada**: deducimos su *país* (nunca su posición exacta) a partir de su dirección IP en el momento de una compra o una publicación (véase §4).",
            "**Pago**: referencias de transacción MonCash necesarias para confirmar y conciliar sus pagos.",
            "**Actividad**: productos publicados, pedidos realizados, apuntes del registro contable del vendedor.",
            "**Declaraciones sobre documentos**: identificador de cuenta, versión de las condiciones aceptadas, versión de la información de privacidad reconocida y fecha registrada por el servidor. Esta constancia no recoge dirección IP ni agente de usuario. No es un consentimiento general al tratamiento de datos ni una firma electrónica certificada.",
            "**Datos para la entrega** (si los indica): nombre completo, teléfono y dirección — mostrados al vendedor *solo* para organizar la entrega de su pedido pagado, nunca públicos. Zabelie no entrega los productos.",
            "**Documentos de identidad** (solo vendedores, cuando se solicita una verificación): documentos oficiales y foto, conservados aparte y nunca públicos — véase §9.",
          ],
        },
      ],
    },
    {
      titre: "3. Finalidades y bases jurídicas",
      blocs: [
        {
          ul: [
            "Prestar el servicio (cuenta, catálogo, compra, datos para la entrega por el vendedor, registro contable del vendedor) — *ejecución del contrato*.",
            "Tramitar y conciliar los pagos — *ejecución del contrato* y *obligación legal* (contabilidad).",
            "Comprender la distribución geográfica agregada de nuestra comunidad — *interés legítimo* (estadísticas, nunca a escala individual en nuestros paneles).",
            "Prevenir el fraude y proteger la plataforma — *interés legítimo*.",
            "Enviarle **un solo recordatorio** por correo cuando un pago no se completa, para ese producto — *interés legítimo*. Cada recordatorio lleva un enlace que los detiene con un clic.",
          ],
        },
      ],
    },
    {
      titre: "4. Ubicación por dirección IP",
      blocs: [
        {
          p: "Al realizar una compra o una publicación, determinamos su **país** a partir de su dirección IP (a través de nuestro proveedor de alojamiento), solo si no lo ha indicado ya. **No** conservamos su dirección IP para este fin, ni coordenadas GPS: solo se registra el código de país. Nuestros mapas internos están **agregados** y nunca muestran a un usuario individual. Puede corregir o borrar este país en cualquier momento desde su perfil.",
        },
      ],
    },
    {
      titre: "5. Plazos de conservación",
      blocs: [
        {
          ul: [
            "Datos de cuenta y perfil: mientras su cuenta esté activa.",
            "Declaraciones sobre documentos: conservadas en un registro inmutable, incluso tras el cierre de la cuenta. Actualmente no existe una eliminación automática de estas constancias; puede enviar una solicitud a **{email}**. Una cuenta con estas constancias se cierra y sus datos de contacto se anonimizan en lugar de eliminarla completamente.",
            "Datos de pago y pedido: conservados durante el plazo legal aplicable (obligaciones contables) y después eliminados o anonimizados.",
            "Detalles técnicos del pago (payload del operador): minimizados en la confirmación (no se conserva el identificador del pagador) y purgados **90 días** después del cierre del pago (confirmado o fallido).",
            "Términos de búsqueda sin resultado: conservados **90 días** y purgados automáticamente después.",
            "Documentos de identidad de un vendedor: véase **§9**, que detalla su plazo por separado.",
          ],
        },
      ],
    },
    {
      titre: "6. Destinatarios y encargados",
      blocs: [
        { p: "No vendemos sus datos. Los tratan encargados estrictamente necesarios para el servicio:" },
        {
          ul: [
            "**Supabase** — base de datos, autenticación y almacenamiento.",
            "**Vercel** — alojamiento de la aplicación.",
            "**Resend** — envío de correos de servicio: su dirección y el contenido del mensaje.",
            "**Reloadly** — recarga telefónica: el número del beneficiario que usted indica.",
            "**OpenAI** o **Google (Gemini)**, según el proveedor configurado — asistente de compra y ayuda a la redacción: el texto que usted escribe.",
            "**Higgsfield** — generación de imágenes para vendedores: el texto y la imagen de referencia proporcionados.",
            "**TypeSafe** — clasificación automática de los mensajes de soporte, cuando esta ayuda está activada.",
          ],
        },
        { p: "Los servicios de pago son destinatarios **distintos**: usted introduce sus medios de pago en sus propias páginas. Solo les transmitimos el importe, la referencia del pedido y la denominación de la compra." },
        {
          ul: [
            "**MonCash (Digicel)** — pago en gourdes.",
            "**Stripe** — pago con tarjeta.",
            "**Kobara** — pago en gourdes.",
          ],
        },
        { p: "Algunos encargados pueden alojar datos fuera de su país. **Sus datos se alojan en Estados Unidos: la base de datos en Supabase (región us-east-1, Virginia del Norte) y la aplicación en Vercel (región iad1, Washington).**" },
        { p: "Solo con su consentimiento, y únicamente en las páginas de un vendedor que los haya activado, pueden transmitirse datos de navegación a **Meta, Google o TikTok** (véase la sección 8). Estas plataformas no son encargadas nuestras: tratan estos datos por cuenta propia." },
      ],
    },
    {
      titre: "7. Sus derechos",
      blocs: [
        {
          p: "Zabelie se dirige ante todo al público haitiano. Esta política tiene en cuenta el **derecho haitiano** de protección de datos, en particular el arrêté que fija las normas de protección de los datos personales (*Le Moniteur* n.º 87 del 15 de mayo de 2018). Las normas de otro país se aplican cuando se cumplen sus condiciones de aplicación; residir en el extranjero no basta, por sí solo, para determinar ese régimen.",
        },
        {
          p: "Zabelie ofrece las herramientas siguientes para consultar, exportar, corregir y eliminar sus datos, con independencia de los derechos adicionales que pueda otorgarle la normativa aplicable. También puede enviarnos una solicitud a **{email}**.",
        },
        {
          ul: [
            "**Acceso / portabilidad**: exporte sus datos desde su panel.",
            "**Rectificación**: modifique su perfil en cualquier momento.",
            "**Supresión**: elimine su cuenta desde su panel. Los datos de pago conservados para nuestras obligaciones legales se *anonimizan* en lugar de suprimirse. Los documentos de identidad de un vendedor se conservan hasta el plazo previsto en el **§9** y luego se eliminan automáticamente.",
          ],
        },
        { p: "Cuando una normativa aplicable le otorga el derecho a reclamar ante una autoridad competente, las herramientas Zabelie y el contacto anterior no limitan ese derecho." },
      ],
    },
    {
      titre: "8. Cookies y rastreadores",
      ancre: "traceurs",
      blocs: [
        { p: "Utilizamos tres categorías de cookies." },
        { p: "**Necesarias para el funcionamiento** (sin consentimiento, porque el sitio no puede funcionar sin ellas):" },
        {
          ul: [
            "su **sesión de inicio**, mientras permanezca conectado;",
            "sus **preferencias de idioma y apariencia** (zabelie_lang, zab_theme).",
          ],
        },
        { p: "**Atribución de ventas** (sin datos publicitarios, nunca se comparten con terceros):" },
        {
          ul: [
            "zab_ref: conserva durante **7 días** el enlace de afiliado por el que llegó, para remunerar a quien le recomendó el producto;",
            "zabelie_sale_sources: conserva durante **30 días como máximo** que descubrió un producto en Zabelie, para calcular las comisiones del vendedor.",
          ],
        },
        { p: "**Píxeles publicitarios de los vendedores** (solo con su consentimiento):" },
        {
          ul: [
            "Un vendedor puede añadir a su tienda las herramientas de medición de **Meta** (Facebook, Instagram), **Google** o **TikTok**, para medir el efecto de sus anuncios.",
            "Estas herramientas solo se cargan en **sus** fichas de producto, **su** tienda y la página de confirmación de **sus** compras a ese vendedor, y **solo si hace clic en «Aceptar»** en el aviso que aparece entonces.",
            "En ese caso transmiten a la plataforma publicitaria: la página visitada, el producto, su precio y, tras una compra, el importe y un identificador de pedido. No transmiten su nombre, teléfono ni dirección.",
            "Cada plataforma trata después estos datos según su propia política de privacidad.",
            "El vendedor que activa un píxel lo elige para su propia publicidad y **responde del uso que hace de él** ante la plataforma. Zabelie proporciona la herramienta, recoge su consentimiento y limita lo que se transmite.",
            "Su elección se conserva **180 días** en la cookie zab_pub, también si la rechaza: no volveremos a preguntarle durante ese periodo. Puede cambiarla en cualquier momento con **Gestionar rastreadores**, al pie de cada página o justo debajo. Un rechazo borra también las cookies que esas herramientas habían dejado en zabelie.com.",
          ],
        },
        { p: "Zabelie no instala **ningún píxel publicitario por cuenta propia**." },
      ],
    },
    {
      titre: "9. Documentos de identidad (verificación del vendedor)",
      blocs: [
        {
          p: "Para retirar las sumas ganadas en Zabelie, a un vendedor se le puede pedir que **verifique su identidad**. Esta verificación es **manual**: hoy ninguna administración haitiana ofrece un servicio que compruebe automáticamente un documento de identidad. Un miembro de nuestro equipo examina el expediente, y su decisión queda fechada y atribuida en nuestro registro interno.",
        },
        {
          ul: [
            "**Qué pedimos**: dos documentos entre una *cédula de identificación nacional*, un *pasaporte* y una *foto suya* que permita compararle con el documento presentado.",
            "**Quién los ve**: únicamente los miembros de nuestro equipo encargados de la verificación. **Nunca** se publican, ni se muestran a los compradores, ni a otros vendedores.",
            "**Cómo se conservan**: en un espacio de almacenamiento **privado** que ningún enlace público abre. Nuestro equipo accede a ellos mediante un enlace firmado que **caduca a los cinco minutos**.",
            "**Cuánto tiempo**: durante la relación vinculada a la cuenta, y luego **5 años** tras el cierre de la cuenta. El plazo se cuenta en años naturales; la decisión sobre el expediente no lo inicia. Después, el archivo y su rastro se eliminan automáticamente.",
            "**Por qué**: prevenir el fraude y proteger las retiradas de dinero — *interés legítimo* — y cumplir nuestras obligaciones de diligencia donde sean aplicables — *obligación legal*.",
          ],
        },
        {
          p: "Aportar un documento de identidad **nunca** es necesario para comprar, para abrir una cuenta, ni para publicar un producto. Puede solicitar la supresión de su expediente en cualquier momento escribiendo a **{email}**; conservaremos entonces únicamente lo que una obligación legal nos imponga guardar, y podrá denegarse una retirada de sus ganancias mientras ninguna verificación haya prosperado.",
        },
      ],
    },
    {
      titre: "10. Contacto",
      blocs: [{ p: "Para ejercer sus derechos o para cualquier consulta: **{email}**." }],
    },
  ],
};

export const POLITIQUE: Record<Lang, Politique> = { fr, ht, en, es };
