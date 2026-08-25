"use client";

import Link from "next/link";
import Image from "next/image";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return <main className="error-page"><div className="brand-mark"><Image src="/amygdala-logo-96.png" alt="Amygdala" width={48} height={48} unoptimized /></div><span className="eyebrow">Amygdala is still available</span><h1>This view could not be loaded.</h1><p>Your demo data has not been sent anywhere. Retry the current view or return to the interactive demo.</p><div><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-secondary" href="/demo">Return to demo</Link></div></main>;
}
