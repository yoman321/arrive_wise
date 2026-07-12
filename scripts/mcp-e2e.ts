// MCP end-to-end checks — drives the real Streamable-HTTP server at /api/mcp with
// the official SDK client, exercising the tools as an external client would. Needs
// the dev server running (npm run dev); if it's unreachable the suite SKIPS rather
// than fails. LLM-dependent assertions check structure, not exact wording, so they
// stay stable across model runs. Run with: npm run test:mcp:e2e

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL = process.env.MCP_URL ?? "http://localhost:3000/api/mcp";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${detail ? " — " + detail : ""}`);
}
function textOf(r: unknown): string {
  const content = (r as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}

async function main() {
  const client = new Client({ name: "mcp-e2e", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new global.URL(URL)));
  } catch {
    console.log(`\nSKIP — no MCP server reachable at ${URL} (start it with: npm run dev)`);
    process.exit(0);
  }

  console.log(`\nConnected to ${URL}`);

  // ── tool discovery ──────────────────────────────────────────────────────────
  console.log("\ntools/list");
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const t of [
    "plan_arrival",
    "plan_from_text",
    "get_current_plan",
    "list_stadiums",
    "list_matches",
  ]) {
    check(`exposes ${t}`, names.includes(t));
  }

  // ── list_stadiums ─────────────────────────────────────────────────────────────
  console.log("\nlist_stadiums");
  const stadiums = await client.callTool({ name: "list_stadiums", arguments: {} });
  const sc = stadiums.structuredContent as { stadiums?: { id: string }[] } | undefined;
  check("returns 16 host venues", sc?.stadiums?.length === 16, `${sc?.stadiums?.length}`);
  check("includes metlife", (sc?.stadiums ?? []).some((s) => s.id === "metlife"));

  // ── list_matches ──────────────────────────────────────────────────────────────
  console.log("\nlist_matches");
  const matches = await client.callTool({ name: "list_matches", arguments: {} });
  const mc = matches.structuredContent as { matches?: { id: string; venue: string }[] } | undefined;
  check("returns a non-empty fixture list", (mc?.matches?.length ?? 0) > 0, `${mc?.matches?.length}`);
  check("each fixture has an id + venue", (mc?.matches ?? []).every((m) => m.id && m.venue));

  // ── plan_arrival (structured, no LLM) ─────────────────────────────────────────
  console.log("\nplan_arrival (venue + explicit drive time)");
  const plan = await client.callTool({
    name: "plan_arrival",
    arguments: {
      venue: "MetLife",
      match: "final",
      originDriveMin: 30,
      mode: "drive",
      target: "kickoff",
      chill: 0.5,
      budgetUsd: 100,
    },
  });
  const pd = plan.structuredContent as
    | { dashboardUrl?: string; leaveByClock?: string; cost?: { usd?: number } }
    | undefined;
  check("returns a dashboard deep-link", typeof pd?.dashboardUrl === "string" && pd.dashboardUrl.includes("/?s="));
  check("returns a leave-by clock time", typeof pd?.leaveByClock === "string" && /\d/.test(pd!.leaveByClock!));
  check("returns a numeric cost", typeof pd?.cost?.usd === "number");
  check("summary text mentions leaving", /leave/i.test(textOf(plan)));

  // ── plan_from_text (LLM or keyword fallback) ──────────────────────────────────
  console.log("\nplan_from_text (natural language)");
  const nl = await client.callTool({
    name: "plan_from_text",
    arguments: {
      text: "driving from downtown Dallas to the semi-final, want to be early, budget $120",
    },
  });
  const nd = nl.structuredContent as
    | { dashboardUrl?: string; parsedFrom?: string; interpreted?: Record<string, unknown> }
    | undefined;
  check("builds a scenario from a sentence", typeof nd?.dashboardUrl === "string" && nd.dashboardUrl.includes("/?s="));
  check("reports how it parsed (llm|fallback)", nd?.parsedFrom === "llm" || nd?.parsedFrom === "fallback");
  check("interpreted a venue or match", Boolean(nd?.interpreted && (nd.interpreted.venue || nd.interpreted.matchId || nd.interpreted.match)));

  // ── current context: fetch + adjust ───────────────────────────────────────────
  console.log("\nget_current_plan + useCurrentSelections (fetch & adjust the current plan)");
  // Seed a known plan (plan_arrival writes the shared context slot).
  await client.callTool({
    name: "plan_arrival",
    arguments: { venue: "sofi", match: "quarter", originDriveMin: 25, mode: "drive", budgetUsd: 100 },
  });
  const cur = await client.callTool({ name: "get_current_plan", arguments: {} });
  const cd = cur.structuredContent as { plan?: { match?: { stadiumId?: string } } } | undefined;
  check("get_current_plan returns the seeded plan (sofi)", cd?.plan?.match?.stadiumId === "sofi", String(cd?.plan?.match?.stadiumId));

  // Adjust ONLY the budget — the venue must carry over from the current selections.
  const adj = await client.callTool({
    name: "plan_arrival",
    arguments: { budgetUsd: 60, useCurrentSelections: true },
  });
  const adjd = adj.structuredContent as
    | { basedOnCurrent?: boolean; match?: { venue?: string } }
    | undefined;
  check("adjustment is flagged based-on-current", adjd?.basedOnCurrent === true);
  check("adjustment keeps the venue (SoFi)", /SoFi/i.test(adjd?.match?.venue ?? ""), adjd?.match?.venue);

  await client.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nE2E run errored:", err instanceof Error ? err.message : err);
  process.exit(1);
});
