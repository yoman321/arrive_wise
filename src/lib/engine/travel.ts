// Door-to-gate travel model (car baseline).
//
// Chain of events: leave origin -> drive -> arrive at lot -> find parking ->
// walk to the gate. Free-flow drive time is precomputed per origin/venue; we
// apply a live match-day surge multiplier that depends on WHEN you're near the
// venue (congestion worsens toward kickoff), scaled by match importance.

import type { Stadium } from "./types";
import { ROUND_SURGE_WEIGHT, trafficSurge } from "./curves";
import type { Round } from "./types";

export interface TravelLeg {
  /** Drive minutes actually experienced (free-flow x surge). */
  driveMin: number;
  /** Minutes rel. kickoff you leave the origin. */
  departMin: number;
  /** Minutes rel. kickoff you reach the parking lot / drop-off. */
  lotArrivalMin: number;
  /** The surge multiplier applied. */
  surge: number;
}

/**
 * Back-solve the departure time for a desired gate-arrival time.
 * We evaluate the surge around the near-venue moment (lot arrival), which is
 * where match-day congestion actually bites.
 */
export function travelForGateArrival(
  gateArrivalMin: number,
  freeFlowDriveMin: number,
  stadium: Stadium,
  round: Round
): TravelLeg {
  const roundWeight = ROUND_SURGE_WEIGHT[round];
  // Fixed on-foot/parking portion between lot and gate.
  const groundMin = stadium.parkingSearchMin + stadium.lotToGateWalkMin;
  const lotArrivalMin = gateArrivalMin - groundMin;

  // Surge depends on lotArrival, which depends on drive — but drive depends on
  // surge at lotArrival only, so no fixed point is needed: lotArrival is fully
  // determined by gateArrival above. Evaluate surge there directly.
  const surge = trafficSurge(lotArrivalMin, roundWeight);
  const driveMin = freeFlowDriveMin * surge;
  const departMin = lotArrivalMin - driveMin;

  return { driveMin, departMin, lotArrivalMin, surge };
}
