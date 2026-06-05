"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Signal, HideUnderRule, SignalPriority, SignalStatus, SignalComment, SignalAttachment, Visibility, USERS, userById, WipType, computeAutoPriority, deriveDigest, suggestLabelsForSignal, recentlyUsedLabels, SPLIT_MAX_PER_SOURCE, splitChildrenCount, duplicateStateOf, isDuplicateGroupNewOrChanged } from "@/lib/data";
import { StatusDot } from "@/components/ui/dot";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/label-chip";
import { LabelPicker } from "@/components/ui/label-picker";
import { HiddenCountBadge, TaskCreatedBadge, IntentCreatedBadge, ClosedBadge } from "@/components/ui/related-badge";
import { X, ChevronLeft, ChevronRight, Edit, Image, Link, Task, Intent, Tag, Plus, Copy } from "@/components/ui/icons";
import { absDate, relTime } from "@/lib/time";
import { DuplicateSection } from "./duplicate-section";
import { SplitSignalModal } from "@/components/split-signal-modal";

// ── Create work item form (with description) ──────────────────────────────

function CreateWorkItemForm({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const { createFromSignal } = useStore();
  const [type, setType]         = useState<WipType>("task");
  const [title, setTitle]       = useState(signal.title);
  const [description, setDesc]  = useState(signal.description);
  // null = unassigned (default). Stored as the user id once selected.
  const [assignee, setAssignee] = useState<string | null>(null);

  const submit = () => {
    if (!title.trim()) return;
    if (signal.status !== "ready") {
      const ok = window.confirm(
        `This signal is not marked Ready yet. Create ${type} anyway?`
      );
      if (!ok) return;
    }
    // Send title/description through too — the form lets the user override
    // the prefilled values, and we shouldn't drop their edits.
    void title; // store-side createFromSignal currently uses signal.title
    createFromSignal(signal.id, type, { description, assignee });
    onClose();
  };

  return (
    <div style={{ marginTop: 10, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg)", background: "var(--bg-sunken)", padding: 14 }}>
      <div style={{ fontSize: "var(--fs-meta)", fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
        Create work item
      </div>

      {/* Type selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["task", "intent"] as WipType[]).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: "var(--radius)",
              border: type === t ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: type === t ? "var(--accent-soft)" : "var(--bg)",
              fontSize: "var(--fs-meta)", fontWeight: type === t ? 500 : 400,
              color: type === t ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {t === "task" ? <Task size={11} /> : <Intent size={11} />}
            {t === "task" ? "Task" : "Intent"}
          </button>
        ))}
      </div>

      {/* Title */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 4 }}>Title</div>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          style={{ width: "100%", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "6px 9px", fontSize: "var(--fs-body)", background: "var(--bg)", outline: "none" }}
          onFocus={e => (e.target.style.borderColor = "var(--accent)")}
          onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 4 }}>Description</div>
        <textarea
          value={description} onChange={e => setDesc(e.target.value)} rows={3}
          placeholder="Optional description for this work item…"
          style={{ width: "100%", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", padding: "6px 9px", fontSize: "var(--fs-body)", background: "var(--bg)", outline: "none", resize: "vertical", lineHeight: 1.5 }}
          onFocus={e => (e.target.style.borderColor = "var(--accent)")}
          onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
        />
      </div>

      {/* Assignee — pick a user up front so the wip lands assigned, or
          leave it Unassigned (default) and assign later from the WIP detail. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 4 }}>Assignee</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <button
            onClick={() => setAssignee(null)}
            style={assigneePillStyle(assignee === null)}
          >
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 16, height: 16, borderRadius: "50%",
              border: "1.5px dashed var(--border-strong)",
              color: "var(--text-disabled)", fontSize: 9, fontWeight: 600,
            }}>?</span>
            Unassigned
          </button>
          {USERS.map(u => (
            <button
              key={u.id}
              onClick={() => setAssignee(u.id)}
              style={assigneePillStyle(assignee === u.id)}
            >
              <Avatar userId={u.id} size="sm" />
              {u.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)", background: "var(--bg)" }}>Cancel</button>
        <button
          onClick={submit} disabled={!title.trim()}
          style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "none", background: title.trim() ? "var(--accent)" : "var(--bg-sunken)", color: title.trim() ? "white" : "var(--text-disabled)", fontSize: "var(--fs-meta)", fontWeight: 500 }}
        >
          Create {type}
        </button>
      </div>
    </div>
  );
}

// ── Signal actions ─────────────────────────────────────────────────────────

function SignalActions({ signal, onCreateWork, onSplit }: {
  signal: Signal;
  onCreateWork: () => void;
  // Split / clone the signal. We render a small ghost button in every
  // status branch so it's always reachable from the modal regardless of
  // where the signal is in its lifecycle.
  onSplit: () => void;
}) {
  const { updateSignal, closeSignalWithReason, skipSignal, rejectSignalWithReason, reopenSignalWithReason, reviveSkip, wipItems, signals, duplicateGroups, applyStatusToDuplicateGroup } = useStore();

  // Confirmed duplicate groups act as one unit (per spec). Status changes
  // initiated from any member apply to every signal in the group with no
  // prompt — the group has already been confirmed by the user, so the
  // "only this / all" question is moot.
  const dupState = duplicateStateOf(duplicateGroups, signal.id);
  const inConfirmedDuplicateGroup = dupState.kind === "confirmed";
  // Close-with-reason inline form state — toggled from the Close button.
  const [closeReasonOpen, setCloseReasonOpen] = useState(false);
  const [closeReasonText, setCloseReasonText] = useState("");
  // Inline forms for skip / reject / reopen — same pattern as close
  // reason. Only one is open at a time; opening one closes the others.
  const [skipOpen,   setSkipOpen]   = useState(false);
  const [skipDays,   setSkipDays]   = useState<number | "indefinite" | "custom">(3);
  const [skipCustom, setSkipCustom] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reopenOpen,   setReopenOpen]   = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const apply = (status: SignalStatus, _label: string) => {
    if (inConfirmedDuplicateGroup && dupState.kind === "confirmed") {
      applyStatusToDuplicateGroup(dupState.group.id, status);
    } else {
      updateSignal(signal.id, { status });
    }
  };

  const handleAccept = () => apply("accepted", "Accept");
  const handleReady  = () => apply("ready",    "Mark Ready");
  const handleClose  = () => {
    // Confirmed groups close as one unit via applyStatusToDuplicateGroup
    // (no per-signal reason capture). For independent signals we open the
    // inline reason form so the user can record an optional note.
    if (inConfirmedDuplicateGroup) apply("closed", "Close");
    else { setRejectOpen(false); setSkipOpen(false); setReopenOpen(false); setCloseReasonOpen(true); }
  };
  const handleReject = () => {
    if (inConfirmedDuplicateGroup) apply("rejected", "Reject");
    else { setCloseReasonOpen(false); setSkipOpen(false); setReopenOpen(false); setRejectOpen(true); }
  };
  const handleSkip = () => {
    if (inConfirmedDuplicateGroup) return; // confirmed groups don't skip individually
    setCloseReasonOpen(false); setRejectOpen(false); setReopenOpen(false); setSkipOpen(true);
  };
  const handleReopen = () => {
    if (inConfirmedDuplicateGroup) apply("new", "Reopen");
    else { setCloseReasonOpen(false); setRejectOpen(false); setSkipOpen(false); setReopenOpen(true); }
  };

  const submitCloseWithReason = () => {
    closeSignalWithReason(signal.id, closeReasonText);
    setCloseReasonOpen(false);
    setCloseReasonText("");
  };
  const submitSkip = () => {
    let untilISO: string | null = null;
    if (skipDays === "indefinite") untilISO = null;
    else if (skipDays === "custom") {
      // custom date — interpret as YYYY-MM-DD at end-of-day local.
      if (skipCustom) {
        const d = new Date(skipCustom + "T23:59:59");
        if (!isNaN(d.getTime())) untilISO = d.toISOString();
      }
    } else {
      untilISO = new Date(Date.now() + (skipDays as number) * 24 * 60 * 60 * 1000).toISOString();
    }
    skipSignal(signal.id, untilISO, skipReason);
    setSkipOpen(false); setSkipDays(3); setSkipCustom(""); setSkipReason("");
  };
  const submitReject = () => {
    rejectSignalWithReason(signal.id, rejectReason);
    setRejectOpen(false); setRejectReason("");
  };
  const submitReopen = () => {
    reopenSignalWithReason(signal.id, reopenReason);
    setReopenOpen(false); setReopenReason("");
  };

  const linkedWipType = signal.linkedWip.length > 0
    ? wipItems.find(w => signal.linkedWip.includes(w.id))?.type ?? null
    : null;

  // Cap-aware split button — disabled with helper tooltip when the source
  // already has SPLIT_MAX_PER_SOURCE derived signals.
  const rootId = signal.splitFromId ?? signal.id;
  const splitChildren = splitChildrenCount(signals, rootId);
  const splitReached = splitChildren >= SPLIT_MAX_PER_SOURCE;
  const splitBtn = (
    <button
      onClick={() => { if (!splitReached) onSplit(); }}
      disabled={splitReached}
      style={{
        ...ghostBtn,
        opacity: splitReached ? 0.55 : 1,
        cursor: splitReached ? "not-allowed" : "pointer",
      }}
      title={splitReached
        ? `Split limit reached. You can create up to ${SPLIT_MAX_PER_SOURCE} split signals.`
        : "Duplicate this signal so you can split it into pieces"}
    >
      <Copy size={12} /> Split{splitChildren > 0 ? ` (${splitChildren}/${SPLIT_MAX_PER_SOURCE})` : ""}
    </button>
  );

  // Confirmed-group "acts as one unit" hint — small inline note replacing
  // the old apply-only/apply-to-all prompt. Surfaces whenever the signal
  // is in a confirmed group so the user knows their next action will hit
  // every member.
  const dupPrompt = inConfirmedDuplicateGroup && dupState.kind === "confirmed" ? (
    <div style={{
      marginTop: 8, padding: "6px 10px",
      borderRadius: "var(--radius)",
      background: "rgba(20,184,166,0.06)",
      border: "1px dashed rgba(20,184,166,0.40)",
      fontSize: 11, color: "var(--text-secondary)",
    }}>
      ◆ Group acts as one unit — actions apply to all {dupState.group.signalIds.length} duplicates.
    </div>
  ) : null;

  // Manual "Add duplicate" affordance — only rendered when the signal
  // ISN'T already in a duplicate group. The in-group case already shows
  // an Add duplicate button inside the DuplicateSection header, so we'd
  // be doubling up otherwise.
  const addDupBtn = dupState.kind === "none" ? (
    <AddDuplicateButton signalId={signal.id} />
  ) : null;

  // Inline reason capture for the Close action. Optional — the user can
  // submit blank to close with no note. Mirrors the existing dupPrompt
  // strip so the layout reads consistently across the modal.
  const closeReasonStrip = closeReasonOpen ? (
    <div style={{
      marginTop: 10, padding: "10px 12px",
      borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
        Close this signal — reason (optional)
      </div>
      <input
        autoFocus
        value={closeReasonText}
        onChange={e => setCloseReasonText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submitCloseWithReason();
          else if (e.key === "Escape") { setCloseReasonOpen(false); setCloseReasonText(""); }
        }}
        placeholder="e.g. out of scope, duplicate of another signal, …"
        style={{
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
          padding: "6px 9px", fontSize: "var(--fs-body)",
          background: "var(--bg)", outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={() => { setCloseReasonOpen(false); setCloseReasonText(""); }}
          style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={submitCloseWithReason}
          style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "none", background: "var(--text-secondary)", color: "white", fontSize: "var(--fs-meta)", fontWeight: 500 }}
        >
          Close signal
        </button>
      </div>
    </div>
  ) : null;

  const skipStrip = skipOpen ? (
    <div style={{
      marginTop: 10, padding: "10px 12px",
      borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
        Skip this signal — return it later
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Duration</span>
        <select
          value={typeof skipDays === "number" ? String(skipDays) : skipDays}
          onChange={e => {
            const v = e.target.value;
            if (v === "indefinite") setSkipDays("indefinite");
            else if (v === "custom") setSkipDays("custom");
            else setSkipDays(Number(v));
          }}
          style={{
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
            background: "var(--bg)", color: "var(--text)",
            fontSize: 11, height: 24, padding: "0 6px",
          }}
        >
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">1 week</option>
          <option value="14">2 weeks</option>
          <option value="indefinite">Indefinitely</option>
          <option value="custom">Custom date…</option>
        </select>
        {skipDays === "custom" && (
          <input
            type="date"
            value={skipCustom}
            onChange={e => setSkipCustom(e.target.value)}
            style={{
              border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: 11, height: 24, padding: "0 6px",
            }}
          />
        )}
      </div>
      <input
        value={skipReason}
        onChange={e => setSkipReason(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submitSkip();
          else if (e.key === "Escape") setSkipOpen(false);
        }}
        placeholder="Reason (optional) — e.g. not current priority, waiting on client"
        style={{
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
          padding: "6px 9px", fontSize: "var(--fs-body)",
          background: "var(--bg)", outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={() => setSkipOpen(false)}
          style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={submitSkip}
          disabled={skipDays === "custom" && !skipCustom}
          style={{
            padding: "4px 12px", borderRadius: "var(--radius)", border: "none",
            background: skipDays === "custom" && !skipCustom ? "var(--bg-sunken)" : "#8b5cf6",
            color: skipDays === "custom" && !skipCustom ? "var(--text-disabled)" : "white",
            fontSize: "var(--fs-meta)", fontWeight: 500,
          }}
        >
          Skip
        </button>
      </div>
    </div>
  ) : null;

  const rejectStrip = rejectOpen ? (
    <div style={{
      marginTop: 10, padding: "10px 12px",
      borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
        Reject this signal — reason (optional)
      </div>
      <input
        autoFocus
        value={rejectReason}
        onChange={e => setRejectReason(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submitReject();
          else if (e.key === "Escape") setRejectOpen(false);
        }}
        placeholder="e.g. not relevant, conflicting feedback, …"
        style={{
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
          padding: "6px 9px", fontSize: "var(--fs-body)",
          background: "var(--bg)", outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={() => setRejectOpen(false)}
          style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={submitReject}
          style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "none", background: "var(--status-rejected)", color: "white", fontSize: "var(--fs-meta)", fontWeight: 500 }}
        >
          Reject
        </button>
      </div>
    </div>
  ) : null;

  const reopenStrip = reopenOpen ? (
    <div style={{
      marginTop: 10, padding: "10px 12px",
      borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
        Reopen this signal — reason (optional)
      </div>
      <input
        autoFocus
        value={reopenReason}
        onChange={e => setReopenReason(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submitReopen();
          else if (e.key === "Escape") setReopenOpen(false);
        }}
        placeholder="e.g. new evidence, customer brought it back, …"
        style={{
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
          padding: "6px 9px", fontSize: "var(--fs-body)",
          background: "var(--bg)", outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={() => setReopenOpen(false)}
          style={{ padding: "4px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={submitReopen}
          style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "none", background: "var(--accent)", color: "white", fontSize: "var(--fs-meta)", fontWeight: 500 }}
        >
          Reopen
        </button>
      </div>
    </div>
  ) : null;

  if (signal.status === "closed") {
    return (
      <>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleReopen} style={primaryBtn}>Reopen</button>
          {splitBtn}
          {addDupBtn}
        </div>
        {dupPrompt}
        {closeReasonStrip}
        {skipStrip}
        {rejectStrip}
        {reopenStrip}
      </>
    );
  }

  if (signal.status === "skipped") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => reviveSkip(signal.id)} style={primaryBtn}>Bring back now</button>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {signal.skipUntil
              ? `Skipped until ${absDate(signal.skipUntil)}`
              : "Skipped indefinitely"}
          </span>
          {splitBtn}
          {addDupBtn}
        </div>
        {dupPrompt}
        {closeReasonStrip}
        {skipStrip}
        {rejectStrip}
        {reopenStrip}
      </>
    );
  }

  if (signal.status === "new") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleAccept} style={primaryBtn}>Accept</button>
          <button onClick={handleReady}  style={ghostBtn}>Mark Ready</button>
          <button onClick={handleSkip}   style={ghostBtn}>Skip</button>
          <button onClick={handleReject} style={defaultBtn}>Reject</button>
          <button onClick={handleClose}  style={ghostBtn}>Close</button>
          {splitBtn}
          {addDupBtn}
        </div>
        {dupPrompt}
        {closeReasonStrip}
        {skipStrip}
        {rejectStrip}
        {reopenStrip}
      </>
    );
  }

  if (signal.status === "accepted") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleReady} style={primaryBtn}>Mark Ready</button>
          {/* Create work item is always reachable from accepted. If one is
              already linked we keep it visible but relabel + soften the style
              so users can create an additional task / intent against the
              same signal (a signal can spawn both a task and an intent). */}
          <button
            onClick={onCreateWork}
            style={defaultBtn}
            title={linkedWipType
              ? "This signal already has a linked work item. Create another."
              : "Create a task or intent from this signal"}
          >
            <Task size={12} />
            {linkedWipType ? "Create another work item" : "Create work item"}
          </button>
          <button style={ghostBtn}><Edit size={12} /> Edit</button>
          {splitBtn}
          <button onClick={handleSkip}   style={ghostBtn}>Skip</button>
          <button onClick={handleReject} style={ghostBtn}>Reject</button>
          <button onClick={handleClose}  style={ghostBtn}>Close</button>
        </div>
        {dupPrompt}
        {closeReasonStrip}
        {skipStrip}
        {rejectStrip}
        {reopenStrip}
      </>
    );
  }

  if (signal.status === "ready") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Always reachable from ready. If a wip is already linked we keep
              the button visible (secondary style + relabel) so the user can
              add another work item — creating one previously hid this button
              and left the ready signal with no path back to the action. */}
          <button
            onClick={onCreateWork}
            style={linkedWipType ? defaultBtn : primaryBtn}
            title={linkedWipType
              ? "This signal already has a linked work item. Create another."
              : "Create a task or intent from this signal"}
          >
            <Task size={12} />
            {linkedWipType ? "Create another work item" : "Create work item"}
          </button>
          <button onClick={handleAccept} style={ghostBtn}>Move back to Accepted</button>
          {splitBtn}
          <button onClick={handleSkip}   style={ghostBtn}>Skip</button>
          <button onClick={handleReject} style={ghostBtn}>Reject</button>
          <button onClick={handleClose}  style={ghostBtn}>Close</button>
        </div>
        {dupPrompt}
        {closeReasonStrip}
        {skipStrip}
        {rejectStrip}
        {reopenStrip}
      </>
    );
  }

  // rejected
  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleAccept} style={primaryBtn}>Mark as accepted</button>
        <button onClick={handleReady}  style={ghostBtn}>Mark Ready</button>
        {splitBtn}
        <button onClick={handleClose}  style={ghostBtn}>Close</button>
      </div>
      {dupPrompt}
    </>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "6px 12px", borderRadius: "var(--radius)",
  background: "var(--accent)", color: "white",
  fontSize: "var(--fs-body)", fontWeight: 500, border: "1px solid transparent",
};
const defaultBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "6px 12px", borderRadius: "var(--radius)",
  background: "var(--bg)", color: "var(--text)",
  fontSize: "var(--fs-body)", fontWeight: 400, border: "1px solid var(--border-strong)",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "6px 12px", borderRadius: "var(--radius)",
  background: "transparent", color: "var(--text-secondary)",
  fontSize: "var(--fs-body)", fontWeight: 400, border: "1px solid transparent",
};

// ── AddDuplicateButton ─────────────────────────────────────────────────────
// Manual duplicate-link affordance — every signal can be linked to another
// even when the system didn't suggest it. Opens a small popover with a
// search input; selecting a target routes through `addDuplicateLink`,
// which reuses an existing group when possible or creates a new confirmed
// one. Hidden when the signal is already in a duplicate group (the
// DuplicateSection has its own Add duplicate inside).

function AddDuplicateButton({ signalId }: { signalId: string }) {
  const { signals, duplicateGroups, addDuplicateLink } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Only show signals that are NOT already in a duplicate group, and not
  // the signal we're linking from.
  const eligible = useMemo(() => {
    const inSomeGroup = new Set<string>();
    for (const g of duplicateGroups) for (const id of g.signalIds) inSomeGroup.add(id);
    const lower = q.trim().toLowerCase();
    return signals
      .filter(s => s.id !== signalId && !inSomeGroup.has(s.id))
      .filter(s => !lower || s.title.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower))
      .slice(0, 12);
  }, [signals, duplicateGroups, q, signalId]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={ghostBtn}
        title="Manually link another signal as a duplicate of this one"
      >
        <Plus size={12} /> Add duplicate
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 800,
          width: 320, background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              Link as duplicate of this signal
            </div>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search signals…"
              style={{
                width: "100%", border: "none", outline: "none",
                background: "transparent", fontSize: "var(--fs-meta)", color: "var(--text)",
              }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {eligible.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
                No matching signals available.
              </div>
            ) : eligible.map(s => (
              <button
                key={s.id}
                onClick={() => { addDuplicateLink(signalId, s.id); setOpen(false); setQ(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", textAlign: "left",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: "var(--fs-body)", color: "var(--text)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <StatusDot status={s.status} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{s.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SignalModal() {
  const { openSignalId, openSignal, signals, updateSignal, hideUnderRules, wipItems, transactions, signalComments, addSignalComment, signalAttachments, appMode, openWip, setRoute, cloneSignal, duplicateGroups, markDuplicateGroupSeen } = useStore();
  const readOnly = appMode === "client";
  const [showLabelPicker, setShowLabelPicker]     = useState(false);
  const [showCreateWork, setShowCreateWork]       = useState(false);
  const [splitModalOpen, setSplitModalOpen]       = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "digest" | "comments" | "history">("details");

  const signal = signals.find(s => s.id === openSignalId);
  const filteredIds = signals.map(s => s.id);
  const currentIdx = signal ? filteredIds.indexOf(signal.id) : -1;
  const allLabels = Array.from(new Set(signals.flatMap(s => s.labels)));

  useEffect(() => {
    setActiveTab("details");
    setShowCreateWork(false);
  }, [openSignalId]);

  // Mark a duplicate suggestion as "seen" the moment the user opens any
  // signal that belongs to it. The store-side action is idempotent so re-
  // opening doesn't churn state. Confirmed groups never carry the "new"
  // highlight, so this only matters for unconfirmed suggestions.
  useEffect(() => {
    if (!openSignalId) return;
    const group = duplicateGroups.find(g => g.signalIds.includes(openSignalId));
    if (!group || group.confirmed) return;
    if (!isDuplicateGroupNewOrChanged(group)) return;
    markDuplicateGroupSeen(group.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignalId, duplicateGroups]);

  useEffect(() => {
    if (!openSignalId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showLabelPicker) { setShowLabelPicker(false); return; }
        openSignal(null);
      }
      if (e.key === "ArrowLeft"  && currentIdx > 0)                      openSignal(filteredIds[currentIdx - 1]);
      if (e.key === "ArrowRight" && currentIdx < filteredIds.length - 1)  openSignal(filteredIds[currentIdx + 1]);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openSignalId, currentIdx, filteredIds, openSignal, showLabelPicker]);

  if (!openSignalId || !signal) return null;

  // Collect every hide-under rule where this signal is the main; aggregate its
  // hidden children across all filter scopes for display.
  const ownedRules = hideUnderRules.filter(r => r.mainSignalId === signal.id);
  const hiddenCountTotal = Array.from(
    new Set(ownedRules.flatMap(r => r.hiddenSignalIds))
  ).length;

  const linkedWips = wipItems.filter(w => signal.linkedWip.includes(w.id));
  const linkedWipType = linkedWips[0]?.type ?? null;

  const author = userById(signal.author);

  const toggleLabel = (label: string) => {
    const kebab = label.toLowerCase().replace(/\s+/g, "-");
    const has = signal.labels.includes(kebab);
    updateSignal(signal.id, { labels: has ? signal.labels.filter(l => l !== kebab) : [...signal.labels, kebab] });
  };

  const statusLabel = signal.status === "new" ? "New" : signal.status === "accepted" ? "Accepted" : signal.status === "ready" ? "Ready" : signal.status === "closed" ? "Closed" : "Rejected";
  const statusColor = signal.status === "new" ? "var(--status-new)" : signal.status === "accepted" ? "var(--status-accepted)" : signal.status === "ready" ? "var(--status-ready)" : signal.status === "closed" ? "var(--text-disabled)" : "var(--status-rejected)";

  return (
    <div
      onClick={() => openSignal(null)}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "var(--bg-overlay)", animation: "fadeIn 0.15s ease" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "min(780px, 96vw)", maxHeight: "90vh",
          background: "var(--bg)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column",
          animation: "modalIn 0.18s ease", overflow: "hidden",
        }}
      >
        {/* Top strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          borderBottom: "none",
          flexShrink: 0,
        }}>
          <StatusDot status={signal.status} />
          <span style={{ fontSize: "var(--fs-meta)", fontWeight: 500, color: statusColor }}>{statusLabel}</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)", textTransform: "capitalize" }}>{signal.source}</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{signal.id}</span>
          {/* "Split from" hint — when this signal was derived via Split,
              link back to the root so the user can compare or jump.
              Shows the source title (truncated) so the reader doesn't
              have to memorise ids. */}
          {signal.splitFromId && (() => {
            const root = signals.find(s => s.id === signal.splitFromId);
            if (!root) return null;
            return (
              <button
                onClick={() => openSignal(root.id)}
                title={`Open the original: ${root.title}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
                  background: "var(--bg-sunken)", color: "var(--text-secondary)",
                  border: "1px solid var(--border)", cursor: "pointer",
                  maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-sunken)")}
              >
                ◇ Split from “{root.title}”
              </button>
            );
          })()}
          {hiddenCountTotal > 0 && <HiddenCountBadge count={hiddenCountTotal} />}
          {signal.status === "closed" && <ClosedBadge />}
          {linkedWipType === "task"   && <TaskCreatedBadge />}
          {linkedWipType === "intent" && <IntentCreatedBadge />}
          <div style={{ flex: 1 }} />
          <button onClick={() => currentIdx > 0 && openSignal(filteredIds[currentIdx - 1])} disabled={currentIdx === 0} style={{ ...ghostBtn, padding: "4px 6px", opacity: currentIdx === 0 ? 0.4 : 1 }} title="Previous"><ChevronLeft size={14} /></button>
          <button onClick={() => currentIdx < filteredIds.length - 1 && openSignal(filteredIds[currentIdx + 1])} disabled={currentIdx === filteredIds.length - 1} style={{ ...ghostBtn, padding: "4px 6px", opacity: currentIdx === filteredIds.length - 1 ? 0.4 : 1 }} title="Next"><ChevronRight size={14} /></button>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", minWidth: 40, textAlign: "center" }}>{currentIdx + 1} / {filteredIds.length}</span>
          <button onClick={() => openSignal(null)} style={{ ...ghostBtn, padding: "4px 6px" }} title="Close (Esc)"><X size={14} /></button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg)" }}>
          {(readOnly
            // Clients only see Details + Digest + Comments. History is internal.
            ? (["details", "digest", "comments"] as const)
            : (["details", "digest", "comments", "history"] as const)
          ).map(tab => {
            const isActive = activeTab === tab;
            const tabLabel = tab === "details" ? "Details"
              : tab === "digest"   ? "Digest"
              : tab === "comments" ? "Comments"
              : "History";
            const txCount = tab === "history"
              ? transactions.filter(t => t.affectedSignalIds.includes(signal.id)).length
              : 0;
            const visibleSignalComments = signalComments.filter(c =>
              c.signalId === signal.id && (!readOnly || c.visibility === "client")
            );
            const commentCount = tab === "comments" ? visibleSignalComments.length : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "8px 10px", fontSize: "var(--fs-body)",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#0f766e" : "var(--text-secondary)",
                  background: "transparent", border: "none",
                  borderBottom: isActive ? "2px solid #0f766e" : "2px solid transparent",
                  marginBottom: -1, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                {tabLabel}
                {tab === "digest" && (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 5px", borderRadius: 100, fontSize: 9, fontWeight: 700, background: isActive ? "#0f766e" : "var(--accent-soft)", color: isActive ? "white" : "var(--accent)", letterSpacing: 0.3 }}>
                    AI
                  </span>
                )}
                {tab === "comments" && commentCount > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 5px", borderRadius: 100, fontSize: 10, fontWeight: 600, background: isActive ? "#0f766e" : "var(--bg-sunken)", color: isActive ? "white" : "var(--text-tertiary)", border: isActive ? "none" : "1px solid var(--border)" }}>
                    {commentCount}
                  </span>
                )}
                {tab === "history" && txCount > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 5px", borderRadius: 100, fontSize: 10, fontWeight: 600, background: isActive ? "#0f766e" : "var(--bg-sunken)", color: isActive ? "white" : "var(--text-tertiary)", border: isActive ? "none" : "1px solid var(--border)" }}>
                    {txCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* Digest tab */}
          {activeTab === "digest" && (
            <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
              <DigestPanel signal={signal} allSignals={signals} />
            </div>
          )}

          {/* Comments tab */}
          {activeTab === "comments" && (
            <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
              <SignalCommentsPanel
                signalId={signal.id}
                comments={signalComments.filter(c => c.signalId === signal.id && (!readOnly || c.visibility === "client"))}
                onPost={(body, vis) => addSignalComment(signal.id, body, vis)}
                readOnly={readOnly}
              />
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
              <HistoryPanel signalId={signal.id} />
            </div>
          )}

          {/* Details tab */}
          {activeTab === "details" && (
            <>
              <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
                <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: signal.status === "closed" ? "var(--text-secondary)" : "var(--text)", textDecoration: signal.status === "closed" ? "line-through" : "none", opacity: signal.status === "closed" ? 0.7 : 1 }}>
                  {signal.title}
                </h2>
                <p style={{ margin: "0 0 16px", fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {signal.description}
                </p>

                {/* TPA annotation — internal-only clarification surface,
                    sits right under the original description. Hidden in
                    client mode entirely. */}
                {!readOnly && (
                  <TpaNoteToggle signal={signal} />
                )}

                {signal.status === "accepted" && !linkedWips.length && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 14, fontSize: "var(--fs-body)", color: "#15803d" }}>
                    Signal accepted — create a task or draft an intent to turn it into work.
                  </div>
                )}
                {signal.status === "rejected" && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "#f9fafb", border: "1px solid var(--border)", marginBottom: 14, fontSize: "var(--fs-body)", color: "var(--text-secondary)" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
                      Rejected
                    </div>
                    Signal rejected. Mark as accepted if you change your mind.
                    {signal.rejectionReason && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)", fontStyle: "italic" }}>
                        “{signal.rejectionReason}”
                      </div>
                    )}
                  </div>
                )}
                {signal.status === "skipped" && (
                  <div style={{
                    padding: "10px 12px", borderRadius: "var(--radius)",
                    background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.30)",
                    marginBottom: 14, fontSize: "var(--fs-body)", color: "var(--text)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--status-skipped)", marginBottom: 4 }}>
                      Skipped
                    </div>
                    {signal.skipUntil
                      ? <>Hidden from active queues until <strong style={{ fontWeight: 500 }}>{absDate(signal.skipUntil)}</strong>. The signal will return automatically when the skip ends.</>
                      : <>Hidden from active queues indefinitely. Bring it back manually when ready.</>
                    }
                    {signal.skipReason && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)", fontStyle: "italic" }}>
                        “{signal.skipReason}”
                      </div>
                    )}
                  </div>
                )}
                {signal.reopenReason && signal.status !== "closed" && signal.status !== "skipped" && signal.status !== "rejected" && (
                  <div style={{
                    padding: "8px 12px", borderRadius: "var(--radius)",
                    background: "var(--bg-sunken)", border: "1px solid var(--border)",
                    marginBottom: 14, fontSize: "var(--fs-meta)", color: "var(--text-secondary)",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginRight: 6 }}>
                      Reopened
                    </span>
                    “{signal.reopenReason}”
                  </div>
                )}
                {signal.status === "closed" && (
                  <ClosureBanner
                    signal={signal}
                    wipItems={wipItems}
                    onOpenWip={(wipId) => { openSignal(null); setRoute("wip"); openWip(wipId); }}
                  />
                )}

                {/* Follow-up backref — shown when this signal was spawned
                    from a Done wip's review step. Helps preserve the lineage:
                    "this signal exists because intent X needed follow-up". */}
                {signal.followUpOfWipId && (() => {
                  const origin = wipItems.find(w => w.id === signal.followUpOfWipId);
                  if (!origin) return null;
                  return (
                    <div style={{
                      marginBottom: 14, padding: "10px 12px",
                      borderRadius: "var(--radius)",
                      background: "rgba(14,165,233,0.05)",
                      border: "1px solid rgba(14,165,233,0.25)",
                      fontSize: "var(--fs-body)", color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
                        Follow-up of
                      </div>
                      <button
                        onClick={() => { openSignal(null); setRoute("wip"); openWip(origin.id); }}
                        style={{
                          background: "transparent", border: "none", padding: 0,
                          color: "var(--accent)", cursor: "pointer", fontWeight: 500,
                          textDecoration: "underline", textUnderlineOffset: 2,
                          textAlign: "left",
                        }}
                      >
                        {origin.type === "task" ? "Task" : "Intent"} “{origin.title}”
                      </button>
                    </div>
                  );
                })()}

                {/* Linked work items — shown prominently. Always rendered
                    in team mode (even when empty) so the Link-existing-work
                    affordance is reachable on every signal. */}
                {(linkedWips.length > 0 || !readOnly) && (
                  <LinkedWorkSection signal={signal} wips={linkedWips} />
                )}

                {/* Hidden under this signal */}
                {ownedRules.length > 0 && (
                  <HiddenUnderSection rules={ownedRules} />
                )}

                {/* Duplicate group / suggestion section */}
                <DuplicateSection signal={signal} />

                {/* "Split into" — when other signals were split FROM this
                    one, list them so the TPA sees the lineage in one
                    place. Hidden when there are no derivatives. */}
                <SplitIntoSection signal={signal} />

                {/* "Split from" — mirror of "Split into" on the child
                    side. Shows the parent as a clickable lineage row so
                    the user can jump back without hunting for the small
                    header chip. */}
                <SplitFromSection signal={signal} />

                {/* AI suggestions stub — choice-based, never auto-applies.
                    Sourced from the existing digest derivation so we
                    don't fake "real AI". Hidden in client mode. */}
                {!readOnly && (
                  <AISuggestionsSection signal={signal} />
                )}

                {signal.screenshots > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <Image size={12} /> {signal.screenshots} screenshot{signal.screenshots > 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Array.from({ length: signal.screenshots }).map((_, i) => (
                        <div key={i} style={{ width: 80, height: 54, borderRadius: "var(--radius)", background: "var(--bg-sunken)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-disabled)" }}>
                          <Image size={20} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments — proper per-file list, separate from the
                    placeholder screenshots tile grid above. Upload is team-
                    only; clients see the list but no upload affordance. */}
                <SignalAttachmentsSection
                  signalId={signal.id}
                  attachments={signalAttachments.filter(a => a.signalId === signal.id)}
                  canUpload={!readOnly}
                />

                {/* Labels */}
                <SignalLabelsSection
                  signal={signal}
                  allLabels={allLabels}
                  allSignals={signals}
                  onToggle={toggleLabel}
                  showPicker={showLabelPicker}
                  setShowPicker={setShowLabelPicker}
                  readOnly={readOnly}
                />

                {/* Footer actions — team only. Clients have nothing to do here. */}
                {!readOnly && (
                  <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <SignalActions
                      signal={signal}
                      onCreateWork={() => setShowCreateWork(o => !o)}
                      onSplit={() => {
                        // Open the N-way Split modal. Nothing is created
                        // until the user confirms inside the modal — so
                        // the source signal stays untouched if they cancel.
                        setSplitModalOpen(true);
                      }}
                    />

                    {/* Create work item form */}
                    {showCreateWork && (
                      <CreateWorkItemForm signal={signal} onClose={() => setShowCreateWork(false)} />
                    )}

                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div style={{ width: 200, flexShrink: 0, padding: "20px 16px", borderLeft: "1px solid var(--border)", overflowY: "auto", background: "var(--bg-sunken)" }}>
                <MetaRow label="Status">
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <StatusDot status={signal.status} />
                    <span style={{ textTransform: "capitalize" }}>{signal.status}</span>
                  </span>
                </MetaRow>
                <PrioritySelector signal={signal} />
                <MetaRow label="Author">
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Avatar userId={signal.author} size="sm" />
                    {author.name}
                  </span>
                </MetaRow>
                <MetaRow label="Source"><span style={{ textTransform: "capitalize" }}>{signal.source}</span></MetaRow>
                <MetaRow label="Created">{absDate(signal.createdAt)}</MetaRow>
                {signal.statusUpdatedAt && signal.status !== "new" && (
                  <MetaRow label={signal.status === "accepted" ? "Accepted" : signal.status === "ready" ? "Ready" : signal.status === "closed" ? "Closed" : "Rejected"}>
                    <span style={{ color: signal.status === "accepted" ? "var(--status-accepted)" : signal.status === "ready" ? "var(--status-ready)" : signal.status === "closed" ? "var(--text-tertiary)" : "var(--status-rejected)" }}>
                      {absDate(signal.statusUpdatedAt)}
                    </span>
                  </MetaRow>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {/* N-way Split modal — only rendered when the user clicked Split.
          Sits above the signal modal so cancelling returns the user to
          the same signal detail with nothing changed. */}
      {splitModalOpen && (
        <SplitSignalModal
          signalId={signal.id}
          onClose={() => setSplitModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Hidden under section ────────────────────────────────────────────────
// Lists every signal currently hidden under the open signal, grouped by
// filter scope (since each rule corresponds to a distinct filter context).

// ── SplitIntoSection ──────────────────────────────────────────────────────
// Surfaces the children of a "split" lineage on the source signal so the
// TPA can see every derived piece without searching by id. Mirrors the
// "Split from" header chip but in the body, with full titles + click-to-
// open.
//
// `splitFromId` always points at the ROOT (the original), so listing
// children of `signal.id` (or, if this signal itself is a derivative,
// children of its root) gives the full sibling set.

// ── TpaNoteToggle ─────────────────────────────────────────────────────────
// Always-present switch under the description that toggles the TPA's
// internal annotation surface. No section heading — the switch labels
// itself. Default-on rule:
//   • empty note  → toggle starts OFF (surface hidden; switch visible)
//   • has content → toggle starts ON  (surface visible)
//
// Editing saves on blur via setTpaNote, which records one activity
// event per actual content change (no-op saves are silent).

function TpaNoteToggle({ signal }: { signal: Signal }) {
  const { setTpaNote } = useStore();
  const persisted = signal.tpaNote ?? "";
  // Toggle state is purely local — derive from content on open per the
  // design rule. Re-derive when the underlying signal id changes so the
  // toggle re-evaluates when navigating between signals.
  const [on, setOn] = useState(persisted.length > 0);
  const [draft, setDraft] = useState(persisted);
  // Re-sync when switching signals.
  useEffect(() => {
    setOn(persisted.length > 0);
    setDraft(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.id]);

  const accent = "#7c3aed"; // purple — distinct from feedback/note source colours
  const handleBlur = () => {
    if (draft !== persisted) setTpaNote(signal.id, draft);
  };
  const handleToggle = () => {
    const next = !on;
    setOn(next);
    if (!next && draft.trim().length === 0 && persisted.length > 0) {
      // Edge case: user emptied the text while the toggle was on, then
      // flipped it off. Persist the empty state so the data matches UI.
      setTpaNote(signal.id, "");
    }
  };

  const hasContent = persisted.length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Single compact switch row. When the annotation is collapsed
          but text exists, a small purple dot + "Annotation added" hint
          confirms the content is still there — so the user doesn't
          think it disappeared.
          The "internal only" qualifier lives in the tooltip rather
          than as a separate footnote so the surface stays minimal. */}
      <label
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          cursor: "pointer", userSelect: "none",
        }}
        title="TPA annotation — internal only, not shared in client reports."
      >
        <span
          role="switch"
          aria-checked={on}
          onClick={handleToggle}
          style={{
            display: "inline-flex", alignItems: "center",
            width: 28, height: 16, padding: 2, borderRadius: 100,
            background: on ? accent : "var(--border-strong)",
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          <span style={{
            display: "inline-block",
            width: 12, height: 12, borderRadius: "50%",
            background: "white",
            transform: on ? "translateX(12px)" : "translateX(0)",
            transition: "transform 0.15s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.20)",
          }} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: on ? "var(--text)" : "var(--text-secondary)" }}>
          TPA annotation
        </span>
        {!on && hasContent && (
          <span
            title="Annotation is collapsed — click the switch to view it"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, color: "var(--text-tertiary)",
            }}
          >
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: accent,
            }} />
            Annotation added
          </span>
        )}
      </label>

      {/* Surface — only when toggled on. Left-edge accent keeps the
          annotation visually distinct from the original signal text
          without needing a duplicate "TPA annotation" heading. */}
      {on && (
        <div style={{
          marginTop: 6,
          paddingLeft: 10,
          borderLeft: `2px solid ${accent}`,
        }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={handleBlur}
            placeholder="Add TPA context or clarification…"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg)",
              fontSize: "var(--fs-body)",
              fontStyle: "italic",
              color: "var(--text)",
              lineHeight: 1.5,
              resize: "vertical",
              outline: "none",
            }}
            onFocus={e => (e.target.style.borderColor = accent)}
            onBlurCapture={e => (e.target.style.borderColor = "var(--border)")}
          />
          {/* Last-edited stamp only — the "internal only" message is in
              the switch tooltip. */}
          {signal.tpaNoteAt && signal.tpaNoteBy && (
            <div
              style={{ marginTop: 3, fontSize: 10.5, color: "var(--text-tertiary)" }}
              title={absDate(signal.tpaNoteAt)}
            >
              Edited by {userById(signal.tpaNoteBy).name} {relTime(signal.tpaNoteAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SplitIntoSection({ signal }: { signal: Signal }) {
  const { signals, openSignal } = useStore();
  // Hide entirely on a leaf — only show when this signal IS the root and
  // has at least one derivative. Children render the mirror-image
  // "Split from" section below instead.
  if (signal.splitFromId) return null;
  const children = signals.filter(s => s.splitFromId === signal.id);
  if (children.length === 0) return null;

  return (
    <div style={{
      marginBottom: 16, padding: "12px 14px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)", background: "var(--bg-sunken)",
    }}>
      <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
        <Copy size={12} /> Split into · {children.length} signal{children.length === 1 ? "" : "s"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children.map(child => (
          <SplitLineageRow
            key={child.id}
            signal={child}
            onOpen={() => openSignal(child.id)}
            kind="child"
          />
        ))}
      </div>
    </div>
  );
}

// ── SplitFromSection ──────────────────────────────────────────────────────
// Mirror of SplitIntoSection — shown on each CHILD signal so the user sees
// the parent as a clickable list row in the body (not just a small chip in
// the header). Same row layout as SplitIntoSection so the two directions
// read as one consistent surface.

function SplitFromSection({ signal }: { signal: Signal }) {
  const { signals, openSignal } = useStore();
  // Only meaningful on a derivative.
  if (!signal.splitFromId) return null;
  const parent = signals.find(s => s.id === signal.splitFromId);
  if (!parent) return null;

  return (
    <div style={{
      marginBottom: 16, padding: "12px 14px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)", background: "var(--bg-sunken)",
    }}>
      <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
        <Copy size={12} /> Split from · original signal
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SplitLineageRow
          signal={parent}
          onOpen={() => openSignal(parent.id)}
          kind="parent"
        />
      </div>
    </div>
  );
}

// Shared row used by both directions — single source of truth for the
// "click-to-open lineage" card so the two sections read identically.
function SplitLineageRow({
  signal, onOpen, kind,
}: {
  signal: Signal;
  onOpen: () => void;
  kind: "parent" | "child";
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: "var(--radius)",
        border: "1px solid var(--border)", background: "var(--bg)",
        textAlign: "left", cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
      title={kind === "parent" ? "Open the original signal" : "Open this split signal"}
    >
      <StatusDot status={signal.status} />
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize", minWidth: 60 }}>
        {signal.source}
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: "var(--fs-body)", fontWeight: 500,
        color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {signal.title}
      </span>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{signal.id}</span>
    </button>
  );
}

function HiddenUnderSection({ rules }: { rules: HideUnderRule[] }) {
  const { signals, setFilters, setRoute, openSignal, removeFromHideUnder, appMode } = useStore();
  const readOnly = appMode === "client";

  const showInGrid = (rule: HideUnderRule) => {
    setRoute("signals");
    setFilters({ labels: rule.filterLabels });
    openSignal(null);
  };

  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-sunken)" }}>
      <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 10 }}>
        Hidden under this signal
      </div>
      {rules.map(rule => {
        const hidden = rule.hiddenSignalIds
          .map(id => signals.find(s => s.id === id))
          .filter((s): s is Signal => !!s);
        if (hidden.length === 0) return null;
        return (
          <div key={rule.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
              <span>Scope:</span>
              {rule.filterLabels.map(l => (
                <span key={l} style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "1px 6px", borderRadius: 100, fontSize: 10.5,
                  background: "var(--bg)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}>#{l}</span>
              ))}
              <button
                onClick={() => showInGrid(rule)}
                style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                Show in grid
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {hidden.map(h => (
                <HiddenSignalRow
                  key={h.id}
                  signal={h}
                  onOpen={() => openSignal(h.id)}
                  onRestore={() => removeFromHideUnder(rule.id, h.id)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Hidden signal row with hover preview ───────────────────────────────────
// The row stays compact; on hover, a popover anchored just below shows the
// full description, all labels, and metadata. The popover sits at top:100%
// with internal padding so there's no dead-zone gap — the user can move the
// mouse from the row into the popover to select / copy text without dismiss.

function HiddenSignalRow({ signal, onOpen, onRestore, readOnly }: {
  signal: Signal;
  onOpen: () => void;
  onRestore: () => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const author = userById(signal.author);

  const handleEnter = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setHovered(true);
  };
  const handleLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setHovered(false), 120);
  };

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  const priorityColor: Record<SignalPriority, string> = {
    urgent: "#dc2626",
    high:   "#ea580c",
    medium: "#ca8a04",
    low:    "var(--text-tertiary)",
  };

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ position: "relative" }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "7px 10px", borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: hovered ? "var(--bg-hover)" : "var(--bg)",
          transition: "background 0.1s, border-color 0.1s",
          borderColor: hovered ? "var(--border-strong)" : "var(--border)",
          cursor: "default",
        }}
      >
        <StatusDot status={signal.status} />
        <span
          style={{
            fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.3,
            color: priorityColor[signal.priority], flexShrink: 0,
            minWidth: 44,
          }}
        >
          {signal.priority}
        </span>
        <span
          style={{
            flex: 1, fontSize: "var(--fs-body)", color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {signal.title}
        </span>
        {signal.labels.length > 0 && (
          <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {signal.labels.slice(0, 2).map(l => (
              <span key={l} style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 100,
                background: "var(--bg-sunken)", color: "var(--text-tertiary)",
                border: "1px solid var(--border)",
              }}>#{l}</span>
            ))}
            {signal.labels.length > 2 && (
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                +{signal.labels.length - 2}
              </span>
            )}
          </span>
        )}
        <Avatar userId={signal.author} size="sm" />
        <span style={{
          display: "flex", gap: 4, flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.1s",
          pointerEvents: hovered ? "auto" : "none",
        }}>
          <button
            onClick={onOpen}
            style={{
              fontSize: 11, color: "var(--accent)", background: "transparent",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              cursor: "pointer", padding: "2px 8px",
            }}
          >
            Open
          </button>
          {!readOnly && (
            <button
              onClick={onRestore}
              title="Restore from hidden"
              style={{
                fontSize: 11, color: "var(--text-secondary)", background: "transparent",
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                cursor: "pointer", padding: "2px 8px",
              }}
            >
              Restore
            </button>
          )}
        </span>
      </div>

      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "100%", left: 0, right: 0,
            zIndex: 20,
            paddingTop: 6,                 // visual gap, but still inside hover container
          }}
        >
          <div style={{
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: 12,
            fontSize: "var(--fs-body)",
            color: "var(--text)",
            userSelect: "text",
            cursor: "text",
          }}>
            {/* Title (full, selectable) */}
            <div style={{
              fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)",
              marginBottom: 6, lineHeight: 1.4,
            }}>
              {signal.title}
            </div>

            {/* Meta row */}
            <div style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
              fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <StatusDot status={signal.status} />
                <span style={{ textTransform: "capitalize" }}>{signal.status}</span>
              </span>
              <span style={{ color: priorityColor[signal.priority], fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {signal.priority}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Avatar userId={signal.author} size="sm" />
                <span>{author.name}</span>
              </span>
              <span style={{ textTransform: "capitalize" }}>{signal.source}</span>
              <span title={absDate(signal.createdAt)}>{relTime(signal.createdAt)}</span>
              {signal.screenshots > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Image size={11} /> {signal.screenshots}
                </span>
              )}
            </div>

            {/* Description (selectable) */}
            <div style={{
              fontSize: "var(--fs-body)", color: "var(--text-secondary)",
              lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              marginBottom: signal.labels.length > 0 ? 8 : 0,
            }}>
              {signal.description}
            </div>

            {/* All labels */}
            {signal.labels.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {signal.labels.map(l => (
                  <span key={l} style={{
                    fontSize: 10.5, padding: "2px 8px", borderRadius: 100,
                    background: "var(--bg-sunken)", color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}>#{l}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Linked work section ────────────────────────────────────────────────────

function LinkedWorkSection({ signal, wips }: { signal: Signal; wips: import("@/lib/data").Wip[] }) {
  const { openWip, setRoute, openSignal, signalWipLinks, setLinkRelationship, unlinkSignalFromWip, appMode } = useStore();
  const readOnly = appMode === "client";
  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-sunken)" }}>
      <div style={{
        fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
        fontWeight: 500, marginBottom: 10, display: "flex",
        alignItems: "center", gap: 8,
      }}>
        <Link size={12} /> Linked work · {wips.length}
        <span style={{ flex: 1 }} />
        {!readOnly && <LinkExistingWorkButton signal={signal} />}
      </div>
      {wips.length === 0 && (
        <div style={{
          padding: "10px 12px", textAlign: "center", fontSize: "var(--fs-meta)",
          color: "var(--text-tertiary)", border: "1px dashed var(--border)",
          borderRadius: "var(--radius)", background: "var(--bg)",
        }}>
          No linked work yet. Use “Link existing work” above to attach an intent or task.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {wips.map((wip) => {
          const link = signalWipLinks.find(l => l.signalId === signal.id && l.wipId === wip.id);
          const reviewLabel =
            wip.column === "done" && wip.reviewState === "needs_review" ? "Needs review" :
            wip.column === "done" && wip.reviewState === "looks_good"   ? "Reviewed" :
            wip.column === "done" && wip.reviewState === "follow_up"    ? "Follow-up" :
            null;
          const reviewColor =
            reviewLabel === "Needs review" ? { fg: "#b45309", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.35)" } :
            reviewLabel === "Reviewed"     ? { fg: "#15803d", bg: "#f0fdf4", bd: "#bbf7d0" } :
            reviewLabel === "Follow-up"    ? { fg: "#b91c1c", bg: "rgba(239,68,68,0.06)", bd: "rgba(239,68,68,0.25)" } :
            null;
          return (
            <div
              key={wip.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "8px 10px", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", background: "var(--bg)",
              }}
            >
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 6px", borderRadius: 100, fontSize: 10, fontWeight: 600,
                background: wip.type === "task" ? "rgba(124,58,237,0.08)" : "rgba(14,165,233,0.08)",
                color: wip.type === "task" ? "var(--task)" : "var(--intent)",
                border: wip.type === "task" ? "1px solid rgba(124,58,237,0.2)" : "1px solid rgba(14,165,233,0.2)",
                textTransform: "capitalize", flexShrink: 0, marginTop: 2,
              }}>
                {wip.type === "task" ? <Task size={9} /> : <Intent size={9} />} {wip.type}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  onClick={() => { openSignal(null); setRoute("wip"); openWip(wip.id); }}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                    cursor: "pointer", textAlign: "left", width: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title="Open work item"
                >
                  {wip.title}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{wip.id}</span>
                  <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
                  <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textTransform: "capitalize" }}>
                    {wip.column.replace("_", " ")}
                  </span>
                  {reviewLabel && reviewColor && (
                    <>
                      <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "0 6px", borderRadius: 100,
                        fontSize: 10, fontWeight: 600,
                        background: reviewColor.bg, color: reviewColor.fg,
                        border: `1px solid ${reviewColor.bd}`,
                      }}>
                        {reviewLabel}
                      </span>
                    </>
                  )}
                  <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
                  }}>
                    {wip.assignee ? (
                      <>
                        <Avatar userId={wip.assignee} size="sm" />
                        {userById(wip.assignee).name}
                      </>
                    ) : "Unassigned"}
                  </span>
                </div>
              </div>
              {/* Relationship selector. Determines whether finishing the
                  linked work resolves the signal. Read-only in client mode. */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {readOnly ? (
                  <span style={{
                    fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: 0.3, color: "var(--text-tertiary)",
                    padding: "1px 6px", borderRadius: 100,
                    border: "1px solid var(--border)", background: "var(--bg-sunken)",
                  }}>
                    {link ? link.relationship.replace(/_/g, " ") : "related"}
                  </span>
                ) : (
                  <select
                    value={link?.relationship ?? "related_to"}
                    onChange={e => setLinkRelationship(signal.id, wip.id, e.target.value as import("@/lib/data").SignalWipRelationship)}
                    title="Relationship type"
                    style={{
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      background: "var(--bg)", color: "var(--text)",
                      fontSize: 10, height: 22, padding: "0 4px",
                    }}
                  >
                    <option value="resolves">Resolves</option>
                    <option value="partially_addresses">Contributes to (source signal)</option>
                    <option value="investigates">Investigates</option>
                    <option value="researches">Researches</option>
                    <option value="clarifies">Clarifies</option>
                    <option value="informs">Informs</option>
                    <option value="related_to">Related to</option>
                  </select>
                )}
                {!readOnly && (
                  <button
                    onClick={() => unlinkSignalFromWip(signal.id, wip.id)}
                    title="Remove this link"
                    aria-label="Unlink work"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AISuggestionsSection ──────────────────────────────────────────────────
// Placeholder UI for AI-assisted clarification. The TPA chooses — the AI
// only suggests. No suggestion auto-applies; every accept goes through an
// explicit user click.
//
// To avoid "fake AI", the suggestions are sourced from the existing
// deterministic digest derivation. The UI is structured so swapping in a
// real model later is a drop-in.

function AISuggestionsSection({ signal }: { signal: Signal }) {
  const { signals, updateSignal } = useStore();
  const [collapsed, setCollapsed] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const digest = signal.digest ?? deriveDigest(signal, signals);
  // Build choice rows from the digest content. Each row has a key the
  // user can dismiss locally so accepted/rejected items disappear from
  // the panel without mutating server data.
  const suggestions: { key: string; kind: "meaning" | "label" | "intent_title"; label: string; onAccept?: () => void }[] = [];

  // Possible meaning — split summary by clauses; show up to 3 sentences.
  const sentences = digest.summary.split(/(?<=[.?!])\s+/).filter(Boolean).slice(0, 3);
  for (let i = 0; i < sentences.length; i++) {
    suggestions.push({ key: `meaning-${i}`, kind: "meaning", label: sentences[i] });
  }
  // Suggested labels — accept = add to signal.labels.
  for (const lbl of digest.suggestedLabels) {
    suggestions.push({
      key: `label-${lbl}`,
      kind: "label",
      label: `Add label #${lbl}`,
      onAccept: () => {
        if (!signal.labels.includes(lbl)) {
          updateSignal(signal.id, { labels: [...signal.labels, lbl] });
        }
      },
    });
  }
  // Possible intent title — a cleaned title fragment as a starter prompt.
  if (signal.title) {
    const intentTitle = signal.title.replace(/[.!?]+$/, "");
    suggestions.push({
      key: "intent-title",
      kind: "intent_title",
      label: `Use as intent title: "${intentTitle}"`,
    });
  }

  const visible = suggestions.filter(s => !dismissed.has(s.key));
  if (visible.length === 0) return null;

  return (
    <div style={{
      marginBottom: 16, padding: "10px 12px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)", background: "var(--bg-sunken)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
          padding: "1px 6px", borderRadius: 100,
          background: "var(--accent-soft)", color: "var(--accent)",
        }}>
          AI
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Clarify with AI
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          · {visible.length} suggestion{visible.length === 1 ? "" : "s"} (you choose — nothing auto-applies)
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            padding: "3px 8px", fontSize: 10.5, color: "var(--text-secondary)",
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", cursor: "pointer",
          }}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map(sug => (
            <div key={sug.key} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--bg)",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                textTransform: "uppercase", color: "var(--text-tertiary)",
                minWidth: 64,
              }}>
                {sug.kind === "meaning" ? "Meaning" : sug.kind === "label" ? "Label" : "Intent"}
              </span>
              <span style={{ flex: 1, fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.4 }}>
                {sug.label}
              </span>
              {sug.onAccept && (
                <button
                  onClick={() => { sug.onAccept!(); setDismissed(d => { const n = new Set(d); n.add(sug.key); return n; }); }}
                  style={{
                    padding: "3px 8px", borderRadius: "var(--radius)", border: "1px solid var(--accent)",
                    background: "var(--accent)", color: "white",
                    fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Accept
                </button>
              )}
              <button
                onClick={() => setDismissed(d => { const n = new Set(d); n.add(sug.key); return n; })}
                title="Dismiss this suggestion"
                style={{
                  padding: "3px 8px", borderRadius: "var(--radius)",
                  border: "1px solid var(--border)", background: "var(--bg)",
                  fontSize: 10.5, color: "var(--text-secondary)", cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          ))}
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontStyle: "italic", marginTop: 2 }}>
            Placeholder UI — suggestions are sourced from a local heuristic. Hook up real AI later.
          </div>
        </div>
      )}
    </div>
  );
}

// ── LinkExistingWorkButton ────────────────────────────────────────────────
// Small Plus-button that opens a search popover. Picks an existing wip and
// links it to the current signal via the rich link table. Filters out wips
// that are already linked so we don't duplicate. The user picks a
// relationship before confirming.

function LinkExistingWorkButton({ signal }: { signal: Signal }) {
  const { wipItems, signalWipLinks, linkSignalToWip } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rel, setRel] = useState<import("@/lib/data").SignalWipRelationship>("partially_addresses");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Eligible: wips not already linked to THIS signal. We allow linking
  // wips that are linked to OTHER signals — multi-signal links are valid.
  const eligible = useMemo(() => {
    const alreadyLinked = new Set(signalWipLinks.filter(l => l.signalId === signal.id).map(l => l.wipId));
    const lower = q.trim().toLowerCase();
    return wipItems
      .filter(w => !alreadyLinked.has(w.id))
      .filter(w => !lower || w.title.toLowerCase().includes(lower) || w.id.toLowerCase().includes(lower))
      .slice(0, 14);
  }, [wipItems, signalWipLinks, signal.id, q]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Link this signal to an existing intent or task"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: "var(--radius)",
          border: "1px solid var(--border)", background: "var(--bg)",
          fontSize: 11, fontWeight: 500, color: "var(--text)",
          cursor: "pointer",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
      >
        <Link size={11} /> Link existing work
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 800,
          width: 340, background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Relationship
              </span>
              <select
                value={rel}
                onChange={e => setRel(e.target.value as import("@/lib/data").SignalWipRelationship)}
                style={{
                  border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 11, height: 22, padding: "0 4px",
                }}
              >
                <option value="resolves">Resolves this signal</option>
                <option value="partially_addresses">Contributes to (source signal)</option>
                <option value="investigates">Investigates</option>
                <option value="researches">Researches</option>
                <option value="clarifies">Clarifies</option>
                <option value="informs">Informs</option>
                <option value="related_to">Related only</option>
              </select>
            </div>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by title or id…"
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: 11, padding: "4px 6px", outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {eligible.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
                No matching work items available.
              </div>
            ) : eligible.map(w => (
              <button
                key={w.id}
                onClick={() => { linkSignalToWip(signal.id, w.id, rel); setOpen(false); setQ(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", textAlign: "left",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: "var(--fs-body)", color: "var(--text)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "1px 6px", borderRadius: 100, fontSize: 9, fontWeight: 600,
                  background: w.type === "task" ? "rgba(124,58,237,0.08)" : "rgba(14,165,233,0.08)",
                  color: w.type === "task" ? "var(--task)" : "var(--intent)",
                  border: w.type === "task" ? "1px solid rgba(124,58,237,0.2)" : "1px solid rgba(14,165,233,0.2)",
                  textTransform: "capitalize", flexShrink: 0,
                }}>
                  {w.type}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "capitalize", flexShrink: 0 }}>
                  {w.column.replace("_", " ")}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{w.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>{children}</div>
    </div>
  );
}

// ── Priority selector ──────────────────────────────────────────────────────

const PRIORITY_OPTIONS: SignalPriority[] = ["low", "medium", "high", "urgent"];

const PRIORITY_STYLE: Record<SignalPriority, { color: string; bg: string; border: string }> = {
  low:    { color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
  medium: { color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  high:   { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  urgent: { color: "#ffffff", bg: "#dc2626", border: "#dc2626" },
};

function PrioritySelector({ signal }: { signal: Signal }) {
  const { updateSignal, appMode } = useStore();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = signal.priority;
  const s = PRIORITY_STYLE[current];
  const autoValue = computeAutoPriority(signal.labels, signal.source);

  // Client read-only path: render as a static MetaRow with the priority pill.
  if (appMode === "client") {
    return (
      <MetaRow label="Priority">
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "1px 8px", borderRadius: 100,
          fontSize: 11, fontWeight: 500, textTransform: "capitalize",
          background: s.bg, color: s.color,
          border: `1px solid ${s.border}`,
        }}>
          {current}
        </span>
      </MetaRow>
    );
  }

  const select = (p: SignalPriority) => {
    const isAuto = p === autoValue;
    updateSignal(signal.id, { priority: p, priorityOverride: isAuto ? false : true });
    setOpen(false);
  };

  const resetAuto = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateSignal(signal.id, { priority: autoValue, priorityOverride: false });
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Priority</div>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 8px", borderRadius: 100,
            fontSize: "var(--fs-body)", fontWeight: 600, cursor: "pointer",
            color: s.color, background: s.bg, border: `1px solid ${s.border}`,
          }}
        >
          <span style={{ textTransform: "capitalize" }}>{current}</span>
          {signal.priorityOverride && (
            <span
              onClick={resetAuto}
              title="Reset to auto"
              style={{
                fontSize: 10, color: "inherit", opacity: 0.7,
                marginLeft: 2, cursor: "pointer",
              }}
            >↺</span>
          )}
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 600,
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
            padding: 5, minWidth: 130,
          }}>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", padding: "4px 8px 2px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Set priority
            </div>
            {PRIORITY_OPTIONS.map(p => {
              const ps = PRIORITY_STYLE[p];
              const isSelected = current === p;
              const isAuto = p === autoValue;
              return (
                <button
                  key={p}
                  onClick={() => select(p)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "6px 8px",
                    borderRadius: "var(--radius)", border: "none", cursor: "pointer",
                    background: isSelected ? ps.bg : "transparent",
                    fontSize: "var(--fs-body)",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: ps.bg === "#dc2626" ? "#dc2626" : ps.border, border: `1px solid ${ps.border}`, flexShrink: 0 }} />
                    <span style={{ textTransform: "capitalize", fontWeight: isSelected ? 600 : 400, color: isSelected ? ps.color : "var(--text)" }}>{p}</span>
                  </span>
                  {isAuto && (
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontStyle: "italic" }}>auto</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!signal.priorityOverride && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>Auto-assigned</div>
      )}
    </div>
  );
}

// ── Digest panel ─────────────────────────────────────────────────────────

function DigestPanel({ signal, allSignals }: { signal: Signal; allSignals: Signal[] }) {
  const { updateSignal, openSignal } = useStore();
  const digest = signal.digest ?? deriveDigest(signal, allSignals);

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-tertiary)",
    marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
  };

  const aiBadge = (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 100,
      background: "var(--accent-soft)", color: "var(--accent)",
      fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
    }}>AI</span>
  );

  const candidateSignals = digest.relatedCandidates
    .map(id => allSignals.find(s => s.id === id))
    .filter((s): s is Signal => !!s);

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Summary */}
      <section>
        <div style={sectionTitle}>{aiBadge} Summary</div>
        <p style={{ margin: 0, fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.55 }}>
          {digest.summary}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "var(--fs-meta)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
          {digest.assessment}
        </p>
      </section>

      {/* AI suggestions */}
      <section>
        <div style={sectionTitle}>{aiBadge} Suggestions</div>

        {digest.suggestedLabels.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)", marginBottom: 6 }}>
              Suggested labels
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {digest.suggestedLabels.map(label => (
                <button
                  key={label}
                  onClick={() => {
                    if (signal.labels.includes(label)) return;
                    updateSignal(signal.id, { labels: [...signal.labels, label] });
                  }}
                  style={{
                    fontSize: "var(--fs-meta)",
                    padding: "3px 8px",
                    border: "1px dashed var(--border-strong)",
                    borderRadius: 100,
                    background: "var(--bg)",
                    color: "var(--text-secondary)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                  title="Click to add this label"
                >
                  + #{label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 14 }}>
            No new label suggestions.
          </div>
        )}

        {candidateSignals.length > 0 ? (
          <div>
            <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)", marginBottom: 6 }}>
              Signals sharing labels
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {candidateSignals.map(c => (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--bg-sunken)",
                  }}
                >
                  <StatusDot status={c.status} />
                  <span style={{ flex: 1, fontSize: "var(--fs-body)", color: "var(--text)" }}>
                    {c.title}
                  </span>
                  <button
                    onClick={() => openSignal(c.id)}
                    style={{
                      fontSize: "var(--fs-meta)", padding: "3px 9px",
                      border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
                      color: "var(--text)", background: "var(--bg)",
                    }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
            No related candidates detected.
          </div>
        )}
      </section>

      {/* Recent automated activity */}
      <section>
        <div style={sectionTitle}>Recent automated activity</div>
        <ol style={{
          listStyle: "none", padding: 0, margin: 0,
          display: "flex", flexDirection: "column", gap: 8,
          borderLeft: "2px solid var(--border)", paddingLeft: 12,
        }}>
          {digest.activity.map((a, i) => (
            <li key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.45 }}>
                {a.text}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {formatTime(a.at)}
                {" · "}
                <span style={{ textTransform: "capitalize" }}>{a.kind}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ── Labels section ────────────────────────────────────────────────────────
// Existing labels render as removable chips; below them, up to 4 suggested
// labels appear as ghost chips the user can click to apply. Suggestions are
// purely a shortcut — nothing applies until the user clicks. The "+ Add label"
// button opens the full LabelPicker which has its own search/create flow.

function SignalLabelsSection({
  signal, allLabels, allSignals, onToggle, showPicker, setShowPicker, readOnly,
}: {
  signal: Signal;
  allLabels: string[];
  allSignals: Signal[];
  onToggle: (label: string) => void;
  showPicker: boolean;
  setShowPicker: React.Dispatch<React.SetStateAction<boolean>>;
  readOnly?: boolean;
}) {
  const suggestions = React.useMemo(
    () => suggestLabelsForSignal(signal, allSignals).filter(l => !signal.labels.includes(l)).slice(0, 4),
    [signal, allSignals],
  );
  const recent = React.useMemo(
    () => recentlyUsedLabels(allSignals),
    [allSignals],
  );

  // Read-only path: show labels as static chips with no remove handler,
  // no picker, no suggestions. If the signal has no labels, render nothing
  // — clients shouldn't see an empty "Labels" affordance with no chips.
  if (readOnly) {
    if (signal.labels.length === 0) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
          <Tag size={12} /> Labels
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {signal.labels.map(l => <LabelChip key={l} label={l} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        <Tag size={12} /> Labels
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {signal.labels.map(l => <LabelChip key={l} label={l} onRemove={() => onToggle(l)} />)}
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
                onToggle={onToggle}
                onClose={() => setShowPicker(false)}
                suggestions={suggestions}
                recentLabels={recent}
              />
            </div>
          )}
        </div>
      </div>

      {suggestions.length > 0 && !showPicker && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
            textTransform: "uppercase", color: "var(--text-tertiary)",
            marginBottom: 4,
          }}>
            Suggested
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {suggestions.map(l => (
              <button
                key={l}
                onClick={() => onToggle(l)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 100,
                  border: "1px dashed var(--accent)",
                  background: "transparent",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-soft)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                title={`Add #${l}`}
              >
                + #{l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────
// Lists every transaction touching this signal, newest first. Each row shows
// the action summary, actor, timestamp, and an Undo button whose state is
// driven by the safety check. Already-undone transactions show a dimmed
// "Undone" tag and the Undo button disappears.

function HistoryPanel({ signalId }: { signalId: string }) {
  const { transactions, getTxSafety, undoTransaction, wipEvents, wipItems, signals, openSignal, openWip, setRoute } = useStore();
  const sig = signals.find(s => s.id === signalId);
  const relevantTxs = transactions
    .filter(t => t.affectedSignalIds.includes(signalId))
    .slice();

  // Collect WIP-side events worth surfacing on the signal's history. We
  // only show events tied to wips this signal is linked to, narrowed to
  // kinds the user actually wants to read on the signal-side timeline:
  // moves to Done, review states, follow-up creation, and signal-link
  // events directly mentioning this signal.
  const linkedWipIds = new Set(sig?.linkedWip ?? []);
  // Also follow-up wips that might have been spawned referencing this signal
  // via inheritance — caught when the wip's linkedSignals includes us.
  for (const w of wipItems) {
    if (w.linkedSignals.includes(signalId)) linkedWipIds.add(w.id);
  }
  const relevantEvents = wipEvents.filter(ev => {
    if (!linkedWipIds.has(ev.wipId)) return false;
    if (ev.kind === "moved" && ev.toColumn === "done") return true;
    if (ev.kind === "needs_review") return true;
    if (ev.kind === "reviewed_looks_good") return true;
    if (ev.kind === "reviewed_follow_up") return true;
    if (ev.kind === "follow_up_created") return true;
    if (ev.kind === "linked_signals_closed" && ev.signalId === signalId) return true;
    if (ev.kind === "reopened") return true;
    return false;
  });

  // Merge transactions + wip-side events into one chronological feed,
  // newest first. Tag each entry so the row renderer knows which shape
  // it's dealing with.
  type Entry =
    | { kind: "tx"; ts: string; tx: typeof transactions[number] }
    | { kind: "ev"; ts: string; ev: typeof wipEvents[number]; wip?: import("@/lib/data").Wip };
  const entries: Entry[] = [
    ...relevantTxs.map(tx => ({ kind: "tx" as const, ts: tx.timestamp, tx })),
    ...relevantEvents.map(ev => ({
      kind: "ev" as const, ts: ev.at, ev,
      wip: wipItems.find(w => w.id === ev.wipId),
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--fs-body)" }}>
        No history yet for this signal.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 12 }}>
        Action history
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(entry => entry.kind === "tx" ? (
          <HistoryRow key={`tx-${entry.tx.id}`} tx={entry.tx} safety={getTxSafety(entry.tx)} onUndo={() => undoTransaction(entry.tx.id)} />
        ) : (
          <WipDerivedHistoryRow
            key={`ev-${entry.ev.id}`}
            event={entry.ev}
            wip={entry.wip}
            onOpenWip={(id) => { openSignal(null); setRoute("wip"); openWip(id); }}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  tx, safety, onUndo,
}: {
  tx: import("@/lib/data").Transaction;
  safety: import("@/lib/data").UndoSafety;
  onUndo: () => void;
}) {
  const actor = userById(tx.actor);
  const isBulk = tx.affectedSignalIds.length > 1;

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px", borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: tx.undone ? "var(--bg-sunken)" : "var(--bg)",
        opacity: tx.undone ? 0.65 : 1,
      }}
    >
      <Avatar userId={tx.actor} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.35 }}>
          <span style={{ fontWeight: 500 }}>{actor.name}</span>
          {" · "}
          <span>{tx.summary}</span>
          {isBulk && (
            <span style={{
              marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 100,
              background: "var(--bg-sunken)", color: "var(--text-tertiary)",
              border: "1px solid var(--border)",
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
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
          {relTime(tx.timestamp)}
          {safety.state === "warning" && !tx.undone && (
            <span style={{ marginLeft: 8, color: "#c2410c" }}>
              ⚠ {safety.reason}
            </span>
          )}
          {safety.state === "unavailable" && !tx.undone && (
            <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>
              {safety.reason}
            </span>
          )}
        </div>
      </div>
      {!tx.undone && (
        <button
          onClick={safety.state === "unavailable" ? undefined : onUndo}
          disabled={safety.state === "unavailable"}
          title={safety.state === "warning" ? safety.reason : undefined}
          style={{
            fontSize: 11,
            color:
              safety.state === "unavailable" ? "var(--text-tertiary)" :
              safety.state === "warning"     ? "#c2410c" :
              "var(--accent)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "3px 10px",
            cursor: safety.state === "unavailable" ? "not-allowed" : "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {safety.state === "unavailable" ? "Can't undo" :
           safety.state === "warning"     ? "Undo anyway" :
                                            "Undo"}
        </button>
      )}
    </div>
  );
}

// ── WipDerivedHistoryRow ──────────────────────────────────────────────────
// Read-only entry in the signal-side history feed for events that happened
// on a linked WIP item: moves to Done, review verdicts, follow-up
// creation. Click navigates to the linked work.

function WipDerivedHistoryRow({
  event, wip, onOpenWip,
}: {
  event: import("@/lib/data").WipEvent;
  wip: import("@/lib/data").Wip | undefined;
  onOpenWip: (wipId: string) => void;
}) {
  const actor = userById(event.actor);
  const wipLabel = wip ? `${wip.type === "task" ? "Task" : "Intent"} “${wip.title}”` : "Linked work";

  const summary = (() => {
    if (event.kind === "moved" && event.toColumn === "done") {
      return <>{wipLabel} moved to Done</>;
    }
    if (event.kind === "needs_review") {
      return <>{wipLabel} marked Needs review</>;
    }
    if (event.kind === "reviewed_looks_good") {
      return <>{wipLabel} reviewed — Looks good</>;
    }
    if (event.kind === "reviewed_follow_up") {
      return <>{wipLabel} reviewed — Follow-up needed</>;
    }
    if (event.kind === "follow_up_created") {
      const k = event.followUpKind ?? "item";
      return <>Follow-up {k} created from {wipLabel}</>;
    }
    if (event.kind === "linked_signals_closed") {
      const n = event.closedSignalCount ?? 0;
      return <>{n} linked signal{n === 1 ? "" : "s"} closed via {wipLabel}'s review</>;
    }
    if (event.kind === "reopened") {
      return <>{wipLabel} reopened</>;
    }
    return <>{wipLabel}: {event.kind}</>;
  })();

  return (
    <button
      onClick={() => wip && onOpenWip(wip.id)}
      disabled={!wip}
      title={wip ? "Open linked work" : "This work item is no longer on the board"}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px", borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--bg-sunken)",
        textAlign: "left", cursor: wip ? "pointer" : "default",
        width: "100%",
      }}
      onMouseEnter={e => { if (wip) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-sunken)"; }}
    >
      <Avatar userId={event.actor} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.35 }}>
          <span style={{ fontWeight: 500 }}>{actor.name}</span>
          {" · "}
          {summary}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }} title={absDate(event.at)}>
          {relTime(event.at)}
        </div>
      </div>
    </button>
  );
}

// ── Comments panel ────────────────────────────────────────────────────────
// Shared shape with the WIP comments tab: composer at the top, list below.
// In team mode the author can choose visibility; in client mode the toggle
// is hidden and visibility is forced to "client" so a client never posts an
// internal-only comment by accident, and clients only ever see comments
// already filtered by the caller.

function SignalCommentsPanel({
  signalId, comments, onPost, readOnly,
}: {
  signalId: string;
  comments: SignalComment[];
  onPost: (body: string, visibility: Visibility) => void;
  readOnly: boolean;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<Visibility>(readOnly ? "client" : "internal");

  // If the user toggles into client mode while a comment is in-flight, lock
  // the visibility back to "client" so we never accidentally tag it internal.
  useEffect(() => {
    if (readOnly && visibility !== "client") setVisibility("client");
  }, [readOnly, visibility]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onPost(trimmed, readOnly ? "client" : visibility);
    setBody("");
  };

  // Newest last so the conversation reads top-to-bottom.
  const ordered = comments.slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div>
      {/* Composer — team only. Clients view comments read-only. */}
      {!readOnly && (
      <div style={{
        border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
        background: "var(--bg-sunken)", marginBottom: 18, overflow: "hidden",
      }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) submit(); }}
          placeholder="Write a comment… (Cmd+Enter to post)"
          rows={3}
          style={{
            width: "100%", border: "none", outline: "none",
            background: "transparent", resize: "none",
            padding: "10px 12px", fontSize: "var(--fs-body)", lineHeight: 1.55,
            color: "var(--text)", boxSizing: "border-box",
          }}
        />
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderTop: "1px solid var(--border)",
          background: "var(--bg)",
        }}>
          <CommentVisibilityToggle value={visibility} onChange={setVisibility} />
          <span style={{ flex: 1 }} />
          <button
            onClick={submit}
            disabled={!body.trim()}
            style={{
              padding: "4px 12px", borderRadius: "var(--radius)",
              background: body.trim() ? "var(--accent)" : "var(--bg-sunken)",
              color: body.trim() ? "white" : "var(--text-disabled)",
              fontSize: "var(--fs-meta)", fontWeight: 500,
              border: "1px solid transparent",
              cursor: body.trim() ? "pointer" : "not-allowed",
            }}
          >
            Post
          </button>
        </div>
      </div>
      )}

      {/* List */}
      {ordered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 24,
          color: "var(--text-tertiary)", fontSize: "var(--fs-body)",
        }}>
          {readOnly ? "No comments yet." : "No comments yet. Start the thread."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ordered.map(c => <SignalCommentRow key={c.id} comment={c} showVisibility={!readOnly} />)}
        </div>
      )}

      {/* Defensive: keep React happy about the captured signalId being used */}
      <span hidden>{signalId}</span>
    </div>
  );
}

function SignalCommentRow({ comment, showVisibility }: { comment: SignalComment; showVisibility: boolean }) {
  const author = userById(comment.author);
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Avatar userId={comment.author} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)" }}>{author.name}</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }} title={absDate(comment.createdAt)}>
            {relTime(comment.createdAt)}
          </span>
          {showVisibility && (
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "1px 6px", borderRadius: 100,
              fontSize: 10.5, fontWeight: 500,
              background: comment.visibility === "client" ? "#f0fdf4" : "var(--bg-sunken)",
              color: comment.visibility === "client" ? "#15803d" : "var(--text-tertiary)",
              border: `1px solid ${comment.visibility === "client" ? "#bbf7d0" : "var(--border)"}`,
              textTransform: "capitalize",
            }}>
              {comment.visibility}
            </span>
          )}
        </div>
        <div style={{
          fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.55,
          background: "var(--bg-sunken)", padding: "8px 10px",
          borderRadius: "var(--radius)", border: "1px solid var(--border)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {comment.body}
        </div>
      </div>
    </div>
  );
}

function CommentVisibilityToggle({ value, onChange }: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <span style={{
      display: "inline-flex",
      border: "1px solid var(--border)",
      borderRadius: 100,
      overflow: "hidden",
    }}>
      {(["internal", "client"] as Visibility[]).map(v => {
        const isActive = value === v;
        const isClient = v === "client";
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              padding: "3px 9px",
              fontSize: 11, fontWeight: 500,
              background: isActive ? (isClient ? "#f0fdf4" : "var(--bg-hover)") : "transparent",
              color: isActive ? (isClient ? "#15803d" : "var(--text)") : "var(--text-tertiary)",
              border: "none", cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {v}
          </button>
        );
      })}
    </span>
  );
}

// ── ClosureBanner ─────────────────────────────────────────────────────────
// Replaces the old generic "Signal closed. Reopen if you need to revisit."
// with a human-readable explanation of WHY it's closed:
//   • task_done / intent_done → links to the wip that completed
//   • manual                 → "Closed manually by Tamar on Apr 24"
//   • system / fallback      → "Closed on Apr 24"
// Click on the wip link → opens that wip's detail modal.

function ClosureBanner({
  signal, wipItems, onOpenWip,
}: {
  signal: Signal;
  wipItems: import("@/lib/data").Wip[];
  onOpenWip: (wipId: string) => void;
}) {
  const c = signal.closure;
  // Falls back to a quiet default banner if we don't have a closure record
  // (older signals / signals closed before closure-tracking landed).
  if (!c) {
    return (
      <div style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--bg-sunken)", border: "1px solid var(--border)", marginBottom: 14, fontSize: "var(--fs-body)", color: "var(--text-secondary)" }}>
        Signal closed. Reopen if you need to revisit.
      </div>
    );
  }

  const wip = c.wipId ? wipItems.find(w => w.id === c.wipId) : undefined;
  const actor = c.actor ? userById(c.actor) : null;

  return (
    <div style={{
      padding: "10px 12px", borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px solid var(--border)",
      marginBottom: 14, fontSize: "var(--fs-body)", color: "var(--text-secondary)",
      lineHeight: 1.5,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
        color: "var(--text-tertiary)", marginBottom: 4,
      }}>
        Closed because
      </div>
      <div>
        {c.reason === "reviewed" && wip ? (
          <>
            {wip.type === "task" ? "Task " : "Intent "}
            <button
              onClick={() => onOpenWip(wip.id)}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", cursor: "pointer", fontWeight: 500,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              “{wip.title}”
            </button>
            {" "}was reviewed as done
            {actor && <> by <strong style={{ color: "var(--text)", fontWeight: 500 }}>{actor.name}</strong></>}
            {" "}on {absDate(c.at)}.
          </>
        ) : c.reason === "reviewed" ? (
          <>
            Linked work was reviewed as done on {absDate(c.at)}.
            {" "}<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>(no longer on the board)</span>
          </>
        ) : (c.reason === "task_done" || c.reason === "intent_done") && wip ? (
          <>
            {c.reason === "task_done" ? "Task " : "Intent "}
            <button
              onClick={() => onOpenWip(wip.id)}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", cursor: "pointer", fontWeight: 500,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              “{wip.title}”
            </button>
            {" "}was moved to Done on {absDate(c.at)}.
          </>
        ) : (c.reason === "task_done" || c.reason === "intent_done") ? (
          <>
            Linked {c.reason === "task_done" ? "task" : "intent"} reached Done on {absDate(c.at)}.
            {" "}<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>(no longer on the board)</span>
          </>
        ) : c.reason === "manual" && actor ? (
          <>Closed manually by <strong style={{ color: "var(--text)", fontWeight: 500 }}>{actor.name}</strong> on {absDate(c.at)}.</>
        ) : (
          <>Closed on {absDate(c.at)}.</>
        )}
      </div>
      {/* Free-text reason captured on close — appears for any closure
          variant (manual / reviewed / task_done / intent_done). Italics
          + secondary tone keeps it distinct from the structured headline. */}
      {c.note && (
        <div style={{
          marginTop: 6, fontSize: 12, color: "var(--text)", lineHeight: 1.5,
          padding: "6px 8px", borderRadius: "var(--radius)",
          background: "var(--bg)", border: "1px solid var(--border)",
          fontStyle: "italic",
        }}>
          “{c.note}”
        </div>
      )}
    </div>
  );
}

// ── SignalAttachmentsSection ──────────────────────────────────────────────
// Per-file attachments on a signal. Rendered above the labels block in the
// detail tab. Image mime types get a small thumbnail tile; everything else
// falls back to a file-icon row with name/size/type. No upload UI for now
// (matches the spec — "transcript/source files later"); the section just
// quietly hides when there's nothing attached.

function SignalAttachmentsSection({
  signalId, attachments, canUpload,
}: {
  signalId: string;
  attachments: SignalAttachment[];
  canUpload: boolean;
}) {
  const { addSignalAttachment } = useStore();
  // Hidden native file input — we use the real picker if it's available
  // for the proper desktop drop-down feel, but we don't actually upload
  // bytes anywhere; just record the file's name/size/mimeType. If the
  // user cancels the picker, nothing happens. Falls back to a sample
  // file if the picker is somehow unavailable (very old browsers).
  const inputRef = React.useRef<HTMLInputElement>(null);

  const SAMPLE_FILES = [
    { name: "screenshot.png", mimeType: "image/png",          size: "180 KB" },
    { name: "spec-notes.pdf", mimeType: "application/pdf",    size: "320 KB" },
    { name: "log-export.csv", mimeType: "text/csv",           size: "42 KB"  },
    { name: "walkthrough.mp4",mimeType: "video/mp4",          size: "5.8 MB" },
  ];

  const handlePickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      // Fallback for the no-files-selected path: just rotate a sample.
      const pick = SAMPLE_FILES[Math.floor(Math.random() * SAMPLE_FILES.length)];
      addSignalAttachment(signalId, pick.name, pick.mimeType, pick.size);
      return;
    }
    for (const file of Array.from(files)) {
      const sizeStr = formatBytes(file.size);
      addSignalAttachment(signalId, file.name, file.type || "application/octet-stream", sizeStr);
    }
  };

  // No section at all when there's nothing to upload AND nothing to show.
  if (!canUpload && attachments.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 6,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <Link size={12} /> Attachments
        {attachments.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {attachments.length}</span>
        )}
        <span style={{ flex: 1 }} />
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={e => {
                handlePickFiles(e.target.files);
                // Reset value so picking the same file again still triggers onChange.
                if (e.target) e.target.value = "";
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: "var(--radius)",
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "var(--fs-meta)",
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Plus size={11} /> Upload
            </button>
          </>
        )}
      </div>
      {attachments.length === 0 ? (
        <div style={{
          padding: "10px 12px",
          borderRadius: "var(--radius)",
          border: "1px dashed var(--border)",
          background: "transparent",
          fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
          textAlign: "center",
        }}>
          No attachments yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {attachments.map(att => {
            const isImage = att.mimeType.startsWith("image/");
            const uploader = userById(att.uploadedBy);
            return (
              <div
                key={att.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  fontSize: "var(--fs-body)",
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, flexShrink: 0,
                  borderRadius: "var(--radius)",
                  background: "var(--bg-sunken)",
                  color: "var(--text-tertiary)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}>
                  {isImage ? <Image size={14} /> : <span style={{ fontSize: 10, fontWeight: 600 }}>{shortMime(att.mimeType)}</span>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 500, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {att.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {att.size} · {uploader.name} · <span title={absDate(att.createdAt)}>{relTime(att.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tiny byte → human-readable formatter for upload picker results. We don't
// care about precision (UI prototype only); just want "180 KB" instead of
// "184320".
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function shortMime(m: string): string {
  const sub = m.split("/")[1] ?? m;
  return sub.toUpperCase().slice(0, 4);
}

// Reused pill style for the assignee picker in CreateWorkItemForm. Single
// styling helper so the active/inactive states stay consistent across users.
function assigneePillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 8px", borderRadius: 100,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    fontSize: 11, fontWeight: active ? 500 : 400, cursor: "pointer",
  };
}
