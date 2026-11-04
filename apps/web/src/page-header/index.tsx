import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  leading?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, leading, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {leading}
        <h1 className="text-2xl font-semibold tracking-tight break-words text-neutral-900">
          {title}
        </h1>
        {description === undefined ? null : (
          <p className="text-sm text-neutral-600">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
