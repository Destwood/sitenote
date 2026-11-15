import type { Metadata } from "next";

import { DemoExperience } from "../../demo-experience";
import { DemoSample } from "../../demo-sample";
import { isSignedIn } from "../../is-signed-in";
import { githubUrlFrom } from "../../landing-config";
import { LandingFooter } from "../../landing-footer";
import { LandingHeader } from "../../landing-header";

export const metadata: Metadata = {
  title: "Live demo | Sitenote",
  description:
    "Try Sitenote on a sample page: pin a comment to an element and see it appear for everyone. No account needed.",
};

export default async function DemoPage() {
  const signedIn = await isSignedIn();
  return (
    <>
      <LandingHeader
        githubUrl={githubUrlFrom(process.env.NEXT_PUBLIC_GITHUB_URL)}
        signedIn={signedIn}
        basePath="/"
      />
      <DemoExperience>
        <DemoSample />
      </DemoExperience>
      <LandingFooter signedIn={signedIn} basePath="/" />
    </>
  );
}
