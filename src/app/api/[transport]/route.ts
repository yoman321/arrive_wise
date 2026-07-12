// ArriveWise's MCP server, exposed as an in-app Streamable-HTTP endpoint at
// `/api/mcp` (the `[transport]` segment also answers `/api/sse`). Static API
// siblings — geocode, route, weather, matches, venue-food — take precedence over
// this dynamic segment, so only the MCP transports land here.
//
// The flagship tool, `plan_arrival`, is self-enriching: a client describes a fan's
// intent in a few fields and gets back a plain-English brief plus a dashboard
// deep-link that opens the exact scenario. `list_stadiums` / `list_matches` are the
// catalogs a model uses to turn "the final" or "MetLife" into a concrete fixture.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { STADIUMS, STADIUM_BY_ID } from "@/lib/data/stadiums";
import { matchTitle, upcomingMatches, ROUND_LABEL } from "@/lib/ui";
import {
  buildScenario,
  baseUrl,
  mergeInput,
  MissingInfoError,
  type PlanArrivalInput,
} from "@/lib/mcp/planner";
import { getContextPlan, setContextPlan } from "@/lib/mcp/context";
import type { Match } from "@/lib/engine/types";
import { MATCHES } from "@/lib/data/matches";

// Fold the current dashboard selections into an incoming intent when this looks
// like an adjustment. `useCurrentSelections` forces it on/off; left unset, we merge
// only when the caller named no fixture (a bare "make it cheaper" can't stand alone).
function resolveWithContext(
  input: PlanArrivalInput,
  useCurrentSelections?: boolean
): { input: PlanArrivalInput; basedOnCurrent: boolean } {
  const ctx = getContextPlan();
  const hasFixture = Boolean(input.venue || input.matchId || input.match);
  const merge = ctx !== null && (useCurrentSelections ?? !hasFixture);
  return merge && ctx
    ? { input: mergeInput(ctx, input), basedOnCurrent: true }
    : { input, basedOnCurrent: false };
}

// When the planner can't proceed without inventing a number, surface the questions
// instead of a plan — the client (or the fan) supplies the missing piece.
function needsInfoResult(e: MissingInfoError) {
  return {
    content: [
      {
        type: "text" as const,
        text: `I need a bit more before I can plan this:\n- ${e.questions.join("\n- ")}`,
      },
    ],
    structuredContent: {
      needsMoreInfo: true,
      missing: e.missing,
      questions: e.questions,
    },
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "plan_arrival",
      {
        title: "Plan arrival",
        description:
          "Build a complete ArriveWise match-day plan from a fan's intent, then return a plain-English brief plus a dashboard link that opens the exact scenario. Self-enriching: it resolves the fixture, sets the origin from a rough distance bucket, pulls venue weather, and runs the deterministic engine. Origin is a rough distance only — this tool does NOT geocode addresses or use GPS/live location. Provide whatever the fan mentioned; everything except a venue/fixture is optional. Use list_matches / list_stadiums first when you need concrete ids.",
        inputSchema: {
          matchId: z
            .string()
            .optional()
            .describe("Exact fixture id from list_matches — the strongest signal."),
          venue: z
            .string()
            .optional()
            .describe(
              "Stadium name, host city, or id (e.g. 'MetLife', 'Dallas', 'sofi'). Used when no matchId."
            ),
          match: z
            .string()
            .optional()
            .describe(
              "Fixture hint when there's no id: a round ('final', 'semi-final', 'quarter') or a team name."
            ),
          origin: z
            .string()
            .optional()
            .describe(
              "How far the fan is from the venue, as a rough distance bucket — 'right nearby', 'same city', 'across the metro', or 'out of town'. NOT a street address (no geocoding); a place name that isn't one of these buckets is ignored in favor of the current distance."
            ),
          originDriveMin: z
            .number()
            .optional()
            .describe("Rough free-flow drive minutes to the venue — the precise way to set the distance."),
          mode: z
            .enum(["drive", "transit", "rideshare", "walk", "bike"])
            .optional()
            .describe("How the fan is travelling. Default drive."),
          target: z
            .enum(["warmups", "anthems", "kickoff"])
            .optional()
            .describe("What they want to be seated for. Default kickoff."),
          chill: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("0 = cut it close, 1 = arrive very early / risk-averse."),
          vibe: z
            .enum(["cutItClose", "balanced", "relaxed", "veryEarly"])
            .optional()
            .describe("Alternative to chill; mapped to a number if chill is absent."),
          budgetUsd: z.number().optional().describe("Overall trip budget cap, USD."),
          foodBudgetUsd: z
            .number()
            .optional()
            .describe("Food/concessions sub-cap, USD (implies a food stop)."),
          concessionsMin: z
            .number()
            .optional()
            .describe("Minutes to grab food/drink before settling in."),
          partyBufferMin: z
            .number()
            .optional()
            .describe("Extra buffer for a slower group (kids, stroller, accessibility)."),
          roundTrip: z
            .boolean()
            .optional()
            .describe("Price the trip both ways (fare/rideshare/gas)."),
          useCurrentSelections: z
            .boolean()
            .optional()
            .describe(
              "Adjust the plan currently on the dashboard instead of starting fresh — your fields merge onto the fan's current selections (venue, origin, etc. carry over). Defaults on when you name no venue/match. Call get_current_plan to see what's set."
            ),
        },
      },
      async ({ useCurrentSelections, ...rest }) => {
        const { input, basedOnCurrent } = resolveWithContext(rest, useCurrentSelections);
        try {
          const result = await buildScenario(input);
          setContextPlan(result.plan); // keep the shared context in step
          const note = basedOnCurrent ? "Adjusted your current plan.\n\n" : "";
          return {
            content: [{ type: "text", text: note + result.summary }],
            structuredContent: {
              basedOnCurrent,
              dashboardUrl: result.dashboardUrl,
              ...result.details,
            },
          };
        } catch (e) {
          if (e instanceof MissingInfoError) return needsInfoResult(e);
          throw e;
        }
      }
    );

    server.registerTool(
      "plan_from_text",
      {
        title: "Plan arrival from a sentence",
        description:
          "One-shot planner from a fan's own words. Give the raw message ('coming from Brooklyn with two kids, want to catch the anthems, keep it under $100, we'll grab food') and it extracts the intent (via the Featherless LLM, with a keyword fallback), then builds the full plan + dashboard deep-link — same output as plan_arrival. Pass explicit overrides to pin anything the text is vague about.",
        inputSchema: {
          text: z
            .string()
            .describe("The fan's natural-language message describing their trip."),
          matchId: z
            .string()
            .optional()
            .describe("Override: exact fixture id (wins over anything parsed)."),
          venue: z.string().optional().describe("Override: venue name / city / id."),
          mode: z
            .enum(["drive", "transit", "rideshare", "walk", "bike"])
            .optional()
            .describe("Override: travel mode."),
          budgetUsd: z.number().optional().describe("Override: overall budget, USD."),
          roundTrip: z.boolean().optional().describe("Override: price both ways."),
          useCurrentSelections: z
            .boolean()
            .optional()
            .describe(
              "Adjust the plan currently on the dashboard instead of starting fresh (see plan_arrival). Defaults on when the message names no venue/match."
            ),
        },
      },
      async ({ text, useCurrentSelections, ...overrides }) => {
        const res = await fetch(`${baseUrl()}/api/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(15000),
        });
        const parsed = res.ok
          ? ((await res.json()) as { source: string; input: PlanArrivalInput })
          : { source: "fallback", input: {} as PlanArrivalInput };

        // Explicit overrides win over whatever the LLM/keyword parser produced.
        const clean = Object.fromEntries(
          Object.entries(overrides).filter(([, v]) => v !== undefined)
        );
        const parsedInput: PlanArrivalInput = { ...parsed.input, ...clean };
        const { input, basedOnCurrent } = resolveWithContext(
          parsedInput,
          useCurrentSelections
        );
        try {
          const result = await buildScenario(input);
          setContextPlan(result.plan);
          const note = basedOnCurrent ? " · adjusted your current plan" : "";
          return {
            content: [
              {
                type: "text",
                text: `Understood (${parsed.source}${note}): ${JSON.stringify(parsedInput)}\n\n${result.summary}`,
              },
            ],
            structuredContent: {
              parsedFrom: parsed.source,
              basedOnCurrent,
              interpreted: parsedInput,
              dashboardUrl: result.dashboardUrl,
              ...result.details,
            },
          };
        } catch (e) {
          if (e instanceof MissingInfoError) {
            const r = needsInfoResult(e);
            return {
              ...r,
              structuredContent: {
                ...r.structuredContent,
                parsedFrom: parsed.source,
                interpreted: parsedInput,
              },
            };
          }
          throw e;
        }
      }
    );

    server.registerTool(
      "get_current_plan",
      {
        title: "Get current plan",
        description:
          "Fetch the plan currently on the ArriveWise dashboard — the fan's live selections (fixture, origin, mode, timing, budget). Call this before adjusting so you know what's set; returns null if nothing is planned yet. plan_arrival / plan_from_text can then tweak it with useCurrentSelections.",
        inputSchema: {},
      },
      async () => {
        const plan = getContextPlan();
        if (!plan) {
          return {
            content: [{ type: "text", text: "No plan is on the dashboard yet." }],
            structuredContent: { plan: null },
          };
        }
        const s = STADIUM_BY_ID[plan.match.stadiumId];
        const bits = [
          `${matchTitle(plan.match)} — ${s.name}, ${s.city} (kickoff ${plan.match.kickoff})`,
          `from ${plan.origin.label}`,
          `mode ${plan.mode}`,
          `wants ${plan.target}`,
          `chill ${plan.chill}`,
        ];
        if (typeof plan.budgetUsd === "number") bits.push(`budget $${plan.budgetUsd}`);
        if (typeof plan.foodBudgetUsd === "number") bits.push(`food $${plan.foodBudgetUsd}`);
        if (plan.roundTrip) bits.push("round-trip");
        return {
          content: [{ type: "text", text: `Current selections: ${bits.join(" · ")}` }],
          structuredContent: { plan },
        };
      }
    );

    server.registerTool(
      "list_stadiums",
      {
        title: "List stadiums",
        description:
          "The 16 WC2026 host venues ArriveWise knows, with ids for use in plan_arrival.",
        inputSchema: {},
      },
      async () => {
        const rows = STADIUMS.map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
          country: s.country,
        }));
        const text = rows
          .map((r) => `${r.id} — ${r.name}, ${r.city} (${r.country})`)
          .join("\n");
        return {
          content: [{ type: "text", text }],
          structuredContent: { stadiums: rows },
        };
      }
    );

    server.registerTool(
      "list_matches",
      {
        title: "List matches",
        description:
          "Upcoming WC2026 fixtures (live feed, seed fallback), with ids for plan_arrival. Knockout slots whose teams aren't decided show as placeholders.",
        inputSchema: {},
      },
      async () => {
        let schedule: Match[] = MATCHES;
        try {
          const res = await fetch(`${baseUrl()}/api/matches`, {
            signal: AbortSignal.timeout(8000),
          });
          const data = res.ok ? await res.json() : null;
          if (data?.matches?.length) schedule = data.matches as Match[];
        } catch {
          // seed fallback
        }
        const rows = upcomingMatches(schedule).map((m) => {
          const s = STADIUM_BY_ID[m.stadiumId];
          return {
            id: m.id,
            matchup: matchTitle(m),
            round: ROUND_LABEL[m.round],
            venue: `${s.name}, ${s.city}`,
            stadiumId: m.stadiumId,
            date: m.date,
            kickoff: m.kickoff,
          };
        });
        const text = rows
          .map(
            (r) =>
              `${r.id} — ${r.matchup} · ${r.round} · ${r.venue} · ${r.date} ${r.kickoff}`
          )
          .join("\n");
        return {
          content: [{ type: "text", text }],
          structuredContent: { matches: rows },
        };
      }
    );
  },
  {},
  {
    basePath: "/api", // matches the [transport] segment location → /api/mcp
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST };
