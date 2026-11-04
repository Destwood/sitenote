interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="#171717" />
      <path d="M24 104V64a40 40 0 1 1 40 40z" fill="#fff" />
      <circle cx="64" cy="64" r="11" fill="#2563eb" />
    </svg>
  );
}
