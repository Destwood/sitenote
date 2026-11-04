import type { ReactNode } from "react";

export type DashIconName =
  "chevron" | "check" | "copy" | "globe" | "comment" | "users" | "sites" | "invite" | "integration";

const PATHS: Readonly<Record<DashIconName, ReactNode>> = {
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  sites: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </>
  ),
  invite: (
    <>
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  integration: (
    <path d="M17 3a4 4 0 0 0-4 4v1h-2V7a4 4 0 1 0-4 4h1v2H7a4 4 0 1 0 4 4v-1h2v1a4 4 0 1 0 4-4h-1v-2h1a4 4 0 0 0 0-8Z" />
  ),
};

interface DashIconProps {
  name: DashIconName;
  className?: string;
}

export function DashIcon({ name, className = "size-4" }: DashIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
