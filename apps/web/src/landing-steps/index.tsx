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
      className="scroll-mt-20 bg-neutral-50 py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-6">
        <h2
          id="how-it-works-heading"
          className="text-center text-3xl font-bold tracking-tight sm:text-4xl"
        >
          How it works
        </h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 border-t border-neutral-300 pt-6">
              <span aria-hidden="true" className="font-mono text-4xl font-semibold text-blue-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="text-sm leading-6 text-neutral-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
