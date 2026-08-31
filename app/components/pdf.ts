"use client";

// Client-side PDF text extraction (lazy-loaded pdfjs). This powers the core
// "docs -> immersive" motion: an author uploads a real PDF in the browser, the
// text is extracted here, then sent to the grounded ingestion pipeline.

type TextItem = { str: string; transform: number[]; hasEOL?: boolean };

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    try {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    } catch {
      // If the worker URL cannot be resolved, pdfjs falls back to the main
      // thread (slower but functional).
    }
    workerConfigured = true;
  }
  return pdfjs;
}

export type PdfExtractResult = { text: string; pages: number; chars: number };

// Extract readable text from a PDF File, grouping items into lines by their
// vertical position so paragraphs survive.
export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<PdfExtractResult> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = "";
    let lastY: number | null = null;
    for (const raw of content.items as TextItem[]) {
      if (typeof raw.str !== "string") continue;
      const y = raw.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ""; }
      line += raw.str;
      if (raw.hasEOL) { lines.push(line); line = ""; lastY = null; continue; }
      lastY = y;
    }
    if (line) lines.push(line);
    pageTexts.push(lines.join("\n"));
    onProgress?.(pageNumber, doc.numPages);
  }
  const text = pageTexts.join("\n\n");
  return { text, pages: doc.numPages, chars: text.length };
}
