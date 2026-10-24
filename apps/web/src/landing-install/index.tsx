export function LandingInstall() {
  return (
    <section
      id="install"
      aria-labelledby="install-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16"
    >
      <h2 id="install-heading" className="text-3xl font-bold tracking-tight">
        Install the extension
      </h2>
      <p className="mt-4 max-w-2xl text-neutral-600">
        Sitenote is a Chrome extension (Manifest V3). Until the Chrome Web Store listing is live,
        load the build from source.
      </p>
      <ol className="mt-8 flex max-w-2xl list-decimal flex-col gap-4 pl-5 text-neutral-800">
        <li>
          Clone the repository and run <code className="font-mono text-sm">pnpm install</code>.
        </li>
        <li>
          Build the extension with{" "}
          <code className="font-mono text-sm">pnpm --filter @sitenote/extension build</code>. The
          README lists the environment it needs.
        </li>
        <li>
          Open <code className="font-mono text-sm">chrome://extensions</code>, turn on Developer
          mode, choose Load unpacked and select{" "}
          <code className="font-mono text-sm">apps/extension/.output/chrome-mv3</code>.
        </li>
      </ol>
      <p className="mt-8 font-medium text-neutral-900">Chrome Web Store listing coming soon.</p>
    </section>
  );
}
