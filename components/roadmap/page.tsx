"use client";
import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  WeeklyGoal, WeeklyGoalStatus, ProductArea, Feature, FeatureStatus, FeatureSlice,
  FeatureGroup, ProductCapability, SliceCapabilityStatus,
  Release, ReleaseStatus, RoadmapTheme, RoadmapThemeColor,
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
              : tab === "releases" ? "Releases"
              : "Themes"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {tab === "weekly"
              ? "· Connect each goal to the intents and features that support it"
              : tab === "product"
                ? "· Browse product capability areas, features, and slices"
                : tab === "releases"
                  ? "· Package goals, features, slices, and capabilities you plan to ship together"
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
                  : t === "releases" ? "Releases"
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
          aria-label="Filter by release"
        >
          <option value="">All releases</option>
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

      {/* Read-only cross-reference: releases that package this goal.
          Linking happens on the Release card; this row just makes the
          connection visible from the goal side. */}
      {releaseIdsForGoal.length > 0 && (
        <ReleaseRefList releaseIds={releaseIdsForGoal} />
      )}

      {/* Theme tags — overlay row. Hidden while THEMES_ENABLED is false. */}
      {THEMES_ENABLED && (
        <ThemeRefList
          themeIds={themeIdsForGoal}
          onPick={(themeId) => toggleThemeGoal(themeId, goal.id)}
          pickerSelected={themeIdsForGoal}
        />
      )}

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

  const normalizedQuery = query.trim().toLowerCase();
  const queryActive   = normalizedQuery.length > 0;
  const filtersActive =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    themeFilter !== "all" ||
    releaseFilter !== "all";
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
        const area = productAreas.find(a => a.id === f.areaId);
        const group = featureGroups.find(g => g.id === f.featureGroupId);
        const subtitleParts = [
          area?.title ?? (f.areaId ? "" : "Unassigned features"),
          group?.title,
        ].filter(Boolean);
        all.push({
          kind: "feature", id: f.id, title: f.title,
          subtitle: subtitleParts.join(" · ") || undefined,
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
        const parent = features.find(f => f.id === s.featureId);
        all.push({
          kind: "slice", id: s.id, title: s.title,
          subtitle: parent?.title,
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
        const parent = features.find(f => f.id === c.featureId);
        all.push({
          kind: "capability", id: c.id, title: c.title,
          subtitle: parent?.title,
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
      c.feature++;
      if (!f.areaId) c.unassigned++;
    });
    featureSlices.forEach(s => {
      if (!matchesQuery(s.title, s.description)) return;
      if (!matchesStatus(s.status)) return;
      if (!matchesTheme("slice", s.id)) return;
      if (!matchesRelease("slice", s.id)) return;
      c.slice++;
    });
    if (statusFilter === "all") {
      productCapabilities.forEach(cap => {
        if (!matchesQuery(cap.title)) return;
        if (!matchesTheme("capability", cap.id)) return;
        if (!matchesRelease("capability", cap.id)) return;
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
            { id: "unassigned",  label: "Unassigned",  count: countsByKind.unassigned },
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
          statusFilter={statusFilter}
          themeFilter={themeFilter}
          releaseFilter={releaseFilter}
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
              Use the + buttons to add groups and features. Click a feature to edit it on the right.
            </div>
            <NewAreaButton />
          </>
        )}
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

// ── ProductFilterDropdowns ──────────────────────────────────────────────
// Compact secondary-filter strip with Status / Theme / Release. Stays
// always-visible (no disclosure) to keep clicks short; the dropdowns
// themselves are minimal native selects so the prototype doesn't have
// to maintain bespoke popover state for each.
function ProductFilterDropdowns({
  statusFilter, themeFilter, releaseFilter,
  onStatusChange, onThemeChange, onReleaseChange,
}: {
  statusFilter: "all" | FeatureStatus;
  themeFilter: string;
  releaseFilter: string;
  onStatusChange: (s: "all" | FeatureStatus) => void;
  onThemeChange: (id: string) => void;
  onReleaseChange: (id: string) => void;
}) {
  const { themes, releases } = useStore();
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
    <div style={{ display: "flex", gap: 4 }}>
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
        aria-label="Filter by release"
      >
        <option value="all">All releases</option>
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
                    UNASSIGNED
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
    case "group":      return "Group";
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
    weeklyGoals, wipItems, themes,
    updateFeature, deleteFeature,
    createProductCapability, updateProductCapability, deleteProductCapability,
    createFeatureSlice, toggleThemeFeature,
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
  const themeIdsForFeature = themes
    .filter(t => t.linkedFeatureIds.includes(feature.id))
    .map(t => t.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {area?.title ?? "Unassigned features"}
        {group && <> · {group.title}</>}
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
  const { updateFeatureSlice, deleteFeatureSlice, setSliceCapabilityStatus, releases, themes, toggleThemeSlice } = useStore();
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

      {/* Read-only cross-reference: releases that include this slice. */}
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
  // Sort: in-progress first, then planned, then released, alphabetical
  // inside each bucket. Keeps active scope at the top.
  const sorted = useMemo(() => {
    const order: Record<ReleaseStatus, number> = { in_progress: 0, planned: 1, released: 2 };
    return releases.slice().sort((a, b) => {
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return a.title.localeCompare(b.title);
    });
  }, [releases]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: 16, minHeight: "100%",
      maxWidth: 920, margin: "0 auto",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Releases package the goals, features, slices, and capabilities you plan to ship together. They never own anything — the same target can sit in multiple releases.
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => createRelease({ title: "Untitled release" })}
          style={{
            padding: "5px 12px",
            background: "var(--accent)",
            color: "white",
            border: "none", borderRadius: "var(--radius)",
            fontSize: "var(--fs-meta)", fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          + New release
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{
          margin: "60px auto", maxWidth: 380, textAlign: "center",
          fontSize: "var(--fs-body)", color: "var(--text-tertiary)", lineHeight: 1.55,
        }}>
          No releases yet. Use <strong style={{ color: "var(--text)" }}>+ New release</strong> to package a set of goals / features / slices / capabilities you plan to ship together.
        </div>
      ) : (
        sorted.map(r => <ReleaseCard key={r.id} release={r} />)
      )}
    </div>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const {
    updateRelease, deleteRelease,
    weeklyGoals, features, featureSlices, productCapabilities,
    themes, toggleThemeRelease,
    toggleReleaseGoal, toggleReleaseFeature, toggleReleaseSlice, toggleReleaseCapability,
    setRoadmapFocus,
  } = useStore();
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
  const linkedFeatures = features.filter(f => release.linkedFeatureIds.includes(f.id));
  const linkedSlices = featureSlices.filter(s => release.linkedSliceIds.includes(s.id));
  const linkedCapabilities = productCapabilities.filter(c => release.linkedCapabilityIds.includes(c.id));

  const dateLabel = formatReleaseTargetLabel(release.targetStart, release.targetEnd);

  return (
    <div
      data-release-id={release.id}
      style={{
        background: "var(--bg)",
        borderTop:    "1px solid var(--border)",
        borderRight:  "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: `3px solid ${release.status === "released" ? "var(--status-accepted)" : release.status === "in_progress" ? "#f59e0b" : "var(--accent)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      {/* Title + status + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { updateRelease(release.id, { title: titleDraft.trim() || release.title }); setEditingTitle(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { updateRelease(release.id, { title: titleDraft.trim() || release.title }); setEditingTitle(false); }
              else if (e.key === "Escape") { setTitleDraft(release.title); setEditingTitle(false); }
            }}
            style={{
              flex: 1, fontSize: 16, fontWeight: 600, color: "var(--text)",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              padding: "4px 8px", background: "var(--bg)", outline: "none",
            }}
          />
        ) : (
          <h3
            onClick={() => { setTitleDraft(release.title); setEditingTitle(true); }}
            style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)", cursor: "text", lineHeight: 1.3 }}
            title="Click to rename"
          >
            {release.title}
          </h3>
        )}
        <ReleaseStatusPicker
          status={release.status}
          onChange={(s) => updateRelease(release.id, { status: s })}
        />
        <button
          onClick={() => { if (window.confirm(`Delete release "${release.title}"? Linked objects stay where they are.`)) deleteRelease(release.id); }}
          aria-label="Delete release"
          title="Delete release"
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

      {/* Description — click to edit, compact when empty */}
      <div>
        {editingDesc ? (
          <textarea
            autoFocus
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={() => { updateRelease(release.id, { description: descDraft }); setEditingDesc(false); }}
            rows={2}
            placeholder="Short description (optional)…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 9px",
              border: "1px solid var(--accent)", borderRadius: "var(--radius)",
              background: "var(--bg)", color: "var(--text)",
              fontSize: "var(--fs-body)", lineHeight: 1.5, outline: "none",
              resize: "vertical",
            }}
          />
        ) : release.description ? (
          <button
            onClick={() => { setDescDraft(release.description ?? ""); setEditingDesc(true); }}
            style={{
              width: "100%", textAlign: "left",
              padding: "6px 9px", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", background: "var(--bg-sunken)",
              color: "var(--text-secondary)", fontSize: "var(--fs-body)", lineHeight: 1.5,
              cursor: "text",
            }}
            title="Click to edit description"
          >
            {release.description}
          </button>
        ) : (
          <button
            onClick={() => { setDescDraft(""); setEditingDesc(true); }}
            style={{
              padding: "2px 4px", fontSize: 11, color: "var(--text-tertiary)",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            + Add description
          </button>
        )}
      </div>

      {/* Target date / range — click to edit. We treat both inputs as
          optional so the user can ship a single target or a range. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Target
        </span>
        {editingDates ? (
          <>
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
                updateRelease(release.id, {
                  targetStart: startDraft ? new Date(startDraft).toISOString() : undefined,
                  targetEnd:   endDraft   ? new Date(endDraft).toISOString()   : undefined,
                });
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
          </>
        ) : (
          <button
            onClick={() => setEditingDates(true)}
            style={{
              padding: "2px 8px", borderRadius: "var(--radius)",
              background: "transparent",
              color: dateLabel ? "var(--text-secondary)" : "var(--text-tertiary)",
              border: "1px dashed var(--border-strong)",
              fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
            }}
            title="Click to set a target date or range"
          >
            {dateLabel ?? "Set target date or range"}
          </button>
        )}
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
            value={release.linkedGoalIds}
            onToggle={(id) => toggleReleaseGoal(release.id, id)}
          />
        }
        emptyHint="No goals linked yet."
      />

      {/* Linked features */}
      <LinkedSection
        title="Linked features"
        items={linkedFeatures.map(f => ({
          id: f.id, label: f.title,
          onOpen: () => setRoadmapFocus({ tab: "product", featureId: f.id }),
        }))}
        addPicker={
          <FeaturePicker
            value={release.linkedFeatureIds}
            onToggle={(id) => toggleReleaseFeature(release.id, id)}
          />
        }
        emptyHint="No features linked yet."
      />

      {/* Linked feature slices */}
      <LinkedSection
        title="Linked feature slices"
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
            value={release.linkedSliceIds}
            onToggle={(id) => toggleReleaseSlice(release.id, id)}
          />
        }
        emptyHint="No feature slices linked yet."
      />

      {/* Linked capabilities */}
      <LinkedSection
        title="Linked product capabilities"
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
            value={release.linkedCapabilityIds}
            onToggle={(id) => toggleReleaseCapability(release.id, id)}
          />
        }
        emptyHint="No product capabilities linked yet."
      />

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
}: {
  releaseIds: string[];
}) {
  const { releases } = useStore();
  // RoadmapPage owns the tab toggle, so we re-use setRoadmapFocus with
  // a "releases" target — handled below by extending the focus model.
  if (releaseIds.length === 0) return null;
  const linked = releases.filter(r => releaseIds.includes(r.id));
  if (linked.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        Included in releases
      </span>
      {linked.map(r => (
        <span
          key={r.id}
          style={{
            fontSize: 10.5, fontWeight: 500,
            color: "var(--text-secondary)",
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            borderRadius: 100, padding: "1px 8px",
            whiteSpace: "nowrap",
          }}
          title={`${r.title} · ${RELEASE_STATUS_LABEL[r.status]}`}
        >
          {r.title}
        </span>
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

      {/* Linked releases */}
      <LinkedSection
        title="Linked releases"
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
        emptyHint="No releases tagged yet."
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
  return <PickerPopover label="Link release" options={options} value={value} onToggle={onToggle} />;
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