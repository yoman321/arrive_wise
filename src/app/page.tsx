"use client";

import { useMemo, useState } from "react";
import type { Match, Preferences } from "@/lib/engine/types";
import { recommend } from "@/lib/engine";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import { MATCHES } from "@/lib/data/matches";
import Controls from "@/components/Controls";
import ResultPanel from "@/components/ResultPanel";

export default function Home() {
  const [match, setMatch] = useState<Match>(MATCHES[0]);
  const [driveMin, setDriveMin] = useState<number>(45);
  const [prefs, setPrefs] = useState<Preferences>({
    target: "kickoff",
    chill: 0.5,
  });

  const stadium = STADIUM_BY_ID[match.stadiumId];

  const rec = useMemo(
    () =>
      recommend(
        stadium,
        match,
        { freeFlowDriveMin: driveMin, originLabel: `${driveMin} min away` },
        prefs
      ),
    [stadium, match, driveMin, prefs]
  );

  return (
    <div className="mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-lg">
            ⚽
          </span>
          <span className="text-lg font-bold tracking-tight text-text">
            Arrive<span className="text-accent">Wise</span>
          </span>
          <span className="chip ml-2 px-2.5 py-1 text-[11px] text-muted">
            World Cup 2026
          </span>
        </div>
        <h1 className="mt-6 max-w-2xl text-3xl font-black leading-tight tracking-tight text-text sm:text-4xl">
          The smartest time to{" "}
          <span className="text-accent">arrive</span> at the match.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          ArriveWise models match-day traffic, the crowd&apos;s arrival curve and
          the security-line surge, then finds the latest you can comfortably
          leave — so you skip the queue and still catch the moment you care
          about.
        </p>
      </header>

      {/* App */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="card h-fit p-6 lg:sticky lg:top-8">
          <Controls
            match={match}
            onMatch={setMatch}
            driveMin={driveMin}
            onDrive={setDriveMin}
            prefs={prefs}
            onPrefs={setPrefs}
          />
        </aside>

        <main className="min-w-0">
          <ResultPanel rec={rec} match={match} prefs={prefs} />
        </main>
      </div>

      <footer className="mt-12 border-t border-border-soft pt-6 text-xs text-faint">
        <p>
          ArriveWise is a mechanistic model built for United Hacks V7. Arrival
          curves, turnstile throughput and traffic surge are transparent,
          research-informed parameters — not per-match ground truth.
          Event-agnostic engine, showcased on the FIFA World Cup 2026.
        </p>
      </footer>
    </div>
  );
}
