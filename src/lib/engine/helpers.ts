// Small shared helpers used across the engine.

import type { Stadium } from "./types";
import type { QueueModel } from "./queue";

/** Seated time (min rel. kickoff) and security wait for a gate-arrival time. */
export function seatedForExport(
  gateArrivalMin: number,
  queue: QueueModel,
  stadium: Stadium
): { seatedMin: number; securityWaitMin: number } {
  const securityWaitMin = queue.waitAt(gateArrivalMin);
  const seatedMin = gateArrivalMin + securityWaitMin + stadium.gateToSeatWalkMin;
  return { seatedMin, securityWaitMin };
}
