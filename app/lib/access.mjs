// Route-facing authorization that understands per-workspace CUSTOM roles.
//
// `auth.mjs` stays deliberately store-free (its unit tests import it directly as
// source, and the store pulls in the D1 schema). This thin wrapper adds the one
// thing routes need beyond the built-in tiers: if a principal's role is not a
// built-in tier, its capabilities are loaded from the workspace's custom roles
// and fed into the same `authorize` decision. Built-in roles skip the store.

import { resolveRequestIdentity } from "./auth.mjs";
import { authorize, platformRoleCapabilities, resolveCapabilities } from "./security.mjs";
import { getStore } from "./store.mjs";

// Server-side authorization for a request: verified identity -> capability +
// tenant-isolation decision, with custom-role resolution. Never trusts
// client-declared role/tenant.
export async function authorizeRequest(request, action, env = {}, resourceOrganisationId) {
  const principal = await resolveRequestIdentity(request, env);
  if (!principal) return { allowed: false, reason: "no-session", principal: null };

  let capabilities;
  if (!platformRoleCapabilities[principal.role]) {
    // Custom role — resolve its capabilities from the tenant's stored roles.
    try {
      const store = getStore(env);
      const customRoles = await store.listCustomRoles(principal.organisationId);
      capabilities = resolveCapabilities(principal.role, customRoles);
    } catch {
      capabilities = [];
    }
  }

  const decision = authorize({ role: principal.role, action, actorOrganisationId: principal.organisationId, resourceOrganisationId, capabilities });
  return { ...decision, principal };
}
