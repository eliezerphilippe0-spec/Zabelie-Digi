import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FlashCountdown } from "../components/flash-countdown";
import { loadRoute } from "./helpers/route-harness";

test("le premier HTML du compte à rebours reste identique malgré deux horloges différentes", t => {
  let now = Date.parse("2026-10-20T12:00:00Z");
  t.mock.method(Date, "now", () => now);
  const props = { fin: "2026-10-20T12:01:00Z", prefix: "Se termine dans" };
  const server = renderToString(createElement(FlashCountdown, props));
  now += 7000;
  const hydration = renderToString(createElement(FlashCountdown, props));
  assert.equal(hydration, server, "un décalage d'horloge ne doit pas changer le premier HTML hydraté");
  now += 120000;
  assert.equal(renderToString(createElement(FlashCountdown, props)), server, "une expiration pendant le chargement garde aussi le premier HTML déterministe");
});

type Props = { fin: string; prefix: string };
type Node = { props: { children?: unknown } };
const text = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" ? text((value as Node).props.children) : "";
};

/** Le vrai TSX reçoit seulement des doubles de l'abonnement React et du
 * minuteur système. Les lectures et notifications restent celles du composant. */
function clock() {
  let now = Date.parse("2026-10-20T12:00:00Z");
  let server = true;
  let serial = 0;
  let notifications = 0;
  const timers = new Map<number, () => void>();
  let subscribe!: (listener: () => void) => () => void;
  const component = loadRoute("components/flash-countdown.tsx", {
    react: {
      useSyncExternalStore(sub: typeof subscribe, getSnapshot: () => unknown, getServerSnapshot: () => unknown) {
        subscribe = sub;
        return server ? getServerSnapshot() : getSnapshot();
      },
    },
    "react/jsx-runtime": { jsx: (_type: unknown, props: Node["props"]) => ({ props }), jsxs: (_type: unknown, props: Node["props"]) => ({ props }) },
  }, {}, {
    Date: { now: () => now, parse: Date.parse },
    setInterval: (tick: () => void, delay: number) => { assert.equal(delay, 1000); timers.set(++serial, tick); return serial; },
    clearInterval: (id: number) => { assert.ok(timers.delete(id), "seul un intervalle actif peut être nettoyé"); },
  }) as unknown as { FlashCountdown: (props: Props) => Node | null };
  const props = { fin: "2026-10-20T13:01:01Z", prefix: "Se termine dans" };
  return {
    render(next = props) { const node = component.FlashCountdown(next); return node === null ? null : text(node); },
    mount() { server = false; return subscribe(() => { notifications++; }); },
    advance(ms: number, notify = true) { now += ms; if (notify) [...timers.values()].forEach(tick => tick()); },
    get timers() { return timers.size; },
    get notifications() { return notifications; },
  };
}

test("le compteur utilise le snapshot notifié, recalcule sa durée et disparaît à expiration", () => {
  const c = clock();
  assert.equal(c.render(), null);
  const stop = c.mount();
  assert.equal(c.render(), "Se termine dans 1:01:01");
  c.advance(2000, false);
  assert.equal(c.render(), "Se termine dans 1:01:01", "une nouvelle lecture garde le snapshot en cache entre notifications");
  c.advance(0);
  assert.equal(c.render(), "Se termine dans 1:00:59");
  const fin = { fin: "2026-10-20T12:00:05Z", prefix: "Ends in" };
  assert.equal(c.render(fin), "Ends in 0:03", "une autre échéance utilise immédiatement le même instantané");
  c.advance(3000);
  assert.equal(c.render(fin), null);
  stop();
  assert.equal(c.timers, 0);
});

test("plusieurs compteurs partagent le minuteur et le dernier démontage le nettoie", () => {
  const c = clock();
  c.render();
  const stopA = c.mount();
  const stopB = c.mount();
  assert.equal(c.timers, 1);
  const before = c.notifications;
  c.advance(1000);
  assert.equal(c.notifications - before, 2);
  stopA();
  assert.equal(c.timers, 1, "le second compteur reste abonné");
  stopB();
  assert.equal(c.timers, 0);
  assert.equal(c.render(), null, "aucun ancien instantané ne survit au dernier démontage");
  const restart = c.mount();
  assert.equal(c.timers, 1, "un remontage, comme sous StrictMode, rétablit un seul intervalle");
  assert.equal(c.render(), "Se termine dans 1:01:00");
  restart();
  assert.equal(c.timers, 0);
});
