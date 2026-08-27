// Shared types for the editor + architect components.

export type Citation = { sourceId: string; title: string; version: string; section: string };

export type StoredSource = {
  id: string;
  title: string;
  description: string;
  product: string;
  module: string;
  intendedRole: string;
  contentOwner: string;
  type: string;
  version: string;
  status: string;
  approvalStatus: string;
  section: string;
  extractedText: string;
  explanation: string;
  procedure: string[];
  keywords: string[];
  uploadDate: string | null;
  effectiveDate: string | null;
  documentType?: string | null;
  outline?: Array<{ section: string; summary: string; charCount: number }>;
  coverage?: Coverage | null;
};

export type Coverage = {
  charsTotal?: number;
  charsProcessed?: number;
  truncated?: boolean;
  sections?: number;
  outlineSections?: number;
  chunks?: number;
  sectionsCovered?: number;
  sectionsTotal?: number;
  outlineSectionsRaw?: number;
};

export type QuizQuestion = { id: string; question: string; options: string[]; correct?: number; citation: Citation };

export type LessonBlock =
  | { id: string; type: "text"; text: string; citation?: Citation }
  | { id: string; type: "callout"; tone: "info" | "warning" | "success"; text: string; citation?: Citation }
  | { id: string; type: "image"; url: string; key?: string; alt: string; caption: string; citation?: Citation }
  | { id: string; type: "video"; url: string; caption: string; citation?: Citation }
  | { id: string; type: "embed"; url: string; caption: string; citation?: Citation }
  | { id: string; type: "quiz"; question: string; options: string[]; correct: number; citation?: Citation }
  | { id: string; type: "procedure-diagram"; title: string; steps: string[]; citation?: Citation }
  | { id: string; type: "simulation-step"; label: string; hint: string; coaching: string; citation?: Citation };

export type BlockType = LessonBlock["type"];

export type CourseModule = { id: string; label: string; title: string; duration: number; citation: Citation };
export type CourseLesson = { id: string; moduleId?: string; title: string; content: string; label: string; citation: Citation; blocks?: LessonBlock[] };

export type GeneratedCourse = {
  ok?: boolean;
  kind?: string;
  programme: { id: string; title: string; role: string; status: string; approvalStatus: string; kind?: string; citation: Citation };
  modules: CourseModule[];
  lessons: CourseLesson[];
  diagnostic: unknown[];
  assessment: { id?: string; passThreshold: number; questions: QuizQuestion[] };
  simulation: { id?: string; title: string; kind?: string; prompt?: string; steps: Array<{ label: string; hint: string; coaching: string }>; citation: Citation };
  provenance: { generator: string; grounded: boolean; kind?: string; sourceVersion: string; sourceSection: string };
  citation: Citation;
  coverage?: Coverage | null;
  reviewChecklist: string[];
};

export type StoredCourse = { id: string; sourceId: string; title: string; role: string; status: string; approvalStatus: string; course: GeneratedCourse; createdAt: string };

export type SessionUser = { userId: string; email: string; displayName: string; role: string; organisationId: string };

export type BlueprintModule = {
  id: string;
  title: string;
  objective: string;
  durationMinutes: number;
  difficulty: string;
  prerequisiteIds: string[];
  rationale: string;
  sectionRef?: string;
};

export type Blueprint = {
  ok: boolean;
  sourceId: string;
  title: string;
  documentType: string;
  difficulty: string;
  estimatedMinutes: number;
  rationale: string;
  modules: BlueprintModule[];
  editable?: boolean;
  engine?: string;
};

export type EditorHint = {
  id: string;
  type: string;
  severity: "info" | "suggestion" | "warning";
  target: { kind: string; id: string };
  message: string;
  apply: { action: string; lessonId?: string; copilotAction?: string };
};

export type BrandKit = {
  organisationId?: string;
  workspaceName: string;
  logoKey: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
};
