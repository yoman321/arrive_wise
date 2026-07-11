"use client";

import type { StepProps } from "../types";
import OriginPicker from "@/components/OriginPicker";

export default function StepLocation({ plan, update }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Allow a one-time location check for a real, traffic-aware route — we ping
        your spot once, never track you. Prefer not to? Type an address or pick a
        rough distance instead.
      </p>
      <OriginPicker plan={plan} update={update} />
    </div>
  );
}
