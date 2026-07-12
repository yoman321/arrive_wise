// Natural-language → structured trip intent, the LLM perimeter. A fan's sentence
// ("coming from Brooklyn with two kids, want the anthems, keep it under $100")
// becomes a PlanArrivalInput the deterministic planner can run. Featherless.ai
// (OpenAI-compatible) does the extraction when `FEATHERLESS_API` is set; a keyword
// parser is the deterministic fallback, so — like every other source in this app —
// the feature never depends on a key or the network. The key is server-side only.

import { type NextRequest } from "next/server";
import { coerceIntent, keywordIntent } from "@/lib/mcp/extract";
import { scanVenueFromText, type PlanArrivalInput } from "@/lib/mcp/planner";

const FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

const SYSTEM_PROMPT = `You extract match-day trip details from a football fan's message into JSON for a stadium-arrival planner.
Output ONLY a single JSON object, no prose, no code fences.
Every field is OPTIONAL — omit any the message does not clearly state. Never invent values.
Fields:
- venue: stadium name or host city (e.g. "MetLife", "Dallas", "Mexico City")
- match: a team name, OR a round: "final" | "semi-final" | "quarter-final" | "round of 16" | "group"
- origin: how far the fan starts from — a rough distance bucket only, NOT a street address: "right nearby" | "same city" | "across the metro" | "out of town"
- originDriveMin: rough drive time to the venue in minutes, if they state one (number)
- mode: "drive" | "transit" | "rideshare" | "walk" | "bike"
- target: what they want to be seated for — "warmups" | "anthems" | "kickoff"
- vibe: "cutItClose" | "balanced" | "relaxed" | "veryEarly"
- chill: number 0..1 (0 = cut it close, 1 = very early). Prefer vibe unless a number is stated.
- budgetUsd: overall budget in dollars (number)
- foodBudgetUsd: food/concessions budget in dollars (number)
- concessionsMin: minutes they want to spend getting food (number)
- partyBufferMin: minutes of extra buffer for a slower group — set 10+ if kids, stroller, wheelchair, or elderly are mentioned
- roundTrip: true if they mention returning / both ways`;

function parseJsonLoose(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  return JSON.parse(content.slice(start, end + 1));
}

async function viaFeatherless(text: string, key: string): Promise<PlanArrivalInput> {
  const model = process.env.FEATHERLESS_MODEL?.trim() || DEFAULT_MODEL;
  const res = await fetch(FEATHERLESS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`featherless ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return coerceIntent(parseJsonLoose(content));
}

export async function POST(request: NextRequest) {
  let text = "";
  try {
    const body = (await request.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    // fall through — empty text
  }
  if (!text) {
    return Response.json({ error: "missing text" }, { status: 400 });
  }

  const key = process.env.FEATHERLESS_API;
  let input: PlanArrivalInput;
  let source: "llm" | "fallback" = "fallback";
  if (key) {
    try {
      input = await viaFeatherless(text, key);
      source = "llm";
    } catch {
      input = keywordIntent(text);
    }
  } else {
    input = keywordIntent(text);
  }

  // Backfill a venue from the raw text if extraction missed one (no fixture pinned).
  if (!input.venue && !input.matchId) {
    const scanned = scanVenueFromText(text);
    if (scanned) input.venue = scanned;
  }

  return Response.json({ source, input });
}
