// Core, content-free domain logic.
//
// This module ships NO fictional seed content. The grounding helpers operate
// on a caller-supplied list of approved source objects (loaded from the data
// store at runtime, or from fixtures in tests). Everything here is pure and
// deterministic so it is testable and usable as an LLM fallback.

export const SAFE_FALLBACK =
  "I cannot verify that from the vendor-approved training material. I can show you the closest authorised guidance or submit this question to your training manager.";

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

// Score a supplied list of approved sources against a query. Callers pass the
// already tenant-scoped, Published + Approved sources; this only ranks them
// and applies role / module relevance.
export function searchApprovedKnowledge(sources, { query, role = "Project Manager", module } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const queryTokens = tokenise(query ?? "");
  return list
    .filter((source) =>
      source.status === "Published" &&
      source.approvalStatus === "Approved" &&
      (source.intendedRole === "All roles" || source.intendedRole === role || role === "Workspace Administrator") &&
      (!module || source.module === module || (source.keywords ?? []).some((keyword) => module.toLowerCase().includes(keyword)))
    )
    .map((source) => ({
      source,
      score: queryTokens.reduce(
        (score, token) => score + ((source.keywords ?? []).some((keyword) => keyword.includes(token) || token.includes(keyword)) ? 2 : source.extractedText.toLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

export function answerGroundedQuestion(sources, { query, mode = "explain", role = "Project Manager", module } = {}) {
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 500) {
    return { status: "Not covered", answer: SAFE_FALLBACK, citations: [], escalationRecommended: true, reason: "invalid-input" };
  }
  if (isPromptInjection(query)) {
    return { status: "Not covered", answer: SAFE_FALLBACK, citations: [], escalationRecommended: true, reason: "prompt-injection" };
  }

  const matches = searchApprovedKnowledge(sources, { query, role, module });
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
