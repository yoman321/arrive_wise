// Clock helpers: everything internal is "minutes relative to kickoff"; these
// convert to/from wall-clock strings for display.

export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Wall-clock for kickoff + offset (offset usually negative). 12-hour format. */
export function offsetToClock(kickoffHHMM: string, offsetMin: number): string {
  const total = ((parseClock(kickoffHHMM) + Math.round(offsetMin)) % 1440 + 1440) % 1440;
  let h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** "1h 12m" / "43m" style duration. */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
