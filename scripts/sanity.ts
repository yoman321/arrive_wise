// Engine sanity checks. Run with: npx tsx scripts/sanity.ts
// Asserts the model behaves sensibly so the numbers are defensible.

import { recommend } from "../src/lib/engine";
import { STADIUM_BY_ID } from "../src/lib/data/stadiums";
import { MATCH_BY_ID } from "../src/lib/data/matches";
import {
  diurnalTrafficMultiplier,
  parkingSurge,
  roofExposure,
  weatherThroughputMult,
  weatherWalkMult,
  ROUND_SURGE_WEIGHT,
} from "../src/lib/engine/curves";
import type { Conditions, Preferences, TripInput } from "../src/lib/engine/types";

/** Build a Conditions with clear weather and given extras/weather overrides. */
function conditions(over: Partial<Conditions> = {}): Conditions {
  return {
    baselineTraffic: { source: "auto", mult: 1 },
    weather: { kind: "clear", source: "manual" },
    extras: { concessionsMin: 0, partyBufferMin: 0 },
    ...over,
  };
}

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
const clearCond = conditions();
const stormCond = conditions({ weather: { kind: "storm", source: "manual" } });
const liveHeavy = conditions({ baselineTraffic: { source: "live", mult: 1.6 } });
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

// ---- Phase 1: full weather (throughput / walk / comfort + roof gating) ----
console.log("\n== Weather depth + roof gating ==");
check(
  "storm slows security throughput vs clear",
  weatherThroughputMult("storm") < weatherThroughputMult("clear"),
  `${weatherThroughputMult("storm")} vs ${weatherThroughputMult("clear")}`
);
check(
  "storm => more fans still outside at kickoff than clear (slower lanes)",
  rStorm.crowdAtKickoff > rClear.crowdAtKickoff,
  `${rStorm.crowdAtKickoff} vs ${rClear.crowdAtKickoff}`
);
check(
  "roof gates weather: a dome's seat-walk penalty < an open bowl's in a storm",
  weatherWalkMult("storm", roofExposure(STADIUM_BY_ID["sofi"].roofType)) <
    weatherWalkMult("storm", roofExposure(STADIUM_BY_ID["metlife"].roofType)),
  `dome ${weatherWalkMult("storm", roofExposure(STADIUM_BY_ID["sofi"].roofType)).toFixed(3)} vs open ${weatherWalkMult("storm", roofExposure(STADIUM_BY_ID["metlife"].roofType)).toFixed(3)}`
);
check(
  "clear weather is fully neutral (walk/throughput = 1)",
  weatherWalkMult("clear", 1) === 1 && weatherThroughputMult("clear") === 1
);

// ---- Phase 1: parking surge ----
console.log("\n== Parking surge ==");
const finalWeight = ROUND_SURGE_WEIGHT["final"];
check(
  "parking search worse near kickoff than 2h before",
  parkingSurge(-8, finalWeight) > parkingSurge(-120, finalWeight),
  `${parkingSurge(-8, finalWeight).toFixed(2)} vs ${parkingSurge(-120, finalWeight).toFixed(2)}`
);
check(
  "parking surge never below free-flow (>= 1)",
  parkingSurge(-8, finalWeight) >= 1 && parkingSurge(-300, finalWeight) >= 1
);

// ---- Phase 1: mode physics ----
console.log("\n== Mode physics ==");
const driveTrip: TripInput = { ...trip, mode: "drive" };
const transitTrip: TripInput = { ...trip, mode: "transit" };
const walkTrip: TripInput = { freeFlowDriveMin: 12, originLabel: "nearby", mode: "walk" };
const rDrive = recommend(stadium, match, driveTrip, close);
const rTransit = recommend(stadium, match, transitTrip, close);
const rWalk = recommend(stadium, match, walkTrip, close);
check(
  "drive is subject to match-day road surge (>1)",
  rDrive.drive.surge > 1,
  `${rDrive.drive.surge.toFixed(2)}`
);
check(
  "transit skips road surge (surge = 1)",
  Math.abs(rTransit.drive.surge - 1) < 1e-9,
  `${rTransit.drive.surge.toFixed(2)}`
);
check(
  "walk mode yields a finite plan and no road surge",
  Number.isFinite(rWalk.leaveByMin) && Math.abs(rWalk.drive.surge - 1) < 1e-9
);

// ---- Phase 1: concessions + party buffer ----
console.log("\n== Concessions + party buffer ==");
const baseExtras = recommend(stadium, match, trip, close, conditions());
const rFood = recommend(
  stadium,
  match,
  trip,
  close,
  conditions({ extras: { concessionsMin: 15, partyBufferMin: 0 } })
);
const rParty = recommend(
  stadium,
  match,
  trip,
  close,
  conditions({ extras: { concessionsMin: 0, partyBufferMin: 12 } })
);
check(
  "concessions push departure earlier",
  rFood.leaveByMin < baseExtras.leaveByMin,
  `${rFood.leaveByMin} vs ${baseExtras.leaveByMin}`
);
check(
  "concessions add a visible timeline step",
  rFood.timeline.some((s) => s.key === "concessions")
);
check(
  "party buffer pushes departure earlier",
  rParty.leaveByMin < baseExtras.leaveByMin,
  `${rParty.leaveByMin} vs ${baseExtras.leaveByMin}`
);
check(
  "party buffer stays quiet (no concessions step)",
  !rParty.timeline.some((s) => s.key === "concessions")
);

// ---- Money model ----
console.log("\n== Money model ==");
const costOf = (r: ReturnType<typeof recommend>, m: string) =>
  r.costByMode.find((c) => c.mode === m)!;
const moneyRec = recommend(stadium, match, { ...trip, mode: "drive" }, close);
const walkCost = costOf(moneyRec, "walk");
const transitCost = costOf(moneyRec, "transit");
const driveCost = costOf(moneyRec, "drive");
const rideCost = costOf(moneyRec, "rideshare");
check(
  "walk/bike are free",
  walkCost.usd === 0 && costOf(moneyRec, "bike").usd === 0
);
check(
  "transit is a flat, cheap fare (> 0, < drive)",
  transitCost.usd > 0 && transitCost.usd < driveCost.usd,
  `transit ${transitCost.usd} vs drive ${driveCost.usd}`
);
check(
  "rideshare is the priciest mode here",
  rideCost.usd > driveCost.usd && rideCost.usd > transitCost.usd,
  `ride ${rideCost.usd}`
);
check(
  "selected-mode cost matches the chosen mode",
  moneyRec.cost.mode === "drive" && moneyRec.cost.usd === driveCost.usd
);
check(
  "every mode cost is finite and non-negative",
  moneyRec.costByMode.every((c) => Number.isFinite(c.usd) && c.usd >= 0)
);
// A final's rideshare (heavier surge + importance) costs more than a group game
// from the same origin/venue.
const groupRide = costOf(
  recommend(stadium, MATCH_BY_ID["group-toronto"], { ...trip, mode: "rideshare" }, close),
  "rideshare"
);
const finalRide = costOf(
  recommend(stadium, match, { ...trip, mode: "rideshare" }, close),
  "rideshare"
);
check(
  "rideshare to the final costs more than to a group game",
  finalRide.usd > groupRide.usd,
  `${finalRide.usd} vs ${groupRide.usd}`
);

// Food: concessions time adds a food & drink line to every mode (even walk).
const withFood = recommend(
  stadium,
  match,
  { ...trip, mode: "walk" },
  close,
  conditions({ extras: { concessionsMin: 20, partyBufferMin: 0 } })
);
const walkFood = costOf(withFood, "walk");
check(
  "grabbing food adds a cost to an otherwise-free walk",
  walkFood.usd > 0 && walkFood.lines.some((l) => /food/i.test(l.label)),
  `walk+food ${walkFood.usd}`
);

// Round trip: doubles travel-variable spend (transit fare, gas) but not parking.
const oneWay = recommend(stadium, match, { ...trip, mode: "transit", roundTrip: false }, close);
const twoWay = recommend(stadium, match, { ...trip, mode: "transit", roundTrip: true }, close);
check(
  "round-trip transit is exactly double one-way",
  Math.abs(costOf(twoWay, "transit").usd - 2 * costOf(oneWay, "transit").usd) < 1e-9,
  `${costOf(twoWay, "transit").usd} vs ${costOf(oneWay, "transit").usd}`
);
const driveOne = costOf(recommend(stadium, match, { ...trip, mode: "drive", roundTrip: false }, close), "drive");
const driveTwo = costOf(recommend(stadium, match, { ...trip, mode: "drive", roundTrip: true }, close), "drive");
const parkOne = driveOne.lines.find((l) => /parking/i.test(l.label))!.usd;
const parkTwo = driveTwo.lines.find((l) => /parking/i.test(l.label))!.usd;
check(
  "round-trip drive costs more but parking (one-time) stays flat",
  driveTwo.usd > driveOne.usd && Math.abs(parkTwo - parkOne) < 1e-9,
  `drive ${driveOne.usd}->${driveTwo.usd}, parking ${parkOne}=${parkTwo}`
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
