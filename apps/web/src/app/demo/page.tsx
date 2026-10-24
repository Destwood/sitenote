import type { Metadata } from "next";

import { DemoExperience } from "../../demo-experience";
import { DemoSample } from "../../demo-sample";

export const metadata: Metadata = {
  title: "Live demo | Sitenote",
  description:
    "Try Sitenote on a sample page: pin a comment to an element and see it appear for everyone. No account needed.",
};

export default function DemoPage() {
  return (
    <DemoExperience>
      <DemoSample />
    </DemoExperience>
  );
}
