"use client";

import { useEffect, useState } from "react";

type Assignment = { id: string; courseId: string; courseTitle: string; status: string; readiness: number; required: boolean; dueDate: string | null; overdue: boolean };
type Credential = { courseId: string; programme: string; readiness: number; issuedAt: string; expiresAt: string; status: string; verify: string };
type Notification = { id: string; title: string; body: string; readAt: string | null; createdAt: string };

export function MyAssignments({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);
  useEffect(() => {
    fetch("/api/assignments/mine").then((response) => (response.ok ? response.json() : { assignments: [] })).then((data) => setItems(data.assignments ?? [])).catch(() => setItems([]));
    fetch("/api/notifications").then((response) => (response.ok ? response.json() : { notifications: [] })).then((data) => setNotes(data.notifications ?? [])).catch(() => {});
  }, []);
  return (
    <section className="panel">
      <div className="panel-header"><div><span className="tiny-label">Assigned to you</span><h2>My assignments</h2></div></div>
      {items === null && <p>Loading assignments…</p>}
      {items && items.length === 0 && <p>No assignments yet. Published courses still appear below once your workspace has them.</p>}
      {items && items.length > 0 && (
        <div className="table-scroll"><table><thead><tr><th>Course</th><th>Status</th><th>Readiness</th><th>Due</th><th /></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.courseTitle}</strong>{item.required ? " · required" : " · optional"}</td>
                <td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
                <td>{item.readiness}%</td>
                <td>{item.dueDate ? item.dueDate.slice(0, 10) : "—"}{item.overdue ? " · overdue" : ""}</td>
                <td><button type="button" className="text-button" onClick={() => onOpenCourse(item.courseId)}>Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {notes.filter((note) => !note.readAt).length > 0 && (
        <ul className="nudge-list">{notes.filter((note) => !note.readAt).slice(0, 4).map((note) => <li key={note.id}><strong>{note.title}</strong> {note.body}</li>)}</ul>
      )}
    </section>
  );
}

export function CredentialWallet() {
  const [items, setItems] = useState<Credential[]>([]);
  useEffect(() => {
    fetch("/api/learner/credentials").then((response) => (response.ok ? response.json() : { credentials: [] })).then((data) => setItems(data.credentials ?? [])).catch(() => {});
  }, []);
  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Credentials</span><h1>Credential wallet</h1><p>Issued readiness credentials with expiry and a verifiable stamp. Recertify by completing the course again after expiry.</p></div></div>
      {items.length === 0 ? <section className="panel"><p>No credentials yet. Complete a course assessment to issue one.</p></section> : (
        <div className="wallet-grid">
          {items.map((item) => (
            <article className="panel wallet-card" key={item.courseId}>
              <span className={`status-pill ${item.status}`}>{item.status}</span>
              <h2>{item.programme}</h2>
              <strong>{item.readiness}%</strong>
              <small>Issued {item.issuedAt.slice(0, 10)} · Expires {item.expiresAt.slice(0, 10)}</small>
              <code>verify {item.verify}</code>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountProfile() {
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/profile").then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (!data?.user) return;
      setDisplayName(data.user.displayName ?? "");
      setMfaEnabled(Boolean(data.user.mfaEnabled));
    }).catch(() => {});
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName, currentPassword: currentPassword || undefined, password: password || undefined }) });
    const data = await response.json() as { error?: string };
    setMessage(response.ok ? "Profile saved." : data.error ?? "Could not save.");
  }

  async function startMfa() {
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const data = await response.json() as { secret?: string; uri?: string };
    setSecret(data.secret ?? "");
    setUri(data.uri ?? "");
  }

  async function confirmMfa(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", code }) });
    if (response.ok) { setMfaEnabled(true); setMessage("Authenticator enabled."); }
    else setMessage("Invalid authenticator code.");
  }

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Account</span><h1>Profile &amp; security</h1><p>Update your name, password and optional authenticator app (TOTP).</p></div></div>
      <section className="panel">
        <form className="signin-form" onSubmit={saveProfile}>
          <label htmlFor="profile-name">Display name</label>
          <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <label htmlFor="profile-current">Current password</label>
          <input id="profile-current" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <label htmlFor="profile-new">New password</label>
          <input id="profile-new" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button button-primary" type="submit">Save profile</button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <section className="panel">
        <div className="panel-header"><div><span className="tiny-label">MFA</span><h2>Authenticator app</h2></div><span className={`status-pill ${mfaEnabled ? "active" : "invited"}`}>{mfaEnabled ? "Enabled" : "Off"}</span></div>
        {!mfaEnabled && !secret && <button type="button" className="button button-secondary" onClick={startMfa}>Set up TOTP</button>}
        {secret && (
          <form className="signin-form" onSubmit={confirmMfa}>
            <p>Add this secret to your authenticator app, then enter a 6-digit code.</p>
            <code>{secret}</code>
            {uri && <small>{uri}</small>}
            <label htmlFor="mfa-code">Authenticator code</label>
            <input id="mfa-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required />
            <button className="button button-primary" type="submit">Confirm MFA</button>
          </form>
        )}
      </section>
    </div>
  );
}
