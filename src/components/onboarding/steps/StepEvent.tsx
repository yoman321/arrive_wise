"use client";

import type { StepProps } from "../types";
import { MATCHES } from "@/lib/data/matches";
import { ROUND_LABEL, matchTitle, matchVenueLine, formatDate } from "@/lib/ui";
import { offsetToClock } from "@/lib/engine";

export default function StepEvent({ plan, update }: StepProps) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm text-muted">
        Pick the match you&apos;re headed to — we&apos;ll model its crowd, security
        surge and match-day traffic.
      </p>
      <div className="grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {MATCHES.map((m) => (
          <button
            key={m.id}
            onClick={() => update({ match: m })}
            data-active={plan.match.id === m.id}
            className="seg-btn rounded-xl px-3.5 py-3 text-left"
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
            <div className="mt-0.5 text-xs text-muted">
              {formatDate(m.date)} · KO {offsetToClock(m.kickoff, 0)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
