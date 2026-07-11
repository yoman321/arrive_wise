// Door-to-gate travel model, per travel mode.
//
// Chain of events: leave origin -> travel -> arrive at lot/drop-off/station ->
// (find parking) -> walk/transfer to the gate. Free-flow drive time is precomputed
// per origin/venue; the experienced travel leg is that, scaled by the mode's pace
// and up to three composable multipliers:
//   surge    — match-day congestion that worsens toward kickoff (road modes only)
//   baseline — ambient road congestion (road modes only)
//   weather  — a drive slowdown (car/rideshare) or a walk-pace slowdown (walk/bike)
// The near-venue ground portion — parking (with its own surge), the exposed walk
// to the gate, and any transfer — is mode-specific too. `MODE_PHYSICS` says which
// parts of the chain bite for each mode.

import type { Conditions, Match, Stadium, TripInput } from "./types";
import { DEFAULT_CONDITIONS } from "./types";
import {
  MODE_PHYSICS,
  ROUND_SURGE_WEIGHT,
  WEATHER_EFFECTS,
  diurnalTrafficMultiplier,
  parkingSurge,
  trafficSurge,
  weatherWalkMult,
} from "./curves";
import { parseClock } from "./time";

export interface TravelLeg {
  /** Travel-leg minutes actually experienced (free-flow × pace × surge × baseline × weather). */
  driveMin: number;
  /** Minutes rel. kickoff you leave the origin. */
  departMin: number;
  /** Minutes rel. kickoff you reach the lot / drop-off / station. */
  lotArrivalMin: number;
  /** Ground minutes between lot arrival and the gate (parking + walk + transfer). */
  groundMin: number;
  /** Parking-search minutes (0 for modes that don't park). */
  parkingMin: number;
  /** The match-day surge multiplier applied to the leg (1 for off-road modes). */
  surge: number;
  /** The ambient baseline (time-of-day or live) multiplier applied (1 for off-road). */
  baselineMult: number;
  /** The weather multiplier applied to the leg (drive/walk penalty, or 1 for transit). */
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
  nearVenueMin: number
): number {
  const bt = conditions.baselineTraffic;
  if (bt.source === "auto") {
    // Time-of-day congestion at the wall-clock moment you're near the venue.
    const clockMin = parseClock(match.kickoff) + nearVenueMin;
    return diurnalTrafficMultiplier(clockMin, isWeekendDate(match.date));
  }
  // "live" / "estimate": a fixed ratio already reflecting current conditions.
  return Math.max(0, bt.mult);
}

/**
 * Back-solve the departure time for a desired gate-arrival time, for the trip's
 * mode. We evaluate the time-varying multipliers around the near-venue moment
 * (lot arrival), where match-day congestion and parking pressure actually bite.
 * The ground portion is derived from a nominal (flat-parking) estimate to fix the
 * evaluation point in a single pass — no fixed-point iteration.
 */
export function travelForGateArrival(
  gateArrivalMin: number,
  trip: TripInput,
  stadium: Stadium,
  match: Match,
  conditions: Conditions = DEFAULT_CONDITIONS
): TravelLeg {
  const phys = MODE_PHYSICS[trip.mode ?? "drive"];
  const roundWeight = ROUND_SURGE_WEIGHT[match.round];
  const wx = conditions.weather.kind;

  // The approach walk (lot/station → gate) is outdoors, exposed to weather.
  const approachWalkMult = weatherWalkMult(wx, 1);
  const approachWalkMin = stadium.lotToGateWalkMin * approachWalkMult;

  // Nominal ground (flat parking) locates the near-venue evaluation moment.
  const nominalGround =
    (phys.parking ? stadium.parkingSearchMin : 0) +
    approachWalkMin +
    phys.accessEgressMin;
  const evalMin = gateArrivalMin - nominalGround;

  const surge = phys.roadSurge ? trafficSurge(evalMin, roundWeight) : 1;
  const baselineMult = phys.roadBaseline
    ? baselineFor(conditions, match, evalMin)
    : 1;
  const weatherMult =
    phys.legWeather === "drive"
      ? WEATHER_EFFECTS[wx].drive
      : phys.legWeather === "walk"
        ? WEATHER_EFFECTS[wx].walkPace
        : 1;

  // Parking search grows toward kickoff (its own surge); transfers can too.
  const parkMult = parkingSurge(evalMin, roundWeight);
  const parkingMin = phys.parking ? stadium.parkingSearchMin * parkMult : 0;
  const accessMin =
    phys.accessEgressMin *
    (phys.accessEgressSurges ? 1 + 0.6 * (parkMult - 1) : 1);
  const groundMin = parkingMin + approachWalkMin + accessMin;

  const legFreeFlow = trip.freeFlowDriveMin * phys.paceMult;
  const driveMin = legFreeFlow * surge * baselineMult * weatherMult;
  const lotArrivalMin = gateArrivalMin - groundMin;
  const departMin = lotArrivalMin - driveMin;

  return {
    driveMin,
    departMin,
    lotArrivalMin,
    groundMin,
    parkingMin,
    surge,
    baselineMult,
    weatherMult,
  };
}
