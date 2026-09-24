import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/** Execute the real route with explicit I/O doubles; no network or database writes. */
export function loadRoute(file: string, overrides: Record<string, unknown>) {
  const source = readFileSync(file, "utf8");
  const stubs: Record<string, unknown> = Object.fromEntries(
    [...source.matchAll(/from\s+"([^"]+)"/g)].map(m => [m[1], {}]),
  );
  Object.assign(stubs, {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/i18n-server": { getLang: async () => "fr" },
    "@/lib/i18n": { t: (_lang: string, key: string) => key },
  }, overrides);
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  vm.runInNewContext(code, {
    module: routeModule, exports: routeModule.exports, console, process: { env: {} },
    URL, Response, AbortController, setTimeout, clearTimeout,
    require(name: string) {
      if (name in stubs) return stubs[name];
      throw new Error("Unexpected dependency " + name);
    },
  }, { filename: file });
  return routeModule.exports as Record<string, (...args: unknown[]) => Promise<Response>>;
}

export type Query = { table: string; steps: [string, unknown[]][] };
/** Awaitable PostgREST double recording query shape and writes. */
export function database(resolve: (query: Query) => unknown) {
  const queries: Query[] = [];
  return {
    queries,
    from(table: string) {
      const query: Query = { table, steps: [] };
      queries.push(query);
      const chain: unknown = new Proxy({}, {
        get(_target, method: string) {
          if (method === "then") return (yes: (value: unknown) => unknown, no: (error: unknown) => unknown) =>
            Promise.resolve().then(() => resolve(query)).then(yes, no);
          return (...args: unknown[]) => { query.steps.push([method, args]); return chain; };
        },
      });
      return chain;
    },
  };
}
