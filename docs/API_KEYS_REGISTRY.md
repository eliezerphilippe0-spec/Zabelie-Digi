# Zabelie Digi — Registre des Intégrations & Clés API

> Document de référence. Aucune clé réelle n'apparaît ici — seulement les noms
> de variables d'environnement à créer et leur statut. Voir aussi `OPS_TODO.md`
> (actions opérationnelles) et `docs/11-SECRETS.md` (politique de gestion des
> secrets).

Dernière mise à jour : 13 juillet 2026 — revue technique + recherche externe.

---

## ⚠️ Règle de sécurité (rappel permanent)

- Jamais de clé API en dur dans le code, ni côté client ni côté serveur.
- Toujours via variables d'environnement : `.env.local` en développement,
  Vercel Environment Variables en Preview/Production.
- `.env*` doit rester dans `.gitignore` — ne jamais commit une clé, même en test.
- Séparer strictement les clés Preview et Production dans Vercel (déjà ta
  convention pour Reloadly).
- Toute clé exposée par erreur (log, capture d'écran, repo, message WhatsApp)
  doit être **révoquée et régénérée immédiatement**, pas juste supprimée du code.
- Les clés `NEXT_PUBLIC_*` sont visibles côté navigateur par design — jamais
  autre chose qu'un ID public (measurement ID, pixel ID), jamais un secret.

---

## Paiements internationaux (question ouverte, pas bloquante pour le lancement)

| Option | Statut | Détail |
|---|---|---|
| Stripe | ❌ Écarté | Exige une entité US, incompatible avec une société enregistrée en Haïti |
| PayPal | ❌ Écarté | Haïti explicitement exclu des pays business/payout supportés |
| **Paddle** (Merchant of Record) | ❌ **Écarté** — vérifié 2026-07-13 | Haïti n'apparaît pas dans les pays vendeurs supportés (plusieurs sources concordantes ; page officielle non accessible directement à la vérification — signal fort, pas une confirmation écrite). **Ne pas contacter, effort à ne pas dépenser.** |
| **Lemon Squeezy** (MoR) | 🔍 Incertain, à contacter | Page officielle des pays supportés non accessible à la vérification. Signal indirect défavorable : le paiement vendeur passe par PayPal ou virement bancaire dans un pays supporté — Haïti étant exclu de PayPal, le risque d'exclusion est réel. **Contacter en priorité** pour confirmation écrite. |
| **FastSpring** (MoR) | 🔍 Incertain, à contacter | Paiement direct limité à US/UK/UE/Canada/Australie ; portail de payout élargi mais liste exacte non confirmée. **Contacter en second.** |
| MonCash / Zelle | ✅ En production | Rails déjà livrés — Zelle couvre déjà une grande partie du cas d'usage diaspora (achat USD depuis les États-Unis) |
| US LLC + Stripe/PayPal | ⏸ Option de repli | À envisager seulement si aucun MoR ne confirme le support Haïti — implique entité + compte bancaire US + comptabilité transfrontalière |

**Note stratégique** — Chariow (la référence explicite de ce projet,
`docs/06-ANALYSE-CHARIOW.md`) ne s'appuie sur aucun de ces trois MoR : elle
est bâtie mobile-money-first pour des marchés sous-bancarisés, exactement le
choix déjà fait ici (MonCash + Zelle). Les MoR généralistes (Paddle, Lemon
Squeezy, FastSpring) servent surtout une base vendeurs US/UE. **Ce chantier
est une extension du marché international, pas un prérequis de lancement** —
ne pas le laisser retarder le vrai bloquant actuel (Reloadly).

Si un MoR confirme le support Haïti : l'architecture envisagée (**Zabelie
Digi = vendeur unique de référence auprès du MoR, ledger interne inchangé**)
est la bonne — elle reproduit exactement le modèle déjà en place pour
MonCash (un seul compte marchand, redistribution interne via wallet/escrow).
Aucun changement de schéma nécessaire pour l'évaluer.

---

## Phase 0 — À lancer immédiatement (délai externe incompressible)

| Service | Variables d'env (placeholders) | Pourquoi maintenant |
|---|---|---|
| WhatsApp Business API (Meta Cloud API) | `WHATSAPP_BUSINESS_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Vérification Meta Business Manager = 1 à 3 semaines. Lancer la demande maintenant, coder la logique métier plus tard |

> ⚠️ **Réserve honnête** : WhatsApp Business API facture par conversation
> (hors fenêtre de service gratuite de 24 h) et l'onboarding Meta est plus
> lourd que Twilio ou une simple Cloud API basique. Avant de lancer la
> vérification, vérifie que le cas d'usage (relances, confirmations) justifie
> ce coût dès maintenant — sans lien Reloadly débloqué ni premiers clients
> réels, l'urgence est plus faible que « démarrer un délai externe » ne le
> suggère. Le partage de lien (déjà construit, boutons WhatsApp sur chaque
> produit/boutique) ne nécessite PAS cette API — il fonctionne déjà.

---

## Phase 1 — Avant lancement (effort faible, impact direct)

| Service | Variables d'env (placeholders) | Usage |
|---|---|---|
| Google Analytics 4 | `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Suivi des visiteurs |
| Google Tag Manager | `NEXT_PUBLIC_GTM_ID` | Gestion centralisée des balises |
| Google Search Console | — (vérification par domaine, pas de clé classique) | SEO et indexation |
| Meta Business (Pixel + Conversions API) | `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN` | Acquisition Facebook/Instagram, ciblage diaspora |
| TikTok Business | `TIKTOK_PIXEL_CODE` | Acquisition TikTok, audience jeune Haïti |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TURNSTILE_SITE_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY` | CDN, sécurité, anti-bot (complète les velocity limits déjà en place) |
| ~~Brevo~~ | ~~`BREVO_API_KEY`~~ | **❌ Retiré — redondant.** Resend est déjà pleinement intégré (`lib/zabelie-email.ts`, `RESEND_API_KEY`) et déjà branché sur les e-mails transactionnels réels (livraison acheteur, notification vendeur). Ajouter Brevo créerait exactement le doublon de provider à éviter. |

---

## Phase 2 — Après les 100 premiers clients

| Service | Variables d'env (placeholders) | Usage |
|---|---|---|
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion sociale |
| Facebook Login | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Connexion sociale |
| OneSignal | `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` | Notifications push |
| Claude API (Anthropic) | `ANTHROPIC_API_KEY` | Génération de fiches produit, support client |
| WhatsApp — logique métier | *(compte créé en Phase 0)* | Relances panier abandonné, confirmations de commande, support |

> ℹ️ **Correction** : la mention « cohérent avec l'écosystème Claude Code /
> Zabelie OS déjà en place » a été retirée — aucun « Zabelie OS » n'existe
> dans ce projet (vérifié : absent de `CLAUDE.md` et de tous les `docs/`).
> L'usage de Claude API reste pertinent en soi (génération de contenu,
> support), juste sans cette référence non fondée.

---

## Phase 3 — Croissance

| Service | Variables d'env (placeholders) | Usage |
|---|---|---|
| Programme d'affiliation | Interne (table Supabase + cookies) recommandé plutôt que Rewardful/Tolt/Tapfiliate | Suivi des commissions, cohérent avec le système de coupons/points déjà en place |
| Trustpilot | `TRUSTPILOT_API_KEY` | Avis clients, confiance — **note** : le système d'avis vérifiés (achat confirmé requis) est déjà construit en interne ; Trustpilot serait un canal de confiance externe additionnel, pas un remplacement |
| Recherche marketplace | `ALGOLIA_APP_ID` / `ALGOLIA_ADMIN_KEY`, ou Meilisearch self-hosted | Recherche facettée quand le catalogue dépasse ce que Postgres gère confortablement |
| CDN images | `CLOUDINARY_API_KEY` | Seulement si Supabase Storage devient insuffisant |
| FX rates | `EXCHANGE_RATE_API_KEY` | Taux HTG/USD/CAD vivant plutôt que taux figé manuellement (`USD_HTG_RATE`) |

---

## Actions immédiates (mises à jour)

1. Décider si la vérification Meta Business Manager (WhatsApp) démarre
   maintenant ou après le déblocage Reloadly — voir la réserve en Phase 0.
2. **Contacter Lemon Squeezy et FastSpring** pour confirmation écrite du
   support vendeur Haïti + méthode de payout fonctionnelle. **Ne pas
   contacter Paddle** (exclusion quasi confirmée par la recherche).
3. Poser les scripts Meta Pixel / TikTok Pixel / GA4 / GTM (Phase 1,
   ~0,5 jour chacun) — utile mais sans urgence tant qu'il n'y a pas de
   trafic public à mesurer.
4. ~~Vérifier si un provider transactionnel tourne déjà~~ **Fait : Resend
   est en place. Brevo est retiré du plan.**
