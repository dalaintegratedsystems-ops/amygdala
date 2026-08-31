// Schema-free core of the data-access layer: pure mappers, the in-memory
// store implementation, and shared constants. Kept separate from `store.mjs`
// (which imports drizzle + the D1 schema) so unit tests can import the
// in-memory store directly under `node --test` without a TypeScript loader.

export function now() {
  return new Date().toISOString();
}

export function parseArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseObject(value) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Map a persisted source row to the flat shape the domain/authoring functions
// expect (procedure/keywords as arrays).
export function rowToSource(row) {
  const knowledge = parseObject(row.knowledgeJson);
  return {
    id: row.id,
    organisationId: row.organisationId,
    title: row.title,
    description: row.description,
    product: row.product,
    module: row.module,
    intendedRole: row.intendedRole,
    contentOwner: row.contentOwner,
    type: row.type,
    version: row.version,
    status: row.status,
    approvalStatus: row.approvalStatus,
    section: row.section,
    storageKey: row.storageKey ?? null,
    extractedText: row.extractedText,
    explanation: row.explanation,
    procedure: parseArray(row.procedureJson),
    keywords: parseArray(row.keywordsJson),
    uploadDate: row.uploadDate ?? null,
    effectiveDate: row.effectiveDate ?? null,
    documentType: knowledge.documentType ?? null,
    outline: Array.isArray(knowledge.outline) ? knowledge.outline : [],
    coverage: knowledge.coverage ?? null,
    types: knowledge.types && typeof knowledge.types === "object" ? knowledge.types : null,
  };
}

// Serialise the whole-document knowledge (documentType/outline/coverage) into
// the single knowledge_json column.
export function knowledgeJsonFor(source) {
  return JSON.stringify({
    documentType: source.documentType ?? null,
    outline: Array.isArray(source.outline) ? source.outline : [],
    coverage: source.coverage ?? null,
    types: source.types && typeof source.types === "object" ? source.types : null,
  });
}

export function sourceToRow(source, timestamp) {
  return {
    id: source.id,
    organisationId: source.organisationId,
    title: source.title ?? "Untitled source",
    description: source.description ?? "",
    product: source.product ?? "",
    module: source.module ?? "",
    intendedRole: source.intendedRole ?? "All roles",
    contentOwner: source.contentOwner ?? "",
    type: source.type ?? "Document",
    version: source.version ?? "1.0",
    status: source.status ?? "Draft",
    approvalStatus: source.approvalStatus ?? "Pending",
    section: source.section ?? "",
    storageKey: source.storageKey ?? null,
    extractedText: source.extractedText ?? "",
    explanation: source.explanation ?? "",
    procedureJson: JSON.stringify(Array.isArray(source.procedure) ? source.procedure : []),
    keywordsJson: JSON.stringify(Array.isArray(source.keywords) ? source.keywords : []),
    knowledgeJson: knowledgeJsonFor(source),
    uploadDate: source.uploadDate ?? null,
    effectiveDate: source.effectiveDate ?? null,
    createdAt: source.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

// ---- simulation / learner-persistence mappers -----------------------

export function rowToSimulation(row) {
  return {
    id: row.id,
    organisationId: row.organisationId,
    title: row.title,
    description: row.description ?? "",
    mode: row.mode ?? "iframe",
    targetUrl: row.targetUrl ?? "",
    embeddable: Number(row.embeddable ?? 1) !== 0,
    bridgeEnabled: Number(row.bridgeEnabled ?? 0) !== 0,
    status: row.status ?? "Draft",
    steps: parseArray(row.stepsJson),
    screens: parseArray(row.screensJson),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export function simulationToRow(sim, timestamp) {
  return {
    id: sim.id,
    organisationId: sim.organisationId,
    title: sim.title ?? "Untitled simulation",
    description: sim.description ?? "",
    mode: sim.mode === "screenshot" ? "screenshot" : "iframe",
    targetUrl: sim.targetUrl ?? "",
    embeddable: sim.embeddable === false ? 0 : 1,
    bridgeEnabled: sim.bridgeEnabled ? 1 : 0,
    status: sim.status ?? "Draft",
    stepsJson: JSON.stringify(Array.isArray(sim.steps) ? sim.steps : []),
    screensJson: JSON.stringify(Array.isArray(sim.screens) ? sim.screens : []),
    createdAt: sim.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function progressKey(organisationId, userId, courseId) {
  return `${organisationId}:${userId}:${courseId}`;
}

// ---- In-memory implementation ---------------------------------------

export function createMemoryStore() {
  const data = {
    organisations: new Map(),
    users: new Map(),
    sources: new Map(),
    courses: new Map(),
    audit: [],
    brands: new Map(),
    simulations: new Map(),
    simOrigins: new Map(),
    learnerProgress: new Map(),
    attempts: [],
    credentials: new Map(),
    knowledgeChunks: new Map(),
    userProfiles: new Map(),
    customRoles: new Map(),
    cohorts: new Map(),
    cohortMembers: [],
    assignments: [],
    notifications: [],
    provisioning: new Map(),
  };

  return {
    backend: "memory",

    async findUserByEmail(email) {
      const normalised = String(email ?? "").trim().toLowerCase();
      for (const user of data.users.values()) {
        if (user.email.toLowerCase() === normalised) return { ...user };
      }
      return null;
    },

    async countUsers() {
      return data.users.size;
    },

    async createOrganisation(org) {
      const record = { id: org.id, name: org.name, type: org.type ?? "vendor" };
      data.organisations.set(org.id, record);
      return record;
    },

    async getOrganisation(id) {
      return data.organisations.get(id) ?? null;
    },

    async createUser(user) {
      const record = { userId: user.userId, email: String(user.email).trim().toLowerCase(), displayName: user.displayName, organisationId: user.organisationId, role: user.role, credential: { ...user.credential }, createdAt: user.createdAt ?? now() };
      data.users.set(user.userId, record);
      data.userProfiles.set(user.userId, { userId: user.userId, organisationId: user.organisationId, status: user.status ?? "active", mfaSecret: "", mfaEnabled: 0, updatedAt: record.createdAt });
      return user;
    },

    async findUserById(userId) {
      const user = data.users.get(userId);
      return user ? { ...user, credential: { ...user.credential } } : null;
    },

    async listUsers(organisationId) {
      return [...data.users.values()]
        .filter((user) => user.organisationId === organisationId)
        .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
        .map((user) => {
          const profile = data.userProfiles.get(user.userId);
          return { userId: user.userId, email: user.email, displayName: user.displayName, organisationId: user.organisationId, role: user.role, status: profile?.status ?? "active", mfaEnabled: Boolean(profile?.mfaEnabled), createdAt: user.createdAt ?? null };
        });
    },

    async updateUser(organisationId, userId, patch) {
      const user = data.users.get(userId);
      if (!user || user.organisationId !== organisationId) return null;
      if (patch.displayName !== undefined) user.displayName = patch.displayName;
      if (patch.role !== undefined) user.role = patch.role;
      data.users.set(userId, user);
      const profile = data.userProfiles.get(userId);
      return { userId, email: user.email, displayName: user.displayName, organisationId, role: user.role, status: profile?.status ?? "active", mfaEnabled: Boolean(profile?.mfaEnabled) };
    },

    async setUserPassword(userId, credential) {
      const user = data.users.get(userId);
      if (!user) return null;
      user.credential = { ...credential };
      data.users.set(userId, user);
      return { ok: true };
    },

    async getUserProfile(organisationId, userId) {
      const profile = data.userProfiles.get(userId);
      if (!profile || profile.organisationId !== organisationId) return { userId, organisationId, status: "active", mfaSecret: "", mfaEnabled: 0 };
      return { ...profile };
    },

    async upsertUserProfile(organisationId, userId, patch) {
      const existing = data.userProfiles.get(userId) ?? { userId, organisationId, status: "active", mfaSecret: "", mfaEnabled: 0 };
      const merged = {
        userId,
        organisationId,
        status: patch.status ?? existing.status ?? "active",
        mfaSecret: patch.mfaSecret !== undefined ? patch.mfaSecret : existing.mfaSecret ?? "",
        mfaEnabled: patch.mfaEnabled !== undefined ? (patch.mfaEnabled ? 1 : 0) : existing.mfaEnabled ?? 0,
        updatedAt: now(),
      };
      data.userProfiles.set(userId, merged);
      return { ...merged };
    },

    // ---- custom roles ------------------------------------------------

    async listCustomRoles(organisationId) {
      return [...data.customRoles.values()].filter((role) => role.organisationId === organisationId).sort((a, b) => a.name.localeCompare(b.name)).map((role) => ({ id: role.id, name: role.name, capabilities: [...role.capabilities] }));
    },

    async getCustomRoleByName(organisationId, name) {
      const found = [...data.customRoles.values()].find((role) => role.organisationId === organisationId && role.name === name);
      return found ? { id: found.id, name: found.name, capabilities: [...found.capabilities] } : null;
    },

    async createCustomRole(organisationId, { name, capabilities }) {
      const existing = [...data.customRoles.values()].find((role) => role.organisationId === organisationId && role.name === name);
      if (existing) { existing.capabilities = [...capabilities]; data.customRoles.set(existing.id, existing); return { id: existing.id, name: existing.name, capabilities: [...existing.capabilities] }; }
      const record = { id: crypto.randomUUID(), organisationId, name, capabilities: [...capabilities], createdAt: now() };
      data.customRoles.set(record.id, record);
      return { id: record.id, name: record.name, capabilities: [...record.capabilities] };
    },

    async updateCustomRole(organisationId, id, patch) {
      const role = data.customRoles.get(id);
      if (!role || role.organisationId !== organisationId) return null;
      if (patch.name !== undefined) role.name = patch.name;
      if (patch.capabilities !== undefined) role.capabilities = [...patch.capabilities];
      data.customRoles.set(id, role);
      return { id: role.id, name: role.name, capabilities: [...role.capabilities] };
    },

    async deleteCustomRole(organisationId, id) {
      const role = data.customRoles.get(id);
      if (role && role.organisationId === organisationId) data.customRoles.delete(id);
      return { ok: true };
    },

    // ---- cohorts + assignments ---------------------------------------

    async listCohorts(organisationId) {
      return [...data.cohorts.values()].filter((cohort) => cohort.organisationId === organisationId).sort((a, b) => a.name.localeCompare(b.name)).map((cohort) => ({ ...cohort }));
    },

    async getCohort(organisationId, id) {
      const cohort = data.cohorts.get(id);
      return cohort && cohort.organisationId === organisationId ? { ...cohort } : null;
    },

    async createCohort(organisationId, { name, description, autoEnrolRole }) {
      const record = { id: crypto.randomUUID(), organisationId, name, description: description ?? "", autoEnrolRole: autoEnrolRole ?? "", createdAt: now() };
      data.cohorts.set(record.id, record);
      return { ...record };
    },

    async updateCohort(organisationId, id, patch) {
      const cohort = data.cohorts.get(id);
      if (!cohort || cohort.organisationId !== organisationId) return null;
      for (const key of ["name", "description", "autoEnrolRole"]) if (patch[key] !== undefined) cohort[key] = patch[key];
      data.cohorts.set(id, cohort);
      return { ...cohort };
    },

    async deleteCohort(organisationId, id) {
      const cohort = data.cohorts.get(id);
      if (cohort && cohort.organisationId === organisationId) {
        data.cohorts.delete(id);
        data.cohortMembers = data.cohortMembers.filter((m) => !(m.organisationId === organisationId && m.cohortId === id));
        data.assignments = data.assignments.filter((a) => !(a.organisationId === organisationId && a.targetType === "cohort" && a.targetId === id));
      }
      return { ok: true };
    },

    async addCohortMember(organisationId, cohortId, userId) {
      const existing = data.cohortMembers.find((m) => m.organisationId === organisationId && m.cohortId === cohortId && m.userId === userId);
      if (existing) return { ...existing };
      const record = { id: crypto.randomUUID(), organisationId, cohortId, userId, createdAt: now() };
      data.cohortMembers.push(record);
      return { ...record };
    },

    async removeCohortMember(organisationId, cohortId, userId) {
      data.cohortMembers = data.cohortMembers.filter((m) => !(m.organisationId === organisationId && m.cohortId === cohortId && m.userId === userId));
      return { ok: true };
    },

    async listCohortMembers(organisationId, cohortId) {
      return data.cohortMembers.filter((m) => m.organisationId === organisationId && m.cohortId === cohortId).map((m) => m.userId);
    },

    async listUserCohortIds(organisationId, userId) {
      return data.cohortMembers.filter((m) => m.organisationId === organisationId && m.userId === userId).map((m) => m.cohortId);
    },

    async listAssignments(organisationId) {
      return data.assignments.filter((a) => a.organisationId === organisationId).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).map((a) => ({ ...a }));
    },

    async createAssignment(organisationId, assignment) {
      const record = { id: crypto.randomUUID(), organisationId, targetType: assignment.targetType, targetId: assignment.targetId, courseId: assignment.courseId, dueDate: assignment.dueDate ?? null, required: assignment.required === false ? 0 : 1, note: assignment.note ?? "", createdBy: assignment.createdBy ?? "", createdAt: now() };
      data.assignments.push(record);
      return { ...record };
    },

    async deleteAssignment(organisationId, id) {
      data.assignments = data.assignments.filter((a) => !(a.organisationId === organisationId && a.id === id));
      return { ok: true };
    },

    // ---- notifications -----------------------------------------------

    async listNotifications(organisationId, userId) {
      return data.notifications.filter((n) => n.organisationId === organisationId && n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => ({ ...n }));
    },

    async createNotification(organisationId, { userId, kind, title, body }) {
      const record = { id: crypto.randomUUID(), organisationId, userId, kind: kind ?? "info", title: title ?? "", body: body ?? "", readAt: null, createdAt: now() };
      data.notifications.push(record);
      return { ...record };
    },

    async markNotificationRead(organisationId, id, userId) {
      const note = data.notifications.find((n) => n.organisationId === organisationId && n.id === id && n.userId === userId);
      if (note) note.readAt = now();
      return { ok: Boolean(note) };
    },

    // ---- provisioning config -----------------------------------------

    async getProvisioningConfig(organisationId) {
      const config = data.provisioning.get(organisationId);
      return config ? { ...config } : { organisationId, ssoEnabled: false, scimEnabled: false, allowedDomains: [], groupRoleMap: {}, defaultRole: "Learner", scimTokenHash: "" };
    },

    async upsertProvisioningConfig(organisationId, patch) {
      const existing = data.provisioning.get(organisationId) ?? { organisationId, ssoEnabled: false, scimEnabled: false, allowedDomains: [], groupRoleMap: {}, defaultRole: "Learner", scimTokenHash: "" };
      const merged = {
        organisationId,
        ssoEnabled: patch.ssoEnabled !== undefined ? Boolean(patch.ssoEnabled) : existing.ssoEnabled,
        scimEnabled: patch.scimEnabled !== undefined ? Boolean(patch.scimEnabled) : existing.scimEnabled,
        allowedDomains: patch.allowedDomains !== undefined ? [...patch.allowedDomains] : existing.allowedDomains,
        groupRoleMap: patch.groupRoleMap !== undefined ? { ...patch.groupRoleMap } : existing.groupRoleMap,
        defaultRole: patch.defaultRole !== undefined ? patch.defaultRole : existing.defaultRole,
        scimTokenHash: patch.scimTokenHash !== undefined ? patch.scimTokenHash : existing.scimTokenHash,
      };
      data.provisioning.set(organisationId, merged);
      return { ...merged };
    },

    async listSources(organisationId, { status } = {}) {
      return [...data.sources.values()]
        .filter((source) => source.organisationId === organisationId && (!status || source.status === status))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((source) => ({ ...source, procedure: [...source.procedure], keywords: [...source.keywords] }));
    },

    async listApprovedSources(organisationId) {
      return [...data.sources.values()]
        .filter((source) => source.organisationId === organisationId && source.status === "Published" && source.approvalStatus === "Approved")
        .map((source) => ({ ...source, procedure: [...source.procedure], keywords: [...source.keywords] }));
    },

    async getSource(organisationId, id) {
      const source = data.sources.get(id);
      if (!source || source.organisationId !== organisationId) return null;
      return { ...source, procedure: [...source.procedure], keywords: [...source.keywords] };
    },

    async createSource(source) {
      const timestamp = now();
      const record = { ...rowToSource(sourceToRow(source, timestamp)), createdAt: source.createdAt ?? timestamp };
      data.sources.set(record.id, record);
      return { ...record };
    },

    async updateSource(organisationId, id, patch) {
      const source = data.sources.get(id);
      if (!source || source.organisationId !== organisationId) return null;
      const updated = { ...source };
      for (const key of ["title", "description", "product", "module", "intendedRole", "contentOwner", "type", "version", "status", "approvalStatus", "section", "storageKey", "extractedText", "explanation", "uploadDate", "effectiveDate", "procedure", "keywords", "documentType", "outline", "coverage", "types"]) {
        if (patch[key] !== undefined) updated[key] = patch[key];
      }
      data.sources.set(id, updated);
      return { ...updated };
    },

    async deleteSource(organisationId, id) {
      const source = data.sources.get(id);
      if (source && source.organisationId === organisationId) data.sources.delete(id);
      data.knowledgeChunks.delete(`${organisationId}:${id}`);
      return { ok: true };
    },

    // ---- knowledge chunks (semantic retrieval) -----------------------

    async replaceKnowledgeChunks(organisationId, sourceId, chunks) {
      const records = (Array.isArray(chunks) ? chunks : []).map((chunk, index) => ({
        organisationId,
        sourceId,
        chunkIndex: index,
        section: chunk.section ?? "",
        content: chunk.content ?? "",
        tokenCount: chunk.tokenCount ?? 0,
        embedding: Array.isArray(chunk.embedding) ? chunk.embedding : null,
      }));
      data.knowledgeChunks.set(`${organisationId}:${sourceId}`, records);
      return records.length;
    },

    async listKnowledgeChunks(organisationId, sourceId) {
      const records = data.knowledgeChunks.get(`${organisationId}:${sourceId}`) ?? [];
      return records.map((chunk) => ({ ...chunk, embedding: Array.isArray(chunk.embedding) ? [...chunk.embedding] : null }));
    },

    async createCourse(course) {
      const timestamp = now();
      const record = { id: course.id, organisationId: course.organisationId, sourceId: course.sourceId, title: course.title, role: course.role ?? "", status: course.status ?? "Draft", approvalStatus: course.approvalStatus ?? "Pending", course: course.course, createdAt: timestamp };
      data.courses.set(record.id, record);
      return { ...record };
    },

    async listCourses(organisationId, { status } = {}) {
      return [...data.courses.values()]
        .filter((course) => course.organisationId === organisationId && (!status || course.status === status))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((course) => ({ ...course }));
    },

    async getCourse(organisationId, id) {
      const course = data.courses.get(id);
      if (!course || course.organisationId !== organisationId) return null;
      return { ...course };
    },

    async findCourseBySource(organisationId, sourceId) {
      for (const course of data.courses.values()) {
        if (course.organisationId === organisationId && course.sourceId === sourceId) return { ...course };
      }
      return null;
    },

    async updateCourse(organisationId, id, patch) {
      const course = data.courses.get(id);
      if (!course || course.organisationId !== organisationId) return null;
      const updated = { ...course };
      for (const key of ["title", "role", "status", "approvalStatus", "course"]) {
        if (patch[key] !== undefined) updated[key] = patch[key];
      }
      data.courses.set(id, updated);
      return { ...updated };
    },

    async deleteCourse(organisationId, id) {
      const course = data.courses.get(id);
      if (course && course.organisationId === organisationId) data.courses.delete(id);
      data.assignments = data.assignments.filter((assignment) => !(assignment.organisationId === organisationId && assignment.courseId === id));
      return { ok: true };
    },

    async recordAudit(event) {
      const record = { id: event.id ?? crypto.randomUUID(), organisationId: event.organisationId, actor: event.actor ?? null, role: event.role ?? null, eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, detail: event.detail ?? "", createdAt: event.createdAt ?? now() };
      data.audit.push(record);
      return record;
    },

    async listAudit(organisationId) {
      return data.audit.filter((event) => event.organisationId === organisationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((event) => ({ ...event }));
    },

    async getBrand(organisationId) {
      const brand = data.brands.get(organisationId);
      return brand ? { ...brand } : null;
    },

    async upsertBrand(organisationId, patch) {
      const existing = data.brands.get(organisationId) ?? {};
      const merged = {
        organisationId,
        workspaceName: patch.workspaceName ?? existing.workspaceName ?? "",
        logoKey: patch.logoKey !== undefined ? patch.logoKey : existing.logoKey ?? null,
        primaryColor: patch.primaryColor ?? existing.primaryColor ?? "",
        accentColor: patch.accentColor ?? existing.accentColor ?? "",
        fontFamily: patch.fontFamily ?? existing.fontFamily ?? "",
      };
      data.brands.set(organisationId, merged);
      return { ...merged };
    },

    // ---- vendor simulations ------------------------------------------

    async listSimulations(organisationId, { status } = {}) {
      return [...data.simulations.values()]
        .filter((sim) => sim.organisationId === organisationId && (!status || sim.status === status))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((sim) => ({ ...sim, steps: [...sim.steps], screens: [...sim.screens] }));
    },

    async getSimulation(organisationId, id) {
      const sim = data.simulations.get(id);
      if (!sim || sim.organisationId !== organisationId) return null;
      return { ...sim, steps: [...sim.steps], screens: [...sim.screens] };
    },

    async createSimulation(sim) {
      const timestamp = now();
      const record = { ...rowToSimulation(simulationToRow(sim, timestamp)), createdAt: sim.createdAt ?? timestamp, updatedAt: timestamp };
      data.simulations.set(record.id, record);
      return { ...record };
    },

    async updateSimulation(organisationId, id, patch) {
      const sim = data.simulations.get(id);
      if (!sim || sim.organisationId !== organisationId) return null;
      const updated = { ...sim, updatedAt: now() };
      for (const key of ["title", "description", "mode", "targetUrl", "status", "embeddable", "bridgeEnabled", "steps", "screens"]) {
        if (patch[key] !== undefined) updated[key] = patch[key];
      }
      data.simulations.set(id, updated);
      return { ...updated };
    },

    async deleteSimulation(organisationId, id) {
      const sim = data.simulations.get(id);
      if (sim && sim.organisationId === organisationId) data.simulations.delete(id);
      return { ok: true };
    },

    async listSimOrigins(organisationId) {
      return [...data.simOrigins.values()].filter((entry) => entry.organisationId === organisationId).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).map((entry) => ({ ...entry }));
    },

    async addSimOrigin(organisationId, { origin, label }) {
      const existing = [...data.simOrigins.values()].find((entry) => entry.organisationId === organisationId && entry.origin === origin);
      if (existing) return { ...existing };
      const record = { id: crypto.randomUUID(), organisationId, origin, label: label ?? "", createdAt: now() };
      data.simOrigins.set(record.id, record);
      return { ...record };
    },

    async removeSimOrigin(organisationId, id) {
      const entry = data.simOrigins.get(id);
      if (entry && entry.organisationId === organisationId) data.simOrigins.delete(id);
      return { ok: true };
    },

    // ---- learner persistence -----------------------------------------

    async getLearnerProgress(organisationId, userId, courseId) {
      const record = data.learnerProgress.get(progressKey(organisationId, userId, courseId));
      return record ? { ...record } : null;
    },

    async listLearnerProgress(organisationId, userId) {
      return [...data.learnerProgress.values()].filter((entry) => entry.organisationId === organisationId && entry.userId === userId).map((entry) => ({ ...entry }));
    },

    async listOrgProgress(organisationId) {
      return [...data.learnerProgress.values()].filter((entry) => entry.organisationId === organisationId).map((entry) => ({ ...entry }));
    },

    async upsertLearnerProgress(organisationId, userId, courseId, patch) {
      const key = progressKey(organisationId, userId, courseId);
      const existing = data.learnerProgress.get(key);
      const merged = {
        organisationId,
        userId,
        courseId,
        learningScore: patch.learningScore ?? existing?.learningScore ?? 0,
        simulationScore: patch.simulationScore ?? existing?.simulationScore ?? 0,
        assessmentScore: patch.assessmentScore ?? existing?.assessmentScore ?? 0,
        readiness: patch.readiness ?? existing?.readiness ?? 0,
        status: patch.status ?? existing?.status ?? "in-progress",
        updatedAt: now(),
      };
      data.learnerProgress.set(key, merged);
      return { ...merged };
    },

    async recordAttempt(attempt) {
      const record = { id: attempt.id ?? crypto.randomUUID(), organisationId: attempt.organisationId, userId: attempt.userId, courseId: attempt.courseId, kind: attempt.kind, refId: attempt.refId ?? "", score: Math.round(attempt.score ?? 0), detail: attempt.detail ?? {}, createdAt: attempt.createdAt ?? now() };
      data.attempts.push(record);
      return { ...record };
    },

    async listAttempts(organisationId, userId, courseId) {
      return data.attempts.filter((entry) => entry.organisationId === organisationId && entry.userId === userId && (!courseId || entry.courseId === courseId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => ({ ...entry }));
    },

    async getCredential(organisationId, userId, courseId) {
      const record = data.credentials.get(progressKey(organisationId, userId, courseId));
      return record ? { ...record } : null;
    },

    async listCredentials(organisationId, userId) {
      return [...data.credentials.values()].filter((entry) => entry.organisationId === organisationId && entry.userId === userId).sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? "")).map((entry) => ({ ...entry }));
    },

    async issueCredential(cred) {
      const key = progressKey(cred.organisationId, cred.userId, cred.courseId);
      const existing = data.credentials.get(key);
      const record = {
        organisationId: cred.organisationId,
        userId: cred.userId,
        courseId: cred.courseId,
        learner: cred.learner ?? "",
        programme: cred.programme ?? "",
        readiness: Math.round(cred.readiness ?? 0),
        breakdown: cred.breakdown ?? {},
        issuedAt: existing?.issuedAt ?? now(),
      };
      data.credentials.set(key, record);
      return { ...record };
    },
  };
}

// Bootstrap admin + organisation used when the users table is empty.
export const OWNER_ADMIN = {
  userId: "usr-admin",
  email: "admin@amygdalalishay.com",
  displayName: "Site Administrator",
  role: "Vendor Administrator",
  organisationId: "org-primary",
  credential: { salt: "70546e0164b462d9c8c2489e2764e338", iterations: 100000, hash: "9b3d65eca40452dfb51daf9ed112b6fc6e4ef5bf9d5878662bde6724ae723686" },
};
