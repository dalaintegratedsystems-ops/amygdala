"use client";

// Self-contained cinematic intro for Amygdala. A timed sequence of scenes with
// kinetic typography and signature product visuals, designed to be screen
// recorded into a promo video. Pure CSS/JS, no external media.

import { useEffect, useState } from "react";
import Image from "next/image";

const DURATIONS = [4800, 6000, 6800, 6000, 6800, 6200, 6400]; // ms per scene

export default function PromoIntro() {
  const [scene, setScene] = useState(0);
  const [ready, setReady] = useState(0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    let acc = 0;
    for (let s = 1; s < DURATIONS.length; s += 1) {
      acc += DURATIONS[s - 1];
      timers.push(window.setTimeout(() => setScene(s), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, [replay]);

  useEffect(() => {
    if (scene !== 4) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1600);
      setReady(Math.round(91 * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div className="promo">
      <div className="promo-bg" />
      <div className="promo-grid" />
      <div className="promo-glow" />

      <section className={`promo-scene promo-reveal ${scene === 0 ? "active" : ""}`}>
        <div className="promo-logo"><Image src="/amygdala-logo-192.png" alt="Amygdala" width={128} height={128} unoptimized priority /></div>
        <h1 className="promo-wordmark">amygdala</h1>
        <p className="promo-tagline">Turn product knowledge into customer capability.</p>
      </section>

      <section className={`promo-scene promo-center ${scene === 1 ? "active" : ""}`}>
        <span className="promo-eyebrow">The problem</span>
        <h2 className="promo-lines"><span>Great products ship with</span><span>manuals no one reads.</span></h2>
        <p className="promo-sub">Amygdala turns approved docs into immersive, guided capability.</p>
      </section>

      <section className={`promo-scene promo-split ${scene === 2 ? "active" : ""}`}>
        <div className="promo-copy">
          <span className="promo-eyebrow">Grounded AI guide</span>
          <h2 className="promo-lines"><span>Answers that</span><span>never guess.</span></h2>
          <p className="promo-sub">Every response is drawn from approved material and cites its exact source.</p>
        </div>
        <div className="promo-chat">
          <div className="promo-chat-q">How do I create my first project?</div>
          <div className="promo-chat-a">
            <span className="promo-pill">Verified</span>
            <p>1. Open Projects from the primary navigation.<br />2. Select New project.<br />3. Enter the project name and owner.<br />4. Review, then select Create project.</p>
            <div className="promo-cite"><span>▣</span> Create and Configure a Project · v4.2</div>
          </div>
        </div>
      </section>

      <section className={`promo-scene promo-center ${scene === 3 ? "active" : ""}`}>
        <span className="promo-eyebrow">Safe simulation</span>
        <h2 className="promo-lines"><span>Practice the product.</span><span>Zero risk.</span></h2>
        <div className="promo-sim">
          <div className="promo-sim-bar"><i /><i /><i /><b>NexusFlow training workspace</b><em>SIMULATION</em></div>
          <div className="promo-sim-body">
            <div className="promo-hotspot">＋ Create project</div>
            <div className="promo-ghost" /><div className="promo-ghost" /><div className="promo-ghost" />
          </div>
        </div>
      </section>

      <section className={`promo-scene promo-center ${scene === 4 ? "active" : ""}`}>
        <span className="promo-eyebrow">Verified readiness</span>
        <div className="promo-ring" style={{ "--p": `${ready * 3.6}deg` } as React.CSSProperties}><div><strong>{ready}</strong><span>% ready</span></div></div>
        <h2 className="promo-lines"><span>Prove who can use the product,</span><span>not just who finished a course.</span></h2>
      </section>

      <section className={`promo-scene promo-center ${scene === 5 ? "active" : ""}`}>
        <span className="promo-eyebrow">Immersive. Enterprise ready.</span>
        <div className="promo-universe">
          <div className="promo-core"><span>capability</span></div>
          <div className="promo-orbit promo-orbit-1"><i>Learn</i></div>
          <div className="promo-orbit promo-orbit-2"><i>Practise</i></div>
          <div className="promo-orbit promo-orbit-3"><i>Validate</i></div>
        </div>
        <div className="promo-badges"><span>SSO &amp; SCIM</span><span>Tenant isolation</span><span>Grounded AI</span><span>Verifiable credentials</span><span>3D / VR</span></div>
      </section>

      <section className={`promo-scene promo-reveal ${scene === 6 ? "active" : ""}`}>
        <div className="promo-logo small"><Image src="/amygdala-logo-192.png" alt="Amygdala" width={92} height={92} unoptimized /></div>
        <h1 className="promo-wordmark">amygdala</h1>
        <p className="promo-tagline">Capability, verified.</p>
        <p className="promo-url">www.amygdalalishay.com</p>
      </section>

      <button className="promo-replay" onClick={() => { setScene(0); setReplay((value) => value + 1); }} aria-label="Replay intro">Replay ↻</button>
    </div>
  );
}
