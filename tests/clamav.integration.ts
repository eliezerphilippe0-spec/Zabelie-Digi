import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClamav } from "../scripts/scanner-fichiers";

test("Real ClamAV recognizes a synthetic signature and accepts harmless bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zabelie-av-test-"));
  const database = join(directory, "synthetic.ndb");
  const marker = "ZABELIE_SCANNER_SYNTHETIC_TEST_2026";
  // Local synthetic signature only: no malware and no production file is used.
  await writeFile(database, "Zabelie.Synthetic.Test:0:*:" + Buffer.from(marker).toString("hex") + "\n");
  try {
    const args = ["--database=" + database, "--no-summary", "--stdout", "--alert-exceeds-max=yes", "--alert-encrypted=yes", "-"];
    const clean = await runClamav(args, Buffer.from("A harmless marketplace document."));
    const detected = await runClamav(args, Buffer.from("prefix " + marker + " suffix"));
    assert.equal(clean.code, 0, clean.output);
    assert.equal(detected.code, 1, detected.output);
    assert.match(detected.output, /FOUND/);
  } finally { await unlink(database); await rmdir(directory); }
});
