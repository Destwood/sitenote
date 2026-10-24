import Link from "next/link";

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { HERO_MEDIA } from "../landing-config";
import { LandingHeroMedia } from "../landing-hero-media";

export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2"
    >
      <div className="flex flex-col gap-6">
        <h1
          id="hero-heading"
          className="text-4xl font-bold tracking-tight text-balance sm:text-5xl"
        >
          Figma-style comments on any live website.
        </h1>
        <p className="text-lg text-neutral-600">
          Click an element or select a sentence, drop a pin and discuss it in a thread with your
          team. Every comment keeps a screenshot, the browser context and a link back to the exact
          spot on the page.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className={PRIMARY_BUTTON_CLASS}>
            Try the live demo
          </Link>
          <Link href="#install" className={SECONDARY_BUTTON_CLASS}>
            Install the extension
          </Link>
        </div>
      </div>
      <LandingHeroMedia media={HERO_MEDIA} />
    </section>
  );
}
