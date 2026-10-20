const FEATURES = [
  "Pin comments to a DOM element or to a text selection",
  "Team workspaces and guest access for clients via invite link, no sign-up",
  "Create a ClickUp task from a comment with a link back to the pin",
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-10 px-6 py-16">
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
  );
}
