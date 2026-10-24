export const DEMO_TESTIMONIAL =
  "Feedback lands on the exact button it is about, so we stopped losing it in email threads.";

const FEATURES = [
  {
    testId: "demo-feature-pins",
    title: "Pin to elements",
    body: "Attach a comment to a button, a card or a sentence and it stays there as the page changes.",
  },
  {
    testId: "demo-feature-guests",
    title: "Guests without sign-up",
    body: "Clients join with a name and a link. No account, no password to remember.",
  },
  {
    testId: "demo-feature-clickup",
    title: "ClickUp tasks",
    body: "Turn a comment into a task with the page context and screenshot attached.",
  },
] as const;

export function DemoSample() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-16 px-6 py-16">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Harbor, a sample product
        </p>
        <h1 data-testid="demo-hero-title" className="text-5xl font-bold tracking-tight">
          Comments that stay on the page
        </h1>
        <p data-testid="demo-hero-lede" className="text-xl text-neutral-600">
          Pin feedback to the element it concerns and your team sees it in place.
        </p>
      </section>

      <section aria-labelledby="demo-features" className="flex flex-col gap-6">
        <h2 id="demo-features" className="text-2xl font-semibold tracking-tight">
          Features
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.testId}
              data-testid={feature.testId}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5"
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-neutral-600">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="demo-pricing" className="flex flex-col gap-6">
        <h2 id="demo-pricing" className="text-2xl font-semibold tracking-tight">
          Pricing
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <article
            data-testid="demo-pricing-team"
            className="flex flex-col gap-2 rounded-lg border border-neutral-900 p-5"
          >
            <h3 className="font-semibold">Team plan</h3>
            <p className="text-3xl font-bold">$24 per seat</p>
            <p className="text-sm text-neutral-600">Save 20% on annual billing.</p>
          </article>
          <article
            data-testid="demo-pricing-solo"
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5"
          >
            <h3 className="font-semibold">Solo plan</h3>
            <p className="text-3xl font-bold">$0</p>
            <p className="text-sm text-neutral-600">For one reviewer and one site.</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="demo-testimonial" className="flex flex-col gap-4">
        <h2 id="demo-testimonial" className="sr-only">
          Testimonial
        </h2>
        <figure className="flex flex-col gap-3">
          <blockquote>
            <p data-testid="demo-testimonial-quote" className="text-xl text-neutral-800">
              {DEMO_TESTIMONIAL}
            </p>
          </blockquote>
          <figcaption className="text-sm text-neutral-600">Priya, product lead</figcaption>
        </figure>
      </section>
    </main>
  );
}
