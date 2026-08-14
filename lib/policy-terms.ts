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
 * remplir là-bas les remplit sur les deux documents.
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
      titre: "7. Commissions",
      blocs: [
        {
          p: "Zabelie prélève une commission sur chaque vente, selon le **barème en vigueur affiché au vendeur** avant la publication et dans son tableau de bord. Le barème peut évoluer ; le taux applicable à une vente est celui en vigueur au moment de la commande.",
        },
      ],
    },
    {
      titre: "8. Litiges et remboursements",
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
      titre: "9. Propriété intellectuelle",
      blocs: [
        {
          p: "Le vendeur conserve ses droits sur les contenus qu'il publie et garantit qu'il détient les droits nécessaires à leur vente. L'achat d'un produit digital confère à l'acheteur un droit d'usage personnel, non exclusif et non transférable, sauf licence plus large indiquée sur la fiche produit. La marque et l'interface Zabelie restent la propriété de la plateforme.",
        },
      ],
    },
    {
      titre: "10. Données personnelles",
      blocs: [
        {
          p: "Le traitement de vos données est décrit dans la *politique de confidentialité*, qui fait partie des présentes conditions.",
        },
      ],
    },
    {
      titre: "11. Résiliation",
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
      titre: "12. Droit applicable",
      blocs: [
        {
          p: "[À COMPLÉTER : droit applicable et juridiction compétente]",
        },
      ],
    },
    {
      titre: "13. Contact",
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
      titre: "7. Komisyon",
      blocs: [
        {
          p: "Zabelie pran yon komisyon sou chak vant, dapre **barèm ki an vigè epi ki afiche bay vandè a** anvan piblikasyon an ak nan tablo li. Barèm lan ka chanje ; to ki aplike sou yon vant se sa ki te an vigè lè kòmand lan te pase.",
        },
      ],
    },
    {
      titre: "8. Litij ak ranbousman",
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
      titre: "9. Pwopriyete entelektyèl",
      blocs: [
        {
          p: "Vandè a kenbe dwa li sou kontni li pibliye yo epi li garanti li gen dwa ki nesesè pou vann yo. Acha yon pwodwi dijital bay achtè a yon dwa itilizasyon pèsonèl, ki pa eksklizif epi ki pa transferab, sof si fich pwodwi a endike yon lisans pi laj. Mak ak entèfas Zabelie a rete pwopriyete platfòm lan.",
        },
      ],
    },
    {
      titre: "10. Done pèsonèl",
      blocs: [
        {
          p: "Tretman done ou yo dekri nan *politik konfidansyalite* a, ki fè pati kondisyon sa yo.",
        },
      ],
    },
    {
      titre: "11. Fèmti kont",
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
      titre: "12. Lwa ki aplikab",
      blocs: [
        {
          p: "[POU KONPLETE : lwa ki aplikab ak tribinal ki konpetan]",
        },
      ],
    },
    {
      titre: "13. Kontak",
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
      titre: "7. Commissions",
      blocs: [
        {
          p: "Zabelie charges a commission on each sale, according to the **schedule in force shown to the seller** before publication and in their dashboard. The schedule may change; the rate applicable to a sale is the one in force when the order was placed.",
        },
      ],
    },
    {
      titre: "8. Disputes and refunds",
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
      titre: "9. Intellectual property",
      blocs: [
        {
          p: "The seller retains rights over the content they publish and warrants that they hold the rights required to sell it. Purchasing a digital product grants the buyer a personal, non-exclusive, non-transferable right of use, unless a broader licence is stated on the product page. The Zabelie brand and interface remain the property of the platform.",
        },
      ],
    },
    {
      titre: "10. Personal data",
      blocs: [
        {
          p: "The processing of your data is described in the *privacy policy*, which forms part of these terms.",
        },
      ],
    },
    {
      titre: "11. Termination",
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
      titre: "12. Governing law",
      blocs: [
        {
          p: "[TO BE COMPLETED: governing law and competent jurisdiction]",
        },
      ],
    },
    {
      titre: "13. Contact",
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
      titre: "7. Comisiones",
      blocs: [
        {
          p: "Zabelie cobra una comisión por cada venta, según el **baremo vigente mostrado al vendedor** antes de la publicación y en su panel. El baremo puede cambiar; el tipo aplicable a una venta es el vigente en el momento del pedido.",
        },
      ],
    },
    {
      titre: "8. Controversias y reembolsos",
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
      titre: "9. Propiedad intelectual",
      blocs: [
        {
          p: "El vendedor conserva sus derechos sobre los contenidos que publica y garantiza que posee los derechos necesarios para su venta. La compra de un producto digital confiere al comprador un derecho de uso personal, no exclusivo e intransferible, salvo licencia más amplia indicada en la ficha del producto. La marca y la interfaz de Zabelie siguen siendo propiedad de la plataforma.",
        },
      ],
    },
    {
      titre: "10. Datos personales",
      blocs: [
        {
          p: "El tratamiento de sus datos se describe en la *política de privacidad*, que forma parte de estas condiciones.",
        },
      ],
    },
    {
      titre: "11. Terminación",
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
      titre: "12. Derecho aplicable",
      blocs: [
        {
          p: "[POR COMPLETAR: derecho aplicable y jurisdicción competente]",
        },
      ],
    },
    {
      titre: "13. Contacto",
      blocs: [{ p: "Para cualquier consulta sobre estas condiciones: **{email}**." }],
    },
  ],
};

export const CONDITIONS: Record<Lang, Politique> = { fr, ht, en, es };
