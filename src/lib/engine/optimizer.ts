// Sweep candidate gate-arrival times, score each, and pick the best.
// Also emits the full curve (for charting) and a sensitivity comparison.

import type {
  ArrivalSample,
  Conditions,
  Match,
  Preferences,
  Stadium,
  TripInput,
} from "./types";
import { DEFAULT_CONDITIONS } from "./types";
import { buildQueueModel, type QueueModel } from "./queue";
import { travelForGateArrival } from "./travel";
import { evaluateCost } from "./cost";

export interface OptimizationResult {
  best: {
    gateArrivalMin: number;
    seatedMin: number;
    securityWaitMin: number;
    driveMin: number;
    departMin: number;
    lotArrivalMin: number;
    surge: number;
    baselineMult: number;
    weatherMult: number;
  };
  curve: ArrivalSample[];
  queue: QueueModel;
}

/** Seated time (min rel. kickoff) for a given gate arrival. */
function seatedFor(
  gateArrivalMin: number,
  queue: QueueModel,
  stadium: Stadium
): { seatedMin: number; securityWaitMin: number } {
  const securityWaitMin = queue.waitAt(gateArrivalMin);
  const seatedMin = gateArrivalMin + securityWaitMin + stadium.gateToSeatWalkMin;
  return { seatedMin, securityWaitMin };
}

export function optimize(
  stadium: Stadium,
  match: Match,
  trip: TripInput,
  prefs: Preferences,
  conditions: Conditions = DEFAULT_CONDITIONS
): OptimizationResult {
  const queue = buildQueueModel(stadium, match);

  const from = queue.startMin; // earliest sensible: gates open
  const to = 10; // allow a little past kickoff
  const curve: ArrivalSample[] = [];

  let best: OptimizationResult["best"] | null = null;
  let bestCost = Infinity;

  for (let gateArrivalMin = from; gateArrivalMin <= to; gateArrivalMin++) {
    const { seatedMin, securityWaitMin } = seatedFor(
      gateArrivalMin,
      queue,
      stadium
    );
    const { cost } = evaluateCost(seatedMin, securityWaitMin, prefs);
    curve.push({ gateArrivalMin, securityWaitMin, seatedMin, cost });

    if (cost < bestCost) {
      bestCost = cost;
      const leg = travelForGateArrival(
        gateArrivalMin,
        trip.freeFlowDriveMin,
        stadium,
        match,
        conditions
      );
      best = {
        gateArrivalMin,
        seatedMin,
        securityWaitMin,
        driveMin: leg.driveMin,
        departMin: leg.departMin,
        lotArrivalMin: leg.lotArrivalMin,
        surge: leg.surge,
        baselineMult: leg.baselineMult,
        weatherMult: leg.weatherMult,
      };
    }
  }

  if (!best) throw new Error("optimizer produced no candidates");
  return { best, curve, queue };
}
