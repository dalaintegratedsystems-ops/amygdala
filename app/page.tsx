import type { Metadata } from "next";
import EnablerSOP from "./EnablerSOP";

export const metadata: Metadata = {
  title: "Reflective Enabler Playbook | End-to-End SOP",
  description: "A practical end-to-end operating playbook for ICT and Digital Platform Enablers delivering Reflective-funded programmes.",
};

export default function Home() {
  return <EnablerSOP />;
}
