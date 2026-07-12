"use client";

import type { StepProps } from "../types";
import { MATCHES } from "@/lib/data/matches";
import {
  ROUND_LABEL,
  matchTitle,
  matchVenueLine,
  formatDate,
  isMatchPast,
  upcomingMatches,
} from "@/lib/ui";
import { offsetToClock } from "@/lib/engine";

export default function StepEvent({ plan, update, schedule, scheduleLive }: StepProps) {
  const matches = upcomingMatches(schedule ?? MATCHES);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Pick the match you&apos;re headed to — we&apos;ll model its crowd, security
          surge and match-day traffic.
        </p>
        <span className="chip shrink-0 whitespace-nowrap px-2 py-0.5 text-[10px] text-faint">
          {scheduleLive ? "Live schedule" : "Sample schedule"}
        </span>
      </div>
      <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {matches.map((m) => {
          const past = isMatchPast(m);
          return (
            <button
              key={m.id}
              onClick={() => update({ match: m })}
              data-active={plan.match.id === m.id}
              className={`seg-btn rounded-xl px-3.5 py-3 text-left ${past ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">
                  {matchTitle(m)}
                </span>
                <span className="chip shrink-0 whitespace-nowrap px-2 py-0.5 text-[10px] text-accent">
                  {ROUND_LABEL[m.round]}
                </span>
              </div>
              <div className="mt-1 text-xs text-faint">{matchVenueLine(m)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>
                  {formatDate(m.date)} · KO {offsetToClock(m.kickoff, 0)}
                </span>
                {past && (
                  <span className="chip whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium text-faint">
                    Finished
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
