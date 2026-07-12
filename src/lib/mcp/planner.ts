// The self-enriching planner behind the `plan_arrival` MCP tool. It turns a few
// conversational fields (a venue, a rough origin, a budget, a vibe) into a full
// ArriveWise scenario: resolve the fixture, geocode the origin, route the drive,
// pull venue weather, then run the deterministic engine — and hand back a
// human-readable brief plus a `?s=` deep-link that opens that exact plan on the
// dashboard. Enrichment reuses the app's own perimeter routes (geocode / route /
// weather / matches), each of which already carries its own fallback, so a missing
// key or a flaky upstream never breaks the plan.

import { recommend, offsetToClock } from "@/lib/engine";
import type { Match, Round, TargetMoment, TravelMode, WeatherInput } from "@/lib/engine/types";
import { STADIUMS, STADIUM_BY_ID } from "@/lib/data/stadiums";
import { MATCHES } from "@/lib/data/matches";
import { MAX_PLAUSIBLE_DRIVE_MIN, ORIGIN_PRESETS } from "@/lib/data/origins";
import {
  planToTrip,
  planToPrefs,
  planToConditions,
  type OriginState,
  type TripPlan,
} from "@/components/onboarding/types";
import { matchTitle, upcomingMatches, ROUND_LABEL } from "@/lib/ui";
import { encodePlan } from "@/lib/scenario";

/**
 * Thrown by buildScenario when a value the algorithm needs isn't derivable from
 * what the caller gave — a real fixture, or a real drive time from a resolvable
 * origin. We ask for it rather than invent a number. `questions` are ready to show
 * the user; `missing` is the machine-readable list of gaps.
 */
export class MissingInfoError extends Error {
  missing: string[];
  questions: string[];
  constructor(missing: string[], questions: string[]) {
    super(`missing_info: ${missing.join(", ")}`);
    this.name = "MissingInfoError";
    this.missing = missing;
    this.questions = questions;
  }
}

/** Absolute origin for internal calls to our own perimeter routes + deep-links. */
export function baseUrl(): string {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Common shorthands a fan (or model) might use for a venue.
const VENUE_ALIASES: Record<string, string> = {
  final: "metlife",
  thefinal: "metlife",
  newyork: "metlife",
  newjersey: "metlife",
  nyc: "metlife",
  dallas: "att",
  la: "sofi",
  losangeles: "sofi",
  bayarea: "levis",
  sanfrancisco: "levis",
  mexicocity: "azteca",
  guadalajara: "akron",
  monterrey: "bbva",
  kansascity: "arrowhead",
  foxborough: "gillette",
  boston: "gillette",
};

/** Fuzzy-resolve a venue string (id, commercial name, or host city) to a stadium id. */
export function resolveVenue(venue: string | undefined): string | null {
  if (!venue) return null;
  const key = norm(venue);
  if (STADIUM_BY_ID[venue]) return venue; // exact id
  if (VENUE_ALIASES[key]) return VENUE_ALIASES[key];
  for (const s of STADIUMS) {
    if (norm(s.name) === key || norm(s.city) === key) return s.id;
  }
  for (const s of STADIUMS) {
    const n = norm(s.name);
    const c = norm(s.city);
    if (key.includes(n) || n.includes(key) || key.includes(c) || c.includes(key)) {
      return s.id;
    }
  }
  return null;
}

/** Scan a free-text message for a venue mention (fallback when there's no LLM). */
export function scanVenueFromText(text: string): string | null {
  const key = norm(text);
  for (const [alias, id] of Object.entries(VENUE_ALIASES)) {
    if (key.includes(alias)) return id;
  }
  for (const s of STADIUMS) {
    const n = norm(s.name);
    const c = norm(s.city);
    // The "…stadium"-stripped token is only trusted when it's long enough not to
    // collide with ordinary words ("att" would otherwise match "chatter").
    const stripped = n.replace("stadium", "");
    if (key.includes(n) || key.includes(c) || (stripped.length >= 4 && key.includes(stripped))) {
      return s.id;
    }
  }
  return null;
}

const ROUND_KEYWORDS: Record<string, Round> = {
  group: "group",
  round32: "round32",
  roundof32: "round32",
  round16: "round16",
  roundof16: "round16",
  quarter: "quarter",
  quarterfinal: "quarter",
  semi: "semi",
  semifinal: "semi",
  final: "final",
};

async function fetchSchedule(): Promise<Match[]> {
  try {
    const res = await fetch(`${baseUrl()}/api/matches`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = res.ok ? await res.json() : null;
    if (data?.matches?.length) return data.matches as Match[];
  } catch {
    // fall through to seed
  }
  return MATCHES;
}

/** Pick a fixture from the schedule given whatever hints we have. */
// Resolve to a REAL scheduled fixture, or null. We never invent a fixture (a made-up
// kickoff would feed fabricated numbers to the engine) — a null becomes a follow-up
// question upstream.
function resolveMatch(
  schedule: Match[],
  opts: { matchId?: string; stadiumId: string | null; match?: string }
): Match | null {
  if (opts.matchId) {
    const byId = schedule.find((m) => m.id === opts.matchId);
    if (byId) return byId;
  }

  let pool = opts.stadiumId
    ? schedule.filter((m) => m.stadiumId === opts.stadiumId)
    : schedule;

  if (opts.match) {
    const key = norm(opts.match);
    const round = ROUND_KEYWORDS[key];
    if (round) {
      const byRound = pool.filter((m) => m.round === round);
      if (byRound.length) pool = byRound;
    } else {
      const byTeam = pool.filter(
        (m) => norm(m.home).includes(key) || norm(m.away).includes(key)
      );
      if (byTeam.length) pool = byTeam;
    }
  }

  // Only trust a venue/round/team filter that actually narrowed things — never fall
  // back to "soonest overall" when the caller named a specific fixture we can't find.
  const narrowed = Boolean(opts.stadiumId || opts.match || opts.matchId);
  if (!narrowed) return null; // caller named no fixture at all → ask which one
  return pool.length ? upcomingMatches(pool)[0] : null;
}

// Last-resort neutral distance when we can't pinpoint an origin AND there's no rough
// estimate to fall back on in the context — matches the picker's "Across the metro"
// preset so the plan proceeds instead of blocking.
const FALLBACK_ORIGIN: OriginState = {
  label: "Across the metro",
  freeFlowDriveMin: 45,
  trafficSource: "preset",
};

/** What resolveOrigin picked, plus an optional note when it had to degrade. */
interface OriginResolution {
  origin: OriginState | null;
  note?: string;
}

/** Name a custom drive time after the closest picker bucket, so it reads as a
 * distance rather than a place. */
function labelForDriveMin(min: number): string {
  let best = ORIGIN_PRESETS[0];
  for (const p of ORIGIN_PRESETS) {
    if (Math.abs(p.freeFlowDriveMin - min) < Math.abs(best.freeFlowDriveMin - min)) best = p;
  }
  return `${best.label} (~${min} min)`;
}

/** Map a free-text origin onto one of the rough-distance picker buckets. The MCP
 * never geocodes or uses live location, so a place name it can't bucket is ignored
 * (we fall back to the current distance instead). */
function presetFromOrigin(origin: string | undefined): OriginState | null {
  if (!origin || !origin.trim()) return null;
  const k = origin.toLowerCase();
  const byPhrase: [RegExp, string][] = [
    [/\b(nearby|near ?by|next door|right there|walk(ing)?|blocks?|around the corner)\b/, "walk"],
    [/\b(same city|in ?town|downtown|local|close by)\b/, "close"],
    [/\b(across (the )?(metro|town|city)|metro|suburb|other side)\b/, "suburb"],
    [/\b(out of town|far( away)?|another city|hour away|road trip)\b/, "far"],
  ];
  for (const [re, id] of byPhrase) {
    if (re.test(k)) {
      const p = ORIGIN_PRESETS.find((x) => x.id === id);
      if (p) return { label: p.label, freeFlowDriveMin: p.freeFlowDriveMin, trafficSource: "preset" };
    }
  }
  return null;
}

// Resolve an origin to a rough drive-time distance ONLY — the MCP is deliberately not
// hooked to geocoding or live location. Preference order: a caller-supplied drive
// time, a distance-bucket phrase, else the rough estimate already on the dashboard
// (contextOrigin). We only return null — "ask, don't guess" — when there's nothing to
// fall back on at all.
export function resolveOrigin(
  origin: string | undefined,
  originDriveMin: number | undefined,
  resolved?: OriginState,
  contextOrigin?: OriginState
): OriginResolution {
  // A distance is only usable if it's a sane match-day drive to the venue.
  const plausible = (min: number) => min > 0 && min <= MAX_PLAUSIBLE_DRIVE_MIN;
  // The rough estimate already in the context, if it's a sane match-day distance.
  const rough = (o?: OriginState) => (o && plausible(o.freeFlowDriveMin) ? o : null);
  const keptNote = (o: OriginState) =>
    `kept your current distance (~${o.freeFlowDriveMin} min from the venue)`;

  // Unchanged, carried origin — reuse it as-is (this is the dashboard's own selection).
  // If it's implausibly far (a stale/wrong live location the FE set), degrade to the
  // context's rough estimate, then a neutral distance preset.
  if (resolved && resolved.freeFlowDriveMin > 0) {
    if (plausible(resolved.freeFlowDriveMin)) return { origin: resolved };
    const ctx = rough(contextOrigin);
    if (ctx) return { origin: ctx, note: keptNote(ctx) };
    return {
      origin: FALLBACK_ORIGIN,
      note: "a rough ~45 min distance (your saved origin was too far to be a match-day drive)",
    };
  }

  // An explicit drive time in minutes → a rough distance.
  if (typeof originDriveMin === "number" && originDriveMin > 0) {
    const min = Math.round(originDriveMin);
    if (plausible(min)) {
      return { origin: { label: labelForDriveMin(min), freeFlowDriveMin: min, trafficSource: "preset" } };
    }
  }

  // A phrase that names one of the picker's distance buckets ("across town", "nearby").
  const preset = presetFromOrigin(origin);
  if (preset) return { origin: preset };

  // Couldn't turn it into a rough distance. Keep the distance already on the dashboard
  // rather than blocking; only ask when there's genuinely nothing to reuse.
  const ctx = rough(contextOrigin);
  if (ctx) return { origin: ctx, note: origin?.trim() ? keptNote(ctx) : undefined };
  return { origin: null };
}

async function enrichWeather(match: Match): Promise<WeatherInput | undefined> {
  const stadium = STADIUM_BY_ID[match.stadiumId];
  try {
    const hour = Number(match.kickoff.split(":")[0]);
    const qs = new URLSearchParams({
      lat: String(stadium.lat),
      lng: String(stadium.lng),
      date: match.date,
      hour: String(Number.isFinite(hour) ? hour : 15),
    });
    const res = await fetch(`${baseUrl()}/api/weather?${qs}`, {
      signal: AbortSignal.timeout(8000),
    });
    const w = res.ok ? await res.json() : null;
    if (w && !w.error && w.kind) {
      return {
        kind: w.kind,
        source: "live",
        tempC: w.tempC,
        precipMm: w.precipMm,
        windKph: w.windKph,
      };
    }
  } catch {
    // no live weather — the engine defaults to clear
  }
  return undefined;
}

const VIBE_CHILL: Record<string, number> = {
  cutitclose: 0.15,
  balanced: 0.5,
  relaxed: 0.75,
  veryearly: 0.95,
};

export interface PlanArrivalInput {
  matchId?: string;
  venue?: string;
  match?: string;
  origin?: string;
  originDriveMin?: number;
  mode?: TravelMode;
  target?: TargetMoment;
  chill?: number;
  vibe?: "cutItClose" | "balanced" | "relaxed" | "veryEarly";
  budgetUsd?: number;
  foodBudgetUsd?: number;
  concessionsMin?: number;
  partyBufferMin?: number;
  roundTrip?: boolean;
  /** A pre-resolved origin (server-side only) — reused on adjustment turns so the
   * geocode/route isn't re-run when only, say, the vibe or budget changes. */
  originResolved?: OriginState;
  /** Pre-resolved weather (server-side only) — reused on adjustment turns so the
   * fan's current (possibly manually-picked) conditions aren't overwritten by a
   * fresh live fetch. Only reused while the fixture is unchanged. */
  weatherResolved?: WeatherInput;
  /** The current dashboard origin, kept as a rough-estimate fallback (server-side
   * only). When a fresh origin can't be pinpointed, we degrade to this instead of
   * blocking. Dropped when the fixture/venue changes (its drive time is venue-specific). */
  originFallback?: OriginState;
}

export interface PlanArrivalResult {
  summary: string;
  dashboardUrl: string;
  plan: TripPlan;
  details: Record<string, unknown>;
}

/** The prior plan expressed as planner input, so a delta merges cleanly onto it. */
export function baseFromPlan(plan: TripPlan): PlanArrivalInput {
  return {
    matchId: plan.match.id,
    venue: plan.match.stadiumId,
    originResolved: plan.origin,
    originFallback: plan.origin,
    weatherResolved: plan.weather,
    origin: plan.origin.label,
    mode: plan.mode,
    target: plan.target,
    chill: plan.chill,
    budgetUsd: plan.budgetUsd,
    foodBudgetUsd: plan.foodBudgetUsd,
    concessionsMin: plan.concessionsMin,
    partyBufferMin: plan.partyBufferMin,
    roundTrip: plan.roundTrip,
  };
}

/**
 * Merge an LLM delta onto the current plan for an adjustment turn ("too early",
 * "cheaper"), honoring what each change invalidates: a new fixture drops the
 * carried drive time + id; a new origin forces a re-geocode; a new vibe must win
 * over the carried numeric chill (which otherwise takes precedence).
 */
export function mergeInput(
  plan: TripPlan,
  delta: PlanArrivalInput
): PlanArrivalInput {
  const base = baseFromPlan(plan);
  const merged: PlanArrivalInput = { ...base };
  for (const [k, v] of Object.entries(delta)) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  }
  // A new fixture invalidates the carried drive time + weather + rough fallback
  // (all venue-specific).
  if (delta.matchId) {
    merged.venue = delta.venue;
    merged.originResolved = undefined;
    merged.originFallback = undefined;
    merged.weatherResolved = undefined;
  } else if (delta.venue && delta.venue !== base.venue) {
    merged.matchId = undefined;
    merged.originResolved = undefined;
    merged.originFallback = undefined;
    merged.weatherResolved = undefined;
  } else if (delta.match) {
    merged.matchId = undefined;
    merged.originResolved = undefined;
    merged.originFallback = undefined;
    merged.weatherResolved = undefined;
  }
  // A new origin forces a fresh geocode (drop the pinpoint), but we KEEP originFallback
  // so that if the new address can't be pinpointed we degrade to the rough estimate
  // already on the dashboard instead of blocking.
  if (delta.origin && delta.origin !== base.origin) {
    merged.originResolved = undefined;
    merged.originDriveMin = delta.originDriveMin;
  }
  if (delta.vibe !== undefined && delta.chill === undefined) merged.chill = undefined;
  return merged;
}

/** The whole pipeline: conversational input → enriched, engine-computed scenario. */
export async function buildScenario(
  input: PlanArrivalInput
): Promise<PlanArrivalResult> {
  const schedule = await fetchSchedule();
  const stadiumId = resolveVenue(input.venue);

  // Reject a venue string we couldn't map to a host stadium (don't silently ignore it).
  if (input.venue && !stadiumId) {
    throw new MissingInfoError(
      ["venue"],
      [`I don't recognize "${input.venue}" as a World Cup 2026 host venue. Which stadium or host city do you mean? (call list_stadiums for the 16 options)`]
    );
  }

  const match = resolveMatch(schedule, {
    matchId: input.matchId,
    stadiumId,
    match: input.match,
  });
  if (!match) {
    const named = Boolean(input.matchId || input.venue || input.match);
    throw new MissingInfoError(
      ["match"],
      [
        named
          ? "I couldn't find an upcoming World Cup 2026 fixture matching that. Which match do you mean? (name the teams or round, or call list_matches for ids)"
          : "Which match are you planning for? Name the teams, the round (e.g. \"the final\"), or a host city — or call list_matches to see what's on.",
      ]
    );
  }
  const stadium = STADIUM_BY_ID[match.stadiumId];

  // Origin is a rough distance only (no geocoding / live location in the MCP), so it
  // resolves synchronously; weather still comes from the perimeter (or a carried pick).
  const originRes = resolveOrigin(
    input.origin,
    input.originDriveMin,
    input.originResolved,
    input.originFallback
  );
  // Reuse the fan's current weather on an adjustment turn (so a manual pick isn't
  // silently replaced); only fetch live for a fresh plan or a changed fixture.
  const weather = input.weatherResolved ?? (await enrichWeather(match));
  const origin = originRes.origin;

  if (!origin) {
    throw new MissingInfoError(
      ["origin"],
      [
        `About how far are you from ${stadium.city}? Give a rough distance — right nearby, same city, across the metro, or out of town — or an approximate drive time in minutes.`,
      ]
    );
  }

  const chill =
    typeof input.chill === "number"
      ? Math.min(1, Math.max(0, input.chill))
      : input.vibe
        ? VIBE_CHILL[input.vibe.toLowerCase()] ?? 0.5
        : 0.5;

  // Preferences we fell back to (nothing fabricated for the algorithm's data inputs —
  // these are neutral defaults, surfaced so the caller can correct them).
  const assumed: string[] = [];
  if (input.mode === undefined) assumed.push("driving");
  if (input.target === undefined) assumed.push("aiming for kickoff");
  if (input.chill === undefined && input.vibe === undefined) assumed.push("balanced timing");
  if (input.budgetUsd === undefined) assumed.push("no budget cap");
  // Surface how we handled the origin when we couldn't pinpoint a precise one
  // (degraded to the dashboard's rough estimate, or a neutral distance default).
  if (originRes.note) assumed.push(originRes.note);

  const plan: TripPlan = {
    match,
    origin,
    target: input.target ?? "kickoff",
    mode: input.mode ?? "drive",
    chill,
    weather,
    concessionsMin: input.concessionsMin ?? 0,
    partyBufferMin: input.partyBufferMin ?? 0,
    budgetUsd: input.budgetUsd,
    foodBudgetUsd: input.foodBudgetUsd,
    roundTrip: input.roundTrip ?? false,
  };

  const rec = recommend(
    stadium,
    match,
    planToTrip(plan),
    planToPrefs(plan),
    planToConditions(plan, weather)
  );

  const dashboardUrl = `${baseUrl()}/?s=${encodePlan(plan)}`;
  const summary = renderSummary(plan, rec, dashboardUrl, assumed);

  return {
    summary,
    dashboardUrl,
    plan,
    details: {
      match: {
        id: match.id,
        matchup: matchTitle(match),
        round: ROUND_LABEL[match.round],
        venue: `${stadium.name}, ${stadium.city}`,
        date: match.date,
        kickoff: match.kickoff,
      },
      origin: { label: origin.label, freeFlowDriveMin: origin.freeFlowDriveMin, trafficSource: origin.trafficSource },
      leaveByClock: rec.leaveByClock,
      seatedClock: offsetToClock(match.kickoff, rec.seatedMin),
      securityWaitMin: rec.securityWaitMin,
      cushionMin: rec.cushionMin,
      cost: { mode: rec.cost.mode, usd: rec.cost.usd, surged: rec.cost.surged },
      weather: rec.weather.kind,
      assumptions: assumed,
    },
  };
}

function money(n: number): string {
  return `$${Math.round(n)}`;
}

function renderSummary(
  plan: TripPlan,
  rec: ReturnType<typeof recommend>,
  url: string,
  assumed: string[] = []
): string {
  const stadium = STADIUM_BY_ID[plan.match.stadiumId];
  const seatedClock = offsetToClock(plan.match.kickoff, rec.seatedMin);
  const cushion = Math.round(rec.cushionMin);
  const wait = Math.round(rec.securityWaitMin);

  const lines: string[] = [];
  lines.push(
    `${matchTitle(plan.match)} — ${stadium.name}, ${stadium.city} · kickoff ${plan.match.kickoff}`
  );
  lines.push(
    `Leave ${plan.origin.label} by ${rec.leaveByClock} (${plan.mode}). Seated by ${seatedClock} — ${cushion >= 0 ? `${cushion} min cushion` : `${-cushion} min late`} for ${plan.target}.`
  );
  lines.push(
    `Expected security wait ~${wait} min; ${Math.round(rec.crowdAtKickoff).toLocaleString()} fans still outside at kickoff.`
  );

  const costLine = `Est. ${plan.mode} cost ${money(rec.cost.usd)}${rec.cost.surged ? " (surge pricing)" : ""}${plan.roundTrip ? " round-trip" : " one-way"}.`;
  if (typeof plan.budgetUsd === "number") {
    const delta = plan.budgetUsd - rec.cost.usd;
    lines.push(
      `${costLine} Budget ${money(plan.budgetUsd)} → ${delta >= 0 ? `${money(delta)} to spare` : `over by ${money(-delta)}`}.`
    );
  } else {
    lines.push(costLine);
  }

  lines.push(`Weather: ${rec.weather.kind}${rec.weather.tempC != null ? ` ~${rec.weather.tempC}°C` : ""}.`);
  if (assumed.length) {
    lines.push(`Assumed (say the word to change any): ${assumed.join(", ")}.`);
  }
  lines.push(`Open this scenario on the dashboard: ${url}`);
  return lines.join("\n");
}
