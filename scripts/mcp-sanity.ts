// MCP tool sanity checks — the deterministic core behind the plan_arrival /
// plan_from_text tools and the chat assistant. No network: this covers the pure
// logic (scenario codec, venue/text resolvers, intent extraction, adjustment
// merge). Live end-to-end coverage against a running server is in mcp-e2e.ts.
// Run with: npm run test:mcp

import { encodePlan, decodePlan } from "@/lib/scenario";
import {
  resolveVenue,
  scanVenueFromText,
  mergeInput,
  baseFromPlan,
} from "@/lib/mcp/planner";
import { coerceIntent, keywordIntent } from "@/lib/mcp/extract";
import { getContextPlan, setContextPlan } from "@/lib/mcp/context";
import type { TripPlan } from "@/components/onboarding/types";
import type { Match } from "@/lib/engine/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}
function group(name: string) {
  console.log(`\n${name}`);
}

// A representative fully-resolved plan to exercise codec + merge.
const MATCH: Match = {
  id: "tsdb-123",
  stadiumId: "att",
  date: "2026-07-14",
  kickoff: "14:00",
  home: "France",
  away: "Spain",
  round: "semi",
};
function samplePlan(over: Partial<TripPlan> = {}): TripPlan {
  return {
    match: MATCH,
    origin: {
      label: "Fort Worth, Texas",
      lat: 32.75,
      lng: -97.33,
      freeFlowDriveMin: 26,
      liveDriveMin: 34,
      trafficSource: "routed",
    },
    target: "anthems",
    mode: "drive",
    chill: 0.9,
    budgetUsd: 150,
    foodBudgetUsd: 20,
    roundTrip: false,
    ...over,
  };
}

// ── Scenario codec ────────────────────────────────────────────────────────────
group("Scenario codec (encode/decode a TripPlan for the ?s= deep-link)");
{
  const plan = samplePlan();
  const round = decodePlan(encodePlan(plan));
  check("round-trips a valid plan", round !== null);
  check(
    "preserves match, origin, prefs, budget",
    !!round &&
      round.match.stadiumId === "att" &&
      round.match.id === "tsdb-123" &&
      round.origin.freeFlowDriveMin === 26 &&
      round.target === "anthems" &&
      round.mode === "drive" &&
      round.chill === 0.9 &&
      round.budgetUsd === 150,
    round ? `stadium ${round.match.stadiumId}, chill ${round.chill}` : "null"
  );

  check("rejects garbage input", decodePlan("not-valid-base64!!") === null);

  const badStadium = encodePlan(samplePlan({ match: { ...MATCH, stadiumId: "nope" } }));
  check("rejects an unknown stadium id", decodePlan(badStadium) === null);

  // A plan whose origin lost its drive number is unusable.
  const noDrive = encodePlan(
    samplePlan({ origin: { label: "x", freeFlowDriveMin: undefined as unknown as number, trafficSource: "preset" } })
  );
  check("rejects a plan with no drive time", decodePlan(noDrive) === null);

  const clamped = decodePlan(encodePlan(samplePlan({ chill: 5 })));
  check("clamps an out-of-range chill to [0,1]", clamped?.chill === 1, `chill ${clamped?.chill}`);

  const badMode = decodePlan(encodePlan(samplePlan({ mode: "teleport" as never })));
  check("falls back an invalid mode to drive", badMode?.mode === "drive", `mode ${badMode?.mode}`);
}

// ── Venue resolution ──────────────────────────────────────────────────────────
group("resolveVenue (id / commercial name / city / alias / fuzzy)");
{
  check("exact id", resolveVenue("sofi") === "sofi");
  check("commercial name", resolveVenue("MetLife") === "metlife");
  check("host city", resolveVenue("Los Angeles") === "sofi", String(resolveVenue("Los Angeles")));
  check("city alias (Dallas → att)", resolveVenue("Dallas") === "att");
  check("'final' shorthand → MetLife", resolveVenue("final") === "metlife");
  check("Mexico City → Azteca", resolveVenue("Mexico City") === "azteca");
  check("fuzzy 'AT&T' → att", resolveVenue("AT&T") === "att", String(resolveVenue("AT&T")));
  check("unknown venue → null", resolveVenue("Narnia Dome") === null);
  check("empty → null", resolveVenue(undefined) === null);
}

group("scanVenueFromText (pull a venue out of a free sentence)");
{
  check(
    "'…the metlife final' → metlife",
    scanVenueFromText("we're heading to the metlife final") === "metlife"
  );
  check(
    "'…SoFi Stadium' → sofi",
    scanVenueFromText("let's go to SoFi Stadium tonight") === "sofi"
  );
  check("no venue mentioned → null", scanVenueFromText("some random chatter") === null);
}

// ── Intent coercion (whitelist an arbitrary object, e.g. LLM JSON) ─────────────
group("coerceIntent (validate/whitelist raw intent JSON)");
{
  const c = coerceIntent({
    mode: "drive",
    budgetUsd: "120",
    chill: 2,
    roundTrip: true,
    target: "anthems",
    junk: "ignored",
    venue: "  MetLife  ",
  });
  check("keeps a valid mode", c.mode === "drive");
  check("coerces numeric string budget", c.budgetUsd === 120, String(c.budgetUsd));
  check("clamps chill to 1", c.chill === 1, String(c.chill));
  check("keeps roundTrip boolean", c.roundTrip === true);
  check("keeps valid target enum", c.target === "anthems");
  check("trims venue string", c.venue === "MetLife", JSON.stringify(c.venue));
  check("drops unknown keys", !("junk" in c));
  check("drops an invalid mode enum", coerceIntent({ mode: "teleport" }).mode === undefined);
}

// ── Keyword fallback (no-LLM extraction) ──────────────────────────────────────
group("keywordIntent (deterministic NL fallback)");
{
  const k = keywordIntent(
    "uber from fort worth to the final for the anthems, keep it relaxed, under $120 total and $25 for food, bringing my kids, both ways"
  );
  check("mode: uber → rideshare", k.mode === "rideshare");
  check("origin: 'from fort worth'", (k.origin ?? "").toLowerCase().includes("fort worth"), k.origin);
  check("target: anthems", k.target === "anthems");
  check("vibe: relaxed", k.vibe === "relaxed");
  check("budget: $120", k.budgetUsd === 120, String(k.budgetUsd));
  check("food budget: $25 (food-tagged)", k.foodBudgetUsd === 25, String(k.foodBudgetUsd));
  check("party buffer from 'kids'", (k.partyBufferMin ?? 0) > 0, String(k.partyBufferMin));
  check("round-trip from 'both ways'", k.roundTrip === true);
  check("fixture hint: 'final'", (k.match ?? "").toLowerCase() === "final", k.match);

  const t = keywordIntent("taking the train, want to be there for warmups");
  check("mode: train → transit", t.mode === "transit");
  check("target: warmups", t.target === "warmups");
  check("no budget mentioned → undefined", t.budgetUsd === undefined);
}

// ── Adjustment merge (multi-turn: apply a delta to the current plan) ───────────
group("mergeInput (adjust an existing plan, keeping prior selections)");
{
  const plan = samplePlan();
  const base = baseFromPlan(plan);
  check("baseFromPlan carries the fixture id + venue", base.matchId === "tsdb-123" && base.venue === "att");
  check("baseFromPlan carries the resolved origin", base.originResolved === plan.origin);

  const budgetOnly = mergeInput(plan, { budgetUsd: 80 });
  check(
    "budget-only delta keeps venue/origin/mode, changes budget",
    budgetOnly.budgetUsd === 80 &&
      budgetOnly.venue === "att" &&
      budgetOnly.matchId === "tsdb-123" &&
      budgetOnly.mode === "drive" &&
      budgetOnly.originResolved === plan.origin,
    `budget ${budgetOnly.budgetUsd}`
  );

  const vibed = mergeInput(plan, { vibe: "cutItClose" });
  check(
    "new vibe wins over carried numeric chill",
    vibed.vibe === "cutItClose" && vibed.chill === undefined,
    `chill ${vibed.chill}`
  );

  const modeSwap = mergeInput(plan, { mode: "transit" });
  check(
    "mode swap keeps fixture + origin",
    modeSwap.mode === "transit" && modeSwap.matchId === "tsdb-123" && modeSwap.originResolved === plan.origin
  );

  const newVenue = mergeInput(plan, { venue: "sofi" });
  check(
    "new venue drops carried fixture id + resolved origin",
    newVenue.venue === "sofi" && newVenue.matchId === undefined && newVenue.originResolved === undefined
  );

  const newOrigin = mergeInput(plan, { origin: "Dallas" });
  check(
    "new origin forces a re-geocode (drops resolved origin)",
    newOrigin.origin === "Dallas" &&
      newOrigin.originResolved === undefined &&
      newOrigin.venue === "att" &&
      newOrigin.matchId === "tsdb-123"
  );
}

// ── Context store (the shared "current selections" the tools fetch + adjust) ──
group("Context store (getContextPlan / setContextPlan)");
{
  check("empty by default", getContextPlan() === null);
  const p = samplePlan();
  check("accepts a valid plan", setContextPlan(p) === true);
  check("returns what was stored", getContextPlan()?.match.stadiumId === "att");
  check(
    "rejects a plan with an unknown stadium",
    setContextPlan(samplePlan({ match: { ...MATCH, stadiumId: "nope" } })) === false
  );
  check("keeps the last valid plan after a rejected set", getContextPlan()?.match.stadiumId === "att");
  check("clears on null", setContextPlan(null) === true && getContextPlan() === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
