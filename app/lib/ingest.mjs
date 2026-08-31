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
//  - Large documents are covered, not truncated: long inputs are split into
//    structure-aware sections and chunks so a multi-section course can be
//    built across the whole document (see `outlineDocument` + `coverage`).
//  - Junk in, nothing out: garbled / binary / low-signal text is refused by a
//    quality gate rather than turned into a "successful" course of noise.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "are", "was", "were", "will",
  "have", "has", "had", "not", "but", "can", "may", "any", "all", "our", "their", "his", "her", "its", "a",
  "an", "of", "to", "in", "on", "or", "is", "it", "be", "as", "at", "by", "if", "so", "do", "up", "out",
  "then", "than", "when", "where", "which", "who", "how", "what", "each", "only", "also", "use", "using",
  "means", "such", "must", "shall", "section", "act", "may", "per", "under", "upon", "other", "been",
]);

const IMPERATIVE_VERBS = ["open", "select", "choose", "enter", "review", "click", "configure", "add", "send", "save", "confirm", "activate", "navigate", "upload", "set", "create", "assign", "apply", "verify", "refresh", "publish", "approve", "complete", "submit", "download", "install", "register", "sign", "enable", "disable", "update", "delete", "remove", "check"];

// How much normalised document text we persist per source. Generous enough to
// cover a long statute in full (the QA document is ~133k chars) while still a
// sane upper bound to protect the row size.
export const STORE_TEXT_MAX = 500000;

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

// Does the document use Markdown ATX headings? When it does we trust them and
// keep the original behaviour; otherwise we fall back to structural detection
// (legal sections, chapters, ALL-CAPS headings) so unstructured PDFs/statutes
// still split into meaningful sections.
function hasMarkdownHeadings(lines) {
  return lines.some((line) => /^#{1,6}\s+\S/.test(line));
}

// Classify a single line as a structural heading (for non-Markdown docs).
// Returns { heading, rest } — where `rest` is any inline body text that shared
// the heading's line (common in dense legal PDFs: "1. Definitions.—In this
// Act...") — or null when the line is ordinary body content.
function structuralHeading(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // "CHAPTER 2", "PART III", "SCHEDULE 1", "ARRANGEMENT OF SECTIONS".
  if (/^(chapter|part|schedule|annexure|appendix)\s+[0-9ivxlc]+/i.test(trimmed)) return { heading: trimmed, rest: "" };
  // Legal / numbered section heading: "5. Admission to public schools",
  // "16A. Functions and responsibilities of principal". The title portion is
  // short and does not read like a full imperative sentence (which would be a
  // procedure step, not a heading).
  const numbered = trimmed.match(/^(\d{1,3}[A-Z]?)\.\s+(.+)$/);
  if (numbered) {
    let title = numbered[2];
    let rest = "";
    // The ".—" (period + em-dash) convention separates a legal heading from
    // its inline text; split there so the body is not swallowed by the title.
    const dash = title.match(/^(.*?)\.\u2014\s*(.*)$/);
    if (dash) {
      title = dash[1];
      rest = dash[2];
    }
    title = title.replace(/\.$/, "").trim();
    const words = title.split(/\s+/);
    const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, "");
    const isImperative = IMPERATIVE_VERBS.includes(firstWord);
    if (!isImperative && title.length >= 3 && title.length <= 90 && words.length <= 14 && /^[A-Za-z]/.test(title)) {
      return { heading: `${numbered[1]}. ${title}`, rest };
    }
    return null;
  }
  // ALL-CAPS standalone heading (allow digits/punctuation), e.g. "DEFINITIONS
  // AND APPLICATION OF ACT". Require several letters and mostly uppercase.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && trimmed.length <= 70 && letters === letters.toUpperCase() && /^[A-Z0-9]/.test(trimmed) && trimmed.split(/\s+/).length <= 10) {
    return { heading: trimmed, rest: "" };
  }
  return null;
}

// Split into { heading, content } sections. Uses Markdown headings when the
// document has them; otherwise detects structural (legal/chapter/caps)
// headings; otherwise groups by blank lines into a single "General" section.
export function splitSections(text) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized.split("\n");
  const markdown = hasMarkdownHeadings(lines);
  const sections = [];
  let current = { heading: "", content: [] };
  const push = () => {
    if (current.heading || current.content.join("\n").trim()) {
      sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
    }
  };
  for (const line of lines) {
    let detected = null;
    if (markdown) {
      const md = line.match(/^#{1,6}\s+(.*)$/);
      detected = md ? { heading: md[1].trim(), rest: "" } : null;
    } else {
      detected = structuralHeading(line);
    }
    if (detected) {
      push();
      current = { heading: detected.heading, content: detected.rest ? [detected.rest] : [] };
    } else {
      current.content.push(line);
    }
  }
  push();
  return sections.filter((section) => section.heading || section.content);
}

// A whole-document outline: ordered sections that carry real content, each
// with a one-line summary and size. Deduplicates repeated titles (e.g. a
// legal "Arrangement of Sections" table of contents that mirrors the body)
// by preferring the occurrence with the most content.
export function outlineDocument(text, { maxSections = 40, minContentChars = 80 } = {}) {
  const sections = splitSections(text);
  const byHeading = new Map();
  let order = 0;
  for (const section of sections) {
    const heading = (section.heading || "General").replace(/\s+/g, " ").trim();
    const content = section.content.replace(/\s+/g, " ").trim();
    if (content.length < minContentChars) continue;
    const existing = byHeading.get(heading.toLowerCase());
    // Keep (and re-order to) the richest occurrence of each heading, so a body
    // section wins over a thin table-of-contents entry with the same title.
    if (!existing || content.length > existing.charCount) {
      byHeading.set(heading.toLowerCase(), {
        section: heading,
        summary: content.slice(0, 240),
        charCount: content.length,
        order,
      });
    }
    order += 1;
  }
  return [...byHeading.values()]
    .sort((a, b) => a.order - b.order)
    .slice(0, maxSections)
    .map(({ section, summary, charCount }) => ({ section, summary, charCount }));
}

// Retrieval-sized chunks with a section label and token estimate. Long
// sections are further split so no chunk exceeds maxChars — this is what makes
// multi-chunk extraction of large documents possible.
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
      // A single paragraph larger than the budget is hard-split so it is not lost.
      if (paragraph.length > maxChars) {
        flush();
        for (let i = 0; i < paragraph.length; i += maxChars) {
          const slice = paragraph.slice(i, i + maxChars).trim();
          if (slice) chunks.push({ section: label, content: slice, tokenCount: estimateTokens(slice) });
        }
        continue;
      }
      if ((buffer + paragraph).length > maxChars) flush();
      buffer += (buffer ? "\n\n" : "") + paragraph;
    }
    flush();
  }
  return chunks;
}

export function deriveExplanation(text) {
  for (const section of splitSections(text)) {
    const firstParagraph = section.content.split(/\n{2,}/).map((p) => p.trim()).find((p) => p && p.length > 40);
    if (firstParagraph) return firstParagraph.replace(/\s+/g, " ").slice(0, 400);
  }
  for (const section of splitSections(text)) {
    const firstParagraph = section.content.split(/\n{2,}/).map((p) => p.trim()).find(Boolean);
    if (firstParagraph) return firstParagraph.replace(/\s+/g, " ").slice(0, 400);
  }
  return normalizeWhitespace(text).slice(0, 400);
}

// Ordered, approved-looking steps: prefer numbered/bulleted lines inside
// section CONTENT (never section headings), then fall back to imperative
// sentences. Excluding headings is what stops a statute's numbered section
// titles ("1. Definitions") from being mistaken for procedure "actions".
export function deriveProcedure(text, { max = 8 } = {}) {
  const sections = splitSections(text);
  const contentLines = sections
    .flatMap((section) => section.content.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered = contentLines.filter((line) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line)).map(stripListMarker);
  let steps = numbered;
  if (steps.length < 2) {
    const prose = sections.map((section) => section.content).join(" ").replace(/\n+/g, " ");
    const sentences = prose.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
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

// Classify the document so authoring can adapt: a "procedure" has real ordered
// actions; a "reference" (policy, statute, definitions, FAQ) is knowledge to
// understand rather than a workflow to rehearse.
export function deriveDocumentType(text, procedure = deriveProcedure(text)) {
  const normalized = normalizeWhitespace(text);
  const numberedContentLines = splitSections(text)
    .flatMap((section) => section.content.split("\n"))
    .filter((line) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line.trim())).length;
  const proceduralSignal = procedure.length + Math.min(numberedContentLines, 6);
  const referenceSignal = (normalized.match(/\b(shall|means|hereby|whereas|pursuant|in terms of|subsection|regulation|policy|means—)\b/gi) ?? []).length;
  if (proceduralSignal >= 3 && proceduralSignal >= referenceSignal / 4) return "procedure";
  return "reference";
}

// Quality gate: reject garbled / binary / low-signal text before it becomes a
// "successful" draft. Returns a signal score in [0,1] and a boolean `ok`.
export function assessInputQuality(text) {
  const raw = String(text ?? "");
  const total = raw.length;
  if (total < 20) return { ok: false, score: 0, reason: "too-short", signals: { total } };

  const letters = (raw.match(/[A-Za-z]/g) ?? []).length;
  const letterRatio = letters / total;
  // Replacement character + non-printable control characters signal binary /
  // mojibake input. The control-character class is intentional here.
  // eslint-disable-next-line no-control-regex
  const replacementChars = (raw.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  const replacementRatio = replacementChars / total;

  const words = normalizeWhitespace(raw).split(/\s+/).filter(Boolean);
  // A "word-like" token is mostly letters and contains a vowel — the simplest
  // reliable proxy for natural language across English legal/prose text.
  const wordLike = words.filter((word) => {
    const alpha = word.replace(/[^A-Za-z]/g, "");
    return alpha.length >= 2 && alpha.length <= 24 && /[aeiouAEIOU]/.test(alpha) && alpha.length / word.length >= 0.6;
  });
  const wordLikeRatio = wordLike.length / Math.max(1, words.length);
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / Math.max(1, words.length);
  // Longest run of consecutive non-space, non-letter characters (base64 / hex
  // dumps and binary blobs produce very long such runs).
  const longestGibberishRun = Math.max(0, ...(raw.match(/[^\sA-Za-z]{1,}/g) ?? []).map((run) => run.length));

  const signals = { total, letterRatio, replacementRatio, wordLikeRatio, avgWordLength, longestGibberishRun, words: words.length };

  const score = Math.max(0, Math.min(1,
    0.45 * Math.min(1, letterRatio / 0.6) +
    0.45 * Math.min(1, wordLikeRatio / 0.6) +
    0.10 * (avgWordLength >= 2 && avgWordLength <= 14 ? 1 : 0),
  ));

  const ok =
    letterRatio >= 0.5 &&
    wordLikeRatio >= 0.5 &&
    replacementRatio < 0.02 &&
    avgWordLength >= 2 && avgWordLength <= 16 &&
    longestGibberishRun <= 40 &&
    words.length >= 8;

  return { ok, score: Number(score.toFixed(3)), reason: ok ? "ok" : "low-signal", signals };
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

  // Junk-input gate: refuse garbled / binary / low-signal text instead of
  // manufacturing a course from noise.
  const quality = assessInputQuality(text);
  if (!quality.ok) {
    return {
      ok: false,
      reason: "low-signal",
      message: "This text does not look like readable document content. Upload a clear text/PDF source (or run OCR first) so knowledge can be extracted.",
      quality,
      engine: describeExtractor(options.env),
    };
  }

  const title = input.title?.trim() || "Imported source";
  const sections = splitSections(text);
  const outline = outlineDocument(text);
  const chunks = chunkText(text);
  const moduleName = input.module?.trim() || outline[0]?.section || sections[0]?.heading || "Imported content";
  const explanation = deriveExplanation(text);
  const procedureRaw = deriveProcedure(text);
  const keywordsRaw = deriveKeywords(text);
  const documentType = deriveDocumentType(text, procedureRaw);

  // Drop anything not span-verified against the source (no hallucination).
  const procedure = procedureRaw.filter((step) => verifyGrounding([step], text).grounded);
  const keywords = keywordsRaw.filter((keyword) => verifyGrounding([keyword], text).grounded);
  const grounding = verifyGrounding([...procedure, ...keywords], text);

  const storedText = text.slice(0, STORE_TEXT_MAX);
  const coverage = {
    charsTotal: text.length,
    charsProcessed: storedText.length,
    truncated: text.length > storedText.length,
    sections: sections.length,
    outlineSections: outline.length,
    chunks: chunks.length,
  };

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
    extractedText: storedText,
    explanation,
    procedure,
    documentType,
    outline,
    coverage,
  };

  return {
    ok: true,
    source,
    chunks,
    outline,
    coverage,
    documentType,
    grounding,
    quality,
    engine: describeExtractor(options.env),
    summary: {
      sections: sections.length,
      outlineSections: outline.length,
      chunks: chunks.length,
      procedureSteps: procedure.length,
      keywords: keywords.length,
      charsTotal: coverage.charsTotal,
      charsProcessed: coverage.charsProcessed,
      documentType,
    },
  };
}
