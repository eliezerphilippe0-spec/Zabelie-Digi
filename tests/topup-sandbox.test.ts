import test from "node:test";
import assert from "node:assert/strict";
import { getTopupProvider, isTopupEnabled } from "../lib/zabelie-topup/fulfill";

test("paid top-ups never use Sandbox, an absent mode or an unknown mode", () => {
  const names = ["RELOADLY_MODE", "RELOADLY_CLIENT_ID", "RELOADLY_CLIENT_SECRET", "ZABELIE_TOPUP_FIRSTPARTY_ENABLED"] as const;
  const original = Object.fromEntries(names.map(key => [key, process.env[key]]));
  try {
    process.env.RELOADLY_CLIENT_ID = "test-client";
    process.env.RELOADLY_CLIENT_SECRET = "test-secret";
    process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED = "true";
    for (const mode of ["sandbox", "", "live", "Production"]) {
      process.env.RELOADLY_MODE = mode;
      assert.equal(isTopupEnabled(), false, mode);
      assert.equal(getTopupProvider(), null, mode);
    }
    delete process.env.RELOADLY_MODE;
    assert.equal(getTopupProvider(), null);
    process.env.RELOADLY_MODE = "production";
    assert.equal(isTopupEnabled(), true);
    assert.equal(getTopupProvider()?.name, "reloadly");
    // Closing new sales must not prevent servicing orders already paid.
    delete process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED;
    assert.equal(getTopupProvider()?.name, "reloadly");
    delete process.env.RELOADLY_CLIENT_SECRET;
    assert.equal(getTopupProvider(), null);
  } finally {
    for (const key of names) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
