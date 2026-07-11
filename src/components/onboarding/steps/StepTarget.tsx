"use client";

import type { StepProps } from "../types";
import type { TargetMoment } from "@/lib/engine/types";

const TARGETS: { key: TargetMoment; label: string; hint: string }[] = [
  { key: "warmups", label: "Warmups", hint: "~45 min early" },
  { key: "anthems", label: "Anthems", hint: "~8 min early" },
  { key: "kickoff", label: "Kickoff", hint: "right on time" },
];

export default function StepTarget({ plan, update }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        What&apos;s the moment you can&apos;t miss? We&apos;ll make sure you&apos;re
        in your seat for it.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.key}
            onClick={() => update({ target: t.key })}
            data-active={plan.target === t.key}
            className="seg-btn rounded-xl px-2 py-4 text-center"
          >
            <div className="text-sm font-semibold text-text">{t.label}</div>
            <div className="mt-0.5 text-[11px] text-faint">{t.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
