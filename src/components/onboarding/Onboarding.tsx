"use client";

import { useState } from "react";
import type { StepProps, TripPlan } from "./types";
import StepEvent from "./steps/StepEvent";
import StepLocation from "./steps/StepLocation";
import StepTarget from "./steps/StepTarget";
import StepTravel from "./steps/StepTravel";
import StepStyle from "./steps/StepStyle";

interface StepDef {
  key: string;
  title: string;
  Body: React.ComponentType<StepProps>;
  valid: (p: TripPlan) => boolean;
}

const STEPS: StepDef[] = [
  { key: "event", title: "Where are you headed?", Body: StepEvent, valid: (p) => !!p.match },
  {
    key: "location",
    title: "Where are you starting from?",
    Body: StepLocation,
    valid: (p) => p.origin.freeFlowDriveMin >= 2,
  },
  { key: "target", title: "When do you want to be seated?", Body: StepTarget, valid: (p) => !!p.target },
  { key: "travel", title: "How are you getting there?", Body: StepTravel, valid: (p) => !!p.mode },
  { key: "style", title: "What's your style?", Body: StepStyle, valid: () => true },
];

export default function Onboarding({
  initial,
  onComplete,
}: {
  initial: TripPlan;
  onComplete: (plan: TripPlan) => void;
}) {
  const [plan, setPlan] = useState<TripPlan>(initial);
  const [step, setStep] = useState(0);

  const update = (patch: Partial<TripPlan>) => setPlan((p) => ({ ...p, ...patch }));

  const def = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canNext = def.valid(plan);

  const next = () => {
    if (!canNext) return;
    if (isLast) onComplete(plan);
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const Body = def.Body;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="card p-6 sm:p-8">
        {/* Progress */}
        <div className="mb-6">
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
          <h2 className="mb-4 text-xl font-black tracking-tight text-text sm:text-2xl">
            {def.title}
          </h2>
          <Body plan={plan} update={update} />
        </div>

        {/* Footer */}
        <div className="mt-7 flex items-center justify-between gap-3">
          <button
            onClick={back}
            disabled={step === 0}
            className="seg-btn rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={next}
            disabled={!canNext}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLast ? "See my plan →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
