"use client";
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import {
  Signal, Wip, Sprint, Note, WipComment, WipAttachment, HideUnderRule,
  SignalComment, WipEvent, WipEventKind, SignalAttachment, SignalClosure,
  DuplicateGroup,
  Visibility, SignalStatus, SignalPriority, WipType, WipColumn,
  SignalWipLink, SignalWipRelationship, relationshipResolvesSignal,
  Transaction, FieldChange, HideUnderSnapshot, TransactionAction, UndoSafety,
  SIGNALS, WIP_ITEMS, SPRINTS, NOTES, WIP_COMMENTS, WIP_ATTACHMENTS, HIDE_UNDER_RULES,
  SIGNAL_COMMENTS, WIP_EVENTS, SIGNAL_ATTACHMENTS, DUPLICATE_GROUPS,
  SPLIT_MAX_PER_SOURCE, splitChildrenCount,
  WeeklyGoal, WeeklyGoalStatus, ProductArea, Feature, FeatureStatus, FeatureSlice,
  FeatureGroup, ProductCapability, SliceCapabilityStatus,
  Release, ReleaseStatus, RoadmapTheme, MilestoneAuditEntry, MilestoneAuditKind,
  MoscowPriority, MilestoneObjectKind, milestoneLinkKey,
  SignalGroup, SignalGroupStatus, SignalGroupReason,
  DraftIntent,
  PRODUCT_AREAS, FEATURES, FEATURE_SLICES, FEATURE_GROUPS, PRODUCT_CAPABILITIES, WEEKLY_GOALS,
  RELEASES, THEMES, SIGNAL_GROUPS, DRAFT_INTENTS,
  hideUnderKey, findHideUnderRule, getUndoSafety,
  computeAutoPriority,
} from "./data";

export type Route = "signals" | "wip" | "sources" | "history" | "roadmap";
export type ViewMode = "columns" | "grid" | "list";
// Coarse access mode — "team" is the default internal experience with full
// edit capabilities; "client" is a read-only mirror used for sharing the
// view with external clients during a demo. This is intentionally NOT a
// proper permissions system; it's a UI flag, swap it for real auth later.
export type AppMode = "team" | "client";
export type GroupBy =
  | "status" | "source" | "author" | "label"
  | "created_date" | "updated_date" | "closed_reason";
export type Density = "compact" | "default" | "comfortable";
// Dark mode theme — driven by `data-theme` on the <html> element. The
// store owns the value, persists it to localStorage, and exposes `setTheme`
// so any UI surface can toggle.
export type Theme   = "light" | "dark";
export type WorkItemFilter  = "task_created" | "intent_created";
export type DuplicateFilter =
  | "possible"      // signal in any unconfirmed suggestion
  | "confirmed"     // signal in any confirmed group
  | "new"           // signal in an unseen / changed suggestion
  | "with_wip"      // signal in a group whose members link to a WIP
  | "with_done_wip" // signal in a group linked to a WIP currently in Done
  | "none";         // signal not in any duplicate group

export type AttributeFilter =
  | "stale"             // last-touched older than the staleness threshold
  | "has_attachments"
  | "has_linked_work"
  | "returning_soon";   // currently skipped, returns within 24h

export interface Filters {
  status:    SignalStatus[];
  priority:  SignalPriority[];
  author:    string[];
  source:    string[];
  labels:    string[];
  workItem:  WorkItemFilter[];
  duplicate: DuplicateFilter[];
  attribute: AttributeFilter[];
}

interface StoreState {
  signals:        Signal[];
  wipItems:       Wip[];
  sprints:        Sprint[];
  notes:          Note[];
  wipComments:    WipComment[];
  wipAttachments: WipAttachment[];
  hideUnderRules: HideUnderRule[];
  signalComments: SignalComment[];
  signalAttachments: SignalAttachment[];
  // Rich signal ↔ wip links carrying a relationship type. Coexists with
  // `Signal.linkedWip` (membership list); we keep both in sync from the
  // store actions, so older read-paths that scan linkedWip still work.
  signalWipLinks: SignalWipLink[];
  // Set immediately after a "create work item from selection" flow so the
  // floating post-create banner can render its 3-action prompt. Cleared
  // when the user dismisses, takes any action, or after the auto-timeout.
  postCreatePrompt: {
    wipId: string;
    type: WipType;
    title: string;
    sourceSignalIds: string[];
    createdAt: string;
  } | null;
  // Transient "show only the source signals of this wip" filter on the
  // Signals page. Set from the post-create banner's "View source signals"
  // action; cleared by the user via the filter chip in the toolbar.
  sourceOfWipFilter: string | null;
  // Cross-tab focus signal for the Roadmap page. Callers set this just
  // before switching `route` to "roadmap" so the page can land on the
  // right tab and scroll/highlight the right target. The Roadmap page
  // consumes and clears it after applying.
  roadmapFocus: {
    tab: "weekly" | "product" | "releases" | "themes";
    goalId?: string;
    featureId?: string;
    sliceId?: string;
    themeId?: string;
  } | null;
  // Roadmap / traceability collections — all V1 (no MoSCoW / release
  // planning yet). Mutated only via dedicated actions below so we can
  // keep the link arrays in sync across views.
  weeklyGoals: WeeklyGoal[];
  productAreas: ProductArea[];
  features: Feature[];
  featureSlices: FeatureSlice[];
  featureGroups: FeatureGroup[];
  productCapabilities: ProductCapability[];
  // Releases — lightweight scope packages. A release LINKS to goals /
  // features / slices / capabilities; it does NOT own them, and the
  // same target can appear in multiple releases.
  releases: Release[];
  // Themes — overlay tags. A theme LINKS to any of: goals, intents,
  // features, slices, capabilities, releases. It is NOT a hierarchy
  // node and does NOT own anything; the same target can carry many
  // themes simultaneously.
  themes: RoadmapTheme[];
  // SignalGroups — persistent, user-curated workspaces of related
  // signals. Many-to-many: one signal can sit in multiple groups.
  // Different from duplicateGroups (those are system-suggested
  // de-duplication candidates).
  signalGroups: SignalGroup[];
  // Transient: id of a SignalGroup currently "opened" — drives the
  // Signals list filter when set and the Groups panel highlight.
  signalGroupFilter: string | null;
  // Signals-page view mode. "list" (default) shows the standard filtered
  // signals list; "groups" shows the all-saved-groups list view. When a
  // signalGroupFilter is set the workspace takes over either mode.
  signalsViewMode: "list" | "groups";
  // Draft intents — planning-only records that live inside a SignalGroup
  // until the user finalizes them into a real Wip via createWorkItem.
  // Drafts stay around after finalization (stamped with finalizedWipId)
  // so the group history reads cleanly.
  draftIntents: DraftIntent[];
  // Duplicate groups — both suggested (unconfirmed) and confirmed groups
  // live here. The model has a `confirmed` flag so we don't keep two
  // parallel collections.
  duplicateGroups: DuplicateGroup[];
  // When the user clicks Split, both signal ids land here and a dedicated
  // side-by-side editor renders so the user can trim both pieces in one
  // pass instead of bouncing between modals. Null = no split open.
  splitView: { leftId: string; rightId: string } | null;
  wipEvents:      WipEvent[];
  // Set immediately after a successful task/intent create. Drives the
  // "Task created — Go to WIP / Stay on Signals" confirmation dialog. Null
  // means no pending confirmation. The producer (createWorkItem /
  // createFromSignal) sets it; the consumer dismisses or accepts.
  // Snapshot of `signal:lastClientVisitAt` taken when the user enters client
  // mode. Cards whose latest event is newer than this string are highlighted
  // for the rest of the session. Null in team mode.
  clientPreviousVisitAt: string | null;
  transactions:   Transaction[];   // newest last
  toastTxIds:     string[];        // ids currently shown in the ephemeral toast stack
  route:          Route;
  view:           ViewMode;
  groupBy:        GroupBy;
  filters:        Filters;
  search:         string;
  selection:      string[];
  openSignalId:   string | null;
  selectedWipId:  string | null;
  density:        Density;
  tweaksOpen:     boolean;
  defaultView:    ViewMode;
  currentUserId:  string;
  appMode:        AppMode;
  theme:          Theme;
}

interface StoreActions {
  setRoute:          (r: Route) => void;
  setView:           (v: ViewMode) => void;
  setGroupBy:        (g: GroupBy) => void;
  setFilters:        (f: Partial<Filters>) => void;
  setSearch:         (s: string) => void;
  toggleSelect:      (id: string) => void;
  selectAll:         (ids: string[]) => void;
  clearSelection:    () => void;
  openSignal:        (id: string | null) => void;
  updateSignal:      (id: string, patch: Partial<Signal>) => void;
  // Link a signal to an existing WIP item with a relationship type.
  // Idempotent: if a link already exists for the (signalId, wipId) pair
  // we update its relationship instead of creating a duplicate. Always
  // syncs `Signal.linkedWip` and `Wip.linkedSignals` so the membership
  // lists stay in agreement with the link table.
  linkSignalToWip:   (signalId: string, wipId: string, relationship: SignalWipRelationship) => void;
  unlinkSignalFromWip: (signalId: string, wipId: string) => void;
  // Post-create banner state — set when a create-from-selection finishes,
  // read by the floating prompt to render its 3-action toast.
  dismissPostCreatePrompt: () => void;
  // Apply the transient "source of <wipId>" filter on Signals page.
  // Passing null clears it.
  setSourceOfWipFilter: (wipId: string | null) => void;
  // ── Roadmap / traceability actions ──────────────────────────────────────
  // All shallow CRUD. Linking is symmetric where it makes sense (e.g.
  // adding an intent to a feature also doesn't auto-add it to other
  // structures — links are explicit per spec).
  createWeeklyGoal:  (input: { title: string; weekStart: string; weekLabel?: string }) => string;
  updateWeeklyGoal:  (id: string, patch: Partial<WeeklyGoal>) => void;
  deleteWeeklyGoal:  (id: string) => void;
  createProductArea: (input: { title: string; description?: string }) => string;
  updateProductArea: (id: string, patch: Partial<ProductArea>) => void;
  deleteProductArea: (id: string) => void;
  createFeature:     (input: { title: string; areaId?: string; featureGroupId?: string; description?: string }) => string;
  updateFeature:     (id: string, patch: Partial<Feature>) => void;
  deleteFeature:     (id: string) => void;
  createFeatureSlice:(input: { title: string; featureId: string; description?: string }) => string;
  updateFeatureSlice:(id: string, patch: Partial<FeatureSlice>) => void;
  deleteFeatureSlice:(id: string) => void;
  // Link helpers — operate on the relevant array on the target entity.
  toggleGoalFeature:    (goalId: string, featureId: string) => void;
  toggleGoalSlice:      (goalId: string, sliceId: string) => void;
  toggleGoalCapability: (goalId: string, capabilityId: string) => void;
  toggleGoalIntent:     (goalId: string, intentId: string) => void;
  setRoadmapFocus:      (focus: {
    tab: "weekly" | "product" | "releases" | "themes";
    goalId?: string;
    featureId?: string;
    sliceId?: string;
    themeId?: string;
  } | null) => void;
  toggleFeatureIntent:      (featureId: string, intentId: string) => void;
  toggleFeatureSliceIntent: (sliceId: string, intentId: string) => void;
  // ── Feature group + product capability CRUD (Product View) ──────────────
  createFeatureGroup:  (input: { title: string; areaId: string }) => string;
  updateFeatureGroup:  (id: string, patch: Partial<FeatureGroup>) => void;
  deleteFeatureGroup:  (id: string) => void;
  createProductCapability: (input: { title: string; featureId: string }) => string;
  updateProductCapability: (id: string, patch: Partial<ProductCapability>) => void;
  deleteProductCapability: (id: string) => void;
  // ── Release CRUD + linking ───────────────────────────────────────────
  // Release is a scope container only. Each toggle action mutates ONE
  // array on the release; the linked target stays untouched. Deleting a
  // goal / feature / slice / capability filters orphaned ids out of
  // every release (cascade lives in the corresponding delete actions).
  createRelease: (input: { title: string; description?: string }) => string;
  updateRelease: (id: string, patch: Partial<Release>) => void;
  deleteRelease: (id: string) => void;
  toggleReleaseGoal:       (releaseId: string, goalId: string) => void;
  toggleReleaseFeature:    (releaseId: string, featureId: string) => void;
  toggleReleaseSlice:      (releaseId: string, sliceId: string) => void;
  toggleReleaseCapability: (releaseId: string, capabilityId: string) => void;
  // Two new product-object kinds reachable from a milestone: capability
  // areas (whole product surfaces) and feature groups (sub-areas).
  toggleReleaseArea:         (releaseId: string, areaId: string) => void;
  toggleReleaseFeatureGroup: (releaseId: string, groupId: string) => void;
  // Per-link MoSCoW + note. `kind` + `objectId` identify the row; the
  // priority is scoped to this milestone only (the same product object
  // can carry different priorities across other milestones).
  setMilestoneObjectPriority: (releaseId: string, kind: MilestoneObjectKind, objectId: string, priority: MoscowPriority) => void;
  setMilestoneObjectNote:     (releaseId: string, kind: MilestoneObjectKind, objectId: string, note: string) => void;
  // Append one entry to the milestone's audit log. UI callers compose
  // the human-readable summary (they already have the names of the
  // linked objects on hand). Structured fields (kind / objectLabel /
  // previousValue / nextValue) are optional — when provided, the audit
  // log renders the structured "what · object · before → after" layout
  // instead of just the plain summary line.
  recordMilestoneAudit: (
    releaseId: string,
    summary: string,
    structured?: {
      kind?: MilestoneAuditKind;
      objectLabel?: string;
      previousValue?: string;
      nextValue?: string;
    },
  ) => void;
  // Spawn a new version of an existing milestone. The clone inherits
  // scope / status / dates as a starting point, points back at the
  // source via versionParentId, and shares the source's family id so
  // the version-picker UI groups them together.
  cloneRelease: (sourceId: string, opts?: { summary?: string }) => string;
  // ── SignalGroup CRUD ──────────────────────────────────────────────
  createSignalGroup: (input: { name: string; signalIds?: string[]; reasons?: SignalGroupReason[]; notes?: string }) => string;
  updateSignalGroup: (id: string, patch: Partial<SignalGroup>) => void;
  deleteSignalGroup: (id: string) => void;
  // Add or remove a single signal from a group. Idempotent.
  addSignalToGroup:      (groupId: string, signalId: string) => void;
  removeSignalFromGroup: (groupId: string, signalId: string) => void;
  // Bulk attach — used by the SelectionBar "save selected as group" flow.
  addSignalsToGroup: (groupId: string, signalIds: string[]) => void;
  // Bulk detach used by the group-workspace "Remove from group" action.
  removeSignalsFromGroup: (groupId: string, signalIds: string[]) => void;
  // Mark a set of signals as duplicates of one main signal. Uses the
  // existing duplicate-link plumbing under the hood but exposes a
  // bulk-friendly entry point. Returns the resulting duplicate group id.
  markSignalsAsDuplicatesOf: (mainSignalId: string, otherSignalIds: string[]) => string | null;
  // Close a signal with a "duplicate of" reason. Uses the existing
  // closure flow + stamps a structured note so the signal's history
  // makes the relationship legible later.
  closeSignalAsDuplicateOf: (signalId: string, mainSignalId: string) => void;
  // Open / close a group as the active Signals-list filter.
  openGroup: (groupId: string | null) => void;
  // Toggle the Signals-page view mode between the standard signals
  // list and the all-saved-groups list. The Groups list view replaces
  // the previous tiny popover-style "Saved Groups" UI.
  setSignalsViewMode: (m: "list" | "groups") => void;

  // ── Draft intents (per-SignalGroup) ────────────────────────────────
  createDraftIntent: (input: {
    groupId: string;
    title: string;
    description?: string;
    signalIds: string[];
    notes?: string;
    suggestedTasks?: string[];
    // Structured planning fields — optional at create time, all can
    // be edited after.
    acceptanceCriteria?: string[];
    context?: string;
    decisionRationale?: string;
    rejectedAlternatives?: string;
    plan?: string;
  }) => string;
  updateDraftIntent: (id: string, patch: Partial<Omit<DraftIntent, "id" | "groupId" | "createdAt">>) => void;
  deleteDraftIntent: (id: string) => void;
  // Promote a draft into a real intent (Wip). Returns the new wip id.
  // The draft itself stays, stamped with finalizedWipId + finalizedAt so
  // the group workspace can show "finalized from draft" lineage.
  finalizeDraftIntent: (id: string) => string | null;
  // Explicit "link this group to an existing intent" — used when the
  // work already exists and the user wants the group to reference it
  // without creating a draft. Selected signals get linked to the intent
  // via the regular linkSignalToWip path; the intent id lands on the
  // group's linkedIntentIds.
  linkGroupToExistingIntent: (groupId: string, intentId: string, signalIds: string[]) => void;

  // ── Theme CRUD + linking ─────────────────────────────────────────────
  // Themes are OVERLAYS: a theme links to goals / intents / features /
  // slices / capabilities / releases without owning any of them. Each
  // toggle mutates one array on the theme; cascades from delete actions
  // strip orphaned ids out of every theme.
  createTheme: (input: { title: string; description?: string; color?: RoadmapTheme["color"] }) => string;
  updateTheme: (id: string, patch: Partial<RoadmapTheme>) => void;
  deleteTheme: (id: string) => void;
  toggleThemeGoal:       (themeId: string, goalId: string) => void;
  toggleThemeIntent:     (themeId: string, intentId: string) => void;
  toggleThemeFeature:    (themeId: string, featureId: string) => void;
  toggleThemeSlice:      (themeId: string, sliceId: string) => void;
  toggleThemeCapability: (themeId: string, capabilityId: string) => void;
  toggleThemeRelease:    (themeId: string, releaseId: string) => void;
  // Set a slice's inclusion weight for one capability. Passing null
  // unselects (capability isn't part of the slice). The capability
  // must belong to the slice's parent Feature; otherwise the call is
  // a no-op.
  setSliceCapabilityStatus: (sliceId: string, capabilityId: string, status: SliceCapabilityStatus | null) => void;
  setLinkRelationship: (signalId: string, wipId: string, relationship: SignalWipRelationship) => void;
  // Close a signal with an optional free-text reason. Equivalent to
  // updateSignal(id, { status: "closed" }) but stamps `closure.note` on
  // the closure record so the signal modal can render a human-readable
  // explanation under the closure banner. Skips if the signal is already
  // closed (matches updateSignal semantics).
  closeSignalWithReason: (id: string, note?: string) => void;
  // Set the TPA annotation on a signal. Empty string clears the note.
  // Records one transaction per actual content change (i.e. saves
  // triggered by blur where the text didn't change emit no event).
  setTpaNote: (signalId: string, text: string) => void;
  // Skip a signal for a duration. Saves the pre-skip status so the
  // auto-revive can restore it when the skip expires. Pass `null` for
  // "skip indefinitely".
  skipSignal: (id: string, untilISO: string | null, reason?: string) => void;
  // Reject a signal with an optional reason note.
  rejectSignalWithReason: (id: string, reason?: string) => void;
  // Reopen a signal (out of closed / rejected) with an optional reason.
  // For skipped signals, use `reviveSkip` which restores the pre-skip
  // status instead of forcing "new".
  reopenSignalWithReason: (id: string, reason?: string) => void;
  reviveSkip: (id: string) => void;
  // Duplicates a signal so the user can split a long one into focused pieces.
  // Inserts the clone next to the original AND opens the side-by-side split
  // editor so the user can trim both pieces in one pass. Returns the new id.
  cloneSignal:       (id: string) => string | null;
  // Atomic N-way split. Creates one child per piece, links each back
  // via splitFromId pointing at the root, records one transaction on
  // the root ("Split into N signals") plus one per child ("Created
  // from split of <root>"). Respects SPLIT_MAX_PER_SOURCE — pieces
  // beyond the cap are silently dropped (caller validates with
  // splitChildrenCount before opening the modal). Returns the new ids
  // in input order so the caller can navigate / focus the result.
  splitSignal: (
    rootId: string,
    pieces: { title: string; description: string; tpaNote?: string }[],
  ) => string[];
  // ── Duplicate group actions ─────────────────────────────────────────────
  // Accept a suggested group → flips `confirmed` to true.
  // Reject a suggested group → removes it entirely.
  // Add/remove signal → adjusts `signalIds`. The group is auto-deleted if it
  //   drops below 2 members (per spec).
  // Bulk apply → applies a status change to every signal in the confirmed
  //   group (used by the "Apply to all duplicates" prompt). Goes through
  //   the normal `updateSignal` path so transactions are still recorded
  //   per-signal.
  acceptDuplicateGroup: (groupId: string) => void;
  rejectDuplicateGroup: (groupId: string) => void;
  removeSignalFromDuplicateGroup: (groupId: string, signalId: string) => void;
  addSignalToDuplicateGroup:      (groupId: string, signalId: string) => void;
  applyStatusToDuplicateGroup:    (groupId: string, status: SignalStatus) => void;
  // Set the main signal of a group. The chosen signal must be a current
  // member of the group; otherwise the call is a no-op.
  setMainSignal:                  (groupId: string, signalId: string) => void;
  // Manual duplicate-link entry point: link `otherSignalId` as a duplicate
  // of `originSignalId`. Behaviour:
  //   • If the origin is already in a (suggested or confirmed) group, the
  //     other signal joins that group (the group is auto-confirmed if it
  //     was a suggestion — manual link is an explicit user decision).
  //   • Otherwise a brand new confirmed group is created with both signals.
  // Returns the resolved group id so callers can navigate / open the group.
  addDuplicateLink:               (originSignalId: string, otherSignalId: string) => string | null;
  // Close every signal in a confirmed group as one unit. Stamps a manual
  // closure on each currently-open member.
  closeDuplicateGroup:            (groupId: string) => void;
  // Create one WIP item from a confirmed duplicate group. All current
  // member signals get linked to the new WIP and flip to Ready. Returns
  // the new wip id, or null if the group / type is invalid.
  createWipFromDuplicateGroup:    (groupId: string, type: WipType, opts?: { description?: string; assignee?: string | null }) => string | null;
  // Snapshots the current `signalIds` into `seenSignalIds` so the group
  // stops registering as new/changed in the highlight. Idempotent — calling
  // it twice with no membership change leaves state untouched.
  markDuplicateGroupSeen:         (groupId: string) => void;
  // Open / close the side-by-side split editor explicitly. Most callers go
  // through `cloneSignal` (which opens it for them); these are for closing
  // and for re-opening after navigation.
  openSplitView:     (leftId: string, rightId: string) => void;
  closeSplitView:    () => void;
  bulkSetStatus:     (status: SignalStatus) => void;
  bulkAddLabel:      (label: string) => void;
  // Create work item from the current selection. Optional `opts` lets
  // the pre-create modal override the auto-derived title and/or narrow
  // the source set (signalIds) when the user drops some rows before
  // confirming. When signalIds is omitted, the live `selection` is used.
  createWorkItem:    (type: WipType, description?: string, assignee?: string | null, opts?: { title?: string; signalIds?: string[] }) => void;
  createFromSignal:  (signalId: string, type: WipType, opts?: { description?: string; assignee?: string | null }) => void;
  updateWip:         (id: string, patch: Partial<Wip>) => void;
  // ── Acceptance criteria helpers ─────────────────────────────────────────
  // Targeted operations over the AC list. The whole list could also be
  // edited via updateWip + a fresh array, but these helpers keep the
  // common cases tidy and let us add transactions/audit later.
  addAcceptanceCriterion:    (wipId: string, text: string) => void;
  updateAcceptanceCriterion: (wipId: string, acId: string, patch: { text?: string; done?: boolean }) => void;
  removeAcceptanceCriterion: (wipId: string, acId: string) => void;
  // ── Manual ordering within a column ─────────────────────────────────────
  // Swap a wip's rank with its immediate neighbour above or below within
  // the same column. Rank values are assigned lazily — the first time the
  // user nudges, every item in the column gets an explicit numeric rank.
  moveWipUp:   (wipId: string) => void;
  moveWipDown: (wipId: string) => void;
  // ── Spawn a signal from a wip comment ──────────────────────────────────
  // Captures the comment body as a new Signal with a backref to the
  // origin wip + comment for traceability. Returns the new signal id.
  createSignalFromComment: (commentId: string) => string | null;
  openWip:           (id: string | null) => void;
  moveWip:           (id: string, location: string, column: WipColumn) => void;
  newSprint:         () => void;
  createNote:        (data: { source: string; title: string; body: string }) => void;
  setDensity:        (d: Density) => void;
  setTweaksOpen:     (open: boolean) => void;
  addComment:        (wipId: string, body: string, visibility: Visibility) => void;
  addAttachment:     (wipId: string, name: string, size: string, mimeType: string, visibility: Visibility) => void;
  // Signal-side comments. Same shape as WIP comments; client-mode UIs force
  // visibility="client" so client posts never get tagged internal.
  addSignalComment:  (signalId: string, body: string, visibility: Visibility) => void;
  // Adds a per-file attachment to a signal. The prototype upload row picks
  // a sample file shape (no real binary upload yet); the contract stays
  // forward-compatible with a real upload later.
  addSignalAttachment: (signalId: string, name: string, mimeType: string, size: string) => void;
  // hide-under actions
  hideUnder:         (mainSignalId: string, filterLabels: string[], otherIds: string[]) => void;
  removeFromHideUnder: (ruleId: string, signalId: string) => void;
  removeHideUnderRule: (ruleId: string) => void;
  bulkUpdateSignalStatus: (ids: string[], status: SignalStatus) => void;
  // ── Transactions / undo ─────────────────────────────────────────────────
  // `undoTransaction` reverts only the safe field changes for that tx; the
  // tx is marked as undone so it can stay in history but won't be re-shown.
  // `dismissToast` removes a tx from the active toast stack without undoing.
  // `getTxSafety` computes undo state against the current world.
  undoTransaction:   (id: string) => void;
  dismissToast:      (id: string) => void;
  getTxSafety:       (tx: Transaction) => UndoSafety;
  setAppMode:        (m: AppMode) => void;
  setTheme:          (t: Theme) => void;
  // Demo helper: pretend this is the client's first visit. Wipes the stored
  // last-visit timestamp and resets the in-session snapshot so every recent
  // seed event lights up again. Only useful in client mode.
  resetClientVisit:  () => void;
  // ── Review workflow ────────────────────────────────────────────────────
  // After a wip lands in Done it carries `reviewState: "needs_review"`. The
  // reviewer marks it Looks good (which auto-closes the wip's open linked
  // signals) or Follow-up (no cascade; usually paired with createFollowUp).
  // Moving the wip back out of Done reverses the cascade — `moveWip` will
  // re-open any signals it previously closed via this review.
  reviewWipLooksGood: (wipId: string, note?: string) => void;
  reviewWipFollowUp:  (wipId: string, note?: string) => void;
  // Spawn a follow-up item (signal / task / intent) tied back to the
  // origin wip. Tasks/intents reuse the createFromSignal flow and inherit
  // linkedSignals from the origin's linkedSignals (when applicable);
  // signals get a fresh signal record with a backref to the origin wip.
  createFollowUp: (
    originWipId: string,
    kind: "signal" | "task" | "intent",
    opts?: { title?: string; description?: string },
  ) => string | null;
  // Resolve the post-create dialog: "go" navigates to WIP and opens the new
  // item; "stay" keeps the user on Signals and just dismisses the dialog.
}

type Store = StoreState & StoreActions;

const StoreContext = createContext<Store | null>(null);

let wipIdCounter = 19;
let signalIdCounter = 58;
let noteIdCounter = 9;
let sprintIdCounter = 16;
let hideUnderCounter = 4;
let txIdCounter = 1;
let wipEventCounter = 100;

const TOAST_TTL_MS = 8000;
const HISTORY_CAP  = 200;          // hard cap on retained transactions

const CURRENT_USER_ID = "u1";

function makeTxId(): string { return `tx-${String(txIdCounter++).padStart(3, "0")}`; }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [signals, setSignals]               = useState<Signal[]>(SIGNALS);
  const [wipItems, setWipItems]             = useState<Wip[]>(WIP_ITEMS);
  const [sprints, setSprints]               = useState<Sprint[]>(SPRINTS);
  const [notes, setNotes]                   = useState<Note[]>(NOTES);
  const [wipComments, setWipComments]       = useState<WipComment[]>(WIP_COMMENTS);
  const [wipAttachments, setWipAttachments] = useState<WipAttachment[]>(WIP_ATTACHMENTS);
  const [signalComments, setSignalComments] = useState<SignalComment[]>(SIGNAL_COMMENTS);
  const [signalAttachments, setSignalAttachments] = useState<SignalAttachment[]>(SIGNAL_ATTACHMENTS);
  // Rich signal↔wip links carrying a relationship type. Seed from the
  // existing membership lists so every pre-existing link defaults to
  // "resolves" (matches the historical cascade-close behaviour).
  const [signalWipLinks, setSignalWipLinks] = useState<SignalWipLink[]>(() => {
    const out: SignalWipLink[] = [];
    let n = 1;
    for (const s of SIGNALS) {
      for (const wid of s.linkedWip) {
        out.push({
          id: `link-${String(n++).padStart(3, "0")}`,
          signalId: s.id, wipId: wid,
          relationship: "resolves",
          createdAt: s.statusUpdatedAt ?? s.createdAt,
        });
      }
    }
    return out;
  });
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>(DUPLICATE_GROUPS);
  // Post-create banner & transient source-of filter (see Store type for
  // the rationale). Both are intentionally session-only — nothing is
  // persisted to localStorage.
  type PostCreatePrompt = {
    wipId: string;
    type: WipType;
    title: string;
    sourceSignalIds: string[];
    createdAt: string;
  } | null;
  const [postCreatePrompt, setPostCreatePrompt] = useState<PostCreatePrompt>(null);
  const [sourceOfWipFilter, setSourceOfWipFilterState] = useState<string | null>(null);
  const [roadmapFocus, setRoadmapFocus] = useState<Store["roadmapFocus"]>(null);
  // ── Roadmap / traceability state ───────────────────────────────────────
  const [weeklyGoals, setWeeklyGoals]   = useState<WeeklyGoal[]>(WEEKLY_GOALS);
  const [productAreas, setProductAreas] = useState<ProductArea[]>(PRODUCT_AREAS);
  const [features, setFeatures]         = useState<Feature[]>(FEATURES);
  const [featureSlices, setFeatureSlices] = useState<FeatureSlice[]>(FEATURE_SLICES);
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>(FEATURE_GROUPS);
  const [productCapabilities, setProductCapabilities] = useState<ProductCapability[]>(PRODUCT_CAPABILITIES);
  const [releases, setReleases] = useState<Release[]>(RELEASES);
  const [themes, setThemes] = useState<RoadmapTheme[]>(THEMES);
  const [signalGroups, setSignalGroups] = useState<SignalGroup[]>(SIGNAL_GROUPS);
  const [signalGroupFilter, setSignalGroupFilter] = useState<string | null>(null);
  const [signalsViewMode, setSignalsViewModeState] = useState<"list" | "groups">("list");
  const [draftIntents, setDraftIntents] = useState<DraftIntent[]>(DRAFT_INTENTS);
  const [splitView, setSplitView]           = useState<{ leftId: string; rightId: string } | null>(null);
  const [wipEvents, setWipEvents]           = useState<WipEvent[]>(WIP_EVENTS);
  // Default to ~2 days ago so the demo seed has something fresh-looking.
  const [clientPreviousVisitAt, setClientPreviousVisitAt] = useState<string | null>(null);
  const [hideUnderRules, setHideUnderRules] = useState<HideUnderRule[]>(HIDE_UNDER_RULES);
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [toastTxIds, setToastTxIds]         = useState<string[]>([]);
  const [route, setRouteState]              = useState<Route>("signals");
  const [view, setView]                     = useState<ViewMode>("columns");
  const [groupBy, setGroupBy]               = useState<GroupBy>("status");
  const [filters, setFiltersState]          = useState<Filters>({
    status: [], priority: [], author: [], source: [], labels: [], workItem: [], duplicate: [], attribute: [],
  });
  const [search, setSearch]             = useState("");
  const [selection, setSelection]       = useState<string[]>([]);
  const [openSignalId, setOpenSignalId] = useState<string | null>(null);
  const [selectedWipId, setSelectedWipId] = useState<string | null>(null);
  const [density, setDensityState]      = useState<Density>("default");
  const [tweaksOpen, setTweaksOpen]     = useState(false);
  const [defaultView]                   = useState<ViewMode>("columns");
  const [appMode, setAppModeState]      = useState<AppMode>("team");
  const [theme, setThemeState]          = useState<Theme>("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("signal:route") as Route | null;
      if (saved && ["signals","wip","sources","history","roadmap"].includes(saved)) setRouteState(saved);
      const savedMode = localStorage.getItem("signal:appMode") as AppMode | null;
      if (savedMode === "client" || savedMode === "team") {
        setAppModeState(savedMode);
        // Hydrate the visit-snapshot too, since the wrapper setAppMode
        // doesn't run on initial state load.
        if (savedMode === "client") {
          const prev = localStorage.getItem("signal:lastClientVisitAt");
          const fallback = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
          setClientPreviousVisitAt(prev ?? fallback);
        }
      }
      // Theme — also apply data-theme on the html element so the page paints
      // in the right palette before the React shell mounts the toggle.
      const savedTheme = localStorage.getItem("signal:theme") as Theme | null;
      if (savedTheme === "dark" || savedTheme === "light") {
        setThemeState(savedTheme);
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
      // Signals filters — persisted so processing a queue doesn't lose
      // context across refresh or modal interactions. Defensive parse:
      // unknown shapes are ignored and the default filter state stays.
      try {
        const rawFilters = localStorage.getItem("signal:filters");
        if (rawFilters) {
          const parsed = JSON.parse(rawFilters);
          if (parsed && typeof parsed === "object") {
            setFiltersState(prev => ({ ...prev, ...parsed }));
          }
        }
      } catch { /* ignore malformed JSON */ }
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      localStorage.setItem("signal:theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }
  }, []);

  const setRoute = useCallback((r: Route) => {
    setRouteState(r);
    if (typeof window !== "undefined") localStorage.setItem("signal:route", r);
  }, []);

  const setAppMode = useCallback((m: AppMode) => {
    setAppModeState(m);
    if (typeof window !== "undefined") localStorage.setItem("signal:appMode", m);
    // Bounce client out of internal-only routes (sources, history) when
    // they switch into client mode so they don't see a blank page.
    if (m === "client") {
      setRouteState(prev => (prev === "sources" || prev === "history") ? "signals" : prev);
      // Clear any active selection — selection is a team-only construct.
      setSelection([]);
      // Snapshot the previous visit timestamp BEFORE we update it. Any WIP
      // events newer than this snapshot will be highlighted for the duration
      // of this session.
      if (typeof window !== "undefined") {
        const prev = localStorage.getItem("signal:lastClientVisitAt");
        // First-time visitor default: pretend the last visit was 2 days ago
        // so the seed activity has something to highlight in the demo.
        const fallback = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        setClientPreviousVisitAt(prev ?? fallback);
      } else {
        setClientPreviousVisitAt(null);
      }
    } else {
      // Leaving client mode: persist "now" as the latest visit so the next
      // time they re-enter, only fresh-after-this-moment changes light up.
      if (typeof window !== "undefined") {
        localStorage.setItem("signal:lastClientVisitAt", new Date().toISOString());
      }
      setClientPreviousVisitAt(null);
    }
  }, []);

  // Drop the persisted timestamp and re-snapshot to a "couple of days ago"
  // window. The deliberate goal is a *mix*: recent column moves on a few
  // cards light up, but the older creation events (which exist for every
  // card) stay quiet — otherwise every card would highlight and the visual
  // signal would be meaningless. ~2.5 days lands neatly between the most
  // recent creation in the seed (~4d ago) and the oldest move (~2d ago).
  const resetClientVisit = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("signal:lastClientVisitAt");
    }
    const since = new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString();
    setClientPreviousVisitAt(since);
  }, []);

  const setFilters = useCallback((f: Partial<Filters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...f };
      // Persist the merged shape so refresh / navigation keeps the user's
      // queue context. We write the entire Filters object so future fields
      // remain forward-compatible — the load path only takes known keys.
      if (typeof window !== "undefined") {
        try { localStorage.setItem("signal:filters", JSON.stringify(next)); } catch { /* quota / sec */ }
      }
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const selectAll = useCallback((ids: string[]) => setSelection(ids), []);

  const clearSelection = useCallback(() => setSelection([]), []);

  const openSignal = useCallback((id: string | null) => {
    setOpenSignalId(id);
  }, []);

  // ── Transaction recording ──────────────────────────────────────────────
  // Centralised: every mutating action calls this with field-level changes
  // and a human-readable summary. The transaction enters both the persistent
  // `transactions` log (capped) and the ephemeral toast stack. The toast
  // removes itself after TOAST_TTL_MS — but the transaction stays in
  // history regardless.
  const recordTransaction = useCallback((
    input: Omit<Transaction, "id" | "timestamp">,
  ): Transaction => {
    const tx: Transaction = {
      ...input,
      id: makeTxId(),
      timestamp: new Date().toISOString(),
    };
    // Idempotent appends: under React 19 dev, functional updaters may be
    // re-invoked. We guard by id so a re-run of the updater can never
    // double-insert the same transaction.
    setTransactions(prev => {
      if (prev.some(t => t.id === tx.id)) return prev;
      const next = [...prev, tx];
      return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
    });
    setToastTxIds(prev => prev.includes(tx.id) ? prev : [...prev, tx.id]);
    return tx;
  }, []);

  // Append-only WIP event log. Allocates the id outside the updater so a
  // React-19-dev double-invocation can't double-insert (same trick we use
  // for transactions).
  const recordWipEvent = useCallback((input: Omit<WipEvent, "id" | "at">) => {
    const id = `we-${String(wipEventCounter++).padStart(4, "0")}`;
    const event: WipEvent = { ...input, id, at: new Date().toISOString() };
    setWipEvents(prev => prev.some(e => e.id === id) ? prev : [...prev, event]);
  }, []);

  // Auto-dismiss toast entries after TOAST_TTL_MS. Each toast id starts a
  // single timeout based on its tx's timestamp, so re-renders don't reset it.
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    // Schedule removal for any toast id we haven't seen yet.
    toastTxIds.forEach(id => {
      if (toastTimers.current.has(id)) return;
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;
      const elapsed = Date.now() - new Date(tx.timestamp).getTime();
      const remaining = Math.max(0, TOAST_TTL_MS - elapsed);
      const timer = setTimeout(() => {
        setToastTxIds(prev => prev.filter(x => x !== id));
        toastTimers.current.delete(id);
      }, remaining);
      toastTimers.current.set(id, timer);
    });
    // Clean up timers for ids no longer present.
    toastTimers.current.forEach((timer, id) => {
      if (!toastTxIds.includes(id)) {
        clearTimeout(timer);
        toastTimers.current.delete(id);
      }
    });
  }, [toastTxIds, transactions]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => { timers.forEach(t => clearTimeout(t)); timers.clear(); };
  }, []);

  // ── Undo (transaction-driven, field-level) ─────────────────────────────
  // `undoTransaction` evaluates safety against current state, applies only
  // the safe field reverts, and marks the tx as undone. Hide-under and
  // task/intent transactions get their own bespoke revert paths.
  const getTxSafety = useCallback((tx: Transaction): UndoSafety => {
    return getUndoSafety(tx, signals, wipItems);
  }, [signals, wipItems]);

  const undoTransaction = useCallback((id: string) => {
    setTransactions(prevTxs => {
      const tx = prevTxs.find(t => t.id === id);
      if (!tx || tx.undone) return prevTxs;
      const safety = getUndoSafety(tx, signals, wipItems);
      if (safety.state === "unavailable") return prevTxs;

      const now = new Date().toISOString();

      // Field-level reverts apply for all field-shaped actions and partially
      // for task/intent creation (the signal-side changes from those).
      if (safety.state === "available" || safety.state === "warning") {
        if (safety.safeChanges.length > 0) {
          setSignals(prevSigs => {
            const byId = new Map(prevSigs.map(s => [s.id, s] as const));
            for (const change of safety.safeChanges) {
              const cur = byId.get(change.signalId);
              if (!cur) continue;
              const next = { ...cur, [change.field]: change.before } as Signal;
              // Status change carries an implicit statusUpdatedAt revert.
              if (change.field === "status") next.statusUpdatedAt = now;
              byId.set(change.signalId, next);
            }
            return prevSigs.map(s => byId.get(s.id) ?? s);
          });
        }
      }

      // Hide-under family: replay the pre-action snapshot.
      if (tx.action === "hide_under" || tx.action === "remove_hide_rule" || tx.action === "restore_from_hidden") {
        const snap = tx.hideUnderBefore;
        if (snap) {
          setHideUnderRules(prevRules => {
            // Drop any existing rule with the same key — we'll re-create it.
            const otherRules = prevRules.filter(r => r.id !== snap.ruleId);
            // If the snapshot says the rule didn't exist before AND it's
            // currently empty, leave it gone.
            if (!snap.existedBefore && snap.hiddenSignalIds.length === 0) {
              return otherRules;
            }
            const restored: HideUnderRule = {
              id: snap.ruleId,
              filterLabels: snap.filterLabels,
              mainSignalId: snap.mainSignalId,
              // Skip ids whose signals no longer exist — those are unrecoverable.
              hiddenSignalIds: snap.hiddenSignalIds.filter(id => signals.some(s => s.id === id)),
              createdAt: tx.timestamp,
            };
            if (!snap.existedBefore && restored.hiddenSignalIds.length === 0) {
              return otherRules;
            }
            return [...otherRules, restored];
          });
        }
      }

      // Task/intent creation undo: remove the work item and unlink it from
      // each signal's linkedWip. Only reachable when safety allowed it
      // (we already checked column === "to_do" in the safety helper).
      if (tx.action === "task_created" || tx.action === "intent_created") {
        const wipId = tx.taskId ?? tx.intentId;
        if (wipId) {
          setWipItems(prevWips => prevWips.filter(w => w.id !== wipId));
          setSignals(prevSigs => prevSigs.map(s =>
            s.linkedWip.includes(wipId)
              ? { ...s, linkedWip: s.linkedWip.filter(id => id !== wipId) }
              : s
          ));
        }
      }

      // Mark the transaction as undone, keep it in history.
      return prevTxs.map(t => t.id === id ? { ...t, undone: true, undoneAt: now } : t);
    });

    // Drop from the toast stack.
    setToastTxIds(prev => prev.filter(x => x !== id));
  }, [signals, wipItems]);

  const dismissToast = useCallback((id: string) => {
    setToastTxIds(prev => prev.filter(x => x !== id));
  }, []);

  // ── Mutating actions ───────────────────────────────────────────────────
  // Each action computes its FieldChange[] BEFORE mutating, then records
  // the transaction. This way the `before` values reflect pre-action state.

  const updateSignal = useCallback((id: string, patch: Partial<Signal>) => {
    const current = signals.find(s => s.id === id);
    if (!current) return;

    const changes: FieldChange[] = [];
    let action: TransactionAction | null = null;
    let summary = "";

    if (patch.status !== undefined && patch.status !== current.status) {
      changes.push({ signalId: id, field: "status", before: current.status, after: patch.status });
      action = "status_change";
      summary = summariseStatus(patch.status, 1);
    }
    if (patch.priority !== undefined && patch.priority !== current.priority) {
      changes.push({ signalId: id, field: "priority", before: current.priority, after: patch.priority });
      action = action ?? "priority_change";
      summary = summary || `Priority set to ${patch.priority}`;
    }
    if (patch.labels !== undefined) {
      const beforeArr = current.labels;
      const afterArr  = patch.labels;
      const beforeStr = JSON.stringify(beforeArr);
      const afterStr  = JSON.stringify(afterArr);
      if (beforeStr !== afterStr) {
        changes.push({ signalId: id, field: "labels", before: beforeArr, after: afterArr });
        const added   = afterArr.filter((l: string) => !beforeArr.includes(l));
        const removed = beforeArr.filter((l: string) => !afterArr.includes(l));
        action = action ?? (added.length > 0 ? "labels_add" : "labels_remove");
        if (!summary) {
          if (added.length > 0 && removed.length === 0)      summary = `Label${added.length === 1 ? "" : "s"} added`;
          else if (removed.length > 0 && added.length === 0) summary = `Label${removed.length === 1 ? "" : "s"} removed`;
          else                                                summary = `Labels updated`;
        }
      }
    }

    setSignals(prev => prev.map(s => {
      if (s.id !== id) return s;
      const now = new Date().toISOString();
      const next: Signal = { ...s, ...patch };
      if (patch.status && patch.status !== s.status) next.statusUpdatedAt = now;
      // Stamp a closure reason on manual close so the modal can render
      // "Closed manually by …". If the signal already had a closure (e.g.
      // task_done), don't overwrite — the prior reason is more specific.
      // Callers can pre-populate `patch.closure` with a `note` to record
      // a free-text reason ("out of scope", "covered by …"); we keep that
      // note while filling in the canonical reason / actor / timestamp.
      if (patch.status === "closed" && s.status !== "closed" && !s.closure) {
        const note = patch.closure?.note;
        next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now, ...(note ? { note } : {}) };
      }
      // Clear closure reason on reopen so a future close gets a fresh
      // (possibly different) reason.
      if (patch.status && patch.status !== "closed" && s.status === "closed") {
        next.closure = undefined;
      }
      return next;
    }));

    if (action && changes.length > 0) {
      recordTransaction({
        action, actor: CURRENT_USER_ID,
        summary, affectedSignalIds: [id], changes,
      });
    }
  }, [signals, recordTransaction]);

  // ── Link signal ↔ work item ────────────────────────────────────────────
  // Idempotent: when (signalId, wipId) already exist we update the
  // relationship in-place instead of duplicating. Always patches the
  // membership lists on both ends so existing read paths keep working.
  // Per spec: linking a signal to work always also flips the signal to
  // Ready (a signal that has linked work IS Ready by definition).
  const linkSignalToWip = useCallback((signalId: string, wipId: string, relationship: SignalWipRelationship) => {
    const signal = signals.find(s => s.id === signalId);
    const wip    = wipItems.find(w => w.id === wipId);
    if (!signal || !wip) return;
    const now = new Date().toISOString();
    // Update / insert the link row.
    setSignalWipLinks(prev => {
      const existing = prev.find(l => l.signalId === signalId && l.wipId === wipId);
      if (existing) {
        if (existing.relationship === relationship) return prev;
        return prev.map(l =>
          l.signalId === signalId && l.wipId === wipId
            ? { ...l, relationship }
            : l
        );
      }
      const newLink: SignalWipLink = {
        id: `link-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        signalId, wipId, relationship,
        createdAt: now, createdBy: CURRENT_USER_ID,
      };
      // Idempotent under React 19 dev double-invokes — guard by composite.
      if (prev.some(l => l.signalId === signalId && l.wipId === wipId)) return prev;
      return [...prev, newLink];
    });
    // Sync membership lists on both sides AND flip the signal to Ready
    // (signals with linked work are always Ready per product rule).
    setSignals(prev => prev.map(s => {
      if (s.id !== signalId) return s;
      const next: Signal = { ...s };
      if (!next.linkedWip.includes(wipId)) next.linkedWip = [...next.linkedWip, wipId];
      if (next.status !== "ready" && next.status !== "closed") {
        next.status = "ready";
        next.statusUpdatedAt = now;
        next.closure = undefined;
      }
      return next;
    }));
    setWipItems(prev => prev.map(w =>
      w.id === wipId && !w.linkedSignals.includes(signalId)
        ? { ...w, linkedSignals: [...w.linkedSignals, signalId] }
        : w
    ));
    // Emit a small toast so the user gets a "what happened" confirmation.
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `Linked to ${wip.type === "task" ? "Task" : "Intent"} "${wip.title}" (${relationship.replace(/_/g, " ")})`,
      affectedSignalIds: [signalId],
      changes: [],
    });
  }, [signals, wipItems, recordTransaction]);

  const unlinkSignalFromWip = useCallback((signalId: string, wipId: string) => {
    // Capture pre-mutation titles so the activity log can reference
    // them by name even after the links collapse.
    const sig = signals.find(s => s.id === signalId);
    const wip = wipItems.find(w => w.id === wipId);
    setSignalWipLinks(prev => prev.filter(l => !(l.signalId === signalId && l.wipId === wipId)));
    setSignals(prev => prev.map(s =>
      s.id === signalId
        ? { ...s, linkedWip: s.linkedWip.filter(id => id !== wipId) }
        : s
    ));
    setWipItems(prev => prev.map(w =>
      w.id === wipId
        ? { ...w, linkedSignals: w.linkedSignals.filter(id => id !== signalId) }
        : w
    ));
    // Record the action in BOTH histories: signal-side via the
    // transaction log, wip-side via a WipEvent so the Activity tab
    // shows "<signal> removed as source".
    const sigTitle = sig?.title ?? signalId;
    const wipTitle = wip?.title ?? wipId;
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `Source-signal link removed from "${wipTitle}"`,
      affectedSignalIds: [signalId],
      changes: [],
    });
    recordWipEvent({
      wipId, kind: "signal_linked",
      // We reuse the existing "signal_linked" kind to keep the
      // event-kind enum stable; the surfacing logic in describeWipEvent
      // distinguishes link vs unlink by the new `unlinked` flag.
      signalId,
      unlinked: true,
      actor: CURRENT_USER_ID,
    });
    void sigTitle;
  }, [signals, wipItems, recordTransaction, recordWipEvent]);

  const setLinkRelationship = useCallback((signalId: string, wipId: string, relationship: SignalWipRelationship) => {
    setSignalWipLinks(prev => prev.map(l =>
      l.signalId === signalId && l.wipId === wipId && l.relationship !== relationship
        ? { ...l, relationship }
        : l
    ));
  }, []);

  const skipSignal = useCallback((id: string, untilISO: string | null, reason?: string) => {
    const current = signals.find(s => s.id === id);
    if (!current) return;
    if (current.status === "skipped") return;
    const now = new Date().toISOString();
    const trimmed = reason?.trim() || undefined;
    setSignals(prev => prev.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        status: "skipped",
        statusUpdatedAt: now,
        preSkipStatus: s.status,
        skipUntil: untilISO,
        ...(trimmed ? { skipReason: trimmed } : {}),
      };
    }));
    const untilLabel = untilISO
      ? `until ${new Date(untilISO).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "indefinitely";
    recordTransaction({
      action: "status_change", actor: CURRENT_USER_ID,
      summary: `Skipped ${untilLabel}${trimmed ? ` · ${trimmed}` : ""}`,
      affectedSignalIds: [id],
      changes: [{ signalId: id, field: "status", before: current.status, after: "skipped" }],
    });
  }, [signals, recordTransaction]);

  const rejectSignalWithReason = useCallback((id: string, reason?: string) => {
    const current = signals.find(s => s.id === id);
    if (!current || current.status === "rejected") return;
    const now = new Date().toISOString();
    const trimmed = reason?.trim() || undefined;
    setSignals(prev => prev.map(s =>
      s.id === id
        ? { ...s, status: "rejected", statusUpdatedAt: now, ...(trimmed ? { rejectionReason: trimmed } : {}) }
        : s
    ));
    recordTransaction({
      action: "status_change", actor: CURRENT_USER_ID,
      summary: trimmed ? `Rejected: ${trimmed}` : `1 signal rejected`,
      affectedSignalIds: [id],
      changes: [{ signalId: id, field: "status", before: current.status, after: "rejected" }],
    });
  }, [signals, recordTransaction]);

  const reopenSignalWithReason = useCallback((id: string, reason?: string) => {
    const current = signals.find(s => s.id === id);
    if (!current) return;
    const now = new Date().toISOString();
    const trimmed = reason?.trim() || undefined;
    // Reopen target status: "new" by default, but if the signal still has
    // linked work we use "ready" (signals with linked work are Ready).
    const targetStatus: SignalStatus = current.linkedWip.length > 0 ? "ready" : "new";
    setSignals(prev => prev.map(s =>
      s.id === id
        ? {
            ...s,
            status: targetStatus,
            statusUpdatedAt: now,
            closure: undefined,
            ...(trimmed ? { reopenReason: trimmed } : {}),
          }
        : s
    ));
    recordTransaction({
      action: "status_change", actor: CURRENT_USER_ID,
      summary: trimmed ? `Reopened: ${trimmed}` : `1 signal reopened`,
      affectedSignalIds: [id],
      changes: [{ signalId: id, field: "status", before: current.status, after: targetStatus }],
    });
  }, [signals, recordTransaction]);

  const reviveSkip = useCallback((id: string) => {
    const current = signals.find(s => s.id === id);
    if (!current || current.status !== "skipped") return;
    const now = new Date().toISOString();
    const target: SignalStatus = current.preSkipStatus ?? "new";
    setSignals(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next: Signal = { ...s, status: target, statusUpdatedAt: now };
      // Wipe skip bookkeeping so a future skip starts clean.
      next.skipUntil = undefined;
      next.skipReason = undefined;
      next.preSkipStatus = undefined;
      return next;
    }));
    recordTransaction({
      action: "status_change", actor: CURRENT_USER_ID,
      summary: `Skip ended — returned to ${target}`,
      affectedSignalIds: [id],
      changes: [{ signalId: id, field: "status", before: "skipped", after: target }],
    });
  }, [signals, recordTransaction]);

  const setTpaNote = useCallback((signalId: string, text: string) => {
    const trimmed = text;  // preserve user spacing; only trim on emptiness check
    const current = signals.find(s => s.id === signalId);
    if (!current) return;
    const prev = current.tpaNote ?? "";
    // No-op when content is unchanged — saves on blur fire even when the
    // user just clicked away without typing, so we guard here rather
    // than spamming the history feed.
    if (prev === trimmed) return;
    const now = new Date().toISOString();
    const willClear = trimmed.trim().length === 0;
    setSignals(prevList => prevList.map(s => {
      if (s.id !== signalId) return s;
      if (willClear) {
        // Clearing — drop the fields entirely so the empty state matches
        // a signal that never had a note.
        const { tpaNote: _n, tpaNoteAt: _a, tpaNoteBy: _b, ...rest } = s;
        void _n; void _a; void _b;
        return rest as Signal;
      }
      return { ...s, tpaNote: trimmed, tpaNoteAt: now, tpaNoteBy: CURRENT_USER_ID };
    }));
    // One activity event per actual edit. The summary intentionally
    // omits the note body so the feed stays scannable.
    const isFirstEdit = prev.length === 0;
    const summary = willClear
      ? "TPA note removed"
      : (isFirstEdit ? "TPA note added" : "TPA note updated");
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary,
      affectedSignalIds: [signalId],
      changes: [],
    });
  }, [signals, recordTransaction]);

  const closeSignalWithReason = useCallback((id: string, note?: string) => {
    const current = signals.find(s => s.id === id);
    if (!current || current.status === "closed") return;
    const now = new Date().toISOString();
    const closure: SignalClosure = {
      reason: "manual", actor: CURRENT_USER_ID, at: now,
      ...(note && note.trim() ? { note: note.trim() } : {}),
    };
    setSignals(prev => prev.map(s =>
      s.id === id
        ? { ...s, status: "closed", statusUpdatedAt: now, closure }
        : s
    ));
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: note && note.trim() ? `Closed: ${note.trim()}` : `1 signal closed`,
      affectedSignalIds: [id],
      changes: [{ signalId: id, field: "status", before: current.status, after: "closed" }],
    });
  }, [signals, recordTransaction]);

  // Clone a signal so the user can split a long one into focused pieces.
  // The clone:
  //   • gets a fresh id and is inserted into `signals` immediately after the
  //     original so every view renders them adjacent;
  //   • carries forward title (with a "(copy)" suffix), description, labels,
  //     priority, source, screenshots, author, status — the substance the
  //     user is about to edit;
  //   • drops linkedWip and processingRecords (those belong to the original
  //     work, not to the new piece);
  //   • bumps `createdAt` slightly past the original's so newest-first sort
  //     keeps the clone right above the source instead of bouncing it to the
  //     top of the column.
  const cloneSignal = useCallback((id: string): string | null => {
    const source = signals.find(s => s.id === id);
    if (!source) return null;
    // Splits cap at SPLIT_MAX_PER_SOURCE per source — count children that
    // already point back at this source via splitFromId. We attach the
    // lineage to the *original* (the root), not the chain — every clone of
    // a clone still points to the original root, so the cap stays meaningful.
    const rootId = source.splitFromId ?? source.id;
    if (splitChildrenCount(signals, rootId) >= SPLIT_MAX_PER_SOURCE) return null;
    const newId = `s${String(signalIdCounter++).padStart(2, "0")}`;
    const sourceMs = new Date(source.createdAt).getTime();
    // +1ms past the original — keeps adjacency under newest-first sort.
    const newCreated = new Date(sourceMs + 1).toISOString();
    const clone: Signal = {
      ...source,
      id: newId,
      title: `${source.title} (copy)`,
      createdAt: newCreated,
      splitFromId: rootId,
      status: "new",
      // Reset state that doesn't carry over to a "split" piece.
      statusUpdatedAt: null,
      linkedWip: [],
      closure: undefined,
      // Defensive copies of arrays so editing one doesn't mutate the other.
      labels: [...source.labels],
    };
    setSignals(prev => {
      // Bail on duplicate id (idempotent under React 19 dev double-invoke).
      if (prev.some(s => s.id === newId)) return prev;
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return [...prev, clone];
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
    // Open the side-by-side editor with both signals visible. Also drop
    // any single-signal modal that might be open so we don't stack two
    // overlay layers when split is launched from the regular modal.
    setSplitView({ leftId: id, rightId: newId });
    setOpenSignalId(null);
    // Record split in history. AffectedSignalIds covers both the source
    // (where the action originated) and the new child (so the child's
    // own history feed shows where it came from).
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `Signal split — new piece created from "${source.title}"`,
      affectedSignalIds: [source.id, newId],
      changes: [],
    });
    return newId;
  }, [signals, recordTransaction]);

  const openSplitView = useCallback((leftId: string, rightId: string) => {
    setSplitView({ leftId, rightId });
    setOpenSignalId(null);
  }, []);
  const closeSplitView = useCallback(() => setSplitView(null), []);

  const splitSignal = useCallback((
    rootId: string,
    pieces: { title: string; description: string; tpaNote?: string }[],
  ): string[] => {
    const source = signals.find(s => s.id === rootId);
    if (!source) return [];
    // Lineage always points at the root, never at a chained derivative.
    const lineageRoot = source.splitFromId ?? source.id;
    // Cap: existing children + new pieces ≤ SPLIT_MAX_PER_SOURCE. Drop
    // any pieces past the cap so the user never accidentally exceeds
    // it via a stale-state edge case.
    const existing = splitChildrenCount(signals, lineageRoot);
    const remaining = Math.max(0, SPLIT_MAX_PER_SOURCE - existing);
    const accepted = pieces.slice(0, remaining);
    if (accepted.length === 0) return [];

    const now = Date.now();
    const newIds: string[] = [];
    const newSignals: Signal[] = accepted.map((p, idx) => {
      const newId = `s${String(signalIdCounter++).padStart(2, "0")}`;
      newIds.push(newId);
      const createdAtISO = new Date(now + idx + 1).toISOString();
      const trimmedTitle = p.title.trim() || `${source.title} (${idx + 1})`;
      const noteText = p.tpaNote?.trim();
      const child: Signal = {
        id: newId,
        title: trimmedTitle,
        description: p.description,
        labels: [...source.labels],
        author: source.author,
        source: source.source,
        status: "new",
        screenshots: 0,
        createdAt: createdAtISO,
        statusUpdatedAt: null,
        linkedWip: [],
        priority: source.priority,
        splitFromId: lineageRoot,
      };
      if (noteText) {
        child.tpaNote = noteText;
        child.tpaNoteAt = createdAtISO;
        child.tpaNoteBy = CURRENT_USER_ID;
      }
      return child;
    });

    // Insert all children directly after the source so newest-first
    // sort keeps them visually adjacent. Idempotent: skip ids already
    // present (defends React 19 dev double-invocations).
    setSignals(prev => {
      if (newSignals.every(c => prev.some(s => s.id === c.id))) return prev;
      const idx = prev.findIndex(s => s.id === source.id);
      if (idx === -1) return [...prev, ...newSignals];
      return [...prev.slice(0, idx + 1), ...newSignals, ...prev.slice(idx + 1)];
    });

    // Preserve SignalGroup membership across split — the spec requires
    // both children to inherit every group the parent was in, so the
    // workspace stays coherent after a split. The user can later remove
    // one child from a group via the workspace.
    setSignalGroups(prev => prev.map(g => {
      if (!g.signalIds.includes(source.id)) return g;
      const toAdd = newIds.filter(nid => !g.signalIds.includes(nid));
      if (toAdd.length === 0) return g;
      return { ...g, signalIds: [...g.signalIds, ...toAdd], updatedAt: new Date().toISOString() };
    }));

    // History — one event on the root summarising the action, and one
    // per child explaining its origin (so the child's own history
    // tells the full story without cross-referencing the root).
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `Split into ${accepted.length} signal${accepted.length === 1 ? "" : "s"}`,
      affectedSignalIds: [source.id, ...newIds],
      changes: [],
    });
    for (const childId of newIds) {
      recordTransaction({
        action: "status_change",
        actor: CURRENT_USER_ID,
        summary: `Created from split of "${source.title}"`,
        affectedSignalIds: [childId],
        changes: [],
      });
    }
    return newIds;
  }, [signals, recordTransaction]);

  // ── Duplicate group actions ──────────────────────────────────────────────
  // The four edit actions all touch `duplicateGroups` and auto-delete a
  // group that drops below 2 members. `applyStatusToDuplicateGroup` walks
  // the group and routes each signal through a setSignals patch so the
  // closure-stamping logic in updateSignal still runs (we inline a slim
  // version of it here to keep the bulk path single-pass).

  const acceptDuplicateGroup = useCallback((groupId: string) => {
    const now = new Date().toISOString();
    const group = duplicateGroups.find(g => g.id === groupId);
    if (!group) return;
    // Status-adopt-on-accept: every member of the group inherits the main
    // signal's current status. If `mainSignalId` is unset we use the
    // oldest-by-createdAt rule (mirrors `mainSignalOf`). The wip / closure
    // / readiness side-effects route through the same code paths the
    // per-signal `updateSignal` uses so cascades stay consistent.
    const mainExplicit = group.mainSignalId && group.signalIds.includes(group.mainSignalId)
      ? signals.find(s => s.id === group.mainSignalId)
      : undefined;
    const main = mainExplicit ?? group.signalIds
      .map(id => signals.find(s => s.id === id))
      .filter((s): s is Signal => !!s)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    setDuplicateGroups(prev => prev.map(g =>
      g.id === groupId
        ? { ...g, confirmed: true, confirmedAt: now }
        : g
    ));
    if (main) {
      const targetStatus = main.status;
      setSignals(prev => prev.map(s => {
        if (!group.signalIds.includes(s.id)) return s;
        if (s.status === targetStatus) return s;
        const next: Signal = { ...s, status: targetStatus, statusUpdatedAt: now };
        if (targetStatus === "closed" && s.status !== "closed" && !next.closure) {
          next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
        }
        if (targetStatus !== "closed" && s.status === "closed") next.closure = undefined;
        return next;
      }));
    }
  }, [duplicateGroups, signals]);

  const rejectDuplicateGroup = useCallback((groupId: string) => {
    setDuplicateGroups(prev => prev.filter(g => g.id !== groupId));
  }, []);

  const removeSignalFromDuplicateGroup = useCallback((groupId: string, signalId: string) => {
    // Snapshot the group BEFORE mutation so we can compute which WIP links
    // were inherited via the group (i.e. shared with other members) and
    // strip them from the leaving signal. Manually-created links unique to
    // this signal stay attached.
    const group = duplicateGroups.find(g => g.id === groupId);
    setDuplicateGroups(prev => {
      const out: DuplicateGroup[] = [];
      for (const g of prev) {
        if (g.id !== groupId) { out.push(g); continue; }
        const next = g.signalIds.filter(id => id !== signalId);
        // Per spec: drop the group entirely if fewer than 2 members remain.
        if (next.length < 2) continue;
        // If the leaving signal was the main signal, clear `mainSignalId`
        // so the default-oldest rule re-resolves on next render.
        const nextMain = g.mainSignalId === signalId ? undefined : g.mainSignalId;
        out.push({ ...g, signalIds: next, mainSignalId: nextMain });
      }
      return out;
    });
    if (group) {
      // Compute inherited wip ids: those that were in the leaving signal's
      // linkedWip AND in at least one OTHER current member's linkedWip.
      const otherMemberIds = group.signalIds.filter(id => id !== signalId);
      const sharedWipIds = new Set<string>();
      const leavingSignal = signals.find(s => s.id === signalId);
      if (leavingSignal) {
        for (const wid of leavingSignal.linkedWip) {
          for (const otherId of otherMemberIds) {
            const other = signals.find(s => s.id === otherId);
            if (other?.linkedWip.includes(wid)) {
              sharedWipIds.add(wid);
              break;
            }
          }
        }
      }
      if (sharedWipIds.size > 0) {
        // Drop the inherited links from BOTH sides: signal's linkedWip and
        // each affected wip's linkedSignals. Leaves manually-attached wips
        // (those not shared with any other member) untouched.
        setSignals(prev => prev.map(s =>
          s.id === signalId
            ? { ...s, linkedWip: s.linkedWip.filter(wid => !sharedWipIds.has(wid)) }
            : s
        ));
        setWipItems(prev => prev.map(w =>
          sharedWipIds.has(w.id)
            ? { ...w, linkedSignals: w.linkedSignals.filter(id => id !== signalId) }
            : w
        ));
      }
    }
  }, [duplicateGroups, signals]);

  const addSignalToDuplicateGroup = useCallback((groupId: string, signalId: string) => {
    // Joining a confirmed group means the new signal inherits the main's
    // status AND any WIP links shared by current members. We resolve those
    // before mutating so the writes stay synchronous.
    const group = duplicateGroups.find(g => g.id === groupId);
    if (!group) return;
    if (group.signalIds.includes(signalId)) return;
    const now = new Date().toISOString();
    setDuplicateGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, signalIds: [...g.signalIds, signalId] } : g
    ));
    if (group.confirmed) {
      // Inherit main signal's status and shared WIP links.
      const main = group.mainSignalId && group.signalIds.includes(group.mainSignalId)
        ? signals.find(s => s.id === group.mainSignalId)
        : group.signalIds
            .map(id => signals.find(s => s.id === id))
            .filter((s): s is Signal => !!s)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      const wipsToInherit = new Set<string>();
      for (const id of group.signalIds) {
        const other = signals.find(s => s.id === id);
        if (other) for (const wid of other.linkedWip) wipsToInherit.add(wid);
      }
      setSignals(prev => prev.map(s => {
        if (s.id !== signalId) return s;
        const next: Signal = { ...s };
        if (main && next.status !== main.status) {
          next.status = main.status;
          next.statusUpdatedAt = now;
          if (main.status === "closed" && !next.closure) {
            next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
          }
          if (main.status !== "closed") next.closure = undefined;
        }
        // Add any wip links that aren't already on this signal.
        const missing = Array.from(wipsToInherit).filter(wid => !next.linkedWip.includes(wid));
        if (missing.length > 0) next.linkedWip = [...next.linkedWip, ...missing];
        // Per spec: a signal that has a linked task/intent must be Ready.
        // If we just inherited any wip link AND the joining signal isn't
        // already closed, force the status to Ready (overriding the main
        // status adoption above when those disagree). Closed signals stay
        // closed — a settled close shouldn't be re-opened by a join.
        if (wipsToInherit.size > 0 && next.status !== "ready" && next.status !== "closed") {
          next.status = "ready";
          next.statusUpdatedAt = now;
          next.closure = undefined;
        }
        return next;
      }));
      // Also push the new signal id onto each inherited wip's linkedSignals.
      if (wipsToInherit.size > 0) {
        setWipItems(prev => prev.map(w =>
          wipsToInherit.has(w.id) && !w.linkedSignals.includes(signalId)
            ? { ...w, linkedSignals: [...w.linkedSignals, signalId] }
            : w
        ));
      }
    }
  }, [duplicateGroups, signals]);

  const setMainSignal = useCallback((groupId: string, signalId: string) => {
    setDuplicateGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      if (!g.signalIds.includes(signalId)) return g;
      if (g.mainSignalId === signalId) return g;
      return { ...g, mainSignalId: signalId };
    }));
  }, []);

  const addDuplicateLink = useCallback((originSignalId: string, otherSignalId: string): string | null => {
    if (originSignalId === otherSignalId) return null;
    const origin = signals.find(s => s.id === originSignalId);
    const other  = signals.find(s => s.id === otherSignalId);
    if (!origin || !other) return null;
    // Reject if the other signal is already in some other duplicate group —
    // a signal can only belong to one group at a time.
    const otherGroup = duplicateGroups.find(g => g.signalIds.includes(otherSignalId));
    const originGroup = duplicateGroups.find(g => g.signalIds.includes(originSignalId));
    if (otherGroup && otherGroup.id !== originGroup?.id) return null;
    if (originGroup) {
      // Reuse the existing group. If it was a suggestion, auto-confirm it
      // — manual link is an explicit user decision.
      const groupId = originGroup.id;
      addSignalToDuplicateGroup(groupId, otherSignalId);
      if (!originGroup.confirmed) {
        // acceptDuplicateGroup also adopts status; safe to call after add.
        acceptDuplicateGroup(groupId);
      }
      return groupId;
    }
    // Brand new confirmed group with both signals.
    const newId = `dup-${String(duplicateGroups.length + 1).padStart(3, "0")}-m`;
    const now = new Date().toISOString();
    const newGroup: DuplicateGroup = {
      id: newId, signalIds: [originSignalId, otherSignalId],
      confirmed: true, createdAt: now, confirmedAt: now,
      reason: "Manually linked",
      reasons: ["Manually linked by user"],
    };
    setDuplicateGroups(prev => prev.some(g => g.id === newId) ? prev : [...prev, newGroup]);
    // Adopt the origin's status as the main (origin is older or equal —
    // we'll let the default-oldest rule pick it on render).
    const main = new Date(origin.createdAt).getTime() <= new Date(other.createdAt).getTime() ? origin : other;
    if (main.status !== other.status || main.status !== origin.status) {
      const targetStatus = main.status;
      setSignals(prev => prev.map(s => {
        if (s.id !== originSignalId && s.id !== otherSignalId) return s;
        if (s.status === targetStatus) return s;
        const next: Signal = { ...s, status: targetStatus, statusUpdatedAt: now };
        if (targetStatus === "closed" && s.status !== "closed" && !next.closure) {
          next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
        }
        if (targetStatus !== "closed" && s.status === "closed") next.closure = undefined;
        return next;
      }));
    }
    return newId;
  }, [signals, duplicateGroups, addSignalToDuplicateGroup, acceptDuplicateGroup]);

  // Bulk-friendly "mark these signals as duplicates of one main signal".
  // Reuses addDuplicateLink under the hood, then explicitly pins the
  // chosen main via setMainSignal so the user's intent isn't overridden
  // by the oldest-by-default rule. The first successful link's group id
  // is returned for the caller (e.g. so the UI can highlight it).
  const markSignalsAsDuplicatesOf = useCallback((mainSignalId: string, otherSignalIds: string[]): string | null => {
    if (otherSignalIds.length === 0) return null;
    let resultGroupId: string | null = null;
    for (const otherId of otherSignalIds) {
      if (otherId === mainSignalId) continue;
      const gid = addDuplicateLink(mainSignalId, otherId);
      if (gid && !resultGroupId) resultGroupId = gid;
    }
    if (resultGroupId) setMainSignal(resultGroupId, mainSignalId);
    return resultGroupId;
  }, [addDuplicateLink, setMainSignal]);

  // Explicit "Closed as duplicate of <title>". Calls the regular close
  // path so the closure record, status update, and follow-up effects
  // (signal review cascades, etc.) all happen unchanged — we just stamp
  // the closure note with a structured marker the signal modal can read.
  const closeSignalAsDuplicateOf = useCallback((signalId: string, mainSignalId: string) => {
    const main = signals.find(s => s.id === mainSignalId);
    const mainTitle = main?.title ?? mainSignalId;
    closeSignalWithReason(signalId, `Closed as duplicate of "${mainTitle}"`);
  }, [signals, closeSignalWithReason]);

  const closeDuplicateGroup = useCallback((groupId: string) => {
    const group = duplicateGroups.find(g => g.id === groupId);
    if (!group) return;
    const now = new Date().toISOString();
    setSignals(prev => prev.map(s => {
      if (!group.signalIds.includes(s.id)) return s;
      if (s.status === "closed") return s;
      return {
        ...s,
        status: "closed",
        statusUpdatedAt: now,
        closure: s.closure ?? { reason: "manual", actor: CURRENT_USER_ID, at: now },
      };
    }));
  }, [duplicateGroups]);

  const createWipFromDuplicateGroup = useCallback((
    groupId: string, type: WipType, opts?: { description?: string; assignee?: string | null },
  ): string | null => {
    const group = duplicateGroups.find(g => g.id === groupId);
    if (!group || group.signalIds.length === 0) return null;
    const main = group.mainSignalId && group.signalIds.includes(group.mainSignalId)
      ? signals.find(s => s.id === group.mainSignalId)
      : group.signalIds
          .map(id => signals.find(s => s.id === id))
          .filter((s): s is Signal => !!s)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    if (!main) return null;
    const newId = `w-${String(wipIdCounter++).padStart(2, "0")}`;
    const now = new Date().toISOString();
    const newWip: Wip = {
      id: newId, type,
      title: main.title,
      description: opts?.description ?? main.description,
      column: "to_do",
      location: sprints.find(s => s.active)?.id || "backlog",
      assignee: opts?.assignee ?? null,
      // Link ALL group members so the WIP carries the duplicate context.
      linkedSignals: group.signalIds.slice(),
    };
    setWipItems(prev => prev.some(w => w.id === newId) ? prev : [...prev, newWip]);
    setSignals(prev => prev.map(s => {
      if (!group.signalIds.includes(s.id)) return s;
      const next: Signal = { ...s };
      // Flip every member to Ready (the canonical "linked work exists" state).
      if (next.status !== "ready") {
        next.status = "ready";
        next.statusUpdatedAt = now;
        next.closure = undefined;
      }
      if (!next.linkedWip.includes(newId)) next.linkedWip = [...next.linkedWip, newId];
      return next;
    }));
    // Seed link rows for every group member so the relationship table
    // mirrors the membership lists.
    {
      const defaultRel: SignalWipRelationship = type === "intent" ? "resolves" : "researches";
      setSignalWipLinks(prev => {
        const next = prev.slice();
        for (const sid of group.signalIds) {
          if (next.some(l => l.signalId === sid && l.wipId === newId)) continue;
          next.push({
            id: `link-${Date.now().toString(36)}-${next.length}`,
            signalId: sid, wipId: newId,
            relationship: defaultRel,
            createdAt: now, createdBy: CURRENT_USER_ID,
          });
        }
        return next;
      });
    }
    setOpenSignalId(null);
    setRouteState("wip");
    if (typeof window !== "undefined") localStorage.setItem("signal:route", "wip");
    setSelectedWipId(newId);
    recordTransaction({
      action: type === "task" ? "task_created" : "intent_created",
      actor: CURRENT_USER_ID,
      summary: `${type === "task" ? "Task" : "Intent"} created from duplicate group of ${group.signalIds.length}`,
      affectedSignalIds: group.signalIds.slice(),
      changes: [],
      ...(type === "task" ? { taskId: newId } : { intentId: newId }),
    });
    recordWipEvent({
      wipId: newId, kind: "created",
      toColumn: newWip.column, toLocation: newWip.location,
      actor: CURRENT_USER_ID,
    });
    return newId;
  }, [duplicateGroups, signals, sprints, recordTransaction, recordWipEvent]);

  const markDuplicateGroupSeen = useCallback((groupId: string) => {
    setDuplicateGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      // Skip the write when the snapshot already matches — keeps React 19
      // dev double-invokes idempotent and avoids extra renders.
      const same = g.seenSignalIds
        && g.seenSignalIds.length === g.signalIds.length
        && g.seenSignalIds.every(id => g.signalIds.includes(id));
      if (same) return g;
      return { ...g, seenSignalIds: [...g.signalIds] };
    }));
  }, []);

  const applyStatusToDuplicateGroup = useCallback((groupId: string, status: SignalStatus) => {
    const group = duplicateGroups.find(g => g.id === groupId);
    if (!group) return;
    const now = new Date().toISOString();
    setSignals(prev => prev.map(s => {
      if (!group.signalIds.includes(s.id)) return s;
      if (s.status === status) return s;
      const next: Signal = { ...s, status, statusUpdatedAt: now };
      // Stamp closure for manual close, clear for reopen — same logic as
      // the per-signal updateSignal path.
      if (status === "closed" && s.status !== "closed" && !next.closure) {
        next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
      }
      if (status !== "closed" && s.status === "closed") next.closure = undefined;
      return next;
    }));
  }, [duplicateGroups]);

  const bulkSetStatus = useCallback((status: SignalStatus) => {
    if (selection.length === 0) return;
    const affected = signals.filter(s => selection.includes(s.id) && s.status !== status);
    if (affected.length === 0) { setSelection([]); return; }

    const changes: FieldChange[] = affected.map(s => ({
      signalId: s.id, field: "status", before: s.status, after: status,
    }));

    const now = new Date().toISOString();
    setSignals(prev => prev.map(s => {
      if (!affected.some(a => a.id === s.id)) return s;
      const next: Signal = { ...s, status, statusUpdatedAt: now };
      // Same closure-stamp logic as updateSignal — bulk close = manual close.
      if (status === "closed" && s.status !== "closed" && !next.closure) {
        next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
      }
      if (status !== "closed" && s.status === "closed") next.closure = undefined;
      return next;
    }));
    setSelection([]);

    recordTransaction({
      action: "bulk_status_change", actor: CURRENT_USER_ID,
      summary: summariseStatus(status, affected.length),
      affectedSignalIds: affected.map(s => s.id),
      changes,
    });
  }, [selection, signals, recordTransaction]);

  const bulkAddLabel = useCallback((label: string) => {
    const kebab = label.toLowerCase().replace(/\s+/g, "-");
    const affected = signals.filter(s =>
      selection.includes(s.id) && !s.labels.includes(kebab)
    );
    if (affected.length === 0) return;

    const changes: FieldChange[] = affected.map(s => ({
      signalId: s.id, field: "labels", before: s.labels, after: [...s.labels, kebab],
    }));

    setSignals(prev => prev.map(s =>
      affected.some(a => a.id === s.id) ? { ...s, labels: [...s.labels, kebab] } : s
    ));

    recordTransaction({
      action: "labels_add", actor: CURRENT_USER_ID,
      summary: `Label "${kebab}" added to ${affected.length} signal${affected.length === 1 ? "" : "s"}`,
      affectedSignalIds: affected.map(s => s.id),
      changes,
    });
  }, [selection, signals, recordTransaction]);

  const updateWip = useCallback((id: string, patch: Partial<Wip>) => {
    const current = wipItems.find(w => w.id === id);
    setWipItems(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
    // Log the assignee change so the wip Activity tab can render it. We
    // skip silent no-ops (assigning the already-assigned user) so the feed
    // doesn't get noisy from quick UI bounces.
    if (current && "assignee" in patch && patch.assignee !== current.assignee) {
      recordWipEvent({
        wipId: id, kind: "assignee_changed",
        fromAssignee: current.assignee, toAssignee: patch.assignee ?? null,
        actor: CURRENT_USER_ID,
      });
    }
  }, [wipItems, recordWipEvent]);

  // ── Acceptance criteria helpers ─────────────────────────────────────────
  const addAcceptanceCriterion = useCallback((wipId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newId = `ac-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    setWipItems(prev => prev.map(w => {
      if (w.id !== wipId) return w;
      const list = w.acceptanceCriteria ?? [];
      if (list.some(a => a.id === newId)) return w; // React 19 dev guard
      return { ...w, acceptanceCriteria: [...list, { id: newId, text: trimmed, done: false }] };
    }));
  }, []);

  const updateAcceptanceCriterion = useCallback((wipId: string, acId: string, patch: { text?: string; done?: boolean }) => {
    setWipItems(prev => prev.map(w => {
      if (w.id !== wipId) return w;
      const list = w.acceptanceCriteria ?? [];
      return {
        ...w,
        acceptanceCriteria: list.map(a => a.id === acId ? { ...a, ...patch } : a),
      };
    }));
  }, []);

  const removeAcceptanceCriterion = useCallback((wipId: string, acId: string) => {
    setWipItems(prev => prev.map(w =>
      w.id === wipId
        ? { ...w, acceptanceCriteria: (w.acceptanceCriteria ?? []).filter(a => a.id !== acId) }
        : w
    ));
  }, []);

  // ── Manual ordering within a column ─────────────────────────────────────
  // Swap rank with the immediate neighbour above (-1) or below (+1). The
  // first nudge in a column triggers a one-time rank normalisation so all
  // items get explicit ranks; subsequent nudges just swap two values.
  const moveWipByDirection = useCallback((wipId: string, direction: -1 | 1) => {
    setWipItems(prev => {
      const target = prev.find(w => w.id === wipId);
      if (!target) return prev;
      // Same column AND location — manual ordering doesn't reach across
      // sprints / backlog / done columns.
      const peers = prev.filter(w => w.column === target.column && w.location === target.location);
      // Determine current ordering. If any peer has an explicit `order`,
      // sort by (order asc, fallback). Otherwise fall back to creation
      // order using array index, which is stable enough for a first nudge.
      const anyHasRank = peers.some(w => typeof w.order === "number");
      const ranked = peers.slice().sort((a, b) => {
        if (anyHasRank) {
          const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
          const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
        }
        // Tie-break by current index in `prev` so the swap is deterministic.
        return prev.indexOf(a) - prev.indexOf(b);
      });
      const idx = ranked.findIndex(w => w.id === wipId);
      const swapIdx = idx + direction;
      if (idx === -1 || swapIdx < 0 || swapIdx >= ranked.length) return prev;
      const a = ranked[idx];
      const b = ranked[swapIdx];
      // Normalise rank assignments so every peer has an explicit `order`
      // matching its sorted position. Spaced by 10 so future single-step
      // swaps can fit between neighbours without renumbering.
      const normalised = new Map<string, number>();
      ranked.forEach((w, i) => normalised.set(w.id, (i + 1) * 10));
      // Swap a/b after normalisation.
      const aRank = normalised.get(a.id)!;
      const bRank = normalised.get(b.id)!;
      normalised.set(a.id, bRank);
      normalised.set(b.id, aRank);
      return prev.map(w => {
        const r = normalised.get(w.id);
        return typeof r === "number" ? { ...w, order: r } : w;
      });
    });
  }, []);
  const moveWipUp   = useCallback((wipId: string) => moveWipByDirection(wipId, -1), [moveWipByDirection]);
  const moveWipDown = useCallback((wipId: string) => moveWipByDirection(wipId, +1), [moveWipByDirection]);

  // ── Spawn a signal from a wip comment ──────────────────────────────────
  const createSignalFromComment = useCallback((commentId: string): string | null => {
    const comment = wipComments.find(c => c.id === commentId);
    if (!comment) return null;
    const origin = wipItems.find(w => w.id === comment.wipId);
    if (!origin) return null;
    const newSignalId = `s${String(signalIdCounter++).padStart(2, "0")}`;
    const now = new Date().toISOString();
    const title = comment.body.split(/[.\n!?]/)[0].slice(0, 80).trim() || `Follow-up from "${origin.title}"`;
    const newSignal: Signal = {
      id: newSignalId,
      title,
      description: comment.body,
      labels: [],
      author: comment.author,
      source: "note",
      status: "new",
      screenshots: 0,
      createdAt: now,
      statusUpdatedAt: null,
      linkedWip: [],
      priority: computeAutoPriority([], "note"),
      // Tag the lineage so the signal modal can render "Follow-up from
      // intent X (via comment)". Same backref shape as review follow-ups.
      followUpOfWipId: origin.id,
    };
    setSignals(prev => prev.some(s => s.id === newSignalId) ? prev : [newSignal, ...prev]);
    setWipItems(prev => prev.map(w =>
      w.id === origin.id
        ? { ...w, followUpSignalIds: [...(w.followUpSignalIds ?? []), newSignalId] }
        : w
    ));
    recordWipEvent({
      wipId: origin.id, kind: "follow_up_created",
      followUpId: newSignalId, followUpKind: "signal",
      actor: CURRENT_USER_ID,
    });
    recordTransaction({
      action: "status_change", actor: CURRENT_USER_ID,
      summary: `Signal created from comment on "${origin.title}"`,
      affectedSignalIds: [newSignalId],
      changes: [],
    });
    return newSignalId;
  }, [wipComments, wipItems, recordWipEvent, recordTransaction]);

  const createWorkItem = useCallback((type: WipType, description?: string, assignee?: string | null, opts?: { title?: string; signalIds?: string[] }) => {
    // Source set: either explicit (from the pre-create modal after the
    // user dropped some) or the live selection. Empty => no-op.
    const sourceIds = opts?.signalIds && opts.signalIds.length > 0 ? opts.signalIds : selection;
    if (sourceIds.length === 0) return;
    const selectedSignals = signals.filter(s => sourceIds.includes(s.id));
    if (selectedSignals.length === 0) return;
    const newId = `w-${String(wipIdCounter++).padStart(2, "0")}`;
    const autoTitle = selectedSignals.length === 1 ? selectedSignals[0].title : `New ${type}`;
    const newWip: Wip = {
      id: newId, type,
      title: opts?.title?.trim() || autoTitle,
      description: description ?? (selectedSignals.length === 1 ? selectedSignals[0].description : ""),
      column: "to_do",
      location: sprints.find(s => s.active)?.id || "backlog",
      assignee: assignee ?? null,
      linkedSignals: sourceIds.slice(),
    };
    const now = new Date().toISOString();

    // Field-level changes on the source signals: status → "ready" and
    // linkedWip gains the new id. We capture these so undo can revert each
    // individually if it's still safe.
    const changes: FieldChange[] = [];
    for (const s of selectedSignals) {
      if (s.status !== "ready") {
        changes.push({ signalId: s.id, field: "status", before: s.status, after: "ready" });
      }
      changes.push({
        signalId: s.id, field: "linkedWip",
        before: s.linkedWip,
        after: [...s.linkedWip, newId],
      });
    }

    setWipItems(prev => [...prev, newWip]);
    setSignals(prev => prev.map(s =>
      sourceIds.includes(s.id)
        ? { ...s, status: "ready", statusUpdatedAt: now, linkedWip: [...s.linkedWip, newId] }
        : s
    ));
    // Multi-source create from a TPA's temporary selection: default to
    // "partially_addresses" so finishing the work doesn't auto-resolve
    // every source signal. The TPA decides per-signal whether the
    // request is fully covered. The single-signal flow (createFromSignal)
    // and confirmed-duplicate-group flow keep their stricter defaults
    // — those imply a tighter "this work IS the answer" relationship.
    const defaultRel: SignalWipRelationship = "partially_addresses";
    setSignalWipLinks(prev => {
      const next = prev.slice();
      for (const sid of sourceIds) {
        if (next.some(l => l.signalId === sid && l.wipId === newId)) continue;
        next.push({
          id: `link-${Date.now().toString(36)}-${next.length}`,
          signalId: sid, wipId: newId,
          relationship: defaultRel,
          createdAt: now, createdBy: CURRENT_USER_ID,
        });
      }
      return next;
    });
    // Snapshot source signal ids for the post-create banner's "Keep
    // selected" action. Always derived from sourceIds — never the live
    // selection, since the modal may have trimmed some rows.
    const sourceSnapshot = sourceIds.slice();
    setSelection([]);
    // Close any open signal modal so the post-create banner isn't
    // covered, but DO NOT auto-navigate to the new wip — the user
    // should stay on the Signals list and choose what to do via the
    // banner's "View task" action.
    setOpenSignalId(null);
    setPostCreatePrompt({
      wipId: newId,
      type,
      title: newWip.title,
      sourceSignalIds: sourceSnapshot,
      createdAt: now,
    });

    recordTransaction({
      action: type === "task" ? "task_created" : "intent_created",
      actor: CURRENT_USER_ID,
      summary: `${type === "task" ? "Task" : "Intent"} "${newWip.title}" created from ${selectedSignals.length} source signal${selectedSignals.length === 1 ? "" : "s"}`,
      affectedSignalIds: selectedSignals.map(s => s.id),
      changes,
      ...(type === "task" ? { taskId: newId } : { intentId: newId }),
    });

    // Activity log entry — both for the WIP modal's Activity tab and for
    // client-side "new since last visit" highlighting.
    recordWipEvent({
      wipId: newId, kind: "created",
      toColumn: newWip.column, toLocation: newWip.location,
      actor: CURRENT_USER_ID,
    });
  }, [signals, selection, sprints, recordTransaction, recordWipEvent]);

  const createFromSignal = useCallback((signalId: string, type: WipType, opts?: { description?: string; assignee?: string | null }) => {
    const sig = signals.find(s => s.id === signalId);
    if (!sig) return;
    const newId = `w-${String(wipIdCounter++).padStart(2, "0")}`;
    const newWip: Wip = {
      id: newId, type,
      title: sig.title,
      description: opts?.description ?? sig.description,
      column: "to_do",
      location: sprints.find(s => s.active)?.id || "backlog",
      assignee: opts?.assignee ?? null,
      linkedSignals: [signalId],
    };
    const now = new Date().toISOString();

    const changes: FieldChange[] = [];
    if (sig.status !== "ready") {
      changes.push({ signalId, field: "status", before: sig.status, after: "ready" });
    }
    changes.push({ signalId, field: "linkedWip", before: sig.linkedWip, after: [...sig.linkedWip, newId] });

    setWipItems(prev => [...prev, newWip]);
    setSignals(prev => prev.map(s =>
      s.id === signalId
        ? { ...s, status: "ready", statusUpdatedAt: now, linkedWip: [...s.linkedWip, newId] }
        : s
    ));
    // Seed a default-relationship link row (intent → resolves, task →
    // researches). User can change it from the signal modal afterwards.
    const defaultRel: SignalWipRelationship = type === "intent" ? "resolves" : "researches";
    setSignalWipLinks(prev =>
      prev.some(l => l.signalId === signalId && l.wipId === newId)
        ? prev
        : [...prev, {
            id: `link-${Date.now().toString(36)}-${prev.length}`,
            signalId, wipId: newId,
            relationship: defaultRel,
            createdAt: now, createdBy: CURRENT_USER_ID,
          }]
    );
    // Auto-jump to the new wip's detail (no "go vs stay" prompt).
    setOpenSignalId(null);
    setRouteState("wip");
    if (typeof window !== "undefined") localStorage.setItem("signal:route", "wip");
    setSelectedWipId(newId);

    recordTransaction({
      action: type === "task" ? "task_created" : "intent_created",
      actor: CURRENT_USER_ID,
      summary: `${type === "task" ? "Task" : "Intent"} created from "${sig.title}"`,
      affectedSignalIds: [signalId],
      changes,
      ...(type === "task" ? { taskId: newId } : { intentId: newId }),
    });

    recordWipEvent({
      wipId: newId, kind: "created",
      toColumn: newWip.column, toLocation: newWip.location,
      actor: CURRENT_USER_ID,
    });
  }, [signals, sprints, recordTransaction, recordWipEvent]);

  const openWip = useCallback((id: string | null) => setSelectedWipId(id), []);

  const moveWip = useCallback((id: string, location: string, column: WipColumn) => {
    const current = wipItems.find(w => w.id === id);
    if (!current) return;
    // No-op moves don't deserve a log entry.
    if (current.column === column && current.location === location) return;

    // Done <-> non-done transitions feed into the review workflow. We only
    // carry reviewState while the item lives in Done; entering Done stamps
    // "needs_review" automatically, and leaving Done clears it (reopen
    // resets the review state — the work is no longer done).
    const enteringDone = column === "done" && current.column !== "done";
    const leavingDone  = current.column === "done" && column !== "done";
    setWipItems(prev => prev.map(w => {
      if (w.id !== id) return w;
      const next: Wip = { ...w, location, column };
      if (enteringDone) next.reviewState = "needs_review";
      if (leavingDone) {
        // Clear all review-side bookkeeping — but keep follow-up linkages,
        // those are about lineage and survive a reopen.
        delete next.reviewState;
        delete next.reviewedAt;
        delete next.reviewedBy;
      }
      return next;
    }));

    // Backwards-from-done = "reopened"; everything else is a "moved".
    const kind: WipEventKind =
      current.column === "done" && column !== "done" ? "reopened" : "moved";
    recordWipEvent({
      wipId: id, kind,
      fromColumn: current.column, toColumn: column,
      fromLocation: current.location, toLocation: location,
      actor: CURRENT_USER_ID,
    });

    // Move-to-done used to auto-close linked signals (cascading task_done /
    // intent_done closure). The new flow defers that decision to the
    // explicit review step ("Looks good → auto-close"), so we stamp
    // `needs_review` here and leave linked signals untouched.
    if (enteringDone) {
      recordWipEvent({
        wipId: id, kind: "needs_review", actor: CURRENT_USER_ID,
      });
    }

    // Reopen-cascade: when a wip leaves Done, reverse the closure on any
    // signals that were closed via THIS wip's review step. We identify
    // them by `closure.wipId === id && closure.reason === "reviewed"` so
    // we don't accidentally reopen signals that were closed manually or
    // by some other path. Restored signals go back to "ready" — that's
    // their canonical state for an open signal that has linked work.
    if (leavingDone) {
      const reopenedAt = new Date().toISOString();
      const candidates = signals.filter(s =>
        s.status === "closed" &&
        s.closure?.reason === "reviewed" &&
        s.closure?.wipId === id
      );
      if (candidates.length > 0) {
        setSignals(prev => prev.map(s =>
          candidates.some(c => c.id === s.id)
            ? { ...s, status: "ready", statusUpdatedAt: reopenedAt, closure: undefined }
            : s
        ));
      }
    }
  }, [wipItems, signals, recordWipEvent]);

  const newSprint = useCallback(() => {
    const nextNum = sprints.length + sprintIdCounter - 15;
    const sprint: Sprint = { id: `sp-${sprintIdCounter++}`, name: `Sprint ${nextNum}`, range: "TBD", active: false };
    setSprints(prev => [...prev, sprint]);
  }, [sprints]);

  const createNote = useCallback((data: { source: string; title: string; body: string }) => {
    const noteId = `n${String(noteIdCounter++).padStart(2, "0")}`;
    const sigId  = `s${String(signalIdCounter++).padStart(2, "0")}`;
    const now    = new Date().toISOString();
    setNotes(prev => [{ id: noteId, source: data.source, title: data.title, body: data.body, author: "u1", createdAt: now, promoted: true }, ...prev]);
    setSignals(prev => [{ id: sigId, title: data.title, description: data.body, labels: [], author: "u1", source: "note", status: "new", screenshots: 0, createdAt: now, statusUpdatedAt: null, linkedWip: [], priority: computeAutoPriority([], "note") }, ...prev]);
  }, []);

  let commentIdCounter = wipComments.length + 1;
  const addComment = useCallback((wipId: string, body: string, visibility: Visibility) => {
    const id = `c${String(commentIdCounter++).padStart(2, "0")}`;
    setWipComments(prev => [...prev, { id, wipId, body, visibility, author: "u1", createdAt: new Date().toISOString() }]);
  }, [wipComments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  let attachmentIdCounter = wipAttachments.length + 1;
  const addAttachment = useCallback((wipId: string, name: string, size: string, mimeType: string, visibility: Visibility) => {
    const id = `a${String(attachmentIdCounter++).padStart(2, "0")}`;
    setWipAttachments(prev => [...prev, { id, wipId, name, size, mimeType, visibility, uploadedBy: "u1", createdAt: new Date().toISOString() }]);
    recordWipEvent({
      wipId, kind: "attachment_added", attachmentName: name, actor: CURRENT_USER_ID,
    });
  }, [wipAttachments.length, recordWipEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Allocate signal-comment ids OUTSIDE the updater (the React 19 dev-mode
  // double-invocation gotcha). We keep the counter on the closure of the
  // current render via wipComments.length-style trick used above.
  let signalCommentIdCounter = signalComments.length + 1;
  const addSignalComment = useCallback((signalId: string, body: string, visibility: Visibility) => {
    const id = `sc${String(signalCommentIdCounter++).padStart(2, "0")}`;
    setSignalComments(prev =>
      prev.some(c => c.id === id)
        ? prev
        : [...prev, { id, signalId, body, visibility, author: CURRENT_USER_ID, createdAt: new Date().toISOString() }]
    );
  }, [signalComments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  let signalAttachmentIdCounter = signalAttachments.length + 1;
  const addSignalAttachment = useCallback((signalId: string, name: string, mimeType: string, size: string) => {
    const id = `sa${String(signalAttachmentIdCounter++).padStart(2, "0")}`;
    setSignalAttachments(prev =>
      prev.some(a => a.id === id)
        ? prev
        : [...prev, { id, signalId, name, mimeType, size, uploadedBy: CURRENT_USER_ID, createdAt: new Date().toISOString() }]
    );
  }, [signalAttachments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hide-under actions ──────────────────────────────────────────────────
  // Each hide-under transaction stores a `hideUnderBefore` snapshot of the
  // rule (or its absence) so undo can restore the exact prior state.

  const hideUnder = useCallback((
    mainSignalId: string,
    filterLabels: string[],
    otherIds: string[],
  ) => {
    if (otherIds.length === 0) return;
    const sortedLabels = [...filterLabels].sort();
    const existing = hideUnderRules.find(r => hideUnderKey(r.filterLabels) === hideUnderKey(sortedLabels));

    const snapshot: HideUnderSnapshot = existing
      ? {
          ruleId: existing.id,
          filterLabels: existing.filterLabels,
          mainSignalId: existing.mainSignalId,
          hiddenSignalIds: existing.hiddenSignalIds.slice(),
          existedBefore: true,
        }
      : {
          ruleId: `hu-${String(hideUnderCounter).padStart(2, "0")}`,
          filterLabels: sortedLabels,
          mainSignalId,
          hiddenSignalIds: [],
          existedBefore: false,
        };

    // Pre-allocate the id for the potential new rule so a re-invoked
    // updater doesn't bump the counter twice and create a ghost rule.
    const candidateNewId = `hu-${String(hideUnderCounter++).padStart(2, "0")}`;
    let resultRuleId = snapshot.ruleId;

    setHideUnderRules(prev => {
      const found = prev.find(r => hideUnderKey(r.filterLabels) === hideUnderKey(sortedLabels));
      if (found) {
        const mergedHidden = Array.from(new Set([...found.hiddenSignalIds, ...otherIds]))
          .filter(id => id !== mainSignalId);
        resultRuleId = found.id;
        return prev.map(r =>
          r.id === found.id
            ? { ...r, mainSignalId, hiddenSignalIds: mergedHidden }
            : r
        );
      }
      // Idempotent: if a re-invoked updater already inserted the candidate
      // rule, bail out instead of duplicating it.
      if (prev.some(r => r.id === candidateNewId)) {
        resultRuleId = candidateNewId;
        return prev;
      }
      const newRule: HideUnderRule = {
        id: candidateNewId,
        filterLabels: sortedLabels,
        mainSignalId,
        hiddenSignalIds: otherIds.filter(id => id !== mainSignalId),
        createdAt: new Date().toISOString(),
      };
      resultRuleId = newRule.id;
      return [...prev, newRule];
    });

    recordTransaction({
      action: "hide_under", actor: CURRENT_USER_ID,
      summary: `${otherIds.length} signal${otherIds.length === 1 ? "" : "s"} hidden under main`,
      affectedSignalIds: otherIds,
      changes: [],
      hideUnderRuleId: resultRuleId,
      hideUnderBefore: snapshot,
    });
  }, [hideUnderRules, recordTransaction]);

  const removeFromHideUnder = useCallback((ruleId: string, signalId: string) => {
    const rule = hideUnderRules.find(r => r.id === ruleId);
    if (!rule) return;
    const snapshot: HideUnderSnapshot = {
      ruleId: rule.id,
      filterLabels: rule.filterLabels,
      mainSignalId: rule.mainSignalId,
      hiddenSignalIds: rule.hiddenSignalIds.slice(),
      existedBefore: true,
    };

    setHideUnderRules(prev => {
      const found = prev.find(r => r.id === ruleId);
      if (!found) return prev;
      const remaining = found.hiddenSignalIds.filter(id => id !== signalId);
      if (remaining.length === 0) return prev.filter(r => r.id !== ruleId);
      return prev.map(r => r.id === ruleId ? { ...r, hiddenSignalIds: remaining } : r);
    });

    recordTransaction({
      action: "restore_from_hidden", actor: CURRENT_USER_ID,
      summary: `Signal restored from hidden`,
      affectedSignalIds: [signalId],
      changes: [],
      hideUnderRuleId: ruleId,
      hideUnderBefore: snapshot,
    });
  }, [hideUnderRules, recordTransaction]);

  const removeHideUnderRule = useCallback((ruleId: string) => {
    const rule = hideUnderRules.find(r => r.id === ruleId);
    if (!rule) return;
    const snapshot: HideUnderSnapshot = {
      ruleId: rule.id,
      filterLabels: rule.filterLabels,
      mainSignalId: rule.mainSignalId,
      hiddenSignalIds: rule.hiddenSignalIds.slice(),
      existedBefore: true,
    };
    const count = rule.hiddenSignalIds.length;

    setHideUnderRules(prev => prev.filter(r => r.id !== ruleId));

    recordTransaction({
      action: "remove_hide_rule", actor: CURRENT_USER_ID,
      summary: `${count} hidden signal${count === 1 ? "" : "s"} restored`,
      affectedSignalIds: rule.hiddenSignalIds,
      changes: [],
      hideUnderRuleId: ruleId,
      hideUnderBefore: snapshot,
    });
  }, [hideUnderRules, recordTransaction]);

  // ── Review workflow ────────────────────────────────────────────────────
  // Mark a Done wip as Looks good. Always cascades closure to the wip's
  // currently-open linked signals with a "reviewed" closure reason — the
  // signal modal renders "Closed because Intent X was reviewed". If the
  // wip is later reopened (moved out of Done), `moveWip` reverses the
  // cascade and re-opens the same signals, so the relationship stays
  // consistent in both directions.
  const reviewWipLooksGood = useCallback((wipId: string, note?: string) => {
    const current = wipItems.find(w => w.id === wipId);
    if (!current || current.column !== "done") return;
    const now = new Date().toISOString();
    const trimmed = note?.trim() || undefined;

    setWipItems(prev => prev.map(w =>
      w.id === wipId
        ? { ...w, reviewState: "looks_good", reviewedAt: now, reviewedBy: CURRENT_USER_ID, ...(trimmed ? { closeNote: trimmed } : {}) }
        : w
    ));
    recordWipEvent({
      wipId, kind: "reviewed_looks_good", actor: CURRENT_USER_ID,
    });

    // Honor relationship types: ONLY signals linked with `resolves` get
    // closed automatically. `partially_addresses` / `investigates` /
    // `researches` / `clarifies` / `informs` / `related_to` keep the
    // signal open — finishing the work doesn't fully resolve the
    // original ask, per spec. The toast summary still surfaces a clear
    // "what happened" so the user knows the cascade was deliberate.
    const allLinkedOpen = signals.filter(s =>
      current.linkedSignals.includes(s.id) && s.status !== "closed"
    );
    const resolvingOpen: Signal[] = [];
    const keptOpen: Signal[] = [];
    for (const s of allLinkedOpen) {
      const link = signalWipLinks.find(l => l.signalId === s.id && l.wipId === wipId);
      // Default to "resolves" when no link row exists (legacy data) so we
      // don't silently change behavior for signals that pre-date the link
      // table.
      const rel = link?.relationship ?? "resolves";
      if (relationshipResolvesSignal(rel)) resolvingOpen.push(s);
      else keptOpen.push(s);
    }
    if (resolvingOpen.length > 0) {
      const closure: SignalClosure = {
        reason: "reviewed",
        wipId,
        actor: CURRENT_USER_ID,
        at: now,
        ...(trimmed ? { note: trimmed } : {}),
      };
      setSignals(prev => prev.map(s =>
        resolvingOpen.some(o => o.id === s.id)
          ? { ...s, status: "closed", statusUpdatedAt: now, closure }
          : s
      ));
      recordWipEvent({
        wipId, kind: "linked_signals_closed",
        closedSignalCount: resolvingOpen.length,
        signalId: resolvingOpen[0]?.id,
        actor: CURRENT_USER_ID,
      });
    }
    // "What happened" toast describes BOTH paths so the user understands
    // the cascade plus any signals deliberately kept open.
    const tail = trimmed ? ` · ${trimmed}` : "";
    const verb = current.type === "task" ? "Task" : "Intent";
    const parts: string[] = [`${verb} reviewed: Looks good`];
    if (resolvingOpen.length > 0) {
      parts.push(`${resolvingOpen.length} linked signal${resolvingOpen.length === 1 ? "" : "s"} resolved`);
    }
    if (keptOpen.length > 0) {
      parts.push(`${keptOpen.length} kept open (partial/research)`);
    }
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: parts.join(" · ") + tail,
      affectedSignalIds: [...resolvingOpen.map(s => s.id), ...keptOpen.map(s => s.id)],
      changes: resolvingOpen.map(s => ({ signalId: s.id, field: "status" as keyof Signal, before: s.status, after: "closed" })),
    });
  }, [wipItems, signals, signalWipLinks, recordWipEvent, recordTransaction]);

  const reviewWipFollowUp = useCallback((wipId: string, note?: string) => {
    const current = wipItems.find(w => w.id === wipId);
    if (!current || current.column !== "done") return;
    const now = new Date().toISOString();
    const trimmed = note?.trim() || undefined;
    setWipItems(prev => prev.map(w =>
      w.id === wipId
        ? { ...w, reviewState: "follow_up", reviewedAt: now, reviewedBy: CURRENT_USER_ID, ...(trimmed ? { closeNote: trimmed } : {}) }
        : w
    ));
    recordWipEvent({
      wipId, kind: "reviewed_follow_up", actor: CURRENT_USER_ID,
    });
    // "What happened" toast.
    const tail = trimmed ? ` · ${trimmed}` : "";
    const verb = current.type === "task" ? "Task" : "Intent";
    recordTransaction({
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `${verb} marked for follow-up${tail}`,
      affectedSignalIds: [],
      changes: [],
    });
  }, [wipItems, recordWipEvent, recordTransaction]);

  // Spawn a follow-up signal / task / intent that links back to the origin
  // wip. Tasks and intents inherit the origin's linkedSignals so the new
  // work item retains the original signal context. Returns the new id so
  // the caller can navigate to it.
  const createFollowUp = useCallback((
    originWipId: string,
    kind: "signal" | "task" | "intent",
    opts?: { title?: string; description?: string },
  ): string | null => {
    const origin = wipItems.find(w => w.id === originWipId);
    if (!origin) return null;
    const now = new Date().toISOString();
    const titlePrefix = kind === "signal" ? "Follow-up signal:" : "Follow-up:";
    const baseTitle = opts?.title?.trim() || `${titlePrefix} ${origin.title}`;
    const baseDesc  = opts?.description ?? origin.description;

    if (kind === "signal") {
      const newId = `s${String(signalIdCounter++).padStart(2, "0")}`;
      const newSignal: Signal = {
        id: newId,
        title: baseTitle,
        description: baseDesc,
        labels: [],
        author: CURRENT_USER_ID,
        source: "note",
        status: "new",
        screenshots: 0,
        createdAt: now,
        statusUpdatedAt: null,
        linkedWip: [],
        priority: computeAutoPriority([], "note"),
        followUpOfWipId: originWipId,
      };
      setSignals(prev => prev.some(s => s.id === newId) ? prev : [newSignal, ...prev]);
      setWipItems(prev => prev.map(w =>
        w.id === originWipId
          ? { ...w, followUpSignalIds: [...(w.followUpSignalIds ?? []), newId] }
          : w
      ));
      recordWipEvent({
        wipId: originWipId, kind: "follow_up_created",
        followUpId: newId, followUpKind: "signal",
        actor: CURRENT_USER_ID,
      });
      return newId;
    }

    // Task / intent follow-up — lives in wipItems.
    const newId = `w-${String(wipIdCounter++).padStart(2, "0")}`;
    const newWip: Wip = {
      id: newId,
      type: kind,
      title: baseTitle,
      description: baseDesc,
      column: "to_do",
      location: sprints.find(s => s.active)?.id || origin.location,
      assignee: null,
      // Inherit the origin's signal context — the new work continues the
      // same chain. Empty origin.linkedSignals just means an empty list.
      linkedSignals: origin.linkedSignals.slice(),
      followUpOfWipId: originWipId,
    };
    setWipItems(prev => {
      if (prev.some(w => w.id === newId)) return prev;
      return prev.map(w =>
        w.id === originWipId
          ? { ...w, followUpIds: [...(w.followUpIds ?? []), newId] }
          : w
      ).concat(newWip);
    });
    // Bidirectionally update the inherited signals' linkedWip — the new wip
    // shares them with the origin, so each signal now points at both.
    // Per spec: any signal that gets a linked task/intent must be Ready,
    // so we flip non-Ready members at the same time. Closed signals are
    // left alone (a settled close takes precedence over auto-Ready).
    if (newWip.linkedSignals.length > 0) {
      setSignals(prev => prev.map(s => {
        if (!newWip.linkedSignals.includes(s.id)) return s;
        const next: Signal = { ...s };
        if (!next.linkedWip.includes(newId)) next.linkedWip = [...next.linkedWip, newId];
        if (next.status !== "ready" && next.status !== "closed") {
          next.status = "ready";
          next.statusUpdatedAt = now;
          next.closure = undefined;
        }
        return next;
      }));
    }
    recordWipEvent({
      wipId: originWipId, kind: "follow_up_created",
      followUpId: newId, followUpKind: kind,
      actor: CURRENT_USER_ID,
    });
    recordWipEvent({
      wipId: newId, kind: "created",
      toColumn: newWip.column, toLocation: newWip.location,
      actor: CURRENT_USER_ID,
    });
    return newId;
  }, [wipItems, sprints, recordWipEvent]);

  const bulkUpdateSignalStatus = useCallback((ids: string[], status: SignalStatus) => {
    if (ids.length === 0) return;
    const affected = signals.filter(s => ids.includes(s.id) && s.status !== status);
    if (affected.length === 0) return;

    const changes: FieldChange[] = affected.map(s => ({
      signalId: s.id, field: "status", before: s.status, after: status,
    }));

    const now = new Date().toISOString();
    setSignals(prev => prev.map(s => {
      if (!affected.some(a => a.id === s.id)) return s;
      const next: Signal = { ...s, status, statusUpdatedAt: now };
      if (status === "closed" && s.status !== "closed" && !next.closure) {
        next.closure = { reason: "manual", actor: CURRENT_USER_ID, at: now };
      }
      if (status !== "closed" && s.status === "closed") next.closure = undefined;
      return next;
    }));

    recordTransaction({
      action: "bulk_status_change", actor: CURRENT_USER_ID,
      summary: summariseStatus(status, affected.length),
      affectedSignalIds: affected.map(s => s.id),
      changes,
    });
  }, [signals, recordTransaction]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__wipById = (id: string) => wipItems.find(w => w.id === id);
    }
  }, [wipItems]);

  // suppress unused-import warning for findHideUnderRule (re-exported via helpers in data.ts)
  void findHideUnderRule;

  // ── Post-create banner ──────────────────────────────────────────────────
  // The post-create prompt lives until the user dismisses it OR the
  // 20-second auto-dismiss fires (longer than a regular toast — the
  // user has three actions to consider, not just an undo).
  const dismissPostCreatePrompt = useCallback(() => setPostCreatePrompt(null), []);
  useEffect(() => {
    if (!postCreatePrompt) return;
    const t = setTimeout(() => setPostCreatePrompt(null), 20_000);
    return () => clearTimeout(t);
  }, [postCreatePrompt]);

  // ── Source-of-wip filter (transient) ────────────────────────────────────
  // SignalsPage reads this and narrows the visible list to the wip's
  // linked source signals. Passing null clears.
  const setSourceOfWipFilter = useCallback((wipId: string | null) => {
    setSourceOfWipFilterState(wipId);
  }, []);

  // ── Roadmap / traceability action implementations ────────────────────────
  // All ids are generated from Date.now() base36 + a per-array sequence so
  // collisions are vanishingly unlikely in a single session. We don't try
  // to persist to localStorage in V1 — the seed reloads cleanly each
  // refresh, which matches the rest of the prototype.
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const nowISO = () => new Date().toISOString();
  const labelForMonday = (iso: string) => {
    const start = new Date(iso);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} — ${fmt(end)}`;
  };

  const createWeeklyGoal = useCallback((input: { title: string; weekStart: string; weekLabel?: string }) => {
    const id = newId("goal");
    const goal: WeeklyGoal = {
      id, title: input.title.trim() || "Untitled goal",
      weekStart: input.weekStart,
      weekLabel: input.weekLabel || labelForMonday(input.weekStart),
      status: "planned",
      linkedFeatureIds: [], linkedSliceIds: [], linkedCapabilityIds: [], linkedIntentIds: [],
      createdAt: nowISO(),
    };
    setWeeklyGoals(prev => prev.some(g => g.id === id) ? prev : [...prev, goal]);
    return id;
  }, []);
  const updateWeeklyGoal = useCallback((id: string, patch: Partial<WeeklyGoal>) => {
    setWeeklyGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }, []);
  const deleteWeeklyGoal = useCallback((id: string) => {
    setWeeklyGoals(prev => prev.filter(g => g.id !== id));
    // Cascade: drop this goal from any release / theme that linked it.
    setReleases(prev => prev.map(r => r.linkedGoalIds.includes(id)
      ? { ...r, linkedGoalIds: r.linkedGoalIds.filter(gid => gid !== id) }
      : r));
    setThemes(prev => prev.map(t => t.linkedGoalIds.includes(id)
      ? { ...t, linkedGoalIds: t.linkedGoalIds.filter(gid => gid !== id) }
      : t));
  }, []);

  const createProductArea = useCallback((input: { title: string; description?: string }) => {
    const id = newId("area");
    const area: ProductArea = {
      id, title: input.title.trim() || "Untitled area",
      description: input.description, createdAt: nowISO(),
    };
    setProductAreas(prev => prev.some(a => a.id === id) ? prev : [...prev, area]);
    return id;
  }, []);
  const updateProductArea = useCallback((id: string, patch: Partial<ProductArea>) => {
    setProductAreas(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }, []);
  const deleteProductArea = useCallback((id: string) => {
    // Cascade: features in this area + their slices + their capabilities
    // all go. Weekly-goal links that point at any of them are filtered
    // out so the timeline doesn't surface ghost references.
    const featuresInArea = features.filter(f => f.areaId === id).map(f => f.id);
    const slicesInArea = featureSlices.filter(s => featuresInArea.includes(s.featureId)).map(s => s.id);
    const capsInArea = productCapabilities.filter(c => featuresInArea.includes(c.featureId)).map(c => c.id);
    setProductAreas(prev => prev.filter(a => a.id !== id));
    setFeatures(prev => prev.filter(f => !featuresInArea.includes(f.id)));
    setFeatureSlices(prev => prev.filter(s => !slicesInArea.includes(s.id)));
    setProductCapabilities(prev => prev.filter(c => !capsInArea.includes(c.id)));
    setWeeklyGoals(prev => prev.map(g => ({
      ...g,
      linkedFeatureIds: g.linkedFeatureIds.filter(fid => !featuresInArea.includes(fid)),
      linkedSliceIds: g.linkedSliceIds.filter(sid => !slicesInArea.includes(sid)),
      linkedCapabilityIds: g.linkedCapabilityIds.filter(cid => !capsInArea.includes(cid)),
    })));
    setReleases(prev => prev.map(r => ({
      ...r,
      linkedFeatureIds: r.linkedFeatureIds.filter(fid => !featuresInArea.includes(fid)),
      linkedSliceIds: r.linkedSliceIds.filter(sid => !slicesInArea.includes(sid)),
      linkedCapabilityIds: r.linkedCapabilityIds.filter(cid => !capsInArea.includes(cid)),
    })));
    setThemes(prev => prev.map(t => ({
      ...t,
      linkedFeatureIds: t.linkedFeatureIds.filter(fid => !featuresInArea.includes(fid)),
      linkedSliceIds: t.linkedSliceIds.filter(sid => !slicesInArea.includes(sid)),
      linkedCapabilityIds: t.linkedCapabilityIds.filter(cid => !capsInArea.includes(cid)),
    })));
  }, [features, featureSlices, productCapabilities]);

  const createFeature = useCallback((input: { title: string; areaId?: string; featureGroupId?: string; description?: string }) => {
    const id = newId("feat");
    const feature: Feature = {
      id, title: input.title.trim() || "Untitled feature",
      description: input.description,
      status: "not_started",
      // V1 Roadmap lets the TPA type feature names without picking an
      // area / group. Empty `areaId` means "ungrouped" — surfaces under
      // the Product View's "Ungrouped" bucket.
      areaId: input.areaId ?? "",
      featureGroupId: input.featureGroupId,
      linkedIntentIds: [],
      createdAt: nowISO(),
    };
    setFeatures(prev => prev.some(f => f.id === id) ? prev : [...prev, feature]);
    return id;
  }, []);
  const updateFeature = useCallback((id: string, patch: Partial<Feature>) => {
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);
  const deleteFeature = useCallback((id: string) => {
    const slicesInFeature = featureSlices.filter(s => s.featureId === id).map(s => s.id);
    const capsInFeature = productCapabilities.filter(c => c.featureId === id).map(c => c.id);
    setFeatures(prev => prev.filter(f => f.id !== id));
    setFeatureSlices(prev => prev.filter(s => !slicesInFeature.includes(s.id)));
    setProductCapabilities(prev => prev.filter(c => !capsInFeature.includes(c.id)));
    setWeeklyGoals(prev => prev.map(g => ({
      ...g,
      linkedFeatureIds: g.linkedFeatureIds.filter(fid => fid !== id),
      linkedSliceIds: g.linkedSliceIds.filter(sid => !slicesInFeature.includes(sid)),
      linkedCapabilityIds: g.linkedCapabilityIds.filter(cid => !capsInFeature.includes(cid)),
    })));
    setReleases(prev => prev.map(r => ({
      ...r,
      linkedFeatureIds: r.linkedFeatureIds.filter(fid => fid !== id),
      linkedSliceIds: r.linkedSliceIds.filter(sid => !slicesInFeature.includes(sid)),
      linkedCapabilityIds: r.linkedCapabilityIds.filter(cid => !capsInFeature.includes(cid)),
    })));
    setThemes(prev => prev.map(t => ({
      ...t,
      linkedFeatureIds: t.linkedFeatureIds.filter(fid => fid !== id),
      linkedSliceIds: t.linkedSliceIds.filter(sid => !slicesInFeature.includes(sid)),
      linkedCapabilityIds: t.linkedCapabilityIds.filter(cid => !capsInFeature.includes(cid)),
    })));
  }, [featureSlices, productCapabilities]);

  const createFeatureSlice = useCallback((input: { title: string; featureId: string; description?: string }) => {
    const id = newId("slice");
    const slice: FeatureSlice = {
      id, title: input.title.trim() || "Untitled slice",
      description: input.description,
      status: "not_started",
      featureId: input.featureId,
      linkedIntentIds: [],
      createdAt: nowISO(),
    };
    setFeatureSlices(prev => prev.some(s => s.id === id) ? prev : [...prev, slice]);
    return id;
  }, []);
  const updateFeatureSlice = useCallback((id: string, patch: Partial<FeatureSlice>) => {
    setFeatureSlices(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);
  const deleteFeatureSlice = useCallback((id: string) => {
    setFeatureSlices(prev => prev.filter(s => s.id !== id));
    setWeeklyGoals(prev => prev.map(g => ({
      ...g,
      linkedSliceIds: g.linkedSliceIds.filter(sid => sid !== id),
    })));
    setReleases(prev => prev.map(r => r.linkedSliceIds.includes(id)
      ? { ...r, linkedSliceIds: r.linkedSliceIds.filter(sid => sid !== id) }
      : r));
    setThemes(prev => prev.map(t => t.linkedSliceIds.includes(id)
      ? { ...t, linkedSliceIds: t.linkedSliceIds.filter(sid => sid !== id) }
      : t));
  }, []);

  // Toggle helpers — symmetric add/remove with a single click. Each
  // mutates only the link array on the target entity; we don't try to
  // keep "reverse" links in sync since the UI derives reverse views by
  // filtering the source-of-truth arrays.
  const toggleArrayMember = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

  const toggleGoalFeature = useCallback((goalId: string, featureId: string) => {
    setWeeklyGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, linkedFeatureIds: toggleArrayMember(g.linkedFeatureIds, featureId) }
      : g));
  }, []);
  const toggleGoalSlice = useCallback((goalId: string, sliceId: string) => {
    setWeeklyGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, linkedSliceIds: toggleArrayMember(g.linkedSliceIds, sliceId) }
      : g));
  }, []);
  const toggleGoalCapability = useCallback((goalId: string, capabilityId: string) => {
    setWeeklyGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, linkedCapabilityIds: toggleArrayMember(g.linkedCapabilityIds, capabilityId) }
      : g));
  }, []);
  const toggleGoalIntent = useCallback((goalId: string, intentId: string) => {
    setWeeklyGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, linkedIntentIds: toggleArrayMember(g.linkedIntentIds, intentId) }
      : g));
  }, []);
  const toggleFeatureIntent = useCallback((featureId: string, intentId: string) => {
    setFeatures(prev => prev.map(f => f.id === featureId
      ? { ...f, linkedIntentIds: toggleArrayMember(f.linkedIntentIds, intentId) }
      : f));
  }, []);
  const toggleFeatureSliceIntent = useCallback((sliceId: string, intentId: string) => {
    setFeatureSlices(prev => prev.map(s => s.id === sliceId
      ? { ...s, linkedIntentIds: toggleArrayMember(s.linkedIntentIds, intentId) }
      : s));
  }, []);

  // ── Feature group + product capability + slice inclusion ───────────────
  const createFeatureGroup = useCallback((input: { title: string; areaId: string }) => {
    const id = newId("fg");
    const group: FeatureGroup = {
      id, title: input.title.trim() || "Untitled group",
      areaId: input.areaId, createdAt: nowISO(),
    };
    setFeatureGroups(prev => prev.some(g => g.id === id) ? prev : [...prev, group]);
    return id;
  }, []);
  const updateFeatureGroup = useCallback((id: string, patch: Partial<FeatureGroup>) => {
    setFeatureGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }, []);
  const deleteFeatureGroup = useCallback((id: string) => {
    // Detach features in the group rather than deleting them — typed
    // features outlive their grouping. The group itself is removed.
    setFeatureGroups(prev => prev.filter(g => g.id !== id));
    setFeatures(prev => prev.map(f => f.featureGroupId === id ? { ...f, featureGroupId: undefined } : f));
    // Cascade into milestone productPriorities + linked arrays.
    const key = milestoneLinkKey("group", id);
    setReleases(prev => prev.map(r => {
      if (!r.linkedFeatureGroupIds.includes(id) && !(key in r.productPriorities)) return r;
      const nextPriorities = { ...r.productPriorities };
      delete nextPriorities[key];
      return {
        ...r,
        linkedFeatureGroupIds: r.linkedFeatureGroupIds.filter(gid => gid !== id),
        productPriorities: nextPriorities,
      };
    }));
  }, []);

  const createProductCapability = useCallback((input: { title: string; featureId: string }) => {
    const id = newId("cap");
    const cap: ProductCapability = {
      id, title: input.title.trim() || "Untitled capability",
      featureId: input.featureId, createdAt: nowISO(),
    };
    setProductCapabilities(prev => prev.some(c => c.id === id) ? prev : [...prev, cap]);
    return id;
  }, []);
  const updateProductCapability = useCallback((id: string, patch: Partial<ProductCapability>) => {
    setProductCapabilities(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }, []);
  const deleteProductCapability = useCallback((id: string) => {
    setProductCapabilities(prev => prev.filter(c => c.id !== id));
    // Cascade: drop the capability from every slice that selected it,
    // from every weekly goal that linked it, and from every release
    // that packaged it.
    setFeatureSlices(prev => prev.map(s => {
      if (!s.capabilityStatus || !(id in s.capabilityStatus)) return s;
      const next = { ...s.capabilityStatus };
      delete next[id];
      return { ...s, capabilityStatus: next };
    }));
    setWeeklyGoals(prev => prev.map(g => g.linkedCapabilityIds.includes(id)
      ? { ...g, linkedCapabilityIds: g.linkedCapabilityIds.filter(cid => cid !== id) }
      : g));
    setReleases(prev => prev.map(r => r.linkedCapabilityIds.includes(id)
      ? { ...r, linkedCapabilityIds: r.linkedCapabilityIds.filter(cid => cid !== id) }
      : r));
    setThemes(prev => prev.map(t => t.linkedCapabilityIds.includes(id)
      ? { ...t, linkedCapabilityIds: t.linkedCapabilityIds.filter(cid => cid !== id) }
      : t));
  }, []);

  // ── Milestones (internal name kept as `release`) ─────────────────────
  // Each product-object toggle adds/removes the id from the relevant
  // linked array AND sets/removes the matching entry in productPriorities
  // so the per-milestone MoSCoW priority arrives + disappears with the
  // link itself. New links default to "must" — the user is normally
  // adding work they expect to ship, and a Must-have can always be
  // downgraded inline.
  const createRelease = useCallback((input: { title: string; description?: string }) => {
    const id = newId("rel");
    const now = nowISO();
    // A brand-new milestone is its OWN family root: versionFamilyId
    // points at itself. cloneRelease() below mints downstream versions
    // that share this id as their family root.
    const rel: Release = {
      id,
      title: input.title.trim() || "Untitled milestone",
      description: input.description,
      status: "planned",
      linkedGoalIds: [],
      linkedAreaIds: [], linkedFeatureGroupIds: [],
      linkedFeatureIds: [], linkedSliceIds: [], linkedCapabilityIds: [],
      productPriorities: {},
      versionFamilyId: id,
      versionLabel: "v1",
      versionSummary: "Initial draft",
      auditLog: [
        {
          id: newId("audit"), at: now,
          summary: `Created milestone — ${input.title.trim() || "Untitled milestone"} · v1`,
          kind: "created",
        },
      ],
      createdAt: now,
    };
    setReleases(prev => prev.some(r => r.id === id) ? prev : [...prev, rel]);
    return id;
  }, []);
  // Append a single line to a milestone's audit log. Callers compose
  // the summary string (they already have human-readable names of the
  // objects being mutated on hand). Append-only; entries never edit.
  const recordMilestoneAudit = useCallback((
    releaseId: string,
    summary: string,
    structured?: {
      kind?: MilestoneAuditKind;
      objectLabel?: string;
      previousValue?: string;
      nextValue?: string;
    },
  ) => {
    const at = nowISO();
    const entry: MilestoneAuditEntry = {
      id: newId("audit"),
      at,
      summary,
      kind: structured?.kind,
      objectLabel: structured?.objectLabel,
      previousValue: structured?.previousValue,
      nextValue: structured?.nextValue,
    };
    setReleases(prev => prev.map(r => r.id === releaseId
      ? { ...r, auditLog: [...r.auditLog, entry] }
      : r));
  }, []);
  // Clone a milestone into the next version in its family. The new
  // row inherits scope / status / dates as a starting point, points
  // back at the source via versionParentId, and shares the source's
  // versionFamilyId so they group together in the UI. Audit log on
  // the clone records its origin; the source gets a "Cloned to vN"
  // entry as well so you can trace lineage in either direction.
  const cloneRelease = useCallback((sourceId: string, opts?: { summary?: string }) => {
    const newReleaseId = newId("rel");
    const now = nowISO();
    setReleases(prev => {
      const source = prev.find(r => r.id === sourceId);
      if (!source) return prev;
      // Compute next version label across the existing family. We
      // count + 1 rather than max(vN)+1 so deletions don't reuse
      // labels (e.g. v1, v3 still produces v3 → next is v4 because
      // family.length === 2).
      const familyId = source.versionFamilyId;
      const familySize = prev.filter(r => r.versionFamilyId === familyId).length;
      const label = `v${familySize + 1}`;
      const cloneEntry: MilestoneAuditEntry = {
        id: newId("audit"),
        at: now,
        summary: opts?.summary
          ? `Created ${label} from ${source.versionLabel} — ${opts.summary}`
          : `Created ${label} from ${source.versionLabel}`,
        kind: "cloned_from",
        previousValue: source.versionLabel,
        nextValue: label,
        objectLabel: opts?.summary,
      };
      const sourceEntry: MilestoneAuditEntry = {
        id: newId("audit"),
        at: now,
        summary: `Cloned to ${label}`,
        kind: "cloned_to",
        previousValue: source.versionLabel,
        nextValue: label,
      };
      const clone: Release = {
        ...source,
        id: newReleaseId,
        versionLabel: label,
        versionParentId: source.id,
        versionFamilyId: familyId,
        versionSummary: opts?.summary,
        // Fresh audit log for the clone — copying the source's log
        // would conflate two separate timelines. Clone log starts
        // with the lineage marker.
        auditLog: [cloneEntry],
        createdAt: now,
      };
      return prev.map(r => r.id === sourceId
        ? { ...r, auditLog: [...r.auditLog, sourceEntry] }
        : r,
      ).concat(clone);
    });
    return newReleaseId;
  }, []);
  const updateRelease = useCallback((id: string, patch: Partial<Release>) => {
    setReleases(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);
  const deleteRelease = useCallback((id: string) => {
    setReleases(prev => prev.filter(r => r.id !== id));
    setThemes(prev => prev.map(t => t.linkedReleaseIds.includes(id)
      ? { ...t, linkedReleaseIds: t.linkedReleaseIds.filter(rid => rid !== id) }
      : t));
  }, []);
  const toggleReleaseGoal = useCallback((releaseId: string, goalId: string) => {
    // Goals don't carry MoSCoW — straight array toggle.
    setReleases(prev => prev.map(r => r.id === releaseId
      ? { ...r, linkedGoalIds: toggleArrayMember(r.linkedGoalIds, goalId) }
      : r));
  }, []);
  // Internal helper — atomically flip a product-object link AND keep
  // productPriorities in sync. Adding seeds priority "must"; removing
  // deletes the priority entry.
  const toggleProductObject = (
    releaseId: string,
    arrayKey: "linkedAreaIds" | "linkedFeatureGroupIds" | "linkedFeatureIds" | "linkedSliceIds" | "linkedCapabilityIds",
    kind: MilestoneObjectKind,
    objectId: string,
  ) => {
    setReleases(prev => prev.map(r => {
      if (r.id !== releaseId) return r;
      const current = r[arrayKey];
      const has = current.includes(objectId);
      const nextArr = has
        ? current.filter(x => x !== objectId)
        : [...current, objectId];
      const nextPriorities = { ...r.productPriorities };
      const k = milestoneLinkKey(kind, objectId);
      if (has) {
        delete nextPriorities[k];
      } else if (!(k in nextPriorities)) {
        nextPriorities[k] = { priority: "must" };
      }
      return { ...r, [arrayKey]: nextArr, productPriorities: nextPriorities };
    }));
  };
  const toggleReleaseArea = useCallback((releaseId: string, areaId: string) => {
    toggleProductObject(releaseId, "linkedAreaIds", "area", areaId);
  }, []);
  const toggleReleaseFeatureGroup = useCallback((releaseId: string, groupId: string) => {
    toggleProductObject(releaseId, "linkedFeatureGroupIds", "group", groupId);
  }, []);
  const toggleReleaseFeature = useCallback((releaseId: string, featureId: string) => {
    toggleProductObject(releaseId, "linkedFeatureIds", "feature", featureId);
  }, []);
  const toggleReleaseSlice = useCallback((releaseId: string, sliceId: string) => {
    toggleProductObject(releaseId, "linkedSliceIds", "slice", sliceId);
  }, []);
  const toggleReleaseCapability = useCallback((releaseId: string, capabilityId: string) => {
    toggleProductObject(releaseId, "linkedCapabilityIds", "capability", capabilityId);
  }, []);

  const setMilestoneObjectPriority = useCallback((releaseId: string, kind: MilestoneObjectKind, objectId: string, priority: MoscowPriority) => {
    const k = milestoneLinkKey(kind, objectId);
    setReleases(prev => prev.map(r => {
      if (r.id !== releaseId) return r;
      const existing = r.productPriorities[k];
      return {
        ...r,
        productPriorities: {
          ...r.productPriorities,
          [k]: { ...(existing ?? {}), priority },
        },
      };
    }));
  }, []);
  const setMilestoneObjectNote = useCallback((releaseId: string, kind: MilestoneObjectKind, objectId: string, note: string) => {
    const k = milestoneLinkKey(kind, objectId);
    setReleases(prev => prev.map(r => {
      if (r.id !== releaseId) return r;
      const existing = r.productPriorities[k] ?? { priority: "must" as MoscowPriority };
      const trimmed = note.trim();
      return {
        ...r,
        productPriorities: {
          ...r.productPriorities,
          [k]: { ...existing, note: trimmed === "" ? undefined : trimmed },
        },
      };
    }));
  }, []);

  // ── Themes — CRUD + link toggles ─────────────────────────────────────
  const createTheme = useCallback((input: { title: string; description?: string; color?: RoadmapTheme["color"] }) => {
    const id = newId("theme");
    const theme: RoadmapTheme = {
      id,
      title: input.title.trim() || "Untitled theme",
      description: input.description,
      color: input.color,
      linkedGoalIds: [], linkedIntentIds: [],
      linkedFeatureIds: [], linkedSliceIds: [],
      linkedCapabilityIds: [], linkedReleaseIds: [],
      createdAt: nowISO(),
    };
    setThemes(prev => prev.some(t => t.id === id) ? prev : [...prev, theme]);
    return id;
  }, []);
  const updateTheme = useCallback((id: string, patch: Partial<RoadmapTheme>) => {
    setThemes(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);
  const deleteTheme = useCallback((id: string) => {
    setThemes(prev => prev.filter(t => t.id !== id));
  }, []);
  const toggleThemeGoal = useCallback((themeId: string, goalId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedGoalIds: toggleArrayMember(t.linkedGoalIds, goalId) }
      : t));
  }, []);
  const toggleThemeIntent = useCallback((themeId: string, intentId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedIntentIds: toggleArrayMember(t.linkedIntentIds, intentId) }
      : t));
  }, []);
  const toggleThemeFeature = useCallback((themeId: string, featureId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedFeatureIds: toggleArrayMember(t.linkedFeatureIds, featureId) }
      : t));
  }, []);
  const toggleThemeSlice = useCallback((themeId: string, sliceId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedSliceIds: toggleArrayMember(t.linkedSliceIds, sliceId) }
      : t));
  }, []);
  const toggleThemeCapability = useCallback((themeId: string, capabilityId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedCapabilityIds: toggleArrayMember(t.linkedCapabilityIds, capabilityId) }
      : t));
  }, []);
  const toggleThemeRelease = useCallback((themeId: string, releaseId: string) => {
    setThemes(prev => prev.map(t => t.id === themeId
      ? { ...t, linkedReleaseIds: toggleArrayMember(t.linkedReleaseIds, releaseId) }
      : t));
  }, []);

  // ── SignalGroups — persistent signal review workspaces ───────────────
  // Many-to-many with signals. updatedAt is touched on any mutation so
  // the Groups list panel can sort by "most recently active" if needed
  // later. Cascade: when a signal is hard-deleted we'd drop it from
  // groups, but the prototype only soft-closes signals (status flip),
  // so a closed signal stays in its groups — that matches the spec's
  // "saved scratchpad" intent (closed signals remain reviewable).
  const createSignalGroup = useCallback((input: { name: string; signalIds?: string[]; reasons?: SignalGroupReason[]; notes?: string }) => {
    const id = newId("sg");
    const now = nowISO();
    const group: SignalGroup = {
      id,
      name: input.name.trim() || "Untitled group",
      notes: input.notes,
      status: "open",
      reasons: input.reasons ?? [],
      signalIds: input.signalIds ?? [],
      linkedIntentIds: [],
      owner: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
    };
    setSignalGroups(prev => prev.some(g => g.id === id) ? prev : [...prev, group]);
    return id;
  }, []);
  const updateSignalGroup = useCallback((id: string, patch: Partial<SignalGroup>) => {
    setSignalGroups(prev => prev.map(g => g.id === id
      ? { ...g, ...patch, updatedAt: nowISO() }
      : g));
  }, []);
  const deleteSignalGroup = useCallback((id: string) => {
    setSignalGroups(prev => prev.filter(g => g.id !== id));
  }, []);
  const addSignalToGroup = useCallback((groupId: string, signalId: string) => {
    setSignalGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      if (g.signalIds.includes(signalId)) return g;
      return { ...g, signalIds: [...g.signalIds, signalId], updatedAt: nowISO() };
    }));
  }, []);
  const removeSignalFromGroup = useCallback((groupId: string, signalId: string) => {
    setSignalGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      if (!g.signalIds.includes(signalId)) return g;
      return { ...g, signalIds: g.signalIds.filter(sid => sid !== signalId), updatedAt: nowISO() };
    }));
  }, []);
  const addSignalsToGroup = useCallback((groupId: string, signalIds: string[]) => {
    setSignalGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const next = Array.from(new Set([...g.signalIds, ...signalIds]));
      if (next.length === g.signalIds.length) return g;
      return { ...g, signalIds: next, updatedAt: nowISO() };
    }));
  }, []);
  const openGroup = useCallback((groupId: string | null) => {
    setSignalGroupFilter(groupId);
  }, []);
  const setSignalsViewMode = useCallback((m: "list" | "groups") => {
    setSignalsViewModeState(m);
  }, []);
  const removeSignalsFromGroup = useCallback((groupId: string, signalIds: string[]) => {
    setSignalGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const drop = new Set(signalIds);
      const next = g.signalIds.filter(sid => !drop.has(sid));
      if (next.length === g.signalIds.length) return g;
      return { ...g, signalIds: next, updatedAt: nowISO() };
    }));
  }, []);

  // ── Draft intents — planning records inside a SignalGroup ───────────
  const createDraftIntent = useCallback((input: {
    groupId: string;
    title: string;
    description?: string;
    signalIds: string[];
    notes?: string;
    suggestedTasks?: string[];
    acceptanceCriteria?: string[];
    context?: string;
    decisionRationale?: string;
    rejectedAlternatives?: string;
    plan?: string;
  }) => {
    const id = newId("di");
    const now = nowISO();
    const draft: DraftIntent = {
      id,
      groupId: input.groupId,
      title: input.title.trim() || "Untitled draft intent",
      description: input.description ?? "",
      signalIds: input.signalIds.slice(),
      notes: input.notes,
      suggestedTasks: input.suggestedTasks ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      context: input.context,
      decisionRationale: input.decisionRationale,
      rejectedAlternatives: input.rejectedAlternatives,
      plan: input.plan,
      createdAt: now,
      updatedAt: now,
    };
    setDraftIntents(prev => prev.some(d => d.id === id) ? prev : [...prev, draft]);
    // Touch the group's updatedAt so the panel sorts naturally.
    setSignalGroups(prev => prev.map(g => g.id === input.groupId ? { ...g, updatedAt: now } : g));
    return id;
  }, []);
  const updateDraftIntent = useCallback((id: string, patch: Partial<Omit<DraftIntent, "id" | "groupId" | "createdAt">>) => {
    setDraftIntents(prev => prev.map(d => d.id === id
      ? { ...d, ...patch, updatedAt: nowISO() }
      : d));
  }, []);
  const deleteDraftIntent = useCallback((id: string) => {
    setDraftIntents(prev => prev.filter(d => d.id !== id));
  }, []);
  const finalizeDraftIntent = useCallback((id: string): string | null => {
    const draft = draftIntents.find(d => d.id === id);
    if (!draft) return null;
    if (draft.finalizedWipId) return draft.finalizedWipId;        // already finalized — idempotent
    if (draft.signalIds.length === 0)             return null;    // need at least one signal to satisfy createWorkItem
    // Generate the wip id ourselves so we can stamp it on the draft +
    // the group immediately. createWorkItem accepts an explicit
    // signalIds list via opts — we pass everything through.
    const newWipId = `w-${String(wipIdCounter++).padStart(2, "0")}`;
    // We can't easily call createWorkItem and read its id back since
    // createWorkItem returns void. Re-implement the minimal slice here.
    const sourceIds = draft.signalIds;
    const sourceSignals = signals.filter(s => sourceIds.includes(s.id));
    if (sourceSignals.length === 0) return null;
    const now = nowISO();
    // Copy the structured planning fields straight from the draft so
    // the new Wip lands fully populated. acceptanceCriteria converts
    // from `string[]` to `AcceptanceCriterion[]` with done:false (the
    // Wip side wants per-item ids + done flags). Empty / undefined
    // fields just don't get set.
    const acItems: import("./data").AcceptanceCriterion[] =
      (draft.acceptanceCriteria ?? [])
        .map(t => t.trim())
        .filter(Boolean)
        .map((text, idx) => ({ id: `ac-${newWipId}-${idx}`, text, done: false }));
    const newWip: Wip = {
      id: newWipId, type: "intent",
      title: draft.title.trim() || "Untitled intent",
      description: draft.description ?? "",
      column: "to_do",
      location: sprints.find(s => s.active)?.id || "backlog",
      assignee: null,
      linkedSignals: sourceIds.slice(),
      ...(draft.context              ? { context: draft.context } : {}),
      ...(acItems.length > 0         ? { acceptanceCriteria: acItems } : {}),
      ...(draft.decisionRationale    ? { decisionRationale: draft.decisionRationale } : {}),
      ...(draft.rejectedAlternatives ? { rejectedAlternatives: draft.rejectedAlternatives } : {}),
      ...(draft.plan                 ? { plan: draft.plan } : {}),
    };
    setWipItems(prev => prev.some(w => w.id === newWipId) ? prev : [...prev, newWip]);
    // Flip every source signal to Ready + add the linkedWip edge — same
    // side-effects the regular create flow performs.
    setSignals(prev => prev.map(s => sourceIds.includes(s.id)
      ? { ...s, status: "ready", statusUpdatedAt: now,
          linkedWip: s.linkedWip.includes(newWipId) ? s.linkedWip : [...s.linkedWip, newWipId] }
      : s));
    // Per-link relationship rows (signal ↔ wip) — partial by default.
    setSignalWipLinks(prev => {
      const additions: SignalWipLink[] = sourceSignals
        .filter(s => !prev.some(l => l.signalId === s.id && l.wipId === newWipId))
        .map(s => ({
          id: `link-${Date.now().toString(36)}-${s.id}`,
          signalId: s.id, wipId: newWipId, relationship: "partially_addresses",
          createdAt: now, createdBy: CURRENT_USER_ID,
        }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    // Stamp the draft as finalized — kept in the list as history.
    setDraftIntents(prev => prev.map(d => d.id === id
      ? { ...d, finalizedWipId: newWipId, finalizedAt: now, updatedAt: now }
      : d));
    // Link the group to the new intent so the workspace can surface it
    // in the "Linked intents" section.
    setSignalGroups(prev => prev.map(g => g.id === draft.groupId
      ? { ...g,
          linkedIntentIds: g.linkedIntentIds.includes(newWipId)
            ? g.linkedIntentIds
            : [...g.linkedIntentIds, newWipId],
          updatedAt: now }
      : g));
    recordWipEvent({ wipId: newWipId, kind: "created", actor: CURRENT_USER_ID });
    recordTransaction({
      // Reuse the generic status_change action since the system already
      // routes "create" semantics through it for similar flows
      // (createWorkItem uses the same action). Keeps the transaction
      // enum stable.
      action: "status_change",
      actor: CURRENT_USER_ID,
      summary: `Finalized draft "${draft.title}" → intent "${newWip.title}"`,
      affectedSignalIds: sourceIds.slice(),
      changes: [],
    });
    return newWipId;
  }, [draftIntents, signals, sprints, recordTransaction, recordWipEvent]);

  // Link the group to an EXISTING intent (no draft involved). Each
  // selected signal also gets linked to the intent via the normal
  // linkSignalToWip path so the per-signal relationship + Ready flip
  // happen unchanged.
  const linkGroupToExistingIntent = useCallback((groupId: string, intentId: string, signalIds: string[]) => {
    const wip = wipItems.find(w => w.id === intentId);
    if (!wip || wip.type !== "intent") return;
    signalIds.forEach(sid => {
      linkSignalToWip(sid, intentId, "partially_addresses");
    });
    setSignalGroups(prev => prev.map(g => g.id === groupId
      ? { ...g,
          linkedIntentIds: g.linkedIntentIds.includes(intentId)
            ? g.linkedIntentIds
            : [...g.linkedIntentIds, intentId],
          updatedAt: nowISO() }
      : g));
  }, [wipItems, linkSignalToWip]);

  const setSliceCapabilityStatus = useCallback((sliceId: string, capabilityId: string, status: SliceCapabilityStatus | null) => {
    setFeatureSlices(prev => prev.map(s => {
      if (s.id !== sliceId) return s;
      // Validate the capability belongs to the slice's parent feature.
      const cap = productCapabilities.find(c => c.id === capabilityId);
      if (!cap || cap.featureId !== s.featureId) return s;
      const next: Record<string, SliceCapabilityStatus> = { ...(s.capabilityStatus ?? {}) };
      if (status === null) {
        delete next[capabilityId];
      } else {
        next[capabilityId] = status;
      }
      return { ...s, capabilityStatus: next };
    }));
  }, [productCapabilities]);

  // ── Auto-revive expired skips ──────────────────────────────────────────
  // Runs whenever the signals list changes. We sweep once per minute as
  // a fallback and on every render — the work is O(skipped signals).
  // Auto-revive flips status back to preSkipStatus and emits a small
  // toast so the user sees what came back.
  useEffect(() => {
    const sweep = () => {
      const now = Date.now();
      const expired = signals.filter(s =>
        s.status === "skipped" && s.skipUntil && new Date(s.skipUntil).getTime() <= now
      );
      if (expired.length === 0) return;
      const nowISO = new Date(now).toISOString();
      setSignals(prev => prev.map(s => {
        if (!expired.some(e => e.id === s.id)) return s;
        const target: SignalStatus = s.preSkipStatus ?? "new";
        return {
          ...s,
          status: target,
          statusUpdatedAt: nowISO,
          skipUntil: undefined,
          skipReason: undefined,
          preSkipStatus: undefined,
        };
      }));
      // One toast per signal would be noisy — aggregate into a single
      // summary so the user sees "3 skipped signals returned".
      const summary = expired.length === 1
        ? `Skip ended — “${expired[0].title}” returned`
        : `${expired.length} skipped signals returned`;
      recordTransaction({
        action: "status_change", actor: CURRENT_USER_ID,
        summary,
        affectedSignalIds: expired.map(s => s.id),
        changes: expired.map(s => ({
          signalId: s.id, field: "status" as keyof Signal,
          before: "skipped", after: s.preSkipStatus ?? "new",
        })),
      });
    };
    sweep();
    const t = setInterval(sweep, 60_000);
    return () => clearInterval(t);
  }, [signals, recordTransaction]);


  const value: Store = {
    signals, wipItems, sprints, notes, wipComments, wipAttachments, hideUnderRules,
    signalComments, signalAttachments, signalWipLinks,
    postCreatePrompt, sourceOfWipFilter, roadmapFocus,
    weeklyGoals, productAreas, features, featureSlices, featureGroups, productCapabilities,
    releases, themes, signalGroups, signalGroupFilter, signalsViewMode, draftIntents,
    duplicateGroups,
    splitView,
    wipEvents, clientPreviousVisitAt,
    transactions, toastTxIds,
    route, view, groupBy, filters, search,
    selection, openSignalId, selectedWipId, density, tweaksOpen, defaultView,
    currentUserId: CURRENT_USER_ID,
    appMode, theme,
    setRoute, setView, setGroupBy, setFilters, setSearch, setAppMode, resetClientVisit,
    setTheme,
    toggleSelect, selectAll, clearSelection, openSignal, updateSignal, closeSignalWithReason, cloneSignal,
    splitSignal,
    setTpaNote,
    linkSignalToWip, unlinkSignalFromWip, setLinkRelationship,
    dismissPostCreatePrompt, setSourceOfWipFilter,
    createWeeklyGoal, updateWeeklyGoal, deleteWeeklyGoal,
    createProductArea, updateProductArea, deleteProductArea,
    createFeature, updateFeature, deleteFeature,
    createFeatureSlice, updateFeatureSlice, deleteFeatureSlice,
    toggleGoalFeature, toggleGoalSlice, toggleGoalCapability, toggleGoalIntent,
    setRoadmapFocus,
    toggleFeatureIntent, toggleFeatureSliceIntent,
    createFeatureGroup, updateFeatureGroup, deleteFeatureGroup,
    createProductCapability, updateProductCapability, deleteProductCapability,
    createRelease, updateRelease, deleteRelease,
    toggleReleaseGoal, toggleReleaseFeature, toggleReleaseSlice, toggleReleaseCapability,
    toggleReleaseArea, toggleReleaseFeatureGroup,
    setMilestoneObjectPriority, setMilestoneObjectNote,
    recordMilestoneAudit, cloneRelease,
    createTheme, updateTheme, deleteTheme,
    toggleThemeGoal, toggleThemeIntent, toggleThemeFeature, toggleThemeSlice, toggleThemeCapability, toggleThemeRelease,
    createSignalGroup, updateSignalGroup, deleteSignalGroup,
    addSignalToGroup, removeSignalFromGroup, addSignalsToGroup, removeSignalsFromGroup, openGroup, setSignalsViewMode,
    markSignalsAsDuplicatesOf, closeSignalAsDuplicateOf,
    createDraftIntent, updateDraftIntent, deleteDraftIntent, finalizeDraftIntent, linkGroupToExistingIntent,
    setSliceCapabilityStatus,
    skipSignal, rejectSignalWithReason, reopenSignalWithReason, reviveSkip,
    openSplitView, closeSplitView,
    acceptDuplicateGroup, rejectDuplicateGroup,
    removeSignalFromDuplicateGroup, addSignalToDuplicateGroup,
    applyStatusToDuplicateGroup,
    setMainSignal, addDuplicateLink, closeDuplicateGroup, createWipFromDuplicateGroup,
    markDuplicateGroupSeen,
    bulkSetStatus, bulkAddLabel, createWorkItem, createFromSignal, updateWip,
    reviewWipLooksGood, reviewWipFollowUp, createFollowUp,
    addAcceptanceCriterion, updateAcceptanceCriterion, removeAcceptanceCriterion,
    moveWipUp, moveWipDown, createSignalFromComment,
    openWip, moveWip, newSprint, createNote, setDensity, setTweaksOpen,
    addComment, addAttachment, addSignalComment, addSignalAttachment,
    hideUnder, removeFromHideUnder, removeHideUnderRule,
    bulkUpdateSignalStatus,
    undoTransaction, dismissToast, getTxSafety,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function summariseStatus(status: SignalStatus, n: number): string {
  const verb =
    status === "closed"   ? "closed"   :
    status === "accepted" ? "accepted" :
    status === "ready"    ? "marked Ready" :
    status === "rejected" ? "rejected" :
    "set to new";
  return `${n} signal${n === 1 ? "" : "s"} ${verb}`;
}
