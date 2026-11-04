interface InstallInstructionsProps {
  lead: string;
}

export function InstallInstructions({ lead }: InstallInstructionsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm leading-6 text-neutral-700">
      <h2 className="font-semibold text-neutral-900">Install the Sitenote extension</h2>
      <p>{lead}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>
          While Sitenote is in development, open the extensions page of your browser and turn on
          developer mode.
        </li>
        <li>Choose Load unpacked and select the built extension folder.</li>
        <li>The Chrome Web Store listing will be available here once Sitenote is published.</li>
      </ol>
    </div>
  );
}
