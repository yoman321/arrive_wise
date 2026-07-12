"use client";

import { useEffect, useMemo, useState } from "react";
import { recommend } from "@/lib/engine";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import { MATCHES } from "@/lib/data/matches";
import { getSchedule } from "@/lib/schedule";
import type { Match, WeatherInput, WeatherKind } from "@/lib/engine/types";
import Onboarding from "@/components/onboarding/Onboarding";
import ResultPanel from "@/components/ResultPanel";
import TuneTabs from "@/components/TuneTabs";
import ScrollHint from "@/components/ScrollHint";
import ChatWidget from "@/components/chat/ChatWidget";
import {
  initialPlan,
  planToConditions,
  planToPrefs,
  planToTrip,
  type TripPlan,
} from "@/components/onboarding/types";
import { isMatchPast } from "@/lib/ui";
import { decodePlan } from "@/lib/scenario";

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
  // Onboarding schedule: live WC2026 fixtures from the perimeter feed, with the
  // hand-authored seed as the synchronous fallback so first paint always has a list.
  const [schedule, setSchedule] = useState<Match[]>(MATCHES);
  const [scheduleLive, setScheduleLive] = useState(false);

  const stadium = STADIUM_BY_ID[plan.match.stadiumId];

  // A scenario deep-link (?s=…, e.g. minted by the plan_arrival MCP tool) opens
  // straight onto the dashboard with that exact plan. Read it once on mount, then
  // strip the param so a refresh/share stays clean.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    if (!s) return;
    const decoded = decodePlan(s);
    // Strip the param up front so a refresh/share stays clean.
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.history.replaceState({}, "", url.toString());
    if (!decoded) return;
    // Apply in a microtask (not synchronously in the effect body) to match the
    // async-callback setState pattern the weather/schedule effects use.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setPlan(decoded);
      setView("tune");
      setPhase("dashboard");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull the forward-looking fixture list once (cached across mounts/reloads);
  // falls back silently to the seed.
  useEffect(() => {
    let cancelled = false;
    getSchedule().then((s) => {
      if (cancelled) return;
      setSchedule(s.matches);
      setScheduleLive(s.live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Publish the current selections so the chat + MCP tools can adjust what's on
  // screen (debounced — slider drags fire rapidly). Fire-and-forget.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [plan]);

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
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-x-clip px-4 py-5 sm:px-6 sm:py-8">
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
              <span className="hidden items-center text-sm text-muted sm:inline">
                <span className="mx-1 text-faint">·</span>
                {plan.match.home} vs {plan.match.away}{" "}
                {isMatchPast(plan.match) && (
                  <span className="chip mx-1 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium text-faint">
                    Finished
                  </span>
                )}
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
          schedule={schedule}
          scheduleLive={scheduleLive}
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

      {/* AI assistant — always-on launcher, bottom-right through any scroll. Its
          scenarios drop straight onto the dashboard via the shared plan model. */}
      <ChatWidget
        currentPlan={plan}
        onScenario={(p) => {
          setPlan(p);
          setView("tune");
          setPhase("dashboard");
        }}
      />

      <footer className="mt-auto border-t border-border-soft pt-4 text-xs text-faint">
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
