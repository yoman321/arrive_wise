// Engine sanity checks. Run with: npx tsx scripts/sanity.ts
// Asserts the model behaves sensibly so the numbers are defensible.

import { recommend } from "../src/lib/engine";
import { STADIUM_BY_ID } from "../src/lib/data/stadiums";
import { MATCH_BY_ID } from "../src/lib/data/matches";
import { diurnalTrafficMultiplier } from "../src/lib/engine/curves";
import type { Conditions, Preferences, TripInput } from "../src/lib/engine/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}

const stadium = STADIUM_BY_ID["metlife"];
const match = MATCH_BY_ID["final"];
const trip: TripInput = { freeFlowDriveMin: 40, originLabel: "40 min away" };

console.log("== MetLife final, 40 min away ==");
const chill: Preferences = { target: "kickoff", chill: 0.85 };
const close: Preferences = { target: "kickoff", chill: 0.1 };
const recChill = recommend(stadium, match, trip, chill);
const recClose = recommend(stadium, match, trip, close);

console.log(
  `  chill: leave ${recChill.leaveByClock}, seated ${recChill.seatedMin}m, wait ${recChill.securityWaitMin.toFixed(1)}m, cushion ${recChill.cushionMin.toFixed(0)}m`
);
console.log(
  `  close: leave ${recClose.leaveByClock}, seated ${recClose.seatedMin}m, wait ${recClose.securityWaitMin.toFixed(1)}m, cushion ${recClose.cushionMin.toFixed(0)}m`
);

check(
  "chill fan leaves no later than cut-it-close fan",
  recChill.leaveByMin <= recClose.leaveByMin,
  `${recChill.leaveByMin} vs ${recClose.leaveByMin}`
);
check(
  "chill fan is seated at or before kickoff",
  recChill.seatedMin <= 0,
  `seated ${recChill.seatedMin}`
);
check(
  "chill fan has non-negative cushion to kickoff",
  recChill.cushionMin >= 0
);
check(
  "security wait is non-negative everywhere",
  recChill.curve.every((c) => c.securityWaitMin >= -1e-9)
);
check(
  "peak wait occurs somewhere in the pre-kickoff surge, not at gates-open",
  Math.max(...recChill.curve.map((c) => c.securityWaitMin)) >
    recChill.curve[0].securityWaitMin
);

// Traffic surge: leaving into the peak should inflate drive time vs free-flow.
check(
  "experienced drive time >= free-flow drive time",
  recChill.driveMin >= trip.freeFlowDriveMin - 1e-9,
  `${recChill.driveMin.toFixed(1)} vs ${trip.freeFlowDriveMin}`
);

// Target moment: warmups target should push seating earlier than kickoff target.
const recWarm = recommend(stadium, match, trip, {
  target: "warmups",
  chill: 0.5,
});
const recKick = recommend(stadium, match, trip, {
  target: "kickoff",
  chill: 0.5,
});
check(
  "warmups target => seated earlier than kickoff target",
  recWarm.seatedMin < recKick.seatedMin,
  `${recWarm.seatedMin} vs ${recKick.seatedMin}`
);

// Farther origin => must leave earlier (more negative).
const far = recommend(
  stadium,
  match,
  { freeFlowDriveMin: 80, originLabel: "80 min" },
  chill
);
check(
  "farther origin => earlier departure",
  far.leaveByMin < recChill.leaveByMin,
  `${far.leaveByMin} vs ${recChill.leaveByMin}`
);

// Sensitivity: leaving 20 min later never reduces wait.
check(
  "leaving 20 min later does not reduce security wait",
  recChill.sensitivity.extraWaitMin >= 0
);

// Smaller venue => lower crowd-at-kickoff than the largest.
const small = recommend(
  STADIUM_BY_ID["bmo"],
  MATCH_BY_ID["group-toronto"],
  trip,
  chill
);
check(
  "smaller group-stage venue has smaller crowd-at-kickoff than the final",
  small.crowdAtKickoff < recChill.crowdAtKickoff,
  `${small.crowdAtKickoff} vs ${recChill.crowdAtKickoff}`
);

// ---- Live conditions (weather + baseline traffic) ----
console.log("\n== Conditions layer ==");
const clearCond: Conditions = {
  baselineTraffic: { source: "auto", mult: 1 },
  weather: { kind: "clear", source: "manual" },
};
const stormCond: Conditions = {
  baselineTraffic: { source: "auto", mult: 1 },
  weather: { kind: "storm", source: "manual" },
};
const liveHeavy: Conditions = {
  baselineTraffic: { source: "live", mult: 1.6 },
  weather: { kind: "clear", source: "manual" },
};
const rClear = recommend(stadium, match, trip, close, clearCond);
const rStorm = recommend(stadium, match, trip, close, stormCond);
const rLive = recommend(stadium, match, trip, close, liveHeavy);

check(
  "storm weather increases drive time vs clear",
  rStorm.driveMin > rClear.driveMin,
  `${rStorm.driveMin.toFixed(1)} vs ${rClear.driveMin.toFixed(1)}`
);
check(
  "storm weather multiplier surfaced as 1.28",
  Math.abs(rStorm.drive.weather - 1.28) < 1e-9,
  `${rStorm.drive.weather}`
);
check(
  "live heavy traffic (×1.6) inflates drive vs clear auto",
  rLive.driveMin > rClear.driveMin && Math.abs(rLive.drive.baseline - 1.6) < 1e-9,
  `${rLive.driveMin.toFixed(1)} vs ${rClear.driveMin.toFixed(1)}, baseline ${rLive.drive.baseline}`
);
check(
  "live source is echoed for badge wording",
  rLive.baselineSource === "live" && rLive.trafficSource === "preset"
);
check(
  "default (no-conditions) recommend still yields a finite plan — key-free path",
  Number.isFinite(recClose.leaveByMin) && Number.isFinite(recClose.driveMin)
);

// Time-of-day baseline: an evening (PM-rush) arrival is worse than midday.
check(
  "diurnal traffic: 6pm weekday > noon weekday",
  diurnalTrafficMultiplier(18 * 60, false) > diurnalTrafficMultiplier(12 * 60, false),
  `${diurnalTrafficMultiplier(18 * 60, false).toFixed(2)} vs ${diurnalTrafficMultiplier(12 * 60, false).toFixed(2)}`
);
check(
  "diurnal traffic: weekday PM peak heavier than weekend PM",
  diurnalTrafficMultiplier(17.5 * 60, false) > diurnalTrafficMultiplier(17.5 * 60, true)
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
