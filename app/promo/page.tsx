import type { Metadata } from "next";
import PromoIntro from "../PromoIntro";

export const metadata: Metadata = {
  title: "Amygdala — intro",
  description: "Turn product knowledge into customer capability.",
};

export default function PromoPage() {
  return <PromoIntro />;
}
