"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  WeeklyGoal, WeeklyGoalStatus, ProductArea, Feature, FeatureStatus, FeatureSlice,
  FeatureGroup, ProductCapability, SliceCapabilityStatus,
  Wip, userById,
} from "@/lib/data";
import { Plus, X, ChevronDown, ChevronRight, Check, Task, Intent } from "@/components/ui/icons";

// ── RoadmapPage ───────────────────────────────────────────────────────────
// Lightweight traceability view that ties weekly goals, product areas /
// features / slices, and intents together. Two sub-tabs:
//   • Weekly — time-based; one column per week, goal cards inside.
//   • Product — hierarchy; Area → Feature → Slice → linked intents.
//
// V1 scope is deliberately narrow:
//   - manual linking only (no auto-derivation)
//   - human-controlled goal status (no auto-Done from children)
//   - no MoSCoW / release planning / AI suggestions / client view
//
// Linking surfaces use the same multi-select popover so the user
// recognises the pattern across views.

type RoadmapTab = "weekly" | "product";

export function RoadmapPage() {
  const { roadmapFocus, setRoadmapFocus } = useStore();
  const [tab, setTab] = useState<RoadmapTab>("weekly");
  // Session-only filter for the Weekly view; lives on the page so the
  // saved-features strip and the timeline read the same value.
  const [featureFilter, setFeatureFilter] = useState<string | null>(null);
  // Selected feature for the Product View. Lifted to the page so cards
  // on the Weekly tab can open a specific feature on the Product side.
  // `null` lets ProductExplorerView pick its own default (the Auth demo).
  const [productSelectedFeatureId, setProductSelectedFeatureId] = useState<string | null>(null);
  // Transient highlight for a goal card the user just navigated to from
  // another view (eg. an intent detail). Cleared after a few seconds so
  // the highlight doesn't linger across edits.
  const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);

  // Apply incoming roadmap focus from other tabs / pages. We read it
  // here, drive local state, then immediately clear the focus on the
  // store so a second navigation can re-trigger.
  React.useEffect(() => {
    if (!roadmapFocus) return;
    setTab(roadmapFocus.tab);
    if (roadmapFocus.tab === "product" && roadmapFocus.featureId) {
      setProductSelectedFeatureId(roadmapFocus.featureId);
    }
    if (roadmapFocus.tab === "weekly" && roadmapFocus.goalId) {
      setFocusedGoalId(roadmapFocus.goalId);
      // Defer the scroll one tick so the card has mounted.
      const id = roadmapFocus.goalId;
      setTimeout(() => {
        const el = document.querySelector(`[data-goal-id="${id}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      // Drop the highlight after a moment.
      const t = setTimeout(() => setFocusedGoalId(null), 2400);
      setRoadmapFocus(null);
      return () => clearTimeout(t);
    }
    setRoadmapFocus(null);
  }, [roadmapFocus, setRoadmapFocus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-sunken)" }}>
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            {tab === "weekly" ? "Weekly goals" : "Product view"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {tab === "weekly"
              ? "· Connect each goal to the intents and features that support it"
              : "· Browse product capability areas, features, and slices"}
          </span>
          <span style={{ flex: 1 }} />
          <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 100, padding: 2 }}>
            {(["weekly", "product"] as RoadmapTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "5px 12px", borderRadius: 100, border: "none",
                  background: tab === t ? "var(--bg)" : "transparent",
                  color: tab === t ? "var(--text)" : "var(--text-secondary)",
                  fontSize: "var(--fs-meta)", fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: tab === t ? "var(--shadow-sm)" : undefined,
                }}
              >
                {t === "weekly" ? "Weekly goals" : "Product view"}
              </button>
            ))}
          </div>
        </div>
        {/* The saved-features strip is only relevant on the Weekly tab
            (it links chip clicks to goal filtering). Hidden on Product
            view where the tree IS the feature list. */}
        {tab === "weekly" && (
          <FeaturesSummaryStrip
            activeFilter={featureFilter}
            onToggleFilter={(id) => setFeatureFilter(prev => prev === id ? null : id)}
            onClearFilter={() => setFeatureFilter(null)}
          />
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "weekly"
          ? <WeeklyGoalsView featureFilter={featureFilter} focusedGoalId={focusedGoalId} />
          : <ProductExplorerView
              selectedFeatureId={productSelectedFeatureId}
              onSelectFeature={setProductSelectedFeatureId}
            />}
      </div>
    </div>
  );
}

// ── FeaturesSummaryStrip ─────────────────────────────────────────────────
// Always-visible row in the Roadmap header that shows every manually-
// created feature as a chip with the number of weekly goals linking to
// it. Confirms to the user that typed features are saved somewhere they
// can see, and lets them spot which features are unused (count 0).
// Click a chip → highlights / scrolls to the first goal that uses it.

function FeaturesSummaryStrip({
  activeFilter, onToggleFilter, onClearFilter,
}: {
  activeFilter: string | null;
  onToggleFilter: (id: string) => void;
  onClearFilter: () => void;
}) {
  const { features, weeklyGoals } = useStore();

  // Count goals linking each feature so the chip text can read
  // "<title> · N goals" — clearer at a glance than "×N".
  const usageById = new Map<string, number>();
  for (const g of weeklyGoals) {
    for (const fid of g.linkedFeatureIds) {
      usageById.set(fid, (usageById.get(fid) ?? 0) + 1);
    }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      paddingTop: 2,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
        textTransform: "uppercase", color: "var(--text-tertiary)",
      }}>
        Features ({features.length})
      </span>
      {features.length === 0 ? (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
          No features yet. Type one in the Features field on any goal below to save it — it will appear here.
        </span>
      ) : (
        <>
          {features.map(f => {
            const count = usageById.get(f.id) ?? 0;
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onToggleFilter(f.id)}
                title={isActive
                  ? `Showing only goals linked to "${f.title}". Click again to clear.`
                  : count > 0
                    ? `Click to show only goals linked to "${f.title}"`
                    : "Saved feature — not linked to any goal yet"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "2px 9px", borderRadius: 100,
                  background: isActive
                    ? "var(--accent)"
                    : count > 0
                      ? "var(--accent-soft)"
                      : "var(--bg-sunken)",
                  color: isActive
                    ? "white"
                    : count > 0
                      ? "var(--accent)"
                      : "var(--text-tertiary)",
                  border: isActive
                    ? "1px solid var(--accent)"
                    : count > 0
                      ? "1px solid rgba(59,130,246,0.30)"
                      : "1px solid var(--border)",
                  fontSize: 11, fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {f.title}
                <span style={{
                  fontSize: 10, fontWeight: 600, opacity: 0.85,
                  fontFamily: "JetBrains Mono, ui-monospace, monospace",
                }}>
                  · {count} {count === 1 ? "goal" : "goals"}
                </span>
              </button>
            );
          })}
          {/* Clear-filter chip — only when a filter is active. */}
          {activeFilter && (
            <button
              onClick={onClearFilter}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 9px", borderRadius: 100,
                background: "var(--bg)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
              title="Show every goal again"
            >
              <X size={9} /> Clear filter
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── status pill helpers ───────────────────────────────────────────────────

const GOAL_STATUS_LABEL: Record<WeeklyGoalStatus, string> = {
  planned: "Planned", in_progress: "In Progress", done: "Done",
};
const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  not_started: "Not Started", planned: "Planned", in_progress: "In Progress", done: "Done",
};
function pillStyle(kind: "planned" | "in_progress" | "done" | "not_started"): React.CSSProperties {
  const palette =
    kind === "done"        ? { bg: "#f0fdf4", fg: "#15803d", bd: "#bbf7d0" } :
    kind === "in_progress" ? { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" } :
    kind === "planned"     ? { bg: "var(--accent-soft)", fg: "var(--accent)", bd: "rgba(59,130,246,0.30)" } :
                              { bg: "var(--bg-sunken)", fg: "var(--text-tertiary)", bd: "var(--border)" };
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "1px 7px", borderRadius: 100,
    background: palette.bg, color: palette.fg,
    border: `1px solid ${palette.bd}`,
    fontSize: 10.5, fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

// ── WeeklyGoalsView ───────────────────────────────────────────────────────
// Horizontal scrolling timeline. One column per week (sorted by weekStart
// ascending). Each column lists its goals; an "+ New goal" affordance
// lives in each column header so the user picks the week implicitly by
// clicking the right one.

function WeeklyGoalsView({ featureFilter, focusedGoalId }: { featureFilter: string | null; focusedGoalId: string | null }) {
  const { weeklyGoals, createWeeklyGoal, features } = useStore();
  // Group goals by weekStart, sorted ascending so the timeline reads
  // left-to-right. When a feature filter is active we keep every week
  // column (so the timeline structure stays stable) but narrow each
  // column's goals to those that link the chosen feature.
  const groups = useMemo(() => {
    const filtered = featureFilter
      ? weeklyGoals.filter(g => g.linkedFeatureIds.includes(featureFilter))
      : weeklyGoals;
    const byWeek = new Map<string, WeeklyGoal[]>();
    for (const g of filtered) {
      const arr = byWeek.get(g.weekStart) ?? [];
      arr.push(g);
      byWeek.set(g.weekStart, arr);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, items]) => ({ weekStart, items: items.slice().sort((x, y) => x.createdAt.localeCompare(y.createdAt)) }));
  }, [weeklyGoals, featureFilter]);
  const filterLabel = featureFilter ? features.find(f => f.id === featureFilter)?.title : null;

  const handleAddWeek = () => {
    // Pick the Monday of next week from the latest column, or "this Monday".
    const latest = groups[groups.length - 1]?.weekStart;
    const base = latest ? new Date(latest) : (() => {
      const d = new Date();
      const day = d.getDay(); // 0 Sun..6 Sat
      const diff = (day === 0 ? -6 : 1) - day; // back to Monday
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + diff);
      return d;
    })();
    const next = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    createWeeklyGoal({ title: "Untitled goal", weekStart: next.toISOString() });
  };

  // When the filter narrows everything to zero goals, render an empty
  // state instead of just the "Add next week" button — so the user
  // doesn't think their goals vanished.
  const isEmptyAfterFilter = featureFilter !== null && groups.every(g => g.items.length === 0);

  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "flex-start",
      padding: 16, minHeight: "100%",
    }}>
      {isEmptyAfterFilter ? (
        <div style={{
          margin: "40px auto", maxWidth: 380, textAlign: "center",
          fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
        }}>
          No weekly goals are linked to <strong style={{ color: "var(--text)" }}>{filterLabel}</strong> yet. Clear the filter to see everything, or add this feature to a goal to make it appear here.
        </div>
      ) : groups.map(g => (
        <WeekColumn key={g.weekStart} weekStart={g.weekStart} goals={g.items} focusedGoalId={focusedGoalId} />
      ))}
      <button
        onClick={handleAddWeek}
        style={{
          flexShrink: 0, width: 340,
          padding: "12px 14px",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          background: "transparent",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-meta)", fontWeight: 500,
          cursor: "pointer",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        + Add next week
      </button>
    </div>
  );
}

function WeekColumn({ weekStart, goals, focusedGoalId }: { weekStart: string; goals: WeeklyGoal[]; focusedGoalId: string | null }) {
  const { createWeeklyGoal } = useStore();
  const label = goals[0]?.weekLabel ?? weekLabelFromISO(weekStart);
  return (
    <div style={{
      flexShrink: 0, width: 340,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        padding: "6px 12px",
        background: "var(--bg)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Week of
        </span>
        <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {goals.length} goal{goals.length === 1 ? "" : "s"}
        </span>
      </div>
      {goals.map(g => <WeeklyGoalCard key={g.id} goal={g} focused={focusedGoalId === g.id} />)}
      <button
        onClick={() => createWeeklyGoal({ title: "Untitled goal", weekStart })}
        style={{
          padding: "8px 10px",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius)",
          background: "transparent",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-meta)", fontWeight: 500,
          cursor: "pointer",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        + New goal in this week
      </button>
    </div>
  );
}

function weekLabelFromISO(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} — ${fmt(end)}`;
}

function WeeklyGoalCard({ goal, focused }: { goal: WeeklyGoal; focused?: boolean }) {
  const {
    updateWeeklyGoal, deleteWeeklyGoal, wipItems, features, featureSlices, productCapabilities,
    toggleGoalIntent, toggleGoalSlice, toggleGoalCapability, setRoute, openWip, setRoadmapFocus,
  } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(goal.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(goal.notes ?? "");

  // V1 progress hint only counts linked intents — features are planning
  // labels and don't have a runtime status the team agrees on yet, so
  // we don't fold them into "N of M done".
  const linkedIntents = wipItems.filter(w => w.type === "intent" && goal.linkedIntentIds.includes(w.id));
  const totalLinked = linkedIntents.length;
  const doneItems = linkedIntents.filter(w => w.column === "done").length;

  // Resolve linked product targets so we can render rich rows + open
  // them in the Product View via cross-tab focus.
  const linkedSlices = featureSlices.filter(s => goal.linkedSliceIds.includes(s.id));
  const linkedCapabilities = productCapabilities.filter(c => goal.linkedCapabilityIds.includes(c.id));

  return (
    <div
      data-goal-id={goal.id}
      style={{
        padding: "12px 14px",
        background: "var(--bg)",
        // React warns when a `border` shorthand and a `borderLeft`
        // override coexist on the same element (the shorthand can
        // clobber the override during re-renders). Split into the
        // three non-left sides + an explicit `borderLeft` to keep
        // the colored status stripe authoritative.
        borderTop:    focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRight:  focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderBottom: focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: `3px solid ${goal.status === "done" ? "var(--status-accepted)" : goal.status === "in_progress" ? "#f59e0b" : "var(--accent)"}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: focused ? "0 0 0 3px rgba(56, 132, 255, 0.18)" : undefined,
        display: "flex", flexDirection: "column", gap: 8,
        transition: "box-shadow 0.25s ease, border-color 0.25s ease",
      }}>
      {/* Title + status */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateWeeklyGoal(goal.id, { title: titleDraft.trim() || goal.title }); setEditingTitle(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateWeeklyGoal(goal.id, { title: titleDraft.trim() || goal.title }); setEditingTitle(false); }
              else if (e.key === "Escape") { setTitleDraft(goal.title); setEditingTitle(false); }
            }}
            style={{
              flex: 1, border: "1px solid var(--accent)",
              borderRadius: "var(--radius)",
              padding: "4px 6px", fontSize: "var(--fs-body)", fontWeight: 600,
              color: "var(--text)", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(goal.title); setEditingTitle(true); }}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: "var(--fs-body)", fontWeight: 600,
              color: "var(--text)", cursor: "text", lineHeight: 1.35,
            }}
            title="Click to edit"
          >
            {goal.title}
          </button>
        )}
        <GoalStatusPicker
          status={goal.status}
          onChange={(s) => updateWeeklyGoal(goal.id, { status: s })}
        />
        <button
          onClick={() => { if (window.confirm("Delete this goal?")) deleteWeeklyGoal(goal.id); }}
          aria-label="Delete goal"
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

      {/* Progress hint (informational — does NOT auto-change goal status) */}
      {totalLinked > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {doneItems} of {totalLinked} linked intent{totalLinked === 1 ? "" : "s"} done
        </div>
      )}

      {/* Linked Product Targets — three reusable link surfaces under one
          container so the goal can reach broad features OR concrete
          slices / capabilities. Slices + capabilities open the Product
          View focused on their parent feature. */}
      <div style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-sunken)",
        padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Linked Product Targets
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 10.5 }}>
            · features, slices, or capabilities
          </span>
        </div>

        {/* Feature — typed input, persists across goals. */}
        <FeatureInlineEditor goal={goal} />

        {/* Feature slices */}
        <LinkedSection
          title="Feature slices"
          items={linkedSlices.map(s => {
            const parent = features.find(f => f.id === s.featureId);
            return {
              id: s.id, label: s.title,
              right: parent ? <span style={subtleParentPill()}>{parent.title}</span> : undefined,
              onOpen: () => setRoadmapFocus({ tab: "product", featureId: s.featureId, sliceId: s.id }),
            };
          })}
          addPicker={
            <SlicePicker
              value={goal.linkedSliceIds}
              onToggle={(id) => toggleGoalSlice(goal.id, id)}
            />
          }
          emptyHint="No feature slices linked yet."
        />

        {/* Product capabilities */}
        <LinkedSection
          title="Product capabilities"
          items={linkedCapabilities.map(c => {
            const parent = features.find(f => f.id === c.featureId);
            return {
              id: c.id, label: c.title,
              right: parent ? <span style={subtleParentPill()}>{parent.title}</span> : undefined,
              onOpen: () => setRoadmapFocus({ tab: "product", featureId: c.featureId }),
            };
          })}
          addPicker={
            <CapabilityPicker
              value={goal.linkedCapabilityIds}
              onToggle={(id) => toggleGoalCapability(goal.id, id)}
            />
          }
          emptyHint="No product capabilities linked yet."
        />
      </div>

      {/* Linked intents — kept as a separate section to reinforce that
          intents are LINKED (many-to-many), not children of the goal. */}
      <LinkedSection
        title="Linked intents"
        items={linkedIntents.map(w => ({
          id: w.id, label: w.title,
          right: <span style={pillStyle(intentColumnAsStatus(w))}>{intentColumnLabel(w)}</span>,
          onOpen: () => { setRoute("wip"); openWip(w.id); },
        }))}
        addPicker={
          <IntentPicker
            value={goal.linkedIntentIds}
            onToggle={(id) => toggleGoalIntent(goal.id, id)}
          />
        }
        emptyHint="No intents linked yet."
      />

      {/* Notes — collapsed to a click-to-edit row to keep the card compact. */}
      <div>
        {editingNotes ? (
          <textarea
            autoFocus
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            onBlur={() => { updateWeeklyGoal(goal.id, { notes: notesDraft }); setEditingNotes(false); }}
            rows={2}
            placeholder="Notes (optional)…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 8px", border: "1px solid var(--accent)",
              borderRadius: "var(--radius)", background: "var(--bg)",
              color: "var(--text)", fontSize: 12, lineHeight: 1.5, outline: "none",
            }}
          />
        ) : goal.notes ? (
          <button
            onClick={() => { setNotesDraft(goal.notes ?? ""); setEditingNotes(true); }}
            style={{
              width: "100%", textAlign: "left",
              padding: "6px 8px", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", background: "var(--bg-sunken)",
              color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5,
              cursor: "text",
            }}
            title="Click to edit notes"
          >
            {goal.notes}
          </button>
        ) : (
          <button
            onClick={() => { setNotesDraft(""); setEditingNotes(true); }}
            style={{
              padding: "2px 4px", fontSize: 11, color: "var(--text-tertiary)",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            + Add notes
          </button>
        )}
      </div>
    </div>
  );
}

function intentColumnAsStatus(w: Wip): "planned" | "in_progress" | "done" | "not_started" {
  if (w.column === "done") return "done";
  if (w.column === "in_progress") return "in_progress";
  if (w.column === "to_do") return "planned";
  return "not_started";
}
function intentColumnLabel(w: Wip): string {
  if (w.column === "done") return "Done";
  if (w.column === "in_progress") return "In Progress";
  if (w.column === "to_do") return "To Do";
  return "Backlog";
}

// ── LinkedSection ────────────────────────────────────────────────────────
// Reusable list row used inside WeeklyGoalCard for Features / Slices /
// Intents. Each item shows a left label + optional right pill; the +
// button lives next to the title and opens the relevant picker popover.

function LinkedSection({
  title, items, addPicker, emptyHint,
}: {
  title: string;
  items: { id: string; label: string; right?: React.ReactNode; onOpen?: () => void }[];
  addPicker: React.ReactNode;
  emptyHint?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          {title}
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>· {items.length}</span>
        )}
        <span style={{ flex: 1 }} />
        {addPicker}
      </div>
      {items.length === 0 ? (
        emptyHint && (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
            {emptyHint}
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map(it => (
            <div key={it.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)",
            }}>
              {it.onOpen ? (
                <button
                  onClick={it.onOpen}
                  style={{
                    flex: 1, textAlign: "left",
                    background: "transparent", border: "none", padding: 0,
                    fontSize: "var(--fs-body)", color: "var(--text)", cursor: "pointer",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {it.label}
                </button>
              ) : (
                <span style={{
                  flex: 1, fontSize: "var(--fs-body)", color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {it.label}
                </span>
              )}
              {it.right}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pickers — small multi-select popovers ────────────────────────────────

function PickerPopover({
  options, value, onToggle, label,
}: {
  options: { id: string; label: string; subtitle?: string }[];
  value: string[];
  onToggle: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={label}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "2px 6px", borderRadius: "var(--radius)",
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
          width: 280, maxHeight: 280, overflowY: "auto",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            {label}
          </div>
          {options.length === 0 ? (
            <div style={{ padding: 12, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textAlign: "center" }}>
              Nothing available to link.
            </div>
          ) : options.map(opt => {
            const sel = value.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", textAlign: "left",
                  background: "transparent", border: "none", cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 14, height: 14, borderRadius: 3,
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
      )}
    </div>
  );
}

// ── FeatureInlineEditor ──────────────────────────────────────────────────
// Typed feature input that replaces the V0 "Link feature" mystery list.
// Behaviour:
//   • Linked features render as removable chips above the input.
//   • Typing in the input filters existing features as suggestions.
//   • Pressing Enter with a string that EXACTLY matches a suggestion
//     links that existing feature.
//   • Pressing Enter with a non-matching string creates a new feature
//     (areaId omitted — typed features live outside the hidden Product
//     hierarchy in V1) and links it. Newly-created features persist and
//     suggest themselves on future goals automatically.
//   • Clicking a suggestion has the same effect as Enter on that text.
//   • Backspace on an empty input unlinks the last chip — keyboard-only
//     editing without reaching for the mouse.

function FeatureInlineEditor({ goal }: { goal: WeeklyGoal }) {
  const { features, createFeature, toggleGoalFeature, updateWeeklyGoal } = useStore();
  const linkedFeatures = features.filter(f => goal.linkedFeatureIds.includes(f.id));

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const trimmed = query.trim();
  const normalized = trimmed.toLowerCase();
  // Suggestions: features whose title contains the query AND that
  // aren't already linked to this goal. Cap at 6 so the popover
  // doesn't outgrow the card.
  const suggestions = trimmed.length === 0
    ? features.filter(f => !goal.linkedFeatureIds.includes(f.id)).slice(0, 6)
    : features
        .filter(f => !goal.linkedFeatureIds.includes(f.id))
        .filter(f => f.title.toLowerCase().includes(normalized))
        .slice(0, 6);
  const exactMatch = features.find(f => f.title.toLowerCase() === normalized);

  const linkExisting = (id: string) => {
    if (!goal.linkedFeatureIds.includes(id)) toggleGoalFeature(goal.id, id);
    setQuery("");
    setOpen(false);
  };
  const createAndLink = (title: string) => {
    const newId = createFeature({ title });
    // toggleGoalFeature reads state at call time; we patch the goal
    // directly with the new id to avoid the race.
    updateWeeklyGoal(goal.id, { linkedFeatureIds: [...goal.linkedFeatureIds, newId] });
    setQuery("");
    setOpen(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (trimmed.length === 0) return;
      if (exactMatch) linkExisting(exactMatch.id);
      else createAndLink(trimmed);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    } else if (e.key === "Backspace" && query.length === 0 && linkedFeatures.length > 0) {
      // Pop the last linked feature when the input is empty — quick
      // keyboard recovery from an accidental link.
      toggleGoalFeature(goal.id, linkedFeatures[linkedFeatures.length - 1].id);
    }
  };

  return (
    <div ref={containerRef}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
        Features
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4,
        padding: "4px 6px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg)",
        position: "relative",
      }}>
        {linkedFeatures.map(f => (
          <span
            key={f.id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "1px 6px", borderRadius: 100,
              background: "var(--accent-soft)", color: "var(--accent)",
              border: "1px solid rgba(59,130,246,0.30)",
              fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
            }}
          >
            {f.title}
            <button
              onClick={() => toggleGoalFeature(goal.id, f.id)}
              aria-label={`Unlink ${f.title}`}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 12, height: 12, borderRadius: 100,
                background: "transparent", border: "none", cursor: "pointer",
                color: "var(--accent)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <X size={9} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={linkedFeatures.length === 0 ? "Type feature name…" : "Add another…"}
          style={{
            flex: 1, minWidth: 120,
            border: "none", outline: "none", background: "transparent",
            color: "var(--text)", fontSize: "var(--fs-body)",
            padding: "2px 4px",
          }}
        />
      </div>
      <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
        Feature = the product capability this goal supports. Type a name; pick a suggestion or press Enter to create.
      </div>

      {/* Suggestions popover */}
      {open && (suggestions.length > 0 || (trimmed.length > 0 && !exactMatch)) && (
        <div style={{
          position: "relative",
          marginTop: 4,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
          zIndex: 50,
        }}>
          {suggestions.map(f => {
            // Highlight match position so the user sees why this
            // option surfaced. Plain JS split-on-query.
            const i = trimmed.length > 0 ? f.title.toLowerCase().indexOf(normalized) : -1;
            const before = i >= 0 ? f.title.slice(0, i) : f.title;
            const match  = i >= 0 ? f.title.slice(i, i + trimmed.length) : "";
            const after  = i >= 0 ? f.title.slice(i + trimmed.length) : "";
            return (
              <button
                key={f.id}
                onClick={() => linkExisting(f.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "5px 10px", textAlign: "left",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: "var(--fs-body)", color: "var(--text)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {before}
                  {match && <span style={{ background: "rgba(59,130,246,0.18)", color: "var(--accent)", fontWeight: 600 }}>{match}</span>}
                  {after}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>existing</span>
              </button>
            );
          })}
          {trimmed.length > 0 && !exactMatch && (
            <button
              onClick={() => createAndLink(trimmed)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "5px 10px", textAlign: "left",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: "var(--fs-body)", color: "var(--text)",
                borderTop: suggestions.length > 0 ? "1px solid var(--border)" : undefined,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Plus size={11} style={{ color: "var(--accent)" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Create feature <strong style={{ color: "var(--text)" }}>“{trimmed}”</strong>
              </span>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>new</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FeaturePicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { features, productAreas } = useStore();
  const options = features.map(f => ({
    id: f.id, label: f.title,
    subtitle: productAreas.find(a => a.id === f.areaId)?.title,
  }));
  return <PickerPopover label="Link feature" options={options} value={value} onToggle={onToggle} />;
}
function SlicePicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { featureSlices, features } = useStore();
  const options = featureSlices.map(s => ({
    id: s.id, label: s.title,
    subtitle: features.find(f => f.id === s.featureId)?.title,
  }));
  return <PickerPopover label="Link feature slice" options={options} value={value} onToggle={onToggle} />;
}
function IntentPicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { wipItems } = useStore();
  const options = wipItems
    .filter(w => w.type === "intent")
    .map(w => ({ id: w.id, label: w.title, subtitle: intentColumnLabel(w) }));
  return <PickerPopover label="Link intent" options={options} value={value} onToggle={onToggle} />;
}
function CapabilityPicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { productCapabilities, features } = useStore();
  const options = productCapabilities.map(c => ({
    id: c.id, label: c.title,
    subtitle: features.find(f => f.id === c.featureId)?.title,
  }));
  return <PickerPopover label="Link product capability" options={options} value={value} onToggle={onToggle} />;
}

// Small "from <Feature>" pill used on linked-slice + linked-capability
// rows to make the parent feature legible at a glance.
function subtleParentPill(): React.CSSProperties {
  return {
    fontSize: 10, color: "var(--text-tertiary)",
    background: "var(--bg-sunken)",
    border: "1px solid var(--border)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap",
  };
}

function GoalStatusPicker({
  status, onChange,
}: {
  status: WeeklyGoalStatus;
  onChange: (s: WeeklyGoalStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={pillStyle(status)}>
        {GOAL_STATUS_LABEL[status]} <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 140, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {(["planned", "in_progress", "done"] as WeeklyGoalStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "6px 10px", textAlign: "left",
                background: s === status ? "var(--bg-sunken)" : "transparent",
                border: "none", cursor: "pointer",
                fontSize: "var(--fs-body)", color: "var(--text)",
              }}
              onMouseEnter={e => { if (s !== status) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (s !== status) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={pillStyle(s)}>{GOAL_STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureStatusPicker({
  status, onChange,
}: {
  status: FeatureStatus;
  onChange: (s: FeatureStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={pillStyle(status)}>
        {FEATURE_STATUS_LABEL[status]} <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 160, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {(["not_started", "planned", "in_progress", "done"] as FeatureStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "6px 10px", textAlign: "left",
                background: s === status ? "var(--bg-sunken)" : "transparent",
                border: "none", cursor: "pointer",
                fontSize: "var(--fs-body)", color: "var(--text)",
              }}
              onMouseEnter={e => { if (s !== status) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (s !== status) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={pillStyle(s)}>{FEATURE_STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ProductHierarchyView ─────────────────────────────────────────────────
// Area → Feature → Slice → linked intents. Each level collapsible. New-
// item affordances live as dashed buttons at the end of each list, so
// the user adds a feature within an area / a slice within a feature
// without leaving the view.

function ProductHierarchyView() {
  const { productAreas, features, featureSlices, createProductArea } = useStore();
  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {productAreas.map(area => (
        <AreaBlock
          key={area.id}
          area={area}
          features={features.filter(f => f.areaId === area.id)}
          slicesByFeature={Object.fromEntries(
            features.filter(f => f.areaId === area.id).map(f =>
              [f.id, featureSlices.filter(s => s.featureId === f.id)]),
          )}
        />
      ))}
      <button
        onClick={() => {
          const title = window.prompt("New product area name");
          if (title?.trim()) createProductArea({ title });
        }}
        style={{
          padding: "10px 12px",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          background: "transparent",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-meta)", fontWeight: 500,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        + Add product area
      </button>
    </div>
  );
}

function AreaBlock({
  area, features, slicesByFeature,
}: {
  area: ProductArea;
  features: Feature[];
  slicesByFeature: Record<string, FeatureSlice[]>;
}) {
  const { updateProductArea, deleteProductArea, createFeature } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(area.title);
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      background: "var(--bg)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "var(--bg)", borderBottom: collapsed ? "none" : "1px solid var(--border)",
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateProductArea(area.id, { title: titleDraft.trim() || area.title }); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateProductArea(area.id, { title: titleDraft.trim() || area.title }); setEditing(false); }
              else if (e.key === "Escape") { setTitleDraft(area.title); setEditing(false); }
            }}
            style={{
              flex: 1, border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "4px 6px", fontSize: 14, fontWeight: 600, color: "var(--text)",
              background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(area.title); setEditing(true); }}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: 14, fontWeight: 600, color: "var(--text)", cursor: "text",
            }}
            title="Click to edit"
          >
            {area.title}
          </button>
        )}
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {features.length} feature{features.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => { if (window.confirm(`Delete "${area.title}" and its features?`)) deleteProductArea(area.id); }}
          aria-label="Delete area"
          style={{
            padding: 4, background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={11} />
        </button>
      </div>
      {!collapsed && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {area.description && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {area.description}
            </div>
          )}
          {features.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              No features yet. Add one below to start describing this area.
            </div>
          )}
          {features.map(f => (
            <FeatureBlock
              key={f.id}
              feature={f}
              slices={slicesByFeature[f.id] ?? []}
            />
          ))}
          <button
            onClick={() => {
              const title = window.prompt("New feature title");
              if (title?.trim()) createFeature({ title, areaId: area.id });
            }}
            style={{
              padding: "8px 10px",
              border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
              background: "transparent",
              color: "var(--text-tertiary)", fontSize: "var(--fs-meta)", fontWeight: 500,
              cursor: "pointer", alignSelf: "flex-start",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            + Add feature
          </button>
        </div>
      )}
    </div>
  );
}

function FeatureBlock({ feature, slices }: { feature: Feature; slices: FeatureSlice[] }) {
  const {
    updateFeature, deleteFeature, createFeatureSlice,
    wipItems, toggleFeatureIntent, setRoute, openWip,
  } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(feature.title);

  const linkedIntents = wipItems.filter(w => w.type === "intent" && feature.linkedIntentIds.includes(w.id));

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px",
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateFeature(feature.id, { title: titleDraft.trim() || feature.title }); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateFeature(feature.id, { title: titleDraft.trim() || feature.title }); setEditing(false); }
              else if (e.key === "Escape") { setTitleDraft(feature.title); setEditing(false); }
            }}
            style={{
              flex: 1, border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "3px 6px", fontSize: 13, fontWeight: 500, color: "var(--text)",
              background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(feature.title); setEditing(true); }}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: 13, fontWeight: 500, color: "var(--text)", cursor: "text",
            }}
            title="Click to edit"
          >
            {feature.title}
          </button>
        )}
        <FeatureStatusPicker status={feature.status} onChange={s => updateFeature(feature.id, { status: s })} />
        <button
          onClick={() => { if (window.confirm(`Delete feature "${feature.title}"?`)) deleteFeature(feature.id); }}
          aria-label="Delete feature"
          style={{
            padding: 4, background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
          }}
        >
          <X size={10} />
        </button>
      </div>
      {!collapsed && (
        <div style={{ padding: "0 12px 10px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          {feature.description && (
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {feature.description}
            </div>
          )}

          {/* Feature-level intent links */}
          <LinkedSection
            title="Linked intents"
            items={linkedIntents.map(w => ({
              id: w.id, label: w.title,
              right: <span style={pillStyle(intentColumnAsStatus(w))}>{intentColumnLabel(w)}</span>,
              onOpen: () => { setRoute("wip"); openWip(w.id); },
            }))}
            addPicker={
              <IntentPicker
                value={feature.linkedIntentIds}
                onToggle={(id) => toggleFeatureIntent(feature.id, id)}
              />
            }
            emptyHint="No intents linked to this feature."
          />

          {/* Slices */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              Feature slices
            </div>
            {slices.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
                No slices yet. Slices are the smallest deliverable chunks of this feature.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {slices.map(s => <SliceBlock key={s.id} slice={s} />)}
            </div>
            <button
              onClick={() => {
                const title = window.prompt("New feature slice title");
                if (title?.trim()) createFeatureSlice({ title, featureId: feature.id });
              }}
              style={{
                marginTop: 6, padding: "5px 8px",
                border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
                background: "transparent",
                color: "var(--text-tertiary)", fontSize: 11, fontWeight: 500,
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              + Add slice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SliceBlock({ slice }: { slice: FeatureSlice }) {
  const { updateFeatureSlice, deleteFeatureSlice, wipItems, toggleFeatureSliceIntent, setRoute, openWip } = useStore();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(slice.title);
  const linkedIntents = wipItems.filter(w => w.type === "intent" && slice.linkedIntentIds.includes(w.id));

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)", padding: "6px 10px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateFeatureSlice(slice.id, { title: titleDraft.trim() || slice.title }); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateFeatureSlice(slice.id, { title: titleDraft.trim() || slice.title }); setEditing(false); }
              else if (e.key === "Escape") { setTitleDraft(slice.title); setEditing(false); }
            }}
            style={{
              flex: 1, border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "2px 5px", fontSize: "var(--fs-body)", color: "var(--text)",
              background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(slice.title); setEditing(true); }}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: "var(--fs-body)", color: "var(--text)", cursor: "text",
            }}
            title="Click to edit"
          >
            {slice.title}
          </button>
        )}
        <FeatureStatusPicker status={slice.status} onChange={s => updateFeatureSlice(slice.id, { status: s })} />
        <button
          onClick={() => { if (window.confirm(`Delete slice "${slice.title}"?`)) deleteFeatureSlice(slice.id); }}
          aria-label="Delete slice"
          style={{
            padding: 4, background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
          }}
        >
          <X size={10} />
        </button>
      </div>
      {slice.description && (
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
          {slice.description}
        </div>
      )}
      <LinkedSection
        title="Linked intents"
        items={linkedIntents.map(w => ({
          id: w.id, label: w.title,
          right: <span style={pillStyle(intentColumnAsStatus(w))}>{intentColumnLabel(w)}</span>,
          onOpen: () => { setRoute("wip"); openWip(w.id); },
        }))}
        addPicker={
          <IntentPicker
            value={slice.linkedIntentIds}
            onToggle={(id) => toggleFeatureSliceIntent(slice.id, id)}
          />
        }
      />
    </div>
  );
}

// ── ProductExplorerView ──────────────────────────────────────────────────
// Two-column Product hierarchy browser.
//
// Left rail: Areas → Groups → Features. Click a feature to select it.
// Features without an area land in an "Ungrouped" bucket at the bottom
// so V1's typed-feature flow remains discoverable from here.
//
// Right detail: the selected feature's editable fields (title +
// description), its product capabilities list, and its slices. Each
// slice shows the inclusion table for the parent feature's
// capabilities — must / should / could / won't, exactly as in the spec.

function ProductExplorerView({
  selectedFeatureId, onSelectFeature,
}: {
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
}) {
  const { features } = useStore();
  // The selection is lifted into RoadmapPage so cross-tab focus from a
  // goal card can open a specific feature here. On first arrival with
  // no explicit selection, default-select the Auth example so the demo
  // lands on a populated detail view.
  React.useEffect(() => {
    if (selectedFeatureId === null) {
      const fallback = features.find(f => f.areaId === "area-auth")?.id ?? features[0]?.id ?? null;
      if (fallback) onSelectFeature(fallback);
    }
  }, [selectedFeatureId, features, onSelectFeature]);
  // Re-resolve if the selected feature got deleted.
  React.useEffect(() => {
    if (selectedFeatureId && !features.some(f => f.id === selectedFeatureId)) {
      onSelectFeature(features[0]?.id ?? null);
    }
  }, [features, selectedFeatureId, onSelectFeature]);

  const selectedId = selectedFeatureId;
  const setSelectedId = onSelectFeature;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left rail */}
      <aside style={{
        width: 320, flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg)",
        overflowY: "auto",
        padding: "12px 12px 20px",
      }}>
        <ProductTree
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
        />
        <button
          onClick={() => {
            const title = window.prompt("New capability area name");
            if (title?.trim()) {
              // Reuse existing createProductArea action.
              // Stored in the seed file already; we don't need to do anything more.
              // eslint-disable-next-line @typescript-eslint/no-unused-expressions
              ((typeof window !== "undefined") && void title);
            }
          }}
          style={{ display: "none" }} // Hidden — area creation lives inside ProductTree per-area inline buttons.
        />
        <div style={{
          marginTop: 12, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5,
        }}>
          Use the + buttons to add groups and features. Click a feature to edit it on the right.
        </div>
        <NewAreaButton />
      </aside>

      {/* Right detail */}
      <main style={{
        flex: 1, minWidth: 0, padding: "16px 24px",
        overflowY: "auto",
      }}>
        {selectedId ? (
          <FeatureDetailPane featureId={selectedId} />
        ) : (
          <div style={{
            margin: "60px auto", maxWidth: 360, textAlign: "center",
            fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
          }}>
            Select a feature on the left to edit its description, product capabilities, and slices.
          </div>
        )}
      </main>
    </div>
  );
}

function NewAreaButton() {
  const { createProductArea } = useStore();
  return (
    <button
      onClick={() => {
        const title = window.prompt("New capability area name");
        if (title?.trim()) createProductArea({ title });
      }}
      style={{
        marginTop: 10, padding: "5px 10px",
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius)",
        background: "transparent",
        color: "var(--text-tertiary)",
        fontSize: 11, fontWeight: 500, cursor: "pointer",
        width: "100%", textAlign: "left",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      + Add capability area
    </button>
  );
}

function ProductTree({
  selectedId, onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { productAreas, featureGroups, features } = useStore();
  // Bucket features: areaId → (groupId | "__none") → Feature[].
  // Features with no areaId land in a synthetic "ungrouped" bucket at
  // the end of the rail so V1's typed-feature flow stays reachable.
  const orphans = features.filter(f => !f.areaId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {productAreas.map(area => (
        <AreaTreeBlock
          key={area.id}
          area={area}
          groups={featureGroups.filter(g => g.areaId === area.id)}
          features={features.filter(f => f.areaId === area.id)}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
      {orphans.length > 0 && (
        <UnassignedTreeBlock
          features={orphans}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function AreaTreeBlock({
  area, groups, features, selectedId, onSelect,
}: {
  area: ProductArea;
  groups: FeatureGroup[];
  features: Feature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { updateProductArea, deleteProductArea, createFeatureGroup, createFeature } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(area.title);

  const ungroupedInArea = features.filter(f => !f.featureGroupId);

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
        <button onClick={() => setCollapsed(c => !c)} style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateProductArea(area.id, { title: titleDraft.trim() || area.title }); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateProductArea(area.id, { title: titleDraft.trim() || area.title }); setEditing(false); }
              else if (e.key === "Escape") { setTitleDraft(area.title); setEditing(false); }
            }}
            style={{
              flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "2px 5px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(area.title); setEditing(true); }}
            style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", cursor: "text" }}
            title="Click to rename"
          >
            {area.title}
          </button>
        )}
        <button
          onClick={() => { if (window.confirm(`Delete area "${area.title}"? Its groups and features will be unassigned.`)) deleteProductArea(area.id); }}
          aria-label="Delete area"
          style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
        >
          <X size={10} />
        </button>
      </div>
      {!collapsed && (
        <div style={{ padding: "0 8px 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {area.description && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, paddingLeft: 18 }}>
              {area.description}
            </div>
          )}
          {groups.map(g => (
            <GroupTreeBlock
              key={g.id}
              group={g}
              features={features.filter(f => f.featureGroupId === g.id)}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {ungroupedInArea.length > 0 && (
            <div style={{ paddingLeft: 16, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                In area
              </div>
              {ungroupedInArea.map(f => (
                <FeatureTreeRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, paddingLeft: 16, marginTop: 4 }}>
            <button
              onClick={() => {
                const title = window.prompt("New feature group name");
                if (title?.trim()) createFeatureGroup({ title, areaId: area.id });
              }}
              style={dashedBtn()}
            >
              + Add group
            </button>
            <button
              onClick={() => {
                const title = window.prompt("New feature name (no group)");
                if (title?.trim()) createFeature({ title, areaId: area.id });
              }}
              style={dashedBtn()}
            >
              + Add feature
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupTreeBlock({
  group, features, selectedId, onSelect,
}: {
  group: FeatureGroup;
  features: Feature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { updateFeatureGroup, deleteFeatureGroup, createFeature } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  return (
    <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => setCollapsed(c => !c)} style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateFeatureGroup(group.id, { title: titleDraft.trim() || group.title }); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateFeatureGroup(group.id, { title: titleDraft.trim() || group.title }); setEditing(false); }
              else if (e.key === "Escape") { setTitleDraft(group.title); setEditing(false); }
            }}
            style={{
              flex: 1, fontSize: 11.5, fontWeight: 500, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "1px 5px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(group.title); setEditing(true); }}
            style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: 11.5, fontWeight: 500, color: "var(--text)", cursor: "text" }}
            title="Click to rename"
          >
            {group.title}
          </button>
        )}
        <button
          onClick={() => { if (window.confirm(`Delete group "${group.title}"? Its features will be detached but kept.`)) deleteFeatureGroup(group.id); }}
          aria-label="Delete group"
          style={{ padding: 2, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
        >
          <X size={9} />
        </button>
      </div>
      {!collapsed && (
        <div style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
          {features.map(f => (
            <FeatureTreeRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
          ))}
          <button
            onClick={() => {
              const title = window.prompt("New feature name");
              if (title?.trim()) createFeature({ title, areaId: group.areaId, featureGroupId: group.id });
            }}
            style={dashedBtn()}
          >
            + Add feature
          </button>
        </div>
      )}
    </div>
  );
}

// "Unassigned features" — the holding bucket for features created from
// weekly goals (or any feature input) that don't yet belong to a
// capability area / feature group. Each row is openable AND surfaces an
// inline "Assign to hierarchy" action; assignment moves the feature out
// of this bucket without touching its existing goal/intent links.
function UnassignedTreeBlock({
  features, selectedId, onSelect,
}: {
  features: Feature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{
      border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", padding: "6px 8px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
        Unassigned features · {features.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {features.map(f => (
          <UnassignedFeatureRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.45 }}>
        Features typed on weekly goals land here. Use <strong style={{ color: "var(--text-secondary)" }}>Assign</strong> to file them under a capability area and feature group — their linked goals and intents are preserved.
      </div>
    </div>
  );
}

// Two-zone row: the main click target opens the feature in the detail
// pane (so the user can still edit description / capabilities / slices
// before assignment), while the right-side Assign button opens the
// assignment dialog without losing the rail context.
function UnassignedFeatureRow({
  feature, selectedId, onSelect,
}: {
  feature: Feature;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { weeklyGoals } = useStore();
  const [showAssign, setShowAssign] = useState(false);
  const isSelected = selectedId === feature.id;
  const goalCount = weeklyGoals.filter(g => g.linkedFeatureIds.includes(feature.id)).length;
  const intentCount = feature.linkedIntentIds.length;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 4px",
        borderRadius: "var(--radius)",
        background: isSelected ? "var(--accent-soft)" : "transparent",
      }}
    >
      <button
        onClick={() => onSelect(feature.id)}
        style={{
          flex: 1, minWidth: 0,
          display: "flex", alignItems: "center", gap: 6,
          padding: "2px 6px",
          background: "transparent", border: "none", cursor: "pointer",
          color: isSelected ? "var(--accent)" : "var(--text)",
          fontSize: "var(--fs-body)", fontWeight: isSelected ? 600 : 400,
          textAlign: "left",
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
        title={feature.title}
      >
        <span style={pillStyle(feature.status)}>{FEATURE_STATUS_LABEL[feature.status]}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {feature.title}
        </span>
        {(goalCount > 0 || intentCount > 0) && (
          <span style={{
            fontSize: 10, color: "var(--text-tertiary)",
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 100, padding: "1px 6px", whiteSpace: "nowrap",
          }}
          title={`${goalCount} linked goal${goalCount === 1 ? "" : "s"} · ${intentCount} linked intent${intentCount === 1 ? "" : "s"}`}>
            {goalCount > 0 && <>{goalCount} goal{goalCount === 1 ? "" : "s"}</>}
            {goalCount > 0 && intentCount > 0 && " · "}
            {intentCount > 0 && <>{intentCount} intent{intentCount === 1 ? "" : "s"}</>}
          </span>
        )}
      </button>
      <button
        onClick={() => setShowAssign(true)}
        title="Assign this feature to a capability area + feature group"
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          border: "1px solid var(--border-strong)", borderRadius: 100,
          background: "var(--bg)",
          color: "var(--text-secondary)",
          fontSize: 10.5, fontWeight: 500,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-soft)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        Assign
      </button>
      {showAssign && (
        <AssignFeatureDialog feature={feature} onClose={() => setShowAssign(false)} />
      )}
    </div>
  );
}

// ── AssignFeatureDialog ──────────────────────────────────────────────────
// Lightweight modal for filing an unassigned feature into the hierarchy.
//   • Area: pick from existing, or type a new area name.
//   • Feature group: pick from existing within the chosen area, type a
//     new group, or leave the feature directly in the area (no group).
//   • Confirm creates any new area/group first, then patches the
//     feature with the resolved ids — its existing linkedIntentIds and
//     goal back-links are untouched (we only edit areaId/featureGroupId).

function AssignFeatureDialog({
  feature, onClose,
}: {
  feature: Feature;
  onClose: () => void;
}) {
  const {
    productAreas, featureGroups,
    createProductArea, createFeatureGroup, updateFeature,
  } = useStore();

  const [areaMode, setAreaMode] = useState<"existing" | "new">(
    productAreas.length > 0 ? "existing" : "new"
  );
  const [selectedAreaId, setSelectedAreaId] = useState<string>(
    productAreas[0]?.id ?? ""
  );
  const [newAreaTitle, setNewAreaTitle] = useState("");

  const [groupMode, setGroupMode] = useState<"none" | "existing" | "new">("none");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [newGroupTitle, setNewGroupTitle] = useState("");

  // When the user is filing into a brand-new area, there can't be any
  // existing groups in it — collapse to "none" or "new" group modes.
  const groupsInChosenArea = areaMode === "existing" && selectedAreaId
    ? featureGroups.filter(g => g.areaId === selectedAreaId)
    : [];
  React.useEffect(() => {
    // If we switch to a new area or an area with no groups, force the
    // group mode away from "existing".
    if (areaMode === "new" && groupMode === "existing") setGroupMode("none");
    if (areaMode === "existing" && groupsInChosenArea.length === 0 && groupMode === "existing") {
      setGroupMode("none");
    }
    // Reset selected group when area changes.
    setSelectedGroupId(groupsInChosenArea[0]?.id ?? "");
    // We intentionally exclude groupsInChosenArea (computed each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaMode, selectedAreaId]);

  const newAreaValid = newAreaTitle.trim().length > 0;
  const newGroupValid = newGroupTitle.trim().length > 0;
  const areaReady = areaMode === "existing"
    ? selectedAreaId !== ""
    : newAreaValid;
  const groupReady = groupMode === "none"
    ? true
    : groupMode === "existing"
      ? selectedGroupId !== ""
      : newGroupValid;
  const canConfirm = areaReady && groupReady;

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Resolve area first — needed for both an existing-group lookup and
    // a new-group create.
    const areaId = areaMode === "existing"
      ? selectedAreaId
      : createProductArea({ title: newAreaTitle.trim() });
    let groupId: string | undefined;
    if (groupMode === "existing") groupId = selectedGroupId;
    else if (groupMode === "new") groupId = createFeatureGroup({ title: newGroupTitle.trim(), areaId });
    // featureGroupId: undefined places the feature directly inside the
    // area (rendered under that area's "In area" bucket). All other
    // feature fields — linkedIntentIds, linkedFeatureIds back-references,
    // capabilities, slices — are untouched.
    updateFeature(feature.id, { areaId, featureGroupId: groupId });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 700,
        background: "var(--bg-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.12s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: "92vw",
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
            Assign to hierarchy
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
            {feature.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.45 }}>
            Pick a capability area and (optionally) a feature group. Linked weekly goals and intents stay attached to the feature.
          </div>
        </div>

        {/* Capability area selector */}
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Capability area
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={radioRow(areaMode === "existing")}>
              <input
                type="radio"
                checked={areaMode === "existing"}
                onChange={() => setAreaMode("existing")}
                disabled={productAreas.length === 0}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Use an existing area
              </span>
              {productAreas.length === 0 && (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  · none yet
                </span>
              )}
            </label>
            {areaMode === "existing" && productAreas.length > 0 && (
              <select
                value={selectedAreaId}
                onChange={e => setSelectedAreaId(e.target.value)}
                style={selectStyle()}
              >
                {productAreas.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            )}
            <label style={radioRow(areaMode === "new")}>
              <input
                type="radio"
                checked={areaMode === "new"}
                onChange={() => setAreaMode("new")}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Create a new area
              </span>
            </label>
            {areaMode === "new" && (
              <input
                autoFocus
                value={newAreaTitle}
                onChange={e => setNewAreaTitle(e.target.value)}
                placeholder="New capability area name…"
                style={inputStyle()}
              />
            )}
          </div>
        </section>

        {/* Feature group selector */}
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Feature group
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={radioRow(groupMode === "none")}>
              <input
                type="radio"
                checked={groupMode === "none"}
                onChange={() => setGroupMode("none")}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Place directly in area (no group)
              </span>
            </label>
            <label style={{
              ...radioRow(groupMode === "existing"),
              opacity: areaMode === "new" || groupsInChosenArea.length === 0 ? 0.5 : 1,
            }}>
              <input
                type="radio"
                checked={groupMode === "existing"}
                onChange={() => setGroupMode("existing")}
                disabled={areaMode === "new" || groupsInChosenArea.length === 0}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Use an existing group
              </span>
              {areaMode === "existing" && groupsInChosenArea.length === 0 && (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· none in this area yet</span>
              )}
            </label>
            {groupMode === "existing" && groupsInChosenArea.length > 0 && (
              <select
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                style={selectStyle()}
              >
                {groupsInChosenArea.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            )}
            <label style={radioRow(groupMode === "new")}>
              <input
                type="radio"
                checked={groupMode === "new"}
                onChange={() => setGroupMode("new")}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Create a new group
              </span>
            </label>
            {groupMode === "new" && (
              <input
                value={newGroupTitle}
                onChange={e => setNewGroupTitle(e.target.value)}
                placeholder="New feature group name…"
                style={inputStyle()}
              />
            )}
          </div>
        </section>

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
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              padding: "6px 14px",
              background: canConfirm ? "var(--accent)" : "var(--bg-sunken)",
              color: canConfirm ? "white" : "var(--text-tertiary)",
              border: "none", borderRadius: "var(--radius)",
              fontSize: "var(--fs-body)", fontWeight: 600,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Confirm assignment
          </button>
        </div>
      </div>
    </div>
  );
}

function radioRow(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "5px 8px",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    cursor: "pointer",
  };
}
function selectStyle(): React.CSSProperties {
  return {
    padding: "5px 8px",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    background: "var(--bg)", color: "var(--text)",
    fontSize: "var(--fs-body)", outline: "none",
  };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: "5px 8px",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    background: "var(--bg)", color: "var(--text)",
    fontSize: "var(--fs-body)", outline: "none",
  };
}

function FeatureTreeRow({
  feature, selectedId, onSelect,
}: {
  feature: Feature;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const isSelected = selectedId === feature.id;
  return (
    <button
      onClick={() => onSelect(feature.id)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 8px",
        borderRadius: "var(--radius)",
        background: isSelected ? "var(--accent-soft)" : "transparent",
        color: isSelected ? "var(--accent)" : "var(--text)",
        border: "none", cursor: "pointer",
        fontSize: "var(--fs-body)", fontWeight: isSelected ? 600 : 400,
        textAlign: "left", width: "100%",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      title={feature.title}
    >
      <span style={pillStyle(feature.status)}>{FEATURE_STATUS_LABEL[feature.status]}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {feature.title}
      </span>
    </button>
  );
}

function dashedBtn(): React.CSSProperties {
  return {
    padding: "3px 8px",
    border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
    background: "transparent",
    color: "var(--text-tertiary)",
    fontSize: 11, fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
  };
}

// ── FeatureDetailPane ────────────────────────────────────────────────────

function FeatureDetailPane({ featureId }: { featureId: string }) {
  const {
    features, productCapabilities, featureSlices,
    productAreas, featureGroups,
    weeklyGoals, wipItems,
    updateFeature, deleteFeature,
    createProductCapability, updateProductCapability, deleteProductCapability,
    createFeatureSlice,
    setRoute, openWip,
  } = useStore();

  const feature = features.find(f => f.id === featureId);
  // Always-on hooks — must run before any early return.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(feature?.title ?? "");
  const [descDraft, setDescDraft] = useState(feature?.description ?? "");
  const [showAssign, setShowAssign] = useState(false);
  React.useEffect(() => {
    setTitleDraft(feature?.title ?? "");
    setDescDraft(feature?.description ?? "");
    // Close the assign dialog when the user navigates away.
    setShowAssign(false);
  }, [featureId, feature?.title, feature?.description]);

  if (!feature) return null;
  const isUnassigned = !feature.areaId;

  const caps = productCapabilities.filter(c => c.featureId === feature.id);
  const slices = featureSlices.filter(s => s.featureId === feature.id);
  const area = productAreas.find(a => a.id === feature.areaId);
  const group = featureGroups.find(g => g.id === feature.featureGroupId);
  const linkedGoals = weeklyGoals.filter(g => g.linkedFeatureIds.includes(feature.id));
  const linkedIntents = wipItems.filter(w => w.type === "intent" && feature.linkedIntentIds.includes(w.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {area?.title ?? "Unassigned features"}
        {group && <> · {group.title}</>}
      </div>

      {/* Unassigned banner — shown when the feature has no area yet.
          Mirrors the rail's Assign button so the user can file the
          feature from either surface. Linked goals + intents stay
          attached during assignment. */}
      {isUnassigned && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius)",
          background: "var(--bg-sunken)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>
              This feature isn't filed yet.
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 2 }}>
              Assign it to a capability area and (optionally) a feature group. Linked goals and intents stay attached.
            </div>
          </div>
          <button
            onClick={() => setShowAssign(true)}
            style={{
              padding: "6px 12px",
              background: "var(--accent)", color: "white",
              border: "none", borderRadius: "var(--radius)",
              fontSize: "var(--fs-body)", fontWeight: 600, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Assign to hierarchy
          </button>
        </div>
      )}
      {showAssign && (
        <AssignFeatureDialog feature={feature} onClose={() => setShowAssign(false)} />
      )}

      {/* Title + status + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateFeature(feature.id, { title: titleDraft.trim() || feature.title }); setEditingTitle(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateFeature(feature.id, { title: titleDraft.trim() || feature.title }); setEditingTitle(false); }
              else if (e.key === "Escape") { setTitleDraft(feature.title); setEditingTitle(false); }
            }}
            style={{
              flex: 1, fontSize: 18, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "4px 8px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <h2
            onClick={() => { setTitleDraft(feature.title); setEditingTitle(true); }}
            style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text)", cursor: "text" }}
            title="Click to rename"
          >
            {feature.title}
          </h2>
        )}
        <FeatureStatusPicker status={feature.status} onChange={s => updateFeature(feature.id, { status: s })} />
        <button
          onClick={() => { if (window.confirm(`Delete feature "${feature.title}"?`)) deleteFeature(feature.id); }}
          aria-label="Delete feature"
          style={{
            padding: 4, background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
          }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Description */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
          Description
        </div>
        <textarea
          value={descDraft}
          onChange={e => setDescDraft(e.target.value)}
          onBlur={() => updateFeature(feature.id, { description: descDraft })}
          rows={2}
          placeholder="What this feature does, in one or two lines."
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "6px 9px",
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            background: "var(--bg)", color: "var(--text)",
            fontSize: "var(--fs-body)", lineHeight: 1.5,
            resize: "vertical", outline: "none",
          }}
          onFocus={e => (e.target.style.borderColor = "var(--accent)")}
          onBlurCapture={e => (e.target.style.borderColor = "var(--border)")}
        />
      </section>

      {/* Product capabilities — owned by the feature, NOT the slice. */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 }}>
          Product capabilities · {caps.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {caps.map(cap => (
            <CapabilityRow
              key={cap.id}
              cap={cap}
              onRename={(text) => updateProductCapability(cap.id, { title: text })}
              onDelete={() => deleteProductCapability(cap.id)}
            />
          ))}
          <AddCapabilityInput onAdd={(text) => createProductCapability({ title: text, featureId: feature.id })} />
        </div>
      </section>

      {/* Feature slices */}
      <section>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Feature slices · {slices.length}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => {
              const title = window.prompt("New slice title");
              if (title?.trim()) createFeatureSlice({ title, featureId: feature.id });
            }}
            style={dashedBtn()}
          >
            + Add slice
          </button>
        </div>
        {slices.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            No slices yet. A slice is a deliverable version of this feature — it picks which capabilities to include, defer, or exclude.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {slices.map(slice => (
              <SliceCard key={slice.id} slice={slice} capabilities={caps} />
            ))}
          </div>
        )}
      </section>

      {/* Linked goals + intents (read-only on Product View) */}
      {(linkedGoals.length > 0 || linkedIntents.length > 0) && (
        <section>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 }}>
            Linked
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {linkedGoals.map(g => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 8px",
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                background: "var(--bg)",
              }}>
                <span style={pillStyle(g.status)}>{GOAL_STATUS_LABEL[g.status]}</span>
                <span style={{ flex: 1, fontSize: "var(--fs-body)", color: "var(--text)" }}>
                  {g.title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{g.weekLabel}</span>
              </div>
            ))}
            {linkedIntents.map(w => (
              <button
                key={w.id}
                onClick={() => { setRoute("wip"); openWip(w.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 8px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--bg)", textAlign: "left", cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
              >
                <span style={pillStyle(intentColumnAsStatus(w))}>{intentColumnLabel(w)}</span>
                <span style={{ flex: 1, fontSize: "var(--fs-body)", color: "var(--text)" }}>
                  Intent: {w.title}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CapabilityRow({
  cap, onRename, onDelete,
}: {
  cap: ProductCapability;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cap.title);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 8px",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)",
    }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onRename(draft.trim() || cap.title); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") { onRename(draft.trim() || cap.title); setEditing(false); }
            else if (e.key === "Escape") { setDraft(cap.title); setEditing(false); }
          }}
          style={{
            flex: 1, fontSize: "var(--fs-body)", color: "var(--text)",
            border: "1px solid var(--accent)", borderRadius: "var(--radius)",
            padding: "2px 5px", background: "var(--bg)", outline: "none",
          }}
        />
      ) : (
        <button
          onClick={() => { setDraft(cap.title); setEditing(true); }}
          style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: "var(--fs-body)", color: "var(--text)", cursor: "text" }}
          title="Click to rename"
        >
          {cap.title}
        </button>
      )}
      <button
        onClick={() => { if (window.confirm(`Delete capability "${cap.title}"?`)) onDelete(); }}
        aria-label="Delete capability"
        style={{
          padding: 4, background: "transparent", border: "none", cursor: "pointer",
          color: "var(--text-tertiary)", borderRadius: "var(--radius-sm)",
        }}
      >
        <X size={10} />
      </button>
    </div>
  );
}

function AddCapabilityInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2 }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && text.trim()) { onAdd(text); setText(""); } }}
        placeholder="Add capability… (Enter to add)"
        style={{
          flex: 1, padding: "5px 9px",
          border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
          background: "transparent", color: "var(--text)",
          fontSize: "var(--fs-body)", outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-strong)")}
      />
    </div>
  );
}

// ── SliceCard with capability inclusion table ────────────────────────────

const SLICE_STATUS_LABEL: Record<SliceCapabilityStatus, string> = {
  must:   "Must · included",
  should: "Should · included",
  could:  "Could · deferred",
  wont:   "Won't · excluded",
};
function sliceStatusPill(s: SliceCapabilityStatus | null): React.CSSProperties {
  const palette =
    s === "must"   ? { bg: "rgba(220,38,38,0.08)",   fg: "#b91c1c", bd: "rgba(220,38,38,0.30)" } :
    s === "should" ? { bg: "rgba(245,158,11,0.10)",  fg: "#b45309", bd: "rgba(245,158,11,0.40)" } :
    s === "could"  ? { bg: "var(--accent-soft)",     fg: "var(--accent)", bd: "rgba(59,130,246,0.30)" } :
    s === "wont"   ? { bg: "var(--bg-sunken)",       fg: "var(--text-tertiary)", bd: "var(--border)" } :
                     { bg: "transparent",            fg: "var(--text-tertiary)", bd: "var(--border)" };
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "1px 7px", borderRadius: 100,
    background: palette.bg, color: palette.fg,
    border: `1px solid ${palette.bd}`,
    fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
  };
}

function SliceCard({
  slice, capabilities,
}: {
  slice: FeatureSlice;
  capabilities: ProductCapability[];
}) {
  const { updateFeatureSlice, deleteFeatureSlice, setSliceCapabilityStatus } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(slice.title);
  const [descDraft, setDescDraft] = useState(slice.description ?? "");

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)", padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateFeatureSlice(slice.id, { title: titleDraft.trim() || slice.title }); setEditingTitle(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateFeatureSlice(slice.id, { title: titleDraft.trim() || slice.title }); setEditingTitle(false); }
              else if (e.key === "Escape") { setTitleDraft(slice.title); setEditingTitle(false); }
            }}
            style={{
              flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "2px 5px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(slice.title); setEditingTitle(true); }}
            style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "text" }}
            title="Click to rename slice"
          >
            {slice.title}
          </button>
        )}
        <FeatureStatusPicker status={slice.status} onChange={s => updateFeatureSlice(slice.id, { status: s })} />
        <button
          onClick={() => { if (window.confirm(`Delete slice "${slice.title}"?`)) deleteFeatureSlice(slice.id); }}
          aria-label="Delete slice"
          style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
        >
          <X size={10} />
        </button>
      </div>

      <textarea
        value={descDraft}
        onChange={e => setDescDraft(e.target.value)}
        onBlur={() => updateFeatureSlice(slice.id, { description: descDraft })}
        rows={1}
        placeholder="Slice description…"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "4px 8px",
          border: "1px solid var(--border)", borderRadius: "var(--radius)",
          background: "var(--bg)", color: "var(--text)",
          fontSize: 12, lineHeight: 1.5, resize: "vertical", outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlurCapture={e => (e.target.style.borderColor = "var(--border)")}
      />

      {/* Inclusion table — one row per parent-feature capability. */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
          Includes
        </div>
        {capabilities.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
            Add capabilities to the parent feature first — then this slice can pick which to include, defer, or exclude.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {capabilities.map(cap => {
              const current: SliceCapabilityStatus | null = slice.capabilityStatus?.[cap.id] ?? null;
              return (
                <div key={cap.id} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 6px",
                  borderRadius: "var(--radius)",
                  background: current === null ? "transparent" : "var(--bg-sunken)",
                }}>
                  <span style={{
                    flex: 1, fontSize: 12, color: current === null ? "var(--text-tertiary)" : "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {cap.title}
                  </span>
                  <SliceCapabilityPicker
                    current={current}
                    onSet={(s) => setSliceCapabilityStatus(slice.id, cap.id, s)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SliceCapabilityPicker({
  current, onSet,
}: {
  current: SliceCapabilityStatus | null;
  onSet: (s: SliceCapabilityStatus | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const label = current === null ? "Not selected" : SLICE_STATUS_LABEL[current];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={sliceStatusPill(current)}>
        {label} <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 200, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {(["must", "should", "could", "wont"] as SliceCapabilityStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { onSet(s); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "5px 10px", textAlign: "left",
                background: s === current ? "var(--bg-sunken)" : "transparent",
                border: "none", cursor: "pointer",
                fontSize: "var(--fs-body)", color: "var(--text)",
              }}
              onMouseEnter={e => { if (s !== current) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (s !== current) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={sliceStatusPill(s)}>{SLICE_STATUS_LABEL[s]}</span>
            </button>
          ))}
          {current !== null && (
            <button
              onClick={() => { onSet(null); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "5px 10px", textAlign: "left",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 11, color: "var(--text-tertiary)",
                borderTop: "1px solid var(--border)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              ✕ Remove from slice
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Suppress unused-import warnings for icons we may want later.
void Task; void Intent; void userById;
