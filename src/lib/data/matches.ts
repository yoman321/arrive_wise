// A representative slice of the WC2026 schedule for the showcase. Teams for
// knockout rounds are illustrative placeholders. Kickoff times are local.

import type { Match } from "../engine/types";

export const MATCHES: Match[] = [
  {
    id: "final",
    stadiumId: "metlife",
    date: "2026-07-19",
    kickoff: "15:00",
    home: "Argentina",
    away: "France",
    round: "final",
  },
  {
    id: "semi-dallas",
    stadiumId: "att",
    date: "2026-07-14",
    kickoff: "19:00",
    home: "Brazil",
    away: "Spain",
    round: "semi",
  },
  {
    id: "quarter-la",
    stadiumId: "sofi",
    date: "2026-07-10",
    kickoff: "17:00",
    home: "England",
    away: "Portugal",
    round: "quarter",
  },
  {
    id: "r16-atl",
    stadiumId: "mercedes",
    date: "2026-07-04",
    kickoff: "16:00",
    home: "USA",
    away: "Mexico",
    round: "round16",
  },
  {
    id: "r16-mexicocity",
    stadiumId: "azteca",
    date: "2026-07-05",
    kickoff: "12:00",
    home: "Mexico",
    away: "Germany",
    round: "round16",
  },
  {
    id: "group-seattle",
    stadiumId: "lumen",
    date: "2026-06-18",
    kickoff: "18:00",
    home: "USA",
    away: "Wales",
    round: "group",
  },
  {
    id: "group-toronto",
    stadiumId: "bmo",
    date: "2026-06-15",
    kickoff: "16:00",
    home: "Canada",
    away: "Croatia",
    round: "group",
  },
  {
    id: "group-miami",
    stadiumId: "hardrock",
    date: "2026-06-16",
    kickoff: "20:00",
    home: "Netherlands",
    away: "Japan",
    round: "group",
  },
];

export const MATCH_BY_ID: Record<string, Match> = Object.fromEntries(
  MATCHES.map((m) => [m.id, m])
);
