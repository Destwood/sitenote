export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

interface AvatarProps {
  name: string;
}

export function Avatar({ name }: AvatarProps) {
  return (
    <span
      aria-hidden
      className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700"
    >
      {initialsOf(name)}
    </span>
  );
}
