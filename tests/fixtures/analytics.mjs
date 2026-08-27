// Test fixtures for analytics: sample AI activity used to exercise the
// documentation-gap ranking. Previously shipped as runtime seed data.

export const aiActivity = [
  { id: "act-1", question: "How do I create a project?", topic: "Creating a project", organisation: "Aurora Creative", status: "Verified", source: "Create and Configure a Project" },
  { id: "act-2", question: "Can I automate a blocked-task alert?", topic: "Creating automated workflows", organisation: "Meridian Health", status: "Verified", source: "Workflow Automation Essentials" },
  { id: "act-3", question: "Does NexusFlow include payroll?", topic: "Payroll", organisation: "Meridian Health", status: "Not covered", source: null },
  { id: "act-4", question: "How do I run payroll exports?", topic: "Payroll", organisation: "Aurora Creative", status: "Not covered", source: null },
  { id: "act-5", question: "Why can't I see the project?", topic: "Troubleshooting", organisation: "Aurora Creative", status: "Limited guidance", source: "NexusFlow Troubleshooting FAQ" },
  { id: "act-6", question: "How do external contractors get roles?", topic: "External collaborators", organisation: "Meridian Health", status: "Limited guidance", source: "Workspace Roles and Permissions" },
  { id: "act-7", question: "How do I bulk archive projects?", topic: "Bulk project archiving", organisation: "Aurora Creative", status: "Not covered", source: null },
  { id: "act-8", question: "Can I bulk archive old projects?", topic: "Bulk project archiving", organisation: "Meridian Health", status: "Not covered", source: null },
];

export const seedAuditEvents = [
  { id: "evt-1001", organisationId: "org-nexus", actor: "Vera Ndlovu", role: "Vendor Administrator", eventType: "source.published", entityType: "source", entityId: "src-projects", detail: "Published v4.2", createdAt: "2026-08-20T09:14:00.000Z" },
  { id: "evt-1002", organisationId: "org-nexus", actor: "Theo Adeyemi", role: "Training Manager", eventType: "source.approved", entityType: "source", entityId: "src-workflows", detail: "Approved for publish", createdAt: "2026-08-20T10:02:00.000Z" },
  { id: "evt-1003", organisationId: "org-aurora", actor: "Aisha Naidoo", role: "Customer Learner", eventType: "ai.answer", entityType: "conversation", entityId: "conv-88", detail: "status=Verified source=src-projects", createdAt: "2026-08-21T08:42:00.000Z" },
];
