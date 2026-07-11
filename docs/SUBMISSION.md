# United Hacks V7 — Submission Kit

Everything you need to fill in the submission form + record the demo video.

---

## Project description (paste into the form)

**ArriveWise — the smartest time to arrive at the match.**

Fans either over-arrive and waste an hour in their seat, or under-arrive and miss
kickoff stuck in a security line. The best arrival time isn't a fixed rule — it
depends on match-day traffic, how the crowd bunches up before kickoff, and how
fast the gates process people.

ArriveWise models all three and computes the answer: the latest you can
comfortably leave home. It's a **mechanistic model**, not a faked dataset — a
crowd-arrival curve feeds a **fluid queueing model** of the security lines, a
**match-day traffic-surge model** handles the drive, and an **optimizer** balances
time-in-line against the risk of missing the moment you care about (warmups,
anthems, or kickoff), tuned by a "chill ↔ cut-it-close" slider.

Showcased on the FIFA World Cup 2026 and its 16 host stadiums, but the engine is
event-agnostic. Built with Next.js + TypeScript; the whole model runs client-side
with no backend, no database, and no paid APIs.

**Live demo:** <your-vercel-url>
**GitHub:** <your-repo-url>

---

## Demo video storyboard (~2 min)

Aim for a tight 90–120s. Screen-record the live site.

1. **Hook (0:00–0:15)** — "Ever shown up 90 minutes early to a game for nothing,
   or missed kickoff in the security line? ArriveWise tells you exactly when to
   leave." Show the hero: **Leave by 12:18 PM** for the Argentina vs France final.

2. **The insight (0:15–0:45)** — Point at the **security-line curve**. "This is the
   heart of it: how long you'd wait depending on when you reach the gate. It's flat
   early, then explodes as the crowd surges before kickoff. ArriveWise puts you
   right *here* — just ahead of the surge." Hover the chart to show the tooltip.

3. **It's personal (0:45–1:15)** — Drag the **chill slider** to "cut it close":
   watch the leave-time and timeline update live. Switch the target to **Warmups**:
   the whole plan shifts earlier. Change the origin to **Out of town**: departure
   moves earlier again. "Every recommendation recomputes instantly."

4. **It's real (1:15–1:40)** — Switch the match to a different stadium (e.g. Azteca
   or a group game). Show the map + venue facts changing. "16 World Cup venues,
   each with its own capacity, gates and throughput." Mention the sensitivity line:
   "leave 20 minutes later and your line triples."

5. **Close (1:40–2:00)** — "No fake dataset — it's a transparent queueing +
   traffic model, every parameter grounded in stadium-ingress research. Runs
   entirely in the browser. That's ArriveWise."

### Recording tips
- Use the deployed URL (loads instantly, looks clean).
- 1280×800 window, hide bookmarks bar.
- Interact slowly; let each number update land on screen.

---

## Judging-criteria talking points

- **Creativity** — reframes "when should I leave?" as a solvable optimization; the
  security-line curve is a genuinely novel way to *see* the decision.
- **Technical complexity** — fluid queueing model + traffic-surge model +
  cost-based optimizer, all derived and documented (`src/lib/engine/`), with a
  passing sanity suite (`npm run sanity`).
- **Practicality** — a real, common pain point; actionable single answer ("leave
  by X"); works for any large event.
- **Design** — cohesive dark "stadium at night" system, live-updating, responsive.
- **Presentation** — clear story: problem → the curve → personalization → scope.
