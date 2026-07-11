"use client";

import dynamic from "next/dynamic";
import type {
  Match,
  Preferences,
  Recommendation,
  TrafficSource,
  TravelMode,
  WeatherInput,
  WeatherKind,
} from "@/lib/engine/types";
import { fmtDuration, TARGET_LABEL } from "@/lib/engine";
import { matchTitle } from "@/lib/ui";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import Timeline from "./Timeline";
import WaitChart from "./WaitChart";

const MODE_META: Record<
  TravelMode,
  { icon: string; label: string; verb: (d: string) => string }
> = {
  drive: { icon: "🚗", label: "Drive", verb: (d) => `drive ${d} through match-day traffic` },
  transit: { icon: "🚆", label: "Transit", verb: (d) => `travel ${d} in on transit` },
  rideshare: { icon: "🚕", label: "Rideshare", verb: (d) => `ride ${d} through match-day traffic` },
};

const WEATHER_META: Record<WeatherKind, { icon: string; label: string }> = {
  clear: { icon: "☀️", label: "Clear" },
  rain: { icon: "🌧️", label: "Rain" },
  heat: { icon: "🔥", label: "Heat" },
  cold: { icon: "❄️", label: "Cold" },
  wind: { icon: "💨", label: "Wind" },
  storm: { icon: "⛈️", label: "Storm" },
};

const TRAFFIC_LABEL: Record<TrafficSource, string> = {
  live: "live traffic",
  predicted: "predicted traffic",
  routed: "real route",
  estimate: "est. distance",
  preset: "time-of-day model",
};

const MatchMap = dynamic(() => import("./MatchMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-xs text-faint">
      loading map…
    </div>
  ),
});

function Stat({
  label,
  value,
  tone = "text",
  sub,
}: {
  label: string;
  value: string;
  tone?: "text" | "accent" | "warn" | "danger" | "info";
  sub?: string;
}) {
  const color =
    tone === "accent"
      ? "text-accent"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : tone === "info"
            ? "text-info"
            : "text-text";
  return (
    <div className="rounded-xl border border-border-soft bg-bg-soft px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className={`tabular text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

export default function ResultPanel({
  rec,
  match,
  prefs,
  mode,
  weather,
  onWeather,
}: {
  rec: Recommendation;
  match: Match;
  prefs: Preferences;
  mode: TravelMode;
  weather?: WeatherInput;
  onWeather: (kind: WeatherKind) => void;
}) {
  const cushion = Math.round(rec.cushionMin);
  const late = cushion < 0;
  const targetLabel = TARGET_LABEL[prefs.target];
  const stadium = STADIUM_BY_ID[match.stadiumId];
  const driveDur = fmtDuration(rec.driveMin);
  const curWeather = weather?.kind ?? "clear";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="card fade-up overflow-hidden p-6" key={rec.leaveByClock + prefs.target}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-accent">
              Leave by
            </div>
            <div className="tabular mt-1 text-5xl font-black leading-none text-text">
              {rec.leaveByClock}
            </div>
            <div className="mt-2 text-sm text-muted">
              for {matchTitle(match)}
            </div>
          </div>
          <div
            className={`shrink-0 rounded-xl px-3 py-2 text-center ${
              late
                ? "bg-danger/15 text-danger"
                : "bg-accent/15 text-accent"
            }`}
          >
            <div className="tabular text-2xl font-bold">
              {late ? cushion : `+${cushion}`}
            </div>
            <div className="text-[11px] leading-tight opacity-80">
              min {late ? "late for" : "before"}
              <br />
              {targetLabel}
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          You&apos;ll {MODE_META[mode].verb(driveDur)}, reach the gate{" "}
          <b className="text-text">{fmtDuration(-rec.gateArrivalMin)}</b> before
          kickoff, clear security in about{" "}
          <b
            className={
              rec.securityWaitMin > 15 ? "text-warn" : "text-text"
            }
          >
            {fmtDuration(rec.securityWaitMin)}
          </b>
          , and settle into your seat at{" "}
          <b className="text-accent">{rec.timeline[3].clock}</b>.
        </p>
        <p className="mt-2 text-xs text-faint">
          Drive = free-flow × {rec.drive.surge.toFixed(2)} surge ×{" "}
          {rec.drive.baseline.toFixed(2)}{" "}
          {rec.baselineSource === "live" ? "live traffic" : "time-of-day"} ×{" "}
          {rec.drive.weather.toFixed(2)} weather
        </p>
      </div>

      {/* Conditions strip: mode · traffic provenance · interactive weather */}
      <div className="card flex flex-wrap items-center gap-2 p-4 text-xs">
        <span className="chip px-2.5 py-1 text-muted">
          {MODE_META[mode].icon} {MODE_META[mode].label}
        </span>
        <span className="chip px-2.5 py-1 text-info">
          🛣 {TRAFFIC_LABEL[rec.trafficSource]}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-faint">
            Weather
            {weather?.source === "live" && weather.tempC != null
              ? ` · ${weather.tempC}°C`
              : ""}
            :
          </span>
          {(Object.keys(WEATHER_META) as WeatherKind[]).map((k) => (
            <button
              key={k}
              onClick={() => onWeather(k)}
              data-active={curWeather === k}
              title={WEATHER_META[k].label}
              className="seg-btn rounded-lg px-2 py-1 text-sm leading-none"
            >
              {WEATHER_META[k].icon}
            </button>
          ))}
          {weather?.source === "live" && (
            <span className="chip px-2 py-0.5 text-[10px] text-accent">live</span>
          )}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Drive time"
          value={fmtDuration(rec.driveMin)}
          tone="info"
          sub={`×${rec.drive.total.toFixed(2)} vs free-flow`}
        />
        <Stat
          label="Security line"
          value={fmtDuration(rec.securityWaitMin)}
          tone={rec.securityWaitMin > 15 ? "warn" : "text"}
          sub="expected"
        />
        <Stat
          label="Seated"
          value={rec.timeline[3].clock}
          tone="accent"
          sub={`${late ? "" : "+"}${cushion}m vs ${prefs.target}`}
        />
        <Stat
          label="Still outside"
          value={rec.crowdAtKickoff.toLocaleString()}
          tone={rec.crowdAtKickoff > 5000 ? "danger" : "text"}
          sub="fans at kickoff"
        />
      </div>

      {/* Chart + timeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="card min-w-0 p-5 lg:col-span-3">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-text">
              The security-line curve
            </h3>
            <span className="text-xs text-faint">wait vs. gate arrival</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            How long you&apos;d queue depending on when you reach the gate. Your
            plan is the marked point — just ahead of the surge.
          </p>
          <WaitChart rec={rec} />
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-text">Your timeline</h3>
          <Timeline rec={rec} />
        </div>
      </div>

      {/* Venue */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="card min-w-0 overflow-hidden lg:col-span-3">
          <div className="h-56 w-full">
            <MatchMap stadium={stadium} />
          </div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-text">{stadium.name}</h3>
          <p className="text-xs text-muted">
            {stadium.city}, {stadium.country}
          </p>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Capacity</dt>
              <dd className="tabular font-medium text-text">
                {stadium.capacity.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Entry lanes</dt>
              <dd className="tabular font-medium text-text">
                {stadium.entryLanes} ·{" "}
                {Math.round(stadium.entryLanes * stadium.laneRatePerMin)}/min
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Gates open</dt>
              <dd className="tabular font-medium text-text">
                {stadium.gatesOpenLeadMin} min before KO
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Park → gate → seat</dt>
              <dd className="tabular font-medium text-text">
                {stadium.parkingSearchMin + stadium.lotToGateWalkMin}m +{" "}
                {stadium.gateToSeatWalkMin}m
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Public transit</dt>
              <dd
                className={`font-medium ${stadium.hasTransit ? "text-accent" : "text-faint"}`}
              >
                {stadium.hasTransit ? "Available" : "Limited"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Sensitivity */}
      <div className="card flex flex-wrap items-center gap-x-2 gap-y-1 p-4 text-sm">
        <span className="text-warn">⚠</span>
        <span className="text-muted">
          Leave{" "}
          <b className="text-text">{rec.sensitivity.laterByMin} min later</b> and
          your security line grows by{" "}
          <b className="text-warn">
            +{fmtDuration(rec.sensitivity.extraWaitMin)}
          </b>
          , leaving a cushion of{" "}
          <b
            className={
              rec.sensitivity.newCushionMin < 0 ? "text-danger" : "text-text"
            }
          >
            {Math.round(rec.sensitivity.newCushionMin)} min
          </b>{" "}
          for {targetLabel}.
        </span>
      </div>
    </div>
  );
}
