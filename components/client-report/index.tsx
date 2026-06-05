"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { Signal, Wip } from "@/lib/data";
import { X, Copy, Check } from "@/components/ui/icons";

// ── ClientReportModal ────────────────────────────────────────────────────
// Generates a copy-friendly plain-text status update suitable for pasting
// into Slack / email. Client-safe: never includes internal comments,
// internal-only annotations, raw history, or sensitive links.
//
// Categorisation maps the app's internal statuses to a small client-facing
// vocabulary:
//
//   Internal              Client-facing
//   --------              -------------
//   new / accepted        Open
//   accepted + linked WIP In progress  (the wip is past Backlog)
//   ready                 In progress
//   skipped               Deferred
//   closed                Resolved
//   rejected              (omitted unless explicitly included)
//
// "Needs clarification" surfaces signals that are accepted but have NO
// linked work and were accepted more than 1 day ago — heuristic for
// "we're stuck and probably need to ask the client". Easy to refine.
//
// The "Next planned work" section lists the top N upstream wip items
// (Backlog + To Do) sorted by manual rank, presented as plain titles —
// no IDs, no internal pids.

interface ReportSections {
  resolved: { signal: Signal; resolvedAt: string; clientSafeNote: string }[];
  inProgress: { signal: Signal; nextStep: string }[];
  open: Signal[];
  needsClarification: { signal: Signal; question: string }[];
  deferred: { signal: Signal; until: string | null }[];
  nextPlanned: Wip[];
}

export function ClientReportModal({ onClose }: { onClose: () => void }) {
  const { signals, wipItems } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Default range: last 7 days, ending today. State so the user can tune.
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(weekAgo.toISOString().slice(0, 10));
  const [toDate,   setToDate]   = useState(today.toISOString().slice(0, 10));
  const [projectName, setProjectName] = useState("Ecomedes");
  const [includeNextPlanned, setIncludeNextPlanned] = useState(true);
  const [includeDeferred, setIncludeDeferred] = useState(true);
  const [copied, setCopied] = useState(false);

  const sections = useMemo<ReportSections>(() => {
    // Inclusive-end: report the entire `to` day. Without this `to = today`
    // would miss anything resolved today after 00:00 UTC.
    const fromMs = new Date(fromDate + "T00:00:00").getTime();
    const toMs   = new Date(toDate   + "T23:59:59").getTime();

    const resolved: ReportSections["resolved"] = [];
    const inProgress: ReportSections["inProgress"] = [];
    const open: Signal[] = [];
    const needsClarification: ReportSections["needsClarification"] = [];
    const deferred: ReportSections["deferred"] = [];

    const inWindow = (iso?: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= fromMs && t <= toMs;
    };

    for (const s of signals) {
      // Resolved within range — only the latest closure timestamp counts.
      if (s.status === "closed" && inWindow(s.closure?.at ?? s.statusUpdatedAt)) {
        const at = s.closure?.at ?? s.statusUpdatedAt ?? "";
        let note = "Issue resolved.";
        if (s.closure?.note) {
          note = s.closure.note;
        } else if (s.closure?.reason === "task_done" || s.closure?.reason === "intent_done" || s.closure?.reason === "reviewed") {
          const linkedWip = s.closure.wipId ? wipItems.find(w => w.id === s.closure!.wipId) : undefined;
          note = linkedWip ? `Resolved by completed ${linkedWip.type}.` : "Resolved by completed work.";
        }
        resolved.push({ signal: s, resolvedAt: at, clientSafeNote: note });
        continue;
      }

      // Skipped → Deferred. Always shown when toggled on; we don't gate by
      // when the skip started — a still-deferred item is current state.
      if (s.status === "skipped") {
        deferred.push({ signal: s, until: s.skipUntil ?? null });
        continue;
      }

      // Ready → In progress (linked work exists by product rule).
      if (s.status === "ready") {
        const wipTitles = s.linkedWip
          .map(wid => wipItems.find(w => w.id === wid))
          .filter((w): w is Wip => !!w)
          .map(w => `${w.type === "intent" ? "Intent" : "Task"}: ${w.title}`);
        const nextStep = wipTitles.length > 0
          ? wipTitles[0]
          : "Work in progress.";
        inProgress.push({ signal: s, nextStep });
        continue;
      }

      // Accepted: if linked to active work, treat as in progress; if NOT
      // linked and > 1 day old, surface as "needs clarification".
      if (s.status === "accepted") {
        const hasOpenWip = s.linkedWip.some(wid => {
          const w = wipItems.find(x => x.id === wid);
          return w && w.column !== "done";
        });
        if (hasOpenWip) {
          inProgress.push({ signal: s, nextStep: "Investigating." });
          continue;
        }
        const acceptedAge = s.statusUpdatedAt
          ? Date.now() - new Date(s.statusUpdatedAt).getTime()
          : 0;
        if (acceptedAge > 24 * 60 * 60 * 1000) {
          needsClarification.push({
            signal: s,
            question: "Awaiting clarification before we can plan the next step.",
          });
          continue;
        }
        open.push(s);
        continue;
      }

      // New → Open (rejected signals are omitted from the report — they
      // shouldn't show up in client status without an explicit decision).
      if (s.status === "new") {
        open.push(s);
      }
    }

    // Next planned: top 5 upstream wips by manual order (Backlog + To Do).
    const nextPlanned = wipItems
      .filter(w => w.column === "backlog" || w.column === "to_do")
      .slice()
      .sort((a, b) => {
        const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
        return ao - bo;
      })
      .slice(0, 5);

    // Newest-first within each section so the most recent activity reads
    // first. For lists driven by a status timestamp we use that; for
    // "open" we use createdAt.
    resolved.sort((a, b) => new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime());
    inProgress.sort((a, b) => new Date(b.signal.statusUpdatedAt ?? b.signal.createdAt).getTime() - new Date(a.signal.statusUpdatedAt ?? a.signal.createdAt).getTime());
    open.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    needsClarification.sort((a, b) => new Date(b.signal.statusUpdatedAt ?? b.signal.createdAt).getTime() - new Date(a.signal.statusUpdatedAt ?? a.signal.createdAt).getTime());
    deferred.sort((a, b) => {
      // Returning soon first; indefinite at the end.
      const at = a.until ? new Date(a.until).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.until ? new Date(b.until).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });

    return { resolved, inProgress, open, needsClarification, deferred, nextPlanned };
  }, [signals, wipItems, fromDate, toDate]);

  const report = buildReportText({
    projectName,
    fromDate, toDate,
    sections,
    includeNextPlanned, includeDeferred,
  });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select-and-copy via a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        background: "var(--bg-overlay)",
        animation: "fadeIn 0.15s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(820px, 100%)",
          maxHeight: "90vh",
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
          padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Client feedback report
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            · Client-safe — no internal notes are included
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 6, color: "var(--text-secondary)", background: "transparent",
              border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Controls */}
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            Project
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "4px 8px", fontSize: "var(--fs-body)", background: "var(--bg)",
                outline: "none", width: 160,
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            From
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "4px 8px", fontSize: "var(--fs-body)", background: "var(--bg)",
                outline: "none",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            To
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "4px 8px", fontSize: "var(--fs-body)", background: "var(--bg)",
                outline: "none",
              }}
            />
          </label>
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={includeDeferred} onChange={e => setIncludeDeferred(e.target.checked)} />
            Include deferred
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={includeNextPlanned} onChange={e => setIncludeNextPlanned(e.target.checked)} />
            Include next planned
          </label>
        </div>

        {/* Body — editable textarea so the user can tweak before copying. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 18px" }}>
          <textarea
            value={report}
            readOnly
            // Read-only: future pass could allow inline edits before copy.
            // For now we let the user copy the generated text and tweak
            // it in the destination (Slack/email).
            style={{
              width: "100%", minHeight: 420,
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              padding: "10px 12px",
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 12.5, lineHeight: 1.5,
              background: "var(--bg-sunken)", color: "var(--text)",
              resize: "vertical", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 18px", borderTop: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {sections.resolved.length} resolved · {sections.inProgress.length} in progress · {sections.open.length} open · {sections.needsClarification.length} need clarification{includeDeferred ? ` · ${sections.deferred.length} deferred` : ""}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "5px 10px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--bg)",
              fontSize: "var(--fs-meta)", color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={onCopy}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: "var(--radius)",
              border: "none",
              background: copied ? "var(--status-accepted)" : "var(--accent)",
              color: "white", fontSize: "var(--fs-meta)", fontWeight: 500, cursor: "pointer",
            }}
          >
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy report</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function buildReportText({
  projectName, fromDate, toDate, sections, includeNextPlanned, includeDeferred,
}: {
  projectName: string;
  fromDate: string;
  toDate: string;
  sections: ReportSections;
  includeNextPlanned: boolean;
  includeDeferred: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`${projectName} Feedback Status Update`);
  lines.push(`Period: ${formatDate(fromDate)} – ${formatDate(toDate)}`);
  lines.push("");

  // Summary counts.
  const total =
    sections.resolved.length +
    sections.inProgress.length +
    sections.open.length +
    sections.needsClarification.length +
    (includeDeferred ? sections.deferred.length : 0);
  lines.push("Summary");
  lines.push(`This period covers ${total} feedback item${total === 1 ? "" : "s"}:`);
  lines.push(`- ${sections.resolved.length} resolved`);
  lines.push(`- ${sections.inProgress.length} in progress`);
  lines.push(`- ${sections.open.length} open`);
  lines.push(`- ${sections.needsClarification.length} need${sections.needsClarification.length === 1 ? "s" : ""} clarification`);
  if (includeDeferred) {
    lines.push(`- ${sections.deferred.length} deferred`);
  }
  lines.push("");

  if (sections.resolved.length > 0) {
    lines.push("Resolved feedback");
    sections.resolved.forEach((row, i) => {
      lines.push(`${i + 1}. ${cleanTitle(row.signal.title)}`);
      lines.push(`   Status: Resolved on ${formatDate(row.resolvedAt.slice(0, 10))}`);
      lines.push(`   What changed: ${row.clientSafeNote}`);
    });
    lines.push("");
  }

  if (sections.inProgress.length > 0) {
    lines.push("In progress");
    sections.inProgress.forEach((row, i) => {
      lines.push(`${i + 1}. ${cleanTitle(row.signal.title)}`);
      lines.push(`   Status: In progress`);
      lines.push(`   Next step: ${row.nextStep}`);
    });
    lines.push("");
  }

  if (sections.open.length > 0) {
    lines.push("Open feedback");
    sections.open.forEach((s, i) => {
      lines.push(`${i + 1}. ${cleanTitle(s.title)}`);
      lines.push(`   Status: Open`);
    });
    lines.push("");
  }

  if (sections.needsClarification.length > 0) {
    lines.push("Needs clarification");
    sections.needsClarification.forEach((row, i) => {
      lines.push(`${i + 1}. ${cleanTitle(row.signal.title)}`);
      lines.push(`   Question: ${row.question}`);
    });
    lines.push("");
  }

  if (includeDeferred && sections.deferred.length > 0) {
    lines.push("Deferred");
    sections.deferred.forEach((row, i) => {
      const until = row.until ? ` until ${formatDate(row.until.slice(0, 10))}` : " (no return date set)";
      lines.push(`${i + 1}. ${cleanTitle(row.signal.title)}`);
      lines.push(`   Status: Deferred${until}`);
    });
    lines.push("");
  }

  if (includeNextPlanned && sections.nextPlanned.length > 0) {
    lines.push("Next planned work");
    sections.nextPlanned.forEach(w => {
      lines.push(`- ${cleanTitle(w.title)}`);
    });
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatDate(yyyymmdd: string): string {
  // Defensive: handle both pure date strings and ISO datetimes.
  const datePart = yyyymmdd.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return yyyymmdd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function cleanTitle(t: string): string {
  // Trim trailing punctuation and collapse whitespace so the report reads
  // tidy in plain text.
  return t.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}
