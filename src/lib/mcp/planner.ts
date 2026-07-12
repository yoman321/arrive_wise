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
import {
  planToTrip,
  planToPrefs,
  planToConditions,
  type OriginState,
  type TripPlan,
} from "@/components/onboarding/types";
import { matchTitle, upcomingMatches, ROUND_LABEL } from "@/lib/ui";
import { encodePlan } from "@/lib/scenario";

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

// WC2026 stage windows (venue-local ISO dates) — used only when we synthesize a
// fixture for a venue the schedule doesn't cover. Mirrors api/matches.
function roundForDate(date: string): Round {
  if (date <= "2026-06-27") return "group";
  if (date <= "2026-07-03") return "round32";
  if (date <= "2026-07-07") return "round16";
  if (date <= "2026-07-13") return "quarter";
  if (date <= "2026-07-16") return "semi";
  return "final";
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
function resolveMatch(
  schedule: Match[],
  opts: { matchId?: string; stadiumId: string | null; match?: string }
): Match {
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

  if (pool.length) return upcomingMatches(pool)[0];

  // The venue has no scheduled fixture we know of — synthesize a plausible one so
  // the fan's chosen venue is still honored (teams are cosmetic to the engine).
  if (opts.stadiumId) {
    const date =
      upcomingMatches(schedule)[0]?.date ?? new Date().toISOString().slice(0, 10);
    return {
      id: `custom-${opts.stadiumId}`,
      stadiumId: opts.stadiumId,
      date,
      kickoff: "16:00",
      home: "TBD",
      away: "TBD",
      round: roundForDate(date),
    };
  }
  return upcomingMatches(schedule)[0] ?? schedule[0];
}

// Rough drive minutes when we can't geocode an origin — keyed off descriptor words.
function presetDriveMin(origin: string | undefined): number {
  const key = norm(origin ?? "");
  if (/(walk|nearby|next|adjac|downtown|nearthe)/.test(key)) return 10;
  if (/(samecity|incity|local|close)/.test(key)) return 25;
  if (/(far|outoftown|another|differentcity|hours)/.test(key)) return 75;
  return 45; // "across the metro" default
}

async function enrichOrigin(
  origin: string | undefined,
  originDriveMin: number | undefined,
  match: Match,
  resolved?: OriginState
): Promise<OriginState> {
  const stadium = STADIUM_BY_ID[match.stadiumId];

  // Already-resolved origin (an adjustment turn reusing the prior geocode/route).
  if (resolved && resolved.freeFlowDriveMin > 0) return resolved;

  // Caller-supplied drive time wins outright (no network needed).
  if (typeof originDriveMin === "number" && originDriveMin > 0) {
    return {
      label: origin?.trim() || "Chosen origin",
      freeFlowDriveMin: Math.round(originDriveMin),
      trafficSource: "preset",
    };
  }

  // Try to geocode a real address, then route it (live/predicted traffic).
  if (origin && origin.trim()) {
    try {
      const g = await fetch(
        `${baseUrl()}/api/geocode?q=${encodeURIComponent(origin.trim())}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const geo = g.ok ? await g.json() : null;
      if (geo && !geo.error && typeof geo.lat === "number") {
        const departAt = `${match.date}T${match.kickoff}:00`;
        const qs = new URLSearchParams({
          fromLat: String(geo.lat),
          fromLng: String(geo.lng),
          toLat: String(stadium.lat),
          toLng: String(stadium.lng),
          departAt,
        });
        const r = await fetch(`${baseUrl()}/api/route?${qs}`, {
          signal: AbortSignal.timeout(8000),
        });
        const route = r.ok ? await r.json() : null;
        return {
          label: geo.label ?? origin.trim(),
          lat: geo.lat,
          lng: geo.lng,
          freeFlowDriveMin: route?.freeFlowDriveMin ?? presetDriveMin(origin),
          liveDriveMin: route?.liveDriveMin,
          trafficSource: route?.trafficSource ?? "estimate",
        };
      }
    } catch {
      // geocode/route unreachable — fall back to a descriptor-based preset
    }
  }

  return {
    label: origin?.trim() || "Across the metro",
    freeFlowDriveMin: presetDriveMin(origin),
    trafficSource: "preset",
  };
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
  if (delta.matchId) {
    merged.venue = delta.venue;
    merged.originResolved = undefined;
  } else if (delta.venue && delta.venue !== base.venue) {
    merged.matchId = undefined;
    merged.originResolved = undefined;
  } else if (delta.match) {
    merged.matchId = undefined;
    merged.originResolved = undefined;
  }
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
  const match = resolveMatch(schedule, {
    matchId: input.matchId,
    stadiumId,
    match: input.match,
  });
  const stadium = STADIUM_BY_ID[match.stadiumId];

  const [origin, weather] = await Promise.all([
    enrichOrigin(input.origin, input.originDriveMin, match, input.originResolved),
    enrichWeather(match),
  ]);

  const chill =
    typeof input.chill === "number"
      ? Math.min(1, Math.max(0, input.chill))
      : input.vibe
        ? VIBE_CHILL[input.vibe.toLowerCase()] ?? 0.5
        : 0.5;

  // If a food budget is set but no explicit food time, assume a short stop so the
  // "grab food" step shows up in the plan.
  const concessionsMin =
    input.concessionsMin ?? (input.foodBudgetUsd ? 15 : 0);

  const plan: TripPlan = {
    match,
    origin,
    target: input.target ?? "kickoff",
    mode: input.mode ?? "drive",
    chill,
    weather,
    concessionsMin,
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
  const summary = renderSummary(plan, rec, dashboardUrl);

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
    },
  };
}

function money(n: number): string {
  return `$${Math.round(n)}`;
}

function renderSummary(
  plan: TripPlan,
  rec: ReturnType<typeof recommend>,
  url: string
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
  lines.push(`Open this scenario on the dashboard: ${url}`);
  return lines.join("\n");
}
