<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ArriveWise — project rules

ArriveWise tells a fan the smartest time to leave home for a big event: as late as
comfortably possible while beating the security-line surge and still catching the
moment they care about (warmups / anthems / kickoff). Built for **United Hacks V7**,
showcased on **FIFA World Cup 2026** / its 16 host stadiums — but the engine is
event-agnostic. `SUMMARY.md` holds the full context, current status and roadmap;
read it for the "why" and what's next. This file is the always-on rule set.

## Architecture (respect these)

- **Algorithm at the core, data/LLM at the perimeter.** The recommendation engine
  (`src/lib/engine/`, pure client-side TypeScript) is **deterministic and never
  fetches**. Live data — geocode, routing, weather, and any future LLM — enters
  *only* through thin Next.js route handlers in `src/app/api/*`, and **each source
  has a deterministic fallback** so the demo never depends on a key, permission, or
  network.
- **One shared parameter model.** `TripPlan` → `planToConditions()` → `recommend()`.
  The dashboard sliders, onboarding wizard and chat are all just *views* onto the
  same params — **model a parameter in the engine before adding UI for it** (a
  cosmetic control that changes no number is the anti-pattern to avoid).
- **No paid dependency required.** Nominatim (geocode), OSRM (routing) and
  Open-Meteo (weather) are keyless. `TOMTOM_KEY` is the *only* key, is **optional**
  (live/predicted traffic), server-side only, and is never exposed to the browser.
- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4. Charts: **Recharts**.
  Map: **Leaflet + OpenStreetMap** (keyless). Theme: committed **dark**
  (`src/app/globals.css`). Static data is hand-authored in `src/lib/data/`.

## File map (where everything is)

```
src/
  app/
    page.tsx           # orchestrator: onboarding <-> dashboard (tune | results views); fetches live weather
    api/
      geocode/route.ts # Nominatim proxy (address -> coords)
      route/route.ts   # drive time: TomTom -> OSRM -> haversine estimate
      weather/route.ts # Open-Meteo venue forecast -> WeatherKind
      venue-food/route.ts # OSM Overpass (mirrors) -> outlets near venue; typical-list fallback
      matches/route.ts # TheSportsDB knockout rounds -> upcoming WC2026 fixtures; seed fallback
      parse/route.ts   # LLM perimeter: free text -> PlanArrivalInput (Featherless; keyword fallback). FEATHERLESS_API server-side only
      chat/route.ts    # in-app assistant: Featherless conversation -> PLAN: line -> buildScenario; reads current-selections context; returns reply + TripPlan
      context/route.ts # GET/POST the dashboard's current selections (lib/mcp/context store) — the bridge the chat + MCP tools adjust
      [transport]/route.ts # MCP server (Streamable HTTP) at /api/mcp: plan_arrival, plan_from_text (useCurrentSelections), get_current_plan, list_stadiums, list_matches
    layout.tsx globals.css
  components/
    chat/ChatWidget.tsx # always-on bottom-right launcher + chat panel; lifts built scenarios onto the dashboard (view onto TripPlan)
    onboarding/
      Onboarding.tsx   # lean 4-step wizard shell (progress, Back/Next, validation)
      types.ts         # TripPlan + planTo{Trip,Prefs,Conditions} engine bridge  <-- read
      steps/*.tsx      # StepEvent | StepLocation | StepTravel | StepStyle (target defaults; chill = 3 presets, fine-tuned on dashboard)
    ResultPanel.tsx    # results: variant "main" (hero…timeline, fills the fold) | "venue" (map+specs+sensitivity, below fold) | "full"
    TuneTabs.tsx       # 2-tab tune column ("Trip & weather" | "Budget & food") — fills column height, one tab at a time
    DashboardControls.tsx # "Fine-tune" card; section prop = "trip" | "budget" | "all" (split for the tabs)
    WeatherPicker.tsx  # match-day weather selector (in Trip tab); exports WEATHER_META
    VenueFood.tsx      # live venue outlets (Overpass, module-cached) + per-venue concession price basket (Budget tab)
    ScrollHint.tsx     # click-to-scroll pill, fades in after 5s only when the page overflows below the fold
    WaitChart.tsx Timeline.tsx MatchMap.tsx
  lib/
    engine/            # THE ALGORITHM (pure TS) — see SUMMARY.md §5
      index.ts         #   recommend(stadium, match, trip, prefs, conditions?)  <-- read first
      curves.ts        #   constants: arrival/surge/diurnal curves, WEATHER_EFFECTS, parkingSurge, MODE_PHYSICS
      queue.ts         #   crowd + fluid security-queue model (the heart)
      travel.ts        #   per-mode travel physics; back-solve departure from gate arrival
      money.ts         #   deterministic per-mode cost (parking/gas, rideshare surge, transit fare, food, round-trip); per-venue concession basket (region items x foodTier) drives foodRatePerMin
      cost.ts optimizer.ts time.ts helpers.ts types.ts
    mcp/
      planner.ts       # buildScenario(): self-enriching pipeline (resolve fixture -> geocode -> route -> weather -> recommend) + venue/match resolvers
      extract.ts       # coerceIntent (whitelist any object) + keywordIntent (deterministic NL fallback for /api/parse)
      context.ts       # in-memory "current selections" slot (get/setContextPlan) — dashboard publishes, chat + MCP read/adjust
      planner.ts (also mergeInput/baseFromPlan) # adjustment merge: apply a delta onto the current plan, honoring what a change invalidates
    scenario.ts        # encodePlan/decodePlan — a TripPlan <-> `?s=` deep-link (MCP mints, page.tsx hydrates)
    data/
      stadiums.ts matches.ts origins.ts
scripts/sanity.ts      # engine assertions incl. conditions layer (npm run sanity)
.env.example           # optional TOMTOM_KEY + FEATHERLESS_API/FEATHERLESS_MODEL (app runs without any)
README.md  docs/SUBMISSION.md  docs/screenshot.png
```

## Always verify before claiming done

```bash
npm run sanity     # engine assertions (headless, no UI)
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # what Vercel runs — must pass (but see the caveat below)
```

- **Don't run `npm run build` while the dev server is live.** A production build
  writes into the same `.next/` the running dev server serves from, rotating chunk
  hashes out from under any open browser tab → `Failed to load chunk …` in the UI.
  While iterating, verify with **`sanity` / `typecheck` / `lint` only**; leave the
  dev server running. Run `npm run build` as a *separate, final* gate — with the dev
  server stopped (and `rm -rf .next` first if a tab was mid-session).

## Gotchas (don't repeat)

- **Screenshots lie:** the CLI `chrome --headless --screenshot` shows false
  horizontal clipping on tall pages. Use **puppeteer-core against the installed
  Chrome**, and measure `document.documentElement.scrollWidth` for real overflow.
  From the scratchpad, `puppeteer-core` won't resolve by bare name — import the
  absolute path `…/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`;
  grant geolocation via `context.overridePermissions` + `page.setGeolocation`.
- **Mobile overflow:** grids need an explicit **`grid-cols-1`** at the base (a track
  with no `grid-cols-*` sizes to `max-content` and won't shrink); Recharts
  containers need **`min-w-0`** on the flex/grid parent. The root container uses
  **`overflow-x-clip`** (not `-hidden`, which breaks the sticky sidebar).
- **Next 16 route handlers** are dynamic by default; read query via
  `request.nextUrl.searchParams` (typed `NextRequest`), return with `Response.json`.
- **ESLint:** don't name callbacks `use*` (react-hooks treats them as hooks →
  `rules-of-hooks`); don't call `setState` synchronously at the top of a `useEffect`
  (`set-state-in-effect`) — scope state by an id and derive instead.
- **Leaflet** dark tiles via a CSS `filter` need `!important` (`globals.css`).
