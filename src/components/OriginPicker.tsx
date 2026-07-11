"use client";

import { useState } from "react";
import type { StepProps } from "@/components/onboarding/types";
import type { TrafficSource } from "@/lib/engine/types";
import { ORIGIN_PRESETS } from "@/lib/data/origins";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";

const SOURCE_LABEL: Record<TrafficSource, string> = {
  live: "live traffic",
  predicted: "predicted match-time traffic",
  routed: "real route",
  estimate: "estimated distance",
  preset: "rough preset",
};

/**
 * Resolve the trip origin — live location, a geocoded address, or a rough
 * preset distance — into `plan.origin`. Shared verbatim by the onboarding
 * location step and the dashboard so both are just views onto the same param.
 */
export default function OriginPicker({
  plan,
  update,
  compact = false,
}: StepProps & { compact?: boolean }) {
  const o = plan.origin;
  const stadium = STADIUM_BY_ID[plan.match.stadiumId];
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState<"locate" | "geocode" | "route" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const departAt = `${plan.match.date}T${plan.match.kickoff}:00`;

  /** Given resolved origin coords, ask our routing API for a real drive time. */
  async function resolveRoute(lat: number, lng: number, label: string) {
    setBusy("route");
    setError(null);
    try {
      const qs = new URLSearchParams({
        fromLat: String(lat),
        fromLng: String(lng),
        toLat: String(stadium.lat),
        toLng: String(stadium.lng),
        departAt,
      });
      const res = await fetch(`/api/route?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "routing failed");
      update({
        origin: {
          label,
          lat,
          lng,
          freeFlowDriveMin: data.freeFlowDriveMin,
          liveDriveMin: data.liveDriveMin,
          trafficSource: data.trafficSource as TrafficSource,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compute your route.");
    } finally {
      setBusy(null);
    }
  }

  function locateMe() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available here — try an address below.");
      return;
    }
    setBusy("locate");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveRoute(pos.coords.latitude, pos.coords.longitude, "My location"),
      () => {
        setBusy(null);
        setError("Location blocked — type an address or pick a distance below.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  async function submitAddress() {
    const q = addr.trim();
    if (!q) return;
    setBusy("geocode");
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "no match" ? "No place found for that." : "Geocoding failed.");
      await resolveRoute(data.lat, data.lng, data.label);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Geocoding failed.");
    }
  }

  const pickPreset = (label: string, min: number) =>
    update({
      origin: { label, freeFlowDriveMin: min, trafficSource: "preset" },
    });

  const activePreset = ORIGIN_PRESETS.find(
    (p) => p.freeFlowDriveMin === o.freeFlowDriveMin && o.trafficSource === "preset"
  );
  const resolved = o.trafficSource !== "preset" && o.lat != null;
  // On the dashboard, once live location is the active origin there's nothing to
  // re-select — lock the button and show it as chosen.
  const liveActive = compact && o.label === "My location";

  return (
    <div className="space-y-4">
      {/* Live location */}
      <button
        onClick={locateMe}
        disabled={busy != null || liveActive}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        📍{" "}
        {busy === "locate"
          ? "Locating…"
          : busy === "route"
            ? "Routing…"
            : liveActive
              ? "Using your live location"
              : "Use my live location"}
      </button>

      {/* Address */}
      <div className="flex gap-2">
        <input
          type="text"
          value={addr}
          placeholder="…or type an address / place"
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitAddress()}
          className="min-w-0 flex-1 rounded-xl border border-border bg-panel-2 px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          onClick={submitAddress}
          disabled={busy != null || !addr.trim()}
          className="seg-btn rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          {busy === "geocode" ? "…" : "Find"}
        </button>
      </div>

      {/* Status */}
      {error && <p className="text-xs text-warn">{error}</p>}
      {resolved && !busy && (
        <div className="flex items-center gap-2 rounded-xl border border-border-soft bg-bg-soft px-4 py-2.5 text-xs">
          <span className="text-accent">🚗</span>
          <span className="text-muted">
            <b className="text-text">{o.label}</b> →{" "}
            <b className="text-text">{o.freeFlowDriveMin} min</b> free-flow
            {o.liveDriveMin ? (
              <>
                {" "}
                (<b className="text-warn">{o.liveDriveMin} min</b> with traffic)
              </>
            ) : null}
          </span>
          <span className="chip ml-auto px-2 py-0.5 text-[10px] text-accent">
            {SOURCE_LABEL[o.trafficSource]}
          </span>
        </div>
      )}

      {/* Preset fallback */}
      <div className="pt-1">
        <div className="mb-2 text-xs uppercase tracking-wide text-faint">
          or pick a rough distance
        </div>
        <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
          {ORIGIN_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => pickPreset(p.label, p.freeFlowDriveMin)}
              data-active={activePreset?.id === p.id}
              className="seg-btn rounded-xl px-3 py-2.5 text-left"
            >
              <div className="text-sm font-medium text-text">{p.label}</div>
              <div className="text-xs text-faint">{p.sublabel}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
