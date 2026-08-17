import type { Metadata } from "next";
import AmygdalaApp from "./AmygdalaApp";

export const metadata: Metadata = {
  title: "Amygdala | Customer capability, verified",
  description: "Turn approved SaaS product knowledge into immersive, AI-guided customer onboarding and verified readiness.",
};

export default function Home() {
  return <AmygdalaApp initialPath="/" />;
}
