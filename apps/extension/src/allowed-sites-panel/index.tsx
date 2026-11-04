import { useEffect, useState } from "react";

import { ERROR_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { sendMessage } from "../message-client";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { listOriginAccess } from "../tab-access";

interface AllowedSitesPanelProps {
  onChanged: () => void;
}

function domainOf(origin: string): string {
  return URL.parse(origin)?.host ?? origin;
}

export function AllowedSitesPanel({ onChanged }: AllowedSitesPanelProps) {
  const [origins, setOrigins] = useState<string[] | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let active = true;
    void listOriginAccess().then((list) => {
      if (active) {
        setOrigins(list);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function remove(origin: string) {
    setError(null);
    const result = await sendMessage({ type: "sites.disable", origin });
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    setOrigins(await listOriginAccess());
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      {origins === null ? (
        <p role="status" className="text-sm text-neutral-500">
          Loading...
        </p>
      ) : origins.length === 0 ? (
        <p className="text-sm text-neutral-500">No allowed sites yet.</p>
      ) : (
        <ul
          aria-label="Allowed sites"
          className="flex flex-col rounded-lg border border-neutral-200"
        >
          {origins.map((origin) => {
            const domain = domainOf(origin);
            return (
              <li
                key={origin}
                className="flex items-center gap-2.5 border-b border-neutral-200 px-2.5 py-2.5 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-xs font-bold text-neutral-900 uppercase"
                >
                  {domain.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-neutral-900">{domain}</span>
                  <span className="truncate text-xs text-neutral-500">{origin}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${domain}`}
                  onClick={() => void remove(origin)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
