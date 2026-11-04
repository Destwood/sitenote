import { ConfirmActionForm } from "../confirm-action-form";
import { DASH_CARD_CLASS, DASH_EMPTY_CLASS } from "../dashboard-classes";
import { removeSite } from "../site-actions";

export interface SiteListItem {
  id: string;
  origin: string;
  threadCount: number;
}

export const NO_SITES_TEXT =
  "No sites yet. A site appears here after someone leaves a comment on it.";

export function removeSiteMessage(origin: string): string {
  return `Remove ${origin}? Its threads and comments are deleted for good.`;
}

export function siteLetter(origin: string): string {
  const host = origin.replace(/^[a-z]+:\/\//i, "");
  return host.charAt(0).toUpperCase() || "?";
}

interface SiteListProps {
  workspaceId: string;
  sites: readonly SiteListItem[];
  canManage: boolean;
}

export function SiteList({ workspaceId, sites, canManage }: SiteListProps) {
  if (sites.length === 0) {
    return <p className={DASH_EMPTY_CLASS}>{NO_SITES_TEXT}</p>;
  }

  return (
    <ul className={`${DASH_CARD_CLASS} divide-y divide-neutral-200`}>
      {sites.map((site) => (
        <li
          key={site.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-700"
            >
              {siteLetter(site.origin)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium break-all text-neutral-900">{site.origin}</span>
              <span className="text-xs text-neutral-500">
                {site.threadCount === 1 ? "1 thread" : `${String(site.threadCount)} threads`}
              </span>
            </div>
          </div>
          {canManage ? (
            <ConfirmActionForm
              action={removeSite}
              fields={{ workspaceId, siteId: site.id }}
              confirmMessage={removeSiteMessage(site.origin)}
              label="Remove site"
              pendingLabel="Removing..."
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
