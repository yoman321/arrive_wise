// Small shared helpers used across the engine.

import type { Stadium } from "./types";
import type { QueueModel } from "./queue";

/** Weather/roof-adjusted walk to the seat and the additive extras buffers. */
export interface SeatedOpts {
  /** Multiplier on the concourse walk to the seat (weather × roof exposure). */
  gateToSeatMult?: number;
  /** Additive buffer minutes before you're settled (concessions + party). */
  extrasMin?: number;
}

/** Seated time (min rel. kickoff) and security wait for a gate-arrival time. */
export function computeSeated(
  gateArrivalMin: number,
  queue: QueueModel,
  stadium: Stadium,
  opts: SeatedOpts = {}
): { seatedMin: number; securityWaitMin: number; gateToSeatMin: number } {
  const { gateToSeatMult = 1, extrasMin = 0 } = opts;
  const securityWaitMin = queue.waitAt(gateArrivalMin);
  const gateToSeatMin = stadium.gateToSeatWalkMin * gateToSeatMult;
  const seatedMin =
    gateArrivalMin + securityWaitMin + gateToSeatMin + extrasMin;
  return { seatedMin, securityWaitMin, gateToSeatMin };
}
