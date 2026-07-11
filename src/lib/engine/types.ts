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
}

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
}

export interface TimelineStep {
  key: "leave" | "arrive_lot" | "through_gate" | "seated" | "kickoff";
  label: string;
  clock: string;
  /** minutes relative to kickoff */
  min: number;
}
