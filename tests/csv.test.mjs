import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, previewImport, validateUserRows } from "../app/lib/csv.mjs";

test("CSV parser handles quoted commas and header mapping", () => {
  const { headers, records } = parseCsv('email,displayName,role\n"ada@x.com","Ada, Lovelace",Learner\n');
  assert.deepEqual(headers, ["email", "displayname", "role"]);
  assert.equal(records[0].email, "ada@x.com");
  assert.equal(records[0].displayname, "Ada, Lovelace");
});

test("validateUserRows flags bad email, missing name, unknown role, and duplicates", () => {
  const rows = validateUserRows([
    { line: 2, email: "ada@x.com", displayname: "Ada", role: "Learner" },
    { line: 3, email: "not-an-email", displayname: "Bad", role: "Learner" },
    { line: 4, email: "ada@x.com", displayname: "Ada 2", role: "Learner" },
    { line: 5, email: "sam@x.com", displayname: "", role: "Wizard" },
  ], { existingEmails: ["sam@x.com"] });
  assert.equal(rows[0].ok, true);
  assert.ok(rows[1].errors.includes("invalid-email"));
  assert.ok(rows[2].errors.includes("duplicate-in-file"));
  assert.ok(rows[3].errors.includes("missing-name"));
  assert.ok(rows[3].errors.includes("unknown-role"));
  assert.ok(rows[3].errors.includes("duplicate-existing"));
});

test("previewImport requires an email header and reports counts", () => {
  const missing = previewImport("name,role\nAda,Learner\n");
  assert.match(missing.error, /email/);
  const ok = previewImport("email,displayName\nada@x.com,Ada\n");
  assert.equal(ok.counts.valid, 1);
  assert.equal(ok.counts.errors, 0);
});
