"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";

// The toast surfaces only the most recent N transactions still in their
// freshness window (managed by the store). Each toast offers Undo when the
// transaction is still safely undoable; degrades to a warning chip when
// only a partial revert is possible; disabled when the action can no longer
// be undone.

export function UndoToast() {
  const { transactions, toastTxIds, undoTransaction, dismissToast, getTxSafety } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (toastTxIds.length === 0) return null;

  const visible = toastTxIds
    .map(id => transactions.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && !t.undone);

  if (visible.length === 0) return null;

  const stack = visible.slice(-3);

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {stack.map((tx, i) => {
        const isTop = i === stack.length - 1;
        const safety = getTxSafety(tx);

        const undoBtnLabel =
          safety.state === "available"   ? "Undo" :
          safety.state === "warning"     ? "Undo anyway" :
          "Can't undo";

        const showCount = tx.affectedSignalIds.length > 1;

        const accentBg =
          safety.state === "warning" ? "rgba(234, 88, 12, 0.18)" :       // orange tint
          safety.state === "unavailable" ? "rgba(255,255,255,0.06)" :
          "rgba(255,255,255,0.14)";

        return (
          <div
            key={tx.id}
            style={{
              pointerEvents: "auto",
              background: "var(--text)",
              color: "#fff",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-lg)",
              padding: "10px 12px 10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 320,
              maxWidth: 520,
              fontSize: 13,
              opacity: isTop ? 1 : 0.55,
              transform: isTop ? "scale(1)" : `scale(${0.97 - (stack.length - 1 - i) * 0.02})`,
              transition: "transform 160ms ease, opacity 160ms ease",
              animation: isTop ? "slideUp 180ms ease-out" : undefined,
            }}
          >
            <div style={{ flex: 1, lineHeight: 1.35, display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                {tx.summary}
                {showCount && (
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                    ({tx.affectedSignalIds.length})
                  </span>
                )}
              </span>
              {safety.state === "warning" && (
                <span style={{
                  fontSize: 11,
                  color: "#fdba74",        // orange-300
                  lineHeight: 1.3,
                }}>
                  {safety.reason}
                </span>
              )}
              {safety.state === "unavailable" && (
                <span style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.3,
                }}>
                  {safety.reason}
                </span>
              )}
            </div>
            <button
              onClick={() => undoTransaction(tx.id)}
              disabled={safety.state === "unavailable"}
              title={safety.state === "warning" ? safety.reason : undefined}
              style={{
                background: accentBg,
                color: safety.state === "unavailable" ? "rgba(255,255,255,0.4)" : "#fff",
                padding: "5px 10px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.2,
                cursor: safety.state === "unavailable" ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {undoBtnLabel}
            </button>
            <button
              onClick={() => dismissToast(tx.id)}
              aria-label="Dismiss"
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 16,
                lineHeight: 1,
                padding: "2px 6px",
                marginRight: -4,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
