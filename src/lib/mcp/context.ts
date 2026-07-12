// Shared "current selections" — the plan the dashboard is currently showing. The
// browser publishes it (POST /api/context) on every change; the chat assistant and
// the MCP tools read it so an adjustment ("make it cheaper", "leave later") builds
// on what's on screen instead of starting over. It's the one bridge between the
// browser's React state and a stateless MCP client in another process.
//
// Process-local, single slot — right for a demo (one dashboard, one planner). On
// multi-instance hosting each instance keeps its own; a shared store (KV/Redis)
// would be the production swap, but the app still works without it.

import type { TripPlan } from "@/components/onboarding/types";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";

let current: TripPlan | null = null;
// Monotonic revision, bumped on every write. The dashboard polls it and applies a
// plan only when the rev is newer than what it last wrote/applied — so an external
// change (an MCP tool) lands on screen, while the dashboard's own echoes don't.
let rev = 0;

export function getContextPlan(): TripPlan | null {
  return current;
}

export function getContextState(): { plan: TripPlan | null; rev: number } {
  return { plan: current, rev };
}

/** Store the current dashboard plan. Rejects a plan that doesn't pin to a known
 *  stadium (returns false); pass null to clear. Bumps the revision on success. */
export function setContextPlan(plan: TripPlan | null): boolean {
  if (plan === null) {
    current = null;
    rev++;
    return true;
  }
  if (!plan.match?.stadiumId || !STADIUM_BY_ID[plan.match.stadiumId]) return false;
  current = plan;
  rev++;
  return true;
}
