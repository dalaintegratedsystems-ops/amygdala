import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./sop.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(forwardedHost) ? forwardedHost : "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") === "http" || host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const image = `${origin}/og-v2.png`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Reflective Enabler Playbook", template: "%s | Reflective" },
    description: "End-to-end implementation guidance for Reflective ICT and Digital Platform Enablers.",
    applicationName: "Reflective Enabler Playbook",
    icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
    openGraph: { title: "From kit to learning momentum.", description: "The end-to-end operating playbook for Reflective ICT and Digital Platform Enablers.", type: "website", images: [{ url: image, width: 1536, height: 1024, alt: "Reflective Enabler Playbook" }] },
    twitter: { card: "summary_large_image", title: "Reflective Enabler Playbook", description: "From kit to learning momentum.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-ZA" suppressHydrationWarning><body>{children}</body></html>;
}
