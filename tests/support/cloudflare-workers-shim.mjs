// Test-only shim for the `cloudflare:workers` built-in module, which only
// exists inside the workerd runtime. Under `node --test` the dist worker's API
// route chunks import `{ env }` from here. An empty env means the data store
// falls back to its in-memory backend and no OPENAI key is present, so the
// happy-path smoke test is deterministic and fully offline.
//
// Mutable so a test could set bindings if ever needed; left empty by default.
export const env = {};
