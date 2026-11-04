export function LandingInstall() {
  return (
    <section
      id="install"
      aria-labelledby="install-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-24"
    >
      <div className="flex flex-col gap-12 rounded-2xl bg-neutral-900 px-8 py-12 text-white sm:px-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-col gap-4">
          <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-neutral-200">
            Chrome extension
          </span>
          <h2 id="install-heading" className="text-3xl font-bold tracking-tight">
            Install the extension
          </h2>
          <p className="leading-7 text-neutral-300">
            Sitenote is a Chrome extension (Manifest V3). Until the Chrome Web Store listing is
            live, load the build from source.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <ol className="flex list-decimal flex-col gap-4 pl-5 leading-7 text-neutral-200 marker:font-semibold marker:text-neutral-400">
            <li>
              Clone the repository and run{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
                pnpm install
              </code>
              .
            </li>
            <li>
              Build the extension with{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
                pnpm --filter @sitenote/extension build
              </code>
              . The README lists the environment it needs.
            </li>
            <li>
              Open{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
                chrome://extensions
              </code>
              , turn on Developer mode, choose Load unpacked and select{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm">
                apps/extension/.output/chrome-mv3
              </code>
              .
            </li>
          </ol>
          <p className="border-t border-white/10 pt-6 font-medium text-white">
            Chrome Web Store listing coming soon.
          </p>
        </div>
      </div>
    </section>
  );
}
