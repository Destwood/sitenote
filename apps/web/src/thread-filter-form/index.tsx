import type { WorkspaceMember } from "../workspace-members";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { workspacePath } from "../workspace-paths";
import type { ThreadFilters, ThreadStatusFilter } from "../thread-filters";

export interface FilterSite {
  id: string;
  origin: string;
}

const STATUS_OPTIONS: readonly { value: ThreadStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-medium text-neutral-700";

interface ThreadFilterFormProps {
  workspaceId: string;
  filters: ThreadFilters;
  sites: readonly FilterSite[];
  members: readonly WorkspaceMember[];
}

export function ThreadFilterForm({ workspaceId, filters, sites, members }: ThreadFilterFormProps) {
  return (
    <form
      method="get"
      action={workspacePath(workspaceId, "threads")}
      aria-label="Filter threads"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <label className={LABEL_CLASS}>
        Site
        <select name="site" defaultValue={filters.site ?? ""} className={INPUT_CLASS}>
          <option value="">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.origin}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Page path contains
        <input
          type="text"
          name="page"
          defaultValue={filters.page}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Status
        <select name="status" defaultValue={filters.status} className={INPUT_CLASS}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Author
        <select name="author" defaultValue={filters.author ?? ""} className={INPUT_CLASS}>
          <option value="">All authors</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Search comments
        <input
          type="text"
          name="q"
          defaultValue={filters.query}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </label>
      <div className="flex items-end">
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          Apply filters
        </button>
      </div>
    </form>
  );
}
