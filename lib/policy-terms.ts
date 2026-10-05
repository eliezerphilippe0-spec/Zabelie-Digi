import type { Lang } from "./i18n";
import type { Politique } from "./policy-privacy";

/**
 * LES CONDITIONS D'UTILISATION, EN QUATRE LANGUES — PROJET CONTRACTUEL.
 *
 * Même architecture que `lib/policy-privacy.ts`, et pour les mêmes raisons :
 * un DOCUMENT typé, pas cinquante clés plates — le type impose la même
 * structure aux quatre versions, et une section perdue dans une langue casse
 * la compilation ou le test de parité, jamais silencieusement.
 *
 * ─── CE QUE CE MODULE EST, ET N'EST PAS ─────────────────────────────────────
 * C'est un projet contractuel : la structure d'une marketplace avec règlement vendeur,
 * remplie avec les SEULS termes déjà tranchés par le porteur (maturation J+7,
 * commission au barème en vigueur, remboursement vers le moyen d'origine,
 * produits interdits, pas de cash à la livraison — `docs/26`, `docs/22`,
 * `CLAUDE.md`). Les trois dernières clauses ont été rédigées le 2026-10-05
 * sur instruction du porteur « implémenter tous, n'attend pas le lancement » :
 * capacité selon les règles applicables, suspension motivée avec recours par
 * le contact existant, droit haïtien sous réserve des règles impératives.
 * Aucun âge chiffré, délai de préavis, tribunal exclusif ou notification
 * automatique n'est inventé. Les tests gardent ces réserves en quatre langues.
 *
 * ⚖️ Le quatrième, la fenêtre de litige (§10), a été rédigé le 2026-10-02 par
 * l'agent, sur mandat du porteur (« Je rédige, vous validez »), d'après le
 * mécanisme en production (`0043`, `0068`). Il ne chiffre AUCUN délai — les
 * valeurs vivent en table de config et restent l'arbitrage D-14 (`docs/28`) —
 * et ne décrit pas l'exécution du remboursement (D-12). À VALIDER par le
 * porteur et son conseil, comme le reste du gabarit.
 *
 * L'identité/adresse reste non renseignée dans le module canonique ci-dessous.
 * Rédiger les clauses n'atteste ni immatriculation, ni agrément, ni conformité
 * globale. La validation juridique reste à obtenir avant encaissement réel.
 *
 * `{entite}` et `{email}` sont résolus par le `resoudre` de
 * `lib/policy-privacy.ts` — l'objet `IDENTITE` n'est PAS dupliqué ici : les
 * remplir là-bas les remplit sur les deux documents. Ce jour-là, c'est le
 * cliquet de la CONFIDENTIALITÉ (`champsManquants`) qui rougira — pas
 * celui-ci : les marqueurs contractuels sont comptés dans le texte SOURCE,
 * qu'`IDENTITE` ne touche pas. Deux comptes
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
          p: "Pour créer un compte et conclure une vente ou un achat, vous devez avoir la capacité juridique nécessaire selon les règles qui vous sont applicables. Si vous agissez pour une entreprise ou pour un tiers, vous devez être habilité à l'engager. N'utilisez pas le service pour conclure un contrat que vous n'avez pas la capacité ou le pouvoir de conclure.",
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
            "Décrire honnêtement le produit ou la prestation (prix, état, contenu, compatibilité, délais) et annoncer les conditions de remise avant la commande.",
            "Si vous exercez une activité commerciale, satisfaire aux formalités qui vous sont applicables en Haïti, notamment l'immatriculation, la carte d'identité professionnelle (CIP) et les autorisations liées à votre activité. Vous êtes responsable de vos déclarations et obligations fiscales ; un compte Zabelie ne remplace aucune formalité administrative.",
            "Honorer la remise annoncée : remettre le produit physique en main propre ou organiser son transport par un tiers, rendre la prestation, fournir un fichier téléchargeable conforme.",
          ],
        },
        {
          p: "Le vendeur organise la remise ou le transport prévu dans son offre. **Zabelie ne stocke ni ne livre les produits, n'organise pas leur transport et ne facture pas de frais de livraison.** Zabelie peut retirer une publication contraire à ces obligations et suspendre le compte vendeur en cas de manquement grave ou répété.",
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
          p: "Le registre Zabelie retrace les écritures comptables liées aux ventes. Il ne permet pas d'alimenter un solde, de payer un achat avec ce solde, de retirer des espèces ni de transférer une somme entre utilisateurs. **Zabelie ne propose pas de service Zabelie Pay autonome.** La maturation est une règle de fonctionnement commercial ; elle n'atteste pas d'un agrément ni d'une validation de la BRH.",
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
          p: "Zabelie peut retirer une offre ou suspendre l'accès au compte en cas de violation de ces conditions, de contenu interdit, de fraude suspectée ou de risque pour la sécurité. Une mesure conservatoire peut être immédiate lorsque la protection des utilisateurs ou le respect d'une obligation légale l'exige ; aucun délai de préavis uniforme n'est garanti. La suspension est enregistrée avec son motif et peut être levée après examen. Vous pouvez demander ce motif et contester la mesure à **{email}**, y compris sans accès au compte. La suspension n'efface ni vos droits sur les sommes dues ni les obligations liées aux commandes antérieures.",
        },
      ],
    },
    {
      titre: "14. Droit applicable",
      blocs: [
        {
          p: "Les présentes conditions sont régies par le droit haïtien, sous réserve des dispositions impératives applicables à votre situation, notamment pour un acheteur situé hors d'Haïti. Vous pouvez contacter **{email}** pour rechercher une solution amiable ; cette démarche est facultative et ne vous prive pas d'un recours. À défaut d'accord, le litige relève des juridictions compétentes selon les règles applicables. Aucune compétence territoriale exclusive ni renonciation aux droits impératifs du consommateur n'est imposée par ces conditions.",
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
          p: "Pou kreye yon kont epi fè yon kontra vann oswa achte, ou dwe gen kapasite jiridik ki nesesè dapre règ ki aplikab pou ou. Si ou aji pou yon antrepriz oswa pou yon lòt moun, ou dwe gen otorizasyon pou angaje li. Pa itilize sèvis la pou fè yon kontra ou pa gen kapasite oswa otorizasyon pou fè.",
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
            "Dekri pwodwi a oswa prestasyon an onètman (pri, eta, kontni, konpatibilite, delè) epi anonse kondisyon remiz la anvan kòmand lan.",
            "Si ou fè yon aktivite komèsyal, ranpli fòmalite ki aplikab pou ou ann Ayiti, sitou enskripsyon, kat idantite pwofesyonèl (CIP) ak otorizasyon pou aktivite ou. Ou responsab deklarasyon ak obligasyon fiskal ou ; yon kont Zabelie pa ranplase okenn fòmalite administratif.",
            "Onore remiz ou anonse a : remèt pwodwi fizik la men nan men oswa òganize transpò li ak yon lòt prestatè, rann prestasyon an, bay yon fichye ki konfòm.",
          ],
        },
        {
          p: "Vandè a òganize remiz la oswa transpò ki prevwa nan òf li a. **Zabelie pa estoke ni livre pwodwi yo, li pa òganize transpò yo epi li pa faktire frè livrezon.** Zabelie ka retire yon piblikasyon ki vyole obligasyon sa yo epi sispann kont yon vandè an ka de vyolasyon grav oswa repete.",
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
          p: "Rejis Zabelie a anrejistre ekriti kontab ki gen rapò ak vant yo. Li pa pèmèt alimante yon balans, peye yon acha ak balans sa a, retire lajan kach ni transfere yon montan ant itilizatè. **Zabelie pa ofri yon sèvis Zabelie Pay otonòm.** Maturasyon an se yon règ fonksyònman komèsyal ; li pa prèv yon otorizasyon ni yon validasyon BRH.",
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
          p: "Zabelie ka retire yon òf oswa sispann aksè nan kont lan si kondisyon sa yo pa respekte, si gen kontni entèdi, sispisyon fwod oswa risk pou sekirite. Yon mezi pwoteksyon ka pran touswit lè pwoteksyon itilizatè yo oswa yon obligasyon legal mande sa ; pa gen yon sèl delè preavi garanti. Yo anrejistre sispansyon an ak rezon li, epi yo ka leve li apre egzamen. Ou ka mande rezon an epi konteste mezi a nan **{email}**, menm si ou pa gen aksè nan kont lan. Sispansyon an pa efase dwa ou sou lajan yo dwe ou ni obligasyon ki soti nan kòmand anvan yo.",
        },
      ],
    },
    {
      titre: "14. Lwa ki aplikab",
      blocs: [
        {
          p: "Se lwa ayisyen ki gouvène kondisyon sa yo, san yo pa retire dispozisyon obligatwa ki aplikab pou sitiyasyon ou, sitou pou yon achtè ki deyò Ayiti. Ou ka kontakte **{email}** pou chèche yon antant ; demach sa a pa obligatwa epi li pa retire dwa ou pou fè yon rekou. Si pa gen antant, se tribinal ki konpetan dapre règ aplikab yo ki ka trete litij la. Kondisyon sa yo pa enpoze yon sèl kote pou tribinal la ni yo pa fè konsomatè a renonse ak dwa obligatwa li yo.",
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
          p: "To create an account and enter into a sale or purchase, you must have the necessary legal capacity under the rules applicable to you. If you act for a business or another person, you must be authorised to bind them. Do not use the service to enter into a contract you lack the capacity or authority to make.",
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
            "Describe the product or service honestly (price, condition, content, compatibility, timelines) and state the handover conditions before the order.",
            "If you carry on a commercial activity, fulfil the formalities applicable to you in Haiti, including registration, the professional identity card (CIP) and authorisations for your activity. You are responsible for your tax declarations and obligations; a Zabelie account does not replace any administrative formality.",
            "Honour the stated handover: hand over the physical product in person or arrange its transport with a third party, perform the service, provide a conforming downloadable file.",
          ],
        },
        {
          p: "The seller arranges the handover or transport stated in their offer. **Zabelie does not store or deliver products, arrange their transport or charge delivery fees.** Zabelie may remove a listing that breaches these obligations and suspend a seller account in the event of a serious or repeated breach.",
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
          p: "The Zabelie ledger records accounting entries related to sales. It does not allow topping up a balance, paying for a purchase with that balance, withdrawing cash or transferring an amount between users. **Zabelie does not offer a standalone Zabelie Pay service.** Maturation is a commercial operating rule; it does not attest to authorisation or approval by the BRH.",
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
          p: "Zabelie may remove an offer or suspend account access for a breach of these terms, prohibited content, suspected fraud or a security risk. A protective measure may take effect immediately when user protection or a legal obligation requires it; no uniform notice period is guaranteed. The suspension and its reason are recorded, and it may be lifted after review. You may request the reason and challenge the measure at **{email}**, including without access to the account. Suspension does not extinguish your rights to sums owed or obligations arising from earlier orders.",
        },
      ],
    },
    {
      titre: "14. Governing law",
      blocs: [
        {
          p: "These terms are governed by Haitian law, subject to mandatory provisions applicable to your situation, including for a buyer outside Haiti. You may contact **{email}** to seek an amicable solution; this step is optional and does not deprive you of a remedy. Without an agreement, disputes fall within the jurisdiction of the courts competent under the applicable rules. These terms impose neither exclusive territorial jurisdiction nor a waiver of mandatory consumer rights.",
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
          p: "Para crear una cuenta y celebrar una venta o compra, debe tener la capacidad jurídica necesaria conforme a las normas que le sean aplicables. Si actúa por una empresa o por otra persona, debe estar autorizado para obligarla. No utilice el servicio para celebrar un contrato para el que carezca de capacidad o autorización.",
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
            "Describir honestamente el producto o la prestación (precio, estado, contenido, compatibilidad, plazos) e indicar las condiciones de entrega antes del pedido.",
            "Si ejerce una actividad comercial, cumplir las formalidades que le sean aplicables en Haití, en particular la inscripción, la tarjeta de identidad profesional (CIP) y las autorizaciones de su actividad. Es responsable de sus declaraciones y obligaciones fiscales; una cuenta Zabelie no sustituye ninguna formalidad administrativa.",
            "Cumplir la entrega anunciada: entregar el producto físico en persona u organizar su transporte mediante un tercero, realizar la prestación, facilitar un archivo descargable conforme.",
          ],
        },
        {
          p: "El vendedor organiza la entrega o el transporte previsto en su oferta. **Zabelie no almacena ni entrega productos, no organiza su transporte ni cobra gastos de entrega.** Zabelie puede retirar una publicación contraria a estas obligaciones y suspender la cuenta del vendedor en caso de incumplimiento grave o reiterado.",
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
          p: "El registro Zabelie recoge los apuntes contables relacionados con las ventas. No permite recargar un saldo, pagar una compra con ese saldo, retirar efectivo ni transferir un importe entre usuarios. **Zabelie no ofrece un servicio Zabelie Pay autónomo.** La maduración es una regla de funcionamiento comercial; no acredita una autorización ni una aprobación de la BRH.",
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
          p: "Zabelie puede retirar una oferta o suspender el acceso a la cuenta por incumplimiento de estas condiciones, contenido prohibido, sospecha de fraude o un riesgo de seguridad. Una medida de protección puede ser inmediata cuando la protección de los usuarios o una obligación legal lo requiera; no se garantiza un plazo de preaviso uniforme. La suspensión y su motivo quedan registrados, y puede levantarse tras su revisión. Puede solicitar el motivo e impugnar la medida en **{email}**, incluso sin acceso a la cuenta. La suspensión no extingue sus derechos sobre los importes debidos ni las obligaciones de pedidos anteriores.",
        },
      ],
    },
    {
      titre: "14. Derecho aplicable",
      blocs: [
        {
          p: "Estas condiciones se rigen por el derecho haitiano, sin perjuicio de las disposiciones imperativas aplicables a su situación, incluso para un comprador situado fuera de Haití. Puede contactar con **{email}** para buscar una solución amistosa; este trámite es opcional y no le priva de un recurso. A falta de acuerdo, los litigios corresponden a los tribunales competentes según las normas aplicables. Estas condiciones no imponen una competencia territorial exclusiva ni una renuncia a los derechos imperativos del consumidor.",
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
