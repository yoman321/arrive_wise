// Shared state for the onboarding wizard + the bridge from a collected plan to
// engine inputs. The wizard collects a `TripPlan`; `page.tsx` turns it into the
// (stadium, trip, prefs, conditions) tuple the engine consumes.

import type {
  Conditions,
  Match,
  Preferences,
  TargetMoment,
  TrafficSource,
  TravelMode,
  TripInput,
  WeatherInput,
} from "@/lib/engine/types";
import { MATCHES } from "@/lib/data/matches";

export interface OriginState {
  /** Human label for the origin ("Use my location", an address, or a preset). */
  label: string;
  lat?: number;
  lng?: number;
  /** Free-flow (no-traffic) drive minutes to the venue. */
  freeFlowDriveMin: number;
  /** Drive minutes with traffic, when a live/predictive route resolved. */
  liveDriveMin?: number;
  trafficSource: TrafficSource;
}

export interface TripPlan {
  match: Match;
  origin: OriginState;
  target: TargetMoment;
  mode: TravelMode;
  chill: number;
  /** Resolved weather (live or manual). Populated by the weather layer. */
  weather?: WeatherInput;
}

/** Props every wizard step body receives. */
export interface StepProps {
  plan: TripPlan;
  update: (patch: Partial<TripPlan>) => void;
}

export function initialPlan(): TripPlan {
  return {
    match: MATCHES[0],
    origin: {
      label: "Across the metro",
      freeFlowDriveMin: 45,
      trafficSource: "preset",
    },
    target: "kickoff",
    mode: "drive",
    chill: 0.5,
  };
}

/** Ambient road multiplier: use a live traffic ratio when we have one, else the
 * deterministic time-of-day curve. */
function deriveBaseline(o: OriginState): Conditions["baselineTraffic"] {
  if (
    (o.trafficSource === "live" || o.trafficSource === "predicted") &&
    o.liveDriveMin &&
    o.freeFlowDriveMin > 0
  ) {
    return { source: "live", mult: o.liveDriveMin / o.freeFlowDriveMin };
  }
  return { source: "auto", mult: 1 };
}

export function planToTrip(plan: TripPlan): TripInput {
  return {
    freeFlowDriveMin: plan.origin.freeFlowDriveMin,
    originLabel: plan.origin.label,
    originLat: plan.origin.lat,
    originLng: plan.origin.lng,
    liveDriveMin: plan.origin.liveDriveMin,
    trafficSource: plan.origin.trafficSource,
    mode: plan.mode,
  };
}

export function planToPrefs(plan: TripPlan): Preferences {
  return { target: plan.target, chill: plan.chill };
}

export function planToConditions(
  plan: TripPlan,
  weather?: WeatherInput
): Conditions {
  return {
    baselineTraffic: deriveBaseline(plan.origin),
    weather: weather ?? plan.weather ?? { kind: "clear", source: "manual" },
  };
}
