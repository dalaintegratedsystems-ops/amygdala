"use client";

import { useMemo, useState } from "react";

type IconName =
  | "arrow"
  | "book"
  | "check"
  | "chevron"
  | "clock"
  | "device"
  | "download"
  | "flag"
  | "flow"
  | "learner"
  | "people"
  | "report"
  | "shield"
  | "signal"
  | "spark"
  | "tools"
  | "video";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    device: <><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M10 18.5h4" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
    flag: <><path d="M5 21V4" /><path d="M5 5h11l-2 4 2 4H5" /></>,
    flow: <><rect x="3" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /><path d="M10 6h4a3 3 0 0 1 3 3v6" /><path d="m14 12 3 3 3-3" /></>,
    learner: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    report: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-5" /></>,
    signal: <><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8 16a6 6 0 0 1 8 0" /><path d="M11 19.5a2 2 0 0 1 2 0" /></>,
    spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>,
    tools: <><path d="M14.5 6.5a4 4 0 0 0-5-5l2.2 2.2-2.8 2.8-2.2-2.2a4 4 0 0 0 5 5L20 17.6a2 2 0 0 1-2.8 2.8L9 12.2" /><path d="m5 19 4-4" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const sections = [
  ["overview", "Purpose"],
  ["operating-model", "Operating model"],
  ["kickstart", "Kickstart"],
  ["live-session", "Live session"],
  ["closeout", "Close-out"],
  ["tools", "Tools"],
] as const;

const lifecycle = [
  { n: "01", title: "Mobilise", copy: "Align school, timetable, learners, kit and connectivity.", owner: "Manager + school" },
  { n: "02", title: "Prepare", copy: "Train, rehearse, test devices and open the platform.", owner: "Enabler" },
  { n: "03", title: "Orient", copy: "Set expectations and move the class through shared checkpoints.", owner: "Enabler + educator" },
  { n: "04", title: "Enable", copy: "Protect learning time, solve technical blockers and sustain focus.", owner: "Enabler" },
  { n: "05", title: "Evidence", copy: "Record attendance, uptime, progress, issues and learner wins.", owner: "Enabler" },
  { n: "06", title: "Improve", copy: "Review weekly data, actions and programme risks.", owner: "Programme team" },
];

const prepChecklist = [
  "Confirm timetable, venue, class list and educator attendance.",
  "Charge tablets and verify chargers, headphones and kit count.",
  "Confirm learner accounts and print or sort login cards.",
  "Test Wi-Fi and distinguish local connectivity from platform errors.",
  "Open the Reflective login page on every available device.",
  "Place devices according to the seating or rotation plan.",
  "Open the attendance register, issue log and escalation contacts.",
  "Agree the educator signal for discipline or content support.",
];

const deliveryChecklist = [
  "Introduce the purpose: diagnose gaps, catch up and demonstrate mastery.",
  "Issue one tablet and one login card per assigned learner.",
  "Use the stop–show–do–check rhythm at every checkpoint.",
  "Confirm every learner selected Maths / Numerate.",
  "Confirm every learner is in the Numbers journey before release.",
  "State assessment rules and ask learners to repeat them back.",
  "Roam continuously; resolve access and device issues without coaching answers.",
  "Protect focused active-learning time and flag disengaged learners.",
];

const closeChecklist = [
  "Give a two-minute warning and guide learners to stop safely.",
  "Confirm work has saved or synced before logout.",
  "Collect every tablet, login card, charger and headphone.",
  "Count, inspect, charge and store the ICT kit securely.",
  "Complete attendance, session status, uptime and issue records.",
  "Escalate unresolved blockers with evidence and impact.",
  "Share progress flags with the educator or school champion.",
  "Capture one specific learner win or implementation insight.",
];

const checkpoints = [
  {
    number: "01",
    label: "Access",
    title: "Tablet, card, login — then wait",
    say: "You’ll receive a tablet and a login card. Enter the details exactly as shown. When you reach the home screen, place the tablet flat and wait for the next instruction.",
    verify: "Name or account is correct; learner is on the home screen; no one starts early.",
    visual: "login",
  },
  {
    number: "02",
    label: "Subject",
    title: "Choose the Maths bubble",
    say: "Find the Maths bubble and tap it once. When the Maths home opens, stop and wait.",
    verify: "Maths / Numerate is open for every learner—not English / Lingo.",
    visual: "subjects",
  },
  {
    number: "03",
    label: "Purpose",
    title: "Explain the seven journeys",
    say: "Numerate organises 81 important maths concepts into seven journeys. Each starts by checking what you already understand, then gives you your own catch-up path. You do not need to move at the same pace as anyone else.",
    verify: "Learners understand that locked journeys protect foundations and are not a punishment.",
    visual: "journeys",
  },
  {
    number: "04",
    label: "Integrity",
    title: "Set the assessment rules",
    say: "This diagnostic does not count toward your school marks. Work independently: no help, calculator, notes or copying. Make your own best attempt so the programme can give you the right learning.",
    verify: "Learners can repeat the rules; educator agrees to redirect content questions.",
    visual: "rules",
  },
  {
    number: "05",
    label: "Release",
    title: "Open Numbers and follow the prompts",
    say: "Your first journey today is Numbers. Tap Numbers and follow the prompts. Raise your hand only if the device, login or page is not working.",
    verify: "Physically scan screens: all learners are in Numbers—not Data Literacy or another journey.",
    visual: "numbers",
  },
];

const issueRows = [
  ["Learner cannot log in", "Check card, spelling, spaces, Caps Lock and assigned account; retry once.", "Account still rejected or learner record is wrong.", "ICT Manager", "Photo/error text + learner ID + device ID"],
  ["No internet on one device", "Toggle Wi-Fi, reconnect, compare with a working device, restart browser/device.", "Device remains offline while others work.", "ICT Manager", "Device ID + checks completed"],
  ["No internet on all devices", "Check router/power, network indicator and whether another site opens.", "More than 20% of learners blocked for 5 minutes.", "ICT Manager + educator", "Start time + affected count + indicators"],
  ["Platform/server error", "Refresh once, reopen page, clear cache only if trained; do not repeatedly submit.", "Same error on multiple connected devices.", "ICT Manager", "Exact message + URL + screenshot + time"],
  ["Wrong journey", "Pause learner; return to Maths home; select Numbers.", "Navigation is locked or assignment appears incorrect.", "ICT Manager", "Learner ID + expected/actual journey"],
  ["Disruption or refusal", "Use calm re-engagement and restate the task.", "Behaviour affects safety or learning after one redirect.", "Educator", "Neutral observation; no diagnosis"],
  ["Timetable / teacher blocker", "Confirm the agreed session slot and minimum session conditions.", "Class, venue or educator repeatedly unavailable.", "School Success Manager", "Date + class + impact + prior action"],
  ["Safeguarding concern", "Do not investigate or promise secrecy; keep the learner safe and follow school policy.", "Immediately.", "Designated safeguarding lead", "Factual words/actions only; protect privacy"],
];

const storyboard = [
  ["00:00–00:25", "Why the role matters", "Enabler converts access to active learning; educator retains teaching and discipline.", "Role boundary split-screen"],
  ["00:25–01:05", "Room ready", "Arrive 30 minutes early; count, connect, test and pre-load.", "Fast kit and Wi-Fi checklist"],
  ["01:05–02:45", "Five learner checkpoints", "Model the exact stop–show–do–check sequence from login to Numbers.", "Illustrated learner screens"],
  ["02:45–03:25", "Assessment integrity", "No hints, calculator or copying; technical support only.", "Green / red support examples"],
  ["03:25–04:15", "Enable the session", "Roam, triage, re-engage, monitor active learning and involve the educator.", "Room movement map"],
  ["04:15–05:00", "Close and evidence", "Sync, logout, count kit, report data and escalate blockers with evidence.", "Close-out checklist + sample issue"],
];

function ScreenIllustration({ type }: { type: string }) {
  if (type === "login") {
    return <div className="screen-ui login-ui"><div className="mini-brand"><span>r</span> reflective</div><div className="login-card"><small>Welcome back</small><strong>Learner login</strong><i>Username from card</i><i>••••••••</i><b>Log in</b></div></div>;
  }
  if (type === "subjects") {
    return <div className="screen-ui"><div className="screen-top"><span>Hello, learner</span><i>Home</i></div><div className="subject-grid"><div className="maths"><span>∑</span><strong>Maths</strong><small>Numerate</small></div><div><span>Aa</span><strong>English</strong><small>Lingo</small></div></div></div>;
  }
  if (type === "journeys") {
    return <div className="screen-ui"><div className="screen-top"><span>Maths journeys</span><i>1 of 7 ready</i></div><div className="journey-map"><div className="active"><b>01</b><span><strong>Numbers</strong><small>Start here</small></span></div>{["Operations", "Fractions", "Patterns", "Data", "Geometry", "Measurement"].map((item, index) => <div key={item}><b>{String(index + 2).padStart(2, "0")}</b><span><strong>{item}</strong><small>Build foundations</small></span></div>)}</div></div>;
  }
  if (type === "rules") {
    return <div className="screen-ui rules-ui"><div className="rule-good"><span>✓</span><strong>Your own best attempt</strong></div><div className="rule-list"><span>× No assistance</span><span>× No calculator</span><span>× No notes or copying</span></div><p>Technical help is always available.</p></div>;
  }
  return <div className="screen-ui numbers-ui"><div className="screen-top"><span>Journey 01</span><i>Ready</i></div><div className="numbers-orb"><span>1 2 3</span></div><strong>Numbers</strong><p>Begin your diagnostic to build a personal catch-up path.</p><b>Start assessment <Icon name="arrow" size={14} /></b></div>;
}

function Checklist({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const count = checked.filter(Boolean).length;
  return <article className={`checklist-card ${accent}`}>
    <div className="checklist-head">
      <div><span>{count}/{items.length}</span><h3>{title}</h3></div>
      <button onClick={() => setChecked(items.map(() => false))}>Reset</button>
    </div>
    <div className="completion-bar"><i style={{ width: `${(count / items.length) * 100}%` }} /></div>
    <div className="checklist-items">
      {items.map((item, index) => <label key={item} className={checked[index] ? "done" : ""}>
        <input type="checkbox" checked={checked[index]} onChange={() => setChecked(current => current.map((value, i) => i === index ? !value : value))} />
        <span><Icon name="check" size={15} /></span>
        <em>{item}</em>
      </label>)}
    </div>
  </article>;
}

function AppHeader() {
  const [open, setOpen] = useState(false);
  return <header className="sop-header">
    <a className="reflective-brand" href="#overview" aria-label="Reflective Enabler Playbook home">
      <span className="reflective-mark">r</span>
      <span><strong>reflective</strong><small>ENABLER PLAYBOOK</small></span>
    </a>
    <button className="nav-toggle" onClick={() => setOpen(value => !value)} aria-label="Toggle navigation">Menu</button>
    <nav className={open ? "open" : ""} aria-label="Document sections">
      {sections.map(([href, label]) => <a key={href} href={`#${href}`} onClick={() => setOpen(false)}>{label}</a>)}
    </nav>
    <button className="print-button" onClick={() => window.print()}><Icon name="download" size={16} /> Save / print</button>
  </header>;
}

export default function EnablerSOP() {
  const [activeCheckpoint, setActiveCheckpoint] = useState(0);
  const active = checkpoints[activeCheckpoint];
  const today = useMemo(() => "Implementation standard · Version 1.0 · September 2026", []);

  return <div className="sop-site">
    <AppHeader />
    <main>
      <section className="sop-hero" id="overview">
        <div className="hero-gridline" />
        <div className="hero-copy">
          <div className="doc-label"><span>STANDARD OPERATING PROCEDURE</span><i />REF–ENB–001</div>
          <h1>From kit to <em>learning momentum.</em></h1>
          <p className="hero-lead">The end-to-end operating playbook for ICT &amp; Digital Platform Enablers delivering Reflective-funded programmes in South African schools.</p>
          <div className="hero-actions">
            <a className="primary-action" href="#kickstart">Run the first session <Icon name="arrow" /></a>
            <a className="secondary-action" href="#tools">Open field checklists</a>
          </div>
          <div className="hero-meta"><span><Icon name="clock" size={15} /> {today}</span><span><Icon name="shield" size={15} /> Owner: ICT &amp; Facilitation Manager</span></div>
        </div>
        <div className="hero-system" aria-label="Enabler impact model">
          <div className="system-orbit orbit-a" />
          <div className="system-orbit orbit-b" />
          <div className="system-core"><Icon name="spark" size={26} /><strong>Active<br />learning</strong><small>the outcome</small></div>
          <div className="system-node node-kit"><Icon name="device" /><span><strong>Ready kit</strong><small>Access</small></span></div>
          <div className="system-node node-guide"><Icon name="learner" /><span><strong>Clear guidance</strong><small>Confidence</small></span></div>
          <div className="system-node node-data"><Icon name="report" /><span><strong>Clean evidence</strong><small>Accountability</small></span></div>
          <svg className="system-lines" viewBox="0 0 500 420" aria-hidden="true"><path d="M116 100 240 195M390 125 270 200M366 340 270 238" /></svg>
        </div>
      </section>

      <section className="impact-strip" aria-label="Programme essentials">
        <div><strong>60 min</strong><span>recommended learner access per week</span></div>
        <div><strong>81</strong><span>Maths concepts across seven trajectories</span></div>
        <div><strong>30 min</strong><span>arrival before the first session</span></div>
        <div><strong>1 role</strong><span>turning technology into implementation</span></div>
      </section>

      <section className="content-section mandate-section">
        <div className="section-heading">
          <span className="kicker">THE MANDATE</span>
          <h2>Enable the conditions for every learner to progress.</h2>
          <p>Reflective addresses hidden learning gaps in Maths and English. Numerate diagnoses gaps, builds an individual catch-up path and checks mastery. The Enabler makes that model work reliably in a real classroom.</p>
        </div>
        <div className="role-boundary">
          <article className="role-card enabler-role"><div className="role-icon"><Icon name="tools" /></div><span className="role-tag">ENABLER OWNS</span><h3>Access, flow &amp; evidence</h3><ul><li>Prepare and protect the ICT kit</li><li>Guide login and correct platform use</li><li>Resolve in-scope technical issues</li><li>Monitor engagement and active minutes</li><li>Record and escalate implementation facts</li></ul></article>
          <div className="boundary-line"><span>ONE<br />CLASSROOM</span><i /></div>
          <article className="role-card educator-role"><div className="role-icon"><Icon name="book" /></div><span className="role-tag">EDUCATOR OWNS</span><h3>Teaching, behaviour &amp; safety</h3><ul><li>Lead the class and learning environment</li><li>Handle discipline and behaviour</li><li>Answer curriculum or content questions</li><li>Use progress data for teaching decisions</li><li>Apply school safeguarding procedures</li></ul></article>
        </div>
        <div className="non-negotiable"><Icon name="shield" /><p><strong>The bright line:</strong> the Enabler facilitates platform use and technical access. They do not teach assessed content, supply answers, lead discipline or replace the educator.</p></div>
      </section>

      <section className="content-section lifecycle-section" id="operating-model">
        <div className="section-heading compact">
          <span className="kicker">END-TO-END OPERATING MODEL</span>
          <h2>Six connected stages. One accountable loop.</h2>
        </div>
        <div className="lifecycle-flow">
          {lifecycle.map((stage, index) => <article key={stage.n}>
            <div className="stage-top"><span>{stage.n}</span>{index < lifecycle.length - 1 && <Icon name="chevron" />}</div>
            <div className="stage-icon"><Icon name={(["people", "tools", "learner", "flow", "report", "spark"] as IconName[])[index]} /></div>
            <h3>{stage.title}</h3><p>{stage.copy}</p><small>{stage.owner}</small>
          </article>)}
        </div>
        <div className="success-equation"><span>Ready access</span><b>+</b><span>Correct learner start</span><b>+</b><span>Protected learning time</span><b>+</b><span>Usable evidence</span><b>=</b><strong>Programme impact</strong></div>
      </section>

      <section className="content-section readiness-section">
        <div className="section-heading compact">
          <span className="kicker">BEFORE LEARNERS ARRIVE</span>
          <h2>Readiness is designed, not hoped for.</h2>
          <p>Arrive at least 30 minutes before the first session. Work left-to-right; do not admit the class until the minimum conditions are green.</p>
        </div>
        <div className="readiness-lanes">
          <article><span className="lane-time">DAY BEFORE</span><div className="lane-icon"><Icon name="people" /></div><h3>Align</h3><p>Confirm timetable, class list, educator, venue, accounts, school contact and any rotation plan.</p><small>Output: confirmed session plan</small></article>
          <Icon name="chevron" />
          <article><span className="lane-time">T–30 MIN</span><div className="lane-icon"><Icon name="device" /></div><h3>Build</h3><p>Count and power the kit, connect Wi-Fi, check chargers/headphones, open the login page.</p><small>Output: device readiness count</small></article>
          <Icon name="chevron" />
          <article><span className="lane-time">T–10 MIN</span><div className="lane-icon"><Icon name="signal" /></div><h3>Prove</h3><p>Test one real login, open Numerate, verify the correct journey and prepare attendance and issue logs.</p><small>Output: tested learner path</small></article>
          <Icon name="chevron" />
          <article><span className="lane-time">T–2 MIN</span><div className="lane-icon"><Icon name="flag" /></div><h3>Brief</h3><p>Agree roles with the educator: Enabler handles platform flow; educator handles teaching and discipline.</p><small>Output: go / recover / reschedule</small></article>
        </div>
        <div className="go-gate">
          <div><span>GO GATE</span><strong>Start when the session can produce meaningful learning—not merely logins.</strong></div>
          <ul><li>Educator present</li><li>Safe venue</li><li>Usable devices</li><li>Working access</li><li>Reporting tools ready</li></ul>
        </div>
      </section>

      <section className="kickstart-section" id="kickstart">
        <div className="content-section">
          <div className="section-heading light compact">
            <span className="kicker">THE FIRST 10 MINUTES</span>
            <h2>A five-checkpoint learner kickstart.</h2>
            <p>Use one rhythm throughout: <strong>Stop → Show → Do → Check.</strong> Give one instruction at a time. Demonstrate it. Let learners act. Scan the room before moving on.</p>
          </div>
          <div className="checkpoint-tabs" role="tablist" aria-label="Learner kickstart checkpoints">
            {checkpoints.map((checkpoint, index) => <button key={checkpoint.number} className={index === activeCheckpoint ? "active" : ""} onClick={() => setActiveCheckpoint(index)} role="tab" aria-selected={index === activeCheckpoint}><span>{checkpoint.number}</span><small>{checkpoint.label}</small></button>)}
          </div>
          <div className="checkpoint-stage">
            <div className="checkpoint-copy">
              <span className="checkpoint-number">CHECKPOINT {active.number} / 05</span>
              <h3>{active.title}</h3>
              <div className="script-card"><span>SAY THIS</span><p>“{active.say}”</p></div>
              <div className="verify-card"><span><Icon name="check" size={16} /> VERIFY BEFORE CONTINUING</span><p>{active.verify}</p></div>
              <div className="checkpoint-nav"><button disabled={activeCheckpoint === 0} onClick={() => setActiveCheckpoint(value => value - 1)}>Previous</button><span>{checkpoints.map((_, index) => <i key={index} className={index === activeCheckpoint ? "active" : ""} />)}</span><button disabled={activeCheckpoint === checkpoints.length - 1} onClick={() => setActiveCheckpoint(value => value + 1)}>Next <Icon name="arrow" size={15} /></button></div>
            </div>
            <div className="device-demo">
              <div className="tablet-shell"><div className="tablet-camera" /><ScreenIllustration type={active.visual} /></div>
              <div className="illustration-note"><span>ILLUSTRATIVE VIEW</span><p>Replace with an approved current platform capture during rollout.</p></div>
            </div>
          </div>
          <div className="sync-rule"><span>80%</span><p><strong>Use the majority threshold to pace—not to abandon.</strong> When roughly 80% are at the checkpoint, give the next instruction only after the remaining learners are identified and receiving support. If the gap is widespread, stop and reset the whole class.</p></div>
          <div className="print-checkpoints" aria-hidden="true">
            {checkpoints.map(checkpoint => <article key={checkpoint.number}>
              <span>{checkpoint.number} · {checkpoint.label}</span>
              <h3>{checkpoint.title}</h3>
              <p><strong>Say:</strong> “{checkpoint.say}”</p>
              <p><strong>Verify:</strong> {checkpoint.verify}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="content-section live-section" id="live-session">
        <div className="section-heading compact">
          <span className="kicker">DURING THE SESSION</span>
          <h2>The Enabler control loop.</h2>
          <p>Once learners begin, the Enabler stays in motion. The goal is to remove friction without interfering with the diagnostic or personalised pathway.</p>
        </div>
        <div className="control-loop">
          <div className="loop-core"><strong>Protect</strong><span>active learning<br />minutes</span></div>
          <article className="loop-card observe"><span>01</span><div><Icon name="learner" /><h3>Observe</h3><p>Scan screens, posture and progress.</p></div></article>
          <article className="loop-card triage"><span>02</span><div><Icon name="tools" /><h3>Triage</h3><p>Is it technical, learning or behaviour?</p></div></article>
          <article className="loop-card act"><span>03</span><div><Icon name="flow" /><h3>Act</h3><p>Fix, redirect or involve the owner.</p></div></article>
          <article className="loop-card confirm"><span>04</span><div><Icon name="check" /><h3>Confirm</h3><p>Verify the learner is moving again.</p></div></article>
          <article className="loop-card record"><span>05</span><div><Icon name="report" /><h3>Record</h3><p>Capture impact if it matters later.</p></div></article>
          <svg viewBox="0 0 820 510" aria-hidden="true"><path d="M242 118C320 55 500 55 578 118M667 190c43 77 21 170-49 224M540 460c-84 42-216 35-290-21M159 372c-54-72-48-173 5-235" /><path d="m567 104 18 19-25 6M633 403l-23 16-8-27M264 451l-25-15 19-20M152 150l16-24 17 23" /></svg>
        </div>
        <div className="support-boundary-grid">
          <article className="support-yes"><span><Icon name="check" /> ENABLER MAY</span><ul><li>Repeat navigation instructions</li><li>Fix login, device or connectivity issues</li><li>Explain how to use a platform control</li><li>Encourage persistence and use of Help</li><li>Redirect a learner to the assigned journey</li></ul></article>
          <article className="support-no"><span>× ENABLER MAY NOT</span><ul><li>Explain an assessed maths answer</li><li>Hint, calculate or eliminate options</li><li>Let learners share answers or accounts</li><li>Skip diagnostics to make progress look better</li><li>Handle discipline in place of the educator</li></ul></article>
        </div>
      </section>

      <section className="decision-section">
        <div className="content-section decision-grid">
          <div className="section-heading light">
            <span className="kicker">15-SECOND TRIAGE</span><h2>Name the problem before solving it.</h2><p>Fast classification prevents the Enabler from becoming a teacher, disciplinarian or unsupported technician.</p>
          </div>
          <div className="decision-tree">
            <div className="decision-start"><span>LEARNER IS STUCK</span><strong>What is blocking progress?</strong></div>
            <div className="tree-branches">
              <article><div className="tree-icon"><Icon name="tools" /></div><h3>Technical</h3><p>Device, login, Wi-Fi or platform.</p><strong>Enabler resolves in scope</strong><small>Then confirm + record</small></article>
              <article><div className="tree-icon"><Icon name="book" /></div><h3>Learning</h3><p>Question, concept or assessed answer.</p><strong>Platform Help / educator</strong><small>No answer coaching</small></article>
              <article><div className="tree-icon"><Icon name="people" /></div><h3>Behaviour</h3><p>Refusal, disruption or conflict.</p><strong>Educator leads</strong><small>Enabler supports reset</small></article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-section closeout-section" id="closeout">
        <div className="section-heading compact">
          <span className="kicker">LAST 10 MINUTES</span>
          <h2>Close the learning loop—and the evidence loop.</h2>
        </div>
        <div className="closeout-flow">
          {[
            ["T–10", "Warn", "Give a time signal; avoid stopping mid-response where possible."],
            ["T–5", "Save", "Confirm progress sync; guide logout without exposing credentials."],
            ["T–3", "Recover", "Collect and count tablets, cards, chargers and headphones."],
            ["T+5", "Record", "Submit attendance, active access, uptime, issues and outcomes."],
            ["T+10", "Escalate", "Send unresolved blockers to the right owner with evidence."],
          ].map(([time, title, copy], index) => <article key={time}><span>{time}</span><div><i>{index + 1}</i><h3>{title}</h3><p>{copy}</p></div></article>)}
        </div>
        <div className="reporting-grid">
          <article><div className="report-icon"><Icon name="people" /></div><span>ATTENDANCE</span><strong>Who was booked, present and able to log in?</strong></article>
          <article><div className="report-icon"><Icon name="clock" /></div><span>ACCESS</span><strong>How many meaningful active minutes were delivered?</strong></article>
          <article><div className="report-icon"><Icon name="signal" /></div><span>UPTIME</span><strong>How many devices were usable for planned session minutes?</strong></article>
          <article><div className="report-icon"><Icon name="flag" /></div><span>IMPACT</span><strong>What blocked delivery—and what changed for a learner?</strong></article>
        </div>
        <div className="evidence-standard"><div><span>GOOD ISSUE RECORD</span><p>“09:18–09:31 · 8/24 tablets showed ‘server unavailable’ despite Wi-Fi access. Refreshed once and tested another site. Screenshot attached. ICT Manager notified 09:24. 104 learner-minutes lost.”</p></div><div><span>AVOID</span><p>“Internet bad. Session struggled.”</p></div></div>
      </section>

      <section className="content-section escalation-section">
        <div className="section-heading compact">
          <span className="kicker">TROUBLESHOOTING &amp; ESCALATION</span>
          <h2>Resolve once. Escalate with context.</h2>
          <p>Never spend the session repeatedly trying the same fix. Protect learning time, collect evidence and route the blocker to the accountable owner.</p>
        </div>
        <div className="issue-table-wrap">
          <table className="issue-table">
            <thead><tr><th>Signal</th><th>First response</th><th>Escalate when</th><th>Owner</th><th>Send</th></tr></thead>
            <tbody>{issueRows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="severity-row">
          <span><i className="sev-1" /><strong>S1 Critical</strong> Safety, safeguarding, theft or total programme outage · immediate</span>
          <span><i className="sev-2" /><strong>S2 Major</strong> More than 20% blocked or session at risk · within session</span>
          <span><i className="sev-3" /><strong>S3 Routine</strong> Isolated issue with workaround · daily log</span>
        </div>
      </section>

      <section className="tools-section" id="tools">
        <div className="content-section">
          <div className="section-heading compact">
            <span className="kicker">FIELD TOOLS</span>
            <h2>Three checklists. One reliable habit.</h2>
            <p>Use these live on a phone or print this page. Completion state stays on this device only.</p>
          </div>
          <div className="checklist-grid">
            <Checklist title="Ready the room" items={prepChecklist} accent="teal" />
            <Checklist title="Launch & enable" items={deliveryChecklist} accent="orange" />
            <Checklist title="Close & evidence" items={closeChecklist} accent="blue" />
          </div>
        </div>
      </section>

      <section className="content-section video-section">
        <div className="section-heading compact">
          <span className="kicker">COMPANION TRAINING ASSET</span>
          <h2>Five-minute Enabler kickstart video.</h2>
          <p>A short demonstration should accompany this SOP. Film a real room setup and use approved, current platform captures for every learner-facing click.</p>
        </div>
        <div className="video-layout">
          <div className="video-cover"><div className="video-frame"><span><Icon name="video" size={34} /></span><strong>HOW TO START<br />A REFLECTIVE SESSION</strong><small>Enabler micro-learning · 05:00</small></div><div className="caption-strip"><i>CC</i><span>Voiceover + captions + multilingual subtitles</span></div></div>
          <div className="storyboard">
            {storyboard.map(([time, scene, message, visual], index) => <article key={time}><span>{time}</span><i>{String(index + 1).padStart(2, "0")}</i><div><h3>{scene}</h3><p>{message}</p><small>ON SCREEN · {visual}</small></div></article>)}
          </div>
        </div>
        <div className="production-notes"><strong>Production acceptance checklist</strong><span>Approved UI captures</span><span>English captions</span><span>Afrikaans / isiXhosa subtitle option</span><span>Mobile-legible text</span><span>No learner personal data</span><span>Version/date slate</span></div>
      </section>

      <section className="content-section governance-section">
        <div className="section-heading compact">
          <span className="kicker">GOVERNANCE</span>
          <h2>Measure implementation without rewarding shortcuts.</h2>
        </div>
        <div className="kpi-grid">
          <article><span>01</span><strong>Device uptime</strong><b>≥ 80%</b><p>Usable device-minutes ÷ planned device-minutes.</p></article>
          <article><span>02</span><strong>Login success</strong><b>≥ 80%</b><p>Booked learners who successfully access the assigned path.</p></article>
          <article><span>03</span><strong>Session success</strong><b>≥ 90%</b><p>Scheduled sessions delivering at least 45 meaningful minutes.</p></article>
          <article><span>04</span><strong>Reporting</strong><b>100%</b><p>Session record submitted accurately and on time.</p></article>
        </div>
        <div className="kpi-note"><Icon name="flag" /><p><strong>Approval note:</strong> the supplied draft mixes the labels for login success and computer uptime. The definitions above separate them for operational clarity. The programme owner should confirm final thresholds and reporting fields before issuing this SOP.</p></div>
        <div className="weekly-rhythm">
          <div><span>DAILY</span><p>Readiness → session → close-out → issue escalation</p></div>
          <Icon name="arrow" />
          <div><span>WEEKLY</span><p>Dashboard review → stuck/flying learners → blocker actions → reflection</p></div>
          <Icon name="arrow" />
          <div><span>MONTHLY</span><p>KPI trend → equipment health → school adoption → improvement plan</p></div>
        </div>
      </section>

      <section className="content-section source-section">
        <div className="source-card">
          <div><span className="kicker">DOCUMENT CONTROL</span><h2>Built for controlled rollout.</h2><p>This playbook consolidates the supplied Enabler SOP, Training &amp; Development framework, vacancy role definition and Reflective’s public Numerate guidance. Platform screens are illustrative until replaced with approved captures.</p></div>
          <dl><div><dt>Owner</dt><dd>ICT &amp; Facilitation Manager</dd></div><div><dt>Review cycle</dt><dd>Quarterly and after material platform change</dd></div><div><dt>Applies to</dt><dd>Reflective-funded school programmes</dd></div><div><dt>Next approval</dt><dd>Programme owner + safeguarding lead + data owner</dd></div></dl>
        </div>
        <div className="source-links">
          <span>REFERENCE SET</span>
          <p>Enabler Training &amp; Development · ICT and Digital Platform Enabler SOP · DPE Enabler Vacancy · <a href="https://reflective.global/sa/" target="_blank" rel="noreferrer">Reflective SA</a> · <a href="https://reflective.global/sa/numerate-for-schools/" target="_blank" rel="noreferrer">Numerate for Schools</a> · <a href="https://reflective.global/sa/what-to-expect-from-reflective-learning-a-journey-from-diagnostics-to-mastery/" target="_blank" rel="noreferrer">Diagnostics to Mastery</a></p>
        </div>
      </section>
    </main>
    <footer className="sop-footer"><div className="reflective-brand"><span className="reflective-mark">r</span><span><strong>reflective</strong><small>PERSONALISED LEARNING, REIMAGINED</small></span></div><p>ICT &amp; Digital Platform Enabler · End-to-End SOP</p><span>REF–ENB–001 · v1.0</span></footer>
  </div>;
}
