import test from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";

type Element = { type: unknown; props: Record<string, unknown> };
type User = { id: string };
type Failure = "returned" | "thrown";
const A = { id: "account-A-existing" };
const B = { id: "account-B-recovery" };
const TOKENS = { access_token: "synthetic-access-B", refresh_token: "synthetic-refresh-B" };
const labels = {
  title: "Nouveau mot de passe", subtitle: "Choisir le mot de passe", passwordPh: "Mot de passe",
  confirmPh: "Confirmer", mismatch: "Mots de passe différents", submit: "Enregistrer", submitting: "En cours",
  success: "Mot de passe modifié", invalid: "Lien invalide", signinCta: "Connexion", errorGeneric: "Service indisponible",
  passwordLeaked: "Mot de passe divulgué",
};
const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function find(tree: unknown, predicate: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  if (!tree || typeof tree !== "object") return undefined;
  const node = tree as Element;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (typeof tree === "string") return tree;
  if (!tree || typeof tree !== "object") return "";
  return text((tree as Element).props?.children);
}

/** Run the real TSX, with persistent hook slots and explicit Auth I/O doubles.
 * Tokens never leave this test process; the writer has its own session state. */
function reset(options: {
  search?: string; hash?: string; currentUser?: User | null;
  exchangeFailure?: Failure; fragmentFailure?: Failure; verificationFailure?: Failure;
  verifiedUser?: User; deferExchange?: boolean;
  switchAfterCurrentCheck?: boolean; writerUser?: User; writerFailure?: boolean;
  leaked?: boolean | null;
} = {}) {
  const slots: unknown[] = [];
  let cursor = 0;
  const effects: Array<() => unknown> = [];
  const cleanups: Array<() => void> = [];
  const events: string[] = [];
  const writes: Array<{ userId: string; password: string }> = [];
  let currentUser: User | null = options.currentUser === undefined ? A : options.currentUser;
  let releaseExchange!: () => void;
  const exchangeGate = options.deferExchange ? new Promise<void>(resolve => { releaseExchange = resolve; }) : Promise.resolve();
  const session = { ...TOKENS, user: B };
  const fail = (kind: Failure | undefined) => {
    if (kind === "thrown") throw new Error("synthetic Auth outage");
    return kind === "returned" ? { message: "synthetic invalid recovery" } : null;
  };
  const recover = async (kind: Failure | undefined) => {
    const error = fail(kind);
    if (error) return { data: { user: null, session: null }, error };
    currentUser = B; // The successful SDK operation persists the recovery session.
    return { data: { user: B, session }, error: null };
  };
  const processor = { auth: {
    exchangeCodeForSession: async (code: string) => {
      events.push("exchange:" + code);
      await exchangeGate;
      return recover(options.exchangeFailure);
    },
    setSession: async (tokens: typeof TOKENS) => {
      events.push("fragment");
      assert.equal(tokens.access_token, TOKENS.access_token);
      assert.equal(tokens.refresh_token, TOKENS.refresh_token);
      return recover(options.fragmentFailure);
    },
    getUser: async (token?: string) => {
      events.push("verify:" + String(token));
      assert.equal(token, TOKENS.access_token, "verify the returned token, never the ambient cookie session");
      return { data: { user: options.verifiedUser ?? B }, error: fail(options.verificationFailure) };
    },
    dispose: async () => { events.push("processor:dispose"); },
  } };
  const shared = { auth: {
    // Keep these two methods for the before-fix reproduction: the old
    // component uses the shared client for both recovery and password writes.
    exchangeCodeForSession: processor.auth.exchangeCodeForSession,
    getUser: async () => {
      events.push("current:getUser");
      const snapshot = currentUser;
      if (options.switchAfterCurrentCheck) currentUser = A;
      return { data: { user: snapshot }, error: null };
    },
    updateUser: async ({ password }: { password: string }) => {
      writes.push({ userId: currentUser?.id ?? "none", password });
      return { data: { user: currentUser }, error: null };
    },
  } };
  const timers = new Map<number, () => void>();
  let timer = 0;
  const schedule = (callback: () => void, ms: number) => {
    const id = ++timer;
    if (ms === 400) queueMicrotask(callback); // Old bounded recovery polling.
    else timers.set(id, callback);
    return id;
  };
  const browser = {
    location: new URL("https://zabelie.test/reinitialiser-mot-de-passe" + (options.search ?? "?code=valid-recovery-code") + (options.hash ?? "")),
    history: { replaceState(_state: unknown, _title: string, target: string) {
      events.push("url:clean"); browser.location = new URL(target, browser.location);
    } },
    setTimeout: schedule,
    clearTimeout: (id: number) => { timers.delete(id); },
  };
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect: () => unknown, deps: unknown[] = []) {
      const index = cursor++;
      const previous = slots[index] as unknown[] | undefined;
      if (!previous || deps.some((value, i) => value !== previous[i])) effects.push(effect);
      slots[index] = deps;
    },
  };
  const source = loadRoute("components/reset-password-form.tsx", {
    react, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({ push: () => { events.push("navigate"); } }) },
    "@/lib/mot-de-passe-divulgue": { motDePasseDivulgue: async () => { events.push("leak:check"); return options.leaked ?? false; } },
    "@/lib/supabase/client": {
      createClient: () => shared,
      createRecoveryClient: () => { events.push("processor:create"); return processor; },
      createPasswordWriter: () => {
        events.push("writer:create");
        let writerUser: User | null = null;
        return { auth: {
          setSession: async (tokens: typeof TOKENS) => {
            events.push("writer:setSession");
            assert.equal(tokens.access_token, TOKENS.access_token);
            assert.equal(tokens.refresh_token, TOKENS.refresh_token);
            writerUser = options.writerUser ?? B;
            return { data: { user: writerUser, session: { ...TOKENS, user: writerUser } }, error: null };
          },
          getUser: async () => ({ data: { user: writerUser }, error: null }),
          updateUser: async ({ password }: { password: string }) => {
            events.push("writer:updateUser");
            writes.push({ userId: writerUser?.id ?? "none", password });
            return { data: { user: writerUser }, error: options.writerFailure ? { message: "synthetic write failure" } : null };
          },
          dispose: async () => { events.push("writer:dispose"); },
        } };
      },
    },
  }, {}, { window: browser, URLSearchParams, setTimeout: schedule, clearTimeout: browser.clearTimeout }) as unknown as {
    ResetPasswordForm(props: { labels: typeof labels }): Element;
  };
  const render = () => { cursor = 0; return source.ResetPasswordForm({ labels }); };
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
  function runEffects(strict = false) {
    for (const effect of effects.splice(0)) {
      const cleanup = effect();
      if (strict) {
        if (typeof cleanup === "function") cleanup();
        const secondCleanup = effect();
        if (typeof secondCleanup === "function") cleanups.push(secondCleanup as () => void);
      } else if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
    }
  }
  return {
    events, writes, browser, render, flush,
    async mount(strict = false) { render(); runEffects(strict); await flush(); return render(); },
    begin(strict = false) { render(); runEffects(strict); },
    finishExchange() { releaseExchange(); },
    setCurrent(user: User | null) { currentUser = user; },
    unmount() { for (const cleanup of cleanups.splice(0)) cleanup(); },
    async submit(password = "Synthetic-password-123!") {
      let tree = render();
      const passwordInput = find(tree, node => node.type === "input" && node.props.placeholder === labels.passwordPh);
      const confirmInput = find(tree, node => node.type === "input" && node.props.placeholder === labels.confirmPh);
      assert.ok(passwordInput && confirmInput, "a verified recovery must expose the two password fields");
      (passwordInput.props.onChange as (event: unknown) => void)({ target: { value: password } });
      (confirmInput.props.onChange as (event: unknown) => void)({ target: { value: password } });
      tree = render();
      const form = find(tree, node => node.type === "form"); assert.ok(form);
      await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
      await flush();
      return render();
    },
  };
}

function refused(tree: Element) {
  assert.equal(find(tree, node => node.type === "form"), undefined, "an ambient session is not recovery evidence");
  assert.match(text(tree), /Lien invalide|Service indisponible/);
}

test("reset: an expired PKCE link never unlocks the password of the already connected account", async () => {
  const f = reset({ exchangeFailure: "returned", currentUser: A });
  refused(await f.mount());
  assert.equal(f.writes.length, 0);
});

test("reset: no evidence, URL errors and conflicting credentials never borrow an existing session", async () => {
  for (const input of [
    { search: "", hash: "" },
    { search: "?error=access_denied&error_code=otp_expired", hash: "" },
    { search: "?code=unused&error=access_denied", hash: "" },
    { search: "", hash: "#error=access_denied&error_code=otp_expired" },
    { search: "", hash: `#access_token=${TOKENS.access_token}&refresh_token=${TOKENS.refresh_token}&type=signup` },
    { search: "?code=unused", hash: `#access_token=${TOKENS.access_token}&refresh_token=${TOKENS.refresh_token}&type=recovery` },
  ]) {
    const f = reset({ ...input, currentUser: A });
    refused(await f.mount());
    assert.equal(f.writes.length, 0);
    assert.equal(f.events.filter(event => event.startsWith("exchange:") || event === "fragment").length, 0);
  }
});

test("reset: valid PKCE verifies its returned token and uses only the recovery identity for the write", async () => {
  const f = reset();
  const tree = await f.mount();
  assert.ok(find(tree, node => node.type === "form"));
  assert.ok(f.events.includes("verify:" + TOKENS.access_token));
  assert.equal(f.events.filter(event => event.startsWith("exchange:")).length, 1);
  assert.equal(f.events.filter(event => event === "processor:dispose").length, 1);
  assert.equal(f.browser.location.search, "");
  assert.match(text(await f.submit()), /Mot de passe modifié/);
  assert.deepEqual(f.writes, [{ userId: B.id, password: "Synthetic-password-123!" }]);
  assert.equal(f.events.filter(event => event === "writer:dispose").length, 1);
});

test("reset: a valid implicit recovery fragment is explicitly consumed and cleared", async () => {
  const f = reset({ search: "", hash: `#access_token=${TOKENS.access_token}&refresh_token=${TOKENS.refresh_token}&expires_in=3600&token_type=bearer&type=recovery` });
  assert.ok(find(await f.mount(), node => node.type === "form"));
  assert.equal(f.events.filter(event => event === "fragment").length, 1);
  assert.equal(f.events.filter(event => event.startsWith("exchange:")).length, 0);
  assert.equal(f.browser.location.hash, "");
  await f.submit();
  assert.deepEqual(f.writes.map(write => write.userId), [B.id]);
});

test("reset: identity or token verification failures are closed, including network errors", async () => {
  for (const options of [
    { exchangeFailure: "thrown" as const },
    { verificationFailure: "returned" as const },
    { verificationFailure: "thrown" as const },
    { verifiedUser: A },
  ]) {
    const f = reset(options);
    refused(await f.mount());
    assert.equal(f.writes.length, 0);
    assert.equal(f.events.filter(event => event === "processor:dispose").length, 1);
  }
});

test("reset: StrictMode cleanup and second setup consume the PKCE code only once", async () => {
  const f = reset();
  assert.ok(find(await f.mount(true), node => node.type === "form"));
  assert.equal(f.events.filter(event => event.startsWith("exchange:")).length, 1);
  assert.equal(f.events.filter(event => event === "processor:create").length, 1);
  assert.equal(f.events.filter(event => event === "processor:dispose").length, 1);
});

test("reset: changing accounts after readiness blocks the write", async () => {
  const f = reset();
  await f.mount();
  f.setCurrent(A);
  await f.submit();
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.includes("writer:create"), false);
});

test("reset: a concurrent cookie change after the check cannot redirect the password write to another account", async () => {
  const f = reset({ switchAfterCurrentCheck: true });
  await f.mount();
  await f.submit();
  assert.deepEqual(f.writes.map(write => write.userId), [B.id]);
  assert.ok(f.events.includes("writer:setSession"));
  assert.ok(f.events.includes("writer:updateUser"));
});

test("reset: a leaked password is refused before any writer exists; an impossible check lets it through", async () => {
  const f = reset({ leaked: true });
  await f.mount();
  const tree = await f.submit();
  assert.match(text(tree), /Mot de passe divulgué/);
  assert.doesNotMatch(text(tree), /Mot de passe modifié/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.filter(event => event === "writer:create").length, 0, "no writer before the leak verdict");
  assert.ok(f.events.includes("leak:check"));
  // Le formulaire reste utilisable : un second essai repasse par le contrôle.
  assert.ok(find(tree, node => node.type === "form"));

  const g = reset({ leaked: null }); // HIBP injoignable : fail-open voulu.
  await g.mount();
  assert.match(text(await g.submit()), /Mot de passe modifié/);
  assert.deepEqual(g.writes, [{ userId: B.id, password: "Synthetic-password-123!" }]);
});

test("reset: a writer identity mismatch never updates a password and still releases its client", async () => {
  const f = reset({ writerUser: A });
  await f.mount();
  await f.submit();
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.filter(event => event === "writer:dispose").length, 1);
});

test("reset: failed password writes do not show success and release the isolated writer", async () => {
  const f = reset({ writerFailure: true });
  await f.mount();
  const tree = await f.submit();
  assert.doesNotMatch(text(tree), /Mot de passe modifié/);
  assert.match(text(tree), /Service indisponible/);
  assert.equal(f.events.filter(event => event === "writer:dispose").length, 1);
});

test("reset: an unmounted pending recovery releases its processor without setting ready", async () => {
  const f = reset({ deferExchange: true });
  f.begin();
  f.unmount();
  f.finishExchange();
  await f.flush();
  assert.equal(find(f.render(), node => node.type === "form"), undefined);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.filter(event => event === "processor:dispose").length, 1);
});
