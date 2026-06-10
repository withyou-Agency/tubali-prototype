"use client";
import React, { useMemo, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  SignalGroup, SignalGroupReason, SIGNAL_GROUP_REASON_LABEL, SIGNAL_GROUP_STATUS_LABEL,
  DraftIntent,
} from "@/lib/data";
import { relTime, absDate } from "@/lib/time";
import { StatusDot } from "@/components/ui/dot";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelChip } from "@/components/ui/label-chip";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Layers, Grid, List, Paperclip, Tag, Task, Intent, X, Check, Feedback, Note as NoteIcon, Image, ChevronDown, ChevronRight, Copy } from "@/components/ui/icons";
import { HiddenCountBadge, HiddenMatchBadge, TaskCreatedBadge, IntentCreatedBadge, ClosedBadge, DuplicateBadge, StaleBadge } from "@/components/ui/related-badge";
import { SignalModal } from "@/components/signal-modal";
import { SplitSignalModal } from "@/components/split-signal-modal";
import { LabelPicker } from "@/components/ui/label-picker";
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
  const {
    selection, clearSelection, bulkSetStatus, bulkAddLabel, signals, createWorkItem, filters,
    signalGroupFilter, signalGroups, removeSignalsFromGroup,
    markSignalsAsDuplicatesOf, closeSignalAsDuplicateOf, linkSignalToWip, wipItems,
    createDraftIntent, linkGroupToExistingIntent,
  } = useStore();
  const [showCreateDraft, setShowCreateDraft] = useState(false);
  // Bulk-split queue — array of signalIds the user wants to split, in
  // order. The first id is the one currently open in the SplitSignalModal;
  // after Cancel or submit we shift the head off and either keep the
  // modal open with the next id or close out when empty.
  const [splitQueue, setSplitQueue] = useState<string[]>([]);
  // Snapshot of how many signals were in the queue when the bulk flow
  // started, so the modal banner can read "Splitting 2 of 4" instead of
  // "Splitting 2 of 2" as items get shifted off.
  const [splitQueueTotal, setSplitQueueTotal] = useState(0);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [createForm, setCreateForm] = useState<CreateWorkForm | null>(null);
  const [showHideUnder, setShowHideUnder] = useState(false);
  const [showSaveAsGroup, setShowSaveAsGroup] = useState(false);
  if (selection.length === 0) return null;

  const selectedSignals = signals.filter(s => selection.includes(s.id));
  // `allAccepted` used to gate Create task / Create intent; that gate
  // was removed so the actions stay always-available. Kept here as a
  // helper in case future flows want it back. (eslint silences unused.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      {/* The action bar used to be `whiteSpace: nowrap` + `borderRadius:
          100` which clipped buttons off the right edge once the
          group-scoped actions joined the row. Now it allows flex-wrap
          across rows, caps its width to ~95vw so it never spills the
          viewport, and uses a softer radius so the multi-line shape
          reads cleanly. Centering is preserved by the parent
          `transform: translateX(-50%)` wrapper. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, padding: "10px 14px",
        background: "#0f0f11", borderRadius: 16, boxShadow: "var(--shadow-lg)",
        color: "white", fontSize: "var(--fs-body)", animation: "slideUp 0.18s ease",
        flexWrap: "wrap",
        maxWidth: "min(1200px, 95vw)",
      }}>
        <span style={{ fontWeight: 500 }}>Selected {selection.length}</span>
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

        {/* Create work item — Task or Intent — straight from the
            selection. Always available; if any source signal isn't
            Ready yet, the submit step shows a confirm dialog so the
            user can opt in. (Previously gated behind `allAccepted`,
            which hid the action until status was right.) */}
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
        <button
          onClick={() => openForm("task")}
          title="Create a task from the selected signals"
          style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: createForm?.type === "task" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}
        >
          <Task size={12} /> Create task
        </button>
        <button
          onClick={() => openForm("intent")}
          title="Create an intent from the selected signals"
          style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5, background: createForm?.type === "intent" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}
        >
          <Intent size={12} /> Create intent
        </button>

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

        {/* "Group review" (the old temporary review flow) was removed
            here — the persistent SignalGroup flow below replaces it.
            Saved groups are reachable via the Saved Groups pill in the
            toolbar; creating one happens via "Save as group" below. */}

        {/* Save selected as a SignalGroup — opens a small modal that
            lets the user create a new persistent group or add the
            selection to an existing one. Groups are many-to-many: the
            same signal can sit in multiple groups. */}
        {selection.length >= 2 && (
          <button
            onClick={() => { setShowSaveAsGroup(true); setCreateForm(null); setShowLabelPicker(false); setShowHideUnder(false); }}
            title="Save selected signals as a persistent group, or add them to an existing group"
            style={{
              ...darkBtn,
              display: "flex", alignItems: "center", gap: 5,
              background: showSaveAsGroup ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
            }}
          >
            ⚙ Save as group
          </button>
        )}


        {/* Group-scoped bulk actions — only when a SignalGroup workspace
            is open. Keeps the in-group review flow self-contained while
            leaving the standard SelectionBar actions available for the
            same selection. */}
        {signalGroupFilter && (() => {
          const activeGroup = signalGroups.find(g => g.id === signalGroupFilter);
          if (!activeGroup) return null;
          // Only act on selected signals that are actually members of
          // the active group — defensive against selection drift if the
          // group changes while the user is mid-action.
          const inGroupSelection = selection.filter(id => activeGroup.signalIds.includes(id));
          if (inGroupSelection.length === 0) return null;
          return (
            <>
              <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
              <button
                onClick={() => {
                  if (window.confirm(`Remove ${inGroupSelection.length} signal${inGroupSelection.length === 1 ? "" : "s"} from "${activeGroup.name}"? The signals stay; only the grouping link is removed.`)) {
                    removeSignalsFromGroup(activeGroup.id, inGroupSelection);
                    clearSelection();
                  }
                }}
                style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 5 }}
                title="Remove the selected signals from this group"
              >
                ✕ Remove from group
              </button>
              <MarkAsDuplicatesButton
                selectedIds={inGroupSelection}
                onApply={(mainId, otherIds) => {
                  markSignalsAsDuplicatesOf(mainId, otherIds);
                  clearSelection();
                }}
                signals={signals}
              />
              <CloseAsDuplicateButton
                selectedIds={inGroupSelection}
                onApply={(mainId, otherIds) => {
                  // Mark first so the duplicate group exists, then close
                  // each "other" signal with the structured duplicate
                  // closure note. The main stays open.
                  markSignalsAsDuplicatesOf(mainId, otherIds);
                  otherIds.forEach(id => closeSignalAsDuplicateOf(id, mainId));
                  clearSelection();
                }}
                signals={signals}
              />
              <LinkToIntentButton
                selectedIds={inGroupSelection}
                wipItems={wipItems}
                onApply={(intentId, ids) => {
                  // Use the group-aware action so the group's linkedIntentIds
                  // also updates — this is the "Link group to existing
                  // intent" flow per the spec.
                  linkGroupToExistingIntent(activeGroup.id, intentId, ids);
                  clearSelection();
                }}
              />
              {/* Create draft intent from the selected signals — opens
                  a modal where the user can edit title / description /
                  notes / suggested tasks before saving the draft to the
                  group. */}
              <button
                onClick={() => { setShowCreateDraft(true); }}
                title="Create a draft intent from the selected signals"
                style={{
                  ...darkBtn, display: "flex", alignItems: "center", gap: 5,
                  background: showCreateDraft ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
                }}
              >
                ✦ Create draft intent
              </button>
              {/* Split selected signals. With 1 selected it opens the
                  existing SplitSignalModal directly. With 2+ it queues
                  them up and walks through one at a time — the modal
                  shows "Splitting N of M" so the user knows where they
                  are in the bulk flow. Cancel skips the current signal
                  but advances to the next one. */}
              <button
                onClick={() => {
                  setSplitQueue(inGroupSelection.slice());
                  setSplitQueueTotal(inGroupSelection.length);
                }}
                title={inGroupSelection.length === 1
                  ? "Split this signal into multiple clearer child signals"
                  : `Walk through ${inGroupSelection.length} signals and split each into clearer children`}
                style={{
                  ...darkBtn, display: "flex", alignItems: "center", gap: 5,
                  background: splitQueue.length > 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
                }}
              >
                ✂ Split
              </button>
            </>
          );
        })()}

        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />

        <button onClick={() => { clearSelection(); setCreateForm(null); }} style={{ ...darkBtn, display: "flex", alignItems: "center", gap: 4 }}>
          <X size={12} /> Esc
        </button>
      </div>

      {showSaveAsGroup && (
        <SaveAsGroupModal
          signalIds={selection}
          onClose={() => setShowSaveAsGroup(false)}
        />
      )}

      {showCreateDraft && signalGroupFilter && (() => {
        const activeGroup = signalGroups.find(g => g.id === signalGroupFilter);
        if (!activeGroup) return null;
        const inGroupSelection = selection.filter(id => activeGroup.signalIds.includes(id));
        if (inGroupSelection.length === 0) {
          setShowCreateDraft(false);
          return null;
        }
        return (
          <DraftIntentEditModal
            mode="create"
            groupId={activeGroup.id}
            initialSignalIds={inGroupSelection}
            onClose={() => setShowCreateDraft(false)}
            onCreate={(input) => {
              createDraftIntent({
                groupId: activeGroup.id,
                title: input.title,
                description: input.description,
                signalIds: input.signalIds,
                notes: input.notes,
                suggestedTasks: input.suggestedTasks,
                acceptanceCriteria: input.acceptanceCriteria,
                context: input.context,
                decisionRationale: input.decisionRationale,
                rejectedAlternatives: input.rejectedAlternatives,
                plan: input.plan,
              });
              clearSelection();
              setShowCreateDraft(false);
            }}
          />
        );
      })()}

      {/* Bulk-split queue — renders the existing SplitSignalModal for
          whichever signal is at the head of the queue. After the modal
          calls onClose (Cancel or successful split) we shift the head
          off and either keep the modal up with the next signal or close
          out entirely when the queue empties. */}
      {splitQueue.length > 0 && (() => {
        const currentId = splitQueue[0];
        const positionLabel = splitQueueTotal > 1
          ? `Splitting ${splitQueueTotal - splitQueue.length + 1} of ${splitQueueTotal}`
          : null;
        const advance = () => {
          setSplitQueue(prev => prev.slice(1));
        };
        return (
          <BulkSplitFrame
            label={positionLabel}
            onAbort={() => { setSplitQueue([]); setSplitQueueTotal(0); }}
          >
            <SplitSignalModal
              key={currentId}
              signalId={currentId}
              onClose={advance}
            />
          </BulkSplitFrame>
        );
      })()}
    </div>
  );
}

// Tiny floating banner shown while the bulk-split queue is active.
// Sits at the top of the viewport above the SplitSignalModal so the
// user sees "Splitting 2 of 4" and can bail out of the whole bulk
// flow with one click. Rendered via portal so it isn't trapped under
// any transform-containing ancestor.
function BulkSplitFrame({
  label, onAbort, children,
}: {
  label: string | null;
  onAbort: () => void;
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return <>{children}</>;
  return (
    <>
      {children}
      {label && createPortal((
        <div style={{
          position: "fixed",
          top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 800,
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "5px 12px 5px 14px",
          background: "var(--bg)",
          border: "1px solid var(--accent)",
          borderRadius: 100,
          boxShadow: "var(--shadow-lg)",
          fontSize: 11.5, fontWeight: 600,
          color: "var(--accent)",
        }}>
          {label}
          <button
            onClick={onAbort}
            title="Stop the bulk-split queue (the current signal's drafts will be discarded too)"
            style={{
              padding: "2px 8px", borderRadius: 100,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: 10.5, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Stop bulk split
          </button>
        </div>
      ), document.body)}
    </>
  );
}

// ── Process modal (thinking placeholder) ──────────────────────────────────
// Shows a spinner + "thinking" message while we figure out what real
// processing should do. Click Close (or Esc) to dismiss. Nothing is
// persisted, no transactions, no records.

// ── SavedGroupsButton ──────────────────────────────────────────────────
// Toolbar pill that opens a popover listing every saved SignalGroup.
// Each row shows the group name, signal count, status, reasons, and
// last-updated time. Clicking a row sets the active group filter on
// the Signals list (via openGroup); the popover stays open so the
// user can scan + switch quickly.
// Toolbar Groups button — pure navigation. Clicking opens the dedicated
// Groups view in the main content area; clicking again returns to the
// standard Signals list. The previous dropdown/popover-style listing
// has been retired in favour of the full Groups view.
function SavedGroupsButton() {
  const { signalGroups, signalsViewMode, setSignalsViewMode, openGroup } = useStore();
  const active = signalsViewMode === "groups";
  return (
    <button
      onClick={() => {
        // Always close any open group workspace first so the user lands
        // on the Groups list, then flip view mode.
        openGroup(null);
        setSignalsViewMode(active ? "list" : "groups");
      }}
      title={active ? "Back to the Signals list" : "Open the saved groups view"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 28, padding: "0 10px",
        borderRadius: 100,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "var(--accent-soft)" : "var(--bg)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontSize: "var(--fs-meta)", fontWeight: 500,
        cursor: "pointer",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--bg)"; }}
    >
      ⊞ Groups
      <span style={{
        minWidth: 18, height: 16, padding: "0 4px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 100,
        background: active ? "var(--bg)" : "var(--bg-sunken)",
        border: "1px solid var(--border)",
        fontSize: 10.5, fontWeight: 500,
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      }}>{signalGroups.length}</span>
    </button>
  );
}

// Dead branch kept here so the old popover structure can be reused if
// we re-introduce a quick-access shortcut in the future. The component
// is not exported and is not referenced anywhere after the rewrite.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _LegacySavedGroupsPopover() {
  const { signalGroups, signalGroupFilter, openGroup, deleteSignalGroup, updateSignalGroup } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          width: 420, maxHeight: 460, display: "flex", flexDirection: "column",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "8px 12px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              Saved signal groups · {signalGroups.length}
            </span>
            {signalGroupFilter && (
              <>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => openGroup(null)}
                  style={{
                    padding: "2px 8px", borderRadius: 100,
                    border: "1px dashed var(--border-strong)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Clear filter
                </button>
              </>
            )}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {signalGroups.length === 0 ? (
              <div style={{ padding: 16, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.55 }}>
                No saved groups yet. Select multiple signals and use <strong style={{ color: "var(--text-secondary)" }}>Save as group</strong> in the selection bar.
              </div>
            ) : signalGroups.map(g => {
              const isActive = signalGroupFilter === g.id;
              return (
                <div
                  key={g.id}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    background: isActive ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => { openGroup(isActive ? null : g.id); }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      flex: 1, minWidth: 0,
                      fontSize: "var(--fs-body)", fontWeight: 600,
                      color: isActive ? "var(--accent)" : "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {g.name}
                    </span>
                    <span title="Group status" style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                      color: g.status === "open" ? "#1d4ed8" : g.status === "in_review" ? "#b45309" : "var(--text-tertiary)",
                      background: g.status === "open" ? "rgba(59,130,246,0.12)" : g.status === "in_review" ? "rgba(245,158,11,0.12)" : "var(--bg-sunken)",
                      border: `1px solid ${g.status === "open" ? "rgba(59,130,246,0.45)" : g.status === "in_review" ? "rgba(245,158,11,0.45)" : "var(--border)"}`,
                      borderRadius: 100, padding: "1px 7px",
                      whiteSpace: "nowrap",
                    }}>
                      {SIGNAL_GROUP_STATUS_LABEL[g.status]}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`Delete group "${g.name}"? Signals stay; only the grouping is removed.`)) {
                          if (signalGroupFilter === g.id) openGroup(null);
                          deleteSignalGroup(g.id);
                        }
                      }}
                      title="Delete group"
                      aria-label="Delete group"
                      style={{
                        padding: 2, color: "var(--text-tertiary)",
                        background: "transparent", border: "none", cursor: "pointer",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                      {g.signalIds.length} signal{g.signalIds.length === 1 ? "" : "s"}
                    </span>
                    {g.updatedAt && (
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        · updated {relTime(g.updatedAt)}
                      </span>
                    )}
                    {g.reasons.length > 0 && (
                      <>
                        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>·</span>
                        {g.reasons.slice(0, 3).map(r => (
                          <span key={r} style={{
                            fontSize: 10, fontWeight: 500,
                            color: "var(--text-secondary)",
                            background: "var(--bg-sunken)",
                            border: "1px solid var(--border)",
                            borderRadius: 100, padding: "1px 7px",
                            whiteSpace: "nowrap",
                          }}>
                            {SIGNAL_GROUP_REASON_LABEL[r]}
                          </span>
                        ))}
                        {g.reasons.length > 3 && (
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                            +{g.reasons.length - 3}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {g.notes && (
                    <div style={{
                      fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as const,
                    }}>
                      {g.notes}
                    </div>
                  )}
                  {/* Inline status cycle — quick way to mark the group in-review or archived. */}
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                    {(["open", "in_review", "archived"] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateSignalGroup(g.id, { status: s })}
                        style={{
                          padding: "1px 8px", borderRadius: 100,
                          border: g.status === s ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: g.status === s ? "var(--accent-soft)" : "var(--bg)",
                          color: g.status === s ? "var(--accent)" : "var(--text-tertiary)",
                          fontSize: 10, fontWeight: 500, cursor: "pointer",
                        }}
                      >
                        {SIGNAL_GROUP_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Group-scoped SelectionBar buttons ───────────────────────────────────
// Each shows up only when the SignalGroup workspace is open. They share
// a tiny popover pattern: the button opens a list of the selected
// signals, the user picks a "main" (or an intent), and Apply commits.

function MarkAsDuplicatesButton({
  selectedIds, signals, onApply,
}: {
  selectedIds: string[];
  signals: Signal[];
  onApply: (mainId: string, otherIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mainId, setMainId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => { if (open) setMainId(selectedIds[0] ?? null); }, [open, selectedIds]);
  const items = signals.filter(s => selectedIds.includes(s.id));
  // Disabled at < 2 — need a main + at least one duplicate.
  const disabled = selectedIds.length < 2;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title={disabled ? "Select 2+ signals to mark them as duplicates" : "Mark selected signals as duplicates of one main"}
        style={{
          ...darkBtn, display: "flex", alignItems: "center", gap: 5,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          background: open ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
        }}
      >
        ⤜ Mark as duplicates
      </button>
      {open && (
        <DupPickerPopover
          items={items}
          mainId={mainId}
          setMainId={setMainId}
          actionLabel="Mark"
          helper="The signals you mark stay open; their duplicate relationship is recorded so a fix on the main can satisfy them too."
          onCancel={() => setOpen(false)}
          onApply={() => {
            if (!mainId) return;
            const others = selectedIds.filter(id => id !== mainId);
            if (others.length === 0) return;
            onApply(mainId, others);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CloseAsDuplicateButton({
  selectedIds, signals, onApply,
}: {
  selectedIds: string[];
  signals: Signal[];
  onApply: (mainId: string, otherIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mainId, setMainId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => { if (open) setMainId(selectedIds[0] ?? null); }, [open, selectedIds]);
  const items = signals.filter(s => selectedIds.includes(s.id));
  const disabled = selectedIds.length < 2;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title={disabled ? "Select 2+ signals to close some as duplicates" : "Close every signal except the main, with a 'duplicate of …' closure note"}
        style={{
          ...darkBtn, display: "flex", alignItems: "center", gap: 5,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          background: open ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
        }}
      >
        ⌫ Close as duplicate
      </button>
      {open && (
        <DupPickerPopover
          items={items}
          mainId={mainId}
          setMainId={setMainId}
          actionLabel="Close others"
          helper="Closes every other selected signal with a 'Closed as duplicate of …' note. The main stays open."
          onCancel={() => setOpen(false)}
          onApply={() => {
            if (!mainId) return;
            const others = selectedIds.filter(id => id !== mainId);
            if (others.length === 0) return;
            if (!window.confirm(`Close ${others.length} signal${others.length === 1 ? "" : "s"} as duplicate${others.length === 1 ? "" : "s"} of the chosen main?`)) return;
            onApply(mainId, others);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Shared "pick a main signal" popover used by both buttons above.
function DupPickerPopover({
  items, mainId, setMainId, onApply, onCancel, actionLabel, helper,
}: {
  items: Signal[];
  mainId: string | null;
  setMainId: (id: string) => void;
  onApply: () => void;
  onCancel: () => void;
  actionLabel: string;
  helper: string;
}) {
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 200,
      width: 360, background: "var(--bg)",
      border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-lg)", padding: 12,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        Pick the main signal
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
        {items.map(s => {
          const isMain = mainId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setMainId(s.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 9px", textAlign: "left",
                border: isMain ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: isMain ? "var(--accent-soft)" : "var(--bg)",
                cursor: "pointer",
              }}
            >
              <span style={{
                width: 12, height: 12, borderRadius: 100,
                border: isMain ? "3px solid var(--accent)" : "1.5px solid var(--border-strong)",
                background: isMain ? "var(--accent)" : "transparent",
                flexShrink: 0, boxSizing: "border-box",
              }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.title}
              </span>
              <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                {s.status}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
        {helper}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button onClick={onCancel} style={{
          padding: "4px 10px", borderRadius: "var(--radius)",
          background: "transparent", color: "var(--text-secondary)",
          border: "1px solid var(--border)", fontSize: 11, cursor: "pointer",
        }}>Cancel</button>
        <button
          onClick={onApply}
          disabled={!mainId}
          style={{
            padding: "4px 12px", borderRadius: "var(--radius)",
            background: mainId ? "var(--accent)" : "var(--bg-sunken)",
            color: mainId ? "white" : "var(--text-tertiary)",
            border: "none", fontSize: 11, fontWeight: 600,
            cursor: mainId ? "pointer" : "not-allowed",
          }}
        >{actionLabel}</button>
      </div>
    </div>
  );
}

function LinkToIntentButton({
  selectedIds, wipItems, onApply,
}: {
  selectedIds: string[];
  wipItems: import("@/lib/data").Wip[];
  onApply: (intentId: string, signalIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedIntentId, setPickedIntentId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const intents = wipItems.filter(w => w.type === "intent");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? intents.filter(w => w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
    : intents;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Link selected signals to an existing intent"
        style={{
          ...darkBtn, display: "flex", alignItems: "center", gap: 5,
          background: open ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)",
        }}
      >
        ⇢ Link to intent
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 200,
          width: 360, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", padding: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Pick an intent · links {selectedIds.length} signal{selectedIds.length === 1 ? "" : "s"}
          </div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search intents…"
            style={{
              padding: "5px 9px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: 11, outline: "none",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 8, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                No intents match.
              </div>
            ) : filtered.map(w => {
              const isPicked = pickedIntentId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setPickedIntentId(w.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 9px", textAlign: "left",
                    border: isPicked ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: isPicked ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.title}
                  </span>
                  <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                    {w.column.replace("_", " ")}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
            Each linked signal flips to <strong style={{ color: "var(--text-secondary)" }}>Ready</strong> (existing rule) and gets a <em>Contributes to (source signal)</em> relationship by default.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button onClick={() => setOpen(false)} style={{
              padding: "4px 10px", borderRadius: "var(--radius)",
              background: "transparent", color: "var(--text-secondary)",
              border: "1px solid var(--border)", fontSize: 11, cursor: "pointer",
            }}>Cancel</button>
            <button
              onClick={() => {
                if (!pickedIntentId) return;
                onApply(pickedIntentId, selectedIds);
                setOpen(false);
              }}
              disabled={!pickedIntentId}
              style={{
                padding: "4px 12px", borderRadius: "var(--radius)",
                background: pickedIntentId ? "var(--accent)" : "var(--bg-sunken)",
                color: pickedIntentId ? "white" : "var(--text-tertiary)",
                border: "none", fontSize: 11, fontWeight: 600,
                cursor: pickedIntentId ? "pointer" : "not-allowed",
              }}
            >Link</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SignalGroupWorkspaceBanner ─────────────────────────────────────────
// Compact "workspace" panel rendered above the Signals list whenever a
// SignalGroup is active. Its job is to keep the group's context — name,
// notes, status, reasons — visible while the user reviews the member
// signals in the list below. Editing each field happens inline (click
// to edit) so the panel stays compact.
//
// Bulk actions live in the existing SelectionBar at the bottom; when a
// group is open AND signals are selected, the SelectionBar shows extra
// group-scoped actions (remove from group, mark as duplicates, close as
// duplicate). That keeps action UX consistent with the rest of Signals.
function SignalGroupWorkspaceBanner({ groupId }: { groupId: string }) {
  const { signalGroups, updateSignalGroup, deleteSignalGroup, openGroup } = useStore();
  const group = signalGroups.find(g => g.id === groupId);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group?.name ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(group?.notes ?? "");
  useEffect(() => {
    setNameDraft(group?.name ?? "");
    setNotesDraft(group?.notes ?? "");
  }, [groupId, group?.name, group?.notes]);
  if (!group) return null;

  const toggleReason = (r: SignalGroupReason) => {
    const next = group.reasons.includes(r)
      ? group.reasons.filter(x => x !== r)
      : [...group.reasons, r];
    updateSignalGroup(group.id, { reasons: next });
  };

  const statusPalette: Record<typeof group.status, { bg: string; fg: string; bd: string }> = {
    open:      { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
    in_review: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", bd: "rgba(245,158,11,0.45)" },
    archived:  { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const sp = statusPalette[group.status];

  return (
    <div data-keep-selection="group-workspace" style={{
      padding: "12px 16px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-sunken)",
      display: "flex", flexDirection: "column", gap: 10,
      flexShrink: 0,
    }}>
      {/* Header row — name, status pill, signal count, archive/delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Group workspace
        </span>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={() => { updateSignalGroup(group.id, { name: nameDraft.trim() || group.name }); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateSignalGroup(group.id, { name: nameDraft.trim() || group.name }); setEditingName(false); }
              else if (e.key === "Escape") { setNameDraft(group.name); setEditingName(false); }
            }}
            style={{
              flex: 1, minWidth: 0,
              fontSize: 15, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "3px 8px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setNameDraft(group.name); setEditingName(true); }}
            style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: 15, fontWeight: 600, color: "var(--text)", cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title="Click to rename"
          >
            {group.name}
          </button>
        )}
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {group.signalIds.length} signal{group.signalIds.length === 1 ? "" : "s"}
        </span>
        <div style={{ display: "inline-flex", gap: 3 }}>
          {(["open", "in_review", "archived"] as const).map(s => {
            const active = group.status === s;
            const palette = statusPalette[s];
            return (
              <button
                key={s}
                onClick={() => updateSignalGroup(group.id, { status: s })}
                title={`Set group status to ${SIGNAL_GROUP_STATUS_LABEL[s]}`}
                style={{
                  padding: "2px 8px", borderRadius: 100,
                  border: `1px solid ${active ? palette.bd : "var(--border)"}`,
                  background: active ? palette.bg : "var(--bg)",
                  color: active ? palette.fg : "var(--text-tertiary)",
                  fontSize: 10, fontWeight: 600, cursor: "pointer",
                  letterSpacing: 0.2,
                }}
              >
                {SIGNAL_GROUP_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => openGroup(null)}
          title="Close workspace (clears the group filter)"
          style={{
            padding: "2px 10px", borderRadius: 100,
            border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--text-secondary)",
            fontSize: 10.5, fontWeight: 500, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Close workspace
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete group "${group.name}"? Signals stay; only the grouping is removed. Actions you've taken on those signals (status, duplicates, intent links, notes) are preserved.`)) {
              openGroup(null);
              deleteSignalGroup(group.id);
            }
          }}
          aria-label="Delete group"
          title="Delete this group"
          style={{
            padding: 4, color: "var(--text-tertiary)",
            background: "transparent", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Reasons — click chips to toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Reasons
        </span>
        {(Object.keys(SIGNAL_GROUP_REASON_LABEL) as SignalGroupReason[]).map(r => {
          const on = group.reasons.includes(r);
          return (
            <button
              key={r}
              onClick={() => toggleReason(r)}
              style={{
                padding: "2px 9px", borderRadius: 100,
                border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: on ? "var(--accent-soft)" : "var(--bg)",
                color: on ? "var(--accent)" : "var(--text-tertiary)",
                fontSize: 10.5, fontWeight: 500, cursor: "pointer",
              }}
            >
              {SIGNAL_GROUP_REASON_LABEL[r]}
            </button>
          );
        })}
      </div>

      {/* Notes — click to edit. Distinct from per-signal notes. */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
          Group notes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· persistent, scoped to this group</span>
        </div>
        {editingNotes ? (
          <textarea
            autoFocus
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            onBlur={() => { updateSignalGroup(group.id, { notes: notesDraft }); setEditingNotes(false); }}
            rows={2}
            placeholder="What's the connection between these signals?"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 9px",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", lineHeight: 1.5, outline: "none",
              resize: "vertical",
            }}
          />
        ) : group.notes ? (
          <button
            onClick={() => { setNotesDraft(group.notes ?? ""); setEditingNotes(true); }}
            style={{
              width: "100%", textAlign: "left",
              padding: "6px 9px", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", background: "var(--bg)",
              color: "var(--text-secondary)", fontSize: "var(--fs-body)", lineHeight: 1.5,
              cursor: "text",
            }}
            title="Click to edit notes"
          >
            {group.notes}
          </button>
        ) : (
          <button
            onClick={() => { setNotesDraft(""); setEditingNotes(true); }}
            style={{
              padding: "3px 6px", fontSize: 11, color: "var(--text-tertiary)",
              background: "transparent", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            + Add notes
          </button>
        )}
      </div>

      {/* Draft + Linked intents — group-level rollup of what work is
          coming out of this group. Drafts are editable planning records;
          finalized intents are read-only references to real Wips. */}
      <GroupWorkspaceIntentsBlock group={group} />
    </div>
  );
}

// ── GroupWorkspaceIntentsBlock ──────────────────────────────────────────
// Two stacked sections rendered inside the workspace banner:
//   • Draft intents — every DraftIntent for this group that hasn't been
//     finalized yet. Each row supports edit / delete / finalize.
//   • Linked finalized intents — every Wip the group has been connected
//     to (either by finalizing a draft, or by explicitly linking to an
//     existing intent). Clicking a row opens the Wip in its modal.
function GroupWorkspaceIntentsBlock({ group }: { group: SignalGroup }) {
  const { draftIntents, wipItems, deleteDraftIntent, finalizeDraftIntent, openWip, setRoute } = useStore();
  const drafts   = draftIntents.filter(d => d.groupId === group.id && !d.finalizedWipId);
  const finalized = draftIntents
    .filter(d => d.groupId === group.id && !!d.finalizedWipId)
    .map(d => ({ draft: d, wip: wipItems.find(w => w.id === d.finalizedWipId!) }))
    .filter((x): x is { draft: DraftIntent; wip: import("@/lib/data").Wip } => !!x.wip);
  const linkedWithoutDraft = group.linkedIntentIds
    .filter(id => !finalized.some(f => f.wip.id === id))
    .map(id => wipItems.find(w => w.id === id))
    .filter((w): w is import("@/lib/data").Wip => !!w);

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Don't render the block at all if there's nothing to show — keeps the
  // workspace banner compact for groups in their early review phase.
  if (drafts.length === 0 && finalized.length === 0 && linkedWithoutDraft.length === 0) {
    return null;
  }

  const openIntent = (wipId: string) => {
    setRoute("wip");
    openWip(wipId);
  };

  return (
    <>
      {drafts.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Draft intents · {drafts.length}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
              · planning-only; not on the Kanban yet
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {drafts.map(d => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px",
                border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius)",
                background: "var(--bg)",
              }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                  color: "var(--text-tertiary)",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border)",
                  borderRadius: 100, padding: "1px 7px",
                  whiteSpace: "nowrap",
                }}>
                  DRAFT
                </span>
                <button
                  onClick={() => setEditingDraftId(d.id)}
                  style={{
                    flex: 1, minWidth: 0, textAlign: "left",
                    background: "transparent", border: "none", padding: 0,
                    cursor: "pointer",
                  }}
                  title="Edit this draft"
                >
                  <div style={{
                    fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {d.signalIds.length} signal{d.signalIds.length === 1 ? "" : "s"}
                    {d.suggestedTasks.length > 0 && <> · {d.suggestedTasks.length} suggested task{d.suggestedTasks.length === 1 ? "" : "s"}</>}
                  </div>
                </button>
                <button
                  onClick={() => setEditingDraftId(d.id)}
                  style={{
                    padding: "3px 10px", borderRadius: "var(--radius)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontSize: 11, cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (d.signalIds.length === 0) {
                      window.alert("Add at least one linked signal before finalizing the draft.");
                      return;
                    }
                    if (!window.confirm(`Finalize draft "${d.title}" into a real intent? It will appear on the Kanban under To do.`)) return;
                    const newId = finalizeDraftIntent(d.id);
                    if (newId) {
                      // Optional: jump straight to the new intent so the
                      // user can keep editing in the WIP modal.
                      openIntent(newId);
                    }
                  }}
                  title="Promote this draft to a real intent on the Kanban"
                  style={{
                    padding: "3px 10px", borderRadius: "var(--radius)",
                    background: "var(--accent)", color: "white",
                    border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Finalize
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete draft "${d.title}"? Signals stay; only the draft record is removed.`)) {
                      deleteDraftIntent(d.id);
                    }
                  }}
                  aria-label="Delete draft"
                  title="Delete this draft"
                  style={{
                    padding: 4, color: "var(--text-tertiary)",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(finalized.length > 0 || linkedWithoutDraft.length > 0) && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Linked finalized intents · {finalized.length + linkedWithoutDraft.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {finalized.map(({ draft, wip }) => (
              <div key={draft.id} style={intentRowStyle()}>
                <span style={intentBadgeStyle()}>INTENT</span>
                <button
                  onClick={() => openIntent(wip.id)}
                  style={{
                    flex: 1, minWidth: 0, textAlign: "left",
                    background: "transparent", border: "none", padding: 0,
                    cursor: "pointer",
                  }}
                  title="Open the intent on the Kanban"
                >
                  <div style={{
                    fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {wip.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {wip.linkedSignals.length} signal{wip.linkedSignals.length === 1 ? "" : "s"} · {columnLabelFor(wip.column)}
                    {" "}· from draft &ldquo;{draft.title}&rdquo;
                  </div>
                </button>
                <span style={columnPillStyle(wip.column)}>{columnLabelFor(wip.column)}</span>
              </div>
            ))}
            {linkedWithoutDraft.map(wip => (
              <div key={wip.id} style={intentRowStyle()}>
                <span style={intentBadgeStyle()}>INTENT</span>
                <button
                  onClick={() => openIntent(wip.id)}
                  style={{
                    flex: 1, minWidth: 0, textAlign: "left",
                    background: "transparent", border: "none", padding: 0,
                    cursor: "pointer",
                  }}
                  title="Open the intent on the Kanban"
                >
                  <div style={{
                    fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {wip.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {wip.linkedSignals.length} signal{wip.linkedSignals.length === 1 ? "" : "s"} · linked from group
                  </div>
                </button>
                <span style={columnPillStyle(wip.column)}>{columnLabelFor(wip.column)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingDraftId && (
        <DraftIntentEditModal
          mode="edit"
          groupId={group.id}
          draftId={editingDraftId}
          onClose={() => setEditingDraftId(null)}
        />
      )}
    </>
  );
}

function intentRowStyle(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--bg)",
  };
}
function intentBadgeStyle(): React.CSSProperties {
  return {
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
    color: "#0369a1",
    background: "rgba(14,165,233,0.10)",
    border: "1px solid rgba(14,165,233,0.35)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap",
  };
}
function columnLabelFor(column: string): string {
  if (column === "done")        return "Done";
  if (column === "in_progress") return "In progress";
  if (column === "to_do")       return "To do";
  return "Backlog";
}
function columnPillStyle(column: string): React.CSSProperties {
  const palette: Record<string, { bg: string; fg: string; bd: string }> = {
    to_do:       { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
    in_progress: { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.45)" },
    done:        { bg: "rgba(34,197,94,0.10)",  fg: "#15803d", bd: "rgba(34,197,94,0.45)" },
    backlog:     { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const p = palette[column] ?? palette.backlog;
  return {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
    color: p.fg, background: p.bg,
    border: `1px solid ${p.bd}`,
    borderRadius: 100, padding: "1px 8px",
    whiteSpace: "nowrap",
  };
}

// ── DraftIntentEditModal ────────────────────────────────────────────────
// Used in two modes:
//   • mode="create" — pre-fills title from the first selected signal and
//     fires onCreate({ ... }) when the user clicks Create.
//   • mode="edit"   — loads an existing draft by id, calls
//     updateDraftIntent on every field change so edits persist live.
// Both modes share the same form layout so the user learns one surface.
function DraftIntentEditModal(props:
  | {
      mode: "create";
      groupId: string;
      initialSignalIds: string[];
      onClose: () => void;
      onCreate: (input: {
        title: string;
        description: string;
        signalIds: string[];
        notes: string;
        suggestedTasks: string[];
        acceptanceCriteria: string[];
        context: string;
        decisionRationale: string;
        rejectedAlternatives: string;
        plan: string;
      }) => void;
    }
  | {
      mode: "edit";
      groupId: string;
      draftId: string;
      onClose: () => void;
    }
) {
  const { signalGroups, draftIntents, updateDraftIntent, signals } = useStore();
  const group = signalGroups.find(g => g.id === props.groupId);
  const existing = props.mode === "edit" ? draftIntents.find(d => d.id === props.draftId) : undefined;

  // Pre-fill from the first selected signal in create mode so the user
  // has a starting title that often matches what they want.
  const initialIds = props.mode === "create" ? props.initialSignalIds : (existing?.signalIds ?? []);
  const firstSelected = signals.find(s => s.id === initialIds[0]);

  const [title, setTitle] = useState(existing?.title ?? firstSelected?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? firstSelected?.description ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [signalIds, setSignalIds] = useState<string[]>(initialIds);
  const [tasksRaw, setTasksRaw] = useState((existing?.suggestedTasks ?? []).join("\n"));
  // Structured planning fields — mirror the Wip intent form so the
  // draft can capture acceptance criteria / context / decision
  // rationale / rejected alternatives / plan before promotion.
  const [acRaw, setAcRaw] = useState((existing?.acceptanceCriteria ?? []).join("\n"));
  const [context, setContext] = useState(existing?.context ?? "");
  const [decisionRationale, setDecisionRationale] = useState(existing?.decisionRationale ?? "");
  const [rejectedAlternatives, setRejectedAlternatives] = useState(existing?.rejectedAlternatives ?? "");
  const [plan, setPlan] = useState(existing?.plan ?? "");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-persist edits when in edit mode. Debounce-free because state
  // changes already only happen on user input + blur events.
  const persistEdit = (patch: Partial<DraftIntent>) => {
    if (props.mode === "edit") {
      updateDraftIntent(props.draftId, patch);
    }
  };

  if (!group) return null;
  if (props.mode === "edit" && !existing) return null;

  const candidateSignals = signals.filter(s => group.signalIds.includes(s.id));
  const toggleSignal = (id: string) => {
    setSignalIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      persistEdit({ signalIds: next });
      return next;
    });
  };
  const parseTasks = (raw: string): string[] => raw.split("\n").map(t => t.trim()).filter(Boolean);

  const canSubmit = title.trim().length > 0 && signalIds.length > 0;

  // The SelectionBar that renders this modal uses `transform:
  // translateX(-50%)`, which makes any `position: fixed` descendant
  // size relative to the SelectionBar instead of the viewport. That's
  // why the modal landed off-screen (same bug pattern as the
  // SaveAsGroupModal). Portal to document.body so `position: fixed`
  // truly anchors to the viewport and the modal centers cleanly.
  if (typeof document === "undefined") return null;
  return createPortal((
    <div
      data-keep-selection="draft-intent-overlay"
      onClick={props.onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 720,
        background: "var(--bg-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,                       // breathing room on short viewports
        animation: "fadeIn 0.12s ease",
      }}
    >
      <div
        data-keep-selection="draft-intent-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "92vw",
          // Hard cap so the modal never exceeds the visible viewport.
          // The inner body scrolls when content is tall.
          maxHeight: "calc(100vh - 48px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              {props.mode === "create" ? "New draft intent" : "Edit draft intent"} · {group.name}
            </span>
            {/* DRAFT badge — same shape and prominence as the badges
                used on the Drafts row + signal modal. Tells the user
                at a glance that the same fields the real intent uses
                are available here, but nothing is on the Kanban yet. */}
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
              color: "var(--text-tertiary)",
              background: "var(--bg-sunken)",
              border: "1px dashed var(--border-strong)",
              borderRadius: 100, padding: "1px 8px",
              whiteSpace: "nowrap",
            }}>DRAFT</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            All the same fields a real intent uses. Capture acceptance criteria, context, decision rationale, alternatives, and a rough plan now — they all copy over verbatim when you click <strong style={{ color: "var(--text-secondary)" }}>Finalize</strong>.
          </div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>Title</div>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => persistEdit({ title: title.trim() || (existing?.title ?? "") })}
              placeholder="e.g. Fix mobile dashboard layout"
              style={fieldInputStyle()}
            />
          </div>

          {/* Acceptance criteria — mirrors the Wip intent's top-priority
              field. One per line; finalize converts them into a checklist. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Acceptance criteria <span style={draftSectionHintStyle()}>· one per line — becomes a checklist on the real intent</span>
            </div>
            <textarea
              value={acRaw}
              onChange={e => setAcRaw(e.target.value)}
              onBlur={() => persistEdit({ acceptanceCriteria: parseTasks(acRaw) })}
              rows={3}
              placeholder={"e.g. Layout renders correctly at 320–767px\nForm validates before submit\nNo horizontal scroll on iPhone SE"}
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Summary / Notes (the Wip-side Description). */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Summary / Notes <span style={draftSectionHintStyle()}>· the team's framing of the work</span>
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={() => persistEdit({ description })}
              rows={3}
              placeholder="Short summary of what this intent needs to accomplish."
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Context — situational background mirroring Wip.context */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Context <span style={draftSectionHintStyle()}>· why now, who reported it, where in the product</span>
            </div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              onBlur={() => persistEdit({ context })}
              rows={2}
              placeholder="Background — why this matters, who flagged it, any constraints."
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Decision rationale — mirrors Wip.decisionRationale */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Decision rationale <span style={draftSectionHintStyle()}>· why this approach over others</span>
            </div>
            <textarea
              value={decisionRationale}
              onChange={e => setDecisionRationale(e.target.value)}
              onBlur={() => persistEdit({ decisionRationale })}
              rows={2}
              placeholder="Why this specific solution? What trade-off won?"
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Rejected alternatives — mirrors Wip.rejectedAlternatives */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Rejected alternatives <span style={draftSectionHintStyle()}>· other paths considered + why they lost</span>
            </div>
            <textarea
              value={rejectedAlternatives}
              onChange={e => setRejectedAlternatives(e.target.value)}
              onBlur={() => persistEdit({ rejectedAlternatives })}
              rows={2}
              placeholder="List the alternatives you considered and why you didn't pick them."
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Plan — mirrors Wip.plan */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Plan <span style={draftSectionHintStyle()}>· execution notes, rough phases</span>
            </div>
            <textarea
              value={plan}
              onChange={e => setPlan(e.target.value)}
              onBlur={() => persistEdit({ plan })}
              rows={2}
              placeholder="Short plan or phases. Doesn't need to be polished."
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Suggested tasks — kept as a planning list. Doesn't map onto
              the Wip directly; future work could spin tasks from these. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Suggested tasks <span style={draftSectionHintStyle()}>· optional, one per line — kept as draft scaffolding</span>
            </div>
            <textarea
              value={tasksRaw}
              onChange={e => setTasksRaw(e.target.value)}
              onBlur={() => persistEdit({ suggestedTasks: parseTasks(tasksRaw) })}
              rows={3}
              placeholder={"e.g. Audit responsive breakpoints\nFix table overflow at <768px"}
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Notes / scratchpad — kept distinct so users have somewhere
              to dump WIP thoughts that shouldn't leak onto the real intent. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={draftSectionHeaderStyle()}>
              Notes <span style={draftSectionHintStyle()}>· scratchpad — stays on the draft only, not copied to the real intent</span>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => persistEdit({ notes })}
              rows={2}
              placeholder="Anything you're not sure about, open questions, follow-ups for yourself."
              style={{ ...fieldInputStyle(), resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              Linked signals · {signalIds.length} of {candidateSignals.length} in group
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
              {candidateSignals.map(s => {
                const on = signalIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSignal(s.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", textAlign: "left",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      background: on ? "var(--accent-soft)" : "var(--bg)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: on ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
                      background: on ? "var(--accent)" : "transparent",
                    }}>
                      {on && <Check size={9} style={{ color: "white" }} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title}
                    </span>
                    <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                      {s.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={props.onClose}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              color: "var(--text-secondary)",
              fontSize: "var(--fs-body)", fontWeight: 500, cursor: "pointer",
            }}
          >
            {props.mode === "edit" ? "Done" : "Cancel"}
          </button>
          {props.mode === "create" && (
            <button
              onClick={() => {
                if (!canSubmit) return;
                props.onCreate({
                  title: title.trim(),
                  description,
                  signalIds,
                  notes,
                  suggestedTasks: parseTasks(tasksRaw),
                  acceptanceCriteria: parseTasks(acRaw),
                  context,
                  decisionRationale,
                  rejectedAlternatives,
                  plan,
                });
              }}
              disabled={!canSubmit}
              style={{
                padding: "6px 14px",
                background: canSubmit ? "var(--accent)" : "var(--bg-sunken)",
                color: canSubmit ? "white" : "var(--text-tertiary)",
                border: "none", borderRadius: "var(--radius)",
                fontSize: "var(--fs-body)", fontWeight: 600,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              Create draft
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

function fieldInputStyle(): React.CSSProperties {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "6px 9px",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    background: "var(--bg)", color: "var(--text)",
    fontSize: "var(--fs-body)", outline: "none",
  };
}
function draftSectionHeaderStyle(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-tertiary)",
  };
}
function draftSectionHintStyle(): React.CSSProperties {
  return {
    fontWeight: 400, textTransform: "none", letterSpacing: 0,
    color: "var(--text-tertiary)",
  };
}

// ── SaveAsGroupModal ───────────────────────────────────────────────────
// Two modes inside one dialog:
//   • "Create new group" — name + reasons + notes; creates a new
//     SignalGroup with the current selection.
//   • "Add to existing" — pick from saved groups (if any exist); adds
//     the selection to each picked group. The selected signals are
//     allowed to belong to multiple groups simultaneously.
// Closes on Esc or backdrop click. Closing also clears the selection
// so the user lands cleanly back on the Signals list.
function SaveAsGroupModal({ signalIds, onClose }: { signalIds: string[]; onClose: () => void }) {
  const { signalGroups, createSignalGroup, addSignalsToGroup, clearSelection, openGroup } = useStore();
  const [mode, setMode] = useState<"new" | "existing">(signalGroups.length > 0 ? "new" : "new");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [reasons, setReasons] = useState<SignalGroupReason[]>([]);
  // Multi-select against existing groups.
  const [pickedGroupIds, setPickedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggleReason = (r: SignalGroupReason) => {
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };
  const togglePick = (id: string) => {
    setPickedGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const canSubmit = mode === "new"
    ? name.trim().length > 0
    : pickedGroupIds.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === "new") {
      const newId = createSignalGroup({
        name: name.trim(),
        signalIds,
        reasons,
        notes: notes.trim() || undefined,
      });
      clearSelection();
      onClose();
      // Land the user on the freshly-created group so they can see it.
      openGroup(newId);
    } else {
      pickedGroupIds.forEach(gid => addSignalsToGroup(gid, signalIds));
      clearSelection();
      onClose();
    }
  };

  // The SelectionBar that renders this modal uses `transform:
  // translateX(-50%)`, which creates a containing block for any
  // `position:fixed` descendant. That's why the modal previously landed
  // anchored to the SelectionBar instead of the viewport. Portaling to
  // document.body breaks the modal out of that transformed parent so
  // `position:fixed` + `top:50%` truly centers in the viewport.
  if (typeof document === "undefined") return null;
  return createPortal((
    <div
      // The modal is portaled to document.body so it lives outside the
      // SelectionBar's `data-keep-selection` boundary. The signals
      // page's outside-click handler would otherwise treat any click
      // inside the modal as "click outside selection" and wipe the
      // user's selection — which unmounts the SelectionBar and tears
      // the modal down with it. Marking both the overlay and the
      // dialog as keep-selection nodes shorts that out.
      data-keep-selection="save-as-group-overlay"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        background: "var(--bg-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,                       // breathing room on short viewports
        animation: "fadeIn 0.12s ease",
      }}
    >
      <div
        data-keep-selection="save-as-group-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "92vw",
          // Cap the modal so it can never exceed the visible viewport,
          // and let its body scroll inside the cap when content is tall.
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          padding: 18,
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Save as signal group
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
            {signalIds.length} selected signal{signalIds.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.45 }}>
            Groups are persistent workspaces for reviewing related signals. A signal can sit in multiple groups.
          </div>
        </div>

        {/* Mode tabs — disabled when there are no existing groups. */}
        <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 100, padding: 2, alignSelf: "flex-start" }}>
          {(["new", "existing"] as const).map(m => {
            const active = mode === m;
            const disabled = m === "existing" && signalGroups.length === 0;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
                style={{
                  padding: "4px 12px", borderRadius: 100, border: "none",
                  background: active ? "var(--bg)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-secondary)",
                  fontSize: "var(--fs-meta)", fontWeight: 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  boxShadow: active ? "var(--shadow-sm)" : undefined,
                }}
              >
                {m === "new" ? "Create new group" : `Add to existing (${signalGroups.length})`}
              </button>
            );
          })}
        </div>

        {mode === "new" ? (
          <>
            {/* Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Group name
              </div>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Mobile responsiveness issues"
                style={{
                  padding: "6px 9px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: "var(--fs-body)", outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            {/* Reasons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Why these belong together <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· pick any</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(Object.keys(SIGNAL_GROUP_REASON_LABEL) as SignalGroupReason[]).map(r => {
                  const on = reasons.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => toggleReason(r)}
                      style={{
                        padding: "3px 10px", borderRadius: 100,
                        border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: on ? "var(--accent-soft)" : "var(--bg)",
                        color: on ? "var(--accent)" : "var(--text-secondary)",
                        fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      {SIGNAL_GROUP_REASON_LABEL[r]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Notes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· optional</span>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="What is this group for?"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "6px 9px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: "var(--fs-body)", outline: "none",
                  resize: "vertical", lineHeight: 1.5,
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              Pick groups to add to <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· signals can sit in multiple</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
              {signalGroups.map(g => {
                const on = pickedGroupIds.includes(g.id);
                const alreadyIn = signalIds.every(sid => g.signalIds.includes(sid));
                return (
                  <button
                    key={g.id}
                    onClick={() => togglePick(g.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", textAlign: "left",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      background: on ? "var(--accent-soft)" : "var(--bg)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 14, height: 14, borderRadius: 3,
                      border: on ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
                      background: on ? "var(--accent)" : "transparent",
                      flexShrink: 0,
                    }}>
                      {on && <Check size={9} style={{ color: "white" }} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        {g.signalIds.length} signal{g.signalIds.length === 1 ? "" : "s"} · {SIGNAL_GROUP_STATUS_LABEL[g.status]}
                      </div>
                    </div>
                    {alreadyIn && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                        color: "#15803d",
                        background: "rgba(34,197,94,0.12)",
                        border: "1px solid rgba(34,197,94,0.45)",
                        borderRadius: 100, padding: "1px 7px",
                        whiteSpace: "nowrap",
                      }}>
                        ALL IN
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              color: "var(--text-secondary)",
              fontSize: "var(--fs-body)", fontWeight: 500, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: "6px 14px",
              background: canSubmit ? "var(--accent)" : "var(--bg-sunken)",
              color: canSubmit ? "white" : "var(--text-tertiary)",
              border: "none", borderRadius: "var(--radius)",
              fontSize: "var(--fs-body)", fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {mode === "new" ? "Create group" : `Add to ${pickedGroupIds.length || ""} group${pickedGroupIds.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

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
    signalGroups, signalGroupFilter, signalsViewMode, openGroup,
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
    // Active SignalGroup filter — narrows the list to that group's
    // member signals. Set by clicking a group in the Saved Groups panel.
    if (signalGroupFilter) {
      const g = signalGroups.find(x => x.id === signalGroupFilter);
      if (g) {
        const ids = new Set(g.signalIds);
        list = list.filter(s => ids.has(s.id));
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, wipItems, signalAttachments, search, filters.status, filters.priority, filters.author, filters.source, filters.labels, filters.workItem, filters.duplicate, filters.attribute, dupReview, possibleDupSignalIds, duplicateGroups, sourceOfWipFilter, signalGroupFilter, signalGroups]);

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

  // ── Group workspace mode ───────────────────────────────────────────
  // When a SignalGroup is active, the Signals page becomes a dedicated
  // group review workspace instead of the standard filtered list. The
  // user lands here automatically after saving signals as a new group,
  // or by clicking "Open group" on a group card.
  if (signalGroupFilter) {
    return <SignalGroupWorkspaceView groupId={signalGroupFilter} />;
  }

  // ── Groups list view ────────────────────────────────────────────────
  // Full-page list of every saved SignalGroup, replacing the previous
  // tiny popover. The user toggles into this view via the "⊞ Groups"
  // pill in the toolbar; opening a group from here flips into the
  // workspace mode above.
  if (signalsViewMode === "groups") {
    return <SignalGroupsListView />;
  }

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

        {/* Active signal-group filter chip — set by clicking a group in
            the Saved Groups panel. Removable to return to the unfiltered
            list. */}
        {signalGroupFilter && (() => {
          const g = signalGroups.find(x => x.id === signalGroupFilter);
          if (!g) return null;
          const truncated = g.name.length > 28 ? g.name.slice(0, 28).trim() + "…" : g.name;
          return (
            <span
              title={`Showing only signals in group "${g.name}" (${g.signalIds.length} signal${g.signalIds.length === 1 ? "" : "s"})`}
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
              Group: {truncated}
              <button
                onClick={() => openGroup(null)}
                aria-label="Clear group filter"
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

        {/* Saved Groups pill — opens a popover panel listing every
            saved SignalGroup. Hidden when there are no groups, since
            empty state is already covered by the SelectionBar "Save as
            group" affordance once the user picks signals. */}
        {signalGroups.length > 0 && (
          <SavedGroupsButton />
        )}

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

      {/* Signal-group workspace — rendered above the list when a group
          filter is active. Keeps group context (name, notes, status,
          reasons) visible while the user reviews the member signals
          below. */}
      {signalGroupFilter && <SignalGroupWorkspaceBanner groupId={signalGroupFilter} />}

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

// ── SignalGroupWorkspaceView ────────────────────────────────────────────
// Full-page workspace that replaces the standard Signals list when a
// SignalGroup is open. The user reviews member signals side-by-side
// here and acts on them with the same SelectionBar bulk actions; the
// workspace ALSO exposes group-only actions (status/reasons/notes,
// drafts + finalized intents, leave the group) that don't make sense
// on the normal Signals page.
function SignalGroupWorkspaceView({ groupId }: { groupId: string }) {
  const {
    signalGroups, signals, signalAttachments, duplicateGroups, wipItems,
    updateSignalGroup, deleteSignalGroup, openGroup,
    selection, toggleSelect, selectAll, clearSelection,
    openSignal, signalWipLinks,
    draftIntents,
    appMode,
  } = useStore();
  const readOnly = appMode === "client";
  const group = signalGroups.find(g => g.id === groupId);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group?.name ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(group?.notes ?? "");
  useEffect(() => {
    setNameDraft(group?.name ?? "");
    setNotesDraft(group?.notes ?? "");
  }, [groupId, group?.name, group?.notes]);

  // ── Workspace view mode + filters ────────────────────────────────
  // Three modes for the signal area:
  //   • "list"    — compact rows (current default), good for scanning
  //   • "cards"   — larger tiles in a grid, good for browsing
  //   • "compare" — full-height side-by-side panels you scroll
  //                 horizontally to compare 3+ signals at once
  // Filters narrow the rendered set across all three modes.
  const [viewMode, setViewMode] = useState<"list" | "cards" | "compare">("list");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SignalStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | SignalPriority>("all");
  const [linkedFilter, setLinkedFilter] = useState<"all" | "has_intent" | "no_intent" | "has_duplicate" | "no_duplicate">("all");
  // Visual "group by" inside the workspace — does NOT create saved
  // groups, just buckets the rendered list. Per the spec it's purely
  // a display aid for large groups.
  const [groupBy, setGroupBy] = useState<"none" | "reporter" | "status" | "source" | "linked_intent" | "duplicate">("none");
  // Card display configuration — which fields show on each row. The
  // user toggles these via the Display picker in the toolbar. Defaults
  // mirror the previous "everything visible" layout.
  type DisplayField = "reporter" | "source" | "date" | "attachments" | "description" | "intent" | "duplicate";
  const [displayFields, setDisplayFields] = useState<Record<DisplayField, boolean>>({
    reporter: true, source: true, date: true, attachments: true,
    description: true, intent: true, duplicate: true,
  });
  const [displayPickerOpen, setDisplayPickerOpen] = useState(false);
  const displayPickerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!displayPickerOpen) return;
    const h = (e: MouseEvent) => {
      if (displayPickerRef.current && !displayPickerRef.current.contains(e.target as Node)) setDisplayPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [displayPickerOpen]);

  // Clear any leftover selection from the standard Signals page when
  // entering the workspace — selecting inside this view should start
  // fresh.
  useEffect(() => { clearSelection(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggest-signals modal — opened from the Signals toolbar.
  const [suggestOpen, setSuggestOpen] = useState(false);

  if (!group) {
    // Filter pointed at a deleted group — bounce back to Signals.
    return (
      <div style={{ padding: 32, color: "var(--text-tertiary)", fontSize: "var(--fs-body)" }}>
        Group not found. <button onClick={() => openGroup(null)} style={{
          background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, textDecoration: "underline",
        }}>Return to Signals</button>.
      </div>
    );
  }

  const memberSignals = signals.filter(s => group.signalIds.includes(s.id));

  // Apply workspace filters on top of the membership set.
  const q = query.trim().toLowerCase();
  const filteredSignals = memberSignals.filter(s => {
    if (q && !s.title.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all"   && s.status !== statusFilter) return false;
    if (priorityFilter !== "all" && s.priority !== priorityFilter) return false;
    if (linkedFilter !== "all") {
      const hasIntent = wipItems.some(w => w.type === "intent" && s.linkedWip.includes(w.id));
      const hasDup    = duplicateGroups.some(g => g.signalIds.includes(s.id));
      if (linkedFilter === "has_intent"    && !hasIntent) return false;
      if (linkedFilter === "no_intent"     && hasIntent)  return false;
      if (linkedFilter === "has_duplicate" && !hasDup)    return false;
      if (linkedFilter === "no_duplicate"  && hasDup)     return false;
    }
    return true;
  });
  const filtersActive = q !== "" || statusFilter !== "all" || priorityFilter !== "all" || linkedFilter !== "all";
  // Bucket the filtered signals by the chosen grouping. "none" gives a
  // single anonymous bucket; the other axes use a stable derived key so
  // ordering is predictable.
  const buckets = useMemo<{ key: string; label: string; signals: Signal[] }[]>(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", signals: filteredSignals }];
    }
    const map = new Map<string, { key: string; label: string; signals: Signal[] }>();
    const push = (key: string, label: string, s: Signal) => {
      const b = map.get(key) ?? { key, label, signals: [] };
      b.signals.push(s);
      map.set(key, b);
    };
    for (const s of filteredSignals) {
      if (groupBy === "reporter") {
        const name = userByIdSafe(s.author) ?? "Unknown reporter";
        push(`r:${s.author}`, name, s);
      } else if (groupBy === "status") {
        push(`s:${s.status}`, s.status[0].toUpperCase() + s.status.slice(1), s);
      } else if (groupBy === "source") {
        push(`src:${s.source}`, s.source === "feedback" ? "Feedback" : "Note", s);
      } else if (groupBy === "linked_intent") {
        const intent = wipItems.find(w => s.linkedWip.includes(w.id) && w.type === "intent");
        if (intent) push(`i:${intent.id}`, `→ ${intent.title}`, s);
        else        push("i:_none", "No linked intent", s);
      } else if (groupBy === "duplicate") {
        const dg = duplicateGroups.find(g => g.signalIds.includes(s.id));
        if (!dg) {
          push("d:_none", "Not in a duplicate group", s);
        } else {
          const main = dg.mainSignalId ?? mainSignalOf(dg, [s])?.id ?? dg.signalIds[0];
          push(`d:${dg.id}`, `Duplicate group — main ${main}`, s);
        }
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [filteredSignals, groupBy, wipItems, duplicateGroups]);
  const clearWorkspaceFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setLinkedFilter("all");
  };
  const toggleReason = (r: SignalGroupReason) => {
    const next = group.reasons.includes(r)
      ? group.reasons.filter(x => x !== r)
      : [...group.reasons, r];
    updateSignalGroup(group.id, { reasons: next });
  };

  // ── Header meta — counts surfaced at the top so reviewers see the
  // group's context (intents, duplicates) without scrolling down to
  // the side panel. Recomputed from the same source the
  // GroupWorkspaceIntentsBlock uses, so the numbers can't drift.
  const draftCount = draftIntents.filter(d => d.groupId === group.id && !d.finalizedWipId).length;
  const finalizedCount =
    draftIntents.filter(d => d.groupId === group.id && !!d.finalizedWipId).length
    + group.linkedIntentIds.length;
  const groupDuplicateCount = duplicateGroups.filter(dg =>
    dg.signalIds.some(sid => group.signalIds.includes(sid))
  ).length;

  return (
    <div
      // Mark the entire workspace as a selection-keep zone. Without
      // this, the SignalsPage outside-click handler treats every click
      // inside the workspace (including ticking a second checkbox) as
      // "outside the selection" and wipes the multi-select — capping
      // selection at one row.
      data-keep-selection="group-workspace"
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        background: "var(--bg-sunken)",
        overflow: "hidden",
      }}>
      {/* ── Workspace header ──────────────────────────────────────────
          Dedicated header bar with a Back-to-Signals action so the user
          always sees they're in a different mode. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => openGroup(null)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            height: 28, padding: "0 10px",
            borderRadius: 100,
            border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--text-secondary)",
            fontSize: 11, fontWeight: 500, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          title="Back to Signals"
        >
          ← Signals
        </button>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Group workspace
        </span>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={() => { updateSignalGroup(group.id, { name: nameDraft.trim() || group.name }); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateSignalGroup(group.id, { name: nameDraft.trim() || group.name }); setEditingName(false); }
              else if (e.key === "Escape") { setNameDraft(group.name); setEditingName(false); }
            }}
            style={{
              flex: 1, minWidth: 200,
              fontSize: 17, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "4px 9px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setNameDraft(group.name); setEditingName(true); }}
            style={{ flex: 1, minWidth: 200, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: 17, fontWeight: 600, color: "var(--text)", cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title="Click to rename"
          >
            {group.name}
          </button>
        )}
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {memberSignals.length} signal{memberSignals.length === 1 ? "" : "s"}
        </span>
        <div style={{ display: "inline-flex", gap: 3 }}>
          {(["open", "in_review", "archived"] as const).map(s => {
            const active = group.status === s;
            const palette: Record<typeof s, { bg: string; fg: string; bd: string }> = {
              open:      { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
              in_review: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", bd: "rgba(245,158,11,0.45)" },
              archived:  { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
            };
            const p = palette[s];
            return (
              <button
                key={s}
                onClick={() => updateSignalGroup(group.id, { status: s })}
                title={`Set group status to ${SIGNAL_GROUP_STATUS_LABEL[s]}`}
                style={{
                  padding: "3px 9px", borderRadius: 100,
                  border: `1px solid ${active ? p.bd : "var(--border)"}`,
                  background: active ? p.bg : "var(--bg)",
                  color: active ? p.fg : "var(--text-tertiary)",
                  fontSize: 10, fontWeight: 600, cursor: "pointer",
                  letterSpacing: 0.2,
                }}
              >
                {SIGNAL_GROUP_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            if (window.confirm(`Delete group "${group.name}"? Signals stay; only the grouping is removed. Status, duplicate relationships, intent links, and notes you've taken on those signals are preserved.`)) {
              openGroup(null);
              deleteSignalGroup(group.id);
            }
          }}
          aria-label="Delete group"
          title="Delete this group"
          style={{
            padding: 4, color: "var(--text-tertiary)",
            background: "transparent", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* ── Header meta strip — context excerpt + reasons + intent /
          duplicate counts. Surfaces "what is this group about + how
          much work hangs off it" without the reviewer needing to
          scroll the side panel. Editing the notes still happens in
          the side panel; this strip is the at-a-glance read. */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
        padding: "8px 20px 10px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        {/* Context / description excerpt (left, flex) — clamped to 1
            line so the header stays scannable; click to edit. */}
        {group.notes ? (
          <button
            onClick={() => { setNotesDraft(group.notes ?? ""); setEditingNotes(true); }}
            title="Click to edit group context"
            style={{
              flex: "1 1 320px", minWidth: 0,
              background: "transparent", border: "none", padding: 0,
              textAlign: "left", cursor: "text",
              fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {group.notes}
          </button>
        ) : (
          <button
            onClick={() => { setNotesDraft(""); setEditingNotes(true); }}
            style={{
              flex: "1 1 320px", minWidth: 0,
              background: "transparent", border: "none", padding: 0,
              textAlign: "left", cursor: "pointer",
              fontSize: 11.5, color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            + Add group context · what ties these signals together?
          </button>
        )}

        {/* Counts cluster (right) — drafts, intents, duplicates. Hidden
            when zero so the strip doesn't carry empty pills. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {draftCount > 0 && (
            <span style={countPillStyle("draft")}>Drafts · {draftCount}</span>
          )}
          {finalizedCount > 0 && (
            <span style={countPillStyle("intent")}>Intents · {finalizedCount}</span>
          )}
          {groupDuplicateCount > 0 && (
            <span style={countPillStyle("dup")}>Duplicates · {groupDuplicateCount}</span>
          )}
        </div>

        {/* Reasons row — clickable chips so they double as toggles
            (mirrors the side-panel control; convenient at the top). */}
        {(group.reasons.length > 0 || true) && (
          <div style={{ display: "flex", flexBasis: "100%", flexWrap: "wrap", gap: 4 }}>
            {group.reasons.length === 0 ? (
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                No reasons set · use the side panel to tag this group.
              </span>
            ) : (
              group.reasons.map(r => (
                <button
                  key={r}
                  onClick={() => toggleReason(r)}
                  title="Click to remove this reason"
                  style={{
                    padding: "2px 9px", borderRadius: 100,
                    border: "1px solid var(--accent)",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  {SIGNAL_GROUP_REASON_LABEL[r]}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Body: 2-column workspace.
          LEFT (main, flex 2): drafts + finalized intents block, then the
          member signal list with checkboxes (uses the existing ListView).
          RIGHT (side, flex 1): reasons + group notes. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <main style={{ flex: 2, minWidth: 0, overflowY: "auto", padding: "16px 20px 88px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Drafts + finalized intents — reuses the same block from the
              roadmap workspace so the user sees draft-intent state here. */}
          <GroupWorkspaceIntentsBlock group={group} />

          {/* Signals header + select-all */}
          {/* Signals toolbar — count + filters + view-mode toggle +
              select-all. Two rows so each control has enough room when
              the workspace narrows on smaller screens. */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--bg)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Signals · {filteredSignals.length}{filtersActive ? ` of ${memberSignals.length}` : ""}
              </span>
              {/* Selection-count badge — mirrors the floating SelectionBar. */}
              {(() => {
                const memberIds = memberSignals.map(s => s.id);
                const selectedCount = memberIds.filter(id => selection.includes(id)).length;
                if (selectedCount === 0) return null;
                return (
                  <span style={{
                    fontSize: 10.5, fontWeight: 600,
                    color: "var(--accent)",
                    background: "var(--accent-soft)",
                    border: "1px solid var(--accent)",
                    borderRadius: 100, padding: "1px 8px",
                    whiteSpace: "nowrap",
                  }} title="Bulk actions sit in the floating SelectionBar at the bottom of the page">
                    {selectedCount} selected
                  </span>
                );
              })()}
              <span style={{ flex: 1 }} />
              {!readOnly && (
                <button
                  onClick={() => setSuggestOpen(true)}
                  title="Let the system suggest signals that match this group's context"
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text-secondary)", fontSize: 11, fontWeight: 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
                >
                  ✦ Suggest signals
                </button>
              )}
              {/* Group-by — visual bucketing only; never creates saved groups. */}
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as typeof groupBy)}
                title="Group signals visually inside this workspace"
                style={{
                  padding: "3px 8px", borderRadius: 100,
                  border: groupBy === "none" ? "1px solid var(--border)" : "1px solid var(--accent)",
                  background: groupBy === "none" ? "var(--bg)" : "var(--accent-soft)",
                  color: groupBy === "none" ? "var(--text-secondary)" : "var(--accent)",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  appearance: "none",
                }}
              >
                <option value="none">Group by: None</option>
                <option value="reporter">Group by: Reporter</option>
                <option value="status">Group by: Status</option>
                <option value="source">Group by: Source</option>
                <option value="linked_intent">Group by: Linked intent</option>
                <option value="duplicate">Group by: Duplicate</option>
              </select>
              {/* Display fields picker — toggles which metadata
                  columns show on each row/card. Lightweight popover so
                  the toolbar stays clean. */}
              <div ref={displayPickerRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setDisplayPickerOpen(o => !o)}
                  title="Choose which fields show on each card"
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text-secondary)", fontSize: 11, fontWeight: 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
                >
                  ⚙ Display
                </button>
                {displayPickerOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100,
                    minWidth: 200,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)",
                    padding: "6px 4px",
                    display: "flex", flexDirection: "column",
                  }}>
                    <div style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                      Card fields
                    </div>
                    {([
                      ["reporter", "Reporter / client"],
                      ["source", "Source / type"],
                      ["date", "Date / age"],
                      ["attachments", "Attachments"],
                      ["description", "Description snippet"],
                      ["intent", "Linked intent"],
                      ["duplicate", "Duplicate status"],
                    ] as [DisplayField, string][]).map(([key, label]) => (
                      <label
                        key={key}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 10px", cursor: "pointer",
                          fontSize: "var(--fs-body)", color: "var(--text)",
                          borderRadius: "var(--radius-sm)",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <input
                          type="checkbox"
                          checked={displayFields[key]}
                          onChange={() => setDisplayFields(d => ({ ...d, [key]: !d[key] }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {/* View mode toggle */}
              <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 100, padding: 2 }}>
                {(["list", "cards", "compare"] as const).map(m => {
                  const active = viewMode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setViewMode(m)}
                      title={m === "list" ? "Compact rows" : m === "cards" ? "Card grid" : "Side-by-side comparison"}
                      style={{
                        padding: "3px 10px", borderRadius: 100, border: "none",
                        background: active ? "var(--bg)" : "transparent",
                        color: active ? "var(--text)" : "var(--text-secondary)",
                        fontSize: 11, fontWeight: 500, cursor: "pointer",
                        boxShadow: active ? "var(--shadow-sm)" : undefined,
                        textTransform: "capitalize",
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              {!readOnly && memberSignals.length > 0 && (() => {
                const visibleIds = filteredSignals.map(s => s.id);
                const allSelected = visibleIds.length > 0 && visibleIds.every(id => selection.includes(id));
                return (
                  <button
                    onClick={() => allSelected ? clearSelection() : selectAll(visibleIds)}
                    style={{
                      padding: "3px 10px", borderRadius: 100,
                      border: "1px solid var(--border)",
                      background: allSelected ? "var(--accent-soft)" : "var(--bg)",
                      color: allSelected ? "var(--accent)" : "var(--text-secondary)",
                      fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {allSelected ? "Clear selection" : `Select all ${visibleIds.length}`}
                  </button>
                );
              })()}
            </div>
            {/* Filter strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search title or description…"
                style={{
                  flex: "1 1 200px", minWidth: 160,
                  padding: "4px 9px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 11, outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as "all" | SignalStatus)}
                style={workspaceFilterSelect(statusFilter !== "all")}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="accepted">Accepted</option>
                <option value="ready">Ready</option>
                <option value="skipped">Skipped</option>
                <option value="rejected">Rejected</option>
                <option value="closed">Closed</option>
              </select>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value as "all" | SignalPriority)}
                style={workspaceFilterSelect(priorityFilter !== "all")}
                aria-label="Filter by priority"
              >
                <option value="all">Any priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={linkedFilter}
                onChange={e => setLinkedFilter(e.target.value as typeof linkedFilter)}
                style={workspaceFilterSelect(linkedFilter !== "all")}
                aria-label="Filter by intent / duplicate links"
              >
                <option value="all">Any link state</option>
                <option value="has_intent">Has linked intent</option>
                <option value="no_intent">No linked intent</option>
                <option value="has_duplicate">In a duplicate group</option>
                <option value="no_duplicate">Not in a duplicate group</option>
              </select>
              {filtersActive && (
                <button
                  onClick={clearWorkspaceFilters}
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    border: "1px dashed var(--border-strong)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: 10.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Member signal display — three render modes share the same
              source data (filteredSignals) so filters / selection / etc
              behave identically across modes. */}
          {memberSignals.length === 0 ? (
            <div style={{
              padding: 24, textAlign: "center", border: "1px dashed var(--border)",
              borderRadius: "var(--radius)", background: "var(--bg)",
              color: "var(--text-tertiary)", fontSize: "var(--fs-body)", lineHeight: 1.5,
            }}>
              This group has no signals yet. Use the SelectionBar's <strong style={{ color: "var(--text-secondary)" }}>Save as group</strong> action to add some, or open another signal and use its <em>Groups</em> section to attach it here.
            </div>
          ) : filteredSignals.length === 0 ? (
            <div style={{
              padding: 20, textAlign: "center", border: "1px dashed var(--border)",
              borderRadius: "var(--radius)", background: "var(--bg)",
              color: "var(--text-tertiary)", fontSize: 11.5, lineHeight: 1.55,
            }}>
              No signals in this group match the current filters. <button
                onClick={clearWorkspaceFilters}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  color: "var(--accent)", cursor: "pointer", textDecoration: "underline",
                  fontSize: 11.5,
                }}
              >Clear filters</button> to see all {memberSignals.length}.
            </div>
          ) : viewMode === "list" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {buckets.map(bucket => (
                <div key={bucket.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {groupBy !== "none" && bucket.label && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "2px 2px 4px",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 600, color: "var(--text-secondary)",
                      }}>
                        {bucket.label}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        · {bucket.signals.length}
                      </span>
                    </div>
                  )}
                  {bucket.signals.map(s => (
                    <GroupSignalRow
                      key={s.id}
                      signal={s}
                      checked={selection.includes(s.id)}
                      onToggle={() => toggleSelect(s.id)}
                      onOpen={() => openSignal(s.id)}
                      readOnly={readOnly}
                      wipItems={wipItems}
                      duplicateGroups={duplicateGroups}
                      signalWipLinks={signalWipLinks}
                      attachments={signalAttachments}
                      signalGroups={signalGroups}
                      currentGroupId={group.id}
                      displayFields={displayFields}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : viewMode === "cards" ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10, alignItems: "start",
            }}>
              {filteredSignals.map(s => (
                <GroupSignalCard
                  key={s.id}
                  signal={s}
                  checked={selection.includes(s.id)}
                  onToggle={() => toggleSelect(s.id)}
                  onOpen={() => openSignal(s.id)}
                  readOnly={readOnly}
                  wipItems={wipItems}
                  duplicateGroups={duplicateGroups}
                  signalWipLinks={signalWipLinks}
                  attachments={signalAttachments}
                  signalGroups={signalGroups}
                  currentGroupId={group.id}
                />
              ))}
            </div>
          ) : (
            // viewMode === "compare"
            <div style={{
              display: "flex", gap: 12, alignItems: "stretch",
              overflowX: "auto", overflowY: "hidden",
              padding: "4px 4px 12px",
              scrollbarWidth: "thin" as const,
            }}>
              {filteredSignals.map(s => (
                <GroupSignalCompareTile
                  key={s.id}
                  signal={s}
                  checked={selection.includes(s.id)}
                  onToggle={() => toggleSelect(s.id)}
                  onOpen={() => openSignal(s.id)}
                  readOnly={readOnly}
                  wipItems={wipItems}
                  duplicateGroups={duplicateGroups}
                  signalWipLinks={signalWipLinks}
                  attachments={signalAttachments}
                  signalGroups={signalGroups}
                  currentGroupId={group.id}
                />
              ))}
            </div>
          )}
        </main>

        {/* Side panel — reasons + notes + the small "what is a group"
            explainer. */}
        <aside style={{
          flex: 1, minWidth: 320, maxWidth: 380,
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
          overflowY: "auto",
          padding: "16px 18px 24px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 }}>
              Reasons
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(Object.keys(SIGNAL_GROUP_REASON_LABEL) as SignalGroupReason[]).map(r => {
                const on = group.reasons.includes(r);
                return (
                  <button
                    key={r}
                    onClick={() => toggleReason(r)}
                    style={{
                      padding: "2px 9px", borderRadius: 100,
                      border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: on ? "var(--accent-soft)" : "var(--bg)",
                      color: on ? "var(--accent)" : "var(--text-tertiary)",
                      fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    {SIGNAL_GROUP_REASON_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              Group notes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· persistent, scoped to this group</span>
            </div>
            {editingNotes ? (
              <textarea
                autoFocus
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={() => { updateSignalGroup(group.id, { notes: notesDraft }); setEditingNotes(false); }}
                rows={5}
                placeholder="What's the connection between these signals?"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "8px 10px",
                  border: "1px solid var(--accent)", borderRadius: "var(--radius)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: "var(--fs-body)", lineHeight: 1.55, outline: "none",
                  resize: "vertical",
                }}
              />
            ) : group.notes ? (
              <button
                onClick={() => { setNotesDraft(group.notes ?? ""); setEditingNotes(true); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "8px 10px", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", background: "var(--bg-sunken)",
                  color: "var(--text-secondary)", fontSize: "var(--fs-body)", lineHeight: 1.55,
                  cursor: "text",
                }}
                title="Click to edit notes"
              >
                {group.notes}
              </button>
            ) : (
              <button
                onClick={() => { setNotesDraft(""); setEditingNotes(true); }}
                style={{
                  padding: "5px 10px", fontSize: 11, color: "var(--text-tertiary)",
                  background: "transparent", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
                  cursor: "pointer",
                }}
              >
                + Add notes
              </button>
            )}
          </div>

          {/* Tiny explainer — kept in the side panel so the main list
              doesn't carry it on every group. */}
          <div style={{
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            background: "var(--bg-sunken)",
            border: "1px dashed var(--border)",
            fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.55,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              About this workspace
            </div>
            A group is a persistent workspace for reviewing related signals together. Bulk actions on the SelectionBar (status, duplicates, link to intent, draft intent, remove from group) operate on the selected member signals. Closing this workspace returns you to the Signals list — the group, its notes, and any actions you took stay saved.
          </div>
        </aside>
      </div>

      {/* SelectionBar — the same one used on the standard Signals page.
          It detects the active group via signalGroupFilter and exposes
          the group-scoped bulk actions automatically. */}
      {!readOnly && <SelectionBar />}
      <SignalModal />
      {suggestOpen && (
        <SuggestSignalsModal group={group} onClose={() => setSuggestOpen(false)} />
      )}
    </div>
  );
}

// ── GroupSignalRow ──────────────────────────────────────────────────────
// Compact, scannable row for one member signal inside the workspace
// list. Keeps the UI deliberately different from the standard Signals
// cards so the user can tell at a glance they're in a different mode.
function GroupSignalRow({
  signal, checked, onToggle, onOpen, readOnly,
  wipItems, duplicateGroups, signalWipLinks, attachments,
  signalGroups, currentGroupId,
  displayFields,
}: {
  signal: Signal;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  readOnly: boolean;
  wipItems: import("@/lib/data").Wip[];
  duplicateGroups: import("@/lib/data").DuplicateGroup[];
  signalWipLinks: import("@/lib/data").SignalWipLink[];
  attachments: import("@/lib/data").SignalAttachment[];
  signalGroups: import("@/lib/data").SignalGroup[];
  currentGroupId: string;
  // Optional field-visibility config — when omitted everything shows.
  displayFields?: {
    reporter: boolean; source: boolean; date: boolean; attachments: boolean;
    description: boolean; intent: boolean; duplicate: boolean;
  };
}) {
  const df = displayFields ?? {
    reporter: true, source: true, date: true, attachments: true,
    description: true, intent: true, duplicate: true,
  };
  const [expanded, setExpanded] = useState(false);
  const linkedIntent = wipItems.find(w => signal.linkedWip.includes(w.id) && w.type === "intent");
  const dupGroup = duplicateGroups.find(g => g.signalIds.includes(signal.id));
  const dupMain = dupGroup
    ? (dupGroup.mainSignalId
        ? dupGroup.mainSignalId
        : mainSignalOf(dupGroup, [signal])?.id ?? null)
    : null;
  const isMain = !!dupMain && dupMain === signal.id;
  const isClosedDuplicate =
    signal.status === "closed" &&
    !!signal.closure?.note?.toLowerCase().includes("duplicate");
  const owner = signal.author;
  const ownerName = owner ? userByIdSafe(owner) : null;
  const ownAttachments = attachments.filter(a => a.signalId === signal.id);
  const attachmentCount = (signal.screenshots ?? 0) + ownAttachments.length;
  // Other group memberships — count the groups this signal sits in
  // besides the current one. Used for the "In N other groups" pill.
  const otherMemberships = signalGroups.filter(g =>
    g.id !== currentGroupId && g.signalIds.includes(signal.id)
  );
  const ageLabel = relTime(signal.createdAt);
  // Per-link signal-wip relationship — gives a "Addresses" / "Partially
  // addresses" hint next to the intent badge.
  const intentLink = linkedIntent
    ? signalWipLinks.find(l => l.signalId === signal.id && l.wipId === linkedIntent.id)
    : undefined;
  const intentRelationshipLabel = intentLink
    ? (intentLink.relationship === "resolves" ? "Addresses" :
       intentLink.relationship === "partially_addresses" ? "Partially addresses" :
       intentLink.relationship.replace(/_/g, " "))
    : null;

  const priorityPalette: Record<SignalPriority, { bg: string; fg: string; bd: string }> = {
    urgent: { bg: "rgba(239,68,68,0.10)",  fg: "#b91c1c", bd: "rgba(239,68,68,0.40)" },
    high:   { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
    medium: { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.40)" },
    low:    { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const pp = priorityPalette[signal.priority];

  // Duplicate relationship pill — uses richer wording per the spec.
  const dupPill = (() => {
    if (isClosedDuplicate) {
      // Closure note says "Closed as duplicate of ..." — surface that
      // explicitly. We don't try to parse the main signal id out of the
      // note text; the user can open the signal modal to see details.
      return {
        text: "Closed as duplicate",
        title: signal.closure?.note ?? "Closed as duplicate",
        bg: "var(--bg-sunken)",
        fg: "var(--text-secondary)",
        bd: "var(--border)",
      };
    }
    if (!dupGroup) return null;
    if (isMain) {
      return {
        text: `Duplicate · main (${dupGroup.signalIds.length})`,
        title: `Main of a duplicate group with ${dupGroup.signalIds.length} signals`,
        bg: "rgba(34,197,94,0.10)",
        fg: "#15803d",
        bd: "rgba(34,197,94,0.40)",
      };
    }
    // Not the main — show "Duplicate of <main id>" so the relationship
    // is unambiguous in a list view.
    return {
      text: dupMain ? `Duplicate of ${dupMain}` : "Duplicate",
      title: `Within a duplicate group of ${dupGroup.signalIds.length} signals`,
      bg: "rgba(245,158,11,0.10)",
      fg: "#b45309",
      bd: "rgba(245,158,11,0.40)",
    };
  })();

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "8px 10px 8px 12px",
      border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
      borderRadius: "var(--radius)",
      background: checked ? "var(--accent-soft)" : "var(--bg)",
      transition: "border-color 0.1s, background 0.1s",
    }}>
      {/* Three-column row layout. Left = identity (checkbox / status /
          priority / title / description). Middle = secondary metadata
          (reporter / source / age / attachments). Right = actionable
          state (linked intent / duplicate / status / multi-group / open).
          Each piece respects the displayFields config so the user can
          tune density. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* LEFT */}
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!readOnly && <Checkbox checked={checked} onChange={onToggle} />}
            <StatusDot status={signal.status} />
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
              color: pp.fg, background: pp.bg, border: `1px solid ${pp.bd}`,
              borderRadius: 100, padding: "1px 7px",
              textTransform: "uppercase", whiteSpace: "nowrap",
            }} title={`Priority: ${signal.priority}`}>
              {signal.priority}
            </span>
            <button
              onClick={onOpen}
              style={{
                flex: 1, minWidth: 0, textAlign: "left",
                background: "transparent", border: "none", padding: 0,
                fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                cursor: "pointer",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              title="Open signal detail"
            >
              {signal.title}
            </button>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
              {signal.id}
            </span>
          </div>
          {df.description && !expanded && signal.description && (
            <div style={{
              fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              paddingLeft: readOnly ? 18 : 38,
            }}>
              {signal.description}
            </div>
          )}
        </div>

        {/* MIDDLE — secondary metadata. Stacks the chosen fields with
            soft separators so the eye scans top-to-bottom. */}
        {(df.reporter || df.source || df.date || df.attachments) && (
          <div style={{
            flex: "0 0 200px", minWidth: 0,
            display: "flex", flexDirection: "column", gap: 2,
            paddingTop: 1,
          }}>
            {df.reporter && ownerName && (
              <div style={{
                fontSize: 11.5, color: "var(--text-secondary)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={`Reporter: ${ownerName}`}>
                {ownerName}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
              {df.source && (
                <span style={{
                  fontSize: 10.5, color: "var(--text-tertiary)",
                  textTransform: "capitalize", whiteSpace: "nowrap",
                }}>
                  {signal.source}
                </span>
              )}
              {df.source && df.date && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>·</span>
              )}
              {df.date && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }} title={signal.createdAt}>
                  {ageLabel}
                </span>
              )}
            </div>
            {df.attachments && attachmentCount > 0 && (
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                📎 {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

        {/* RIGHT — actionable state pills + expand. */}
        <div style={{
          flex: "0 0 auto", minWidth: 0,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: "capitalize",
              color: "var(--text-tertiary)",
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              borderRadius: 100, padding: "1px 8px",
              whiteSpace: "nowrap",
            }}>
              {signal.status}
            </span>
            <button
              onClick={() => setExpanded(e => !e)}
              aria-label={expanded ? "Collapse details" : "Expand details"}
              title={expanded ? "Hide details" : "Show details"}
              style={{
                padding: "3px 4px",
                border: "none", background: "transparent",
                color: "var(--text-tertiary)", cursor: "pointer",
                borderRadius: "var(--radius-sm)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {df.intent && linkedIntent && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: "#0369a1",
                background: "rgba(14,165,233,0.10)",
                border: "1px solid rgba(14,165,233,0.35)",
                borderRadius: 100, padding: "1px 8px",
                whiteSpace: "nowrap",
              }} title={`Linked intent: ${linkedIntent.title}${intentRelationshipLabel ? ` (${intentRelationshipLabel})` : ""}`}>
                ⇢ Intent
              </span>
            )}
            {df.duplicate && dupPill && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: dupPill.fg, background: dupPill.bg, border: `1px solid ${dupPill.bd}`,
                borderRadius: 100, padding: "1px 8px",
                whiteSpace: "nowrap",
              }} title={dupPill.title}>
                {dupPill.text}
              </span>
            )}
            {otherMemberships.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: "var(--text-secondary)",
                background: "var(--bg-sunken)",
                border: "1px solid var(--border)",
                borderRadius: 100, padding: "1px 8px",
                whiteSpace: "nowrap",
              }} title={`Also in: ${otherMemberships.map(g => g.name).join(", ")}`}>
                In {otherMemberships.length} other
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail panel — full description, attachments, group
          memberships, duplicate-group breakdown, linked intent details. */}
      {expanded && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 10,
          padding: "10px 12px",
          marginLeft: readOnly ? 18 : 38,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}>
          {signal.description && (
            <div>
              <div style={detailSectionHeaderStyle()}>Description</div>
              <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {signal.description}
              </div>
            </div>
          )}

          {signal.tpaNote && (
            <div>
              <div style={detailSectionHeaderStyle()}>TPA note</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {signal.tpaNote}
              </div>
            </div>
          )}

          {attachmentCount > 0 && (
            <div>
              <div style={detailSectionHeaderStyle()}>
                Attachments · {attachmentCount}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {signal.screenshots > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {signal.screenshots} embedded screenshot{signal.screenshots === 1 ? "" : "s"}
                  </div>
                )}
                {ownAttachments.map(a => (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 11, color: "var(--text-secondary)",
                  }}>
                    <span>{a.name}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>· {a.size}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dupGroup && (
            <div>
              <div style={detailSectionHeaderStyle()}>
                Duplicate relationship · {dupGroup.signalIds.length} signal{dupGroup.signalIds.length === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {dupGroup.signalIds.map(sid => (
                  <div key={sid} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 11, color: sid === signal.id ? "var(--text)" : "var(--text-secondary)",
                  }}>
                    <span className="mono" style={{ color: "var(--text-tertiary)" }}>{sid}</span>
                    {sid === dupMain && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                        color: "#15803d",
                        background: "rgba(34,197,94,0.10)",
                        border: "1px solid rgba(34,197,94,0.40)",
                        borderRadius: 100, padding: "0 5px",
                      }}>MAIN</span>
                    )}
                    {sid === signal.id && (
                      <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>· this signal</span>
                    )}
                  </div>
                ))}
                {dupGroup.reason && (
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 3 }}>
                    Reason: {dupGroup.reason}
                  </div>
                )}
              </div>
            </div>
          )}

          {linkedIntent && (
            <div>
              <div style={detailSectionHeaderStyle()}>Linked intent</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                  {linkedIntent.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{linkedIntent.id}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
                    · {linkedIntent.column.replace("_", " ")}
                  </span>
                  {intentRelationshipLabel && (
                    <>
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>·</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                        {intentRelationshipLabel}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {(otherMemberships.length > 0 || signalGroups.find(g => g.id === currentGroupId)) && (
            <div>
              <div style={detailSectionHeaderStyle()}>
                Group memberships · {otherMemberships.length + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>
                  ↳ {signalGroups.find(g => g.id === currentGroupId)?.name} <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>· this group</span>
                </div>
                {otherMemberships.map(g => (
                  <div key={g.id} style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    ↳ {g.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closure-note breadcrumb for "closed as duplicate" rows. */}
          {isClosedDuplicate && signal.closure?.note && (
            <div>
              <div style={detailSectionHeaderStyle()}>Closure note</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {signal.closure.note}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function detailSectionHeaderStyle(): React.CSSProperties {
  return {
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-tertiary)",
    marginBottom: 4,
  };
}

// Tiny defensive user-id → name helper. `userById` from data returns
// USERS[0] for an unknown id which is wrong for a display string; we
// guard and return null when missing.
function userByIdSafe(id: string | null): string | null {
  if (!id) return null;
  const u = USERS.find(x => x.id === id);
  return u ? u.name : null;
}

// ── SignalGroupsListView ────────────────────────────────────────────────
// Full-page Groups view. Replaces the previous dropdown / popover-style
// "Saved groups" listing. The user toggles into this view via the
// "⊞ Groups" pill in the toolbar; each group renders as a scannable
// card with name, signal count, status, reasons, notes excerpt, draft +
// finalized intent counts, duplicate count, last-updated time, and an
// "Open group" action that flips into the workspace view.
function SignalGroupsListView() {
  const {
    signalGroups, draftIntents, duplicateGroups,
    setSignalsViewMode, openGroup, createSignalGroup,
    appMode,
  } = useStore();
  const readOnly = appMode === "client";
  // Drives the unified "New group" modal — combines manual signal
  // picking with AI suggestions in one flow.
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  // Sort: in-review / open first, archived last; within each bucket,
  // most-recently-updated first so active groups float to the top.
  const sorted = useMemo(() => {
    const order: Record<typeof signalGroups[number]["status"], number> = {
      open: 0, in_review: 0, archived: 1,
    };
    return signalGroups.slice().sort((a, b) => {
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [signalGroups]);

  // Creation goes through the unified modal — name + context + reasons
  // + an initial set of signals picked manually, from AI suggestions,
  // or both.
  const handleConfirmCreate = (input: { name: string; notes?: string; reasons: SignalGroupReason[]; signalIds: string[] }) => {
    const id = createSignalGroup({
      name: input.name,
      notes: input.notes,
      reasons: input.reasons,
      signalIds: input.signalIds,
    });
    setNewGroupOpen(false);
    openGroup(id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-sunken)", overflow: "hidden" }}>
      {/* Header — page title + back affordance + create button. Mirrors
          the workspace header style so the user feels they're in a
          distinct content mode. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => setSignalsViewMode("list")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            height: 28, padding: "0 10px",
            borderRadius: 100,
            border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--text-secondary)",
            fontSize: 11, fontWeight: 500, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
          title="Back to the Signals list"
        >
          ← Signals
        </button>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Signal groups
        </span>
        <span style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>
          All saved groups
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          · {sorted.length} group{sorted.length === 1 ? "" : "s"}
        </span>
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <button
            onClick={() => setNewGroupOpen(true)}
            title="Define a new group — pick signals manually or use AI suggestions"
            style={{
              padding: "5px 12px",
              background: "var(--accent)",
              color: "white",
              border: "none", borderRadius: "var(--radius)",
              fontSize: "var(--fs-meta)", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            + New group
          </button>
        )}
      </div>

      {/* Body — scrollable. Empty-state hint when there are no groups. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px 32px" }}>
        {sorted.length === 0 ? (
          <div style={{
            margin: "60px auto", maxWidth: 420, textAlign: "center",
            fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.6,
          }}>
            No groups yet. Click <strong style={{ color: "var(--text)" }}>+ New group</strong> above to define a group — name it, give it some context, and pick signals manually or from AI suggestions in the same flow. You can also select signals first and use <strong style={{ color: "var(--text)" }}>Save as group</strong> in the selection bar as a shortcut.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
            alignItems: "start",
          }}>
            {sorted.map(g => (
              <SignalGroupListCard
                key={g.id}
                group={g}
                draftCount={draftIntents.filter(d => d.groupId === g.id && !d.finalizedWipId).length}
                finalizedCount={
                  draftIntents.filter(d => d.groupId === g.id && !!d.finalizedWipId).length
                  + g.linkedIntentIds.length
                }
                duplicateCount={duplicateGroups.filter(dg =>
                  dg.signalIds.some(sid => g.signalIds.includes(sid))
                ).length}
                onOpen={() => openGroup(g.id)}
              />
            ))}
          </div>
        )}
      </div>

      {newGroupOpen && (
        <NewGroupModal
          onClose={() => setNewGroupOpen(false)}
          onConfirm={handleConfirmCreate}
        />
      )}
    </div>
  );
}

// One card on the SignalGroupsListView grid. Designed to be scannable
// across many cards — title + counts in compact rows + a clear primary
// "Open group" action at the bottom. Status is shown as a pill so the
// user spots archived groups quickly.
function SignalGroupListCard({
  group, draftCount, finalizedCount, duplicateCount, onOpen,
}: {
  group: SignalGroup;
  draftCount: number;
  finalizedCount: number;
  duplicateCount: number;
  onOpen: () => void;
}) {
  const statusPalette: Record<typeof group.status, { bg: string; fg: string; bd: string; stripe: string }> = {
    open:      { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)", stripe: "var(--accent)" },
    in_review: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", bd: "rgba(245,158,11,0.45)", stripe: "#f59e0b" },
    archived:  { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)", stripe: "var(--text-tertiary)" },
  };
  const sp = statusPalette[group.status];
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "14px 16px 14px 18px",
      background: "var(--bg)",
      borderTop:    "1px solid var(--border)",
      borderRight:  "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
      borderLeft: `3px solid ${sp.stripe}`,
      borderRadius: "var(--radius-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 15, fontWeight: 600, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.25,
        }}>
          {group.name}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
          color: sp.fg, background: sp.bg, border: `1px solid ${sp.bd}`,
          borderRadius: 100, padding: "1px 8px",
          whiteSpace: "nowrap",
        }}>
          {SIGNAL_GROUP_STATUS_LABEL[group.status]}
        </span>
      </div>

      {/* Primary meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {group.signalIds.length} signal{group.signalIds.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          updated {relTime(group.updatedAt)}
        </span>
      </div>

      {/* Reasons row */}
      {group.reasons.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {group.reasons.slice(0, 3).map(r => (
            <span key={r} style={{
              fontSize: 10, fontWeight: 500,
              color: "var(--text-secondary)",
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              borderRadius: 100, padding: "1px 7px",
              whiteSpace: "nowrap",
            }}>
              {SIGNAL_GROUP_REASON_LABEL[r]}
            </span>
          ))}
          {group.reasons.length > 3 && (
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              +{group.reasons.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Notes excerpt (2-line clamp) */}
      {group.notes && (
        <div style={{
          fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55,
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}>
          {group.notes}
        </div>
      )}

      {/* Cross-references row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {draftCount > 0 && (
          <span style={countPillStyle("draft")}>
            Drafts · {draftCount}
          </span>
        )}
        {finalizedCount > 0 && (
          <span style={countPillStyle("intent")}>
            Intents · {finalizedCount}
          </span>
        )}
        {duplicateCount > 0 && (
          <span style={countPillStyle("dup")}>
            Duplicates · {duplicateCount}
          </span>
        )}
        {draftCount === 0 && finalizedCount === 0 && duplicateCount === 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
            No drafts, intents, or duplicate links yet
          </span>
        )}
      </div>

      <button
        onClick={onOpen}
        style={{
          marginTop: 4,
          padding: "6px 12px",
          background: "var(--accent)", color: "white",
          border: "none", borderRadius: "var(--radius)",
          fontSize: "var(--fs-meta)", fontWeight: 600, cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Open group →
      </button>
    </div>
  );
}

function countPillStyle(kind: "draft" | "intent" | "dup"): React.CSSProperties {
  const palette: Record<typeof kind, { bg: string; fg: string; bd: string }> = {
    draft:  { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
    intent: { bg: "rgba(14,165,233,0.10)", fg: "#0369a1", bd: "rgba(14,165,233,0.35)" },
    dup:    { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
  };
  const p = palette[kind];
  return {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
    color: p.fg, background: p.bg,
    border: `1px solid ${p.bd}`,
    borderRadius: 100, padding: "1px 8px",
    whiteSpace: "nowrap",
  };
}

// Shared select style for the workspace filter strip.
function workspaceFilterSelect(active: boolean): React.CSSProperties {
  return {
    padding: "4px 8px",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    color: active ? "var(--accent)" : "var(--text)",
    fontSize: 11, outline: "none",
  };
}

// ── GroupSignalCard ─────────────────────────────────────────────────────
// Larger grid tile for the "Cards" view mode. Surfaces the same context
// as the list row but spread over more vertical space so the
// description, priority, owner, age, attachments, and badges all read
// at a glance without expanding.
function GroupSignalCard({
  signal, checked, onToggle, onOpen, readOnly,
  wipItems, duplicateGroups, signalWipLinks, attachments,
  signalGroups, currentGroupId,
}: {
  signal: Signal;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  readOnly: boolean;
  wipItems: import("@/lib/data").Wip[];
  duplicateGroups: import("@/lib/data").DuplicateGroup[];
  signalWipLinks: import("@/lib/data").SignalWipLink[];
  attachments: import("@/lib/data").SignalAttachment[];
  signalGroups: import("@/lib/data").SignalGroup[];
  currentGroupId: string;
}) {
  const linkedIntent = wipItems.find(w => signal.linkedWip.includes(w.id) && w.type === "intent");
  const dupGroup = duplicateGroups.find(g => g.signalIds.includes(signal.id));
  const dupMain = dupGroup
    ? (dupGroup.mainSignalId ?? mainSignalOf(dupGroup, [signal])?.id ?? null)
    : null;
  const isMain = !!dupMain && dupMain === signal.id;
  const otherMemberships = signalGroups.filter(g => g.id !== currentGroupId && g.signalIds.includes(signal.id));
  const ownerName = signal.author ? userByIdSafe(signal.author) : null;
  const ownAttachments = attachments.filter(a => a.signalId === signal.id);
  const attachmentCount = (signal.screenshots ?? 0) + ownAttachments.length;
  const intentLink = linkedIntent
    ? signalWipLinks.find(l => l.signalId === signal.id && l.wipId === linkedIntent.id)
    : undefined;
  const priorityPalette: Record<SignalPriority, { bg: string; fg: string; bd: string }> = {
    urgent: { bg: "rgba(239,68,68,0.10)",  fg: "#b91c1c", bd: "rgba(239,68,68,0.40)" },
    high:   { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
    medium: { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.40)" },
    low:    { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const pp = priorityPalette[signal.priority];
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "12px 14px",
      border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      background: checked ? "var(--accent-soft)" : "var(--bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!readOnly && <Checkbox checked={checked} onChange={onToggle} />}
        <StatusDot status={signal.status} />
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
          color: pp.fg, background: pp.bg, border: `1px solid ${pp.bd}`,
          borderRadius: 100, padding: "1px 7px",
          textTransform: "uppercase", whiteSpace: "nowrap",
        }}>{signal.priority}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{signal.id}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: "capitalize",
          color: "var(--text-tertiary)",
          background: "var(--bg-sunken)",
          border: "1px solid var(--border)",
          borderRadius: 100, padding: "1px 8px",
          whiteSpace: "nowrap",
        }}>{signal.status}</span>
      </div>
      <button
        onClick={onOpen}
        style={{
          background: "transparent", border: "none", padding: 0, textAlign: "left",
          fontSize: 14, fontWeight: 600, color: "var(--text)",
          cursor: "pointer", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}
        title="Open signal detail"
      >
        {signal.title}
      </button>
      {signal.description && (
        <div style={{
          fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55,
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 3 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}>
          {signal.description}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
          {signal.source}
        </span>
        {ownerName && (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {ownerName}</span>
        )}
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {relTime(signal.createdAt)}</span>
        {attachmentCount > 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {otherMemberships.length > 0 && (
          <span style={cardBadgeStyle("neutral")} title={`Also in: ${otherMemberships.map(g => g.name).join(", ")}`}>
            In {otherMemberships.length} other group{otherMemberships.length === 1 ? "" : "s"}
          </span>
        )}
        {linkedIntent && (
          <span style={cardBadgeStyle("intent")} title={`Linked intent: ${linkedIntent.title}${intentLink ? ` (${intentLink.relationship.replace(/_/g, " ")})` : ""}`}>
            ⇢ Intent
          </span>
        )}
        {dupGroup && (
          isMain
            ? <span style={cardBadgeStyle("dup-main")}>Duplicate · main ({dupGroup.signalIds.length})</span>
            : <span style={cardBadgeStyle("dup")}>{dupMain ? `Duplicate of ${dupMain}` : "Duplicate"}</span>
        )}
      </div>
    </div>
  );
}

function cardBadgeStyle(kind: "neutral" | "intent" | "dup" | "dup-main"): React.CSSProperties {
  const palette: Record<typeof kind, { bg: string; fg: string; bd: string }> = {
    neutral:  { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
    intent:   { bg: "rgba(14,165,233,0.10)", fg: "#0369a1", bd: "rgba(14,165,233,0.35)" },
    dup:      { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
    "dup-main": { bg: "rgba(34,197,94,0.10)", fg: "#15803d", bd: "rgba(34,197,94,0.40)" },
  };
  const p = palette[kind];
  return {
    fontSize: 10, fontWeight: 600,
    color: p.fg, background: p.bg, border: `1px solid ${p.bd}`,
    borderRadius: 100, padding: "1px 8px",
    whiteSpace: "nowrap",
  };
}

// ── GroupSignalCompareTile ──────────────────────────────────────────────
// Full-height side-by-side tile used by the "Compare" view mode. Each
// tile is a fixed 320px wide and shows the entire signal's body —
// description, attachments, duplicate group, linked intent — so the
// user can read several signals next to each other without opening
// modals. The parent container is horizontally scrollable.
function GroupSignalCompareTile({
  signal, checked, onToggle, onOpen, readOnly,
  wipItems, duplicateGroups, signalWipLinks, attachments,
  signalGroups, currentGroupId,
}: {
  signal: Signal;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  readOnly: boolean;
  wipItems: import("@/lib/data").Wip[];
  duplicateGroups: import("@/lib/data").DuplicateGroup[];
  signalWipLinks: import("@/lib/data").SignalWipLink[];
  attachments: import("@/lib/data").SignalAttachment[];
  signalGroups: import("@/lib/data").SignalGroup[];
  currentGroupId: string;
}) {
  const linkedIntent = wipItems.find(w => signal.linkedWip.includes(w.id) && w.type === "intent");
  const dupGroup = duplicateGroups.find(g => g.signalIds.includes(signal.id));
  const dupMain = dupGroup
    ? (dupGroup.mainSignalId ?? mainSignalOf(dupGroup, [signal])?.id ?? null)
    : null;
  const isMain = !!dupMain && dupMain === signal.id;
  const otherMemberships = signalGroups.filter(g => g.id !== currentGroupId && g.signalIds.includes(signal.id));
  const ownerName = signal.author ? userByIdSafe(signal.author) : null;
  const ownAttachments = attachments.filter(a => a.signalId === signal.id);
  const attachmentCount = (signal.screenshots ?? 0) + ownAttachments.length;
  const intentLink = linkedIntent
    ? signalWipLinks.find(l => l.signalId === signal.id && l.wipId === linkedIntent.id)
    : undefined;
  const priorityPalette: Record<SignalPriority, { bg: string; fg: string; bd: string }> = {
    urgent: { bg: "rgba(239,68,68,0.10)",  fg: "#b91c1c", bd: "rgba(239,68,68,0.40)" },
    high:   { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
    medium: { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.40)" },
    low:    { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const pp = priorityPalette[signal.priority];
  return (
    <div style={{
      flexShrink: 0,
      width: 320,
      maxHeight: "calc(100vh - 260px)",
      overflowY: "auto",
      padding: "14px 14px 14px 16px",
      borderRadius: "var(--radius-lg)",
      background: checked ? "var(--accent-soft)" : "var(--bg)",
      borderTop:    checked ? "1px solid var(--accent)" : "1px solid var(--border)",
      borderRight:  checked ? "1px solid var(--accent)" : "1px solid var(--border)",
      borderBottom: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
      borderLeft:   `4px solid ${
        signal.status === "closed"   ? "var(--text-disabled)" :
        signal.status === "rejected" ? "#b91c1c" :
        signal.status === "skipped"  ? "var(--text-tertiary)" :
        signal.status === "ready"    ? "var(--status-ready)" :
        signal.status === "accepted" ? "var(--status-accepted)" :
                                       "var(--status-new)"
      }`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {!readOnly && <Checkbox checked={checked} onChange={onToggle} />}
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
          color: pp.fg, background: pp.bg, border: `1px solid ${pp.bd}`,
          borderRadius: 100, padding: "1px 7px",
          textTransform: "uppercase", whiteSpace: "nowrap",
        }}>{signal.priority}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{signal.id}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: "capitalize",
          color: "var(--text-tertiary)",
          background: "var(--bg-sunken)",
          border: "1px solid var(--border)",
          borderRadius: 100, padding: "1px 8px",
          whiteSpace: "nowrap",
        }}>{signal.status}</span>
      </div>
      <button
        onClick={onOpen}
        style={{
          background: "transparent", border: "none", padding: 0, textAlign: "left",
          fontSize: 14, fontWeight: 600, color: "var(--text)",
          cursor: "pointer", lineHeight: 1.3,
        }}
        title="Open signal detail"
      >
        {signal.title}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
          {signal.source}
        </span>
        {ownerName && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {ownerName}</span>}
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {relTime(signal.createdAt)}</span>
      </div>
      {signal.description && (
        <div>
          <div style={detailSectionHeaderStyle()}>Description</div>
          <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {signal.description}
          </div>
        </div>
      )}
      {signal.tpaNote && (
        <div>
          <div style={detailSectionHeaderStyle()}>TPA note</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {signal.tpaNote}
          </div>
        </div>
      )}
      {attachmentCount > 0 && (
        <div>
          <div style={detailSectionHeaderStyle()}>Attachments · {attachmentCount}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {signal.screenshots > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {signal.screenshots} embedded screenshot{signal.screenshots === 1 ? "" : "s"}
              </div>
            )}
            {ownAttachments.map(a => (
              <div key={a.id} style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {a.name} <span style={{ color: "var(--text-tertiary)" }}>· {a.size}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {dupGroup && (
        <div>
          <div style={detailSectionHeaderStyle()}>Duplicate relationship · {dupGroup.signalIds.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {dupGroup.signalIds.map(sid => (
              <div key={sid} style={{
                fontSize: 11, color: sid === signal.id ? "var(--text)" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span className="mono" style={{ color: "var(--text-tertiary)" }}>{sid}</span>
                {sid === dupMain && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                    color: "#15803d",
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.40)",
                    borderRadius: 100, padding: "0 5px",
                  }}>MAIN</span>
                )}
                {sid === signal.id && (
                  <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>· this signal</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {linkedIntent && (
        <div>
          <div style={detailSectionHeaderStyle()}>Linked intent</div>
          <div style={{ fontSize: 11.5, color: "var(--text)" }}>{linkedIntent.title}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
            <span className="mono">{linkedIntent.id}</span> · {linkedIntent.column.replace("_", " ")}
            {intentLink && <> · {intentLink.relationship === "resolves" ? "Addresses" : intentLink.relationship === "partially_addresses" ? "Partially addresses" : intentLink.relationship.replace(/_/g, " ")}</>}
          </div>
        </div>
      )}
      {otherMemberships.length > 0 && (
        <div>
          <div style={detailSectionHeaderStyle()}>Also in</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {otherMemberships.map(g => (
              <div key={g.id} style={{ fontSize: 11, color: "var(--text-secondary)" }}>↳ {g.name}</div>
            ))}
          </div>
        </div>
      )}
      {/* Status/priority/links/dup pills strip at the bottom mirrors
          the list view so users can compare badges in one row. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: "auto" }}>
        {dupGroup && (
          isMain
            ? <span style={cardBadgeStyle("dup-main")}>Duplicate · main</span>
            : <span style={cardBadgeStyle("dup")}>{dupMain ? `Dup of ${dupMain}` : "Duplicate"}</span>
        )}
        {linkedIntent && <span style={cardBadgeStyle("intent")}>⇢ Intent</span>}
      </div>
    </div>
  );
}

// ── NewGroupModal ──────────────────────────────────────────────────────
// Unified group-creation flow. The user defines name + context + reasons
// up top (always visible), then chooses signals via two interchangeable
// tabs in the same modal:
//
//   • "Pick signals" — searchable, filterable list of all signals with
//                      checkboxes. Manual selection.
//   • "AI suggestions" — clusters detected from ungrouped signals.
//                        Each cluster expands to reveal its candidate
//                        signal list, and individual signals can be
//                        added/removed from the staging set.
//
// Both tabs feed into a single `selectedSignalIds` set, so the user
// can mix manual picks with AI-sourced picks freely. The bottom of
// the modal shows the running total + Create button.
function NewGroupModal({
  onClose, onConfirm,
}: {
  onClose: () => void;
  onConfirm: (input: { name: string; notes?: string; reasons: SignalGroupReason[]; signalIds: string[] }) => void;
}) {
  const { signals, signalGroups } = useStore();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [reasons, setReasons] = useState<SignalGroupReason[]>([]);
  const [selectedSignalIds, setSelectedSignalIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"pick" | "ai">("pick");
  const [pickQuery, setPickQuery] = useState("");
  // Which AI suggestion (if any) is expanded — only one at a time so
  // the modal doesn't get tall.
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);

  const canConfirm = name.trim().length > 0;
  const toggleReason = (r: SignalGroupReason) =>
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleSignal = (id: string) =>
    setSelectedSignalIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = () => {
    if (!canConfirm) return;
    onConfirm({
      name: name.trim(),
      notes: notes.trim() || undefined,
      reasons,
      signalIds: Array.from(selectedSignalIds),
    });
  };

  // ── Manual picker: filter the full signal pool by query. We keep
  // already-grouped signals visible so users can add a signal to a
  // second group when that makes sense.
  const filteredSignals = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return signals.filter(s => {
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q);
    }).slice(0, 100);
  }, [signals, pickQuery]);

  // ── AI suggestions: cluster the ungrouped signal pool with simple
  // lexical heuristics + source / staleness buckets. Same logic the
  // previous SuggestGroupsModal used; folded in here so both flows
  // live in one place.
  const ungroupedSignals = useMemo(() => {
    const inAnyGroup = new Set<string>();
    signalGroups.forEach(g => g.signalIds.forEach(id => inAnyGroup.add(id)));
    return signals.filter(s => !inAnyGroup.has(s.id));
  }, [signals, signalGroups]);

  type Suggestion = {
    id: string;
    name: string;
    notes: string;
    reasons: SignalGroupReason[];
    signalIds: string[];
  };
  const suggestions: Suggestion[] = useMemo(() => {
    const out: Suggestion[] = [];
    const STOP = new Set(["the","and","with","that","this","from","into","when","where","what","have","been","were","over","under","need","needs","also","just","very","more","less","like","make","made","please","still","again","while","about","cannot","doesnt","doesn","could","would","should","since","there","their","than","then","these","those","such","each","other","onto","upon","does","done","much","most","some","only","seem","seems"]);
    const wordCount = new Map<string, Set<string>>();
    for (const s of ungroupedSignals) {
      const text = (s.title + " " + (s.description ?? "")).toLowerCase();
      const tokens = text.match(/[a-z]{4,}/g) ?? [];
      const seen = new Set<string>();
      for (const t of tokens) {
        if (STOP.has(t)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        const arr = wordCount.get(t) ?? new Set<string>();
        arr.add(s.id);
        wordCount.set(t, arr);
      }
    }
    const candidates = Array.from(wordCount.entries())
      .filter(([_, ids]) => ids.size >= 3)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5);
    for (const [word, idSet] of candidates) {
      const cap = word.charAt(0).toUpperCase() + word.slice(1);
      out.push({
        id: `kw-${word}`,
        name: `${cap}-related feedback`,
        notes: `Signals mentioning "${word}" that aren't yet in any group.`,
        reasons: ["same_theme"],
        signalIds: Array.from(idSet).slice(0, 12),
      });
    }
    const feedbackUnread = ungroupedSignals.filter(s => s.source === "feedback" && s.status === "new");
    if (feedbackUnread.length >= 3) {
      out.push({
        id: "feedback-unread",
        name: "Unread feedback signals",
        notes: "Ungrouped feedback that hasn't been triaged yet.",
        reasons: ["other"],
        signalIds: feedbackUnread.map(s => s.id).slice(0, 20),
      });
    }
    const stale = ungroupedSignals.filter(s => {
      if (s.status !== "new") return false;
      const ageDays = (Date.now() - new Date(s.createdAt).getTime()) / 86_400_000;
      return ageDays > 14;
    });
    if (stale.length >= 3) {
      out.push({
        id: "stale",
        name: "Stale signals to review",
        notes: "Signals over 2 weeks old that haven't been acted on.",
        reasons: ["same_action"],
        signalIds: stale.map(s => s.id).slice(0, 20),
      });
    }
    // De-dup heavy overlap.
    const filtered: Suggestion[] = [];
    for (const s of out) {
      const overlap = filtered.find(prev => {
        const a = new Set(prev.signalIds);
        const shared = s.signalIds.filter(id => a.has(id)).length;
        return shared / Math.min(prev.signalIds.length, s.signalIds.length) > 0.7;
      });
      if (overlap) continue;
      filtered.push(s);
    }
    return filtered.slice(0, 6);
  }, [ungroupedSignals]);

  // Add ALL signals from a suggestion to the staging set. Optionally
  // also seeds the name/notes/reasons fields when they're empty so the
  // user doesn't have to retype.
  const applySuggestion = (s: Suggestion) => {
    setSelectedSignalIds(prev => {
      const next = new Set(prev);
      s.signalIds.forEach(id => next.add(id));
      return next;
    });
    if (name.trim() === "") setName(s.name);
    if (notes.trim() === "") setNotes(s.notes);
    if (reasons.length === 0) setReasons(s.reasons);
  };

  return createPortal(
    <div
      data-keep-selection="new-group-modal"
      role="dialog"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        data-keep-selection="new-group-modal"
        style={{
          width: 720, maxWidth: "100%", maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          padding: 20,
          display: "flex", flexDirection: "column", gap: 14,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)", flex: 1 }}>
            New signal group
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 4, background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* ── Identity fields ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
            Group name
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Mobile responsiveness issues"
            style={{
              padding: "8px 10px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", outline: "none",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
            Context / theme <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· optional</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="What ties these signals together?"
            style={{
              padding: "8px 10px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", lineHeight: 1.5, outline: "none",
              resize: "vertical",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
            Reasons <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· optional</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(SIGNAL_GROUP_REASON_LABEL) as SignalGroupReason[]).map(r => {
              const active = reasons.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleReason(r)}
                  type="button"
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: active ? "var(--accent-soft)" : "var(--bg)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    fontSize: 11, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  {SIGNAL_GROUP_REASON_LABEL[r]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Signals section with tabs ───────────────────────────── */}
        <div style={{
          marginTop: 4, padding: "10px 12px",
          border: "1px solid var(--border)", borderRadius: "var(--radius)",
          background: "var(--bg-sunken)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
              Signals
            </label>
            <span style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", gap: 2, background: "var(--bg)", borderRadius: 100, padding: 2, border: "1px solid var(--border)" }}>
              {(["pick", "ai"] as const).map(t => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: "3px 10px", borderRadius: 100, border: "none",
                      background: active ? "var(--bg-sunken)" : "transparent",
                      color: active ? "var(--text)" : "var(--text-secondary)",
                      fontSize: 11, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    {t === "pick" ? "Pick signals" : "✦ AI suggestions"}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "pick" ? (
            <>
              <input
                value={pickQuery}
                onChange={e => setPickQuery(e.target.value)}
                placeholder="Search signals by title or description…"
                style={{
                  padding: "6px 10px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 12, outline: "none",
                }}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
              <div style={{
                maxHeight: 280, overflowY: "auto",
                display: "flex", flexDirection: "column", gap: 4,
                paddingRight: 2,
              }}>
                {filteredSignals.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
                    No signals match. Try a shorter query.
                  </div>
                ) : (
                  filteredSignals.map(s => {
                    const isSelected = selectedSignalIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 8,
                          padding: "6px 8px",
                          border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          background: isSelected ? "var(--accent-soft)" : "var(--bg)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSignal(s.id)}
                          style={{ marginTop: 2 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 500, color: "var(--text)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {s.title}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 1 }}>
                            <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{s.id}</span>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "capitalize" }}>· {s.source}</span>
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>· {s.status}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Possible clusters detected from <strong style={{ color: "var(--text)" }}>{ungroupedSignals.length}</strong> ungrouped signals. Click a suggestion to expand its signal list, then add the ones you want — or use <em>Add all</em>.
              </p>
              {suggestions.length === 0 ? (
                <div style={{
                  padding: "16px 14px", textAlign: "center",
                  fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.55,
                  border: "1px dashed var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)",
                }}>
                  No obvious clusters found. Switch to <strong style={{ color: "var(--text-secondary)" }}>Pick signals</strong> to choose manually.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                  {suggestions.map(sg => {
                    const expanded = expandedSuggestionId === sg.id;
                    const allIn = sg.signalIds.every(id => selectedSignalIds.has(id));
                    return (
                      <div
                        key={sg.id}
                        style={{
                          border: "1px solid var(--border)", borderRadius: "var(--radius)",
                          background: "var(--bg)",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                          <button
                            onClick={() => setExpandedSuggestionId(expanded ? null : sg.id)}
                            style={{
                              flex: 1, minWidth: 0, textAlign: "left",
                              background: "transparent", border: "none", padding: 0,
                              cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 6,
                            }}
                            title={expanded ? "Hide signals" : "Show the signals in this suggestion"}
                          >
                            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                                {sg.name}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                                {sg.notes}
                              </div>
                            </div>
                          </button>
                          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                            {sg.signalIds.length} signal{sg.signalIds.length === 1 ? "" : "s"}
                          </span>
                          <button
                            onClick={() => applySuggestion(sg)}
                            disabled={allIn}
                            title={allIn ? "All these signals are already selected" : "Add all signals from this suggestion (also seeds empty name/context fields)"}
                            style={{
                              padding: "2px 10px", borderRadius: 100,
                              background: allIn ? "var(--bg-sunken)" : "var(--accent)",
                              color: allIn ? "var(--text-tertiary)" : "white",
                              border: "none", fontSize: 11, fontWeight: 600,
                              cursor: allIn ? "default" : "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            {allIn ? "Added" : "Add all"}
                          </button>
                        </div>
                        {expanded && (
                          <div style={{
                            borderTop: "1px solid var(--border)",
                            padding: "6px 10px",
                            display: "flex", flexDirection: "column", gap: 3,
                            background: "var(--bg-sunken)",
                          }}>
                            {sg.signalIds.map(id => {
                              const sig = signals.find(x => x.id === id);
                              if (!sig) return null;
                              const isSelected = selectedSignalIds.has(id);
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "4px 6px",
                                    borderRadius: "var(--radius-sm)",
                                    background: isSelected ? "var(--accent-soft)" : "transparent",
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSignal(id)}
                                  />
                                  <span style={{
                                    flex: 1, minWidth: 0,
                                    fontSize: 12, color: "var(--text)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {sig.title}
                                  </span>
                                  <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{sig.id}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer: running total + actions ──────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 0 0",
        }}>
          <span style={{ fontSize: 12, color: selectedSignalIds.size === 0 ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
            {selectedSignalIds.size === 0
              ? "No signals selected — group will start empty (you can add some later)."
              : `${selectedSignalIds.size} signal${selectedSignalIds.size === 1 ? "" : "s"} selected`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius)",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "var(--fs-body)", fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canConfirm}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius)",
              background: canConfirm ? "var(--accent)" : "var(--bg-sunken)",
              color: canConfirm ? "white" : "var(--text-tertiary)",
              border: "none", fontSize: "var(--fs-body)", fontWeight: 600,
              cursor: canConfirm ? "pointer" : "default",
            }}
          >
            Create group
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── SuggestSignalsModal ────────────────────────────────────────────────
// Mock "AI" signal-suggestion pass for the group workspace. Scores
// non-member signals by lexical overlap with the group's name + notes +
// reasons. Filter chips narrow the candidate pool by status / source.
// Per-row Accept (adds to group) / Reject (hides from this session)
// keeps the flow deliberate — nothing is auto-accepted.
function SuggestSignalsModal({
  group, onClose,
}: {
  group: SignalGroup;
  onClose: () => void;
}) {
  const { signals, addSignalToGroup } = useStore();

  const [filterStatus, setFilterStatus] = useState<"all" | "unread" | "unresolved">("all");
  const [filterSource, setFilterSource] = useState<"all" | "feedback" | "note">("all");
  const [extraQuery, setExtraQuery] = useState("");
  // Session-local "rejected" set so the user can dismiss suggestions
  // without affecting the underlying signal data.
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  // Build a keyword bag from the group's identity. Reasons get their
  // human labels split into tokens too so "same client" can match
  // signals from a client-feedback bucket.
  const keywords = useMemo(() => {
    const text = [
      group.name,
      group.notes ?? "",
      ...group.reasons.map(r => SIGNAL_GROUP_REASON_LABEL[r]),
    ].join(" ").toLowerCase();
    const tokens = text.match(/[a-z]{4,}/g) ?? [];
    const STOP = new Set(["the","and","with","that","this","from","into","when","where","what","have","been","were","over","under","like","also","just","very","more","less","make","done","such","some","other","onto","upon","than","then"]);
    const out = new Set<string>();
    for (const t of tokens) {
      if (STOP.has(t)) continue;
      out.add(t);
    }
    return out;
  }, [group.name, group.notes, group.reasons]);

  // Candidate pool — every signal NOT in the group, optionally
  // narrowed by the filter chips and the rejected set.
  const candidates = useMemo(() => {
    const inGroup = new Set(group.signalIds);
    return signals.filter(s => {
      if (inGroup.has(s.id)) return false;
      if (rejected.has(s.id)) return false;
      if (filterStatus === "unread"     && s.status !== "new") return false;
      if (filterStatus === "unresolved" && (s.status === "closed" || s.status === "rejected" || s.status === "skipped")) return false;
      if (filterSource !== "all" && s.source !== filterSource) return false;
      return true;
    });
  }, [signals, group.signalIds, rejected, filterStatus, filterSource]);

  const eq = extraQuery.trim().toLowerCase();
  const scored = useMemo(() => {
    const list = candidates.map(s => {
      const text = (s.title + " " + (s.description ?? "")).toLowerCase();
      let score = 0;
      keywords.forEach(k => { if (text.includes(k)) score += 2; });
      // Extra free-text query — heavily weighted because it's the
      // user's most direct expression of intent.
      if (eq) {
        if (text.includes(eq)) score += 6;
        // Also break the query into words for partial matches.
        const qTokens = eq.match(/[a-z]{3,}/g) ?? [];
        for (const t of qTokens) if (text.includes(t)) score += 1;
      }
      return { signal: s, score };
    });
    return list.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 30);
  }, [candidates, keywords, eq]);

  const accept = (id: string) => addSignalToGroup(group.id, id);
  const reject = (id: string) => setRejected(prev => { const n = new Set(prev); n.add(id); return n; });

  return createPortal(
    <div
      data-keep-selection="suggest-signals-modal"
      role="dialog"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        data-keep-selection="suggest-signals-modal"
        style={{
          width: 720, maxWidth: "100%", maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          padding: 20,
          display: "flex", flexDirection: "column", gap: 12,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)", flex: 1 }}>
            ✦ Suggest signals for &ldquo;{group.name}&rdquo;
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 4, background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={12} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Candidates scored against this group's name, context, and reasons. Nothing is added automatically — accept rows you want; rejections are remembered for this session only.
        </p>

        {/* Filter chips — keep parameters discoverable in the modal
            instead of nesting them in a separate settings popover. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Filter:</span>
          {(["all", "unread", "unresolved"] as const).map(s => {
            const active = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: "2px 10px", borderRadius: 100,
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "var(--accent-soft)" : "var(--bg)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: 11, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                }}
              >
                {s === "all" ? "Any status" : s}
              </button>
            );
          })}
          {(["all", "feedback", "note"] as const).map(s => {
            const active = filterSource === s;
            return (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                style={{
                  padding: "2px 10px", borderRadius: 100,
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "var(--accent-soft)" : "var(--bg)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: 11, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                }}
              >
                {s === "all" ? "Any source" : s}
              </button>
            );
          })}
          <input
            value={extraQuery}
            onChange={e => setExtraQuery(e.target.value)}
            placeholder="Optional extra keywords…"
            style={{
              flex: 1, minWidth: 160,
              padding: "3px 8px", borderRadius: 100,
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", fontSize: 11, outline: "none",
            }}
          />
        </div>

        {/* Suggestion list */}
        {scored.length === 0 ? (
          <div style={{
            padding: "16px 14px", textAlign: "center",
            fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
            border: "1px dashed var(--border)", borderRadius: "var(--radius)",
            background: "var(--bg-sunken)",
          }}>
            No matching signals — try broadening the filters or adding extra keywords above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scored.map(({ signal: s }) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.title}
                  </div>
                  {s.description && (
                    <div style={{
                      fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 1 as unknown as number, WebkitBoxOrient: "vertical" as const,
                      marginTop: 1,
                    }}>
                      {s.description}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: "var(--text-tertiary)",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border)",
                  borderRadius: 100, padding: "1px 7px",
                  whiteSpace: "nowrap",
                  textTransform: "capitalize",
                }}>
                  {s.status}
                </span>
                <button
                  onClick={() => reject(s.id)}
                  title="Reject — hide from this session"
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    background: "transparent", border: "1px solid var(--border)",
                    color: "var(--text-tertiary)", fontSize: 11, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={() => accept(s.id)}
                  title="Accept — add this signal to the group"
                  style={{
                    padding: "3px 10px", borderRadius: 100,
                    background: "var(--accent)", border: "1px solid var(--accent)",
                    color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius)",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "var(--fs-body)", fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
