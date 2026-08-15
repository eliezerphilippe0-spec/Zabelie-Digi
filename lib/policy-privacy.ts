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
 * `{purge}`, `{hebergement}` dans les quatre versions. **Les remplir une fois
 * les remplit partout.**
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
 * Les cinq faits que la politique promet et que le dépôt ne connaît pas.
 * `null` = non renseigné : le rendu le montre.
 */
export const IDENTITE: Record<
  "entite" | "email" | "purge" | "hebergement" | "retentionKyc",
  string | null
> = {
  entite: null,
  email: null,
  purge: null,
  hebergement: null,
  retentionKyc: null,
};

/** Ce qu'on affiche à la place d'un champ vide, par langue. */
const MANQUANT: Record<Lang, Record<keyof typeof IDENTITE, string>> = {
  fr: {
    entite: "[À COMPLÉTER : entité juridique et adresse]",
    email: "[À COMPLÉTER : e-mail de contact]",
    purge: "[À COMPLÉTER : durée de purge]",
    hebergement: "[À COMPLÉTER : région d'hébergement et garanties de transfert]",
    retentionKyc: "[À COMPLÉTER : durée de conservation des pièces d'identité]",
  },
  ht: {
    entite: "[POU KONPLETE : antite jiridik ak adrès]",
    email: "[POU KONPLETE : imèl kontak]",
    purge: "[POU KONPLETE : dire konsèvasyon]",
    hebergement: "[POU KONPLETE : rejyon ebèjman ak garanti transfè]",
    retentionKyc: "[POU KONPLETE : dire konsèvasyon pyès idantite yo]",
  },
  en: {
    entite: "[TO BE COMPLETED: legal entity and address]",
    email: "[TO BE COMPLETED: contact e-mail]",
    purge: "[TO BE COMPLETED: purge period]",
    hebergement: "[TO BE COMPLETED: hosting region and transfer safeguards]",
    retentionKyc: "[TO BE COMPLETED: identity document retention period]",
  },
  es: {
    entite: "[POR COMPLETAR: entidad jurídica y dirección]",
    email: "[POR COMPLETAR: correo de contacto]",
    purge: "[POR COMPLETAR: plazo de purga]",
    hebergement: "[POR COMPLETAR: región de alojamiento y garantías de transferencia]",
    retentionKyc: "[POR COMPLETAR: plazo de conservación de los documentos de identidad]",
  },
};

/** Remplace `{entite}`, `{email}`, `{purge}`, `{hebergement}`, `{retentionKyc}`. */
export function resoudre(texte: string, lang: Lang): string {
  return texte.replace(/\{(entite|email|purge|hebergement|retentionKyc)\}/g, (_, cle) => {
    const k = cle as keyof typeof IDENTITE;
    return IDENTITE[k] ?? MANQUANT[lang][k];
  });
}

/** Nombre de faits encore non renseignés — lu par le test et par l'admin. */
export function champsManquants(): (keyof typeof IDENTITE)[] {
  return (Object.keys(IDENTITE) as (keyof typeof IDENTITE)[]).filter((k) => !IDENTITE[k]);
}

export type Bloc = { p: string } | { ul: string[] };
export type SectionPolitique = { titre: string; blocs: Bloc[] };
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
          p: "Zabelie (« nous ») exploite cette marketplace de produits digitaux et de talents. Responsable du traitement : **{entite}**. Pour toute question relative à vos données, contactez-nous à **{email}**.",
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
            "**Activité** : produits publiés, commandes passées, solde du wallet vendeur.",
            "**Livraison** (si vous les renseignez) : nom complet, téléphone et adresse de livraison — montrés à un vendeur *uniquement* lorsqu'il a une commande payée à vous expédier, jamais publics.",
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
            "Fournir le service (compte, catalogue, achat, livraison, wallet) — *exécution du contrat*.",
            "Traiter et réconcilier les paiements — *exécution du contrat* et *obligation légale* (comptabilité).",
            "Comprendre la répartition géographique agrégée de notre communauté — *intérêt légitime* (statistiques, jamais à l'échelle individuelle sur nos tableaux de bord).",
            "Prévenir la fraude et sécuriser la plateforme — *intérêt légitime*.",
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
            "Données de paiement et de commande : conservées pour la durée légale applicable (obligations comptables), puis supprimées ou anonymisées.",
            "Détails techniques du paiement (payload opérateur) : minimisés à la confirmation (l'identifiant du payeur n'est pas conservé) et purgés après **{purge}**.",
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
            "**MonCash (Digicel)** — traitement des paiements.",
          ],
        },
        { p: "Certains sous-traitants peuvent héberger des données hors de votre pays. **{hebergement}**" },
      ],
    },
    {
      titre: "7. Vos droits",
      blocs: [
        {
          p: "Selon la réglementation applicable (notamment le RGPD pour les résidents de l'Union européenne), vous disposez des droits d'accès, de rectification, d'effacement, de portabilité et d'opposition.",
        },
        {
          ul: [
            "**Accès / portabilité** : exportez vos données depuis votre tableau de bord.",
            "**Rectification** : modifiez votre profil à tout moment.",
            "**Effacement** : supprimez votre compte depuis votre tableau de bord. Les données strictement nécessaires à nos obligations légales (paiements) sont alors *anonymisées* plutôt que supprimées, comme le permet la réglementation.",
          ],
        },
        { p: "Les résidents de l'UE peuvent introduire une réclamation auprès de leur autorité de contrôle (en France, la CNIL)." },
      ],
    },
    {
      titre: "8. Cookies",
      blocs: [
        {
          p: "Nous utilisons uniquement des cookies **strictement nécessaires** au maintien de votre session d'authentification. Aucun cookie publicitaire ni de traçage tiers.",
        },
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
            "**Combien de temps** : **{retentionKyc}** après la décision. Le fichier et sa trace sont ensuite supprimés automatiquement.",
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
          p: "Zabelie (« nou ») ap opere mache sa a pou pwodwi dijital ak talan. Responsab tretman an : **{entite}**. Pou nenpòt kesyon sou done ou yo, ekri nou nan **{email}**.",
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
            "**Aktivite** : pwodwi ou pibliye, kòmand ou pase, balans pòtfèy vandè a.",
            "**Livrezon** (si ou mete yo) : non konplè, telefòn ak adrès livrezon — yon vandè wè yo *sèlman* lè li gen yon kòmand ou peye pou l voye ba ou, yo pa janm piblik.",
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
            "Bay sèvis la (kont, katalòg, acha, livrezon, pòtfèy) — *egzekisyon kontra a*.",
            "Trete epi rekonsilye peman yo — *egzekisyon kontra a* ak *obligasyon legal* (kontabilite).",
            "Konprann repatisyon jeyografik global kominote nou an — *enterè lejitim* (estatistik, pa janm sou yon moun an patikilye nan tablo nou yo).",
            "Anpeche fwod epi sekirize plataform lan — *enterè lejitim*.",
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
            "Done peman ak kòmand : konsève pou dire legal ki aplikab (obligasyon kontab), apre sa efase oswa anonimize.",
            "Detay teknik peman an (payload operatè a) : redwi lè konfimasyon an fèt (idantifyan moun ki peye a pa konsève) epi efase apre **{purge}**.",
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
            "**MonCash (Digicel)** — tretman peman yo.",
          ],
        },
        { p: "Kèk patnè ka ebèje done deyò peyi ou. **{hebergement}**" },
      ],
    },
    {
      titre: "7. Dwa ou yo",
      blocs: [
        {
          p: "Dapre règleman ki aplikab (an patikilye RGPD la pou moun ki rete nan Inyon Ewopeyèn nan), ou gen dwa aksè, koreksyon, efasman, pòtabilite ak opozisyon.",
        },
        {
          ul: [
            "**Aksè / pòtabilite** : ekspòte done ou yo depi tablo ou.",
            "**Koreksyon** : chanje pwofil ou nenpòt lè.",
            "**Efasman** : efase kont ou depi tablo ou. Done ki estriktèman nesesè pou obligasyon legal nou yo (peman) *anonimize* olye yo efase, jan règleman an pèmèt sa.",
          ],
        },
        { p: "Moun ki rete nan Inyon Ewopeyèn nan ka depoze yon plent bò kote otorite kontwòl yo (an Frans, CNIL la)." },
      ],
    },
    {
      titre: "8. Cookies",
      blocs: [
        {
          p: "Nou itilize sèlman cookies ki **estriktèman nesesè** pou kenbe sesyon otantifikasyon ou. Pa gen okenn cookie piblisite ni swiv twazyèm pati.",
        },
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
            "**Konbyen tan** : **{retentionKyc}** apre desizyon an. Apre sa, fichye a ak tras li efase otomatikman.",
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
          p: "Zabelie (“we”) operates this marketplace for digital products and talent. Data controller: **{entite}**. For any question about your data, contact us at **{email}**.",
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
            "**Activity**: products published, orders placed, seller wallet balance.",
            "**Delivery** (if you provide them): full name, phone and delivery address — shown to a seller *only* when they have a paid order to ship to you, never public.",
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
            "Provide the service (account, catalogue, purchase, delivery, wallet) — *performance of the contract*.",
            "Process and reconcile payments — *performance of the contract* and *legal obligation* (accounting).",
            "Understand the aggregate geographic spread of our community — *legitimate interest* (statistics, never at individual level on our dashboards).",
            "Prevent fraud and secure the platform — *legitimate interest*.",
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
            "Payment and order data: kept for the applicable statutory period (accounting obligations), then deleted or anonymised.",
            "Technical payment details (operator payload): minimised at confirmation (the payer identifier is not kept) and purged after **{purge}**.",
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
            "**MonCash (Digicel)** — payment processing.",
          ],
        },
        { p: "Some processors may host data outside your country. **{hebergement}**" },
      ],
    },
    {
      titre: "7. Your rights",
      blocs: [
        {
          p: "Under applicable regulation (notably the GDPR for residents of the European Union), you have rights of access, rectification, erasure, portability and objection.",
        },
        {
          ul: [
            "**Access / portability**: export your data from your dashboard.",
            "**Rectification**: edit your profile at any time.",
            "**Erasure**: delete your account from your dashboard. Data strictly necessary for our legal obligations (payments) is then *anonymised* rather than deleted, as the regulation permits.",
          ],
        },
        { p: "EU residents may lodge a complaint with their supervisory authority (in France, the CNIL)." },
      ],
    },
    {
      titre: "8. Cookies",
      blocs: [
        {
          p: "We use only **strictly necessary** cookies to maintain your authentication session. No advertising cookies and no third-party tracking.",
        },
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
            "**For how long**: **{retentionKyc}** after the decision. The file and its record are then deleted automatically.",
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
          p: "Zabelie («nosotros») opera este mercado de productos digitales y talento. Responsable del tratamiento: **{entite}**. Para cualquier consulta sobre sus datos, escríbanos a **{email}**.",
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
            "**Actividad**: productos publicados, pedidos realizados, saldo del monedero del vendedor.",
            "**Entrega** (si los indica): nombre completo, teléfono y dirección de entrega — mostrados a un vendedor *solo* cuando tiene un pedido pagado que enviarle, nunca públicos.",
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
            "Prestar el servicio (cuenta, catálogo, compra, entrega, monedero) — *ejecución del contrato*.",
            "Tramitar y conciliar los pagos — *ejecución del contrato* y *obligación legal* (contabilidad).",
            "Comprender la distribución geográfica agregada de nuestra comunidad — *interés legítimo* (estadísticas, nunca a escala individual en nuestros paneles).",
            "Prevenir el fraude y proteger la plataforma — *interés legítimo*.",
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
            "Datos de pago y pedido: conservados durante el plazo legal aplicable (obligaciones contables) y después eliminados o anonimizados.",
            "Detalles técnicos del pago (payload del operador): minimizados en la confirmación (no se conserva el identificador del pagador) y purgados tras **{purge}**.",
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
            "**MonCash (Digicel)** — tratamiento de los pagos.",
          ],
        },
        { p: "Algunos encargados pueden alojar datos fuera de su país. **{hebergement}**" },
      ],
    },
    {
      titre: "7. Sus derechos",
      blocs: [
        {
          p: "Conforme a la normativa aplicable (en particular el RGPD para residentes en la Unión Europea), usted dispone de los derechos de acceso, rectificación, supresión, portabilidad y oposición.",
        },
        {
          ul: [
            "**Acceso / portabilidad**: exporte sus datos desde su panel.",
            "**Rectificación**: modifique su perfil en cualquier momento.",
            "**Supresión**: elimine su cuenta desde su panel. Los datos estrictamente necesarios para nuestras obligaciones legales (pagos) se *anonimizan* en lugar de suprimirse, como permite la normativa.",
          ],
        },
        { p: "Los residentes en la UE pueden presentar una reclamación ante su autoridad de control (en Francia, la CNIL)." },
      ],
    },
    {
      titre: "8. Cookies",
      blocs: [
        {
          p: "Utilizamos únicamente cookies **estrictamente necesarias** para mantener su sesión de autenticación. Sin cookies publicitarias ni rastreo de terceros.",
        },
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
            "**Cuánto tiempo**: **{retentionKyc}** tras la decisión. Después, el archivo y su rastro se eliminan automáticamente.",
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
