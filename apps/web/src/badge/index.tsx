import type { ReactNode } from "react";

export type BadgeTone = "blue" | "gray" | "green" | "red" | "amber";

const TONE_CLASSES: Readonly<Record<BadgeTone, string>> = {
  blue: "bg-blue-100 text-blue-900",
  gray: "bg-neutral-100 text-neutral-600",
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "gray", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
