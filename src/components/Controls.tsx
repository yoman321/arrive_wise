"use client";

import type { Match, Preferences, TargetMoment } from "@/lib/engine/types";
import { MATCHES } from "@/lib/data/matches";
import { ORIGIN_PRESETS } from "@/lib/data/origins";
import { ROUND_LABEL, matchTitle, matchVenueLine, formatDate } from "@/lib/ui";
import { offsetToClock } from "@/lib/engine";

const TARGETS: { key: TargetMoment; label: string; hint: string }[] = [
  { key: "warmups", label: "Warmups", hint: "~45 min early" },
  { key: "anthems", label: "Anthems", hint: "~8 min early" },
  { key: "kickoff", label: "Kickoff", hint: "right on time" },
];

interface Props {
  match: Match;
  onMatch: (m: Match) => void;
  driveMin: number;
  onDrive: (n: number) => void;
  prefs: Preferences;
  onPrefs: (p: Preferences) => void;
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
          {n}
        </span>
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export default function Controls({
  match,
  onMatch,
  driveMin,
  onDrive,
  prefs,
  onPrefs,
}: Props) {
  return (
    <div className="space-y-7">
      <Section n={1} title="Pick a match">
        <div className="relative">
          <select
            value={match.id}
            onChange={(e) =>
              onMatch(MATCHES.find((m) => m.id === e.target.value)!)
            }
            className="w-full appearance-none rounded-xl border border-border bg-panel-2 px-4 py-3 pr-10 text-sm font-medium text-text focus:border-accent focus:outline-none"
          >
            {MATCHES.map((m) => (
              <option key={m.id} value={m.id}>
                {matchTitle(m)} — {ROUND_LABEL[m.round]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint">
            ▾
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="chip px-2.5 py-1 text-accent">
            {ROUND_LABEL[match.round]}
          </span>
          <span>{matchVenueLine(match)}</span>
          <span className="text-faint">·</span>
          <span>
            {formatDate(match.date)}, kickoff {offsetToClock(match.kickoff, 0)}
          </span>
        </div>
      </Section>

      <Section n={2} title="Where are you coming from?">
        <div className="grid grid-cols-2 gap-2">
          {ORIGIN_PRESETS.map((o) => (
            <button
              key={o.id}
              onClick={() => onDrive(o.freeFlowDriveMin)}
              data-active={driveMin === o.freeFlowDriveMin}
              className="seg-btn rounded-xl px-3 py-2.5 text-left"
            >
              <div className="text-sm font-medium text-text">{o.label}</div>
              <div className="text-xs text-faint">{o.sublabel}</div>
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-bg-soft px-4 py-2.5">
          <span className="text-xs text-muted">Custom free-flow drive</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={2}
              max={180}
              value={driveMin}
              onChange={(e) => onDrive(Number(e.target.value) || 0)}
              className="w-16 rounded-lg border border-border bg-panel-2 px-2 py-1 text-right text-sm tabular text-text focus:border-accent focus:outline-none"
            />
            <span className="text-xs text-faint">min</span>
          </span>
        </label>
      </Section>

      <Section n={3} title="Be seated for…">
        <div className="grid grid-cols-3 gap-2">
          {TARGETS.map((t) => (
            <button
              key={t.key}
              onClick={() => onPrefs({ ...prefs, target: t.key })}
              data-active={prefs.target === t.key}
              className="seg-btn rounded-xl px-2 py-2.5 text-center"
            >
              <div className="text-sm font-medium text-text">{t.label}</div>
              <div className="text-[11px] text-faint">{t.hint}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section n={4} title="Your style">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={prefs.chill}
          onChange={(e) =>
            onPrefs({ ...prefs, chill: Number(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex justify-between text-xs">
          <span
            className={
              prefs.chill < 0.5 ? "font-semibold text-info" : "text-faint"
            }
          >
            Cut it close
          </span>
          <span
            className={
              prefs.chill >= 0.5 ? "font-semibold text-accent" : "text-faint"
            }
          >
            Chill & early
          </span>
        </div>
        <p className="text-xs leading-relaxed text-faint">
          {prefs.chill < 0.35
            ? "Minimise dead time — arrive lean and accept a livelier line."
            : prefs.chill > 0.65
              ? "Beat the surge with a comfortable cushion, even if it means waiting in your seat."
              : "A balanced trade-off between the security line and idle time."}
        </p>
      </Section>
    </div>
  );
}
