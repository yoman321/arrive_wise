# ⚽ ArriveWise

**The smartest time to arrive at the match.** ArriveWise tells a fan exactly when
to leave home for a big event so they arrive as *late as comfortably possible* —
skipping the security-line surge while still catching the moment they care about.

Built for **United Hacks V7** (sport theme). Showcased on the **FIFA World Cup
2026** and its 16 host stadiums, but the engine is event-agnostic.

![ArriveWise](docs/screenshot.png)

---

## The problem

Everyone over-arrives at stadiums "to be safe," burning an hour in their seat — or
under-arrives and misses kickoff stuck in a security line. The genuinely hard part
is that the *best* arrival time isn't a fixed rule: it depends on match-day
traffic, how the crowd bunches up before kickoff, and how fast the gates process
people. ArriveWise models all three and computes the answer.

## Why there's no "historical arrival dataset" (and why that's fine)

Per-fan *"arrived at T, waited W minutes"* logs are not published anywhere, so we
**don't fake one**. Instead ArriveWise is a **mechanistic model** — a small piece
of transportation/queueing engineering whose parameters come from real, citable
sources. Every number is a transparent, tunable input, not a black box.

## How the model works

Everything is computed on a time axis **τ = minutes relative to kickoff** (negative
= before). See `src/lib/engine/`.

1. **Crowd arrival curve** (`queue.ts`, `curves.ts`) — spectators reach the gates
   on a distribution that builds through the pre-match window and peaks ~30 min
   before kickoff. Modeled as a truncated normal, scaled to expected attendance
   (capacity × a round-dependent turnout fraction).
2. **Security queue** (`queue.ts`) — a **deterministic fluid queue**. Each minute,
   `queue = max(0, queue + arrivals − gate_capacity)`, where gate capacity =
   `entry_lanes × per-lane throughput` (~11–12 people/lane/min, a standard
   sports-ingress figure). This yields the expected wait for a fan reaching the
   gate at *any* minute — the core "security-line curve" you see in the app.
3. **Traffic** (`travel.ts`, `curves.ts`) — free-flow drive time (per origin) ×
   a **match-day surge multiplier** that grows toward kickoff and scales with match
   importance, plus parking-search and walk times. Car is the baseline mode.
4. **Optimizer** (`cost.ts`, `optimizer.ts`) — sweeps every candidate gate-arrival
   minute and minimizes a cost:
   `security_wait + early_penalty·earliness + late_penalty·lateness + hard_penalty·missed_kickoff`.
   The **"chill ↔ cut-it-close" slider** reshapes these weights (a chill fan hates
   being late and tolerates arriving early; a cut-it-close fan does the reverse).
   The winning arrival time is back-solved into a **"leave home by" clock time**.

The result: a recommended departure time, a full timeline, the security-line
curve with your plan marked, a sensitivity readout ("leave 20 min later → +X min
in line"), and venue context.

## Tech

- **Next.js 16 (App Router) + TypeScript + Tailwind v4** — deployed static/serverless.
- **Recharts** for the wait-vs-arrival curve, **Leaflet + OpenStreetMap** for the
  venue map (no API keys — nothing to bill or break in a demo).
- The entire engine is **pure client-side TypeScript**: no backend, no database,
  no paid APIs. Data lives in `src/lib/data/`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Checks:

```bash
npm run sanity     # engine sanity assertions (arrival, queue, traffic, optimizer)
npm run typecheck
npm run build
```

## Deploy (free)

Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new).
Vercel auto-detects Next.js — no configuration or environment variables needed.
Every push redeploys. (Cloudflare Pages / Netlify work identically.)

## Project layout

```
src/
  app/                 page, layout, theme
  components/          Controls, ResultPanel, Timeline, WaitChart, MatchMap
  lib/
    engine/            the model: arrivalCurve · queue · travel · cost · optimizer
    data/              16 stadiums, sample matches, origin presets
scripts/sanity.ts      engine assertions
```

## Honesty note

Arrival curves, turnstile throughput and traffic-surge shapes are
**research-informed parameters**, not per-match ground truth. The honest path for
real data to enter is a crowdsourced feedback loop (fans reporting actual waits to
calibrate the model) — a designed-in next step, not part of this build.

---

_Built with [Claude Code](https://claude.com/claude-code)._
