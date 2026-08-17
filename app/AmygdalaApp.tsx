"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  SAFE_FALLBACK,
  answerGroundedQuestion,
  assignPathway,
  calculateReadiness,
  learnerRows,
  missions,
  modules,
  sources as seededSources,
} from "./lib/domain.mjs";

type GuideMode = "explain" | "guide";
type GuideResult = {
  status: "Verified" | "Limited guidance" | "Not covered";
  answer: string;
  citations: Array<{ sourceId: string; title: string; version: string; section: string }>;
  escalationRecommended?: boolean;
};

type DemoSource = (typeof seededSources)[number] & { local?: boolean };

const adminNavigation = [
  ["/admin/command-centre", "Command Centre", "◫"],
  ["/admin/organisations", "Organisations", "◇"],
  ["/admin/learners", "Learners", "◎"],
  ["/admin/programmes", "Programmes", "▤"],
  ["/admin/training-studio", "Training Studio", "✦"],
  ["/admin/knowledge-vault", "Knowledge Vault", "▣"],
  ["/admin/content-review", "Content review", "✓"],
  ["/admin/ai-activity", "AI activity", "⌁"],
  ["/admin/analytics", "Analytics", "↗"],
  ["/admin/workspace-settings", "Workspace settings", "⚙"],
];

const learnerNavigation = [
  ["/learner/home", "Learning universe", "✦"],
  ["/learner/onboarding", "My onboarding", "◫"],
  ["/learner/guide", "AI Product Guide", "⌁"],
  ["/learner/simulator", "Product Simulator", "◇"],
  ["/learner/assessment", "Assessment", "✓"],
  ["/learner/results", "Readiness result", "◎"],
  ["/learner/certificate", "Certificate", "▧"],
  ["/learner/profile", "Accessibility", "⚙"],
];

const diagnosticQuestions = [
  { question: "Where do you open a project space?", options: ["Projects", "Reports", "Team"], correct: 0 },
  { question: "What does a project template provide?", options: ["A pre-approved structure", "A new subscription", "Administrator access"], correct: 0 },
  { question: "Which role should be assigned?", options: ["The least-privileged suitable role", "Administrator for everyone", "No role"], correct: 0 },
  { question: "What starts an automation?", options: ["A trigger", "A report", "A workspace invite"], correct: 0 },
  { question: "Do filters change the underlying project?", options: ["No", "Yes", "Only on mobile"], correct: 0 },
];

const assessmentQuestions = [
  { question: "What is the final action when creating a project?", options: ["Create project", "Invite member", "Save view"], correct: 0 },
  { question: "Where are workspace invitations managed?", options: ["Team", "Reports", "Dashboard"], correct: 0 },
  { question: "What should precede activating an automation?", options: ["Review the summary", "Export a report", "Archive the project"], correct: 0 },
  { question: "What does a saved report view retain?", options: ["A filter combination", "Project ownership", "A user password"], correct: 0 },
  { question: "What is the approved access principle?", options: ["Least privilege", "Open by default", "Shared administrator accounts"], correct: 0 },
];

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

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Amygdala home">
      <span className="brand-mark" aria-hidden="true"><Image src="/amygdala-logo-96.png" alt="" width={40} height={40} sizes="40px" priority /></span>
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

function MarketingHeader({ path, setPath }: { path: string; setPath: (path: string) => void }) {
  return (
    <header className="marketing-header">
      <button className="plain-button" onClick={() => navigate("/", setPath)}><Brand /></button>
      <nav aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#trust">AI trust</a>
        <a href="#readiness">Readiness</a>
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

        <section className="problem-strip" aria-label="Customer onboarding outcomes">
          <div><strong>42%</strong><span>faster path to first value</span></div>
          <div><strong>3×</strong><span>more practice before go-live</span></div>
          <div><strong>100%</strong><span>traceable AI answers</span></div>
          <p>Illustrative pilot outcomes</p>
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
            <div className="evidence-card evidence-one"><StatusPill value="Verified" /><strong>Create and Configure a Project</strong><span>v4.2 · Projects › Create a project</span></div>
            <div className="evidence-card evidence-two"><span className="tiny-label">Retrieval boundary</span><strong>NexusFlow / Aurora Creative</strong><span>Approved + Published only</span></div>
          </div>
          <div className="split-copy">
            <span className="eyebrow">Vendor-controlled AI</span>
            <h2>Answers your customers can trust—and your team can trace.</h2>
            <p>The Product Guide stays inside the vendor’s authorised material. Unsupported questions are refused and routed for human review.</p>
            <ul className="check-list"><li>Tenant-isolated retrieval</li><li>Source title, version and section on every factual answer</li><li>Draft, archived and superseded content excluded</li><li>No numeric confidence theatre</li></ul>
            <button className="text-button" onClick={() => navigate("/demo", setPath)}>Experience a verified answer <span>→</span></button>
          </div>
        </section>

        <section className="section readiness-section" id="readiness">
          <div className="section-heading"><span className="eyebrow">Transparent readiness</span><h2>See who can use the product—not just who finished a course.</h2><p>Learning, practical competence and assessment results combine in a visible, fixed formula.</p></div>
          <div className="readiness-formula"><div><strong>30%</strong><span>Learning</span></div><b>+</b><div><strong>40%</strong><span>Simulation</span></div><b>+</b><div><strong>30%</strong><span>Assessment</span></div><b>=</b><div className="result"><strong>86%</strong><span>Ready</span></div></div>
        </section>

        <section className="final-cta"><div className="cta-orbit" /><span className="eyebrow">Capability starts here</span><h2>Let customers learn your product by using it.</h2><p>Enter the complete NexusFlow demo as a vendor administrator or customer learner.</p><button className="button button-primary" onClick={() => navigate("/demo", setPath)}>Enter Interactive Demo <span>→</span></button></section>
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
        <div className="section-heading centered"><span className="eyebrow">Interactive NexusFlow pilot</span><h1>Choose your perspective.</h1><p>Both workspaces are preloaded. No credentials, configuration or external services are required.</p></div>
        <div className="role-grid">
          <button className="role-card vendor" onClick={() => navigate("/admin/command-centre", setPath)}>
            <span className="role-visual"><i>NF</i><b>Vendor</b></span><span className="role-copy"><small>Experience as</small><strong>Vendor Administrator</strong><em>Curate knowledge, review AI activity and track customer readiness.</em><span>Open Command Centre →</span></span>
          </button>
          <button className="role-card learner" onClick={() => navigate("/learner/home", setPath)}>
            <span className="role-visual"><i>AN</i><b>Learner</b></span><span className="role-copy"><small>Experience as</small><strong>Customer Learner</strong><em>Follow a pathway, ask the Product Guide and practise NexusFlow.</em><span>Accept demo invitation →</span></span>
          </button>
        </div>
        <div className="demo-note"><span>●</span><p><strong>Safe demonstration environment</strong> All content and users are fictional. Simulations never connect to a live NexusFlow workspace.</p></div>
      </main>
    </div>
  );
}

function Sidebar({ mode, path, setPath, mobileOpen, closeMobile }: { mode: "admin" | "learner"; path: string; setPath: (path: string) => void; mobileOpen: boolean; closeMobile: () => void }) {
  const nav = mode === "admin" ? adminNavigation : learnerNavigation;
  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label={`${mode} navigation`}>
      <div className="sidebar-top"><button className="plain-button" onClick={() => navigate("/", setPath)}><Brand /></button><button className="mobile-close" onClick={closeMobile} aria-label="Close navigation">×</button></div>
      <div className="workspace-switcher"><span className="workspace-logo">{mode === "admin" ? "NF" : "AC"}</span><span><small>{mode === "admin" ? "Vendor workspace" : "Customer workspace"}</small><strong>{mode === "admin" ? "NexusFlow" : "Aurora Creative"}</strong></span><i>⌄</i></div>
      <nav>
        {nav.map(([href, label, icon]) => <button key={href} className={path === href ? "active" : ""} onClick={() => { navigate(href, setPath); closeMobile(); }}><i aria-hidden="true">{icon}</i><span>{label}</span>{path === href && <b />}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="environment-chip"><span /> Interactive demo</div>
        <button className="profile-chip" onClick={() => navigate(mode === "admin" ? "/admin/workspace-settings" : "/learner/profile", setPath)}><span>{mode === "admin" ? "VN" : "AN"}</span><span><strong>{mode === "admin" ? "Vera Ndlovu" : "Aisha Naidoo"}</strong><small>{mode === "admin" ? "Vendor Administrator" : "Project Manager"}</small></span><i>•••</i></button>
      </div>
    </aside>
  );
}

function AppHeader({ mode, onMenu, onSwitch }: { mode: "admin" | "learner"; onMenu: () => void; onSwitch: () => void }) {
  return (
    <header className="app-header"><button className="menu-button" onClick={onMenu} aria-label="Open navigation">☰</button><div><span className="breadcrumb">NexusFlow <b>/</b> {mode === "admin" ? "Vendor workspace" : "Aurora Creative"}</span></div><div className="header-actions"><button className="search-button" aria-label="Search"><span>⌕</span><em>Search</em><kbd>⌘ K</kbd></button><button className="icon-button" aria-label="Notifications">♢<i /></button><button className="button button-small button-ghost" onClick={onSwitch}>Switch experience</button></div></header>
  );
}

function Shell({ mode, path, setPath, children }: { mode: "admin" | "learner"; path: string; setPath: (path: string) => void; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell"><Sidebar mode={mode} path={path} setPath={setPath} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} /><div className="app-main"><AppHeader mode={mode} onMenu={() => setMobileOpen(true)} onSwitch={() => navigate("/demo", setPath)} />{children}</div>{mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}</div>
  );
}

function MetricCard({ label, value, change, tone = "cyan" }: { label: string; value: string; change: string; tone?: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{tone === "cyan" ? "↗" : tone === "violet" ? "◎" : tone === "amber" ? "!" : "✓"}</span><span className="metric-label">{label}</span><strong>{value}</strong><small>{change}</small></article>;
}

function CommandCentre() {
  const rows = learnerRows.map((row) => ({ ...row, readiness: calculateReadiness(row) }));
  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Capability overview</span><h1>Good morning, Vera.</h1><p>Here’s how your customers are progressing toward confident NexusFlow use.</p></div><div className="page-actions"><button className="button button-secondary">Export summary</button><button className="button button-primary">Invite customer <span>＋</span></button></div></div>
      <div className="metric-grid"><MetricCard label="Invited learners" value="248" change="+18 this month" /><MetricCard label="Activated learners" value="214" change="86.3% activation" tone="violet" /><MetricCard label="Onboarding complete" value="72%" change="+6.4% vs last month" tone="green" /><MetricCard label="Require support" value="19" change="7 urgent reviews" tone="amber" /></div>
      <div className="dashboard-grid">
        <section className="panel readiness-overview"><div className="panel-header"><div><span className="tiny-label">Customer readiness</span><h2>Product access confidence</h2></div><button className="text-button">View matrix →</button></div><div className="readiness-chart"><div className="large-ring" style={{ "--progress": "284deg" } as React.CSSProperties}><div><strong>79</strong><span>average readiness</span></div></div><div className="readiness-bars"><div><span><i className="green-dot" /> Ready for access <b>142</b></span><progress value="66" max="100" /></div><div><span><i className="violet-dot" /> On track <b>53</b></span><progress value="25" max="100" /></div><div><span><i className="amber-dot" /> Requires support <b>19</b></span><progress value="9" max="100" /></div></div></div><div className="formula-note"><span>Fixed readiness formula</span><b>30% learning + 40% simulation + 30% assessment</b></div></section>
        <section className="panel ai-summary"><div className="panel-header"><div><span className="tiny-label">AI Product Guide</span><h2>Evidence coverage</h2></div><StatusPill value="Verified" /></div><div className="ai-coverage"><strong>91%</strong><span>of learner questions answered with verified material</span><progress value="91" max="100" /></div><div className="summary-list"><div><span className="summary-icon verified">✓</span><span><strong>384 verified answers</strong><small>Approved sources cited</small></span></div><div><span className="summary-icon limited">◔</span><span><strong>24 limited guidance</strong><small>Human review suggested</small></span></div><div><span className="summary-icon uncovered">!</span><span><strong>13 not covered</strong><small>Training manager action</small></span></div></div><button className="full-link">Review unsupported questions <span>→</span></button></section>
      </div>
      <section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Readiness matrix</span><h2>Customer learner detail</h2></div><div className="filter-chips"><button className="active">All customers</button><button>Needs support</button></div></div><div className="table-scroll"><table><thead><tr><th>Organisation / learner</th><th>Role</th><th>Learning</th><th>Simulation</th><th>Assessment</th><th>Readiness</th></tr></thead><tbody>{rows.map((row) => <tr key={row.learner}><td><strong>{row.learner}</strong><span>{row.organisation}</span></td><td>{row.role}</td><td>{row.lessons}%</td><td>{row.simulation}%</td><td>{row.assessment}%</td><td><StatusPill value={row.readiness >= 80 ? "Ready" : row.readiness >= 65 ? "On track" : "Support"} /><b className="score">{row.readiness}</b></td></tr>)}</tbody></table></div></section>
    </div>
  );
}

function KnowledgeVault({ role = "Vendor Administrator" }: { role?: string }) {
  const [items, setItems] = useState<DemoSource[]>(seededSources as DemoSource[]);
  const [selectedId, setSelectedId] = useState("src-projects");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All states");
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = items.filter((item) => (status === "All states" || item.status === status) && `${item.title} ${item.module} ${item.type}`.toLowerCase().includes(query.toLowerCase()));
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0];

  function handleFile(file?: File) {
    if (!file) return;
    const allowed = ["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    const item: DemoSource = { ...seededSources[0], id: `local-${Date.now()}`, title: file.name.replace(/\.[^.]+$/, ""), description: "Locally staged prototype source", module: "Unassigned", version: "Draft", status: "Ready for review", approvalStatus: "Pending", uploadDate: new Date().toISOString().slice(0, 10), effectiveDate: "Not set", contentOwner: "Vera Ndlovu", type: file.type.includes("pdf") ? "PDF document" : file.type.includes("image") ? "Image" : "Document", section: "Awaiting review", extractedText: "Prototype extraction complete. Review the source and metadata before approval.", explanation: "", procedure: [], keywords: [], local: true };
    setItems((current) => [item, ...current]);
    setSelectedId(item.id);
    setUploadOpen(false);
  }

  function transition(next: string, approvalStatus = selected?.approvalStatus) {
    if (!selected || role !== "Vendor Administrator") return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, status: next, approvalStatus } : item));
  }

  return (
    <div className="page-content">
      <div className="page-heading"><div><span className="eyebrow">Authorised material</span><h1>Knowledge Vault</h1><p>Control the sources that power NexusFlow onboarding and learner guidance.</p></div><button className="button button-primary" onClick={() => setUploadOpen((value) => !value)}>Upload source <span>＋</span></button></div>
      {uploadOpen && <section className="upload-panel"><div><span className="upload-icon">⇧</span><strong>Stage a training source</strong><p>PDF, DOCX, TXT, MD, PNG or JPG · maximum 10 MB. Files remain in this prototype session.</p></div><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" onChange={(event) => handleFile(event.target.files?.[0])} aria-label="Choose a training source" /><button className="button button-secondary" onClick={() => fileInput.current?.click()}>Choose file</button></section>}
      <div className="vault-stats"><div><strong>{items.filter((item) => item.status === "Published").length}</strong><span>Published sources</span></div><div><strong>{items.filter((item) => item.status === "Ready for review").length}</strong><span>Ready for review</span></div><div><strong>8</strong><span>Training modules linked</span></div><div><strong>4.2</strong><span>Current product version</span></div></div>
      <div className="vault-layout">
        <section className="panel source-browser"><div className="vault-toolbar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approved knowledge" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by content state"><option>All states</option><option>Published</option><option>Ready for review</option><option>Draft</option><option>Archived</option></select></div><div className="source-list">{filtered.map((source) => <button key={source.id} className={selected?.id === source.id ? "selected" : ""} onClick={() => setSelectedId(source.id)}><span className={`file-type ${source.type.toLowerCase().includes("pdf") ? "pdf" : "doc"}`}>{source.type.toLowerCase().includes("pdf") ? "PDF" : "DOC"}</span><span className="source-summary"><strong>{source.title}</strong><small>{source.module} · v{source.version}</small><span><StatusPill value={source.status} /><em>{source.uploadDate}</em></span></span><i>›</i></button>)}{filtered.length === 0 && <div className="empty-state"><strong>No sources found</strong><span>Try a different search or content state.</span></div>}</div></section>
        {selected && <aside className="panel source-detail"><div className="source-detail-head"><div><span className="tiny-label">Source preview</span><h2>{selected.title}</h2></div><button className="icon-button" aria-label="More source actions">•••</button></div><div className="metadata-grid"><span><small>Product</small><strong>{selected.product}</strong></span><span><small>Version</small><strong>{selected.version}</strong></span><span><small>Feature / module</small><strong>{selected.module}</strong></span><span><small>Intended role</small><strong>{selected.intendedRole}</strong></span><span><small>Content owner</small><strong>{selected.contentOwner}</strong></span><span><small>Effective date</small><strong>{selected.effectiveDate}</strong></span></div><div className="extracted-preview"><span className="tiny-label">Extracted content</span><p>{selected.extractedText}</p></div><div className="source-usage"><span className="tiny-label">Used by training</span><div><i>✦</i><span><strong>NexusFlow Project Manager Onboarding</strong><small>{selected.module}</small></span></div></div><div className="source-actions">{selected.status === "Ready for review" && <><button className="button button-secondary" onClick={() => transition("Archived", "Rejected")}>Reject</button><button className="button button-primary" onClick={() => transition("Approved", "Approved")}>Approve</button></>}{selected.status === "Approved" && <button className="button button-primary" onClick={() => transition("Published", "Approved")}>Publish approved source</button>}{selected.status === "Published" && <button className="button button-secondary" onClick={() => transition("Archived", "Approved")}>Archive source</button>}<span className="isolation-note">⊙ Isolated to NexusFlow</span></div></aside>}
      </div>
    </div>
  );
}

function AIActivity() {
  const items = [
    { question: "How do I create a project?", learner: "Aisha Naidoo", org: "Aurora Creative", source: "Create and Configure a Project", status: "Verified", feedback: "Helpful", time: "09:42" },
    { question: "Can I automate a blocked-task alert?", learner: "Priya Singh", org: "Meridian Health", source: "Workflow Automation Essentials", status: "Verified", feedback: "Helpful", time: "09:18" },
    { question: "Does NexusFlow include payroll?", learner: "Daniel Molefe", org: "Meridian Health", source: "No approved source", status: "Not covered", feedback: "Escalated", time: "08:51" },
    { question: "Why can’t I see the project?", learner: "Thabo Mokoena", org: "Aurora Creative", source: "Troubleshooting FAQ", status: "Limited guidance", feedback: "Review", time: "Yesterday" },
  ];
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Traceable guidance</span><h1>AI activity</h1><p>Every answer, source and escalation in one human-reviewable record.</p></div><button className="button button-secondary">Export audit log</button></div><div className="metric-grid compact"><MetricCard label="Verified answers" value="91%" change="384 this month" /><MetricCard label="Limited guidance" value="24" change="6 awaiting review" tone="violet" /><MetricCard label="Not covered" value="13" change="Documentation gaps" tone="amber" /></div><section className="panel table-panel"><div className="panel-header"><div><span className="tiny-label">Recent questions</span><h2>Grounding and feedback log</h2></div><div className="filter-chips"><button className="active">All activity</button><button>Escalated</button></div></div><div className="table-scroll"><table><thead><tr><th>Learner question</th><th>Organisation</th><th>Source used</th><th>Status</th><th>Feedback</th><th>Time</th></tr></thead><tbody>{items.map((item) => <tr key={item.question}><td><strong>{item.question}</strong><span>{item.learner} · Project foundations</span></td><td>{item.org}</td><td>{item.source}</td><td><StatusPill value={item.status} /></td><td>{item.feedback}</td><td>{item.time}</td></tr>)}</tbody></table></div></section></div>;
}

function Analytics() {
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Human-reviewed intelligence</span><h1>Content improvement insights</h1><p>See where learner friction points to a training or documentation gap.</p></div><StatusPill value="Suggestions" /></div><div className="insight-grid"><section className="panel"><span className="tiny-label">Frequently asked</span><h2>Top learner questions</h2>{["How do I invite a contractor?", "Why can’t I see my project?", "How do automation conditions work?"].map((item, index) => <div className="rank-row" key={item}><span>0{index + 1}</span><strong>{item}</strong><b>{48 - index * 11}</b></div>)}</section><section className="panel"><span className="tiny-label">Documentation gaps</span><h2>Human review required</h2><div className="gap-card"><StatusPill value="Not covered" /><strong>Bulk project archiving</strong><p>Asked 11 times across two customer organisations.</p><button className="text-button">Review evidence →</button></div><div className="gap-card"><StatusPill value="Limited guidance" /><strong>External collaborator roles</strong><p>Current source does not cover contractor access.</p><button className="text-button">Review evidence →</button></div></section><section className="panel"><span className="tiny-label">Simulation friction</span><h2>Common practical errors</h2><div className="failure-row"><span><strong>Role selection</strong><small>Invite and assign mission</small></span><b>28%</b></div><div className="failure-row"><span><strong>Trigger conditions</strong><small>Automation mission</small></span><b>19%</b></div><div className="failure-row"><span><strong>Template selection</strong><small>Create project mission</small></span><b>12%</b></div></section></div><div className="suggestion-banner"><span>✦</span><p><strong>AI-generated suggestions require human review.</strong> Amygdala never edits or publishes vendor documentation automatically.</p></div></div>;
}

function Programmes() {
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Training programme</span><h1>NexusFlow Project Manager Onboarding</h1><p>A complete, role-based path for Aurora Creative and Meridian Health.</p></div><button className="button button-primary">Assign programme <span>＋</span></button></div><div className="programme-layout"><section className="panel module-stack"><div className="panel-header"><div><span className="tiny-label">Published pathway</span><h2>Learn → Practise → Validate</h2></div><StatusPill value="Published" /></div>{modules.map((module, index) => <article key={module.id}><span className="module-order">0{index + 1}</span><span className={`module-symbol ${module.label.toLowerCase()}`}>{module.label === "Learn" ? "◫" : module.label === "Practise" ? "◇" : "✓"}</span><span><small>{module.label} · {module.duration} min</small><strong>{module.title}</strong><em>{module.mandatory ? "Mandatory" : "Optional"}</em></span><button aria-label={`Edit ${module.title}`}>•••</button></article>)}</section><aside className="panel programme-summary"><span className="tiny-label">Programme rules</span><h2>Transparent adaptation</h2><ul className="check-list"><li>Low diagnostic: foundation path</li><li>Medium diagnostic: standard path</li><li>High diagnostic: optional lesson review</li><li>Simulations remain mandatory</li><li>Pass threshold fixed at 80%</li></ul><div className="source-usage"><span className="tiny-label">Source coverage</span><div><i>▣</i><span><strong>7 published sources</strong><small>Current NexusFlow version 4.2</small></span></div></div></aside></div></div>;
}

function PlaceholderAdmin({ path }: { path: string }) {
  const name = adminNavigation.find(([href]) => href === path)?.[1] ?? "Workspace";
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">NexusFlow workspace</span><h1>{name}</h1><p>This view uses the same seeded, tenant-isolated prototype data.</p></div></div><section className="panel placeholder-panel"><span className="feature-icon knowledge">✦</span><h2>{name} is connected to the demo journey.</h2><p>Use Command Centre, Knowledge Vault, Programmes, AI activity and Analytics for the complete stakeholder walkthrough.</p></section></div>;
}

function AdminApp({ path, setPath }: { path: string; setPath: (path: string) => void }) {
  let content: React.ReactNode;
  if (path === "/admin/command-centre") content = <CommandCentre />;
  else if (path === "/admin/knowledge-vault" || path === "/admin/content-review") content = <KnowledgeVault />;
  else if (path === "/admin/ai-activity") content = <AIActivity />;
  else if (path === "/admin/analytics") content = <Analytics />;
  else if (path === "/admin/programmes" || path === "/admin/training-studio") content = <Programmes />;
  else content = <PlaceholderAdmin path={path} />;
  return <Shell mode="admin" path={path} setPath={setPath}>{content}</Shell>;
}

function Invitation({ onAccept }: { onAccept: () => void }) {
  return <div className="learner-stage invitation-stage"><div className="invitation-card"><div className="invite-logos"><span>AC</span><i>→</i><span>NF</span></div><span className="eyebrow">You’re invited</span><h1>Build confident NexusFlow skills.</h1><p>Aurora Creative has assigned you the Project Manager onboarding journey.</p><div className="invite-details"><span><small>Workspace</small><strong>Aurora Creative</strong></span><span><small>Assigned role</small><strong>Project Manager</strong></span><span><small>Estimated time</small><strong>48 minutes</strong></span></div><button className="button button-primary" onClick={onAccept}>Accept invitation <span>→</span></button><small className="safe-note">Fictional demo workspace · No account created</small></div></div>;
}

function Diagnostic({ onComplete }: { onComplete: (score: number) => void }) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const question = diagnosticQuestions[index];
  function answer(option: number) {
    const nextScore = score + (option === question.correct ? 1 : 0);
    if (index === diagnosticQuestions.length - 1) onComplete(nextScore);
    else { setScore(nextScore); setIndex((value) => value + 1); }
  }
  return <div className="learner-stage diagnostic-stage"><div className="diagnostic-card"><div className="step-progress"><span>Diagnostic {index + 1} of {diagnosticQuestions.length}</span><progress value={index + 1} max={diagnosticQuestions.length} /></div><span className="eyebrow">Personalise your pathway</span><h1>{question.question}</h1><p>Choose the best answer. Your result changes the level of explanation, never the mandatory simulations.</p><div className="answer-options">{question.options.map((option, optionIndex) => <button key={option} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}<i>›</i></button>)}</div></div></div>;
}

function PathwayReveal({ score, onContinue }: { score: number; onContinue: () => void }) {
  const path = assignPathway(score);
  return <div className="learner-stage pathway-stage"><div className="pathway-reveal"><div className="pathway-orb"><strong>{score}/5</strong><span>diagnostic</span></div><span className="eyebrow">Your recommended pathway</span><h1>{path.level} Project Manager path</h1><p>{path.reason}</p><div className="why-card"><strong>Why this pathway?</strong><span>The recommendation uses only your five diagnostic responses and the fixed programme rules. AI cannot change the pass threshold or remove mandatory practice.</span></div><div className="mini-path"><span className="complete">✓ Basics</span><i>→</i><span>01 Learn</span><i>→</i><span>02 Practise</span><i>→</i><span>03 Validate</span></div><button className="button button-primary" onClick={onContinue}>Enter learning universe <span>→</span></button></div></div>;
}

function LearnerHome({ setPath, twoD }: { setPath: (path: string) => void; twoD: boolean }) {
  return <div className="page-content learner-home"><div className="learner-welcome"><div><span className="eyebrow">Project Manager pathway</span><h1>Continue building NexusFlow capability.</h1><p>You’re 42% through the mandatory pathway. Your next step is a safe project-creation mission.</p><button className="button button-primary" onClick={() => navigate("/learner/simulator", setPath)}>Continue mission <span>→</span></button></div><ProgressRing value={42} label="Pathway completion" /></div><div className="learning-universe-panel"><UniverseVisual twoD={twoD} /><div className="universe-caption"><span className="environment-chip"><i /> Pathway active</span><strong>Product Learning Universe</strong><small>Use the cards below for a complete 2D alternative.</small></div></div><div className="module-card-grid">{modules.map((module, index) => <article key={module.id} className={module.progress === 0 ? "locked" : ""}><span className={`module-symbol ${module.label.toLowerCase()}`}>{module.progress === 100 ? "✓" : `0${index + 1}`}</span><span className="module-card-copy"><small>{module.label} · {module.duration} min</small><strong>{module.title}</strong><progress value={module.progress} max="100" /><em>{module.progress === 100 ? "Complete" : module.progress > 0 ? `${module.progress}% complete` : "Next in pathway"}</em></span><button onClick={() => navigate(module.label === "Practise" ? "/learner/simulator" : "/learner/onboarding", setPath)} aria-label={`Open ${module.title}`}>→</button></article>)}</div></div>;
}

function GuidePresence({ loading, status }: { loading: boolean; status?: GuideResult["status"] }) {
  const state = loading ? "verifying" : status === "Verified" ? "verified" : status === "Limited guidance" ? "limited" : status === "Not covered" ? "uncovered" : "ready";
  const label = loading ? "Verifying evidence" : status ?? "Guide ready";
  return <div className={`guide-presence ${state}`} role="status" aria-live="polite"><div className="hologram-orb"><span>AI</span><i /><b /></div><span><strong>{label}</strong><small>{loading ? "Tracing approved source connections" : status ? "Grounding state updated" : "Grounded to NexusFlow 4.2"}</small></span></div>;
}

function ProductGuide() {
  const [mode, setMode] = useState<GuideMode>("explain");
  const [query, setQuery] = useState("How do I create my first project?");
  const [result, setResult] = useState<GuideResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function ask(question = query) {
    setLoading(true); setFeedback(""); setQuery(question);
    try {
      const response = await fetch("/api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: question, mode, organisationId: "org-nexus", role: "Project Manager", module: "Creating a project" }) });
      if (!response.ok) throw new Error("Guide unavailable");
      setResult(await response.json() as GuideResult);
    } catch {
      setResult(answerGroundedQuestion({ query: question, mode, organisationId: "org-nexus", role: "Project Manager", module: "Creating a project" }) as GuideResult);
    } finally { setLoading(false); }
  }
  return <div className="page-content guide-page"><div className="page-heading"><div><span className="eyebrow">Grounded Product Guide</span><h1>Ask NexusFlow. Get authorised guidance.</h1><p>Answers use approved, published material for your role, module and product version.</p></div><div className="guide-presence-stack"><GuidePresence loading={loading} status={result?.status} /><div className="trust-chip"><span>✓</span><strong>Retrieval boundary active</strong><small>NexusFlow · v4.2 · Project Manager</small></div></div></div><div className="guide-layout"><section className="panel guide-chat"><div className="mode-toggle" role="group" aria-label="Answer mode"><button className={mode === "explain" ? "active" : ""} onClick={() => setMode("explain")}><span>⌁</span><strong>Explain this</strong><small>Concepts in plain language</small></button><button className={mode === "guide" ? "active" : ""} onClick={() => setMode("guide")}><span>→</span><strong>Guide me</strong><small>Exact approved procedure</small></button></div><div className="conversation"><div className="guide-message"><span className="guide-avatar">AI</span><div><small>Amygdala Product Guide</small><p>I’m here to help with the NexusFlow Project Manager pathway. I’ll only use vendor-approved material and will show you exactly where each factual instruction comes from.</p></div></div>{loading && <div className="thinking"><span /><span /><span /> Verifying approved evidence…</div>}{result && <div className="answer-card"><div className="answer-status"><StatusPill value={result.status} /><span>{result.status === "Verified" ? "Strong support found in approved material" : result.status === "Limited guidance" ? "Related approved material found" : "No sufficient approved material"}</span></div><div className="answer-body">{result.answer.split("\n").map((line, index) => line ? <p key={index}>{line}</p> : null)}</div>{result.citations.map((citation) => <div className="citation" key={citation.sourceId}><span>▣</span><span><small>Authorised source</small><strong>{citation.title}</strong><em>v{citation.version} · {citation.section}</em></span><button>View source →</button></div>)}<div className="feedback-row"><span>Was this helpful?</span>{["Helpful", "Not helpful", "Report an issue"].map((item) => <button key={item} className={feedback === item ? "selected" : ""} onClick={() => setFeedback(item)}>{item}</button>)}</div></div>}</div><form className="guide-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}><label htmlFor="guide-question">Ask about this module</label><textarea id="guide-question" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} placeholder="Ask a product-specific question…" /><div><span>Answers are grounded in authorised sources.</span><button className="button button-primary" disabled={loading || query.trim().length < 3}>Ask guide <i>↑</i></button></div></form></section><aside className="panel guide-context"><span className="tiny-label">Current context</span><h2>Create a project</h2><div className="context-map"><span className="done">✓ Dashboard navigation</span><i /><span className="active">02 Creating a project</span><i /><span>03 Team collaboration</span></div><span className="tiny-label">Try asking</span>{["Guide me through creating a project", "What does a project template do?", "Does NexusFlow include payroll?"].map((item) => <button className="suggested-question" key={item} onClick={() => ask(item)}>{item}<span>→</span></button>)}<div className="context-boundary"><span>⊙</span><p><strong>Your content stays isolated.</strong> Searches never cross the NexusFlow knowledge boundary or customer workspace.</p></div></aside></div></div>;
}

function Simulator({ onComplete }: { onComplete: (score: number) => void }) {
  const [missionId, setMissionId] = useState("mission-project");
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState(0);
  const [guided, setGuided] = useState(true);
  const [complete, setComplete] = useState(false);
  const mission = missions.find((item) => item.id === missionId) ?? missions[0];
  function choose(label: string) {
    if (label === mission.steps[step]?.label) {
      if (step === mission.steps.length - 1) { setComplete(true); onComplete(Math.max(60, 100 - errors * 8)); }
      else setStep((value) => value + 1);
    } else setErrors((value) => value + 1);
  }
  function selectMission(id: string) { setMissionId(id); setStep(0); setErrors(0); setComplete(false); }
  const alternatives = ["Open Reports", "Archive workspace", "Change billing", "Delete project"];
  return <div className="page-content simulator-page"><div className="page-heading"><div><span className="eyebrow">Safe Product Simulator</span><h1>Practise NexusFlow without production risk.</h1><p>Interactive missions use a fictional workspace and approved procedures.</p></div><div className="mode-selector"><button className={guided ? "active" : ""} onClick={() => setGuided(true)}>Guided</button><button className={!guided ? "active" : ""} onClick={() => setGuided(false)}>Independent</button></div></div><div className="mission-tabs">{missions.map((item, index) => <button key={item.id} className={mission.id === item.id ? "active" : ""} onClick={() => selectMission(item.id)}><span>0{index + 1}</span><strong>{item.title}</strong><small>{item.minutes} min</small></button>)}</div><div className="simulator-layout"><aside className="panel mission-brief"><span className="tiny-label">Mission objective</span><h2>{mission.title}</h2><p>{mission.objective}</p><div className="brief-meta"><span><small>Estimated time</small><strong>{mission.minutes} minutes</strong></span><span><small>Prerequisite</small><strong>{mission.prerequisite}</strong></span><span><small>Attempt</small><strong>#1 · {errors} errors</strong></span></div><div className="mission-steps">{mission.steps.map((item, index) => <div className={index < step || complete ? "done" : index === step ? "active" : ""} key={item.label}><span>{index < step || complete ? "✓" : index + 1}</span><strong>{item.label}</strong></div>)}</div>{guided && !complete && <div className="hint-card"><span>✦</span><p><strong>Progressive hint</strong>{mission.steps[step].hint}</p></div>}<div className="approved-ref"><span>▣</span><p><small>Approved reference</small><strong>{seededSources.find((source) => source.id === mission.sourceId)?.title}</strong></p></div></aside><section className="simulation-window"><div className="sim-browser"><div className="sim-browser-bar"><span><i /><i /><i /></span><strong>NexusFlow training workspace</strong><em>SIMULATION</em></div><div className="nexus-app"><nav><div className="nexus-logo">N</div>{["Dashboard", "Projects", "Team", "Workflows", "Reports"].map((item) => <button key={item} className={mission.steps[step]?.label.includes(item) ? "hotspot" : ""} onClick={() => choose(`Open ${item}`)}>{item.charAt(0)}<span>{item}</span></button>)}</nav><main><div className="nexus-top"><div><small>Aurora Creative / Training</small><h2>{mission.title}</h2></div><span className="fictional-chip">Fictional data</span></div>{complete ? <div className="simulation-success"><span>✓</span><h2>Mission complete</h2><p>You followed the approved procedure with {errors} {errors === 1 ? "error" : "errors"}.</p><strong>{Math.max(60, 100 - errors * 8)}% practical competency</strong><button className="button button-primary" onClick={() => selectMission(missions[(missions.indexOf(mission) + 1) % missions.length].id)}>Next mission →</button></div> : <div className="nexus-canvas"><div className="canvas-copy"><span className="tiny-label">Current action</span><h3>{mission.steps[step].label}</h3><p>Choose the correct control in this simulated NexusFlow workspace.</p></div><div className="sim-actions"><button className="correct-hotspot" onClick={() => choose(mission.steps[step].label)}><span>＋</span>{mission.steps[step].label}{guided && <i>Next approved action</i>}</button>{alternatives.slice(0, 2).map((item) => <button key={item} onClick={() => choose(item)}>{item}</button>)}</div><div className="fake-projects"><div><span className="skeleton-line wide" /><span className="skeleton-line" /><i /></div><div><span className="skeleton-line wide" /><span className="skeleton-line" /><i /></div><div><span className="skeleton-line wide" /><span className="skeleton-line" /><i /></div></div></div>}</main></div></div></section></div></div>;
}

function Assessment({ simulationScore, onComplete }: { simulationScore: number; onComplete: (score: number) => void }) {
  const [index, setIndex] = useState(0); const [score, setScore] = useState(0); const [finished, setFinished] = useState(false);
  const question = assessmentQuestions[index];
  function answer(option: number) { const next = score + (option === question.correct ? 1 : 0); if (index === assessmentQuestions.length - 1) { setScore(next); setFinished(true); onComplete(next * 20); } else { setScore(next); setIndex((value) => value + 1); } }
  if (finished) return <div className="page-content result-inline"><div className="result-orb"><strong>{score * 20}%</strong><span>assessment</span></div><StatusPill value={score >= 4 ? "Passed" : "Review recommended"} /><h1>{score >= 4 ? "Knowledge validated." : "A short review will help."}</h1><p>Your answers are combined with learning and practical competence using the fixed readiness formula.</p><button className="button button-primary" onClick={() => { window.history.pushState({}, "", "/learner/results"); window.dispatchEvent(new PopStateEvent("popstate")); }}>View readiness result →</button></div>;
  return <div className="page-content assessment-page"><div className="assessment-shell"><div className="assessment-sidebar"><span className="eyebrow">Final validation</span><h1>Product knowledge assessment</h1><p>Five questions based on approved NexusFlow material. The pass threshold is fixed at 80%.</p><div className="assessment-metrics"><span><small>Questions</small><strong>5</strong></span><span><small>Pass mark</small><strong>80%</strong></span><span><small>Simulation</small><strong>{simulationScore}%</strong></span></div></div><div className="diagnostic-card"><div className="step-progress"><span>Question {index + 1} of 5</span><progress value={index + 1} max="5" /></div><h2>{question.question}</h2><div className="answer-options">{question.options.map((option, optionIndex) => <button key={option} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}<i>›</i></button>)}</div><p className="assessment-note">Incorrect responses recommend the relevant lesson. AI cannot answer assessed questions for you.</p></div></div></div>;
}

function SkillsConstellation({ readiness }: { readiness: number }) {
  const skills = [
    ["navigation", "Navigation", "100%"],
    ["projects", "Projects", "92%"],
    ["team", "Team", "86%"],
    ["automation", "Automation", "78%"],
    ["reporting", "Reporting", "82%"],
  ];
  return <section className="skills-constellation-panel" aria-labelledby="skills-constellation-title"><div className="constellation-copy"><span className="eyebrow">Living capability model</span><h2 id="skills-constellation-title">Your skills now form a connected system.</h2><p>Each illuminated node represents demonstrated NexusFlow capability. Exact results remain available in the accessible summary.</p><div className="constellation-summary" aria-label="Capability scores">{skills.map(([, label, score]) => <span key={label}><strong>{label}</strong><b>{score}</b></span>)}</div></div><div className="skills-space" aria-hidden="true"><div className="skills-plane" /><div className="skill-core"><strong>{readiness}</strong><span>ready</span></div>{skills.map(([key, label, score], index) => <div key={key} className={`skill-node skill-${key}`} style={{ "--skill-delay": `${index * -0.55}s` } as React.CSSProperties}><i /><strong>{label}</strong><span>{score}</span></div>)}<i className="skill-link link-one" /><i className="skill-link link-two" /><i className="skill-link link-three" /><i className="skill-link link-four" /><i className="skill-link link-five" /></div></section>;
}

function Results({ simulationScore, assessmentScore, setPath }: { simulationScore: number; assessmentScore: number; setPath: (path: string) => void }) {
  const readiness = calculateReadiness({ lessons: 82, simulation: simulationScore, assessment: assessmentScore });
  return <div className="page-content results-page"><div className="results-hero"><div className="result-glow" /><span className="eyebrow">Verified readiness result</span><ProgressRing value={readiness} label="Overall readiness" /><h1>{readiness >= 80 ? "Ready for confident NexusFlow use." : "On track—complete the recommended practice."}</h1><p>Your result combines observed learning, simulation competence and the final knowledge assessment.</p><StatusPill value={readiness >= 80 ? "Ready for access" : "On track"} /></div><SkillsConstellation readiness={readiness} /><div className="result-breakdown"><article><span className="result-weight">30%</span><strong>Learning completion</strong><b>82%</b><progress value="82" max="100" /><small>4 of 5 modules complete</small></article><article><span className="result-weight">40%</span><strong>Simulation competency</strong><b>{simulationScore}%</b><progress value={simulationScore} max="100" /><small>Practical mission performance</small></article><article><span className="result-weight">30%</span><strong>Final assessment</strong><b>{assessmentScore}%</b><progress value={assessmentScore} max="100" /><small>Pass threshold: 80%</small></article></div><div className="formula-banner"><span>Transparent calculation</span><strong>(82 × 0.30) + ({simulationScore} × 0.40) + ({assessmentScore} × 0.30) = {readiness}%</strong><em>AI cannot change this formula.</em></div><div className="result-actions"><button className="button button-secondary" onClick={() => navigate("/learner/onboarding", setPath)}>Review pathway</button><button className="button button-primary" onClick={() => navigate("/learner/certificate", setPath)}>View certificate →</button></div></div>;
}

function Certificate() {
  function download() {
    const text = `AMYGDALA PROTOTYPE CERTIFICATE\n\nThis certifies that Aisha Naidoo demonstrated NexusFlow Project Manager readiness in the Amygdala interactive demo.\n\nLearning 82% · Simulation 92% · Assessment 100% · Overall readiness 91%\nIssued 13 August 2026 · Demo credential AMY-NF-0042`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "amygdala-nexusflow-certificate.txt"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="page-content certificate-page"><div className="certificate"><div className="certificate-border"><Brand /><span className="certificate-kicker">Certificate of product readiness</span><h1>Aisha Naidoo</h1><p>has demonstrated practical and knowledge readiness for the</p><h2>NexusFlow Project Manager pathway</h2><div className="certificate-score"><strong>91%</strong><span>Verified readiness</span></div><div className="certificate-meta"><span><small>Issued</small><strong>13 August 2026</strong></span><span><small>Credential</small><strong>AMY-NF-0042</strong></span><span><small>Workspace</small><strong>Aurora Creative</strong></span></div><em>Prototype demonstration credential · not a production certification</em></div></div><button className="button button-primary" onClick={download}>Download prototype certificate ↓</button></div>;
}

function OnboardingOverview({ setPath }: { setPath: (path: string) => void }) {
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Your assigned journey</span><h1>NexusFlow Project Manager pathway</h1><p>Learn the approved foundations, practise three workflows and validate readiness.</p></div><StatusPill value="In progress" /></div><div className="programme-layout"><section className="panel module-stack"><div className="panel-header"><div><span className="tiny-label">Recommended sequence</span><h2>Standard pathway</h2></div><span className="environment-chip"><i /> 42% complete</span></div>{modules.map((module, index) => <article key={module.id}><span className="module-order">0{index + 1}</span><span className={`module-symbol ${module.label.toLowerCase()}`}>{module.progress === 100 ? "✓" : module.label === "Practise" ? "◇" : "◫"}</span><span><small>{module.label} · {module.duration} min</small><strong>{module.title}</strong><progress value={module.progress} max="100" /></span><button onClick={() => navigate(module.label === "Practise" ? "/learner/simulator" : "/learner/guide", setPath)}>→</button></article>)}</section><aside className="panel programme-summary"><span className="tiny-label">Why this pathway?</span><h2>Diagnostic rules, made visible.</h2><p>Your 4/5 diagnostic result assigned the standard pathway. Mandatory simulations and the 80% pass threshold stay fixed.</p><div className="why-card"><strong>Recommended next action</strong><span>Complete the Create your first project mission.</span></div><button className="button button-primary full-width" onClick={() => navigate("/learner/simulator", setPath)}>Start mission →</button></aside></div></div>;
}

function AccessibilitySettings({ reduced, setReduced, lowPerformance, setLowPerformance, twoD, setTwoD }: { reduced: boolean; setReduced: (value: boolean) => void; lowPerformance: boolean; setLowPerformance: (value: boolean) => void; twoD: boolean; setTwoD: (value: boolean) => void }) {
  const settings = [["Reduced motion", "Stops spatial transitions and decorative movement.", reduced, setReduced], ["Low-performance mode", "Reduces atmospheric effects for older devices.", lowPerformance, setLowPerformance], ["Complete 2D view", "Replaces the spatial map with flat module relationships.", twoD, setTwoD]] as const;
  return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">Personal accessibility</span><h1>Choose how the learning universe behaves.</h1><p>These device-only preferences never change your pathway or readiness score.</p></div></div><section className="panel settings-panel">{settings.map(([title, copy, active, setter]) => <label key={title}><span><strong>{title}</strong><small>{copy}</small></span><input type="checkbox" aria-label={title} checked={active} onChange={(event) => setter(event.target.checked)} /><i /></label>)}</section><section className="panel accessibility-summary"><span>✓</span><p><strong>WCAG-conscious by default</strong> Keyboard navigation, visible focus, semantic labels, mobile touch targets and screen-reader alternatives are built into every demo journey.</p></section></div>;
}

function LearnerApp({ path, setPath }: { path: string; setPath: (path: string) => void }) {
  const [entryStage, setEntryStage] = useState<"invite" | "diagnostic" | "pathway" | "ready">("invite");
  const [diagnosticScore, setDiagnosticScore] = useState(4);
  const [simulationScore, setSimulationScore] = useState(92);
  const [assessmentScore, setAssessmentScore] = useState(100);
  const [reduced, setReduced] = useState(false);
  const [lowPerformance, setLowPerformance] = useState(false);
  const [twoD, setTwoD] = useState(false);
  useEffect(() => { document.documentElement.dataset.motion = reduced ? "reduced" : "full"; document.documentElement.dataset.performance = lowPerformance ? "low" : "full"; }, [reduced, lowPerformance]);
  if (path === "/learner/home" && entryStage !== "ready") {
    if (entryStage === "invite") return <Invitation onAccept={() => setEntryStage("diagnostic")} />;
    if (entryStage === "diagnostic") return <Diagnostic onComplete={(score) => { setDiagnosticScore(score); setEntryStage("pathway"); }} />;
    return <PathwayReveal score={diagnosticScore} onContinue={() => setEntryStage("ready")} />;
  }
  let content: React.ReactNode;
  if (path === "/learner/home") content = <LearnerHome setPath={setPath} twoD={twoD} />;
  else if (path === "/learner/onboarding") content = <OnboardingOverview setPath={setPath} />;
  else if (path === "/learner/guide") content = <ProductGuide />;
  else if (path === "/learner/simulator") content = <Simulator onComplete={setSimulationScore} />;
  else if (path === "/learner/assessment") content = <Assessment simulationScore={simulationScore} onComplete={setAssessmentScore} />;
  else if (path === "/learner/results") content = <Results simulationScore={simulationScore} assessmentScore={assessmentScore} setPath={setPath} />;
  else if (path === "/learner/certificate") content = <Certificate />;
  else content = <AccessibilitySettings reduced={reduced} setReduced={setReduced} lowPerformance={lowPerformance} setLowPerformance={setLowPerformance} twoD={twoD} setTwoD={setTwoD} />;
  return <Shell mode="learner" path={path} setPath={setPath}>{content}</Shell>;
}

export default function AmygdalaApp({ initialPath = "/" }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); (document.querySelector("input[type='search'], .search-field input") as HTMLInputElement | null)?.focus(); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const view = useMemo(() => path.startsWith("/admin") ? "admin" : path.startsWith("/learner") ? "learner" : path === "/demo" ? "demo" : "landing", [path]);
  if (view === "admin") return <AdminApp path={path} setPath={setPath} />;
  if (view === "learner") return <LearnerApp path={path} setPath={setPath} />;
  if (view === "demo") return <DemoEntry setPath={setPath} />;
  return <Landing path={path} setPath={setPath} />;
}

export { SAFE_FALLBACK };
