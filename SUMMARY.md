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

**Current status:** fully built, verified, runs locally. NOT yet committed to git,
pushed to GitHub, or deployed.

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

## 3. Stack & hard constraints (respect these)

- **Next.js 16 (App Router) + TypeScript + Tailwind v4.**
- **Free tier only. No paid APIs, no API keys in v1.** (Groq is a *proposed* add — see §7.)
- **Engine is 100% client-side, deterministic. No backend, no database in v1.**
- **Keep the core an algorithm, not an LLM** — LLMs are for the perimeter only (§7).
- Charts: **Recharts**. Map: **Leaflet + OpenStreetMap** (no key). Theme: committed
  **dark** "stadium at night" (`src/app/globals.css`).
- Static data only, hand-authored (see §6 provenance caveat).

## 4. File map (where everything is)

```
src/
  app/
    page.tsx           # client page: holds state, calls recommend(), lays out UI
    layout.tsx         # metadata, fonts
    globals.css        # dark theme tokens + component classes + Leaflet dark filter
  components/
    Controls.tsx       # match picker, origin, target, chill slider
    ResultPanel.tsx    # hero "Leave by", stat tiles, hosts chart/map/timeline
    WaitChart.tsx      # Recharts security-line curve, plan point marked
    Timeline.tsx       # leave -> park -> security -> seated -> kickoff
    MatchMap.tsx       # dark Leaflet venue map (dynamic import, ssr:false)
  lib/
    engine/            # THE ALGORITHM (~580 lines, pure TS) — see §5
      index.ts         #   recommend() orchestrator + public exports  <-- read first
      curves.ts        #   tunable constants: arrival curve + traffic surge
      queue.ts         #   crowd + fluid security-queue model (the heart)
      travel.ts        #   drive time x surge + parking/walk, back-solve departure
      cost.ts          #   preference scoring, reweighted by chill slider
      optimizer.ts     #   sweep arrival minutes, pick lowest cost, emit curve
      time.ts helpers.ts types.ts
    data/
      stadiums.ts      # 16 WC2026 venues (static)
      matches.ts       # 8 sample matches
      origins.ts       # drive-distance presets
scripts/sanity.ts      # engine assertions (npm run sanity)
README.md              # public write-up + model explanation
docs/SUBMISSION.md     # paste-ready description + demo-video storyboard
docs/screenshot.png
```

## 5. How the algorithm works (4 steps)

`recommend(stadium, match, trip, prefs)` in `engine/index.ts`:
1. **Crowd + security** (`queue.ts`): attendance (capacity × round turnout) + a
   crowd-arrival curve peaking ~30 min pre-kickoff → **deterministic fluid queue**
   → expected security wait for any arrival minute.
2. **Traffic** (`travel.ts`): free-flow drive × match-day surge multiplier (worse
   near kickoff / bigger matches) + parking + walk → back-solve departure time.
3. **Cost** (`cost.ts`): line-wait + wasted-early-time + missed-moment risk,
   reweighted by the chill slider.
4. **Optimize** (`optimizer.ts`): sweep every arrival minute, take lowest cost,
   back-solve the "leave by" clock time + timeline + sensitivity.

**Inputs accounted for:** venue (capacity, lanes, throughput, gate-open lead,
parking/walk) · match (kickoff, round) · you (origin distance, target moment,
chill). **Not modeled yet:** weather, transit/rideshare, live traffic, time-of-day
baseline traffic, concessions.

## 6. Data provenance (important, honest)

Data is **static and hand-authored from the model's general knowledge — not scraped
or fetched.** Stadium capacities/coordinates are **approximate; spot-check before
demoing.** Operational params (lanes, throughput, walk times) are transparent
estimates in literature-backed ranges. Knockout matchups are illustrative
placeholders. The *recommendation* is computed live, never stored.

## 7. Proposed next feature — Groq LLM layer (discussed, NOT built)

Principle: **LLM at the perimeter, algorithm at the core.** Good LLM jobs here:
- **Infer parameters for ANY venue you type** (event-agnostic for real).
- **Read free-text real-world context** ("extra security announced", "rail closure")
  into model adjustments.
- **Parse free-text preferences** ("2 kids, want food, hate crowds") → knobs.
- **Explain the plan / answer what-ifs** in natural language.
Architecture: **Next.js API route** calling **Groq** (OpenAI-compatible, fast, free
tier) server-side, key in env var; **keep the 16 presets as fallback** so the demo
never depends on the key. Use **OSM Nominatim** (free) for real coordinates, LLM
only for soft operational params. Needs a free key from `console.groq.com`.

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

## 9. Open action items

1. Commit + push to GitHub (repo is on `main`, uncommitted).
2. Deploy to Vercel (import repo, zero config; needs your login).
3. Record demo video (`docs/SUBMISSION.md` storyboard).
4. Optional: build the Groq layer (§7) · verify/replace real stadium data (§6).

---

## 10. Your ask

_(write what you want done next, e.g. "build the Groq type-any-venue feature from §7"
or "fix the real capacities in stadiums.ts" or "add weather to the model")_
