// Cost function the optimizer minimises for a candidate gate-arrival time.
//
// The fan dislikes (a) standing in the security line, (b) sitting around too
// early before the moment they care about, and (c) being late for it — with a
// hard extra penalty for not being seated by kickoff. The "chill" preference
// reshapes these weights: a chill fan wants a buffer (hates lateness, tolerates
// arriving early); a cut-it-close fan hates wasted early time and accepts risk.

import type { Preferences } from "./types";
import { TARGET_OFFSET_MIN } from "./curves";

export interface CostWeights {
  security: number;
  early: number;
  late: number;
  hardKickoff: number;
}

export function weightsFor(prefs: Preferences): CostWeights {
  const c = Math.min(1, Math.max(0, prefs.chill));
  return {
    security: 1,
    early: 0.15 + 0.55 * (1 - c), // cut-it-close fans hate arriving early
    late: 0.4 + 1.9 * c, // chill fans hate being late for their moment
    hardKickoff: 8 + 4 * c, // missing kickoff is always heavily penalised
  };
}

export interface CostBreakdown {
  securityWaitMin: number;
  earlinessMin: number;
  latenessMin: number;
  missedKickoffMin: number;
  cost: number;
}

export function evaluateCost(
  seatedMin: number,
  securityWaitMin: number,
  prefs: Preferences,
  /** Extra cost per minute of early idle time when exposed to bad weather. */
  comfortWeight = 0
): CostBreakdown {
  const target = TARGET_OFFSET_MIN[prefs.target];
  const w = weightsFor(prefs);

  const earlinessMin = Math.max(0, target - seatedMin); // seated before target
  const latenessMin = Math.max(0, seatedMin - target); // seated after target
  const missedKickoffMin = Math.max(0, seatedMin - 0); // seated after kickoff

  const cost =
    w.security * securityWaitMin +
    (w.early + comfortWeight) * earlinessMin +
    w.late * latenessMin +
    w.hardKickoff * missedKickoffMin;

  return { securityWaitMin, earlinessMin, latenessMin, missedKickoffMin, cost };
}
