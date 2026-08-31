"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { calculateReadiness } from "./lib/domain.mjs";
import { buildTranscript, generateProcedureDiagramSvg } from "./lib/simulation.mjs";
import { capabilityCatalog, platformRoleCapabilities, roleTiers } from "./lib/security.mjs";
import { competencyModels, defaultCompetencyModel } from "./lib/analytics.mjs";
import PromoIntro from "./PromoIntro";
import { CourseWizard } from "./components/CourseWizard";
import { SimulationBuilder } from "./components/SimulationBuilder";
import { SimulationRunner } from "./components/SimulationRunner";
import { useBrandKit } from "./components/BrandKit";
import { UserManagement } from "./components/UserManagement";
import { TeamsPanel } from "./components/TeamsPanel";
import { AccountProfile, CredentialWallet, MyAssignments } from "./components/LearnerHub";
import type { SimulationDefinition, SimOrigin, LearnerProgress } from "./components/types";

// All enterprise APIs authenticate via the HttpOnly session cookie (sent
// automatically on same-origin fetches); RBAC + tenant isolation are enforced
// server-side from the verified session, and all data is persisted in D1.

async function downloadResponse(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  triggerDownload(URL.createObjectURL(blob), filename);
}

function downloadJson(filename: string, data: unknown) {
  triggerDownload(URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), filename);
}

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

// ---- shared types ----------------------------------------------------

type Citation = { sourceId: string; title: string; version: string; section: string };

type StoredSource = {
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
};

type GeneratedCourse = {
  ok?: boolean;
  programme: { id: string; title: string; role: string; status: string; approvalStatus: string; citation: Citation };
  modules: Array<{ id: string; label: string; title: string; duration: number; citation: Citation }>;
  lessons: Array<{ id: string; title: string; content: string; label: string; citation: Citation }>;
  diagnostic: unknown[];
  assessment: { passThreshold: number; questions: Array<{ id: string; question: string; options: string[]; citation: Citation }> };
  simulation: { title: string; steps: Array<{ label: string; hint: string; coaching: string }>; citation: Citation };
  provenance: { generator: string; grounded: boolean; sourceVersion: string; sourceSection: string };
  citation: Citation;
  reviewChecklist: string[];
};

type StoredCourse = { id: string; sourceId: string; title: string; role: string; status: string; approvalStatus: string; course: GeneratedCourse; createdAt: string };

type SessionUser = { userId: string; email: string; displayName: string; role: string; organisationId: string };

// ---- small presentational helpers ------------------------------------

function ProcedureDiagram({ steps, title, accent = "cyan", captions = true }: { steps: string[]; title: string; accent?: string; captions?: boolean }) {
  const svg = generateProcedureDiagramSvg(steps, { title, accent });
  const transcript = buildTranscript(steps, { title });
  return (
    <figure className="procedure-figure">
      <div className="procedure-diagram" role="group" aria-label={`${title}: visual step-by-step flow`} dangerouslySetInnerHTML={{ __html: svg }} />
      <details className="procedure-transcript" open={captions}>
        <summary>Text transcript &amp; captions</summary>
        <ol>{transcript.captions.map((caption: { index: number; text: string }) => <li key={caption.index}>{caption.text}</li>)}</ol>
      </details>
    </figure>
  );
}

function useCountUp(value: string) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const match = String(value).match(/^(\D*)(\d[\d,]*\.?\d*)(.*)$/);
    if (!match || (typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced")) {
      const id = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(id);
    }
    const prefix = match[1];
    const target = parseFloat(match[2].replace(/,/g, ""));
    const suffix = match[3];
    const decimals = (match[2].split(".")[1] || "").length;
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = (target * eased).toFixed(decimals);
      setDisplay(`${prefix}${Number(current).toLocaleString(undefined, { minimumFractionDigits: decimals })}${suffix}`);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Amygdala home">
      <span className="brand-mark" aria-hidden="true"><Image src="/amygdala-logo-96.png" alt="" width={40} height={40} sizes="40px" priority unoptimized /></span>
      {!compact && <span className="brand-name">amygdala</span>}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone = value.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-pill ${tone}`}><i aria-hidden="true" />{value}</span>;
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties} aria-label={`${label}: ${value}%`}>
      <div><strong>{value}</strong><span>%</span></div>
    </div>
  );
}

function EmptyState({ icon = "✦", title, children, action }: { icon?: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel placeholder-panel empty-state-panel">
      <span className="feature-icon knowledge" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  );
}

function MetricCard({ label, value, change, tone = "cyan" }: { label: string; value: string; change: string; tone?: string }) {
  const shown = useCountUp(value);
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{tone === "cyan" ? "↗" : tone === "violet" ? "◎" : tone === "amber" ? "!" : "✓"}</span><span className="metric-label">{label}</span><strong>{shown}</strong><small>{change}</small></article>;
}

// ---- navigation ------------------------------------------------------

function navigate(path: string, setPath: (path: string) => void) {
  const updateRoute = () => {
    window.history.pushState({}, "", path);
    setPath(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "reduced";
  const transitionDocument = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  if (motionAllowed && transitionDocument.startViewTransition) transitionDocument.startViewTransition(updateRoute);
  else updateRoute();
}

const adminNavigation: Array<[string, string, string]> = [
  ["/admin/command-centre", "Command Centre", "◫"],
  ["/admin/knowledge-vault", "Knowledge Vault", "▣"],
  ["/admin/training-studio", "Training Studio", "✦"],
  ["/admin/simulations", "Simulations", "◇"],
  ["/admin/programmes", "Programmes", "▤"],
  ["/admin/people", "People", "☺"],
  ["/admin/teams", "Teams", "☰"],
  ["/admin/manager", "Manager", "↗"],
  ["/admin/ai-activity", "AI activity", "⌁"],
  ["/admin/analytics", "Analytics", "↗"],
  ["/admin/access", "Access & audit", "⚙"],
];

const learnerNavigation: Array<[string, string, string]> = [
  ["/learner/home", "My learning", "✦"],
  ["/learner/guide", "AI Product Guide", "⌁"],
  ["/learner/simulator", "Product Simulator", "◇"],
  ["/learner/assessment", "Assessment", "✓"],
  ["/learner/results", "Readiness", "◎"],
  ["/learner/wallet", "Credentials", "▣"],
  ["/learner/account", "Account", "☺"],
  ["/learner/profile", "Accessibility", "⚙"],
];

// ---- marketing shell (kept as-is; honest promo) ----------------------

const LANDING_SECTIONS = [
  ["how-it-works", "How it works"],
  ["trust", "AI trust"],
  ["readiness", "Readiness"],
] as const;

function goToLandingSection(id: string, path: string, setPath: (path: string) => void) {
  if (typeof window === "undefined") return;
  const hash = `#${id}`;
  if (path === "/" || path.startsWith("/#")) {
    window.history.replaceState({}, "", `/${hash}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  window.history.pushState({}, "", `/${hash}`);
  setPath("/");
}

function MarketingHeader({ path, setPath }: { path: string; setPath: (path: string) => void }) {
  return (
    <header className="marketing-header">
      <button className="plain-button" onClick={() => navigate("/", setPath)}><Brand /></button>
      <nav aria-label="Main navigation">
        {LANDING_SECTIONS.map(([id, label]) => (
          <a key={id} href={`/#${id}`} onClick={(event) => { event.preventDefault(); goToLandingSection(id, path, setPath); }}>{label}</a>
        ))}
      </nav>
      <button className="button button-small button-ghost" onClick={() => navigate(path === "/demo" ? "/" : "/demo", setPath)}>
        {path === "/demo" ? "Back to overview" : "Enter demo"}
      </button>
    </header>
  );
}

const universeZones = {
  learn: { number: "01", title: "Learn", subtitle: "Approved knowledge", detail: "Understand the product through evidence-backed explanations." },
  practise: { number: "02", title: "Practise", subtitle: "Safe simulations", detail: "Rehearse critical workflows inside a risk-free product twin." },
  validate: { number: "03", title: "Validate", subtitle: "Verified readiness", detail: "Connect knowledge and practical competence into readiness." },
} as const;

function UniverseVisual({ twoD = false }: { twoD?: boolean }) {
  const [activeZone, setActiveZone] = useState<keyof typeof universeZones>("practise");
  const active = universeZones[activeZone];
  return (
    <div className={`universe ${twoD ? "two-d" : ""}`} role="group" aria-label="Interactive capability map connecting Learn, Practise and Validate">
      <div className="universe-grid" />
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="capability-beam beam-learn" />
      <div className="capability-beam beam-practise" />
      <div className="capability-beam beam-validate" />
      <div className="universe-core"><span>Product</span><strong>capability</strong><i /></div>
      {(Object.entries(universeZones) as Array<[keyof typeof universeZones, typeof universeZones[keyof typeof universeZones]]>).map(([key, zone]) => <button type="button" key={key} className={`universe-node node-${key} ${activeZone === key ? "active" : ""}`} aria-pressed={activeZone === key} onClick={() => setActiveZone(key)}><i>{zone.number}</i><strong>{zone.title}</strong><span>{zone.subtitle}</span></button>)}
      <div className="guide-orb" aria-hidden="true"><span>AI</span></div>
      <div className="universe-readout" aria-live="polite"><i>{active.number}</i><span><strong>{active.title} zone active</strong><small>{active.detail}</small></span></div>
    </div>
  );
}

function Landing({ path, setPath }: { path: string; setPath: (path: string) => void }) {
  useEffect(() => {
    const id = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 80);
    return () => window.clearTimeout(timer);
  }, [path]);
  return (
    <div className="marketing-shell">
      <MarketingHeader path={path} setPath={setPath} />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Vendor-approved customer onboarding</div>
            <h1>Turn product knowledge into <em>customer capability.</em></h1>
            <p>Create immersive, AI-guided onboarding from your approved SaaS documentation. Help every customer understand your product, practise essential workflows and reach verified readiness faster.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => navigate("/demo", setPath)}>Enter Interactive Demo <span>→</span></button>
              <button className="button button-secondary" onClick={() => document.querySelector("#universe")?.scrollIntoView({ behavior: "smooth" })}>Explore the Training Universe</button>
            </div>
            <div className="trust-row">
              <span><i>✓</i> Approved sources only</span>
              <span><i>✓</i> Evidence with every answer</span>
              <span><i>✓</i> Isolated customer workspaces</span>
            </div>
          </div>
          <div id="universe" className="hero-visual"><UniverseVisual /></div>
        </section>

        <section className="section" id="how-it-works">
          <div className="section-heading centered"><span className="eyebrow">A controlled capability system</span><h2>From documentation to confident action.</h2><p>Amygdala connects what your product says, what your customer practises and what your team can verify.</p></div>
          <div className="feature-grid three">
            <article className="feature-card"><span className="feature-number">01</span><div className="feature-icon knowledge">▣</div><h3>Curate approved knowledge</h3><p>Upload product guidance, control versions and publish only material your teams have reviewed.</p><span className="card-link">Knowledge Vault <b>→</b></span></article>
            <article className="feature-card featured"><span className="feature-number">02</span><div className="feature-icon ai">⌁</div><h3>Guide every learner</h3><p>A product-specific guide explains concepts and procedures with visible supporting evidence.</p><span className="card-link">Grounded AI <b>→</b></span></article>
            <article className="feature-card"><span className="feature-number">03</span><div className="feature-icon practice">◇</div><h3>Practise before go-live</h3><p>Customers rehearse essential workflows in safe simulations, never in a production system.</p><span className="card-link">Product Simulator <b>→</b></span></article>
          </div>
        </section>

        <section className="section split-section" id="trust">
          <div className="trust-panel">
            <div className="trust-orb"><span>✓</span><i /></div>
            <div className="evidence-card evidence-one"><StatusPill value="Verified" /><strong>Grounded in your sources</strong><span>Title · version · section on every answer</span></div>
            <div className="evidence-card evidence-two"><span className="tiny-label">Retrieval boundary</span><strong>Your workspace only</strong><span>Approved + Published only</span></div>
          </div>
          <div className="split-copy">
            <span className="eyebrow">Vendor-controlled AI</span>
            <h2>Answers your customers can trust, and your team can trace.</h2>
            <p>The Product Guide stays inside the vendor’s authorised material. Unsupported questions are refused and routed for human review.</p>
            <ul className="check-list"><li>Tenant-isolated retrieval</li><li>Source title, version and section on every factual answer</li><li>Draft, archived and superseded content excluded</li><li>No numeric confidence theatre</li></ul>
            <button className="text-button" onClick={() => navigate("/demo", setPath)}>Experience a verified answer <span>→</span></button>
          </div>
        </section>

        <section className="section readiness-section" id="readiness">
          <div className="section-heading"><span className="eyebrow">Transparent readiness</span><h2>See who can use the product, not just who finished a course.</h2><p>Learning, practical competence and assessment results combine in a visible, fixed formula.</p></div>
          <div className="readiness-formula"><div><strong>30%</strong><span>Learning</span></div><b>+</b><div><strong>40%</strong><span>Simulation</span></div><b>+</b><div><strong>30%</strong><span>Assessment</span></div><b>=</b><div className="result"><strong>Ready</strong><span>Verified</span></div></div>
        </section>

        <section className="final-cta"><div className="cta-orbit" /><span className="eyebrow">Capability starts here</span><h2>Let customers learn your product by using it.</h2><p>Sign in as a workspace administrator, upload a source document and let AI draft your first grounded course.</p><button className="button button-primary" onClick={() => navigate("/demo", setPath)}>Enter Interactive Demo <span>→</span></button></section>
      </main>
      <footer><Brand /><p>Vendor-controlled, capability-first onboarding.</p><span>Prototype environment · No production systems connected</span></footer>
    </div>
  );
}

function DemoEntry({ setPath }: { setPath: (path: string) => void }) {
  return (
    <div className="marketing-shell demo-entry-page">
      <MarketingHeader path="/demo" setPath={setPath} />
      <main className="demo-entry">
        <div className="section-heading centered"><span className="eyebrow">Interactive pilot</span><h1>Choose your perspective.</h1><p>Sign in to a real, persistent workspace. A fresh workspace starts empty — upload a source and generate your first course.</p></div>
        <div className="role-grid">
          <button className="role-card vendor" onClick={() => navigate("/signin?as=admin", setPath)}>
            <span className="role-visual"><i>AD</i><b>Vendor</b></span><span className="role-copy"><small>Experience as</small><strong>Vendor Administrator</strong><em>Upload approved sources, generate grounded courses and track readiness.</em><span>Sign in to Command Centre →</span></span>
          </button>
          <button className="role-card learner" onClick={() => navigate("/signin?as=learner", setPath)}>
            <span className="role-visual"><i>LN</i><b>Learner</b></span><span className="role-copy"><small>Experience as</small><strong>Customer Learner</strong><em>Follow a published course, ask the Product Guide and practise safely.</em><span>Preview learning →</span></span>
          </button>
        </div>
        <div className="demo-note"><span>●</span><p><strong>Persistent workspace.</strong> Everything you upload and generate is stored and survives reloads. Simulations never connect to a live production system.</p></div>
      </main>
    </div>
  );
}

function Sidebar({ mode, path, setPath, session, mobileOpen, closeMobile }: { mode: "admin" | "learner"; path: string; setPath: (path: string) => void; session: SessionUser | null; mobileOpen: boolean; closeMobile: () => void }) {
  const nav = mode === "admin" ? adminNavigation : learnerNavigation;
  const name = session?.displayName ?? (mode === "admin" ? "Administrator" : "Learner");
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "A";
  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label={`${mode} navigation`}>
      <div className="sidebar-top"><button className="plain-button" onClick={() => navigate("/", setPath)}><Brand /></button><button className="mobile-close" onClick={closeMobile} aria-label="Close navigation">×</button></div>
      <div className="workspace-switcher"><span className="workspace-logo">{initials}</span><span><small>{mode === "admin" ? "Vendor workspace" : "Learning workspace"}</small><strong>Amygdala</strong></span><i>⌄</i></div>
      <nav>
        {nav.map(([href, label, icon]) => <button key={href} className={path === href ? "active" : ""} onClick={() => { navigate(href, setPath); closeMobile(); }}><i aria-hidden="true">{icon}</i><span>{label}</span>{path === href && <b />}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="environment-chip"><span /> Signed-in session</div>
        <button className="profile-chip" onClick={() => navigate(mode === "admin" ? "/admin/access" : "/learner/profile", setPath)}><span>{initials}</span><span><strong>{name}</strong><small>{session?.role ?? (mode === "admin" ? "Vendor Administrator" : "Customer Learner")}</small></span><i>•••</i></button>
        <button className="signout-button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}>Sign out</button>
      </div>
    </aside>
  );
}

function AppHeader({ mode, onMenu, onSwitch }: { mode: "admin" | "learner"; onMenu: () => void; onSwitch: () => void }) {
  return (
    <header className="app-header"><button className="menu-button" onClick={onMenu} aria-label="Open navigation">☰</button><div><span className="breadcrumb">Amygdala <b>/</b> {mode === "admin" ? "Vendor workspace" : "Learning workspace"}</span></div><div className="header-actions"><button className="button button-small button-ghost" onClick={onSwitch}>{mode === "admin" ? "Preview learner" : "Back to admin"}</button></div></header>
  );
}

function Shell({ mode, path, setPath, session, children }: { mode: "admin" | "learner"; path: string; setPath: (path: string) => void; session: SessionUser | null; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell"><Sidebar mode={mode} path={path} setPath={setPath} session={session} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} /><div className="app-main"><AppHeader mode={mode} onMenu={() => setMobileOpen(true)} onSwitch={() => navigate(mode === "admin" ? "/learner/home" : "/admin/command-centre", setPath)} />{children}</div>{mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}</div>
  );
}

// ---- admin: command centre -------------------------------------------

type Overview = {
  counts: { sources: number; publishedSources: number; readyForReview: number; courses: number; publishedCourses: number; auditEvents: number };
  aiActivity: Array<{ question: string; status: string; source: string; actor: string; createdAt: string }>;
  recentAudit: Array<{ id: string; eventType: string; entityType: string; entityId: string; detail: string; actor: string | null; createdAt: string }>;
};

function CommandCentre({ session, setPath }: { session: SessionUser | null; setPath: (path: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    fetch("/api/overview").then((response) => (response.ok ? response.json() : null)).then(setOverview).catch(() => setOverview(null));
  }, []);
  const counts = overview?.counts;
  const firstName = (session?.displayName ?? "there").split(/\s+/)[0];
  const emptyWorkspace = counts !== undefined && counts.sources === 0 && counts.courses === 0;

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Capability overview</span><h1>Welcome back, {firstName}.</h1><p>Here’s the current state of your grounded onboarding workspace.</p></div><div className="page-actions"><button className="button button-primary" onClick={() => navigate("/admin/training-studio", setPath)}>Create a course <span>＋</span></button></div></div>

      {emptyWorkspace && (
        <section className="upload-panel onboarding-panel">
          <div><span className="upload-icon">✦</span><strong>Get started in three steps</strong><p>1. Upload an approved source document. 2. Let AI extract grounded knowledge. 3. Generate and publish a course.</p></div>
          <button className="button button-primary" onClick={() => navigate("/admin/training-studio", setPath)}>Open Training Studio →</button>
        </section>
      )}

      <div className="metric-grid">
        <MetricCard label="Approved sources" value={`${counts?.publishedSources ?? 0}`} change={`${counts?.sources ?? 0} total in vault`} />
        <MetricCard label="Published courses" value={`${counts?.publishedCourses ?? 0}`} change={`${counts?.courses ?? 0} drafted`} tone="violet" />
        <MetricCard label="Awaiting review" value={`${counts?.readyForReview ?? 0}`} change="Sources pending approval" tone="amber" />
        <MetricCard label="Audit events" value={`${counts?.auditEvents ?? 0}`} change="Traceable actions logged" tone="green" />
      </div>

      <div className="dashboard-grid">
        <section className="panel readiness-overview"><div className="panel-header"><div><span className="tiny-label">Customer readiness</span><h2>Product access confidence</h2></div></div>
          <div className="empty-inline"><p>Learner readiness appears here once learners complete published courses. Readiness always uses the fixed 30% learning + 40% simulation + 30% assessment formula.</p></div>
          <div className="formula-note"><span>Fixed readiness formula</span><b>30% learning + 40% simulation + 30% assessment</b></div>
        </section>
        <section className="panel ai-summary"><div className="panel-header"><div><span className="tiny-label">AI Product Guide</span><h2>Evidence coverage</h2></div>{overview && overview.aiActivity.length > 0 && <StatusPill value="Traceable" />}</div>
          {overview && overview.aiActivity.length > 0 ? (
            <div className="summary-list">
              <div><span className="summary-icon verified">✓</span><span><strong>{overview.aiActivity.filter((item) => item.status === "Verified").length} verified answers</strong><small>Approved sources cited</small></span></div>
              <div><span className="summary-icon limited">◔</span><span><strong>{overview.aiActivity.filter((item) => item.status === "Limited guidance").length} limited guidance</strong><small>Human review suggested</small></span></div>
              <div><span className="summary-icon uncovered">!</span><span><strong>{overview.aiActivity.filter((item) => item.status === "Not covered").length} not covered</strong><small>Documentation gap</small></span></div>
            </div>
          ) : <div className="empty-inline"><p>No guide activity yet. Answers your learners receive are logged here with their grounding status.</p></div>}
        </section>
      </div>

      <section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Audit trail</span><h2>Recent workspace activity</h2></div><button className="text-button" onClick={() => navigate("/admin/access", setPath)}>Export audit →</button></div>
        <div className="table-scroll"><table><thead><tr><th>Event</th><th>Entity</th><th>Actor</th><th>Detail</th><th>Time</th></tr></thead><tbody>
          {(overview?.recentAudit ?? []).map((event) => <tr key={event.id}><td><strong>{event.eventType}</strong></td><td>{event.entityType}</td><td>{event.actor ?? "—"}</td><td className="detail-cell">{event.detail}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}
          {overview && overview.recentAudit.length === 0 && <tr><td colSpan={5}>No activity recorded yet.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}

// ---- admin: knowledge vault ------------------------------------------

function KnowledgeVault({ session }: { session: SessionUser | null }) {
  const [items, setItems] = useState<StoredSource[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All states");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    try {
      const response = await fetch("/api/sources");
      const data = response.ok ? await response.json() : { sources: [] };
      setItems(data.sources ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  const filtered = items.filter((item) => (status === "All states" || item.status === status) && `${item.title} ${item.module} ${item.type}`.toLowerCase().includes(query.toLowerCase()));
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0];

  async function handleFile(file?: File) {
    if (!file) return;
    const allowed = ["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/sources", { method: "POST", body: form });
      if (response.ok) { const data = await response.json(); setSelectedId(data.source.id); setUploadOpen(false); await reload(); }
    } finally { setBusy(false); }
  }

  async function transition(nextStatus: string, approvalStatus: string) {
    if (!selected || session?.role !== "Vendor Administrator") return;
    setBusy(true);
    try {
      const response = await fetch("/api/sources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, status: nextStatus, approvalStatus }) });
      if (response.ok) await reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Authorised material</span><h1>Knowledge Vault</h1><p>Control the approved sources that power onboarding and learner guidance.</p></div><button className="button button-primary" onClick={() => setUploadOpen((value) => !value)}>Upload source <span>＋</span></button></div>
      {uploadOpen && <section className="upload-panel"><div><span className="upload-icon">⇧</span><strong>Upload a training source</strong><p>PDF, DOCX, TXT, MD, PNG or JPG · maximum 10 MB. Files are stored in your workspace.</p></div><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" onChange={(event) => handleFile(event.target.files?.[0])} aria-label="Choose a training source" /><button className="button button-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? "Uploading…" : "Choose file"}</button></section>}

      {loading ? <EmptyState title="Loading sources…" /> : items.length === 0 ? (
        <EmptyState icon="▣" title="Your vault is empty" action={<button className="button button-primary" onClick={() => setUploadOpen(true)}>Upload your first source →</button>}>
          Upload an approved document, or extract knowledge from text in the Training Studio. Nothing is published until you approve it.
        </EmptyState>
      ) : (
        <>
          <div className="vault-stats"><div><strong>{items.filter((item) => item.status === "Published").length}</strong><span>Published sources</span></div><div><strong>{items.filter((item) => item.status === "Ready for review").length}</strong><span>Ready for review</span></div><div><strong>{items.filter((item) => item.status === "Draft").length}</strong><span>Drafts</span></div><div><strong>{items.length}</strong><span>Total sources</span></div></div>
          <div className="vault-layout">
            <section className="panel source-browser"><div className="vault-toolbar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approved knowledge" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by content state"><option>All states</option><option>Published</option><option>Ready for review</option><option>Draft</option><option>Archived</option></select></div><div className="source-list">{filtered.map((source) => <button key={source.id} className={selected?.id === source.id ? "selected" : ""} onClick={() => setSelectedId(source.id)}><span className={`file-type ${source.type.toLowerCase().includes("pdf") ? "pdf" : "doc"}`}>{source.type.toLowerCase().includes("pdf") ? "PDF" : "DOC"}</span><span className="source-summary"><strong>{source.title}</strong><small>{source.module} · v{source.version}</small><span><StatusPill value={source.status} /><em>{source.uploadDate}</em></span></span><i>›</i></button>)}{filtered.length === 0 && <div className="empty-state"><strong>No sources found</strong><span>Try a different search or content state.</span></div>}</div></section>
            {selected && <aside className="panel source-detail"><div className="source-detail-head"><div><span className="tiny-label">Source preview</span><h2>{selected.title}</h2></div></div><div className="metadata-grid"><span><small>Product</small><strong>{selected.product || "—"}</strong></span><span><small>Version</small><strong>{selected.version}</strong></span><span><small>Feature / module</small><strong>{selected.module}</strong></span><span><small>Intended role</small><strong>{selected.intendedRole}</strong></span><span><small>Content owner</small><strong>{selected.contentOwner || "—"}</strong></span><span><small>Effective date</small><strong>{selected.effectiveDate ?? "Not set"}</strong></span></div><div className="extracted-preview"><span className="tiny-label">Extracted content</span><p>{selected.extractedText || "No extracted text. Use the Training Studio to extract grounded knowledge from this document."}</p></div>{selected.procedure.length > 0 && <div className="extract-steps"><span className="tiny-label">Approved procedure</span><ol>{selected.procedure.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}<div className="source-actions">{selected.status === "Ready for review" && <><button className="button button-secondary" onClick={() => transition("Archived", "Rejected")} disabled={busy}>Reject</button><button className="button button-primary" onClick={() => transition("Approved", "Approved")} disabled={busy}>Approve</button></>}{selected.approvalStatus === "Approved" && selected.status !== "Published" && selected.status !== "Archived" && <button className="button button-primary" onClick={() => transition("Published", "Approved")} disabled={busy}>Publish approved source</button>}{selected.status === "Published" && <button className="button button-secondary" onClick={() => transition("Archived", "Approved")} disabled={busy}>Archive source</button>}<span className="isolation-note">⊙ Isolated to your workspace</span></div></aside>}
          </div>
        </>
      )}
    </div>
  );
}

// ---- admin: training studio ------------------------------------------
// The Training Studio is the CourseWizard (Upload → Review AI draft → Brand &
// publish). It is implemented in ./components/CourseWizard.tsx along with the
// block editor, architect and brand-kit UI to keep this file maintainable.

// ---- admin: programmes -----------------------------------------------

function Programmes({ setPath }: { setPath: (path: string) => void }) {
  const [courses, setCourses] = useState<StoredCourse[] | null>(null);
  useEffect(() => {
    fetch("/api/courses?status=all").then((response) => (response.ok ? response.json() : { courses: [] })).then((data) => setCourses(data.courses ?? [])).catch(() => setCourses([]));
  }, []);

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Training programmes</span><h1>Generated courses</h1><p>Every course is grounded to an approved source and human-reviewed before publish.</p></div><button className="button button-primary" onClick={() => navigate("/admin/training-studio", setPath)}>Create a course <span>＋</span></button></div>
      {courses === null ? <EmptyState title="Loading courses…" /> : courses.length === 0 ? (
        <EmptyState icon="▤" title="No courses yet" action={<button className="button button-primary" onClick={() => navigate("/admin/training-studio", setPath)}>Open Training Studio →</button>}>
          Generate your first grounded course from an approved source in the Training Studio.
        </EmptyState>
      ) : (
        <div className="programme-course-grid">
          {courses.map((entry) => (
            <section className="panel" key={entry.id}>
              <div className="panel-header"><div><span className="tiny-label">{entry.role || "Programme"}</span><h2>{entry.title}</h2></div><StatusPill value={entry.status} /></div>
              <div className="course-modules">{entry.course.modules.map((module, index) => <article key={module.id}><span className="module-order">0{index + 1}</span><span className={`module-symbol ${module.label.toLowerCase()}`}>{module.label === "Learn" ? "◫" : module.label === "Practise" ? "◇" : "✓"}</span><span><small>{module.label} · {module.duration} min</small><strong>{module.title}</strong></span></article>)}</div>
              <div className="provenance-chip"><span>▣</span><span><strong>Grounded to source</strong><small>cites {entry.course.citation.title} v{entry.course.citation.version}</small></span></div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- admin: AI activity ----------------------------------------------

function AIActivity() {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => { fetch("/api/overview").then((response) => (response.ok ? response.json() : null)).then(setOverview).catch(() => setOverview(null)); }, []);
  const items = overview?.aiActivity ?? [];
  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Traceable guidance</span><h1>AI activity</h1><p>Every answer, source and escalation in one human-reviewable record.</p></div></div>
      {overview === null ? <EmptyState title="Loading activity…" /> : items.length === 0 ? (
        <EmptyState icon="⌁" title="No AI activity yet">Guide answers appear here with their grounding status once learners start asking questions.</EmptyState>
      ) : (
        <>
          <div className="metric-grid compact"><MetricCard label="Verified answers" value={`${items.filter((item) => item.status === "Verified").length}`} change="Approved sources cited" /><MetricCard label="Limited guidance" value={`${items.filter((item) => item.status === "Limited guidance").length}`} change="Human review suggested" tone="violet" /><MetricCard label="Not covered" value={`${items.filter((item) => item.status === "Not covered").length}`} change="Documentation gaps" tone="amber" /></div>
          <section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Recent questions</span><h2>Grounding log</h2></div></div><div className="table-scroll"><table><thead><tr><th>Learner question</th><th>Source used</th><th>Status</th><th>Actor</th><th>Time</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td><strong>{item.question}</strong></td><td>{item.source}</td><td><StatusPill value={item.status} /></td><td>{item.actor}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></section>
        </>
      )}
    </div>
  );
}

// ---- admin: analytics ------------------------------------------------

function AnalyticsPage() {
  const [gaps, setGaps] = useState<Array<{ topic: string; count: number; status: string; recommendation: string; organisations: string[] }> | null>(null);
  const [modelId, setModelId] = useState(defaultCompetencyModel.id);
  useEffect(() => {
    fetch("/api/analytics/gaps").then((response) => (response.ok ? response.json() : { gaps: [] })).then((data) => setGaps(data.gaps ?? [])).catch(() => setGaps([]));
  }, []);
  const models = competencyModels as Array<{ id: string; name: string; weights: { learning: number; simulation: number; assessment: number }; passThreshold: number }>;
  const model = models.find((item) => item.id === modelId) ?? models[0];

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Human-reviewed intelligence</span><h1>Analytics</h1><p>See where learner friction points to a training or documentation gap. Suggestions always require human review.</p></div><StatusPill value="Suggestions" /></div>
      <div className="dashboard-grid">
        <section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Live intelligence</span><h2>Documentation gap ranking</h2></div></div><div className="table-scroll"><table><thead><tr><th>Topic</th><th>Signal</th><th>Asks</th><th>Recommended action</th></tr></thead><tbody>
          {(gaps ?? []).map((gap) => <tr key={gap.topic}><td><strong>{gap.topic}</strong></td><td><StatusPill value={gap.status} /></td><td>{gap.count}</td><td>{gap.recommendation}</td></tr>)}
          {gaps !== null && gaps.length === 0 && <tr><td colSpan={4}>No documentation gaps yet. Gaps appear when the guide can’t answer from approved sources.</td></tr>}
          {gaps === null && <tr><td colSpan={4}>Loading…</td></tr>}
        </tbody></table></div></section>
        <section className="panel competency-card"><div className="panel-header"><div><span className="tiny-label">Configurable readiness</span><h2>Competency model</h2></div></div><div className="security-body">
          <label className="studio-field"><span className="tiny-label">Model</span><select aria-label="Choose competency model" value={modelId} onChange={(event) => setModelId(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="weight-row"><span>Learning</span><b>{percent(model.weights.learning)}</b></div>
          <div className="weight-row"><span>Simulation</span><b>{percent(model.weights.simulation)}</b></div>
          <div className="weight-row"><span>Assessment</span><b>{percent(model.weights.assessment)}</b></div>
          <div className="weight-row"><span>Pass threshold</span><b>{model.passThreshold}%</b></div>
          <p className="model-note">Weights stay visible to learners and managers. AI never changes the formula.</p>
        </div></section>
      </div>
    </div>
  );
}

// ---- admin: access & audit (RBAC + audit export) ---------------------

function AccessAudit() {
  const capabilities = platformRoleCapabilities as Record<string, string[]>;
  const roles = roleTiers;
  const actions = capabilityCatalog.map((entry) => entry.id);
  const [custom, setCustom] = useState<Array<{ id: string; name: string; capabilities: string[] }>>([]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState<{ message?: string; allowedDomains?: string[]; live?: boolean } | null>(null);
  const [domains, setDomains] = useState("");
  useEffect(() => {
    fetch("/api/roles").then((response) => (response.ok ? response.json() : null)).then((data) => { if (data?.custom) setCustom(data.custom); }).catch(() => {});
    fetch("/api/provisioning").then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (data?.config) { setProvisioning(data.config); setDomains((data.config.allowedDomains ?? []).join(", ")); }
    }).catch(() => {});
  }, []);
  async function saveRole(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, capabilities: picked }) });
    if (response.ok) {
      const data = await response.json() as { role: { id: string; name: string; capabilities: string[] } };
      setCustom((current) => [...current.filter((role) => role.name !== data.role.name), data.role]);
      setName(""); setPicked([]);
    }
  }
  async function saveDomains(event: React.FormEvent) {
    event.preventDefault();
    const allowedDomains = domains.split(",").map((item) => item.trim()).filter(Boolean);
    const response = await fetch("/api/provisioning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allowedDomains }) });
    if (response.ok) {
      const data = await response.json() as { config: { message?: string; allowedDomains?: string[]; live?: boolean } };
      setProvisioning(data.config);
    }
  }
  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Access controls</span><h1>Access &amp; audit</h1><p>Tiered capabilities, optional custom roles, tenant isolation and an exportable audit trail.</p></div>
        <button className="button button-secondary" onClick={() => downloadResponse("/api/audit/export?format=csv", "amygdala-audit.csv")}>Export audit log (CSV)</button></div>
      <div className="security-grid">
        <section className="panel security-card"><div className="panel-header"><div><span className="tiny-label">Tenant isolation</span><h2>Workspace boundary</h2></div><StatusPill value="Verified" /></div><div className="security-body">
          <div><small>Isolation</small><strong>Every query is scoped by organisationId</strong></div>
          <div><small>Sessions</small><strong>Signed, HttpOnly, SameSite=Lax cookies</strong></div>
          <div><small>Passwords</small><strong>PBKDF2-SHA-256, per-user salt</strong></div>
        </div></section>
        <section className="panel security-card"><div className="panel-header"><div><span className="tiny-label">Audit trail</span><h2>Traceable actions</h2></div><StatusPill value="Persisted" /></div><div className="security-body">
          <div><small>Coverage</small><strong>Accounts, roles, assignments, sources and AI answers</strong></div>
          <div><small>Scope</small><strong>Tenant-scoped export (CSV / JSON)</strong></div>
          <div><small>Storage</small><strong>Append-only audit_events in D1</strong></div>
        </div></section>
      </div>
      <section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Role-based access control</span><h2>Capability matrix</h2></div></div><div className="table-scroll"><table><thead><tr><th>Capability</th>{roles.map((role) => <th key={role}>{role}</th>)}</tr></thead><tbody>
        {actions.map((action) => <tr key={action}><td><strong>{action}</strong></td>{roles.map((role) => <td key={role}>{(capabilities[role] ?? []).includes(action) ? <span className="rbac-yes">✓</span> : <span className="rbac-no">✕</span>}</td>)}</tr>)}
      </tbody></table></div></section>
      <section className="panel">
        <div className="panel-header"><div><span className="tiny-label">Optional</span><h2>Custom workspace roles</h2></div></div>
        <form className="people-form" onSubmit={saveRole}>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <button className="button button-primary" type="submit">Save role</button>
        </form>
        <div className="capability-picks">{capabilityCatalog.map((entry) => (
          <label key={entry.id}><input type="checkbox" checked={picked.includes(entry.id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /> {entry.label}</label>
        ))}</div>
        {custom.length > 0 && <ul>{custom.map((role) => <li key={role.id}><strong>{role.name}</strong> — {role.capabilities.join(", ") || "no capabilities"}</li>)}</ul>}
      </section>
      <section className="panel">
        <div className="panel-header"><div><span className="tiny-label">SSO / SCIM</span><h2>Provisioning seam</h2></div><StatusPill value="Needs IdP" /></div>
        <p>{provisioning?.message ?? "SSO and SCIM 2.0 endpoints exist as a seam. They stay inactive until an identity provider is connected."}</p>
        <form className="people-form" onSubmit={saveDomains}>
          <label>Allowed signup domains<input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="example.com, vendor.com" /></label>
          <button className="button button-secondary" type="submit">Save domains</button>
        </form>
      </section>
    </div>
  );
}

function AdminApp({ path, setPath, session }: { path: string; setPath: (path: string) => void; session: SessionUser | null }) {
  let content: React.ReactNode;
  if (path === "/admin/command-centre") content = <CommandCentre session={session} setPath={setPath} />;
  else if (path === "/admin/knowledge-vault") content = <KnowledgeVault session={session} />;
  else if (path === "/admin/training-studio") content = <CourseWizard onPreviewLearner={() => navigate("/learner/home", setPath)} />;
  else if (path === "/admin/simulations") content = <SimulationBuilder />;
  else if (path === "/admin/programmes") content = <Programmes setPath={setPath} />;
  else if (path === "/admin/ai-activity") content = <AIActivity />;
  else if (path === "/admin/analytics") content = <AnalyticsPage />;
  else if (path === "/admin/people") content = <UserManagement />;
  else if (path === "/admin/teams") content = <TeamsPanel mode="teams" />;
  else if (path === "/admin/manager") content = <TeamsPanel mode="manager" />;
  else if (path === "/admin/access") content = <AccessAudit />;
  else content = <div className="page-content"><EmptyState icon="?" title="Page not found">This admin page does not exist. Choose a destination from the sidebar.</EmptyState></div>;
  return <Shell mode="admin" path={path} setPath={setPath} session={session}>{content}</Shell>;
}

// ---- learner: guide --------------------------------------------------

type GuideMode = "explain" | "guide";
type GuideResult = {
  status: "Verified" | "Limited guidance" | "Not covered";
  answer: string;
  citations: Array<{ sourceId: string; title: string; version: string; section: string }>;
  escalationRecommended?: boolean;
};

function GuidePresence({ loading, status }: { loading: boolean; status?: GuideResult["status"] }) {
  const state = loading ? "verifying" : status === "Verified" ? "verified" : status === "Limited guidance" ? "limited" : status === "Not covered" ? "uncovered" : "ready";
  const label = loading ? "Verifying evidence" : status ?? "Guide ready";
  return <div className={`guide-presence ${state}`} role="status" aria-live="polite"><div className="hologram-orb"><span>AI</span><i /><b /></div><span><strong>{label}</strong><small>{loading ? "Tracing approved source connections" : status ? "Grounding state updated" : "Grounded to your approved sources"}</small></span></div>;
}

function ProductGuide() {
  const [mode, setMode] = useState<GuideMode>("explain");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GuideResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  async function ask(question = query) {
    if (question.trim().length < 3) return;
    setLoading(true); setFeedback(""); setError(""); setQuery(question);
    try {
      const response = await fetch("/api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: question, mode, role: "Project Manager" }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Guide unavailable"); }
      setResult(await response.json() as GuideResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Guide unavailable");
    } finally { setLoading(false); }
  }
  return <div className="page-content guide-page"><div className="page-heading"><div><span className="eyebrow">Grounded Product Guide</span><h1>Ask about the product. Get authorised guidance.</h1><p>Answers use approved, published material from your workspace only.</p></div><div className="guide-presence-stack"><GuidePresence loading={loading} status={result?.status} /><div className="trust-chip"><span>✓</span><strong>Retrieval boundary active</strong><small>Approved + Published sources</small></div></div></div><div className="guide-layout"><section className="panel guide-chat"><div className="mode-toggle" role="group" aria-label="Answer mode"><button className={mode === "explain" ? "active" : ""} onClick={() => setMode("explain")}><span>⌁</span><strong>Explain this</strong><small>Concepts in plain language</small></button><button className={mode === "guide" ? "active" : ""} onClick={() => setMode("guide")}><span>→</span><strong>Guide me</strong><small>Exact approved procedure</small></button></div><div className="conversation"><div className="guide-message"><span className="guide-avatar">AI</span><div><small>Amygdala Product Guide</small><p>I’ll only use vendor-approved material and will show you exactly where each factual instruction comes from. If nothing approved covers your question, I’ll say so.</p></div></div>{loading && <div className="thinking"><span /><span /><span /> Verifying approved evidence…</div>}{error && <p className="signin-error" role="alert">{error}</p>}{result && <div className="answer-card"><div className="answer-status"><StatusPill value={result.status} /><span>{result.status === "Verified" ? "Strong support found in approved material" : result.status === "Limited guidance" ? "Related approved material found" : "No sufficient approved material"}</span></div><div className="answer-body">{result.answer.split("\n").map((line, index) => line ? <p key={index}>{line}</p> : null)}</div>{result.citations.map((citation) => <div className="citation" key={citation.sourceId}><span>▣</span><span><small>Authorised source</small><strong>{citation.title}</strong><em>v{citation.version} · {citation.section}</em></span></div>)}<div className="feedback-row"><span>Was this helpful?</span>{["Helpful", "Not helpful", "Report an issue"].map((item) => <button key={item} className={feedback === item ? "selected" : ""} onClick={() => setFeedback(item)}>{item}</button>)}</div></div>}</div><form className="guide-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}><label htmlFor="guide-question">Ask about a published course</label><textarea id="guide-question" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} placeholder="Ask a product-specific question…" /><div><span>Answers are grounded in authorised sources.</span><button className="button button-primary" disabled={loading || query.trim().length < 3}>Ask guide <i>↑</i></button></div></form></section><aside className="panel guide-context"><span className="tiny-label">How grounding works</span><h2>Evidence, not guesswork</h2><div className="context-boundary"><span>⊙</span><p><strong>Your content stays isolated.</strong> Searches never cross your workspace’s knowledge boundary, and unsupported questions are refused rather than guessed.</p></div><p className="model-note">If your workspace has no published sources yet, ask a workspace admin to publish one in the Knowledge Vault.</p></aside></div></div>;
}

// ---- learner: course-driven pages ------------------------------------

function LearnerHome({ courses, loading, selectCourse, setPath, progress }: { courses: StoredCourse[]; loading: boolean; selectCourse: (id: string) => void; setPath: (path: string) => void; progress: LearnerProgress | null }) {
  if (loading) return <div className="page-content"><EmptyState title="Loading your courses…" /></div>;
  if (courses.length === 0) return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Your learning</span><h1>No published courses yet</h1><p>Published courses from your workspace appear here.</p></div></div><EmptyState icon="✦" title="Nothing to learn just yet" action={<button className="button button-secondary" onClick={() => navigate("/admin/training-studio", setPath)}>Go to Training Studio (admin)</button>}>Ask a workspace administrator to upload a source and publish a course. Once published, it will show up here ready to practise.</EmptyState></div>;
  return (
    <div className="page-content learner-home">
      <div className="learner-welcome"><div><span className="eyebrow">Your learning</span><h1>Build product capability.</h1><p>Choose a published course to learn, practise in a safe simulation and validate your readiness.</p></div><ProgressRing value={progress?.readiness ?? 0} label="Readiness" /></div>
      <MyAssignments onOpenCourse={(courseId) => { selectCourse(courseId); navigate("/learner/simulator", setPath); }} />
      <div className="module-card-grid">{courses.map((entry) => <article key={entry.id}><span className="module-symbol practise">◇</span><span className="module-card-copy"><small>{entry.role || "Course"} · {entry.course.simulation.steps.length} steps</small><strong>{entry.title}</strong><em>Grounded to {entry.course.citation.title}</em></span><button onClick={() => { selectCourse(entry.id); navigate("/learner/simulator", setPath); }} aria-label={`Start ${entry.title}`}>→</button></article>)}</div>
    </div>
  );
}

function Simulator({ course, onComplete, captions = true, setPath, vendorSims, allowedOrigins }: { course: StoredCourse | null; onComplete: (score: number, refId?: string) => void; captions?: boolean; setPath: (path: string) => void; vendorSims: SimulationDefinition[]; allowedOrigins: SimOrigin[] }) {
  const steps = course?.course.simulation.steps ?? [];
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState(0);
  const [complete, setComplete] = useState(false);
  const [coaching, setCoaching] = useState("");
  const [activeSim, setActiveSim] = useState<SimulationDefinition | null>(null);
  if (!course) return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Safe Product Simulator</span><h1>Practise without production risk.</h1></div></div><EmptyState icon="◇" title="Pick a course first" action={<button className="button button-primary" onClick={() => navigate("/learner/home", setPath)}>Choose a course →</button>}>Select a published course from your learning home to start a guided simulation.</EmptyState></div>;

  // Vendor product simulation: run the authored guided overlay on top of a
  // sandboxed embed or screenshot walkthrough. Completion persists an attempt.
  if (activeSim) {
    return (
      <div className="page-content simulator-page">
        <div className="page-heading"><div><span className="eyebrow">Vendor product simulation</span><h1>{activeSim.title}</h1><p>{activeSim.description || "Practise this workflow safely — never against a production system."}</p></div><button className="button button-secondary" onClick={() => setActiveSim(null)}>← All simulations</button></div>
        <SimulationRunner
          simulation={activeSim}
          allowedOrigins={allowedOrigins}
          onComplete={(result) => onComplete(result.score, activeSim.id)}
          onExit={() => setActiveSim(null)}
        />
        <div className="sim-runner-continue"><button className="button button-primary" onClick={() => navigate("/learner/assessment", setPath)}>Continue to assessment →</button></div>
      </div>
    );
  }

  const alternatives = ["Open Reports", "Archive workspace", "Change billing", "Delete project"];
  function choose(label: string) {
    if (label === steps[step]?.label) {
      setCoaching("");
      if (step === steps.length - 1) { setComplete(true); onComplete(Math.max(60, 100 - errors * 8)); }
      else setStep((value) => value + 1);
    } else {
      setErrors((value) => value + 1);
      setCoaching(steps[step]?.coaching ?? `That is not the approved next action. Follow step ${step + 1}: “${steps[step]?.label}”.`);
    }
  }
  return <div className="page-content simulator-page"><div className="page-heading"><div><span className="eyebrow">Safe Product Simulator</span><h1>Practise {course.title} without production risk.</h1><p>Interactive missions use a fictional workspace and the approved procedure.</p></div></div>
    {vendorSims.length > 0 && (
      <section className="panel sim-vendor-launch">
        <div className="panel-header"><div><span className="tiny-label">Vendor product simulations</span><h2>Practise in the real product, safely</h2></div><span className="sim-flag">SIMULATION — not production</span></div>
        <div className="sim-launch-grid">
          {vendorSims.map((sim) => (
            <article key={sim.id}>
              <span className={`sim-mode-dot ${sim.mode}`} aria-hidden="true" />
              <span className="sim-launch-copy"><strong>{sim.title}</strong><small>{sim.mode === "iframe" ? "Sandboxed embed" : "Guided walkthrough"} · {sim.steps.length} {sim.steps.length === 1 ? "step" : "steps"}</small></span>
              <button type="button" className="button button-secondary button-small" onClick={() => setActiveSim(sim)}>Launch <span>→</span></button>
            </article>
          ))}
        </div>
      </section>
    )}
    <div className="simulator-layout"><aside className="panel mission-brief"><span className="tiny-label">Mission objective</span><h2>{course.course.simulation.title}</h2><div className="brief-meta"><span><small>Steps</small><strong>{steps.length}</strong></span><span><small>Attempt</small><strong>#1 · {errors} errors</strong></span></div><div className="mission-steps">{steps.map((item, index) => <div className={index < step || complete ? "done" : index === step ? "active" : ""} key={item.label + index}><span>{index < step || complete ? "✓" : index + 1}</span><strong>{item.label}</strong></div>)}</div>{!complete && steps[step]?.hint && <div className="hint-card"><span>✦</span><p><strong>Progressive hint</strong>{steps[step].hint}</p></div>}<div className="approved-ref"><span>▣</span><p><small>Approved reference</small><strong>{course.course.citation.title}</strong></p></div><div className="mission-visual"><span className="tiny-label">Visual walkthrough</span><ProcedureDiagram steps={steps.map((item) => item.label)} title={course.course.simulation.title} accent="violet" captions={captions} /></div></aside><section className="simulation-window"><div className="sim-browser"><div className="sim-browser-bar"><span><i /><i /><i /></span><strong>Training workspace</strong><em>SIMULATION</em></div><div className="nexus-app"><main><div className="nexus-top"><div><small>Training</small><h2>{course.title}</h2></div><span className="fictional-chip">Fictional data</span></div>{complete ? <div className="simulation-success"><span>✓</span><h2>Mission complete</h2><p>You followed the approved procedure with {errors} {errors === 1 ? "error" : "errors"}.</p><strong>{Math.max(60, 100 - errors * 8)}% practical competency</strong><button className="button button-primary" onClick={() => navigate("/learner/assessment", setPath)}>Continue to assessment →</button></div> : <div className="nexus-canvas"><div className="canvas-copy"><span className="tiny-label">Current action</span><h3>{steps[step]?.label}</h3><p>Choose the correct approved action.</p></div><div className="sim-actions"><button className="correct-hotspot" onClick={() => choose(steps[step].label)}><span>＋</span>{steps[step].label}<i>Next approved action</i></button>{alternatives.slice(0, 2).map((item) => <button key={item} onClick={() => choose(item)}>{item}</button>)}</div>{coaching && <div className="sim-coaching" role="alert"><span>!</span><p>{coaching}</p></div>}</div>}</main></div></div></section></div></div>;
}

function Assessment({ course, simulationScore, onComplete, setPath }: { course: StoredCourse | null; simulationScore: number; onComplete: (score: number) => void; setPath: (path: string) => void }) {
  const questions = course?.course.assessment.questions ?? [];
  const passThreshold = course?.course.assessment.passThreshold ?? 80;
  const [index, setIndex] = useState(0); const [score, setScore] = useState(0); const [finished, setFinished] = useState(false);
  if (!course || questions.length === 0) return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Final validation</span><h1>Assessment</h1></div></div><EmptyState icon="✓" title="No assessment available" action={<button className="button button-primary" onClick={() => navigate("/learner/home", setPath)}>Choose a course →</button>}>Select a published course to take its grounded assessment.</EmptyState></div>;
  const question = questions[index];
  function answer(option: number) {
    const next = score + (option === 0 ? 1 : 0);
    if (index === questions.length - 1) { setScore(next); setFinished(true); onComplete(Math.round((next / questions.length) * 100)); }
    else { setScore(next); setIndex((value) => value + 1); }
  }
  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return <div className="page-content result-inline"><div className="result-orb"><strong>{pct}%</strong><span>assessment</span></div><StatusPill value={pct >= passThreshold ? "Passed" : "Review recommended"} /><h1>{pct >= passThreshold ? "Knowledge validated." : "A short review will help."}</h1><p>Your answers combine with learning and practical competence using the fixed readiness formula.</p><button className="button button-primary" onClick={() => navigate("/learner/results", setPath)}>View readiness result →</button></div>;
  }
  return <div className="page-content assessment-page"><div className="assessment-shell"><div className="assessment-sidebar"><span className="eyebrow">Final validation</span><h1>Product knowledge assessment</h1><p>Grounded questions from the approved source. The pass threshold is {passThreshold}%.</p><div className="assessment-metrics"><span><small>Questions</small><strong>{questions.length}</strong></span><span><small>Pass mark</small><strong>{passThreshold}%</strong></span><span><small>Simulation</small><strong>{simulationScore}%</strong></span></div></div><div className="diagnostic-card"><div className="step-progress"><span>Question {index + 1} of {questions.length}</span><progress value={index + 1} max={questions.length} /></div><h2>{question.question}</h2><div className="answer-options">{question.options.map((option, optionIndex) => <button key={option + optionIndex} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}<i>›</i></button>)}</div><p className="assessment-note">Incorrect responses recommend the relevant lesson. AI cannot answer assessed questions for you.</p></div></div></div>;
}

function Results({ learningScore, simulationScore, assessmentScore, setPath }: { learningScore: number; simulationScore: number; assessmentScore: number; setPath: (path: string) => void }) {
  const readiness = calculateReadiness({ lessons: learningScore, simulation: simulationScore, assessment: assessmentScore });
  return <div className="page-content results-page"><div className="results-hero"><div className="result-glow" /><span className="eyebrow">Verified readiness result</span><ProgressRing value={readiness} label="Overall readiness" /><h1>{readiness >= 80 ? "Ready for confident product use." : "On track. Complete the recommended practice."}</h1><p>Your result combines learning, simulation competence and the final knowledge assessment.</p><StatusPill value={readiness >= 80 ? "Ready for access" : "On track"} /></div><div className="result-breakdown"><article><span className="result-weight">30%</span><strong>Learning completion</strong><b>{learningScore}%</b><progress value={learningScore} max="100" /><small>Course lessons reviewed</small></article><article><span className="result-weight">40%</span><strong>Simulation competency</strong><b>{simulationScore}%</b><progress value={simulationScore} max="100" /><small>Practical mission performance</small></article><article><span className="result-weight">30%</span><strong>Final assessment</strong><b>{assessmentScore}%</b><progress value={assessmentScore} max="100" /><small>Grounded knowledge check</small></article></div><div className="formula-banner"><span>Transparent calculation</span><strong>({learningScore} × 0.30) + ({simulationScore} × 0.40) + ({assessmentScore} × 0.30) = {readiness}%</strong><em>AI cannot change this formula.</em></div><div className="result-actions"><button className="button button-secondary" onClick={() => navigate("/learner/home", setPath)}>Back to learning</button><button className="button button-primary" onClick={() => navigate("/learner/certificate", setPath)}>View certificate →</button></div></div>;
}

function Certificate({ course, session, learningScore, simulationScore, assessmentScore }: { course: StoredCourse | null; session: SessionUser | null; learningScore: number; simulationScore: number; assessmentScore: number }) {
  const readiness = calculateReadiness({ lessons: learningScore, simulation: simulationScore, assessment: assessmentScore });
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  // Persist an issued readiness credential for the signed-in learner. The
  // server recomputes readiness from stored progress, so the credential is
  // always consistent and survives reload.
  useEffect(() => {
    if (!course) return;
    let active = true;
    fetch("/api/learner/credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: course.id }) })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { credential?: { issuedAt?: string } } | null) => { if (active && data?.credential?.issuedAt) setIssuedAt(data.credential.issuedAt); })
      .catch(() => {});
    return () => { active = false; };
  }, [course]);
  const issued = (issuedAt ?? new Date().toISOString()).slice(0, 10);
  const certificate = { learner: session?.displayName ?? "Learner", programme: course?.title ?? "Product readiness", readiness, issued, breakdown: { learning: learningScore, simulation: simulationScore, assessment: assessmentScore } };
  return (
    <div className="page-content certificate-page">
      <div className="certificate"><div className="certificate-border">
        <Brand />
        <span className="certificate-kicker">Readiness certificate</span>
        <h1>{certificate.learner}</h1>
        <p>has demonstrated practical and knowledge readiness for the</p>
        <h2>{certificate.programme}</h2>
        <div className="certificate-score"><strong>{readiness}%</strong><span>Verified readiness</span></div>
        <div className="certificate-meta">
          <span><small>Issued</small><strong>{issued}</strong></span>
          <span><small>Simulation</small><strong>{simulationScore}%</strong></span>
          <span><small>Assessment</small><strong>{assessmentScore}%</strong></span>
        </div>
        <em>Readiness uses the fixed 30% learning + 40% simulation + 30% assessment formula.</em>
      </div></div>
      <div className="credential-actions">
        <button className="button button-secondary" onClick={() => downloadJson("amygdala-readiness-certificate.json", certificate)}>Download certificate (JSON) ↓</button>
      </div>
    </div>
  );
}

function AccessibilitySettings({ reduced, setReduced, lowPerformance, setLowPerformance, twoD, setTwoD, captions, setCaptions }: { reduced: boolean; setReduced: (value: boolean) => void; lowPerformance: boolean; setLowPerformance: (value: boolean) => void; twoD: boolean; setTwoD: (value: boolean) => void; captions: boolean; setCaptions: (value: boolean) => void }) {
  const settings = [["Reduced motion", "Stops spatial transitions and decorative movement.", reduced, setReduced], ["Low-performance mode", "Reduces atmospheric effects for older devices.", lowPerformance, setLowPerformance], ["Complete 2D view", "Replaces the spatial map with flat module relationships.", twoD, setTwoD], ["Captions & transcripts", "Expands text captions and transcripts beneath every visual walkthrough.", captions, setCaptions]] as const;
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Personal accessibility</span><h1>Choose how the learning universe behaves.</h1><p>These device-only preferences never change your pathway or readiness score.</p></div></div><section className="panel settings-panel">{settings.map(([title, copy, active, setter]) => <label key={title}><span><strong>{title}</strong><small>{copy}</small></span><input type="checkbox" aria-label={title} checked={active} onChange={(event) => setter(event.target.checked)} /><i /></label>)}</section><section className="panel accessibility-summary"><span>✓</span><p><strong>WCAG-conscious by default</strong> Keyboard navigation, visible focus, semantic labels, mobile touch targets and screen-reader alternatives are built into every journey.</p></section></div>;
}

function LearnerApp({ path, setPath, session }: { path: string; setPath: (path: string) => void; session: SessionUser | null }) {
  const [courses, setCourses] = useState<StoredCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [progress, setProgress] = useState<LearnerProgress | null>(null);
  const [vendorSims, setVendorSims] = useState<SimulationDefinition[]>([]);
  const [allowedOrigins, setAllowedOrigins] = useState<SimOrigin[]>([]);
  const [reduced, setReduced] = useState(false);
  const [lowPerformance, setLowPerformance] = useState(false);
  const [twoD, setTwoD] = useState(false);
  const [captions, setCaptions] = useState(true);
  useEffect(() => { document.documentElement.dataset.motion = reduced ? "reduced" : "full"; document.documentElement.dataset.performance = lowPerformance ? "low" : "full"; }, [reduced, lowPerformance]);
  useEffect(() => {
    let active = true;
    fetch("/api/courses").then((response) => (response.ok ? response.json() : { courses: [] })).then((data) => { if (active) { setCourses(data.courses ?? []); setLoadingCourses(false); } }).catch(() => { if (active) setLoadingCourses(false); });
    return () => { active = false; };
  }, []);
  // Load published vendor simulations + the embeddable-origin allow-list so the
  // learner simulator can safely run them.
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/simulations").then((response) => (response.ok ? response.json() : { simulations: [] })).catch(() => ({ simulations: [] })),
      fetch("/api/simulations/origins").then((response) => (response.ok ? response.json() : { origins: [] })).catch(() => ({ origins: [] })),
    ]).then(([sims, origs]) => { if (!active) return; setVendorSims(sims.simulations ?? []); setAllowedOrigins(origs.origins ?? []); });
    return () => { active = false; };
  }, []);

  const selectedCourse = courses.find((entry) => entry.id === selectedCourseId) ?? courses[0] ?? null;
  const courseId = selectedCourse?.id;

  // Hydrate persisted progress whenever the active course changes so scores,
  // readiness and completion survive reloads. Learning is marked once the
  // learner opens a course (this app has no separate lesson reader).
  useEffect(() => {
    let active = true;
    if (!courseId) return () => { active = false; };
    fetch(`/api/learner/progress?courseId=${encodeURIComponent(courseId)}`)
      .then((response) => (response.ok ? response.json() : { progress: null }))
      .then(async (data: { progress: LearnerProgress | null }) => {
        if (!active) return;
        let current = data.progress;
        if (!current || current.learningScore < 100) {
          const saved = await fetch("/api/learner/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, learningScore: 100 }) })
            .then((response) => (response.ok ? response.json() : null)).catch(() => null) as { progress: LearnerProgress } | null;
          if (saved?.progress) current = saved.progress;
        }
        if (active) setProgress(current);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [courseId]);

  const simulationScore = progress?.simulationScore ?? 0;
  const assessmentScore = progress?.assessmentScore ?? 0;
  const learningScore = progress?.learningScore ?? (selectedCourse ? 100 : 0);

  // Record an attempt (persisted, append-only) and fold its score into the
  // learner's stored progress. The server recomputes readiness.
  async function recordAttempt(kind: string, score: number, refId?: string, detail?: Record<string, unknown>) {
    if (!courseId) return;
    try {
      const response = await fetch("/api/learner/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, kind, score, refId, detail }) });
      if (response.ok) { const data = (await response.json()) as { progress: LearnerProgress }; if (data.progress) setProgress(data.progress); }
    } catch { /* offline: keep local UI responsive */ }
  }

  const publishedSims = vendorSims.filter((sim) => sim.status === "Published");

  let content: React.ReactNode;
  if (path === "/learner/guide") content = <ProductGuide />;
  else if (path === "/learner/simulator") content = <Simulator course={selectedCourse} onComplete={(score, refId) => recordAttempt(refId ? "vendor-simulation" : "simulation", score, refId)} captions={captions} setPath={setPath} vendorSims={publishedSims} allowedOrigins={allowedOrigins} />;
  else if (path === "/learner/assessment") content = <Assessment course={selectedCourse} simulationScore={simulationScore} onComplete={(score) => recordAttempt("assessment", score)} setPath={setPath} />;
  else if (path === "/learner/results") content = <Results learningScore={learningScore} simulationScore={simulationScore} assessmentScore={assessmentScore} setPath={setPath} />;
  else if (path === "/learner/certificate") content = <Certificate course={selectedCourse} session={session} learningScore={learningScore} simulationScore={simulationScore} assessmentScore={assessmentScore} />;
  else if (path === "/learner/wallet") content = <CredentialWallet />;
  else if (path === "/learner/account") content = <AccountProfile />;
  else if (path === "/learner/profile") content = <AccessibilitySettings reduced={reduced} setReduced={setReduced} lowPerformance={lowPerformance} setLowPerformance={setLowPerformance} twoD={twoD} setTwoD={setTwoD} captions={captions} setCaptions={setCaptions} />;
  else content = <LearnerHome courses={courses} loading={loadingCourses} selectCourse={setSelectedCourseId} setPath={setPath} progress={progress} />;
  return <Shell mode="learner" path={path} setPath={setPath} session={session}>{content}</Shell>;
}

// ---- sign-in + root --------------------------------------------------

const DEMO_ACCOUNTS: Record<string, { label: string }> = {
  admin: { label: "Vendor Administrator" },
  learner: { label: "Customer Learner" },
};
const BOOTSTRAP_ADMIN_EMAIL = "admin@amygdalalishay.com";

function SignIn({ setPath }: { setPath: (path: string) => void }) {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const as = params.get("as") ?? "admin";
  const token = params.get("token") ?? "";
  const mode = params.get("invite") ? "invite" : params.get("reset") ? "reset" : params.get("signup") ? "signup" : params.get("forgot") ? "forgot" : "signin";
  const [email, setEmail] = useState(mode === "signin" ? BOOTSTRAP_ADMIN_EMAIL : "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setInfo("");
    try {
      if (mode === "invite") {
        const response = await fetch("/api/auth/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) { setError(data.error ?? "Invite failed."); return; }
        window.location.href = "/learner/home";
        return;
      }
      if (mode === "reset") {
        const response = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "consume", token, password }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) { setError(data.error ?? "Reset failed."); return; }
        setInfo("Password updated. Sign in with your new password.");
        navigate("/signin", setPath);
        return;
      }
      if (mode === "forgot") {
        const response = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
        const data = await response.json() as { error?: string; resetUrl?: string | null; emailed?: boolean };
        if (!response.ok) { setError(data.error ?? "Reset failed."); return; }
        if (data.resetUrl) setInfo(`No email provider configured. Reset link: ${data.resetUrl}`);
        else setInfo(data.emailed ? "If that account exists, a reset email is on its way." : "If that account exists, a reset link was generated.");
        return;
      }
      if (mode === "signup") {
        const response = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, displayName }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) { setError(data.error ?? "Signup is not available for that domain."); return; }
        window.location.href = "/learner/home";
        return;
      }
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, totp: totp || undefined, mfaToken: mfaToken || undefined }) });
      const data = await response.json() as { error?: string; mfaRequired?: boolean; mfaToken?: string };
      if (data.mfaRequired && data.mfaToken) { setMfaToken(data.mfaToken); setInfo("Enter the 6-digit code from your authenticator app."); return; }
      if (!response.ok) { setError(data.error ?? "Sign-in failed."); return; }
      window.location.href = as === "learner" ? "/learner/home" : "/admin/command-centre";
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "invite" ? "Set your password" : mode === "reset" ? "Choose a new password" : mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create an account" : "Sign in to Amygdala";

  return (
    <div className="marketing-shell">
      <MarketingHeader path="/signin" setPath={setPath} />
      <main className="signin-main">
        <div className="signin-card">
          <span className="eyebrow"><span /> Secure sign-in</span>
          <h1>{title}</h1>
          <p>Sessions are signed and HttpOnly; access is enforced by role and tenant on the server.</p>
          <form onSubmit={submit} className="signin-form">
            {(mode === "signin" || mode === "forgot" || mode === "signup") && (
              <>
                <label htmlFor="signin-email">Work email</label>
                <input id="signin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </>
            )}
            {mode === "signup" && (
              <>
                <label htmlFor="signin-name">Display name</label>
                <input id="signin-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </>
            )}
            {mode !== "forgot" && (
              <>
                <label htmlFor="signin-password">{mode === "signin" ? "Password" : "New password"}</label>
                <input id="signin-password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required={mode !== "signin" || !mfaToken} />
              </>
            )}
            {mfaToken && (
              <>
                <label htmlFor="signin-totp">Authenticator code</label>
                <input id="signin-totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value)} required />
              </>
            )}
            {error && <p className="signin-error" role="alert">{error}</p>}
            {info && <p role="status">{info}</p>}
            <button className="button button-primary full-width" type="submit" disabled={loading}>{loading ? "Working…" : mode === "signin" ? "Sign in" : "Continue"}</button>
          </form>
          {mode === "signin" && (
            <div className="signin-sso">
              <button type="button" className="text-button" onClick={() => navigate("/signin?forgot=1", setPath)}>Forgot password</button>
              <button type="button" className="text-button" onClick={() => navigate("/signin?signup=1", setPath)}>Domain self-signup</button>
              <small>SSO / SCIM need an identity provider — they are not live.</small>
            </div>
          )}
          <div className="signin-demo"><strong>Workspace administrator</strong><span>{BOOTSTRAP_ADMIN_EMAIL}</span><span>Role: {DEMO_ACCOUNTS[as]?.label ?? "Vendor Administrator"}</span></div>
        </div>
      </main>
    </div>
  );
}

export default function AmygdalaApp({ initialPath = "/" }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const [session, setSession] = useState<SessionUser | null | undefined>(undefined);
  const [introDone, setIntroDone] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = Boolean(window.sessionStorage.getItem("amygdala_intro_seen")); } catch { seen = false; }
    if (initialPath !== "/" || seen) {
      const id = requestAnimationFrame(() => setIntroDone(true));
      return () => cancelAnimationFrame(id);
    }
  }, [initialPath]);
  function finishIntro() {
    setIntroFading(true);
    try { window.sessionStorage.setItem("amygdala_intro_seen", "1"); } catch { /* ignore */ }
    window.setTimeout(() => setIntroDone(true), 700);
  }
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session").then((response) => (response.ok ? response.json() : null)).then((data) => { if (active) setSession((data as { user: SessionUser } | null)?.user ?? null); }).catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); (document.querySelector("input[type='search'], .search-field input") as HTMLInputElement | null)?.focus(); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const isLowPerf = () => document.documentElement.dataset.performance === "low";
    const isReduced = () => document.documentElement.dataset.motion === "reduced";
    let litPanel: HTMLElement | null = null;
    const onMove = (event: PointerEvent) => {
      const panel = (event.target as HTMLElement | null)?.closest?.(".panel") as HTMLElement | null;
      if (panel !== litPanel && litPanel) litPanel.style.setProperty("--glow", "0");
      litPanel = panel;
      if (panel && !isLowPerf()) {
        const rect = panel.getBoundingClientRect();
        panel.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
        panel.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
        panel.style.setProperty("--glow", "1");
      }
      if (!isReduced() && !isLowPerf()) {
        document.documentElement.style.setProperty("--px", ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        document.documentElement.style.setProperty("--py", ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      }
    };
    const onTilt = (event: DeviceOrientationEvent) => {
      if (isReduced() || isLowPerf()) return;
      document.documentElement.style.setProperty("--px", Math.max(-1, Math.min(1, (event.gamma ?? 0) / 45)).toFixed(3));
      document.documentElement.style.setProperty("--py", Math.max(-1, Math.min(1, ((event.beta ?? 0) - 45) / 45)).toFixed(3));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onTilt);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("deviceorientation", onTilt); };
  }, []);
  const view = useMemo(() => path.startsWith("/admin") ? "admin" : path.startsWith("/learner") ? "learner" : path.startsWith("/signin") ? "signin" : path === "/demo" ? "demo" : "landing", [path]);
  // Apply the workspace brand kit (logo/colours/font) across the signed-in
  // admin and learner shells via the existing CSS custom properties.
  useBrandKit((view === "admin" || view === "learner") && Boolean(session));
  if (view === "signin") return <SignIn setPath={setPath} />;
  // Client-side guard: unauthenticated users are sent to sign-in. (Server-side
  // enforcement lives on the API routes; SSR content is non-sensitive shell.)
  if ((view === "admin" || view === "learner") && session === null) return <SignIn setPath={setPath} />;
  if (view === "admin") return <AdminApp path={path} setPath={setPath} session={session ?? null} />;
  if (view === "learner") return <LearnerApp path={path} setPath={setPath} session={session ?? null} />;
  if (view === "demo") return <DemoEntry setPath={setPath} />;
  return (
    <>
      <Landing path={path} setPath={setPath} />
      {!introDone && <div className={`intro-gate ${introFading ? "fade" : ""}`}><PromoIntro onComplete={finishIntro} showSkip /></div>}
    </>
  );
}
