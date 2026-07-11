"use client";

import type { StepProps } from "../types";

// A simplified, 3-option take on the dashboard's fine-grained "chill" slider.
// Each choice lands squarely in one of the slider's readout buckets
// (<0.35 close · 0.35–0.65 balanced · >0.65 chill) so onboarding and the
// dashboard stay one view on the same param — pick one here, fine-tune later.
const STYLES: { key: string; chill: number; label: string; hint: string }[] = [
  { key: "close", chill: 0.2, label: "Cut it close", hint: "Lean & late" },
  { key: "balanced", chill: 0.5, label: "Balanced", hint: "A little cushion" },
  { key: "chill", chill: 0.8, label: "Chill & early", hint: "Beat the surge" },
];

/** Which of the three presets the current chill value falls into. */
function activeKey(chill: number): string {
  if (chill < 0.35) return "close";
  if (chill > 0.65) return "chill";
  return "balanced";
}

export default function StepStyle({ plan, update }: StepProps) {
  const active = activeKey(plan.chill);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        How do you like to play it? This trades off waiting in the security line
        against sitting around early — fine-tune it any time on your dashboard.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {STYLES.map((s) => (
          <button
            key={s.key}
            onClick={() => update({ chill: s.chill })}
            data-active={active === s.key}
            className="seg-btn rounded-xl px-2 py-4 text-center"
          >
            <div className="text-sm font-semibold text-text">{s.label}</div>
            <div className="mt-0.5 text-[11px] text-faint">{s.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
