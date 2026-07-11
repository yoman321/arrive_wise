"use client";

import type { StepProps } from "../types";

export default function StepStyle({ plan, update }: StepProps) {
  const chill = plan.chill;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Last thing — how do you like to play it? This trades off waiting in line
        against sitting around early.
      </p>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={chill}
        onChange={(e) => update({ chill: Number(e.target.value) })}
        className="w-full"
      />
      <div className="flex justify-between text-xs">
        <span className={chill < 0.5 ? "font-semibold text-info" : "text-faint"}>
          Cut it close
        </span>
        <span className={chill >= 0.5 ? "font-semibold text-accent" : "text-faint"}>
          Chill &amp; early
        </span>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        {chill < 0.35
          ? "Minimise dead time — arrive lean and accept a livelier line."
          : chill > 0.65
            ? "Beat the surge with a comfortable cushion, even if it means waiting in your seat."
            : "A balanced trade-off between the security line and idle time."}
      </p>
    </div>
  );
}
