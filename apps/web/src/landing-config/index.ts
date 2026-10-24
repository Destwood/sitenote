import { safeExternalHref } from "../safe-external-link";

export interface HeroMedia {
  poster: string;
  video: string | null;
}

export const HERO_MEDIA: HeroMedia = {
  poster: "/media/sitenote-demo-poster.png",
  video: null,
};

export function githubUrlFrom(value: string | undefined): string | null {
  return safeExternalHref(value ?? "");
}
