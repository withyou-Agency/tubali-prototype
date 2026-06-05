"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  Signal, Wip, WipColumn, WipComment, WipAttachment, WipEvent, Sprint,
  SignalAttachment, Visibility, USERS, userById,
  hoursInProgress, formatHoursDuration,
  isDuplicateGroupNewOrChanged, findDuplicateGroupForSignal,
  IMPLEMENTATION_STATUS_LABEL, DEPLOYMENT_STATUS_LABEL,
  daysInCurrentColumn,
} from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/dot";
import { Task, Intent, Plus, X, Link, ChevronDown, ChevronRight, Check, Copy } from "@/components/ui/icons";
import { SignalModal } from "@/components/signal-modal";
import { relTime, absDate } from "@/lib/time";

// ── small icon helpers ─────────────────────────────────────────────────────
function CommentIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5l-3 2V3a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
function PaperclipIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5 7 11.5A3.5 3.5 0 0 1 2 7l5-5a2.5 2.5 0 0 1 3.5 3.5L5.5 10A1.5 1.5 0 0 1 3.5 8l4.5-4.5" />
    </svg>
  );
}
function EyeIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  );
}
function EyeOffIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l10 10M5.5 5.5A2 2 0 0 0 9 9m-5.5-5.5C2.5 4.5 1 7 1 7s2.5 4 6 4a6 6 0 0 0 2.5-.55M9 9s1-1 2-2" />
    </svg>
  );
}
function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <span style={{ fontSize: 14 }}>🖼</span>;
  if (mimeType === "application/pdf") return <span style={{ fontSize: 14 }}>📄</span>;
  if (mimeType === "text/csv") return <span style={{ fontSize: 14 }}>📊</span>;
  if (mimeType.startsWith("video/")) return <span style={{ fontSize: 14 }}>🎬</span>;
  return <span style={{ fontSize: 14 }}>📎</span>;
}

// ── TypeChip ───────────────────────────────────────────────────────────────
function TypeChip({ type }: { type: "task" | "intent" }) {
  const isTask = type === "task";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: "var(--radius-sm)",
      fontSize: 11, fontWeight: 600,
      background: isTask ? "rgba(124,58,237,0.12)" : "rgba(14,165,233,0.12)",
      color: isTask ? "var(--task)" : "var(--intent)",
      border: `1px solid ${isTask ? "rgba(124,58,237,0.3)" : "rgba(14,165,233,0.3)"}`,
    }}>
      {isTask ? <Task size={10} /> : <Intent size={10} />}
      {isTask ? "Task" : "Intent"}
    </span>
  );
}

// ── Visibility badge ───────────────────────────────────────────────────────
function VisibilityBadge({ v }: { v: Visibility }) {
  const isClient = v === "client";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 5px", borderRadius: 100,
      fontSize: 10.5, fontWeight: 500,
      background: isClient ? "#f0fdf4" : "var(--bg-sunken)",
      color: isClient ? "#15803d" : "var(--text-tertiary)",
      border: `1px solid ${isClient ? "#bbf7d0" : "var(--border)"}`,
    }}>
      {isClient ? <EyeIcon /> : <EyeOffIcon />}
      {isClient ? "Client" : "Internal"}
    </span>
  );
}

// ── VisibilityToggle ───────────────────────────────────────────────────────
function VisibilityToggle({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        borderRadius: 100,
        overflow: "hidden",
      }}
    >
      {(["internal", "client"] as Visibility[]).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 8px",
            fontSize: 11, fontWeight: 500,
            background: value === v ? (v === "client" ? "#f0fdf4" : "var(--bg-hover)") : "transparent",
            color: value === v ? (v === "client" ? "#15803d" : "var(--text)") : "var(--text-tertiary)",
            transition: "all 0.1s",
          }}
        >
          {v === "client" ? <EyeIcon /> : <EyeOffIcon />}
          {v === "client" ? "Client" : "Internal"}
        </button>
      ))}
    </span>
  );
}

// Pretty-print a WipColumn for display badges and activity log entries.
function prettyColumn(c?: WipColumn): string {
  if (!c) return "";
  if (c === "to_do")        return "To Do";
  if (c === "in_progress")  return "In Progress";
  if (c === "done")         return "Done";
  if (c === "backlog")      return "Backlog";
  return c;
}

// One-line summary of a WIP event for the small "moved recently" badge on
// cards and the row text in the Activity tab.
function describeWipEvent(e: WipEvent): string {
  if (e.kind === "created")       return `New in ${prettyColumn(e.toColumn)}`;
  if (e.kind === "reopened")      return `Reopened`;
  if (e.kind === "signal_linked") return e.unlinked ? `Source signal removed` : `Source signal added`;
  if (e.kind === "needs_review")        return `Marked Needs review`;
  if (e.kind === "reviewed_looks_good") return `Reviewed — Looks good`;
  if (e.kind === "reviewed_follow_up")  return `Reviewed — Follow-up needed`;
  if (e.kind === "follow_up_created") {
    const k = e.followUpKind ?? "item";
    return `Follow-up ${k} created`;
  }
  if (e.kind === "linked_signals_closed") {
    const n = e.closedSignalCount ?? 0;
    return `${n} linked signal${n === 1 ? "" : "s"} closed`;
  }
  if (e.kind === "attachment_added") {
    return e.attachmentName ? `Attached ${e.attachmentName}` : `Attachment added`;
  }
  if (e.kind === "assignee_changed") {
    const fromName = e.fromAssignee ? userById(e.fromAssignee).name : null;
    const toName   = e.toAssignee   ? userById(e.toAssignee).name   : null;
    if (!fromName && toName)  return `Assigned to ${toName}`;
    if (fromName && !toName)  return `Unassigned`;
    if (fromName && toName)   return `Assignee changed to ${toName}`;
    return `Assignee updated`;
  }
  // moved
  return `Moved to ${prettyColumn(e.toColumn)}`;
}

// Among `events`, return the latest one for `wipId` whose `at` is strictly
// newer than `since`. Returns null if nothing fresh — that's the signal to
// the UI to render the card as a regular un-highlighted card.
function latestEventSince(events: WipEvent[], wipId: string, since: string | null): WipEvent | null {
  if (!since) return null;
  const sinceMs = new Date(since).getTime();
  let best: WipEvent | null = null;
  for (const ev of events) {
    if (ev.wipId !== wipId) continue;
    if (new Date(ev.at).getTime() <= sinceMs) continue;
    if (!best || new Date(ev.at).getTime() > new Date(best.at).getTime()) best = ev;
  }
  return best;
}

// Set of WIP ids with at least one event after `since`. Used by:
//  - Sprint update badges ("Sprint 14 · 3 updates")
//  - Backlog rail update badge
//  - "Show changes since last visit" mode (board filter)
//  - Auto-expand collapsed sprints when they have updates
function freshWipIdSet(events: WipEvent[], since: string | null): Set<string> {
  const out = new Set<string>();
  if (!since) return out;
  const sinceMs = new Date(since).getTime();
  for (const ev of events) {
    if (new Date(ev.at).getTime() > sinceMs) out.add(ev.wipId);
  }
  return out;
}

// ── WipCard ────────────────────────────────────────────────────────────────
function WipCard({ wip, onClick }: { wip: Wip; onClick: () => void }) {
  const { selectedWipId, wipComments, wipAttachments, appMode, wipEvents, clientPreviousVisitAt, duplicateGroups, signals, moveWipUp, moveWipDown } = useStore();
  const selected = selectedWipId === wip.id;
  const isDone = wip.column === "done";
  const commentCount = wipComments.filter(c => c.wipId === wip.id).length;
  const attachCount = wipAttachments.filter(a => a.wipId === wip.id).length;
  const readOnly = appMode === "client";
  // Manual ordering is only meaningful in upstream columns where the user
  // chooses sequence (Backlog + To Do). In Progress / Done are sorted by
  // event order; we don't expose the arrows there.
  const canManualOrder = !readOnly && (wip.column === "backlog" || wip.column === "to_do");

  // "New matching signal" indicator — true when ANY of this wip's linked
  // signals is part of an unseen / changed duplicate suggestion. Lets the
  // person working know fresh duplicate context arrived without forcing
  // them to open the modal.
  const hasNewMatchingSignal = wip.linkedSignals.some(sigId => {
    const g = findDuplicateGroupForSignal(duplicateGroups, sigId);
    return g && !g.confirmed && isDuplicateGroupNewOrChanged(g);
  });

  // Conflict warning — a wip is still upstream (backlog / to_do / in
  // progress) but ALL of its open linked signals have been rejected. The
  // wip likely shouldn't continue without review.
  const isUpstream = wip.column === "backlog" || wip.column === "to_do" || wip.column === "in_progress";
  const linkedSignalRows = wip.linkedSignals
    .map(sid => signals.find(s => s.id === sid))
    .filter((s): s is Signal => !!s);
  const allLinkedRejected =
    isUpstream &&
    linkedSignalRows.length > 0 &&
    linkedSignalRows.every(s => s.status === "rejected");

  // "Recently changed" indicator — only computed in client mode against the
  // visit snapshot; team view sees the stock card.
  const freshEvent = readOnly
    ? latestEventSince(wipEvents, wip.id, clientPreviousVisitAt)
    : null;
  const isFresh = !!freshEvent;

  // ── In-progress duration ───────────────────────────────────────────────
  // Plain elapsed-time pill on In Progress cards. Not a deadline — we no
  // longer enforce a 1-day SLA. The helper walks the event log filtered by
  // id, so re-renders are cheap.
  const inProgHours = wip.column === "in_progress"
    ? hoursInProgress(wip, wipEvents)
    : null;
  const needsReview = wip.column === "done" && wip.reviewState === "needs_review";
  // Column-age — how long has the wip been in its current column? Shown
  // as a quiet badge so the TPA can spot stale Backlog / To Do / Done
  // (Needs review) items at a glance. We hide it when the in-progress
  // pill already covers the same information.
  const colDays = wip.column === "in_progress" ? null : daysInCurrentColumn(wip, wipEvents);
  const colLabel: Record<WipColumn, string> = {
    backlog: "In backlog",
    to_do:   "In To Do",
    in_progress: "In progress",
    done:    needsReview ? "Awaiting review" : "Done",
  };

  return (
    <div
      onClick={onClick}
      draggable={!readOnly}
      onDragStart={e => { if (!readOnly) e.dataTransfer.setData("wipId", wip.id); }}
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius)",
        border: selected
          ? "1px solid var(--accent)"
          : isFresh
            ? "1px solid rgba(20,184,166,0.45)"
            : "1px solid var(--border)",
        borderLeft: selected
          ? "3px solid var(--accent)"
          : wip.type === "task"
            ? "3px solid rgba(124,58,237,0.6)"
            : "3px solid rgba(14,165,233,0.6)",
        background: selected
          ? "var(--bg-selected)"
          : isFresh
            ? "rgba(20,184,166,0.06)"
            : "var(--bg)",
        cursor: "pointer",
        marginBottom: 6,
        opacity: isDone ? 0.65 : 1,
        // One-shot pulse on first paint when the card is freshly changed.
        // We only apply the animation in client mode to keep team view calm.
        animation: isFresh ? "recentPop 1.6s ease-out 1" : undefined,
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={e => {
        if (selected) return;
        e.currentTarget.style.background = isFresh ? "rgba(20,184,166,0.10)" : "var(--bg-hover)";
      }}
      onMouseLeave={e => {
        if (selected) return;
        e.currentTarget.style.background = isFresh ? "rgba(20,184,166,0.06)" : "var(--bg)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <TypeChip type={wip.type} />
        <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: "auto" }}>{wip.id}</span>
      </div>
      <div style={{
        fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
        lineHeight: 1.35, marginBottom: 6,
        textDecoration: isDone ? "line-through" : "none",
        opacity: isDone ? 0.6 : 1,
      }}>
        {wip.title}
      </div>
      {/* In-progress duration badge — plain elapsed-time pill while the
          item is in the In Progress column. Informational only; no SLA. */}
      {inProgHours !== null && (
        <div
          title={`In progress for ${formatHoursDuration(inProgHours)}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 500,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "var(--bg-sunken)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            whiteSpace: "nowrap",
          }}
        >
          ◔ In progress · {formatHoursDuration(inProgHours)}
        </div>
      )}
      {/* Column-age pill — "In Backlog · 4d" / "In To Do · 2d" / "Awaiting
          review · 1d". Quiet by default; escalates style (amber outline)
          once age crosses a soft threshold so the TPA can spot stale items. */}
      {colDays !== null && colDays >= 1 && wip.column !== "in_progress" && (() => {
        const days = Math.floor(colDays);
        const escalated =
          (wip.column === "backlog" && days > 14) ||
          (wip.column === "to_do" && days > 7) ||
          (wip.column === "done" && needsReview && days > 3);
        return (
          <div
            title={`${colLabel[wip.column]} for ${days} day${days === 1 ? "" : "s"}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 10.5, fontWeight: escalated ? 600 : 500,
              marginBottom: 6,
              padding: "1px 7px", borderRadius: 100,
              background: escalated ? "rgba(245,158,11,0.10)" : "var(--bg-sunken)",
              color: escalated ? "#b45309" : "var(--text-secondary)",
              border: escalated ? "1px solid rgba(245,158,11,0.40)" : "1px solid var(--border)",
              whiteSpace: "nowrap",
            }}
          >
            ◔ {colLabel[wip.column]} · {days}d
          </div>
        );
      })()}
      {/* Done & awaiting review — small marker so reviewers can spot
          unreviewed Done items without opening the modal. Once the user
          marks the item Looks good / Follow-up the chip drops away (or
          turns into the "reviewed" badge below). */}
      {needsReview && (
        <div
          title="This item is Done and waiting for review"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 500,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "rgba(245,158,11,0.08)",
            color: "#b45309",
            border: "1px dashed rgba(245,158,11,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          ◇ Needs review
        </div>
      )}
      {/* Conflict warning — every linked signal was rejected but the wip
          is still upstream. We don't auto-close anything; we just flag it
          for review (per spec). */}
      {allLinkedRejected && (
        <div
          title="The signal(s) that triggered this work were rejected. Review and decide whether to close or remove this action."
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 600,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "rgba(220,38,38,0.08)",
            color: "#b91c1c",
            border: "1px solid rgba(220,38,38,0.40)",
            whiteSpace: "nowrap",
          }}
        >
          ⚠ Linked signal was rejected
        </div>
      )}
      {/* New-matching-signal indicator — fresh duplicate suggestion landed
          on a linked signal. Subtle red pill so the assignee can spot new
          context without us forcing them to open the modal. */}
      {hasNewMatchingSignal && (
        <div
          title="A new matching signal was suggested as a duplicate of one of this work item's linked signals"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 600,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "rgba(220,38,38,0.06)",
            color: "#b91c1c",
            border: "1px dashed rgba(220,38,38,0.40)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            background: "#dc2626", color: "white",
            padding: "0 5px", borderRadius: 100, lineHeight: "13px",
          }}>NEW</span>
          Possible matching signal
        </div>
      )}
      {wip.column === "done" && wip.reviewState === "looks_good" && (
        <div
          title="Reviewed as looks good"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 500,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
            whiteSpace: "nowrap",
          }}
        >
          ✓ Reviewed
        </div>
      )}
      {wip.column === "done" && wip.reviewState === "follow_up" && (
        <div
          title="Reviewer flagged this for follow-up"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 500,
            marginBottom: 6,
            padding: "1px 7px", borderRadius: 100,
            background: "rgba(239,68,68,0.06)",
            color: "#b91c1c",
            border: "1px solid rgba(239,68,68,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          ⤴ Follow-up needed
        </div>
      )}
      {/* Recent-change badge — small, secondary, under the title */}
      {freshEvent && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 10.5, fontWeight: 500,
          color: "#0f766e",
          marginBottom: 6,
          padding: "1px 7px", borderRadius: 100,
          background: "rgba(20,184,166,0.10)",
          border: "1px solid rgba(20,184,166,0.35)",
          whiteSpace: "nowrap",
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
        }}
        title={`${describeWipEvent(freshEvent)} · ${absDate(freshEvent.at)}`}
        >
          ◔ {describeWipEvent(freshEvent)} · {relTime(freshEvent.at)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {wip.linkedSignals.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)" }}>
            <Link size={11} /> {wip.linkedSignals.length}
          </span>
        )}
        {commentCount > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)" }}>
            <CommentIcon size={11} /> {commentCount}
          </span>
        )}
        {attachCount > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)" }}>
            <PaperclipIcon size={11} /> {attachCount}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {/* Manual ordering — Backlog / To Do only. Two tiny arrows that
            nudge the card up / down within its column. Click handlers
            stop propagation so they don't open the modal. */}
        {canManualOrder && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => moveWipUp(wip.id)}
              title="Move up in this column"
              aria-label="Move up"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--text-secondary)", fontSize: 10, lineHeight: 1,
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
            >
              ↑
            </button>
            <button
              onClick={() => moveWipDown(wip.id)}
              title="Move down in this column"
              aria-label="Move down"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--text-secondary)", fontSize: 10, lineHeight: 1,
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
            >
              ↓
            </button>
          </span>
        )}
        {wip.assignee ? (
          <span title={userById(wip.assignee).name} style={{ display: "inline-flex" }}>
            <Avatar userId={wip.assignee} size="sm" />
          </span>
        ) : (
          <span
            title="Unassigned"
            aria-label="Unassigned"
            style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "1.5px dashed var(--border-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-disabled)", fontSize: 10, fontWeight: 600,
              flexShrink: 0,
            }}
          >
            ?
          </span>
        )}
      </div>
    </div>
  );
}

// ── DroppableColumn ────────────────────────────────────────────────────────
function DroppableColumn({ title, column, location, items, dotColor }: {
  title: string; column: WipColumn; location: string; items: Wip[]; dotColor: string;
}) {
  const { moveWip, openWip, appMode } = useStore();
  const readOnly = appMode === "client";
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={e => { if (readOnly) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        if (readOnly) return;
        e.preventDefault(); setOver(false);
        const wipId = e.dataTransfer.getData("wipId");
        if (wipId) moveWip(wipId, location, column);
      }}
      style={{
        flex: 1, minWidth: 0, borderRadius: "var(--radius)", padding: "8px",
        background: over ? "var(--bg-selected)" : "transparent",
        border: over ? "1px dashed var(--accent)" : "1px solid transparent",
        transition: "all 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: "var(--fs-meta)", fontWeight: 500, color: "var(--text-secondary)" }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, monospace" }}>
          {items.length}
        </span>
      </div>
      {items.map(w => <WipCard key={w.id} wip={w} onClick={() => openWip(w.id)} />)}
      {items.length === 0 && (
        <div style={{
          padding: "16px 8px", textAlign: "center", fontSize: "var(--fs-meta)",
          color: "var(--text-disabled)", border: "1px dashed var(--border)", borderRadius: "var(--radius)",
        }}>
          Drop here
        </div>
      )}
    </div>
  );
}

// ── SprintBlock ────────────────────────────────────────────────────────────
function SprintBlock({ sprintId, freshIds, showChangesOnly }: {
  sprintId: string;
  freshIds: Set<string>;
  showChangesOnly: boolean;
}) {
  const { sprints, wipItems } = useStore();
  const sprint = sprints.find(s => s.id === sprintId);
  const [collapsed, setCollapsed] = useState(false);

  // How many of this sprint's items have a fresh event since the last
  // visit? Drives the sprint-header badge and the auto-expand behaviour
  // when the user enters "Show changes" mode.
  const freshCount = wipItems.reduce(
    (n, w) => (w.location === sprintId && freshIds.has(w.id) ? n + 1 : n),
    0,
  );

  // In "Show changes" mode, sprints with no updates are hidden entirely so
  // the user only sees the sprints that actually have something new.
  if (showChangesOnly && freshCount === 0) return null;
  if (!sprint) return null;

  // Auto-expand sprints that have updates when the user is in show-changes
  // mode. We bypass the user's collapse state in that mode so old sprints
  // with fresh activity don't stay hidden behind a chevron.
  const effectiveCollapsed = showChangesOnly && freshCount > 0 ? false : collapsed;

  const items = showChangesOnly
    ? wipItems.filter(w => w.location === sprintId && freshIds.has(w.id))
    : wipItems.filter(w => w.location === sprintId);
  // Manual-rank sort: cards with an explicit `order` come first by
  // ascending value; cards without rank fall through in their original
  // (creation) order behind them.
  const byRank = (a: Wip, b: Wip) => {
    const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  };
  const todo     = items.filter(w => w.column === "to_do").slice().sort(byRank);
  const inProg   = items.filter(w => w.column === "in_progress");
  const done     = items.filter(w => w.column === "done");

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--bg)", marginBottom: 16, overflow: "hidden" }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer",
          background: sprint.active ? "linear-gradient(to right, #fafeff, var(--bg))" : "var(--bg)",
          borderBottom: effectiveCollapsed ? "none" : "1px solid var(--border)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = sprint.active ? "linear-gradient(to right, #fafeff, var(--bg))" : "var(--bg)")}
      >
        {effectiveCollapsed ? <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />}
        <span style={{ fontWeight: 600, fontSize: "var(--fs-body)", color: "var(--text)" }}>{sprint.name}</span>
        {sprint.active && (
          <span style={{ padding: "1px 7px", borderRadius: 100, background: "var(--status-accepted)", color: "white", fontSize: 11, fontWeight: 600 }}>
            Active
          </span>
        )}
        {/* Sprint-level update badge — shown whenever there's fresh activity,
            in both show-all and show-changes modes, so the user can spot
            cross-sprint updates from a single glance at the page. */}
        {freshCount > 0 && (
          <span
            title={`${freshCount} update${freshCount === 1 ? "" : "s"} since your last visit`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "1px 8px", borderRadius: 100,
              background: "rgba(20,184,166,0.10)",
              color: "#0f766e",
              border: "1px solid rgba(20,184,166,0.35)",
              fontSize: 10.5, fontWeight: 600,
            }}
          >
            ◔ {freshCount} update{freshCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>{sprint.range}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, monospace" }}>
          {items.length} {showChangesOnly ? "changed" : "items"}
        </span>
      </div>
      {!effectiveCollapsed && (
        <div style={{ display: "flex", padding: "12px", gap: "12px" }}>
          <DroppableColumn title="To do"       column="to_do"       location={sprintId} items={todo}   dotColor="#94a3b8" />
          <DroppableColumn title="In progress" column="in_progress" location={sprintId} items={inProg} dotColor="#f59e0b" />
          <DroppableColumn title="Done"        column="done"        location={sprintId} items={done}   dotColor="var(--status-accepted)" />
        </div>
      )}
    </div>
  );
}

// ── WipModal ───────────────────────────────────────────────────────────────
type ModalTab = "description" | "digest" | "comments" | "attachments" | "activity";

function InlineEditable({ value, placeholder, onSave, multiline, readOnly }: { value: string; placeholder: string; onSave: (v: string) => void; multiline?: boolean; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => { if (readOnly) return; setDraft(value); setEditing(true); };
  const save  = () => { onSave(draft); setEditing(false); };
  const cancel = () => setEditing(false);

  // Read-only: render value as plain text. If empty, render nothing —
  // clients shouldn't see a placeholder hint that something could be added.
  if (readOnly) {
    if (!value) return null;
    return (
      <div style={{
        fontSize: "var(--fs-body)", color: "var(--text-secondary)",
        lineHeight: 1.65, padding: "4px 6px", whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {value}
      </div>
    );
  }

  if (!editing) {
    return (
      <div
        onClick={start}
        style={{
          fontSize: "var(--fs-body)", color: value ? "var(--text-secondary)" : "var(--text-disabled)",
          lineHeight: 1.65, cursor: "text", padding: "4px 6px", borderRadius: "var(--radius-sm)",
          fontStyle: value ? "normal" : "italic", minHeight: 28,
          border: "1px solid transparent",
        }}
        onMouseEnter={e => (e.currentTarget.style.border = "1px solid var(--border)")}
        onMouseLeave={e => (e.currentTarget.style.border = "1px solid transparent")}
      >
        {value || placeholder}
      </div>
    );
  }

  return (
    <div>
      {multiline ? (
        <textarea
          autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={3}
          style={{ width: "100%", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: "6px 8px", fontSize: "var(--fs-body)", lineHeight: 1.65, resize: "vertical", outline: "none", background: "var(--bg)", boxSizing: "border-box" }}
        />
      ) : (
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          style={{ width: "100%", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: "5px 8px", fontSize: "var(--fs-body)", outline: "none", background: "var(--bg)", boxSizing: "border-box" }}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
        <button onClick={cancel} style={{ padding: "3px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)", background: "var(--bg)" }}>Cancel</button>
        <button onClick={save} style={{ padding: "3px 10px", borderRadius: "var(--radius)", border: "none", fontSize: "var(--fs-meta)", fontWeight: 500, background: "var(--accent)", color: "white" }}>Save</button>
      </div>
    </div>
  );
}

function WipModal() {
  const {
    selectedWipId, wipItems, wipComments, wipAttachments, signals,
    openWip, openSignal, addComment, addAttachment, updateWip, appMode,
    wipEvents, clientPreviousVisitAt, signalAttachments,
    moveWip, reviewWipLooksGood, reviewWipFollowUp, createFollowUp,
    weeklyGoals, setRoute, setRoadmapFocus,
  } = useStore();
  const readOnly = appMode === "client";
  const [tab, setTab] = useState<ModalTab>("digest");
  const [commentBody, setCommentBody] = useState("");
  const [commentVis, setCommentVis] = useState<Visibility>("internal");
  const [attachVis, setAttachVis] = useState<Visibility>("internal");
  // Review-step UI state. "Looks good" auto-closes any open linked
  // signals via the store action — we offer an optional reason note that
  // flows through to the linked signals' closure record. "Follow-up"
  // marks the state and surfaces the follow-up creator.
  const [followUpKind, setFollowUpKind] = useState<"signal" | "task" | "intent" | null>(null);
  const [reviewNoteOpen, setReviewNoteOpen] = useState<null | "looks_good" | "follow_up">(null);
  const [reviewNoteText, setReviewNoteText] = useState("");

  const wip = wipItems.find(w => w.id === selectedWipId);
  // Clients only see client-visible comments / attachments. Internal-only
  // notes stay invisible to keep the read-only experience honest.
  const comments = wipComments.filter(c =>
    c.wipId === selectedWipId && (!readOnly || c.visibility === "client")
  );
  const attachments = wipAttachments.filter(a =>
    a.wipId === selectedWipId && (!readOnly || a.visibility === "client")
  );
  const linkedSignals = signals.filter(s => wip?.linkedSignals.includes(s.id));

  useEffect(() => {
    if (!selectedWipId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") openWip(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedWipId, openWip]);

  useEffect(() => { setTab("description"); }, [selectedWipId]);

  if (!wip) return null;

  const submitComment = () => {
    if (!commentBody.trim()) return;
    // Clients can post comments but visibility is forced to "client" so they
    // can never accidentally tag a comment internal-only.
    addComment(wip.id, commentBody.trim(), readOnly ? "client" : commentVis);
    setCommentBody("");
  };

  const simulateAttachment = () => {
    const examples = [
      { name: "screenshot.png", size: "142 KB", mimeType: "image/png" },
      { name: "spec.pdf",       size: "380 KB", mimeType: "application/pdf" },
      { name: "data.csv",       size: "22 KB",  mimeType: "text/csv" },
      { name: "recording.mp4",  size: "8.1 MB", mimeType: "video/mp4" },
    ];
    const pick = examples[Math.floor(Math.random() * examples.length)];
    addAttachment(wip.id, pick.name, pick.size, pick.mimeType, attachVis);
  };

  const myEvents = wipEvents.filter(e => e.wipId === wip.id);

  const TABS: { id: ModalTab; label: string; badge?: number }[] = [
    { id: "description", label: "Description" },
    { id: "digest",      label: "Digest" },
    { id: "comments",    label: "Comments",    badge: comments.length || undefined },
    { id: "attachments", label: "Attachments", badge: attachments.length || undefined },
    { id: "activity",    label: "Activity",    badge: myEvents.length || undefined },
  ];

  return (
    <div
      onClick={() => openWip(null)}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "var(--bg-overlay)",
        animation: "fadeIn 0.15s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "88vh",
          background: "var(--bg)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          animation: "modalIn 0.18s ease",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <TypeChip type={wip.type} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{wip.id}</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => openWip(null)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: "var(--radius-sm)", color: "var(--text-secondary)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Title + description ── */}
        <div style={{ padding: "14px 18px 0", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: "var(--text)", marginBottom: 4 }}>
            {wip.title}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <AssigneePicker
              value={wip.assignee}
              onChange={(next) => updateWip(wip.id, { assignee: next })}
              readOnly={readOnly}
            />
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textTransform: "capitalize" }}>
              {wip.column.replace("_", " ")}
            </span>
            {wip.column === "done" && wip.reviewState === "needs_review" && (
              <span
                title="Done — waiting for review"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "1px 7px", borderRadius: 100,
                  background: "rgba(245,158,11,0.10)",
                  color: "#b45309",
                  border: "1px dashed rgba(245,158,11,0.45)",
                  fontSize: 10.5, fontWeight: 600,
                }}
              >
                Needs review
              </span>
            )}
            {wip.column === "done" && wip.reviewState === "looks_good" && wip.reviewedBy && (
              <span
                title={`Reviewed${wip.reviewedAt ? ` ${absDate(wip.reviewedAt)}` : ""}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "1px 7px", borderRadius: 100,
                  background: "#f0fdf4", color: "#15803d",
                  border: "1px solid #bbf7d0",
                  fontSize: 10.5, fontWeight: 600,
                }}
              >
                ✓ Reviewed by {userById(wip.reviewedBy).name}
              </span>
            )}
            {wip.column === "done" && wip.reviewState === "follow_up" && (
              <span
                title="Reviewer flagged this for follow-up"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "1px 7px", borderRadius: 100,
                  background: "rgba(239,68,68,0.06)",
                  color: "#b91c1c",
                  border: "1px solid rgba(239,68,68,0.25)",
                  fontSize: 10.5, fontWeight: 600,
                }}
              >
                Follow-up needed
              </span>
            )}
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
              {wip.location === "backlog" ? "Backlog" : wip.location}
            </span>
          </div>

          {/* Review note — free-text annotation captured on Looks good /
              Follow-up. Mirrors the signal-side closure note style. */}
          {wip.closeNote && (
            <div style={{
              margin: "0 0 10px",
              padding: "6px 10px", borderRadius: "var(--radius)",
              background: "var(--bg-sunken)", border: "1px solid var(--border)",
              fontSize: 12, color: "var(--text)", fontStyle: "italic", lineHeight: 1.5,
            }}>
              <span style={{ fontStyle: "normal", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginRight: 6 }}>
                Note
              </span>
              “{wip.closeNote}”
            </div>
          )}

          {/* Review actions — shown only on Done items, team mode only.
              Looks good → auto-closes any open linked signals; reopening
              the wip later reverses that closure. Follow-up → marks the
              state and surfaces the follow-up creator. Reopen → moves the
              card back to In Progress; moveWip clears reviewState and
              re-opens cascaded signals. */}
          {!readOnly && wip.column === "done" && wip.reviewState !== "looks_good" && (
            <ReviewActionsBar
              wip={wip}
              onLooksGoodClick={() => { setReviewNoteOpen("looks_good"); setReviewNoteText(""); }}
              onFollowUp={() => { setReviewNoteOpen("follow_up"); setReviewNoteText(""); }}
              onReopen={() => moveWip(wip.id, wip.location, "in_progress")}
              onCreateFollowUp={(kind) => setFollowUpKind(kind)}
            />
          )}

          {/* Review-note inline strip — captured optionally on Looks good
              / Follow-up. The note flows into wip.closeNote AND (for
              Looks good) into each cascaded signal's closure.note so the
              "Closed because Intent X was reviewed" banner can read
              "…: out of scope" too. */}
          {reviewNoteOpen && (
            <div style={{
              marginTop: 10, marginBottom: 4, padding: "10px 12px",
              borderRadius: "var(--radius)",
              background: "var(--bg-sunken)", border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
                {reviewNoteOpen === "looks_good"
                  ? "Mark as Looks good — note (optional)"
                  : "Mark for follow-up — note (optional)"}
              </div>
              <input
                autoFocus
                value={reviewNoteText}
                onChange={e => setReviewNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (reviewNoteOpen === "looks_good") reviewWipLooksGood(wip.id, reviewNoteText);
                    else { reviewWipFollowUp(wip.id, reviewNoteText); setFollowUpKind("signal"); }
                    setReviewNoteOpen(null); setReviewNoteText("");
                  }
                  else if (e.key === "Escape") { setReviewNoteOpen(null); setReviewNoteText(""); }
                }}
                placeholder="e.g. shipped, all checks passed, blocked on infra…"
                style={{
                  border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
                  padding: "6px 9px", fontSize: "var(--fs-body)",
                  background: "var(--bg)", outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button
                  onClick={() => { setReviewNoteOpen(null); setReviewNoteText(""); }}
                  style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (reviewNoteOpen === "looks_good") reviewWipLooksGood(wip.id, reviewNoteText);
                    else { reviewWipFollowUp(wip.id, reviewNoteText); setFollowUpKind("signal"); }
                    setReviewNoteOpen(null); setReviewNoteText("");
                  }}
                  style={{
                    padding: "4px 12px", borderRadius: "var(--radius)", border: "none",
                    background: reviewNoteOpen === "looks_good" ? "#15803d" : "var(--accent)",
                    color: "white", fontSize: "var(--fs-meta)", fontWeight: 500,
                  }}
                >
                  {reviewNoteOpen === "looks_good" ? "Mark Looks good" : "Mark Follow-up"}
                </button>
              </div>
            </div>
          )}

          {/* Follow-up creator — appears after Follow-up is clicked, OR when
              the user picks "Create follow-up" from the menu on a reviewed
              item. Tasks/intents inherit the origin's linked signals;
              signals stand alone with a backref to this wip. */}
          {followUpKind && (
            <FollowUpComposer
              kind={followUpKind}
              originTitle={wip.title}
              originDescription={wip.description}
              onCancel={() => setFollowUpKind(null)}
              onConfirm={(title, description) => {
                const newId = createFollowUp(wip.id, followUpKind, { title, description });
                setFollowUpKind(null);
                if (newId && followUpKind !== "signal") {
                  // Jump to the new work item's detail.
                  openWip(newId);
                } else if (newId && followUpKind === "signal") {
                  // Surface the new signal so the user can confirm it landed.
                  openWip(null);
                  openSignal(newId);
                }
              }}
            />
          )}
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 0, padding: "0 16px",
          borderBottom: "1px solid var(--border)", flexShrink: 0, marginTop: 4,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 12px",
                borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: "var(--fs-body)", fontWeight: tab === t.id ? 500 : 400,
                color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
                marginBottom: -1,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              {t.label}
              {t.badge !== undefined && (
                <span style={{
                  fontSize: 10.5, fontWeight: 500, padding: "0 4px", height: 16,
                  borderRadius: 100, background: "var(--bg-sunken)", border: "1px solid var(--border)",
                  display: "inline-flex", alignItems: "center",
                  color: "var(--text-tertiary)",
                  fontFamily: "JetBrains Mono, monospace",
                }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab body ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>

          {/* DESCRIPTION — internal task description */}
          {tab === "description" && (
            <div>
              {/* Conflict banner — mirror of the per-card warning. The wip
                  is still upstream but every linked signal got rejected.
                  We don't auto-close; we ask the user to review. */}
              {(() => {
                const upstream = wip.column === "backlog" || wip.column === "to_do" || wip.column === "in_progress";
                if (!upstream) return null;
                const allRejected = linkedSignals.length > 0 && linkedSignals.every(s => s.status === "rejected");
                if (!allRejected) return null;
                return (
                  <div style={{
                    marginBottom: 14, padding: "10px 12px",
                    borderRadius: "var(--radius)",
                    background: "rgba(220,38,38,0.06)",
                    border: "1px solid rgba(220,38,38,0.30)",
                    fontSize: "var(--fs-body)", color: "#b91c1c",
                    lineHeight: 1.5,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#b91c1c", marginBottom: 4 }}>
                      ⚠ Linked signal was rejected
                    </div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      Every signal feeding this action has been rejected. Review whether this work should still happen — close or remove the action manually if it's no longer needed.
                    </div>
                  </div>
                );
              })()}

              {/* Follow-up backref — mirrors the signal-side banner. Helps
                  the user trace "this work exists because Intent X needed
                  follow-up". */}
              {wip.followUpOfWipId && (() => {
                const origin = wipItems.find(w => w.id === wip.followUpOfWipId);
                if (!origin) return null;
                return (
                  <div style={{
                    marginBottom: 14, padding: "8px 12px",
                    borderRadius: "var(--radius)",
                    background: "rgba(14,165,233,0.05)",
                    border: "1px solid rgba(14,165,233,0.25)",
                    fontSize: "var(--fs-meta)", color: "var(--text-secondary)",
                  }}>
                    <span style={{ fontWeight: 500, color: "var(--text)" }}>Follow-up of </span>
                    <button
                      onClick={() => openWip(origin.id)}
                      style={{
                        background: "transparent", border: "none", padding: 0,
                        color: "var(--accent)", cursor: "pointer", fontWeight: 500,
                        textDecoration: "underline", textUnderlineOffset: 2,
                      }}
                    >
                      {origin.type === "task" ? "Task" : "Intent"} “{origin.title}”
                    </button>
                  </div>
                );
              })()}

              {/* Acceptance criteria FIRST — the highest-signal block
                  for a developer reading the item. Type-aware header
                  copy: intents read as "Outcome" (verifiable product
                  outcome), tasks as "Acceptance criteria" (verifying
                  the work is done). */}
              <AcceptanceCriteriaTopBlock wip={wip} readOnly={readOnly} />

              {/* Summary / Notes — the existing wip.description, lightly
                  reframed so the developer reads it as a short summary
                  or notes field, not a place to dump raw signal text.
                  Linked signal text lives inside "Additional context"
                  below; this field stays the team's own framing. */}
              <SummaryNotesBlock wip={wip} readOnly={readOnly} />

              {/* Structured product-decision fields. Each is optional and
                  collapses to a quiet empty-state hint when blank, so the
                  description tab stays readable for items where the team
                  hasn't filled the structure in. AC is rendered above
                  this section now; the rest live here. */}
              <StructuredFieldsSection wip={wip} linkedSignals={linkedSignals} readOnly={readOnly} />

              {/* Source signals — only shown for TASKS now. Intents
                  surface their signal links inside the unified
                  Traceability section below, with add / remove and the
                  same "Linked signals" naming the spec calls for. */}
              {wip.type !== "intent" && linkedSignals.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <Link size={12} /> Source signals ({linkedSignals.length})
                  </div>
                  {linkedSignals.map(sig => (
                    <LinkedSignalRow
                      key={sig.id}
                      sig={sig}
                      onOpen={() => { openWip(null); openSignal(sig.id); }}
                    />
                  ))}
                </div>
              )}

              {/* Traceability — for intents only. Consolidates the four
                  link kinds the intent can reach: weekly goals, product
                  targets, signals, and child tasks. Goals + signals are
                  add/removable here; product targets are derived from
                  features / slices that directly link this intent (and
                  capabilities reached via the linked goals). */}
              {wip.type === "intent" && <IntentTraceabilitySection wip={wip} />}

              {/* Follow-ups created from this wip — both signal and
                  task/intent kinds. Clickable to navigate to each. */}
              {((wip.followUpIds && wip.followUpIds.length > 0) || (wip.followUpSignalIds && wip.followUpSignalIds.length > 0)) && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <Link size={12} /> Follow-ups created from this work
                  </div>
                  {(wip.followUpIds ?? []).map(fid => {
                    const f = wipItems.find(w => w.id === fid);
                    if (!f) return null;
                    return (
                      <button
                        key={fid}
                        onClick={() => openWip(fid)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          width: "100%", marginBottom: 6,
                          padding: "6px 10px",
                          border: "1px solid var(--border)", borderRadius: "var(--radius)",
                          background: "var(--bg)", textAlign: "left", cursor: "pointer",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
                      >
                        <TypeChip type={f.type} />
                        <span style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)" }}>{f.title}</span>
                        <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginLeft: "auto", textTransform: "capitalize" }}>
                          {f.column.replace("_", " ")}
                        </span>
                      </button>
                    );
                  })}
                  {(wip.followUpSignalIds ?? []).map(sid => {
                    const s = signals.find(x => x.id === sid);
                    if (!s) return null;
                    return (
                      <button
                        key={sid}
                        onClick={() => { openWip(null); openSignal(sid); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          width: "100%", marginBottom: 6,
                          padding: "6px 10px",
                          border: "1px solid var(--border)", borderRadius: "var(--radius)",
                          background: "var(--bg)", textAlign: "left", cursor: "pointer",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
                      >
                        <span style={{
                          padding: "1px 6px", borderRadius: 100, fontSize: 10, fontWeight: 600,
                          background: "var(--bg-sunken)", color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}>
                          Signal
                        </span>
                        <span style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)" }}>{s.title}</span>
                        <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginLeft: "auto", textTransform: "capitalize" }}>
                          {s.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DIGEST — client-facing text, separate from description */}
          {tab === "digest" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Client digest
              </div>
              <div style={{ marginBottom: 16 }}>
                <InlineEditable
                  value={wip.digest ?? ""}
                  placeholder="Add a client-facing digest — visible to stakeholders…"
                  onSave={v => updateWip(wip.id, { digest: v })}
                  multiline
                  readOnly={readOnly}
                />
              </div>

            </div>
          )}

          {/* COMMENTS */}
          {tab === "comments" && (
            <div>
              {/* Composer — team-only. Clients view comments read-only.  */}
              {!readOnly && (
              <div style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                background: "var(--bg-sunken)", marginBottom: 20, overflow: "hidden",
              }}>
                <textarea
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submitComment(); }}
                  placeholder="Write a comment... (Cmd+Enter to post)"
                  rows={3}
                  style={{
                    width: "100%", border: "none", outline: "none",
                    background: "transparent", resize: "none",
                    padding: "10px 12px", fontSize: "var(--fs-body)", lineHeight: 1.55,
                  }}
                />
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderTop: "1px solid var(--border)",
                  background: "var(--bg)",
                }}>
                  <VisibilityToggle value={commentVis} onChange={setCommentVis} />
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={submitComment}
                    disabled={!commentBody.trim()}
                    style={{
                      padding: "4px 12px", borderRadius: "var(--radius)",
                      background: commentBody.trim() ? "var(--accent)" : "var(--bg-sunken)",
                      color: commentBody.trim() ? "white" : "var(--text-disabled)",
                      fontSize: "var(--fs-meta)", fontWeight: 500,
                      border: "1px solid transparent",
                      transition: "all 0.1s",
                    }}
                  >
                    Post
                  </button>
                </div>
              </div>
              )}

              {/* Comment list */}
              {comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)", fontSize: "var(--fs-body)" }}>
                  No comments yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {comments.map(c => <CommentRow key={c.id} comment={c} />)}
                </div>
              )}
            </div>
          )}

          {/* ATTACHMENTS — split into "Signal attachments" (inherited
              from linked signals, read-only) and own task/intent files */}
          {tab === "attachments" && (() => {
            const inherited = signalAttachments.filter(sa => wip.linkedSignals.includes(sa.signalId));
            const ownLabel = wip.type === "task" ? "Task attachments" : "Intent attachments";
            const noneAtAll = inherited.length === 0 && attachments.length === 0;
            return (
              <div>
                {/* Upload row — hidden in client read-only mode */}
                {!readOnly && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 12px",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                    background: "var(--bg-sunken)", marginBottom: 20,
                  }}>
                    <PaperclipIcon size={13} />
                    <span style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", flex: 1 }}>
                      Attach a file
                    </span>
                    <VisibilityToggle value={attachVis} onChange={setAttachVis} />
                    <button
                      onClick={simulateAttachment}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "4px 10px", borderRadius: "var(--radius)",
                        background: "var(--accent)", color: "white",
                        fontSize: "var(--fs-meta)", fontWeight: 500,
                      }}
                    >
                      <Plus size={11} /> Upload
                    </button>
                  </div>
                )}

                {noneAtAll ? (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)", fontSize: "var(--fs-body)" }}>
                    No attachments yet.
                  </div>
                ) : (
                  <>
                    {/* SIGNAL ATTACHMENTS — files inherited from linked signals,
                        annotated with the source signal so the user can trace
                        each file back to where it originated. */}
                    {inherited.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
                          textTransform: "uppercase", color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}>
                          Signal attachments · {inherited.length}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {inherited.map(sa => {
                            const sourceSig = signals.find(s => s.id === sa.signalId);
                            return (
                              <SignalSourcedAttachmentRow
                                key={sa.id}
                                attachment={sa}
                                sourceTitle={sourceSig?.title ?? sa.signalId}
                                onOpenSignal={sourceSig ? () => { openWip(null); openSignal(sa.signalId); } : undefined}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* OWN ATTACHMENTS — files added directly to this wip */}
                    {attachments.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
                          textTransform: "uppercase", color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}>
                          {ownLabel} · {attachments.length}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {attachments.map(a => <AttachmentRow key={a.id} attachment={a} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ACTIVITY — chronological card events, newest first */}
          {tab === "activity" && (
            <ActivityList events={myEvents} previousVisitAt={readOnly ? clientPreviousVisitAt : null} />
          )}

        </div>
      </div>
    </div>
  );
}

// ── CommentRow ─────────────────────────────────────────────────────────────
// ── StructuredFieldsSection ───────────────────────────────────────────────
// Holds the auxiliary product-decision fields on a wip: Context,
// Acceptance Criteria, Decision rationale, Rejected alternatives, Plan,
// plus GitHub link / implementation / deployment status.
//
// Each subsection is collapsible-by-default-when-empty so a freshly
// created wip doesn't dump six empty headers on the user. They're
// individually editable; saves go through `updateWip` so the existing
// transaction toast path stays consistent.

// ── AcceptanceCriteriaTopBlock ─────────────────────────────────────────
// The first thing a developer reads inside the description tab. Lives
// outside StructuredFieldsSection so it can be the visual anchor of the
// view. Header copy is type-aware so intents emphasise outcome
// statements while tasks emphasise verifiable conditions.

function AcceptanceCriteriaTopBlock({
  wip, readOnly,
}: {
  wip: Wip;
  readOnly: boolean;
}) {
  const { addAcceptanceCriterion, updateAcceptanceCriterion, removeAcceptanceCriterion } = useStore();
  const acList = wip.acceptanceCriteria ?? [];
  const doneCount = acList.filter(a => a.done).length;

  // Intent → outcome-based phrasing (per spec: intent = verifiable
  // product outcome). Task → standard AC phrasing.
  const isIntent = wip.type === "intent";
  const heading = isIntent ? "Outcome" : "Acceptance criteria";
  const emptyHint = isIntent
    ? "Add the verifiable outcome(s) this intent produces."
    : "Add testable conditions that confirm this task is done.";
  const addPlaceholder = isIntent
    ? "Add an outcome statement…"
    : "Add a criterion…";

  const accent = isIntent ? "var(--intent)" : "var(--task)";

  return (
    <div style={{
      marginBottom: 14, padding: "10px 12px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      background: "var(--bg)",
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: accent,
        }}>
          {heading}
        </span>
        {acList.length > 0 && (
          <span style={{
            fontSize: 11, color: "var(--text-tertiary)",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
          }}>
            {doneCount}/{acList.length} done
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }} title="This block is what developers verify against.">
          {isIntent ? "What changes when this is achieved?" : "What proves the task is done?"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {acList.length === 0 ? (
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", padding: "4px 0" }}>
            {emptyHint}
          </div>
        ) : (
          acList.map(ac => (
            <AcceptanceCriterionRow
              key={ac.id}
              ac={ac}
              readOnly={readOnly}
              onToggle={() => updateAcceptanceCriterion(wip.id, ac.id, { done: !ac.done })}
              onEdit={(text) => updateAcceptanceCriterion(wip.id, ac.id, { text })}
              onRemove={() => removeAcceptanceCriterion(wip.id, ac.id)}
            />
          ))
        )}
        {!readOnly && (
          <AddAcceptanceCriterionInput onAdd={(text) => addAcceptanceCriterion(wip.id, text)} placeholder={addPlaceholder} />
        )}
      </div>
    </div>
  );
}

// ── SummaryNotesBlock ────────────────────────────────────────────────────
// Light wrapper around the existing wip.description editor. Adds a small
// "Summary / Notes" header and a placeholder that frames the field as a
// short-form summary rather than a place to paste raw signal text. The
// raw signal text always lives inside "Additional context" below — never
// in this field by default.

function SummaryNotesBlock({
  wip, readOnly,
}: {
  wip: Wip;
  readOnly: boolean;
}) {
  const { updateWip } = useStore();
  // Hide entirely in client mode if the field is empty — clients
  // shouldn't see an "Add a one-line summary" prompt that they can't
  // edit. They still see the value when it's set.
  if (readOnly && !wip.description) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
        textTransform: "uppercase", color: "var(--text-tertiary)",
        marginBottom: 4,
      }}>
        Summary / Notes
      </div>
      <InlineEditable
        value={wip.description}
        placeholder="One-line summary or short notes — keep this concise. Source text lives in Additional context below."
        onSave={v => updateWip(wip.id, { description: v })}
        multiline
        readOnly={readOnly}
      />
    </div>
  );
}

function StructuredFieldsSection({
  wip, linkedSignals, readOnly,
}: {
  wip: Wip;
  linkedSignals: Signal[];
  readOnly: boolean;
}) {
  const { updateWip, openWip, openSignal } = useStore();

  // "Additional context" is open by default when we have either manual
  // context or linked signals to surface — so the reader sees the source
  // text without having to expand.
  const ctxStartOpen = !!wip.context || linkedSignals.length > 0;

  return (
    <div style={{
      marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Additional context — combines the action's own free-text context
          with read-only excerpts pulled from every linked signal so the
          reader doesn't have to scroll down to "Linked signals" to see
          what the request actually said. */}
      <FieldBlock
        title="Additional context"
        meta={linkedSignals.length > 0 ? `${linkedSignals.length} linked signal${linkedSignals.length === 1 ? "" : "s"}` : undefined}
        startOpen={ctxStartOpen}
      >
        <InlineEditable
          value={wip.context ?? ""}
          placeholder="Why now? Who reported this? Where in the product?"
          onSave={v => updateWip(wip.id, { context: v })}
          multiline
          readOnly={readOnly}
        />
        {linkedSignals.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              From linked signals
            </div>
            {linkedSignals.map(sig => (
              <SignalExcerptCard
                key={sig.id}
                signal={sig}
                onOpen={() => { openWip(null); openSignal(sig.id); }}
              />
            ))}
          </div>
        )}
      </FieldBlock>

      <FieldBlock title="Decision rationale" startOpen={!!wip.decisionRationale}>
        <InlineEditable
          value={wip.decisionRationale ?? ""}
          placeholder="Why this approach? Key trade-offs."
          onSave={v => updateWip(wip.id, { decisionRationale: v })}
          multiline
          readOnly={readOnly}
        />
      </FieldBlock>

      <FieldBlock title="Rejected alternatives" startOpen={!!wip.rejectedAlternatives}>
        <InlineEditable
          value={wip.rejectedAlternatives ?? ""}
          placeholder="Other options considered + why they were rejected."
          onSave={v => updateWip(wip.id, { rejectedAlternatives: v })}
          multiline
          readOnly={readOnly}
        />
      </FieldBlock>

      <FieldBlock title="Plan / notes" startOpen={!!wip.plan}>
        <InlineEditable
          value={wip.plan ?? ""}
          placeholder="Short execution plan, milestones, or internal notes."
          onSave={v => updateWip(wip.id, { plan: v })}
          multiline
          readOnly={readOnly}
        />
      </FieldBlock>

      <FieldBlock
        title="Implementation & deployment"
        meta={(() => {
          if (wip.implementationStatus || wip.deploymentStatus) {
            const i = wip.implementationStatus ? IMPLEMENTATION_STATUS_LABEL[wip.implementationStatus] : null;
            const d = wip.deploymentStatus ? DEPLOYMENT_STATUS_LABEL[wip.deploymentStatus] : null;
            return [i, d].filter(Boolean).join(" · ");
          }
          return undefined;
        })()}
        startOpen={!!(wip.githubLink || wip.implementationStatus || wip.deploymentStatus)}
      >
        <ImplementationFields wip={wip} readOnly={readOnly} onSave={(patch) => updateWip(wip.id, patch)} />
      </FieldBlock>
    </div>
  );
}

function FieldBlock({
  title, meta, startOpen, children,
}: {
  title: string;
  meta?: string;
  startOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", padding: 0, background: "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
          marginBottom: 6,
        }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{title}</span>
        {meta && (
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: 0,
            color: "var(--text-tertiary)", textTransform: "none",
          }}>
            · {meta}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── SignalExcerptCard ─────────────────────────────────────────────────────
// Read-only quote of a linked signal's title + description, shown inside
// "Additional context" so the action reader can see the source text
// without scrolling down to the navigable Linked-signals list. Clicking
// the title opens the signal modal for the full record (comments,
// history, etc.).

function SignalExcerptCard({
  signal, onOpen,
}: {
  signal: Signal;
  onOpen: () => void;
}) {
  return (
    <div style={{
      padding: "8px 10px",
      borderRadius: "var(--radius)",
      border: "1px solid var(--border)",
      background: "var(--bg)",
      borderLeft: "3px solid var(--border-strong)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        <StatusDot status={signal.status} />
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
          {signal.source}
        </span>
        <button
          onClick={onOpen}
          style={{
            background: "transparent", border: "none", padding: 0,
            fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
            cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
          title="Open signal"
        >
          {signal.title}
        </button>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{signal.id}</span>
      </div>
      {signal.description && (
        <div style={{
          fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}>
          {signal.description}
        </div>
      )}
      {/* TPA annotation surfaced read-only when present on the source
          signal. Visually labelled as "TPA context" with a purple left
          accent so it never reads as the raw signal text. Truncated to
          ~3 lines with an inline expand for long notes. */}
      {signal.tpaNote && (
        <SignalAnnotationBlock note={signal.tpaNote} />
      )}
      {signal.labels.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {signal.labels.map(l => (
            <span key={l} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 100,
              background: "var(--bg-sunken)", color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}>
              #{l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SignalAnnotationBlock ─────────────────────────────────────────────────
// Read-only display of a signal's TPA annotation, surfaced on the WIP
// detail's linked-signal excerpts so the developer / TPA reading the
// work item sees the clarification without bouncing back to the Signals
// page. Long notes truncate at ~3 lines with an inline "Show more".
//
// Only ever rendered when content is non-empty (caller gates) — we keep
// the empty UI surface quiet per spec.

function SignalAnnotationBlock({ note }: { note: string }) {
  const accent = "#7c3aed";
  const COLLAPSED_LINE_CLAMP = 3;
  const [expanded, setExpanded] = useState(false);
  // We always render the same content; CSS line-clamp handles the
  // truncation. The "Show more" / "Show less" toggle is only visible
  // when the note is long enough to need it. We measure via a ref on
  // the body element to decide whether to render the toggle.
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scrollHeight > clientHeight ⇒ content is being clipped.
    setOverflowing(el.scrollHeight - 1 > el.clientHeight);
  }, [note]);

  return (
    <div style={{
      marginTop: 6,
      paddingLeft: 8,
      borderLeft: `2px solid ${accent}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
        textTransform: "uppercase", color: accent,
        marginBottom: 3,
      }}>
        TPA context
      </div>
      <div
        ref={ref}
        style={{
          fontSize: 12, color: "var(--text)", lineHeight: 1.55,
          fontStyle: "italic", whiteSpace: "pre-wrap",
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : COLLAPSED_LINE_CLAMP,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {note}
      </div>
      {(overflowing || expanded) && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 2, padding: "1px 4px",
            background: "transparent", border: "none",
            color: accent, fontSize: 10.5, fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function AcceptanceCriterionRow({
  ac, readOnly, onToggle, onEdit, onRemove,
}: {
  ac: { id: string; text: string; done: boolean };
  readOnly: boolean;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ac.text);
  // Keep draft in sync if AC text changes externally (rare, but possible).
  useEffect(() => { if (!editing) setDraft(ac.text); }, [ac.text, editing]);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px",
      borderRadius: "var(--radius)",
      background: ac.done ? "var(--bg-sunken)" : "transparent",
      border: "1px solid var(--border)",
    }}>
      <button
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        aria-label={ac.done ? "Mark as incomplete" : "Mark as complete"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, borderRadius: 3,
          border: ac.done ? "1.5px solid var(--status-accepted)" : "1.5px solid var(--border-strong)",
          background: ac.done ? "var(--status-accepted)" : "transparent",
          cursor: readOnly ? "default" : "pointer",
          flexShrink: 0,
        }}
      >
        {ac.done && (
          <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
            <polyline points="1.5 5 4 7.5 8.5 2" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { onEdit(draft.trim() || ac.text); setEditing(false); }
            else if (e.key === "Escape") { setDraft(ac.text); setEditing(false); }
          }}
          onBlur={() => { onEdit(draft.trim() || ac.text); setEditing(false); }}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none",
            background: "transparent", color: "var(--text)",
            fontSize: "var(--fs-body)",
          }}
        />
      ) : (
        <button
          onClick={readOnly ? undefined : () => setEditing(true)}
          disabled={readOnly}
          style={{
            flex: 1, minWidth: 0, textAlign: "left",
            background: "transparent", border: "none", padding: 0,
            cursor: readOnly ? "default" : "text",
            color: ac.done ? "var(--text-tertiary)" : "var(--text)",
            textDecoration: ac.done ? "line-through" : "none",
            fontSize: "var(--fs-body)", lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {ac.text}
        </button>
      )}
      {!readOnly && !editing && (
        <button
          onClick={onRemove}
          aria-label="Remove acceptance criterion"
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 5px", borderRadius: "var(--radius-sm)",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function AddAcceptanceCriterionInput({ onAdd, placeholder }: { onAdd: (text: string) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4 }}>
      <span style={{
        width: 16, height: 16, borderRadius: 3,
        border: "1.5px dashed var(--border-strong)", flexShrink: 0,
      }} />
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && text.trim()) { onAdd(text); setText(""); }
        }}
        placeholder={placeholder ?? "Add acceptance criterion… (Enter to add)"}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none",
          background: "transparent", color: "var(--text)",
          fontSize: "var(--fs-body)",
        }}
      />
    </div>
  );
}

function ImplementationFields({
  wip, readOnly, onSave,
}: {
  wip: Wip;
  readOnly: boolean;
  onSave: (patch: Partial<Wip>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
          GitHub link
        </span>
        {readOnly ? (
          wip.githubLink ? (
            <a href={wip.githubLink} target="_blank" rel="noreferrer" style={{ fontSize: "var(--fs-body)", color: "var(--accent)" }}>
              {wip.githubLink}
            </a>
          ) : (
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>—</span>
          )
        ) : (
          <input
            type="url"
            defaultValue={wip.githubLink ?? ""}
            placeholder="https://github.com/org/repo/pull/123"
            onBlur={e => onSave({ githubLink: e.target.value.trim() || undefined })}
            style={{
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              padding: "5px 9px", fontSize: "var(--fs-body)",
              background: "var(--bg)", outline: "none",
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
            Implementation
          </span>
          {readOnly ? (
            <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
              {wip.implementationStatus ? IMPLEMENTATION_STATUS_LABEL[wip.implementationStatus] : "—"}
            </span>
          ) : (
            <select
              value={wip.implementationStatus ?? ""}
              onChange={e => onSave({ implementationStatus: (e.target.value || undefined) as Wip["implementationStatus"] })}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "4px 8px", fontSize: "var(--fs-body)",
                background: "var(--bg)", color: "var(--text)",
              }}
            >
              <option value="">— Not set —</option>
              <option value="no_pr">No PR linked</option>
              <option value="pr_open">PR open</option>
              <option value="pr_merged">PR merged</option>
              <option value="needs_review">Needs code review</option>
            </select>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
            Deployment
          </span>
          {readOnly ? (
            <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
              {wip.deploymentStatus ? DEPLOYMENT_STATUS_LABEL[wip.deploymentStatus] : "—"}
            </span>
          ) : (
            <select
              value={wip.deploymentStatus ?? ""}
              onChange={e => onSave({ deploymentStatus: (e.target.value || undefined) as Wip["deploymentStatus"] })}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "4px 8px", fontSize: "var(--fs-body)",
                background: "var(--bg)", color: "var(--text)",
              }}
            >
              <option value="">— Not set —</option>
              <option value="not_deployed">Not deployed</option>
              <option value="deployed_staging">Deployed to staging</option>
              <option value="deployed_production">Deployed to production</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment }: { comment: WipComment }) {
  const { createSignalFromComment, openWip, openSignal, appMode, setRoute } = useStore();
  const readOnly = appMode === "client";
  const author = userById(comment.author);
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Avatar userId={comment.author} size="sm" />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)" }}>{author.name}</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>{relTime(comment.createdAt)}</span>
          <VisibilityBadge v={comment.visibility} />
          <span style={{ flex: 1 }} />
          {!readOnly && (
            <button
              onClick={() => {
                const newId = createSignalFromComment(comment.id);
                if (newId) {
                  // Drop the WIP modal and surface the new signal so the
                  // user can confirm / adjust it immediately. We also
                  // jump the route to /signals in case they were deep in
                  // a sprint board — keeps the orientation.
                  openWip(null);
                  setRoute("signals");
                  openSignal(newId);
                }
              }}
              title="Create a new signal from this comment (links back to this work item)"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 7px", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", background: "var(--bg)",
                fontSize: 10.5, color: "var(--text-secondary)", cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
            >
              + Signal from this
            </button>
          )}
        </div>
        <div style={{
          fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.6,
          background: "var(--bg-sunken)", padding: "8px 10px",
          borderRadius: "var(--radius)", border: "1px solid var(--border)",
        }}>
          {comment.body}
        </div>
      </div>
    </div>
  );
}

// ── AttachmentRow ──────────────────────────────────────────────────────────
// AssigneePicker ──────────────────────────────────────────────────────────
// Lightweight inline picker for the WIP modal's assignee chip. Click to
// open, pick a user (or Unassigned) to apply. In client mode the chip is
// rendered read-only — no popover, no caret.

function AssigneePicker({
  value, onChange, readOnly,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const user = value ? userById(value) : null;

  if (readOnly) {
    return value && user ? (
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
        <Avatar userId={value} size="sm" />
        {user.name}
      </span>
    ) : (
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          border: "1.5px dashed var(--border-strong)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-disabled)", fontSize: 10, fontWeight: 600,
        }}>?</span>
        Unassigned
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={value ? `Assignee: ${user?.name ?? value}` : "Click to assign"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "1px 6px 1px 2px", borderRadius: 100,
          border: "1px solid transparent",
          background: "transparent",
          fontSize: "var(--fs-meta)",
          color: value ? "var(--text-secondary)" : "var(--text-tertiary)",
          cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
      >
        {value && user ? (
          <>
            <Avatar userId={value} size="sm" />
            {user.name}
          </>
        ) : (
          <>
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "1.5px dashed var(--border-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-disabled)", fontSize: 10, fontWeight: 600,
            }}>?</span>
            Unassigned
          </>
        )}
        <ChevronDown size={9} style={{ color: "var(--text-tertiary)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          width: 200,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}>
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "7px 10px", textAlign: "left",
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: "var(--fs-body)", color: "var(--text-secondary)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "1.5px dashed var(--border-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-disabled)", fontSize: 10, fontWeight: 600,
            }}>?</span>
            Unassigned
            {value === null && <Check size={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
          </button>
          {USERS.map(u => (
            <button
              key={u.id}
              onClick={() => { onChange(u.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 10px", textAlign: "left",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: "var(--fs-body)", color: "var(--text)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar userId={u.id} size="sm" />
              {u.name}
              {value === u.id && <Check size={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// SignalSourcedAttachmentRow ───────────────────────────────────────────
// Rendered inside the WIP modal's Attachments tab under "Signal attachments".
// Annotates each file with the linked signal's title so the user can trace
// where the file came from. Click → jump to the source signal modal.

function SignalSourcedAttachmentRow({
  attachment, sourceTitle, onOpenSignal,
}: {
  attachment: SignalAttachment;
  sourceTitle: string;
  onOpenSignal?: () => void;
}) {
  const uploader = userById(attachment.uploadedBy);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", background: "var(--bg)",
    }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
    >
      <FileIcon mimeType={attachment.mimeType} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attachment.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", flexWrap: "wrap" }}>
          <span>{attachment.size}</span>
          <span>·</span>
          <span>From signal:</span>
          {onOpenSignal ? (
            <button
              onClick={onOpenSignal}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", cursor: "pointer",
                fontSize: "var(--fs-meta)", fontWeight: 500,
                textDecoration: "underline", textUnderlineOffset: 2,
                maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {sourceTitle}
            </button>
          ) : (
            <span>{sourceTitle}</span>
          )}
          <span>·</span>
          <Avatar userId={attachment.uploadedBy} size="sm" />
          <span>{uploader.name}</span>
        </div>
      </div>
    </div>
  );
}

function AttachmentRow({ attachment }: { attachment: WipAttachment }) {
  const uploader = userById(attachment.uploadedBy);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", background: "var(--bg)",
    }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
    >
      <FileIcon mimeType={attachment.mimeType} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attachment.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", flexWrap: "wrap" }}>
          <span>{attachment.size}</span>
          <span>·</span>
          <Avatar userId={attachment.uploadedBy} size="sm" />
          <span>{uploader.name}</span>
          <span>·</span>
          <span>{absDate(attachment.createdAt)}</span>
        </div>
      </div>
      <VisibilityBadge v={attachment.visibility} />
    </div>
  );
}

// ── ActivityList ──────────────────────────────────────────────────────────
// Read-only chronological feed of card events. Used inside the WIP detail
// modal's Activity tab. Events newer than `previousVisitAt` (client mode
// only) are flagged with a subtle "New" pip so the client can spot what
// changed since they last looked. Empty state: gentle fallback line.

function ActivityList({ events, previousVisitAt }: {
  events: WipEvent[];
  previousVisitAt: string | null;
}) {
  if (events.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: 24,
        color: "var(--text-tertiary)", fontSize: "var(--fs-body)",
      }}>
        No activity yet.
      </div>
    );
  }
  const sorted = events.slice().sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const sinceMs = previousVisitAt ? new Date(previousVisitAt).getTime() : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sorted.map(ev => {
        const actor = userById(ev.actor);
        const isFresh = sinceMs > 0 && new Date(ev.at).getTime() > sinceMs;
        return (
          <div
            key={ev.id}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: isFresh ? "rgba(20,184,166,0.06)" : "var(--bg)",
            }}
          >
            <Avatar userId={ev.actor} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.35,
                display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
              }}>
                <span style={{ fontWeight: 500 }}>{describeWipEvent(ev)}</span>
                {ev.kind === "moved" && ev.fromColumn && (
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    from {prettyColumn(ev.fromColumn)}
                  </span>
                )}
                {isFresh && (
                  <span style={{
                    fontSize: 10, padding: "0 6px", borderRadius: 100,
                    background: "rgba(20,184,166,0.12)", color: "#0f766e",
                    border: "1px solid rgba(20,184,166,0.35)",
                    fontWeight: 500,
                  }}>
                    New
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                {actor.name} · <span title={absDate(ev.at)}>{relTime(ev.at)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Review actions bar ────────────────────────────────────────────────────
// Inline strip shown on Done WIP items (team mode only). Pre-review state
// shows Looks good / Follow-up / Reopen. Once the item is reviewed the bar
// is hidden — the parent stops rendering it for `looks_good`, and `follow_up`
// keeps the bar around so the user can also create follow-up items.

function ReviewActionsBar({
  wip, onLooksGoodClick, onFollowUp, onReopen, onCreateFollowUp,
}: {
  wip: Wip;
  onLooksGoodClick: () => void;
  onFollowUp: () => void;
  onReopen: () => void;
  onCreateFollowUp: (kind: "signal" | "task" | "intent") => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      marginTop: 4, marginBottom: 4,
      padding: "8px 10px",
      borderRadius: "var(--radius)",
      border: "1px solid var(--border)", background: "var(--bg-sunken)",
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        Review
      </span>
      {wip.reviewState === "follow_up" ? (
        <>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            Marked for follow-up. Create a derivative:
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => onCreateFollowUp("signal")}
            style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text)" }}
            title="Spawn a follow-up signal"
          >
            New signal
          </button>
          <button
            onClick={() => onCreateFollowUp("task")}
            style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--task)", fontWeight: 500 }}
            title="Spawn a follow-up task"
          >
            <Task size={11} /> New task
          </button>
          <button
            onClick={() => onCreateFollowUp("intent")}
            style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--intent)", fontWeight: 500 }}
            title="Spawn a follow-up intent"
          >
            <Intent size={11} /> New intent
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onLooksGoodClick}
            style={{
              padding: "4px 12px", borderRadius: "var(--radius)",
              border: "none", background: "#15803d", color: "white",
              fontSize: "var(--fs-meta)", fontWeight: 500,
            }}
            title="Mark this item reviewed"
          >
            <Check size={11} /> Looks good
          </button>
          <button
            onClick={onFollowUp}
            style={{
              padding: "4px 12px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--bg)",
              fontSize: "var(--fs-meta)", color: "var(--text)", fontWeight: 500,
            }}
            title="Flag this item for follow-up work"
          >
            Needs follow-up
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={onReopen}
            style={{
              padding: "4px 10px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--bg)",
              fontSize: "var(--fs-meta)", color: "var(--text-secondary)",
            }}
            title="Move this item back to In Progress"
          >
            ↺ Reopen
          </button>
        </>
      )}
    </div>
  );
}

// ── Follow-up composer ────────────────────────────────────────────────────
// Compact form for creating a follow-up signal / task / intent from the
// review step. Pre-fills with the origin's title/description (the user
// typically tweaks these to describe the new ask). Inline; no modal stack.

function FollowUpComposer({
  kind, originTitle, originDescription, onCancel, onConfirm,
}: {
  kind: "signal" | "task" | "intent";
  originTitle: string;
  originDescription: string;
  onCancel: () => void;
  onConfirm: (title: string, description: string) => void;
}) {
  const titlePrefix = kind === "signal" ? "Follow-up signal:" : "Follow-up:";
  const [title, setTitle] = useState(`${titlePrefix} ${originTitle}`);
  const [description, setDesc] = useState(originDescription);
  const label = kind === "signal" ? "follow-up signal" : kind === "task" ? "follow-up task" : "follow-up intent";

  return (
    <div style={{
      marginTop: 10, marginBottom: 4,
      padding: "10px 12px",
      borderRadius: "var(--radius)",
      border: "1px solid var(--border-strong)", background: "var(--bg-sunken)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 }}>
        Create {label}
      </div>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title"
        style={{
          width: "100%", border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)", padding: "6px 9px",
          fontSize: "var(--fs-body)", background: "var(--bg)",
          outline: "none", marginBottom: 8, boxSizing: "border-box",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
      />
      <textarea
        value={description}
        onChange={e => setDesc(e.target.value)}
        rows={2}
        placeholder="Description"
        style={{
          width: "100%", border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)", padding: "6px 9px",
          fontSize: "var(--fs-body)", background: "var(--bg)",
          outline: "none", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
        <button
          onClick={onCancel}
          style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={() => { if (title.trim()) onConfirm(title.trim(), description); }}
          disabled={!title.trim()}
          style={{
            padding: "4px 12px", borderRadius: "var(--radius)",
            border: "none",
            background: title.trim() ? "var(--accent)" : "var(--bg-sunken)",
            color: title.trim() ? "white" : "var(--text-disabled)",
            fontSize: "var(--fs-meta)", fontWeight: 500,
          }}
        >
          Create {kind}
        </button>
      </div>
    </div>
  );
}

// ── Linked signal row (with copy-description button) ──────────────────────

function LinkedSignalRow({ sig, onOpen }: { sig: Signal; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(sig.description);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // fallback for insecure contexts
      const ta = document.createElement("textarea");
      ta.value = sig.description;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
      document.body.removeChild(ta);
    }
  };

  const dotColor = sig.status === "new" ? "var(--status-new)"
    : sig.status === "accepted" ? "var(--status-accepted)"
    : sig.status === "ready"    ? "var(--status-ready)"
    : sig.status === "closed"   ? "var(--text-disabled)"
    : "var(--status-rejected)";

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        width: "100%", padding: "8px 10px",
        borderRadius: "var(--radius)", border: "1px solid var(--border)",
        background: "var(--bg)", marginBottom: 6,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
    >
      <span style={{
        marginTop: 6, width: 7, height: 7, borderRadius: 999, flexShrink: 0,
        background: dotColor,
        display: "inline-block",
      }} />
      <button
        onClick={onOpen}
        style={{
          flex: 1, minWidth: 0,
          background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer",
        }}
        title="Open signal"
      >
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", lineHeight: 1.3 }}>{sig.title}</div>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{sig.id}</span>
        {sig.description && (
          <div style={{
            fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.35, marginTop: 3,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {sig.description}
          </div>
        )}
        {/* TPA annotation inline — 2-line clamp, purple accent. Surfaced
            here too so the user can spot context without expanding the
            Additional-context excerpts above. Hidden when empty. */}
        {sig.tpaNote && (
          <div style={{
            marginTop: 5, paddingLeft: 8,
            borderLeft: "2px solid #7c3aed",
          }}>
            <div style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
              textTransform: "uppercase", color: "#7c3aed", marginBottom: 1,
            }}>
              TPA context
            </div>
            <div style={{
              fontSize: 11, color: "var(--text)", lineHeight: 1.4,
              fontStyle: "italic",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {sig.tpaNote}
            </div>
          </div>
        )}
      </button>
      <button
        onClick={copy}
        title={copied ? "Copied!" : "Copy description"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "4px 6px", marginTop: 1,
          borderRadius: "var(--radius)", border: "1px solid transparent",
          background: copied ? "#f0fdf4" : "transparent",
          color: copied ? "#15803d" : "var(--text-tertiary)",
          fontSize: 10.5, fontWeight: 500,
          cursor: "pointer", flexShrink: 0,
        }}
        onMouseEnter={e => { if (!copied) { e.currentTarget.style.background = "var(--bg-sunken)"; e.currentTarget.style.color = "var(--text)"; } }}
        onMouseLeave={e => { if (!copied) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; } }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "Copied" : ""}
      </button>
    </div>
  );
}

// ── WipPage ────────────────────────────────────────────────────────────────
type BacklogFilter = "all" | "task" | "intent";

export function WipPage() {
  const { wipItems, sprints, newSprint, openWip, moveWip, selectedWipId, appMode, wipEvents, clientPreviousVisitAt } = useStore();
  const readOnly = appMode === "client";
  const [backlogOver, setBacklogOver] = useState(false);
  const [backlogFilter, setBacklogFilter] = useState<BacklogFilter>("all");
  const [whatChangedOpen, setWhatChangedOpen] = useState(false);
  const [showChangesOnly, setShowChangesOnly] = useState(false);

  const allBacklogItems = wipItems.filter(w => w.location === "backlog");
  // In "Show changes" mode the backlog rail is also restricted to fresh
  // items so the entire board honours the same filter.
  const typeFilteredBacklog = backlogFilter === "all"
    ? allBacklogItems
    : allBacklogItems.filter(w => w.type === backlogFilter);

  // "Since" anchor for the timeline panel:
  //  - Client mode: use the visit snapshot so the panel mirrors the card
  //    highlights exactly.
  //  - Team mode (or no snapshot): fall back to the last 48 hours so the
  //    panel always has fresh content.
  // Computed inside an effect (not during render) so the value matches on
  // SSR + hydration: Date.now() varies between the two and would otherwise
  // produce a count badge that flashes when React re-renders post-hydration.
  const [sinceISO, setSinceISO] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSinceISO(
      clientPreviousVisitAt
        ?? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    );
  }, [clientPreviousVisitAt]);
  const recentEventsCount = sinceISO
    ? wipEvents.filter(e => e.at > sinceISO).length
    : 0;

  // ID set of cards with fresh activity since the visit snapshot. Drives
  // every cross-sprint surface in this layout: card badges, sprint badges,
  // backlog badge, and the "Show changes" filter.
  const freshIds = useMemo(() => freshWipIdSet(wipEvents, sinceISO), [wipEvents, sinceISO]);
  const backlogItems = (showChangesOnly
    ? typeFilteredBacklog.filter(w => freshIds.has(w.id))
    : typeFilteredBacklog
  ).slice().sort((a, b) => {
    // Same manual-rank rule as Sprint columns: explicit `order` first,
    // then everything else in creation order.
    const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
  const backlogFreshCount = allBacklogItems.reduce(
    (n, w) => (freshIds.has(w.id) ? n + 1 : n), 0,
  );
  const totalFreshCount = wipItems.reduce(
    (n, w) => (freshIds.has(w.id) ? n + 1 : n), 0,
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Backlog rail */}
      <div
        style={{
          width: 300, flexShrink: 0, borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", background: "var(--bg)",
        }}
        onDragOver={e => { if (readOnly) return; e.preventDefault(); setBacklogOver(true); }}
        onDragLeave={() => setBacklogOver(false)}
        onDrop={e => {
          if (readOnly) return;
          e.preventDefault(); setBacklogOver(false);
          const wipId = e.dataTransfer.getData("wipId");
          if (wipId) moveWip(wipId, "backlog", "backlog");
        }}
      >
        <div style={{
          display: "flex", flexDirection: "column", gap: 0,
          padding: "10px 14px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0,
          background: backlogOver ? "var(--bg-selected)" : "var(--bg)", transition: "background 0.1s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--fs-body)", color: "var(--text)" }}>Backlog</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, monospace" }}>
              {allBacklogItems.length}
            </span>
            {/* Backlog-level update badge — same teal pill as the sprint
                headers, rendered only when there's fresh activity. */}
            {backlogFreshCount > 0 && (
              <span
                title={`${backlogFreshCount} update${backlogFreshCount === 1 ? "" : "s"} in backlog since your last visit`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "1px 7px", borderRadius: 100,
                  background: "rgba(20,184,166,0.10)",
                  color: "#0f766e",
                  border: "1px solid rgba(20,184,166,0.35)",
                  fontSize: 10.5, fontWeight: 600, marginLeft: "auto",
                }}
              >
                ◔ {backlogFreshCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "task", "intent"] as BacklogFilter[]).map(f => {
              const active = backlogFilter === f;
              const label = f === "all" ? "All" : f === "task" ? "Tasks" : "Intents";
              const activeColor = f === "task" ? "rgba(124,58,237,1)" : f === "intent" ? "rgba(14,165,233,1)" : "var(--accent)";
              const activeBg = f === "task" ? "rgba(124,58,237,0.1)" : f === "intent" ? "rgba(14,165,233,0.1)" : "var(--bg-selected)";
              return (
                <button
                  key={f}
                  onClick={() => setBacklogFilter(f)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 100, fontSize: 11, fontWeight: 500,
                    background: active ? activeBg : "transparent",
                    color: active ? activeColor : "var(--text-tertiary)",
                    border: active ? `1px solid ${f === "task" ? "rgba(124,58,237,0.25)" : f === "intent" ? "rgba(14,165,233,0.25)" : "var(--border)"}` : "1px solid transparent",
                  }}
                >
                  {f === "task" && <Task size={10} />}
                  {f === "intent" && <Intent size={10} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {backlogItems.map(w => <WipCard key={w.id} wip={w} onClick={() => openWip(w.id)} />)}
          {backlogItems.length === 0 && (
            <div style={{
              margin: "12px 0", padding: "20px", textAlign: "center",
              fontSize: "var(--fs-meta)", color: "var(--text-disabled)",
              border: "1px dashed var(--border)", borderRadius: "var(--radius)",
            }}>
              {readOnly
                ? "No backlog items"
                : backlogOver ? "Drop to add to backlog" : "Drag items here to add to backlog"}
            </div>
          )}
        </div>
      </div>

      {/* Sprint area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Sprints</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShowChangesToggle
              active={showChangesOnly}
              count={totalFreshCount}
              onChange={setShowChangesOnly}
            />
            <WhatChangedTrigger
              count={recentEventsCount}
              onClick={() => setWhatChangedOpen(true)}
            />
            {!readOnly && (
              <button
                onClick={newSprint}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", background: "var(--bg)",
                  fontSize: "var(--fs-meta)", color: "var(--text-secondary)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
              >
                <Plus size={12} /> New sprint
              </button>
            )}
          </div>
        </div>
        {sprints.map(s => (
          <SprintBlock
            key={s.id}
            sprintId={s.id}
            freshIds={freshIds}
            showChangesOnly={showChangesOnly}
          />
        ))}
        {/* Empty state when "Show changes" is active and nothing is fresh
            anywhere — across all sprints, in backlog, or otherwise. */}
        {showChangesOnly && totalFreshCount === 0 && (
          <div style={{
            margin: "60px auto", maxWidth: 360, textAlign: "center",
          }}>
            <div style={{
              fontSize: "var(--fs-body)", color: "var(--text-secondary)",
              lineHeight: 1.55, marginBottom: 12,
            }}>
              No changes since your last visit.
            </div>
            <button
              onClick={() => setShowChangesOnly(false)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 100,
                border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: "var(--fs-meta)", fontWeight: 500, cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
            >
              Show full board
            </button>
          </div>
        )}
      </div>

      {/* What-changed timeline drawer */}
      {whatChangedOpen && sinceISO && (
        <WhatChangedPanel
          events={wipEvents}
          wipItems={wipItems}
          sprints={sprints}
          sinceISO={sinceISO}
          onClose={() => setWhatChangedOpen(false)}
          onOpenWip={(id) => { setWhatChangedOpen(false); openWip(id); }}
        />
      )}

      {/* Modal */}
      {selectedWipId && <WipModal />}
      <SignalModal />
    </div>
  );
}

// ── ShowChangesToggle ─────────────────────────────────────────────────────
// Pill toggle: when active, the Kanban shrinks to only the cards that have
// fresh activity since the visit snapshot — across all sprints + backlog.
// We disable the button entirely when there's nothing to filter to so the
// user doesn't end up in an empty board with no obvious way back.

function ShowChangesToggle({
  active, count, onChange,
}: {
  active: boolean;
  count: number;
  onChange: (v: boolean) => void;
}) {
  const disabled = count === 0 && !active;
  return (
    <button
      onClick={() => { if (!disabled) onChange(!active); }}
      disabled={disabled}
      title={
        disabled       ? "No changes since your last visit"
        : active       ? "Show the full board"
                       : `Show only the ${count} card${count === 1 ? "" : "s"} that changed since your last visit`
      }
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 10px",
        borderRadius: 100,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "var(--accent)" : "var(--bg)",
        color: active ? "white" : (disabled ? "var(--text-disabled)" : "var(--text-secondary)"),
        fontSize: "var(--fs-meta)", fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={e => {
        if (disabled || active) return;
        e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={e => {
        if (disabled || active) return;
        e.currentTarget.style.background = "var(--bg)";
      }}
    >
      <span aria-hidden style={{ fontSize: 11 }}>{active ? "✓" : "◔"}</span>
      <span>{active ? "Showing changes" : "Show changes"}</span>
      {!active && count > 0 && (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 16, padding: "0 5px",
          borderRadius: 100,
          background: "rgba(20,184,166,0.14)",
          color: "#0f766e",
          fontSize: 10.5, fontWeight: 600,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── WhatChangedTrigger ────────────────────────────────────────────────────
// Subtle pill button at the top of the Sprint area. The optional count chip
// surfaces "there's something for you to read" without being loud.

function WhatChangedTrigger({ count, onClick }: { count: number; onClick: () => void }) {
  const hasNew = count > 0;
  return (
    <button
      onClick={onClick}
      title={hasNew ? `${count} update${count === 1 ? "" : "s"} since your last visit` : "View recent activity"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 10px",
        borderRadius: 100,
        border: hasNew ? "1px solid rgba(20,184,166,0.45)" : "1px solid var(--border)",
        background: hasNew ? "rgba(20,184,166,0.08)" : "var(--bg)",
        color: hasNew ? "#0f766e" : "var(--text-secondary)",
        fontSize: "var(--fs-meta)", fontWeight: 500,
        cursor: "pointer",
        transition: "background 0.1s, border-color 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = hasNew ? "rgba(20,184,166,0.14)" : "var(--bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = hasNew ? "rgba(20,184,166,0.08)" : "var(--bg)"; }}
    >
      <span aria-hidden>👉</span>
      <span>What changed</span>
      {hasNew && (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 16, padding: "0 5px",
          borderRadius: 100,
          background: "#0f766e", color: "white",
          fontSize: 10.5, fontWeight: 600,
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── WhatChangedPanel ──────────────────────────────────────────────────────
// Right-side drawer that turns the WIP event log into plain English. Groups
// events by Today / Yesterday / Earlier (newest first), shows a sprint-name
// suffix on every row so cross-sprint moves are still readable, and makes
// each row clickable to jump straight to the card detail. Pure read view —
// no editing happens here regardless of mode.

function WhatChangedPanel({
  events, wipItems, sprints, sinceISO, onClose, onOpenWip,
}: {
  events: WipEvent[];
  wipItems: Wip[];
  sprints: Sprint[];
  sinceISO: string;
  onClose: () => void;
  onOpenWip: (wipId: string) => void;
}) {
  // Esc to close, click outside to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const sinceMs = new Date(sinceISO).getTime();
  // Newest first. We deliberately keep events for cards that no longer exist
  // — clients still want to know "X was created" even if it was archived.
  const recent = events
    .filter(e => new Date(e.at).getTime() > sinceMs)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Group by Today / Yesterday / Earlier using local-date comparison.
  const today = startOfDay(new Date());
  const yesterday = startOfDay(new Date(today.getTime() - 86400000));
  const groups: { label: string; rows: WipEvent[] }[] = [
    { label: "Today",     rows: [] },
    { label: "Yesterday", rows: [] },
    { label: "Earlier",   rows: [] },
  ];
  for (const ev of recent) {
    const day = startOfDay(new Date(ev.at)).getTime();
    if (day === today.getTime())          groups[0].rows.push(ev);
    else if (day === yesterday.getTime()) groups[1].rows.push(ev);
    else                                   groups[2].rows.push(ev);
  }

  const sinceLabel = formatSinceLabel(sinceISO);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        background: "rgba(15,23,42,0.30)",
        animation: "fadeIn 0.15s ease",
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <aside
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="What changed"
        style={{
          width: "min(380px, 92vw)",
          height: "100%",
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column",
          animation: "slideInRight 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              What changed
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              {recent.length === 0
                ? `No new activity ${sinceLabel}`
                : `${recent.length} update${recent.length === 1 ? "" : "s"} ${sinceLabel}`}
            </div>
          </div>
          <button
            onClick={onClose}
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

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 12px 24px" }}>
          {recent.length === 0 ? (
            <div style={{
              margin: "40px auto", maxWidth: 240, textAlign: "center",
              fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.5,
            }}>
              No moves, no new items. Check back later.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {groups.filter(g => g.rows.length > 0).map(group => (
                <div key={group.label}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
                    textTransform: "uppercase", color: "var(--text-tertiary)",
                    margin: "0 6px 6px",
                  }}>
                    {group.label}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.rows.map(ev => {
                      const wip = wipItems.find(w => w.id === ev.wipId);
                      return (
                        <TimelineRow
                          key={ev.id}
                          event={ev}
                          wip={wip}
                          sprints={sprints}
                          onOpen={() => onOpenWip(ev.wipId)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function TimelineRow({
  event, wip, sprints, onOpen,
}: {
  event: WipEvent;
  wip: Wip | undefined;
  sprints: Sprint[];
  onOpen: () => void;
}) {
  const verbInfo = describeTimelineEvent(event);
  const sprintLabel = locationLabel(event.toLocation ?? wip?.location, sprints);
  // Title fallback when the WIP item was archived/removed: still show the
  // event's verb so the timeline never goes silent on us.
  const title = wip?.title ?? "(archived item)";
  const isOrphan = !wip;

  return (
    <button
      onClick={isOrphan ? undefined : onOpen}
      disabled={isOrphan}
      title={isOrphan ? "This item is no longer on the board" : "Open card"}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "8px 10px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--bg)",
        textAlign: "left",
        cursor: isOrphan ? "default" : "pointer",
        opacity: isOrphan ? 0.65 : 1,
        transition: "background 0.1s, border-color 0.1s",
        width: "100%",
      }}
      onMouseEnter={e => { if (!isOrphan) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, flexShrink: 0,
        borderRadius: 100,
        fontSize: 11, fontWeight: 600, lineHeight: 1,
        color: verbInfo.color, background: verbInfo.bg, border: `1px solid ${verbInfo.border}`,
      }}>
        {verbInfo.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "var(--fs-body)", lineHeight: 1.35, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 11, color: "var(--text-tertiary)", marginTop: 2,
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
        }}>
          <span style={{ color: "var(--text-secondary)" }}>{verbInfo.verb}</span>
          {sprintLabel && (
            <>
              <span>·</span>
              <span>{sprintLabel}</span>
            </>
          )}
          <span>·</span>
          <span title={absDate(event.at)}>{relTime(event.at)}</span>
        </div>
      </div>
    </button>
  );
}

// Maps an event kind (and target column for moves) to the small icon /
// colour swatch + plain-English verb shown in the timeline.
function describeTimelineEvent(ev: WipEvent): {
  icon: string; verb: string;
  color: string; bg: string; border: string;
} {
  if (ev.kind === "created") {
    return {
      icon: "+", verb: `New in ${prettyColumn(ev.toColumn)}`,
      color: "#0f766e", bg: "rgba(20,184,166,0.10)", border: "rgba(20,184,166,0.35)",
    };
  }
  if (ev.kind === "reopened") {
    return {
      icon: "↺", verb: "Reopened",
      color: "#b45309", bg: "#fffbeb", border: "#fcd34d",
    };
  }
  if (ev.kind === "signal_linked") {
    return ev.unlinked ? {
      icon: "−", verb: "Source signal removed",
      color: "var(--text-secondary)", bg: "var(--bg-sunken)", border: "var(--border)",
    } : {
      icon: "+", verb: "Source signal added",
      color: "var(--text-secondary)", bg: "var(--bg-sunken)", border: "var(--border)",
    };
  }
  if (ev.kind === "needs_review") {
    return {
      icon: "?", verb: "Marked Needs review",
      color: "#b45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.45)",
    };
  }
  if (ev.kind === "reviewed_looks_good") {
    return {
      icon: "✓", verb: "Reviewed — Looks good",
      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0",
    };
  }
  if (ev.kind === "reviewed_follow_up") {
    return {
      icon: "⤴", verb: "Reviewed — Follow-up needed",
      color: "#b91c1c", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.30)",
    };
  }
  if (ev.kind === "follow_up_created") {
    const k = ev.followUpKind ?? "item";
    return {
      icon: "+", verb: `Follow-up ${k} created`,
      color: "var(--accent)", bg: "var(--accent-soft)", border: "rgba(59,130,246,0.35)",
    };
  }
  if (ev.kind === "linked_signals_closed") {
    const n = ev.closedSignalCount ?? 0;
    return {
      icon: "✕", verb: `${n} linked signal${n === 1 ? "" : "s"} closed`,
      color: "var(--text-secondary)", bg: "var(--bg-sunken)", border: "var(--border)",
    };
  }
  // moved
  if (ev.toColumn === "done") {
    return {
      icon: "✓", verb: "Moved to Done",
      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0",
    };
  }
  return {
    icon: "→", verb: `Moved to ${prettyColumn(ev.toColumn)}`,
    color: "var(--accent)", bg: "var(--accent-soft)", border: "rgba(59,130,246,0.35)",
  };
}

// Resolves a stored location to a friendly label. Sprints become "Sprint 14"
// (using whatever the sprint is named today) so cross-sprint moves read
// naturally; the special "backlog" string becomes "Backlog".
function locationLabel(loc: string | undefined, sprints: Sprint[]): string | null {
  if (!loc) return null;
  if (loc === "backlog") return "Backlog";
  const sprint = sprints.find(s => s.id === loc);
  return sprint?.name ?? loc;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// "since your last visit" / "since 2d ago" / "since Apr 26" depending on age.
function formatSinceLabel(sinceISO: string): string {
  const ms = Date.now() - new Date(sinceISO).getTime();
  const hours = ms / (60 * 60 * 1000);
  if (hours < 36)        return "since your last visit";
  if (hours < 24 * 14)   return `in the last ${Math.round(hours / 24)} days`;
  return `since ${absDate(sinceISO)}`;
}

// ── IntentTraceabilitySection ─────────────────────────────────────────────
// Single "Linked context" block for the intent detail. Surfaces the four
// link kinds an intent can reach, in this order:
//   1. Linked goals — weekly goals whose linkedIntentIds contains this
//      intent. Editable inline (add via picker, remove with ×).
//   2. Linked product targets — features + feature slices that directly
//      link this intent, plus product capabilities reached through any
//      of the linked goals' linkedCapabilityIds (capabilities have no
//      direct intent link in the V1 data model, so we derive them).
//      Read-only here — adding a target happens on the Roadmap side.
//   3. Linked signals — signals.linkedWip backreferences (mirrors the
//      old "Source signals" block but renamed and editable).
//   4. Tasks — child tasks. The V1 data model doesn't have a strict
//      parent/child column, so we list tasks whose followUpOfWipId
//      points at this intent (i.e. tasks created from this intent's
//      review step). Hidden when there are none.
function IntentTraceabilitySection({ wip }: { wip: Wip }) {
  const {
    weeklyGoals, features, featureSlices, productCapabilities,
    wipItems, signals,
    toggleGoalIntent, linkSignalToWip, unlinkSignalFromWip,
    setRoute, setRoadmapFocus, openWip, openSignal, appMode,
  } = useStore();
  const readOnly = appMode === "client";

  const linkedGoals = weeklyGoals.filter(g => g.linkedIntentIds.includes(wip.id));
  const linkedFeatures = features.filter(f => f.linkedIntentIds.includes(wip.id));
  const linkedSlices = featureSlices.filter(s => s.linkedIntentIds.includes(wip.id));
  // Capability link is derived: any capability linked by a goal that
  // also links this intent counts. This gives the user a useful
  // traceability hint without adding a direct intent→capability edge.
  const goalCapIds = new Set(linkedGoals.flatMap(g => g.linkedCapabilityIds));
  const linkedCapabilities = productCapabilities.filter(c => goalCapIds.has(c.id));
  const linkedSignalRows = signals.filter(s => wip.linkedSignals.includes(s.id));
  const childTasks = wipItems.filter(w => w.type === "task" && w.followUpOfWipId === wip.id);

  const productTargetCount = linkedFeatures.length + linkedSlices.length + linkedCapabilities.length;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <div style={{
        fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
        fontWeight: 500, marginBottom: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <Link size={12} /> Linked context · traceability
        <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-tertiary)" }}>
          · why this intent exists and what it implements
        </span>
      </div>

      {/* Linked goals — editable */}
      <TraceSubsection
        title="Linked goals"
        count={linkedGoals.length}
        action={!readOnly && (
          <TracePicker
            label="Link weekly goal"
            options={weeklyGoals.map(g => ({
              id: g.id, label: g.title,
              subtitle: `${g.weekLabel} · ${g.status === "in_progress" ? "In progress" : g.status === "done" ? "Done" : "Planned"}`,
            }))}
            selectedIds={linkedGoals.map(g => g.id)}
            onToggle={(goalId) => toggleGoalIntent(goalId, wip.id)}
          />
        )}
        emptyHint="No weekly goals linked yet. Every active intent should satisfy at least one goal."
      >
        {linkedGoals.map(g => (
          <TraceRow
            key={g.id}
            onOpen={() => {
              openWip(null);
              setRoadmapFocus({ tab: "weekly", goalId: g.id });
              setRoute("roadmap");
            }}
            onRemove={readOnly ? undefined : () => toggleGoalIntent(g.id, wip.id)}
            removeTitle="Unlink this goal from the intent"
            leading={
              <span style={traceMonoPill()}>{g.weekLabel}</span>
            }
            label={g.title}
            right={
              <span style={traceStatusPill(g.status)}>
                {g.status === "in_progress" ? "In progress" : g.status === "done" ? "Done" : "Planned"}
              </span>
            }
          />
        ))}
      </TraceSubsection>

      {/* Linked product targets — read-only derived */}
      <TraceSubsection
        title="Linked product targets"
        count={productTargetCount}
        emptyHint="No product targets reach this intent yet. Link from a goal, feature, or feature slice on the Roadmap."
      >
        {linkedFeatures.map(f => (
          <TraceRow
            key={`f-${f.id}`}
            onOpen={() => {
              openWip(null);
              setRoadmapFocus({ tab: "product", featureId: f.id });
              setRoute("roadmap");
            }}
            leading={<span style={traceKindPill("feature")}>Feature</span>}
            label={f.title}
          />
        ))}
        {linkedSlices.map(s => {
          const parent = features.find(f => f.id === s.featureId);
          return (
            <TraceRow
              key={`s-${s.id}`}
              onOpen={() => {
                openWip(null);
                setRoadmapFocus({ tab: "product", featureId: s.featureId, sliceId: s.id });
                setRoute("roadmap");
              }}
              leading={<span style={traceKindPill("slice")}>Slice</span>}
              label={s.title}
              right={parent ? <span style={traceParentPill()}>{parent.title}</span> : undefined}
            />
          );
        })}
        {linkedCapabilities.map(c => {
          const parent = features.find(f => f.id === c.featureId);
          return (
            <TraceRow
              key={`c-${c.id}`}
              onOpen={() => {
                openWip(null);
                setRoadmapFocus({ tab: "product", featureId: c.featureId });
                setRoute("roadmap");
              }}
              leading={<span style={traceKindPill("capability")}>Capability</span>}
              label={c.title}
              right={parent ? <span style={traceParentPill()}>{parent.title}</span> : undefined}
            />
          );
        })}
      </TraceSubsection>

      {/* Linked signals — editable */}
      <TraceSubsection
        title="Linked signals"
        count={linkedSignalRows.length}
        action={!readOnly && (
          <TracePicker
            label="Link signal"
            options={signals.map(s => ({
              id: s.id, label: s.title,
              subtitle: s.description?.slice(0, 80),
            }))}
            selectedIds={linkedSignalRows.map(s => s.id)}
            onToggle={(signalId) => {
              if (wip.linkedSignals.includes(signalId)) {
                unlinkSignalFromWip(signalId, wip.id);
              } else {
                // Default relationship matches the existing "create from
                // signals" flow: "partially_addresses" reads as
                // "contributes to (source signal)".
                linkSignalToWip(signalId, wip.id, "partially_addresses");
              }
            }}
          />
        )}
        emptyHint="No signals linked yet. Intents may satisfy signals — the link is a human/product decision."
      >
        {linkedSignalRows.map(sig => (
          <LinkedSignalRow
            key={sig.id}
            sig={sig}
            onOpen={() => { openWip(null); openSignal(sig.id); }}
          />
        ))}
      </TraceSubsection>

      {/* Tasks — child tasks. Only shown when at least one exists.
          V1 prototype has no formal intent→tasks ownership, so we surface
          tasks created from this intent's review step (followUpOfWipId). */}
      {childTasks.length > 0 && (
        <TraceSubsection
          title="Tasks"
          count={childTasks.length}
          emptyHint=""
        >
          {childTasks.map(t => (
            <TraceRow
              key={t.id}
              onOpen={() => openWip(t.id)}
              leading={<span style={traceKindPill("task")}>Task</span>}
              label={t.title}
              right={
                <span style={traceStatusPill(taskColumnAsStatus(t))}>
                  {taskColumnLabel(t)}
                </span>
              }
            />
          ))}
        </TraceSubsection>
      )}
    </div>
  );
}

// ── Trace subsection / row / picker helpers ──────────────────────────────

function TraceSubsection({
  title, count, action, emptyHint, children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          {title}
        </span>
        {count > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>· {count}</span>
        )}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {count === 0 ? (
        emptyHint && (
          <div style={{
            fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45,
            padding: "4px 2px",
          }}>
            {emptyHint}
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TraceRow({
  onOpen, onRemove, removeTitle, leading, label, right,
}: {
  onOpen?: () => void;
  onRemove?: () => void;
  removeTitle?: string;
  leading?: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 8px",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)",
    }}>
      {leading}
      {onOpen ? (
        <button
          onClick={onOpen}
          style={{
            flex: 1, minWidth: 0, textAlign: "left",
            background: "transparent", border: "none", padding: 0,
            fontSize: "var(--fs-body)", color: "var(--text)", cursor: "pointer",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
          title={label}
        >
          {label}
        </button>
      ) : (
        <span style={{
          flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={label}>
          {label}
        </span>
      )}
      {right}
      {onRemove && (
        <button
          onClick={onRemove}
          title={removeTitle ?? "Remove link"}
          aria-label={removeTitle ?? "Remove link"}
          style={{
            padding: 4, border: "none", background: "transparent",
            color: "var(--text-tertiary)", cursor: "pointer",
            borderRadius: "var(--radius-sm)", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function TracePicker({
  options, selectedIds, onToggle, label,
}: {
  options: { id: string; label: string; subtitle?: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter(o =>
        o.label.toLowerCase().includes(normalized) ||
        (o.subtitle?.toLowerCase().includes(normalized) ?? false))
    : options;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={label}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "2px 8px", borderRadius: "var(--radius)",
          border: "1px dashed var(--border-strong)",
          background: "transparent", color: "var(--text-tertiary)",
          fontSize: 10.5, fontWeight: 500, cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
      >
        <Plus size={10} /> Link
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 320, maxHeight: 320, display: "flex", flexDirection: "column",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            {label}
          </div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              padding: "6px 10px", border: "none", borderBottom: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", outline: "none",
            }}
          />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textAlign: "center" }}>
                Nothing available to link.
              </div>
            ) : filtered.map(opt => {
              const sel = selectedIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => onToggle(opt.id)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    width: "100%", padding: "6px 10px", textAlign: "left",
                    background: "transparent", border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 14, height: 14, borderRadius: 3, marginTop: 2,
                    border: sel ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
                    background: sel ? "var(--accent)" : "transparent",
                    flexShrink: 0,
                  }}>
                    {sel && <Check size={9} style={{ color: "white" }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {opt.label}
                    </div>
                    {opt.subtitle && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {opt.subtitle}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function traceMonoPill(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    textTransform: "uppercase", color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
  };
}
function traceParentPill(): React.CSSProperties {
  return {
    fontSize: 10, color: "var(--text-tertiary)",
    background: "var(--bg-sunken)",
    border: "1px solid var(--border)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap",
  };
}
function traceStatusPill(s: "planned" | "in_progress" | "done" | "not_started"): React.CSSProperties {
  const bg =
    s === "done"        ? "rgba(34,197,94,0.10)" :
    s === "in_progress" ? "rgba(245,158,11,0.10)" :
    s === "planned"     ? "rgba(59,130,246,0.10)" :
                          "var(--bg-sunken)";
  const color =
    s === "done"        ? "#15803d" :
    s === "in_progress" ? "#b45309" :
    s === "planned"     ? "#1d4ed8" :
                          "var(--text-tertiary)";
  return {
    fontSize: 10, color, background: bg,
    border: "1px solid currentColor",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap", opacity: 0.95,
  };
}
function traceKindPill(kind: "feature" | "slice" | "capability" | "task"): React.CSSProperties {
  const palette: Record<typeof kind, { bg: string; color: string }> = {
    feature:    { bg: "rgba(59,130,246,0.10)",  color: "#1d4ed8" },
    slice:      { bg: "rgba(168,85,247,0.10)",  color: "#7e22ce" },
    capability: { bg: "rgba(20,184,166,0.10)",  color: "#0f766e" },
    task:       { bg: "rgba(124,58,237,0.10)",  color: "#6d28d9" },
  };
  const p = palette[kind];
  return {
    fontSize: 10, fontWeight: 600,
    color: p.color, background: p.bg,
    border: `1px solid ${p.color}`,
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap", letterSpacing: 0.2,
  };
}

function taskColumnAsStatus(w: Wip): "planned" | "in_progress" | "done" | "not_started" {
  if (w.column === "done") return "done";
  if (w.column === "in_progress") return "in_progress";
  if (w.column === "to_do") return "planned";
  return "not_started";
}
function taskColumnLabel(w: Wip): string {
  if (w.column === "done") return "Done";
  if (w.column === "in_progress") return "In progress";
  if (w.column === "to_do") return "To do";
  return "Backlog";
}
