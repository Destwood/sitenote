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
      className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 py-16"
    >
      <h2 id="faq-heading" className="text-3xl font-bold tracking-tight">
        Questions and privacy
      </h2>
      <div className="mt-10 flex flex-col gap-3">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="rounded-lg border border-neutral-200 p-5">
            <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
              {item.question}
            </summary>
            <p className="mt-3 text-sm text-neutral-600">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
