import { EXTENSION_DOWNLOAD_URL } from "../extension-download";
import { PUBLIC_PRIMARY_BUTTON_CLASS } from "../public-styles";

interface InstallInstructionsProps {
  lead: string;
}

export function InstallInstructions({ lead }: InstallInstructionsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm leading-6 text-neutral-700">
      <h2 className="font-semibold text-neutral-900">Install the Sitenote extension</h2>
      <p>{lead}</p>
      <a href={EXTENSION_DOWNLOAD_URL} download className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-fit`}>
        Download extension (.zip)
      </a>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>Download the zip and unzip it.</li>
        <li>Open chrome://extensions and turn on Developer mode.</li>
        <li>Choose Load unpacked and select the unzipped folder.</li>
      </ol>
      <p>The Chrome Web Store listing will be available here once Sitenote is published.</p>
    </div>
  );
}
