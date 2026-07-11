"use client";

import type { Recommendation } from "@/lib/engine/types";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Pt = { x: number; wait: number };

function TooltipBox({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Pt }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const before = Math.round(-p.x);
  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">
        Reach gate{" "}
        <span className="tabular font-semibold text-text">
          {before > 0 ? `${before} min before` : `${-before} min after`} KO
        </span>
      </div>
      <div className="mt-0.5 text-warn">
        Security line:{" "}
        <span className="tabular font-semibold">
          {Math.round(p.wait)} min
        </span>
      </div>
    </div>
  );
}

export default function WaitChart({ rec }: { rec: Recommendation }) {
  const data: Pt[] = rec.curve.map((c) => ({
    x: c.gateArrivalMin,
    wait: c.securityWaitMin,
  }));
  const planX = rec.gateArrivalMin;
  const planWait = rec.securityWaitMin;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 6 }}>
          <defs>
            <linearGradient id="waitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--warn)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--warn)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-soft)" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v: number) => (v === 0 ? "KO" : `${-v}`)}
          />
          <YAxis
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={42}
            allowDecimals={false}
            tickFormatter={(v: number) => `${Math.round(v)}m`}
          />
          <Tooltip
            content={<TooltipBox />}
            cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="wait"
            stroke="var(--warn)"
            strokeWidth={2}
            fill="url(#waitFill)"
            isAnimationActive={false}
          />
          <ReferenceLine
            x={0}
            stroke="var(--danger)"
            strokeDasharray="4 3"
            label={{
              value: "Kickoff",
              position: "insideTopRight",
              fill: "var(--danger)",
              fontSize: 11,
            }}
          />
          <ReferenceDot
            x={planX}
            y={planWait}
            r={6}
            fill="var(--accent)"
            stroke="var(--bg-soft)"
            strokeWidth={2}
            label={{
              value: "Your plan",
              position: "top",
              fill: "var(--accent)",
              fontSize: 11,
              fontWeight: 700,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-1 text-center text-[11px] text-faint">
        minutes before kickoff you reach the gate →
      </div>
    </div>
  );
}
