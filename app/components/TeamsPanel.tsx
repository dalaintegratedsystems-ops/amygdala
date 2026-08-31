"use client";

import { useEffect, useState } from "react";

type UserRow = { userId: string; email: string; displayName: string; role: string; status: string };
type Cohort = { id: string; name: string; description: string; autoEnrolRole: string; memberIds?: string[]; memberCount?: number };
type Course = { id: string; title: string; status: string };
type Assignment = { id: string; targetType: string; targetId: string; courseId: string; dueDate: string | null; required: number; note: string };
type Snapshot = {
  counts: { learners: number; assignments: number; cohorts: number; completed: number; overdue: number; atRisk: number; gaps: number; avgReadiness: number };
  rows: Array<{ userId: string; displayName: string; email: string; role: string; courseTitle: string; status: string; readiness: number; overdue: boolean }>;
  atRisk: Array<{ userId: string; displayName: string; courseTitle: string; status: string; readiness: number }>;
  gaps: Array<{ userId: string; displayName: string; courseTitle: string }>;
};

export function TeamsPanel({ mode = "teams" }: { mode?: "teams" | "manager" }) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [name, setName] = useState("");
  const [autoRole, setAutoRole] = useState("");
  const [assign, setAssign] = useState({ targetType: "cohort", targetId: "", courseId: "", dueDate: "", required: true });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function reload() {
    const [cohortRes, assignRes, managerRes] = await Promise.all([
      fetch("/api/cohorts"),
      fetch("/api/assignments"),
      fetch("/api/manager"),
    ]);
    if (cohortRes.ok) {
      const data = await cohortRes.json() as { cohorts: Cohort[]; users: UserRow[] };
      setCohorts(data.cohorts ?? []);
      setUsers(data.users ?? []);
    }
    if (assignRes.ok) {
      const data = await assignRes.json() as { assignments: Assignment[]; courses: Course[] };
      setAssignments(data.assignments ?? []);
      setCourses(data.courses ?? []);
    }
    if (managerRes.ok) setSnapshot(await managerRes.json() as Snapshot);
  }

  useEffect(() => { reload().catch(() => {}); }, []);

  async function createCohort(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/cohorts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, autoEnrolRole: autoRole }) });
      setName(""); setAutoRole("");
      await reload();
    } finally { setBusy(false); }
  }

  async function createAssignment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(assign) });
      await reload();
    } finally { setBusy(false); }
  }

  async function nudge(userId: string, courseTitle: string) {
    setBusy(true);
    try {
      await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, title: "Training reminder", body: `Please complete “${courseTitle}”.` }) });
      setNotice("Nudge sent (in-app; email only if a provider is configured).");
    } finally { setBusy(false); }
  }

  if (mode === "manager") {
    const counts = snapshot?.counts;
    return (
      <div className="page-content">
        <div className="page-heading">
          <div><span className="eyebrow">Manager</span><h1>Cohort readiness</h1><p>Completion, at-risk learners and required-training gaps for this workspace.</p></div>
          <a className="button button-secondary" href="/api/manager/export">Export CSV</a>
        </div>
        <div className="metric-grid">
          <article className="metric-card"><span className="metric-label">Avg readiness</span><strong>{counts?.avgReadiness ?? 0}%</strong></article>
          <article className="metric-card"><span className="metric-label">Completed</span><strong>{counts?.completed ?? 0}</strong></article>
          <article className="metric-card"><span className="metric-label">At risk</span><strong>{counts?.atRisk ?? 0}</strong></article>
          <article className="metric-card"><span className="metric-label">Gaps</span><strong>{counts?.gaps ?? 0}</strong></article>
        </div>
        {notice && <p className="invite-banner" role="status">{notice}</p>}
        <section className="panel table-panel">
          <div className="panel-header"><div><span className="tiny-label">At risk</span><h2>Overdue or below 60%</h2></div></div>
          <div className="table-scroll"><table><thead><tr><th>Learner</th><th>Course</th><th>Status</th><th>Readiness</th><th /></tr></thead>
            <tbody>
              {(snapshot?.atRisk ?? []).map((row, index) => (
                <tr key={`${row.userId}-${index}`}><td>{row.displayName}</td><td>{row.courseTitle}</td><td>{row.status}</td><td>{row.readiness}%</td>
                  <td><button type="button" className="text-button" disabled={busy} onClick={() => nudge(row.userId, row.courseTitle)}>Nudge</button></td></tr>
              ))}
              {(snapshot?.atRisk ?? []).length === 0 && <tr><td colSpan={5}>No at-risk learners right now.</td></tr>}
            </tbody>
          </table></div>
        </section>
        <section className="panel table-panel">
          <div className="panel-header"><div><span className="tiny-label">All assignments</span><h2>Workspace progress</h2></div></div>
          <div className="table-scroll"><table><thead><tr><th>Learner</th><th>Course</th><th>Status</th><th>Readiness</th></tr></thead>
            <tbody>{(snapshot?.rows ?? []).map((row, index) => <tr key={`${row.userId}-${row.courseTitle}-${index}`}><td>{row.displayName}</td><td>{row.courseTitle}</td><td>{row.status}</td><td>{row.readiness}%</td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    );
  }

  const assignTargets: Array<{ id: string; label: string }> = assign.targetType === "user"
    ? users.map((user) => ({ id: user.userId, label: user.displayName }))
    : assign.targetType === "cohort"
      ? cohorts.map((cohort) => ({ id: cohort.id, label: cohort.name }))
      : ["Learner", "Author", "Reviewer", "Training Manager"].map((role) => ({ id: role, label: role }));

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Teams</span><h1>Cohorts &amp; assignments</h1><p>Group learners, auto-enrol by role, and assign courses with a due date.</p></div></div>

      <section className="panel">
        <form className="people-form" onSubmit={createCohort}>
          <label>Cohort name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Auto-enrol role<input value={autoRole} onChange={(event) => setAutoRole(event.target.value)} placeholder="Learner (optional)" /></label>
          <button className="button button-primary" disabled={busy} type="submit">Create cohort</button>
        </form>
        <div className="table-scroll" style={{ marginTop: 16 }}><table><thead><tr><th>Cohort</th><th>Auto-enrol</th><th>Members</th></tr></thead>
          <tbody>{cohorts.map((cohort) => <tr key={cohort.id}><td><strong>{cohort.name}</strong></td><td>{cohort.autoEnrolRole || "—"}</td><td>{cohort.memberCount ?? 0}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="tiny-label">Assign</span><h2>Course assignment</h2></div></div>
        <form className="people-form" onSubmit={createAssignment}>
          <label>Target
            <select value={assign.targetType} onChange={(event) => setAssign({ ...assign, targetType: event.target.value, targetId: "" })}>
              <option value="cohort">Cohort</option>
              <option value="user">User</option>
              <option value="role">Role</option>
            </select>
          </label>
          <label>Who
            <select value={assign.targetId} onChange={(event) => setAssign({ ...assign, targetId: event.target.value })} required>
              <option value="">Select…</option>
              {assignTargets.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label>Course
            <select value={assign.courseId} onChange={(event) => setAssign({ ...assign, courseId: event.target.value })} required>
              <option value="">Select…</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <label>Due<input type="date" value={assign.dueDate} onChange={(event) => setAssign({ ...assign, dueDate: event.target.value })} /></label>
          <label className="inline-check"><input type="checkbox" checked={assign.required} onChange={(event) => setAssign({ ...assign, required: event.target.checked })} /> Required</label>
          <button className="button button-primary" disabled={busy} type="submit">Assign</button>
        </form>
        <div className="table-scroll" style={{ marginTop: 16 }}><table><thead><tr><th>Course</th><th>Target</th><th>Due</th><th>Required</th></tr></thead>
          <tbody>{assignments.map((item) => <tr key={item.id}><td>{courses.find((course) => course.id === item.courseId)?.title ?? item.courseId}</td><td>{item.targetType}: {item.targetId}</td><td>{item.dueDate ?? "—"}</td><td>{item.required ? "Yes" : "Optional"}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
