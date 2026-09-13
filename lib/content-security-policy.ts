/** One unpredictable nonce per response; only the proxy supplies it. */
export function contentSecurityPolicy(nonce: string, development = false, backendUrl?: string): string {
  if (!/^[A-Za-z0-9+/=_-]{20,}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  let backend = "";
  if (backendUrl) {
    const url = new URL(backendUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Unsafe backend origin");
    backend = " " + url.origin + " " + url.origin.replace(/^http/, "ws");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // React uses style attributes for previews and theme controls. Scripts remain strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${backend}${development ? " http://127.0.0.1:* http://localhost:* ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "media-src 'self' blob: https://*.supabase.co",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
