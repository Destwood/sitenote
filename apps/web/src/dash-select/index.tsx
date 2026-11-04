import type { SelectHTMLAttributes } from "react";

import { DASH_INPUT_CLASS } from "../dashboard-classes";
import { DashIcon } from "../dashboard-icons";

interface DashSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export function DashSelect({
  wrapperClassName = "w-full",
  className = "",
  children,
  ...props
}: DashSelectProps) {
  return (
    <span className={`relative inline-flex min-w-0 ${wrapperClassName}`}>
      <select {...props} className={`${DASH_INPUT_CLASS} appearance-none pr-9 ${className}`}>
        {children}
      </select>
      <DashIcon
        name="chevron"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-500"
      />
    </span>
  );
}
