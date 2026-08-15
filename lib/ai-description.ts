import type { Lang } from "@/lib/i18n";

/**
 * Aide à la rédaction des descriptions produit — la première brique LLM du
 * dépôt (décision porteur 2026-08-14 : fournisseurs OpenAI et Google, pas
 * Claude).
 *
 * PATRON MAISON — DORMANT DERRIÈRE LA CLÉ : aucune clé posée → aucun
 * fournisseur → le bouton n'existe pas et rien n'est jamais appelé, zéro
 * dépense. Le porteur allume le service en posant UNE variable d'environnement
 * dans Vercel (avec un plafond de dépense côté console du fournisseur) :
 *
 *   - `OPENAI_API_KEY`  → fournisseur OpenAI  (modèle : `OPENAI_MODEL`,
 *     défaut `gpt-4o-mini`) ;
 *   - `GEMINI_API_KEY`  → fournisseur Google  (modèle : `GEMINI_MODEL`,
 *     défaut `gemini-3.7-flash`).
 *
 * ⚠️ Google RETIRE ses modèles vite — mesuré en production le 2026-08-15 :
 * le défaut initial `gemini-2.5-flash` rendait 404 sur une clé neuve (arrêt
 * annoncé au 2026-10-16, déjà indisponible aux nouveaux projets). Quand ce
 * 404 revient, la sortie sans code est `GEMINI_MODEL` ; le vrai correctif
 * est de remonter ce défaut vers le modèle flash courant.
 *
 * Si les deux sont posées, OpenAI gagne — un ordre écrit vaut mieux qu'un
 * hasard, et le porteur choisit en ne posant qu'une clé.
 *
 * ADAPTATEUR, PAS SDK : deux appels HTTPS nus vers deux API REST stables,
 * comme `lib/zabelie-topup` parle à Reloadly. Zéro dépendance npm ajoutée —
 * chaque dépendance de ce dépôt se justifie, et un POST JSON n'en justifie
 * pas une.
 *
 * GARDE-FOUS MÉTIER (non négociables, encodés dans la consigne système) :
 *   - la suggestion n'INVENTE rien : pas de caractéristiques, dimensions,
 *     matières ou garanties absentes de ce que le vendeur a fourni ;
 *   - aucune promesse de livraison, de délai, ni de paiement à la livraison
 *     (Zabelie n'en fait pas) — le paiement est confirmé AVANT ;
 *   - aucun prix, aucune remise, aucun « meilleur prix » : les paramètres
 *     commerciaux ne sortent jamais d'un modèle de langage ;
 *   - texte brut, deux courts paragraphes, dans la langue du vendeur
 *     (allongé le 2026-08-15 sur retour porteur : « trop courte » — le
 *     développement passe par les angles honnêtes, usage/public/entretien,
 *     jamais par des caractéristiques inventées).
 *
 * Et le principe au-dessus de tout : c'est une SUGGESTION. Le vendeur la
 * relit, la corrige, et reste l'auteur de sa fiche — rien n'est jamais
 * publié automatiquement.
 */

export type AiProvider = "openai" | "gemini";

export type AiDescriptionInput = {
  /** Titre saisi par le vendeur — la seule matière obligatoire. */
  title: string;
  /** Libellé de catégorie (humain, pas un slug), facultatif. */
  category?: string;
  /**
   * Faits fournis par le vendeur (matière, tailles, couleurs, état…),
   * texte libre facultatif. C'est LA voie du détail : la consigne interdit
   * d'inventer, donc tout ce qui doit figurer de précis passe par ici.
   */
  keywords?: string;
  /** Langue de génération = langue de session du vendeur. */
  lang: Lang;
};

/** Bornes d'entrée — au-delà on tronque, on ne refuse pas. */
export const AI_TITLE_MAX = 140;
export const AI_CATEGORY_MAX = 80;
export const AI_KEYWORDS_MAX = 300;
/** Borne de sortie : une description n'est pas une page de vente. */
export const AI_DESCRIPTION_MAX = 1800;

/**
 * Le fournisseur actif, ou `null` si le service est éteint. C'est LA source
 * de vérité du kill-switch : les pages vendeur l'interrogent pour afficher
 * (ou pas) le bouton, la route l'interroge pour répondre 503.
 */
export function aiProviderDisponible(): AiProvider | null {
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return null;
}

const LANGUE: Record<Lang, string> = {
  fr: "français",
  ht: "kreyòl ayisyen",
  en: "anglais",
  es: "espagnol",
};

/**
 * La consigne système — exportée pour être ÉPROUVABLE : les garde-fous
 * métier ci-dessus sont des assertions de test, pas des intentions.
 */
export function consigneSysteme(lang: Lang): string {
  return [
    "Tu rédiges des descriptions de produits pour Zabelie, un marketplace haïtien.",
    `Écris en ${LANGUE[lang]}, en deux courts paragraphes (6 à 9 phrases en tout), en texte brut (aucun markdown, aucune liste, aucun émoji).`,
    // « Développer sans inventer » : les angles autorisés sont ceux qu'un
    // titre honnête permet d'affirmer — l'usage, le public, l'entretien —
    // jamais une caractéristique précise que le vendeur n'a pas fournie.
    "Développe ce que le titre et la catégorie permettent d'affirmer : à quoi sert le produit, à qui il convient, dans quelles occasions on l'utilise, comment en prendre soin.",
    "N'invente aucune caractéristique précise : ni dimension, ni matière, ni marque, ni garantie que le vendeur n'a pas fournies.",
    "Si le vendeur fournit des faits (matière, tailles, couleurs, état…), intègre-les tous fidèlement, sans les modifier ni en ajouter d'autres.",
    "Ne promets jamais de livraison, de délai, ni de paiement à la livraison.",
    "Ne mentionne jamais de prix, de remise ni de promotion.",
    "Ton chaleureux et honnête, adressé à un acheteur en Haïti ou dans la diaspora.",
  ].join(" ");
}

function messageVendeur(input: AiDescriptionInput): string {
  const titre = input.title.trim().slice(0, AI_TITLE_MAX);
  const categorie = input.category?.trim().slice(0, AI_CATEGORY_MAX);
  const faits = input.keywords?.trim().slice(0, AI_KEYWORDS_MAX);
  return [
    `Titre du produit : ${titre}`,
    categorie ? `Catégorie : ${categorie}` : null,
    faits ? `Faits fournis par le vendeur : ${faits}` : null,
    "Rédige la description.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Nettoyage de sortie commun aux deux fournisseurs. */
function borner(texte: string): string {
  const propre = texte.trim();
  if (!propre) throw new Error("ai: réponse vide");
  return propre.slice(0, AI_DESCRIPTION_MAX);
}

const TIMEOUT_MS = 20_000;

/**
 * Génère une suggestion de description. Jette sur tout échec (clé absente,
 * HTTP non-2xx, réponse vide) — l'appelant décide du code de réponse ; ce
 * module ne connaît ni Next ni la session.
 *
 * `fetcher` est injectable pour les tests — jamais un appel réseau réel dans
 * la suite.
 */
export async function genererDescription(
  input: AiDescriptionInput,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const fournisseur = aiProviderDisponible();
  if (!fournisseur) throw new Error("ai: aucun fournisseur configuré");
  if (fournisseur === "openai") return viaOpenAI(input, fetcher);
  return viaGemini(input, fetcher);
}

async function viaOpenAI(
  input: AiDescriptionInput,
  fetcher: typeof fetch
): Promise<string> {
  const res = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      messages: [
        { role: "system", content: consigneSysteme(input.lang) },
        { role: "user", content: messageVendeur(input) },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ai: openai ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return borner(data.choices?.[0]?.message?.content ?? "");
}

async function viaGemini(
  input: AiDescriptionInput,
  fetcher: typeof fetch
): Promise<string> {
  const modele = process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash";
  const res = await fetcher(
    // Clé en EN-TÊTE, jamais en query string — une URL se retrouve dans les
    // journaux d'accès, un en-tête non.
    `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: consigneSysteme(input.lang) }] },
        contents: [{ role: "user", parts: [{ text: messageVendeur(input) }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`ai: gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texte = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return borner(texte);
}
