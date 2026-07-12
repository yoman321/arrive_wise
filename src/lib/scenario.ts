// A scenario is a whole `TripPlan` packed into a URL-safe string, so a plan built
// anywhere (the MCP tool, a share link) can be handed to the dashboard as `?s=…`.
// Isomorphic: the encoder runs server-side in the MCP route (Node `Buffer`), the
// decoder runs in the browser on mount (`atob`). Decoding is defensive — an
// unknown/garbled payload yields `null` and the dashboard keeps its own state.

import type { TripPlan } from "@/components/onboarding/types";
import type { TargetMoment, TravelMode } from "@/lib/engine/types";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";

function toBase64Url(json: string): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(json, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return typeof Buffer !== "undefined"
    ? Buffer.from(b64, "base64").toString("utf8")
    : decodeURIComponent(escape(atob(b64)));
}

export function encodePlan(plan: TripPlan): string {
  return toBase64Url(JSON.stringify(plan));
}

const TARGETS: TargetMoment[] = ["warmups", "anthems", "kickoff"];
const MODES: TravelMode[] = ["drive", "transit", "rideshare", "walk", "bike"];
const clamp01 = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
const posNum = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;

/** Parse a `?s=` payload back into a validated TripPlan, or null if unusable. */
export function decodePlan(s: string): TripPlan | null {
  try {
    const raw = JSON.parse(fromBase64Url(s)) as Partial<TripPlan>;
    const m = raw.match;
    // The match must pin to a stadium we actually know, or the engine can't run.
    if (!m || typeof m.stadiumId !== "string" || !STADIUM_BY_ID[m.stadiumId]) {
      return null;
    }
    const o = raw.origin;
    if (!o || typeof o.freeFlowDriveMin !== "number") return null;

    return {
      match: {
        id: String(m.id ?? `custom-${m.stadiumId}`),
        stadiumId: m.stadiumId,
        date: String(m.date ?? ""),
        kickoff: String(m.kickoff ?? "15:00"),
        home: String(m.home ?? "TBD"),
        away: String(m.away ?? "TBD"),
        round: m.round ?? "group",
      },
      origin: {
        label: String(o.label ?? "Chosen origin"),
        lat: typeof o.lat === "number" ? o.lat : undefined,
        lng: typeof o.lng === "number" ? o.lng : undefined,
        freeFlowDriveMin: o.freeFlowDriveMin,
        liveDriveMin: posNum(o.liveDriveMin),
        trafficSource: o.trafficSource ?? "estimate",
      },
      target: TARGETS.includes(raw.target as TargetMoment)
        ? (raw.target as TargetMoment)
        : "kickoff",
      mode: MODES.includes(raw.mode as TravelMode)
        ? (raw.mode as TravelMode)
        : "drive",
      chill: clamp01(raw.chill),
      weather: raw.weather,
      concessionsMin: posNum(raw.concessionsMin),
      partyBufferMin: posNum(raw.partyBufferMin),
      budgetUsd: posNum(raw.budgetUsd),
      foodBudgetUsd: posNum(raw.foodBudgetUsd),
      roundTrip: Boolean(raw.roundTrip),
    };
  } catch {
    return null;
  }
}
