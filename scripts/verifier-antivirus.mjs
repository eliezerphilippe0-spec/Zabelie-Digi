import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_SUCCESS_AGE_MS = 2 * 3600_000;
export const SUCCESS_MARKER = "/var/lib/zabelie-scanner/last-success";

/** Operational heartbeat only; file safety remains enforced by private attestations.
 * @param {{service: Record<string, string>, timer: Record<string, string>, markerMtimeMs: number | null, now?: number}} input
 */
export function evaluateScannerHealth({ service, timer, markerMtimeMs, now = Date.now() }) {
  if (service.LoadState !== "loaded" || timer.LoadState !== "loaded") return { ok: false, reason: "units_missing" };
  if (timer.ActiveState !== "active" || timer.UnitFileState !== "enabled") return { ok: false, reason: "schedule_inactive" };
  if (service.Result !== "success" || !["inactive", "activating"].includes(service.ActiveState)) return { ok: false, reason: "scan_failed" };
  if (markerMtimeMs === null || !Number.isFinite(markerMtimeMs) || markerMtimeMs <= 0) return { ok: false, reason: "no_success" };
  const age = now - markerMtimeMs;
  if (!Number.isFinite(age) || age < 0) return { ok: false, reason: "clock_invalid" };
  if (age >= MAX_SUCCESS_AGE_MS) return { ok: false, reason: "success_stale" };
  return { ok: true, reason: service.ActiveState === "activating" ? "scan_running_recent_success" : "recent_success" };
}

/** Never queries or prints unit environment, credentials, file names or raw errors. */
export function checkScannerHealth() {
  try {
    const readUnit = (unit) => Object.fromEntries(execFileSync("systemctl", [
      "show", unit, "--no-pager", "--property=LoadState,ActiveState,UnitFileState,Result",
    ], { encoding: "utf8", timeout: 5000, maxBuffer: 16_384, stdio: ["ignore", "pipe", "pipe"] })
      .trim().split(/\r?\n/).filter(line => line.includes("=")).map(line => {
        const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
      }));
    const service = readUnit("zabelie-scanner.service");
    const timer = readUnit("zabelie-scanner.timer");
    let markerMtimeMs = null;
    try {
      const stat = lstatSync(SUCCESS_MARKER);
      if (stat.isFile() && !stat.isSymbolicLink()) markerMtimeMs = stat.mtimeMs;
    } catch { /* Absent, unreadable or irregular markers are never healthy. */ }
    const verdict = evaluateScannerHealth({ service, timer, markerMtimeMs });
    return { ...verdict, lastSuccessAt: markerMtimeMs === null ? null : new Date(markerMtimeMs).toISOString() };
  } catch { return { ok: false, reason: "health_unavailable", lastSuccessAt: null }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = process.argv.length === 2 ? checkScannerHealth() : { ok: false, reason: "unexpected_arguments" };
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
