import Link from "next/link";

const FEATURES = [
  "Pin comments to a DOM element or to a text selection",
  "Team workspaces and guest access for clients via invite link, no sign-up",
  "Create a ClickUp task from a comment with a link back to the pin",
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6">
      <nav aria-label="Primary" className="flex items-center justify-between gap-4 py-6">
        <span className="text-lg font-bold tracking-tight">Sitenote</span>
        <Link
          href="/sign-in"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          Sign in
        </Link>
      </nav>
      <main className="flex flex-1 flex-col justify-center gap-10 pb-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-5xl font-bold tracking-tight">Sitenote</h1>
          <p className="text-xl text-neutral-600">Figma-style comments on any live website.</p>
        </header>
        <section aria-labelledby="features-heading" className="flex flex-col gap-4">
          <h2
            id="features-heading"
            className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Features
          </h2>
          <ul className="flex flex-col gap-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3 text-neutral-800">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-900"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="w-fit rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-500">
          Demo coming soon
        </p>
      </main>
    </div>
  );
}
