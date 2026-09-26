import { llmsTxt } from "@/lib/llms";
import { siteUrl } from "@/lib/site-url";

/** `/llms.txt` : résumé du site pour les assistants IA (voir lib/llms.ts). */
export function GET() {
  return new Response(llmsTxt(siteUrl()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
