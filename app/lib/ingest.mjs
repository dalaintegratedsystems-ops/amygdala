// AI-assisted document ingestion: parse an uploaded document and extract
// the key knowledge needed to build grounded training material.
//
// Design principles:
//  - Deterministic first: text extraction + structure derivation run with
//    NO model and NO API key, so the feature works credential-free.
//  - AI is an optional upgrade behind an adapter seam (`describeExtractor`):
//    Workers AI (no key, account binding) or a BYO LLM (server-side key) can
//    replace the derivation step while preserving the same output contract.
//  - Grounded, not hallucinated: every derived step/keyword is span-verified
//    to appear verbatim in the source text; ungrounded items are dropped.
//  - Human-in-the-loop: output is always Draft / Pending until an admin
//    reviews and approves it — nothing here publishes.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "were", "will",
  "have", "has", "had", "not", "but", "can", "may", "any", "all", "our", "their", "his", "her", "its", "a",
  "an", "of", "to", "in", "on", "or", "is", "it", "be", "as", "at", "by", "if", "so", "do", "up", "out",
  "then", "than", "when", "where", "which", "who", "how", "what", "each", "only", "also", "use", "using",
]);

const IMPERATIVE_VERBS = ["open", "select", "choose", "enter", "review", "click", "configure", "add", "send", "save", "confirm", "activate", "navigate", "upload", "set", "create", "assign", "apply", "verify", "refresh", "publish", "approve", "complete"];

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "document";
}

function normalizeWhitespace(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function stripListMarker(line) {
  return line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim();
}

export function estimateTokens(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length * 1.3));
}

// Split into { heading, content } sections using Markdown headings or blanks.
export function splitSections(text) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized.split("\n");
  const sections = [];
  let current = { heading: "", content: [] };
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      if (current.heading || current.content.length) sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
      current = { heading: headingMatch[1].trim(), content: [] };
    } else {
      current.content.push(line);
    }
  }
  if (current.heading || current.content.length) sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
  return sections.filter((section) => section.heading || section.content);
}

// Retrieval-sized chunks with a section label and token estimate.
export function chunkText(text, { maxChars = 600 } = {}) {
  const chunks = [];
  for (const section of splitSections(text)) {
    const label = section.heading || "General";
    const paragraphs = section.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buffer = "";
    const flush = () => {
      if (buffer.trim()) chunks.push({ section: label, content: buffer.trim(), tokenCount: estimateTokens(buffer) });
      buffer = "";
    };
    for (const paragraph of paragraphs.length ? paragraphs : [section.content]) {
      if ((buffer + paragraph).length > maxChars) flush();
      buffer += (buffer ? "\n\n" : "") + paragraph;
    }
    flush();
  }
  return chunks;
}

export function deriveExplanation(text) {
  for (const section of splitSections(text)) {
    const firstParagraph = section.content.split(/\n{2,}/).map((p) => p.trim()).find(Boolean);
    if (firstParagraph) return firstParagraph.replace(/\s+/g, " ").slice(0, 400);
  }
  return normalizeWhitespace(text).slice(0, 400);
}

// Ordered, approved-looking steps: prefer numbered/bulleted lines, then fall
// back to imperative sentences.
export function deriveProcedure(text, { max = 8 } = {}) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const numbered = lines.filter((line) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line)).map(stripListMarker);
  let steps = numbered;
  if (steps.length < 2) {
    const sentences = normalized.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    steps = sentences.filter((sentence) => IMPERATIVE_VERBS.includes(sentence.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "")));
  }
  return steps.map((step) => step.replace(/\s+/g, " ").replace(/[.;]+$/, "").trim()).filter((step) => step.length > 3).slice(0, max);
}

export function deriveKeywords(text, { max = 8 } = {}) {
  const counts = new Map();
  for (const token of normalizeWhitespace(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([term]) => term);
}

// Span verification: confirm each derived item appears verbatim in the
// source text (case-insensitive, whitespace-normalised). Anti-hallucination.
export function verifyGrounding(items, text) {
  const haystack = normalizeWhitespace(text).toLowerCase().replace(/\s+/g, " ");
  const checked = items.map((item) => ({ item, grounded: haystack.includes(String(item).toLowerCase().replace(/\s+/g, " ")) }));
  return {
    grounded: checked.every((entry) => entry.grounded),
    groundedCount: checked.filter((entry) => entry.grounded).length,
    total: checked.length,
    ungrounded: checked.filter((entry) => !entry.grounded).map((entry) => entry.item),
  };
}

// Describe the active extraction engine. Deterministic + credential-free by
// default; upgrades to Workers AI (no key) or a BYO LLM (server-side key).
export function describeExtractor(env = {}) {
  const configured = String(env.AI_ADAPTER ?? "deterministic").toLowerCase();
  const hasByoKey = Boolean(env.AI_API_KEY && String(env.AI_API_KEY).length > 0);
  // A live OpenAI key (used by the real-LLM path) is a first-class trigger, so
  // the reported engine reflects the live model when the key is present.
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY && String(env.OPENAI_API_KEY).length > 0);
  const hasWorkersAi = Boolean(env.AI);
  let engine = "deterministic";
  if (hasOpenAiKey) engine = "openai-llm";
  else if (configured === "live" && hasByoKey) engine = "byo-llm";
  else if (hasWorkersAi) engine = "workers-ai";
  return {
    engine,
    credentialed: hasOpenAiKey || hasByoKey,
    requiresApiKey: engine === "byo-llm",
    grounding: "span-verified",
    humanApproval: true,
    ocrCapable: engine !== "deterministic",
  };
}

// Main entry: parse an upload and return a grounded, Draft source object
// ready for human review and, once approved, course generation.
export function extractKnowledge(input, options = {}) {
  const rawText = typeof input.text === "string" ? input.text : "";
  const text = normalizeWhitespace(rawText);
  const binaryWithoutText = /pdf|word|image|png|jpeg/.test(String(input.mimeType ?? "")) && text.length === 0;

  if (text.length < 20) {
    return {
      ok: false,
      reason: binaryWithoutText ? "needs-ocr" : "empty",
      message: binaryWithoutText
        ? "Binary documents (PDF/DOCX/images) need the OCR/AI extractor or pre-extracted text."
        : "Provide at least a short passage of document text to extract.",
      engine: describeExtractor(options.env),
    };
  }

  const title = input.title?.trim() || "Imported source";
  const moduleName = input.module?.trim() || (splitSections(text)[0]?.heading ?? "Imported content");
  const sections = splitSections(text);
  const chunks = chunkText(text);
  const explanation = deriveExplanation(text);
  const procedureRaw = deriveProcedure(text);
  const keywordsRaw = deriveKeywords(text);

  // Drop anything not span-verified against the source (no hallucination).
  const procedure = procedureRaw.filter((step) => verifyGrounding([step], text).grounded);
  const keywords = keywordsRaw.filter((keyword) => verifyGrounding([keyword], text).grounded);
  const grounding = verifyGrounding([...procedure, ...keywords], text);

  const source = {
    id: `up-${slugify(title)}`,
    organisationId: input.organisationId ?? null,
    title,
    description: `Imported from ${input.filename ?? "document"}.`,
    product: input.product ?? "",
    module: moduleName,
    intendedRole: input.intendedRole ?? "All roles",
    version: input.version ?? "1.0",
    status: "Draft",
    approvalStatus: "Pending",
    uploadDate: options.uploadDate ?? null,
    effectiveDate: null,
    contentOwner: input.contentOwner ?? "Imported",
    type: input.mimeType?.includes("pdf") ? "PDF document" : "Document",
    section: sections[0]?.heading || moduleName,
    keywords,
    extractedText: text.slice(0, 4000),
    explanation,
    procedure,
  };

  return {
    ok: true,
    source,
    chunks,
    grounding,
    engine: describeExtractor(options.env),
    summary: { sections: sections.length, chunks: chunks.length, procedureSteps: procedure.length, keywords: keywords.length },
  };
}
