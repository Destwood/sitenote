import type { PersonView } from "../types";

const AVATAR_COLORS = [
  "bg-blue-700",
  "bg-emerald-700",
  "bg-purple-700",
  "bg-rose-700",
  "bg-amber-800",
  "bg-teal-700",
];

export function safeAvatarUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? "?" : first.toUpperCase();
}

function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? "bg-neutral-700";
}

interface AvatarProps {
  person: PersonView;
}

export function Avatar({ person }: AvatarProps) {
  const url = safeAvatarUrl(person.avatarUrl);
  if (url !== null) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="size-6 shrink-0 rounded-full bg-neutral-200 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${colorOf(person.id)}`}
    >
      {initialOf(person.displayName)}
    </span>
  );
}
