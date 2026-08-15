import type { Lang } from "./i18n";
import type { Politique } from "./policy-privacy";

/**
 * LES CONDITIONS D'UTILISATION, EN QUATRE LANGUES — GABARIT.
 *
 * Même architecture que `lib/policy-privacy.ts`, et pour les mêmes raisons :
 * un DOCUMENT typé, pas cinquante clés plates — le type impose la même
 * structure aux quatre versions, et une section perdue dans une langue casse
 * la compilation ou le test de parité, jamais silencieusement.
 *
 * ─── CE QUE CE MODULE EST, ET N'EST PAS ─────────────────────────────────────
 * C'est un GABARIT : la structure attendue d'une marketplace avec escrow,
 * remplie avec les SEULS termes déjà tranchés par le porteur (maturation J+7,
 * commission au barème en vigueur, remboursement vers le moyen d'origine,
 * produits interdits, pas de cash à la livraison — `docs/26`, `docs/22`,
 * `CLAUDE.md`). Tout point exigeant un arbitrage JURIDIQUE porte un marqueur
 * `[À COMPLÉTER : …]` explicite — droit applicable, fenêtre de litige,
 * résiliation, âge minimum. **Quatre marqueurs par langue, comptés et FIGÉS
 * par `tests/conditions-utilisation.test.ts`** : un marqueur en plus rougit
 * (on n'ouvre pas un blanc sans témoin), un marqueur rempli rougit aussi
 * (remplir un blanc est une décision porteur, le test force à la consigner).
 *
 * La page vide vaut mieux que la page inventée : ces marqueurs sont EN LIGNE,
 * visibles — exactement comme les blancs de la politique de confidentialité,
 * et c'est voulu. La clôture est la relecture du conseil juridique, adossée
 * au jalon « avant la première commande réelle » (`OPS_TODO`).
 *
 * `{entite}` et `{email}` sont résolus par le `resoudre` de
 * `lib/policy-privacy.ts` — l'objet `IDENTITE` n'est PAS dupliqué ici : les
 * remplir là-bas les remplit sur les deux documents. Ce jour-là, c'est le
 * cliquet de la CONFIDENTIALITÉ (`champsManquants`) qui rougira — pas
 * celui-ci : les quatre marqueurs d'ici sont d'AUTRES blancs, juridiques,
 * comptés dans le texte SOURCE, qu'`IDENTITE` ne touche pas. Deux comptes
 * orthogonaux, deux décisions distinctes.
 *
 * Les versions kreyòl, anglaise et espagnole sont des traductions de l'agent,
 * non relues par un juriste ni un locuteur natif. Le français fait foi.
 */

const fr: Politique = {
  titre: "Conditions d'utilisation",
  majLabel: "Dernière mise à jour",
  sections: [
    {
      titre: "1. Objet et acceptation",
      blocs: [
        {
          p: "Les présentes conditions régissent l'utilisation de la marketplace Zabelie, exploitée par **{entite}**. En créant un compte ou en passant une commande, vous les acceptez. Si vous n'acceptez pas ces conditions, n'utilisez pas le service.",
        },
        {
          p: "[À COMPLÉTER : âge minimum et capacité juridique requis pour utiliser le service]",
        },
      ],
    },
    {
      titre: "2. Définitions",
      blocs: [
        {
          ul: [
            "**Acheteur** : toute personne qui passe une commande sur la plateforme.",
            "**Vendeur** (ou créateur) : toute personne qui publie des produits à la vente.",
            "**Produit physique** : un bien matériel remis à l'acheteur.",
            "**Produit digital** (fichier) : un contenu téléchargeable, remis par le téléchargement lui-même.",
            "**Service** : une prestation rendue par le vendeur à l'acheteur.",
          ],
        },
      ],
    },
    {
      titre: "3. Création de compte",
      blocs: [
        {
          p: "Le compte est personnel. Vous êtes responsable de la confidentialité de vos identifiants et des actions menées depuis votre compte. Les informations fournies doivent être exactes et tenues à jour.",
        },
      ],
    },
    {
      titre: "4. Obligations du vendeur",
      blocs: [
        {
          ul: [
            "Ne publier que des produits que vous avez le droit de vendre — la liste de ce qui ne peut pas être vendu est publiée sur la page *produits interdits* et fait partie des présentes conditions.",
            "Décrire honnêtement le produit ou la prestation (état, contenu, compatibilité, délais).",
            "Honorer la remise : expédier le produit physique, rendre la prestation, fournir un fichier téléchargeable conforme.",
          ],
        },
        {
          p: "Zabelie peut retirer une publication contraire à ces obligations et suspendre le compte vendeur en cas de manquement grave ou répété.",
        },
      ],
    },
    {
      titre: "5. Commandes et paiement",
      blocs: [
        {
          p: "Les moyens de paiement disponibles sont ceux proposés à l'écran de paiement (notamment MonCash ; d'autres moyens peuvent être proposés ou retirés). Une commande n'est confirmée qu'après confirmation du paiement par l'opérateur — jamais sur le seul retour du navigateur. Zabelie ne pratique **pas** le paiement à la livraison.",
        },
      ],
    },
    {
      titre: "6. Règlement du vendeur et maturation",
      blocs: [
        {
          p: "Les sommes issues d'une vente sont inscrites au registre vendeur et deviennent disponibles après une **période de maturation de 7 jours** suivant la confirmation du paiement. Pour les produits physiques et les services, la disponibilité est en outre conditionnée à la **remise** : le vendeur déclare avoir remis, l'acheteur confirme (ou la confirmation intervient automatiquement après le délai affiché, sauf contestation).",
        },
        {
          p: "Le registre Zabelie est un registre comptable interne : il ne constitue ni un compte de paiement, ni un portefeuille électronique, et ne permet ni dépôt, ni retrait en espèces, ni transfert entre utilisateurs.",
        },
      ],
    },
    {
      titre: "7. Vérification d'identité du vendeur",
      blocs: [
        {
          p: "Avant de procéder au règlement des sommes dues à un vendeur, Zabelie peut exiger la vérification de son identité. Cette vérification n'est requise **ni** pour créer un compte, **ni** pour publier une offre, **ni** pour acheter : elle conditionne uniquement le versement des fonds.",
        },
        {
          ul: [
            "**Ce qui est demandé** : deux documents parmi une carte d'identification nationale, un passeport, et une photographie du titulaire permettant le rapprochement avec le document présenté.",
            "**Comment** : la vérification est effectuée **manuellement** par Zabelie ; la décision est horodatée et attribuée à son auteur.",
            "**Tant qu'elle n'a pas abouti** : le règlement peut être suspendu. Les sommes restent **acquises au vendeur** et inscrites à son registre — elles ne sont ni perdues, ni réduites, ni prescrites de ce fait.",
            "**Confidentialité et durée** : les pièces ne sont jamais publiées ni communiquées à des tiers, et sont détruites au terme de la durée indiquée dans la **politique de confidentialité**, section « Pièces d'identité ».",
          ],
        },
        {
          p: "En cas de refus, le motif est communiqué au vendeur, qui peut soumettre un nouveau dossier. Zabelie n'exige **aucun paiement** pour cette vérification.",
        },
      ],
    },
    {
      titre: "8. Commissions",
      blocs: [
        {
          p: "Zabelie prélève une commission sur chaque vente, selon le **barème en vigueur affiché au vendeur** avant la publication et dans son tableau de bord. Le barème peut évoluer ; le taux applicable à une vente est celui en vigueur au moment de la commande.",
        },
      ],
    },
    {
      titre: "9. Services optionnels payants",
      blocs: [
        {
          p: "Zabelie propose aux vendeurs des services optionnels payants — aujourd'hui, l'aide à la rédaction de descriptions de produits au-delà d'un quota gratuit quotidien. Aucun service payant n'est déclenché sans votre consentement explicite : le prix par utilisation est affiché au moment où vous choisissez de continuer, et c'est ce prix affiché qui fait foi.",
        },
        {
          ul: [
            "un quota d'utilisations gratuites par jour, indiqué dans l'application, s'applique avant toute facturation ;",
            "au-delà, chaque utilisation est facturée au prix affiché à l'écran de consentement, en gourdes (HTG) ;",
            "les frais consentis sont déduits de votre prochain règlement vendeur et enregistrés comme une écriture distincte ;",
            "un service consommé reste dû : si une demande de retrait est rejetée, le montant du retrait est restitué, mais les frais de services déjà consommés ne le sont pas ;",
            "toute modification de prix ne s'applique qu'aux utilisations futures, jamais rétroactivement.",
          ],
        },
      ],
    },
    {
      titre: "10. Litiges et remboursements",
      blocs: [
        {
          p: "Si la remise n'a pas lieu ou n'est pas conforme, l'acheteur peut le signaler depuis son espace « mes achats ». Le dossier est alors examiné et le règlement du vendeur suspendu le temps de l'examen. Tout remboursement s'effectue **vers le moyen de paiement d'origine** — jamais vers un solde interne.",
        },
        {
          p: "[À COMPLÉTER : fenêtre de contestation ouverte à l'acheteur et procédure détaillée de résolution des litiges]",
        },
      ],
    },
    {
      titre: "11. Propriété intellectuelle",
      blocs: [
        {
          p: "Le vendeur conserve ses droits sur les contenus qu'il publie et garantit qu'il détient les droits nécessaires à leur vente. L'achat d'un produit digital confère à l'acheteur un droit d'usage personnel, non exclusif et non transférable, sauf licence plus large indiquée sur la fiche produit. La marque et l'interface Zabelie restent la propriété de la plateforme.",
        },
      ],
    },
    {
      titre: "12. Données personnelles",
      blocs: [
        {
          p: "Le traitement de vos données est décrit dans la *politique de confidentialité*, qui fait partie des présentes conditions.",
        },
      ],
    },
    {
      titre: "13. Résiliation",
      blocs: [
        {
          p: "Vous pouvez supprimer votre compte à tout moment depuis votre tableau de bord. Les obligations nées avant la résiliation (commandes en cours, règlements, obligations légales) survivent à la fermeture du compte.",
        },
        {
          p: "[À COMPLÉTER : conditions et préavis de résiliation ou de suspension à l'initiative de la plateforme]",
        },
      ],
    },
    {
      titre: "14. Droit applicable",
      blocs: [
        {
          p: "[À COMPLÉTER : droit applicable et juridiction compétente]",
        },
      ],
    },
    {
      titre: "15. Contact",
      blocs: [{ p: "Pour toute question relative aux présentes conditions : **{email}**." }],
    },
  ],
};

const ht: Politique = {
  titre: "Kondisyon itilizasyon",
  majLabel: "Dènye mizajou",
  avisTraduction:
    "Vèsyon sa a se yon tradiksyon. An ka de diferans, se tèks fransè a ki fè lwa.",
  sections: [
    {
      titre: "1. Objè ak akseptasyon",
      blocs: [
        {
          p: "Kondisyon sa yo gouvène itilizasyon mache Zabelie a, ke **{entite}** ap opere. Lè ou kreye yon kont oswa ou pase yon kòmand, ou aksepte yo. Si ou pa dakò ak kondisyon sa yo, pa itilize sèvis la.",
        },
        {
          p: "[POU KONPLETE : laj minimòm ak kapasite jiridik ki nesesè pou itilize sèvis la]",
        },
      ],
    },
    {
      titre: "2. Definisyon",
      blocs: [
        {
          ul: [
            "**Achtè** : nenpòt moun ki pase yon kòmand sou platfòm lan.",
            "**Vandè** (oswa kreyatè) : nenpòt moun ki pibliye pwodwi pou vann.",
            "**Pwodwi fizik** : yon byen materyèl yo remèt achtè a.",
            "**Pwodwi dijital** (fichye) : yon kontni ou telechaje — se telechajman an ki remiz la.",
            "**Sèvis** : yon prestasyon vandè a rann achtè a.",
          ],
        },
      ],
    },
    {
      titre: "3. Kreyasyon kont",
      blocs: [
        {
          p: "Kont lan pèsonèl. Ou responsab konfidansyalite idantifyan ou yo ak tout aksyon ki fèt apati kont ou. Enfòmasyon ou bay yo dwe egzak epi ajou.",
        },
      ],
    },
    {
      titre: "4. Obligasyon vandè a",
      blocs: [
        {
          ul: [
            "Pibliye sèlman pwodwi ou gen dwa vann — lis sa ou pa gen dwa vann lan pibliye sou paj *pwodwi entèdi* a epi li fè pati kondisyon sa yo.",
            "Dekri pwodwi a oswa prestasyon an onètman (eta, kontni, konpatibilite, delè).",
            "Onore remiz la : voye pwodwi fizik la, rann prestasyon an, bay yon fichye ki konfòm.",
          ],
        },
        {
          p: "Zabelie ka retire yon piblikasyon ki vyole obligasyon sa yo epi sispann kont yon vandè an ka de vyolasyon grav oswa repete.",
        },
      ],
    },
    {
      titre: "5. Kòmand ak peman",
      blocs: [
        {
          p: "Mwayen peman ki disponib yo se sa ki parèt sou ekran peman an (sitou MonCash ; lòt mwayen ka vini oswa retire). Yon kòmand konfime sèlman apre operatè a konfime peman an — pa janm sou senp retou navigatè a. Zabelie **pa** fè peman lè yo remèt machandiz la.",
        },
      ],
    },
    {
      titre: "6. Règleman vandè a ak maturasyon",
      blocs: [
        {
          p: "Lajan ki soti nan yon vant anrejistre nan rejis vandè a epi li vin disponib apre yon **peryòd maturasyon 7 jou** apre konfimasyon peman an. Pou pwodwi fizik ak sèvis, disponibilite a kondisyone tou pa **remiz la** : vandè a deklare li remèt, achtè a konfime (oswa konfimasyon an fèt otomatikman apre delè ki afiche a, sof si gen kontestasyon).",
        },
        {
          p: "Rejis Zabelie a se yon rejis kontab entèn : li pa yon kont peman, ni yon bous elektwonik, epi li pa pèmèt ni depo, ni retrè kach, ni transfè ant itilizatè.",
        },
      ],
    },
    {
      titre: "7. Verifikasyon idantite vandè a",
      blocs: [
        {
          p: "Anvan Zabelie peye yon vandè lajan li merite a, li ka mande l verifye idantite l. Verifikasyon sa a **pa** obligatwa pou louvri yon kont, **ni** pou pibliye yon òf, **ni** pou achte : se sèlman peman lajan an ki depann de li.",
        },
        {
          ul: [
            "**Sa yo mande** : de dokiman pami yon kat idantifikasyon nasyonal, yon paspò, ak yon foto moun nan ki pèmèt konpare l ak dokiman an.",
            "**Kijan** : se Zabelie ki fè verifikasyon an **alamen** ; desizyon an enskri ak dat li ak non moun ki pran l.",
            "**Toutotan li poko abouti** : peman an ka sispann. Lajan an rete **pou vandè a** epi li enskri nan rejis li — li pa pèdi, li pa diminye, epi li pa ekspire poutèt sa.",
            "**Konfidansyalite ak dire** : pyès yo pa janm pibliye ni bay okenn lòt moun, epi yo detwi lè dire ki nan **politik konfidansyalite** a, seksyon « Pyès idantite », fini.",
          ],
        },
        {
          p: "Si yo refize, y ap di vandè a poukisa, epi li ka voye yon nouvo dosye. Zabelie **pa mande okenn lajan** pou verifikasyon sa a.",
        },
      ],
    },
    {
      titre: "8. Komisyon",
      blocs: [
        {
          p: "Zabelie pran yon komisyon sou chak vant, dapre **barèm ki an vigè epi ki afiche bay vandè a** anvan piblikasyon an ak nan tablo li. Barèm lan ka chanje ; to ki aplike sou yon vant se sa ki te an vigè lè kòmand lan te pase.",
        },
      ],
    },
    {
      titre: "9. Sèvis opsyonèl peyan",
      blocs: [
        {
          p: "Zabelie ofri vandè yo sèvis opsyonèl peyan — jodi a, èd pou ekri deskripsyon pwodui lè ou depase yon kantite gratis chak jou. Okenn sèvis peyan pa janm lanse san konsantman klè ou : pri chak itilizasyon parèt nan moman ou chwazi kontinye a, e se pri ki parèt la ki konte.",
        },
        {
          ul: [
            "gen yon kantite itilizasyon gratis chak jou, ki make nan aplikasyon an, anvan nenpòt fakti ;",
            "apre sa, chak itilizasyon peye pri ki parèt sou ekran konsantman an, an goud (HTG) ;",
            "frè ou konsanti yo ap dedwi nan pwochen règleman vandè w, e yo anrejistre kòm yon liy apa ;",
            "yon sèvis ou deja itilize rete dèt : si yo rejte yon demann retrè, y ap remèt ou montan retrè a, men yo p ap remèt frè sèvis ou deja konsome yo ;",
            "si pri a chanje, se sèlman pou itilizasyon k ap vini yo, jamè pou sa ki fèt deja.",
          ],
        },
      ],
    },
    {
      titre: "10. Litij ak ranbousman",
      blocs: [
        {
          p: "Si remiz la pa fèt oswa li pa konfòm, achtè a ka siyale sa nan espas « acha mwen yo ». Dosye a egzamine epi règleman vandè a sispann pandan egzamen an. Tout ranbousman fèt **sou mwayen peman orijinal la** — pa janm sou yon balans entèn.",
        },
        {
          p: "[POU KONPLETE : fenèt kontestasyon achtè a genyen ak pwosedi detaye pou rezoud litij yo]",
        },
      ],
    },
    {
      titre: "11. Pwopriyete entelektyèl",
      blocs: [
        {
          p: "Vandè a kenbe dwa li sou kontni li pibliye yo epi li garanti li gen dwa ki nesesè pou vann yo. Acha yon pwodwi dijital bay achtè a yon dwa itilizasyon pèsonèl, ki pa eksklizif epi ki pa transferab, sof si fich pwodwi a endike yon lisans pi laj. Mak ak entèfas Zabelie a rete pwopriyete platfòm lan.",
        },
      ],
    },
    {
      titre: "12. Done pèsonèl",
      blocs: [
        {
          p: "Tretman done ou yo dekri nan *politik konfidansyalite* a, ki fè pati kondisyon sa yo.",
        },
      ],
    },
    {
      titre: "13. Fèmti kont",
      blocs: [
        {
          p: "Ou ka efase kont ou nenpòt lè nan tablo ou. Obligasyon ki te fèt anvan fèmti a (kòmand an kou, règleman, obligasyon legal) rete valab apre kont lan fèmen.",
        },
        {
          p: "[POU KONPLETE : kondisyon ak preavi pou platfòm lan sispann oswa fèmen yon kont]",
        },
      ],
    },
    {
      titre: "14. Lwa ki aplikab",
      blocs: [
        {
          p: "[POU KONPLETE : lwa ki aplikab ak tribinal ki konpetan]",
        },
      ],
    },
    {
      titre: "15. Kontak",
      blocs: [{ p: "Pou nenpòt kesyon sou kondisyon sa yo : **{email}**." }],
    },
  ],
};

const en: Politique = {
  titre: "Terms of use",
  majLabel: "Last updated",
  avisTraduction:
    "This version is a translation. In case of discrepancy, the French text prevails.",
  sections: [
    {
      titre: "1. Purpose and acceptance",
      blocs: [
        {
          p: "These terms govern the use of the Zabelie marketplace, operated by **{entite}**. By creating an account or placing an order, you accept them. If you do not accept these terms, do not use the service.",
        },
        {
          p: "[TO BE COMPLETED: minimum age and legal capacity required to use the service]",
        },
      ],
    },
    {
      titre: "2. Definitions",
      blocs: [
        {
          ul: [
            "**Buyer**: any person placing an order on the platform.",
            "**Seller** (or creator): any person publishing products for sale.",
            "**Physical product**: a material good handed over to the buyer.",
            "**Digital product** (file): downloadable content, delivered by the download itself.",
            "**Service**: work performed by the seller for the buyer.",
          ],
        },
      ],
    },
    {
      titre: "3. Account creation",
      blocs: [
        {
          p: "The account is personal. You are responsible for the confidentiality of your credentials and for the actions taken from your account. The information you provide must be accurate and kept up to date.",
        },
      ],
    },
    {
      titre: "4. Seller obligations",
      blocs: [
        {
          ul: [
            "Only publish products you have the right to sell — the list of what cannot be sold is published on the *prohibited products* page and forms part of these terms.",
            "Describe the product or service honestly (condition, content, compatibility, timelines).",
            "Honour delivery: ship the physical product, perform the service, provide a conforming downloadable file.",
          ],
        },
        {
          p: "Zabelie may remove a listing that breaches these obligations and suspend a seller account in the event of a serious or repeated breach.",
        },
      ],
    },
    {
      titre: "5. Orders and payment",
      blocs: [
        {
          p: "The available payment methods are those offered at checkout (notably MonCash; other methods may be added or withdrawn). An order is confirmed only once the operator confirms the payment — never on the browser return alone. Zabelie does **not** offer cash on delivery.",
        },
      ],
    },
    {
      titre: "6. Seller settlement and maturation",
      blocs: [
        {
          p: "Proceeds of a sale are recorded in the seller ledger and become available after a **7-day maturation period** following payment confirmation. For physical products and services, availability is additionally conditioned on **delivery**: the seller declares delivery, the buyer confirms (or confirmation occurs automatically after the displayed period, absent a dispute).",
        },
        {
          p: "The Zabelie ledger is an internal accounting record: it is neither a payment account nor an electronic wallet, and allows no deposits, no cash withdrawals and no transfers between users.",
        },
      ],
    },
    {
      titre: "7. Seller identity verification",
      blocs: [
        {
          p: "Before settling the amounts owed to a seller, Zabelie may require verification of their identity. This verification is required **neither** to create an account, **nor** to publish an offer, **nor** to buy: it conditions the payment of funds only.",
        },
        {
          ul: [
            "**What is asked for**: two documents among a national identification card, a passport, and a photograph of the holder allowing a match with the document presented.",
            "**How**: verification is carried out **manually** by Zabelie; the decision is timestamped and attributed to its author.",
            "**Until it succeeds**: settlement may be suspended. The amounts remain **the seller's** and stay recorded in their register — they are neither lost, nor reduced, nor time-barred by this fact.",
            "**Confidentiality and duration**: the documents are never published or disclosed to third parties, and are destroyed at the end of the period stated in the **privacy policy**, section “Identity documents”.",
          ],
        },
        {
          p: "If verification is refused, the reason is communicated to the seller, who may submit a new file. Zabelie charges **no fee** for this verification.",
        },
      ],
    },
    {
      titre: "8. Commissions",
      blocs: [
        {
          p: "Zabelie charges a commission on each sale, according to the **schedule in force shown to the seller** before publication and in their dashboard. The schedule may change; the rate applicable to a sale is the one in force when the order was placed.",
        },
      ],
    },
    {
      titre: "9. Optional paid services",
      blocs: [
        {
          p: "Zabelie offers sellers optional paid services — currently, help writing product descriptions beyond a free daily quota. No paid service is ever triggered without your explicit consent: the price per use is displayed at the moment you choose to continue, and that displayed price is what applies.",
        },
        {
          ul: [
            "a free daily usage quota, shown in the app, applies before any billing;",
            "beyond it, each use is billed at the price shown on the consent screen, in gourdes (HTG);",
            "consented fees are deducted from your next seller settlement and recorded as a separate entry;",
            "a consumed service remains due: if a withdrawal request is rejected, the withdrawal amount is returned, but fees for services already consumed are not;",
            "any price change applies to future uses only, never retroactively.",
          ],
        },
      ],
    },
    {
      titre: "10. Disputes and refunds",
      blocs: [
        {
          p: "If delivery does not occur or does not conform, the buyer can report it from their “my purchases” space. The case is then reviewed and the seller settlement is withheld during the review. Any refund is made **to the original payment method** — never to an internal balance.",
        },
        {
          p: "[TO BE COMPLETED: buyer dispute window and detailed dispute-resolution procedure]",
        },
      ],
    },
    {
      titre: "11. Intellectual property",
      blocs: [
        {
          p: "The seller retains rights over the content they publish and warrants that they hold the rights required to sell it. Purchasing a digital product grants the buyer a personal, non-exclusive, non-transferable right of use, unless a broader licence is stated on the product page. The Zabelie brand and interface remain the property of the platform.",
        },
      ],
    },
    {
      titre: "12. Personal data",
      blocs: [
        {
          p: "The processing of your data is described in the *privacy policy*, which forms part of these terms.",
        },
      ],
    },
    {
      titre: "13. Termination",
      blocs: [
        {
          p: "You may delete your account at any time from your dashboard. Obligations arising before termination (pending orders, settlements, legal obligations) survive the closure of the account.",
        },
        {
          p: "[TO BE COMPLETED: conditions and notice for platform-initiated suspension or termination]",
        },
      ],
    },
    {
      titre: "14. Governing law",
      blocs: [
        {
          p: "[TO BE COMPLETED: governing law and competent jurisdiction]",
        },
      ],
    },
    {
      titre: "15. Contact",
      blocs: [{ p: "For any question about these terms: **{email}**." }],
    },
  ],
};

const es: Politique = {
  titre: "Condiciones de uso",
  majLabel: "Última actualización",
  avisTraduction:
    "Esta versión es una traducción. En caso de discrepancia, prevalece el texto en francés.",
  sections: [
    {
      titre: "1. Objeto y aceptación",
      blocs: [
        {
          p: "Las presentes condiciones rigen el uso del mercado Zabelie, operado por **{entite}**. Al crear una cuenta o realizar un pedido, usted las acepta. Si no acepta estas condiciones, no utilice el servicio.",
        },
        {
          p: "[POR COMPLETAR: edad mínima y capacidad jurídica necesarias para utilizar el servicio]",
        },
      ],
    },
    {
      titre: "2. Definiciones",
      blocs: [
        {
          ul: [
            "**Comprador**: toda persona que realiza un pedido en la plataforma.",
            "**Vendedor** (o creador): toda persona que publica productos a la venta.",
            "**Producto físico**: un bien material entregado al comprador.",
            "**Producto digital** (archivo): un contenido descargable, entregado mediante la propia descarga.",
            "**Servicio**: una prestación realizada por el vendedor para el comprador.",
          ],
        },
      ],
    },
    {
      titre: "3. Creación de cuenta",
      blocs: [
        {
          p: "La cuenta es personal. Usted es responsable de la confidencialidad de sus credenciales y de las acciones realizadas desde su cuenta. La información facilitada debe ser exacta y mantenerse actualizada.",
        },
      ],
    },
    {
      titre: "4. Obligaciones del vendedor",
      blocs: [
        {
          ul: [
            "Publicar únicamente productos que tenga derecho a vender — la lista de lo que no puede venderse está publicada en la página de *productos prohibidos* y forma parte de estas condiciones.",
            "Describir honestamente el producto o la prestación (estado, contenido, compatibilidad, plazos).",
            "Cumplir la entrega: enviar el producto físico, realizar la prestación, facilitar un archivo descargable conforme.",
          ],
        },
        {
          p: "Zabelie puede retirar una publicación contraria a estas obligaciones y suspender la cuenta del vendedor en caso de incumplimiento grave o reiterado.",
        },
      ],
    },
    {
      titre: "5. Pedidos y pago",
      blocs: [
        {
          p: "Los medios de pago disponibles son los que se ofrecen en la pantalla de pago (en particular MonCash; otros medios pueden añadirse o retirarse). Un pedido solo se confirma tras la confirmación del pago por el operador — nunca por el simple retorno del navegador. Zabelie **no** practica el pago contra entrega.",
        },
      ],
    },
    {
      titre: "6. Liquidación al vendedor y maduración",
      blocs: [
        {
          p: "Los importes de una venta se inscriben en el registro del vendedor y quedan disponibles tras un **período de maduración de 7 días** desde la confirmación del pago. Para los productos físicos y los servicios, la disponibilidad está además condicionada a la **entrega**: el vendedor declara haber entregado, el comprador confirma (o la confirmación se produce automáticamente tras el plazo indicado, salvo controversia).",
        },
        {
          p: "El registro Zabelie es un registro contable interno: no constituye una cuenta de pago ni un monedero electrónico, y no permite depósitos, retiradas de efectivo ni transferencias entre usuarios.",
        },
      ],
    },
    {
      titre: "7. Verificación de identidad del vendedor",
      blocs: [
        {
          p: "Antes de liquidar las cantidades adeudadas a un vendedor, Zabelie puede exigir la verificación de su identidad. Esta verificación **no** es necesaria para crear una cuenta, **ni** para publicar una oferta, **ni** para comprar: únicamente condiciona el pago de los fondos.",
        },
        {
          ul: [
            "**Qué se pide**: dos documentos entre una cédula de identificación nacional, un pasaporte, y una fotografía del titular que permita compararlo con el documento presentado.",
            "**Cómo**: la verificación la realiza Zabelie de forma **manual**; la decisión queda fechada y atribuida a su autor.",
            "**Mientras no prospere**: la liquidación puede suspenderse. Las cantidades siguen siendo **del vendedor** y constan en su registro — no se pierden, no se reducen ni prescriben por este hecho.",
            "**Confidencialidad y plazo**: los documentos nunca se publican ni se comunican a terceros, y se destruyen al término del plazo indicado en la **política de privacidad**, sección «Documentos de identidad».",
          ],
        },
        {
          p: "En caso de denegación, se comunica el motivo al vendedor, que puede presentar un nuevo expediente. Zabelie **no cobra importe alguno** por esta verificación.",
        },
      ],
    },
    {
      titre: "8. Comisiones",
      blocs: [
        {
          p: "Zabelie cobra una comisión por cada venta, según el **baremo vigente mostrado al vendedor** antes de la publicación y en su panel. El baremo puede cambiar; el tipo aplicable a una venta es el vigente en el momento del pedido.",
        },
      ],
    },
    {
      titre: "9. Servicios opcionales de pago",
      blocs: [
        {
          p: "Zabelie ofrece a los vendedores servicios opcionales de pago — actualmente, ayuda para redactar descripciones de productos más allá de una cuota gratuita diaria. Ningún servicio de pago se activa sin su consentimiento explícito: el precio por uso se muestra en el momento en que usted decide continuar, y ese precio mostrado es el que rige.",
        },
        {
          ul: [
            "una cuota diaria gratuita, indicada en la aplicación, se aplica antes de cualquier facturación;",
            "más allá de ella, cada uso se factura al precio mostrado en la pantalla de consentimiento, en gourdes (HTG);",
            "las tarifas consentidas se deducen de su próxima liquidación de vendedor y se registran como una línea separada;",
            "un servicio consumido sigue siendo debido: si una solicitud de retiro es rechazada, se devuelve el monto del retiro, pero no las tarifas de servicios ya consumidos;",
            "cualquier cambio de precio se aplica solo a usos futuros, nunca retroactivamente.",
          ],
        },
      ],
    },
    {
      titre: "10. Controversias y reembolsos",
      blocs: [
        {
          p: "Si la entrega no se produce o no es conforme, el comprador puede señalarlo desde su espacio «mis compras». El expediente se examina y la liquidación al vendedor se suspende durante el examen. Todo reembolso se efectúa **al medio de pago original** — nunca a un saldo interno.",
        },
        {
          p: "[POR COMPLETAR: plazo de reclamación del comprador y procedimiento detallado de resolución de controversias]",
        },
      ],
    },
    {
      titre: "11. Propiedad intelectual",
      blocs: [
        {
          p: "El vendedor conserva sus derechos sobre los contenidos que publica y garantiza que posee los derechos necesarios para su venta. La compra de un producto digital confiere al comprador un derecho de uso personal, no exclusivo e intransferible, salvo licencia más amplia indicada en la ficha del producto. La marca y la interfaz de Zabelie siguen siendo propiedad de la plataforma.",
        },
      ],
    },
    {
      titre: "12. Datos personales",
      blocs: [
        {
          p: "El tratamiento de sus datos se describe en la *política de privacidad*, que forma parte de estas condiciones.",
        },
      ],
    },
    {
      titre: "13. Terminación",
      blocs: [
        {
          p: "Puede eliminar su cuenta en cualquier momento desde su panel. Las obligaciones nacidas antes de la terminación (pedidos en curso, liquidaciones, obligaciones legales) sobreviven al cierre de la cuenta.",
        },
        {
          p: "[POR COMPLETAR: condiciones y preaviso de suspensión o terminación a iniciativa de la plataforma]",
        },
      ],
    },
    {
      titre: "14. Derecho aplicable",
      blocs: [
        {
          p: "[POR COMPLETAR: derecho aplicable y jurisdicción competente]",
        },
      ],
    },
    {
      titre: "15. Contacto",
      blocs: [{ p: "Para cualquier consulta sobre estas condiciones: **{email}**." }],
    },
  ],
};

export const CONDITIONS: Record<Lang, Politique> = { fr, ht, en, es };
