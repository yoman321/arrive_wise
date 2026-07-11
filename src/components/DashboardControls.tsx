"use client";

import type { ModeCost, TargetMoment, TravelMode } from "@/lib/engine/types";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import { estimateFoodCost } from "@/lib/engine/money";
import type { TripPlan } from "@/components/onboarding/types";
import OriginPicker from "@/components/OriginPicker";

/** Compact USD: "free" · "$3" · "$40". */
const fmtUsd = (usd: number) => (usd <= 0 ? "free" : `$${Math.round(usd)}`);

const TARGETS: { key: TargetMoment; label: string; hint: string }[] = [
  { key: "warmups", label: "Warmups", hint: "~45m early" },
  { key: "anthems", label: "Anthems", hint: "~8m early" },
  { key: "kickoff", label: "Kickoff", hint: "on time" },
];

const MODES: { key: TravelMode; label: string; icon: string }[] = [
  { key: "drive", label: "Drive", icon: "🚗" },
  { key: "transit", label: "Transit", icon: "🚆" },
  { key: "rideshare", label: "Rideshare", icon: "🚕" },
  { key: "walk", label: "Walk", icon: "🚶" },
  { key: "bike", label: "Bike", icon: "🚲" },
];

/** Slider over a minutes buffer with a live readout (and an optional $ cost). */
function BufferSlider({
  label,
  hint,
  value,
  max,
  onChange,
  costUsd,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  /** When set, shows the dollar cost of this buffer next to the minutes. */
  costUsd?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-text">{label}</span>
        <span className="tabular text-xs text-accent">
          {value > 0
            ? costUsd != null
              ? `${value} min · ~$${Math.round(costUsd)}`
              : `${value} min`
            : "None"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <p className="text-[11px] leading-snug text-faint">{hint}</p>
    </div>
  );
}

export default function DashboardControls({
  plan,
  update,
  costByMode,
}: {
  plan: TripPlan;
  update: (patch: Partial<TripPlan>) => void;
  costByMode: ModeCost[];
}) {
  const stadium = STADIUM_BY_ID[plan.match.stadiumId];
  const chill = plan.chill;
  const concessions = plan.concessionsMin ?? 0;
  const party = plan.partyBufferMin ?? 0;
  const budget = plan.budgetUsd ?? 0;
  const roundTrip = plan.roundTrip ?? false;

  const costOf = (m: TravelMode) => costByMode.find((c) => c.mode === m);
  const overBudget = (usd: number) => budget > 0 && usd > budget;
  const selectedCost = costOf(plan.mode);
  // Cheapest mode that's actually usable here (transit needs a real option).
  const usable = costByMode.filter(
    (c) => !(c.mode === "transit" && !stadium.hasTransit)
  );
  const cheapest = usable.reduce((a, b) => (b.usd < a.usd ? b : a), usable[0]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-text">Fine-tune your plan</h3>
        <span className="text-xs text-faint">every change recomputes live</span>
      </div>

      {/* Where you're leaving from — live location, address, or rough distance */}
      <div className="mb-5 space-y-2">
        <span className="text-xs font-semibold text-text">Leaving from</span>
        <OriginPicker plan={plan} update={update} compact />
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-border-soft pt-5 lg:grid-cols-2">
        {/* Target moment */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-text">Be seated for</span>
          <div className="grid grid-cols-3 gap-2">
            {TARGETS.map((t) => (
              <button
                key={t.key}
                onClick={() => update({ target: t.key })}
                data-active={plan.target === t.key}
                className="seg-btn rounded-xl px-2 py-2.5 text-center"
              >
                <div className="text-sm font-semibold text-text">{t.label}</div>
                <div className="mt-0.5 text-[11px] text-faint">{t.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Travel mode */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-text">Getting there by</span>
          <div className="grid grid-cols-5 gap-1.5">
            {MODES.map((m) => {
              const disabled = m.key === "transit" && !stadium.hasTransit;
              const c = costOf(m.key);
              const over = c ? overBudget(c.usd) : false;
              return (
                <button
                  key={m.key}
                  onClick={() => !disabled && update({ mode: m.key })}
                  data-active={plan.mode === m.key}
                  disabled={disabled}
                  title={
                    disabled
                      ? "No solid transit option to this venue"
                      : `${m.label}${c ? ` · ${fmtUsd(c.usd)}${c.surged ? " (surge)" : ""}` : ""}`
                  }
                  className="seg-btn rounded-xl px-1 py-2.5 text-center disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="text-lg leading-none">{m.icon}</div>
                  <div className="mt-1 text-[10px] font-medium text-text">
                    {m.label}
                  </div>
                  {c && (
                    <div
                      className={`tabular mt-0.5 text-[10px] ${
                        disabled ? "text-faint" : over ? "text-warn" : "text-accent"
                      }`}
                    >
                      {fmtUsd(c.usd)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chill slider */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-text">Your style</span>
            <span className="text-xs text-accent">
              {chill < 0.35
                ? "Cut it close"
                : chill > 0.65
                  ? "Chill & early"
                  : "Balanced"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={chill}
            onChange={(e) => update({ chill: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-[11px] text-faint">
            <span>Lean &amp; late</span>
            <span>Beat the surge</span>
          </div>
        </div>

        {/* Concessions + party buffers stacked */}
        <div className="space-y-4">
          <BufferSlider
            label="Grab food & drink"
            hint="Time at the stands before settling in — a stop on your timeline and a real line on your budget (stadium beers & hot dogs add up)."
            value={concessions}
            max={30}
            costUsd={estimateFoodCost(concessions, stadium)}
            onChange={(n) => update({ concessionsMin: n })}
          />
          <BufferSlider
            label="Slower group buffer"
            hint="Quiet pad for kids, a stroller or accessibility — leaves a little earlier."
            value={party}
            max={30}
            onChange={(n) => update({ partyBufferMin: n })}
          />
        </div>
      </div>

      {/* Budget & cost — a typed cap over the engine's per-mode cost estimates */}
      <div className="mt-5 space-y-3 border-t border-border-soft pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-text">
            Budget &amp; cost{" "}
            <span className="font-normal text-faint">· per person</span>
          </span>
          {/* One-way / round-trip toggle */}
          <div className="flex gap-1">
            {[
              { rt: false, label: "One-way" },
              { rt: true, label: "Round trip" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => update({ roundTrip: o.rt })}
                data-active={roundTrip === o.rt}
                className="seg-btn rounded-lg px-2.5 py-1 text-[11px] font-medium"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="budget" className="text-xs text-muted">
            Budget cap
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">
              $
            </span>
            <input
              id="budget"
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={budget || ""}
              placeholder="none"
              onChange={(e) =>
                update({
                  budgetUsd: Math.max(0, Math.round(Number(e.target.value) || 0)),
                })
              }
              className="tabular w-28 rounded-xl border border-border bg-panel-2 py-2 pl-6 pr-3 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {selectedCost && (
          <p className="text-[11px] leading-snug text-faint">
            Your{" "}
            <b className="text-text">
              {MODES.find((m) => m.key === selectedCost.mode)?.label}
            </b>{" "}
            trip runs about{" "}
            <b className={overBudget(selectedCost.usd) ? "text-warn" : "text-accent"}>
              {fmtUsd(selectedCost.usd)}
            </b>{" "}
            {roundTrip ? "round trip" : "one-way"}
            {selectedCost.surged ? " with match-day surge" : ""}
            {concessions > 0 ? " (incl. food)" : ""}.{" "}
            {budget > 0 && overBudget(selectedCost.usd)
              ? `That's $${Math.round(selectedCost.usd - budget)} over — cheapest here is ${
                  MODES.find((m) => m.key === cheapest.mode)?.label
                } at ${fmtUsd(cheapest.usd)}.`
              : `Cheapest option here: ${
                  MODES.find((m) => m.key === cheapest.mode)?.label
                } at ${fmtUsd(cheapest.usd)}.`}
          </p>
        )}
      </div>
    </div>
  );
}
