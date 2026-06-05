"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Transaction, UndoSafety, userById } from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { SearchInput } from "@/components/ui/search-input";
import { relTime, absDate } from "@/lib/time";

// ── HistoryPage ─────────────────────────────────────────────────────────────
// App-wide action history: every recorded transaction across signals.
// Filter chips narrow by undo state (available / warning / unavailable / undone).
// Search filters by summary text or actor name. Clicking a row with a single
// affected signal opens that signal in the modal.

type FilterKey = "all" | "available" | "warning" | "unavailable" | "undone";

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "available",   label: "Undoable" },
  { id: "warning",     label: "Caution" },
  { id: "unavailable", label: "Locked" },
  { id: "undone",      label: "Undone" },
];

export function HistoryPage() {
  const { transactions, getTxSafety, undoTransaction, openSignal, setRoute } = useStore();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery]   = useState("");

  // Newest-first feed; precompute safety once per row so filter chips and
  // the action button stay in sync.
  // Defensive dedupe: if upstream state ever ends up with two transactions
  // sharing the same id (e.g. a stale dev-mode inconsistency), keep only
  // the first occurrence so React keys never collide.
  const decorated = useMemo(
    () => {
      const seen = new Set<string>();
      const out: { tx: Transaction; safety: UndoSafety }[] = [];
      const ordered = transactions.slice().reverse();
      for (const tx of ordered) {
        if (seen.has(tx.id)) continue;
        seen.add(tx.id);
        out.push({ tx, safety: getTxSafety(tx) });
      }
      return out;
    },
    [transactions, getTxSafety],
  );

  const counts = useMemo(() => {
    const c = { all: decorated.length, available: 0, warning: 0, unavailable: 0, undone: 0 };
    for (const { tx, safety } of decorated) {
      if (tx.undone) { c.undone++; continue; }
      if (safety.state === "available")   c.available++;
      else if (safety.state === "warning") c.warning++;
      else                                  c.unavailable++;
    }
    return c;
  }, [decorated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decorated.filter(({ tx, safety }) => {
      // Filter chip
      if (filter === "undone" && !tx.undone) return false;
      if (filter !== "all" && filter !== "undone") {
        if (tx.undone) return false;
        if (safety.state !== filter) return false;
      }
      // Search
      if (q) {
        const actor = userById(tx.actor).name.toLowerCase();
        if (!tx.summary.toLowerCase().includes(q) && !actor.includes(q)) return false;
      }
      return true;
    });
  }, [decorated, filter, query]);

  // Group by day (Today, Yesterday, MMM DD)
  const grouped = useMemo(() => {
    const out: { label: string; rows: typeof filtered }[] = [];
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date(today.getTime() - 86400000));
    for (const row of filtered) {
      const d = startOfDay(new Date(row.tx.timestamp));
      const label =
        d.getTime() === today.getTime()     ? "Today" :
        d.getTime() === yesterday.getTime() ? "Yesterday" :
        d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else out.push({ label, rows: [row] });
    }
    return out;
  }, [filtered]);

  const handleOpenSignal = (tx: Transaction) => {
    if (tx.affectedSignalIds.length === 1) {
      setRoute("signals");
      openSignal(tx.affectedSignalIds[0]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-sunken)" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search history…" />

        <span style={{ width: 1, height: 18, background: "var(--border)" }} />

        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            const count = counts[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 28, padding: "0 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: active ? "var(--accent-soft)" : "var(--bg)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: "var(--fs-meta)",
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--bg)"; }}
              >
                {f.label}
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 16, padding: "0 5px",
                  borderRadius: 100,
                  background: active ? "var(--bg)" : "var(--bg-sunken)",
                  border: "1px solid var(--border)",
                  fontSize: 11, color: "var(--text-secondary)",
                  fontFamily: "JetBrains Mono, ui-monospace, monospace",
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
          {filtered.length} of {transactions.length}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 16px 80px" }}>
        {filtered.length === 0 ? (
          <div style={{
            margin: "60px auto", maxWidth: 320, textAlign: "center",
            color: "var(--text-tertiary)", fontSize: "var(--fs-body)",
          }}>
            {transactions.length === 0
              ? "No actions yet. As you change signals, hide them, or create work items, every action will appear here with an Undo option."
              : "No actions match the current filters."}
          </div>
        ) : (
          <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {grouped.map(group => (
              <div key={group.label}>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
                  textTransform: "uppercase", color: "var(--text-tertiary)",
                  marginBottom: 6, paddingLeft: 4,
                }}>
                  {group.label}
                </div>
                <div style={{
                  display: "flex", flexDirection: "column",
                  background: "var(--bg)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}>
                  {group.rows.map(({ tx, safety }, i) => (
                    <HistoryItem
                      key={tx.id}
                      tx={tx}
                      safety={safety}
                      isLast={i === group.rows.length - 1}
                      onUndo={() => undoTransaction(tx.id)}
                      onOpen={() => handleOpenSignal(tx)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single row ─────────────────────────────────────────────────────────────

function HistoryItem({
  tx, safety, isLast, onUndo, onOpen,
}: {
  tx: Transaction;
  safety: UndoSafety;
  isLast: boolean;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const actor = userById(tx.actor);
  const isBulk = tx.affectedSignalIds.length > 1;
  const canOpen = tx.affectedSignalIds.length === 1;

  const buttonLabel =
    tx.undone                          ? "Undone"     :
    safety.state === "available"       ? "Undo"       :
    safety.state === "warning"         ? "Undo anyway" :
                                         "Can't undo";

  const buttonColor =
    tx.undone                          ? "var(--text-tertiary)" :
    safety.state === "available"       ? "var(--accent)"        :
    safety.state === "warning"         ? "#c2410c"              :
                                         "var(--text-tertiary)";

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "10px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        background: tx.undone ? "var(--bg-sunken)" : "var(--bg)",
        opacity: tx.undone ? 0.7 : 1,
        cursor: canOpen ? "pointer" : "default",
        transition: "background 0.1s",
      }}
      onClick={(e) => {
        // Don't navigate when the user clicks the Undo button.
        if ((e.target as HTMLElement).closest("[data-undo-btn]")) return;
        if (canOpen) onOpen();
      }}
      onMouseEnter={e => { if (canOpen && !tx.undone) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!tx.undone) e.currentTarget.style.background = "var(--bg)"; }}
    >
      <Avatar userId={tx.actor} size="sm" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.4 }}>
          <span style={{ fontWeight: 500 }}>{actor.name}</span>
          {" "}
          <span style={{ color: "var(--text-secondary)" }}>{tx.summary}</span>
          {isBulk && (
            <span style={{
              marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 100,
              background: "var(--bg-sunken)", color: "var(--text-tertiary)",
              border: "1px solid var(--border)", fontWeight: 500,
            }}>
              {tx.affectedSignalIds.length} signals
            </span>
          )}
          {tx.undone && (
            <span style={{
              marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 100,
              background: "var(--bg-sunken)", color: "var(--text-tertiary)",
              border: "1px solid var(--border)", fontWeight: 500,
            }}>
              Undone
            </span>
          )}
        </div>

        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span title={absDate(tx.timestamp)}>{relTime(tx.timestamp)}</span>
          <span style={{ color: "var(--text-tertiary)" }}>·</span>
          <span style={{ textTransform: "capitalize" }}>{tx.action.replace(/_/g, " ")}</span>
          {!tx.undone && safety.state === "warning" && (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ color: "#c2410c" }}>⚠ {safety.reason}</span>
            </>
          )}
          {!tx.undone && safety.state === "unavailable" && (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span>{safety.reason}</span>
            </>
          )}
        </div>
      </div>

      <button
        data-undo-btn
        onClick={(e) => {
          e.stopPropagation();
          if (tx.undone || safety.state === "unavailable") return;
          onUndo();
        }}
        disabled={tx.undone || safety.state === "unavailable"}
        title={safety.state === "warning" ? safety.reason : undefined}
        style={{
          fontSize: 11,
          color: buttonColor,
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "4px 10px",
          cursor: (tx.undone || safety.state === "unavailable") ? "not-allowed" : "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
          fontWeight: 500,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
