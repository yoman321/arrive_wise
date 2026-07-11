"use client";

import { useState } from "react";
import type {
  ModeCost,
  Stadium,
  WeatherInput,
  WeatherKind,
} from "@/lib/engine/types";
import type { TripPlan } from "@/components/onboarding/types";
import DashboardControls from "./DashboardControls";
import WeatherPicker from "./WeatherPicker";
import VenueFood from "./VenueFood";

const TABS = [
  { key: "trip", label: "Trip & weather", icon: "🎯" },
  { key: "budget", label: "Budget & food", icon: "💵" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Tabbed tuning panel — two views onto the same `plan`, so the controls column
 * stays short enough to fit beside the results without scrolling. Trip groups the
 * trip params with the weather selector; Budget groups the caps with the venue
 * food card. The primary card in each tab grows to fill the column height.
 */
export default function TuneTabs({
  plan,
  update,
  costByMode,
  weather,
  onWeather,
  stadium,
}: {
  plan: TripPlan;
  update: (patch: Partial<TripPlan>) => void;
  costByMode: ModeCost[];
  weather?: WeatherInput;
  onWeather: (kind: WeatherKind) => void;
  stadium: Stadium;
}) {
  const [tab, setTab] = useState<TabKey>("trip");

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-2 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-active={tab === t.key}
            className="seg-btn flex items-center justify-center gap-2 rounded-xl px-3 py-2.5"
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-xs font-medium text-text">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {tab === "trip" && (
          <>
            {/* Trip controls grow to fill; weather sits beneath */}
            <div className="min-h-0 flex-1 [&>*]:h-full">
              <DashboardControls
                plan={plan}
                update={update}
                costByMode={costByMode}
                section="trip"
              />
            </div>
            <WeatherPicker weather={weather} onWeather={onWeather} />
          </>
        )}
        {tab === "budget" && (
          <>
            {/* Budget caps up top; the venue food card grows to fill below */}
            <DashboardControls
              plan={plan}
              update={update}
              costByMode={costByMode}
              section="budget"
            />
            <div className="min-h-0 flex-1 [&>*]:h-full">
              <VenueFood stadium={stadium} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
