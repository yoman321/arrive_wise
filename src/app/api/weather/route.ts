// Live weather for a venue + match date/hour via Open-Meteo (keyless, CORS-open).
// Maps temperature/precip/wind into the coarse WeatherKind the engine uses. Any
// failure returns { error } and the UI falls back to a manual selector.

import { type NextRequest } from "next/server";
import type { WeatherKind } from "@/lib/engine/types";

function classify(tempC: number, precipMm: number, windKph: number): WeatherKind {
  if (precipMm >= 4) return "storm";
  if (precipMm >= 0.3) return "rain";
  if (windKph >= 35) return "wind";
  if (tempC >= 32) return "heat";
  if (tempC <= 3) return "cold";
  return "clear";
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const date = sp.get("date"); // YYYY-MM-DD
  const hour = Number(sp.get("hour") ?? "15");
  if (Number.isNaN(lat) || Number.isNaN(lng) || !date) {
    return Response.json({ error: "missing params" }, { status: 400 });
  }

  // Recent/future dates come from the forecast API (covers ~ -5 to +16 days);
  // older dates use the historical archive.
  const daysAway = (new Date(date + "T00:00:00").getTime() - Date.now()) / 86400000;
  const base =
    daysAway < -5
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "temperature_2m,precipitation,wind_speed_10m",
    start_date: date,
    end_date: date,
    timezone: "auto",
  });

  try {
    const res = await fetch(`${base}?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = (await res.json()) as {
      hourly?: {
        time: string[];
        temperature_2m: number[];
        precipitation: number[];
        wind_speed_10m: number[];
      };
    };
    const h = data.hourly;
    if (!h?.time?.length) throw new Error("no hourly data");

    const target = `${date}T${String(hour).padStart(2, "0")}:00`;
    let idx = h.time.indexOf(target);
    if (idx < 0) idx = Math.min(hour, h.time.length - 1); // nearest-ish fallback

    const tempC = h.temperature_2m[idx];
    const precipMm = h.precipitation[idx] ?? 0;
    const windKph = h.wind_speed_10m[idx] ?? 0;

    return Response.json({
      kind: classify(tempC, precipMm, windKph),
      source: "live",
      tempC: Math.round(tempC),
      precipMm: Math.round(precipMm * 10) / 10,
      windKph: Math.round(windKph),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "weather failed" },
      { status: 502 }
    );
  }
}
