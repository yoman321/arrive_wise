// Door-to-gate travel model (car baseline).
//
// Chain of events: leave origin -> drive -> arrive at lot -> find parking ->
// walk to the gate. Free-flow drive time is precomputed per origin/venue; the
// experienced drive is that scaled by three composable multipliers:
//   surge    — match-day congestion that worsens toward kickoff (importance-scaled)
//   baseline — ambient road congestion (live routing ratio, or time-of-day curve)
//   weather  — a light precip/wind slowdown
// Deep mode physics (transit/rideshare) is a documented follow-up; today every
// mode uses this car chain and `mode` only drives labels/copy.

import type { Conditions, Match, Stadium } from "./types";
import { DEFAULT_CONDITIONS } from "./types";
import {
  ROUND_SURGE_WEIGHT,
  WEATHER_DRIVE_MULT,
  diurnalTrafficMultiplier,
  trafficSurge,
} from "./curves";
import { parseClock } from "./time";

export interface TravelLeg {
  /** Drive minutes actually experienced (free-flow × surge × baseline × weather). */
  driveMin: number;
  /** Minutes rel. kickoff you leave the origin. */
  departMin: number;
  /** Minutes rel. kickoff you reach the parking lot / drop-off. */
  lotArrivalMin: number;
  /** The match-day surge multiplier applied. */
  surge: number;
  /** The ambient baseline (time-of-day or live) multiplier applied. */
  baselineMult: number;
  /** The weather multiplier applied. */
  weatherMult: number;
}

/** Sun=0 … Sat=6; weekends have flatter commute peaks. */
function isWeekendDate(iso: string): boolean {
  const day = new Date(iso + "T00:00:00").getDay();
  return day === 0 || day === 6;
}

/** Resolve the ambient road multiplier for a given near-venue moment. */
function baselineFor(
  conditions: Conditions,
  match: Match,
  lotArrivalMin: number
): number {
  const bt = conditions.baselineTraffic;
  if (bt.source === "auto") {
    // Time-of-day congestion at the wall-clock moment you're near the venue.
    const clockMin = parseClock(match.kickoff) + lotArrivalMin;
    return diurnalTrafficMultiplier(clockMin, isWeekendDate(match.date));
  }
  // "live" / "estimate": a fixed ratio already reflecting current conditions.
  return Math.max(0, bt.mult);
}

/**
 * Back-solve the departure time for a desired gate-arrival time.
 * We evaluate the multipliers around the near-venue moment (lot arrival), where
 * match-day congestion actually bites. `lotArrival` is fully determined by
 * `gateArrival` (fixed ground portion), so no fixed-point iteration is needed.
 */
export function travelForGateArrival(
  gateArrivalMin: number,
  freeFlowDriveMin: number,
  stadium: Stadium,
  match: Match,
  conditions: Conditions = DEFAULT_CONDITIONS
): TravelLeg {
  const roundWeight = ROUND_SURGE_WEIGHT[match.round];
  // Fixed on-foot/parking portion between lot and gate.
  const groundMin = stadium.parkingSearchMin + stadium.lotToGateWalkMin;
  const lotArrivalMin = gateArrivalMin - groundMin;

  const surge = trafficSurge(lotArrivalMin, roundWeight);
  const baselineMult = baselineFor(conditions, match, lotArrivalMin);
  const weatherMult = WEATHER_DRIVE_MULT[conditions.weather.kind];

  const driveMin = freeFlowDriveMin * surge * baselineMult * weatherMult;
  const departMin = lotArrivalMin - driveMin;

  return { driveMin, departMin, lotArrivalMin, surge, baselineMult, weatherMult };
}
