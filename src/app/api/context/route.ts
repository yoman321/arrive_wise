// Read/write the dashboard's current selections. The browser POSTs its live
// TripPlan here whenever it changes; the chat + MCP tools read it (in-process via
// getContextPlan, or over GET) so they can adjust the plan on screen. See
// lib/mcp/context.ts for the store and its single-slot / demo-scale caveat.

import { type NextRequest } from "next/server";
import { getContextPlan, setContextPlan } from "@/lib/mcp/context";
import type { TripPlan } from "@/components/onboarding/types";

export async function GET() {
  return Response.json({ plan: getContextPlan() });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { plan?: TripPlan | null };
    const ok = setContextPlan(body.plan ?? null);
    if (!ok) return Response.json({ error: "invalid plan" }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
}
