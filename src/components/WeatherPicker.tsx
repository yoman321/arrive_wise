"use client";

import type { WeatherInput, WeatherKind } from "@/lib/engine/types";

export const WEATHER_META: Record<WeatherKind, { icon: string; label: string }> = {
  clear: { icon: "☀️", label: "Clear" },
  rain: { icon: "🌧️", label: "Rain" },
  heat: { icon: "🔥", label: "Heat" },
  cold: { icon: "❄️", label: "Cold" },
  wind: { icon: "💨", label: "Wind" },
  storm: { icon: "⛈️", label: "Storm" },
};

/**
 * Match-day weather selection — lives on the tuning page. Auto-filled from the
 * live venue forecast; the fan can override to see how conditions move the drive,
 * the security line and comfort. Sets manual weather at the page level.
 */
export default function WeatherPicker({
  weather,
  onWeather,
}: {
  weather?: WeatherInput;
  onWeather: (kind: WeatherKind) => void;
}) {
  const cur = weather?.kind ?? "clear";
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Match-day weather</h3>
        {weather?.source === "live" ? (
          <span className="chip px-2 py-0.5 text-[11px] text-accent">
            live{weather.tempC != null ? ` · ${weather.tempC}°C` : ""}
          </span>
        ) : (
          <span className="text-xs text-faint">tap to override</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(Object.keys(WEATHER_META) as WeatherKind[]).map((k) => (
          <button
            key={k}
            onClick={() => onWeather(k)}
            data-active={cur === k}
            title={WEATHER_META[k].label}
            className="seg-btn flex flex-col items-center gap-1 rounded-xl px-2 py-2.5"
          >
            <span className="text-lg leading-none">{WEATHER_META[k].icon}</span>
            <span className="text-[11px] font-medium text-text">
              {WEATHER_META[k].label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-faint">
        Auto-filled from the live forecast for kickoff — override to see how rain,
        heat or wind moves the drive, the security line and your comfort.
      </p>
    </div>
  );
}
