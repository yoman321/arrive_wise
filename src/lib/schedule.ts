// Cached access to the onboarding fixture schedule. The first call fetches
// `/api/matches` (live WC2026 knockouts, seed fallback) and every later call
// reuses it: a module-level promise dedupes within a page session, and a
// sessionStorage copy (1h TTL, mirroring the route's upstream revalidate) skips
// the round-trip across reloads. Falls back to the seed on any failure — and a
// failed attempt isn't cached, so a later mount can retry.

import { MATCHES } from "./data/matches";
import type { Match } from "./engine/types";

export interface Schedule {
  matches: Match[];
  live: boolean;
}

const SESSION_KEY = "arrivewise:schedule";
const TTL_MS = 60 * 60 * 1000; // 1h — matches the api/matches upstream revalidate

let cached: Promise<Schedule> | null = null;

function readSession(): Schedule | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: Schedule };
    if (Date.now() - at > TTL_MS || !data?.matches?.length) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSession(data: Schedule) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // storage unavailable/full — the module cache still covers this session
  }
}

export function getSchedule(): Promise<Schedule> {
  if (cached) return cached;
  const load = (async (): Promise<Schedule> => {
    const stored = typeof window !== "undefined" ? readSession() : null;
    if (stored) return stored;
    try {
      const res = await fetch("/api/matches");
      const data = res.ok ? await res.json() : null;
      if (data?.matches?.length) {
        const schedule: Schedule = {
          matches: data.matches as Match[],
          live: data.source === "live",
        };
        writeSession(schedule);
        return schedule;
      }
    } catch {
      // network/parse failure — fall through to the seed
    }
    cached = null; // don't pin a failed attempt; let a later caller retry
    return { matches: MATCHES, live: false };
  })();
  cached = load;
  return load;
}
