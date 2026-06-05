"use client";
import React from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Task, Intent, X, Check } from "@/components/ui/icons";

// ── PostCreatePromptBanner ────────────────────────────────────────────────
// Floating bottom-right confirmation surfaced after the TPA creates a
// task/intent from a multi-signal selection. Three actions, in priority
// order:
//
//   1. View task          — open the new wip detail
//   2. View source signals — apply the transient "source-of:<wipId>"
//                            filter so the Signals list narrows to those
//                            source signals
//   3. Keep selected      — re-assert the original selection so the
//                            user can run another bulk action (label,
//                            skip, etc.) on the same set
//
// Auto-dismisses after 20s (configured in store). Manually dismissible
// via the × close button. Doesn't block interaction — the Signals list
// stays clickable underneath.

export function PostCreatePromptBanner() {
  const {
    postCreatePrompt,
    dismissPostCreatePrompt,
    setRoute, openWip,
    selectAll, setSourceOfWipFilter,
  } = useStore();
  if (!postCreatePrompt) return null;

  const onViewTask = () => {
    const id = postCreatePrompt.wipId;
    dismissPostCreatePrompt();
    setRoute("wip");
    openWip(id);
  };
  const onViewSourceSignals = () => {
    setSourceOfWipFilter(postCreatePrompt.wipId);
    dismissPostCreatePrompt();
  };
  const onKeepSelected = () => {
    selectAll(postCreatePrompt.sourceSignalIds);
    dismissPostCreatePrompt();
  };

  const typeLabel = postCreatePrompt.type === "task" ? "Task" : "Intent";
  const sourceCount = postCreatePrompt.sourceSignalIds.length;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16, bottom: 16, zIndex: 800,
        width: "min(360px, calc(100vw - 32px))",
        background: "var(--bg)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 10,
        animation: "modalIn 0.18s ease",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 100,
          background: "var(--status-accepted)",
          color: "white", flexShrink: 0,
        }}>
          <Check size={12} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
            {typeLabel} created from {sourceCount} source signal{sourceCount === 1 ? "" : "s"}
          </div>
          <div style={{
            fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            “{postCreatePrompt.title}”
          </div>
        </div>
        <button
          onClick={dismissPostCreatePrompt}
          aria-label="Dismiss"
          style={{
            padding: 4, color: "var(--text-tertiary)",
            background: "transparent", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-sm)", marginLeft: 4, marginTop: -2,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <X size={12} />
        </button>
      </div>

      {/* Action buttons — primary first, then two secondaries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onViewTask}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: "var(--radius)",
            background: "var(--accent)", color: "white",
            border: "1px solid transparent",
            fontSize: "var(--fs-body)", fontWeight: 500,
            cursor: "pointer",
            justifyContent: "flex-start",
          }}
        >
          {postCreatePrompt.type === "task" ? <Task size={12} /> : <Intent size={12} />}
          View {postCreatePrompt.type === "task" ? "task" : "intent"}
        </button>
        <button
          onClick={onViewSourceSignals}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: "var(--radius)",
            background: "var(--bg)", color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: "var(--fs-body)", fontWeight: 500,
            cursor: "pointer",
            justifyContent: "flex-start",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          title="Filter the Signals list to show only the source signals"
        >
          View source signals
        </button>
        <button
          onClick={onKeepSelected}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: "var(--radius)",
            background: "var(--bg)", color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            fontSize: "var(--fs-body)", fontWeight: 500,
            cursor: "pointer",
            justifyContent: "flex-start",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          title="Re-select the same signals so you can run another action"
        >
          Keep selected
        </button>
      </div>
    </div>,
    document.body,
  );
}
