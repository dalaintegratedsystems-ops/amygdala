import Image from "next/image";

export default function Loading() {
  return <main className="loading-page" role="status" aria-live="polite"><div className="brand-mark"><Image src="/amygdala-logo-96.png" alt="Amygdala" width={48} height={48} /></div><span>Preparing your learning universe…</span></main>;
}
