// Assignment engine: expand a user/cohort/role target, layer auto-enrolment,
// and derive per-assignment status from learner_progress.

export function isOverdue(dueDate, now = Date.now()) {
  if (!dueDate) return false;
  const due = Date.parse(dueDate);
  return Number.isFinite(due) && due < now;
}

export function assignmentStatus(assignment, progress, now = Date.now()) {
  const readiness = Number(progress?.readiness ?? 0);
  const completed = progress?.status === "ready" || readiness >= 80;
  if (completed) return { status: "completed", readiness, overdue: false };
  const overdue = isOverdue(assignment?.dueDate, now);
  if (progress && (progress.learningScore || progress.simulationScore || progress.assessmentScore)) {
    return { status: overdue ? "overdue" : "in-progress", readiness, overdue };
  }
  return { status: overdue ? "overdue" : "not-started", readiness: 0, overdue };
}

// Explicit members plus anyone whose role matches the cohort's autoEnrolRole.
export function resolveCohortMemberIds(cohort, { members = [], users = [] } = {}) {
  const ids = new Set(members);
  if (cohort?.autoEnrolRole) {
    for (const user of users) {
      if (user.role === cohort.autoEnrolRole && user.status !== "deactivated") ids.add(user.userId);
    }
  }
  return [...ids];
}

export function assignmentAppliesToUser(assignment, { user, cohortIds = [] } = {}) {
  if (!assignment || !user) return false;
  if (assignment.targetType === "user") return assignment.targetId === user.userId;
  if (assignment.targetType === "role") return assignment.targetId === user.role;
  if (assignment.targetType === "cohort") return cohortIds.includes(assignment.targetId);
  return false;
}

/**
 * @param {{ userId: string, role: string }} user
 * @param {Array<Record<string, any>>} assignments
 * @param {{ cohortIds?: string[] }} [options]
 */
export function assignmentsForUser(user, assignments, { cohortIds = [] } = {}) {
  return (assignments ?? []).filter((assignment) => assignmentAppliesToUser(assignment, { user, cohortIds }));
}

/**
 * @param {Record<string, any>} assignment
 * @param {{ course?: { title?: string }, progress?: Record<string, any>, now?: number }} [options]
 */
export function decorateAssignment(assignment, { course, progress, now = Date.now() } = {}) {
  const derived = assignmentStatus(assignment, progress, now);
  return {
    ...assignment,
    required: Number(assignment.required) !== 0,
    courseTitle: course?.title ?? assignment.courseId,
    ...derived,
  };
}

// Effective cohort ids for a user: explicit membership + auto-enrol by role.
export function effectiveCohortIds(user, cohorts = [], explicitIds = []) {
  const ids = new Set(explicitIds);
  for (const cohort of cohorts) {
    if (cohort.autoEnrolRole && cohort.autoEnrolRole === user.role) ids.add(cohort.id);
  }
  return [...ids];
}

// Build a manager-scoped readiness snapshot from users + assignments + progress.
export function managerSnapshot({ users = [], assignments = [], progress = [], courses = [], cohorts = [], memberships = {}, now = Date.now() } = {}) {
  const progressByKey = new Map(progress.map((entry) => [`${entry.userId}:${entry.courseId}`, entry]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const learners = users.filter((user) => user.status !== "deactivated");
  const rows = [];
  for (const user of learners) {
    const cohortIds = effectiveCohortIds(user, cohorts, memberships[user.userId] ?? []);
    const userAssignments = assignmentsForUser(user, assignments, { cohortIds });
    for (const assignment of userAssignments) {
      const entry = progressByKey.get(`${user.userId}:${assignment.courseId}`);
      const derived = assignmentStatus(assignment, entry, now);
      rows.push({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        courseId: assignment.courseId,
        courseTitle: courseById.get(assignment.courseId)?.title ?? assignment.courseId,
        required: Number(assignment.required) !== 0,
        dueDate: assignment.dueDate ?? null,
        ...derived,
      });
    }
  }
  const completed = rows.filter((row) => row.status === "completed").length;
  const overdue = rows.filter((row) => row.overdue && row.status !== "completed");
  const atRisk = rows.filter((row) => row.status !== "completed" && (row.overdue || (row.readiness > 0 && row.readiness < 60)));
  const gaps = rows.filter((row) => row.required && row.status !== "completed");
  const readinessValues = rows.map((row) => row.readiness);
  const avgReadiness = readinessValues.length ? Math.round(readinessValues.reduce((sum, value) => sum + value, 0) / readinessValues.length) : 0;
  return {
    counts: {
      learners: learners.length,
      assignments: assignments.length,
      cohorts: cohorts.length,
      completed,
      overdue: overdue.length,
      atRisk: atRisk.length,
      gaps: gaps.length,
      avgReadiness,
    },
    rows,
    atRisk,
    gaps,
  };
}

export function managerReportCsv(rows) {
  const columns = ["displayName", "email", "role", "courseTitle", "status", "readiness", "required", "dueDate", "overdue"];
  const header = columns.join(",");
  const cell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = rows.map((row) => columns.map((column) => cell(row[column])).join(","));
  return `${[header, ...body].join("\n")}\n`;
}
