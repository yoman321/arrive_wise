// Core domain + engine types for ArriveWise.
// The recommendation engine is event-agnostic; WC2026 is the showcase dataset.

/** A physical venue. Times in minutes, distances implicit in precomputed drive data. */
export interface Stadium {
  id: string;
  name: string;
  city: string;
  country: "USA" | "Canada" | "Mexico";
  lat: number;
  lng: number;
  /** Nominal seated capacity. */
  capacity: number;
  /** Number of independent entry lanes/turnstiles across all gates. */
  entryLanes: number;
  /** People processed per lane per minute at a security/ticket checkpoint. */
  laneRatePerMin: number;
  /** Minutes before kickoff that gates open. */
  gatesOpenLeadMin: number;
  /** Typical minutes spent finding a parking spot on a match day. */
  parkingSearchMin: number;
  /** Typical walk minutes from parking/transit to the gate. */
  lotToGateWalkMin: number;
  /** Typical walk minutes from the gate through concourse to a seat. */
  gateToSeatWalkMin: number;
  /** Whether decent public transit exists (affects surge, informational). */
  hasTransit: boolean;
  /**
   * Roof configuration. Gates how much weather bites the *interior* legs (the
   * concourse walk to the seat, and the comfort of waiting around early): an open
   * bowl is fully exposed, a dome shrugs it off, a retractable roof is assumed
   * closed in bad weather. The approach walk and outdoor security queue stay
   * exposed regardless. Defaults to "open" when absent.
   */
  roofType?: RoofType;
}

/** How a venue is covered — drives weather sensitivity. */
export type RoofType = "open" | "retractable" | "dome";

/** Match importance drives expected attendance fraction + traffic surge. */
export type Round = "group" | "round32" | "round16" | "quarter" | "semi" | "final";

export interface Match {
  id: string;
  stadiumId: string;
  /** ISO date, local to venue. */
  date: string;
  /** Kickoff clock time "HH:MM" (24h), local to venue. */
  kickoff: string;
  home: string;
  away: string;
  round: Round;
}

/** What the fan wants to be in their seat for. */
export type TargetMoment = "warmups" | "anthems" | "kickoff";

/** How the fan trades off waiting-in-line vs. cutting-it-close. 0 = cut it close, 1 = chill/early. */
export interface Preferences {
  target: TargetMoment;
  /** 0..1 slider. Higher = more buffer, more risk-averse. */
  chill: number;
}

export interface TripInput {
  /** Free-flow driving minutes from origin to venue (no traffic). */
  freeFlowDriveMin: number;
  originLabel: string;
  /** Real origin coordinates, when resolved from geolocation/geocoding. */
  originLat?: number;
  originLng?: number;
  /**
   * Drive minutes *with* traffic from a live/predictive routing source, when
   * available. The engine derives the baseline congestion ratio from this.
   */
  liveDriveMin?: number;
  /** Where the drive number came from (for provenance + UI badges). */
  trafficSource?: TrafficSource;
  /** How the fan is travelling. Drives real per-mode physics (see `MODE_PHYSICS`). */
  mode?: TravelMode;
}

/** How the fan is getting to the venue. Each mode has its own travel physics. */
export type TravelMode = "drive" | "transit" | "rideshare" | "walk" | "bike";

/** Coarse weather bucket driving a light drive-time effect (deep effects are a follow-up). */
export type WeatherKind = "clear" | "rain" | "heat" | "cold" | "wind" | "storm";

/** Provenance of the drive/traffic number, surfaced as a badge on the dashboard. */
export type TrafficSource =
  | "live" // real-time traffic near the venue
  | "predicted" // predictive traffic for the future match time
  | "routed" // real route distance, free-flow only (no live traffic)
  | "estimate" // straight-line distance heuristic
  | "preset"; // hand-picked origin preset, no coordinates

export interface WeatherInput {
  kind: WeatherKind;
  source: "manual" | "live";
  /** Present when sourced live (Open-Meteo). */
  tempC?: number;
  precipMm?: number;
  windKph?: number;
}

/**
 * Live/ambient conditions the engine folds into the plan. Kept deliberately
 * small: the core stays pure and deterministic, and every field has a safe
 * default so the perimeter data layer is purely additive.
 */
export interface Conditions {
  /**
   * Ambient road congestion, separate from the kickoff-proximity surge.
   * - "auto": derive a time-of-day (diurnal) multiplier per candidate.
   * - "live": use `mult` directly (from a real/predicted routing ratio).
   * - "estimate": use `mult` directly (from a coarse heuristic).
   */
  baselineTraffic: { source: "auto" | "live" | "estimate"; mult: number };
  weather: WeatherInput;
  /**
   * Additive time buffers that shift the *optimal gate arrival earlier* because
   * they push the seated moment later (they enter cost via `seatedMin`):
   *   concessionsMin  — grabbing food/drink before settling in (visible timeline step).
   *   partyBufferMin  — a slower group (kids, stroller, accessibility): a quiet pad.
   */
  extras: { concessionsMin: number; partyBufferMin: number };
}

export const DEFAULT_CONDITIONS: Conditions = {
  baselineTraffic: { source: "auto", mult: 1 },
  weather: { kind: "clear", source: "manual" },
  extras: { concessionsMin: 0, partyBufferMin: 0 },
};

/** Multiplicative breakdown of the experienced drive time, for transparency. */
export interface DriveBreakdown {
  /** Kickoff-proximity / match-importance surge. */
  surge: number;
  /** Ambient time-of-day or live-traffic multiplier. */
  baseline: number;
  /** Weather multiplier. */
  weather: number;
  /** Product of the three. */
  total: number;
}

/** One sampled point on the "if you arrive at the gate at time τ" curves. */
export interface ArrivalSample {
  /** Minutes relative to kickoff you reach the gate. Negative = before kickoff. */
  gateArrivalMin: number;
  /** Expected security queue wait (min) if you arrive then. */
  securityWaitMin: number;
  /** Minutes relative to kickoff you'd be seated. */
  seatedMin: number;
  /** Total cost used by the optimizer (lower is better). */
  cost: number;
}

export interface Recommendation {
  /** Clock time to leave the origin, "HH:MM". */
  leaveByClock: string;
  /** Minutes relative to kickoff to leave. */
  leaveByMin: number;
  /** Drive time actually experienced (with surge), minutes. */
  driveMin: number;
  /** Minutes relative to kickoff you reach the gate. */
  gateArrivalMin: number;
  /** Expected security wait at that gate arrival, minutes. */
  securityWaitMin: number;
  /** Minutes relative to kickoff you'd be seated (negative = before kickoff). */
  seatedMin: number;
  /** Minutes of cushion before the chosen target moment (negative = you'd miss part of it). */
  cushionMin: number;
  /** Clock times for the timeline steps. */
  timeline: TimelineStep[];
  /** The full sweep, for charting. */
  curve: ArrivalSample[];
  /** "If you left 20 min later" comparison. */
  sensitivity: { laterByMin: number; extraWaitMin: number; newCushionMin: number };
  /** Expected number of fans still outside the gates at kickoff (context stat). */
  crowdAtKickoff: number;
  /** Multiplicative breakdown of the experienced drive time (surge × baseline × weather). */
  drive: DriveBreakdown;
  /** Where the ambient traffic figure came from. */
  trafficSource: TrafficSource;
  /** Ambient road multiplier source, for badge wording ("live" vs time-of-day). */
  baselineSource: Conditions["baselineTraffic"]["source"];
  /** Weather assumed for this plan (echoed for the dashboard). */
  weather: WeatherInput;
}

export interface TimelineStep {
  key:
    | "leave"
    | "arrive_lot"
    | "through_gate"
    | "concessions"
    | "seated"
    | "kickoff";
  label: string;
  clock: string;
  /** minutes relative to kickoff */
  min: number;
}
