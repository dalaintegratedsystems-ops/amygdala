// Deterministic, grounded docs -> course generation engine.
//
// Turns an approved source document into a full draft training course
// (programme, modules, lessons, diagnostic, assessment and a simulation
// definition). Every generated artefact carries a citation back to the
// exact source version/section and enters the human review workflow as
// Draft / Pending so a vendor administrator approves before publish.
//
// The generator is intentionally deterministic (no LLM, no credentials):
// the same source always yields the same draft, which keeps the pipeline
// auditable and testable. A future live adapter can replace
// `draftLessonBody` / `deriveQuestions` while preserving this contract.

const GENERATOR_ID = "amygdala-deterministic-authoring/v1";

const DISTRACTOR_ACTIONS = [
  "Delete the workspace",
  "Change the billing plan",
  "Export a report",
  "Archive the project",
  "Invite an external administrator",
  "Disable all notifications",
  "Reset another member's password",
];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function citationFor(source) {
  return {
    sourceId: source.id,
    title: source.title,
    version: source.version,
    section: source.section,
  };
}

function isGeneratable(source) {
  return Boolean(
    source &&
      source.status === "Published" &&
      source.approvalStatus === "Approved" &&
      Array.isArray(source.procedure) &&
      source.procedure.length > 0,
  );
}

function draftLessonBody(source) {
  const steps = source.procedure.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return {
    concept: source.explanation,
    procedure: steps,
  };
}

function deriveQuestions(source, { prefix, count }) {
  const steps = source.procedure;
  return steps.slice(0, count).map((step, index) => {
    const distractors = DISTRACTOR_ACTIONS
      .filter((action) => action.toLowerCase() !== step.toLowerCase())
      .slice(index, index + 2);
    const options = [step, ...distractors];
    return {
      id: `${prefix}-${source.id}-q${index + 1}`,
      question: `Step ${index + 1} of "${source.title}": which action is approved?`,
      options,
      correct: 0,
      citation: citationFor(source),
    };
  });
}

// Generate a complete, grounded draft course from one approved source.
export function generateCourseFromSource(source, options = {}) {
  if (!isGeneratable(source)) {
    return {
      ok: false,
      reason: "source-not-approved",
      message:
        "Course generation requires a Published + Approved source with an approved procedure.",
    };
  }

  const role = source.intendedRole && source.intendedRole !== "All roles" ? source.intendedRole : "Project Manager";
  const base = slugify(source.module || source.title);
  const citation = citationFor(source);
  const body = draftLessonBody(source);

  const programme = {
    id: `prog-${base}`,
    title: `${source.module}: grounded onboarding`,
    role,
    status: "Draft",
    approvalStatus: "Pending",
    sourceId: source.id,
    citation,
  };

  const generatedModules = [
    { id: `mod-${base}-learn`, label: "Learn", title: `Understand ${source.module.toLowerCase()}`, duration: 6, mandatory: true, citation },
    { id: `mod-${base}-practise`, label: "Practise", title: `Practise ${source.module.toLowerCase()}`, duration: 10, mandatory: true, citation },
    { id: `mod-${base}-validate`, label: "Validate", title: `Prove ${source.module.toLowerCase()} readiness`, duration: 6, mandatory: true, citation },
  ];

  const lessons = [
    {
      id: `les-${base}-concept`,
      moduleId: `mod-${base}-learn`,
      label: "Learn",
      title: `Why ${source.module.toLowerCase()} matters`,
      content: body.concept,
      citation,
    },
    {
      id: `les-${base}-procedure`,
      moduleId: `mod-${base}-practise`,
      label: "Practise",
      title: `The approved ${source.module.toLowerCase()} procedure`,
      content: body.procedure,
      citation,
    },
  ];

  const diagnostic = deriveQuestions(source, { prefix: "diag", count: Math.min(3, source.procedure.length) });
  const assessment = {
    id: `asmt-${base}`,
    passThreshold: 80,
    questions: deriveQuestions(source, { prefix: "asmt", count: Math.min(5, source.procedure.length) }),
    citation,
  };

  const simulation = {
    id: `sim-${base}`,
    moduleId: `mod-${base}-practise`,
    title: `Practise: ${source.module}`,
    citation,
    steps: source.procedure.map((step, index) => ({
      label: step,
      hint: `Approved step ${index + 1} of ${source.procedure.length}.`,
      coaching: `That is not the approved next action. Return to "${source.title}" and follow step ${index + 1}.`,
    })),
  };

  const provenance = {
    generator: GENERATOR_ID,
    grounded: true,
    sourceId: source.id,
    sourceVersion: source.version,
    sourceSection: source.section,
    generatedAt: options.generatedAt ?? null,
  };

  return {
    ok: true,
    programme,
    modules: generatedModules,
    lessons,
    diagnostic,
    assessment,
    simulation,
    citation,
    provenance,
    reviewChecklist: [
      "Confirm every lesson matches the cited source section.",
      "Confirm the assessment pass threshold (80%) is correct for this role.",
      "Confirm the simulation steps follow the approved procedure order.",
      "Approve to publish, or reject to return for edits.",
    ],
  };
}

// Summary counts for a generated (or published) course.
export function summariseGeneratedCourse(course) {
  if (!course || course.ok === false) return { modules: 0, lessons: 0, diagnostic: 0, assessment: 0, simulationSteps: 0 };
  return {
    modules: course.modules.length,
    lessons: course.lessons.length,
    diagnostic: course.diagnostic.length,
    assessment: course.assessment.questions.length,
    simulationSteps: course.simulation.steps.length,
  };
}

// Human-in-the-loop approval: returns a published copy of the draft course.
// Everything a vendor administrator approves flips to Published / Approved.
export function approveCourse(course) {
  if (!course || course.ok === false) return course;
  const publish = (item) => ({ ...item, status: "Published", approvalStatus: "Approved" });
  return {
    ...course,
    programme: publish(course.programme),
    modules: course.modules.map((module) => ({ ...module, status: "Published", approvalStatus: "Approved" })),
    lessons: course.lessons.map((lesson) => ({ ...lesson, status: "Published", approvalStatus: "Approved" })),
    approvalStatus: "Approved",
    status: "Published",
  };
}
