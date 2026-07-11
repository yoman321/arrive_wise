"use client";

import { useEffect, useState } from "react";

/**
 * A gentle "there's more below" nudge — fades in after a few seconds if the page
 * has content below the fold (the venue map) and you haven't scrolled yet. Click
 * to glide to the bottom; it dismisses itself the moment you scroll.
 */
export default function ScrollHint({ delayMs = 5000 }: { delayMs?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let scrolled = false;
    const hasMoreBelow = () =>
      document.documentElement.scrollHeight > window.innerHeight + 40;

    const onScroll = () => {
      if (window.scrollY > 60) {
        scrolled = true;
        setShow(false);
        window.removeEventListener("scroll", onScroll);
      }
    };

    const t = setTimeout(() => {
      if (!scrolled && hasMoreBelow() && window.scrollY < 60) {
        setShow(true);
        window.addEventListener("scroll", onScroll, { passive: true });
      }
    }, delayMs);

    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, [delayMs]);

  if (!show) return null;

  return (
    <button
      onClick={() =>
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        })
      }
      title="Scroll down for the venue map"
      aria-label="Scroll down for the venue map"
      className="scroll-hint fixed bottom-6 left-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-panel-2/90 px-4 py-2 text-xs font-medium text-muted shadow-lg backdrop-blur transition-colors hover:text-text"
    >
      <span>Venue map</span>
      <span className="scroll-hint-arrow text-base leading-none text-accent">↓</span>
    </button>
  );
}
