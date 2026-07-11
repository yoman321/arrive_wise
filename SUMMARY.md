# ArriveWise — Context Primer (paste this to re-prompt an AI)

> **How to use this doc:** paste it at the start of a new conversation, then add your
> ask at the bottom. It gives an AI agent everything it needs to continue without
> re-deriving the project. Keep it updated as things change.

---

## 1. One-liner

**ArriveWise tells a fan the smartest time to leave home for a big event** — as late
as comfortably possible while beating the security-line surge and still catching the
moment they care about (warmups / anthems / kickoff). Built for **United Hacks V7**
(sport theme, submissions due **Sun Jul 12, 12:00pm EST**). Showcased on **FIFA
World Cup 2026** / its 16 host stadiums; the engine is event-agnostic.

**Current status:** **onboarding-first** — a 5-step wizard (event → live location →
seat-by → travel → style) reveals the dashboard of recommendations. A live-data
**perimeter** (geolocation + routing + weather via API routes) now sits over the
deterministic engine, each source with a keyless fallback. Runs locally;
`sanity` / `typecheck` / `lint` green. The only optional key is `TOMTOM_KEY` (live/
predicted traffic); without it routing uses keyless OSRM → estimate. Deferred
follow-ups: transit/rideshare *physics*, concessions, roof-aware weather effects.

## 2. Environment & how to run

- Project root: `/Users/luoph/Desktop/arrive_wise` · macOS · zsh · Node 25
- Git repo exists on branch `main`; **changes are uncommitted**. No GitHub remote yet.
```bash
npm install
npm run dev        # http://localhost:3000
npm run sanity     # engine self-checks (headless, no UI)
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # must pass — this is what Vercel runs
```
- Optional: `cp .env.example .env.local` and set `TOMTOM_KEY` for live/predicted
  traffic. Runs fully without it (OSRM → estimate fallback). Geolocation needs a
  secure context — `localhost` is fine.

## 3. Stack & hard constraints (respect these)

- **Next.js 16 (App Router) + TypeScript + Tailwind v4.**
- **No paid dependency required.** Nominatim (geocode), OSRM (routing) and
  Open-Meteo (weather) are keyless; `TOMTOM_KEY` is the only key and is **optional**
  (live/predicted traffic), server-side only, never exposed to the browser.
- **Engine core is client-side + deterministic.** Live data enters only through thin
  server **route handlers** (`src/app/api/*`), each with a deterministic fallback so
  the demo never depends on a key/permission/network.
- **Keep the core an algorithm, not an LLM** — data/LLMs are perimeter-only (§7).
- Charts: **Recharts**. Map: **Leaflet + OpenStreetMap** (no key). Theme: committed
  **dark** "stadium at night" (`src/app/globals.css`).
- Static data only, hand-authored (see §6 provenance caveat).

## 4. File map (where everything is)

```
src/
  app/
    page.tsx           # orchestrator: onboarding <-> dashboard; fetches live weather
    api/
      geocode/route.ts # Nominatim proxy (address -> coords)
      route/route.ts   # drive time: TomTom -> OSRM -> haversine estimate
      weather/route.ts # Open-Meteo venue forecast -> WeatherKind
    layout.tsx globals.css
  components/
    onboarding/
      Onboarding.tsx   # 5-step wizard shell (progress, Back/Next, validation)
      types.ts         # TripPlan + planTo{Trip,Prefs,Conditions} engine bridge  <-- read
      steps/*.tsx      # StepEvent | StepLocation | StepTarget | StepTravel | StepStyle
    ResultPanel.tsx    # hero, conditions strip (mode·traffic·weather), stats, chart/map/timeline
    WaitChart.tsx Timeline.tsx MatchMap.tsx
  lib/
    engine/            # THE ALGORITHM (pure TS) — see §5
      index.ts         #   recommend(stadium, match, trip, prefs, conditions?)  <-- read first
      curves.ts        #   constants: arrival curve, surge, diurnalTrafficMultiplier, WEATHER_DRIVE_MULT
      queue.ts         #   crowd + fluid security-queue model (the heart)
      travel.ts        #   drive = free-flow x surge x baseline x weather; back-solve departure
      cost.ts optimizer.ts time.ts helpers.ts types.ts
    data/
      stadiums.ts matches.ts origins.ts
scripts/sanity.ts      # engine assertions incl. conditions layer (npm run sanity)
.env.example           # optional TOMTOM_KEY (app runs without it)
README.md  docs/SUBMISSION.md  docs/screenshot.png
```

## 5. How the algorithm works (4 steps)

`recommend(stadium, match, trip, prefs, conditions?)` in `engine/index.ts`:
1. **Crowd + security** (`queue.ts`): attendance (capacity × round turnout) + a
   crowd-arrival curve peaking ~30 min pre-kickoff → **deterministic fluid queue**
   → expected security wait for any arrival minute.
2. **Traffic** (`travel.ts`): free-flow drive × **surge × baseline × weather** (surge
   worse near kickoff/bigger matches; baseline = time-of-day curve or a live/predicted
   ratio; weather = precip/wind) + parking + walk → back-solve departure. Breakdown
   surfaced on the `Recommendation`.
3. **Cost** (`cost.ts`): line-wait + wasted-early-time + missed-moment risk,
   reweighted by the chill slider.
4. **Optimize** (`optimizer.ts`): sweep every arrival minute, take lowest cost,
   back-solve the "leave by" clock time + timeline + sensitivity.

**Inputs accounted for:** venue (capacity, lanes, throughput, gate-open lead,
parking/walk) · match (kickoff, round) · you (real origin via geolocation/geocoding,
target moment, travel mode, chill) · **live conditions** (live/predicted traffic,
time-of-day baseline, live weather). **Now modeled (this build):** weather, live
traffic, time-of-day baseline traffic. **Still pending:** transit/rideshare
*physics* (mode is captured but modeled as car), concessions, roof-aware weather
(throughput/walk effects).

## 6. Data provenance (important, honest)

**Static, hand-authored** (not scraped): stadium capacities/coordinates
(**approximate — spot-check before demoing**), operational params (lanes,
throughput, walk times — transparent estimates in literature-backed ranges), and
illustrative knockout matchups. Surge/arrival/time-of-day *shapes* are
research-informed parameters.

**Live, fetched at the perimeter** (real, with fallbacks): **weather** = Open-Meteo
venue forecast for the match date/hour (keyless; manual selector fallback);
**routing** = a real route to the venue (TomTom live/predicted traffic **if a key is
set**, else OSRM real route *free-flow only*, else a distance estimate — the badge
says which); **origin** = your actual coordinates via Geolocation/Nominatim. Travel
mode and roof types are transparent inputs. The *recommendation* is computed live,
never stored.

## 7. Proposed next feature — Groq LLM layer (discussed, NOT built)

Principle: **LLM at the perimeter, algorithm at the core.** Good LLM jobs here:
- **Infer parameters for ANY venue you type** (event-agnostic for real).
- **Read free-text real-world context** ("extra security announced", "rail closure")
  into model adjustments.
- **Parse free-text preferences** ("2 kids, want food, hate crowds") → knobs.
- **Explain the plan / answer what-ifs** in natural language.
Architecture: **Next.js API route** calling **Groq** (OpenAI-compatible, fast, free
tier) server-side, key in env var; **keep the 16 presets as fallback** so the demo
never depends on the key. Needs a free key from `console.groq.com`.

_Already built since this was written:_ the perimeter-data pattern (API route +
keyless source + deterministic fallback) now exists for **geocoding (Nominatim),
routing (TomTom/OSRM) and weather (Open-Meteo)** — the Groq layer would slot in the
same way. `src/app/api/*` are the reference implementations.

## 8. Gotchas already learned (don't repeat)

- **The CLI `chrome --headless --screenshot` lies** on tall pages (shows false
  horizontal clipping). Use **puppeteer-core against the installed Chrome** to
  screenshot AND to measure `document.documentElement.scrollWidth` for real overflow.
- Mobile grids need explicit **`grid-cols-1`** (base) — a grid track with no
  `grid-cols-*` sizes to `max-content` and won't shrink, causing overflow. Recharts
  containers also need **`min-w-0`** on the flex/grid parent.
- Root container uses **`overflow-x-clip`** (not `-hidden`, which breaks the sticky
  sidebar).
- Leaflet dark tiles via a CSS `filter` need **`!important`** (`globals.css`).
- **Next 16 route handlers** are dynamic by default; read query via
  `request.nextUrl.searchParams` (typed `NextRequest`), return with `Response.json`.
- **ESLint gotchas:** don't name callbacks `use*` (react-hooks treats them as hooks →
  `rules-of-hooks`); don't call `setState` synchronously at the top of a `useEffect`
  (`set-state-in-effect`) — scope state by an id and derive instead.
- From the scratchpad, `puppeteer-core` won't resolve by bare name — import the
  absolute path `…/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`.
  Grant geolocation via `context.overridePermissions` + `page.setGeolocation`.

## 9. Open action items

1. Commit + push to GitHub; deploy to Vercel (import repo; add the optional
   `TOMTOM_KEY` env var there for live traffic — everything else is keyless).
2. Record demo video (`docs/SUBMISSION.md` storyboard) — lead with the geolocation
   → live route + live weather, then the plan.
3. Deferred model work (see §5 "still pending"): transit/rideshare *physics*,
   concessions, roof-aware weather (throughput/walk effects).
4. Optional: Groq type-any-venue (§7) · verify/replace real stadium data (§6).

---

## 10. Your ask

**Build the conversational "Ask ArriveWise" assistant — see §11 for the approved plan.**

---

## 11. Approved next build — Conversational "Ask ArriveWise" assistant

A **chat panel on the dashboard**: describe what you want in plain language
("we're grabbing food, got 2 kids, and hate crowds") and it **reconfigures +
re-renders the dashboard** — no manual control-fiddling. The concrete realization
of the §7 "LLM at the perimeter" idea. **In-app only** (demo-scoped; not a
shareable external MCP server).

**Two hard rules:**
1. **Engine is the only source of numbers.** The LLM extracts *intent* → a JSON
   "patch" + conversational prose; it never emits clock times. After a patch the
   deterministic engine recomputes and the dashboard shows the truth.
2. **Structured JSON, not native tool-calling** (open models' function-calling is
   inconsistent) — the model returns a strict JSON object, validated server-side.

```
Chat panel ──POST {messages, plan}──▶ /api/chat ──▶ Featherless (OpenAI-compat)
     ▲                                    │  (or keyless keyword parser if no key)
     │ apply patch (setPlan/weather)      ├─ resolve originQuery via geocode+route
     └────── {patch, reply, summary} ◀────┴─ run recommend() for authoritative numbers
```

**Part A — Engine: concessions + party buffer** (so free-text actually moves the
plan). Extend `Conditions` with `extras: { concessionsMin, partyBufferMin }`
(default 0); add both to `seatedMin` in `optimizer.seatedFor` + `helpers.seatedForExport`
(these *do* shift the optimal gate-arrival earlier — they enter cost via `seatedMin`);
insert a `"concessions"` timeline step in `index.ts` + a `DOT` color in `Timeline.tsx`;
`TripPlan`/`planToConditions` carry them.

**Part B — `/api/chat` route** (POST, server-side, key never reaches browser).
System prompt = enumerated `MATCHES` + current plan + a **tool contract**:
`{ reply, patch:{ matchId?, target?, mode?, chill?, weather?, concessionsMin?,
partyBufferMin?, originQuery? } }` with phrase→knob guidance. LLM = raw `fetch` to
`https://api.featherless.ai/v1/chat/completions` (OpenAI-compatible),
`FEATHERLESS_API_KEY` + `FEATHERLESS_MODEL` (default a small instruct model, no new
npm dep). Validate/clamp every patch field against real enums/ranges. `originQuery`
→ shared `resolveOriginFromQuery(query, stadium, departAt)` (reuses geocode+route).
Apply patch server-side, run `recommend()`, return `{ patch, reply, summary }`.
**Keyless fallback:** deterministic `parseIntent(text)` keyword matcher → same patch
shape, so chat works with no key.

**Part C — Chat UI** (`components/Chat.tsx`): a dashboard card ("Ask ArriveWise"),
message list + input + seed chips; POSTs to `/api/chat`, calls `applyPatch(patch)`
which maps onto existing `setPlan`/`setWeatherKind`; `rec` recomputes via the
existing `useMemo` so a chat change looks identical to a manual one.

**Env:** `.env.example` adds `FEATHERLESS_API_KEY=` / `FEATHERLESS_MODEL=` (both
optional — degrade to the keyless parser). User adds the real key to `.env.local`.

**Build order:** (A) engine + sanity → (B) `/api/chat` keyless-first, then the
Featherless call → (C) chat UI + wiring → docs. Keyless-first = demoable before the
key. **Not in scope:** external MCP server, transit/rideshare *physics*, roof-aware
weather. Full detail: `~/.claude/plans/so-basically-right-now-harmonic-wave.md`.
