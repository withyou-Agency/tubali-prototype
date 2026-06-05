"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Signal, DuplicateGroup, Wip, duplicateStateOf, isDuplicateGroupNewOrChanged, mainSignalOf, wipsLinkedToGroup } from "@/lib/data";
import { StatusDot } from "@/components/ui/dot";
import { LabelChip } from "@/components/ui/label-chip";
import { Plus, X, Check, ChevronDown } from "@/components/ui/icons";

// ── DuplicateSection ──────────────────────────────────────────────────────
// Lives inside the signal detail modal. Renders a duplicate-group panel
// with a main-signal header, a preview of sibling signals (first 5 +
// View all), and group-level actions appropriate to the state:
//
//   • "possible"  → Accept / Reject / Remove + per-signal Open. Suggestion
//                   reasoning is shown as a bullet list. When the
//                   suggestion ties back to a wip, an "existing work"
//                   callout appears so the reviewer knows about it.
//   • "confirmed" → Add duplicate / Change main + per-signal Open / Remove.
//                   Acts as one unit — the surrounding modal applies
//                   status changes to the whole group with no prompt.
//
// Read-only (client) mode collapses to a static header + sibling preview;
// no buttons are exposed.

const PREVIEW_COUNT = 5;

export function DuplicateSection({ signal }: { signal: Signal }) {
  const {
    duplicateGroups, signals, wipItems, openSignal, appMode,
    acceptDuplicateGroup, rejectDuplicateGroup,
    removeSignalFromDuplicateGroup, updateSignal,
    setMainSignal, closeDuplicateGroup, createFollowUp,
  } = useStore();
  const readOnly = appMode === "client";
  const dup = duplicateStateOf(duplicateGroups, signal.id);
  // Done-WIP three-way prompt state. When the user clicks Accept on a
  // suggestion whose linked WIP is already Done, we don't auto-confirm —
  // we ask the reviewer what to do (cover / keep separate / follow-up).
  const [donePrompt, setDonePrompt] = useState<null | "ask">(null);
  if (dup.kind === "none") return null;

  const group = dup.group;
  const main = mainSignalOf(group, signals);
  const linkedWips = wipsLinkedToGroup(group, signals, wipItems);
  const doneWip = linkedWips.find(w => w.column === "done");

  const handleAccept = () => {
    // If any linked WIP is in Done, ask the reviewer first — completed
    // work might still be the right answer, or a follow-up is needed.
    if (!group.confirmed && doneWip) {
      setDonePrompt("ask");
      return;
    }
    acceptDuplicateGroup(group.id);
  };

  return (
    <div style={{
      marginBottom: 16, padding: "12px 14px",
      borderRadius: "var(--radius-lg)",
      border: `1px ${group.confirmed ? "solid" : "dashed"} ${paletteFor(group).border}`,
      background: paletteFor(group).bg,
    }}>
      <DuplicateHeader
        group={group}
        main={main}
        currentSignal={signal}
        linkedWips={linkedWips}
        readOnly={readOnly}
        onAccept={handleAccept}
        onReject={() => rejectDuplicateGroup(group.id)}
        onCloseGroup={() => closeDuplicateGroup(group.id)}
        onSetMain={(id) => setMainSignal(group.id, id)}
      />

      {/* Done-WIP three-way prompt. Spec: "This looks similar to completed
          work" — Mark covered (close as duplicate of completed work),
          Keep separate (reject this suggestion only), or Create follow-up
          (spawn a new task/intent linked back to the completed work). */}
      {donePrompt === "ask" && doneWip && (
        <div style={{
          margin: "0 0 10px",
          padding: "10px 12px",
          borderRadius: "var(--radius)",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          fontSize: "var(--fs-meta)", color: "var(--text)", lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            This looks similar to completed work.
          </div>
          <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
            {doneWip.type === "task" ? "Task" : "Intent"} “{doneWip.title}” already shipped. How do you want to handle this signal?
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => setDonePrompt(null)}
              style={ghostBtn()}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Create follow-up signal from the Done wip; reject the
                // suggestion so the new signal stays independent.
                createFollowUp(doneWip.id, "signal", { title: signal.title, description: signal.description });
                rejectDuplicateGroup(group.id);
                setDonePrompt(null);
              }}
              style={ghostBtn()}
              title="Spawn a new follow-up signal linked back to the completed work"
            >
              Create follow-up
            </button>
            <button
              onClick={() => {
                // Keep separate = reject this suggestion only.
                rejectDuplicateGroup(group.id);
                setDonePrompt(null);
              }}
              style={ghostBtn()}
              title="Reject this suggestion. The signal stays independent."
            >
              Keep separate
            </button>
            <button
              onClick={() => {
                // Mark covered: confirm the duplicate group AND close the
                // current signal with a "covered by completed work" closure.
                acceptDuplicateGroup(group.id);
                updateSignal(signal.id, { status: "closed" });
                setDonePrompt(null);
              }}
              style={primaryBtn("#15803d")}
              title="Add to duplicate group and close as already covered"
            >
              Mark as already covered
            </button>
          </div>
        </div>
      )}

      {/* Reasoning — bullet list when present, single-line `reason`
          fallback for back-compat with older suggestions. */}
      {!group.confirmed && (group.reasons || group.reason) && (
        <div style={{ marginTop: 6, marginBottom: 10, paddingTop: 6, borderTop: `1px solid ${paletteFor(group).border}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Suggested because
          </div>
          {group.reasons && group.reasons.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.55 }}>
              {group.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : group.reason ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.55 }}>{group.reason}</div>
          ) : null}
        </div>
      )}

      {/* Linked WIP awareness — possible-suggestion callout. Confirmed
          groups already render the WIP context elsewhere in the modal,
          so we only show this for unconfirmed suggestions. */}
      {!group.confirmed && linkedWips.length > 0 && (
        <ExistingWorkCallout wips={linkedWips} />
      )}

      <SiblingList
        group={group}
        currentSignal={signal}
        readOnly={readOnly}
        onOpen={(id) => openSignal(id)}
        onRemove={(id) => removeSignalFromDuplicateGroup(group.id, id)}
        onSetMain={(id) => setMainSignal(group.id, id)}
      />
    </div>
  );
}

// ── DuplicateHeader ───────────────────────────────────────────────────────
// Top row of the section: state label, count, "New" tag (for unseen
// suggestions), and group-level actions. Confirmed groups show
// Add-duplicate + Change-main + Close-group; suggestions show
// Accept / Reject.

function DuplicateHeader({
  group, main, currentSignal, linkedWips, readOnly,
  onAccept, onReject, onCloseGroup, onSetMain,
}: {
  group: DuplicateGroup;
  main: Signal | undefined;
  currentSignal: Signal;
  linkedWips: Wip[];
  readOnly: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCloseGroup: () => void;
  onSetMain: (id: string) => void;
}) {
  const palette = paletteFor(group);
  const stateLabel = group.confirmed ? "Duplicate group" : "Possible duplicates";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
        textTransform: "uppercase", color: palette.fg,
      }}>
        {stateLabel}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        · Duplicate ×{group.signalIds.length}
      </span>
      {isDuplicateGroupNewOrChanged(group) && (
        <span
          title="New duplicate suggestion since your last visit"
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "1px 6px", borderRadius: 100,
            background: "#dc2626", color: "white",
            lineHeight: "14px",
          }}
        >
          New
        </span>
      )}
      <span style={{ flex: 1 }} />
      {!readOnly && !group.confirmed && (
        <>
          <button
            onClick={onReject}
            style={ghostBtn()}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            title="Reject this specific grouping. Signals stay independent."
          >
            Reject suggestion
          </button>
          <button onClick={onAccept} style={primaryBtn(palette.fg)}>
            <Check size={11} /> Accept group
          </button>
        </>
      )}
      {!readOnly && group.confirmed && (
        <>
          <AddSignalToGroupPicker group={group} />
          <ChangeMainSignalPicker
            group={group}
            currentMainId={main?.id}
            onSetMain={onSetMain}
          />
          <button
            onClick={onCloseGroup}
            style={ghostBtn()}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            title="Close every signal in the group as one unit"
          >
            Close group
          </button>
        </>
      )}

      {/* Header second row: main signal + linked-wip pill. Drawn below the
          main flex row via flex-basis 100% so action buttons keep their
          place even on narrow modals. */}
      {main && (
        <div style={{
          flexBasis: "100%", marginTop: 4, paddingTop: 4,
          borderTop: `1px dashed ${palette.border}`,
          fontSize: 11.5, color: "var(--text-secondary)",
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Main
          </span>
          <StatusDot status={main.status} />
          <span style={{ fontWeight: 500, color: "var(--text)" }}>{main.title}</span>
          {main.id === currentSignal.id && (
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>(this signal)</span>
          )}
          {linkedWips.length > 0 && (
            <>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>·</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
                background: "var(--bg-sunken)", color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}>
                {linkedWips.length === 1 ? `1 linked ${linkedWips[0].type}` : `${linkedWips.length} linked work items`}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── ExistingWorkCallout ───────────────────────────────────────────────────
// Shown on a possible-duplicate suggestion when at least one group member
// already has linked WIP. Surfaces context BEFORE the user accepts so they
// can pick the right path (link as duplicate vs keep separate vs follow-up).

function ExistingWorkCallout({ wips }: { wips: Wip[] }) {
  // Pick the most "active" wip to summarise: in_progress > to_do > done > backlog.
  const ranked = wips.slice().sort((a, b) => weightOfColumn(a.column) - weightOfColumn(b.column));
  const w = ranked[0];
  const tone = toneForWipColumn(w.column);
  const phrase =
    w.column === "in_progress" ? "Existing work in progress" :
    w.column === "to_do"       ? "Existing planned work" :
    w.column === "done"        ? "Possible duplicate of completed work" :
    /* backlog */                "Existing work in backlog";

  return (
    <div style={{
      margin: "0 0 10px",
      padding: "8px 10px",
      borderRadius: "var(--radius)",
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      fontSize: 11.5, color: tone.fg, lineHeight: 1.45,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {phrase}
      </span>
      <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
        {w.type === "task" ? "Task" : "Intent"}: {w.title}
      </span>
      {wips.length > 1 && (
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
          (+{wips.length - 1} more)
        </span>
      )}
    </div>
  );
}

function weightOfColumn(c: Wip["column"]): number {
  if (c === "in_progress") return 0;
  if (c === "to_do")       return 1;
  if (c === "done")        return 2;
  return 3;
}

function toneForWipColumn(c: Wip["column"]) {
  if (c === "in_progress") return { fg: "#b45309", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.40)" };
  if (c === "to_do")       return { fg: "var(--accent)", bg: "var(--accent-soft)", border: "rgba(59,130,246,0.30)" };
  if (c === "done")        return { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  return { fg: "var(--text-secondary)", bg: "var(--bg-sunken)", border: "var(--border)" };
}

// ── SiblingList ───────────────────────────────────────────────────────────
// Renders the group members. The first PREVIEW_COUNT show by default;
// "View all" expands. Always pins the current signal's row at the bottom
// (with a "This signal" tag) so it's easy to find regardless of order.

function SiblingList({
  group, currentSignal, readOnly, onOpen, onRemove, onSetMain,
}: {
  group: DuplicateGroup;
  currentSignal: Signal;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onSetMain: (id: string) => void;
}) {
  const { signals } = useStore();
  const [showAll, setShowAll] = useState(false);

  const siblings = group.signalIds
    .filter(id => id !== currentSignal.id)
    .map(id => signals.find(s => s.id === id))
    .filter((s): s is Signal => !!s);

  const visible = showAll ? siblings : siblings.slice(0, PREVIEW_COUNT);
  const hiddenCount = siblings.length - visible.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {visible.map(s => (
        <SiblingRow
          key={s.id}
          sibling={s}
          confirmed={group.confirmed}
          isMain={s.id === group.mainSignalId || (!group.mainSignalId && s.id === oldestId(group, signals))}
          readOnly={readOnly}
          onOpen={() => onOpen(s.id)}
          onRemove={() => onRemove(s.id)}
          onSetMain={() => onSetMain(s.id)}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            alignSelf: "flex-start",
            margin: "2px 0 4px",
            padding: "4px 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            fontSize: "var(--fs-meta)", color: "var(--text-secondary)", fontWeight: 500,
            cursor: "pointer",
          }}
        >
          View all duplicates ({siblings.length})
        </button>
      )}
      {showAll && siblings.length > PREVIEW_COUNT && (
        <button
          onClick={() => setShowAll(false)}
          style={{
            alignSelf: "flex-start",
            margin: "2px 0 4px",
            padding: "4px 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            fontSize: "var(--fs-meta)", color: "var(--text-secondary)", fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Show fewer
        </button>
      )}
      <CurrentSignalRow
        group={group}
        signal={currentSignal}
        readOnly={readOnly}
        onRemove={() => onRemove(currentSignal.id)}
      />
    </div>
  );
}

function oldestId(group: DuplicateGroup, signals: Signal[]): string | undefined {
  const members = group.signalIds
    .map(id => signals.find(s => s.id === id))
    .filter((s): s is Signal => !!s);
  if (members.length === 0) return undefined;
  members.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return members[0]?.id;
}

function SiblingRow({
  sibling, confirmed, isMain, readOnly, onOpen, onRemove, onSetMain,
}: {
  sibling: Signal;
  confirmed: boolean;
  isMain: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onSetMain: () => void;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <StatusDot status={sibling.status} />
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize", minWidth: 60 }}>
        {sibling.source}
      </span>
      <button
        onClick={onOpen}
        style={{
          flex: 1, minWidth: 0, textAlign: "left",
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          color: "var(--text)", fontSize: "var(--fs-body)", fontWeight: 500,
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sibling.title}
        </div>
        {sibling.description && (
          <div style={{
            fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, fontWeight: 400,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {sibling.description}
          </div>
        )}
      </button>
      {isMain && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
          textTransform: "uppercase",
          padding: "1px 5px", borderRadius: 100,
          background: "var(--bg-sunken)", color: "var(--text-secondary)",
          border: "1px solid var(--border)",
        }}>
          Main
        </span>
      )}
      {sibling.labels.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {sibling.labels.slice(0, 2).map(l => <LabelChip key={l} label={l} />)}
        </div>
      )}
      {!readOnly && confirmed && !isMain && (
        <button
          onClick={onSetMain}
          title="Make this the main signal of the group"
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 6px", borderRadius: "var(--radius-sm)",
            background: "transparent", border: "1px solid var(--border)",
            cursor: "pointer", fontSize: 10, color: "var(--text-secondary)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          Set main
        </button>
      )}
      {!readOnly && (
        <button
          onClick={onRemove}
          title={confirmed ? "Remove from duplicate group" : "Remove from suggestion"}
          aria-label="Remove from group"
          style={{
            display: "inline-flex", alignItems: "center",
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
  );
}

function CurrentSignalRow({
  group, signal, readOnly, onRemove,
}: {
  group: DuplicateGroup;
  signal: Signal;
  readOnly: boolean;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 10px",
      borderRadius: "var(--radius)",
      border: "1px solid var(--border)",
      background: "var(--bg-sunken)",
    }}>
      <StatusDot status={signal.status} />
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize", minWidth: 60 }}>
        {signal.source}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: "var(--fs-body)", color: "var(--text)", fontWeight: 500,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {signal.title}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
        textTransform: "uppercase", color: "var(--text-tertiary)",
      }}>
        This signal
      </span>
      {!readOnly && (
        <button
          onClick={onRemove}
          title={group.confirmed ? "Remove this signal from the duplicate group (also drops inherited WIP links)" : "Remove this signal from the suggestion"}
          aria-label="Remove this signal"
          style={{
            display: "inline-flex", alignItems: "center",
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
  );
}

// ── AddSignalToGroupPicker ────────────────────────────────────────────────
// Visible only on confirmed groups. Search-and-pick popover that only
// shows signals not already in some other duplicate group.

function AddSignalToGroupPicker({ group }: { group: DuplicateGroup }) {
  const { signals, duplicateGroups, addSignalToDuplicateGroup } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const eligible = useMemo(() => {
    const inSomeGroup = new Set<string>();
    for (const g of duplicateGroups) for (const id of g.signalIds) inSomeGroup.add(id);
    const lower = q.trim().toLowerCase();
    return signals
      .filter(s => !inSomeGroup.has(s.id))
      .filter(s => !lower || s.title.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower))
      .slice(0, 12);
  }, [signals, duplicateGroups, q]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={ghostBtn()}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        title="Add another signal to this duplicate group"
      >
        <Plus size={11} /> Add duplicate
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 800,
          width: 320, background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
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
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {eligible.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
                No matching signals available.
              </div>
            ) : eligible.map(s => (
              <button
                key={s.id}
                onClick={() => { addSignalToDuplicateGroup(group.id, s.id); setOpen(false); setQ(""); }}
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

// ── ChangeMainSignalPicker ────────────────────────────────────────────────
// Compact inline picker — only shows when there are 2+ members AND we're
// in a confirmed group. Lists members; the current main is dimmed and not
// selectable. Selection routes through `setMainSignal`.

function ChangeMainSignalPicker({
  group, currentMainId, onSetMain,
}: {
  group: DuplicateGroup;
  currentMainId: string | undefined;
  onSetMain: (id: string) => void;
}) {
  const { signals } = useStore();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const members = group.signalIds
    .map(id => signals.find(s => s.id === id))
    .filter((s): s is Signal => !!s);

  if (members.length < 2) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={ghostBtn()}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        title="Change which signal represents the group"
      >
        Change main <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 800,
          width: 280, background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Pick a new main signal
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {members.map(s => {
              const isCurrent = s.id === currentMainId;
              return (
                <button
                  key={s.id}
                  onClick={() => { if (!isCurrent) { onSetMain(s.id); setOpen(false); } }}
                  disabled={isCurrent}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "6px 10px", textAlign: "left",
                    background: isCurrent ? "var(--bg-sunken)" : "transparent",
                    border: "none",
                    cursor: isCurrent ? "default" : "pointer",
                    opacity: isCurrent ? 0.6 : 1,
                    fontSize: "var(--fs-body)", color: "var(--text)",
                  }}
                  onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                >
                  <StatusDot status={s.status} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title}
                  </span>
                  {isCurrent && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Main</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── shared button styles ──────────────────────────────────────────────────

function ghostBtn(): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 9px", borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 11, fontWeight: 500, cursor: "pointer",
  };
}

function primaryBtn(fg: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 10px", borderRadius: "var(--radius)",
    border: `1px solid ${fg}`,
    background: fg,
    color: "white",
    fontSize: 11, fontWeight: 500, cursor: "pointer",
  };
}

function paletteFor(group: DuplicateGroup) {
  return group.confirmed
    ? { fg: "#0f766e", bg: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.40)" }
    : { fg: "#b45309", bg: "rgba(245,158,11,0.05)", border: "rgba(245,158,11,0.45)" };
}
