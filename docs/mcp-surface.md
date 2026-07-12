# MCP surface — capability map

Everything ArriveWise can do, catalogued as the raw material for an MCP server.
Two layers, mirroring the project's core architecture rule ("algorithm at the
core, data/LLM at the perimeter"):

- **A. Perimeter HTTP routes** — live data with deterministic fallbacks. Already
  network-shaped (fetch in, JSON out). Each is keyless except optional `TOMTOM_KEY`.
- **B. Engine (pure TS)** — the deterministic recommendation core + supporting
  math. No network, no side effects. This is the flagship capability.
- **C. Static data** — the catalogs an MCP client needs to form valid inputs.

`Match`, `Stadium`, `Recommendation`, etc. are defined in `src/lib/engine/types.ts`.

---

## A. Perimeter HTTP routes (`src/app/api/*`)

| Route | Method | Inputs (query) | Output (success) | Fallback behavior |
|---|---|---|---|---|
| `/api/geocode` | GET | `q` (free-text address) | `{ lat, lng, label }` | `{ error }` (400/404/502); UI keeps presets |
| `/api/route` | GET | `fromLat, fromLng, toLat, toLng, departAt?` | `{ freeFlowDriveMin, liveDriveMin?, trafficSource, distanceKm? }` | TomTom → OSRM → haversine `estimate`; always returns a number |
| `/api/weather` | GET | `lat, lng, date` (YYYY-MM-DD), `hour?` | `{ kind, source:"live", tempC, precipMm, windKph }` | `{ error }` (400/502); UI falls back to manual weather |
| `/api/venue-food` | GET | `stadiumId` | `{ source:"overpass", outlets:[{name,category}] }` | `{ source:"fallback", outlets }` (typical list) |
| `/api/matches` | GET | *(none)* | `{ source:"live", count, matches:Match[] }` | `{ source:"fallback", matches:MATCHES, error }` |

Provenance tags surfaced to callers:
- `trafficSource`: `live | predicted | routed | estimate | preset`
- `weather.source`: `live | manual`; `matches.source` / `venue-food.source`: `live|overpass` vs `fallback`

Upstream sources (all keyless unless noted):
- geocode → **Nominatim** (OpenStreetMap)
- route → **TomTom** (`TOMTOM_KEY`, optional, server-only) → **OSRM** → haversine
- weather → **Open-Meteo** (forecast API; historical archive for dates < −5 days)
- venue-food → **Overpass** (3 mirrors, then hand-authored fallback)
- matches → **TheSportsDB** (free tier, knockout rounds) → seed `MATCHES`

---

## B. Engine — pure deterministic core (`src/lib/engine/*`)

### The flagship

```
recommend(stadium, match, trip, prefs, conditions?) → Recommendation
```
`src/lib/engine/index.ts`. Turns a fully-specified trip into a display-ready plan:
`leaveByClock`, `gateArrivalMin`, `securityWaitMin`, `seatedMin`, `cushionMin`,
`timeline[]`, `curve[]` (full sweep for charts), `sensitivity` ("leave 20 min
later"), `crowdAtKickoff`, `drive` breakdown (surge×baseline×weather), `cost` +
`costByMode`. Deterministic — same inputs, same output, no fetch.

Inputs:
- `stadium: Stadium` — from `STADIUM_BY_ID`
- `match: Match` — from schedule / `MATCH_BY_ID`
- `trip: TripInput` — `{ freeFlowDriveMin, originLabel, originLat?, originLng?, liveDriveMin?, trafficSource?, mode?, roundTrip? }`
- `prefs: Preferences` — `{ target: "warmups"|"anthems"|"kickoff", chill: 0..1 }`
- `conditions?: Conditions` — `{ baselineTraffic, weather, extras:{concessionsMin,partyBufferMin} }` (defaults to `DEFAULT_CONDITIONS`)

### Supporting engine functions (re-exportable as finer tools)

| Function | Module | Purpose |
|---|---|---|
| `optimize(stadium, match, trip, prefs, conditions)` | `optimizer.ts` | The search that `recommend` wraps; returns `{best, curve, queue, seatedOpts}` |
| `estimateCostByMode(trip, stadium, match, conditions, gateArrivalMin)` | `money.ts` | Per-mode one-way cost (`ModeCost[]`) |
| `estimateFoodCost(...)` | `money.ts` | Food-spend line |
| `foodBasketFor(stadium)` / `foodRatePerMin` / `foodTierFor` | `money.ts` | Per-venue concession basket + rate |
| `travelForGateArrival(...)` | `travel.ts` | Back-solve departure from a target gate arrival |
| `offsetToClock`, `fmtDuration`, `parseClock` | `time.ts` | Clock/duration formatting |

### Model constants (read-only context an MCP could expose)

`curves.ts`: `ATTENDANCE_FRACTION`, `ROUND_SURGE_WEIGHT`, `TARGET_OFFSET_MIN`,
`WEATHER_EFFECTS`, `MODE_PHYSICS`, arrival-curve params. These are the
"why the number is the number" — useful for an explain/inspect tool.

---

## C. Static data (catalogs for valid inputs)

| Export | File | Shape |
|---|---|---|
| `STADIUMS` / `STADIUM_BY_ID` | `data/stadiums.ts` | 16 WC2026 host `Stadium`s (id, name, city, country, lat/lng, ops params) |
| `MATCHES` / `MATCH_BY_ID` | `data/matches.ts` | Seed fixture slice (fallback for `/api/matches`) |
| `KNOCKOUT_SCHEDULE` | `data/matches.ts` | Fixed remaining knockout slots (venue+date known, teams TBD) |
| `ORIGIN_PRESETS` | `data/origins.ts` | 4 canned origins (`freeFlowDriveMin` 10/25/45/75) |

Stadium ids: `metlife, att, sofi, levis, lumen, arrowhead, nrg, mercedes,
hardrock, gillette, linc, bmo, bcplace, azteca, akron, bbva`.

---

## Proposed MCP tool set (derived from the above)

A natural, minimal tool surface — one flagship + the perimeter + catalogs:

1. **`plan_arrival`** — flagship. Wraps `recommend`. Accepts a stadium id + match
   (id or inline) + origin (preset id, coords, or address to geocode) + prefs +
   optional conditions → full `Recommendation`. Can internally call the perimeter
   routes (route/weather) to enrich, or accept them pre-supplied.
2. **`list_stadiums`** — `STADIUMS` (catalog).
3. **`list_matches`** — live schedule via `/api/matches` (seed fallback).
4. **`geocode_address`** — `/api/geocode`.
5. **`get_drive_time`** — `/api/route`.
6. **`get_venue_weather`** — `/api/weather`.
7. **`get_venue_food`** — `/api/venue-food`.

`plan_arrival` is the only one that *must* stay deterministic; 3–7 are thin
perimeter passthroughs that already carry their own fallbacks.
