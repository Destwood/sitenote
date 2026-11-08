"use client";

import {
  EXTENSION_DOWNLOAD_URL,
  fetchLatestExtensionVersion,
  isNewerVersion,
} from "@sitenote/core";
import { useEffect, useState } from "react";

import { readExtensionVersion } from "../extension-bridge";
import { PUBLIC_PRIMARY_BUTTON_CLASS } from "../public-styles";

interface ExtensionUpdateBannerProps {
  extensionId: string;
}

export function ExtensionUpdateBanner({ extensionId }: ExtensionUpdateBannerProps) {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (extensionId === "") {
      return;
    }
    let active = true;
    void Promise.all([readExtensionVersion(extensionId), fetchLatestExtensionVersion()]).then(
      ([installed, next]) => {
        if (active) {
          const newer = installed !== null && next !== null && isNewerVersion(installed, next);
          setLatest(newer ? next : null);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [extensionId]);

  if (latest === null) {
    return null;
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-neutral-700"
    >
      <p className="font-semibold text-neutral-900">
        A new Sitenote extension (v{latest}) is available
      </p>
      <a href={EXTENSION_DOWNLOAD_URL} download className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-fit`}>
        Download extension (.zip)
      </a>
      <p>Unzip over the old folder, then press reload on chrome://extensions.</p>
    </div>
  );
}
