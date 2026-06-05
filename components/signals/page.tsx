"use client";
import React, { useMemo, useRef, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { WorkItemFilter, DuplicateFilter, AttributeFilter } from "@/lib/store";
import {
  Signal, SignalStatus, SignalPriority, HideUnderRule,
  USERS, hideUnderKey, findHideUnderRule,
  recentlyUsedLabels, frequentlyUsedLabels,
  suggestLabelsForSignal,
  SPLIT_MAX_PER_SOURCE, splitChildrenCount,
  duplicateStateOf, isDuplicateGroupNewOrChanged, mainSignalOf,
  isSignalStale, signalDaysStale, STALE_THRESHOLD_DAYS, STALE_WARN_DAYS_OVER_THRESHOLD,
  signalLastActivityAt, signalLastActivityLabel,
  SKIP_DURATIONS, isSkipReturningSoon,
} from "@/lib/data";
import { relTime, absDate } from "@/lib/time";
import { StatusDot } from "@/components/ui/dot";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelChip } from "@/components/ui/label-chip";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Layers, Grid, List, Paperclip, Tag, Task, Intent, X, Check, Feedback, Note as NoteIcon, Image, ChevronDown, Copy } from "@/components/ui/icons";
import { HiddenCountBadge, HiddenMatchBadge, TaskCreatedBadge, IntentCreatedBadge, ClosedBadge, DuplicateBadge, StaleBadge } from "@/components/ui/related-badge";
import { SignalModal } from "@/components/signal-modal";
import { LabelPicker } from "@/components/ui/label-picker";
import { GroupReviewModal } from "@/components/group-review";
import { ClientReportModal } from "@/components/client-report";
import { PostCreatePromptBanner } from "@/components/post-create-prompt";

// ── Helpers ────────────────────────────────────────────────────────────────

function SourceIcon({ source }: { source: "feedback" | "note" }) {
  if (source === "feedback") return <Feedback size={11} style={{ color: "var(--text-tertiary)" }} />;
  return <NoteIcon size={11} style={{ color: "var(--text-tertiary)" }} />;
}

const PRIORITY_META: Record<SignalPriority, { label: string; color: string; bg: string; border: string }> = {
  low:    { label: "Low",    color: "#6b7280", bg: "#f9fafb",  border: "#e5e7eb" },
  medium: { label: "Medium", color: "#d97706", bg: "#fffbeb",  border: "#fcd34d" },
  high:   { label: "High",   color: "#dc2626", bg: "#fef2f2",  border: "#fca5a5" },
  urgent: { label: "Urgent", color: "#ffffff", bg: "#dc2626",  border: "#dc2626" },
};

function PriorityBadge({ priority }: { priority: SignalPriority }) {
  const m = PRIORITY_META[priority];
  if (priority === "low") return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 10, fontWeight: 600, lineHeight: 1,
      padding: "2px 5px", borderRadius: 100,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
      letterSpacing: "0.02em",
    }}>
      {m.label}
    </span>
  );
}

// ── Shared popover hook ────────────────────────────────────────────────────

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return { open, setOpen, ref };
}

// ── FilterGroup: visual grouping wrapper ──────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, color: "var(--text-disabled)",
        textTransform: "uppercase", letterSpacing: "0.06em", userSelect: "none",
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ── StatusFilter: multi-select dropdown ───────────────────────────────────

const STATUS_OPTIONS: { value: SignalStatus; label: string }[] = [
  { value: "new",      label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "ready",    label: "Ready" },
  { value: "skipped",  label: "Skipped" },
  { value: "rejected", label: "Rejected" },
  { value: "closed",   label: "Closed" },
];

function StatusFilter({
  value,
  onChange,
  onClear,
}: {
  value: SignalStatus[];
  onChange: (v: SignalStatus) => void;
  onClear: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = value.length > 0;
  const label = active
    ? value.length === 1 ? value[0] : `${value.length} statuses`
    : "Status";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={filterBtnStyle(active)}
      >
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={dropdownStyle(140)}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={dropdownItemStyle(value.includes(opt.value))}
              onMouseEnter={e => { if (!value.includes(opt.value)) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!value.includes(opt.value)) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {value.includes(opt.value) && <Check size={11} style={{ color: "var(--accent)" }} />}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <StatusDot status={opt.value} />
                {opt.label}
              </span>
            </button>
          ))}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PriorityFilter: multi-select dropdown ────────────────────────────────

const PRIORITY_OPTIONS: { value: SignalPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
];

function PriorityFilter({
  value,
  onChange,
  onClear,
}: {
  value: SignalPriority[];
  onChange: (v: SignalPriority) => void;
  onClear: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = value.length > 0;
  const label = active
    ? value.length === 1 ? PRIORITY_META[value[0]].label : `${value.length} priorities`
    : "Priority";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={filterBtnStyle(active)}
      >
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={dropdownStyle(150)}>
          {PRIORITY_OPTIONS.map(opt => {
            const sel = value.includes(opt.value);
            const m = PRIORITY_META[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                style={dropdownItemStyle(sel)}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={11} style={{ color: "var(--accent)" }} />}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: opt.value === "urgent" ? m.bg : m.color,
                    border: opt.value === "urgent" ? `1px solid ${m.border}` : "none",
                    flexShrink: 0,
                  }} />
                  {opt.label}
                </span>
              </button>
            );
          })}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WorkFilterButton: multi-select (task / intent) ────────────────────────

const WORK_OPTIONS: { value: WorkItemFilter; label: string; color: string; bg: string; border: string }[] = [
  { value: "task_created",   label: "Task created",   color: "var(--task)",   bg: "rgba(124,58,237,0.06)",  border: "rgba(124,58,237,0.2)" },
  { value: "intent_created", label: "Intent created", color: "var(--intent)", bg: "rgba(14,165,233,0.06)",  border: "rgba(14,165,233,0.2)" },
];

function WorkFilterButton({
  value,
  onChange,
  onClear,
}: {
  value: WorkItemFilter[];
  onChange: (v: WorkItemFilter) => void;
  onClear: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = value.length > 0;
  const label = active
    ? value.length === 1 ? WORK_OPTIONS.find(o => o.value === value[0])?.label ?? "Work" : "2 work filters"
    : "Work items";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={filterBtnStyle(active)}
      >
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={dropdownStyle(180)}>
          {WORK_OPTIONS.map(opt => {
            const sel = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                style={{
                  ...dropdownItemStyle(sel),
                  ...(sel ? { background: opt.bg } : {}),
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = sel ? opt.bg : "transparent"; }}
              >
                <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={11} style={{ color: opt.color }} />}
                </span>
                <span style={{ color: sel ? opt.color : "var(--text)", fontWeight: sel ? 500 : 400 }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DUP_OPTIONS: { value: DuplicateFilter; label: string; color: string; bg: string }[] = [
  { value: "possible",      label: "Possible duplicates",        color: "#b45309", bg: "rgba(245,158,11,0.10)" },
  { value: "confirmed",     label: "Confirmed duplicates",       color: "#0f766e", bg: "rgba(20,184,166,0.10)" },
  { value: "new",           label: "New / unreviewed",           color: "#b91c1c", bg: "rgba(220,38,38,0.08)" },
  { value: "with_wip",      label: "With linked WIP",            color: "var(--accent)", bg: "var(--accent-soft)" },
  { value: "with_done_wip", label: "Linked to completed WIP",    color: "#15803d", bg: "#f0fdf4" },
  { value: "none",          label: "No duplicates",              color: "var(--text-secondary)", bg: "var(--bg-sunken)" },
];

function DuplicateFilterButton({
  value, onChange, onClear,
}: {
  value: DuplicateFilter[];
  onChange: (v: DuplicateFilter) => void;
  onClear: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = value.length > 0;
  const label = active
    ? value.length === 1 ? DUP_OPTIONS.find(o => o.value === value[0])?.label ?? "Duplicates" : `${value.length} duplicate filters`
    : "Duplicates";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={filterBtnStyle(active)}
      >
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={dropdownStyle(220)}>
          {DUP_OPTIONS.map(opt => {
            const sel = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                style={{
                  ...dropdownItemStyle(sel),
                  ...(sel ? { background: opt.bg } : {}),
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = sel ? opt.bg : "transparent"; }}
              >
                <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={11} style={{ color: opt.color }} />}
                </span>
                <span style={{ color: sel ? opt.color : "var(--text)", fontWeight: sel ? 500 : 400 }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ATTR_OPTIONS: { value: AttributeFilter; label: string; color: string; bg: string }[] = [
  { value: "stale",            label: "Stale",            color: "#b45309", bg: "rgba(245,158,11,0.10)" },
  { value: "has_attachments",  label: "Has attachments",  color: "var(--text-secondary)", bg: "var(--bg-sunken)" },
  { value: "has_linked_work",  label: "Has linked work",  color: "var(--accent)", bg: "var(--accent-soft)" },
  { value: "returning_soon",   label: "Returning soon",   color: "#7c3aed", bg: "rgba(124,58,237,0.10)" },
];

function AttributeFilterButton({
  value, onChange, onClear,
}: {
  value: AttributeFilter[];
  onChange: (v: AttributeFilter) => void;
  onClear: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = value.length > 0;
  const label = active
    ? value.length === 1 ? ATTR_OPTIONS.find(o => o.value === value[0])?.label ?? "Attributes" : `${value.length} attributes`
    : "Attributes";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={filterBtnStyle(active)}>
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={dropdownStyle(200)}>
          {ATTR_OPTIONS.map(opt => {
            const sel = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                style={{
                  ...dropdownItemStyle(sel),
                  ...(sel ? { background: opt.bg } : {}),
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = sel ? opt.bg : "transparent"; }}
              >
                <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={11} style={{ color: opt.color }} />}
                </span>
                <span style={{ color: sel ? opt.color : "var(--text)", fontWeight: sel ? 500 : 400 }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic multi-select FilterPopover ────────────────────────────────────

function MetaFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  activeLabel,
  width = 180,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  activeLabel?: string;
  width?: number;
}) {
  const { open, setOpen, ref } = usePopover();
  const active = selected.length > 0;
  const displayLabel = active ? (activeLabel ?? label) : label;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={filterBtnStyle(active)}>
        {displayLabel}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={{ ...dropdownStyle(width), right: 0, left: "auto" }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              style={dropdownItemStyle(selected.includes(opt.value))}
              onMouseEnter={e => { if (!selected.includes(opt.value)) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!selected.includes(opt.value)) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected.includes(opt.value) && <Check size={11} style={{ color: "var(--accent)" }} />}
              </span>
              {opt.label}
            </button>
          ))}
          {active && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "4px 6px" }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LabelFilterButton: multi-select filter with inline "create" ──────────
//
// Wraps `LabelPicker` (which already supports type-to-create) inside a
// filter-chip trigger so users can spin up brand-new labels right from the
// toolbar. Newly created labels are added to the active filter immediately;
// once the user attaches them to a signal, they persist in the dropdown.

function LabelFilterButton({
  allLabels,
  selected,
  onToggle,
  onClear,
  recentLabels,
}: {
  allLabels: string[];
  selected: string[];
  onToggle: (label: string) => void;
  onClear: () => void;
  recentLabels?: string[];
}) {
  const { open, setOpen, ref } = usePopover();
  const active = selected.length > 0;
  const label = active
    ? selected.length === 1 ? `#${selected[0]}` : `${selected.length} labels`
    : "Labels";

  // Merge canonical labels with currently-selected ones so a freshly-created
  // label still appears as a check item even if no signal carries it yet.
  const merged = Array.from(new Set([...allLabels, ...selected]));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={filterBtnStyle(active)}>
        {label}
        {active
          ? <span onClick={e => { e.stopPropagation(); onClear(); }} style={{ display: "flex" }}><X size={10} /></span>
          : <ChevronDown size={10} />
        }
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200 }}>
          <LabelPicker
            allLabels={merged}
            activeLabels={selected}
            onToggle={onToggle}
            onClose={() => setOpen(false)}
            width={240}
            recentLabels={recentLabels}
          />
          {active && (
            <div style={{
              marginTop: 4, background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
              padding: "4px 6px",
            }}>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={clearBtnStyle}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} /> Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared style helpers ───────────────────────────────────────────────────

function filterBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 8px", height: 28,
    borderRadius: "var(--radius)",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    fontSize: "var(--fs-meta)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    fontWeight: active ? 500 : 400,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

function dropdownStyle(width: number): React.CSSProperties {
  return {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    zIndex: 200,
    width,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
  };
}

function dropdownItemStyle(selected: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    width: "100%", padding: "6px 10px",
    textAlign: "left", cursor: "pointer",
    fontSize: "var(--fs-body)",
    color: selected ? "var(--accent)" : "var(--text)",
    background: selected ? "var(--bg-selected)" : "transparent",
    border: "none",
    fontWeight: selected ? 500 : 400,
  };
}

const clearBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  width: "100%", padding: "4px 6px",
  fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
  borderRadius: "var(--radius-sm)", background: "transparent", border: "none",
  cursor: "pointer",
};

// ── Signal cards ───────────────────────────────────────────────────────────

function SignalMiniCard({ signal, isMain, hiddenCount, matchInHidden }: {
  signal: Signal;
  isMain?: boolean;
  hiddenCount?: number;
  matchInHidden?: boolean;
}) {
  const { selection, toggleSelect, openSignal, wipItems, appMode, signalAttachments, duplicateGroups, updateSignal } = useStore();
  const readOnly = appMode === "client";
  const checked = selection.includes(signal.id);
  const visibleLabels = signal.labels.slice(0, 2);
  const extra = signal.labels.length - 2;

  const hasTask   = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "task");
  const hasIntent = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "intent");
  const attCount = signalAttachments.filter(a => a.signalId === signal.id).length;
  // Duplicate state — drives the "Possible duplicate" / "Duplicate ×N" badge.
  const dupState = duplicateStateOf(duplicateGroups, signal.id);

  const priorityAccent = signal.priority === "urgent" ? "#dc2626" : signal.priority === "high" ? "#ef4444" : undefined;
  const showStack = !!(isMain && hiddenCount && hiddenCount > 0);
  // Stale state — informational, drives a small "stale Nd" pill. Closed /
  // rejected signals never go stale; the helper guards that.
  const staleDays = isSignalStale(signal) ? Math.floor(signalDaysStale(signal)) : 0;
  const staleEscalated = staleDays > STALE_THRESHOLD_DAYS + STALE_WARN_DAYS_OVER_THRESHOLD;
  const dupStackCount =
    dupState.kind === "confirmed" ? Math.min(2, dupState.group.signalIds.length - 1) : 0;
  const dupStackShadow =
    dupStackCount >= 2 ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border), 4px 4px 0 0 var(--bg-sunken), 4px 4px 0 1px var(--border)` :
    dupStackCount >= 1 ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border)` :
    null;

  return (
    <div
      onClick={() => openSignal(signal.id)}
      data-keep-selection="card"
      style={{
        padding: "8px 10px",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        background: checked ? "var(--bg-selected)" : "var(--bg)",
        border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: checked ? undefined : priorityAccent ? `3px solid ${priorityAccent}` : "1px solid var(--border)",
        marginBottom: showStack || dupStackCount > 0 ? 8 : 4,
        boxShadow: showStack
          ? (hiddenCount as number) >= 2
            ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border), 4px 4px 0 0 var(--bg-sunken), 4px 4px 0 1px var(--border)`
            : `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border)`
          : dupStackShadow ?? "var(--shadow-sm)",
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.background = "var(--bg)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        {!readOnly && (
          <span style={{ opacity: checked ? 1 : 0.25, transition: "opacity 0.15s" }} className="cb-wrap">
            <Checkbox checked={checked} onChange={() => toggleSelect(signal.id)} />
          </span>
        )}
        {/* Signal identity — explicit "Signal" + source so cards never get
            confused with task/intent cards in scans. */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "1px 6px", borderRadius: "var(--radius-sm)",
          background: "var(--bg-sunken)", border: "1px solid var(--border)",
          fontSize: 10, fontWeight: 600, color: "var(--text-secondary)",
          letterSpacing: 0.2,
        }}>
          <SourceIcon source={signal.source} />
          Signal
        </span>
        {!readOnly ? (
          <QuickStatusMenu signal={signal} />
        ) : (
          <>
            <StatusDot status={signal.status} />
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
              {signal.source}
            </span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <LastChangedHint signal={signal} />
      </div>
      <div style={{
        fontSize: 12.5, fontWeight: 500, color: "var(--text)", lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        marginBottom: 3,
      }}>
        {signal.title}
      </div>
      <div style={{
        fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        marginBottom: 6,
      }}>
        {signal.description}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <PriorityBadge priority={signal.priority} />
        {visibleLabels.map(l => (
          <LabelChip
            key={l}
            label={l}
            onRemove={readOnly ? undefined : () => updateSignal(signal.id, { labels: signal.labels.filter(x => x !== l) })}
          />
        ))}
        {extra > 0 && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{extra}</span>}
        {!readOnly && <QuickLabelButton signal={signal} />}
        {!readOnly && <CloneSignalButton signal={signal} />}
        {attCount > 0 && (
          <span
            title={`${attCount} attachment${attCount === 1 ? "" : "s"}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: "var(--text-tertiary)" }}
          >
            <Paperclip size={11} />{attCount}
          </span>
        )}
        {showStack && <HiddenCountBadge count={hiddenCount as number} />}
        {hasTask   && <TaskCreatedBadge />}
        {hasIntent && <IntentCreatedBadge />}
        {dupState.kind === "possible"  && <DuplicateBadge state="possible"  count={dupState.group.signalIds.length} isNew={isDuplicateGroupNewOrChanged(dupState.group)} />}
        {dupState.kind === "confirmed" && <DuplicateBadge state="confirmed" count={dupState.group.signalIds.length} />}
        {staleDays > 0 && <StaleBadge daysStale={staleDays} status={signal.status} escalated={staleEscalated} />}
        {signal.status === "closed" && <ClosedBadge />}
        {matchInHidden && <HiddenMatchBadge />}
        <span style={{ flex: 1 }} />
        <Avatar userId={signal.author} size="sm" />
      </div>
    </div>
  );
}

// ── QuickLabelButton ──────────────────────────────────────────────────────
// Hover-revealed "+ label" affordance that opens the same LabelPicker used
// in the signal modal — no modal open required for fast triage. Stops
// click propagation so the picker doesn't trigger the card's openSignal.

function QuickLabelButton({ signal }: { signal: Signal }) {
  const { signals, updateSignal } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allLabels = useMemo(() => Array.from(new Set(signals.flatMap(s => s.labels))), [signals]);
  const suggestions = useMemo(
    () => suggestLabelsForSignal(signal, signals).filter(l => !signal.labels.includes(l)).slice(0, 4),
    [signal, signals],
  );
  const recent = useMemo(() => recentlyUsedLabels(signals), [signals]);

  const toggleLabel = (label: string) => {
    const next = signal.labels.includes(label)
      ? signal.labels.filter(l => l !== label)
      : [...signal.labels, label];
    updateSignal(signal.id, { labels: next });
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Add label"
        className="quick-label-btn"
        style={{
          fontSize: 10.5, padding: "1px 6px", borderRadius: 100,
          border: "1px dashed var(--border-strong)",
          background: "transparent", color: "var(--text-tertiary)",
          cursor: "pointer", lineHeight: 1.35,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
      >
        + label
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200 }}>
          <LabelPicker
            allLabels={allLabels}
            activeLabels={signal.labels}
            onToggle={toggleLabel}
            onClose={() => setOpen(false)}
            suggestions={suggestions}
            recentLabels={recent}
            width={240}
          />
        </div>
      )}
    </div>
  );
}

// ── CloneSignalButton ─────────────────────────────────────────────────────
// Hover-revealed icon next to the per-card affordances. Click → clone the
// signal; the duplicate lands right next to the original (newest-first
// ordering) so the user can see them side-by-side and edit each piece.

// ── QuickStatusMenu ───────────────────────────────────────────────────────
// Compact popover for fast status changes from the signal card without
// opening the full modal. Renders a colored "status pill" trigger; the
// popover lists every status with the current one marked. Stops click
// propagation so picking a status doesn't open the card modal.

const STATUS_OPTIONS_QM: { value: SignalStatus; label: string }[] = [
  { value: "new",      label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "ready",    label: "Ready" },
  { value: "skipped",  label: "Skipped" },
  { value: "rejected", label: "Rejected" },
  { value: "closed",   label: "Closed" },
];

function QuickStatusMenu({ signal }: { signal: Signal }) {
  const { updateSignal } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Change status"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "1px 7px", borderRadius: 100,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text-secondary)",
          fontSize: 10.5, fontWeight: 500, textTransform: "capitalize",
          cursor: "pointer", lineHeight: 1.4,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
      >
        <StatusDot status={signal.status} />
        {signal.status} <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 700,
          width: 160, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {STATUS_OPTIONS_QM.map(opt => {
            const active = opt.value === signal.status;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  if (!active) updateSignal(signal.id, { status: opt.value });
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", textAlign: "left",
                  background: active ? "var(--bg-sunken)" : "transparent",
                  border: "none", cursor: active ? "default" : "pointer",
                  fontSize: "var(--fs-body)", color: "var(--text)",
                  fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <StatusDot status={opt.value} />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && <Check size={10} style={{ color: "var(--text-secondary)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── LastChangedHint ───────────────────────────────────────────────────────
// Tiny "Accepted 2m ago" / "Last changed 3d ago" footnote shown on cards.
// Uses the latest transaction touching the signal when available so the
// label reads like a real activity verb; otherwise falls back to the
// signal's status-derived verb + relative time.

function LastChangedHint({ signal }: { signal: Signal }) {
  const { transactions } = useStore();
  const { verb, at } = signalLastActivityLabel(signal, transactions);
  return (
    <span
      title={`${verb} · ${absDate(at)}`}
      style={{
        fontSize: "var(--fs-meta)", color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      {verb} · {relTime(at)}
    </span>
  );
}

function CloneSignalButton({ signal }: { signal: Signal }) {
  const { cloneSignal, signals } = useStore();
  // Cap on splits per source. We count against the original root so a
  // chain of clones doesn't escape the limit by chaining through the
  // most recent copy.
  const rootId = signal.splitFromId ?? signal.id;
  const childCount = splitChildrenCount(signals, rootId);
  const reached = childCount >= SPLIT_MAX_PER_SOURCE;
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        if (reached) return;
        cloneSignal(signal.id);
      }}
      disabled={reached}
      title={reached
        ? `Split limit reached. You can create up to ${SPLIT_MAX_PER_SOURCE} split signals.`
        : "Split / clone this signal"}
      aria-label="Clone signal"
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 6px", borderRadius: 100,
        border: "1px dashed var(--border-strong)",
        background: "transparent",
        color: reached ? "var(--text-disabled)" : "var(--text-tertiary)",
        cursor: reached ? "not-allowed" : "pointer",
        opacity: reached ? 0.55 : 1,
        fontSize: 10.5, lineHeight: 1.35,
      }}
      onMouseEnter={e => {
        if (reached) return;
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={e => {
        if (reached) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      <Copy size={10} /> Split
    </button>
  );
}

function SignalCard({ signal, isMain, hiddenCount, matchInHidden }: {
  signal: Signal;
  isMain?: boolean;
  hiddenCount?: number;
  matchInHidden?: boolean;
}) {
  const { selection, toggleSelect, openSignal, wipItems, appMode, signalAttachments, duplicateGroups, updateSignal } = useStore();
  const readOnly = appMode === "client";
  const checked = selection.includes(signal.id);
  const visibleLabels = signal.labels.slice(0, 3);
  const extra = signal.labels.length - 3;

  const hasTask   = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "task");
  const hasIntent = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "intent");
  const attCount = signalAttachments.filter(a => a.signalId === signal.id).length;
  const dupState = duplicateStateOf(duplicateGroups, signal.id);

  const priorityAccent = signal.priority === "urgent" ? "#dc2626" : signal.priority === "high" ? "#ef4444" : undefined;
  const showStack = !!(isMain && hiddenCount && hiddenCount > 0);
  const staleDays = isSignalStale(signal) ? Math.floor(signalDaysStale(signal)) : 0;
  const staleEscalated = staleDays > STALE_THRESHOLD_DAYS + STALE_WARN_DAYS_OVER_THRESHOLD;
  // Stacked-card visual for confirmed-duplicate-group mains: looks like
  // two/three cards behind so the user reads the card as a group at a
  // glance. Builds on the same shadow trick as hide-under stacks.
  const dupStackCount =
    dupState.kind === "confirmed" ? Math.min(2, dupState.group.signalIds.length - 1) : 0;
  const dupStackShadow =
    dupStackCount >= 2 ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border), 4px 4px 0 0 var(--bg-sunken), 4px 4px 0 1px var(--border)` :
    dupStackCount >= 1 ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border)` :
    null;

  return (
    <div
      onClick={() => openSignal(signal.id)}
      data-keep-selection="card"
      style={{
        padding: "var(--card-pad)",
        borderRadius: "var(--radius-lg)",
        border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: checked ? undefined : priorityAccent ? `3px solid ${priorityAccent}` : "1px solid var(--border)",
        background: checked ? "var(--bg-selected)" : "var(--bg)",
        boxShadow: showStack
          ? (hiddenCount as number) >= 2
            ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border), 4px 4px 0 0 var(--bg-sunken), 4px 4px 0 1px var(--border)`
            : `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border)`
          : dupStackShadow ?? "var(--shadow-sm)",
        cursor: "pointer",
        display: "flex", flexDirection: "column",
        gap: "var(--card-gap)",
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.background = checked ? "var(--bg-selected)" : "var(--bg)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {!readOnly && <Checkbox checked={checked} onChange={() => toggleSelect(signal.id)} />}
        {/* Explicit "Signal" identity chip — mirrors the TypeChip used on
            task/intent cards so the two card families read distinctly. */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 7px", borderRadius: "var(--radius-sm)",
          background: "var(--bg-sunken)", border: "1px solid var(--border)",
          fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
        }}>
          <SourceIcon source={signal.source} />
          Signal
        </span>
        {!readOnly ? (
          <QuickStatusMenu signal={signal} />
        ) : (
          <>
            <StatusDot status={signal.status} />
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)", textTransform: "capitalize" }}>{signal.source}</span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <LastChangedHint signal={signal} />
      </div>
      <div style={{
        fontSize: "var(--fs-title)", fontWeight: 500, color: "var(--text)", lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {signal.title}
      </div>
      <div style={{
        fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        flex: 1,
      }}>
        {signal.description}
      </div>
      {(signal.priority !== "low" || showStack || hasTask || hasIntent || signal.status === "closed" || matchInHidden || dupState.kind !== "none" || staleDays > 0) && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <PriorityBadge priority={signal.priority} />
          {showStack && <HiddenCountBadge count={hiddenCount as number} />}
          {hasTask   && <TaskCreatedBadge />}
          {hasIntent && <IntentCreatedBadge />}
          {dupState.kind === "possible"  && <DuplicateBadge state="possible"  count={dupState.group.signalIds.length} isNew={isDuplicateGroupNewOrChanged(dupState.group)} />}
          {dupState.kind === "confirmed" && <DuplicateBadge state="confirmed" count={dupState.group.signalIds.length} />}
          {staleDays > 0 && <StaleBadge daysStale={staleDays} status={signal.status} escalated={staleEscalated} />}
          {signal.status === "closed" && <ClosedBadge />}
          {matchInHidden && <HiddenMatchBadge />}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {visibleLabels.map(l => (
          <LabelChip
            key={l}
            label={l}
            onRemove={readOnly ? undefined : () => updateSignal(signal.id, { labels: signal.labels.filter(x => x !== l) })}
          />
        ))}
        {extra > 0 && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+{extra}</span>}
        {!readOnly && <QuickLabelButton signal={signal} />}
        {!readOnly && <CloneSignalButton signal={signal} />}
        {attCount > 0 && (
          <span
            title={`${attCount} attachment${attCount === 1 ? "" : "s"}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: "var(--text-tertiary)", marginLeft: "auto" }}
          >
            <Paperclip size={11} />{attCount}
          </span>
        )}
        {signal.screenshots > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)", marginLeft: attCount > 0 ? 6 : "auto" }}>
            <Image size={11} />{signal.screenshots}
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          <Avatar userId={signal.author} size="sm" />
        </span>
      </div>
    </div>
  );
}

// ── Column + Grid views ────────────────────────────────────────────────────

interface ViewProps {
  signals: Signal[];
  activeRule: HideUnderRule | undefined;
  searchHiddenMatches: Set<string>;
}

function ColumnView({ signals, activeRule, searchHiddenMatches }: ViewProps) {
  const { groupBy, updateSignal, appMode, wipItems, openWip, setRoute, openSignal } = useStore();
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Client mode never drag-drops; status changes are team-only.
  const canDrop = appMode !== "client" && groupBy === "status";

  const columns = useMemo(() => {
    if (groupBy === "status") return [
      { key: "new",      label: "New",      items: signals.filter(s => s.status === "new") },
      { key: "accepted", label: "Accepted",  items: signals.filter(s => s.status === "accepted") },
      { key: "ready",    label: "Ready",     items: signals.filter(s => s.status === "ready") },
      { key: "rejected", label: "Rejected",  items: signals.filter(s => s.status === "rejected") },
      { key: "closed",   label: "Closed",    items: signals.filter(s => s.status === "closed") },
    ];
    if (groupBy === "source") return [
      { key: "feedback", label: "Feedback", items: signals.filter(s => s.source === "feedback") },
      { key: "note",     label: "Note",     items: signals.filter(s => s.source === "note") },
    ];
    if (groupBy === "author") {
      return USERS.map(u => ({
        key: u.id, label: u.name,
        items: signals.filter(s => s.author === u.id),
      })).filter(c => c.items.length > 0);
    }
    if (groupBy === "label") {
      const allLabels = Array.from(new Set(signals.flatMap(s => s.labels)));
      return [
        ...allLabels.map(l => ({ key: l, label: `#${l}`, items: signals.filter(s => s.labels.includes(l)) })),
        { key: "__none", label: "No label", items: signals.filter(s => s.labels.length === 0) },
      ].filter(c => c.items.length > 0);
    }
    if (groupBy === "created_date") {
      // One bucket per day, newest day first. Each signal lives in exactly
      // one bucket (its createdAt day).
      const buckets = new Map<string, Signal[]>();
      for (const s of signals) {
        const d = s.createdAt.slice(0, 10);
        const arr = buckets.get(d) ?? [];
        arr.push(s);
        buckets.set(d, arr);
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([d, items]) => ({ key: `cdate-${d}`, label: humaniseDate(d), items }));
    }
    if (groupBy === "updated_date") {
      // Bucket by statusUpdatedAt (or createdAt as fallback) so signals
      // without a status update still get a home.
      const buckets = new Map<string, Signal[]>();
      for (const s of signals) {
        const d = (s.statusUpdatedAt ?? s.createdAt).slice(0, 10);
        const arr = buckets.get(d) ?? [];
        arr.push(s);
        buckets.set(d, arr);
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([d, items]) => ({ key: `udate-${d}`, label: humaniseDate(d), items }));
    }
    if (groupBy === "closed_reason") {
      // Bucket signals by the wip / closure-reason that explains them.
      // For closed signals: use the wip the closure points at (task_done /
      // intent_done / reviewed) — that's the answer to "why is this
      // closed?". For non-closed signals: bucket by linkedWip[0] when one
      // exists ("Linked to: <wip>"), else "Unclassified". This view is
      // most useful when filtered to status=closed; it still works at
      // large scale because empty buckets are skipped.
      type Bucket = { key: string; label: string; items: Signal[]; wipId?: string };
      const buckets = new Map<string, Bucket>();
      const ensure = (key: string, label: string, wipId?: string) => {
        let b = buckets.get(key);
        if (!b) { b = { key, label, items: [], wipId }; buckets.set(key, b); }
        return b;
      };
      for (const s of signals) {
        if (s.status === "closed") {
          const c = s.closure;
          if (c && c.wipId && (c.reason === "task_done" || c.reason === "intent_done" || c.reason === "reviewed")) {
            const w = wipItems.find(x => x.id === c.wipId);
            const title = w ? `Closed by: ${w.title}` : "Closed by removed work item";
            ensure(`wip-${c.wipId}`, title, c.wipId).items.push(s);
            continue;
          }
          if (c?.reason === "manual") {
            ensure("manual", "Closed manually", undefined).items.push(s);
            continue;
          }
          ensure("other-closed", "Closed (other)", undefined).items.push(s);
          continue;
        }
        // Non-closed signals — bucket by their first linked wip when present.
        if (s.linkedWip.length > 0) {
          const wid = s.linkedWip[0];
          const w = wipItems.find(x => x.id === wid);
          const title = w ? `Linked to: ${w.title}` : "Linked work removed";
          ensure(`wip-${wid}`, title, wid).items.push(s);
        } else {
          ensure("unlinked", "No linked action", undefined).items.push(s);
        }
      }
      return Array.from(buckets.values())
        .sort((a, b) => b.items.length - a.items.length);
    }
    return [];
  }, [signals, groupBy, wipItems]);

  return (
    <div style={{ display: "flex", gap: 14, padding: "16px", height: "100%", overflowX: "auto", overflowY: "hidden", alignItems: "flex-start" }}>
      {columns.map(col => {
        const isOver = dragOverKey === col.key;
        return (
          <div
            key={col.key}
            onDragOver={e => { if (!canDrop) return; e.preventDefault(); setDragOverKey(col.key); }}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null);
            }}
            onDrop={e => {
              e.preventDefault();
              const sigId = e.dataTransfer.getData("signalId");
              if (sigId && canDrop) updateSignal(sigId, { status: col.key as SignalStatus });
              setDragOverKey(null);
              setDraggingId(null);
            }}
            style={{
              flex: 1, minWidth: 260,
              background: isOver ? "var(--bg-hover)" : "var(--bg)",
              border: isOver ? "1.5px dashed var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column",
              maxHeight: "100%", boxShadow: "var(--shadow-sm)",
              transition: "background 0.1s, border 0.1s",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
            }}>
              {groupBy === "status" && <StatusDot status={col.key as SignalStatus} />}
              {/* Closed-by-action grouping: column label is a link to the
                  source WIP when one exists, so the user can jump straight
                  from the closed cluster to the work that closed them. */}
              {groupBy === "closed_reason" && "wipId" in col && col.wipId ? (
                <button
                  onClick={() => { openSignal(null); setRoute("wip"); openWip(col.wipId as string); }}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--accent)",
                    cursor: "pointer", textAlign: "left",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    minWidth: 0, flex: 1,
                  }}
                  title="Open the linked work item"
                >
                  {col.label}
                </button>
              ) : (
                <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>{col.label}</span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                {col.items.length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {col.items.map(s => {
                const isMain = !!(activeRule && activeRule.mainSignalId === s.id);
                const hiddenCount = isMain ? activeRule!.hiddenSignalIds.length : 0;
                return (
                  <div
                    key={s.id}
                    draggable={canDrop}
                    onDragStart={e => {
                      e.dataTransfer.setData("signalId", s.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(s.id);
                    }}
                    onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                    style={{
                      opacity: draggingId === s.id ? 0.35 : 1,
                      cursor: canDrop ? "grab" : "pointer",
                      transition: "opacity 0.15s",
                    }}
                  >
                    <SignalMiniCard
                      signal={s}
                      isMain={isMain}
                      hiddenCount={hiddenCount}
                      matchInHidden={searchHiddenMatches.has(s.id)}
                    />
                  </div>
                );
              })}
              {col.items.length === 0 && (
                <div style={{
                  padding: "20px 12px", textAlign: "center",
                  color: isOver ? "var(--accent)" : "var(--text-tertiary)",
                  fontSize: "var(--fs-meta)",
                }}>
                  {isOver ? "Drop here" : "No signals"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GridView({ signals, activeRule, searchHiddenMatches }: ViewProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
      gap: 12, padding: "16px", overflowY: "auto", alignContent: "start",
      height: "100%", boxSizing: "border-box",
    }}>
      {signals.map(s => {
        const isMain = !!(activeRule && activeRule.mainSignalId === s.id);
        const hiddenCount = isMain ? activeRule!.hiddenSignalIds.length : 0;
        return (
          <SignalCard
            key={s.id}
            signal={s}
            isMain={isMain}
            hiddenCount={hiddenCount}
            matchInHidden={searchHiddenMatches.has(s.id)}
          />
        );
      })}
    </div>
  );
}

// ── ListView ──────────────────────────────────────────────────────────────

function ListRow({ signal, isMain, hiddenCount, matchInHidden }: {
  signal: Signal;
  isMain?: boolean;
  hiddenCount?: number;
  matchInHidden?: boolean;
}) {
  const { selection, toggleSelect, openSignal, wipItems, appMode, signalAttachments, duplicateGroups, updateSignal } = useStore();
  const readOnly = appMode === "client";
  const checked = selection.includes(signal.id);
  const [hovered, setHovered] = useState(false);
  const dupState = duplicateStateOf(duplicateGroups, signal.id);

  const hasTask   = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "task");
  const hasIntent = signal.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "intent");
  const fileAttCount = signalAttachments.filter(a => a.signalId === signal.id).length;

  const priorityAccent = signal.priority === "urgent" ? "#dc2626" : signal.priority === "high" ? "#ef4444" : undefined;
  const attachCount = signal.screenshots + fileAttCount;
  const showStack = !!(isMain && hiddenCount && hiddenCount > 0);
  const staleDays = isSignalStale(signal) ? Math.floor(signalDaysStale(signal)) : 0;
  const staleEscalated = staleDays > STALE_THRESHOLD_DAYS + STALE_WARN_DAYS_OVER_THRESHOLD;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <div
        onClick={() => openSignal(signal.id)}
      data-keep-selection="card"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px",
          borderRadius: "var(--radius)",
          border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
          borderLeft: checked ? undefined : priorityAccent ? `3px solid ${priorityAccent}` : "1px solid var(--border)",
          background: checked ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "var(--bg)",
          boxShadow: showStack
            ? (hiddenCount as number) >= 2
              ? `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border), 4px 4px 0 0 var(--bg-sunken), 4px 4px 0 1px var(--border)`
              : `2px 2px 0 0 var(--bg-sunken), 2px 2px 0 1px var(--border)`
            : "var(--shadow-sm)",
          cursor: "pointer",
          transition: "background 0.12s",
          minWidth: 0,
        }}
      >
        {!readOnly && (
          <span
            onClick={e => { e.stopPropagation(); toggleSelect(signal.id); }}
            style={{ opacity: checked || hovered ? 1 : 0, transition: "opacity 0.12s", display: "flex", flexShrink: 0 }}
          >
            <Checkbox checked={checked} onChange={() => toggleSelect(signal.id)} />
          </span>
        )}

        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 13, fontWeight: 600, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {signal.title}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, color: "var(--text-tertiary)" }}>
          {attachCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11 }}>
              <Paperclip size={11} />{attachCount}
            </span>
          )}
          {!readOnly ? (
            <QuickStatusMenu signal={signal} />
          ) : (
            <StatusDot status={signal.status} />
          )}
          <Avatar userId={signal.author} size="sm" />
        </div>
      </div>

      {hovered && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            width: "max(100%, 320px)",
            zIndex: 50,
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: "10px 12px",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
            <span className="mono">{signal.id}</span>
            <span>·</span>
            <SourceIcon source={signal.source} />
            <span style={{ textTransform: "capitalize" }}>{signal.source}</span>
            <span>·</span>
            <span>{relTime(signal.createdAt)}</span>
            <span>·</span>
            <LastChangedHint signal={signal} />
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 8,
            display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {signal.description}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <PriorityBadge priority={signal.priority} />
            {signal.labels.map(l => (
              <LabelChip
                key={l}
                label={l}
                onRemove={readOnly ? undefined : () => updateSignal(signal.id, { labels: signal.labels.filter(x => x !== l) })}
              />
            ))}
            {!readOnly && <QuickLabelButton signal={signal} />}
            {showStack && <HiddenCountBadge count={hiddenCount as number} />}
            {hasTask   && <TaskCreatedBadge />}
            {hasIntent && <IntentCreatedBadge />}
            {dupState.kind === "possible"  && <DuplicateBadge state="possible"  count={dupState.group.signalIds.length} isNew={isDuplicateGroupNewOrChanged(dupState.group)} />}
            {dupState.kind === "confirmed" && <DuplicateBadge state="confirmed" count={dupState.group.signalIds.length} />}
            {staleDays > 0 && <StaleBadge daysStale={staleDays} status={signal.status} escalated={staleEscalated} />}
            {signal.status === "closed" && <ClosedBadge />}
            {matchInHidden && <HiddenMatchBadge />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ListView ─────────────────────────────────────────────────────────────
// Compact / list mode. When more than one status is present in the visible
// set we break the list into one section per status (in canonical order:
// New → Accepted → Ready → Rejected → Closed) with a small status header
// above each group, so users can spot the status boundary at a glance.
// When only one status is visible we render the flat grid as before.

const LIST_STATUS_ORDER: SignalStatus[] = ["new", "accepted", "ready", "skipped", "rejected", "closed"];
const LIST_STATUS_LABEL: Record<SignalStatus, string> = {
  new: "New", accepted: "Accepted", ready: "Ready", skipped: "Skipped", rejected: "Rejected", closed: "Closed",
};

function ListView({ signals, activeRule, searchHiddenMatches }: ViewProps) {
  // Bucket by status, preserving caller-supplied order within each bucket.
  const buckets = new Map<SignalStatus, Signal[]>();
  for (const s of signals) {
    const arr = buckets.get(s.status) ?? [];
    arr.push(s);
    buckets.set(s.status, arr);
  }
  const presentStatuses = LIST_STATUS_ORDER.filter(st => (buckets.get(st)?.length ?? 0) > 0);
  const multipleStatuses = presentStatuses.length > 1;

  const renderRow = (s: Signal) => {
    const isMain = !!(activeRule && activeRule.mainSignalId === s.id);
    const hiddenCount = isMain ? activeRule!.hiddenSignalIds.length : 0;
    return (
      <ListRow
        key={s.id}
        signal={s}
        isMain={isMain}
        hiddenCount={hiddenCount}
        matchInHidden={searchHiddenMatches.has(s.id)}
      />
    );
  };

  // Single-status path — keep the original flat grid layout.
  if (!multipleStatuses) {
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 6, padding: "12px 16px", overflowY: "auto",
        height: "100%", boxSizing: "border-box", alignContent: "start",
      }}>
        {signals.map(renderRow)}
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 16px", overflowY: "auto",
      height: "100%", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {presentStatuses.map(status => {
        const items = buckets.get(status) ?? [];
        return (
          <section key={status} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Status header — small but clearly distinct from a row. The
                colored dot + count makes the section boundary read
                immediately even on dense lists. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "2px 4px",
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              textTransform: "uppercase", color: "var(--text-tertiary)",
              borderBottom: "1px solid var(--border)",
              paddingBottom: 6, marginBottom: 2,
            }}>
              <StatusDot status={status} />
              <span>{LIST_STATUS_LABEL[status]}</span>
              <span style={{
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontWeight: 500, color: "var(--text-tertiary)",
              }}>
                {items.length}
              </span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 6, alignContent: "start",
            }}>
              {items.map(renderRow)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Hide-under picker (used in SelectionBar) ──────────────────────────────

function HideUnderPicker({
  signalIds,
  filterLabels,
  onClose,
}: {
  signalIds: string[];
  filterLabels: string[];
  onClose: () => void;
}) {
  const { signals, hideUnder, clearSelection } = useStore();
  const [mainId, setMainId] = useState(signalIds[0]);
  const selected = signals.filter(s => signalIds.includes(s.id));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const confirm = () => {
    const others = signalIds.filter(id => id !== mainId);
    hideUnder(mainId, filterLabels, others);
    clearSelection();
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", bottom: "calc(100% + 8px)", left: 0,
        zIndex: 400, width: 360,
        background: "var(--bg)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        padding: 14, color: "var(--text)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Hide under main signal</div>
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
        Scope:&nbsp;
        {filterLabels.map(l => (
          <span key={l} style={{ marginRight: 4 }}>
            <LabelChip label={l} />
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 8 }}>
        Choose the signal that stays visible. Others will be hidden under it for this filter.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12, maxHeight: 240, overflowY: "auto" }}>
        {selected.map(s => {
          const isChosen = mainId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setMainId(s.id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 9px",
                borderRadius: "var(--radius)", textAlign: "left", cursor: "pointer",
                border: isChosen ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: isChosen ? "var(--accent-soft)" : "var(--bg)",
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                border: isChosen ? "none" : "1.5px solid var(--border-strong)",
                background: isChosen ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                {isChosen && <Check size={8} style={{ color: "white" }} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3, color: "var(--text)" }}>{s.title}</div>
                <div style={{ display: "flex", gap: 5, marginTop: 2, alignItems: "center" }}>
                  <StatusDot status={s.status} />
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{s.id}</span>
                </div>
              </div>
              {isChosen && (
                <span style={{
                  fontSize: 9, fontWeight: 600, color: "var(--accent)",
                  background: "var(--accent-soft)", border: "1px solid var(--accent)",
                  borderRadius: 100, padding: "1px 6px", flexShrink: 0,
                }}>Main</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button onClick={onClose} style={{ padding: "5px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={confirm} style={{ padding: "5px 14px", borderRadius: "var(--radius)", border: "none", background: "var(--accent)", color: "white", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          Hide {signalIds.length - 1} under main
        </button>
      </div>
    </div>
  );
}

// ── SelectionBar ───────────────────────────────────────────────────────────

const darkBtn: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 100,
  background: "rgba(255,255,255,0.1)", color: "white",
  fontSize: "var(--fs-body)", border: "none", cursor: "pointer",
};

function StatusPill({ status, count }: { status: SignalStatus; count: number }) {
  const color =
    status === "new"      ? "var(--status-new)"      :
    status === "accepted" ? "var(--status-accepted)"  :
    status === "ready"    ? "var(--status-ready)"     :
    status === "closed"   ? "var(--text-disabled)"    :
    "var(--status-rejected)";
  const bg =
    status === "new"      ? "rgba(245,158,11,0.2)"  :
    status === "accepted" ? "rgba(16,185,129,0.2)"   :
    status === "ready"    ? "rgba(13,148,136,0.18)"  :
    status === "closed"   ? "rgba(107,114,128,0.2)"  :
    "rgba(156,163,175,0.2)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 100, background: bg, color, fontSize: 12, fontWeight: 500 }}>
      {count} {status}
    </span>
  );
}

type CreateWorkForm = {
  type: "task" | "intent";
  title: string;
  description: string;
  // Working set of source signal ids — starts as the user's selection
  // and can be trimmed inside the form before confirming. Stored
  // separately so the underlying selection stays intact while the modal
  // is open (Cancel restores the pre-modal state cleanly).
  sourceIds: string[];
};

function SelectionBar() {
  const { selection, clearSelection, bulkSetStatus, bulkAddLabel, signals, createWorkItem, filters } = useStore();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [createForm, setCreateForm] = useState<CreateWorkForm | null>(null);
  const [showHideUnder, setShowHideUnder] = useState(false);
  const [showGroupReview, setShowGroupReview] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  if (selection.length === 0) return null;

  const selectedSignals = signals.filter(s => selection.includes(s.id));
  const allAccepted = selectedSignals.every(s => s.status === "accepted" || s.status === "ready");
  const allLabels = Array.from(new Set(signals.flatMap(s => s.labels)));
  const activeLabels = Array.from(new Set(selectedSignals.flatMap(s => s.labels)));

  const counts = {
    new:      selectedSignals.filter(s => s.status === "new").length,
    accepted: selectedSignals.filter(s => s.status === "accepted").length,
    ready:    selectedSignals.filter(s => s.status === "ready").length,
    rejected: selectedSignals.filter(s => s.status === "rejected").length,
    closed:   selectedSignals.filter(s => s.status === "closed").length,
  };
  const n = selection.length;
  const canHideUnder = selection.length >= 2 && filters.labels.length > 0;

  const openForm = (type: "task" | "intent") => {
    // Pre-populate title with the first signal's title (most common
    // pattern in the TPA flow — they usually want one of the signals'
    // phrasings as the action title and edit from there).
    const initialTitle = selectedSignals.length === 1
      ? selectedSignals[0].title
      : selectedSignals[0]?.title ?? "";
    const desc = selectedSignals.length === 1 ? selectedSignals[0].description : "";
    setCreateForm({ type, title: initialTitle, description: desc, sourceIds: selection.slice() });
    setShowLabelPicker(false);
  };

  const submitCreate = () => {
    if (!createForm) return;
    if (createForm.sourceIds.length === 0) return;
    // Non-Ready warning still fires, but only counts signals that are
    // still in the trimmed sourceIds set — dropping a non-ready row
    // before submit should silence the warning.
    const trimmedSelected = signals.filter(s => createForm.sourceIds.includes(s.id));
    const trimmedAnyNonReady = trimmedSelected.some(s => s.status !== "ready");
    if (trimmedAnyNonReady) {
      const ok = window.confirm(
        `Some source signals are not marked Ready yet. Create ${createForm.type} anyway?`
      );
      if (!ok) return;
    }
    createWorkItem(createForm.type, createForm.description, null, {
      title: createForm.title,
      signalIds: createForm.sourceIds,
    });
    setCreateForm(null);
  };

  const dropSourceFromForm = (id: string) => {
    setCreateForm(f => {
      if (!f) return f;
      // Don't allow dropping the last one — submit would be a no-op.
      if (f.sourceIds.length <= 1) return f;
      return { ...f, sourceIds: f.sourceIds.filter(x => x !== id) };
    });
  };

  return (
    <div data-keep-selection="bar" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>

      {createForm && (() => {
        const sourceSignals = signals.filter(s => createForm.sourceIds.includes(s.id));
        return (
          <div style={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
            padding: 16, width: 440, maxHeight: "70vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: "var(--fs-meta)", fontWeight: 600, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              {createForm.type === "task" ? <Task size={12} /> : <Intent size={12} />}
              Create {createForm.type} from {sourceSignals.length} source signal{sourceSignals.length === 1 ? "" : "s"}
            </div>

            {/* Title — pre-filled from the first source signal, freely
                editable. Required for create. */}
            <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 4 }}>Title</div>
            <input
              autoFocus
              value={createForm.title}
              onChange={e => setCreateForm(f => f ? { ...f, title: e.target.value } : null)}
              placeholder={`${createForm.type === "task" ? "Task" : "Intent"} title…`}
              style={{
                width: "100%", border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius)", padding: "6px 9px",
                fontSize: "var(--fs-body)", background: "var(--bg)",
                outline: "none", marginBottom: 10, boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
            />

            <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", marginBottom: 4 }}>
              Description / Context  <span style={{ color: "var(--text-disabled)" }}>· optional</span>
            </div>
            <textarea
              value={createForm.description}
              onChange={e => setCreateForm(f => f ? { ...f, description: e.target.value } : null)}
              placeholder="Source signal text is preserved below — add your own framing if useful."
              rows={3}
              style={{
                width: "100%", border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius)", padding: "6px 9px",
                fontSize: "var(--fs-body)", background: "var(--bg)",
                outline: "none", resize: "vertical", lineHeight: 1.5,
                boxSizing: "border-box", marginBottom: 12,
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
            />

            {/* Source signals list — removable per row. The new work
                item will keep these as Source signals. */}
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 }}>
              Source signals · {sourceSignals.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
              {sourceSignals.map(s => (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px",
                    border: "1px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--bg-sunken)",
                  }}
                >
                  <StatusDot status={s.status} />
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize", minWidth: 56 }}>
                    {s.source}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.title}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }} className="mono">{s.id}</span>
                  {sourceSignals.length > 1 && (
                    <button
                      onClick={() => dropSourceFromForm(s.id)}
                      aria-label="Drop this source signal"
                      title="Drop from this work item"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 20, height: 20, borderRadius: "var(--radius-sm)",
                        border: "none", background: "transparent",
                        color: "var(--text-tertiary)", cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, marginBottom: 12 }}>
              These stay linked as Source signals on the new {createForm.type}. Use ✕ to drop any that don't belong.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCreateForm(null)} style={{ padding: "4px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: "var(--fs-meta)", color: "var(--text-secondary)", background: "var(--bg)" }}>Cancel</button>
              <button
                onClick={submitCreate}
                disabled={!createForm.title.trim() || createForm.sourceIds.length === 0}
                style={{
                  padding: "4px 12px", borderRadius: "var(--radius)", border: "none",
                  fontSize: "var(--fs-meta)", fontWeight: 500,
                  background: (!createForm.title.trim() || createForm.sourceIds.length === 0) ? "var(--bg-sunken)" : "var(--accent)",
                  color: (!createForm.title.trim() || createForm.sourceIds.length === 0) ? "var(--text-disabled)" : "white",
                  cursor: (!createForm.title.trim() || createForm.sourceIds.length === 0) ? "not-allowed" : "pointer",
                }}
              >
                Create {createForm.type} ▸
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        background: "#0f0f11", borderRadius: 100, boxShadow: "var(--shadow-lg)",
        color: "white", fontSize: "var(--fs-body)", animation: "slideUp 0.18s ease", whiteSpace: "nowrap",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 500 }}>Selected {selection.length}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
            textTransform: "uppercase", color: "rgba(255,255,255,0.55)",
            padding: "1px 6px", borderRadius: 100,
            border: "1px solid rgba(255,255,255,0.20)",
          }}>
            temporary
          </span>
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          {counts.new      > 0 && <StatusPill status="new"      count={counts.new} />}
          {counts.accepted > 0 && <StatusPill status="accepted" count={counts.accepted} />}
          {counts.ready    > 0 && <StatusPill status="ready"    count={counts.ready} />}
          {counts.rejected > 0 && <StatusPill status="rejected" count={counts.rejected} />}
          {counts.closed   > 0 && <StatusPill status="closed"   count={counts.closed} />}
        </span>

        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

        <button onClick={() => bulkSetStatus("accepted")} style={darkBtn}>Accept {n}</button>
        <button onClick={() => bulkSetStatus("ready")}    style={darkBtn}>Mark Ready {n}</button>
        <button onClick={() => bulkSetStatus("rejected")} style={darkBtn}>Reject {n}</button>
        <button onClick={() => bulkSetStatus("closed")}   style={darkBtn}>Close {n}</button>

        {allAccepted && (
          <>
            <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
            <button
              onClick={() => openForm("task")}
              style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: createForm?.type === "task" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}
            >
              <Task size={12} /> Create task
            </button>
            <button
              onClick={() => openForm("intent")}
              style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: createForm?.type === "intent" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}
            >
              <Intent size={12} /> Draft intent
            </button>
          </>
        )}

        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

        <div style={{ position: "relative" }}>
          <button onClick={() => { setShowLabelPicker(o => !o); setCreateForm(null); }} style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5 }}>
            <Tag size={12} /> Label
          </button>
          {showLabelPicker && (
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 400 }}>
              <LabelPicker
                allLabels={allLabels} activeLabels={activeLabels}
                onToggle={label => bulkAddLabel(label)}
                onClose={() => setShowLabelPicker(false)}
                width={240}
                recentLabels={recentlyUsedLabels(signals, 6)}
                suggestions={frequentlyUsedLabels(signals, 4).filter(l => !activeLabels.includes(l))}
              />
            </div>
          )}
        </div>

        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

        {canHideUnder && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowHideUnder(o => !o); setCreateForm(null); setShowLabelPicker(false); }}
              style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: showHideUnder ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)" }}
              title={`Hide other signals under one main, scoped to current label filter`}
            >
              ◇ Hide under main
            </button>
            {showHideUnder && (
              <HideUnderPicker
                signalIds={selection}
                filterLabels={filters.labels}
                onClose={() => setShowHideUnder(false)}
              />
            )}
          </div>
        )}

        {selection.length >= 2 && (
          <button
            onClick={() => { setShowGroupReview(true); setCreateForm(null); setShowLabelPicker(false); }}
            style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: showGroupReview ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)" }}
          >
            ⛶ Group review
          </button>
        )}

        {/* "Save selected as group" — forward-compatible placeholder for
            the future explicit-grouping feature. Disabled in v1 with a
            tooltip pointing at the implicit source-signals model. */}
        {selection.length >= 2 && (
          <button
            disabled
            title="Coming soon — for now, signals created from a selection stay linked as Source signals on the new work item."
            style={{
              ...darkBtn,
              display: "flex", alignItems: "center", gap: 5,
              opacity: 0.45, cursor: "not-allowed",
            }}
          >
            ⚙ Save as group
          </button>
        )}

        <button
          onClick={() => { setShowProcess(true); setCreateForm(null); setShowLabelPicker(false); setShowHideUnder(false); }}
          style={{
            ...darkBtn, display: "flex", alignItems: "center", gap: 5,
            background: "rgba(34,197,94,0.25)",
            border: "1px solid rgba(34,197,94,0.45)",
          }}
          title="Process selected signals"
        >
          ▷ Process {n}
        </button>

        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

        <button onClick={() => { clearSelection(); setCreateForm(null); }} style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 4 }}>
          <X size={12} /> Esc
        </button>
      </div>

      {showGroupReview && (
        <GroupReviewModal
          signalIds={selection}
          onClose={() => setShowGroupReview(false)}
        />
      )}

      {showProcess && (
        <ProcessThinkingModal
          count={n}
          onClose={() => setShowProcess(false)}
        />
      )}
    </div>
  );
}

// ── Process modal (thinking placeholder) ──────────────────────────────────
// Shows a spinner + "thinking" message while we figure out what real
// processing should do. Click Close (or Esc) to dismiss. Nothing is
// persisted, no transactions, no records.

function ProcessThinkingModal({ count, onClose }: { count: number; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true"
        style={{
          width: "min(420px, 92vw)",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          padding: "20px 22px",
          animation: "modalIn 0.18s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Spinner />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Process signals
          </h2>
        </div>
        <p style={{ margin: "4px 0 16px", fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Thinking… preparing {count} signal{count === 1 ? "" : "s"}.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "5px 12px", borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-meta)", cursor: "pointer", fontWeight: 500,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 16, height: 16, flexShrink: 0,
        border: "2px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type SortBy =
  | "newest" | "oldest"
  | "status" | "title" | "author" | "priority"
  | "updated_recent" | "stale_first";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "newest",         label: "Newest first" },
  { value: "oldest",         label: "Oldest first" },
  { value: "updated_recent", label: "Recently updated" },
  { value: "stale_first",    label: "Last touched (stale first)" },
  { value: "priority",       label: "Priority" },
  { value: "status",         label: "Status" },
  { value: "title",          label: "Title A→Z" },
  { value: "author",         label: "Author" },
];

const STATUS_ORDER:   Record<string, number> = { new: 0, accepted: 1, ready: 2, skipped: 3, rejected: 4, closed: 5 };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

// Format a YYYY-MM-DD into "Today" / "Yesterday" / "Mon 3 Apr".
function humaniseDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  if (dt.getTime() === today.getTime())     return "Today";
  if (dt.getTime() === yesterday.getTime()) return "Yesterday";
  return dt.toLocaleDateString(undefined, {
    month: "short", day: "numeric",
    year: dt.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function sortSignals(list: Signal[], by: SortBy): Signal[] {
  const copy = [...list];
  switch (by) {
    case "newest":   return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "oldest":   return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "priority": return copy.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
    case "status":   return copy.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    case "title":    return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "author":   return copy.sort((a, b) => a.author.localeCompare(b.author));
    // Recently updated: newest statusUpdatedAt first; signals with no
    // status update fall back to createdAt so they don't sink to the bottom.
    case "updated_recent": return copy.sort((a, b) => {
      const ta = new Date(a.statusUpdatedAt ?? a.createdAt).getTime();
      const tb = new Date(b.statusUpdatedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
    // Stale-first: oldest last-touch on the still-active items first so
    // forgotten New / Accepted / Ready signals surface at the top. Closed
    // / rejected (settled) signals always fall to the back.
    case "stale_first": return copy.sort((a, b) => {
      const settled = (s: Signal) => s.status === "closed" || s.status === "rejected" ? 1 : 0;
      const sa = settled(a), sb = settled(b);
      if (sa !== sb) return sa - sb;
      const ta = new Date(a.statusUpdatedAt ?? a.createdAt).getTime();
      const tb = new Date(b.statusUpdatedAt ?? b.createdAt).getTime();
      return ta - tb;
    });
    default: return copy;
  }
}

export function SignalsPage() {
  const {
    signals, wipItems, hideUnderRules, signalAttachments,
    view, setView, groupBy, setGroupBy,
    filters, setFilters,
    search, setSearch,
    selection, selectAll, clearSelection,
    appMode, duplicateGroups, transactions, clientPreviousVisitAt,
    sourceOfWipFilter, setSourceOfWipFilter,
  } = useStore();
  const readOnly = appMode === "client";
  // Sort preference — persisted across refresh so a user processing a
  // queue doesn't lose their preferred ordering. We seed from localStorage
  // inside an effect (kept off the SSR path) so server-render shows the
  // default value and the post-hydration update is invisible to the user.
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("signal:sortBy") as SortBy | null;
    const allowed: SortBy[] = ["newest","oldest","status","title","author","priority","updated_recent","stale_first"];
    if (saved && allowed.includes(saved)) setSortBy(saved);
  }, []);
  const setSortByPersisted = (s: SortBy) => {
    setSortBy(s);
    if (typeof window !== "undefined") localStorage.setItem("signal:sortBy", s);
  };
  // Toggle: when on, the page is filtered to signals that are part of an
  // unconfirmed duplicate suggestion. The toolbar pill drives this state.
  const [dupReview, setDupReview] = useState(false);
  // Client feedback report modal — opens from the toolbar.
  const [reportOpen, setReportOpen] = useState(false);
  // ── Show changes ───────────────────────────────────────────────────────
  // Mirror of the WIP-page filter: when on, the list is restricted to
  // signals with activity newer than the visit snapshot (or a 48h fallback
  // when there's no snapshot). Computed inside an effect so SSR/CSR agree.
  const [showChangesOnly, setShowChangesOnly] = useState(false);
  const [sinceISO, setSinceISO] = useState<string | null>(null);
  useEffect(() => {
    setSinceISO(
      clientPreviousVisitAt
        ?? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    );
  }, [clientPreviousVisitAt]);
  const freshSignalIds = useMemo(() => {
    const ids = new Set<string>();
    if (!sinceISO) return ids;
    const sinceMs = new Date(sinceISO).getTime();
    // Direct signal-level signals of "freshness": create + status update.
    for (const s of signals) {
      if (new Date(s.createdAt).getTime() > sinceMs) { ids.add(s.id); continue; }
      if (s.statusUpdatedAt && new Date(s.statusUpdatedAt).getTime() > sinceMs) {
        ids.add(s.id);
      }
    }
    // Plus any transaction touching a signal (label changes, priority, WIP
    // creation, etc.) that happened after the snapshot.
    for (const tx of transactions) {
      if (new Date(tx.timestamp).getTime() <= sinceMs) continue;
      for (const id of tx.affectedSignalIds) ids.add(id);
    }
    return ids;
  }, [signals, transactions, sinceISO]);

  // Pre-compute the set of signal ids that appear in unconfirmed suggestions
  // (used both by the filter and by the toolbar pill's count).
  const possibleDupSignalIds = useMemo(() => {
    const out = new Set<string>();
    for (const g of duplicateGroups) {
      if (g.confirmed) continue;
      for (const id of g.signalIds) out.add(id);
    }
    return out;
  }, [duplicateGroups]);
  // Subset of `possibleDupSignalIds` for groups that are new / changed since
  // the user's last visit. Used to float them to the top of the list when
  // the user is in duplicate-review mode so unseen suggestions are reviewed
  // first without disrupting the chosen sort within each bucket.
  const newDupSignalIds = useMemo(() => {
    const out = new Set<string>();
    for (const g of duplicateGroups) {
      if (g.confirmed) continue;
      if (!isDuplicateGroupNewOrChanged(g)) continue;
      for (const id of g.signalIds) out.add(id);
    }
    return out;
  }, [duplicateGroups]);
  const possibleDupGroupCount = useMemo(
    () => duplicateGroups.filter(g => !g.confirmed).length,
    [duplicateGroups],
  );
  // Count of *new or changed* suggestions — drives the orange "N new" sub-
  // chip on the toolbar pill and the "New" tag in the modal section.
  const newDupGroupCount = useMemo(
    () => duplicateGroups.filter(g => !g.confirmed && isDuplicateGroupNewOrChanged(g)).length,
    [duplicateGroups],
  );

  // Outside-click + Esc clear selection. We listen at the document level
  // and consult `data-keep-selection` markers placed on the bulk action
  // bar, the create-from-signal forms, and the per-card click targets so
  // we don't fight the user's intentional selection actions.
  useEffect(() => {
    if (selection.length === 0) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Anything inside an element marked `data-keep-selection` (cards,
      // selection bar, popovers) preserves the current selection.
      if (target.closest("[data-keep-selection]")) return;
      // Don't clobber selection while a popover/portal is open above the
      // page — those render outside the main DOM but mark themselves.
      if (target.closest("[role='dialog']")) return;
      clearSelection();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [selection.length, clearSelection]);

  const allLabels  = useMemo(() => Array.from(new Set(signals.flatMap(s => s.labels))), [signals]);
  const recentLabels = useMemo(() => recentlyUsedLabels(signals, 6), [signals]);
  const authorOpts = USERS.map(u => ({ value: u.id, label: u.name }));
  const sourceOpts = [{ value: "feedback", label: "Feedback" }, { value: "note", label: "Note" }];

  // Apply non-hide-under filters
  const baseFiltered = useMemo(() => {
    let list = [...signals];
    // Transient "source-of:<wipId>" filter — set from the post-create
    // banner's "View source signals" action. Narrows to the wip's
    // linked signals AND wins over every other filter so the user
    // can spot the source set without fighting status / priority.
    if (sourceOfWipFilter) {
      const wip = wipItems.find(w => w.id === sourceOfWipFilter);
      const ids = new Set(wip?.linkedSignals ?? []);
      list = list.filter(s => ids.has(s.id));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.labels.some(l => l.toLowerCase().includes(q))
      );
    }
    if (filters.status.length > 0)   list = list.filter(s => filters.status.includes(s.status));
    if (filters.priority.length > 0) list = list.filter(s => filters.priority.includes(s.priority));
    if (filters.author.length > 0)   list = list.filter(s => filters.author.includes(s.author));
    if (filters.source.length > 0)   list = list.filter(s => filters.source.includes(s.source));
    if (filters.labels.length > 0)   list = list.filter(s => filters.labels.every(l => s.labels.includes(l)));
    if (filters.workItem.includes("task_created"))
      list = list.filter(s => s.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "task"));
    if (filters.workItem.includes("intent_created"))
      list = list.filter(s => s.linkedWip.some(id => wipItems.find(w => w.id === id)?.type === "intent"));
    // Duplicate filters — multi-select OR. Each filter narrows to signals
    // matching at least one selected predicate. "none" means signals NOT
    // in any group; "with_done_wip" requires the wip to currently be in
    // the done column.
    if (filters.duplicate.length > 0) {
      list = list.filter(s => {
        const g = duplicateGroups.find(grp => grp.signalIds.includes(s.id));
        for (const f of filters.duplicate) {
          if (f === "none" && !g) return true;
          if (!g) continue;
          if (f === "possible"  && !g.confirmed) return true;
          if (f === "confirmed" && g.confirmed)  return true;
          if (f === "new"       && !g.confirmed && isDuplicateGroupNewOrChanged(g)) return true;
          if (f === "with_wip" || f === "with_done_wip") {
            const groupWips: string[] = [];
            for (const sid of g.signalIds) {
              const sg = signals.find(x => x.id === sid);
              if (sg) groupWips.push(...sg.linkedWip);
            }
            if (groupWips.length === 0) continue;
            if (f === "with_wip") return true;
            if (f === "with_done_wip" && groupWips.some(wid => wipItems.find(w => w.id === wid)?.column === "done")) return true;
          }
        }
        return false;
      });
    }
    // Attribute filters — multi-select OR. "Stale" matches signals past
    // the staleness threshold (active statuses only). "Has attachments"
    // and "Has linked work" do exactly what they say.
    if (filters.attribute.length > 0) {
      list = list.filter(s => {
        for (const f of filters.attribute) {
          if (f === "stale" && isSignalStale(s)) return true;
          if (f === "returning_soon" && isSkipReturningSoon(s)) return true;
          if (f === "has_attachments" && (s.screenshots > 0 || signalAttachments.some(a => a.signalId === s.id))) return true;
          if (f === "has_linked_work" && s.linkedWip.length > 0) return true;
        }
        return false;
      });
    }
    // Duplicate review mode — narrows to signals in unconfirmed groups.
    if (dupReview) list = list.filter(s => possibleDupSignalIds.has(s.id));
    return list;
  }, [signals, wipItems, signalAttachments, search, filters.status, filters.priority, filters.author, filters.source, filters.labels, filters.workItem, filters.duplicate, filters.attribute, dupReview, possibleDupSignalIds, duplicateGroups, sourceOfWipFilter]);

  // Resolve the active hide-under rule for the current label filter scope.
  // Only meaningful when at least one label is selected.
  const activeRule: HideUnderRule | undefined = useMemo(() => {
    if (filters.labels.length === 0) return undefined;
    return findHideUnderRule(hideUnderRules, filters.labels);
  }, [hideUnderRules, filters.labels]);

  // Hide under: drop signals listed in activeRule.hiddenSignalIds, unless
  // the user is searching and that signal matches — then keep it visible
  // and mark it as a "match in hidden". Restore-all edge case: if the main
  // signal isn't present in the visible set (e.g. filtered out by status),
  // we restore the hidden ones so they don't disappear from the working set.
  const flatFiltered = useMemo(() => {
    let list = baseFiltered;
    if (activeRule) {
      const mainPresent = list.some(s => s.id === activeRule.mainSignalId);
      if (mainPresent) {
        const hiddenSet = new Set(activeRule.hiddenSignalIds);
        list = list.filter(s => {
          if (!hiddenSet.has(s.id)) return true;
          // Reveal hidden signal if it matches search.
          if (search) {
            const q = search.toLowerCase();
            return (
              s.title.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.labels.some(l => l.toLowerCase().includes(q))
            );
          }
          return false;
        });
      }
    }
    if (showChangesOnly) {
      list = list.filter(s => freshSignalIds.has(s.id));
    }
    const sorted = sortSignals(list, sortBy);
    // ── Confirmed-duplicate-group collapse ──────────────────────────────
    // Confirmed groups render as a single stacked card representing the
    // main signal. We drop non-main members from the visible list so the
    // grid doesn't show the same issue 5 times. Suggested groups stay
    // expanded — the user is still triaging them.
    //
    // We don't collapse when the dup-review filter is on: in that mode the
    // user explicitly wants to see every member to triage suggestions.
    let collapsed = sorted;
    if (!dupReview) {
      const mainOf = new Map<string, string>();        // groupId → main signal id
      const memberToGroup = new Map<string, string>(); // signalId → groupId for confirmed groups
      for (const g of duplicateGroups) {
        if (!g.confirmed) continue;
        const main = mainSignalOf(g, signals);
        if (!main) continue;
        mainOf.set(g.id, main.id);
        for (const id of g.signalIds) memberToGroup.set(id, g.id);
      }
      collapsed = sorted.filter(s => {
        const gid = memberToGroup.get(s.id);
        if (!gid) return true;
        return mainOf.get(gid) === s.id;
      });
    }
    // In duplicate-review mode, prioritize signals that belong to new /
    // changed suggestions so unseen ones float to the top. Stable
    // partition keeps the chosen sort within each bucket.
    if (dupReview && newDupSignalIds.size > 0) {
      const head: Signal[] = [];
      const tail: Signal[] = [];
      for (const s of collapsed) (newDupSignalIds.has(s.id) ? head : tail).push(s);
      return [...head, ...tail];
    }
    return collapsed;
  }, [baseFiltered, activeRule, search, sortBy, dupReview, newDupSignalIds, showChangesOnly, freshSignalIds, duplicateGroups, signals]);

  // IDs of main signals that have at least one hidden child matching search.
  // The badge appears on the main signal card so users know to dig in.
  const searchHiddenMatches = useMemo(() => {
    const result = new Set<string>();
    if (!search || !activeRule) return result;
    const q = search.toLowerCase();
    const hasHiddenMatch = activeRule.hiddenSignalIds.some(id => {
      const s = signals.find(sig => sig.id === id);
      return s && (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.labels.some(l => l.toLowerCase().includes(q))
      );
    });
    if (hasHiddenMatch) result.add(activeRule.mainSignalId);
    // Also: hidden signals that we revealed because they match — flag them too
    activeRule.hiddenSignalIds.forEach(id => {
      const s = signals.find(sig => sig.id === id);
      if (s && (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.labels.some(l => l.toLowerCase().includes(q))
      )) {
        result.add(id);
      }
    });
    return result;
  }, [search, activeRule, signals]);

  const groupByOptions = [
    { value: "status",        label: "Status" },
    { value: "source",        label: "Source" },
    { value: "author",        label: "Author" },
    { value: "label",         label: "Label" },
    { value: "created_date",  label: "Created date" },
    { value: "updated_date",  label: "Updated date" },
    { value: "closed_reason", label: "Linked action / closed by" },
  ];

  const hasFilters =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.author.length > 0 ||
    filters.source.length > 0 ||
    filters.labels.length > 0 ||
    filters.workItem.length > 0 ||
    filters.duplicate.length > 0 ||
    filters.attribute.length > 0;

  const sep = <span style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-sunken)" }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search signals…" />

        {sep}

        <Segmented
          value={view}
          onChange={v => setView(v as "columns" | "grid" | "list")}
          options={[
            { value: "columns", label: "Columns", icon: <Layers size={12} /> },
            { value: "grid",    label: "Grid",    icon: <Grid size={12} /> },
            { value: "list",    label: "Compact", icon: <List size={12} /> },
          ]}
        />
        {view === "columns" && (
          <>
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>Group by</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as typeof groupBy)}
              style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                padding: "3px 8px", fontSize: "var(--fs-meta)",
                background: "var(--bg)", color: "var(--text)", height: 28,
              }}
            >
              {groupByOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>
        )}
        <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>Sort by</span>
        <select
          value={sortBy}
          onChange={e => setSortByPersisted(e.target.value as SortBy)}
          style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            padding: "3px 8px", fontSize: "var(--fs-meta)",
            background: "var(--bg)", color: "var(--text)", height: 28,
          }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {!readOnly && sep}

        {!readOnly && (() => {
          const visibleIds = flatFiltered.map(s => s.id);
          const allSelected = visibleIds.length > 0 && visibleIds.every(id => selection.includes(id));
          return (
            <button
              onClick={() => {
                if (allSelected) {
                  // Remove only the visible ids from selection (preserve any
                  // hidden selections from a previous filter scope).
                  const visibleSet = new Set(visibleIds);
                  selectAll(selection.filter(id => !visibleSet.has(id)));
                } else {
                  // Add visible ids to selection (union, don't clobber).
                  selectAll(Array.from(new Set([...selection, ...visibleIds])));
                }
              }}
              disabled={visibleIds.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 28, padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: allSelected ? "var(--accent-soft)" : "var(--bg)",
                color: allSelected ? "var(--accent)" : "var(--text)",
                fontSize: "var(--fs-meta)",
                cursor: visibleIds.length === 0 ? "not-allowed" : "pointer",
                opacity: visibleIds.length === 0 ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { if (visibleIds.length > 0 && !allSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!allSelected) e.currentTarget.style.background = "var(--bg)"; }}
              title={allSelected ? "Deselect all visible signals" : "Select all visible signals"}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: allSelected ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
                  background: allSelected ? "var(--accent)" : "transparent",
                  flexShrink: 0,
                  pointerEvents: "none",
                }}
              >
                {allSelected && (
                  <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5 5 4 7.5 8.5 2" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {allSelected ? `Deselect all (${visibleIds.length})` : `Select all (${visibleIds.length})`}
            </button>
          );
        })()}

        <span style={{ flex: 1 }} />

        {/* Show-changes toggle. When active, the list is restricted to
            signals with activity (creation, status change, or any logged
            transaction) newer than the visit snapshot. Disabled when no
            signals have changed so the user can't end up on an empty
            board with no obvious way back. */}
        {(() => {
          const freshCount = freshSignalIds.size;
          const disabled = freshCount === 0 && !showChangesOnly;
          return (
            <button
              onClick={() => { if (!disabled) setShowChangesOnly(v => !v); }}
              disabled={disabled}
              title={
                disabled            ? "No changes since your last visit" :
                showChangesOnly     ? "Show all signals" :
                                       `Show only the ${freshCount} signal${freshCount === 1 ? "" : "s"} that changed since your last visit`
              }
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 28, padding: "0 10px",
                borderRadius: 100,
                border: showChangesOnly ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: showChangesOnly ? "var(--accent)" : "var(--bg)",
                color: showChangesOnly ? "white" : (disabled ? "var(--text-disabled)" : "var(--text-secondary)"),
                fontSize: "var(--fs-meta)", fontWeight: 500,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { if (!disabled && !showChangesOnly) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!showChangesOnly) e.currentTarget.style.background = "var(--bg)"; }}
            >
              <span aria-hidden style={{ fontSize: 11 }}>{showChangesOnly ? "✓" : "◔"}</span>
              <span>{showChangesOnly ? "Showing changes" : "Show changes"}</span>
              {!showChangesOnly && freshCount > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 16, padding: "0 5px",
                  borderRadius: 100,
                  background: "rgba(20,184,166,0.14)",
                  color: "#0f766e",
                  fontSize: 10.5, fontWeight: 600,
                  fontFamily: "JetBrains Mono, ui-monospace, monospace",
                }}>
                  {freshCount}
                </span>
              )}
            </button>
          );
        })()}

        {/* Client report — opens a copy-friendly status report modal.
            Hidden in client read-only mode (clients shouldn't generate
            reports about themselves). */}
        {!readOnly && (
          <button
            onClick={() => setReportOpen(true)}
            title="Generate a client-safe feedback status report"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 28, padding: "0 10px",
              borderRadius: 100,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-secondary)",
              fontSize: "var(--fs-meta)", fontWeight: 500, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          >
            ▸ Client report
          </button>
        )}

        {/* Transient "Source of <wip>" filter chip — set from the
            post-create banner. Removable via the ✕ to return to the
            normal filtered view. */}
        {sourceOfWipFilter && (() => {
          const wip = wipItems.find(w => w.id === sourceOfWipFilter);
          if (!wip) return null;
          const truncated = wip.title.length > 28 ? wip.title.slice(0, 28).trim() + "…" : wip.title;
          return (
            <span
              title={`Showing only source signals of ${wip.type} "${wip.title}"`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 28, padding: "0 6px 0 10px",
                borderRadius: 100,
                border: "1px solid var(--accent)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontSize: "var(--fs-meta)", fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Source of {wip.type === "task" ? "task" : "intent"}: {truncated}
              <button
                onClick={() => setSourceOfWipFilter(null)}
                aria-label="Clear source-of filter"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: 100,
                  border: "none", background: "transparent",
                  color: "var(--accent)", cursor: "pointer",
                  marginLeft: 2,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.18)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <X size={10} />
              </button>
            </span>
          );
        })()}

        {/* Review-duplicate-suggestions pill. Hidden when there are no
            unconfirmed groups so it doesn't add noise on a clean board.
            When there are *new* or *changed* suggestions since the last
            visit, an additional orange "N new" segment appears so the user
            notices the highlight without it being intrusive. */}
        {(possibleDupGroupCount > 0 || dupReview) && (
          <button
            onClick={() => setDupReview(v => !v)}
            title={
              dupReview                  ? "Show all signals" :
              newDupGroupCount > 0       ? `${newDupGroupCount} new duplicate suggestion${newDupGroupCount === 1 ? "" : "s"} since your last visit` :
                                            "Filter to signals with possible duplicate suggestions"
            }
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 28, padding: "0 10px",
              borderRadius: 100,
              border: dupReview
                ? "1px solid rgba(245,158,11,0.55)"
                : "1px dashed rgba(245,158,11,0.45)",
              background: dupReview ? "rgba(245,158,11,0.10)" : "transparent",
              color: "#b45309",
              fontSize: "var(--fs-meta)", fontWeight: 500, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (!dupReview) e.currentTarget.style.background = "rgba(245,158,11,0.06)"; }}
            onMouseLeave={e => { if (!dupReview) e.currentTarget.style.background = "transparent"; }}
          >
            ◇ Review duplicates
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 18, height: 16, padding: "0 5px",
              borderRadius: 100,
              background: dupReview ? "#b45309" : "rgba(245,158,11,0.18)",
              color: dupReview ? "white" : "#b45309",
              fontSize: 10.5, fontWeight: 600,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}>
              {possibleDupGroupCount}
            </span>
            {newDupGroupCount > 0 && (
              <span
                title={`${newDupGroupCount} new since your last visit`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "0 7px", height: 16,
                  borderRadius: 100,
                  background: "#dc2626", color: "white",
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
                }}
              >
                {newDupGroupCount} new
              </span>
            )}
          </button>
        )}

        <FilterGroup label="Status">
          <StatusFilter
            value={filters.status}
            onChange={v => setFilters({
              status: filters.status.includes(v)
                ? filters.status.filter(x => x !== v)
                : [...filters.status, v],
            })}
            onClear={() => setFilters({ status: [] })}
          />
          <PriorityFilter
            value={filters.priority}
            onChange={v => setFilters({
              priority: filters.priority.includes(v)
                ? filters.priority.filter(x => x !== v)
                : [...filters.priority, v],
            })}
            onClear={() => setFilters({ priority: [] })}
          />
        </FilterGroup>

        {sep}

        <FilterGroup label="Work">
          <WorkFilterButton
            value={filters.workItem}
            onChange={v => setFilters({
              workItem: filters.workItem.includes(v)
                ? filters.workItem.filter(x => x !== v)
                : [...filters.workItem, v],
            })}
            onClear={() => setFilters({ workItem: [] })}
          />
        </FilterGroup>

        {sep}

        <FilterGroup label="Duplicates">
          <DuplicateFilterButton
            value={filters.duplicate}
            onChange={v => setFilters({
              duplicate: filters.duplicate.includes(v)
                ? filters.duplicate.filter(x => x !== v)
                : [...filters.duplicate, v],
            })}
            onClear={() => setFilters({ duplicate: [] })}
          />
        </FilterGroup>

        {sep}

        <FilterGroup label="Attributes">
          <AttributeFilterButton
            value={filters.attribute}
            onChange={v => setFilters({
              attribute: filters.attribute.includes(v)
                ? filters.attribute.filter(x => x !== v)
                : [...filters.attribute, v],
            })}
            onClear={() => setFilters({ attribute: [] })}
          />
        </FilterGroup>

        {sep}

        <FilterGroup label="Metadata">
          <MetaFilter
            label="Author"
            options={authorOpts}
            selected={filters.author}
            onToggle={v => setFilters({ author: filters.author.includes(v) ? filters.author.filter(x => x !== v) : [...filters.author, v] })}
            onClear={() => setFilters({ author: [] })}
            activeLabel={filters.author.length === 1 ? USERS.find(u => u.id === filters.author[0])?.name ?? "Author" : `${filters.author.length} authors`}
            width={160}
          />
          <MetaFilter
            label="Source"
            options={sourceOpts}
            selected={filters.source}
            onToggle={v => setFilters({ source: filters.source.includes(v) ? filters.source.filter(x => x !== v) : [...filters.source, v] })}
            onClear={() => setFilters({ source: [] })}
            activeLabel={filters.source.length === 1 ? filters.source[0] : `${filters.source.length} sources`}
            width={140}
          />
          <LabelFilterButton
            allLabels={allLabels}
            selected={filters.labels}
            onToggle={v => setFilters({
              labels: filters.labels.includes(v)
                ? filters.labels.filter(x => x !== v)
                : [...filters.labels, v],
            })}
            onClear={() => setFilters({ labels: [] })}
            recentLabels={recentLabels}
          />
        </FilterGroup>

        {hasFilters && (
          <button
            onClick={() => setFilters({ status: [], priority: [], author: [], source: [], labels: [], workItem: [], duplicate: [], attribute: [] })}
            style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", padding: "3px 6px", borderRadius: "var(--radius-sm)", border: "none", background: "transparent", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {view === "columns" && <ColumnView signals={flatFiltered} activeRule={activeRule} searchHiddenMatches={searchHiddenMatches} />}
        {view === "grid"    && <GridView   signals={flatFiltered} activeRule={activeRule} searchHiddenMatches={searchHiddenMatches} />}
        {view === "list"    && <ListView   signals={flatFiltered} activeRule={activeRule} searchHiddenMatches={searchHiddenMatches} />}
      </div>

      {!readOnly && <SelectionBar />}
      <SignalModal />
      {reportOpen && <ClientReportModal onClose={() => setReportOpen(false)} />}
      {/* Post-create banner — surfaces after a multi-select Create task /
          Create intent. Self-mounts based on store state. */}
      <PostCreatePromptBanner />
    </div>
  );
}


// suppress unused-import warning for hideUnderKey (kept available for callers/devtools)
void hideUnderKey;
