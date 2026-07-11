"use client";

import type { Recommendation } from "@/lib/engine/types";
import { fmtDuration } from "@/lib/engine";

const DOT: Record<string, string> = {
  leave: "var(--info)",
  arrive_lot: "var(--info)",
  through_gate: "var(--warn)",
  seated: "var(--accent)",
  kickoff: "var(--danger)",
};

export default function Timeline({ rec }: { rec: Recommendation }) {
  const steps = rec.timeline;
  return (
    <div className="relative">
      <div
        className="absolute left-[7px] top-2 bottom-2 w-px"
        style={{ background: "var(--border)" }}
      />
      <ul className="space-y-4">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1] : null;
          const gap = prev ? s.min - prev.min : 0;
          return (
            <li key={s.key} className="relative flex items-center gap-3 pl-6">
              <span
                className="absolute left-0 h-3.5 w-3.5 rounded-full ring-4"
                style={{
                  background: DOT[s.key],
                  boxShadow: `0 0 0 0 ${DOT[s.key]}`,
                  // @ts-expect-error css var for ring color
                  "--tw-ring-color": "var(--bg-soft)",
                }}
              />
              <div className="flex flex-1 items-baseline justify-between">
                <span
                  className={`text-sm ${
                    s.key === "seated"
                      ? "font-semibold text-accent"
                      : s.key === "kickoff"
                        ? "font-semibold text-danger"
                        : "text-text"
                  }`}
                >
                  {s.label}
                </span>
                <span className="tabular text-sm font-medium text-text">
                  {s.clock}
                </span>
              </div>
              {prev && gap > 0 && (
                <span className="absolute -top-3 left-6 text-[11px] text-faint">
                  +{fmtDuration(gap)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
