#!/usr/bin/env bash
# Integration test for disposable GitHub-hosted Linux runners only.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_OS:-}" == "Linux" ]]
[[ -d /run/systemd/system ]]
# setup-node installs in the hosted tool cache; provision the documented host path.
node22=$(command -v node)
[[ "$("$node22" -p 'process.versions.node.split(".")[0]')" == "22" ]]
if [[ ! -e /usr/bin/node ]]; then sudo ln -s "$node22" /usr/bin/node; fi
[[ "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == "22" ]]
[[ ! -e /opt/zabelie-scanner && ! -e /etc/zabelie-scanner && ! -e /var/lib/zabelie-scanner ]]
if id zabelie-scanner >/dev/null 2>&1; then exit 1; fi
for unit in zabelie-scanner.service zabelie-scanner-inventory.service zabelie-scanner.timer; do
  [[ ! -e "/etc/systemd/system/$unit" ]]
done
sudo useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin zabelie-scanner
sudo install -d -m 0755 /opt/zabelie-scanner/scripts /opt/zabelie-scanner/node_modules/tsx
sudo install -d -m 0700 /etc/zabelie-scanner
# The fake worker never imports the real scanner or contacts Supabase.
sudo tee /opt/zabelie-scanner/node_modules/tsx/package.json >/dev/null <<'JSON'
{"name":"tsx","version":"0.0.0","exports":"./stub.cjs"}
JSON
sudo touch /opt/zabelie-scanner/node_modules/tsx/stub.cjs
sudo tee /opt/zabelie-scanner/scripts/scanner-fichiers.ts >/dev/null <<'JS'
const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.notEqual(process.getuid(), 0);
assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, 'ci-dummy-value');
assert.throws(() => fs.readFileSync('/etc/zabelie-scanner/scanner.env'));
assert.throws(() => fs.writeFileSync('/opt/zabelie-scanner/forbidden', 'x'));
if (process.argv.length === 2) {
  console.log(JSON.stringify({ mode: 'dry-run', files: 0 }));
} else {
  assert.deepEqual(process.argv.slice(2), ['--apply']);
  const countPath = '/var/lib/zabelie-scanner/ci-count';
  const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
  fs.writeFileSync(countPath, String(count + 1));
  const modePath = '/var/lib/zabelie-scanner/ci-mode';
  if (fs.existsSync(modePath) && fs.readFileSync(modePath, 'utf8').trim() === 'fail') process.exitCode = 1;
  // Keep the unit running long enough to request a concurrent start.
  setTimeout(() => console.log(JSON.stringify({ mode: 'scan', files: 0 })), 1500);
}
JS
sudo tee /etc/zabelie-scanner/scanner.env >/dev/null <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://example.invalid
SUPABASE_SERVICE_ROLE_KEY=ci-dummy-value
ENV
sudo chmod 0600 /etc/zabelie-scanner/scanner.env
sudo install -m 0644 ops/antivirus/zabelie-scanner.service ops/antivirus/zabelie-scanner-inventory.service ops/antivirus/zabelie-scanner.timer /etc/systemd/system/
# Prevent the real calendar schedule from adding a scan during this fixture.
sudo install -d /etc/systemd/system/zabelie-scanner.timer.d
sudo tee /etc/systemd/system/zabelie-scanner.timer.d/ci.conf >/dev/null <<'UNIT'
[Timer]
OnCalendar=
OnActiveSec=30min
UNIT
cleanup() {
  if [[ "$?" -ne 0 ]]; then
    sudo journalctl -u zabelie-scanner.service -u zabelie-scanner-inventory.service -n 35 --no-pager || true
  fi
  sudo systemctl disable --now zabelie-scanner.timer >/dev/null 2>&1 || true
  sudo systemctl stop zabelie-scanner.service zabelie-scanner-inventory.service >/dev/null 2>&1 || true
}
trap cleanup EXIT
sudo systemd-analyze verify --man=no /etc/systemd/system/zabelie-scanner.service /etc/systemd/system/zabelie-scanner-inventory.service /etc/systemd/system/zabelie-scanner.timer
sudo systemctl daemon-reload
sudo systemctl start zabelie-scanner-inventory.service
sudo test ! -e /var/lib/zabelie-scanner/last-success
sudo systemctl start zabelie-scanner.service
sudo test -f /var/lib/zabelie-scanner/last-success
health() { sudo /usr/bin/node "$PWD/scripts/verifier-antivirus.mjs"; }
if health; then echo 'Disabled timer accepted as healthy'; exit 1; fi
sudo systemctl enable --now zabelie-scanner.timer
health
before=$(sudo stat -c %Y /var/lib/zabelie-scanner/last-success)
echo fail | sudo tee /var/lib/zabelie-scanner/ci-mode >/dev/null
sleep 1
if sudo systemctl start zabelie-scanner.service; then echo 'Failure accepted'; exit 1; fi
[[ "$(sudo stat -c %Y /var/lib/zabelie-scanner/last-success)" == "$before" ]]
if health; then echo 'Failed scan accepted as healthy'; exit 1; fi
echo clean | sudo tee /var/lib/zabelie-scanner/ci-mode >/dev/null
count=$(sudo cat /var/lib/zabelie-scanner/ci-count)
sudo systemctl start --no-block zabelie-scanner.service
sleep 0.2
sudo systemctl start zabelie-scanner.service
[[ "$(sudo cat /var/lib/zabelie-scanner/ci-count)" == "$((count + 1))" ]]
health
sudo touch -d '3 hours ago' /var/lib/zabelie-scanner/last-success
if health; then echo 'Stale scan accepted as healthy'; exit 1; fi
sudo systemctl start zabelie-scanner.service
health
sudo systemctl disable --now zabelie-scanner.timer
if health; then echo 'Stopped schedule accepted as healthy'; exit 1; fi
echo 'Scanner service integration passed: isolation, credentials, inventory, success, failure, no overlap, stale heartbeat, stopped timer.'
