"use client";

import { useState } from "react";
import type { Match } from "@/lib/engine/types";
import type { StepProps, TripPlan } from "./types";
import StepEvent from "./steps/StepEvent";
import StepLocation from "./steps/StepLocation";
import StepTravel from "./steps/StepTravel";
import StepStyle from "./steps/StepStyle";

interface StepDef {
  key: string;
  title: string;
  Body: React.ComponentType<StepProps>;
  valid: (p: TripPlan) => boolean;
}

// Lean onboarding asks only what a machine can't infer: which match, consent to
// use live location (with an address / rough-distance fallback), how you're
// getting there, and a coarse comfort style (3 presets, fine-tuned later on the
// dashboard). Target moment defaults to kickoff and is refined on the dashboard.
const STEPS: StepDef[] = [
  { key: "event", title: "Which match are you headed to?", Body: StepEvent, valid: (p) => !!p.match },
  {
    key: "location",
    title: "Where are you starting from?",
    Body: StepLocation,
    valid: (p) => p.origin.freeFlowDriveMin >= 2,
  },
  { key: "travel", title: "How are you getting there?", Body: StepTravel, valid: (p) => !!p.mode },
  { key: "style", title: "What's your style?", Body: StepStyle, valid: () => true },
];

export default function Onboarding({
  initial,
  onComplete,
  schedule,
  scheduleLive,
  matchConfirmed = false,
}: {
  initial: TripPlan;
  onComplete: (plan: TripPlan) => void;
  schedule?: Match[];
  scheduleLive?: boolean;
  /** True when re-opening an already-planned trip (Edit trip), so the existing
   * match counts as chosen and isn't forced to be re-picked. */
  matchConfirmed?: boolean;
}) {
  const [plan, setPlan] = useState<TripPlan>(initial);
  const [step, setStep] = useState(0);
  // A game must be actively picked before leaving the first step; the pre-filled
  // default doesn't count as a choice.
  const [matchChosen, setMatchChosen] = useState(matchConfirmed);

  const update = (patch: Partial<TripPlan>) => {
    if (patch.match) setMatchChosen(true);
    setPlan((p) => ({ ...p, ...patch }));
  };

  const def = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canNext = def.key === "event" ? matchChosen : def.valid(plan);

  const next = () => {
    if (!canNext) return;
    if (isLast) onComplete(plan);
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const Body = def.Body;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="card p-5 sm:p-6">
        {/* Progress */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-widest text-accent">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-faint">{def.title}</span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{
                  background: i <= step ? "var(--accent)" : "var(--border)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Title + body (re-animates on step change) */}
        <div key={step} className="fade-up">
          <h2 className="mb-3 text-lg font-black tracking-tight text-text sm:text-xl">
            {def.title}
          </h2>
          <Body
            plan={plan}
            update={update}
            schedule={schedule}
            scheduleLive={scheduleLive}
            matchChosen={matchChosen}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {/* suppressHydrationWarning: `disabled` is deterministic here, but form
              extensions (password managers, Grammarly, etc.) mutate button
              attributes before hydration — this keeps that noise out of dev. */}
          <button
            onClick={back}
            disabled={step === 0}
            suppressHydrationWarning
            className="seg-btn rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={next}
            disabled={!canNext}
            suppressHydrationWarning
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLast ? "See my plan →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
