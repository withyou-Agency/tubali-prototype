"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Signal, suggestLabelsForSignal, recentlyUsedLabels } from "@/lib/data";
import { LabelChip } from "@/components/ui/label-chip";
import { LabelPicker } from "@/components/ui/label-picker";
import { StatusDot } from "@/components/ui/dot";
import { X, Tag, ChevronRight } from "@/components/ui/icons";

// ── SplitEditView ────────────────────────────────────────────────────────
// Wide modal that renders two signals in side-by-side editable panels so
// the user can split a long signal into two focused pieces in one pass.
//
// Each panel exposes inline-editable title + description + labels. Status,
// priority, source, and metadata stay read-only here — split is about
// trimming content; status changes belong in the regular modal.
//
// Driven by `splitView: { leftId, rightId } | null` in the store. Mounted
// at the app shell level so it overlays whichever page the user is on.

export function SplitEditView() {
  const { splitView, closeSplitView, signals } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on Esc.
  useEffect(() => {
    if (!splitView) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeSplitView(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [splitView, closeSplitView]);

  if (!mounted || !splitView) return null;

  const left  = signals.find(s => s.id === splitView.leftId);
  const right = signals.find(s => s.id === splitView.rightId);

  // If either side has been deleted out from under us, just bail. The user
  // can re-trigger split from a card if they want to retry.
  if (!left || !right) return null;

  return createPortal(
    <div
      onClick={closeSplitView}
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(15,23,42,0.45)",
        animation: "fadeIn 0.15s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Split signal"
        style={{
          width: "min(1100px, 100%)", maxHeight: "90vh",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "modalIn 0.18s ease",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              Split signal
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
              Edit each side. Trim what doesn&apos;t belong from the original on the left, and what doesn&apos;t belong from the new piece on the right.
            </p>
          </div>
          <button
            onClick={closeSplitView}
            style={{
              padding: "6px 10px", borderRadius: "var(--radius)",
              border: "1px solid var(--accent)",
              background: "var(--accent)", color: "white",
              fontSize: "var(--fs-meta)", fontWeight: 500, cursor: "pointer",
            }}
          >
            Done
          </button>
          <button
            onClick={closeSplitView}
            aria-label="Close"
            style={{
              padding: "4px 6px", borderRadius: "var(--radius)",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Side-by-side panels */}
        <div style={{
          flex: 1, minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          background: "var(--bg-sunken)",
        }}>
          <SplitPanel signal={left}  side="Original" />
          <div style={{ borderLeft: "1px solid var(--border)" }}>
            <SplitPanel signal={right} side="New piece" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── SplitPanel ────────────────────────────────────────────────────────────
// One side of the split editor. Title and description are inline-editable
// textareas (auto-save on blur); labels use the existing LabelPicker; the
// metadata row is read-only.

function SplitPanel({ signal, side }: { signal: Signal; side: string }) {
  const { updateSignal, signals } = useStore();
  const [titleDraft, setTitleDraft] = useState(signal.title);
  const [descDraft,  setDescDraft]  = useState(signal.description);
  const [showPicker, setShowPicker] = useState(false);

  // Sync local drafts when the underlying signal changes from outside (e.g.
  // a label edit on the other panel re-renders this one). We only push
  // local state on field-level edits; otherwise mirror the source.
  useEffect(() => { setTitleDraft(signal.title); }, [signal.title]);
  useEffect(() => { setDescDraft(signal.description); }, [signal.description]);

  const allLabels = Array.from(new Set(signals.flatMap(s => s.labels)));
  const suggestions = suggestLabelsForSignal(signal, signals)
    .filter(l => !signal.labels.includes(l)).slice(0, 4);
  const recent = recentlyUsedLabels(signals);

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== signal.title) updateSignal(signal.id, { title: next });
    else if (!next) setTitleDraft(signal.title);
  };
  const saveDesc = () => {
    if (descDraft !== signal.description) updateSignal(signal.id, { description: descDraft });
  };
  const toggleLabel = (label: string) => {
    const next = signal.labels.includes(label)
      ? signal.labels.filter(l => l !== label)
      : [...signal.labels, label];
    updateSignal(signal.id, { labels: next });
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", minHeight: 0,
      background: "var(--bg)",
    }}>
      {/* Side header */}
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          {side}
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {signal.id}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <StatusDot status={signal.status} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
            {signal.status}
          </span>
        </span>
      </div>

      {/* Editable body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px 24px" }}>
        {/* Title */}
        <textarea
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          placeholder="Title"
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box",
            fontSize: 16, fontWeight: 600, lineHeight: 1.3,
            color: "var(--text)",
            padding: "6px 8px", marginBottom: 10,
            border: "1px solid transparent", borderRadius: "var(--radius)",
            background: "transparent", resize: "vertical", outline: "none",
            transition: "border-color 0.1s, background 0.1s",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg)"; }}
        />

        {/* Description */}
        <textarea
          value={descDraft}
          onChange={e => setDescDraft(e.target.value)}
          onBlur={saveDesc}
          placeholder="Description"
          rows={8}
          style={{
            width: "100%", boxSizing: "border-box",
            fontSize: "var(--fs-body)", lineHeight: 1.55,
            color: "var(--text-secondary)",
            padding: "8px 10px", marginBottom: 14,
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            background: "var(--bg-sunken)", resize: "vertical", outline: "none",
            transition: "border-color 0.1s, background 0.1s",
            whiteSpace: "pre-wrap",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg)"; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-sunken)"; }}
        />

        {/* Labels */}
        <div>
          <div style={{
            fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
            marginBottom: 6, display: "flex", alignItems: "center", gap: 4,
          }}>
            <Tag size={12} /> Labels
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {signal.labels.map(l => (
              <LabelChip key={l} label={l} onRemove={() => toggleLabel(l)} />
            ))}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowPicker(o => !o)}
                style={{
                  padding: "2px 7px", fontSize: "var(--fs-meta)",
                  border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
                  background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
                }}
              >
                + Add label
              </button>
              {showPicker && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200 }}>
                  <LabelPicker
                    allLabels={allLabels}
                    activeLabels={signal.labels}
                    onToggle={toggleLabel}
                    onClose={() => setShowPicker(false)}
                    suggestions={suggestions}
                    recentLabels={recent}
                    width={240}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hint footer for the original side */}
        {side === "Original" && (
          <div style={{
            marginTop: 18, padding: "8px 10px",
            borderRadius: "var(--radius)",
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-tertiary)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <ChevronRight size={11} />
            Move what doesn&apos;t belong to the right.
          </div>
        )}
      </div>
    </div>
  );
}
