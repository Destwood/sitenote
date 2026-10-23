interface InstallInstructionsProps {
  lead: string;
}

export function InstallInstructions({ lead }: InstallInstructionsProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      <h2 className="font-semibold text-neutral-900">Install the Sitenote extension</h2>
      <p>{lead}</p>
      <ol className="list-decimal pl-5">
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
