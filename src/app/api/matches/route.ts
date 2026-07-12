// Live, forward-looking WC2026 fixtures for the onboarding schedule. Follows the
// same perimeter pattern as geocode/route/weather/venue-food: a keyless live
// source with a deterministic fallback (the hand-authored `MATCHES`) so the demo
// never breaks. The feed is TheSportsDB's free tier (test key "3"), which carries
// the real WC2026 schedule with venue-local kickoff times and commercial venue
// names that line up with our 16 host stadiums.
//
// We pull the *knockout* rounds — the games still to come during the showcase —
// per-round (`eventsround.php`, which isn't truncated the way the free-tier
// season endpoint is) and merge them. Teams that aren't decided yet arrive as a
// placeholder rather than being dropped. We only surface fixtures we can pin to a
// known stadium, and only return the live set when it actually contains upcoming
// games — otherwise (empty, all in the past, or unreachable) we hand back the seed
// schedule so a planner is always showing games that *will* happen.

import { STADIUMS } from "@/lib/data/stadiums";
import { MATCHES, KNOCKOUT_SCHEDULE } from "@/lib/data/matches";
import type { Match, Round } from "@/lib/engine/types";

const LEAGUE_ID = "4429"; // FIFA World Cup on TheSportsDB
const SEASON = "2026";
// TheSportsDB round codes for this competition: 125 = quarter-finals, 150 =
// semi-finals. 160/170/180 aren't populated today but are cheap to ask for and
// future-proof the moment the final / third-place / earlier rounds land.
const KNOCKOUT_ROUNDS = [125, 150, 160, 170, 180];
const roundUrl = (r: number) =>
  `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=${LEAGUE_ID}&r=${r}&s=${SEASON}`;

interface TsdbEvent {
  idEvent?: string;
  dateEvent?: string;
  dateEventLocal?: string;
  strTime?: string;
  strTimeLocal?: string;
  strVenue?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
}

/** Collapse a venue/name string to a comparable token (lowercase, alnum only). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// The feed usually uses commercial venue names (MetLife, SoFi, Estadio Azteca…),
// but can fall back to FIFA's generic "<host city> Stadium" branding or a slightly
// different commercial name. Map those onto our ids so resolution stays resilient.
const VENUE_ALIASES: Record<string, string> = {
  newyorknewjerseystadium: "metlife",
  dallasstadium: "att",
  losangelesstadium: "sofi",
  sanfranciscobayareastadium: "levis",
  seattlestadium: "lumen",
  kansascitystadium: "arrowhead",
  houstonstadium: "nrg",
  atlantastadium: "mercedes",
  miamistadium: "hardrock",
  bostonstadium: "gillette",
  foxborough: "gillette",
  philadelphiastadium: "linc",
  torontostadium: "bmo",
  vancouverstadium: "bcplace",
  estadiociudaddemexico: "azteca",
  estadioguadalajara: "akron",
  estadiomonterrey: "bbva",
  estadiobbvabancomer: "bbva",
  estadiobancomer: "bbva",
};

const NAME_INDEX: Record<string, string> = Object.fromEntries(
  STADIUMS.map((s) => [norm(s.name), s.id])
);

/** Resolve a feed venue string to one of our stadium ids, or null to skip it. */
function resolveVenue(venue: string | undefined): string | null {
  if (!venue) return null;
  const key = norm(venue);
  if (NAME_INDEX[key]) return NAME_INDEX[key];
  if (VENUE_ALIASES[key]) return VENUE_ALIASES[key];
  // Loose containment ("GEHA Field at Arrowhead Stadium" → "arrowhead…").
  for (const s of STADIUMS) {
    const n = norm(s.name);
    if (key.includes(n) || n.includes(key)) return s.id;
  }
  return null;
}

// WC2026 stage windows (venue-local ISO dates). Deriving the round from the date
// is robust for this specific tournament and sidesteps the feed's opaque round
// codes; string comparison is valid on zero-padded ISO dates.
function roundForDate(date: string): Round {
  if (date <= "2026-06-27") return "group";
  if (date <= "2026-07-03") return "round32";
  if (date <= "2026-07-07") return "round16";
  if (date <= "2026-07-13") return "quarter";
  if (date <= "2026-07-16") return "semi";
  return "final";
}

function mapEvent(ev: TsdbEvent): Match | null {
  const stadiumId = resolveVenue(ev.strVenue);
  if (!stadiumId) return null;
  const date = (ev.dateEventLocal || ev.dateEvent || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const kickoff = (ev.strTimeLocal || ev.strTime || "15:00:00").slice(0, 5);
  return {
    id: ev.idEvent ? `tsdb-${ev.idEvent}` : `tsdb-${date}-${stadiumId}`,
    stadiumId,
    date,
    kickoff,
    // Undecided knockout slots can arrive blank — show a placeholder, don't drop.
    home: ev.strHomeTeam?.trim() || "TBD",
    away: ev.strAwayTeam?.trim() || "TBD",
    round: roundForDate(date),
  };
}

/** Fetch one knockout round; any failure yields no events (a soft miss). */
async function fetchRound(r: number): Promise<TsdbEvent[]> {
  try {
    const res = await fetch(roundUrl(r), {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 }, // fixtures/teams resolve slowly (hourly is plenty)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: TsdbEvent[] | null };
    return data.events ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  const todayISO = new Date().toISOString().slice(0, 10);

  try {
    const rounds = await Promise.all(KNOCKOUT_ROUNDS.map(fetchRound));

    const seen = new Set<string>();
    const matches: Match[] = [];
    for (const events of rounds) {
      for (const ev of events) {
        const m = mapEvent(ev);
        if (m && !seen.has(m.id)) {
          seen.add(m.id);
          matches.push(m);
        }
      }
    }
    // The fixed knockout slots the feed hasn't populated yet (a semi-final whose
    // teams aren't set, the final) are shown as placeholders from the known
    // schedule — we already know their venue + date, only the teams are undecided.
    // A slot the feed already covers (same venue + date) is dropped so the live,
    // real-team version wins.
    const covered = new Set(matches.map((m) => `${m.stadiumId}|${m.date}`));
    const fill = KNOCKOUT_SCHEDULE.filter(
      (m) => m.date >= todayISO && !covered.has(`${m.stadiumId}|${m.date}`)
    );

    const all = [...matches, ...fill].sort((a, b) =>
      `${a.date}T${a.kickoff}`.localeCompare(`${b.date}T${b.kickoff}`)
    );

    // Only trust the live feed if it actually returned fixtures and something is
    // still to come; otherwise fall back to the seed (always carries upcoming games).
    const hasUpcoming = all.some((m) => m.date >= todayISO);
    if (!matches.length || !hasUpcoming) throw new Error("no upcoming fixtures");

    return Response.json({ source: "live", count: matches.length, matches: all });
  } catch (err) {
    return Response.json({
      source: "fallback",
      matches: MATCHES,
      error: err instanceof Error ? err.message : "matches feed failed",
    });
  }
}
