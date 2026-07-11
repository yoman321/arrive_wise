"use client";

import type { StepProps } from "../types";
import type { TravelMode } from "@/lib/engine/types";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";

const MODES: { key: TravelMode; label: string; icon: string; hint: string }[] = [
  { key: "drive", label: "Drive", icon: "🚗", hint: "park & walk in" },
  { key: "transit", label: "Transit", icon: "🚆", hint: "rail / bus" },
  { key: "rideshare", label: "Rideshare", icon: "🚕", hint: "drop-off zone" },
  { key: "walk", label: "Walk", icon: "🚶", hint: "on foot" },
  { key: "bike", label: "Bike", icon: "🚲", hint: "ride & lock up" },
];

export default function StepTravel({ plan, update }: StepProps) {
  const stadium = STADIUM_BY_ID[plan.match.stadiumId];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        How are you getting to {stadium.name}? This tunes the door-to-gate leg of
        your plan.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const disabled = m.key === "transit" && !stadium.hasTransit;
          return (
            <button
              key={m.key}
              onClick={() => !disabled && update({ mode: m.key })}
              data-active={plan.mode === m.key}
              disabled={disabled}
              title={disabled ? "No solid transit option to this venue" : undefined}
              className="seg-btn rounded-xl px-2 py-4 text-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="text-xl leading-none">{m.icon}</div>
              <div className="mt-1.5 text-sm font-semibold text-text">{m.label}</div>
              <div className="mt-0.5 text-[11px] text-faint">
                {disabled ? "limited here" : m.hint}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-faint">
        Each mode has its own physics: transit and bike skip road surge and
        parking, rideshare trades parking for a drop-off delay, and walking is
        priced by the weather on your feet.
      </p>
    </div>
  );
}
