"use client";

import { useEffect, useState } from "react";
import type { Stadium, VenueOutlet } from "@/lib/engine/types";
import { foodBasketFor, foodRatePerMin, foodTierFor } from "@/lib/engine/money";

const TIER_LABEL: Record<string, string> = {
  value: "Value pricing",
  standard: "Standard pricing",
  premium: "Premium pricing",
};

type Outlets = { source: "overpass" | "fallback"; outlets: VenueOutlet[] };

// Module-level cache so a venue's outlets are fetched once and reused across
// remounts (e.g. switching away from and back to the Budget tab). In-flight
// requests are deduped so two mounts never hit the API twice for one venue.
const outletCache = new Map<string, Outlets>();
const inflight = new Map<string, Promise<Outlets | null>>();

function fetchOutlets(stadiumId: string): Promise<Outlets | null> {
  const existing = inflight.get(stadiumId);
  if (existing) return existing;
  const req = fetch(`/api/venue-food?stadiumId=${stadiumId}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d): Outlets | null =>
      d && Array.isArray(d.outlets) ? { source: d.source, outlets: d.outlets } : null
    )
    .catch(() => null)
    .then((res) => {
      inflight.delete(stadiumId);
      if (res) outletCache.set(stadiumId, res);
      return res;
    });
  inflight.set(stadiumId, req);
  return req;
}

/**
 * "What's at the venue" — real named outlets pulled live from OpenStreetMap
 * (keyless, via /api/venue-food), plus the venue's typical concession basket. The
 * prices come from the engine's per-venue basket (the same numbers that drive the
 * food-budget line), so the list and the budget agree. Outlets are cached at the
 * module level so tab switches don't re-query.
 */
export default function VenueFood({ stadium }: { stadium: Stadium }) {
  // Re-render tick — the outlets themselves are derived from the module cache
  // below (never mirrored into state), so a cache hit needs no setState-in-effect.
  const [, bump] = useState(0);

  useEffect(() => {
    const stadiumId = stadium.id;
    if (outletCache.has(stadiumId)) return; // cached — render reads it directly
    let cancelled = false;
    fetchOutlets(stadiumId).then((res) => {
      if (!cancelled && res) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [stadium.id]);

  const cached = outletCache.get(stadium.id);
  const ready = !!cached;
  const basket = foodBasketFor(stadium);
  const rate = foodRatePerMin(stadium);
  const tier = foodTierFor(stadium);
  const prices = basket.map((i) => i.usd);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">What&apos;s at the venue</h3>
        <span
          className={`chip px-2.5 py-1 text-[11px] ${
            ready
              ? cached!.source === "overpass"
                ? "text-accent"
                : "text-faint"
              : "text-faint"
          }`}
          title={
            ready && cached!.source === "overpass"
              ? "Live outlets from OpenStreetMap"
              : "Typical outlets (live data unavailable)"
          }
        >
          {!ready
            ? "Loading…"
            : cached!.source === "overpass"
              ? "● Live · OpenStreetMap"
              : "Typical outlets"}
        </span>
      </div>

      {/* Outlets present at / around the venue */}
      <div className="min-h-[2rem]">
        {ready && cached!.outlets.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {cached!.outlets.map((o, i) => (
              <li
                key={`${o.name}-${i}`}
                className="chip px-2.5 py-1 text-[11px] text-text"
                title={o.category}
              >
                {o.name}{" "}
                <span className="text-faint">· {o.category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">Finding food & shops near the venue…</p>
        )}
      </div>

      {/* Typical concession prices — the same basket that drives your food budget */}
      <div className="mt-5 border-t border-border-soft pt-4">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-text">
            Typical concession prices
          </span>
          <span className="chip px-2 py-0.5 text-[11px] text-food">
            {TIER_LABEL[tier] ?? "Standard pricing"}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          {basket.map((item) => (
            <li key={item.name} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">{item.name}</span>
              <span className="tabular text-[11px] font-medium text-text">
                ${item.usd.toFixed(item.usd % 1 ? 2 : 0)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-faint">
          Items run{" "}
          <b className="text-text">
            ${lo.toFixed(lo % 1 ? 2 : 0)}–${hi.toFixed(hi % 1 ? 2 : 0)}
          </b>{" "}
          here. Your food-budget line uses{" "}
          <b className="text-accent">~${rate.toFixed(2)}/min</b> of stand time, drawn
          from these prices. Prices are transparent estimates, not live menus.
        </p>
      </div>
    </div>
  );
}
