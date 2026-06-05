"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Signal, SPLIT_MAX_PER_SOURCE, splitChildrenCount } from "@/lib/data";
import { X, Plus, Check } from "@/components/ui/icons";

// ── SplitSignalModal ──────────────────────────────────────────────────────
// Prepare-then-confirm modal for splitting one raw signal into multiple
// clearer child signals. NOTHING is created until the user clicks
// "Split into N signals" — Cancel discards every draft cleanly so the
// original signal is untouched.
//
// Rules embedded in the UI:
//   • 2 pieces minimum (the point of split is multiplicity)
//   • SPLIT_MAX_PER_SOURCE total per lineage root (existing children + new)
//   • Title pre-fills as "<root.title> (n)" — fully editable
//   • Description starts empty; user pastes / writes the slice that belongs
//   • Optional TPA note per piece (creates the child's own tpaNote)
//   • Removing the original is NOT an option here — splitting never
//     edits / deletes / closes the source. If the user wants to close
//     the original afterwards they do that separately.

type Draft = {
  id: string;          // local-only react key
  title: string;
  description: string;
  tpaNote: string;
  noteOpen: boolean;   // local UI: show the TPA-note input?
};

const MIN_PIECES = 2;

function makeDraftId(): string {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function freshDrafts(root: Signal, count = 2): Draft[] {
  return Array.from({ length: count }, (_, i) => ({
    id: makeDraftId(),
    title: `${root.title} (${i + 1})`,
    description: "",
    tpaNote: "",
    noteOpen: false,
  }));
}

export function SplitSignalModal({
  signalId,
  onClose,
}: {
  signalId: string;
  onClose: () => void;
}) {
  const { signals, splitSignal, openSignal } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const root = signals.find(s => s.id === signalId);
  const [drafts, setDrafts] = useState<Draft[]>(() => root ? freshDrafts(root) : []);

  // Re-seed drafts if the user lands on a different root mid-session.
  useEffect(() => {
    if (root) setDrafts(freshDrafts(root));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalId]);

  // Esc to close.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!mounted || !root) return null;

  // Lineage cap math — root.splitFromId always points at the original
  // root, so chained splits still share the same cap.
  const lineageRoot = root.splitFromId ?? root.id;
  const existingChildren = splitChildrenCount(signals, lineageRoot);
  const remaining = Math.max(0, SPLIT_MAX_PER_SOURCE - existingChildren);
  const canAddMore = drafts.length < remaining;

  const updateDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  const removeDraft = (id: string) =>
    setDrafts(prev => prev.length > MIN_PIECES ? prev.filter(d => d.id !== id) : prev);
  const addDraft = () => {
    if (!canAddMore) return;
    setDrafts(prev => [...prev, {
      id: makeDraftId(),
      title: `${root.title} (${prev.length + 1})`,
      description: "",
      tpaNote: "",
      noteOpen: false,
    }]);
  };

  const allValid =
    drafts.length >= MIN_PIECES &&
    drafts.every(d => d.title.trim().length > 0);

  const handleConfirm = () => {
    if (!allValid) return;
    const ids = splitSignal(root.id, drafts.map(d => ({
      title: d.title,
      description: d.description,
      tpaNote: d.tpaNote.trim() || undefined,
    })));
    onClose();
    // Focus the first new child so the user lands in the result.
    if (ids.length > 0) openSignal(ids[0]);
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        background: "var(--bg-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.15s ease",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Split signal"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "88vh",
          background: "var(--bg)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "modalIn 0.18s ease",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Split signal
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            · {drafts.length} piece{drafts.length === 1 ? "" : "s"} drafted
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            aria-label="Cancel"
            style={{ padding: 6, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px" }}>
          {/* Read-only source card so the TPA can copy slices out */}
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius)",
            background: "var(--bg-sunken)", border: "1px solid var(--border)",
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              Original signal — preserved unchanged
            </div>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>
              {root.title}
            </div>
            {root.description && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {root.description}
              </div>
            )}
          </div>

          {/* Drafts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {drafts.map((d, idx) => (
              <DraftCard
                key={d.id}
                index={idx}
                draft={d}
                canRemove={drafts.length > MIN_PIECES}
                onChange={(patch) => updateDraft(d.id, patch)}
                onRemove={() => removeDraft(d.id)}
              />
            ))}
          </div>

          {/* Add piece + cap hint */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={addDraft}
              disabled={!canAddMore}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: "var(--radius)",
                border: "1px dashed var(--border-strong)",
                background: "var(--bg)",
                color: canAddMore ? "var(--text-secondary)" : "var(--text-disabled)",
                fontSize: "var(--fs-meta)", fontWeight: 500,
                cursor: canAddMore ? "pointer" : "not-allowed",
              }}
            >
              <Plus size={11} /> Add another piece
            </button>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {drafts.length} of up to {remaining} {existingChildren > 0 ? `(${existingChildren} already exist)` : ""}
            </span>
          </div>

          <div style={{
            marginTop: 14, fontSize: 11, color: "var(--text-tertiary)",
            lineHeight: 1.55,
          }}>
            The original signal stays untouched. Each new piece becomes its own signal with status “new” and inherits labels, priority, source, and author. You can add a TPA note per piece if it helps the next reader.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Cancel discards every draft — the original signal is never changed.
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "5px 12px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text-secondary)", fontSize: "var(--fs-meta)", fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allValid}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 14px", borderRadius: "var(--radius)",
              border: "none",
              background: allValid ? "var(--accent)" : "var(--bg-sunken)",
              color: allValid ? "white" : "var(--text-disabled)",
              fontSize: "var(--fs-meta)", fontWeight: 600,
              cursor: allValid ? "pointer" : "not-allowed",
            }}
          >
            <Check size={11} /> Split into {drafts.length} signal{drafts.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── DraftCard ─────────────────────────────────────────────────────────────
// One row per draft child. Title required; description optional; TPA note
// toggled in via "+ TPA note" so the surface stays compact for short
// splits.

function DraftCard({
  index, draft, canRemove, onChange, onRemove,
}: {
  index: number;
  draft: Draft;
  canRemove: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{
      padding: "10px 12px",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      background: "var(--bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Piece {index + 1}
        </span>
        <span style={{ flex: 1 }} />
        {canRemove && (
          <button
            onClick={onRemove}
            title="Discard this draft piece"
            aria-label="Remove draft"
            style={{
              padding: "2px 6px", borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      <input
        value={draft.title}
        onChange={e => onChange({ title: e.target.value })}
        placeholder={`Title for piece ${index + 1}…`}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "6px 9px", marginBottom: 6,
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
          background: "var(--bg)", color: "var(--text)",
          fontSize: "var(--fs-body)", fontWeight: 500, outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
      />

      <textarea
        value={draft.description}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Description (paste the part of the original that belongs to this piece, or write your own)…"
        rows={2}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "6px 9px",
          border: "1px solid var(--border)", borderRadius: "var(--radius)",
          background: "var(--bg)", color: "var(--text)",
          fontSize: 12, lineHeight: 1.5, resize: "vertical", outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border)")}
      />

      {/* Optional TPA note. Hidden until the user opts in to keep the
          draft card compact when extra context isn't needed. */}
      {!draft.noteOpen ? (
        <button
          onClick={() => onChange({ noteOpen: true })}
          style={{
            marginTop: 6, padding: "2px 6px",
            background: "transparent", border: "none",
            fontSize: 10.5, color: "#7c3aed", cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + Add TPA note for this piece
        </button>
      ) : (
        <div style={{
          marginTop: 8, paddingLeft: 8,
          borderLeft: "2px solid #7c3aed",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
            textTransform: "uppercase", color: "#7c3aed", marginBottom: 3,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            TPA note (optional, internal)
            <button
              onClick={() => onChange({ noteOpen: false, tpaNote: "" })}
              title="Remove TPA note for this piece"
              style={{
                padding: "1px 5px", background: "transparent", border: "none",
                fontSize: 10, color: "var(--text-tertiary)", cursor: "pointer",
              }}
            >
              hide
            </button>
          </div>
          <textarea
            value={draft.tpaNote}
            onChange={e => onChange({ tpaNote: e.target.value })}
            placeholder="Add TPA context or clarification for this piece…"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 9px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: 12, fontStyle: "italic", lineHeight: 1.5,
              resize: "vertical", outline: "none",
            }}
            onFocus={e => (e.target.style.borderColor = "#7c3aed")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
      )}
    </div>
  );
}
