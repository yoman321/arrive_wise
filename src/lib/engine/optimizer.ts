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
import { computeSeated, type SeatedOpts } from "./helpers";
import {
  roofExposure,
  weatherComfortCost,
  weatherThroughputMult,
  weatherWalkMult,
} from "./curves";

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
  /** Seated-time options (weather seat walk + extras) so callers recompute consistently. */
  seatedOpts: SeatedOpts;
}

export function optimize(
  stadium: Stadium,
  match: Match,
  trip: TripInput,
  prefs: Preferences,
  conditions: Conditions = DEFAULT_CONDITIONS
): OptimizationResult {
  const wx = conditions.weather.kind;
  const exposure = roofExposure(stadium.roofType);

  // Weather reshapes the interior/queue too, not just the drive:
  const throughputMult = weatherThroughputMult(wx); // slower screening in bad weather
  const gateToSeatMult = weatherWalkMult(wx, exposure); // concourse walk, roof-gated
  const comfortWeight = weatherComfortCost(wx, exposure); // idling exposed is unpleasant
  const extrasMin =
    conditions.extras.concessionsMin + conditions.extras.partyBufferMin;
  const seatedOpts: SeatedOpts = { gateToSeatMult, extrasMin };

  const queue = buildQueueModel(stadium, match, throughputMult);

  const from = queue.startMin; // earliest sensible: gates open
  const to = 10; // allow a little past kickoff
  const curve: ArrivalSample[] = [];

  let best: OptimizationResult["best"] | null = null;
  let bestCost = Infinity;

  for (let gateArrivalMin = from; gateArrivalMin <= to; gateArrivalMin++) {
    const { seatedMin, securityWaitMin } = computeSeated(
      gateArrivalMin,
      queue,
      stadium,
      seatedOpts
    );
    const { cost } = evaluateCost(
      seatedMin,
      securityWaitMin,
      prefs,
      comfortWeight
    );
    curve.push({ gateArrivalMin, securityWaitMin, seatedMin, cost });

    if (cost < bestCost) {
      bestCost = cost;
      const leg = travelForGateArrival(
        gateArrivalMin,
        trip,
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
  return { best, curve, queue, seatedOpts };
}
