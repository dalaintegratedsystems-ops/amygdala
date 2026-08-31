"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deriveEditorHints } from "../lib/architect.mjs";
import { generateProcedureDiagramSvg } from "../lib/simulation.mjs";
import { BlueprintProposer, ConfidenceChip, CopilotBar, CoveragePanel, HintsPanel } from "./CourseArchitect";
import { LessonBlockEditor, newBlock } from "./LessonBlockEditor";
import { SourceExtractor } from "./SourceExtractor";
import { BrandKitPanel } from "./BrandKit";
import { extractPdfText } from "./pdf";
import type { Blueprint, CoverageReport, EditorHint, GeneratedCourse, LessonBlock, StoredSource, TypedKnowledge } from "./types";

const SAMPLE_DOC = `# Configure a workflow automation

Automations run an approved action when a trigger event happens.

1. Open Workflows from the primary navigation.
2. Select New automation.
3. Choose an approved trigger and configure its conditions.
4. Choose an action and complete its required fields.
5. Review the automation summary.
6. Select Activate.`;

type ExtractedResult = {
  ok: boolean;
  source: StoredSource;
  coverage?: { charsTotal?: number; charsProcessed?: number; truncated?: boolean; sections?: number; chunks?: number; outlineSections?: number };
  documentType?: string;
  grounding: { grounded: boolean; groundedCount: number; total: number };
  engine: { engine: string };
  summary: { chunks: number; procedureSteps: number; keywords: number; charsTotal?: number; charsProcessed?: number; outlineSections?: number };
  types?: TypedKnowledge;
};

// Ensure every lesson has an editable blocks array (seeded from its text).
function withBlocks(course: GeneratedCourse): GeneratedCourse {
  return {
    ...course,
    lessons: course.lessons.map((lesson) => ({
      ...lesson,
      blocks: lesson.blocks && lesson.blocks.length ? lesson.blocks : [newBlock("text", lesson.citation, { text: lesson.content }) as LessonBlock],
    })),
  };
}

const STEPS = ["Upload", "Review AI draft", "Brand & publish"];

export function CourseWizard({ onPreviewLearner }: { onPreviewLearner: () => void }) {
  const [step, setStep] = useState(0);

  // Upload state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [pdfNote, setPdfNote] = useState("");
  const [extracted, setExtracted] = useState<ExtractedResult | null>(null);
  const [sourcePublished, setSourcePublished] = useState(false);

  // Existing approved sources
  const [approvedSources, setApprovedSources] = useState<StoredSource[]>([]);
  const [sourceId, setSourceId] = useState("");

  // Course state
  const [course, setCourse] = useState<GeneratedCourse | null>(null);
  const [courseId, setCourseId] = useState("");
  const [activeSourceId, setActiveSourceId] = useState("");
  const [activeSource, setActiveSource] = useState<StoredSource | null>(null);
  const [published, setPublished] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [busyHintId, setBusyHintId] = useState("");
  const [activeLessonId, setActiveLessonId] = useState("");
  const [coverage, setCoverage] = useState<CoverageReport | undefined>(undefined);
  const [coverageBusy, setCoverageBusy] = useState(false);

  const applyApproved = useCallback((sources: StoredSource[]) => {
    const approved = sources.filter((source) => source.status === "Published" && source.approvalStatus === "Approved");
    setApprovedSources(approved);
    setSourceId((current) => current || approved[0]?.id || "");
  }, []);
  const reloadApproved = useCallback(() => {
    fetch("/api/sources").then((response) => (response.ok ? response.json() : { sources: [] })).then((data) => applyApproved(data.sources ?? [])).catch(() => {});
  }, [applyApproved]);
  useEffect(() => {
    let active = true;
    fetch("/api/sources").then((response) => (response.ok ? response.json() : { sources: [] })).then((data) => { if (active) applyApproved(data.sources ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [applyApproved]);

  async function readFile(file?: File) {
    if (!file) return;
    setUploadTitle((previous) => previous || file.name.replace(/\.[^.]+$/, ""));
    setPdfNote("");
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setPdfNote("Extracting text from PDF…");
      try {
        const result = await extractPdfText(file, (page, total) => setPdfNote(`Extracting text from PDF… page ${page}/${total}`));
        setUploadText(result.text);
        setPdfNote(`Extracted ${result.chars.toLocaleString()} characters from ${result.pages} pages.`);
      } catch {
        setPdfNote("Could not read this PDF in the browser. Paste the text instead.");
      }
      return;
    }
    setUploadText(await file.text());
  }

  async function extract() {
    setExtracting(true); setExtractError(""); setExtracted(null); setSourcePublished(false); setCourse(null);
    const isPdfName = /\.pdf$/i.test(uploadTitle);
    const payload = { title: uploadTitle || "Imported source", filename: uploadTitle || "document", mimeType: isPdfName ? "application/pdf" : "text/markdown", text: uploadText };
    try {
      const response = await fetch("/api/sources/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Extraction failed"); }
      setExtracted((await response.json()) as ExtractedResult);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Provide document text to extract.");
    } finally { setExtracting(false); }
  }

  async function publishSource() {
    if (!extracted) return;
    const response = await fetch("/api/sources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: extracted.source.id, status: "Published", approvalStatus: "Approved" }) });
    if (response.ok) { setSourcePublished(true); reloadApproved(); }
  }

  const startEditing = useCallback((generated: GeneratedCourse, id: string, sourceRef: string, source: StoredSource | null) => {
    const prepared = withBlocks(generated);
    setCourse(prepared);
    setCourseId(id);
    setActiveSourceId(sourceRef);
    setActiveSource(source);
    setActiveLessonId(prepared.lessons[0]?.id ?? "");
    setCoverage(prepared.coverageReport);
    setPublished(false);
    setStep(1);
  }, []);

  const recheckCoverage = useCallback(async () => {
    if (!course) return;
    setCoverageBusy(true);
    try {
      const payload = activeSource ? { source: activeSource, course } : { sourceId: activeSourceId, course };
      const response = await fetch("/api/authoring/coverage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (data.report) setCoverage(data.report as CoverageReport);
    } finally { setCoverageBusy(false); }
  }, [course, activeSource, activeSourceId]);

  async function generate(fromSourceId: string, blueprint?: Blueprint) {
    if (!fromSourceId) return;
    setGenerating(true); setExtractError("");
    try {
      const response = await fetch("/api/authoring/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId: fromSourceId, approve: false }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Generation failed"); }
      const data = (await response.json()) as { course: GeneratedCourse; courseId: string };
      let generated = data.course;
      // Apply the author-accepted blueprint: override module titles/objectives in order.
      if (blueprint) {
        const bpModules = blueprint.modules.filter((module) => module.id !== "bp-validate");
        generated = { ...generated, modules: generated.modules.map((module, index) => (bpModules[index] ? { ...module, title: bpModules[index].title } : module)) };
      }
      const source = approvedSources.find((entry) => entry.id === fromSourceId) ?? (extracted?.source ?? null);
      startEditing(generated, data.courseId, fromSourceId, source);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Generation failed");
    } finally { setGenerating(false); }
  }

  // Debounced autosave of the edited course.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: GeneratedCourse, approve = false) => {
    if (!courseId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/courses/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, course: next, approve }) });
        setSaveState(response.ok ? `Saved ${new Date().toLocaleTimeString()}` : "Save failed");
      } catch { setSaveState("Save failed"); }
    }, approve ? 0 : 700);
  }, [courseId]);

  function mutateCourse(updater: (course: GeneratedCourse) => GeneratedCourse, approve = false) {
    setCourse((current) => {
      if (!current) return current;
      const next = updater(current);
      persist(next, approve);
      return next;
    });
  }

  function setLessonBlocks(lessonId: string, blocks: LessonBlock[]) {
    mutateCourse((current) => ({ ...current, lessons: current.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, blocks } : lesson)) }));
  }
  function setLessonTitle(lessonId: string, title: string) {
    mutateCourse((current) => ({ ...current, lessons: current.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, title } : lesson)) }));
  }
  function insertBlock(block: LessonBlock) {
    const target = activeLessonId || course?.lessons[0]?.id;
    if (!target) return;
    mutateCourse((current) => ({ ...current, lessons: current.lessons.map((lesson) => (lesson.id === target ? { ...lesson, blocks: [...(lesson.blocks ?? []), block] } : lesson)) }));
  }
  function addQuestions(questions: GeneratedCourse["assessment"]["questions"]) {
    mutateCourse((current) => ({ ...current, assessment: { ...current.assessment, questions: [...current.assessment.questions, ...questions] } }));
  }

  function applyHint(hint: EditorHint) {
    setBusyHintId(hint.id);
    try {
      if (hint.apply.action === "split-lesson" && hint.apply.lessonId) {
        mutateCourse((current) => {
          const lessonIndex = current.lessons.findIndex((lesson) => lesson.id === hint.apply.lessonId);
          if (lessonIndex < 0) return current;
          const lesson = current.lessons[lessonIndex];
          const blocks = lesson.blocks ?? [];
          const mid = Math.max(1, Math.ceil(blocks.length / 2));
          const first = { ...lesson, blocks: blocks.slice(0, mid) };
          const second = { ...lesson, id: `${lesson.id}-b`, title: `${lesson.title} (continued)`, blocks: blocks.slice(mid).length ? blocks.slice(mid) : [newBlock("text", lesson.citation, { text: "" }) as LessonBlock] };
          const lessons = [...current.lessons];
          lessons.splice(lessonIndex, 1, first, second);
          return { ...current, lessons };
        });
      } else if (hint.apply.action === "copilot" && hint.apply.copilotAction === "generate-questions") {
        (async () => {
          const source = activeSource;
          const response = await fetch("/api/authoring/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate-questions", text: "", ...(source ? { source } : { sourceId: activeSourceId }) }) });
          const data = await response.json().catch(() => ({}));
          if (data.questions?.length) addQuestions(data.questions);
          setBusyHintId("");
        })();
        return;
      }
    } finally {
      if (hint.apply.action !== "copilot") setBusyHintId("");
    }
  }

  async function publishCourse() {
    if (!course || !courseId) return;
    const response = await fetch("/api/courses/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, course, approve: true }) });
    if (response.ok) { setPublished(true); setSaveState("Published"); }
  }

  const hints = course ? (deriveEditorHints(course) as EditorHint[]) : [];
  const questionConfidence = new Map((coverage?.confidence.questions ?? []).map((entry) => [entry.id, entry.confidence]));
  const activeLesson = course?.lessons.find((lesson) => lesson.id === activeLessonId) ?? course?.lessons[0];
  const junkRejected = Boolean(extractError) && /readable document content|low-signal/i.test(extractError);

  return (
    <div className="page-content wizard">
      <div className="page-heading">
        <div><span className="eyebrow">Grounded authoring</span><h1>Create a course</h1><p>Upload a document, review the AI draft, then brand and publish. Every step stays grounded to your approved source.</p></div>
      </div>

      <ol className="wizard-steps" aria-label="Course creation steps">
        {STEPS.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "done" : ""}><span>{index < step ? "✓" : index + 1}</span>{label}</li>)}
      </ol>

      {step === 0 && (
        <section className="panel upload-studio">
          <div className="panel-header"><div><span className="tiny-label">Step 1 · Upload</span><h2>Add your source document</h2></div>{extracted && <span className="engine-badge">{extracted.engine.engine === "deterministic" ? "Deterministic" : extracted.engine.engine}</span>}</div>
          <div className="upload-studio-body">
            <div className="upload-inputs">
              <label className="studio-field"><span className="tiny-label">Document title</span><input aria-label="Document title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="e.g. South African Schools Act" /></label>
              <label className="studio-field"><span className="tiny-label">Paste text, or choose a PDF / TXT / MD file</span><textarea aria-label="Document text" value={uploadText} onChange={(event) => setUploadText(event.target.value)} rows={7} placeholder="Paste the approved document text here, or choose a file below…" /></label>
              <div className="upload-actions">
                <input id="doc-file" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" className="visually-hidden-file" onChange={(event) => readFile(event.target.files?.[0])} />
                <label htmlFor="doc-file" className="button button-secondary button-small">Choose file</label>
                <button type="button" className="button button-secondary button-small" onClick={() => { setUploadTitle("Configure a workflow automation"); setUploadText(SAMPLE_DOC); }}>Use sample</button>
                <button type="button" className="button button-primary" onClick={extract} disabled={extracting || uploadText.trim().length < 20}>{extracting ? "Extracting…" : "Extract knowledge with AI"} <span>✦</span></button>
              </div>
              {pdfNote && <p className="approved-note">{pdfNote}</p>}
              {extractError && <p className={junkRejected ? "signin-error junk-error" : "signin-error"} role="alert">{junkRejected ? `Rejected: ${extractError}` : extractError}</p>}
            </div>

            {extracted && extracted.ok && (
              <div className="extract-result">
                <div className="extract-head"><span className={`status-pill ${sourcePublished ? "published" : "ready-for-review"}`}><i />{sourcePublished ? "Published" : "Ready for review"}</span><span className="grounded-chip">{extracted.grounding.grounded ? "✓ Fully grounded" : `${extracted.grounding.groundedCount}/${extracted.grounding.total} grounded`}</span><span className="engine-badge small">{extracted.documentType ?? "document"}</span></div>
                <div className="coverage-bar">
                  <span className="tiny-label">Coverage</span>
                  <strong>{(extracted.summary.charsProcessed ?? 0).toLocaleString()} / {(extracted.summary.charsTotal ?? 0).toLocaleString()} characters</strong>
                  <small>{extracted.summary.outlineSections ?? 0} sections · {extracted.summary.chunks} chunks · {extracted.summary.keywords} keywords{extracted.coverage?.truncated ? " · truncated to storage limit" : " · full document"}</small>
                </div>
                <p className="extract-summary">{extracted.source.explanation}</p>
                <div className="keyword-chips">{extracted.source.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                {extracted.types && (
                  <div className="typed-knowledge">
                    <span className="tiny-label">Structured knowledge extracted</span>
                    <div className="typed-counts">
                      <span><strong>{extracted.types.counts.concepts}</strong> concepts</span>
                      <span><strong>{extracted.types.counts.definitions}</strong> definitions</span>
                      <span><strong>{extracted.types.counts.procedures}</strong> procedure steps</span>
                      <span><strong>{extracted.types.counts.entities}</strong> key entities</span>
                    </div>
                    {extracted.types.definitions.length > 0 && (
                      <ul className="typed-definitions">
                        {extracted.types.definitions.slice(0, 4).map((entry) => <li key={entry.term}><strong>{entry.term}</strong> — {entry.definition}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                <div className="extract-cta">
                  {!sourcePublished ? <button type="button" className="button button-secondary" onClick={publishSource}>Approve &amp; publish source</button> : <span className="approved-note">✓ Source published</span>}
                  <button type="button" className="button button-primary" onClick={() => { setStep(1); }} disabled={!sourcePublished}>Continue to AI draft →</button>
                </div>
              </div>
            )}
          </div>

          <div className="wizard-or">
            <span>or start from an already-approved source</span>
            <div className="studio-toolbar-inline">
              <select aria-label="Choose an approved source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                {approvedSources.length === 0 && <option value="">No approved sources yet</option>}
                {approvedSources.map((source) => <option key={source.id} value={source.id}>{source.title} · v{source.version}</option>)}
              </select>
              <button type="button" className="button button-secondary" onClick={() => setStep(1)} disabled={!sourceId}>Use this source →</button>
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <div className="wizard-review">
          {!course ? (
            <>
              <BlueprintProposer sourceId={sourcePublished ? extracted?.source.id ?? sourceId : sourceId} source={sourcePublished ? extracted?.source : undefined} onAccept={(blueprint) => generate(sourcePublished ? extracted?.source.id ?? sourceId : sourceId, blueprint)} />
              <div className="wizard-back-row">
                <button type="button" className="button button-secondary" onClick={() => setStep(0)}>← Back</button>
                <button type="button" className="button button-primary" onClick={() => generate(sourcePublished ? extracted?.source.id ?? sourceId : sourceId)} disabled={generating}>{generating ? "Generating…" : "Skip blueprint & generate"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="studio-stats vault-stats">
                <div><strong>{course.modules.length}</strong><span>Modules</span></div>
                <div><strong>{course.lessons.length}</strong><span>Lessons</span></div>
                <div><strong>{course.assessment.questions.length}</strong><span>Assessment items</span></div>
                <div><strong>{course.coverage?.sectionsCovered ?? course.simulation.steps.length}</strong><span>{course.coverage ? "Sections covered" : "Simulation steps"}</span></div>
              </div>

              <div className="editor-grid">
                <section className="panel studio-course editor-lessons">
                  <div className="panel-header"><div><span className="tiny-label">Draft programme · {saveState || "autosaves as you edit"}</span><h2>{course.programme.title}</h2></div><span className={`status-pill ${published ? "published" : "draft"}`}><i />{published ? "Published" : "Draft"}</span></div>
                  <div className="provenance-chip"><span>▣</span><span><strong>Grounded generation</strong><small>cites {course.citation.title} v{course.provenance.sourceVersion}{course.coverage ? ` · ${course.coverage.sectionsCovered}/${course.coverage.sectionsTotal} sections` : ""}</small></span></div>

                  {course.lessons.map((lesson) => (
                    <div className={`editor-lesson ${activeLessonId === lesson.id ? "active" : ""}`} key={lesson.id} onFocusCapture={() => setActiveLessonId(lesson.id)}>
                      <input aria-label="Lesson title" className="editor-lesson-title" value={lesson.title} onChange={(event) => setLessonTitle(lesson.id, event.target.value)} />
                      <LessonBlockEditor blocks={lesson.blocks ?? []} citation={lesson.citation} onChange={(blocks) => setLessonBlocks(lesson.id, blocks)} />
                      {activeSource && <CopilotBar sourceId={activeSourceId} source={activeSource} text={(lesson.blocks ?? []).map((block) => ("text" in block ? block.text : "")).join("\n\n")} onApplyText={(text) => setLessonBlocks(lesson.id, [newBlock("text", lesson.citation, { text }) as LessonBlock, ...(lesson.blocks ?? []).filter((block) => block.type !== "text")])} onAddQuestions={addQuestions} />}
                    </div>
                  ))}

                  <div className="studio-assessment"><span className="tiny-label">Assessment · pass threshold {course.assessment.passThreshold}%{course.pedagogy ? ` · ${course.pedagogy.questionTypes.length} question types` : ""}</span>{course.assessment.questions.map((question) => {
                    const conf = questionConfidence.get(question.id);
                    return (
                      <div className="studio-question" key={question.id}>
                        <div className="studio-question-head">
                          {question.type && <span className="q-tag">{question.type}</span>}
                          {question.difficulty && <span className="q-tag q-difficulty">{question.difficulty}</span>}
                          {question.bloom && <span className="q-tag q-bloom">Bloom: {question.bloom}</span>}
                          {conf !== undefined && <ConfidenceChip value={conf} />}
                        </div>
                        <strong>{question.question}</strong>
                        <em>Approved answer: {question.options[question.correct ?? 0]}</em>
                        {question.rationale && <p className="q-rationale">{question.rationale}</p>}
                      </div>
                    );
                  })}</div>
                </section>

                <aside className="editor-side">
                  <section className="panel">
                    <div className="panel-header"><div><span className="tiny-label">Architect hints</span><h3>Recommendations</h3></div></div>
                    <HintsPanel hints={hints} onApply={applyHint} busyId={busyHintId} />
                  </section>
                  <section className="panel">
                    <div className="panel-header"><div><span className="tiny-label">Grounding &amp; coverage</span><h3>Coverage check</h3></div>{coverage && <span className="engine-badge small">{coverage.coveragePercent}% covered</span>}</div>
                    <CoveragePanel report={coverage} onRecheck={recheckCoverage} busy={coverageBusy} />
                  </section>
                  {course.pedagogy && course.pedagogy.objectives.length > 0 && (
                    <section className="panel">
                      <div className="panel-header"><div><span className="tiny-label">Pedagogy</span><h3>Learning objectives</h3></div></div>
                      <ul className="objective-list">
                        {course.pedagogy.objectives.map((entry) => (
                          <li key={entry.moduleId}><span className={`q-tag q-bloom`}>{entry.bloom}</span> {entry.objective}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {activeSource && <section className="panel"><SourceExtractor source={activeSource} citation={activeLesson?.citation ?? course.citation} onInsert={insertBlock} /></section>}
                  <section className="panel studio-visual">
                    <span className="tiny-label">Simulation preview</span>
                    <h3>{course.simulation.title}</h3>
                    {course.simulation.steps.length > 0 && <div className="procedure-diagram" aria-hidden="true" dangerouslySetInnerHTML={{ __html: generateProcedureDiagramSvg(course.simulation.steps.map((step) => step.label), { title: course.simulation.title, accent: "violet" }) }} />}
                    <div className="review-checklist"><span className="tiny-label">Human review before publish</span><ul className="check-list">{course.reviewChecklist.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  </section>
                </aside>
              </div>

              <div className="wizard-back-row">
                <button type="button" className="button button-secondary" onClick={() => setStep(0)}>← Upload</button>
                <button type="button" className="button button-primary" onClick={() => setStep(2)}>Continue to brand &amp; publish →</button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="wizard-publish">
          <BrandKitPanel />
          <section className="panel">
            <div className="panel-header"><div><span className="tiny-label">Step 3 · Publish</span><h2>Review &amp; publish</h2></div><span className={`status-pill ${published ? "published" : "draft"}`}><i />{published ? "Published" : "Draft"}</span></div>
            <p className="model-note">Publishing makes this grounded course available to learners in your workspace. You can preview it as a learner first.</p>
            <div className="publish-cta">
              <button type="button" className="button button-secondary" onClick={onPreviewLearner}>Preview as learner</button>
              {published ? <span className="approved-note">✓ Published to the programme.</span> : <button type="button" className="button button-primary" onClick={publishCourse} disabled={!course}>Approve &amp; publish course →</button>}
            </div>
          </section>
          <div className="wizard-back-row"><button type="button" className="button button-secondary" onClick={() => setStep(1)}>← Back to editor</button></div>
        </div>
      )}
    </div>
  );
}
