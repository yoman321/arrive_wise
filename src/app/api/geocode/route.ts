// Geocode a free-text address to coordinates via OpenStreetMap Nominatim (keyless).
// Server-side so we can send a proper User-Agent (Nominatim usage policy) and keep
// the client simple. Any failure returns { error } and the UI keeps the presets.

import { type NextRequest } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "ArriveWise/1.0 (United Hacks V7 demo; +https://github.com/arrivewise)";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "missing query" }, { status: 400 });
  }

  try {
    // WC2026 venues are all in the US, Canada, and Mexico — bias the geocoder to
    // those so an ambiguous query resolves to a host country, not a namesake abroad.
    const url = `${NOMINATIM}?format=jsonv2&limit=1&addressdetails=0&countrycodes=us,ca,mx&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      // Nominatim asks callers not to hammer it; a short cache is polite.
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!rows.length) {
      return Response.json({ error: "no match" }, { status: 404 });
    }
    const r = rows[0];
    // Trim the (often very long) display name to something label-sized.
    const label = r.display_name.split(",").slice(0, 3).join(", ");
    return Response.json({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "geocode failed" },
      { status: 502 }
    );
  }
}
