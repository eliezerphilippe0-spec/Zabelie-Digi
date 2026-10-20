import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

/** Alias uniquement : le formulaire et les consentements restent dans /connexion. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const destination = new URL("/connexion", url);
  destination.searchParams.set("mode", "signup");
  if (url.searchParams.has("next")) {
    destination.searchParams.set("next", safeNext(url.searchParams.get("next")));
  }
  // Une destination relative conserve l'origine du navigateur, même si Next
  // normalise l'hôte de req.url (127.0.0.1 → localhost dans le harnais Auth).
  return new Response(null, {
    status: 307,
    headers: { Location: destination.pathname + destination.search },
  });
}
