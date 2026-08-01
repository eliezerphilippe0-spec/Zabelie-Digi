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

export type Lang = "fr" | "ht" | "en";
export const LANG_COOKIE = "zabelie_lang";
export const LANGS: Lang[] = ["fr", "ht", "en"];

const fr = {
  // Nav / footer
  "nav.catalog": "Catalogue",
  "nav.talents": "Talents",
  "nav.how": "Comment ça marche",
  "nav.login": "Connexion",
  "nav.sell": "Vendre",
  "nav.dashboard": "Tableau de bord",
  "nav.pro": "Facturation",
  "nav.logout": "Déconnexion",
  "footer.tagline":
    "La marketplace haïtienne. Paiement mobile money, pensé pour le contexte local.",
  "footer.explore": "Explorer",
  "footer.sell": "Vendre",
  "footer.become": "Devenir vendeur",
  "footer.payment": "Paiement",
  "footer.natcash": "NatCash — bientôt",
  "footer.rights": "Tous droits réservés.",

  // ── Politique produits interdits (v1) ────────────────────────────────────
  "policy.link": "Ce qui ne peut pas être vendu",
  "catalog.allShelves": "Tous les rayons",
  "catalog.miss.title": "Nous n'avons pas encore",
  "catalog.miss.body": "Personne ne vend ça sur Zabelie pour le moment. Nous notons votre recherche : c'est comme ça que nous choisissons quels vendeurs aller chercher.",
  "catalog.miss.shelves": "Rayons voisins",
  "catalog.miss.know": "Vous connaissez quelqu'un qui vend ça ?",
  "catalog.miss.share": "Partager sur WhatsApp",
  "catalog.fuzzy": "Aucun résultat exact. Résultats approchants :",
  "catalog.empty.title": "Le catalogue est encore vide.",
  "catalog.empty.body": "Les premières boutiques arrivent. Vous vendez ? Publiez votre produit en quelques minutes.",
  "catalog.empty.cta": "Vendre sur Zabelie",
  "sell.physical.q": "Vous vendez un produit physique — pièces, vêtements, alimentation ?",
  "sell.physical.cta": "Publier un produit physique",
  "policy.accept": "Je confirme que ce produit respecte les règles de vente de Zabelie.",
  "policy.accept.read": "Lire les règles",
  "policy.accept.required": "Vous devez accepter les règles de vente.",
  "policy.title": "Ce qui ne peut pas être vendu sur Zabelie",
  "policy.date": "27 juillet 2026",
  "policy.why.h": "Pourquoi ces règles",
  "policy.why.p":
    "Ce sont les règles de Zabelie. Elles sont plus strictes que la loi, et c'est volontaire : une règle large se comprend et s'applique sans discussion. En publiant une fiche, vous les acceptez.",
  "policy.objects.h": "1. Objets interdits — aucun cas particulier",
  "policy.objects.items":
    "Armes à feu, ainsi que leurs composants et accessoires : canon, carcasse, culasse, détente, chargeur, silencieux, kit de conversion. Munitions, poudre, amorces. Répliques réalistes et armes à air comprimé.\nExplosifs, feux d'artifice, artifices de signalisation.\nStupéfiants, précurseurs, matériel de consommation.\nMédicaments sous ordonnance, médicaments non enregistrés, et tout produit présenté comme thérapeutique.\nÉquipement militaire, gilets pare-balles, vision nocturne.\nUniformes, insignes, plaques et documents de la PNH ou de toute autre autorité publique.\nFaux papiers, fausse monnaie, et matériel servant à en fabriquer.\nBrouilleurs, matériel d'interception, skimmers.\nEspèces protégées, artefacts et biens du patrimoine.\nContenu pornographique.\nArmes dont la seule fonction est offensive : cran d'arrêt, poing américain, matraque.",
  "policy.counterfeit.h": "2. Contrefaçon — interdiction absolue",
  "policy.counterfeit.p1":
    "Vêtements, chaussures, sacs, montres, appareils ou accessoires portant une marque non authentique : interdits. Même si vous écrivez que c'est une copie. Même si le prix le rend évident. Même en « qualité A ».",
  "policy.counterfeit.p2":
    "La contrefaçon met en danger toute la plateforme, pas seulement votre fiche. C'est un risque collectif : la réputation d'une plateforme se paie par tous ses vendeurs, pas par le fautif.",
  "policy.confusion.h": "3. Ne pas confondre",
  "policy.confusion.banned":
    "INTERDIT : armes à feu, leurs composants et accessoires, munitions.",
  "policy.confusion.allowed":
    "AUTORISÉ : pièces détachées pour véhicules, motos, machines et appareils.",
  "policy.confusion.p":
    "Le rayon automobile-moto est l'un des principaux rayons de Zabelie. Il reste entièrement ouvert.",
  "policy.tools.h": "4. Outils tranchants : c'est la présentation qui décide",
  "policy.tools.p1":
    "Machettes, couteaux de cuisine, ciseaux, outils de travail : autorisés. La machette est un outil agricole, vendu partout dans le pays.",
  "policy.tools.p2":
    "Ce qui est interdit, c'est de présenter l'outil comme une arme. Sont refusés :",
  "policy.tools.items":
    "les mots « otodefans », « tactique », « self-defense », « combat » dans le titre, la description ou sur la photo ;\ntoute image ou tout texte montrant l'outil employé contre une personne.",
  "policy.tools.p3":
    "Le même objet : présenté comme outil, il passe ; présenté comme arme, il ne passe pas.",
  "policy.services.h": "5. Services interdits",
  "policy.services.p1":
    "Zabelie n'est pas une institution financière et ne servira pas de chemin vers une. Sont interdits :",
  "policy.services.items":
    "transfert d'argent : envoyer, recevoir ou détenir de l'argent pour autrui ;\nchange : dollars contre gourdes, ou toute autre opération de change ;\nprêt et détention de fonds : crédit, avance sur salaire ;\njeux d'argent : borlette, loterie, paris, tirages ;\nrevente de solde MonCash ou NatCash : « m ap vann balans », agent de dépôt ou de retrait. C'est de la monnaie électronique, pas un bien — au même titre que les composants d'armes, il n'existe aucun cas particulier.",
  "policy.services.p2":
    "Le sòl et la tontine ne peuvent pas passer par Zabelie non plus. Ce n'est pas un jugement sur la pratique — elle fait partie de la vie de tout le monde. C'est que Zabelie ne peut pas détenir d'argent pour autrui, et un sòl demande exactement cela.",
  "policy.services.p3":
    "Cette règle ne dépend pas de ce que vous vendez : un vendeur de vêtements n'a pas le droit de proposer « je change vos dollars » dans sa fiche non plus.",
  "policy.digital.h": "6. Fichiers et contenus numériques",
  "policy.digital.items":
    "logiciels piratés, activateurs, clés de licence non authentiques ;\nmusique, films, livres, cours ou tout contenu que vous n'avez pas le droit de vendre ;\ncomptes revendus : streaming, réseaux sociaux, jeux ;\nlistes de données personnelles : numéros de téléphone, adresses e-mail, contacts.",
  "policy.sanctions.h": "7. Sanctions",
  "policy.sanctions.p1":
    "En cas de violation : retrait immédiat de la fiche, suspension du compte, conservation des éléments.",
  "policy.sanctions.p2":
    "Pour les armes, la drogue et la contrefaçon : pas d'avertissement, pas de seconde chance.",
  "policy.sanctions.p3":
    "Il n'existe aucun palier « autorisé sur justificatif ». Zabelie n'a aucun moyen de vérifier un permis — nous n'en demandons donc aucun, et n'en acceptons aucun.",
  "policy.review.h": "8. Chaque fiche passe devant quelqu'un",
  "policy.review.p":
    "Nous examinons chaque fiche — produit physique, service, fichier — avant qu'elle apparaisse sur le site. En cas de doute, soumettez quand même : c'est nous qui décidons, et cela ne vous coûte rien.",
  "policy.version.note":
    "Ces règles peuvent changer. Chaque nouvelle version porte son propre numéro, et c'est la version que vous avez acceptée qui reste enregistrée.",

  // Accueil
  "home.badge": "La marketplace haïtienne",
  "home.h1": "Achetez en Haïti, payez avec MonCash",
  "badge.pay": "Paiement sécurisé avec MonCash",
  "home.sub":
    "Des vendeurs vérifiés près de chez vous. Vous payez avec MonCash, le vendeur vous livre.",
  "home.cta.sell": "Commencer à vendre",
  "home.cta.browse": "Explorer le catalogue",
  "home.stat1": "haïtien",
  "home.stat2": "paiement mobile",
  "home.stat3": "après paiement",
  "home.stat3.v": "Livraison",
  "home.trends": "Tendances du moment",
  "home.trends.sub": "Les produits les plus demandés.",
  "home.all": "Tout voir →",
  "home.how": "Comment ça marche",
  "home.s1.t": "Publiez",
  "home.s1.b":
    "Mettez votre produit en ligne en quelques minutes.",
  "home.s2.t": "Encaissez",
  "home.s2.b":
    "L'acheteur paie via MonCash. Le paiement est confirmé serveur-à-serveur.",
  "home.s3.t": "Livrez & retirez",
  "home.s3.b":
    "Vous livrez l'acheteur, votre solde est crédité, vous retirez vos gains.",
  "home.final.a": "Ce que vous vendez mérite d'être",
  "home.final.b": "payé",
  "home.final.sub":
    "Rejoignez les vendeurs qui encaissent avec MonCash sur Zabelie.",
  "home.final.cta": "Créer ma boutique",

  // Catalogue
  "catalog.title": "Catalogue",
  "catalog.results": "résultat(s)",
  "catalog.for": "pour",
  "catalog.search.ph": "Rechercher un produit…",
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
  "sec.new.sub": "Les derniers produits publiés par nos vendeurs.",
  "sec.services": "Services populaires",
  "sec.services.sub": "Mentorat, design, consultation — réservez une prestation.",
  "sec.sellers": "Meilleurs vendeurs",
  "sec.sellers.sub": "Les vendeurs les plus appréciés de la communauté.",
  "sec.sellers.sales": "ventes",
  "sec.free": "Produits gratuits",
  "sec.free.sub": "Découvrez gratuitement, revenez pour la suite.",
  "sec.free.badge": "GRATUIT",
  "sec.promo": "En promotion",
  "sec.promo.sub": "Ces vendeurs ont un code promo actif — demandez-le sur leur WhatsApp.",
  "sec.why": "Pourquoi choisir Zabelie",
  "why.1.t": "Argent protégé",
  "why.1.b": "Chaque paiement reste en escrow jusqu'à la livraison. Montant vérifié en base, jamais sur parole.",
  "why.3.t": "Paiement lakay",
  "why.3.b": "MonCash en gourdes, Zelle en dollars pour la diaspora. Pensé pour Haïti d'abord.",
  "why.4.t": "Kreyòl + léger",
  "why.4.b": "Interface en kreyòl, en français et en anglais, pages ultra-légères pour la 3G et les petits téléphones.",
  "sec.faq": "Questions fréquentes",
  "faq.q1": "Comment acheter un produit ?",
  "faq.a1": "Choisissez un produit, cliquez « Payer avec MonCash » et confirmez sur votre téléphone. La diaspora peut payer en USD via Zelle.",
  "faq.q2": "Quand est-ce que je reçois mon achat ?",
  "faq.a2":
    "Cela dépend du produit. Un fichier est disponible immédiatement dans « Mes achats », avec un e-mail contenant le lien. Pour une prestation, le vendeur vous contacte après paiement. Un produit physique est expédié par le vendeur.",
  "faq.q3": "Comment vendre sur Zabelie ?",
  "faq.a3": "Créez un compte, publiez votre produit en quelques minutes. C'est gratuit — la plateforme prélève 10 % par vente, arrondis à la gourde la plus proche.",
  "faq.a3.floor": "Créez un compte, publiez votre produit en quelques minutes. C'est gratuit — la plateforme prélève 10 % par vente. L'arrondi est toujours en votre faveur.",
  "faq.q4": "Quand le vendeur reçoit-il son argent ?",
  "faq.a4": "Le net est crédité immédiatement « en attente », puis devient disponible 7 jours après la vente (protection anti-fraude).",
  "faq.q5": "Et si quelque chose se passe mal ?",
  "faq.a5": "Chaque commande est traçable et remboursable vers votre moyen de paiement d'origine. Les litiges sont examinés un par un.",
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
  "auth.name.required": "Un nom est requis.",
  "auth.name.reserved": "Ce nom est réservé : il peut être confondu avec un compte officiel Zabelie. Choisissez-en un autre.",
  "auth.err.exists": "Cette adresse a déjà un compte. Connectez-vous.",
  "auth.err.credentials": "E-mail ou mot de passe incorrect.",
  "auth.err.password": "Mot de passe trop court — 6 caractères au minimum.",
  "auth.err.notconfirmed": "Compte pas encore confirmé. Ouvrez le lien envoyé par e-mail.",
  "auth.err.rate": "Trop de tentatives. Attendez quelques minutes et réessayez.",
  "auth.err.disabled": "Les inscriptions sont fermées pour le moment.",
  "auth.err.email": "Cette adresse e-mail n'est pas valide.",
  "auth.err.network": "La connexion a été perdue. Vérifiez votre réseau et réessayez.",
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

  // Écrans d'erreur globaux (app/not-found.tsx). `app/error.tsx` ne peut PAS
  // les lire : c'est un composant client, et t() est serveur uniquement (règle
  // en tête de ce fichier). Ses libellés vivent dans lib/i18n-erreur.ts.
  "err.404.title": "Cette page n'existe pas",
  "err.404.body":
    "Le lien est peut-être ancien, ou l'adresse comporte une faute. Rien n'est perdu : vos achats et vos commandes restent accessibles depuis votre compte.",
  "err.404.home": "Aller à l'accueil",
  "err.404.catalog": "Voir le catalogue",

  "sell.title": "Vendre sur Zabelie",
  "sell.demo.subtitle": "Mode démo — connecte Supabase pour publier de vrais produits.",
  "sell.demo.body.pre": "La publication nécessite une base Supabase configurée (voir",
  "sell.demo.body.post": ").",
  "sell.login.subtitle": "Connecte-toi pour publier un produit.",
  "sell.subtitle": "Publie ton produit ou ta prestation.",
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
  "publish.net.youReceive": "Vous recevez",
  "publish.net.fee": "commission",
  "publish.net.rounding": "Commission arrondie à la gourde la plus proche.",
  "publish.net.rounding.floor": "L'arrondi est toujours en votre faveur.",
  "publish.net.caveat": "Estimation au prix plein — un code promo réduit le montant payé, donc aussi ce que vous recevez.",

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
  "status.review": "En attente de revue",
  "status.review.hint": "Nous regardons chaque fiche avant sa mise en ligne. Inutile de la soumettre à nouveau.",
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
  "nav.login": "Konekte",
  "nav.sell": "Vann",
  "nav.dashboard": "Tablo bò",
  "nav.pro": "Fè m peye",
  "nav.logout": "Dekonekte",
  "footer.tagline":
    "Makètplas ayisyen an. Peman mobile money, panse pou reyalite lokal la.",
  "footer.explore": "Eksplore",
  "footer.sell": "Vann",
  "footer.become": "Vin vandè",
  "footer.payment": "Peman",
  "footer.natcash": "NatCash — talè konsa",
  "footer.rights": "Tout dwa rezève.",

  // ── Politik pwodui entèdi (v1) ───────────────────────────────────────────
  "policy.link": "Sa ou pa gen dwa vann",
  "catalog.allShelves": "Tout rayon yo",
  "catalog.miss.title": "Nou poko genyen",
  "catalog.miss.body": "Pou kounye a pèsonn pa vann sa sou Zabelie. Nou note rechèch ou a : se konsa nou chwazi ki vandè pou n al chèche.",
  "catalog.miss.shelves": "Rayon ki toupre",
  "catalog.miss.know": "Ou konn yon moun ki vann sa a ?",
  "catalog.miss.share": "Pataje sou WhatsApp",
  "catalog.fuzzy": "Nou pa jwenn egzakteman sa. Men sa ki pi pre :",
  "catalog.empty.title": "Katalòg la vid toujou.",
  "catalog.empty.body": "Premye boutik yo ap vini. Se ou k ap vann ? Pibliye pwodui ou an kèk minit.",
  "catalog.empty.cta": "Vann sou Zabelie",
  "sell.physical.q": "Ou gen yon pwodui fizik pou vann — pyès, rad, manje ?",
  "sell.physical.cta": "Pibliye yon pwodui fizik",
  "policy.accept": "Mwen konfime pwodui sa a respekte règ vant Zabelie yo.",
  "policy.accept.read": "Li règ yo",
  "policy.accept.required": "Ou dwe aksepte règ vant yo.",
  "policy.title": "Sa ou pa gen dwa vann sou Zabelie",
  "policy.date": "27 jiyè 2026",
  "policy.why.h": "Poukisa règ sa yo",
  "policy.why.p":
    "Règ sa yo se règ Zabelie. Yo pi sevè pase lalwa, e se espre : yon règ ki laj se yon règ tout moun konprann, e nou ka aplike l san diskisyon. Lè ou pibliye yon fich, ou aksepte yo.",
  "policy.objects.h": "1. Objè entèdi nèt — pa gen okenn ka espesyal",
  "policy.objects.items":
    "Zam afe, ansanm ak pyès ak akseswa yo : kanon, kò zam (carcasse), kilas, gachèt, chajè, silansye, kit konvèsyon. Bal, poud, amòs. Fo zam ki sanble ak vre, ak zam a lè konprime.\nEksplozif, fedatifis, fize siyalizasyon.\nDwòg, pwodui ki sèvi pou fabrike dwòg, materyèl pou konsome dwòg.\nMedikaman ki mande òdonans doktè, medikaman ki pa anrejistre, ak tout pwodui yo prezante kòm remèd.\nEkipman militè, jilè pare bal, aparèy vizyon lannuit.\nInifòm, ensiy, plak ak dokiman PNH oswa nenpòt lòt otorite piblik.\nFo papye, fo lajan, ak materyèl pou fabrike yo.\nBwouyè siyal, materyèl pou entèsepte kominikasyon, skimè (aparèy pou vòlè done kat bankè).\nEspès pwoteje, objè achewolojik ak byen patrimwàn.\nKontni pònografik.\nZam ki fèt sèlman pou atake : kouto otomatik (cran d'arrêt), pwen ameriken, matrak.",
  "policy.counterfeit.h": "2. Kopi mak — entèdi nèt",
  "policy.counterfeit.p1":
    "Rad, soulye, sak, mont, aparèy oswa akseswa ki pote yon mak ki pa otantik : entèdi. Menm si ou ekri se yon kopi. Menm si pri a fè sa klè. Menm si se « kalite A ».",
  "policy.counterfeit.p2":
    "Kontrefason mete tout Zabelie an danje, pa sèlman fich ou a. Se yon risk kolektif : repitasyon yon platfòm, se tout vandè yo ki peye l — pa sèlman moun ki fè fot la.",
  "policy.confusion.h": "3. Pa konfonn de bagay sa yo",
  "policy.confusion.banned": "ENTÈDI : zam afe, pyès ak akseswa zam, bal.",
  "policy.confusion.allowed":
    "OTORIZE : pyès detache pou machin, moto, machin travay ak aparèy.",
  "policy.confusion.p":
    "Rayon otomobil-moto a se youn nan pi gwo rayon Zabelie. Li rete louvri nèt.",
  "policy.tools.h": "4. Zouti file : se jan ou prezante l ki konte",
  "policy.tools.p1":
    "Manchèt, kouto kizin, sizo, zouti travay : yo otorize. Manchèt se yon zouti travay tè, li vann toupatou nan peyi a.",
  "policy.tools.p2":
    "Sa ki entèdi, se prezante zouti a kòm yon zam. Nou refize :",
  "policy.tools.items":
    "mo tankou « otodefans », « taktik », « self-defense », « konba » nan tit la, nan deskripsyon an oswa sou foto a ;\ntout imaj oswa tèks ki montre zouti a ap sèvi kont yon moun.",
  "policy.tools.p3":
    "Menm objè a : prezante kòm zouti, li pase ; prezante kòm zam, li pa pase.",
  "policy.services.h": "5. Sèvis ou pa gen dwa ofri",
  "policy.services.p1":
    "Zabelie pa yon enstitisyon finansye, e li p ap sèvi kòm chemen pou youn. Entèdi :",
  "policy.services.items":
    "transfè lajan : voye, resevwa oswa kenbe lajan pou lòt moun ;\nchanje lajan : dola kont goud, oswa nenpòt lòt chanj ;\nprete lajan ak kenbe lajan : prè, avans sou salè ;\njwèt aza : borlèt, lotri, pari, tiraj ;\nrevann balans MonCash oswa NatCash : « m ap vann balans », ajan depo oswa retrè. Se lajan elektwonik, se pa yon machandiz — menm jan ak pyès zam, pa gen okenn ka espesyal.",
  "policy.services.p2":
    "Sòl ak tontin pa ka pase sou Zabelie non plis. Se pa yon jijman sou pratik la — se yon bagay ki fè pati lavi tout moun. Se paske Zabelie pa ka kenbe lajan pou moun, e yon sòl mande egzakteman sa.",
  "policy.services.p3":
    "Règ sa a pa gen rapò ak sa ou vann : yon vandè ki vann rad pa gen dwa ofri « m ap chanje dola pou ou » nan fich li non plis.",
  "policy.digital.h": "6. Fichye ak kontni dijital",
  "policy.digital.items":
    "lojisyèl pirat, aktivatè, kle lisans ki pa otantik ;\nmizik, fim, liv, kou oswa nenpòt kontni ou pa gen dwa vann ;\nkont ou revann : streaming, rezo sosyal, jwèt ;\nlis done pèsonèl : nimewo telefòn, adrès imel, kontak moun.",
  "policy.sanctions.h": "7. Sanksyon",
  "policy.sanctions.p1":
    "Si yon fich vyole règ sa yo : nou retire fich la lapoula, nou sispann kont lan, e nou konsève eleman yo.",
  "policy.sanctions.p2":
    "Pou zam, dwòg ak kontrefason : pa gen avètisman, pa gen dezyèm chans.",
  "policy.sanctions.p3":
    "Pa gen « otorize si ou gen papye ». Zabelie pa gen mwayen verifye okenn pèmi — kidonk nou pa mande okenn, e nou pa aksepte okenn.",
  "policy.review.h": "8. Chak fich pase devan yon moun",
  "policy.review.p":
    "Nou gade chak fich — pwodui fizik, sèvis, fichye — anvan li parèt sou sit la. Si ou pa sèten yon bagay pase, soumèt li kanmenm : se nou k ap deside, e sa pa koute ou anyen.",
  "policy.version.note":
    "Règ sa yo ka chanje. Chak nouvo vèsyon gen nimewo pa l, e se vèsyon ou te aksepte a ki rete make.",

  "home.badge": "Makètplas ayisyen an",
  "home.h1": "Achte an Ayiti, peye ak MonCash",
  "badge.pay": "Peman sekirize ak MonCash",
  "home.sub":
    "Vandè verifye toupre w. Ou peye ak MonCash, vandè a livre w.",
  "home.cta.sell": "Kòmanse vann",
  "home.cta.browse": "Gade katalòg la",
  "home.stat1": "ayisyen",
  "home.stat2": "peman mobil",
  "home.stat3": "apre peman",
  "home.stat3.v": "Livrezon",
  "home.trends": "Sa k ap mache kounye a",
  "home.trends.sub": "Pwodwi moun plis ap chèche yo.",
  "home.all": "Wè tout →",
  "home.how": "Kijan sa mache",
  "home.s1.t": "Pibliye",
  "home.s1.b": "Mete pwodwi ou an liy nan kèk minit.",
  "home.s2.t": "Resevwa lajan",
  "home.s2.b": "Achtè a peye ak MonCash. Peman an konfime sèvè-a-sèvè.",
  "home.s3.t": "Livre & retire",
  "home.s3.b":
    "Ou livre achtè a, kòb la antre nan balans ou, epi ou retire lajan ou.",
  "home.final.a": "Sa w ap vann merite",
  "home.final.b": "peye",
  "home.final.sub":
    "Vin jwenn vandè k ap resevwa lajan ak MonCash sou Zabelie.",
  "home.final.cta": "Kreye boutik mwen",

  "catalog.title": "Katalòg",
  "catalog.results": "rezilta",
  "catalog.for": "pou",
  "catalog.search.ph": "Chèche yon pwodwi…",
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
  "product.service": "✓ Kontak ak vandè a apre peman",
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

  "err.404.title": "Paj sa a pa egziste",
  "err.404.body":
    "Petèt lyen an fin vye, oswa gen yon fot nan adrès la. Anyen pa pèdi : acha ou yo ak kòmann ou yo toujou la nan kont ou.",
  "err.404.home": "Ale nan akèy la",
  "err.404.catalog": "Wè katalòg la",
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
  "sec.new.sub": "Dènye pwodui vandè nou yo pibliye.",
  "sec.services": "Sèvis popilè yo",
  "sec.services.sub": "Akonpayman, design, konsiltasyon — rezève yon sèvis.",
  "sec.sellers": "Pi bon vandè yo",
  "sec.sellers.sub": "Vandè kominote a plis renmen yo.",
  "sec.sellers.sales": "vant",
  "sec.free": "Pwodui gratis",
  "sec.free.sub": "Dekouvri gratis, tounen pou rès la.",
  "sec.free.badge": "GRATIS",
  "sec.promo": "An pwomosyon",
  "sec.promo.sub": "Vandè sa yo gen yon kòd pwomo aktif — mande yo li sou WhatsApp.",
  "sec.why": "Poukisa chwazi Zabelie",
  "why.1.t": "Lajan ou pwoteje",
  "why.1.b": "Chak peman rete an escrow jiska livrezon. Montan an verifye nan baz done a, pa sou pawòl.",
  "why.3.t": "Peman lakay",
  "why.3.b": "MonCash an goud, Zelle an dola pou dyaspora a. Fèt pou Ayiti anvan tout bagay.",
  "why.4.t": "Kreyòl + leje",
  "why.4.b": "Entèfas an kreyòl, franse ak anglè, paj yo leje anpil pou 3G ak ti telefòn yo.",
  "sec.faq": "Kesyon moun poze souvan",
  "faq.q1": "Kijan pou m achte yon pwodui ?",
  "faq.a1": "Chwazi yon pwodui, klike « Peye ak MonCash » epi konfime sou telefòn ou. Dyaspora a ka peye an USD ak Zelle.",
  "faq.q2": "Kilè m ap resevwa acha m ?",
  "faq.a2":
    "Sa depann de pwodui a. Yon fichye disponib touswit nan « Acha mwen yo », ak yon imèl ki gen lyen an. Pou yon sèvis, vandè a kontakte w apre peman an. Yon pwodui fizik, se vandè a k ap voye l apre peman an konfime.",
  "faq.q3": "Kijan pou m vann sou Zabelie ?",
  "faq.a3": "Kreye yon kont, pibliye pwodui ou an kèk minit. Li gratis — platfòm nan pran 10 % sou chak vant, awondi nan goud ki pi pre a.",
  "faq.a3.floor": "Kreye yon kont, pibliye pwodui ou an kèk minit. Li gratis — platfòm nan pran 10 % sou chak vant. Awondi a toujou an favè w.",
  "faq.q4": "Kilè vandè a resevwa lajan li ?",
  "faq.a4": "Nèt la antre touswit « an atant », epi li vin disponib 7 jou apre vant lan (pwoteksyon kont fwod).",
  "faq.q5": "E si yon bagay pase mal ?",
  "faq.a5": "Chak kòmand ka trase e ranbouse sou menm mwayen peman ou te itilize a. Nou egzamine chak litij grenn pa grenn.",
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
  "auth.name.required": "Ou dwe mete yon non.",
  "auth.name.reserved": "Non sa a rezève : yo ka konfonn li ak yon kont ofisyèl Zabelie. Chwazi yon lòt.",
  "auth.err.exists": "Adrès sa a gen yon kont deja. Konekte w.",
  "auth.err.credentials": "Imèl oswa modpas la pa bon.",
  "auth.err.password": "Modpas la twò kout — 6 karaktè omwen.",
  "auth.err.notconfirmed": "Kont lan poko konfime. Ouvri lyen nou voye nan imèl ou a.",
  "auth.err.rate": "Twòp tantativ. Tann kèk minit epi eseye ankò.",
  "auth.err.disabled": "Enskripsyon yo fèmen pou kounye a.",
  "auth.err.email": "Adrès imèl sa a pa valab.",
  "auth.err.network": "Koneksyon an koupe. Verifye rezo w epi eseye ankò.",
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
  "sell.subtitle": "Pibliye pwodui ou oswa sèvis ou.",
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
  "publish.net.youReceive": "Ou resevwa",
  "publish.net.fee": "komisyon",
  "publish.net.rounding": "Komisyon an awondi nan goud ki pi pre a.",
  "publish.net.rounding.floor": "Awondi a toujou an favè w.",
  "publish.net.caveat": "Estimasyon sou pri konplè a — yon kòd pwomo desann sa achtè a peye, donk sa ou resevwa tou.",

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
  "status.review": "N ap tann revizyon",
  "status.review.hint": "Nou gade chak fich anvan li parèt. Ou pa bezwen voye l ankò.",
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

const en = {
  // Nav / footer
  "nav.catalog": "Catalog",
  "nav.talents": "Talent",
  "nav.how": "How it works",
  "nav.login": "Sign in",
  "nav.sell": "Sell",
  "nav.dashboard": "Dashboard",
  "nav.pro": "Invoicing",
  "nav.logout": "Sign out",
  "footer.tagline":
    "The Haitian marketplace. Mobile money payments, built for local conditions.",
  "footer.explore": "Explore",
  "footer.sell": "Sell",
  "footer.become": "Become a seller",
  "footer.payment": "Payment",
  "footer.natcash": "NatCash — coming soon",
  "footer.rights": "All rights reserved.",

  // ── Prohibited items policy (v1) ─────────────────────────────────────────
  "policy.link": "What cannot be sold",
  "catalog.allShelves": "All departments",
  "catalog.miss.title": "We don't have this yet",
  "catalog.miss.body": "Nobody is selling this on Zabelie right now. We're recording your search: that is how we decide which sellers to go find.",
  "catalog.miss.shelves": "Related departments",
  "catalog.miss.know": "Know someone who sells this?",
  "catalog.miss.share": "Share on WhatsApp",
  "catalog.fuzzy": "No exact match. Closest results:",
  "catalog.empty.title": "The catalog is still empty.",
  "catalog.empty.body": "The first shops are on their way. Do you sell? Publish your product in minutes.",
  "catalog.empty.cta": "Sell on Zabelie",
  "sell.physical.q": "Selling a physical product — parts, clothing, food?",
  "sell.physical.cta": "Publish a physical product",
  "policy.accept": "I confirm this product complies with Zabelie's selling rules.",
  "policy.accept.read": "Read the rules",
  "policy.accept.required": "You must accept the selling rules.",
  "policy.title": "What cannot be sold on Zabelie",
  "policy.date": "July 27, 2026",
  "policy.why.h": "Why these rules",
  "policy.why.p":
    "These are Zabelie's rules. They are stricter than the law, and that is deliberate: a broad rule is understood and applied without argument. By publishing a listing, you accept them.",
  "policy.objects.h": "1. Prohibited items — no exceptions",
  "policy.objects.items":
    "Firearms, along with their components and accessories: barrel, frame, bolt, trigger, magazine, suppressor, conversion kit. Ammunition, powder, primers. Realistic replicas and air guns.\nExplosives, fireworks, signal flares.\nNarcotics, precursors, drug paraphernalia.\nPrescription medication, unregistered medication, and any product presented as therapeutic.\nMilitary equipment, body armor, night vision.\nUniforms, insignia, badges and documents of the PNH or any other public authority.\nForged documents, counterfeit currency, and equipment used to produce them.\nJammers, interception equipment, skimmers.\nProtected species, artifacts and heritage property.\nPornographic content.\nWeapons whose only function is offensive: switchblade, brass knuckles, baton.",
  "policy.counterfeit.h": "2. Counterfeits — absolute ban",
  "policy.counterfeit.p1":
    "Clothing, shoes, bags, watches, devices or accessories carrying a brand that is not authentic: prohibited. Even if you write that it is a copy. Even if the price makes it obvious. Even in « A quality ».",
  "policy.counterfeit.p2":
    "Counterfeits put the whole platform at risk, not just your listing. It is a shared risk: a platform's reputation is paid for by every seller, not by the one at fault.",
  "policy.confusion.h": "3. Do not confuse the two",
  "policy.confusion.banned":
    "PROHIBITED: firearms, their components and accessories, ammunition.",
  "policy.confusion.allowed":
    "ALLOWED: spare parts for vehicles, motorcycles, machines and appliances.",
  "policy.confusion.p":
    "The auto and motorcycle department is one of Zabelie's main departments. It stays fully open.",
  "policy.tools.h": "4. Sharp tools: presentation decides",
  "policy.tools.p1":
    "Machetes, kitchen knives, scissors, work tools: allowed. The machete is a farming tool, sold everywhere in the country.",
  "policy.tools.p2":
    "What is prohibited is presenting the tool as a weapon. These are refused:",
  "policy.tools.items":
    "the words « otodefans », « tactical », « self-defense », « combat » in the title, the description or on the photo;\nany image or text showing the tool used against a person.",
  "policy.tools.p3":
    "The same object: presented as a tool, it passes; presented as a weapon, it does not.",
  "policy.services.h": "5. Prohibited services",
  "policy.services.p1":
    "Zabelie is not a financial institution and will not serve as a path to one. These are prohibited:",
  "policy.services.items":
    "money transfer: sending, receiving or holding money for someone else;\ncurrency exchange: dollars for gourdes, or any other exchange operation;\nlending and holding funds: credit, salary advances;\ngambling: borlette, lottery, betting, draws;\nreselling MonCash or NatCash balance: « m ap vann balans », deposit or withdrawal agent. That is electronic money, not goods — just like weapon components, there is no special case.",
  "policy.services.p2":
    "Sòl and tontine cannot go through Zabelie either. This is not a judgment on the practice — it is part of everyone's life. It is that Zabelie cannot hold money for others, and a sòl requires exactly that.",
  "policy.services.p3":
    "This rule does not depend on what you sell: a clothing seller may not offer « I'll exchange your dollars » in their listing either.",
  "policy.digital.h": "6. Files and digital content",
  "policy.digital.items":
    "pirated software, activators, non-authentic license keys;\nmusic, films, books, courses or any content you do not have the right to sell;\nresold accounts: streaming, social media, games;\npersonal data lists: phone numbers, email addresses, contacts.",
  "policy.sanctions.h": "7. Enforcement",
  "policy.sanctions.p1":
    "In case of violation: immediate removal of the listing, account suspension, retention of the evidence.",
  "policy.sanctions.p2":
    "For weapons, drugs and counterfeits: no warning, no second chance.",
  "policy.sanctions.p3":
    "There is no « allowed with documentation » tier. Zabelie has no way to verify a permit — so we ask for none, and accept none.",
  "policy.review.h": "8. Every listing is reviewed by a person",
  "policy.review.p":
    "We review every listing — physical product, service, file — before it appears on the site. When in doubt, submit anyway: the decision is ours, and it costs you nothing.",
  "policy.version.note":
    "These rules may change. Each new version carries its own number, and the version you accepted is the one kept on record.",

  // Home
  "home.badge": "The Haitian marketplace",
  "home.h1": "Buy in Haiti, pay with MonCash",
  "badge.pay": "Secure payment with MonCash",
  "home.sub":
    "Verified sellers near you. You pay with MonCash, the seller delivers.",
  "home.cta.sell": "Start selling",
  "home.cta.browse": "Browse the catalog",
  "home.stat1": "Haitian",
  "home.stat2": "mobile payment",
  "home.stat3": "after payment",
  "home.stat3.v": "Delivery",
  "home.trends": "Trending now",
  "home.trends.sub": "The most requested products.",
  "home.all": "See all →",
  "home.how": "How it works",
  "home.s1.t": "Publish",
  "home.s1.b":
    "Put your product online in a few minutes.",
  "home.s2.t": "Get paid",
  "home.s2.b":
    "The buyer pays via MonCash. Payment is confirmed server-to-server.",
  "home.s3.t": "Deliver & withdraw",
  "home.s3.b":
    "You deliver to the buyer, your balance is credited, you withdraw your earnings.",
  "home.final.a": "What you sell deserves to be",
  "home.final.b": "paid for",
  "home.final.sub":
    "Join the sellers getting paid with MonCash on Zabelie.",
  "home.final.cta": "Create my shop",

  // Catalog
  "catalog.title": "Catalog",
  "catalog.results": "result(s)",
  "catalog.for": "for",
  "catalog.search.ph": "Search for a product…",
  "catalog.search.btn": "Search",
  "catalog.none": "No results.",
  "catalog.reset": "Reset",
  "catalog.more": "See more",

  // Product
  "product.back": "← Back to catalog",
  "product.kind.file": "Digital file",
  "product.kind.service": "Service",
  "product.kind.physical": "Physical product",
  "product.by": "by",
  "product.sales": "sales",
  "product.reviews.badge": "verified review(s)",
  "product.pay": "Pay {price} with MonCash",
  "product.pay.loading": "Redirecting to MonCash…",
  "product.pay.stripe": "Pay {usd} by card",
  "product.pay.zelle": "Pay {usd} with Zelle",
  "pay.redirect": "Redirecting…",
  "error.network": "Cannot connect. Try again.",
  "error.generic": "Something went wrong. Try again.",
  "error.provider": "Payment temporarily unavailable. Try again in a moment.",
  "pay.retry": "Retry payment",
  "pay.checkBalance": "Check your MonCash balance, then try again.",
  "common.copy": "Copy",
  "common.copied": "Copied ✓",
  "pay.other": "In the diaspora? Pay in USD:",
  "product.delivery": "Instant delivery once payment is confirmed.",
  "product.delivery.declared":
    "Delivery: {zone}, within {days} days — stated by the seller",
  "product.delivery.toAgree": "Delivery to be arranged with the seller",
  "product.secure": "✓ Secure payment, confirmed server-to-server",
  "product.file": "✓ Immediate file download",
  "product.service": "✓ Introduction after payment",
  "product.verifiedOnly": "✓ Reviews limited to verified buyers",
  "product.delivery.days": "Delivery in {days} day(s)",
  "product.includes": "What's included",
  "product.reviews": "Verified reviews",
  "product.reviews.note": "Only buyers who have paid can leave a review.",
  "product.verified": "Verified purchase ✓",
  "product.share": "on Zabelie:",
  "product.cta.bottom": "Buy now — {price} ↑",
  "coupon.have": "I have a promo code",
  "coupon.ph": "e.g. PROMO50",
  "coupon.apply": "Apply",
  "coupon.applied": "✓ −{percent}% — you pay {price}",
  "coupon.invalid": "Invalid or expired code.",

  // Payment
  "pay.ok.title": "Payment confirmed",
  "pay.ok.body":
    "Thank you! Your purchase is confirmed. Your file is available in your downloads.",
  "pay.ok.cta": "View my purchases",
  "pay.back": "Back to catalog",
  "pay.wait.title": "Payment being verified",
  "pay.wait.body":
    "We are confirming your payment with MonCash. If the amount was debited, your purchase will be confirmed automatically in a few moments — even if this page was interrupted.",
  "pay.wait.cta": "Check my purchases",
  "pay.fail.title": "Payment not confirmed",
  "pay.fail.body":
    "The payment could not be confirmed. No product was delivered. You can safely try again.",
  "pay.fail.code": "Code:",
  "pay.order": "Order",
  "order.ref": "Order number",

  // Zelle (diaspora — semi-manual flow)
  "zelle.title": "Zelle payment",
  "zelle.sub":
    "Send the exact amount from your banking app (Zelle), with the memo below. Your purchase will be confirmed once the transfer is verified — usually within 24 hours.",
  "zelle.amount": "Exact amount to send",
  "zelle.to": "Zelle recipient",
  "zelle.name": "Account name",
  "zelle.memo": "Memo to include (important)",
  "zelle.memo.why":
    "This code lets us find your transfer and confirm your purchase quickly.",
  "zelle.ref.label": "Have you sent the payment?",
  "zelle.ref.ph": "Zelle confirmation reference (optional)",
  "zelle.sent": "I have sent the payment",
  "zelle.done":
    "Thank you! We are verifying your transfer. Your file will appear under « My purchases » as soon as it is confirmed.",

  // Sharing
  "share.wa": "Share on WhatsApp",
  "share.copy": "Copy link",
  "share.copied": "Link copied ✓",

  // Phone top-up (V-11)
  "topup.title": "Phone top-up",
  "topup.sub":
    "Top up any Digicel or Natcom phone in seconds. Pay with MonCash — or by Zelle from the diaspora.",
  "topup.operator": "Carrier",
  "topup.phone.label": "Number to top up",
  "topup.phone.ph": "e.g. 37 12 34 56",
  "topup.phone2.label": "Confirm the number (type it again)",
  "topup.phone2.why":
    "A wrong number means the top-up is lost. Check every digit.",
  "topup.mismatch": "The two numbers do not match.",
  "topup.invalid": "Invalid Haitian number (8 digits, mobile 3X/4X).",
  "topup.detected": "Carrier detected",
  "topup.amount.label": "Top-up amount",
  "topup.receives": "The number receives {face} HTG",
  "topup.status.payment_pending": "Waiting for payment…",
  "topup.status.paid": "Payment received — sending the top-up…",
  "topup.status.fulfillment_pending": "Sending the top-up…",
  "topup.status.delivered": "Top-up delivered ✓",
  "topup.status.failed": "The top-up failed.",
  "topup.status.refund_pending":
    "The top-up failed after payment: a refund is being prepared to your original payment method.",
  "topup.status.refunded":
    "Refunded to your original payment method.",
  "topup.disabled":
    "The top-up service is coming soon. Check back shortly!",
  "topup.legal":
    "Zabelie is a telecom top-up reseller: payment then immediate delivery — no balance is stored on your account.",

  // Home V2 (12 sections)
  "sec.featured": "Product of the week",
  "featured.cta": "View the product →",
  "home.pay": "Pay easily with",
  "sec.cats": "Main categories",
  "sec.new": "New arrivals",
  "sec.new.sub": "The latest products published by our sellers.",
  "sec.services": "Popular services",
  "sec.services.sub": "Mentoring, design, consulting — book a service.",
  "sec.sellers": "Top sellers",
  "sec.sellers.sub": "The community's most appreciated sellers.",
  "sec.sellers.sales": "sales",
  "sec.free": "Free products",
  "sec.free.sub": "Try for free, come back for the rest.",
  "sec.free.badge": "FREE",
  "sec.promo": "On promotion",
  "sec.promo.sub": "These sellers have an active promo code — ask for it on their WhatsApp.",
  "sec.why": "Why choose Zabelie",
  "why.1.t": "Money protected",
  "why.1.b": "Every payment stays in escrow until delivery. Amounts verified in the database, never taken on trust.",
  "why.3.t": "Payment lakay",
  "why.3.b": "MonCash in gourdes, Zelle in dollars for the diaspora. Built for Haiti first.",
  "why.4.t": "Kreyòl + lightweight",
  "why.4.b": "Interface in Kreyòl, French and English, ultra-light pages for 3G and small phones.",
  "sec.faq": "Frequently asked questions",
  "faq.q1": "How do I buy a product?",
  "faq.a1": "Pick a product, tap « Pay with MonCash » and confirm on your phone. The diaspora can pay in USD via Zelle.",
  "faq.q2": "When do I receive my purchase?",
  "faq.a2":
    "It depends on the product. A file is available immediately under « My purchases », with an email containing the link. For a service, the seller contacts you after payment. A physical product is shipped by the seller.",
  "faq.q3": "How do I sell on Zabelie?",
  "faq.a3": "Create an account, publish your product in a few minutes. It's free — the platform takes 10% per sale, rounded to the nearest gourde.",
  "faq.a3.floor": "Create an account, publish your product in a few minutes. It's free — the platform takes 10% per sale. Rounding is always in your favor.",
  "faq.q4": "When does the seller get their money?",
  "faq.a4": "The net amount is credited immediately as « pending », then becomes available 7 days after the sale (fraud protection).",
  "faq.q5": "What if something goes wrong?",
  "faq.a5": "Every order is traceable and refundable to your original payment method. Disputes are reviewed one by one.",
  "footer.help": "Help",

  // Founder
  "founder.title": "A word from the founder",
  "founder.quote":
    "Opportunities are not found, they are created. Dare to act.",
  "founder.name": "Éliezer Philippe",
  "founder.role": "Founder, Zabelie",

  // Auth / sell / publish / upload / creator / card
  "auth.tab.signin": "Sign in",
  "auth.tab.signup": "Sign up",
  "auth.name.ph": "Display name",
  "auth.name.required": "A name is required.",
  "auth.name.reserved": "This name is reserved: it could be mistaken for an official Zabelie account. Please choose another.",
  "auth.err.exists": "This address already has an account. Sign in.",
  "auth.err.credentials": "Incorrect email or password.",
  "auth.err.password": "Password too short — 6 characters minimum.",
  "auth.err.notconfirmed": "Account not confirmed yet. Open the link sent by email.",
  "auth.err.rate": "Too many attempts. Wait a few minutes and try again.",
  "auth.err.disabled": "Sign-ups are closed at the moment.",
  "auth.err.email": "This email address is not valid.",
  "auth.err.network": "The connection was lost. Check your network and try again.",
  "auth.email.ph": "Email",
  "auth.password.ph": "Password",
  "auth.signin.cta": "Sign in",
  "auth.signup.cta": "Create my account",
  "auth.signup.success":
    "Account created. Check your email to confirm, then sign in.",
  "auth.demo.mode":
    "Demo mode: connect the Supabase project to enable accounts.",
  "auth.link.expired":
    "This confirmation link has expired or has already been used. Sign in, or create your account again to receive a new link.",
  "auth.back.home": "← Back to home",

  // Global error screens (app/not-found.tsx). `app/error.tsx` cannot read
  // these: it is a client component, and t() is server-only.
  "err.404.title": "This page does not exist",
  "err.404.body":
    "The link may be old, or the address may have a typo. Nothing is lost: your purchases and orders are still available from your account.",
  "err.404.home": "Go to home",
  "err.404.catalog": "View the catalog",

  "sell.title": "Sell on Zabelie",
  "sell.demo.subtitle": "Demo mode — connect Supabase to publish real products.",
  "sell.demo.body.pre": "Publishing requires a configured Supabase database (see",
  "sell.demo.body.post": ").",
  "sell.login.subtitle": "Sign in to publish a product.",
  "sell.subtitle": "Publish your product or your service.",
  "sell.mine.title": "My products",

  "publish.title.ph": "Product title",
  "publish.kind.aria": "Product type",
  "publish.category.aria": "Category",
  "publish.category.empty": "— Category —",
  "publish.price.ph": "Price (HTG)",
  "publish.description.ph": "Description",
  "publish.service.hint":
    "Service page (Fiverr style) — optional, but reassures the buyer.",
  "publish.deliveryDays.ph": "Delivery time (in days)",
  "publish.includes.ph":
    "What's included — one item per line\ne.g. 3 revisions\nSource file delivered",
  "publish.submit": "Publish the product",
  "publish.submitting": "Publishing…",
  "publish.error.generic": "Publishing failed.",
  "publish.footer.hint":
    "Uploading the deliverable file happens from the product page (next step).",
  "publish.net.youReceive": "You receive",
  "publish.net.fee": "commission",
  "publish.net.rounding": "Commission rounded to the nearest gourde.",
  "publish.net.rounding.floor": "Rounding is always in your favor.",
  "publish.net.caveat": "Estimate at full price — a promo code lowers the amount paid, so it lowers what you receive too.",

  "upload.sending": "Uploading…",
  "upload.replace": "Replace the file",
  "upload.add": "Add the file",
  "upload.saved": "File saved.",
  "upload.error": "Upload failed.",

  "creator.products.label": "product(s) online",
  "creator.share.text": "Check out {name}'s shop on Zabelie:",
  "creator.empty": "No products published yet.",

  "card.kind.file": "File",
  "card.kind.service": "Service",
  "card.kind.physical": "Physical",

  "status.draft": "Draft",
  "status.review": "Awaiting review",
  "status.review.hint": "We look at every listing before it goes live. No need to submit it again.",
  "status.published": "Published",

  // Forgot / reset password
  "auth.forgot": "Forgot your password?",
  "forgot.title": "Forgot password",
  "forgot.subtitle":
    "Enter your email and we will send you a link to create a new password.",
  "forgot.submit": "Send the link",
  "forgot.sending": "Sending…",
  "forgot.success":
    "If an account exists with this email, a reset link has just been sent. Check your inbox (and your spam folder).",
  "forgot.back": "← Back to sign in",
  "reset.title": "New password",
  "reset.subtitle": "Choose a new password for your account.",
  "reset.confirm.ph": "Confirm the password",
  "reset.mismatch": "The passwords do not match.",
  "reset.submit": "Update the password",
  "reset.submitting": "Updating…",
  "reset.success": "Password updated. You can now sign in.",
  "reset.invalid": "This link is no longer valid. Request a new one.",
} satisfies Record<I18nKey, string>;

export const DICT: Record<Lang, Record<I18nKey, string>> = { fr, ht, en };

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
