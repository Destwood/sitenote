import type { Metadata } from "next";

import { githubUrlFrom } from "../landing-config";
import { LandingFaq } from "../landing-faq";
import { LandingFeatures } from "../landing-features";
import { LandingFooter } from "../landing-footer";
import { LandingHeader } from "../landing-header";
import { LandingHero } from "../landing-hero";
import { LandingInstall } from "../landing-install";
import { LandingSteps } from "../landing-steps";

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
    <>
      <LandingHeader githubUrl={githubUrlFrom(process.env.NEXT_PUBLIC_GITHUB_URL)} />
      <main id="main">
        <LandingHero />
        <LandingFeatures />
        <LandingSteps />
        <LandingInstall />
        <LandingFaq />
      </main>
      <LandingFooter />
    </>
  );
}
