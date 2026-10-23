import { ConfirmActionForm } from "../confirm-action-form";
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

interface SiteListProps {
  workspaceId: string;
  sites: readonly SiteListItem[];
  canManage: boolean;
}

export function SiteList({ workspaceId, sites, canManage }: SiteListProps) {
  if (sites.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-neutral-600">
        {NO_SITES_TEXT}
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {sites.map((site) => (
        <li
          key={site.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium break-all">{site.origin}</span>
            <span className="text-sm text-neutral-600">
              {site.threadCount === 1 ? "1 thread" : `${String(site.threadCount)} threads`}
            </span>
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
