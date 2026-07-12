// Display helpers shared across UI components.

import type { Match, Round } from "./engine/types";
import { STADIUM_BY_ID } from "./data/stadiums";

export const ROUND_LABEL: Record<Round, string> = {
  group: "Group stage",
  round32: "Round of 32",
  round16: "Round of 16",
  quarter: "Quarter-final",
  semi: "Semi-final",
  final: "Final",
};

// Knockout slots whose teams aren't decided carry a "TBD" placeholder. Render a
// clean title in that case: "To be decided" when neither side is known, or e.g.
// "England vs TBD" when only one is.
export function matchTitle(m: Match): string {
  const isTbd = (s: string) => !s || s.trim().toUpperCase() === "TBD";
  if (isTbd(m.home) && isTbd(m.away)) return "To be decided";
  const name = (s: string) => (isTbd(s) ? "TBD" : s);
  return `${name(m.home)} vs ${name(m.away)}`;
}

export function matchVenueLine(m: Match): string {
  const s = STADIUM_BY_ID[m.stadiumId];
  return `${s.name} · ${s.city}`;
}

// A match is "past" once its kickoff has elapsed — the threshold past which
// planning an arrival no longer makes sense. Kickoff is treated as local time,
// consistent with formatDate / offsetToClock.
export function isMatchPast(m: Match, now: Date = new Date()): boolean {
  const kickoff = new Date(`${m.date}T${m.kickoff}:00`);
  return kickoff.getTime() < now.getTime();
}

function kickoffMs(m: Match): number {
  return new Date(`${m.date}T${m.kickoff}:00`).getTime();
}

// A planner should lead with games that *will* happen. When any fixture is still
// upcoming, show only those (soonest first) and drop the finished ones; once the
// whole schedule is in the past (e.g. after the tournament), fall back to showing
// it most-recent-first so the list is never empty.
export function upcomingMatches(matches: Match[], now: Date = new Date()): Match[] {
  const upcoming = matches
    .filter((m) => !isMatchPast(m, now))
    .sort((a, b) => kickoffMs(a) - kickoffMs(b));
  if (upcoming.length) return upcoming;
  return [...matches].sort((a, b) => kickoffMs(b) - kickoffMs(a));
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
