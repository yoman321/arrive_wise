# ArriveWise — Context Primer (paste this to re-prompt an AI)

> **How to use this doc:** the durable rules an agent must always follow — the hard
> architectural constraints, the verify commands and the learned gotchas — now live
> in **`AGENTS.md`** (auto-loaded every session via `CLAUDE.md`). This file is the
> narrative primer: status, how the model works, provenance and the roadmap. Paste
> it (or just read it) to pick up the "why" and what's next; add your ask at the
> bottom. Keep both updated as things change.

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
deterministic engine, each source with a keyless fallback. **Phase 1 of the
roadmap (§12) is complete** — every parameter is now modeled in the algo: full
weather (throughput/walk/comfort, roof-gated), real per-mode physics (drive /
rideshare / transit / walk / bike), parking surge, and concessions + party buffer.
Runs locally; `sanity` (30 checks) / `typecheck` / `lint` / `build` green. The only
optional key is `TOMTOM_KEY` (live/predicted traffic); without it routing uses
keyless OSRM → estimate. Remaining candidates: confidence band (P90) and money.

## 2. Environment & how to run

- Project root: `/Users/luoph/Desktop/arrive_wise` · macOS · zsh · Node 25
- Git repo exists on branch `main`; **changes are uncommitted**. No GitHub remote yet.
```bash
npm install
npm run dev        # http://localhost:3000
```
- Verify commands (`sanity` / `typecheck` / `lint` / `build`) → see **`AGENTS.md`**.
- Optional: `cp .env.example .env.local` and set `TOMTOM_KEY` for live/predicted
  traffic. Runs fully without it (OSRM → estimate fallback). Geolocation needs a
  secure context — `localhost` is fine.

## 3. Stack & hard constraints (respect these)

**→ Moved to `AGENTS.md` ("Architecture") — the always-loaded rule set.** In brief:
Next.js 16 + TypeScript + Tailwind v4; algorithm at the core (deterministic, never
fetches), data/LLM at the perimeter (`src/app/api/*`, each with a fallback); no paid
dependency (`TOMTOM_KEY` optional/server-only); Recharts + Leaflet/OSM; committed
dark theme; hand-authored static data (§6 provenance caveat).

## 4. File map (where everything is)

**→ Moved to `AGENTS.md` ("File map") — the always-loaded rule set.** It's the
annotated `src/` tree (orchestrator, API perimeter, onboarding bridge, and the
`lib/engine/` algorithm files). Read it there for where everything lives.

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
parking/walk, **roof**) · match (kickoff, round) · you (real origin via
geolocation/geocoding, target moment, **travel mode**, chill, **concessions +
party buffer**) · **live conditions** (live/predicted traffic, time-of-day
baseline, live weather). **Now modeled (Phase 1 complete):** **full weather**
(drive + security throughput + walk pace + exposed-idle comfort, roof-gated),
**real mode physics** (drive / rideshare / transit / walk / bike — each with its
own surge/parking/weather rules), **parking surge** (search grows toward kickoff),
and **concessions + party buffer**. **Still pending (Phase 1 candidates, not built):**
a **confidence band** (P90) and **money** (parking / fare / surge pricing).

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
says which); **origin** = your actual coordinates via Geolocation/Nominatim;
**venue food outlets** = real named restaurants/bars/shops at the venue from OSM via
Overpass (keyless, mirror-failover; a typical-outlets list is the fallback). Concession
*prices* stay hand-authored (real per-item menus aren't publicly fetchable). Travel
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

**→ Moved to `AGENTS.md` ("Gotchas") — the always-loaded rule set.** Covers:
headless-screenshot false clipping (use puppeteer-core + `scrollWidth`); mobile
`grid-cols-1` / Recharts `min-w-0` / root `overflow-x-clip`; Next 16 dynamic route
handlers; ESLint `use*`/`set-state-in-effect` traps; Leaflet dark-tile
`!important`.

## 9. Open action items

1. Commit + push to GitHub; deploy to Vercel (import repo; add the optional
   `TOMTOM_KEY` env var there for live traffic — everything else is keyless).
2. Record demo video (`docs/SUBMISSION.md` storyboard) — lead with the geolocation
   → live route + live weather, then the plan.
3. Remaining Phase 1 candidates (see §5 / §12): a **confidence band** (P90) and
   **money** (parking / fare / surge pricing). Then Phase 2 (dashboard exposes the
   full param set) → Phase 3 (lean onboarding) → Phase 4 (chatbot, §11).
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

## 12. Product roadmap — the layered plan (the big picture)

**Organizing principle:** one shared parameter model feeds the engine and *every*
input surface (`TripPlan` → `planToConditions()` → `recommend()`). Build the params
once; the sliders, onboarding, and chatbot are all just *views* onto them, so a
change made anywhere is the same object. **Params must lead** — UI-before-params
gives cosmetic controls (today's mode label, which changes nothing, is the
cautionary example).

Four layers, in build order:

**Phase 1 — Model every parameter in the algo (the foundation).** ✅ **DONE.**
Turned today's cosmetic/half-wired inputs into real ones:
- **Full weather** — `curves.ts` `WEATHER_EFFECTS` carries four effects per bucket
  (drive, security `throughput`, `walkPace`, exposed-idle `comfort`); `ROOF_EXPOSURE`
  gates the *interior* effects (concourse walk + waiting comfort) while the approach
  walk and outdoor queue stay exposed. Wired through `queue.ts` (throughput → lane
  rate), `optimizer.ts` (seat-walk + comfort), `cost.ts` (comfort surcharge). All 16
  venues now carry a real `roofType`.
- **Real mode physics** — `curves.ts` `MODE_PHYSICS` per mode (drive / rideshare /
  transit / **walk** / **bike**): pace, road surge/baseline on/off, parking vs
  drop-off, access/egress, and which weather multiplier hits the leg. `travel.ts`
  rebuilt around it; selectable in onboarding `StepTravel`.
- **Parking surge** — `curves.ts` `parkingSurge()` grows the flat `parkingSearchMin`
  toward kickoff, importance-scaled (was a constant).
- **Concessions + party buffer** — `Conditions.extras`; both push the optimal gate
  arrival earlier via `seatedMin`; concessions gets a visible timeline step.

`npm run sanity` grew to 30 checks (all green) covering each of the above;
`typecheck` / `lint` / `build` green; verified live in-browser (storm now moves the
drive **and** the security line **and** the crowd-at-kickoff).

**Money layer — ✅ DONE (added post-Phase-2).** `engine/money.ts` is a deterministic
per-mode cost model (same philosophy as `curves.ts`, never fetched): drive = event
parking (importance + venue scaled) + gas; rideshare = fare + a match-day price
**surge** derived from the road surge; transit = flat local fare; walk/bike free;
**food** — a real budget line, not just time: concession spend priced **per venue
country** (`foodUsdPerMin` USA 1.8 / Canada 1.7 / Mexico 0.8 — a stadium beer + hot
dog adds up), driven by the concessions buffer and shown as a live `~$` next to that
slider; a **round-trip** flag doubles the travel-variable lines (fare/rideshare/gas)
but not the one-time ones (parking, food). Surfaced on the
dashboard as a per-mode price on the mode buttons, a **typed budget cap** (number
input) that flags over-budget modes, a one-way/round-trip toggle, and an "Est. cost"
stat on the result panel. `recommend()` returns `cost` + `costByMode`; sanity grew by
9 money checks. A live pricing source could later replace any line at the perimeter
with this as the fallback.

**Per-venue food pricing — ✅ DONE (added post-money-layer).** The flat per-country
`foodUsdPerMin` is replaced by a per-venue **concession basket**: region-appropriate
items (US beer/hot dog · Canada poutine · Mexico cerveza/tacos) priced off a baseline
scaled by each venue's `foodTier` (`value | standard | premium`, e.g. Mercedes-Benz
Atlanta = value for its fan-friendly pricing, MetLife/SoFi = premium). The basket is
the single source: `foodBasketFor()` → `foodRatePerMin()` → `estimateFoodCost()`, so
the on-screen menu and the budget number always agree (params lead UI). Surfaced in a
new **"What's at the venue"** dashboard card (`VenueFood.tsx`) that also lists the
venue's **real outlets** live from OSM Overpass (`/api/venue-food`). Sanity grew by 4
food-tier checks (premium > value rate; region-correct items).

**Next steps (open):**
- **Food: decouple time from cost (roadmap).** *Time to get food* and *cost of food*
  are two different things, but today a single control — the concessions **minutes**
  slider — drives both (the timeline stop and the `~$` budget line via the venue's
  `foodRatePerMin`). In reality they're independent: a $40 beer-and-dog round can take
  3 minutes, and lingering 20 minutes might cost nothing. Roadmap item: split them
  into separate params — a concessions **dwell time** and a **food spend** (its own
  control / tier, now that the per-venue basket exists to price it), so each moves the
  plan on its own axis — and then scale the spend by **party size** (a family's round
  is 4×).
- **Confidence band (P90).** The product is a *risk* statement but is point-estimate
  only today — surface a range, not a single leave-by.
- **Live, forward-looking match data (the onboarding schedule) — ✅ DONE.** The
  onboarding schedule is now fetched live at the perimeter instead of leaning on
  historical seed data. `src/app/api/matches/route.ts` pulls the real WC2026
  **knockout** fixtures from **TheSportsDB** (keyless free tier), per-round via
  `eventsround.php` (the season endpoint is truncated on the free tier; the round
  endpoint is not) — quarter-finals (`r=125`) and semi-finals (`r=150`), plus a few
  future-proof round codes. Each event is resolved to one of our 16 stadiums (venue
  name → id, with FIFA "<city> Stadium" aliases + loose containment so
  "GEHA Field at Arrowhead Stadium" still maps), the **round is derived from the
  venue-local date**, and kickoff uses the feed's `dateEventLocal` / `strTimeLocal`.
  **Partial knowledge is handled**: later rounds the feed hasn't scheduled yet (the
  final, whose teams depend on games still to play) are filled from the seed with
  teams blanked to a **"TBD" placeholder**; undecided team fields from the feed get
  the same treatment. The route **only returns the live set when it has upcoming
  games**, else it falls back to the hand-authored `MATCHES` — so the demo never
  breaks. Client wiring: `page.tsx` fetches `/api/matches` on mount into `schedule`
  state (seed as the synchronous fallback) and threads it (with a `scheduleLive`
  flag → a "Live schedule" vs "Sample schedule" badge) through `Onboarding` →
  `StepEvent`. `StepEvent` renders `upcomingMatches()` (new helper in `ui.ts`):
  finished games are hidden while any fixture is still upcoming (soonest first),
  falling back to most-recent-first only once the whole schedule is in the past.
  Verified live end-to-end (real QF/SF fixtures, past games hidden, the final shown
  as an undecided placeholder) and on the fallback path; `typecheck` / `lint` /
  `sanity` green.

**Phase 2 — Dashboard exposes the full param set** as live controls. ✅ **DONE.**
`DashboardControls.tsx` — a "Fine-tune your plan" card — surfaces origin (via the
shared `OriginPicker`), target, mode, chill, concessions, party buffer and the
budget caps (overall + food sub-cap, with a food/transport split); every change
mutates `plan` and recomputes through the existing `useMemo`. `OriginPicker.tsx` is
extracted so onboarding + dashboard are one view on the origin param (live location
locks its button once selected on the dashboard). **The dashboard is a two-column,
fit-the-fold layout** on desktop: a **tune column** (`TuneTabs` — two tabs, "Trip &
weather" and "Budget & food", each filling the column height) beside a **results
column** (`ResultPanel` variant `"main"` — hero through timeline), with the venue
map/specs/sensitivity (`variant="venue"`) a scroll below the fold and a `ScrollHint`
pill cueing it. On mobile the two columns collapse to one **view-toggled** pane
(`page.tsx` `view` state): a tune page with a "See my plan →" confirm button and a
results page with "← Adjust plan", so tuning never requires scrolling past the
result. Venue outlets are module-cached in `VenueFood` so tab swaps don't re-query.
`rec` recomputes live, so switching tabs/views is instant.

**Phase 3 — Lean onboarding (consent + intent only).** ✅ **DONE.** Wizard trimmed
from 5 steps to **4**: (1) **which match**; (2) **allow live location** — a one-time
`getCurrentPosition` ping (never `watchPosition`), consent-forward copy, with the
address / rough-distance fallback; (3) **how you'll get there** (mode); (4) **your
style** — a coarse 3-preset take on `chill` (Cut it close / Balanced / Chill & early,
each landing in a dashboard-slider bucket), fine-tuned later on the dashboard. Target
moment **defaults to kickoff** (`initialPlan()`) and is refined on the dashboard — the
dropped `StepTarget` is gone. Weather, traffic, route, drive time and venue specs stay
**inferred**, never questions. `typecheck` / `lint` / `sanity` / `build` all green.

**Phase 4 — Chatbot over internal endpoints** (§11) for natural-language tuning and
**scenario what-ifs** (e.g. "compare drive vs transit," "what if it rains") — the
forward/compare view on top of the same params.

**Rule of thumb:** onboarding asks only what a machine *can't* know (consent +
intent); APIs infer the *data*; the dashboard + chat tune the *rich params*.
