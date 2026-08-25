// Readiness intelligence and enterprise integrations.
//
// Adds a configurable competency model (defaulting to the transparent
// 30/40/30 formula), documentation-gap analytics derived from real AI
// activity, and standards-shaped exports (xAPI statements, a SCORM 1.2
// manifest + data model) plus a connector catalogue for LMS/LRS systems.

import { learnerRows } from "./domain.mjs";

const BASE_IRI = "https://amygdala.example/xapi";

// Competency models. The default is intentionally identical to the fixed
// 30/40/30 formula; enterprises can select a role-specific model without
// hiding the weighting.
export const defaultCompetencyModel = {
  id: "balanced-30-40-30",
  name: "Balanced (default)",
  weights: { learning: 0.3, simulation: 0.4, assessment: 0.3 },
  passThreshold: 80,
};

export const competencyModels = [
  defaultCompetencyModel,
  {
    id: "practice-first",
    name: "Practice-first (regulated workflows)",
    weights: { learning: 0.2, simulation: 0.5, assessment: 0.3 },
    passThreshold: 85,
  },
  {
    id: "knowledge-first",
    name: "Knowledge-first (compliance)",
    weights: { learning: 0.4, simulation: 0.2, assessment: 0.4 },
    passThreshold: 90,
  },
];

export function calculateReadinessWithModel({ lessons, simulation, assessment }, model = defaultCompetencyModel) {
  const weights = model.weights;
  return Math.round(lessons * weights.learning + simulation * weights.simulation + assessment * weights.assessment);
}

// Seed AI activity used for gap analytics (status mirrors the guide's
// grounding decisions: Verified / Limited guidance / Not covered).
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

// Rank documentation gaps from AI activity: repeated Not covered / Limited
// guidance answers become prioritised recommendations for the vendor.
export function analyzeDocumentationGaps(activity = aiActivity) {
  const gaps = new Map();
  for (const item of activity) {
    if (item.status === "Verified") continue;
    const key = item.topic;
    const existing = gaps.get(key) ?? { topic: key, count: 0, status: item.status, organisations: new Set() };
    existing.count += 1;
    existing.organisations.add(item.organisation);
    // "Not covered" is the more severe signal and wins the label.
    if (item.status === "Not covered") existing.status = "Not covered";
    gaps.set(key, existing);
  }
  return [...gaps.values()]
    .map((gap) => ({
      topic: gap.topic,
      count: gap.count,
      status: gap.status,
      organisations: [...gap.organisations],
      recommendation:
        gap.status === "Not covered"
          ? `Create an approved source for "${gap.topic}".`
          : `Expand the approved source covering "${gap.topic}".`,
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

// ---- Standards-shaped exports ---------------------------------------

function actorFor(learner) {
  return { objectType: "Agent", name: learner.learner ?? learner.name, mbox: `mailto:${(learner.email ?? `${(learner.learner ?? "learner").toLowerCase().replace(/\s+/g, ".")}@example.com`)}` };
}

// xAPI statements for a learner's completion, practice and readiness.
export function buildXapiStatements(learner, model = defaultCompetencyModel) {
  const actor = actorFor(learner);
  const readiness = calculateReadinessWithModel(learner, model);
  const statement = (verbId, verbLabel, objectId, objectLabel, result) => ({
    actor,
    verb: { id: verbId, display: { "en-US": verbLabel } },
    object: { id: objectId, definition: { name: { "en-US": objectLabel } } },
    ...(result ? { result } : {}),
  });
  return [
    statement("http://adlnet.gov/expapi/verbs/completed", "completed", `${BASE_IRI}/module/learning`, "Learning modules", {
      completion: learner.lessons >= 100,
      score: { scaled: learner.lessons / 100, raw: learner.lessons, min: 0, max: 100 },
    }),
    statement("http://adlnet.gov/expapi/verbs/experienced", "experienced", `${BASE_IRI}/simulation`, "Product simulation", {
      score: { scaled: learner.simulation / 100, raw: learner.simulation, min: 0, max: 100 },
    }),
    statement("http://adlnet.gov/expapi/verbs/passed", "passed", `${BASE_IRI}/assessment`, "Knowledge assessment", {
      success: learner.assessment >= model.passThreshold,
      score: { scaled: learner.assessment / 100, raw: learner.assessment, min: 0, max: 100 },
    }),
    statement("http://adlnet.gov/expapi/verbs/achieved", "achieved", `${BASE_IRI}/readiness`, "Verified product readiness", {
      success: readiness >= model.passThreshold,
      score: { scaled: readiness / 100, raw: readiness, min: 0, max: 100 },
    }),
  ];
}

// SCORM 1.2 manifest for a programme (importable by an enterprise LMS).
export function buildScormManifest(programme = { id: "prog-nexus", title: "NexusFlow Project Manager Onboarding" }) {
  const identifier = `AMYGDALA-${String(programme.id).toUpperCase()}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<manifest identifier="${identifier}" version="1.2"`,
    '  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"',
    '  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">',
    "  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>",
    '  <organizations default="ORG-1">',
    '    <organization identifier="ORG-1">',
    `      <title>${programme.title}</title>`,
    '      <item identifier="ITEM-1" identifierref="RES-1"><title>Grounded onboarding</title></item>',
    "    </organization>",
    "  </organizations>",
    '  <resources>',
    '    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html"/>',
    "  </resources>",
    "</manifest>",
  ].join("\n");
}

export function buildScormDataModel(learner, model = defaultCompetencyModel) {
  const readiness = calculateReadinessWithModel(learner, model);
  return {
    "cmi.core.student_name": learner.learner ?? learner.name,
    "cmi.core.lesson_status": readiness >= model.passThreshold ? "passed" : "incomplete",
    "cmi.core.score.raw": readiness,
    "cmi.core.score.min": 0,
    "cmi.core.score.max": 100,
    "cmi.core.credit": "credit",
  };
}

// Connector catalogue for LMS / LRS integrations.
export function listIntegrationConnectors() {
  return [
    { id: "xapi-lrs", name: "xAPI (LRS)", protocol: "xAPI 1.0.3", direction: "push", status: "Available" },
    { id: "scorm", name: "SCORM package", protocol: "SCORM 1.2", direction: "export", status: "Available" },
    { id: "workday", name: "Workday Learning", protocol: "REST + SFTP", direction: "push", status: "Configurable" },
    { id: "successfactors", name: "SAP SuccessFactors", protocol: "OData", direction: "push", status: "Configurable" },
    { id: "cornerstone", name: "Cornerstone OnDemand", protocol: "REST", direction: "push", status: "Configurable" },
  ];
}

export function learnerByName(name) {
  return learnerRows.find((row) => row.learner === name) ?? learnerRows[0];
}
