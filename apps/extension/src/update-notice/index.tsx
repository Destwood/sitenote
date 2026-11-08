import {
  EXTENSION_DOWNLOAD_URL,
  fetchLatestExtensionVersion,
  isNewerVersion,
} from "@sitenote/core";
import { useEffect, useState } from "react";

interface ExtensionUpdateNoticeProps {
  version: string;
  fetcher?: typeof fetch;
}

export function ExtensionUpdateNotice({ version, fetcher }: ExtensionUpdateNoticeProps) {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchLatestExtensionVersion(fetcher).then((next) => {
      if (active) {
        setLatest(next);
      }
    });
    return () => {
      active = false;
    };
  }, [fetcher]);

  if (latest === null || !isNewerVersion(version, latest)) {
    return null;
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-neutral-700"
    >
      <p className="flex flex-wrap items-center justify-between gap-2 font-semibold text-neutral-900">
        A new Sitenote version (v{latest}) is available
        <a
          href={EXTENSION_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-white hover:bg-neutral-700"
        >
          Download
        </a>
      </p>
      <p>Unzip over the old folder, then press reload on chrome://extensions.</p>
    </div>
  );
}
