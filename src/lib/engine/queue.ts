// Crowd-arrival distribution + deterministic fluid queue at the gates.
//
// We discretise the pre-match window into 1-minute buckets on a time axis τ =
// minutes relative to kickoff (negative = before). Each bucket gets a share of
// the attending crowd from a truncated-normal "when fans reach the gate" curve.
// A fluid queue then converts arrival rate vs. gate service capacity into the
// expected wait for a fan who reaches the gate at any given minute.

import type { Match, Stadium } from "./types";
import {
  ARRIVAL_LATE_TAIL_MIN,
  ARRIVAL_PEAK_MIN,
  ARRIVAL_SD_MIN,
  ATTENDANCE_FRACTION,
  normalPdf,
} from "./curves";

export interface QueueModel {
  /** τ value of grid index 0. */
  startMin: number;
  /** τ value of the last grid index. */
  endMin: number;
  /** Expected security wait (min) for a fan reaching the gate at grid time. */
  waitAt: (gateArrivalMin: number) => number;
  /** People still queued/outside at kickoff. */
  crowdAtKickoff: number;
  /** Service capacity, people/min. */
  capacityPerMin: number;
  /** Total attending crowd. */
  attendance: number;
}

export function buildQueueModel(stadium: Stadium, match: Match): QueueModel {
  const attendance = Math.round(
    stadium.capacity * ATTENDANCE_FRACTION[match.round]
  );
  const capacityPerMin = stadium.entryLanes * stadium.laneRatePerMin;

  const startMin = -stadium.gatesOpenLeadMin;
  const endMin = ARRIVAL_LATE_TAIL_MIN;
  const n = endMin - startMin + 1;

  // Truncated-normal arrival density over the grid, normalised to `attendance`.
  const density = new Array<number>(n);
  let densitySum = 0;
  for (let i = 0; i < n; i++) {
    const tau = startMin + i;
    const d = normalPdf(tau, ARRIVAL_PEAK_MIN, ARRIVAL_SD_MIN);
    density[i] = d;
    densitySum += d;
  }
  const arrivals = density.map((d) => (d / densitySum) * attendance);

  // Fluid queue: Q_{i+1} = max(0, Q_i + arrivals_i - capacity). Before gates open
  // nobody is processed, so arrivals simply accumulate as a waiting crowd.
  const queue = new Array<number>(n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    const tau = startMin + i;
    const gatesOpen = tau >= startMin; // gates open at startMin by construction
    q = q + arrivals[i];
    if (gatesOpen) q = Math.max(0, q - capacityPerMin);
    queue[i] = q;
  }

  // Wait for a fan reaching the gate at τ ≈ people ahead / service rate.
  const waitAt = (gateArrivalMin: number): number => {
    if (gateArrivalMin <= startMin) return 0; // arrive before gates open -> wait for open handled elsewhere
    if (gateArrivalMin >= endMin) return queue[n - 1] / capacityPerMin;
    const idx = Math.round(gateArrivalMin - startMin);
    const clamped = Math.min(n - 1, Math.max(0, idx));
    return queue[clamped] / capacityPerMin;
  };

  const kickoffIdx = Math.min(n - 1, Math.max(0, 0 - startMin));
  const crowdAtKickoff = Math.round(queue[kickoffIdx]);

  return {
    startMin,
    endMin,
    waitAt,
    crowdAtKickoff,
    capacityPerMin,
    attendance,
  };
}
