"use client";

import { useEffect, useMemo, useState } from "react";
import { recommend } from "@/lib/engine";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import type { WeatherInput, WeatherKind } from "@/lib/engine/types";
import Onboarding from "@/components/onboarding/Onboarding";
import ResultPanel from "@/components/ResultPanel";
import TuneTabs from "@/components/TuneTabs";
import ScrollHint from "@/components/ScrollHint";
import {
  initialPlan,
  planToConditions,
  planToPrefs,
  planToTrip,
  type TripPlan,
} from "@/components/onboarding/types";

export default function Home() {
  const [plan, setPlan] = useState<TripPlan>(() => initialPlan());
  const [phase, setPhase] = useState<"onboarding" | "dashboard">("onboarding");
  // Within the dashboard: tune (sliders, budget, weather) vs. the results page.
  const [view, setView] = useState<"tune" | "results">("tune");
  // Live + manual weather, each scoped to the match it was resolved for so a
  // match change never shows stale conditions.
  const [liveWeather, setLiveWeather] = useState<{
    matchId: string;
    weather: WeatherInput;
  } | null>(null);
  const [manualWeather, setManualWeather] = useState<{
    matchId: string;
    weather: WeatherInput;
  } | null>(null);

  const stadium = STADIUM_BY_ID[plan.match.stadiumId];

  // Fetch live venue weather for the match date/hour (falls back silently).
  useEffect(() => {
    let cancelled = false;
    const matchId = plan.match.id;
    const hour = Number(plan.match.kickoff.split(":")[0]);
    const qs = new URLSearchParams({
      lat: String(stadium.lat),
      lng: String(stadium.lng),
      date: plan.match.date,
      hour: String(hour),
    });
    fetch(`/api/weather?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => {
        if (!cancelled && w && !w.error) {
          setLiveWeather({
            matchId,
            weather: {
              kind: w.kind,
              source: "live",
              tempC: w.tempC,
              precipMm: w.precipMm,
              windKph: w.windKph,
            },
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stadium.lat, stadium.lng, plan.match.date, plan.match.kickoff, plan.match.id]);

  const weather: WeatherInput | undefined =
    (manualWeather?.matchId === plan.match.id ? manualWeather.weather : undefined) ??
    (liveWeather?.matchId === plan.match.id ? liveWeather.weather : undefined);

  const rec = useMemo(
    () =>
      recommend(
        stadium,
        plan.match,
        planToTrip(plan),
        planToPrefs(plan),
        planToConditions(plan, weather)
      ),
    [stadium, plan, weather]
  );

  const setWeatherKind = (kind: WeatherKind) =>
    setManualWeather({ matchId: plan.match.id, weather: { kind, source: "manual" } });

  const updatePlan = (patch: Partial<TripPlan>) =>
    setPlan((p) => ({ ...p, ...patch }));

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-5 sm:px-6 sm:py-8">
      {/* Header — compact one-line bar on the dashboard (brand · plan · actions) */}
      <header className={phase === "onboarding" ? "mb-4" : "mb-5"}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-lg">
            ⚽
          </span>
          <span className="text-lg font-bold tracking-tight text-text">
            Arrive<span className="text-accent">Wise</span>
          </span>
          <span className="chip ml-2 px-2.5 py-1 text-[11px] text-muted">
            World Cup 2026
          </span>
          {phase === "dashboard" && (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                <span className="mx-1 text-faint">·</span>
                {plan.match.home} vs {plan.match.away}{" "}
                <span className="text-faint">from {plan.origin.label}</span>
              </span>
              <div className="ml-auto flex gap-2">
                {/* Mobile-only view toggle; on lg both columns show at once. */}
                {view === "results" && (
                  <button
                    onClick={() => setView("tune")}
                    className="seg-btn rounded-xl px-4 py-2 text-sm font-medium lg:hidden"
                  >
                    ← Adjust plan
                  </button>
                )}
                <button
                  onClick={() => setPhase("onboarding")}
                  className="seg-btn rounded-xl px-4 py-2 text-sm font-medium"
                >
                  ← Edit trip
                </button>
              </div>
            </>
          )}
        </div>
        {phase === "onboarding" && (
          <>
            <h1 className="mt-3 max-w-2xl text-2xl font-black leading-tight tracking-tight text-text sm:text-3xl">
              The smartest time to{" "}
              <span className="text-accent">arrive</span> at the match.
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted sm:text-sm">
              Answer a few quick questions and ArriveWise models match-day traffic,
              the crowd&apos;s arrival curve and the security-line surge to find the
              latest you can comfortably leave.
            </p>
          </>
        )}
      </header>

      {phase === "onboarding" ? (
        <Onboarding
          initial={plan}
          onComplete={(p) => {
            setPlan(p);
            setView("tune");
            setPhase("dashboard");
          }}
        />
      ) : (
        <>
          {/* First screen: two columns filling the viewport (controls | plan
              through the timeline). The venue map sits below, a scroll away. On
              mobile it's a single view-toggled column. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:min-h-[calc(100vh-5.5rem)]">
            {/* Tune column */}
            <div
              className={`min-w-0 flex-col gap-4 ${view === "results" ? "hidden lg:flex" : "flex"}`}
            >
              <TuneTabs
                plan={plan}
                update={updatePlan}
                costByMode={rec.costByMode}
                weather={weather}
                onWeather={setWeatherKind}
                stadium={stadium}
              />
              <button
                onClick={() => setView("results")}
                className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-bold text-bg transition-opacity hover:opacity-90 lg:hidden"
              >
                See my plan →
              </button>
            </div>

            {/* Results column — hero through timeline, filling the column height */}
            <div className={`min-w-0 ${view === "tune" ? "hidden lg:block" : ""}`}>
              <ResultPanel
                rec={rec}
                match={plan.match}
                prefs={planToPrefs(plan)}
                mode={plan.mode}
                weather={weather}
                variant="main"
              />
            </div>
          </div>

          {/* Venue map + specs + sensitivity — full width, below the fold */}
          <div className={`mt-5 ${view === "tune" ? "hidden lg:block" : ""}`}>
            <ResultPanel
              rec={rec}
              match={plan.match}
              prefs={planToPrefs(plan)}
              mode={plan.mode}
              weather={weather}
              variant="venue"
            />
          </div>

          <ScrollHint />
        </>
      )}

      <footer className="mt-6 border-t border-border-soft pt-4 text-xs text-faint">
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
