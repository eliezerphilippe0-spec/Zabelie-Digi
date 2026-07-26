/**
 * i18n Zabelie — FR (défaut) + Kreyòl ayisyen (ht).
 * Dictionnaire maison, zéro dépendance (pages légères pour la 3G).
 * ⚠️ Kreyòl à faire relire par un locuteur natif avant le lancement public.
 * Parité des clés garantie par tests/i18n.test.ts.
 *
 * RÈGLE (choix délibéré, audit 2026-07) : DICT et t() ne s'utilisent que
 * côté SERVEUR (pages/layouts via getLang()). Les composants client
 * reçoivent leurs libellés en props (`labels={{ ... }}`), jamais le
 * dictionnaire : appeler t() dans un composant "use client" embarquerait
 * l'intégralité des deux langues dans le bundle de la page — contraire à
 * l'objectif pages ultra-légères 3G. La verbosité des props est le prix
 * assumé ; les types (`ConnexionLabels`, etc.) garantissent à la compilation
 * qu'aucun libellé ne manque. Seuls les types et LANG_COOKIE peuvent
 * s'importer côté client (lang-toggle) — zéro poids au bundle.
 */

export type Lang = "fr" | "ht";
export const LANG_COOKIE = "zabelie_lang";
export const LANGS: Lang[] = ["fr", "ht"];

const fr = {
  // Nav / footer
  "nav.catalog": "Catalogue",
  "nav.talents": "Talents",
  "nav.how": "Comment ça marche",
  "nav.topup": "Recharge",
  "nav.login": "Connexion",
  "nav.sell": "Vendre",
  "nav.dashboard": "Tableau de bord",
  "nav.pro": "Facturation",
  "nav.logout": "Déconnexion",
  "footer.tagline":
    "La marketplace haïtienne. Paiement mobile money, pensé pour le contexte local.",
  "footer.explore": "Explorer",
  "footer.sell": "Vendre",
  "footer.become": "Devenir créateur",
  "footer.payment": "Paiement",
  "footer.natcash": "NatCash — bientôt",
  "footer.rights": "Tous droits réservés.",

  // Accueil
  "home.badge": "La marketplace haïtienne",
  "home.h1": "Pièces auto et moto, livrées en Haïti",
  "badge.pay": "Paiement sécurisé avec MonCash",
  "home.h1.a": "Vendez vos",
  "home.h1.b": "produits digitaux",
  "home.h1.c": "et vos",
  "home.h1.d": "talents",
  "home.sub":
    "Filtres, freins, huiles, batteries. Vous payez avec MonCash, le vendeur vous livre.",
  "home.cta.sell": "Commencer à vendre",
  "home.cta.browse": "Explorer le catalogue",
  "home.stat1": "digital & talents",
  "home.stat2": "paiement mobile",
  "home.stat3": "livraison après paiement",
  "home.stat3.v": "Instant",
  "home.trends": "Tendances du moment",
  "home.trends.sub": "Les produits et talents les plus demandés.",
  "home.all": "Tout voir →",
  "home.how": "Comment ça marche",
  "home.s1.t": "Publiez",
  "home.s1.b":
    "Mettez en ligne un produit digital ou une prestation en quelques minutes.",
  "home.s2.t": "Encaissez",
  "home.s2.b":
    "L'acheteur paie via MonCash. Le paiement est confirmé serveur-à-serveur.",
  "home.s3.t": "Livrez & retirez",
  "home.s3.b":
    "Livraison automatique du fichier, crédit de votre wallet, retrait de vos gains.",
  "home.final.a": "Votre talent mérite d'être",
  "home.final.b": "payé",
  "home.final.sub":
    "Rejoignez les créateurs qui monétisent leur savoir-faire sur Zabelie.",
  "home.final.cta": "Créer ma boutique",

  // Catalogue
  "catalog.title": "Catalogue",
  "catalog.results": "résultat(s)",
  "catalog.for": "pour",
  "catalog.search.ph": "Rechercher un produit, un talent…",
  "catalog.search.btn": "Rechercher",
  "catalog.none": "Aucun résultat.",
  "catalog.reset": "Réinitialiser",
  "catalog.more": "Voir plus",

  // Produit
  "product.back": "← Retour au catalogue",
  "product.kind.file": "Fichier digital",
  "product.kind.service": "Service",
  "product.kind.physical": "Produit physique",
  "product.by": "par",
  "product.sales": "ventes",
  "product.reviews.badge": "avis vérifié(s)",
  "product.pay": "Payer {price} avec MonCash",
  "product.pay.loading": "Redirection vers MonCash…",
  "product.pay.stripe": "Payer {usd} par carte",
  "product.pay.zelle": "Payer {usd} avec Zelle",
  "pay.redirect": "Redirection…",
  // BL-111/113/120 (revue) — erreurs réseau/opérateur, relance, copier.
  "error.network": "Connexion impossible. Réessayez.",
  "error.generic": "Une erreur est survenue. Réessayez.",
  "error.provider": "Paiement momentanément indisponible. Réessayez dans un instant.",
  "pay.retry": "Réessayer le paiement",
  "pay.checkBalance": "Vérifiez votre solde MonCash puis réessayez.",
  "common.copy": "Copier",
  "common.copied": "Copié ✓",
  "pay.other": "Diaspora ? Payez en USD :",
  "product.delivery": "Livraison instantanée après confirmation du paiement.",
  // Produit PHYSIQUE : Zabelie ne livre pas (ni flotte, ni entrepôt, ni
  // contrat transporteur). Ce qui s'affiche est ce que le vendeur DÉCLARE,
  // attribué à lui — jamais une promesse de la plateforme. Aucune mention de
  // protection de paiement ni de garantie tant que l'escrow est dormant.
  "product.delivery.declared":
    "Livraison : {zone}, sous {days} jours — indiqué par le vendeur",
  "product.delivery.toAgree": "Livraison à convenir avec le vendeur",
  "product.secure": "✓ Paiement sécurisé, confirmé serveur-à-serveur",
  "product.file": "✓ Téléchargement immédiat du fichier",
  "product.service": "✓ Mise en relation après paiement",
  "product.verifiedOnly": "✓ Avis réservés aux acheteurs vérifiés",
  "product.delivery.days": "Livraison en {days} jour(s)",
  "product.includes": "Ce qui est inclus",
  "product.reviews": "Avis vérifiés",
  "product.reviews.note": "Seuls les acheteurs ayant payé peuvent laisser un avis.",
  "product.verified": "Achat vérifié ✓",
  "product.share": "sur Zabelie :",
  "product.cta.bottom": "Acheter maintenant — {price} ↑",
  "coupon.have": "J'ai un code promo",
  "coupon.ph": "Ex. PROMO50",
  "coupon.apply": "Appliquer",
  "coupon.applied": "✓ −{percent} % — vous payez {price}",
  "coupon.invalid": "Code invalide ou expiré.",

  // Paiement
  "pay.ok.title": "Paiement confirmé",
  "pay.ok.body":
    "Merci ! Votre achat est validé. Votre fichier est disponible dans vos téléchargements.",
  "pay.ok.cta": "Voir mes achats",
  "pay.back": "Retour au catalogue",
  "pay.wait.title": "Paiement en cours de vérification",
  "pay.wait.body":
    "Nous confirmons votre paiement auprès de MonCash. Si le montant a été débité, votre achat sera validé automatiquement d'ici quelques instants — même si cette page a été interrompue.",
  "pay.wait.cta": "Vérifier mes achats",
  "pay.fail.title": "Paiement non confirmé",
  "pay.fail.body":
    "Le paiement n'a pas pu être validé. Aucun produit n'a été livré. Vous pouvez réessayer en toute sécurité.",
  "pay.fail.code": "Code :",
  "pay.order": "Commande",
  "order.ref": "N° de commande",

  // Zelle (diaspora — flux semi-manuel)
  "zelle.title": "Paiement Zelle",
  "zelle.sub":
    "Envoyez le montant exact depuis votre application bancaire (Zelle), avec le mémo ci-dessous. Votre achat sera validé après vérification du virement — généralement sous 24 h.",
  "zelle.amount": "Montant exact à envoyer",
  "zelle.to": "Destinataire Zelle",
  "zelle.name": "Nom du compte",
  "zelle.memo": "Mémo à indiquer (important)",
  "zelle.memo.why":
    "Ce code nous permet de retrouver votre virement et de valider votre achat rapidement.",
  "zelle.ref.label": "Vous avez envoyé le paiement ?",
  "zelle.ref.ph": "Référence de confirmation Zelle (optionnel)",
  "zelle.sent": "J'ai envoyé le paiement",
  "zelle.done":
    "Merci ! Nous vérifions votre virement. Votre fichier apparaîtra dans « Mes achats » dès la confirmation.",

  // Partage
  "share.wa": "Partager sur WhatsApp",
  "share.copy": "Copier le lien",
  "share.copied": "Lien copié ✓",

  // Recharge téléphonique (V-11)
  "topup.title": "Recharge téléphone",
  "topup.sub":
    "Rechargez n'importe quel téléphone Digicel ou Natcom en quelques secondes. Payez avec MonCash — ou par Zelle depuis la diaspora.",
  "topup.operator": "Opérateur",
  "topup.phone.label": "Numéro à recharger",
  "topup.phone.ph": "Ex. 37 12 34 56",
  "topup.phone2.label": "Confirmez le numéro (nouvelle saisie)",
  "topup.phone2.why":
    "Un numéro erroné = recharge perdue. Vérifiez chaque chiffre.",
  "topup.mismatch": "Les deux numéros ne correspondent pas.",
  "topup.invalid": "Numéro haïtien invalide (8 chiffres, mobile 3X/4X).",
  "topup.detected": "Opérateur détecté",
  "topup.amount.label": "Montant de la recharge",
  "topup.receives": "Le numéro reçoit {face} HTG",
  "topup.status.payment_pending": "En attente du paiement…",
  "topup.status.paid": "Paiement reçu — envoi de la recharge…",
  "topup.status.fulfillment_pending": "Envoi de la recharge en cours…",
  "topup.status.delivered": "Recharge livrée ✓",
  "topup.status.failed": "La recharge a échoué.",
  "topup.status.refund_pending":
    "La recharge a échoué après paiement : remboursement en préparation vers votre moyen de paiement d'origine.",
  "topup.status.refunded":
    "Remboursé via votre moyen de paiement d'origine.",
  "topup.disabled":
    "Le service de recharge arrive bientôt. Revenez très vite !",
  "topup.legal":
    "Zabelie est revendeur de recharge télécom : paiement puis livraison immédiate — aucun solde n'est stocké sur votre compte.",

  // Accueil V2 (12 sections — maquette porteur)
  "sec.featured": "Produit de la semaine",
  "featured.cta": "Voir le produit →",
  "home.pay": "Payez facilement avec",
  "sec.cats": "Catégories principales",
  "sec.new": "Nouveautés",
  "sec.new.sub": "Les derniers produits publiés par nos créateurs.",
  "sec.services": "Services populaires",
  "sec.services.sub": "Mentorat, design, consultation — réservez un talent.",
  "sec.sellers": "Meilleurs vendeurs",
  "sec.sellers.sub": "Les créateurs les plus appréciés de la communauté.",
  "sec.sellers.sales": "ventes",
  "sec.free": "Produits gratuits",
  "sec.free.sub": "Découvrez gratuitement, revenez pour la suite.",
  "sec.free.badge": "GRATUIT",
  "sec.promo": "En promotion",
  "sec.promo.sub": "Ces vendeurs ont un code promo actif — demandez-le sur leur WhatsApp.",
  "sec.reviews": "Avis clients",
  "sec.reviews.sub": "Ce que disent les acheteurs — avis vérifiés uniquement.",
  "sec.why": "Pourquoi choisir Zabelie",
  "why.1.t": "Argent protégé",
  "why.1.b": "Chaque paiement reste en escrow jusqu'à la livraison. Montant vérifié en base, jamais sur parole.",
  "why.2.t": "Avis 100 % vérifiés",
  "why.2.b": "Seuls les acheteurs ayant réellement payé peuvent noter — garanti par la base de données.",
  "why.3.t": "Paiement lakay",
  "why.3.b": "MonCash en gourdes, Zelle en dollars pour la diaspora. Pensé pour Haïti d'abord.",
  "why.4.t": "Kreyòl + léger",
  "why.4.b": "Interface en kreyòl et en français, pages ultra-légères pour la 3G et les petits téléphones.",
  "sec.faq": "Questions fréquentes",
  "faq.q1": "Comment acheter un produit ?",
  "faq.a1": "Choisissez un produit, cliquez « Payer avec MonCash » et confirmez sur votre téléphone. La diaspora peut payer en USD via Zelle.",
  "faq.q2": "Quand est-ce que je reçois mon achat ?",
  "faq.a2": "Immédiatement après la confirmation du paiement : téléchargement dans « Mes achats » + e-mail avec le lien.",
  "faq.q3": "Comment vendre sur Zabelie ?",
  "faq.a3": "Créez un compte, publiez votre produit en quelques minutes. C'est gratuit — la plateforme prélève 10 % par vente (6 % pour les vendeurs Elite).",
  "faq.q4": "Quand le vendeur reçoit-il son argent ?",
  "faq.a4": "Le net est crédité immédiatement « en attente », puis devient disponible 7 jours après la vente (protection anti-fraude).",
  "faq.q5": "Et si quelque chose se passe mal ?",
  "faq.a5": "Chaque commande est traçable et remboursable vers votre moyen de paiement d'origine. Les litiges sont examinés un par un.",
  "testi.1.n": "Woodley P.",
  "testi.1.b": "Très bon contenu, explications limpides. Terminé en 3 semaines — et j'ai décroché un travail freelance grâce à ce que j'ai appris.",
  "testi.2.n": "Fabiola M.",
  "testi.2.b": "Belle qualité. J'aurais aimé plus d'exercices pratiques, mais le vendeur répond vite quand on a des questions.",
  "testi.3.n": "Ricardo S.",
  "testi.3.b": "Payé avec MonCash sans problème, accès immédiat comme promis. Je recommande à 100 %.",
  "footer.help": "Aide",

  // Fondateur
  "founder.title": "Le mot du fondateur",
  "founder.quote":
    "Les opportunités ne se trouvent pas, elles se créent. Oser Agir.",
  "founder.name": "Éliezer Philippe",
  "founder.role": "Fondateur, Zabelie",

  // BL-130 (revue P2) — parité i18n : connexion, vendre, publish-form,
  // upload-asset, créateur, product-card.
  "auth.tab.signin": "Connexion",
  "auth.tab.signup": "Inscription",
  "auth.name.ph": "Nom d'affichage",
  "auth.email.ph": "E-mail",
  "auth.password.ph": "Mot de passe",
  "auth.signin.cta": "Se connecter",
  "auth.signup.cta": "Créer mon compte",
  "auth.signup.success":
    "Compte créé. Vérifiez votre e-mail pour confirmer, puis connectez-vous.",
  "auth.demo.mode":
    "Mode démo : connectez le projet Supabase pour activer les comptes.",
  "auth.link.expired":
    "Ce lien de confirmation a expiré ou a déjà été utilisé. Connectez-vous, ou créez à nouveau votre compte pour recevoir un nouveau lien.",
  "auth.back.home": "← Retour à l'accueil",

  "sell.title": "Vendre sur Zabelie",
  "sell.demo.subtitle": "Mode démo — connecte Supabase pour publier de vrais produits.",
  "sell.demo.body.pre": "La publication nécessite une base Supabase configurée (voir",
  "sell.demo.body.post": ").",
  "sell.login.subtitle": "Connecte-toi pour publier un produit.",
  "sell.subtitle": "Publie un produit digital ou une prestation.",
  "sell.mine.title": "Mes produits",

  "publish.title.ph": "Titre du produit",
  "publish.kind.aria": "Type de produit",
  "publish.category.aria": "Catégorie",
  "publish.category.empty": "— Catégorie —",
  "publish.price.ph": "Prix (HTG)",
  "publish.description.ph": "Description",
  "publish.service.hint":
    "Page service (façon Fiverr) — optionnel, mais rassure l'acheteur.",
  "publish.deliveryDays.ph": "Délai de livraison (en jours)",
  "publish.includes.ph":
    "Ce qui est inclus — un élément par ligne\nEx. 3 révisions\nFichier source livré",
  "publish.submit": "Publier le produit",
  "publish.submitting": "Publication…",
  "publish.error.generic": "Publication échouée.",
  "publish.footer.hint":
    "L'envoi du fichier livrable se fera depuis la fiche produit (étape suivante).",

  "upload.sending": "Envoi…",
  "upload.replace": "Remplacer le fichier",
  "upload.add": "Ajouter le fichier",
  "upload.saved": "Fichier enregistré.",
  "upload.error": "Envoi échoué.",

  "creator.products.label": "produit(s) en ligne",
  "creator.share.text": "Découvre la boutique de {name} sur Zabelie :",
  "creator.empty": "Aucun produit publié pour l'instant.",

  "card.kind.file": "Fichier",
  "card.kind.service": "Service",
  "card.kind.physical": "Physique",

  "status.draft": "Brouillon",
  "status.published": "Publié",

  // BL-131 (revue P2) — mot de passe oublié.
  "auth.forgot": "Mot de passe oublié ?",
  "forgot.title": "Mot de passe oublié",
  "forgot.subtitle":
    "Entrez votre e-mail, nous vous enverrons un lien pour créer un nouveau mot de passe.",
  "forgot.submit": "Envoyer le lien",
  "forgot.sending": "Envoi…",
  "forgot.success":
    "Si un compte existe avec cet e-mail, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos spams).",
  "forgot.back": "← Retour à la connexion",
  "reset.title": "Nouveau mot de passe",
  "reset.subtitle": "Choisissez un nouveau mot de passe pour votre compte.",
  "reset.confirm.ph": "Confirmer le mot de passe",
  "reset.mismatch": "Les mots de passe ne correspondent pas.",
  "reset.submit": "Mettre à jour le mot de passe",
  "reset.submitting": "Mise à jour…",
  "reset.success": "Mot de passe mis à jour. Vous pouvez maintenant vous connecter.",
  "reset.invalid": "Ce lien n'est plus valide. Demandez un nouveau lien.",
} as const;

export type I18nKey = keyof typeof fr;

const ht: Record<I18nKey, string> = {
  "nav.catalog": "Katalòg",
  "nav.talents": "Talan",
  "nav.how": "Kijan sa mache",
  "nav.topup": "Rechaj",
  "nav.login": "Konekte",
  "nav.sell": "Vann",
  "nav.dashboard": "Tablo bò",
  "nav.pro": "Fè m peye",
  "nav.logout": "Dekonekte",
  "footer.tagline":
    "Makètplas ayisyen an. Peman mobile money, panse pou reyalite lokal la.",
  "footer.explore": "Eksplore",
  "footer.sell": "Vann",
  "footer.become": "Vin kreyatè",
  "footer.payment": "Peman",
  "footer.natcash": "NatCash — talè konsa",
  "footer.rights": "Tout dwa rezève.",

  "home.badge": "Makètplas ayisyen an",
  "home.h1": "Pyès oto ak moto, livre an Ayiti",
  "badge.pay": "Peman sekirize ak MonCash",
  "home.h1.a": "Vann",
  "home.h1.b": "pwodwi dijital ou yo",
  "home.h1.c": "ak",
  "home.h1.d": "talan ou",
  "home.sub":
    "Modèl, fòmasyon, beat, akonpayman… Pibliye, resevwa lajan ak mobile money, epi livre nan menm moman. Fèt pou reyalite lakay.",
  "home.cta.sell": "Kòmanse vann",
  "home.cta.browse": "Gade katalòg la",
  "home.stat1": "dijital & talan",
  "home.stat2": "peman mobil",
  "home.stat3": "livrezon apre peman",
  "home.stat3.v": "Rapid",
  "home.trends": "Sa k ap mache kounye a",
  "home.trends.sub": "Pwodwi ak talan moun plis ap chèche yo.",
  "home.all": "Wè tout →",
  "home.how": "Kijan sa mache",
  "home.s1.t": "Pibliye",
  "home.s1.b": "Mete yon pwodwi dijital oswa yon sèvis an liy nan kèk minit.",
  "home.s2.t": "Resevwa lajan",
  "home.s2.b": "Achtè a peye ak MonCash. Peman an konfime sèvè-a-sèvè.",
  "home.s3.t": "Livre & retire",
  "home.s3.b":
    "Fichye a livre otomatikman, kòb la antre nan wallet ou, epi ou retire lajan ou.",
  "home.final.a": "Talan ou merite",
  "home.final.b": "peye",
  "home.final.sub":
    "Vin jwenn kreyatè k ap fè lajan ak konesans yo sou Zabelie.",
  "home.final.cta": "Kreye boutik mwen",

  "catalog.title": "Katalòg",
  "catalog.results": "rezilta",
  "catalog.for": "pou",
  "catalog.search.ph": "Chèche yon pwodwi, yon talan…",
  "catalog.search.btn": "Chèche",
  "catalog.none": "Pa gen rezilta.",
  "catalog.reset": "Rekòmanse",
  "catalog.more": "Wè plis",

  "product.back": "← Tounen nan katalòg la",
  "product.kind.file": "Fichye dijital",
  "product.kind.service": "Sèvis",
  "product.kind.physical": "Pwodwi fizik",
  "product.by": "pa",
  "product.sales": "vant",
  "product.reviews.badge": "avi verifye",
  "product.pay": "Peye {price} ak MonCash",
  "product.pay.loading": "N ap voye ou sou MonCash…",
  "product.pay.stripe": "Peye {usd} ak kat",
  "product.pay.zelle": "Peye {usd} ak Zelle",
  "pay.redirect": "N ap voye ou…",
  // ⚠️ Kreyòl à faire relire par un locuteur natif (règle du fichier).
  "error.network": "Koneksyon an pa pase. Eseye ankò.",
  "error.generic": "Gen yon erè ki fèt. Eseye ankò.",
  "error.provider": "Peman an pa disponib pou kounye a. Eseye ankò talè.",
  "pay.retry": "Eseye peman an ankò",
  "pay.checkBalance": "Tcheke balans MonCash ou, epi eseye ankò.",
  "common.copy": "Kopye",
  "common.copied": "Kopye ✓",
  "pay.other": "Dyaspora ? Peye an USD :",
  "product.delivery": "Livrezon nan menm moman apre peman an konfime.",
  "product.delivery.declared":
    "Livrezon : {zone}, nan {days} jou — se vandè a ki bay enfòmasyon sa a.",
  "product.delivery.toAgree": "Livrezon : n ap antann ou ak vandè a.",
  "product.secure": "✓ Peman sekirize, konfime sèvè-a-sèvè",
  "product.file": "✓ Telechaje fichye a nan menm moman",
  "product.service": "✓ Kontak ak kreyatè a apre peman",
  "product.verifiedOnly": "✓ Avi yo rezève pou achtè verifye sèlman",
  "product.delivery.days": "Livrezon nan {days} jou",
  "product.includes": "Sa ki enkli",
  "product.reviews": "Avi verifye",
  "product.reviews.note": "Se sèlman achtè ki peye ki ka bay avi.",
  "product.verified": "Acha verifye ✓",
  "product.share": "sou Zabelie :",
  "product.cta.bottom": "Achte kounye a — {price} ↑",
  "coupon.have": "Mwen gen yon kòd pwomo",
  "coupon.ph": "Egz. PROMO50",
  "coupon.apply": "Aplike",
  "coupon.applied": "✓ −{percent} % — w ap peye {price}",
  "coupon.invalid": "Kòd la pa bon oswa li ekspire.",

  "pay.ok.title": "Peman konfime",
  "pay.ok.body":
    "Mèsi! Acha ou valide. Fichye ou disponib nan telechajman ou yo.",
  "pay.ok.cta": "Wè acha mwen yo",
  "pay.back": "Tounen nan katalòg la",
  "pay.wait.title": "N ap verifye peman an",
  "pay.wait.body":
    "N ap konfime peman ou an ak MonCash. Si kòb la te soti, acha ou ap valide otomatikman nan kèk moman — menm si paj sa a te koupe.",
  "pay.wait.cta": "Tcheke acha mwen yo",
  "pay.fail.title": "Peman an pa konfime",
  "pay.fail.body":
    "Peman an pa t ka valide. Nou pa livre okenn pwodwi. Ou ka eseye ankò san pwoblèm.",
  "pay.fail.code": "Kòd :",
  "pay.order": "Kòmand",
  "order.ref": "Nimewo kòmand",

  "zelle.title": "Peman Zelle",
  "zelle.sub":
    "Voye montan egzak la ak aplikasyon bank ou (Zelle), avèk memo ki anba a. Acha ou ap valide apre nou verifye viman an — anjeneral nan mwens pase 24 èdtan.",
  "zelle.amount": "Montan egzak pou voye",
  "zelle.to": "Destinatè Zelle",
  "zelle.name": "Non kont lan",
  "zelle.memo": "Memo pou mete (enpòtan)",
  "zelle.memo.why":
    "Kòd sa a pèmèt nou jwenn viman ou an epi valide acha ou pi vit.",
  "zelle.ref.label": "Ou voye peman an deja ?",
  "zelle.ref.ph": "Referans konfimasyon Zelle (si ou genyen l)",
  "zelle.sent": "Mwen voye peman an",
  "zelle.done":
    "Mèsi ! N ap verifye viman ou an. Fichye ou ap parèt nan « Acha mwen yo » kou peman an konfime.",

  "share.wa": "Pataje sou WhatsApp",
  "share.copy": "Kopye lyen an",
  "share.copied": "Lyen kopye ✓",

  "topup.title": "Rechaj telefòn",
  "topup.sub":
    "Rechaje nenpòt telefòn Digicel oswa Natcom an kèk segonn. Peye ak MonCash — oswa ak Zelle depi dyaspora a.",
  "topup.operator": "Operatè",
  "topup.phone.label": "Nimewo pou rechaje a",
  "topup.phone.ph": "Egz. 37 12 34 56",
  "topup.phone2.label": "Konfime nimewo a (retape l)",
  "topup.phone2.why":
    "Yon move nimewo = rechaj la pèdi. Verifye chak chif byen.",
  "topup.mismatch": "De nimewo yo pa menm.",
  "topup.invalid": "Nimewo ayisyen an pa bon (8 chif, mobil 3X/4X).",
  "topup.detected": "Operatè nou detekte",
  "topup.amount.label": "Montan rechaj la",
  "topup.receives": "Nimewo a ap resevwa {face} HTG",
  "topup.status.payment_pending": "N ap tann peman an…",
  "topup.status.paid": "Peman an antre — n ap voye rechaj la…",
  "topup.status.fulfillment_pending": "Rechaj la ap pati…",
  "topup.status.delivered": "Rechaj la rive ✓",
  "topup.status.failed": "Rechaj la pa t pase.",
  "topup.status.refund_pending":
    "Rechaj la pa t pase apre peman an : n ap prepare ranbousman an sou menm mwayen peman ou te itilize a.",
  "topup.status.refunded":
    "Ranbouse sou menm mwayen peman ou te itilize a.",
  "topup.disabled": "Sèvis rechaj la ap vini talè konsa. Tounen vit !",
  "topup.legal":
    "Zabelie se revandè rechaj telekòm : ou peye, rechaj la pati nan menm moman — nou pa janm kenbe okenn balans sou kont ou.",

  "sec.featured": "Pwodui semèn nan",
  "featured.cta": "Wè pwodui a →",
  "home.pay": "Peye fasil ak",
  "sec.cats": "Kategori prensipal yo",
  "sec.new": "Sa ki fèk parèt",
  "sec.new.sub": "Dènye pwodui kreyatè nou yo pibliye.",
  "sec.services": "Sèvis popilè yo",
  "sec.services.sub": "Akonpayman, design, konsiltasyon — rezève yon talan.",
  "sec.sellers": "Pi bon vandè yo",
  "sec.sellers.sub": "Kreyatè kominote a plis renmen yo.",
  "sec.sellers.sales": "vant",
  "sec.free": "Pwodui gratis",
  "sec.free.sub": "Dekouvri gratis, tounen pou rès la.",
  "sec.free.badge": "GRATIS",
  "sec.promo": "An pwomosyon",
  "sec.promo.sub": "Vandè sa yo gen yon kòd pwomo aktif — mande yo li sou WhatsApp.",
  "sec.reviews": "Avi kliyan yo",
  "sec.reviews.sub": "Sa achtè yo di — avi verifye sèlman.",
  "sec.why": "Poukisa chwazi Zabelie",
  "why.1.t": "Lajan ou pwoteje",
  "why.1.b": "Chak peman rete an escrow jiska livrezon. Montan an verifye nan baz done a, pa sou pawòl.",
  "why.2.t": "Avi 100 % verifye",
  "why.2.b": "Se sèlman achtè ki peye toutbon ki ka bay nòt — baz done a garanti sa.",
  "why.3.t": "Peman lakay",
  "why.3.b": "MonCash an goud, Zelle an dola pou dyaspora a. Fèt pou Ayiti anvan tout bagay.",
  "why.4.t": "Kreyòl + leje",
  "why.4.b": "Entèfas an kreyòl ak franse, paj yo leje anpil pou 3G ak ti telefòn yo.",
  "sec.faq": "Kesyon moun poze souvan",
  "faq.q1": "Kijan pou m achte yon pwodui ?",
  "faq.a1": "Chwazi yon pwodui, klike « Peye ak MonCash » epi konfime sou telefòn ou. Dyaspora a ka peye an USD ak Zelle.",
  "faq.q2": "Kilè m ap resevwa acha m ?",
  "faq.a2": "Touswit apre peman an konfime : telechajman nan « Acha mwen yo » + yon imèl ak lyen an.",
  "faq.q3": "Kijan pou m vann sou Zabelie ?",
  "faq.a3": "Kreye yon kont, pibliye pwodui ou an kèk minit. Li gratis — platfòm nan pran 10 % sou chak vant (6 % pou vandè Elite).",
  "faq.q4": "Kilè vandè a resevwa lajan li ?",
  "faq.a4": "Nèt la antre touswit « an atant », epi li vin disponib 7 jou apre vant lan (pwoteksyon kont fwod).",
  "faq.q5": "E si yon bagay pase mal ?",
  "faq.a5": "Chak kòmand ka trase e ranbouse sou menm mwayen peman ou te itilize a. Nou egzamine chak litij grenn pa grenn.",
  "testi.1.n": "Woodley P.",
  "testi.1.b": "Trè bon kontni, eksplikasyon yo klè anpil. Mwen fini l an 3 semèn — e m jwenn yon travay freelance gras a sa m aprann.",
  "testi.2.n": "Fabiola M.",
  "testi.2.b": "Bèl kalite. Mwen ta renmen plis egzèsis pratik, men vandè a reponn vit lè ou gen kesyon.",
  "testi.3.n": "Ricardo S.",
  "testi.3.b": "Mwen achte ak MonCash san pwoblèm, aksè imedya jan yo te di a. Mwen rekòmande 100 %.",
  "footer.help": "Èd",

  "founder.title": "Pawòl fondatè a",
  "founder.quote":
    "Opòtinite yo pa jwenn, se kreye yo kreye. Oze Aji.",
  "founder.name": "Éliezer Philippe",
  "founder.role": "Fondatè, Zabelie",

  // ⚠️ Kreyòl à faire relire par un locuteur natif (règle du fichier).
  "auth.tab.signin": "Konekte",
  "auth.tab.signup": "Enskripsyon",
  "auth.name.ph": "Non ki pral parèt",
  "auth.email.ph": "Imèl",
  "auth.password.ph": "Modpas",
  "auth.signin.cta": "Konekte",
  "auth.signup.cta": "Kreye kont mwen",
  "auth.signup.success":
    "Kont kreye. Tcheke imèl ou pou konfime, epi konekte.",
  "auth.demo.mode":
    "Mòd demo : konekte pwojè Supabase pou aktive kont yo.",
  "auth.link.expired":
    "Lyen konfimasyon sa a ekspire oswa li deja itilize. Konekte, oswa kreye kont ou ankò pou resevwa yon nouvo lyen.",
  "auth.back.home": "← Tounen sou paj akèy la",

  "sell.title": "Vann sou Zabelie",
  "sell.demo.subtitle": "Mòd demo — konekte Supabase pou pibliye vrè pwodui.",
  "sell.demo.body.pre": "Pou pibliye, ou bezwen yon baz Supabase konfigire (gade",
  "sell.demo.body.post": ").",
  "sell.login.subtitle": "Konekte pou pibliye yon pwodui.",
  "sell.subtitle": "Pibliye yon pwodui dijital oswa yon sèvis.",
  "sell.mine.title": "Pwodui mwen yo",

  "publish.title.ph": "Tit pwodui a",
  "publish.kind.aria": "Kalite pwodui",
  "publish.category.aria": "Kategori",
  "publish.category.empty": "— Kategori —",
  "publish.price.ph": "Pri (HTG)",
  "publish.description.ph": "Deskripsyon",
  "publish.service.hint":
    "Paj sèvis (menm jan ak Fiverr) — opsyonèl, men sa rasire achtè a.",
  "publish.deliveryDays.ph": "Dele livrezon (an jou)",
  "publish.includes.ph":
    "Sa ki enkli — yon eleman pou chak liy\nEgz. 3 revizyon\nFichye sous livre",
  "publish.submit": "Pibliye pwodui a",
  "publish.submitting": "N ap pibliye…",
  "publish.error.generic": "Pibliyasyon an echwe.",
  "publish.footer.hint":
    "Ou va voye fichye a apati paj pwodui a (pwochèn etap la).",

  "upload.sending": "N ap voye…",
  "upload.replace": "Ranplase fichye a",
  "upload.add": "Ajoute fichye a",
  "upload.saved": "Fichye anrejistre.",
  "upload.error": "Anvwa a echwe.",

  "creator.products.label": "pwodui an liy",
  "creator.share.text": "Dekouvri boutik {name} sou Zabelie :",
  "creator.empty": "Poko gen pwodui pibliye.",

  "card.kind.file": "Fichye",
  "card.kind.service": "Sèvis",
  "card.kind.physical": "Fizik",

  "status.draft": "Poko pibliye",
  "status.published": "Pibliye",

  "auth.forgot": "Modpas bliye ?",
  "forgot.title": "Modpas bliye",
  "forgot.subtitle":
    "Antre imèl ou, n ap voye yon lyen pou ou kreye yon nouvo modpas.",
  "forgot.submit": "Voye lyen an",
  "forgot.sending": "N ap voye…",
  "forgot.success":
    "Si gen yon kont ak imèl sa a, yon lyen reyinisyalizasyon fèk voye. Tcheke bwat resepsyon ou (ak spam yo).",
  "forgot.back": "← Tounen nan konekte a",
  "reset.title": "Nouvo modpas",
  "reset.subtitle": "Chwazi yon nouvo modpas pou kont ou.",
  "reset.confirm.ph": "Konfime modpas la",
  "reset.mismatch": "Modpas yo pa menm.",
  "reset.submit": "Mete modpas la ajou",
  "reset.submitting": "N ap mete ajou…",
  "reset.success": "Modpas mete ajou. Ou ka konekte kounye a.",
  "reset.invalid": "Lyen sa a pa bon ankò. Mande yon nouvo lyen.",
};

export const DICT: Record<Lang, Record<I18nKey, string>> = { fr, ht };

/** Traduit une clé ; {vars} interpolées ; repli FR si clé absente. */
export function t(
  lang: Lang,
  key: I18nKey,
  vars?: Record<string, string>
): string {
  let s = DICT[lang]?.[key] ?? fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

export function isLang(v: unknown): v is Lang {
  return v === "fr" || v === "ht";
}
