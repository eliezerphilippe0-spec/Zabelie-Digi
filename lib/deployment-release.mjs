import { createHash } from "node:crypto";

/** Identifiant public de livraison, sans exposer la configuration ni les versions logicielles. */
export function releaseIdForCommit(commit) {
  return typeof commit === "string" && /^[a-f0-9]{40}$/i.test(commit)
    ? createHash("sha256").update(commit.toLowerCase()).digest("hex")
    : "";
}
