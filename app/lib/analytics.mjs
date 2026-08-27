// Readiness intelligence.
//
// A configurable competency model (defaulting to the transparent 30/40/30
// formula) and documentation-gap analytics derived from real AI activity.
// No fictional seed content: gap analysis operates on caller-supplied
// activity (empty until real questions are asked).

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

// Rank documentation gaps from AI activity: repeated Not covered / Limited
// guidance answers become prioritised recommendations for the vendor.
export function analyzeDocumentationGaps(activity = []) {
  const gaps = new Map();
  for (const item of activity) {
    if (item.status === "Verified") continue;
    const key = item.topic;
    const existing = gaps.get(key) ?? { topic: key, count: 0, status: item.status, organisations: new Set() };
    existing.count += 1;
    if (item.organisation) existing.organisations.add(item.organisation);
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
