// Public entry point: turn a (stadium, match, trip, preferences) into a full,
// display-ready Recommendation.

import type {
  Match,
  Preferences,
  Recommendation,
  Stadium,
  TimelineStep,
  TripInput,
} from "./types";
import { optimize } from "./optimizer";
import { travelForGateArrival } from "./travel";
import { seatedForExport } from "./helpers";
import { TARGET_OFFSET_MIN } from "./curves";
import { offsetToClock } from "./time";

export * from "./types";
export { offsetToClock, fmtDuration } from "./time";
export { TARGET_LABEL, TARGET_OFFSET_MIN } from "./curves";

export function recommend(
  stadium: Stadium,
  match: Match,
  trip: TripInput,
  prefs: Preferences
): Recommendation {
  const { best, curve, queue } = optimize(stadium, match, trip, prefs);
  const target = TARGET_OFFSET_MIN[prefs.target];

  const timeline: TimelineStep[] = [
    {
      key: "leave",
      label: "Leave origin",
      min: best.departMin,
      clock: offsetToClock(match.kickoff, best.departMin),
    },
    {
      key: "arrive_lot",
      label: "Arrive & park",
      min: best.lotArrivalMin,
      clock: offsetToClock(match.kickoff, best.lotArrivalMin),
    },
    {
      key: "through_gate",
      label: "Through security",
      min: best.gateArrivalMin + best.securityWaitMin,
      clock: offsetToClock(
        match.kickoff,
        best.gateArrivalMin + best.securityWaitMin
      ),
    },
    {
      key: "seated",
      label: "In your seat",
      min: best.seatedMin,
      clock: offsetToClock(match.kickoff, best.seatedMin),
    },
    {
      key: "kickoff",
      label: "Kickoff",
      min: 0,
      clock: offsetToClock(match.kickoff, 0),
    },
  ];

  // Sensitivity: what if you left 20 min later (arrive at gate 20 min later)?
  const laterBy = 20;
  const laterGate = best.gateArrivalMin + laterBy;
  const later = seatedForExport(laterGate, queue, stadium);
  const sensitivity = {
    laterByMin: laterBy,
    extraWaitMin: Math.max(0, later.securityWaitMin - best.securityWaitMin),
    newCushionMin: target - later.seatedMin,
  };

  return {
    leaveByClock: offsetToClock(match.kickoff, best.departMin),
    leaveByMin: best.departMin,
    driveMin: best.driveMin,
    gateArrivalMin: best.gateArrivalMin,
    securityWaitMin: best.securityWaitMin,
    seatedMin: best.seatedMin,
    cushionMin: target - best.seatedMin,
    timeline,
    curve,
    sensitivity,
    crowdAtKickoff: queue.crowdAtKickoff,
  };
}

// re-export so callers can preview travel if needed
export { travelForGateArrival };
