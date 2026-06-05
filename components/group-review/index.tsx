"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Signal, SignalStatus, deriveDigest, userById } from "@/lib/data";
import { StatusDot } from "@/components/ui/dot";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/label-chip";
import { X } from "@/components/ui/icons";

export function GroupReviewModal({
  signalIds,
  onClose,
}: {
  signalIds: string[];
  onClose: () => void;
}) {
  const { signals, updateSignal, bulkUpdateSignalStatus } = useStore();
  const [activeId, setActiveId] = useState<string>(signalIds[0]);
  const [mounted, setMounted]   = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  const selected = signals.filter(s => signalIds.includes(s.id));
  const active   = selected.find(s => s.id === activeId) ?? selected[0];
  if (!active) return null;

  const author = userById(active.author);
  const digest = active.digest ?? deriveDigest(active, signals);

  const setStatusForActive = (status: SignalStatus) => {
    updateSignal(active.id, { status });
  };

  const setStatusForAll = (status: SignalStatus) => {
    bulkUpdateSignalStatus(signalIds, status);
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-tertiary)",
    marginBottom: 8,
  };

  const aiBadge = (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 100,
      background: "var(--accent-soft)", color: "var(--accent)",
      fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
      marginRight: 6,
    }}>AI</span>
  );

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "var(--bg)",
        display: "flex", flexDirection: "column",
        animation: "fadeIn 0.15s ease",
      }}
    >
      {/* Top bar */}
      <div style={{
        height: 48, padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
          Group review
        </span>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          · {signalIds.length} signal{signalIds.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setStatusForAll("ready")}
          style={{
            padding: "5px 11px", borderRadius: "var(--radius)",
            background: "var(--status-ready)", color: "white",
            fontSize: 12, fontWeight: 500,
          }}
        >
          Mark all Ready
        </button>
        <button
          onClick={() => setStatusForAll("rejected")}
          style={{
            padding: "5px 11px", borderRadius: "var(--radius)",
            background: "var(--bg)", color: "var(--text)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
          }}
        >
          Reject all
        </button>
        <button
          onClick={onClose}
          aria-label="Close group review"
          style={{ padding: 6, color: "var(--text-secondary)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Workspace */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left sidebar — signal list */}
        <aside style={{
          width: 260, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-sunken)",
          overflowY: "auto",
        }}>
          <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Signals in this review
          </div>
          {selected.map(s => {
            const isActive = s.id === active.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "8px 12px", width: "100%",
                  background: isActive ? "var(--bg-selected)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  textAlign: "left",
                }}
              >
                <StatusDot status={s.status} />
                <span style={{
                  fontSize: 13, color: "var(--text)",
                  fontWeight: isActive ? 500 : 400,
                  lineHeight: 1.35,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  flex: 1,
                }}>
                  {s.title}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Main editable area */}
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 28px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <StatusDot status={active.status} />
            <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{active.status}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>·</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{active.id}</span>
          </div>

          <input
            value={active.title}
            onChange={e => updateSignal(active.id, { title: e.target.value })}
            style={{
              width: "100%", border: "none", outline: "none",
              fontSize: 20, fontWeight: 600, color: "var(--text)",
              padding: "4px 0", marginBottom: 6, background: "transparent",
            }}
          />

          <textarea
            value={active.description}
            onChange={e => updateSignal(active.id, { description: e.target.value })}
            rows={6}
            style={{
              width: "100%", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "10px 12px",
              fontSize: "var(--fs-body)", color: "var(--text-secondary)",
              lineHeight: 1.55, background: "var(--bg)", resize: "vertical",
              outline: "none", marginBottom: 14,
            }}
          />

          {/* Per-signal status quick switch */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["new", "accepted", "ready", "rejected", "closed"] as SignalStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusForActive(s)}
                style={{
                  padding: "4px 10px", borderRadius: 100,
                  border: "1px solid var(--border-strong)",
                  background: active.status === s ? "var(--bg-selected)" : "var(--bg)",
                  fontWeight: active.status === s ? 500 : 400,
                  fontSize: 12, textTransform: "capitalize",
                  color: "var(--text)",
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Labels + author */}
          <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {active.labels.map(l => <LabelChip key={l} label={l} />)}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <Avatar userId={active.author} size="sm" />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{author.name}</span>
            </span>
          </div>
        </main>

        {/* Right sidebar — AI digest */}
        <aside style={{
          width: 300, flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          padding: "16px 18px",
          overflowY: "auto",
        }}>
          <div style={sectionTitle}>{aiBadge}Assessment</div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
            {digest.summary}
          </p>
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {digest.assessment}
          </p>

          {digest.suggestedLabels.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={sectionTitle}>Suggested labels</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {digest.suggestedLabels.map(label => (
                  <button
                    key={label}
                    onClick={() => {
                      if (active.labels.includes(label)) return;
                      updateSignal(active.id, { labels: [...active.labels, label] });
                    }}
                    style={{
                      fontSize: 12, padding: "3px 8px",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: 100, background: "var(--bg)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    + #{label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {digest.relatedCandidates.length > 0 && (
            <div>
              <div style={sectionTitle}>Possible related</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {digest.relatedCandidates.map(id => {
                  const c = signals.find(s => s.id === id);
                  if (!c) return null;
                  return (
                    <div key={id} style={{
                      padding: "6px 8px", border: "1px solid var(--border)",
                      borderRadius: "var(--radius)", fontSize: 12,
                      display: "flex", gap: 6, alignItems: "flex-start",
                    }}>
                      <StatusDot status={c.status} />
                      <span style={{ color: "var(--text)", lineHeight: 1.4 }}>{c.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
}
