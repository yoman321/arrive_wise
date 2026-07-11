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

export function matchTitle(m: Match): string {
  return `${m.home} vs ${m.away}`;
}

export function matchVenueLine(m: Match): string {
  const s = STADIUM_BY_ID[m.stadiumId];
  return `${s.name} · ${s.city}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
