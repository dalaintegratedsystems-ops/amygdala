// Module-resolution hook (used via node:module `register`) that maps the
// `cloudflare:workers` built-in to a local shim so the built worker can be
// imported and exercised under `node --test` without the workerd runtime.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: new URL("./cloudflare-workers-shim.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
