const QUESTIONS = [
  {
    question: "Does Sitenote watch the sites I visit?",
    answer:
      "No. The extension works only on sites you enable. Chrome asks for access to each site when you enable it, and disabling a site removes that access. Capturing console errors can be switched off per site.",
  },
  {
    question: "Where is my data stored?",
    answer:
      "In Supabase: Postgres with row-level security, so each workspace reads only its own sites, threads and comments. Screenshots are stored with the thread.",
  },
  {
    question: "Can clients comment without an account?",
    answer:
      "Yes. A guest opens an invite link, types a name and joins. Owners can revoke an invite link at any time.",
  },
  {
    question: "Is the live demo real?",
    answer:
      "It is a sample page with its own workspace. Anyone can comment there, and the demo resets every day.",
  },
] as const;

export function LandingFaq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 pb-24"
    >
      <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Questions and privacy
      </h2>
      <div className="mt-12 divide-y divide-neutral-200 border-y border-neutral-200">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5 shrink-0 text-neutral-500 transition-transform group-open:rotate-45"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <p className="mt-3 pr-10 text-sm leading-6 text-neutral-600">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
