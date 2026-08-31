// Bulk user CSV: parse → validate → dry-run preview. No network, no deps.

import { roleTiers, platformRoleCapabilities } from "./security.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = new Set(["active", "invited", "suspended", "deactivated"]);

export function parseCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === "\"" && input[i + 1] === "\"") { cell += "\""; i += 1; }
      else if (char === "\"") inQuotes = false;
      else cell += char;
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const records = rows.slice(1).map((values, index) => {
    const record = { line: index + 2 };
    headers.forEach((header, i) => { record[header] = values[i] ?? ""; });
    return record;
  });
  return { headers, records };
}

export function allowedImportRoles(customRoles = []) {
  return new Set([...roleTiers, "Vendor Administrator", "Customer Learner", ...customRoles.map((role) => role.name)]);
}

export function validateUserRows(records, { existingEmails = [], customRoles = [], defaultRole = "Learner" } = {}) {
  const known = new Set([...existingEmails].map((email) => String(email).trim().toLowerCase()));
  const roles = allowedImportRoles(customRoles);
  const seen = new Set();
  const rows = [];
  for (const record of records) {
    const email = String(record.email ?? "").trim().toLowerCase();
    const displayName = String(record.displayname ?? record.display_name ?? record.name ?? "").trim();
    const role = String(record.role ?? defaultRole).trim() || defaultRole;
    const status = String(record.status ?? "invited").trim().toLowerCase() || "invited";
    const errors = [];
    if (!email || !EMAIL_RE.test(email)) errors.push("invalid-email");
    if (!displayName) errors.push("missing-name");
    if (!roles.has(role) && !platformRoleCapabilities[role]) errors.push("unknown-role");
    if (!STATUSES.has(status)) errors.push("unknown-status");
    if (email && known.has(email)) errors.push("duplicate-existing");
    if (email && seen.has(email)) errors.push("duplicate-in-file");
    if (email) seen.add(email);
    rows.push({ line: record.line, email, displayName, role, status, errors, ok: errors.length === 0 });
  }
  return rows;
}

export function previewImport(text, options = {}) {
  const { headers, records } = parseCsv(text);
  if (!headers.includes("email")) {
    return { headers, rows: [], counts: { total: 0, valid: 0, errors: records.length || 0 }, error: "A header row with an 'email' column is required." };
  }
  const rows = validateUserRows(records, options);
  return {
    headers,
    rows,
    counts: {
      total: rows.length,
      valid: rows.filter((row) => row.ok).length,
      errors: rows.filter((row) => !row.ok).length,
    },
  };
}
