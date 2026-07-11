// Public entry point: turn a (stadium, match, trip, preferences) into a full,
// display-ready Recommendation.

import type {
  Conditions,
  Match,
  Preferences,
  Recommendation,
  Stadium,
  TimelineStep,
  TripInput,
} from "./types";
import { DEFAULT_CONDITIONS } from "./types";
import { optimize } from "./optimizer";
import { travelForGateArrival } from "./travel";
import { computeSeated } from "./helpers";
import { TARGET_OFFSET_MIN } from "./curves";
import { offsetToClock } from "./time";

export * from "./types";
export { offsetToClock, fmtDuration } from "./time";
export { TARGET_LABEL, TARGET_OFFSET_MIN } from "./curves";

export function recommend(
  stadium: Stadium,
  match: Match,
  trip: TripInput,
  prefs: Preferences,
  conditions: Conditions = DEFAULT_CONDITIONS
): Recommendation {
  const { best, curve, queue, seatedOpts } = optimize(
    stadium,
    match,
    trip,
    prefs,
    conditions
  );
  const target = TARGET_OFFSET_MIN[prefs.target];
  const throughGateMin = best.gateArrivalMin + best.securityWaitMin;

  const mode = trip.mode ?? "drive";
  const lotLabel =
    mode === "transit"
      ? "Arrive at station"
      : mode === "rideshare"
        ? "Drop-off"
        : mode === "walk" || mode === "bike"
          ? "Reach the venue"
          : "Arrive & park";

  const timeline: TimelineStep[] = [
    {
      key: "leave",
      label: "Leave origin",
      min: best.departMin,
      clock: offsetToClock(match.kickoff, best.departMin),
    },
    {
      key: "arrive_lot",
      label: lotLabel,
      min: best.lotArrivalMin,
      clock: offsetToClock(match.kickoff, best.lotArrivalMin),
    },
    {
      key: "through_gate",
      label: "Through security",
      min: throughGateMin,
      clock: offsetToClock(match.kickoff, throughGateMin),
    },
  ];

  // Grabbing food gets its own visible step, between clearing security and
  // settling in. The party buffer stays a quiet pad folded into "seated".
  const concessionsMin = conditions.extras.concessionsMin;
  if (concessionsMin > 0) {
    timeline.push({
      key: "concessions",
      label: "Grab food & drink",
      min: throughGateMin + concessionsMin,
      clock: offsetToClock(match.kickoff, throughGateMin + concessionsMin),
    });
  }

  timeline.push(
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
    }
  );

  // Sensitivity: what if you left 20 min later (arrive at gate 20 min later)?
  const laterBy = 20;
  const laterGate = best.gateArrivalMin + laterBy;
  const later = computeSeated(laterGate, queue, stadium, seatedOpts);
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
    drive: {
      surge: best.surge,
      baseline: best.baselineMult,
      weather: best.weatherMult,
      total: best.surge * best.baselineMult * best.weatherMult,
    },
    trafficSource: trip.trafficSource ?? "preset",
    baselineSource: conditions.baselineTraffic.source,
    weather: conditions.weather,
  };
}

// re-export so callers can preview travel if needed
export { travelForGateArrival };
