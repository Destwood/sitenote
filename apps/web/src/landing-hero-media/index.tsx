"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { HeroMedia } from "../landing-config";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MEDIA_ALT = "A comment pinned to a card on a sample page, with its thread open";

interface LandingHeroMediaProps {
  media: HeroMedia;
}

export function LandingHeroMedia({ media }: LandingHeroMediaProps) {
  const { poster, video } = media;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [playRequested, setPlayRequested] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => {
      setReducedMotion(query.matches);
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
    };
  }, []);

  const playing = video !== null && (playRequested || !reducedMotion);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
      {video !== null && playing ? (
        <video
          src={video}
          poster={poster}
          aria-label={MEDIA_ALT}
          className="size-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          controls
        />
      ) : (
        <>
          <Image
            src={poster}
            alt={MEDIA_ALT}
            width={1280}
            height={720}
            priority
            unoptimized
            className="size-full object-cover"
          />
          {video !== null && (
            <button
              type="button"
              onClick={() => {
                setPlayRequested(true);
              }}
              className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <span className="sr-only">Play the product video</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-1 size-7 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
