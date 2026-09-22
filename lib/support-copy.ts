import type { Lang } from "./i18n";
const fr = {
 title: "Aide pour cette commande", back: "Mes achats", amount: "Montant de la commande",
 reason: "Quel est le problème ?", debited: "L’argent a été débité, la commande attend", not_received: "Je n’ai pas reçu ma commande",
 wrong: "L’article reçu ne correspond pas", digital: "Le fichier ou l’accès ne fonctionne pas", other: "Autre question",
 message: "Expliquez ce qui s’est passé", hint: "Indiquez la date, le lieu ou la référence opérateur utiles. N’envoyez jamais votre code PIN, mot de passe ou numéro de carte. Ce dossier est visible par l’acheteur, le vendeur et Zabelie.",
 send: "Enregistrer dans le dossier", sending: "Enregistrement…", error: "La demande n’a pas pu être confirmée. Votre texte est conservé ; réessayez avec la même demande.",
 saved: "Votre message est enregistré.", empty: "Aucun dossier ouvert pour cette commande.", history: "Historique du dossier",
 buyer: "Acheteur", seller: "Vendeur", admin: "Équipe Zabelie", open: "À examiner", waiting_buyer: "Réponse de l’acheteur attendue",
 waiting_seller: "Réponse du vendeur attendue", resolved: "Dossier clôturé", status: "État du dossier", older: "Messages précédents", newer: "Messages récents",
 review: "Date cible de suivi", reviewNote: "Cette date sert au suivi de l’équipe ; elle ne garantit pas un remboursement à cette date.",
 noAuto: "L’ouverture ou la clôture d’un dossier ne déclenche pas un remboursement. La non-réception est aussi signalée dans le suivi de remise lorsqu’il est encore ouvert.",
 offline: "Vous êtes hors ligne. Votre texte reste dans cet onglet. Reconnectez-vous pour l’envoyer.",
 refundPending: "Remboursement enregistré dans Zabelie. Le retour effectif des fonds reste à justifier par l’équipe.",
 refundRecorded: "L’équipe a enregistré une référence de retour des fonds. Vérifiez la réception auprès de votre opérateur.",
 helpLink: "Ouvrir ou suivre mon dossier Zabelie", trustTitle: "Avant de payer", trustLocal: "Prix du produit en gourdes. Choisissez un moyen de paiement disponible à l’étape suivante.",
 trustFees: "Les frais de remise à confirmer avec le vendeur ne sont pas inclus dans ce total. Convenez-en avant de payer.",
 trustReturn: "Un problème après l’achat ? Retrouvez la commande dans Mes achats et ouvrez un dossier. Une demande n’est pas une garantie de remboursement.",
};
export type SupportCopy = typeof fr;
const ht: SupportCopy = {
 title:"Èd pou kòmann sa a",back:"Acha mwen",amount:"Montan kòmann nan",reason:"Ki pwoblèm nan?",
 debited:"Lajan soti, kòmann nan poko konfime",not_received:"Mwen pa resevwa kòmann mwen",wrong:"Atik mwen resevwa a pa koresponn",digital:"Fichye a oswa aksè a pa mache",other:"Yon lòt kesyon",
 message:"Esplike sa ki pase a",hint:"Bay dat, kote oswa referans operatè ki itil la. Pa janm voye PIN, modpas oswa nimewo kat ou. Achtè a, vandè a ak Zabelie ka wè dosye sa a.",
 send:"Anrejistre nan dosye a",sending:"N ap anrejistre…",error:"Nou pa ka konfime demann nan. Tèks ou a rete la; eseye menm demann nan ankò.",saved:"Mesaj ou a anrejistre.",
 empty:"Pa gen dosye ouvè pou kòmann sa a.",history:"Istwa dosye a",buyer:"Achtè",seller:"Vandè",admin:"Ekip Zabelie",open:"Pou egzamine",waiting_buyer:"N ap tann repons achtè a",waiting_seller:"N ap tann repons vandè a",resolved:"Dosye fèmen",status:"Estati dosye a",older:"Mesaj anvan yo",newer:"Mesaj ki pi resan",
 review:"Dat sib pou swivi",reviewNote:"Dat sa a ede ekip la fè swivi; li pa garanti ranbousman nan dat sa a.",
 noAuto:"Louvri oswa fèmen yon dosye pa voye ranbousman otomatik. Lè swivi remiz la toujou ouvè, nou deklare tou si ou di ou pa resevwa kòmann nan.",
 offline:"Ou pa sou entènèt. Tèks ou rete nan onglet sa a. Rekonekte pou voye l.",
 refundPending:"Ranbousman an anrejistre nan Zabelie. Ekip la poko mete prèv lajan an retounen.",
 refundRecorded:"Ekip la mete yon referans pou lajan ki retounen an. Verifye ak operatè ou si ou resevwa l.",
 helpLink:"Louvri oswa swiv dosye Zabelie mwen",trustTitle:"Anvan ou peye",trustLocal:"Pri pwodwi a an goud. Chwazi yon mwayen peman ki disponib nan pwochen etap la.",
 trustFees:"Frè remiz pou konfime ak vandè a pa enkli nan total sa a. Mete nou dakò anvan ou peye.",
 trustReturn:"Yon pwoblèm apre acha a? Jwenn kòmann nan nan Acha mwen epi louvri yon dosye. Yon demann pa garanti ranbousman.",
};
const en: SupportCopy = {
 title:"Help with this order",back:"My purchases",amount:"Order amount",reason:"What happened?",debited:"Money was debited, order still pending",not_received:"Order not received",wrong:"Item does not match",digital:"File or access does not work",other:"Another question",
 message:"Describe what happened",hint:"Include a useful date, location or provider reference. Never send your PIN, password or card number. The buyer, seller and Zabelie can see this case.",
 send:"Save to the case",sending:"Saving…",error:"We could not confirm the request. Your text is preserved; retry the same request.",saved:"Your message is saved.",empty:"No case opened for this order.",history:"Case history",buyer:"Buyer",seller:"Seller",admin:"Zabelie team",open:"Awaiting review",waiting_buyer:"Awaiting buyer reply",waiting_seller:"Awaiting seller reply",resolved:"Case closed",status:"Case status",older:"Earlier messages",newer:"Recent messages",review:"Follow-up target",reviewNote:"An internal follow-up target, not a promised refund date.",
 noAuto:"Opening or closing a case does not issue a refund. Non-receipt is also reported to the handover process while it is still open.",offline:"You are offline. Your text stays in this tab. Reconnect to send.",
 refundPending:"Refund recorded in Zabelie. The team still needs to document the actual return of funds.",refundRecorded:"The team recorded a return-of-funds reference. Verify receipt with your payment provider.",
 helpLink:"Open or follow my Zabelie case",trustTitle:"Before you pay",trustLocal:"Product price in gourdes. Choose an available payment method at the next step.",trustFees:"Handover fees to agree with the seller are not included in this total. Confirm them before paying.",trustReturn:"A problem after purchase? Find the order in My purchases and open a case. A request does not guarantee a refund.",
};
const es: SupportCopy = {
 title:"Ayuda con este pedido",back:"Mis compras",amount:"Importe del pedido",reason:"¿Qué ocurrió?",debited:"Dinero descontado, pedido pendiente",not_received:"No recibí el pedido",wrong:"El artículo no corresponde",digital:"El archivo o acceso no funciona",other:"Otra pregunta",
 message:"Explica lo ocurrido",hint:"Incluye fecha, lugar o referencia del operador. Nunca envíes PIN, contraseña ni número de tarjeta. El comprador, vendedor y Zabelie pueden ver el caso.",
 send:"Guardar en el caso",sending:"Guardando…",error:"No pudimos confirmar la solicitud. Conservamos el texto; reintenta la misma solicitud.",saved:"Mensaje guardado.",empty:"No hay un caso abierto para este pedido.",history:"Historial del caso",buyer:"Comprador",seller:"Vendedor",admin:"Equipo Zabelie",open:"Pendiente de revisión",waiting_buyer:"Esperando al comprador",waiting_seller:"Esperando al vendedor",resolved:"Caso cerrado",status:"Estado del caso",older:"Mensajes anteriores",newer:"Mensajes recientes",review:"Fecha objetivo de seguimiento",reviewNote:"Fecha interna de seguimiento, no una fecha garantizada de reembolso.",
 noAuto:"Abrir o cerrar un caso no emite un reembolso. También se notifica la no recepción mientras el seguimiento de entrega siga abierto.",offline:"Sin conexión. El texto permanece en esta pestaña. Reconecta para enviarlo.",
 refundPending:"Reembolso registrado en Zabelie. Falta documentar la devolución efectiva del dinero.",refundRecorded:"El equipo registró una referencia de devolución. Verifica la recepción con tu operador.",
 helpLink:"Abrir o seguir mi caso Zabelie",trustTitle:"Antes de pagar",trustLocal:"Precio del producto en gourdes. Elige un método de pago disponible en el siguiente paso.",trustFees:"Los gastos de entrega a acordar con el vendedor no están incluidos. Confírmalos antes de pagar.",trustReturn:"¿Un problema tras la compra? Busca el pedido en Mis compras y abre un caso. Solicitarlo no garantiza un reembolso.",
};
export function supportCopy(lang: Lang): SupportCopy { return ({ fr, ht, en, es } as Record<string,SupportCopy>)[lang] ?? ht; }
