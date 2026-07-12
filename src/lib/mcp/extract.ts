// Deterministic intent handling for the natural-language planner. Two jobs:
//   coerceIntent — whitelist + type-check an arbitrary object (an LLM's JSON, or a
//                  loose payload) down to a safe PlanArrivalInput.
//   keywordIntent — a pure regex/keyword extractor used as the fallback when the
//                   Featherless LLM is absent or unreachable, so /api/parse always
//                   returns something usable (the perimeter-with-a-fallback rule).

import type { PlanArrivalInput } from "@/lib/mcp/planner";
import type { TargetMoment, TravelMode } from "@/lib/engine/types";

const MODES: TravelMode[] = ["drive", "transit", "rideshare", "walk", "bike"];
const TARGETS: TargetMoment[] = ["warmups", "anthems", "kickoff"];
const VIBES = ["cutItClose", "balanced", "relaxed", "veryEarly"] as const;

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Reduce any object to a validated PlanArrivalInput (drops unknown/ill-typed fields). */
export function coerceIntent(raw: unknown): PlanArrivalInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: PlanArrivalInput = {};

  const venue = str(r.venue);
  if (venue) out.venue = venue;
  const match = str(r.match);
  if (match) out.match = match;
  const matchId = str(r.matchId);
  if (matchId) out.matchId = matchId;
  const origin = str(r.origin);
  if (origin) out.origin = origin;

  const drive = num(r.originDriveMin);
  if (drive !== undefined) out.originDriveMin = drive;

  if (MODES.includes(r.mode as TravelMode)) out.mode = r.mode as TravelMode;
  if (TARGETS.includes(r.target as TargetMoment))
    out.target = r.target as TargetMoment;

  const chill = num(r.chill);
  if (chill !== undefined) out.chill = Math.min(1, Math.max(0, chill));
  if (VIBES.includes(r.vibe as (typeof VIBES)[number]))
    out.vibe = r.vibe as PlanArrivalInput["vibe"];

  const budget = num(r.budgetUsd);
  if (budget !== undefined) out.budgetUsd = budget;
  const food = num(r.foodBudgetUsd);
  if (food !== undefined) out.foodBudgetUsd = food;
  const conc = num(r.concessionsMin);
  if (conc !== undefined) out.concessionsMin = conc;
  const party = num(r.partyBufferMin);
  if (party !== undefined) out.partyBufferMin = party;

  if (typeof r.roundTrip === "boolean") out.roundTrip = r.roundTrip;
  return out;
}

const ROUND_WORDS = /\b(final|semi[- ]?final|quarter[- ]?final|round of \d+|group)\b/i;

/** Best-effort structured intent from raw text, no LLM. */
export function keywordIntent(text: string): PlanArrivalInput {
  const t = text.toLowerCase();
  const out: PlanArrivalInput = {};

  // Mode
  if (/\b(uber|lyft|rideshare|ride share|taxi|cab)\b/.test(t)) out.mode = "rideshare";
  else if (/\b(train|subway|metro|transit|light rail|bus)\b/.test(t)) out.mode = "transit";
  else if (/\b(walk|walking|on foot)\b/.test(t)) out.mode = "walk";
  else if (/\b(bike|cycl|bicycle)\b/.test(t)) out.mode = "bike";
  else if (/\b(driv|car|parking|park)\b/.test(t)) out.mode = "drive";

  // Target moment
  if (/\bwarm ?up/.test(t)) out.target = "warmups";
  else if (/\banthem/.test(t)) out.target = "anthems";
  else if (/\b(kick ?off|first whistle|the start)\b/.test(t)) out.target = "kickoff";

  // Vibe
  if (/\b(cut it close|last minute|latest possible|just in time|as late as)\b/.test(t))
    out.vibe = "cutItClose";
  else if (/\b(way early|very early|super early|hours early|plenty of time)\b/.test(t))
    out.vibe = "veryEarly";
  else if (/\b(relaxed|chill|take my time|no rush|leisurely|early)\b/.test(t))
    out.vibe = "relaxed";

  // Round-trip
  if (/\b(round[- ]?trip|both ways|there and back|return trip|round trip)\b/.test(t))
    out.roundTrip = true;

  // Party buffer — a slower group
  if (/\b(kid|kids|child|children|stroller|family|wheelchair|accessib|elderly|grandma|grandpa|toddler)\b/.test(t))
    out.partyBufferMin = 10;

  // Budgets — dollar amounts, food-tagged one becomes the sub-cap
  const amounts = [...text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)];
  for (const m of amounts) {
    const usd = Number(m[1]);
    const around = text.slice(Math.max(0, m.index! - 20), m.index! + 20).toLowerCase();
    if (/\b(food|eat|concession|beer|snack|drink)\b/.test(around)) out.foodBudgetUsd = usd;
    else if (out.budgetUsd === undefined) out.budgetUsd = usd;
    else out.foodBudgetUsd = out.foodBudgetUsd ?? usd;
  }
  // Wanting food without a number still implies a short stop
  if (out.foodBudgetUsd === undefined && /\b(grab (?:some )?food|get food|eat|concession|beer|snack|bite)\b/.test(t))
    out.concessionsMin = 15;

  // Round keyword → fixture hint
  const round = t.match(ROUND_WORDS);
  if (round) out.match = round[0];

  // Origin — "from X", "coming from X", "leaving X", "based in X"
  const originMatch = text.match(
    /\b(?:from|coming from|leaving|out of|based in|live in|drive from)\s+([A-Za-z][A-Za-z .,'\-]{2,40}?)(?=\s+(?:to|for|and|with|by|at|,|\.|$))/i
  );
  if (originMatch) out.origin = originMatch[1].trim();
  else if (/\b(downtown|nearby|next to|right by|walking distance)\b/.test(t)) out.origin = "downtown";
  else if (/\b(out of town|out of state|another city|far away|road trip)\b/.test(t)) out.origin = "out of town";

  return out;
}
