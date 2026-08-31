// SSO / SCIM / domain-signup seam. Persists config and group→role mapping.
// Activation needs an external IdP — endpoints never pretend to be live.

import { platformRoleCapabilities } from "./security.mjs";

export const PROVISIONING_REQUIRES = "An identity provider (OIDC/SAML + SCIM 2.0) must be connected. In-app config and endpoints are ready; they stay inactive until an IdP issues assertions / SCIM tokens.";

export function describeProvisioningSeam(config = {}) {
  return {
    live: false,
    ssoEnabled: Boolean(config.ssoEnabled),
    scimEnabled: Boolean(config.scimEnabled),
    requires: "idp",
    message: PROVISIONING_REQUIRES,
    allowedDomains: config.allowedDomains ?? [],
    groupRoleMap: config.groupRoleMap ?? {},
    defaultRole: config.defaultRole ?? "Learner",
  };
}

export function domainOf(email) {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at >= 0 ? value.slice(at + 1) : "";
}

export function domainAllowed(email, allowedDomains = []) {
  const domains = (allowedDomains ?? []).map((domain) => String(domain).trim().toLowerCase()).filter(Boolean);
  if (!domains.length) return false;
  const domain = domainOf(email);
  return Boolean(domain) && domains.includes(domain);
}

export function mapGroupToRole(groups, config = {}) {
  const map = config.groupRoleMap ?? {};
  const list = Array.isArray(groups) ? groups : [groups];
  for (const group of list) {
    const mapped = map[group];
    if (mapped && (platformRoleCapabilities[mapped] || mapped === config.defaultRole)) return mapped;
    if (mapped) return mapped;
  }
  return config.defaultRole ?? "Learner";
}

export function scimNotLive(extra = {}) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: "501",
    detail: PROVISIONING_REQUIRES,
    seam: true,
    requires: "idp",
    ...extra,
  };
}

export function ssoNotLive(extra = {}) {
  return { error: "SSO is not live.", seam: true, requires: "idp", message: PROVISIONING_REQUIRES, ...extra };
}
