import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// Custom domains attached to the deployed Worker (Cloudflare "Custom Domain"
// routes). Applied only at build time so local dev is unaffected. Override
// with DEPLOY_HOSTS="a.com,www.a.com" if the target domains change.
const DEPLOY_HOSTS = (process.env.DEPLOY_HOSTS ?? "amygdalalishay.com,www.amygdalalishay.com")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const deployRoutes = DEPLOY_HOSTS.map((pattern) => ({ pattern, custom_domain: true }));

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Deploy-time bindings come from env so account-specific resources aren't
  // hardcoded. Unset bindings are omitted, so a first deploy stays clean and
  // real resources are enabled by setting the corresponding env var:
  //   DEPLOY_R2_BUCKET  -> R2 bucket for source uploads (binding SOURCES)
  //   DEPLOY_D1_ID/_NAME-> D1 database (binding DB)
  //   DEPLOY_IMAGES=1   -> Cloudflare Images binding (IMAGES) for optimisation
  const r2Bucket = process.env.DEPLOY_R2_BUCKET;
  const d1Id = process.env.DEPLOY_D1_ID;
  const withImages = process.env.DEPLOY_IMAGES === "1";
  const workerConfig = command === "build"
    ? {
        ...localBindingConfig,
        routes: deployRoutes,
        r2_buckets: r2Bucket ? [{ binding: "SOURCES", bucket_name: r2Bucket }] : [],
        d1_databases: d1Id ? [{ binding: "DB", database_name: process.env.DEPLOY_D1_NAME || "amygdala-db", database_id: d1Id }] : [],
        ...(withImages ? { images: { binding: "IMAGES" } } : {}),
      }
    : localBindingConfig;
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: workerConfig,
      }),
    ],
  };
});
