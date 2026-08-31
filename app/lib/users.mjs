// Shared account-lifecycle helpers used by user/auth routes.

import { hashPassword } from "./auth.mjs";
import { platformRoleCapabilities, roleTiers } from "./security.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ACCOUNT_STATUSES = ["active", "invited", "suspended", "deactivated"];

export function normaliseEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return EMAIL_RE.test(normaliseEmail(email));
}

export function passwordPolicyError(password) {
  const value = String(password ?? "");
  if (value.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Password must include a letter and a number.";
  return null;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    organisationId: user.organisationId,
    role: user.role,
    status: user.status ?? "active",
    mfaEnabled: Boolean(user.mfaEnabled),
    createdAt: user.createdAt ?? null,
  };
}

export async function assignableRoles(store, organisationId) {
  const custom = store?.listCustomRoles ? await store.listCustomRoles(organisationId) : [];
  return [...roleTiers, "Vendor Administrator", "Customer Learner", ...custom.map((role) => role.name)];
}

export function isKnownRole(role, extra = []) {
  return Boolean(platformRoleCapabilities[role]) || extra.includes(role);
}

export async function randomCredential() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const password = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashPassword(password);
}

export async function writeAudit(store, principal, { eventType, entityType, entityId, detail }) {
  if (!store?.recordAudit || !principal) return;
  await store.recordAudit({
    organisationId: principal.organisationId,
    actor: principal.displayName ?? principal.email,
    role: principal.role,
    eventType,
    entityType,
    entityId,
    detail: detail ?? "",
  });
}
