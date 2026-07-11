// Real food/retail outlets at or around a venue, from OpenStreetMap via the
// keyless Overpass API. Follows the same perimeter pattern as geocode/route/
// weather: a live source with a deterministic fallback so the demo never depends
// on the network. Overpass returns *names & categories* (it doesn't carry prices);
// the price basket is authored in the engine (see money.ts) and joined in the UI.

import { type NextRequest } from "next/server";
import { STADIUM_BY_ID } from "@/lib/data/stadiums";
import type { Stadium, VenueOutlet } from "@/lib/engine/types";

// Several keyless Overpass mirrors — tried in order until one answers with JSON
// (the canonical host is often overloaded and returns an HTML error page). Any
// total failure lands on the hand-authored fallback below.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const RADIUS_M = 800; // covers the bowl + the immediate approach (stadiums are big)

/** Typical outlets shown when Overpass is unreachable — categories, not fake names. */
function fallbackOutlets(stadium: Stadium): VenueOutlet[] {
  if (stadium.country === "Mexico") {
    return [
      { name: "Cervecería", category: "Bar" },
      { name: "Antojitos & Tacos", category: "Food stand" },
      { name: "Nachos & Snacks", category: "Snacks" },
      { name: "Refrescos & Agua", category: "Drinks" },
      { name: "Tienda del Equipo", category: "Team store" },
    ];
  }
  return [
    { name: "Concession Stand", category: "Food stand" },
    { name: "Craft Beer Bar", category: "Bar" },
    { name: "Grill & BBQ", category: "Food stand" },
    { name: "Snacks & Pretzels", category: "Snacks" },
    { name: "Team Store", category: "Team store" },
    { name: "Coffee Cart", category: "Café" },
  ];
}

/** Map an OSM tag set to a human category, or null to skip the element. */
function categorize(tags: Record<string, string>): string | null {
  const a = tags.amenity;
  if (a === "restaurant")
    return tags.cuisine ? `Restaurant · ${tags.cuisine.split(";")[0]}` : "Restaurant";
  if (a === "fast_food") return "Fast food";
  if (a === "bar" || a === "pub") return "Bar";
  if (a === "cafe") return "Café";
  if (a === "food_court") return "Food court";
  if (a === "ice_cream") return "Ice cream";
  const s = tags.shop;
  if (s === "gift" || s === "sports") return "Team store";
  if (s === "convenience" || s === "kiosk") return "Kiosk";
  return null;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("stadiumId") ?? "";
  const stadium = STADIUM_BY_ID[id];
  if (!stadium) {
    return Response.json({ error: "unknown stadium" }, { status: 400 });
  }

  const query = `[out:json][timeout:15];
(
  nwr["amenity"~"^(restaurant|fast_food|bar|pub|cafe|food_court|ice_cream)$"](around:${RADIUS_M},${stadium.lat},${stadium.lng});
  nwr["shop"~"^(gift|sports|convenience|kiosk)$"](around:${RADIUS_M},${stadium.lat},${stadium.lng});
);
out center tags 80;`;

  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 86400 }, // venue outlets change slowly
      });
      if (!res.ok) continue;
      // A busy Overpass returns an HTML error page with 200 — JSON parse throws.
      const data = (await res.json()) as {
        elements?: { tags?: Record<string, string> }[];
      };

      const seen = new Set<string>();
      const outlets: VenueOutlet[] = [];
      for (const el of data.elements ?? []) {
        const tags = el.tags;
        const name = tags?.name?.trim();
        if (!tags || !name) continue;
        const category = categorize(tags);
        if (!category) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        outlets.push({ name, category });
        if (outlets.length >= 24) break;
      }

      if (!outlets.length) continue; // this mirror had no coverage — try next
      outlets.sort((a, b) => a.category.localeCompare(b.category));
      return Response.json({ source: "overpass", outlets });
    } catch {
      // timeout, network error, or HTML error page — fall through to next mirror
    }
  }

  return Response.json({ source: "fallback", outlets: fallbackOutlets(stadium) });
}
