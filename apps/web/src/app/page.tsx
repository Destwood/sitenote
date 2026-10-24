import type { Metadata } from "next";

import { LandingHero } from "../landing-hero";

const TITLE = "Sitenote | Figma-style comments on any live website";
const DESCRIPTION =
  "Pin feedback to an element or a text selection on any live site, discuss it in a thread with your team and turn it into a ClickUp task.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function HomePage() {
  return (
    <main id="main">
      <LandingHero />
    </main>
  );
}
