const FEATURES = [
  {
    title: "Pins on elements and text",
    body: "Click any element or select a sentence to drop a pin. It stays attached while the page changes, scrolls and resizes.",
  },
  {
    title: "Threads with mentions and status",
    body: "Reply in threads, @mention teammates and mark each thread Open or Resolved. Everyone on the page sees updates live.",
  },
  {
    title: "Guests without sign-up",
    body: "Send an invite link. Clients type a name and join with no account and no password.",
  },
  {
    title: "Automatic context",
    body: "Each new thread keeps a screenshot of the element, the viewport, the browser and recent console errors.",
  },
  {
    title: "Deep links",
    body: "Every comment has a link that opens the page and scrolls straight to its pin.",
  },
  {
    title: "ClickUp tasks and email",
    body: "Turn a thread into a ClickUp task with a link back to the pin. Replies and mentions also reach people by email.",
  },
] as const;

export function LandingFeatures() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16"
    >
      <h2 id="features-heading" className="text-3xl font-bold tracking-tight">
        Features
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-6"
          >
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-neutral-600">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
