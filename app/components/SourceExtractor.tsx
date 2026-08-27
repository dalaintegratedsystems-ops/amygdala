"use client";

import { useRef, useState } from "react";
import { newBlock } from "./LessonBlockEditor";
import type { Citation, LessonBlock, StoredSource } from "./types";

// Direct document extraction: select a passage in the source viewer, then
// insert it as a lesson block (keeping the citation) and optionally convert it
// to a diagram or a grounded quiz. This is the core "docs -> immersive" motion.
export function SourceExtractor({ source, citation, onInsert }: { source: StoredSource; citation: Citation; onInsert: (block: LessonBlock) => void }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  function captureSelection() {
    const text = typeof window !== "undefined" ? window.getSelection?.()?.toString().trim() ?? "" : "";
    // Only accept selections inside the viewer.
    const anchor = window.getSelection?.()?.anchorNode;
    const inside = anchor && viewerRef.current?.contains(anchor);
    if (text && inside) { setSelection(text.slice(0, 2000)); setNote(""); }
    else setNote("Select a passage inside the document panel first.");
  }

  function insertText(tone?: "info" | "warning" | "success") {
    if (!selection) { setNote("Select a passage first."); return; }
    const block = tone
      ? newBlock("callout", citation, { tone, text: selection })
      : newBlock("text", citation, { text: selection });
    onInsert(block);
    setNote("Inserted as a lesson block with its citation.");
  }

  function insertDiagram() {
    if (!selection) { setNote("Select a passage first."); return; }
    const steps = selection.split(/\n|(?<=[.;])\s+/).map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter((line) => line.length > 3).slice(0, 10);
    if (steps.length === 0) { setNote("No distinct steps found in the selection."); return; }
    onInsert(newBlock("procedure-diagram", citation, { title: source.section || source.title, steps }));
    setNote("Inserted as a procedure diagram.");
  }

  async function insertQuiz() {
    if (!selection) { setNote("Select a passage first."); return; }
    setBusy(true); setNote("");
    try {
      const response = await fetch("/api/authoring/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate-questions", text: selection, source }) });
      const data = await response.json().catch(() => ({}));
      const question = (data.questions ?? [])[0];
      if (question) {
        onInsert(newBlock("quiz", citation, { question: question.question, options: question.options, correct: question.correct ?? 0 }));
        setNote("Inserted a grounded quiz from the selection.");
      } else {
        setNote("Could not build a grounded quiz from that selection.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="source-extractor">
      <div className="panel-header"><div><span className="tiny-label">Document viewer</span><h3>Insert directly from the source</h3></div></div>
      <p className="model-note">Highlight a passage below, then insert it as a lesson block. The citation travels with it, so learners always see where content came from.</p>
      <div ref={viewerRef} className="source-viewer" onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0} role="textbox" aria-label="Source document text" aria-readonly="true">
        {(source.extractedText || "No extracted text available.").slice(0, 20000)}
      </div>
      <div className="extractor-toolbar">
        <span className="extractor-selection">{selection ? `Selected ${selection.length} characters` : "No selection"}</span>
        <div className="extractor-actions">
          <button type="button" className="button button-secondary button-small" onClick={() => insertText()} disabled={!selection}>Insert as text</button>
          <button type="button" className="button button-secondary button-small" onClick={() => insertText("info")} disabled={!selection}>As callout</button>
          <button type="button" className="button button-secondary button-small" onClick={insertDiagram} disabled={!selection}>As diagram</button>
          <button type="button" className="button button-secondary button-small" onClick={insertQuiz} disabled={!selection || busy}>{busy ? "Building…" : "As quiz"}</button>
        </div>
      </div>
      {note && <p className="approved-note">{note}</p>}
    </div>
  );
}
