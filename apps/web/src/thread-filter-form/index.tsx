import {
  DASH_BUTTON_PRIMARY_CLASS,
  DASH_CARD_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { DashSelect } from "../dash-select";
import type { WorkspaceMember } from "../workspace-members";
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

const LABEL_TEXT_CLASS = "text-xs font-medium text-neutral-500";

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
      className={`${DASH_CARD_CLASS} grid items-end gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]`}
    >
      <label className={DASH_LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Site</span>
        <DashSelect name="site" defaultValue={filters.site ?? ""}>
          <option value="">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.origin}
            </option>
          ))}
        </DashSelect>
      </label>
      <label className={DASH_LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Page path contains</span>
        <input
          type="text"
          name="page"
          defaultValue={filters.page}
          autoComplete="off"
          className={DASH_INPUT_CLASS}
        />
      </label>
      <label className={DASH_LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Status</span>
        <DashSelect name="status" defaultValue={filters.status}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </DashSelect>
      </label>
      <label className={DASH_LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Author</span>
        <DashSelect name="author" defaultValue={filters.author ?? ""}>
          <option value="">All authors</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </DashSelect>
      </label>
      <label className={DASH_LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Search comments</span>
        <input
          type="text"
          name="q"
          defaultValue={filters.query}
          autoComplete="off"
          className={DASH_INPUT_CLASS}
        />
      </label>
      <button type="submit" className={`${DASH_BUTTON_PRIMARY_CLASS} w-full xl:w-auto`}>
        Apply filters
      </button>
    </form>
  );
}
