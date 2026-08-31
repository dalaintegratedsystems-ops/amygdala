"use client";

import { useEffect, useState } from "react";

type UserRow = { userId: string; email: string; displayName: string; role: string; status: string; mfaEnabled: boolean };
type PreviewRow = { line: number; email: string; displayName: string; role: string; status: string; ok: boolean; errors: string[] };
type InviteResult = { inviteUrl?: string | null; user?: UserRow };

export function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [form, setForm] = useState({ email: "", displayName: "", role: "Learner" });
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ counts: { total: number; valid: number; errors: number }; rows: PreviewRow[] } | null>(null);

  async function reload(q = query) {
    const response = await fetch(`/api/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (!response.ok) return;
    const data = await response.json() as { users: UserRow[]; roles: string[] };
    setUsers(data.users ?? []);
    setRoles(data.roles ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/users").then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (!active || !data) return;
      setUsers(data.users ?? []);
      setRoles(data.roles ?? []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setInviteUrl("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, invite: true }) });
      const data = await response.json() as InviteResult & { error?: string };
      if (!response.ok) { setError(data.error ?? "Could not create user."); return; }
      setInviteUrl(data.inviteUrl ?? "");
      setForm({ email: "", displayName: "", role: "Learner" });
      await reload();
    } finally { setBusy(false); }
  }

  async function patchUser(userId: string, patch: Record<string, string>) {
    setBusy(true);
    try {
      await fetch("/api/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, ...patch }) });
      await reload();
    } finally { setBusy(false); }
  }

  async function runImport(dryRun: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/users/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv, dryRun }) });
      const data = await response.json() as { error?: string; preview?: { counts: { total: number; valid: number; errors: number }; rows: PreviewRow[] } };
      if (!response.ok) { setError(data.error ?? "Import failed."); return; }
      setPreview(data.preview ?? null);
      if (!dryRun) await reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div><span className="eyebrow">People</span><h1>User management</h1><p>Create, invite, search and change account status. Invite links are shown here until an email provider is connected.</p></div>
      </div>

      <section className="panel people-create">
        <form className="people-form" onSubmit={createUser}>
          <label>Name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {roles.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <button className="button button-primary" disabled={busy} type="submit">Invite user</button>
        </form>
        {error && <p className="signin-error" role="alert">{error}</p>}
        {inviteUrl && (
          <div className="invite-banner" role="status">
            <strong>Invite link (no email provider configured)</strong>
            <code>{inviteUrl}</code>
            <button type="button" className="button button-small button-ghost" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button>
          </div>
        )}
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div><span className="tiny-label">Directory</span><h2>{users.length} people</h2></div>
          <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); reload(event.target.value).catch(() => {}); }} placeholder="Search name, email, role" /></label>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th /></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td><strong>{user.displayName}</strong></td>
                  <td>{user.email}</td>
                  <td>
                    <select aria-label={`Role for ${user.displayName}`} value={user.role} onChange={(event) => patchUser(user.userId, { role: event.target.value })}>
                      {roles.map((role) => <option key={role}>{role}</option>)}
                    </select>
                  </td>
                  <td><span className={`status-pill ${user.status}`}>{user.status}</span></td>
                  <td>{user.mfaEnabled ? "On" : "—"}</td>
                  <td className="row-actions">
                    {user.status !== "active" && <button type="button" className="text-button" onClick={() => patchUser(user.userId, { status: "active" })}>Activate</button>}
                    {user.status === "active" && <button type="button" className="text-button" onClick={() => patchUser(user.userId, { status: "suspended" })}>Suspend</button>}
                    {user.status !== "deactivated" && <button type="button" className="text-button" onClick={() => patchUser(user.userId, { status: "deactivated" })}>Deactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="tiny-label">Provisioning</span><h2>Bulk CSV import</h2></div></div>
        <p>Columns: <code>email</code>, <code>displayName</code>, optional <code>role</code> and <code>status</code>. Dry-run first, then commit.</p>
        <textarea className="csv-input" value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} placeholder={"email,displayName,role\nada@example.com,Ada Lovelace,Learner"} />
        <div className="page-actions">
          <button type="button" className="button button-secondary" disabled={busy || !csv.trim()} onClick={() => runImport(true)}>Dry-run preview</button>
          <button type="button" className="button button-primary" disabled={busy || !preview || preview.counts.valid === 0} onClick={() => runImport(false)}>Commit import</button>
        </div>
        {preview && (
          <div className="import-preview">
            <p>{preview.counts.valid} valid · {preview.counts.errors} errors · {preview.counts.total} rows</p>
            <div className="table-scroll"><table><thead><tr><th>Line</th><th>Email</th><th>Name</th><th>Role</th><th>Result</th></tr></thead>
              <tbody>{preview.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.email}</td><td>{row.displayName}</td><td>{row.role}</td><td>{row.ok ? "OK" : row.errors.join(", ")}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}
      </section>
    </div>
  );
}
