"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  WeeklyGoal, WeeklyGoalStatus, ProductArea, Feature, FeatureStatus, FeatureSlice,
  FeatureGroup, ProductCapability, SliceCapabilityStatus,
  Release, ReleaseStatus, MilestoneAuditEntry, MilestoneAuditKind, RoadmapTheme, RoadmapThemeColor,
  MoscowPriority, MilestoneObjectKind, MOSCOW_LABEL, MILESTONE_OBJECT_KIND_LABEL, milestoneLinkKey,
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

type RoadmapTab = "weekly" | "product" | "releases" | "themes";

// Feature flag: Themes are hidden in the UI for now. The data model,
// store actions, and component definitions all stay in the codebase
// (so re-enabling is a one-line flip), but the tab, pills, and pickers
// don't render while this is false.
const THEMES_ENABLED = false;

// Shape for one product-object link inside a milestone, used by both
// ReleaseCard's bucketing logic and the MoscowGroup row renderer.
type MilestoneRow = {
  kind: MilestoneObjectKind;
  objectId: string;
  title: string;
  parentTitle?: string;
  priority: MoscowPriority;
  note?: string;
  onOpen?: () => void;
  onUnlink: () => void;
  // Weekly goals that also link this product object. Surfaced inline
  // on the row so the user can see which goal motivates a Must-have.
  linkedGoals: WeeklyGoal[];
};

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
            {tab === "weekly" ? "Weekly goals"
              : tab === "product" ? "Product view"
              : tab === "releases" ? "Milestones"
              : "Themes"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {tab === "weekly"
              ? "· Connect each goal to the intents and features that support it"
              : tab === "product"
                ? "· Browse product capability areas, features, and slices"
                : tab === "releases"
                  ? "· Define what needs to be ready for a business target — e.g. July 1st Launch"
                  : "· Cross-cutting tags that overlay the roadmap without changing the hierarchy"}
          </span>
          <span style={{ flex: 1 }} />
          <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 100, padding: 2 }}>
            {((THEMES_ENABLED
              ? ["weekly", "product", "releases", "themes"]
              : ["weekly", "product", "releases"]) as RoadmapTab[]).map(t => (
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
                {t === "weekly" ? "Weekly goals"
                  : t === "product" ? "Product view"
                  : t === "releases" ? "Milestones"
                  : "Themes"}
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
        {tab === "weekly" && (
          <WeeklyGoalsView featureFilter={featureFilter} focusedGoalId={focusedGoalId} />
        )}
        {tab === "product" && (
          <ProductExplorerView
            selectedFeatureId={productSelectedFeatureId}
            onSelectFeature={setProductSelectedFeatureId}
          />
        )}
        {tab === "releases" && <ReleasesView />}
        {tab === "themes" && THEMES_ENABLED && <ThemesView />}
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

// Filter bundle for the Weekly Goals view. Held at the WeeklyGoalsView
// level (not in the store) because it's per-session state, not persisted.
// `featureFilter` shadows the Roadmap-header chip strip so the
// FeaturesSummaryStrip + the new filter bar share a single source of
// truth for the feature dimension.
type WeeklyFilterState = {
  query: string;
  featureId: string | null;
  sliceId: string | null;
  capabilityId: string | null;
  themeId: string | null;
  releaseId: string | null;
  goalStatus: "all" | WeeklyGoalStatus;
  intentStatus: "all" | "backlog" | "to_do" | "in_progress" | "done";
};

const EMPTY_WEEKLY_FILTERS: Omit<WeeklyFilterState, "featureId"> = {
  query: "",
  sliceId: null,
  capabilityId: null,
  themeId: null,
  releaseId: null,
  goalStatus: "all",
  intentStatus: "all",
};

function WeeklyGoalsView({ featureFilter, focusedGoalId }: { featureFilter: string | null; focusedGoalId: string | null }) {
  const {
    weeklyGoals, createWeeklyGoal,
    features, featureSlices, productCapabilities, themes, releases, wipItems,
  } = useStore();

  // Local filter state. The featureFilter prop drives the `featureId`
  // dimension so the header chip strip and the filter bar stay in
  // sync; clearing here doesn't reach back into RoadmapPage because the
  // strip's clear-on-X handler already covers that path.
  const [extraFilters, setExtraFilters] = useState<Omit<WeeklyFilterState, "featureId">>(EMPTY_WEEKLY_FILTERS);
  const filters: WeeklyFilterState = { ...extraFilters, featureId: featureFilter };

  // Resolve the picked theme/release once for the matcher.
  const activeTheme   = themes.find(t => t.id === filters.themeId) ?? null;
  const activeRelease = releases.find(r => r.id === filters.releaseId) ?? null;
  const normalizedQuery = filters.query.trim().toLowerCase();

  // ── Matchers ───────────────────────────────────────────────────────
  // A goal passes the filter set iff it matches ALL active dimensions.
  // Search query expands across goal title + notes + the titles of its
  // linked intents / features / slices / capabilities so the user can
  // find a goal by typing the name of something it references.
  const goalMatchesQuery = (g: WeeklyGoal): boolean => {
    if (normalizedQuery === "") return true;
    if (g.title.toLowerCase().includes(normalizedQuery)) return true;
    if (g.notes?.toLowerCase().includes(normalizedQuery)) return true;
    for (const fid of g.linkedFeatureIds) {
      const t = features.find(f => f.id === fid)?.title;
      if (t?.toLowerCase().includes(normalizedQuery)) return true;
    }
    for (const sid of g.linkedSliceIds) {
      const s = featureSlices.find(x => x.id === sid);
      if (s?.title.toLowerCase().includes(normalizedQuery)) return true;
      if (s?.description?.toLowerCase().includes(normalizedQuery)) return true;
    }
    for (const cid of g.linkedCapabilityIds) {
      const t = productCapabilities.find(c => c.id === cid)?.title;
      if (t?.toLowerCase().includes(normalizedQuery)) return true;
    }
    for (const iid of g.linkedIntentIds) {
      const w = wipItems.find(x => x.id === iid);
      if (w?.title.toLowerCase().includes(normalizedQuery)) return true;
    }
    return false;
  };
  const goalMatches = (g: WeeklyGoal): boolean => {
    if (!goalMatchesQuery(g)) return false;
    if (filters.featureId && !g.linkedFeatureIds.includes(filters.featureId)) return false;
    if (filters.sliceId && !g.linkedSliceIds.includes(filters.sliceId)) return false;
    if (filters.capabilityId && !g.linkedCapabilityIds.includes(filters.capabilityId)) return false;
    if (activeTheme && !activeTheme.linkedGoalIds.includes(g.id)) return false;
    if (activeRelease && !activeRelease.linkedGoalIds.includes(g.id)) return false;
    if (filters.goalStatus !== "all" && g.status !== filters.goalStatus) return false;
    if (filters.intentStatus !== "all") {
      // "any linked intent currently sits in <column>" — keeps the
      // matcher simple and useful (e.g. "show me goals with work in
      // progress").
      const any = g.linkedIntentIds.some(iid => {
        const w = wipItems.find(x => x.id === iid);
        return w?.column === filters.intentStatus;
      });
      if (!any) return false;
    }
    return true;
  };

  // Group goals by week, applying the filter set. We keep every week
  // column visible (even when empty after filtering) so the timeline
  // structure stays stable — matches the previous featureFilter UX.
  const groups = useMemo(() => {
    const filtered = weeklyGoals.filter(goalMatches);
    const byWeek = new Map<string, WeeklyGoal[]>();
    // Seed the map with every week that exists in the source so empty
    // columns still render when filtering hides their goals.
    for (const g of weeklyGoals) if (!byWeek.has(g.weekStart)) byWeek.set(g.weekStart, []);
    for (const g of filtered) {
      const arr = byWeek.get(g.weekStart) ?? [];
      arr.push(g);
      byWeek.set(g.weekStart, arr);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, items]) => ({ weekStart, items: items.slice().sort((x, y) => x.createdAt.localeCompare(y.createdAt)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyGoals, normalizedQuery, filters.featureId, filters.sliceId, filters.capabilityId,
       filters.themeId, filters.releaseId, filters.goalStatus, filters.intentStatus,
       features, featureSlices, productCapabilities, themes, releases, wipItems]);

  const anyFilterActive =
    normalizedQuery !== "" ||
    filters.featureId !== null ||
    filters.sliceId !== null ||
    filters.capabilityId !== null ||
    filters.themeId !== null ||
    filters.releaseId !== null ||
    filters.goalStatus !== "all" ||
    filters.intentStatus !== "all";

  const handleClearFilters = () => {
    setExtraFilters(EMPTY_WEEKLY_FILTERS);
    // featureFilter lives at RoadmapPage; the strip's "All" chip is the
    // user's path back to clearing that one (we keep them visually
    // linked but state-independent to avoid prop-drilling a setter).
  };

  const handleAddWeek = () => {
    const latest = groups[groups.length - 1]?.weekStart;
    const base = latest ? new Date(latest) : (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + diff);
      return d;
    })();
    const next = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    createWeeklyGoal({ title: "Untitled goal", weekStart: next.toISOString() });
  };

  const matchingCount = groups.reduce((n, g) => n + g.items.length, 0);
  const isEmptyAfterFilter = anyFilterActive && matchingCount === 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      minHeight: "100%",
    }}>
      {/* Filter bar */}
      <WeeklyGoalsFilterBar
        filters={filters}
        onChange={(patch) => setExtraFilters(prev => ({ ...prev, ...patch }))}
        onClear={handleClearFilters}
        anyActive={anyFilterActive}
        matchingCount={matchingCount}
        totalCount={weeklyGoals.length}
      />

      {/* Timeline */}
      <div style={{
        display: "flex", gap: 14, alignItems: "flex-start",
        padding: 16, flex: 1, minHeight: 0,
      }}>
        {isEmptyAfterFilter ? (
          <div style={{
            margin: "40px auto", maxWidth: 440, textAlign: "center",
            fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
          }}>
            No goals match the current filters. <button
              onClick={handleClearFilters}
              style={{ background: "transparent", border: "none", padding: 0, color: "var(--accent)", fontSize: "var(--fs-body)", cursor: "pointer", textDecoration: "underline" }}
            >Clear filters</button> to see everything again.
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
    </div>
  );
}

// ── WeeklyGoalsFilterBar ────────────────────────────────────────────────
// Compact filter strip above the weekly timeline. Always-visible so the
// active dimensions stay legible. Each dimension is a native <select>
// to keep the prototype lean (no bespoke popover per dimension), but
// active ones get an accent border + tint so the user can see what's
// narrowing the view at a glance.
//
// `featureId` is read-only from this bar's perspective — it's already
// controlled by the FeaturesSummaryStrip in the Roadmap header. We
// surface a small "Linked feature" select here too so users who never
// notice the chip strip can still narrow by feature; toggling it
// requires passing a setter down, which we avoid for now (the strip
// keeps a single source of truth). Until that's wired, the feature
// select reads but doesn't write — clear via the strip's All chip.
function WeeklyGoalsFilterBar({
  filters, onChange, onClear, anyActive, matchingCount, totalCount,
}: {
  filters: WeeklyFilterState;
  onChange: (patch: Partial<Omit<WeeklyFilterState, "featureId">>) => void;
  onClear: () => void;
  anyActive: boolean;
  matchingCount: number;
  totalCount: number;
}) {
  const { features, featureSlices, productCapabilities, themes, releases } = useStore();
  const selectStyle = (active: boolean): React.CSSProperties => ({
    minWidth: 0,
    padding: "4px 8px",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    color: active ? "var(--accent)" : "var(--text)",
    fontSize: 11, outline: "none", flex: "0 1 auto",
  });
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "10px 16px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <input
            value={filters.query}
            onChange={e => onChange({ query: e.target.value })}
            placeholder="Search goals, notes, linked work…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "5px 28px 5px 10px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", outline: "none",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
          {filters.query && (
            <button
              onClick={() => onChange({ query: "" })}
              title="Clear query"
              aria-label="Clear query"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0, border: "none", background: "transparent",
                color: "var(--text-tertiary)", cursor: "pointer",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {anyActive
            ? <>{matchingCount} of {totalCount} goal{totalCount === 1 ? "" : "s"}</>
            : <>{totalCount} goal{totalCount === 1 ? "" : "s"}</>}
        </span>
        {anyActive && (
          <button
            onClick={onClear}
            style={{
              padding: "3px 10px", borderRadius: 100,
              border: "1px dashed var(--border-strong)",
              background: "transparent", color: "var(--text-secondary)",
              fontSize: 10.5, fontWeight: 500, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Dimension dropdowns. `featureId` is shown read-only because the
          chip strip in the Roadmap header owns its setter; the other
          dimensions toggle via this bar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {filters.featureId && (
          <span
            title="Feature filter — clear via the chip strip above"
            style={{
              ...selectStyle(true),
              display: "inline-flex", alignItems: "center", gap: 4,
              cursor: "default",
            }}
          >
            Feature: {features.find(f => f.id === filters.featureId)?.title ?? "—"}
          </span>
        )}
        <select
          value={filters.sliceId ?? ""}
          onChange={e => onChange({ sliceId: e.target.value || null })}
          style={selectStyle(filters.sliceId !== null)}
          aria-label="Filter by linked feature slice"
        >
          <option value="">All slices</option>
          {featureSlices.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <select
          value={filters.capabilityId ?? ""}
          onChange={e => onChange({ capabilityId: e.target.value || null })}
          style={selectStyle(filters.capabilityId !== null)}
          aria-label="Filter by linked product capability"
        >
          <option value="">All capabilities</option>
          {productCapabilities.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        {THEMES_ENABLED && (
        <select
          value={filters.themeId ?? ""}
          onChange={e => onChange({ themeId: e.target.value || null })}
          style={selectStyle(filters.themeId !== null)}
          aria-label="Filter by theme"
        >
          <option value="">All themes</option>
          {themes.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        )}
        <select
          value={filters.releaseId ?? ""}
          onChange={e => onChange({ releaseId: e.target.value || null })}
          style={selectStyle(filters.releaseId !== null)}
          aria-label="Filter by milestone"
        >
          <option value="">All milestones</option>
          {releases.map(r => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
        <select
          value={filters.goalStatus}
          onChange={e => onChange({ goalStatus: e.target.value as WeeklyFilterState["goalStatus"] })}
          style={selectStyle(filters.goalStatus !== "all")}
          aria-label="Filter by goal status"
        >
          <option value="all">Any goal status</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select
          value={filters.intentStatus}
          onChange={e => onChange({ intentStatus: e.target.value as WeeklyFilterState["intentStatus"] })}
          style={selectStyle(filters.intentStatus !== "all")}
          aria-label="Filter by linked intent status"
        >
          <option value="all">Any intent status</option>
          <option value="backlog">Has intent in Backlog</option>
          <option value="to_do">Has intent in To do</option>
          <option value="in_progress">Has intent in In Progress</option>
          <option value="done">Has intent in Done</option>
        </select>
      </div>
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
    releases, themes, toggleThemeGoal,
    toggleGoalIntent, toggleGoalSlice, toggleGoalCapability, setRoute, openWip, setRoadmapFocus,
    createFeatureSlice, createProductCapability, createDraftIntentFromGoal,
  } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(goal.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(goal.notes ?? "");
  // Collapsed vs expanded card. Collapsed (default) is the
  // content-first summary — title, status, milestone, product + intent
  // summary, optional notes excerpt. Expanding reveals the deeper
  // structure (feature editor, slice / capability / intent pickers,
  // notes editor). The card itself doesn't change shape; expansion
  // just unfolds details inline beneath the summary.
  const [expanded, setExpanded] = useState(false);

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

  // Cross-reference: every release that packages this goal. Display-
  // only (the linking action lives on the Release card itself).
  const releaseIdsForGoal = releases
    .filter(r => r.linkedGoalIds.includes(goal.id))
    .map(r => r.id);
  // Theme attachments — themes are overlays, so we both display the
  // attached themes AND let the user toggle them from the goal card
  // (themes are quick tags, designed to be easy to add anywhere).
  const themeIdsForGoal = themes
    .filter(t => t.linkedGoalIds.includes(goal.id))
    .map(t => t.id);

  // ── Derived data for the compact summary ──────────────────────────
  // The card leads with the most-relevant link of each kind so the
  // user can scan "what is this goal about" without reading three
  // labelled sections. Falls back through Feature → Slice → Capability
  // for product context (whichever is linked first).
  const linkedFeaturesForGoal = features.filter(f => goal.linkedFeatureIds.includes(f.id));
  const primaryProduct: { label: string; onOpen: () => void } | null =
    linkedFeaturesForGoal[0]
      ? {
          label: linkedFeaturesForGoal[0].title,
          onOpen: () => setRoadmapFocus({ tab: "product", featureId: linkedFeaturesForGoal[0].id }),
        }
      : linkedSlices[0]
        ? {
            label: linkedSlices[0].title,
            onOpen: () => setRoadmapFocus({ tab: "product", featureId: linkedSlices[0].featureId, sliceId: linkedSlices[0].id }),
          }
        : linkedCapabilities[0]
          ? {
              label: linkedCapabilities[0].title,
              onOpen: () => setRoadmapFocus({ tab: "product", featureId: linkedCapabilities[0].featureId }),
            }
          : null;
  const milestoneTitles = releases
    .filter(r => releaseIdsForGoal.includes(r.id))
    .map(r => r.title);
  const hasAnyMeta = !!primaryProduct || milestoneTitles.length > 0;
  const stripeColor =
    goal.status === "done" ? "var(--status-accepted)" :
    goal.status === "in_progress" ? "#f59e0b" :
    "var(--accent)";

  return (
    <div
      data-goal-id={goal.id}
      style={{
        padding: "14px 16px",
        background: "var(--bg)",
        borderTop:    focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRight:  focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderBottom: focused ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: `3px solid ${stripeColor}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: focused ? "0 0 0 3px rgba(56, 132, 255, 0.18)" : undefined,
        display: "flex", flexDirection: "column", gap: 8,
        transition: "box-shadow 0.25s ease, border-color 0.25s ease",
      }}>
      {/* HEADER — title + status only. No chevron, no delete X here so
          the card reads as content (not as a row of controls). The
          colored left stripe already encodes status visually; the
          status pill on the right confirms it in words. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
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
              padding: "4px 6px", fontSize: 14, fontWeight: 600,
              color: "var(--text)", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(goal.title); setEditingTitle(true); }}
            style={{
              flex: 1, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: 14, fontWeight: 600,
              color: "var(--text)", cursor: "text", lineHeight: 1.35,
            }}
            title="Click to rename"
          >
            {goal.title}
          </button>
        )}
        <GoalStatusPicker
          status={goal.status}
          onChange={(s) => updateWeeklyGoal(goal.id, { status: s })}
        />
      </div>

      {/* DESCRIPTION — plain secondary paragraph when notes are
          present. Only shown collapsed (the expanded panel renders the
          editor instead). No box, no label — let the text speak. */}
      {!expanded && goal.notes && (
        <p
          style={{
            margin: 0,
            fontSize: 12.5, color: "var(--text-secondary)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 2 as unknown as number,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {goal.notes}
        </p>
      )}

      {/* META LINE — single compact line of context. Each piece is
          optional; missing ones are simply omitted so the card never
          shows empty labels. Uses soft dot separators between pieces;
          falls back to a quiet "Add details" CTA when nothing is
          linked. Hidden when the card is expanded — the expanded
          panel provides richer affordances for the same data. */}
      {!expanded && (
        hasAnyMeta ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5,
          }}>
            {primaryProduct && (
              <button
                onClick={primaryProduct.onOpen}
                title="Open in Product view"
                style={{
                  background: "transparent", border: "none", padding: 0,
                  color: "var(--text-secondary)", fontSize: 11.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: 220,
                }}
              >
                {primaryProduct.label}
              </button>
            )}
            {primaryProduct && milestoneTitles.length > 0 && <span>·</span>}
            {milestoneTitles.length > 0 && (
              <button
                onClick={() => setRoadmapFocus({ tab: "releases" })}
                title={milestoneTitles.length === 1
                  ? `Open milestone · ${milestoneTitles[0]}`
                  : `Open milestones · ${milestoneTitles.join(", ")}`}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  color: "var(--text-secondary)", fontSize: 11.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: 200,
                }}
              >
                {milestoneTitles[0]}
                {milestoneTitles.length > 1 && (
                  <span style={{ color: "var(--text-tertiary)" }}> +{milestoneTitles.length - 1}</span>
                )}
              </button>
            )}
          </div>
        ) : !goal.notes && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              alignSelf: "flex-start",
              background: "transparent", border: "none", padding: 0,
              fontSize: 11.5, color: "var(--text-tertiary)",
              cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-tertiary)")}
            title="Open details to add a description, milestone, or links"
          >
            Add description, milestone, or links
          </button>
        )
      )}

      {/* FOOTER — small right-aligned Details toggle. Sits at the
          bottom of the collapsed card so the eye reads
          content-first, controls-second. */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          title={expanded ? "Hide details" : "Show details"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 6px", borderRadius: "var(--radius-sm)",
            background: "transparent", border: "none",
            color: "var(--text-tertiary)",
            fontSize: 11, fontWeight: 500, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Details
        </button>
      </div>

      {expanded && (
        <div style={{
          // Thin top separator so the expanded section reads as a
          // continuation of the card, not a separate boxed panel.
          marginTop: 2,
          paddingTop: 12,
          borderTop: "1px dashed var(--border)",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {/* Notes editor at the TOP — sits right under the title so
              the description is the first thing the user sees and
              edits when they open details. */}
          <div>
            {editingNotes ? (
              <textarea
                autoFocus
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={() => { updateWeeklyGoal(goal.id, { notes: notesDraft }); setEditingNotes(false); }}
                rows={2}
                placeholder="Describe the goal (optional)…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "6px 8px", border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)", background: "var(--bg)",
                  color: "var(--text)", fontSize: 12.5, lineHeight: 1.5, outline: "none",
                }}
              />
            ) : goal.notes ? (
              <button
                onClick={() => { setNotesDraft(goal.notes ?? ""); setEditingNotes(true); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "6px 8px", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", background: "var(--bg)",
                  color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.5,
                  cursor: "text",
                }}
                title="Click to edit description"
              >
                {goal.notes}
              </button>
            ) : (
              <button
                onClick={() => { setNotesDraft(""); setEditingNotes(true); }}
                style={{
                  alignSelf: "flex-start",
                  padding: "3px 6px", fontSize: 11, color: "var(--text-tertiary)",
                  background: "transparent", border: "1px dashed var(--border)",
                  borderRadius: "var(--radius)", cursor: "pointer",
                }}
              >
                + Add description
              </button>
            )}
          </div>

          {/* Milestone — single inline row, no uppercase label. */}
          {releaseIdsForGoal.length > 0 && (
            <ReleaseRefList releaseIds={releaseIdsForGoal} label="Milestone" />
          )}

          {/* Feature — typed input, persists across goals. */}
          <FeatureInlineEditor goal={goal} />

          {/* Feature slices — supports typing to create a new draft
              slice (needsMapping=true, no parent feature required). */}
          <LinkedSection
            title="Slices"
            items={linkedSlices.map(s => {
              const parent = features.find(f => f.id === s.featureId);
              return {
                id: s.id, label: s.title,
                right: s.needsMapping ? (
                  <span style={needsMappingPill()}>Needs mapping</span>
                ) : parent ? (
                  <span style={subtleParentPill()}>{parent.title}</span>
                ) : undefined,
                onOpen: () => s.featureId
                  ? setRoadmapFocus({ tab: "product", featureId: s.featureId, sliceId: s.id })
                  : setRoadmapFocus({ tab: "product" }),
                onRemove: () => toggleGoalSlice(goal.id, s.id),
              };
            })}
            addPicker={
              <SlicePicker
                value={goal.linkedSliceIds}
                onToggle={(id) => toggleGoalSlice(goal.id, id)}
                onCreateDraft={(text) => {
                  const id = createFeatureSlice({ title: text, featureId: "", needsMapping: true });
                  toggleGoalSlice(goal.id, id);
                }}
              />
            }
          />

          {/* Product capabilities — same typed-create flow as slices. */}
          <LinkedSection
            title="Capabilities"
            items={linkedCapabilities.map(c => {
              const parent = features.find(f => f.id === c.featureId);
              return {
                id: c.id, label: c.title,
                right: c.needsMapping ? (
                  <span style={needsMappingPill()}>Needs mapping</span>
                ) : parent ? (
                  <span style={subtleParentPill()}>{parent.title}</span>
                ) : undefined,
                onOpen: () => c.featureId
                  ? setRoadmapFocus({ tab: "product", featureId: c.featureId })
                  : setRoadmapFocus({ tab: "product" }),
                onRemove: () => toggleGoalCapability(goal.id, c.id),
              };
            })}
            addPicker={
              <CapabilityPicker
                value={goal.linkedCapabilityIds}
                onToggle={(id) => toggleGoalCapability(goal.id, id)}
                onCreateDraft={(text) => {
                  const id = createProductCapability({ title: text, featureId: "", needsMapping: true });
                  toggleGoalCapability(goal.id, id);
                }}
              />
            }
          />

          {/* Intents — supports typing to create a draft intent that
              lands in WIP backlog with isDraft=true. All intents
              listed in one go; drafts get a purple Draft pill so the
              user can tell at a glance. */}
          <LinkedSection
            title="Intents"
            items={linkedIntents.map(w => ({
              id: w.id, label: w.title,
              right: w.isDraft
                ? <span style={draftStatusPill()}>Draft</span>
                : <span style={pillStyle(intentColumnAsStatus(w))}>{intentColumnLabel(w)}</span>,
              onOpen: () => { setRoute("wip"); openWip(w.id); },
              onRemove: () => toggleGoalIntent(goal.id, w.id),
            }))}
            addPicker={
              <IntentPicker
                value={goal.linkedIntentIds}
                onToggle={(id) => toggleGoalIntent(goal.id, id)}
                onCreateDraft={(text) => {
                  createDraftIntentFromGoal({ title: text, goalId: goal.id });
                }}
              />
            }
          />

          {/* Theme tags — overlay row. Hidden while THEMES_ENABLED is false. */}
          {THEMES_ENABLED && (
            <ThemeRefList
              themeIds={themeIdsForGoal}
              onPick={(themeId) => toggleThemeGoal(themeId, goal.id)}
              pickerSelected={themeIdsForGoal}
            />
          )}

          {/* Destructive action — deliberate text button at the bottom
              of the expanded panel, NOT a tiny X in the header. Lives
              alongside management so a client-viewer never sees it on
              the collapsed card. */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => { if (window.confirm("Delete this goal?")) deleteWeeklyGoal(goal.id); }}
              style={{
                padding: "3px 8px", borderRadius: "var(--radius-sm)",
                background: "transparent", border: "none",
                color: "var(--text-tertiary)",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--danger, #b91c1c)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              Delete goal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GoalReviewSummary ───────────────────────────────────────────────────
// Compact, content-first body shown on a goal card while it's in Review
// mode. Replaces the heavy "Linked Product Targets" / "Linked intents"
// section blocks with one or two-line summaries so the title + status
// stay the visual anchor. Click-throughs still work (feature → product
// view; intent → wip modal) so review isn't a dead end.
function GoalReviewSummary({
  goal, linkedFeatures, linkedSlices, linkedCapabilities, linkedIntents,
  doneIntents, onOpenIntent, onOpenFeature, onOpenConfigure,
}: {
  goal: WeeklyGoal;
  linkedFeatures: Feature[];
  linkedSlices: FeatureSlice[];
  linkedCapabilities: ProductCapability[];
  linkedIntents: Wip[];
  doneIntents: number;
  onOpenIntent: (id: string) => void;
  onOpenFeature: (id: string) => void;
  onOpenConfigure: () => void;
}) {
  const totalLinked = linkedIntents.length;
  const primaryFeature = linkedFeatures[0] ?? null;
  const hasProductScope =
    linkedFeatures.length > 0 ||
    linkedSlices.length > 0 ||
    linkedCapabilities.length > 0;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "6px 0 0",
    }}>
      {/* Product row — leads with the primary feature name (clickable);
          extra counts are summarised inline so the user doesn't have to
          scan three labelled sections. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        fontSize: 11.5, lineHeight: 1.5,
      }}>
        <span style={reviewLabelStyle()}>Product</span>
        {hasProductScope ? (
          <>
            {primaryFeature ? (
              <button
                onClick={() => onOpenFeature(primaryFeature.id)}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 500, color: "var(--text)",
                  cursor: "pointer", textAlign: "left",
                }}
                title="Open in Product view"
              >
                {primaryFeature.title}
              </button>
            ) : linkedSlices.length > 0 ? (
              <button
                onClick={() => onOpenFeature(linkedSlices[0].featureId)}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 500, color: "var(--text)",
                  cursor: "pointer", textAlign: "left",
                }}
                title="Open the parent feature in Product view"
              >
                {linkedSlices[0].title}
              </button>
            ) : linkedCapabilities.length > 0 ? (
              <button
                onClick={() => onOpenFeature(linkedCapabilities[0].featureId)}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 500, color: "var(--text)",
                  cursor: "pointer", textAlign: "left",
                }}
                title="Open the parent feature in Product view"
              >
                {linkedCapabilities[0].title}
              </button>
            ) : null}
            <span style={reviewSecondaryStyle()}>
              · {linkedFeatures.length} feature{linkedFeatures.length === 1 ? "" : "s"}
              {" · "}
              {linkedSlices.length} slice{linkedSlices.length === 1 ? "" : "s"}
              {" · "}
              {linkedCapabilities.length} capabilit{linkedCapabilities.length === 1 ? "y" : "ies"}
            </span>
          </>
        ) : (
          <span style={reviewSecondaryStyle()}>
            No product targets yet ·{" "}
            <button
              onClick={onOpenConfigure}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", fontSize: 11.5, cursor: "pointer",
                textDecoration: "underline",
              }}
            >link some</button>
          </span>
        )}
      </div>

      {/* Intents row — "3 linked · 1 done". First intent is clickable
          so the user can jump straight into the most-relevant work. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        fontSize: 11.5, lineHeight: 1.5,
      }}>
        <span style={reviewLabelStyle()}>Intents</span>
        {totalLinked > 0 ? (
          <>
            <span style={{ fontWeight: 500, color: "var(--text)" }}>
              {totalLinked} linked
            </span>
            <span style={reviewSecondaryStyle()}>· {doneIntents} done</span>
            {linkedIntents[0] && (
              <>
                <span style={reviewSecondaryStyle()}>·</span>
                <button
                  onClick={() => onOpenIntent(linkedIntents[0].id)}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    fontSize: 11.5, color: "var(--text-secondary)",
                    cursor: "pointer", textAlign: "left",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: 220,
                  }}
                  title={linkedIntents[0].title}
                >
                  {linkedIntents[0].title}
                </button>
                {linkedIntents.length > 1 && (
                  <span style={reviewSecondaryStyle()}>+{linkedIntents.length - 1} more</span>
                )}
              </>
            )}
          </>
        ) : (
          <span style={reviewSecondaryStyle()}>None linked yet</span>
        )}
      </div>

      {/* Notes — only renders when present; click "Configure" to edit. */}
      {goal.notes && (
        <div style={{
          fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55,
          padding: "4px 6px",
          background: "var(--bg-sunken)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 3 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}>
          {goal.notes}
        </div>
      )}
    </div>
  );
}

// Small pill used on slice/capability rows captured from Weekly Goals
// before a parent feature was assigned. Surfaces in the goal LinkedSection
// rows AND in Product View's "Needs mapping" section.
function needsMappingPill(): React.CSSProperties {
  return {
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
    color: "#b45309",
    background: "rgba(245,158,11,0.10)",
    border: "1px solid rgba(245,158,11,0.40)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap", textTransform: "uppercase",
  };
}
// Purple pill matching the WIP rail's DRAFT badge so a draft intent
// reads consistently anywhere it surfaces.
function draftStatusPill(): React.CSSProperties {
  return {
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
    color: "#7e22ce",
    background: "rgba(168,85,247,0.10)",
    border: "1px solid rgba(168,85,247,0.40)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap", textTransform: "uppercase",
  };
}

function reviewLabelStyle(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
    textTransform: "uppercase", color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
  };
}
function reviewSecondaryStyle(): React.CSSProperties {
  return {
    fontSize: 11, color: "var(--text-tertiary)",
  };
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
  items: {
    id: string;
    label: string;
    right?: React.ReactNode;
    onOpen?: () => void;
    // Inline unlink — when provided, each row renders an X on the
    // right that directly removes the link. Removes the round-trip
    // through the picker just to toggle one item off.
    onRemove?: () => void;
  }[];
  addPicker: React.ReactNode;
  emptyHint?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
          {title}
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>· {items.length}</span>
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
              {it.onRemove && (
                <button
                  onClick={it.onRemove}
                  aria-label={`Unlink ${it.label}`}
                  title="Unlink"
                  style={{
                    padding: 2, color: "var(--text-tertiary)",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pickers — small multi-select popovers ────────────────────────────────

function PickerPopover({
  options, value, onToggle, label, onCreate, createLabel,
}: {
  options: { id: string; label: string; subtitle?: string }[];
  value: string[];
  onToggle: (id: string) => void;
  label: string;
  // When provided, the popover shows a search input + a "Create new
  // draft" affordance once the typed query doesn't match anything.
  // The created item should be persisted by the caller.
  onCreate?: (text: string) => void;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const normalized = query.trim().toLowerCase();
  const filteredOptions = normalized === ""
    ? options
    : options.filter(o =>
        o.label.toLowerCase().includes(normalized) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(normalized)));
  const exactMatch = options.find(o => o.label.toLowerCase() === normalized);
  const canCreate = !!onCreate && normalized.length > 0 && !exactMatch;
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
        <Plus size={10} /> {onCreate ? "Link or create" : "Link"}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 320, maxHeight: 320, display: "flex", flexDirection: "column",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            {label}
          </div>
          {onCreate && (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && canCreate) {
                  onCreate(query.trim());
                  setQuery("");
                  setOpen(false);
                }
              }}
              placeholder="Type to search or create a new draft…"
              style={{
                margin: "6px 8px",
                padding: "5px 8px",
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: 12, outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border)")}
            />
          )}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredOptions.length === 0 && !canCreate ? (
              <div style={{ padding: 12, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textAlign: "center" }}>
                {options.length === 0 ? "Nothing available to link." : "No matches."}
              </div>
            ) : filteredOptions.map(opt => {
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
            {canCreate && (
              <button
                onClick={() => {
                  onCreate!(query.trim());
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "8px 10px", textAlign: "left",
                  background: "rgba(168,85,247,0.04)", border: "none",
                  borderTop: filteredOptions.length > 0 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(168,85,247,0.09)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(168,85,247,0.04)")}
              >
                <Plus size={11} style={{ color: "#7e22ce", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--fs-body)", color: "var(--text)", fontWeight: 500 }}>
                    {createLabel ?? "Create new draft"}: <span style={{ color: "#7e22ce" }}>&ldquo;{query.trim()}&rdquo;</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    Marked as needs-mapping — set its hierarchy later from Product View.
                  </div>
                </div>
              </button>
            )}
          </div>
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
function SlicePicker({ value, onToggle, onCreateDraft }: { value: string[]; onToggle: (id: string) => void; onCreateDraft?: (text: string) => void }) {
  const { featureSlices, features } = useStore();
  const options = featureSlices.map(s => ({
    id: s.id, label: s.title,
    subtitle: s.needsMapping
      ? "Needs mapping · undefined feature"
      : features.find(f => f.id === s.featureId)?.title,
  }));
  return (
    <PickerPopover
      label="Link or create feature slice"
      options={options}
      value={value}
      onToggle={onToggle}
      onCreate={onCreateDraft}
      createLabel="Create new draft slice"
    />
  );
}
function IntentPicker({ value, onToggle, onCreateDraft }: { value: string[]; onToggle: (id: string) => void; onCreateDraft?: (text: string) => void }) {
  const { wipItems } = useStore();
  const options = wipItems
    .filter(w => w.type === "intent")
    .map(w => ({
      id: w.id, label: w.title,
      subtitle: w.isDraft ? "Draft" : intentColumnLabel(w),
    }));
  return (
    <PickerPopover
      label="Link or create intent"
      options={options}
      value={value}
      onToggle={onToggle}
      onCreate={onCreateDraft}
      createLabel="Create new draft intent"
    />
  );
}
function CapabilityPicker({ value, onToggle, onCreateDraft }: { value: string[]; onToggle: (id: string) => void; onCreateDraft?: (text: string) => void }) {
  const { productCapabilities, features } = useStore();
  const options = productCapabilities.map(c => ({
    id: c.id, label: c.title,
    subtitle: c.needsMapping
      ? "Needs mapping · undefined feature"
      : features.find(f => f.id === c.featureId)?.title,
  }));
  return (
    <PickerPopover
      label="Link or create capability"
      options={options}
      value={value}
      onToggle={onToggle}
      onCreate={onCreateDraft}
      createLabel="Create new draft capability"
    />
  );
}
// Picker over the entire weekly-goals timeline. Subtitle shows the week
// label + status so the user picks the right goal without leaving the
// release card.
function GoalPicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { weeklyGoals } = useStore();
  const options = weeklyGoals.map(g => ({
    id: g.id, label: g.title,
    subtitle: `${g.weekLabel} · ${g.status === "in_progress" ? "In progress" : g.status === "done" ? "Done" : "Planned"}`,
  }));
  return <PickerPopover label="Link weekly goal" options={options} value={value} onToggle={onToggle} />;
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

// Type filter — narrows the search results pane to one object kind.
// "all" includes everything; "unassigned" is a feature-only sub-filter
// that pulls just the features with no areaId.
type ProductSearchKind = "all" | "feature" | "slice" | "capability" | "unassigned";

type ProductSearchHit =
  | { kind: "area";       id: string; title: string; subtitle?: string }
  | { kind: "group";      id: string; title: string; subtitle?: string; featureCount: number; areaId: string }
  | { kind: "feature";    id: string; title: string; subtitle?: string; status: FeatureStatus; unassigned: boolean }
  | { kind: "slice";      id: string; title: string; subtitle?: string; status: FeatureStatus; featureId: string }
  | { kind: "capability"; id: string; title: string; subtitle?: string; featureId: string };

function ProductExplorerView({
  selectedFeatureId, onSelectFeature,
}: {
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
}) {
  const {
    features, featureSlices, productCapabilities, productAreas, featureGroups,
    themes, releases,
  } = useStore();

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

  // ── Search + filter state ──────────────────────────────────────────
  // Lives at the ProductExplorerView level so the tree (when visible)
  // and the results list share the same query / filter values. Default
  // is "no filters" → tree is rendered as today; once any filter is
  // active OR the query has content we switch to the flat result list.
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductSearchKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FeatureStatus>("all");
  const [themeFilter, setThemeFilter] = useState<string>("all");      // theme id or "all"
  const [releaseFilter, setReleaseFilter] = useState<string>("all");  // release id or "all"
  const [areaFilter, setAreaFilter] = useState<string>("all");        // area id or "all"

  const normalizedQuery = query.trim().toLowerCase();
  const queryActive   = normalizedQuery.length > 0;
  const filtersActive =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    themeFilter !== "all" ||
    releaseFilter !== "all" ||
    areaFilter !== "all";
  const searchActive  = queryActive || filtersActive;

  // Resolve the theme/release once so the matcher closures don't pay
  // the lookup cost per item.
  const activeTheme   = themes.find(t => t.id === themeFilter) ?? null;
  const activeRelease = releases.find(r => r.id === releaseFilter) ?? null;

  // Match helpers — case-insensitive substring match across title +
  // optional description. The empty query matches everything.
  const matchesQuery = (title: string, desc?: string) => {
    if (!queryActive) return true;
    const t = title.toLowerCase();
    if (t.includes(normalizedQuery)) return true;
    if (desc && desc.toLowerCase().includes(normalizedQuery)) return true;
    return false;
  };
  const matchesStatus = (status: FeatureStatus | undefined): boolean => {
    if (statusFilter === "all") return true;
    return status === statusFilter;
  };
  // Theme/release narrow Features / Slices / Capabilities. Areas and
  // Groups have no direct theme/release edge, so they are excluded
  // whenever those filters are active.
  const matchesTheme = (kind: ProductSearchHit["kind"], id: string): boolean => {
    if (!activeTheme) return true;
    if (kind === "feature")    return activeTheme.linkedFeatureIds.includes(id);
    if (kind === "slice")      return activeTheme.linkedSliceIds.includes(id);
    if (kind === "capability") return activeTheme.linkedCapabilityIds.includes(id);
    return false;
  };
  const matchesRelease = (kind: ProductSearchHit["kind"], id: string): boolean => {
    if (!activeRelease) return true;
    if (kind === "feature")    return activeRelease.linkedFeatureIds.includes(id);
    if (kind === "slice")      return activeRelease.linkedSliceIds.includes(id);
    if (kind === "capability") return activeRelease.linkedCapabilityIds.includes(id);
    return false;
  };
  // Area filter — narrows by capability area. For Features the check is
  // direct; for Slices and Capabilities we hop through the parent
  // feature. Areas and Feature Sets fall through trivially (they ARE
  // the structure, not children of it).
  const matchesArea = (kind: ProductSearchHit["kind"], id: string): boolean => {
    if (areaFilter === "all") return true;
    if (kind === "area")    return id === areaFilter;
    if (kind === "group")   return featureGroups.find(g => g.id === id)?.areaId === areaFilter;
    if (kind === "feature") return features.find(f => f.id === id)?.areaId === areaFilter;
    if (kind === "slice") {
      const s = featureSlices.find(x => x.id === id);
      return s ? features.find(f => f.id === s.featureId)?.areaId === areaFilter : false;
    }
    if (kind === "capability") {
      const c = productCapabilities.find(x => x.id === id);
      return c ? features.find(f => f.id === c.featureId)?.areaId === areaFilter : false;
    }
    return false;
  };

  // ── Build the flat result list when search is active. ──────────────
  // We always compute every hit so the count chips on the type pills
  // ("Features · 4") reflect the unfiltered-by-type view.
  const results: ProductSearchHit[] = useMemo(() => {
    if (!searchActive) return [];
    const all: ProductSearchHit[] = [];

    // Areas + Groups — title/description match only; suppressed when a
    // type filter / status / theme / release is active.
    const includeContainers =
      (typeFilter === "all") &&
      statusFilter === "all" && themeFilter === "all" && releaseFilter === "all";
    if (includeContainers) {
      productAreas.forEach(a => {
        if (matchesQuery(a.title, a.description)) {
          all.push({ kind: "area", id: a.id, title: a.title, subtitle: a.description });
        }
      });
      featureGroups.forEach(g => {
        if (matchesQuery(g.title)) {
          const area = productAreas.find(a => a.id === g.areaId);
          all.push({
            kind: "group", id: g.id, title: g.title,
            subtitle: area?.title,
            featureCount: features.filter(f => f.featureGroupId === g.id).length,
            areaId: g.areaId,
          });
        }
      });
    }

    // Features — every type filter except slice/capability passes.
    if (typeFilter === "all" || typeFilter === "feature" || typeFilter === "unassigned") {
      features.forEach(f => {
        if (typeFilter === "unassigned" && f.areaId) return;
        if (!matchesQuery(f.title, f.description)) return;
        if (!matchesStatus(f.status)) return;
        if (!matchesTheme("feature", f.id)) return;
        if (!matchesRelease("feature", f.id)) return;
        if (!matchesArea("feature", f.id)) return;
        const area = productAreas.find(a => a.id === f.areaId);
        const group = featureGroups.find(g => g.id === f.featureGroupId);
        // Path breadcrumb for features: "Area / Set" (Set is optional).
        const subtitleParts = [
          area?.title ?? (f.areaId ? "" : "Needs mapping · undefined capability area"),
          group?.title,
        ].filter(Boolean);
        all.push({
          kind: "feature", id: f.id, title: f.title,
          subtitle: subtitleParts.join(" / ") || undefined,
          status: f.status,
          unassigned: !f.areaId,
        });
      });
    }

    // Slices.
    if (typeFilter === "all" || typeFilter === "slice") {
      featureSlices.forEach(s => {
        if (!matchesQuery(s.title, s.description)) return;
        if (!matchesStatus(s.status)) return;
        if (!matchesTheme("slice", s.id)) return;
        if (!matchesRelease("slice", s.id)) return;
        if (!matchesArea("slice", s.id)) return;
        const parent = features.find(f => f.id === s.featureId);
        // Full path subtitle: "Area / Set / Feature" so search results
        // surface where the slice actually lives. Missing levels are
        // dropped so the breadcrumb stays clean for unassigned features.
        const parentArea  = parent && productAreas.find(a => a.id === parent.areaId);
        const parentGroup = parent && featureGroups.find(g => g.id === parent.featureGroupId);
        const pathParts = [parentArea?.title, parentGroup?.title, parent?.title].filter(Boolean);
        all.push({
          kind: "slice", id: s.id, title: s.title,
          subtitle: pathParts.length > 0 ? pathParts.join(" / ") : parent?.title,
          status: s.status, featureId: s.featureId,
        });
      });
    }

    // Capabilities — no status field, so status filter excludes them.
    if ((typeFilter === "all" || typeFilter === "capability") && statusFilter === "all") {
      productCapabilities.forEach(c => {
        if (!matchesQuery(c.title)) return;
        if (!matchesTheme("capability", c.id)) return;
        if (!matchesRelease("capability", c.id)) return;
        if (!matchesArea("capability", c.id)) return;
        const parent = features.find(f => f.id === c.featureId);
        const parentArea  = parent && productAreas.find(a => a.id === parent.areaId);
        const parentGroup = parent && featureGroups.find(g => g.id === parent.featureGroupId);
        const pathParts = [parentArea?.title, parentGroup?.title, parent?.title].filter(Boolean);
        all.push({
          kind: "capability", id: c.id, title: c.title,
          subtitle: pathParts.length > 0 ? pathParts.join(" / ") : parent?.title,
          featureId: c.featureId,
        });
      });
    }

    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchActive, queryActive, normalizedQuery, typeFilter, statusFilter, themeFilter, releaseFilter,
       features, featureSlices, productCapabilities, productAreas, featureGroups,
       activeTheme, activeRelease]);

  // Counts for the type-filter pills. Computed from the same source
  // arrays but ignoring the type filter so the pill counts stay stable
  // as the user toggles between types.
  const countsByKind = useMemo(() => {
    const c = { feature: 0, slice: 0, capability: 0, unassigned: 0 };
    features.forEach(f => {
      if (!matchesQuery(f.title, f.description)) return;
      if (!matchesStatus(f.status)) return;
      if (!matchesTheme("feature", f.id)) return;
      if (!matchesRelease("feature", f.id)) return;
      if (!matchesArea("feature", f.id)) return;
      c.feature++;
      if (!f.areaId) c.unassigned++;
    });
    featureSlices.forEach(s => {
      if (!matchesQuery(s.title, s.description)) return;
      if (!matchesStatus(s.status)) return;
      if (!matchesTheme("slice", s.id)) return;
      if (!matchesRelease("slice", s.id)) return;
      if (!matchesArea("slice", s.id)) return;
      c.slice++;
    });
    if (statusFilter === "all") {
      productCapabilities.forEach(cap => {
        if (!matchesQuery(cap.title)) return;
        if (!matchesTheme("capability", cap.id)) return;
        if (!matchesRelease("capability", cap.id)) return;
        if (!matchesArea("capability", cap.id)) return;
        c.capability++;
      });
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryActive, normalizedQuery, statusFilter, themeFilter, releaseFilter,
       features, featureSlices, productCapabilities, activeTheme, activeRelease]);

  // Click handler — search result rows resolve to a featureId in the
  // detail pane. For container-shaped hits (area/group) we open the
  // first feature inside that container if any exists; otherwise the
  // pane stays as-is (the container itself isn't editable in the
  // detail view today).
  const handleHitClick = (hit: ProductSearchHit) => {
    if (hit.kind === "feature") {
      setSelectedId(hit.id);
    } else if (hit.kind === "slice") {
      setSelectedId(hit.featureId);
    } else if (hit.kind === "capability") {
      setSelectedId(hit.featureId);
    } else if (hit.kind === "area") {
      const first = features.find(f => f.areaId === hit.id);
      if (first) setSelectedId(first.id);
    } else if (hit.kind === "group") {
      const first = features.find(f => f.featureGroupId === hit.id);
      if (first) setSelectedId(first.id);
    }
  };

  const clearAll = () => {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setThemeFilter("all");
    setReleaseFilter("all");
    setAreaFilter("all");
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left rail */}
      <aside style={{
        width: 340, flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg)",
        overflowY: "auto",
        padding: "12px 12px 20px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* Search input */}
        <div style={{ position: "relative" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search features, slices, capabilities…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 28px 6px 10px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", outline: "none",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Clear search"
              aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0, border: "none", background: "transparent",
                color: "var(--text-tertiary)", cursor: "pointer",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Type filter pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {([
            { id: "all",         label: "All",         count: null as number | null },
            { id: "feature",     label: "Features",    count: countsByKind.feature },
            { id: "slice",       label: "Slices",      count: countsByKind.slice },
            { id: "capability",  label: "Capabilities",count: countsByKind.capability },
            { id: "unassigned",  label: "Needs mapping",  count: countsByKind.unassigned },
          ] as { id: ProductSearchKind; label: string; count: number | null }[]).map(p => {
            const active = typeFilter === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setTypeFilter(p.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: 100,
                  background: active ? "var(--accent-soft)" : "var(--bg)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: 10.5, fontWeight: 500, cursor: "pointer",
                }}
              >
                {p.label}
                {p.count !== null && (
                  <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-tertiary)" }}>
                    · {p.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Secondary filter dropdowns — kept compact + collapsible to
            avoid noise. They sit under a small "Filters" disclosure that
            only opens when the user needs them. */}
        <ProductFilterDropdowns
          areaFilter={areaFilter}
          statusFilter={statusFilter}
          themeFilter={themeFilter}
          releaseFilter={releaseFilter}
          onAreaChange={setAreaFilter}
          onStatusChange={setStatusFilter}
          onThemeChange={setThemeFilter}
          onReleaseChange={setReleaseFilter}
        />

        {/* Clear-all chip — only when something is active. */}
        {searchActive && (
          <button
            onClick={clearAll}
            style={{
              alignSelf: "flex-start",
              padding: "2px 10px", borderRadius: 100,
              border: "1px dashed var(--border-strong)",
              background: "transparent", color: "var(--text-secondary)",
              fontSize: 10.5, fontWeight: 500, cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Clear search + filters
          </button>
        )}

        {/* Body: either the hierarchy tree (default) or the flat search
            result list (when something is active). The tree is never
            removed from the codebase — clearing returns the user to it
            instantly. */}
        {searchActive ? (
          <ProductSearchResultsList
            results={results}
            selectedFeatureId={selectedId}
            onHitClick={handleHitClick}
          />
        ) : (
          <>
            <ProductTree
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
            <div style={{
              marginTop: 4, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5,
            }}>
              Use the + buttons to add feature sets and features. Click a feature to edit it on the right.
            </div>
            <NewAreaButton />
          </>
        )}
      </aside>

      {/* Right pane — focused FeatureDetailPane editor. */}
      <main style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ padding: "16px 24px" }}>
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
          </div>
        </div>
      </main>
    </div>
  );
}

// ── ProductFilterDropdowns ──────────────────────────────────────────────
// Compact secondary-filter strip with Status / Theme / Release. Stays
// always-visible (no disclosure) to keep clicks short; the dropdowns
// themselves are minimal native selects so the prototype doesn't have
// to maintain bespoke popover state for each.
function ProductFilterDropdowns({
  areaFilter, statusFilter, themeFilter, releaseFilter,
  onAreaChange, onStatusChange, onThemeChange, onReleaseChange,
}: {
  areaFilter: string;        // area id or "all"
  statusFilter: "all" | FeatureStatus;
  themeFilter: string;
  releaseFilter: string;
  onAreaChange: (id: string) => void;
  onStatusChange: (s: "all" | FeatureStatus) => void;
  onThemeChange: (id: string) => void;
  onReleaseChange: (id: string) => void;
}) {
  const { themes, releases, productAreas } = useStore();
  const selectStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 0,
    padding: "3px 6px",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: active ? "var(--accent-soft)" : "var(--bg)",
    color: active ? "var(--accent)" : "var(--text)",
    fontSize: 11, outline: "none",
  });
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {/* Area filter — narrows the result set to one capability area's
          slice / capability / feature children. Useful for scanning a
          single product surface when the rail is crowded. */}
      <select
        value={areaFilter}
        onChange={e => onAreaChange(e.target.value)}
        style={selectStyle(areaFilter !== "all")}
        aria-label="Filter by capability area"
      >
        <option value="all">All areas</option>
        {productAreas.map(a => (
          <option key={a.id} value={a.id}>{a.title}</option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={e => onStatusChange(e.target.value as "all" | FeatureStatus)}
        style={selectStyle(statusFilter !== "all")}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        <option value="not_started">Not started</option>
        <option value="planned">Planned</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
      </select>
      {THEMES_ENABLED && (
      <select
        value={themeFilter}
        onChange={e => onThemeChange(e.target.value)}
        style={selectStyle(themeFilter !== "all")}
        aria-label="Filter by theme"
      >
        <option value="all">All themes</option>
        {themes.map(t => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
      )}
      <select
        value={releaseFilter}
        onChange={e => onReleaseChange(e.target.value)}
        style={selectStyle(releaseFilter !== "all")}
        aria-label="Filter by milestone"
      >
        <option value="all">All milestones</option>
        {releases.map(r => (
          <option key={r.id} value={r.id}>{r.title}</option>
        ))}
      </select>
    </div>
  );
}

// ── ProductSearchResultsList ────────────────────────────────────────────
// Flat result list shown in place of the tree when search/filter is
// active. Each row carries a colored kind chip + the title + a small
// subtitle hint (parent / location). Unassigned features get a yellow
// "UNASSIGNED" badge so the user can spot them at a glance — clicking
// the row opens the feature in the detail pane, where the existing
// "Assign to hierarchy" banner takes over.
function ProductSearchResultsList({
  results, selectedFeatureId, onHitClick,
}: {
  results: ProductSearchHit[];
  selectedFeatureId: string | null;
  onHitClick: (hit: ProductSearchHit) => void;
}) {
  if (results.length === 0) {
    return (
      <div style={{
        padding: "16px 8px", fontSize: 11, color: "var(--text-tertiary)",
        lineHeight: 1.5, textAlign: "center",
      }}>
        No results. Adjust the query or clear filters to keep browsing the tree.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
        textTransform: "uppercase", color: "var(--text-tertiary)",
        margin: "2px 4px 4px",
      }}>
        Results · {results.length}
      </div>
      {results.map(hit => {
        const isSelectedFeature =
          (hit.kind === "feature" && hit.id === selectedFeatureId) ||
          (hit.kind === "slice" && hit.featureId === selectedFeatureId) ||
          (hit.kind === "capability" && hit.featureId === selectedFeatureId);
        return (
          <button
            key={`${hit.kind}-${hit.id}`}
            onClick={() => onHitClick(hit)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 6,
              width: "100%", padding: "5px 8px",
              border: "none", borderRadius: "var(--radius)",
              background: isSelectedFeature ? "var(--accent-soft)" : "transparent",
              textAlign: "left", cursor: "pointer",
            }}
            onMouseEnter={e => { if (!isSelectedFeature) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (!isSelectedFeature) e.currentTarget.style.background = "transparent"; }}
            title={hit.subtitle ? `${hit.title} — ${hit.subtitle}` : hit.title}
          >
            <span style={productHitKindPill(hit.kind)}>{productHitKindLabel(hit.kind)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{
                  fontSize: "var(--fs-body)",
                  color: isSelectedFeature ? "var(--accent)" : "var(--text)",
                  fontWeight: isSelectedFeature ? 600 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {hit.title}
                </span>
                {hit.kind === "feature" && hit.unassigned && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                    color: "#b45309",
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.45)",
                    borderRadius: 100, padding: "0 6px",
                  }}>
                    NEEDS MAPPING
                  </span>
                )}
              </div>
              {hit.subtitle && (
                <div style={{
                  fontSize: 10.5, color: "var(--text-tertiary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginTop: 1,
                }}>
                  {hit.subtitle}
                </div>
              )}
            </div>
            {"status" in hit && (
              <span style={pillStyle(hit.status)}>
                {FEATURE_STATUS_LABEL[hit.status]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function productHitKindLabel(k: ProductSearchHit["kind"]): string {
  switch (k) {
    case "area":       return "Area";
    case "group":      return "Feature Set";
    case "feature":    return "Feature";
    case "slice":      return "Slice";
    case "capability": return "Capability";
  }
}

function productHitKindPill(k: ProductSearchHit["kind"]): React.CSSProperties {
  const palette: Record<ProductSearchHit["kind"], { bg: string; fg: string; bd: string }> = {
    area:       { bg: "rgba(99,102,241,0.10)", fg: "#4338ca", bd: "rgba(99,102,241,0.45)" },
    group:      { bg: "rgba(14,165,233,0.10)", fg: "#0369a1", bd: "rgba(14,165,233,0.45)" },
    feature:    { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
    slice:      { bg: "rgba(168,85,247,0.12)", fg: "#7e22ce", bd: "rgba(168,85,247,0.45)" },
    capability: { bg: "rgba(20,184,166,0.12)", fg: "#0f766e", bd: "rgba(20,184,166,0.45)" },
  };
  const p = palette[k];
  return {
    display: "inline-flex", alignItems: "center",
    padding: "1px 6px", borderRadius: 100,
    background: p.bg, color: p.fg,
    border: `1px solid ${p.bd}`,
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
    whiteSpace: "nowrap",
    flexShrink: 0,
    marginTop: 1,
  };
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
  // Features with no areaId land in a synthetic "ungrouped" bucket at
  // the end of the rail so V1's typed-feature flow stays reachable.
  const orphans = features.filter(f => !f.areaId);
  // Default-collapse capability areas when there are more than two — at
  // small counts users still want everything expanded, but once the
  // rail starts to grow we want the structure to be scannable.
  const defaultCollapsed = productAreas.length > 2;
  const selectedFeatureAreaId = selectedId
    ? features.find(f => f.id === selectedId)?.areaId ?? null
    : null;
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
          // Keep the active area open even if we'd otherwise collapse.
          initiallyCollapsed={defaultCollapsed && area.id !== selectedFeatureAreaId}
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
  area, groups, features, selectedId, onSelect, initiallyCollapsed = false,
}: {
  area: ProductArea;
  groups: FeatureGroup[];
  features: Feature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  initiallyCollapsed?: boolean;
}) {
  const { updateProductArea, deleteProductArea, createFeatureGroup, createFeature } = useStore();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
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
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
          {features.length}
        </span>
        <button
          onClick={() => { if (window.confirm(`Delete area "${area.title}"? Its feature sets and features will be unassigned.`)) deleteProductArea(area.id); }}
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
              {ungroupedInArea.map(f => (
                <FeatureTreeRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, paddingLeft: 16, marginTop: 4 }}>
            <button
              onClick={() => {
                const title = window.prompt("New feature set name");
                if (title?.trim()) createFeatureGroup({ title, areaId: area.id });
              }}
              style={dashedBtn()}
            >
              + Add feature set
            </button>
            <button
              onClick={() => {
                const title = window.prompt("New feature name (no set)");
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
          onClick={() => { if (window.confirm(`Delete feature set "${group.title}"? Its features will be detached but kept.`)) deleteFeatureGroup(group.id); }}
          aria-label="Delete feature set"
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

// "Needs mapping" — holding bucket for product objects with undefined
// hierarchy attributes. Objects don't physically MOVE into / out of
// this bucket; they're surfaced here whenever ANY of their hierarchy
// attributes is undefined. Setting the missing attribute clears them
// from this view automatically.
//
// Four categories now appear:
//   • Features missing a capability area
//   • Features that have an area but no feature set
//   • Feature Sets missing a capability area
//   • Slices / Capabilities missing a parent feature
//
// Each row spells out exactly WHAT is missing and offers a focused
// "Set …" action. The section is collapsible so it doesn't dominate
// the rail when there's work to do everywhere else.
function UnassignedTreeBlock({
  features, selectedId, onSelect,
}: {
  features: Feature[];                  // features without areaId (passed in)
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { featureSlices, productCapabilities, featureGroups, features: allFeatures } = useStore();
  // Features with an area but no feature set — currently render under
  // their area as "ungrouped". They still need a feature set if the
  // team's mental model expects one, so we surface them here too.
  const featuresMissingSet = useMemo(
    () => allFeatures.filter(f => !!f.areaId && !f.featureGroupId),
    [allFeatures],
  );
  const featureSetsMissingArea = useMemo(
    () => featureGroups.filter(g => !g.areaId),
    [featureGroups],
  );
  const slicesMissingFeature = useMemo(
    () => featureSlices.filter(s => !s.featureId),
    [featureSlices],
  );
  const capsMissingFeature = useMemo(
    () => productCapabilities.filter(c => !c.featureId),
    [productCapabilities],
  );
  const total =
    features.length +
    featuresMissingSet.length +
    featureSetsMissingArea.length +
    slicesMissingFeature.length +
    capsMissingFeature.length;
  const [collapsed, setCollapsed] = useState(false);
  if (total === 0) return null;
  return (
    <div style={{
      border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", padding: "6px 8px",
    }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", padding: 0,
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--text-tertiary)",
        }}
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          Needs mapping · {total}
        </span>
      </button>
      {!collapsed && (
        <>
          {features.length > 0 && (
            <NeedsMappingSection label="Features · missing capability area">
              {features.map(f => (
                <UnassignedFeatureRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </NeedsMappingSection>
          )}
          {featuresMissingSet.length > 0 && (
            <NeedsMappingSection label="Features · missing feature set">
              {featuresMissingSet.map(f => (
                <FeatureNeedsSetRow key={f.id} feature={f} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </NeedsMappingSection>
          )}
          {featureSetsMissingArea.length > 0 && (
            <NeedsMappingSection label="Feature sets · missing capability area">
              {featureSetsMissingArea.map(g => (
                <FeatureSetNeedsAreaRow key={g.id} group={g} />
              ))}
            </NeedsMappingSection>
          )}
          {slicesMissingFeature.length > 0 && (
            <NeedsMappingSection label="Feature slices · missing parent feature">
              {slicesMissingFeature.map(s => (
                <SliceNeedsParentRow key={s.id} slice={s} />
              ))}
            </NeedsMappingSection>
          )}
          {capsMissingFeature.length > 0 && (
            <NeedsMappingSection label="Capabilities · missing parent feature">
              {capsMissingFeature.map(c => (
                <CapabilityNeedsParentRow key={c.id} capability={c} />
              ))}
            </NeedsMappingSection>
          )}
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.45 }}>
            Setting a Feature Set automatically infers its Capability Area. Setting a parent Feature on a slice or capability inherits both. Items stay the same record — hierarchy attributes are properties, not folders.
          </div>
        </>
      )}
    </div>
  );
}

// Two-zone row: the main click target opens the feature in the detail
// pane (so the user can still edit description / capabilities / slices
// before assignment), while the right-side Assign button opens the
// assignment dialog without losing the rail context.
// Sub-section header used inside the Needs mapping block. Keeps the
// visual structure consistent across the four object-type buckets.
function NeedsMappingSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

// Single-select dropdown popover for picking a parent attribute (a
// capability area for a feature set, or a parent feature for a
// slice / capability). When the parent's own hierarchy is known, the
// inference is automatic on confirm — the caller decides what to
// inherit.
function SetParentPopover({
  label, options, onPick,
}: {
  label: string;
  options: { id: string; label: string; subtitle?: string }[];
  onPick: (id: string) => void;
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
          padding: "2px 8px", borderRadius: 100,
          border: "1px solid var(--accent)",
          background: "var(--bg)", color: "var(--accent)",
          fontSize: 10.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 260, maxHeight: 240, overflowY: "auto",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        }}>
          {options.length === 0 ? (
            <div style={{ padding: 12, fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "center" }}>
              Nothing available to set.
            </div>
          ) : options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onPick(opt.id); setOpen(false); }}
              style={{
                display: "flex", flexDirection: "column", gap: 1,
                width: "100%", padding: "6px 10px", textAlign: "left",
                background: "transparent", border: "none", cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>{opt.label}</span>
              {opt.subtitle && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{opt.subtitle}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One row per feature that's missing only a feature set (already has
// an area). Single-click "Set feature set" picks from sets in the
// SAME area; "+ New set in <area>" creates one inline.
function FeatureNeedsSetRow({ feature, selectedId, onSelect }: { feature: Feature; selectedId: string | null; onSelect: (id: string) => void }) {
  const { productAreas, featureGroups, updateFeature, createFeatureGroup } = useStore();
  const area = productAreas.find(a => a.id === feature.areaId);
  const setsInArea = featureGroups.filter(g => g.areaId === feature.areaId);
  const options = setsInArea.map(g => ({ id: g.id, label: g.title }));
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 6px",
      background: selectedId === feature.id ? "var(--accent-soft)" : "transparent",
      borderRadius: "var(--radius)",
    }}>
      <button
        onClick={() => onSelect(feature.id)}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
          background: "transparent", border: "none", padding: 0,
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={pillStyle(feature.status)}>{FEATURE_STATUS_LABEL[feature.status]}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {feature.title}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
          Area: {area?.title ?? "—"} · <em>missing feature set</em>
        </span>
      </button>
      <SetParentPopover
        label="Set feature set"
        options={[
          ...options,
          { id: "__new__", label: "+ New feature set in this area" },
        ]}
        onPick={(id) => {
          if (id === "__new__") {
            const title = window.prompt("New feature set name");
            if (!title?.trim()) return;
            const newId = createFeatureGroup({ title: title.trim(), areaId: feature.areaId });
            updateFeature(feature.id, { featureGroupId: newId });
          } else {
            updateFeature(feature.id, { featureGroupId: id });
          }
        }}
      />
    </div>
  );
}

// One row per feature set without a capability area. Picking an area
// is a single attribute write.
function FeatureSetNeedsAreaRow({ group }: { group: FeatureGroup }) {
  const { productAreas, updateFeatureGroup, createProductArea } = useStore();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 6px",
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {group.title}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
        <em>missing capability area</em>
      </span>
      <SetParentPopover
        label="Set capability area"
        options={[
          ...productAreas.map(a => ({ id: a.id, label: a.title })),
          { id: "__new__", label: "+ New capability area" },
        ]}
        onPick={(id) => {
          if (id === "__new__") {
            const title = window.prompt("New capability area name");
            if (!title?.trim()) return;
            const newId = createProductArea({ title: title.trim() });
            updateFeatureGroup(group.id, { areaId: newId });
          } else {
            updateFeatureGroup(group.id, { areaId: id });
          }
        }}
      />
    </div>
  );
}

// One row per slice missing a parent feature. Picking a parent feature
// inherits both that feature's areaId and featureGroupId via the
// existing parent relationship — the slice itself only stores
// `featureId`, so we just write that. needsMapping clears on save.
function SliceNeedsParentRow({ slice }: { slice: FeatureSlice }) {
  const { features, productAreas, featureGroups, updateFeatureSlice } = useStore();
  const options = features.map(f => {
    const area = productAreas.find(a => a.id === f.areaId);
    const set = featureGroups.find(g => g.id === f.featureGroupId);
    const parts = [area?.title, set?.title].filter(Boolean);
    return {
      id: f.id, label: f.title,
      subtitle: parts.length ? parts.join(" · ") : "Needs mapping",
    };
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 6px",
    }}>
      <span style={pillStyle(slice.status)}>{FEATURE_STATUS_LABEL[slice.status]}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {slice.title}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
        <em>missing parent feature</em>
      </span>
      <SetParentPopover
        label="Set parent feature"
        options={options}
        onPick={(id) => updateFeatureSlice(slice.id, { featureId: id, needsMapping: false })}
      />
    </div>
  );
}

// One row per capability missing a parent feature.
function CapabilityNeedsParentRow({ capability }: { capability: ProductCapability }) {
  const { features, productAreas, featureGroups, updateProductCapability } = useStore();
  const options = features.map(f => {
    const area = productAreas.find(a => a.id === f.areaId);
    const set = featureGroups.find(g => g.id === f.featureGroupId);
    const parts = [area?.title, set?.title].filter(Boolean);
    return {
      id: f.id, label: f.title,
      subtitle: parts.length ? parts.join(" · ") : "Needs mapping",
    };
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 6px",
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {capability.title}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
        <em>missing parent feature</em>
      </span>
      <SetParentPopover
        label="Set parent feature"
        options={options}
        onPick={(id) => updateProductCapability(capability.id, { featureId: id, needsMapping: false })}
      />
    </div>
  );
}

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
        title="Set the capability area + feature set for this feature"
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
        Set area
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
            Set hierarchy
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
            {feature.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, lineHeight: 1.45 }}>
            Pick a capability area and (optionally) a feature set. Linked weekly goals and intents stay attached to the feature.
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

        {/* Feature set selector */}
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Feature set
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={radioRow(groupMode === "none")}>
              <input
                type="radio"
                checked={groupMode === "none"}
                onChange={() => setGroupMode("none")}
              />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
                Place directly in area (no feature set)
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
                Use an existing feature set
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
                Create a new feature set
              </span>
            </label>
            {groupMode === "new" && (
              <input
                value={newGroupTitle}
                onChange={e => setNewGroupTitle(e.target.value)}
                placeholder="New feature set name…"
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
    weeklyGoals, wipItems, themes,
    releases,
    updateFeature, deleteFeature,
    createProductCapability, updateProductCapability, deleteProductCapability,
    createFeatureSlice, toggleThemeFeature,
    setRoute, openWip,
    setRoadmapFocus,
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
  const themeIdsForFeature = themes
    .filter(t => t.linkedFeatureIds.includes(feature.id))
    .map(t => t.id);
  // Milestones that reference this feature directly OR via one of its
  // slices / capabilities / its parent feature set. Surfaces the
  // milestone planning picture from the Product View, so a reviewer
  // can answer "where is this feature being shipped?" without leaving
  // the screen.
  const sliceIds = slices.map(s => s.id);
  const capIds = caps.map(c => c.id);
  const linkedReleases = releases.filter(r =>
    r.linkedFeatureIds.includes(feature.id) ||
    (feature.featureGroupId && r.linkedFeatureGroupIds.includes(feature.featureGroupId)) ||
    sliceIds.some(id => r.linkedSliceIds.includes(id)) ||
    capIds.some(id => r.linkedCapabilityIds.includes(id))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Breadcrumb — "Area / Set / <this feature title>" so the user
          knows where they are even when they landed from search or the
          Browse view. The feature title repeats below, but the path
          tells the user where it lives. */}
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {area?.title ?? "Needs mapping · undefined capability area"}
        {group && <> {" / "} {group.title}</>}
        {" / "}
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{feature.title}</span>
      </div>

      {/* Theme tags — overlay row. Hidden while THEMES_ENABLED is false. */}
      {THEMES_ENABLED && (
        <ThemeRefList
          themeIds={themeIdsForFeature}
          onPick={(themeId) => toggleThemeFeature(themeId, feature.id)}
          pickerSelected={themeIdsForFeature}
        />
      )}

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
              This feature needs mapping.
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 2 }}>
              Set its capability area and (optionally) feature set. The feature stays the same record — only its hierarchy attributes change. Linked goals and intents are preserved.
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
            Set hierarchy
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
        <div style={reviewLabelStyle()}>Description</div>
        <textarea
          value={descDraft}
          onChange={e => setDescDraft(e.target.value)}
          onBlur={() => updateFeature(feature.id, { description: descDraft })}
          rows={2}
          placeholder="What this feature does, in one or two lines."
          style={{
            marginTop: 4,
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

      {/* Linked milestones — read-only reference (linking happens in
          the Milestones tab, not here). */}
      {linkedReleases.length > 0 && (
        <section>
          <div style={reviewLabelStyle()}>
            Linked milestones · {linkedReleases.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {linkedReleases.map(r => (
              <button
                key={r.id}
                onClick={() => setRoadmapFocus({ tab: "releases" })}
                title={`Open milestone · ${r.title}`}
                style={{
                  padding: "3px 9px", borderRadius: 100,
                  background: "var(--bg-sunken)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.4,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {r.title}
                <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>{r.versionLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Product capabilities — owned by the feature, NOT the slice. */}
      <section>
        <div style={reviewLabelStyle()}>
          Capabilities · {caps.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={reviewLabelStyle()}>
            Slices · {slices.length}
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
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: 6 }}>
            No slices yet. A slice is a deliverable version of this feature — it picks which capabilities to include, defer, or exclude.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            {slices.map(slice => (
              <SliceCard key={slice.id} slice={slice} capabilities={caps} />
            ))}
          </div>
        )}
      </section>

      {/* Linked goals + intents (read-only on Product View) */}
      {(linkedGoals.length > 0 || linkedIntents.length > 0) && (
        <section>
          <div style={reviewLabelStyle()}>
            Linked weekly goals &amp; intents · {linkedGoals.length + linkedIntents.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
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
  slice,
}: {
  slice: FeatureSlice;
  // The `capabilities` prop used to drive the per-slice MoSCoW
  // inclusion table; that table moved to Milestones, so the prop is
  // no longer needed.
  capabilities?: ProductCapability[];
}) {
  const { updateFeatureSlice, deleteFeatureSlice, releases, themes, toggleThemeSlice } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(slice.title);
  const [descDraft, setDescDraft] = useState(slice.description ?? "");
  // Cross-reference: every release that packages this slice.
  const releaseIdsForSlice = releases
    .filter(r => r.linkedSliceIds.includes(slice.id))
    .map(r => r.id);
  // Themes tagging this slice — overlay, editable inline.
  const themeIdsForSlice = themes
    .filter(t => t.linkedSliceIds.includes(slice.id))
    .map(t => t.id);

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

      {/* Capability inclusion table removed in this revision. MoSCoW
          lives only on Milestones now — Feature Slice's role here is to
          describe product scope/version, not milestone priority. The
          parent-feature capability list is browsable via the feature's
          own detail pane; per-milestone priority lives on the Milestones
          tab. */}

      {/* Read-only cross-reference: milestones that include this slice. */}
      {releaseIdsForSlice.length > 0 && (
        <ReleaseRefList releaseIds={releaseIdsForSlice} />
      )}

      {/* Theme tags — overlay row. Hidden while THEMES_ENABLED is false. */}
      {THEMES_ENABLED && (
        <ThemeRefList
          themeIds={themeIdsForSlice}
          onPick={(themeId) => toggleThemeSlice(themeId, slice.id)}
          pickerSelected={themeIdsForSlice}
        />
      )}
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

// ── ReleasesView ──────────────────────────────────────────────────────────
// Lightweight scope-packaging surface. A release is NOT a parent of any
// product object — it just collects pointers. Each ReleaseCard reads the
// release once and lets the user toggle goals / features / slices /
// capabilities in and out. Clicking a linked slice or feature jumps to
// the Product View focused on the parent feature (via setRoadmapFocus,
// same mechanism used by the goal cards).
//
// Cross-references (so the Release tab isn't a one-way street):
//   • WeeklyGoalCard renders "Included in releases: …" if any release
//     packages it.
//   • SliceCard in FeatureDetailPane renders "Included in releases: …"
//     for the same reason.

const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  planned:     "Planned",
  in_progress: "In Progress",
  released:    "Released",
};

function releasePillStyle(status: ReleaseStatus): React.CSSProperties {
  const palette: Record<ReleaseStatus, { bg: string; color: string; border: string }> = {
    planned:     { bg: "rgba(59,130,246,0.10)",  color: "#1d4ed8", border: "rgba(59,130,246,0.40)" },
    in_progress: { bg: "rgba(245,158,11,0.12)",  color: "#b45309", border: "rgba(245,158,11,0.45)" },
    released:    { bg: "rgba(34,197,94,0.12)",   color: "#15803d", border: "rgba(34,197,94,0.45)" },
  };
  const p = palette[status];
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "1px 8px", borderRadius: 100,
    background: p.bg, color: p.color,
    border: `1px solid ${p.border}`,
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}

function ReleasesView() {
  const { releases, createRelease } = useStore();
  // Group milestones by versionFamilyId so the compact strip shows one
  // card per FAMILY (i.e. one card per "M1", not three cards for
  // v1/v2/v3 that look like three separate milestones). Inside each
  // card we render the version-pill row so the user sees lineage at a
  // glance. The "current" version (newest createdAt in the family)
  // drives the card-level title / status / date / counts; clicking a
  // non-current pill switches the detail pane to that snapshot.
  const families = useMemo(() => {
    type Family = { familyId: string; versions: Release[] };
    const map = new Map<string, Release[]>();
    for (const r of releases) {
      const arr = map.get(r.versionFamilyId) ?? [];
      arr.push(r);
      map.set(r.versionFamilyId, arr);
    }
    const order: Record<ReleaseStatus, number> = { in_progress: 0, planned: 1, released: 2 };
    const out: Family[] = [];
    map.forEach((versions, familyId) => {
      versions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      out.push({ familyId, versions });
    });
    out.sort((a, b) => {
      const ca = a.versions[a.versions.length - 1];
      const cb = b.versions[b.versions.length - 1];
      const d = order[ca.status] - order[cb.status];
      if (d !== 0) return d;
      return ca.title.localeCompare(cb.title);
    });
    return out;
  }, [releases]);
  const sorted = useMemo(
    () => families.flatMap(f => f.versions),
    [families],
  );

  // Selected milestone — drives the expanded detail panel below the
  // scan row. Defaults to the first sorted milestone so the page lands
  // populated; falls back gracefully if all milestones are deleted.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  React.useEffect(() => {
    if (sorted.length === 0) { setSelectedId(null); return; }
    if (selectedId && sorted.some(r => r.id === selectedId)) return;
    setSelectedId(sorted[0].id);
  }, [sorted, selectedId]);

  const selectedRelease = selectedId
    ? releases.find(r => r.id === selectedId) ?? null
    : null;

  const handleCreate = () => {
    const newId = createRelease({ title: "Untitled milestone" });
    setSelectedId(newId);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "16px 16px 24px", minHeight: "100%",
      maxWidth: 1280, margin: "0 auto",
    }}>
      {/* Header strip — explainer + new-milestone button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Milestones define what needs to be ready for a business target — for example, <em>July 1st Launch</em> or <em>Internal Admin V1</em>. They never own anything; the same goal, feature, slice, or capability can sit in multiple milestones.
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={handleCreate}
          style={{
            padding: "5px 12px",
            background: "var(--accent)",
            color: "white",
            border: "none", borderRadius: "var(--radius)",
            fontSize: "var(--fs-meta)", fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          + New milestone
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{
          margin: "60px auto", maxWidth: 380, textAlign: "center",
          fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
        }}>
          No milestones yet. Use <strong style={{ color: "var(--text)" }}>+ New milestone</strong> to define what needs to be ready for a business target.
        </div>
      ) : (
        <>
          {/* Horizontal scan row — compact summary cards, scrollable
              horizontally when the milestones outgrow the page width.
              Selected card gets an accent border + bg. The last card is
              a dashed "+ New milestone" affordance so the user never
              loses the create entry-point.

              Sticky to the top of the scroll container so the list
              stays in view while the user reads the detail card below.
              Without this, scrolling through Product Scope hides the
              other milestones from sight. */}
          <div style={{
            display: "flex", gap: 12, alignItems: "stretch",
            overflowX: "auto", overflowY: "hidden",
            padding: "8px 4px 12px",
            position: "sticky", top: 0, zIndex: 5,
            background: "var(--bg-sunken)",
            borderBottom: "1px solid var(--border)",
            // Tiny scrollbar styling via WebKit; native fallback elsewhere.
            scrollbarWidth: "thin" as const,
          }}>
            {families.map(family => {
              // The "card" represents the family. Its visible body
              // shows the CURRENT version (last in chronological
              // order); a version-pill row below the title lets the
              // user pick any historical snapshot. If a non-current
              // version is selected, the card border shifts to accent
              // (instead of green) so it's obvious the strip is
              // showing a snapshot, not the latest.
              const current = family.versions[family.versions.length - 1];
              const selectedVersionId =
                selectedId && family.versions.some(v => v.id === selectedId)
                  ? selectedId
                  : current.id;
              const display = family.versions.find(v => v.id === selectedVersionId) ?? current;
              return (
                <CompactMilestoneCard
                  key={family.familyId}
                  release={display}
                  familyVersions={family.versions}
                  selectedVersionId={selectedVersionId}
                  isAnyVersionSelected={family.versions.some(v => v.id === selectedId)}
                  onSelectVersion={(id) => setSelectedId(id)}
                />
              );
            })}
            {/* + New milestone as last card — keeps the affordance in
                the scan row in addition to the header button. */}
            <button
              onClick={handleCreate}
              style={{
                flexShrink: 0,
                width: 220,
                padding: "16px 14px",
                borderRadius: "var(--radius-lg)",
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                color: "var(--text-tertiary)",
                fontSize: "var(--fs-meta)", fontWeight: 500,
                cursor: "pointer", textAlign: "center",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
              title="Create a new milestone"
            >
              + New milestone
            </button>
          </div>

          {/* Expanded detail of the selected milestone — full-width
              workspace card. Same ReleaseCard component used previously,
              now rendered ONLY for the selected milestone. */}
          {selectedRelease ? (
            <ReleaseCard
              key={selectedRelease.id}
              release={selectedRelease}
              onSelectVersion={setSelectedId}
            />
          ) : (
            <div style={{
              margin: "40px auto", maxWidth: 360, textAlign: "center",
              fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
            }}>
              Pick a milestone above to see its product scope and related goals.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── CompactMilestoneCard ───────────────────────────────────────────────
// One column in the horizontal milestone scan row. Fixed width (~220px)
// so multiple cards sit side-by-side cleanly; the parent container is
// horizontally scrollable when the row outgrows the viewport. Click to
// select; the detail panel below expands to the picked milestone.
//
// Each compact card shows:
//   • status pill (clickable here would be confusing — we keep status
//     editing in the expanded detail card to avoid two action paths)
//   • title (read-only here; editing lives in the expanded card)
//   • target date / range
//   • description excerpt (1–2 lines, clamped)
//   • signal-of-progress chip row: linked goals count + MoSCoW counts
function CompactMilestoneCard({
  release, familyVersions, selectedVersionId, isAnyVersionSelected, onSelectVersion,
}: {
  release: Release;
  // Every version in this milestone's family, sorted oldest → newest.
  // Length >= 1 (the family always contains at least this card).
  familyVersions: Release[];
  // Which version (by id) the detail pane is currently showing — used
  // to highlight the pill in the version-list row.
  selectedVersionId: string;
  // True when any version in the family is the selected one in the
  // detail pane. Drives the card border highlight.
  isAnyVersionSelected: boolean;
  // Switch the detail pane to the given version id.
  onSelectVersion: (id: string) => void;
}) {
  const { weeklyGoals } = useStore();
  const goalCount = weeklyGoals.filter(g => release.linkedGoalIds.includes(g.id)).length;
  // The latest version in the family is the "current" version.
  const current = familyVersions[familyVersions.length - 1];
  const isShowingCurrent = release.id === current.id;
  // Count items by MoSCoW priority — uses the same composite-key lookup
  // as the expanded card so the two surfaces never disagree.
  const counts: Record<MoscowPriority, number> = { must: 0, should: 0, could: 0, wont: 0 };
  const collectIds: string[] = [
    ...release.linkedAreaIds.map(id => milestoneLinkKey("area", id)),
    ...release.linkedFeatureGroupIds.map(id => milestoneLinkKey("group", id)),
    ...release.linkedFeatureIds.map(id => milestoneLinkKey("feature", id)),
    ...release.linkedSliceIds.map(id => milestoneLinkKey("slice", id)),
    ...release.linkedCapabilityIds.map(id => milestoneLinkKey("capability", id)),
  ];
  collectIds.forEach(k => {
    const entry = release.productPriorities[k];
    const priority: MoscowPriority = entry?.priority ?? "must";
    counts[priority] += 1;
  });
  const totalScope = collectIds.length;
  const dateLabel = formatReleaseTargetLabel(release.targetStart, release.targetEnd);

  const stripeColor =
    release.status === "released"   ? "var(--status-accepted)" :
    release.status === "in_progress" ? "#f59e0b" :
                                       "var(--accent)";

  const selected = isAnyVersionSelected;
  return (
    <div
      style={{
        flexShrink: 0,
        width: 240,
        display: "flex", flexDirection: "column", gap: 8,
        padding: "10px 12px 12px",
        borderRadius: "var(--radius-lg)",
        background: selected ? "var(--accent-soft)" : "var(--bg)",
        borderTop:    selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRight:  selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderBottom: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: `4px solid ${stripeColor}`,
        textAlign: "left",
        boxShadow: selected ? "0 0 0 3px rgba(56, 132, 255, 0.18)" : undefined,
        transition: "box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={releasePillStyle(current.status)}>
          {RELEASE_STATUS_LABEL[current.status]}
        </span>
        <span style={{ flex: 1 }} />
        {dateLabel && (
          <span style={{
            fontSize: 10, color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
          }}>
            {dateLabel}
          </span>
        )}
      </div>
      {/* Milestone family name — taken from the CURRENT version (the
          authoritative definition). Clicking the title selects the
          current version so the detail pane jumps to "the one being
          shipped". */}
      <button
        onClick={() => onSelectVersion(current.id)}
        style={{
          background: "transparent", border: "none", padding: 0,
          fontSize: 14, fontWeight: 600,
          color: (selected && isShowingCurrent) ? "var(--accent)" : "var(--text)",
          lineHeight: 1.3, textAlign: "left", cursor: "pointer",
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}
        title={`Open ${current.title} (current version)`}
      >
        {current.title}
      </button>
      {/* Version-pill row — every version in the family stacked horizontally.
          The CURRENT version is green-pilled (its definition is the
          authoritative one); older versions are subtler. Clicking a
          pill switches the detail pane to that version's snapshot. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {familyVersions.map(v => {
          const isCurrent = v.id === current.id;
          const isActive = v.id === selectedVersionId;
          return (
            <button
              key={v.id}
              onClick={() => onSelectVersion(v.id)}
              title={v.versionSummary
                ? `${v.versionLabel} — ${v.versionSummary}${isCurrent ? " · current" : " · snapshot"}`
                : `${v.versionLabel}${isCurrent ? " · current" : " · snapshot"}`}
              style={{
                padding: "1px 8px", borderRadius: 100,
                border: isActive
                  ? `1px solid ${isCurrent ? "#15803d" : "var(--accent)"}`
                  : "1px solid var(--border)",
                background: isActive
                  ? (isCurrent ? "rgba(34,197,94,0.10)" : "var(--accent-soft)")
                  : (isCurrent ? "rgba(34,197,94,0.04)" : "var(--bg-sunken)"),
                color: isCurrent ? "#15803d" : "var(--text-secondary)",
                fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {v.versionLabel}{isCurrent ? " · current" : ""}
            </button>
          );
        })}
      </div>
      {release.description && (
        <div style={{
          fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45,
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as const,
        }}>
          {release.description}
        </div>
      )}
      {/* Stats row — goals + total scope. MoSCoW breakdown below it. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: "auto" }}>
        <span style={compactStatPill()}>
          {goalCount} goal{goalCount === 1 ? "" : "s"}
        </span>
        <span style={compactStatPill()}>
          {totalScope} scope item{totalScope === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {(["must", "should", "could", "wont"] as MoscowPriority[]).map(p => {
          const n = counts[p];
          if (n === 0) return null;
          return (
            <span key={p} style={compactMoscowCountPill(p)}>
              {p === "must" ? "Must" : p === "should" ? "Should" : p === "could" ? "Could" : "Won't"} · {n}
            </span>
          );
        })}
        {totalScope === 0 && (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            No scope yet
          </span>
        )}
      </div>
    </div>
  );
}

function compactStatPill(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 500,
    color: "var(--text-secondary)",
    background: "var(--bg-sunken)",
    border: "1px solid var(--border)",
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap",
  };
}

function compactMoscowCountPill(priority: MoscowPriority): React.CSSProperties {
  const palette: Record<MoscowPriority, { bg: string; fg: string; bd: string }> = {
    must:   { bg: "rgba(34,197,94,0.10)",  fg: "#15803d", bd: "rgba(34,197,94,0.40)" },
    should: { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.40)" },
    could:  { bg: "rgba(245,158,11,0.10)", fg: "#b45309", bd: "rgba(245,158,11,0.40)" },
    wont:   { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const p = palette[priority];
  return {
    fontSize: 9.5, fontWeight: 600, letterSpacing: 0.2,
    color: p.fg, background: p.bg,
    border: `1px solid ${p.bd}`,
    borderRadius: 100, padding: "1px 7px",
    whiteSpace: "nowrap",
  };
}

function ReleaseCard({
  release, onSelectVersion,
}: {
  release: Release;
  // Lets the parent strip switch to a sibling version when the user
  // picks one from this card's version dropdown. Undefined when no
  // parent owns the selection (i.e. embedded surfaces).
  onSelectVersion?: (id: string) => void;
}) {
  const {
    updateRelease, deleteRelease,
    releases,
    cloneRelease, recordMilestoneAudit,
    weeklyGoals, features, featureSlices, productCapabilities, productAreas, featureGroups,
    themes, toggleThemeRelease,
    toggleReleaseGoal, toggleReleaseFeature, toggleReleaseSlice, toggleReleaseCapability,
    toggleReleaseArea, toggleReleaseFeatureGroup,
    setMilestoneObjectPriority, setMilestoneObjectNote,
    setRoadmapFocus,
  } = useStore();
  // Milestones used to have a Review/Configure toggle; that was
  // removed because the configure body is what users actually want by
  // default (matching Product View). The mode constant stays as a
  // local so the read-only snapshot path below can still force
  // `"review"` on older versions, but there's no toggle UI anymore.
  // Family members for the version dropdown — all releases sharing this
  // milestone's versionFamilyId, sorted by createdAt so older versions
  // sit at the top. Includes this release itself.
  const familyVersions = useMemo(
    () => releases
      .filter(r => r.versionFamilyId === release.versionFamilyId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [releases, release.versionFamilyId],
  );
  const isLatestInFamily =
    familyVersions.length === 0
      ? true
      : familyVersions[familyVersions.length - 1].id === release.id;
  // Lock older versions to Review — they're historical snapshots and
  // shouldn't be edited directly (the spec calls this out explicitly).
  // If the user wants to evolve an old version, they clone it into a
  // new version via the "Create new version from this" affordance.
  // Every version (current or snapshot) now renders the full body —
  // the user wants to see v1's actual scope/intents/history, not a
  // compact summary. Read-only is enforced inline on the editable
  // fields (title / dates / description / delete) + the snapshot
  // banner above tells the user the version is historical.
  const mode: "configure" = "configure";
  const themeIdsForRelease = themes
    .filter(t => t.linkedReleaseIds.includes(release.id))
    .map(t => t.id);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(release.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(release.description ?? "");
  const [editingDates, setEditingDates] = useState(false);
  const [startDraft, setStartDraft] = useState(release.targetStart?.slice(0, 10) ?? "");
  const [endDraft,   setEndDraft]   = useState(release.targetEnd?.slice(0, 10) ?? "");

  React.useEffect(() => {
    setTitleDraft(release.title);
    setDescDraft(release.description ?? "");
    setStartDraft(release.targetStart?.slice(0, 10) ?? "");
    setEndDraft(release.targetEnd?.slice(0, 10) ?? "");
  }, [release.id, release.title, release.description, release.targetStart, release.targetEnd]);

  const linkedGoals = weeklyGoals.filter(g => release.linkedGoalIds.includes(g.id));

  // Flatten every linked product object into one homogenous list with
  // its MoSCoW priority + optional note so we can bucket by priority
  // for the four grouped sections. The same row shape is used for all
  // five object kinds — kind chip + title + parent hint + priority.
  const productLinks: MilestoneRow[] = [];
  // Helper — read the priority entry; fall back to "must" if the link
  // exists but the priority map somehow doesn't have an entry (e.g.
  // ancient seed data). New links always insert an entry via the
  // toggle action, so this is just defence.
  const priorityOf = (kind: MilestoneObjectKind, objectId: string): { priority: MoscowPriority; note?: string } =>
    release.productPriorities[milestoneLinkKey(kind, objectId)] ?? { priority: "must" };

  // Areas
  productAreas
    .filter(a => release.linkedAreaIds.includes(a.id))
    .forEach(a => {
      const p = priorityOf("area", a.id);
      productLinks.push({
        kind: "area", objectId: a.id, title: a.title,
        priority: p.priority, note: p.note,
        onUnlink: () => {
          toggleReleaseArea(release.id, a.id);
          recordMilestoneAudit(
            release.id,
            `Removed Capability Area · ${a.title}`,
            { kind: "scope_removed", objectLabel: `Capability Area · ${a.title}` },
          );
        },
        // Areas open at their first feature in the Product View tree.
        onOpen: () => {
          const first = features.find(f => f.areaId === a.id);
          if (first) setRoadmapFocus({ tab: "product", featureId: first.id });
        },
        linkedGoals: weeklyGoals.filter(g =>
          g.linkedFeatureIds.some(fid => features.find(f => f.id === fid)?.areaId === a.id)
        ),
      });
    });
  // Feature Groups
  featureGroups
    .filter(g => release.linkedFeatureGroupIds.includes(g.id))
    .forEach(g => {
      const p = priorityOf("group", g.id);
      const parent = productAreas.find(a => a.id === g.areaId);
      productLinks.push({
        kind: "group", objectId: g.id, title: g.title,
        parentTitle: parent?.title,
        priority: p.priority, note: p.note,
        onUnlink: () => {
          toggleReleaseFeatureGroup(release.id, g.id);
          recordMilestoneAudit(
            release.id,
            `Removed Feature Set · ${g.title}`,
            { kind: "scope_removed", objectLabel: `Feature Set · ${g.title}` },
          );
        },
        onOpen: () => {
          const first = features.find(f => f.featureGroupId === g.id);
          if (first) setRoadmapFocus({ tab: "product", featureId: first.id });
        },
        linkedGoals: weeklyGoals.filter(goal =>
          goal.linkedFeatureIds.some(fid => features.find(f => f.id === fid)?.featureGroupId === g.id)
        ),
      });
    });
  // Features
  features
    .filter(f => release.linkedFeatureIds.includes(f.id))
    .forEach(f => {
      const p = priorityOf("feature", f.id);
      productLinks.push({
        kind: "feature", objectId: f.id, title: f.title,
        priority: p.priority, note: p.note,
        onUnlink: () => {
          toggleReleaseFeature(release.id, f.id);
          recordMilestoneAudit(
            release.id,
            `Removed Feature · ${f.title}`,
            { kind: "scope_removed", objectLabel: `Feature · ${f.title}` },
          );
        },
        onOpen: () => setRoadmapFocus({ tab: "product", featureId: f.id }),
        linkedGoals: weeklyGoals.filter(g => g.linkedFeatureIds.includes(f.id)),
      });
    });
  // Slices
  featureSlices
    .filter(s => release.linkedSliceIds.includes(s.id))
    .forEach(s => {
      const p = priorityOf("slice", s.id);
      const parent = features.find(f => f.id === s.featureId);
      productLinks.push({
        kind: "slice", objectId: s.id, title: s.title,
        parentTitle: parent?.title,
        priority: p.priority, note: p.note,
        onUnlink: () => {
          toggleReleaseSlice(release.id, s.id);
          recordMilestoneAudit(
            release.id,
            `Removed Feature Slice · ${s.title}`,
            { kind: "scope_removed", objectLabel: `Feature Slice · ${s.title}` },
          );
        },
        onOpen: () => setRoadmapFocus({ tab: "product", featureId: s.featureId, sliceId: s.id }),
        linkedGoals: weeklyGoals.filter(g => g.linkedSliceIds.includes(s.id)),
      });
    });
  // Capabilities
  productCapabilities
    .filter(c => release.linkedCapabilityIds.includes(c.id))
    .forEach(c => {
      const p = priorityOf("capability", c.id);
      const parent = features.find(f => f.id === c.featureId);
      productLinks.push({
        kind: "capability", objectId: c.id, title: c.title,
        parentTitle: parent?.title,
        priority: p.priority, note: p.note,
        onUnlink: () => {
          toggleReleaseCapability(release.id, c.id);
          recordMilestoneAudit(
            release.id,
            `Removed Capability · ${c.title}`,
            { kind: "scope_removed", objectLabel: `Capability · ${c.title}` },
          );
        },
        onOpen: () => setRoadmapFocus({ tab: "product", featureId: c.featureId }),
        linkedGoals: weeklyGoals.filter(g => g.linkedCapabilityIds.includes(c.id)),
      });
    });

  const byPriority: Record<MoscowPriority, MilestoneRow[]> = {
    must:   productLinks.filter(p => p.priority === "must"),
    should: productLinks.filter(p => p.priority === "should"),
    could:  productLinks.filter(p => p.priority === "could"),
    wont:   productLinks.filter(p => p.priority === "wont"),
  };

  const dateLabel = formatReleaseTargetLabel(release.targetStart, release.targetEnd);

  return (
    <div
      data-release-id={release.id}
      style={{
        background: "var(--bg)",
        borderTop:    "1px solid var(--border)",
        borderRight:  "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: `4px solid ${release.status === "released" ? "var(--status-accepted)" : release.status === "in_progress" ? "#f59e0b" : "var(--accent)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px 18px",
        display: "flex", flexDirection: "column", gap: 14,
      }}
    >
      {/* Version strip — milestone-family lineage. Reads:
            VERSION HISTORY: [v1] [v2] [v3 · current]   + New version
          Each pill is a switch (clicking jumps to that version's
          snapshot). The current version is visually highlighted; older
          versions are subtler, signalling "snapshot" before the user
          even clicks. + New version always clones FROM the current
          selection — so cloning from v1 makes v4-from-v1, cloning from
          v3 makes v4-from-v3. Lineage is preserved in the audit log on
          both sides. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "6px 10px", borderRadius: "var(--radius)",
        background: "var(--bg-sunken)", border: "1px solid var(--border)",
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
          whiteSpace: "nowrap",
        }}>
          Version history
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {familyVersions.map(v => {
            const isCurrent = v.id === familyVersions[familyVersions.length - 1].id;
            const isActive = v.id === release.id;
            return (
              <button
                key={v.id}
                onClick={() => onSelectVersion?.(v.id)}
                disabled={!onSelectVersion || isActive}
                title={v.versionSummary
                  ? `${v.versionLabel} — ${v.versionSummary}${isCurrent ? " · current" : ""}`
                  : `${v.versionLabel}${isCurrent ? " · current" : " · snapshot"}`}
                style={{
                  padding: "1px 10px", borderRadius: 100,
                  border: isActive
                    ? `1px solid ${isCurrent ? "#15803d" : "var(--accent)"}`
                    : "1px solid var(--border)",
                  background: isActive
                    ? (isCurrent ? "rgba(34,197,94,0.10)" : "var(--accent-soft)")
                    : (isCurrent ? "rgba(34,197,94,0.04)" : "var(--bg)"),
                  color: isCurrent ? "#15803d" : "var(--text-secondary)",
                  fontSize: 11, fontWeight: 600,
                  cursor: isActive || !onSelectVersion ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {v.versionLabel}{isCurrent ? " · current" : ""}
              </button>
            );
          })}
        </div>
        {release.versionSummary && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            — {release.versionSummary}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => {
            const summary = window.prompt(
              `Short note for the new version (what's changing in this draft?)`,
              "",
            );
            if (summary === null) return; // user cancelled
            const newId = cloneRelease(release.id, { summary: summary.trim() || undefined });
            onSelectVersion?.(newId);
          }}
          title={isLatestInFamily
            ? "Create a new version of this milestone (clones scope as a starting point; lineage preserved)"
            : `Create a new version from this snapshot (${release.versionLabel}) — current ${familyVersions[familyVersions.length - 1].versionLabel} is left untouched`}
          style={{
            padding: "3px 10px", borderRadius: 100,
            background: "var(--bg)", border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontSize: 11, fontWeight: 500, cursor: "pointer",
          }}
        >
          {isLatestInFamily ? "+ New version" : `+ New version from ${release.versionLabel}`}
        </button>
      </div>

      {/* Snapshot banner — only when viewing a non-current version. The
          spec calls this out explicitly: older versions are historical
          snapshots, not edit targets. The header chrome above already
          locks Configure / Delete / inline edits; this banner makes the
          state visible. */}
      {!isLatestInFamily && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px",
          borderRadius: "var(--radius)",
          background: "var(--bg-sunken)",
          border: "1px dashed var(--border-strong)",
          color: "var(--text-secondary)",
          fontSize: 12, lineHeight: 1.5,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
            textTransform: "uppercase", color: "#b45309",
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.45)",
            borderRadius: 100, padding: "1px 8px",
            whiteSpace: "nowrap",
          }}>
            Viewing {release.versionLabel} snapshot
          </span>
          <span style={{ flex: 1 }}>
            This version is a historical snapshot — read-only. To evolve it,
            create a new version from this snapshot (the current version stays unchanged).
          </span>
        </div>
      )}

      {/* Header — full-width milestone summary. Title + status pill +
          target date + delete sit on one row; the description sits
          below. Reads as the milestone's "identity row" instead of a
          stack of cramped inputs. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => {
                const next = titleDraft.trim() || release.title;
                if (next !== release.title) {
                  updateRelease(release.id, { title: next });
                  recordMilestoneAudit(release.id, `Renamed to "${next}"`, {
                    kind: "renamed",
                    previousValue: release.title,
                    nextValue: next,
                  });
                }
                setEditingTitle(false);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const next = titleDraft.trim() || release.title;
                  if (next !== release.title) {
                    updateRelease(release.id, { title: next });
                    recordMilestoneAudit(release.id, `Renamed to "${next}"`, {
                      kind: "renamed",
                      previousValue: release.title,
                      nextValue: next,
                    });
                  }
                  setEditingTitle(false);
                }
                else if (e.key === "Escape") { setTitleDraft(release.title); setEditingTitle(false); }
              }}
              style={{
                flex: 1, minWidth: 240,
                fontSize: 20, fontWeight: 600, color: "var(--text)",
                border: "1px solid var(--accent)", borderRadius: "var(--radius)",
                padding: "5px 10px", background: "var(--bg)", outline: "none",
              }}
            />
          ) : (
            <h2
              onClick={() => { if (!isLatestInFamily) return; setTitleDraft(release.title); setEditingTitle(true); }}
              style={{ flex: 1, minWidth: 240, margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text)", cursor: isLatestInFamily ? "text" : "default", lineHeight: 1.25 }}
              title={isLatestInFamily ? "Click to rename" : "Snapshot — create a new version to edit"}
            >
              {release.title}
            </h2>
          )}
          <ReleaseStatusPicker
            status={release.status}
            onChange={(s) => {
              if (s === release.status) return;
              const prevLabel = RELEASE_STATUS_LABEL[release.status];
              const nextLabel = RELEASE_STATUS_LABEL[s];
              updateRelease(release.id, { status: s });
              recordMilestoneAudit(
                release.id,
                `Status changed from ${prevLabel} to ${nextLabel}`,
                { kind: "status_changed", previousValue: prevLabel, nextValue: nextLabel },
              );
            }}
          />
          {/* Target date / range — moved into the header row so the
              identity strip reads like "name · status · target". */}
          {editingDates ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <input
                type="date"
                value={startDraft}
                onChange={e => setStartDraft(e.target.value)}
                style={dateInputStyle()}
              />
              <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>—</span>
              <input
                type="date"
                value={endDraft}
                onChange={e => setEndDraft(e.target.value)}
                style={dateInputStyle()}
              />
              <button
                onClick={() => {
                  const nextStart = startDraft ? new Date(startDraft).toISOString() : undefined;
                  const nextEnd   = endDraft   ? new Date(endDraft).toISOString()   : undefined;
                  const prevLabel = formatReleaseTargetLabel(release.targetStart, release.targetEnd) ?? "no date";
                  const nextLabel = formatReleaseTargetLabel(nextStart, nextEnd) ?? "no date";
                  updateRelease(release.id, { targetStart: nextStart, targetEnd: nextEnd });
                  if (prevLabel !== nextLabel) {
                    recordMilestoneAudit(
                      release.id,
                      `Date changed from ${prevLabel} to ${nextLabel}`,
                      { kind: "date_changed", previousValue: prevLabel, nextValue: nextLabel },
                    );
                  }
                  setEditingDates(false);
                }}
                style={{
                  padding: "3px 10px", borderRadius: "var(--radius)",
                  background: "var(--accent)", color: "white",
                  border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer",
                }}
              >Save</button>
              <button
                onClick={() => {
                  setStartDraft(release.targetStart?.slice(0, 10) ?? "");
                  setEndDraft(release.targetEnd?.slice(0, 10) ?? "");
                  setEditingDates(false);
                }}
                style={{
                  padding: "3px 8px", borderRadius: "var(--radius)",
                  background: "transparent", color: "var(--text-secondary)",
                  border: "1px solid var(--border)", fontSize: 11, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { if (isLatestInFamily) setEditingDates(true); }}
              disabled={!isLatestInFamily}
              style={{
                padding: "4px 10px", borderRadius: "var(--radius)",
                background: "transparent",
                color: dateLabel ? "var(--text-secondary)" : "var(--text-tertiary)",
                border: isLatestInFamily ? "1px dashed var(--border-strong)" : "1px solid var(--border)",
                fontSize: 11, cursor: isLatestInFamily ? "pointer" : "default", whiteSpace: "nowrap",
              }}
              title={isLatestInFamily ? "Click to set a target date or range" : "Snapshot — create a new version to edit"}
            >
              {dateLabel ?? (isLatestInFamily ? "Set target date or range" : "No date")}
            </button>
          )}
          <button
            onClick={() => { if (window.confirm(`Delete milestone "${release.title}"? Linked objects stay where they are.`)) deleteRelease(release.id); }}
            aria-label="Delete milestone"
            title="Delete milestone"
            hidden={!isLatestInFamily}
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

        {/* Description — click to edit. Stays inside the header so the
            identity strip reads top-to-bottom: name → meta → context. */}
        <div>
          {editingDesc ? (
            <textarea
              autoFocus
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              onBlur={() => {
                const prev = release.description ?? "";
                const next = descDraft;
                if (next !== prev) {
                  updateRelease(release.id, { description: next });
                  const truncate = (s: string) => s.length > 80 ? s.slice(0, 77) + "…" : s;
                  recordMilestoneAudit(
                    release.id,
                    prev === "" ? "Description added" : next.trim() === "" ? "Description removed" : "Description updated",
                    {
                      kind: "description_changed",
                      previousValue: prev ? truncate(prev) : "",
                      nextValue: next ? truncate(next) : "",
                    },
                  );
                }
                setEditingDesc(false);
              }}
              rows={2}
              placeholder="Short description (optional)…"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "6px 10px",
                border: "1px solid var(--accent)", borderRadius: "var(--radius)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: "var(--fs-body)", lineHeight: 1.5, outline: "none",
                resize: "vertical",
              }}
            />
          ) : release.description ? (
            <button
              onClick={() => { if (!isLatestInFamily) return; setDescDraft(release.description ?? ""); setEditingDesc(true); }}
              style={{
                width: "100%", textAlign: "left",
                padding: "6px 10px", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", background: "var(--bg-sunken)",
                color: "var(--text-secondary)", fontSize: "var(--fs-body)", lineHeight: 1.5,
                cursor: isLatestInFamily ? "text" : "default",
              }}
              title={isLatestInFamily ? "Click to edit description" : "Snapshot — create a new version to edit"}
            >
              {release.description}
            </button>
          ) : isLatestInFamily ? (
            <button
              onClick={() => { setDescDraft(""); setEditingDesc(true); }}
              style={{
                padding: "3px 8px", fontSize: 11, color: "var(--text-tertiary)",
                background: "transparent", border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
              }}
            >
              + Add description
            </button>
          ) : null}
        </div>
      </div>

      {/* 2-column body — MoSCoW scope (main) on the left, side panel
          (related goals + search hints) on the right. Always rendered
          so historical snapshots show the same structure as the
          current version. */}
      <div style={{
        display: "flex", gap: 16, alignItems: "flex-start",
        flexWrap: "wrap",
      }}>
        {/* LEFT — Product scope with MoSCoW grouping. flex:2 with a
            generous min-width so the cards/rows breathe. */}
        <div style={{ flex: "2 1 540px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: 10,
            padding: "12px 14px", borderRadius: "var(--radius)",
            background: "var(--bg-sunken)", border: "1px solid var(--border)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text)" }}>
                Product scope
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                · {productLinks.length} item{productLinks.length === 1 ? "" : "s"} · MoSCoW is per milestone
              </span>
              <span style={{ flex: 1 }} />
              <MilestoneProductAutosuggest release={release} />
            </div>

            {productLinks.length === 0 && (
              <div style={{
                fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.55,
                padding: "10px 2px",
              }}>
                No product scope yet. Use the search above to add Capability Areas, Feature Sets, Features, Feature Slices, or Capabilities. Higher-level objects like Feature Sets are useful when the exact slices aren't known yet — a Must-have Feature Set means "a shippable version of this area," not "every child slice is required." Each new link starts as Must-have and can be demoted inline.
              </div>
            )}

            {/* Four MoSCoW buckets, stacked. */}
            {(["must", "should", "could", "wont"] as MoscowPriority[]).map(p => {
              const rows = byPriority[p];
              return (
                <MoscowGroup
                  key={p}
                  priority={p}
                  rows={rows}
                  onChangePriority={(row, next) => {
                    if (row.priority === next) return;
                    const objectLabel = `${MILESTONE_OBJECT_KIND_LABEL[row.kind]} · ${row.title}`;
                    setMilestoneObjectPriority(release.id, row.kind, row.objectId, next);
                    recordMilestoneAudit(
                      release.id,
                      `Moved ${objectLabel} from ${moscowAuditLabel(row.priority)} to ${moscowAuditLabel(next)}`,
                      {
                        kind: "moscow_changed",
                        objectLabel,
                        previousValue: moscowFullLabel(row.priority),
                        nextValue: moscowFullLabel(next),
                      },
                    );
                  }}
                  onChangeNote={(row, next) => {
                    const prev = row.note ?? "";
                    if (next === prev) return;
                    const objectLabel = `${MILESTONE_OBJECT_KIND_LABEL[row.kind]} · ${row.title}`;
                    setMilestoneObjectNote(release.id, row.kind, row.objectId, next);
                    const verb = prev === "" ? "Added note on" : next.trim() === "" ? "Removed note from" : "Updated note on";
                    const truncate = (s: string) => s.length > 60 ? s.slice(0, 57) + "…" : s;
                    recordMilestoneAudit(
                      release.id,
                      `${verb} ${objectLabel}`,
                      {
                        kind: "note_changed",
                        objectLabel,
                        previousValue: prev ? truncate(prev) : "",
                        nextValue: next ? truncate(next) : "",
                      },
                    );
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* RIGHT — Side panel with milestone "why" + add affordances. */}
        <aside style={{ flex: "1 1 320px", minWidth: 280, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: 6,
            padding: "12px 14px", borderRadius: "var(--radius)",
            background: "var(--bg)", border: "1px solid var(--border)",
          }}>
            <LinkedSection
              title="Related weekly goals"
              items={linkedGoals.map(g => ({
                id: g.id, label: g.title,
                right: <span style={subtleParentPill()}>{g.weekLabel}</span>,
                onOpen: () => setRoadmapFocus({ tab: "weekly", goalId: g.id }),
              }))}
              addPicker={
                <GoalPicker
                  value={release.linkedGoalIds}
                  onToggle={(id) => {
                    const goal = weeklyGoals.find(g => g.id === id);
                    const wasLinked = release.linkedGoalIds.includes(id);
                    toggleReleaseGoal(release.id, id);
                    if (goal) {
                      recordMilestoneAudit(
                        release.id,
                        `${wasLinked ? "Unlinked" : "Linked"} weekly goal · ${goal.title}`,
                        {
                          kind: wasLinked ? "goal_unlinked" : "goal_linked",
                          objectLabel: `Weekly Goal · ${goal.title}`,
                        },
                      );
                    }
                  }}
                />
              }
              emptyHint="No weekly goals related to this milestone yet."
            />
          </div>

          {/* Tiny helper card — explains what the MoSCoW levels mean,
              kept in the side panel so the main scope area doesn't
              carry it on every milestone. */}
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius)",
            background: "var(--bg-sunken)", border: "1px dashed var(--border)",
            fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.55,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 4 }}>
              MoSCoW reminder
            </div>
            <div><strong style={{ color: "#15803d" }}>Must-have</strong> — required to ship the milestone.</div>
            <div><strong style={{ color: "#1d4ed8" }}>Should-have</strong> — helpful but not blocking.</div>
            <div><strong style={{ color: "#b45309" }}>Could-have</strong> — nice if time allows.</div>
            <div><strong style={{ color: "var(--text-secondary)" }}>Won't-have</strong> — explicitly out of scope.</div>
          </div>
        </aside>
      </div>

      {/* Change history — audit log of every recorded mutation on this
          version. Most-recent first; the very first row of every
          milestone is the "Created milestone" entry, so the log is
          never empty. */}
      {release.auditLog.length > 0 && (
        <MilestoneAuditLog log={release.auditLog} versionLabel={release.versionLabel} />
      )}

      {/* Theme tags — overlay row. Hidden while THEMES_ENABLED is false. */}
      {THEMES_ENABLED && (
        <ThemeRefList
          themeIds={themeIdsForRelease}
          onPick={(themeId) => toggleThemeRelease(themeId, release.id)}
          pickerSelected={themeIdsForRelease}
        />
      )}
    </div>
  );
}

// ── MilestoneReviewSummary ─────────────────────────────────────────────
// Compact, content-first body shown when ReleaseCard is in Review mode.
// Mirrors the Weekly Goal Review summary pattern — top labels are tiny
// & uppercase, the actual content reads first. Reads top to bottom:
//   • Scope summary  — one line, e.g. "12 items · 6 Must · 4 Should · 2 Could"
//   • MoSCoW excerpt — one row per non-empty priority, first 3 items
//                       per row + "+N more" overflow
//   • Goals          — read-only list of related weekly goals
// All clicks fall through to the parent ("open this goal", "open
// Configure to edit"). No pickers, no inputs.
function MilestoneReviewSummary({
  release, productLinks, byPriority, linkedGoals,
  onOpenConfigure, onOpenGoal,
}: {
  release: Release;
  productLinks: MilestoneRow[];
  byPriority: Record<MoscowPriority, MilestoneRow[]>;
  linkedGoals: WeeklyGoal[];
  onOpenConfigure: () => void;
  onOpenGoal: (id: string) => void;
}) {
  const counts: Record<MoscowPriority, number> = {
    must:   byPriority.must.length,
    should: byPriority.should.length,
    could:  byPriority.could.length,
    wont:   byPriority.wont.length,
  };
  const totalScope = productLinks.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* SCOPE ROW — counts + click-to-edit hint when empty */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={reviewLabelStyle()}>Scope</span>
        {totalScope === 0 ? (
          <span style={reviewSecondaryStyle()}>
            No product scope yet ·{" "}
            <button
              onClick={onOpenConfigure}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", fontSize: "inherit", cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              add some
            </button>
          </span>
        ) : (
          <>
            <span style={{ fontSize: "var(--fs-body)", color: "var(--text)", lineHeight: 1.5 }}>
              {totalScope} item{totalScope === 1 ? "" : "s"}
              {(["must", "should", "could", "wont"] as MoscowPriority[]).map(p =>
                counts[p] > 0
                  ? ` · ${counts[p]} ${moscowAuditLabel(p)}`
                  : "",
              ).join("")}
            </span>
            {/* MoSCoW excerpts — one row per non-empty priority. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              {(["must", "should", "could", "wont"] as MoscowPriority[]).map(p => {
                const rows = byPriority[p];
                if (rows.length === 0) return null;
                const head = rows.slice(0, 3);
                const more = rows.length - head.length;
                return (
                  <div
                    key={p}
                    style={{
                      display: "flex", alignItems: "baseline",
                      gap: 6, flexWrap: "wrap",
                      fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5,
                    }}
                  >
                    <span style={compactMoscowCountPill(p)}>
                      {moscowAuditLabel(p)}
                    </span>
                    {head.map((r, i) => (
                      <React.Fragment key={`${r.kind}:${r.objectId}`}>
                        {i > 0 && <span style={{ color: "var(--text-tertiary)" }}>·</span>}
                        <button
                          onClick={() => r.onOpen?.()}
                          title={`${MILESTONE_OBJECT_KIND_LABEL[r.kind]} · ${r.title}`}
                          style={{
                            background: "transparent", border: "none", padding: 0,
                            color: "var(--text)", fontSize: "inherit", cursor: r.onOpen ? "pointer" : "default",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginRight: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
                            {MILESTONE_OBJECT_KIND_LABEL[r.kind]}
                          </span>
                          {r.title}
                          {r.parentTitle && (
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                              {" "}· {r.parentTitle}
                            </span>
                          )}
                        </button>
                      </React.Fragment>
                    ))}
                    {more > 0 && (
                      <button
                        onClick={onOpenConfigure}
                        style={{
                          background: "transparent", border: "none", padding: 0,
                          color: "var(--text-tertiary)", fontSize: "inherit", cursor: "pointer",
                          textDecoration: "underline",
                        }}
                        title="Open Configure to see all scope items"
                      >
                        +{more} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RELATED GOALS — read-only list. Click jumps to Weekly Goals. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={reviewLabelStyle()}>Related weekly goals</span>
        {linkedGoals.length === 0 ? (
          <span style={reviewSecondaryStyle()}>None linked yet</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {linkedGoals.map(g => (
              <button
                key={g.id}
                onClick={() => onOpenGoal(g.id)}
                title={`Open weekly goal · ${g.title}`}
                style={{
                  padding: "3px 9px", borderRadius: 100,
                  background: "var(--bg-sunken)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.4,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {g.title}
                <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>{g.weekLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Read-only milestone description repeat — suppressed: the
          description already shows above the Review block in the
          header, and we don't want to double-print it here. */}
    </div>
  );
}

// ── MilestoneAuditLog ───────────────────────────────────────────────────
// Append-only change history list. Most-recent first; the timestamp on
// each line is relative ("3 days ago") to keep the strip scannable
// without a long ISO running down the column. Collapsed by default to
// the latest 6 entries — older entries reveal on demand so a heavily
// edited milestone doesn't dominate the card.
function MilestoneAuditLog({ log, versionLabel }: { log: MilestoneAuditEntry[]; versionLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  // Most-recent first, immutable copy.
  const ordered = log.slice().sort((a, b) => b.at.localeCompare(a.at));
  const visible = expanded ? ordered : ordered.slice(0, 6);
  const hidden = ordered.length - visible.length;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 12px", borderRadius: "var(--radius)",
      background: "var(--bg-sunken)", border: "1px dashed var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
        }}>
          Change history · {versionLabel}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
          {ordered.length} entr{ordered.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map(e => (
          <AuditLogRow key={e.id} entry={e} />
        ))}
      </div>
      {hidden > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            alignSelf: "flex-start",
            background: "transparent", border: "none", padding: 0,
            color: "var(--text-tertiary)", fontSize: 10.5, cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Show {hidden} older
        </button>
      )}
      {expanded && ordered.length > 6 && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            alignSelf: "flex-start",
            background: "transparent", border: "none", padding: 0,
            color: "var(--text-tertiary)", fontSize: 10.5, cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

// ── AuditLogRow ─────────────────────────────────────────────────────────
// Single audit-log row. Renders the structured "what · object · before
// → after" layout when the entry has a `kind`; falls back to plain
// summary text for legacy entries that pre-date the structured shape.
function AuditLogRow({ entry }: { entry: MilestoneAuditEntry }) {
  const stamp = (
    <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap", fontSize: 10.5, minWidth: 70 }}>
      {formatRelativeShort(entry.at)}
    </span>
  );
  // Legacy path — no structured kind; just the summary string.
  if (!entry.kind) {
    return (
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45,
      }}>
        {stamp}
        <span>{entry.summary}</span>
      </div>
    );
  }

  // Structured path — verb on row 1, object on row 2, before → after
  // on row 3 (rows 2 and 3 only render when their fields are present).
  const verbLabel = auditKindVerb(entry.kind);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      {stamp}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>
          {verbLabel}
        </div>
        {entry.objectLabel && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {entry.objectLabel}
          </div>
        )}
        {(entry.previousValue || entry.nextValue) && (
          <div style={{
            display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap",
            fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4,
          }}>
            {entry.previousValue ? (
              <span style={{
                color: "var(--text-tertiary)",
                textDecoration: entry.kind === "moscow_changed" || entry.kind === "status_changed" || entry.kind === "renamed" || entry.kind === "date_changed" ? "line-through" : undefined,
              }}>
                {entry.previousValue}
              </span>
            ) : (
              <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>(unset)</span>
            )}
            <span style={{ color: "var(--text-tertiary)" }}>→</span>
            {entry.nextValue ? (
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{entry.nextValue}</span>
            ) : (
              <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>(unset)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Human-readable verb label for each MilestoneAuditKind. Lives next to
// the row renderer so adding a new kind requires updating both in the
// same patch.
function auditKindVerb(k: MilestoneAuditKind): string {
  switch (k) {
    case "created":             return "Milestone created";
    case "cloned_from":         return "Version created from earlier snapshot";
    case "cloned_to":           return "Cloned to new version";
    case "renamed":             return "Renamed";
    case "description_changed": return "Description changed";
    case "status_changed":      return "Status changed";
    case "date_changed":        return "Date changed";
    case "scope_added":         return "Product scope added";
    case "scope_removed":       return "Product scope removed";
    case "moscow_changed":      return "MoSCoW changed";
    case "note_changed":        return "Note changed";
    case "goal_linked":         return "Weekly goal linked";
    case "goal_unlinked":       return "Weekly goal unlinked";
  }
}

// Audit summary label for a MoSCoW priority — "Must" / "Should" / "Could"
// / "Won't". Kept as a separate helper so future audit summaries don't
// each re-implement the label-format inline.
function moscowAuditLabel(p: MoscowPriority): string {
  return p === "must" ? "Must" : p === "should" ? "Should" : p === "could" ? "Could" : "Won't";
}
// Full audit label for structured before/after pairs — uses the same
// long form ("Must-have", "Should-have", …) the user sees on rows so
// the change history reads identically to the UI labels.
function moscowFullLabel(p: MoscowPriority): string {
  return MOSCOW_LABEL[p];
}

// Short relative timestamp used in the audit log — "just now", "12m",
// "3h", "2d", "Mar 14". No external lib — milestones are short-lived
// and the audit log only needs to be readable, not exact.
function formatRelativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ReleaseStatusPicker({
  status, onChange,
}: {
  status: ReleaseStatus;
  onChange: (s: ReleaseStatus) => void;
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
      <button onClick={() => setOpen(o => !o)} style={releasePillStyle(status)}>
        {RELEASE_STATUS_LABEL[status]} <ChevronDown size={9} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 150, background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {(["planned", "in_progress", "released"] as ReleaseStatus[]).map(s => (
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
              <span style={releasePillStyle(s)}>{RELEASE_STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function dateInputStyle(): React.CSSProperties {
  return {
    padding: "3px 6px",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    background: "var(--bg)", color: "var(--text)",
    fontSize: 11, outline: "none",
  };
}

// "Aug 5, 2026" / "Aug 5 — Aug 19, 2026" / null when both empty.
function formatReleaseTargetLabel(startISO?: string, endISO?: string): string | null {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  if (startISO && endISO) {
    const startShort = new Date(startISO).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${startShort} — ${fmt(endISO)}`;
  }
  if (startISO) return `From ${fmt(startISO)}`;
  if (endISO)   return `By ${fmt(endISO)}`;
  return null;
}

// ── Cross-references: "Included in releases" badges ────────────────────
// Read-only helper used on Weekly Goal cards + Slice cards. Each pill is
// clickable and jumps to the Releases tab (we don't yet support
// focused-release scroll, but landing on the tab makes the package
// visible). Keeps the cross-reference one component / one import.

function ReleaseRefList({
  releaseIds,
  label,
}: {
  releaseIds: string[];
  // Customisable label — defaults to "Included in milestones" so slice
  // cards / feature details read naturally, but goal cards override it
  // to "Linked milestone" / "Linked milestones" per V1 vocabulary.
  label?: string;
}) {
  const { releases, setRoadmapFocus } = useStore();
  if (releaseIds.length === 0) return null;
  const linked = releases.filter(r => releaseIds.includes(r.id));
  if (linked.length === 0) return null;
  const resolvedLabel = label ?? (linked.length === 1 ? "Linked milestone" : "Linked milestones");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
        {resolvedLabel}
      </span>
      {linked.map(r => (
        <button
          key={r.id}
          onClick={() => setRoadmapFocus({ tab: "releases" })}
          style={{
            fontSize: 10.5, fontWeight: 500,
            color: "var(--text-secondary)",
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            borderRadius: 100, padding: "1px 8px",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-sunken)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          title={`${r.title} · ${RELEASE_STATUS_LABEL[r.status]} — open the Milestones tab`}
        >
          {r.title}
        </button>
      ))}
    </div>
  );
}

// ── Themes — overlay tags across the entire roadmap ──────────────────────
// A theme is NOT a hierarchy node. It cannot own anything. It only
// collects pointers across goals / intents / features / slices /
// capabilities / releases so the team can read a cross-cutting slice of
// the roadmap (e.g. "everything Auth-readiness related"). The same
// object can wear many themes.

// Fixed palette. Each entry maps a ThemeColor key to the three CSS
// values we need for a chip. Sticks to the same hues used elsewhere in
// the app so themes feel familiar.
const THEME_PALETTE: Record<RoadmapThemeColor, { bg: string; fg: string; bd: string }> = {
  blue:   { bg: "rgba(59,130,246,0.12)",  fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
  amber:  { bg: "rgba(245,158,11,0.12)",  fg: "#b45309", bd: "rgba(245,158,11,0.45)" },
  green:  { bg: "rgba(34,197,94,0.12)",   fg: "#15803d", bd: "rgba(34,197,94,0.45)" },
  purple: { bg: "rgba(168,85,247,0.12)",  fg: "#7e22ce", bd: "rgba(168,85,247,0.45)" },
  pink:   { bg: "rgba(236,72,153,0.12)",  fg: "#be185d", bd: "rgba(236,72,153,0.45)" },
  teal:   { bg: "rgba(20,184,166,0.12)",  fg: "#0f766e", bd: "rgba(20,184,166,0.45)" },
  gray:   { bg: "var(--bg-sunken)",       fg: "var(--text-secondary)", bd: "var(--border)" },
};
const THEME_COLOR_KEYS: RoadmapThemeColor[] = ["blue", "amber", "green", "purple", "pink", "teal", "gray"];

function themePillStyle(color: RoadmapThemeColor | undefined): React.CSSProperties {
  const p = THEME_PALETTE[color ?? "gray"];
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "1px 8px", borderRadius: 100,
    background: p.bg, color: p.fg,
    border: `1px solid ${p.bd}`,
    fontSize: 10.5, fontWeight: 500,
    whiteSpace: "nowrap",
  };
}

// Small reusable theme pill. Always read-only / display; toggling
// happens via ThemePicker on the owner card or in the Themes tab.
function ThemePill({ theme, onClick }: { theme: RoadmapTheme; onClick?: () => void }) {
  const style = themePillStyle(theme.color);
  return onClick ? (
    <button
      onClick={onClick}
      title={theme.description ? `${theme.title} — ${theme.description}` : theme.title}
      style={{ ...style, cursor: "pointer", border: style.border }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "currentColor", opacity: 0.7 }} />
      {theme.title}
    </button>
  ) : (
    <span title={theme.description ? `${theme.title} — ${theme.description}` : theme.title} style={style}>
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "currentColor", opacity: 0.7 }} />
      {theme.title}
    </span>
  );
}

// ThemeRefList — read-only "Themes: blue-pill · amber-pill" row that
// surfaces on owner cards (goal, slice, release, feature detail). Each
// pill is clickable and switches the Roadmap to the Themes tab focused
// on that theme. Includes a tiny "+ Theme" affordance that opens an
// inline picker so the user can attach/detach from the card directly.
function ThemeRefList({
  themeIds,
  onPick,           // null disables the "+ Theme" picker
  pickerSelected,   // ids currently selected — for the picker UI
}: {
  themeIds: string[];
  onPick?: (themeId: string) => void;
  pickerSelected?: string[];
}) {
  const { themes, setRoadmapFocus } = useStore();
  const linked = themes.filter(t => themeIds.includes(t.id));
  if (linked.length === 0 && !onPick) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        Themes
      </span>
      {linked.map(t => (
        <ThemePill
          key={t.id}
          theme={t}
          onClick={() => setRoadmapFocus({ tab: "themes", themeId: t.id })}
        />
      ))}
      {onPick && (
        <ThemePicker
          selectedIds={pickerSelected ?? themeIds}
          onToggle={onPick}
        />
      )}
    </div>
  );
}

// ThemePicker — small popover for attaching/detaching themes from an
// object. Reuses the same visual language as the other pickers but with
// the colored theme pills inline.
function ThemePicker({
  selectedIds, onToggle,
}: {
  selectedIds: string[];
  onToggle: (themeId: string) => void;
}) {
  const { themes, createTheme } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const handleCreate = () => {
    const title = draft.trim();
    if (!title) return;
    const id = createTheme({ title });
    onToggle(id);
    setDraft("");
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Add a theme"
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "1px 8px", borderRadius: 100,
          border: "1px dashed var(--border-strong)",
          background: "transparent", color: "var(--text-tertiary)",
          fontSize: 10.5, fontWeight: 500, cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
      >
        <Plus size={10} /> Theme
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 280, maxHeight: 320, display: "flex", flexDirection: "column",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Tag with theme
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {themes.length === 0 ? (
              <div style={{ padding: 12, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textAlign: "center" }}>
                No themes yet — create one below.
              </div>
            ) : themes.map(t => {
              const sel = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onToggle(t.id)}
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
                  <ThemePill theme={t} />
                </button>
              );
            })}
          </div>
          {/* Inline "create new theme" row at the bottom — the
              nice-to-have lets the user spin up a theme from any card. */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderTop: "1px solid var(--border)",
            background: "var(--bg-sunken)",
          }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              placeholder="+ Create new theme…"
              style={{
                flex: 1, padding: "3px 6px",
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: 11, outline: "none",
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!draft.trim()}
              style={{
                padding: "3px 10px", borderRadius: "var(--radius)",
                background: draft.trim() ? "var(--accent)" : "var(--bg-sunken)",
                color: draft.trim() ? "white" : "var(--text-tertiary)",
                border: "none", fontSize: 11, fontWeight: 500,
                cursor: draft.trim() ? "pointer" : "not-allowed",
              }}
            >Create</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ThemesView — main tab ───────────────────────────────────────────────
function ThemesView() {
  const { themes, createTheme, roadmapFocus, setRoadmapFocus } = useStore();
  // Selected theme — left rail picks, right pane shows detail. Defaults
  // to the first theme so the demo lands populated.
  const [selectedId, setSelectedId] = useState<string | null>(() => themes[0]?.id ?? null);
  // Re-resolve if the selected theme got deleted.
  React.useEffect(() => {
    if (selectedId && !themes.some(t => t.id === selectedId)) {
      setSelectedId(themes[0]?.id ?? null);
    }
  }, [themes, selectedId]);
  // Honour incoming cross-tab focus: when a ThemePill elsewhere asks
  // the Themes tab to land on a specific theme, select it.
  React.useEffect(() => {
    if (roadmapFocus?.tab === "themes" && roadmapFocus.themeId) {
      setSelectedId(roadmapFocus.themeId);
      setRoadmapFocus(null);
    }
  }, [roadmapFocus, setRoadmapFocus]);

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left rail — list of themes */}
      <aside style={{
        width: 280, flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg)",
        overflowY: "auto",
        padding: "12px 12px 20px",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
          marginBottom: 2,
        }}>
          All themes · {themes.length}
        </div>
        <button
          onClick={() => {
            const id = createTheme({ title: "Untitled theme" });
            setSelectedId(id);
          }}
          style={{
            padding: "5px 10px",
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--radius)",
            background: "transparent",
            color: "var(--text-tertiary)",
            fontSize: 11, fontWeight: 500, cursor: "pointer",
            textAlign: "left",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          + New theme
        </button>
        {themes.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, marginTop: 6 }}>
            Themes overlay the roadmap — they don't change the hierarchy. Use them to group cross-cutting work like &ldquo;Auth readiness&rdquo; or &ldquo;Performance Q3&rdquo;.
          </div>
        ) : themes.map(t => {
          const isSel = selectedId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 8px", borderRadius: "var(--radius)",
                background: isSel ? "var(--accent-soft)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
            >
              <ThemePill theme={t} />
            </button>
          );
        })}
      </aside>

      {/* Right pane — selected theme detail */}
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 24px" }}>
        {selectedId ? (
          <ThemeDetailPane themeId={selectedId} />
        ) : (
          <div style={{
            margin: "60px auto", maxWidth: 360, textAlign: "center",
            fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
          }}>
            Pick a theme on the left, or click <strong style={{ color: "var(--text)" }}>+ New theme</strong> to add one. Themes overlay the roadmap — they never change the hierarchy.
          </div>
        )}
      </main>
    </div>
  );
}

// ── ThemeDetailPane ─────────────────────────────────────────────────────
function ThemeDetailPane({ themeId }: { themeId: string }) {
  const {
    themes, weeklyGoals, wipItems, features, featureSlices, productCapabilities, releases,
    updateTheme, deleteTheme,
    toggleThemeGoal, toggleThemeIntent, toggleThemeFeature, toggleThemeSlice, toggleThemeCapability, toggleThemeRelease,
    setRoadmapFocus, setRoute, openWip,
  } = useStore();
  const theme = themes.find(t => t.id === themeId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(theme?.title ?? "");
  const [descDraft, setDescDraft]   = useState(theme?.description ?? "");
  React.useEffect(() => {
    setTitleDraft(theme?.title ?? "");
    setDescDraft(theme?.description ?? "");
  }, [themeId, theme?.title, theme?.description]);
  if (!theme) return null;

  const linkedGoals    = weeklyGoals.filter(g => theme.linkedGoalIds.includes(g.id));
  const linkedIntents  = wipItems.filter(w => w.type === "intent" && theme.linkedIntentIds.includes(w.id));
  const linkedFeatures = features.filter(f => theme.linkedFeatureIds.includes(f.id));
  const linkedSlices   = featureSlices.filter(s => theme.linkedSliceIds.includes(s.id));
  const linkedCaps     = productCapabilities.filter(c => theme.linkedCapabilityIds.includes(c.id));
  const linkedReleases = releases.filter(r => theme.linkedReleaseIds.includes(r.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      {/* Header — pill + title + status helpers + delete */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ThemePill theme={theme} />
            <ThemeColorPicker
              color={theme.color}
              onChange={(c) => updateTheme(theme.id, { color: c })}
            />
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => { updateTheme(theme.id, { title: titleDraft.trim() || theme.title }); setEditingTitle(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") { updateTheme(theme.id, { title: titleDraft.trim() || theme.title }); setEditingTitle(false); }
                else if (e.key === "Escape") { setTitleDraft(theme.title); setEditingTitle(false); }
              }}
              style={{
                fontSize: 20, fontWeight: 600, color: "var(--text)",
                border: "1px solid var(--accent)", borderRadius: "var(--radius)",
                padding: "4px 8px", background: "var(--bg)", outline: "none",
              }}
            />
          ) : (
            <h2
              onClick={() => { setTitleDraft(theme.title); setEditingTitle(true); }}
              style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text)", cursor: "text", lineHeight: 1.25 }}
              title="Click to rename"
            >
              {theme.title}
            </h2>
          )}
          <textarea
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={() => updateTheme(theme.id, { description: descDraft })}
            rows={2}
            placeholder="What does this theme group together?"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 9px",
              border: "1px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", lineHeight: 1.5, outline: "none",
              resize: "vertical",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlurCapture={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        <button
          onClick={() => { if (window.confirm(`Delete theme "${theme.title}"? Linked objects stay where they are.`)) deleteTheme(theme.id); }}
          aria-label="Delete theme"
          title="Delete theme"
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

      {/* Linked goals */}
      <LinkedSection
        title="Linked goals"
        items={linkedGoals.map(g => ({
          id: g.id, label: g.title,
          right: <span style={subtleParentPill()}>{g.weekLabel}</span>,
          onOpen: () => setRoadmapFocus({ tab: "weekly", goalId: g.id }),
        }))}
        addPicker={
          <GoalPicker
            value={theme.linkedGoalIds}
            onToggle={(id) => toggleThemeGoal(theme.id, id)}
          />
        }
        emptyHint="No goals tagged with this theme yet."
      />

      {/* Linked product work — features, slices, capabilities together
          since the spec calls them out as one block. */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: "var(--text-tertiary)",
          marginBottom: 6,
        }}>
          Linked product work · {linkedFeatures.length + linkedSlices.length + linkedCaps.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LinkedSection
            title="Features"
            items={linkedFeatures.map(f => ({
              id: f.id, label: f.title,
              onOpen: () => setRoadmapFocus({ tab: "product", featureId: f.id }),
            }))}
            addPicker={
              <FeaturePicker
                value={theme.linkedFeatureIds}
                onToggle={(id) => toggleThemeFeature(theme.id, id)}
              />
            }
            emptyHint="No features tagged yet."
          />
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
                value={theme.linkedSliceIds}
                onToggle={(id) => toggleThemeSlice(theme.id, id)}
              />
            }
            emptyHint="No feature slices tagged yet."
          />
          <LinkedSection
            title="Product capabilities"
            items={linkedCaps.map(c => {
              const parent = features.find(f => f.id === c.featureId);
              return {
                id: c.id, label: c.title,
                right: parent ? <span style={subtleParentPill()}>{parent.title}</span> : undefined,
                onOpen: () => setRoadmapFocus({ tab: "product", featureId: c.featureId }),
              };
            })}
            addPicker={
              <CapabilityPicker
                value={theme.linkedCapabilityIds}
                onToggle={(id) => toggleThemeCapability(theme.id, id)}
              />
            }
            emptyHint="No capabilities tagged yet."
          />
        </div>
      </div>

      {/* Linked intents */}
      <LinkedSection
        title="Linked intents"
        items={linkedIntents.map(w => ({
          id: w.id, label: w.title,
          onOpen: () => { setRoute("wip"); openWip(w.id); },
        }))}
        addPicker={
          <IntentPicker
            value={theme.linkedIntentIds}
            onToggle={(id) => toggleThemeIntent(theme.id, id)}
          />
        }
        emptyHint="No intents tagged yet."
      />

      {/* Linked milestones */}
      <LinkedSection
        title="Linked milestones"
        items={linkedReleases.map(r => ({
          id: r.id, label: r.title,
          right: <span style={subtleParentPill()}>{r.status === "in_progress" ? "In Progress" : r.status === "released" ? "Released" : "Planned"}</span>,
          onOpen: () => setRoadmapFocus({ tab: "releases" }),
        }))}
        addPicker={
          <ReleasePicker
            value={theme.linkedReleaseIds}
            onToggle={(id) => toggleThemeRelease(theme.id, id)}
          />
        }
        emptyHint="No milestones tagged yet."
      />
    </div>
  );
}

// Picker over all releases.
function ReleasePicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { releases } = useStore();
  const options = releases.map(r => ({
    id: r.id, label: r.title,
    subtitle: r.status === "in_progress" ? "In Progress" : r.status === "released" ? "Released" : "Planned",
  }));
  return <PickerPopover label="Link milestone" options={options} value={value} onToggle={onToggle} />;
}

function ThemeColorPicker({
  color, onChange,
}: {
  color: RoadmapThemeColor | undefined;
  onChange: (c: RoadmapThemeColor) => void;
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
        title="Change theme color"
        style={{
          padding: "2px 8px", borderRadius: 100,
          border: "1px dashed var(--border-strong)",
          background: "transparent", color: "var(--text-tertiary)",
          fontSize: 10.5, fontWeight: 500, cursor: "pointer",
        }}
      >
        Color
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          padding: 6, gap: 4,
          display: "grid", gridTemplateColumns: "repeat(7, 18px)",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        }}>
          {THEME_COLOR_KEYS.map(c => {
            const p = THEME_PALETTE[c];
            const isSel = color === c || (!color && c === "gray");
            return (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                title={c}
                style={{
                  width: 18, height: 18, borderRadius: 100,
                  background: p.bg,
                  border: isSel ? `2px solid ${p.fg}` : `1px solid ${p.bd}`,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MilestoneProductAutosuggest ─────────────────────────────────────────
// Unified search-and-add input for milestone product scope. Matches
// across all five product object kinds (Capability Area / Feature Set /
// Feature / Slice / Capability) so the user can stay on the Milestones
// tab while adding scope. Each result row shows its kind chip, title,
// parent hint, and a green "Already in milestone (Must-have)" pill if
// the milestone already contains it. Picking a result toggles the link
// — first click adds (default Must-have), second click removes.
function MilestoneProductAutosuggest({ release }: { release: Release }) {
  const {
    productAreas, featureGroups, features, featureSlices, productCapabilities,
    toggleReleaseArea, toggleReleaseFeatureGroup, toggleReleaseFeature,
    toggleReleaseSlice, toggleReleaseCapability,
    recordMilestoneAudit,
  } = useStore();
  // Log "Added <kind> · <title>" / "Removed <kind> · <title>" against
  // the milestone's audit log. Bundled here so the on-toggle callbacks
  // in the suggestion list stay one-liners.
  const auditToggle = (kind: MilestoneObjectKind, title: string, wasIn: boolean) => {
    const objectLabel = `${MILESTONE_OBJECT_KIND_LABEL[kind]} · ${title}`;
    recordMilestoneAudit(
      release.id,
      `${wasIn ? "Removed" : "Added"} ${objectLabel}`,
      {
        kind: wasIn ? "scope_removed" : "scope_added",
        objectLabel,
      },
    );
  };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Broad planning levels (Capability Area, Feature Set) are now
  // primary alongside Feature / Slice / Capability — milestone
  // planning often starts at a higher level (e.g. "Signal review
  // workflow as a Feature Set is Must-have") before the exact
  // slices/capabilities are known. Users can hide them again via the
  // footer checkbox when the scope is fully decomposed.
  const [showBroad, setShowBroad] = useState(true);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  type Suggestion = {
    kind: MilestoneObjectKind;
    objectId: string;
    title: string;
    subtitle?: string;       // parent context
    alreadyIn: boolean;      // is it already on this milestone?
    onToggle: () => void;    // add/remove on this milestone
    isBroad: boolean;        // capability area + feature set — labelled differently in the row
  };

  const normalized = query.trim().toLowerCase();
  const match = (title: string, subtitle?: string): boolean => {
    if (normalized === "") return true;
    if (title.toLowerCase().includes(normalized)) return true;
    if (subtitle && subtitle.toLowerCase().includes(normalized)) return true;
    return false;
  };

  // ── Primary suggestions: Feature → Slice → Capability. Order this way
  // so the most-specific objects (capabilities) surface last and the
  // most-common starting point (features) is first. Cap at 40 to keep
  // the popover navigable.
  const primary: Suggestion[] = [];
  features.forEach(f => {
    if (!match(f.title, f.description)) return;
    const area = productAreas.find(a => a.id === f.areaId)?.title;
    const group = featureGroups.find(gr => gr.id === f.featureGroupId)?.title;
    const subtitleParts = [area, group].filter(Boolean);
    primary.push({
      kind: "feature", objectId: f.id, title: f.title,
      subtitle: subtitleParts.length ? subtitleParts.join(" · ") : "Unassigned features",
      alreadyIn: release.linkedFeatureIds.includes(f.id),
      onToggle: () => {
        const wasIn = release.linkedFeatureIds.includes(f.id);
        toggleReleaseFeature(release.id, f.id);
        auditToggle("feature", f.title, wasIn);
      },
      isBroad: false,
    });
  });
  featureSlices.forEach(s => {
    if (!match(s.title, s.description)) return;
    const parent = features.find(f => f.id === s.featureId)?.title;
    primary.push({
      kind: "slice", objectId: s.id, title: s.title, subtitle: parent,
      alreadyIn: release.linkedSliceIds.includes(s.id),
      onToggle: () => {
        const wasIn = release.linkedSliceIds.includes(s.id);
        toggleReleaseSlice(release.id, s.id);
        auditToggle("slice", s.title, wasIn);
      },
      isBroad: false,
    });
  });
  productCapabilities.forEach(c => {
    if (!match(c.title)) return;
    const parent = features.find(f => f.id === c.featureId)?.title;
    primary.push({
      kind: "capability", objectId: c.id, title: c.title, subtitle: parent,
      alreadyIn: release.linkedCapabilityIds.includes(c.id),
      onToggle: () => {
        const wasIn = release.linkedCapabilityIds.includes(c.id);
        toggleReleaseCapability(release.id, c.id);
        auditToggle("capability", c.title, wasIn);
      },
      isBroad: false,
    });
  });

  // ── Broad planning levels: only built when the toggle is on. They
  // render after the primary list with a clear visual separator + a
  // "Broad planning level" label so the user understands the difference.
  const broad: Suggestion[] = [];
  if (showBroad) {
    productAreas.forEach(a => {
      if (!match(a.title, a.description)) return;
      broad.push({
        kind: "area", objectId: a.id, title: a.title, subtitle: a.description,
        alreadyIn: release.linkedAreaIds.includes(a.id),
        onToggle: () => {
          const wasIn = release.linkedAreaIds.includes(a.id);
          toggleReleaseArea(release.id, a.id);
          auditToggle("area", a.title, wasIn);
        },
        isBroad: true,
      });
    });
    featureGroups.forEach(g => {
      if (!match(g.title)) return;
      const parent = productAreas.find(a => a.id === g.areaId)?.title;
      broad.push({
        kind: "group", objectId: g.id, title: g.title, subtitle: parent,
        alreadyIn: release.linkedFeatureGroupIds.includes(g.id),
        onToggle: () => {
          const wasIn = release.linkedFeatureGroupIds.includes(g.id);
          toggleReleaseFeatureGroup(release.id, g.id);
          auditToggle("group", g.title, wasIn);
        },
        isBroad: true,
      });
    });
  }

  const primaryTop = primary.slice(0, 30);
  const broadTop   = broad.slice(0, 15);

  const renderRow = (s: Suggestion) => (
    <button
      key={`${s.kind}:${s.objectId}`}
      onClick={() => s.onToggle()}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        width: "100%", padding: "6px 10px", textAlign: "left",
        background: "transparent", border: "none", cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={productHitKindPill(s.kind)}>{MILESTONE_OBJECT_KIND_LABEL[s.kind]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{
            fontSize: "var(--fs-body)", color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {s.title}
          </span>
          {s.isBroad && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
              color: "var(--text-tertiary)",
              background: "var(--bg-sunken)",
              border: "1px solid var(--border)",
              borderRadius: 100, padding: "0 6px",
              whiteSpace: "nowrap",
            }}>
              BROAD PLANNING LEVEL
            </span>
          )}
        </div>
        {s.subtitle && (
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.subtitle}
          </div>
        )}
      </div>
      {s.alreadyIn ? (
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
          color: "#15803d",
          background: "rgba(34,197,94,0.12)",
          border: "1px solid rgba(34,197,94,0.45)",
          borderRadius: 100, padding: "1px 7px",
          whiteSpace: "nowrap",
        }}>
          IN MILESTONE
        </span>
      ) : (
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
          color: "var(--accent)",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          borderRadius: 100, padding: "1px 7px",
          whiteSpace: "nowrap",
        }}>
          + ADD
        </span>
      )}
    </button>
  );

  const totalShown = primaryTop.length + broadTop.length;

  return (
    <div ref={ref} style={{ position: "relative", flex: "0 1 320px", minWidth: 240 }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search Capability Areas, Feature Sets, Features, Slices, Capabilities…"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "5px 28px 5px 10px",
          border: open ? "1px solid var(--accent)" : "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--bg)", color: "var(--text)",
          fontSize: "var(--fs-body)", outline: "none",
        }}
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          title="Clear search"
          aria-label="Clear search"
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, border: "none", background: "transparent",
            color: "var(--text-tertiary)", cursor: "pointer",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <X size={10} />
        </button>
      )}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
          width: 400, maxHeight: 420, display: "flex", flexDirection: "column",
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}>
          {/* Header — match count + brief guidance. The guidance line
              teaches "use slice/capability for specific scope; use
              feature only when the exact slice is still flexible". */}
          <div style={{
            padding: "8px 10px", borderBottom: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              Add product scope · {totalShown} match{totalShown === 1 ? "" : "es"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
              Higher-level objects (Capability Area, Feature Set) scope a whole surface — useful before slices are decided. Lower-level objects (Feature Slice, Capability) scope an exact deliverable.
            </div>
          </div>

          {/* Body: primary results first; broader levels below an inline
              separator when the toggle is on. */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {primaryTop.length === 0 ? (
              <div style={{ padding: 12, fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", textAlign: "center" }}>
                {showBroad && broadTop.length > 0
                  ? "No features, slices, or capabilities match. Broader levels are below."
                  : "No matches. Try a shorter query."}
              </div>
            ) : (
              primaryTop.map(renderRow)
            )}
            {showBroad && broadTop.length > 0 && (
              <>
                <div style={{
                  padding: "6px 10px",
                  borderTop: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-sunken)",
                  fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
                  textTransform: "uppercase", color: "var(--text-tertiary)",
                }}>
                  Higher-level planning · {broadTop.length}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", padding: "6px 10px 0", lineHeight: 1.45 }}>
                  Capability Areas and Feature Sets scope an entire surface. A Must-have Feature Set means "a shippable version of this area" — child slices and capabilities keep their own MoSCoW priorities.
                </div>
                {broadTop.map(renderRow)}
              </>
            )}
          </div>

          {/* Footer toggle — "Include broader planning levels" */}
          <label style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-sunken)",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={showBroad}
              onChange={e => setShowBroad(e.target.checked)}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Include broader planning levels (Capability Area, Feature Set)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

// ── Milestone pickers for the two new product-object kinds ─────────────
// Kept available even though the unified autosuggest above is now the
// primary entry point — useful for future surfaces that want a single-
// kind picker.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MilestoneAreaPicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { productAreas } = useStore();
  const options = productAreas.map(a => ({
    id: a.id, label: a.title, subtitle: a.description,
  }));
  return <PickerPopover label="Link capability area" options={options} value={value} onToggle={onToggle} />;
}
function MilestoneGroupPicker({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { featureGroups, productAreas } = useStore();
  const options = featureGroups.map(g => ({
    id: g.id, label: g.title,
    subtitle: productAreas.find(a => a.id === g.areaId)?.title,
  }));
  return <PickerPopover label="Link feature set" options={options} value={value} onToggle={onToggle} />;
}

// ── MoSCoW grouped section + per-row renderer ───────────────────────────
function moscowSectionStyle(priority: MoscowPriority): React.CSSProperties {
  const palette: Record<MoscowPriority, { left: string; bg: string }> = {
    must:   { left: "#15803d",     bg: "rgba(34,197,94,0.05)"  },
    should: { left: "#1d4ed8",     bg: "rgba(59,130,246,0.05)" },
    could:  { left: "#b45309",     bg: "rgba(245,158,11,0.05)" },
    wont:   { left: "var(--text-tertiary)", bg: "var(--bg-sunken)" },
  };
  const p = palette[priority];
  return {
    borderRadius: "var(--radius)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${p.left}`,
    background: p.bg,
    padding: "8px 10px",
  };
}

function MoscowGroup({
  priority, rows, onChangePriority, onChangeNote,
}: {
  priority: MoscowPriority;
  rows: MilestoneRow[];
  onChangePriority: (row: MilestoneRow, next: MoscowPriority) => void;
  onChangeNote:     (row: MilestoneRow, next: string) => void;
}) {
  return (
    <div style={moscowSectionStyle(priority)}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: rows.length > 0 ? 8 : 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: "var(--text)" }}>
          {MOSCOW_LABEL[priority]}
        </span>
        {rows.length > 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
            · {rows.length}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", paddingLeft: 2 }}>
          {priority === "must"   ? "Required for this milestone." :
           priority === "should" ? "Helpful but not blocking." :
           priority === "could"  ? "Nice to have if time allows." :
                                   "Explicitly out of scope."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(row => (
            <MoscowRow
              key={`${row.kind}:${row.objectId}`}
              row={row}
              onChangePriority={(next) => onChangePriority(row, next)}
              onChangeNote={(next) => onChangeNote(row, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function moscowChipStyle(priority: MoscowPriority): React.CSSProperties {
  const palette: Record<MoscowPriority, { bg: string; fg: string; bd: string }> = {
    must:   { bg: "rgba(34,197,94,0.12)",  fg: "#15803d", bd: "rgba(34,197,94,0.45)" },
    should: { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", bd: "rgba(59,130,246,0.45)" },
    could:  { bg: "rgba(245,158,11,0.12)", fg: "#b45309", bd: "rgba(245,158,11,0.45)" },
    wont:   { bg: "var(--bg-sunken)",      fg: "var(--text-secondary)", bd: "var(--border)" },
  };
  const p = palette[priority];
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "1px 8px", borderRadius: 100,
    background: p.bg, color: p.fg,
    border: `1px solid ${p.bd}`,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}

function MoscowRow({
  row, onChangePriority, onChangeNote,
}: {
  row: MilestoneRow;
  onChangePriority: (next: MoscowPriority) => void;
  onChangeNote: (next: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(row.note ?? "");
  React.useEffect(() => { setNoteDraft(row.note ?? ""); }, [row.note]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      padding: "6px 8px",
      border: "1px solid var(--border)", borderRadius: "var(--radius)",
      background: "var(--bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={productHitKindPill(row.kind)}>
          {MILESTONE_OBJECT_KIND_LABEL[row.kind]}
        </span>
        {row.onOpen ? (
          <button
            onClick={row.onOpen}
            style={{
              flex: 1, minWidth: 0, textAlign: "left",
              background: "transparent", border: "none", padding: 0,
              fontSize: "var(--fs-body)", color: "var(--text)", cursor: "pointer",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title={row.title}
          >
            {row.title}
          </button>
        ) : (
          <span style={{
            flex: 1, minWidth: 0, fontSize: "var(--fs-body)", color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {row.title}
          </span>
        )}
        {row.parentTitle && (
          <span style={subtleParentPill()}>{row.parentTitle}</span>
        )}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setMenuOpen(o => !o)} style={moscowChipStyle(row.priority)}>
            {MOSCOW_LABEL[row.priority]} <ChevronDown size={9} />
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
              width: 150, background: "var(--bg)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)", overflow: "hidden",
            }}>
              {(["must", "should", "could", "wont"] as MoscowPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => { onChangePriority(p); setMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", padding: "6px 10px", textAlign: "left",
                    background: p === row.priority ? "var(--bg-sunken)" : "transparent",
                    border: "none", cursor: "pointer",
                    fontSize: "var(--fs-body)", color: "var(--text)",
                  }}
                  onMouseEnter={e => { if (p !== row.priority) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={e => { if (p !== row.priority) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={moscowChipStyle(p)}>{MOSCOW_LABEL[p]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={row.onUnlink}
          title="Remove from this milestone"
          aria-label="Remove from this milestone"
          style={{
            padding: 4, color: "var(--text-tertiary)",
            background: "transparent", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          <X size={10} />
        </button>
      </div>

      {(row.linkedGoals.length > 0 || row.note || editingNote) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 4 }}>
          {row.linkedGoals.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                Linked goals
              </span>
              {row.linkedGoals.map(g => (
                <span key={g.id} style={subtleParentPill()} title={g.title}>
                  {g.title}
                </span>
              ))}
            </div>
          )}
          {editingNote ? (
            <input
              autoFocus
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onBlur={() => { onChangeNote(noteDraft); setEditingNote(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") { onChangeNote(noteDraft); setEditingNote(false); }
                else if (e.key === "Escape") { setNoteDraft(row.note ?? ""); setEditingNote(false); }
              }}
              placeholder="Note for this milestone (optional)…"
              style={{
                padding: "3px 6px",
                border: "1px solid var(--accent)", borderRadius: "var(--radius)",
                background: "var(--bg)", color: "var(--text)",
                fontSize: 11, outline: "none",
              }}
            />
          ) : row.note ? (
            <button
              onClick={() => setEditingNote(true)}
              style={{
                textAlign: "left", padding: "3px 6px",
                border: "1px solid var(--border)", borderRadius: "var(--radius)",
                background: "transparent", color: "var(--text-secondary)",
                fontSize: 11, cursor: "text", lineHeight: 1.45,
              }}
              title="Click to edit note"
            >
              {row.note}
            </button>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              style={{
                alignSelf: "flex-start",
                padding: "1px 4px", fontSize: 10, color: "var(--text-tertiary)",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              + Add note
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// ── ProductBrowseTable ──────────────────────────────────────────────────
// Scan-friendly flat list shown in the "Browse all" view mode. Renders
// every Feature, Slice, and Capability (Areas and Feature Sets are
// containers and excluded here — the rail tree is where you scan
// containers). Each row carries: type chip, title, path, status pill,
// linked milestone count, and linked weekly-goal count.
function ProductBrowseTable({
  areaFilter, statusFilter, releaseFilter, query, typeFilter, onOpen,
}: {
  areaFilter: string;
  statusFilter: "all" | FeatureStatus;
  releaseFilter: string;
  query: string;
  typeFilter: ProductSearchKind;
  onOpen: (featureId: string, kind: "feature" | "slice" | "capability") => void;
}) {
  const {
    features, featureSlices, productCapabilities, productAreas, featureGroups,
    releases, weeklyGoals,
  } = useStore();

  type Row = {
    kind: "feature" | "slice" | "capability";
    id: string;
    title: string;
    description?: string;
    pathParts: string[];
    parentFeatureId: string;
    status?: FeatureStatus;
    unassigned: boolean;
    linkedReleases: { id: string; title: string }[];
    linkedGoalCount: number;
  };

  const activeRelease = releases.find(r => r.id === releaseFilter) ?? null;

  const matchesQ = (title: string, desc?: string) => {
    if (query === "") return true;
    if (title.toLowerCase().includes(query)) return true;
    if (desc && desc.toLowerCase().includes(query)) return true;
    return false;
  };
  const matchesAreaForFeature = (areaId: string): boolean => {
    if (areaFilter === "all") return true;
    return areaId === areaFilter;
  };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    // Features
    if (typeFilter === "all" || typeFilter === "feature" || typeFilter === "unassigned") {
      features.forEach(f => {
        if (typeFilter === "unassigned" && f.areaId) return;
        if (!matchesQ(f.title, f.description)) return;
        if (statusFilter !== "all" && f.status !== statusFilter) return;
        if (!matchesAreaForFeature(f.areaId)) return;
        if (activeRelease && !activeRelease.linkedFeatureIds.includes(f.id)) return;
        const area = productAreas.find(a => a.id === f.areaId);
        const set = featureGroups.find(g => g.id === f.featureGroupId);
        const linkedReleases = releases
          .filter(r => r.linkedFeatureIds.includes(f.id))
          .map(r => ({ id: r.id, title: r.title }));
        const goalCount = weeklyGoals.filter(g => g.linkedFeatureIds.includes(f.id)).length;
        out.push({
          kind: "feature", id: f.id, title: f.title, description: f.description,
          pathParts: [area?.title ?? (f.areaId ? "" : "Unassigned"), set?.title].filter((x): x is string => !!x),
          parentFeatureId: f.id,
          status: f.status,
          unassigned: !f.areaId,
          linkedReleases,
          linkedGoalCount: goalCount,
        });
      });
    }
    // Slices
    if (typeFilter === "all" || typeFilter === "slice") {
      featureSlices.forEach(s => {
        if (!matchesQ(s.title, s.description)) return;
        if (statusFilter !== "all" && s.status !== statusFilter) return;
        const parent = features.find(f => f.id === s.featureId);
        if (!parent) return;
        if (!matchesAreaForFeature(parent.areaId)) return;
        if (activeRelease && !activeRelease.linkedSliceIds.includes(s.id)) return;
        const area = productAreas.find(a => a.id === parent.areaId);
        const set = featureGroups.find(g => g.id === parent.featureGroupId);
        const linkedReleases = releases
          .filter(r => r.linkedSliceIds.includes(s.id))
          .map(r => ({ id: r.id, title: r.title }));
        const goalCount = weeklyGoals.filter(g => g.linkedSliceIds.includes(s.id)).length;
        out.push({
          kind: "slice", id: s.id, title: s.title, description: s.description,
          pathParts: [area?.title, set?.title, parent.title].filter((x): x is string => !!x),
          parentFeatureId: s.featureId,
          status: s.status,
          unassigned: !parent.areaId,
          linkedReleases,
          linkedGoalCount: goalCount,
        });
      });
    }
    // Capabilities — no status field; the status filter excludes them.
    if ((typeFilter === "all" || typeFilter === "capability") && statusFilter === "all") {
      productCapabilities.forEach(c => {
        if (!matchesQ(c.title)) return;
        const parent = features.find(f => f.id === c.featureId);
        if (!parent) return;
        if (!matchesAreaForFeature(parent.areaId)) return;
        if (activeRelease && !activeRelease.linkedCapabilityIds.includes(c.id)) return;
        const area = productAreas.find(a => a.id === parent.areaId);
        const set = featureGroups.find(g => g.id === parent.featureGroupId);
        const linkedReleases = releases
          .filter(r => r.linkedCapabilityIds.includes(c.id))
          .map(r => ({ id: r.id, title: r.title }));
        const goalCount = weeklyGoals.filter(g => g.linkedCapabilityIds.includes(c.id)).length;
        out.push({
          kind: "capability", id: c.id, title: c.title,
          pathParts: [area?.title, set?.title, parent.title].filter((x): x is string => !!x),
          parentFeatureId: c.featureId,
          unassigned: !parent.areaId,
          linkedReleases,
          linkedGoalCount: goalCount,
        });
      });
    }
    const order: Record<Row["kind"], number> = { feature: 0, slice: 1, capability: 2 };
    out.sort((a, b) => {
      const d = order[a.kind] - order[b.kind];
      if (d !== 0) return d;
      return a.title.localeCompare(b.title);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, featureSlices, productCapabilities, productAreas, featureGroups, releases, weeklyGoals,
       areaFilter, statusFilter, releaseFilter, query, typeFilter, activeRelease]);

  return (
    <div style={{ padding: "12px 24px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
        textTransform: "uppercase", color: "var(--text-tertiary)",
        padding: "0 2px 4px",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ width: 80 }}>Type</span>
        <span style={{ flex: 1 }}>Title · Path</span>
        <span style={{ width: 110, textAlign: "left" }}>Status</span>
        <span style={{ width: 160 }}>Milestone</span>
        <span style={{ width: 70, textAlign: "right" }}>Goals</span>
      </div>
      {rows.length === 0 ? (
        <div style={{
          margin: "40px auto", maxWidth: 380, textAlign: "center",
          fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
        }}>
          Nothing matches the current filters. Clear them in the left rail or refine the search.
        </div>
      ) : (
        rows.map(row => (
          <button
            key={`${row.kind}:${row.id}`}
            onClick={() => onOpen(row.parentFeatureId, row.kind)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 2px",
              borderBottom: "1px solid var(--border)",
              background: "transparent", border: "none",
              textAlign: "left", cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            title={row.description ? `${row.title} — ${row.description}` : row.title}
          >
            <span style={{ width: 80 }}>
              <span style={productHitKindPill(row.kind)}>{productHitKindLabel(row.kind)}</span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {row.title}
                </span>
                {row.unassigned && row.kind === "feature" && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                    color: "#b45309",
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.45)",
                    borderRadius: 100, padding: "0 6px",
                  }}>
                    UNASSIGNED
                  </span>
                )}
              </div>
              {row.pathParts.length > 0 && (
                <div style={{
                  fontSize: 10.5, color: "var(--text-tertiary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginTop: 1,
                }}>
                  Path: {row.pathParts.join(" / ")}
                </div>
              )}
            </div>
            <span style={{ width: 110 }}>
              {row.status ? (
                <span style={pillStyle(row.status)}>{FEATURE_STATUS_LABEL[row.status]}</span>
              ) : (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>—</span>
              )}
            </span>
            <span style={{ width: 160, fontSize: 11, color: "var(--text-secondary)" }}>
              {row.linkedReleases.length === 0 ? (
                <span style={{ color: "var(--text-tertiary)" }}>—</span>
              ) : (
                <span style={{
                  display: "inline-block", maxWidth: 156,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={row.linkedReleases.map(r => r.title).join(", ")}>
                  {row.linkedReleases[0].title}
                  {row.linkedReleases.length > 1 && (
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {" +"}{row.linkedReleases.length - 1}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span style={{ width: 70, textAlign: "right", fontSize: 11, color: row.linkedGoalCount > 0 ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
              {row.linkedGoalCount > 0 ? `${row.linkedGoalCount} goal${row.linkedGoalCount === 1 ? "" : "s"}` : "—"}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
