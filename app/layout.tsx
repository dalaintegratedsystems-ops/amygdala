import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(forwardedHost) ? forwardedHost : "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") === "http" || host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const image = `${origin}/og-v2.png`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Amygdala | Customer capability, verified", template: "%s | Amygdala" },
    description: "Immersive, vendor-controlled customer onboarding for SaaS products.",
    applicationName: "Amygdala",
    icons: {
      icon: [
        { url: "/amygdala-logo-32.png", sizes: "32x32", type: "image/png" },
        { url: "/amygdala-logo-48.png", sizes: "48x48", type: "image/png" },
      ],
      shortcut: "/amygdala-logo-32.png",
      apple: [{ url: "/amygdala-logo-192.png", sizes: "192x192", type: "image/png" }],
    },
    openGraph: { title: "Turn product knowledge into customer capability.", description: "Vendor-approved, AI-guided SaaS onboarding with safe simulations and transparent readiness.", type: "website", images: [{ url: image, width: 1536, height: 1024, alt: "Amygdala learning universe" }] },
    twitter: { card: "summary_large_image", title: "Amygdala", description: "Turn product knowledge into customer capability.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
