const STEPS = [
  {
    title: "Open the page",
    body: "Open the site you want to review and turn Sitenote on for it in the extension popup. Chrome asks for access to that site only.",
  },
  {
    title: "Comment on what you see",
    body: "Turn on comment mode, click an element or select text, and write the comment. The pin appears for everyone on the page.",
  },
  {
    title: "Share and resolve",
    body: "Invite teammates or guests with a link. Discuss the thread, then mark it resolved once the fix is in.",
  },
] as const;

export function LandingSteps() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16"
    >
      <h2 id="how-it-works-heading" className="text-3xl font-bold tracking-tight">
        How it works
      </h2>
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-6">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white"
            >
              {index + 1}
            </span>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-sm text-neutral-600">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
