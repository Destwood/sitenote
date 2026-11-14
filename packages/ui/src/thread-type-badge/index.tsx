export interface ThreadTypeBadgeProps {
  video: boolean;
}

export function ThreadTypeBadge({ video }: ThreadTypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${video ? "text-blue-800" : "text-neutral-600"}`}
    >
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {video ? (
          <>
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="m22 8-6 4 6 4V8Z" />
          </>
        ) : (
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
        )}
      </svg>
      {video ? "Video" : "Text"}
    </span>
  );
}
