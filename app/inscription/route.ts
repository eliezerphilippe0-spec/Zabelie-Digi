import { NextResponse } from "next/server";
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
  return NextResponse.redirect(destination);
}
