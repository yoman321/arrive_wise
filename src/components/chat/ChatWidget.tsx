"use client";

// Always-on chat launcher, pinned bottom-right through any scroll. The fan talks
// to ArriveWise's assistant (Featherless LLM at /api/chat); when a reply carries a
// built scenario, we lift the resulting TripPlan up so the dashboard re-renders on
// it live. Purely a *view* onto the shared plan model — no new engine params.

import { useEffect, useRef, useState } from "react";
import type { TripPlan } from "@/components/onboarding/types";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMsg = {
  role: "assistant",
  content:
    "Hi! Tell me which World Cup match you're headed to and roughly where you're leaving from — I'll work out the smartest time to go. (e.g. \"driving from downtown Dallas for the semi-final, want to be there for the anthems, budget around $120\")",
};

export default function ChatWidget({
  currentPlan,
  onScenario,
}: {
  // The live dashboard plan — sent each turn so the assistant adjusts what's on
  // screen ("too early", "cheaper"), including edits made with the sliders.
  currentPlan: TripPlan;
  onScenario: (plan: TripPlan) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Drop the canned greeting; include the plan currently on the dashboard.
      body: JSON.stringify({
        messages: next.slice(1),
        currentPlan,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { reply?: string; scenario?: { plan: TripPlan } }) => {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.reply ?? "Sorry — I didn't catch that. Try again?",
          },
        ]);
        if (data.scenario?.plan) onScenario(data.scenario.plan);
      })
      .catch(() => {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "I hit a snag reaching the planner. Give it another go in a moment.",
          },
        ]);
      })
      .finally(() => setBusy(false));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[min(30rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl sm:right-6">
          <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-sm">
              ⚽
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-text">Plan with AI</p>
              <p className="text-[11px] leading-tight text-faint">
                ArriveWise assistant
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-bg-soft hover:text-text"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-accent text-bg"
                      : "bg-bg-soft text-text"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-bg-soft px-3 py-2 text-[13px] text-muted">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">·</span>
                    <span className="animate-bounce [animation-delay:0.15s]">·</span>
                    <span className="animate-bounce [animation-delay:0.3s]">·</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border-soft p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Describe your trip…"
                className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border-soft bg-bg px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-accent"
              />
              <button
                onClick={send}
                disabled={busy || !draft.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launcher — always visible, always bottom-right */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat assistant"}
        className="fixed bottom-6 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-accent text-2xl text-bg shadow-lg shadow-black/30 transition-transform hover:scale-105 active:scale-95 sm:right-6"
      >
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
