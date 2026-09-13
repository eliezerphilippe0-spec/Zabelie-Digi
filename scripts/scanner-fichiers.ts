/** Private worker: node --import tsx scripts/scanner-fichiers.ts [--apply]
 * Configure existing Supabase server variables in the host's secret manager.
 * Dry run by default. Never run in the browser or an HTTP request handler. */
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { configService } from "../lib/supabase/config";
import { scanDigitalObject, type ScanVerdict } from "../lib/digital-file-security";

export function runClamav(args: string[], bytes?: Uint8Array): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("clamscan", args, { shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Scanner timeout")); }, 120_000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("Scanner unavailable")); });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      if (output.length < 32_768) output += chunk.toString();
    });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 2, output }); });
    child.stdin.on("error", () => { /* Scanner exit is handled by close. */ });
    child.stdin.end(bytes);
  });
}
export function freshEngine(version: string, now = Date.now()): boolean {
  const parts = version.trim().split("/");
  const age = now - Date.parse(parts.slice(2).join("/"));
  return parts[0]?.startsWith("ClamAV ") && parts.length >= 3 && Number.isFinite(age) && age >= 0 && age < 72 * 3600_000;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: scanner-fichiers.ts [--apply]");
  const { url, key } = configService();
  if (new URL(url).origin !== "https://ddditxykopuxxqzgkqwy.supabase.co") throw new Error("Unexpected project; no scan performed");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }) } });
  const bucket = await admin.storage.getBucket("product-files");
  if (bucket.error || bucket.data.public) throw new Error("Private bucket verification failed");
  const paths = new Set<string>();
  for (const table of ["product_assets", "zabelie_digital_releases"]) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.from(table).select(table === "product_assets" ? "storage_path" : "payload").order("id").range(offset, offset + 99);
      if (error || !data) throw new Error("File inventory unavailable");
      for (const item of data as unknown as { storage_path?: string; payload?: { files?: { storage_path: string }[] } }[]) {
        for (const path of item.storage_path ? [item.storage_path] : (item.payload?.files ?? []).map(f => f.storage_path)) {
          if (!path || path.startsWith("_security/") || path.includes("..")) throw new Error("Invalid file path");
          paths.add(path);
        }
      }
      if (data.length < 100) break;
    }
  }
  if (!args.includes("--apply")) { console.log(JSON.stringify({ mode: "dry-run", files: paths.size })); return; }
  const version = await runClamav(["--version"]);
  if (version.code !== 0 || !freshEngine(version.output)) throw new Error("Update ClamAV signatures with freshclam before scanning");
  const counts = { clean: 0, infected: 0, error: 0 };
  for (const path of paths) {
    try {
      const verdict = await scanDigitalObject(admin, path, async bytes => {
        try {
          const result = await runClamav(["--no-summary", "--stdout", "--alert-exceeds-max=yes", "--alert-encrypted=yes", "-"], bytes);
          const verdict: ScanVerdict = result.code === 0 ? "clean" : result.code === 1 ? "infected" : "error";
          return { verdict, engine: version.output.trim() };
        } catch { return { verdict: "error", engine: version.output.trim() }; }
      });
      counts[verdict]++;
    } catch { counts.error++; }
  }
  // No filenames, signed URLs, identities or secret values in logs.
  console.log(JSON.stringify({ mode: "scan", files: paths.size, ...counts }));
  if (counts.error || counts.infected) process.exitCode = 1;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scanner-fichiers.ts")) {
  main().catch(() => { console.error("File scanner failed; no security guarantee. Check configuration and ClamAV health."); process.exitCode = 1; });
}
