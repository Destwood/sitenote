import { useEffect, useState } from "react";

import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../form-controls";
import { sendMessage } from "../message-client";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { listOriginAccess } from "../tab-access";

interface AllowedSitesPanelProps {
  onChanged: () => void;
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
        <p role="status" className="text-sm text-neutral-600">
          Loading...
        </p>
      ) : origins.length === 0 ? (
        <p className="text-sm text-neutral-600">No allowed sites yet.</p>
      ) : (
        <ul aria-label="Allowed sites" className="flex flex-col gap-2">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-neutral-900">{origin}</span>
              <button
                type="button"
                aria-label={`Remove ${origin}`}
                onClick={() => void remove(origin)}
                className={`${LINK_BUTTON_CLASS} shrink-0`}
              >
                Remove
              </button>
            </li>
          ))}
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
