export const SAFE_FALLBACK =
  "I cannot verify that from the vendor-approved training material. I can show you the closest authorised guidance or submit this question to your training manager.";

export const organisations = [
  { id: "org-nexus", name: "NexusFlow", type: "vendor" },
  { id: "org-aurora", name: "Aurora Creative", type: "customer", vendorId: "org-nexus" },
  { id: "org-meridian", name: "Meridian Health", type: "customer", vendorId: "org-nexus" },
];

export const sources = [
  {
    id: "src-dashboard",
    organisationId: "org-nexus",
    title: "NexusFlow Workspace Navigation",
    description: "Approved orientation to the workspace and product areas.",
    product: "NexusFlow",
    module: "Dashboard navigation",
    intendedRole: "All roles",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-18",
    effectiveDate: "2026-08-01",
    contentOwner: "Product Enablement",
    type: "Help article",
    section: "Workspace navigation > Primary navigation",
    keywords: ["dashboard", "navigation", "projects", "team", "workflows", "reports", "menu", "sidebar"],
    extractedText:
      "The primary navigation is on the left side of every NexusFlow workspace. Select Dashboard for assigned work, Projects for project spaces, Team for membership, Workflows for automation, and Reports for workspace reporting.",
    explanation:
      "NexusFlow uses one consistent left navigation. Think of it as a capability map: Dashboard shows today’s work, while Projects, Team, Workflows and Reports open their dedicated work areas.",
    procedure: [
      "Locate the primary navigation on the left side of the workspace.",
      "Select Dashboard to review assigned work and recent activity.",
      "Select Projects, Team, Workflows or Reports to open that product area.",
    ],
  },
  {
    id: "src-projects",
    organisationId: "org-nexus",
    title: "Create and Configure a Project",
    description: "The approved project-creation procedure for project managers.",
    product: "NexusFlow",
    module: "Creating a project",
    intendedRole: "Project Manager",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    contentOwner: "NexusFlow Product Education",
    type: "Standard operating procedure",
    section: "Projects > Create a project",
    keywords: ["create", "project", "template", "project details", "owner", "due date"],
    extractedText:
      "Open Projects and select New project. Choose Blank project or an approved workspace template. Enter the project name, owner and optional target date. Review the details and select Create project.",
    explanation:
      "A NexusFlow project is the container for a shared outcome. A template preloads an approved structure; a blank project starts without tasks or automation.",
    procedure: [
      "Open Projects from the primary navigation.",
      "Select New project.",
      "Choose Blank project or an approved workspace template.",
      "Enter the project name, owner and optional target date.",
      "Review the details, then select Create project.",
    ],
  },
  {
    id: "src-team",
    organisationId: "org-nexus",
    title: "Team Invitations and Task Assignment",
    description: "Approved membership and assignment workflow.",
    product: "NexusFlow",
    module: "Inviting team members",
    intendedRole: "Workspace Administrator",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-22",
    effectiveDate: "2026-08-01",
    contentOwner: "Customer Success Operations",
    type: "Product guide",
    section: "Team > Invite and assign",
    keywords: ["invite", "team", "member", "role", "assign", "task", "email"],
    extractedText:
      "Open Team, select Invite member, enter the work email address and choose a workspace role. Send the invitation. After the member appears in the project, open a task and choose the member in Assignee, then select Save.",
    explanation:
      "Workspace membership grants access; task assignment gives a person responsibility for a specific item. These are separate actions in NexusFlow.",
    procedure: [
      "Open Team from the primary navigation and select Invite member.",
      "Enter the work email address and choose the approved workspace role.",
      "Select Send invitation.",
      "Open the relevant project task and choose the member in Assignee.",
      "Select Save to confirm the assignment.",
    ],
  },
  {
    id: "src-permissions",
    organisationId: "org-nexus",
    title: "Workspace Roles and Permissions",
    description: "Approved role boundaries and least-privilege guidance.",
    product: "NexusFlow",
    module: "Configuring permissions",
    intendedRole: "Workspace Administrator",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-24",
    effectiveDate: "2026-08-01",
    contentOwner: "Security Product Team",
    type: "Security guide",
    section: "Administration > Workspace roles",
    keywords: ["permission", "permissions", "role", "administrator", "manager", "member", "access"],
    extractedText:
      "Workspace Administrators manage members, roles and workspace configuration. Project Managers create and manage projects they can access. Team Members update assigned work. Assign the least-privileged role that supports the person’s responsibilities.",
    explanation:
      "Roles are permission bundles. Use the least-privileged role that still lets a learner complete their job responsibilities.",
    procedure: [
      "Open Team and select the member.",
      "Open Workspace role.",
      "Choose the least-privileged approved role.",
      "Review the permission summary and select Save role.",
    ],
  },
  {
    id: "src-workflows",
    organisationId: "org-nexus",
    title: "Workflow Automation Essentials",
    description: "Approved procedure for a trigger-and-action automation.",
    product: "NexusFlow",
    module: "Creating automated workflows",
    intendedRole: "Project Manager",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-26",
    effectiveDate: "2026-08-01",
    contentOwner: "Automation Product Team",
    type: "Product guide",
    section: "Workflows > Build an automation",
    keywords: ["workflow", "automation", "trigger", "action", "activate", "rule"],
    extractedText:
      "Open Workflows and select New automation. Choose one approved trigger and configure its conditions. Choose an action and complete its required fields. Review the summary, then select Activate.",
    explanation:
      "Every automation follows a when-this-then-that structure: the trigger watches for an event and the action performs the approved response.",
    procedure: [
      "Open Workflows and select New automation.",
      "Choose an approved trigger and configure its conditions.",
      "Choose an action and complete its required fields.",
      "Review the automation summary.",
      "Select Activate.",
    ],
  },
  {
    id: "src-reports",
    organisationId: "org-nexus",
    title: "Reports and Saved Views",
    description: "Approved reporting workflow for project managers.",
    product: "NexusFlow",
    module: "Viewing reports",
    intendedRole: "Project Manager",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-27",
    effectiveDate: "2026-08-01",
    contentOwner: "Analytics Product Team",
    type: "Help article",
    section: "Reports > Open and filter a report",
    keywords: ["report", "reports", "filter", "saved view", "export", "analytics"],
    extractedText:
      "Open Reports, select a report, then apply the available project, owner, status or date filters. Select Save view to retain the filter combination for your workspace role.",
    explanation:
      "Reports summarize workspace activity. Filters narrow the view without changing the underlying projects or tasks.",
    procedure: [
      "Open Reports from the primary navigation.",
      "Select the required report.",
      "Apply the available project, owner, status or date filters.",
      "Select Save view if you need to retain the filter combination.",
    ],
  },
  {
    id: "src-troubleshooting",
    organisationId: "org-nexus",
    title: "NexusFlow Troubleshooting FAQ",
    description: "Approved answers for common access and update issues.",
    product: "NexusFlow",
    module: "Troubleshooting",
    intendedRole: "All roles",
    version: "4.2",
    status: "Published",
    approvalStatus: "Approved",
    uploadDate: "2026-07-29",
    effectiveDate: "2026-08-01",
    contentOwner: "Customer Support",
    type: "FAQ",
    section: "Troubleshooting > Access and updates",
    keywords: ["troubleshoot", "troubleshooting", "missing", "cannot", "access", "task", "refresh", "invitation"],
    extractedText:
      "If a project is missing, confirm that the user has accepted the workspace invitation and has access to the project. If an assignment does not appear, refresh the task after the invitation has been accepted. Escalate unresolved access issues to a Workspace Administrator.",
    explanation:
      "Most missing-item issues are access or invitation state problems. First verify workspace membership, then verify project access.",
    procedure: [
      "Confirm that the user accepted the workspace invitation.",
      "Confirm that the user has access to the project.",
      "Refresh the task after membership is active.",
      "Escalate unresolved access issues to a Workspace Administrator.",
    ],
  },
  {
    id: "src-release",
    organisationId: "org-nexus",
    title: "NexusFlow 4.3 Preview Notes",
    description: "Unapproved preview material excluded from learner answers.",
    product: "NexusFlow",
    module: "Release notes",
    intendedRole: "All roles",
    version: "4.3-preview",
    status: "Draft",
    approvalStatus: "Pending",
    uploadDate: "2026-08-10",
    effectiveDate: "2026-09-01",
    contentOwner: "Product Marketing",
    type: "Release notes",
    section: "Preview features",
    keywords: ["roadmap", "preview", "future"],
    extractedText: "Draft preview content. This material must not be used for learner guidance.",
    explanation: "Draft preview content.",
    procedure: [],
  },
  {
    id: "src-legacy",
    organisationId: "org-nexus",
    title: "Legacy Project Setup v3",
    description: "Superseded content retained for audit history.",
    product: "NexusFlow",
    module: "Creating a project",
    intendedRole: "Project Manager",
    version: "3.0",
    status: "Archived",
    approvalStatus: "Approved",
    uploadDate: "2025-04-11",
    effectiveDate: "2025-04-20",
    contentOwner: "Product Education",
    type: "Product guide",
    section: "Legacy project creation",
    keywords: ["legacy", "project"],
    extractedText: "Archived instructions that must not be retrieved.",
    explanation: "Archived instructions.",
    procedure: [],
  },
];

export const modules = [
  { id: "m1", title: "Navigate the workspace", label: "Learn", duration: 6, progress: 100, mandatory: true, sourceId: "src-dashboard" },
  { id: "m2", title: "Create a project", label: "Practise", duration: 12, progress: 68, mandatory: true, sourceId: "src-projects" },
  { id: "m3", title: "Collaborate with your team", label: "Learn", duration: 9, progress: 25, mandatory: true, sourceId: "src-team" },
  { id: "m4", title: "Automate a workflow", label: "Practise", duration: 14, progress: 0, mandatory: true, sourceId: "src-workflows" },
  { id: "m5", title: "Prove product readiness", label: "Validate", duration: 8, progress: 0, mandatory: true, sourceId: "src-reports" },
];

export const missions = [
  {
    id: "mission-project",
    title: "Create your first project",
    objective: "Create a client-launch project from the approved campaign template.",
    minutes: 6,
    prerequisite: "Workspace navigation",
    sourceId: "src-projects",
    steps: [
      { label: "Open Projects", hint: "Use the Projects item in the left navigation." },
      { label: "Select New project", hint: "Look for the primary action above the project list." },
      { label: "Choose Campaign launch", hint: "Use the approved Campaign launch template." },
      { label: "Enter project details", hint: "Add the project name and owner before continuing." },
      { label: "Create project", hint: "Review the summary, then confirm creation." },
    ],
  },
  {
    id: "mission-team",
    title: "Invite and assign a team member",
    objective: "Invite a fictional colleague and assign the launch checklist.",
    minutes: 7,
    prerequisite: "Create a project",
    sourceId: "src-team",
    steps: [
      { label: "Open Team", hint: "Team is in the workspace navigation." },
      { label: "Invite member", hint: "Choose the Invite member action." },
      { label: "Choose Team Member", hint: "Use the least-privileged role." },
      { label: "Assign launch checklist", hint: "Choose the new member as Assignee." },
      { label: "Save assignment", hint: "Confirm the task assignment." },
    ],
  },
  {
    id: "mission-workflow",
    title: "Build an automated workflow",
    objective: "Notify the project owner when a launch task becomes blocked.",
    minutes: 8,
    prerequisite: "Task assignment",
    sourceId: "src-workflows",
    steps: [
      { label: "Open Workflows", hint: "Workflows is in the workspace navigation." },
      { label: "Choose status trigger", hint: "Use When task status changes." },
      { label: "Select notify owner", hint: "Choose the Notify project owner action." },
      { label: "Review automation", hint: "Check the trigger and action summary." },
      { label: "Activate automation", hint: "Activate only after reviewing the summary." },
    ],
  },
];

export const learnerRows = [
  { organisation: "Aurora Creative", learner: "Aisha Naidoo", role: "Project Manager", lessons: 82, simulation: 88, assessment: 86 },
  { organisation: "Aurora Creative", learner: "Thabo Mokoena", role: "Team Member", lessons: 100, simulation: 92, assessment: 94 },
  { organisation: "Meridian Health", learner: "Priya Singh", role: "Workspace Administrator", lessons: 71, simulation: 62, assessment: 78 },
  { organisation: "Meridian Health", learner: "Daniel Molefe", role: "Project Manager", lessons: 45, simulation: 38, assessment: 56 },
];

export function calculateReadiness({ lessons, simulation, assessment }) {
  return Math.round(lessons * 0.3 + simulation * 0.4 + assessment * 0.3);
}

export function assignPathway(score) {
  if (score <= 2) {
    return { level: "Foundation", reason: "Your diagnostic shows that product fundamentals will make the mandatory practice missions more useful.", reviewOptional: false };
  }
  if (score <= 4) {
    return { level: "Standard", reason: "You know the core concepts and will benefit from the standard learn, practise and validate sequence.", reviewOptional: false };
  }
  return { level: "Accelerated", reason: "You demonstrated strong product knowledge. Lesson review is optional, while mandatory simulations remain assigned.", reviewOptional: true };
}

export function canAccess(role, action) {
  const permissions = {
    "Vendor Administrator": ["view-admin", "approve-source", "publish-source", "view-ai-activity"],
    "Training Manager": ["view-admin", "approve-source", "view-ai-activity"],
    "Customer Learner": ["view-learner", "ask-guide", "complete-training"],
  };
  return permissions[role]?.includes(action) ?? false;
}

export function isPromptInjection(query) {
  return /(ignore|disregard).{0,20}(previous|prior|system)|system prompt|developer message|jailbreak|reveal.{0,16}(prompt|instructions)|execute.{0,10}(code|command)/i.test(query);
}

function tokenise(query) {
  return [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter((token) => token.length > 2);
}

export function searchApprovedKnowledge({ organisationId, query, product = "NexusFlow", version = "4.2", role = "Project Manager", module }) {
  const queryTokens = tokenise(query);
  return sources
    .filter((source) =>
      source.organisationId === organisationId &&
      source.product === product &&
      source.version === version &&
      source.status === "Published" &&
      source.approvalStatus === "Approved" &&
      (source.intendedRole === "All roles" || source.intendedRole === role || role === "Workspace Administrator") &&
      (!module || source.module === module || source.keywords.some((keyword) => module.toLowerCase().includes(keyword)))
    )
    .map((source) => ({
      source,
      score: queryTokens.reduce(
        (score, token) => score + (source.keywords.some((keyword) => keyword.includes(token) || token.includes(keyword)) ? 2 : source.extractedText.toLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

export function answerGroundedQuestion({ organisationId, query, mode = "explain", role = "Project Manager", module }) {
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 500) {
    return { status: "Not covered", answer: SAFE_FALLBACK, citations: [], escalationRecommended: true, reason: "invalid-input" };
  }
  if (isPromptInjection(query)) {
    return { status: "Not covered", answer: SAFE_FALLBACK, citations: [], escalationRecommended: true, reason: "prompt-injection" };
  }

  const matches = searchApprovedKnowledge({ organisationId, query, role, module });
  const best = matches[0];
  if (!best || best.score < 2) {
    return { status: "Not covered", answer: SAFE_FALLBACK, citations: [], escalationRecommended: true, reason: "insufficient-evidence" };
  }

  const status = best.score >= 4 ? "Verified" : "Limited guidance";
  const answer = mode === "guide"
    ? `${best.source.procedure.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nFollow the approved sequence above and pause if your workspace does not match it.`
    : best.source.explanation;

  return {
    status,
    answer,
    citations: [{
      sourceId: best.source.id,
      title: best.source.title,
      version: best.source.version,
      section: best.source.section,
    }],
    escalationRecommended: status !== "Verified",
    reason: "approved-evidence",
  };
}
