// Resolve drive minutes from origin to venue, degrading gracefully:
//   1. TomTom (if TOMTOM_KEY set) — real route + live/predicted traffic.
//   2. OSRM public server — real route distance, free-flow only (no live traffic).
//   3. Haversine estimate — straight-line distance × detour × assumed speed.
// Always returns a usable freeFlowDriveMin + a `trafficSource` provenance tag.
// The key never leaves the server.

import { type NextRequest } from "next/server";
import type { TrafficSource } from "@/lib/engine/types";

interface RouteResult {
  freeFlowDriveMin: number;
  liveDriveMin?: number;
  trafficSource: TrafficSource;
  distanceKm?: number;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse offline fallback: road distance ≈ 1.3× crow-flies, ~55 km/h average. */
function estimate(from: [number, number], to: [number, number]): RouteResult {
  const km = haversineKm(from, to);
  const roadKm = km * 1.3;
  const freeFlowDriveMin = Math.max(3, Math.round((roadKm / 55) * 60));
  return { freeFlowDriveMin, trafficSource: "estimate", distanceKm: roadKm };
}

async function viaTomTom(
  from: [number, number],
  to: [number, number],
  departAt: string | null,
  key: string
): Promise<RouteResult | null> {
  const loc = `${from[0]},${from[1]}:${to[0]},${to[1]}`;
  const params = new URLSearchParams({
    key,
    traffic: "true",
    travelMode: "car",
    computeTravelTimeFor: "all",
  });
  // A future departAt makes TomTom use predictive traffic for the match time.
  const future = departAt && new Date(departAt).getTime() > Date.now();
  if (future) params.set("departAt", departAt!);
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${loc}/json?${params}`;

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`tomtom ${res.status}`);
  const data = (await res.json()) as {
    routes?: Array<{
      summary: {
        travelTimeInSeconds: number;
        noTrafficTravelTimeInSeconds?: number;
        lengthInMeters: number;
      };
    }>;
  };
  const s = data.routes?.[0]?.summary;
  if (!s) return null;
  const live = s.travelTimeInSeconds / 60;
  const free = (s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds) / 60;
  return {
    freeFlowDriveMin: Math.max(3, Math.round(free)),
    liveDriveMin: Math.max(3, Math.round(live)),
    trafficSource: future ? "predicted" : "live",
    distanceKm: s.lengthInMeters / 1000,
  };
}

async function viaOsrm(
  from: [number, number],
  to: [number, number]
): Promise<RouteResult | null> {
  // OSRM expects lng,lat order.
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  const data = (await res.json()) as {
    routes?: Array<{ duration: number; distance: number }>;
  };
  const r = data.routes?.[0];
  if (!r) return null;
  return {
    freeFlowDriveMin: Math.max(3, Math.round(r.duration / 60)),
    trafficSource: "routed",
    distanceKm: r.distance / 1000,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const nums = ["fromLat", "fromLng", "toLat", "toLng"].map((k) => Number(sp.get(k)));
  if (nums.some((n) => Number.isNaN(n))) {
    return Response.json({ error: "missing/invalid coordinates" }, { status: 400 });
  }
  const from: [number, number] = [nums[0], nums[1]];
  const to: [number, number] = [nums[2], nums[3]];
  const departAt = sp.get("departAt");

  const key = process.env.TOMTOM_KEY;
  if (key) {
    try {
      const r = await viaTomTom(from, to, departAt, key);
      if (r) return Response.json(r);
    } catch {
      /* fall through to OSRM */
    }
  }
  try {
    const r = await viaOsrm(from, to);
    if (r) return Response.json(r);
  } catch {
    /* fall through to estimate */
  }
  return Response.json(estimate(from, to));
}
