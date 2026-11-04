import type { ReactNode } from "react";

type FeatureIconName = "target" | "comment" | "users" | "camera" | "link" | "integration";

const FEATURE_ICON_PATHS: Record<FeatureIconName, ReactNode> = {
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-3h5Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
    </>
  ),
  integration: (
    <>
      <path d="M8 12h8M12 8v8" />
      <path d="M17 3a4 4 0 0 0-4 4v1h-2V7a4 4 0 1 0-4 4h1v2H7a4 4 0 1 0 4 4v-1h2v1a4 4 0 1 0 4-4h-1v-2h1a4 4 0 0 0 0-8Z" />
    </>
  ),
};

const FEATURES = [
  {
    icon: "target",
    title: "Pins on elements and text",
    body: "Click any element or select a sentence to drop a pin. It stays attached while the page changes, scrolls and resizes.",
  },
  {
    icon: "comment",
    title: "Threads with mentions and status",
    body: "Reply in threads, @mention teammates and mark each thread Open or Resolved. Everyone on the page sees updates live.",
  },
  {
    icon: "users",
    title: "Guests without sign-up",
    body: "Send an invite link. Clients type a name and join with no account and no password.",
  },
  {
    icon: "camera",
    title: "Automatic context",
    body: "Each new thread keeps a screenshot of the element, the viewport, the browser and recent console errors.",
  },
  {
    icon: "link",
    title: "Deep links",
    body: "Every comment has a link that opens the page and scrolls straight to its pin.",
  },
  {
    icon: "integration",
    title: "ClickUp tasks and email",
    body: "Turn a thread into a ClickUp task with a link back to the pin. Replies and mentions also reach people by email.",
  },
] as const;

export function LandingFeatures() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-24"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase">
          Everything in context
        </p>
        <h2 id="features-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Features
        </h2>
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {FEATURE_ICON_PATHS[feature.icon]}
              </svg>
            </span>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm leading-6 text-neutral-600">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
