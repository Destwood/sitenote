import Link from "next/link";

import { HERO_MEDIA } from "../landing-config";
import { LandingHeroMedia } from "../landing-hero-media";
import { PUBLIC_PRIMARY_BUTTON_CLASS, PUBLIC_SECONDARY_BUTTON_CLASS } from "../public-styles";

export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-24 text-center"
    >
      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 ring-inset">
        Built for design, engineering, and QA
      </span>
      <h1
        id="hero-heading"
        className="mt-6 max-w-4xl text-5xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl"
      >
        Figma-style comments on any live website.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
        Click an element or select a sentence, drop a pin and discuss it in a thread with your team.
        Every comment keeps a screenshot, the browser context and a link back to the exact spot on
        the page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="#install" className={PUBLIC_PRIMARY_BUTTON_CLASS}>
          Install the extension
        </Link>
        <Link href="/demo" className={PUBLIC_SECONDARY_BUTTON_CLASS}>
          Try the live demo
        </Link>
      </div>
      <div className="mt-16 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-[0_30px_70px_rgba(0,0,0,0.09)]">
        <div className="flex h-9 items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-4">
          <span aria-hidden="true" className="size-2 rounded-full bg-neutral-300" />
          <span aria-hidden="true" className="size-2 rounded-full bg-neutral-300" />
          <span aria-hidden="true" className="size-2 rounded-full bg-neutral-300" />
          <span className="mx-auto truncate rounded-md bg-white px-4 py-0.5 text-xs text-neutral-500">
            Harbor, a sample product
          </span>
        </div>
        <LandingHeroMedia media={HERO_MEDIA} />
      </div>
    </section>
  );
}
