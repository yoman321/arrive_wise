// Deterministic money model — the out-of-pocket cost of a trip to the venue, by
// mode. Sits alongside the time model: same philosophy as curves.ts (transparent,
// research-informed constants; never fetched), coupled to the same
// match-importance (`ROUND_SURGE_WEIGHT`) and match-time surge the travel model
// computes, so cost moves with the plan. Each estimate rolls up:
//   - drive     — event parking (importance + venue scaled) + fuel/gas.
//   - rideshare — base + booking + per-mile + per-min, times a match-day price
//                 surge derived from the road surge (the "Uber/Lyft price").
//   - transit   — a flat local fare (per person).
//   - walk/bike — no transport cost.
//   + food      — food & drink at the venue, from the concessions time buffer.
// Round trip doubles the travel-variable lines (fare / rideshare / fuel) but not
// the one-time ones (parking, food). A live pricing API could later replace any
// line at the perimeter; this stays the deterministic fallback.

import type {
  Conditions,
  CostLine,
  Match,
  ModeCost,
  Stadium,
  TravelMode,
  TripInput,
} from "./types";
import { DEFAULT_CONDITIONS } from "./types";
import { ROUND_SURGE_WEIGHT } from "./curves";
import { travelForGateArrival } from "./travel";

const MONEY = {
  /** Convert a free-flow drive-minute figure to trip miles (metro average speed). */
  metroMph: 26,
  /** Gas only, own car, per mile. */
  fuelUsdPerMile: 0.16,
  /** Typical event-lot parking before importance + venue scaling. */
  parkingBaseUsd: 22,
  /**
   * Concession spend per minute at the stands, by country — venue food is pricey
   * (a stadium beer ≈ $14 + a hot dog ≈ $8, so ~15 min buys ≈ a $27 round in the
   * US). Mexico's venues are cheaper; normalised to USD.
   */
  foodUsdPerMin: { USA: 1.8, Canada: 1.7, Mexico: 0.8 } as Record<
    Stadium["country"],
    number
  >,
  rideshare: {
    baseUsd: 2.75,
    bookingUsd: 2.5,
    perMileUsd: 1.65,
    perMinUsd: 0.32,
    minFareUsd: 11,
    /** How hard price surge tracks the road surge, and its ceiling. */
    surgeGain: 1.15,
    surgeCap: 2.5,
  },
  /** One-way local transit fare, normalised to USD by country. */
  transitFareUsd: { USA: 3.0, Canada: 3.25, Mexico: 0.5 } as Record<
    Stadium["country"],
    number
  >,
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: CostLine[]) => round2(lines.reduce((a, l) => a + l.usd, 0));

/** Trip distance in miles, inferred from the free-flow drive estimate. */
function tripMiles(trip: TripInput): number {
  return (trip.freeFlowDriveMin / 60) * MONEY.metroMph;
}

/**
 * Food & drink spend at the venue for a given concessions dwell, priced by the
 * venue's country. Its own real budget line — a stadium round adds up fast — not
 * just the time it takes. Mode-independent (you eat wherever you're seated).
 */
export function estimateFoodCost(
  concessionsMin: number,
  stadium: Stadium
): number {
  if (concessionsMin <= 0) return 0;
  return round2(concessionsMin * (MONEY.foodUsdPerMin[stadium.country] ?? 1.6));
}

/**
 * Cost of a trip for one mode, given that mode's already-resolved travel leg (so
 * rideshare prices the real, surge-inflated minutes), the venue food spend, and
 * whether it's a round trip.
 */
function costForMode(
  mode: TravelMode,
  miles: number,
  experiencedDriveMin: number,
  roadSurge: number,
  stadium: Stadium,
  match: Match,
  foodUsd: number,
  roundTrip: boolean
): ModeCost {
  const importance = ROUND_SURGE_WEIGHT[match.round];
  const tf = roundTrip ? 2 : 1; // travel-variable lines both ways
  const both = roundTrip ? " (round trip)" : "";
  const lines: CostLine[] = [];
  let surged = false;

  switch (mode) {
    case "drive": {
      // Bigger, marquee venues charge more; a final costs more than a group game.
      const venueScale = Math.min(1.5, Math.max(0.75, stadium.capacity / 68000));
      const parking = MONEY.parkingBaseUsd * importance * venueScale;
      const fuel = miles * MONEY.fuelUsdPerMile * tf;
      lines.push(
        { label: "Parking (event)", usd: round2(parking) },
        { label: `Gas${both}`, usd: round2(fuel) }
      );
      break;
    }
    case "rideshare": {
      const r = MONEY.rideshare;
      const priceSurge = Math.min(
        r.surgeCap,
        1 + r.surgeGain * Math.max(0, roadSurge - 1)
      );
      const fare =
        r.baseUsd +
        r.bookingUsd +
        r.perMileUsd * miles +
        r.perMinUsd * experiencedDriveMin;
      const perRide = Math.max(r.minFareUsd, fare * priceSurge);
      surged = priceSurge > 1.01;
      lines.push(
        { label: `Fare + distance/time${both}`, usd: round2(fare * tf) },
        {
          label: `Match-day surge ×${priceSurge.toFixed(2)}${both}`,
          usd: round2((perRide - fare) * tf),
        }
      );
      break;
    }
    case "transit": {
      const fare = (MONEY.transitFareUsd[stadium.country] ?? 3.0) * tf;
      lines.push({ label: `Transit fare${both}`, usd: round2(fare) });
      break;
    }
    case "walk":
    case "bike":
      break; // no transport cost
  }

  if (foodUsd > 0) lines.push({ label: "Food & drink", usd: round2(foodUsd) });

  const usd = sum(lines);
  const dir = roundTrip ? "round trip" : "one-way";
  const note = usd === 0 ? "free" : surged ? `${dir} · surge` : dir;
  return { mode, usd, lines, surged, note };
}

/**
 * Estimate the cost of every travel mode for this trip, evaluated at the chosen
 * gate-arrival time so rideshare prices the real surge. Includes venue food spend
 * (from the concessions buffer) and honours the round-trip flag. Deterministic and
 * fetch-free.
 */
export function estimateCostByMode(
  trip: TripInput,
  stadium: Stadium,
  match: Match,
  conditions: Conditions = DEFAULT_CONDITIONS,
  gateArrivalMin: number
): ModeCost[] {
  const miles = tripMiles(trip);
  const foodUsd = estimateFoodCost(conditions.extras.concessionsMin, stadium);
  const roundTrip = trip.roundTrip ?? false;
  const modes: TravelMode[] = ["drive", "transit", "rideshare", "walk", "bike"];
  return modes.map((mode) => {
    const leg = travelForGateArrival(
      gateArrivalMin,
      { ...trip, mode },
      stadium,
      match,
      conditions
    );
    return costForMode(
      mode,
      miles,
      leg.driveMin,
      leg.surge,
      stadium,
      match,
      foodUsd,
      roundTrip
    );
  });
}
