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
 * `CLAUDE.md`). Tout point exigeant un arbitrage JURIDIQUE portait un
 * marqueur `[À COMPLÉTER : …]` explicite. **Le compte des marqueurs est FIGÉ
 * par `tests/conditions-utilisation.test.ts`** — il vaut 0 depuis le
 * 2026-10-03 : un marqueur en plus rougit (on n'ouvre pas un blanc sans
 * témoin). Seule l'identité `{entite}` reste à fournir, et c'est le cliquet
 * de la confidentialité qui la compte.
 *
 * ⚖️ Le quatrième, la fenêtre de litige (§10), a été rédigé le 2026-10-02 par
 * l'agent, sur mandat du porteur (« Je rédige, vous validez »), d'après le
 * mécanisme en production (`0043`, `0068`). Il ne chiffre AUCUN délai — les
 * valeurs vivent en table de config et restent l'arbitrage D-14 (`docs/28`) —
 * et ne décrit pas l'exécution du remboursement (D-12). À VALIDER par le
 * porteur et son conseil, comme le reste du gabarit.
 *
 * ⚖️ Les trois derniers — âge minimum (§1), suspension et fermeture (§13),
 * droit applicable (§14) — l'ont été le 2026-10-03, sur le même mandat, sur
 * le modèle des géants (Amazon, eBay, Etsy) et au plus près du code : le
 * §13 décrit la suspension que font `/api/admin/user-status`, `0017`,
 * `0079` et `0112`, rien de plus (garde : `tests/suspension-argent.test.ts`).
 * Le §1 prend la majorité haïtienne (Constitution de 1987, art. 16-2). À
 * VALIDER par le porteur et son conseil.
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
 * celui-ci : les marqueurs d'ici étaient d'AUTRES blancs, juridiques,
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
          p: "Pour créer un compte, vous devez avoir au moins **18 ans** — l'âge de la majorité en Haïti — et la capacité de conclure un contrat selon la loi qui vous est applicable. Un mineur ne peut utiliser le service que par le compte d'un parent ou d'un tuteur légal, sous sa supervision et sa responsabilité.",
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
          p: "Zabelie propose aux vendeurs des services optionnels payants — aujourd'hui, l'aide à la rédaction de descriptions de produits et la création d'images publicitaires (Studio), chacune au-delà d'un quota gratuit quotidien. Aucun service payant n'est déclenché sans votre consentement explicite : le prix par utilisation est affiché au moment où vous choisissez de continuer, et c'est ce prix affiché qui fait foi.",
        },
        {
          ul: [
            "un quota d'utilisations gratuites par jour, indiqué dans l'application, s'applique avant toute facturation ;",
            "au-delà, chaque utilisation est facturée au prix affiché à l'écran de consentement, en gourdes (HTG) ;",
            "les frais consentis sont déduits de votre prochain règlement vendeur et enregistrés comme une écriture distincte ;",
            "un service consommé reste dû : si une demande de retrait est rejetée, le montant du retrait est restitué, mais les frais de services déjà consommés ne le sont pas ;",
            "toute modification de prix ne s'applique qu'aux utilisations futures, jamais rétroactivement ;",
            "Studio : l'image est créée par un prestataire externe (Higgsfield) à partir de la photo de votre produit, qui lui est transmise à cette seule fin ; seule une image effectivement livrée est facturée, une création qui échoue ne l'est pas ;",
            "vous vérifiez chaque image avant de la publier et vous en êtes responsable : elle doit montrer votre produit tel qu'il est, sans texte, logo ni marque d'un tiers ; Zabelie ne garantit pas la conservation des images créées : téléchargez celles que vous souhaitez garder.",
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
          ul: [
            "**Délai de contestation** : pour un produit physique ou un service, lorsque le vendeur déclare la remise, l'acheteur peut, jusqu'à l'échéance affichée dans « mes achats », confirmer la réception ou signaler qu'il n'a rien reçu. Sans réponse à l'échéance, la commande est réputée reçue, à condition que l'acheteur ait été avisé de la déclaration puis relancé avant l'échéance ; à défaut, le dossier est examiné par Zabelie.",
            "**Absence de déclaration du vendeur** : si le vendeur ne déclare pas la remise dans le délai fixé par Zabelie à compter de la confirmation du paiement, la commande est examinée par Zabelie, qui peut relancer le vendeur, constater la remise ou rembourser l'acheteur.",
            "**Après la réception, et pour un fichier téléchargeable** : un problème se signale par l'un des contacts indiqués sur la page d'aide, avec la référence de la commande. Il est examiné au cas par cas ; un signalement ne garantit pas un remboursement automatique.",
            "**Examen** : Zabelie n'observe pas la remise. Elle statue au vu des déclarations des parties, des échanges tenus dans la messagerie Zabelie et des éléments fournis. À l'issue de l'examen, la commande est soit considérée comme remise — le règlement du vendeur reprend alors son cours —, soit remboursée à l'acheteur, vers son moyen de paiement d'origine.",
            "**Paiement hors de la plateforme** : un règlement effectué en dehors de Zabelie, notamment de la main à la main, n'est pas couvert par cette procédure.",
          ],
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
          ul: [
            "**Suspension** : Zabelie peut suspendre un compte sans préavis en cas de fraude ou de tentative de fraude, de mise en vente d'un produit interdit, de paiement demandé ou effectué hors de la plateforme, d'atteinte à la sécurité d'autres utilisateurs, ou de manquement grave ou répété aux présentes conditions.",
            "**Effets** : la suspension est réversible. Elle bloque la connexion au compte, masque ses offres du catalogue et empêche toute nouvelle commande sur celles-ci ; tout est rétabli si la suspension est levée.",
            "**Argent** : une suspension n'efface ni ne réduit les sommes dues au vendeur, qui restent inscrites à son registre (§6) ; seul leur retrait est bloqué tant que dure la suspension. Les commandes concernées peuvent être remboursées aux acheteurs, une à une, vers leur moyen de paiement d'origine (§10).",
            "**Motif et contestation** : toute suspension est motivée. Le motif est enregistré et vous est communiqué sur demande auprès des contacts indiqués sur la page d'aide, sauf si cette communication compromettrait l'examen d'une fraude. Vous pouvez contester la décision par les mêmes contacts.",
            "**Fermeture à l'initiative de Zabelie** : hors des cas ci-dessus, Zabelie ne peut fermer un compte qu'avec un préavis écrit de **30 jours**.",
          ],
        },
      ],
    },
    {
      titre: "14. Droit applicable",
      blocs: [
        {
          p: "Les présentes conditions sont régies par le droit haïtien. Avant toute action, la procédure du §10 s'applique. À défaut d'accord, tout litige relève des tribunaux haïtiens compétents du ressort du siège de **{entite}**, sans préjudice des dispositions impératives qui protègent le consommateur dans son pays de résidence.",
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
          p: "Pou kreye yon kont, ou dwe gen omwen **18 an** — laj majorite ann Ayiti — epi gen kapasite pou siyen yon kontra dapre lwa ki aplike pou ou. Yon minè ka itilize sèvis la sèlman nan kont yon paran oswa yon gadyen legal, anba siveyans ak responsablite li.",
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
          p: "Zabelie ofri vandè yo sèvis opsyonèl peyan — jodi a, èd pou ekri deskripsyon pwodui ak kreyasyon imaj piblisite (Estidyo), chak lè ou depase yon kantite gratis chak jou. Okenn sèvis peyan pa janm lanse san konsantman klè ou : pri chak itilizasyon parèt nan moman ou chwazi kontinye a, e se pri ki parèt la ki konte.",
        },
        {
          ul: [
            "gen yon kantite itilizasyon gratis chak jou, ki make nan aplikasyon an, anvan nenpòt fakti ;",
            "apre sa, chak itilizasyon peye pri ki parèt sou ekran konsantman an, an goud (HTG) ;",
            "frè ou konsanti yo ap dedwi nan pwochen règleman vandè w, e yo anrejistre kòm yon liy apa ;",
            "yon sèvis ou deja itilize rete dèt : si yo rejte yon demann retrè, y ap remèt ou montan retrè a, men yo p ap remèt frè sèvis ou deja konsome yo ;",
            "si pri a chanje, se sèlman pou itilizasyon k ap vini yo, jamè pou sa ki fèt deja ;",
            "Estidyo : se yon prestatè deyò (Higgsfield) ki kreye imaj la apati foto pwodui w la, nou voye foto a ba li pou sa sèlman ; se sèlman yon imaj ki rive fèt ou peye, si kreyasyon an echwe ou pa peye ;",
            "ou verifye chak imaj anvan ou pibliye l, e se ou ki responsab li : li dwe montre pwodui w la jan li ye, san tèks, logo ni mak lòt moun ; Zabelie pa garanti l ap kenbe imaj yo : telechaje sa ou vle kenbe yo.",
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
          ul: [
            "**Delè pou konteste** : pou yon pwodui fizik oswa yon sèvis, lè vandè a deklare li remèt li, achtè a ka, jiska delè ki parèt nan « acha mwen yo », konfime li resevwa l oswa siyale li pa resevwa anyen. Si li pa reponn lè delè a rive, nou konsidere li resevwa l, depi li te resevwa yon avi sou deklarasyon an epi yon rapèl anvan delè a ; si se pa sa, Zabelie egzamine dosye a.",
            "**Vandè a pa deklare anyen** : si vandè a pa deklare remiz la nan delè Zabelie fikse apati konfimasyon peman an, Zabelie egzamine kòmand lan ; li ka relanse vandè a, konstate remiz la oswa ranbouse achtè a.",
            "**Apre resepsyon an, ak pou yon fichye pou telechaje** : pou siyale yon pwoblèm, sèvi ak youn nan kontak ki sou paj èd la, ak referans kòmand lan. Chak ka egzamine youn pa youn ; yon siyalman pa garanti yon ranbousman otomatik.",
            "**Egzamen** : Zabelie pa wè remiz la. Li deside dapre sa de pati yo deklare, mesaj yo te voye nan mesaji Zabelie a ak prèv yo bay. Lè egzamen an fini, swa kòmand lan konsidere kòm remèt — règleman vandè a kontinye —, swa achtè a ranbouse sou mwayen peman orijinal li.",
            "**Peman andeyò platfòm nan** : yon peman ki fèt andeyò Zabelie, sitou men nan men, pa kouvri pa pwosedi sa a.",
          ],
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
          ul: [
            "**Sispansyon** : Zabelie ka sispann yon kont san preavi si gen fwod oswa tantativ fwod, si yo mete yon pwodwi entèdi an vant, si yo mande oswa fè yon peman andeyò platfòm nan, si yo mete sekirite lòt itilizatè an danje, oswa si yo vyole kondisyon sa yo yon fason grav oswa plizyè fwa.",
            "**Efè** : sispansyon an ka anile. Li bloke koneksyon kont lan, li kache òf li yo nan katalòg la epi li anpeche nenpòt nouvo kòmand sou yo ; tout bagay retounen jan yo te ye si sispansyon an leve.",
            "**Lajan** : yon sispansyon pa efase ni diminye lajan yo dwe vandè a, ki rete enskri nan rejis li (§6) ; se sèlman retrè lajan an ki bloke pandan sispansyon an dire. Kòmand ki konsène yo ka ranbouse bay achtè yo, youn pa youn, sou menm mwayen peman orijinal yo (§10).",
            "**Rezon ak kontestasyon** : chak sispansyon gen yon rezon. Rezon an anrejistre epi nou ba ou l si ou mande l nan kontak ki sou paj èd la, sof si sa ta anpeche nou egzamine yon fwod. Ou ka konteste desizyon an nan menm kontak sa yo.",
            "**Fèmti kont pa Zabelie** : apa ka ki anwo yo, Zabelie ka fèmen yon kont sèlman ak yon preavi alekri **30 jou** davans.",
          ],
        },
      ],
    },
    {
      titre: "14. Lwa ki aplikab",
      blocs: [
        {
          p: "Lwa ayisyen gouvène kondisyon sa yo. Anvan nenpòt aksyon, pwosedi §10 la aplike. Si pa gen antant, tout litij ale devan tribinal ayisyen ki konpetan nan zòn kote **{entite}** gen biwo prensipal li, san sa pa retire pwoteksyon obligatwa lwa peyi kote konsomatè a rete ba li.",
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
          p: "To create an account, you must be at least **18 years old** — the age of majority in Haiti — and have the legal capacity to enter into a contract under the law that applies to you. A minor may use the service only through the account of a parent or legal guardian, under their supervision and responsibility.",
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
          p: "Zabelie offers sellers optional paid services — currently, help writing product descriptions and the creation of advertising images (Studio), each beyond a free daily quota. No paid service is ever triggered without your explicit consent: the price per use is displayed at the moment you choose to continue, and that displayed price is what applies.",
        },
        {
          ul: [
            "a free daily usage quota, shown in the app, applies before any billing;",
            "beyond it, each use is billed at the price shown on the consent screen, in gourdes (HTG);",
            "consented fees are deducted from your next seller settlement and recorded as a separate entry;",
            "a consumed service remains due: if a withdrawal request is rejected, the withdrawal amount is returned, but fees for services already consumed are not;",
            "any price change applies to future uses only, never retroactively;",
            "Studio: the image is created by an external provider (Higgsfield) from your product photo, which is sent to it for that sole purpose; only an image actually delivered is charged, a creation that fails is not;",
            "you check each image before publishing it and you are responsible for it: it must show your product as it really is, with no text, logo or third-party brand; Zabelie does not guarantee that created images are kept: download the ones you want to keep.",
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
          ul: [
            "**Dispute window**: for a physical product or a service, when the seller declares delivery, the buyer may, until the deadline displayed in “my purchases”, confirm receipt or report that nothing was received. Absent a response by the deadline, the order is deemed received, provided the buyer was notified of the declaration and then reminded before the deadline; otherwise, the case is reviewed by Zabelie.",
            "**No declaration by the seller**: if the seller does not declare delivery within the period set by Zabelie from payment confirmation, the order is reviewed by Zabelie, which may follow up with the seller, record the delivery or refund the buyer.",
            "**After receipt, and for a downloadable file**: a problem is reported through one of the contacts listed on the help page, with the order reference. It is reviewed case by case; reporting a problem does not guarantee an automatic refund.",
            "**Review**: Zabelie does not observe delivery. It decides on the basis of the parties' declarations, the exchanges held in Zabelie messaging and the evidence provided. At the end of the review, the order is either considered delivered — the seller settlement then resumes — or refunded to the buyer, to the original payment method.",
            "**Payment outside the platform**: a payment made outside Zabelie, in particular hand to hand, is not covered by this procedure.",
          ],
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
          ul: [
            "**Suspension**: Zabelie may suspend an account without notice in case of fraud or attempted fraud, listing of a prohibited product, payment requested or made outside the platform, harm to the safety of other users, or serious or repeated breach of these terms.",
            "**Effects**: suspension is reversible. It blocks sign-in to the account, hides its listings from the catalogue and prevents any new order on them; everything is restored if the suspension is lifted.",
            "**Money**: a suspension neither erases nor reduces the sums owed to the seller, which remain recorded in their ledger (§6); only their withdrawal is blocked while the suspension lasts. The orders concerned may be refunded to buyers, one by one, to their original payment method (§10).",
            "**Reason and challenge**: every suspension has a stated reason. The reason is recorded and communicated to you on request through the contacts listed on the help page, unless doing so would compromise the review of a fraud. You may challenge the decision through the same contacts.",
            "**Closure by Zabelie**: outside the cases above, Zabelie may close an account only with **30 days'** written notice.",
          ],
        },
      ],
    },
    {
      titre: "14. Governing law",
      blocs: [
        {
          p: "These terms are governed by Haitian law. Before any action, the procedure in §10 applies. Failing agreement, any dispute falls within the jurisdiction of the competent Haitian courts for the registered office of **{entite}**, without prejudice to the mandatory provisions that protect consumers in their country of residence.",
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
          p: "Para crear una cuenta, usted debe tener al menos **18 años** —la mayoría de edad en Haití— y la capacidad de celebrar un contrato según la ley que le sea aplicable. Un menor solo puede utilizar el servicio a través de la cuenta de un padre, una madre o un tutor legal, bajo su supervisión y responsabilidad.",
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
          p: "Zabelie ofrece a los vendedores servicios opcionales de pago — actualmente, ayuda para redactar descripciones de productos y la creación de imágenes publicitarias (Estudio), cada una más allá de una cuota gratuita diaria. Ningún servicio de pago se activa sin su consentimiento explícito: el precio por uso se muestra en el momento en que usted decide continuar, y ese precio mostrado es el que rige.",
        },
        {
          ul: [
            "una cuota diaria gratuita, indicada en la aplicación, se aplica antes de cualquier facturación;",
            "más allá de ella, cada uso se factura al precio mostrado en la pantalla de consentimiento, en gourdes (HTG);",
            "las tarifas consentidas se deducen de su próxima liquidación de vendedor y se registran como una línea separada;",
            "un servicio consumido sigue siendo debido: si una solicitud de retiro es rechazada, se devuelve el monto del retiro, pero no las tarifas de servicios ya consumidos;",
            "cualquier cambio de precio se aplica solo a usos futuros, nunca retroactivamente;",
            "Estudio: la imagen la crea un proveedor externo (Higgsfield) a partir de la foto de su producto, que se le envía solo con ese fin; solo se cobra una imagen efectivamente entregada, una creación que falla no se cobra;",
            "usted revisa cada imagen antes de publicarla y es responsable de ella: debe mostrar su producto tal como es, sin texto, logotipo ni marca de terceros; Zabelie no garantiza la conservación de las imágenes creadas: descargue las que desee conservar.",
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
          ul: [
            "**Plazo de reclamación**: para un producto físico o un servicio, cuando el vendedor declara la entrega, el comprador puede, hasta el plazo indicado en «mis compras», confirmar la recepción o señalar que no ha recibido nada. Sin respuesta al vencer el plazo, el pedido se considera recibido, siempre que el comprador haya sido avisado de la declaración y luego recordado antes del vencimiento; de lo contrario, Zabelie examina el expediente.",
            "**Falta de declaración del vendedor**: si el vendedor no declara la entrega dentro del plazo fijado por Zabelie desde la confirmación del pago, Zabelie examina el pedido y puede recordárselo al vendedor, constatar la entrega o reembolsar al comprador.",
            "**Tras la recepción, y para un archivo descargable**: un problema se señala a través de uno de los contactos indicados en la página de ayuda, con la referencia del pedido. Se examina caso por caso; señalar un problema no garantiza un reembolso automático.",
            "**Examen**: Zabelie no observa la entrega. Decide a la vista de las declaraciones de las partes, de los intercambios mantenidos en la mensajería de Zabelie y de los elementos aportados. Al término del examen, el pedido se considera entregado — y la liquidación al vendedor sigue su curso — o se reembolsa al comprador, al medio de pago original.",
            "**Pago fuera de la plataforma**: un pago realizado fuera de Zabelie, en particular en mano, no está cubierto por este procedimiento.",
          ],
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
          ul: [
            "**Suspensión**: Zabelie puede suspender una cuenta sin preaviso en caso de fraude o intento de fraude, puesta a la venta de un producto prohibido, pago solicitado o realizado fuera de la plataforma, atentado contra la seguridad de otros usuarios, o incumplimiento grave o reiterado de las presentes condiciones.",
            "**Efectos**: la suspensión es reversible. Bloquea el acceso a la cuenta, oculta sus ofertas del catálogo e impide cualquier nuevo pedido sobre ellas; todo se restablece si se levanta la suspensión.",
            "**Dinero**: una suspensión no borra ni reduce las sumas adeudadas al vendedor, que siguen inscritas en su registro (§6); solo su retiro queda bloqueado mientras dure la suspensión. Los pedidos afectados pueden reembolsarse a los compradores, uno por uno, al medio de pago original (§10).",
            "**Motivo e impugnación**: toda suspensión está motivada. El motivo queda registrado y se le comunica a petición a través de los contactos indicados en la página de ayuda, salvo que ello comprometa el examen de un fraude. Puede impugnar la decisión por los mismos contactos.",
            "**Cierre por iniciativa de Zabelie**: fuera de los casos anteriores, Zabelie solo puede cerrar una cuenta con un preaviso escrito de **30 días**.",
          ],
        },
      ],
    },
    {
      titre: "14. Derecho aplicable",
      blocs: [
        {
          p: "Las presentes condiciones se rigen por el derecho haitiano. Antes de cualquier acción, se aplica el procedimiento del §10. A falta de acuerdo, todo litigio corresponde a los tribunales haitianos competentes del domicilio social de **{entite}**, sin perjuicio de las disposiciones imperativas que protegen al consumidor en su país de residencia.",
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
