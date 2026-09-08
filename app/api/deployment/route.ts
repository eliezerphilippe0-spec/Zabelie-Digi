import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Lecture publique : uniquement une empreinte de livraison, aucune donnée utilisateur. */
export function GET() {
  const release = process.env.ZABELIE_RELEASE_ID ?? "";
  const valid = /^[a-f0-9]{64}$/.test(release);
  return NextResponse.json(
    valid ? { release } : { release: null },
    { status: valid ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
