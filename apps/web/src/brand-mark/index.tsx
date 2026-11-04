import Link from "next/link";

export function BrandMark() {
  return (
    <span aria-hidden className="relative inline-block size-7 shrink-0 rounded-lg bg-neutral-900">
      <span className="absolute top-[22%] left-[25%] h-[48%] w-[48%] rounded-[50%_50%_50%_12%] bg-white" />
      <span className="absolute top-[40%] left-[43%] size-[12%] rounded-full bg-blue-600" />
    </span>
  );
}

export function BrandLink() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-sm">
      <BrandMark />
      <span className="text-sm font-semibold tracking-tight text-neutral-900">Sitenote</span>
    </Link>
  );
}
