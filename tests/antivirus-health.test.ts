import test from "node:test";
import assert from "node:assert/strict";
import { evaluateScannerHealth, MAX_SUCCESS_AGE_MS } from "../scripts/verifier-antivirus.mjs";

const now = Date.parse("2026-09-15T12:00:00Z");
const service = { LoadState: "loaded", ActiveState: "inactive", Result: "success" };
const timer = { LoadState: "loaded", ActiveState: "active", UnitFileState: "enabled" };
const healthy = { service, timer, markerMtimeMs: now - 1000, now };

test("scanner heartbeat accepts recent complete success, including a subsequent running scan", () => {
  assert.equal(evaluateScannerHealth(healthy).ok, true);
  assert.equal(evaluateScannerHealth({ ...healthy, service: { ...service, ActiveState: "activating" } }).ok, true);
});
test("scanner heartbeat refuses failed or interrupted runs despite a fresh success marker", () => {
  for (const result of ["exit-code", "timeout", "signal", "oom-kill", ""]) {
    assert.equal(evaluateScannerHealth({ ...healthy, service: { ...service, Result: result } }).ok, false);
  }
  assert.equal(evaluateScannerHealth({ ...healthy, service: { ...service, ActiveState: "failed" } }).ok, false);
});
test("scanner heartbeat refuses absent, stale, future or invalid success evidence", () => {
  for (const markerMtimeMs of [null, 0, NaN, Infinity, now + 1, now - MAX_SUCCESS_AGE_MS, now - MAX_SUCCESS_AGE_MS - 1]) {
    assert.equal(evaluateScannerHealth({ ...healthy, markerMtimeMs }).ok, false);
  }
});
test("scanner heartbeat requires an installed scanner and a persistent active schedule", () => {
  for (const fields of [{ LoadState: "not-found" }, { ActiveState: "inactive" }, { UnitFileState: "disabled" }, { UnitFileState: "enabled-runtime" }]) {
    assert.equal(evaluateScannerHealth({ ...healthy, timer: { ...timer, ...fields } }).ok, false);
  }
  assert.equal(evaluateScannerHealth({ ...healthy, service: {} }).ok, false);
});
