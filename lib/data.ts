"use client";
export type SignalStatus   = "new" | "accepted" | "ready" | "skipped" | "rejected" | "closed";
export type SignalSource   = "feedback" | "note";
export type WipType        = "task" | "intent";
export type WipColumn      = "backlog" | "to_do" | "in_progress" | "done";
export type Visibility     = "internal" | "client";
export type SignalPriority = "low" | "medium" | "high" | "urgent";

/** Auto-assigns priority from labels + source. Used for new signals and seed data. */
export function computeAutoPriority(labels: string[], source: SignalSource): SignalPriority {
  const l = labels;
  if (source === "feedback" && l.some(x => ["auth", "onboarding"].includes(x))) return "urgent";
  if (l.some(x => ["bug", "perf"].includes(x)) && source === "feedback")         return "high";
  if (l.some(x => ["bug", "perf", "export"].includes(x)))                        return "high";
  if (l.some(x => ["ux","mobile","filters","search","keyboard","navigation","accessibility"].includes(x))) return "medium";
  if (source === "feedback") return "medium";
  return "low";
}

export interface User { id: string; name: string; initials: string; color: string; }

// Digest = AI/system summary section shown on the signal detail.
// Populated lazily via deriveDigest() so seed signals don't need to enumerate it.
export interface DigestActivity {
  at: string;                                         // ISO date
  kind: "summary" | "suggestion" | "assessment" | "source" | "relation";
  text: string;
}
export interface SignalDigest {
  summary: string;                  // one-paragraph AI summary of the signal
  suggestedLabels: string[];        // labels the AI thinks fit
  relatedCandidates: string[];      // signal IDs the AI thinks are related
  assessment: string;               // AI assessment / risk / impact note
  activity: DigestActivity[];       // chronological recent automated activity
}

export interface Signal {
  id: string; title: string; description: string; labels: string[];
  author: string; source: SignalSource; status: SignalStatus;
  screenshots: number; createdAt: string; statusUpdatedAt: string | null; linkedWip: string[];
  priority: SignalPriority;
  priorityOverride?: boolean; // true = user manually set, won't be re-computed
  // optional per-signal digest override; if absent, deriveDigest(signal) generates one
  digest?: SignalDigest;
  // Populated when the signal moves to "closed" so the modal can render
  // "Closed because the linked task moved to Done" instead of a silent
  // status pill. Stays attached if the signal is later reopened so we can
  // expose history; new closures overwrite it.
  closure?: SignalClosure;
  // When this signal was created by Split, this points back at the original.
  // Used to (a) cap the number of splits per source at SPLIT_MAX_PER_SOURCE,
  // (b) render a "split from" hint on the modal, and (c) let the user
  // navigate back to the source from a derived signal.
  splitFromId?: string;
  // Follow-up linkage: if this signal was created as a follow-up FROM a
  // WIP item (via the review flow's "Create follow-up signal"), this
  // points back at the originating wip so the signal modal can render
  // "Follow-up from intent X". A reverse pointer lives on Wip.followUpIds.
  followUpOfWipId?: string;
  // ── Skip workflow ──────────────────────────────────────────────────────
  // When the user defers a signal, status flips to "skipped" and these
  // fields capture the timing + reason. `skipUntil` is null for
  // "skip indefinitely". When the date passes, the auto-revive helper
  // returns the signal to its pre-skip status (saved on `preSkipStatus`).
  skipUntil?: string | null;
  skipReason?: string;
  preSkipStatus?: SignalStatus;
  // ── Generic status reasons ─────────────────────────────────────────────
  // Free-text annotation captured on reject / reopen so the history view
  // can explain "why was this rejected?". Close uses `closure.note`.
  rejectionReason?: string;
  reopenReason?: string;
  // ── TPA annotation ─────────────────────────────────────────────────────
  // Single-slot internal note the TPA writes to clarify / interpret the
  // raw signal without editing the original `description`. Never crosses
  // the team/client boundary — hidden in client mode, excluded from
  // client reports. Empty string = no note (the toggle in the modal
  // shows the "no annotation yet" state).
  tpaNote?: string;
  tpaNoteAt?: string;     // ISO timestamp of last edit
  tpaNoteBy?: string;     // user id of last editor
}

// Maximum number of split-derived signals allowed per source. Hard cap kept
// in shared code so both the store-side guard and the UI's disabled-button
// state stay in lockstep.
export const SPLIT_MAX_PER_SOURCE = 5;

// How many split-derived signals a given source has spawned. Pure helper
// (filters the array) so callers don't need to keep their own counts.
export function splitChildrenCount(signals: Signal[], sourceId: string): number {
  return signals.reduce((n, s) => s.splitFromId === sourceId ? n + 1 : n, 0);
}

// Why / when a signal was closed. Drives the "Closed because…" banner on
// the signal modal and links back to the wip when the closure flowed from
// a task/intent reaching Done.
//
// `reviewed` is a stronger variant of task_done/intent_done: the user
// explicitly clicked "Looks good" on the WIP review step and chose to
// close linked signals. We keep the old reasons around for back-compat
// (existing seed signals + signals that were closed before review-flow
// landed), but new closure flows funnel through `reviewed` whenever the
// user goes through the review step.
//
// `note` is an optional free-text annotation captured on manual close —
// e.g. "out of scope", "duplicate of #s12 (decided not to merge)". Shown
// verbatim on the closure banner.
export interface SignalClosure {
  reason: "task_done" | "intent_done" | "reviewed" | "manual" | "system";
  wipId?: string;       // populated for task_done / intent_done / reviewed
  actor?: string;       // user id, for manual / system / reviewed
  at: string;           // ISO
  note?: string;
}

// Files attached to a signal. Distinct from the existing `screenshots`
// integer (which is just a count rendered as placeholder tiles); this is
// a real per-file record with a name/type/size we can show in the modal
// and indicate on cards.
export interface SignalAttachment {
  id: string;
  signalId: string;
  name: string;
  mimeType: string;
  size: string;
  uploadedBy: string;
  createdAt: string;
}

/**
 * A hide-under rule scopes a "main signal absorbs others" relationship to an
 * exact filter context. Two filters that differ in any label are independent
 * rules — `bug` and `bug+bugA` are not the same scope.
 */
export interface HideUnderRule {
  id: string;
  filterLabels: string[];   // sorted ascending; serves as composite key for the scope
  mainSignalId: string;     // the visible signal that absorbs the others
  hiddenSignalIds: string[];
  createdAt: string;
}

// ── Duplicate groups ──────────────────────────────────────────────────────
// A duplicate group ties together signals that represent the same underlying
// issue/request. Distinct from labels (topic-grouping) and hide-under
// (visual collapse): a confirmed duplicate group is a strong relationship
// that affects bulk-action prompts (e.g. "close this only / close all").
//
// Two phases share one model so we don't keep two parallel collections:
//   • `confirmed: false` — a *suggestion* from the system. The user must
//     accept/reject/adjust before it's binding.
//   • `confirmed: true`  — the user has accepted the group. It now drives
//     the "Duplicate ×N" badge and the apply-to-all prompts.
export interface DuplicateGroup {
  id: string;
  signalIds: string[];     // always 2+. If <2 after edits, the group is dropped.
  confirmed: boolean;
  createdAt: string;
  confirmedAt?: string;    // ISO timestamp set when the user accepts
  // Main signal of the group. The main signal provides the group's title,
  // status, and labels for the stacked group-card display. Optional —
  // when undefined we fall back to the oldest member (see `mainSignalOf`).
  // Only the user setting it explicitly via `setMainSignal` writes here;
  // accept-on-suggestion does not auto-set, so the default-oldest rule
  // remains the canonical behaviour until the user changes it.
  mainSignalId?: string;
  // Optional human-readable reason the suggestion was generated. Helps the
  // user decide whether to accept ("3 signals share the labels button + bug").
  // For richer reasoning the `reasons` field is preferred — it renders as a
  // bullet list. We keep `reason` for back-compat and as a one-line fallback.
  reason?: string;
  reasons?: string[];
  // Snapshot of `signalIds` taken when the user last reviewed this group.
  // Drives the "new / changed" highlight: a group is fresh-looking until
  // the snapshot matches the live ids exactly. We compare by content, not
  // length, so add+remove-of-different-signals still trips as "changed".
  // Undefined means "never seen" — every freshly-suggested group starts here.
  seenSignalIds?: string[];
}

// Resolve the main signal of a duplicate group. Falls back to the oldest
// member when `mainSignalId` is unset or points at a removed signal.
// Returns undefined for an empty group (which shouldn't exist — groups
// auto-delete below 2 members — but defensive anyway).
export function mainSignalOf(group: DuplicateGroup, signals: Signal[]): Signal | undefined {
  // Explicit choice wins, but only if the chosen signal is still in the group.
  if (group.mainSignalId && group.signalIds.includes(group.mainSignalId)) {
    const m = signals.find(s => s.id === group.mainSignalId);
    if (m) return m;
  }
  // Default: oldest by createdAt among current members.
  const members = group.signalIds
    .map(id => signals.find(s => s.id === id))
    .filter((s): s is Signal => !!s);
  if (members.length === 0) return undefined;
  members.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return members[0];
}

// Resolve the (at most one) duplicate group a signal belongs to. We don't
// allow a signal to be in multiple groups in this prototype — keeps the
// "Duplicate ×N" badge unambiguous and simplifies the apply-to-all prompts.
export function findDuplicateGroupForSignal(
  groups: DuplicateGroup[],
  signalId: string,
): DuplicateGroup | undefined {
  return groups.find(g => g.signalIds.includes(signalId));
}

// State machine for the per-signal duplicate badge / modal section.
export type DuplicateState =
  | { kind: "none" }
  | { kind: "possible";  group: DuplicateGroup }
  | { kind: "confirmed"; group: DuplicateGroup };

export function duplicateStateOf(
  groups: DuplicateGroup[],
  signalId: string,
): DuplicateState {
  const g = findDuplicateGroupForSignal(groups, signalId);
  if (!g) return { kind: "none" };
  return g.confirmed ? { kind: "confirmed", group: g } : { kind: "possible", group: g };
}

// Collect WIP items linked to ANY signal in the group. Used to (a) render
// the "Existing work in progress / planned / done" badge on possible-
// duplicate suggestions, and (b) drive the WIP card "matching signal"
// indicator. Returned in stable insertion order; duplicates de-duped.
export function wipsLinkedToGroup(group: DuplicateGroup, signals: Signal[], wipItems: Wip[]): Wip[] {
  const seen = new Set<string>();
  const out: Wip[] = [];
  for (const sigId of group.signalIds) {
    const s = signals.find(x => x.id === sigId);
    if (!s) continue;
    for (const wid of s.linkedWip) {
      if (seen.has(wid)) continue;
      const w = wipItems.find(x => x.id === wid);
      if (!w) continue;
      seen.add(wid);
      out.push(w);
    }
  }
  return out;
}

// "New / changed" detector: returns true when the group hasn't been seen
// in its current shape. Confirmed groups never show as new — once accepted,
// the group is settled; subsequent member edits there are user-driven.
export function isDuplicateGroupNewOrChanged(g: DuplicateGroup): boolean {
  if (g.confirmed) return false;
  if (!g.seenSignalIds) return true;
  if (g.seenSignalIds.length !== g.signalIds.length) return true;
  const prev = new Set(g.seenSignalIds);
  for (const id of g.signalIds) if (!prev.has(id)) return true;
  return false;
}

// ── Transactions / action history ────────────────────────────────────────
// One transaction = one user-or-system action. The store records every
// reversible action as a Transaction so the UI can offer field-level undo
// and a history feed without snapshotting the whole app state.
//
// Field-level model: instead of remembering what the entire signal looked
// like before, we remember the specific (signalId, field, before, after)
// triples. Undo restores only fields whose current value still equals
// `after` — i.e. nobody else has touched them since.

export type TransactionAction =
  | "status_change"        // single signal status changed (modal/inline)
  | "bulk_status_change"   // toolbar bulk-status applied to selection
  | "labels_add"           // labels added to one or more signals
  | "labels_remove"        // labels removed from one or more signals
  | "priority_change"      // priority changed on a signal
  | "hide_under"           // signals hidden under a main signal
  | "restore_from_hidden"  // a single hidden signal restored to visibility
  | "remove_hide_rule"     // an entire hide-under rule was removed
  | "task_created"         // task created from one or more signals
  | "intent_created"       // intent created from one or more signals
  | "ai_processed";        // AI/system processing applied changes

// A single field-level change tied to one signal. `before` / `after` use
// `unknown` because field types vary; consumers cast based on `field`.
export interface FieldChange {
  signalId: string;
  field: keyof Signal;
  before: unknown;
  after: unknown;
}

// Snapshot of a hide-under rule used to undo hide_under / remove_hide_rule
// transactions. Stores the rule state from BEFORE the action so undo can
// restore it exactly (or recreate it if it was deleted).
export interface HideUnderSnapshot {
  ruleId: string;
  filterLabels: string[];
  mainSignalId: string;
  hiddenSignalIds: string[];
  existedBefore: boolean;   // was the rule already present, or did this action create it?
}

export interface Transaction {
  id: string;
  action: TransactionAction;
  actor: string;                  // user id (or "system" for AI events)
  timestamp: string;              // ISO
  summary: string;                // human-readable ("5 signals closed")
  affectedSignalIds: string[];    // for cheap querying / count display
  changes: FieldChange[];         // field-level diffs to undo
  // Related object refs — used both for navigation and for safety checks
  taskId?: string;
  intentId?: string;
  hideUnderRuleId?: string;
  hideUnderBefore?: HideUnderSnapshot;  // pre-action state of the rule, for undo
  // Marked once a successful undo has been performed. Kept in history for
  // audit purposes but excluded from the toast / re-undo logic.
  undone?: boolean;
  undoneAt?: string;
}

// ── Skip helpers ──────────────────────────────────────────────────────────
// "Skipped" defers a signal until a future date. `skipUntil` is the
// expiry; null means indefinite. Helpers tell the UI when a skip is
// expired / returning-soon so the user can act on it.

/** Predefined skip durations exposed to the UI dropdown. */
export const SKIP_DURATIONS: { label: string; days: number | "indefinite" }[] = [
  { label: "1 day",   days: 1 },
  { label: "3 days",  days: 3 },
  { label: "1 week",  days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "Indefinitely", days: "indefinite" },
];

/** True when the signal is in "skipped" status AND its skipUntil is in the past. */
export function isSkipExpired(s: Signal, now: number = Date.now()): boolean {
  if (s.status !== "skipped") return false;
  if (!s.skipUntil) return false; // indefinite skip never expires
  return new Date(s.skipUntil).getTime() <= now;
}

/** True when the skip will lift within the next 24h (drives the "Returning soon" filter). */
export function isSkipReturningSoon(s: Signal, now: number = Date.now()): boolean {
  if (s.status !== "skipped" || !s.skipUntil) return false;
  const ms = new Date(s.skipUntil).getTime() - now;
  return ms > 0 && ms <= 24 * 60 * 60 * 1000;
}

// ── Signal ↔ work-item relationship types ────────────────────────────────
// A signal can connect to an intent / task in several ways. Only `resolves`
// implies that finishing the work resolves the signal; everything else
// keeps the signal open by default. We keep the link table separate from
// `Signal.linkedWip` (which remains the simple membership list) so the
// existing flows keep working while richer link semantics live alongside.
//
// Default relationship when the existing flows create work from a signal
// is `resolves` (matches the current cascade-close behaviour). The user
// can change it from the signal modal.

export type SignalWipRelationship =
  | "resolves"
  | "partially_addresses"
  | "investigates"
  | "researches"
  | "clarifies"
  | "informs"
  | "related_to";

export interface SignalWipLink {
  id: string;
  signalId: string;
  wipId: string;
  relationship: SignalWipRelationship;
  createdAt: string;
  createdBy?: string;
}

/** True when finishing the linked work logically resolves the signal. */
export function relationshipResolvesSignal(rel: SignalWipRelationship): boolean {
  return rel === "resolves";
}

/** Human-readable label for a relationship type. */
export function relationshipLabel(rel: SignalWipRelationship): string {
  switch (rel) {
    case "resolves":            return "Resolves";
    // "Contributes to" reads naturally as the inverse of "source signal"
    // — the relationship the multi-select-create flow defaults to.
    case "partially_addresses": return "Contributes to (source signal)";
    case "investigates":        return "Investigates";
    case "researches":          return "Researches";
    case "clarifies":           return "Clarifies";
    case "informs":             return "Informs";
    case "related_to":          return "Related to";
  }
}

// ── Signal last-activity helpers ─────────────────────────────────────────
// "Last meaningful activity" = newest of (createdAt, statusUpdatedAt, any
// transaction touching this signal). Drives the "Recently changed" sort
// and the small "last changed Xm ago" hint on each card.

export function signalLastActivityAt(signal: Signal, transactions: Transaction[]): string {
  let latest = new Date(signal.statusUpdatedAt ?? signal.createdAt).getTime();
  for (const tx of transactions) {
    if (!tx.affectedSignalIds.includes(signal.id)) continue;
    const ts = new Date(tx.timestamp).getTime();
    if (ts > latest) latest = ts;
  }
  return new Date(latest).toISOString();
}

/**
 * Plain-English summary of the most recent activity. Falls back to
 * "Created" when nothing else happened. Used by the per-card "last
 * changed" hint and the recently-changed sort.
 */
export function signalLastActivityLabel(signal: Signal, transactions: Transaction[]): {
  verb: string; at: string;
} {
  // Pick the latest transaction touching this signal — its summary is
  // already human-readable. Otherwise fall back to status-derived verb.
  let best: Transaction | undefined;
  for (const tx of transactions) {
    if (!tx.affectedSignalIds.includes(signal.id)) continue;
    if (!best || new Date(tx.timestamp).getTime() > new Date(best.timestamp).getTime()) best = tx;
  }
  const statusUpdated = signal.statusUpdatedAt ? new Date(signal.statusUpdatedAt).getTime() : 0;
  if (best && new Date(best.timestamp).getTime() >= statusUpdated) {
    // Trim the transaction summary down to a verb fragment when possible.
    const trimmed = best.summary
      .replace(/^(\d+ )signals? /i, "")    // "5 signals closed" → "closed"
      .replace(/^1 signal /i, "")            // "1 signal accepted" → "accepted"
      .replace(/^Closed: /i, "Closed: ");
    return { verb: capitalize(trimmed), at: best.timestamp };
  }
  if (signal.statusUpdatedAt && signal.status !== "new") {
    const verb =
      signal.status === "accepted" ? "Accepted" :
      signal.status === "ready"    ? "Marked Ready" :
      signal.status === "rejected" ? "Rejected" :
      signal.status === "closed"   ? "Closed" :
      "Updated";
    return { verb, at: signal.statusUpdatedAt };
  }
  return { verb: "Created", at: signal.createdAt };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Review state attached to a WIP item. Only relevant once the item reaches
// the "done" column.
//
//   • "needs_review" — the item has been moved to Done. Auto-stamped on
//                      column transition; signals linked to this wip are
//                      NOT closed yet. The user must explicitly review.
//   • "looks_good"   — reviewer accepted the work. Optional cascade: the
//                      reviewer can close linked signals at this point.
//   • "follow_up"    — reviewer flagged that more work is needed. Linked
//                      signals stay open; the reviewer typically creates a
//                      follow-up signal/task/intent (see followUpIds).
//
// Reopening a done item clears the review state — it's no longer in Done,
// so the question of "is the done state reviewed?" is moot.
export type WipReviewState = "needs_review" | "looks_good" | "follow_up";

export interface Wip {
  id: string; type: WipType; title: string; description: string; digest?: string;
  column: WipColumn; location: string; assignee: string | null; linkedSignals: string[];
  // ── Review workflow ────────────────────────────────────────────────────
  // Stamped automatically when the wip first lands in "done". Remains
  // until the user reopens the item or moves it to a non-done column.
  reviewState?: WipReviewState;
  reviewedAt?: string;     // ISO when reviewState became looks_good / follow_up
  reviewedBy?: string;     // user id of the reviewer
  // ── Follow-up linkage ─────────────────────────────────────────────────
  // When a follow-up is created from this wip's review step, it lives in
  // its own collection (wipItems for task/intent follow-ups, signals for
  // signal follow-ups) but stores backreferences here so we can render
  // "1 follow-up created from this work" on the original card.
  followUpIds?: string[];        // wip ids of follow-up tasks/intents
  followUpSignalIds?: string[];  // signal ids of follow-up signals
  followUpOfWipId?: string;      // points back if THIS item is itself a follow-up
  // ── Annotation ────────────────────────────────────────────────────────
  // Free-text note captured when an action is closed / marked done /
  // reviewed. Lets the team record "duplicate of another work item",
  // "out of scope", or any short context the next reader needs. Surfaces
  // in the WIP detail modal alongside the review state.
  closeNote?: string;
  // ── Structured product-decision fields ────────────────────────────────
  // These augment the free-text `description`. They're optional so existing
  // seed data stays valid; the UI shows empty-state hints when blank.
  //   • `context`              — situational background ("Why now?", "Who
  //                              reported this?", "Where in the product?")
  //   • `acceptanceCriteria`   — flat checklist of testable conditions
  //   • `decisionRationale`    — why this specific solution was chosen
  //   • `rejectedAlternatives` — other approaches considered + why rejected
  //   • `plan`                 — short execution plan / notes
  context?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
  decisionRationale?: string;
  rejectedAlternatives?: string;
  plan?: string;
  // ── Implementation / deployment status (manual) ────────────────────────
  // Free-text fields until a real GitHub integration lands. The select
  // values are kept narrow so reports can categorise consistently.
  githubLink?: string;
  implementationStatus?: ImplementationStatus;
  deploymentStatus?: DeploymentStatus;
  // ── Manual ordering ────────────────────────────────────────────────────
  // Optional rank used for sorting cards inside a column. Lower is higher
  // priority (top of the list). Absent rank → falls back to creation /
  // event-log order, matching legacy behaviour.
  order?: number;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  done: boolean;
}

export type ImplementationStatus =
  | "no_pr" | "pr_open" | "pr_merged" | "needs_review";
export type DeploymentStatus =
  | "not_deployed" | "deployed_staging" | "deployed_production";

export const IMPLEMENTATION_STATUS_LABEL: Record<ImplementationStatus, string> = {
  no_pr:        "No PR linked",
  pr_open:      "PR open",
  pr_merged:    "PR merged",
  needs_review: "Needs code review",
};
export const DEPLOYMENT_STATUS_LABEL: Record<DeploymentStatus, string> = {
  not_deployed:        "Not deployed",
  deployed_staging:    "Deployed to staging",
  deployed_production: "Deployed to production",
};
export interface WipComment {
  id: string; wipId: string; author: string; body: string;
  visibility: Visibility; createdAt: string;
}
// Same shape as WipComment but anchored to a signal. Kept as a sibling type
// (rather than a generic "Comment with targetType") so existing `WipComment`
// callsites stay untouched and the storage stays trivially indexable.
export interface SignalComment {
  id: string; signalId: string; author: string; body: string;
  visibility: Visibility; createdAt: string;
}
export interface WipAttachment {
  id: string; wipId: string; name: string; size: string; mimeType: string;
  visibility: Visibility; uploadedBy: string; createdAt: string;
}

// ── WIP activity events ──────────────────────────────────────────────────
// Append-only log of meaningful card lifecycle events. Used for:
//   1) the read-only Activity tab in the WIP detail modal, and
//   2) the "changed since your last visit" highlight on cards in client mode.
//
// We deliberately don't try to capture every micro-edit (description tweaks,
// label changes) — only events a client cares about: creation, column moves,
// reopens, and signal-link additions. Internal noise stays out.
export type WipEventKind =
  | "created"
  | "moved"
  | "reopened"           // moved backward out of "done"
  | "signal_linked"
  | "assignee_changed"   // assignee added, removed, or replaced
  | "attachment_added"   // file uploaded to the wip
  | "needs_review"       // auto-stamped when a wip lands in Done
  | "reviewed_looks_good"// reviewer marked the done item as Looks good
  | "reviewed_follow_up" // reviewer flagged that follow-up is needed
  | "follow_up_created"  // a follow-up signal/task/intent was spawned
  | "linked_signals_closed"; // linked signals were closed via the review step

export interface WipEvent {
  id: string;
  wipId: string;
  kind: WipEventKind;
  fromColumn?: WipColumn;
  toColumn?: WipColumn;
  fromLocation?: string;
  toLocation?: string;
  signalId?: string;     // populated for signal_linked / linked_signals_closed (representative id)
  // Assignee transitions: previous + next user id. Either side may be null
  // to represent assigned-from-unassigned or unassigned-from-assigned.
  fromAssignee?: string | null;
  toAssignee?: string | null;
  // Attachment events use the attachment name so the activity row can read
  // "Tamar added recording.mp4" without us having to look the file up.
  attachmentName?: string;
  // Follow-up events: id and kind of the spawned item.
  followUpId?: string;
  followUpKind?: "task" | "intent" | "signal";
  // Linked-signal-closure event: how many signals got closed in the cascade.
  closedSignalCount?: number;
  // When set on a `signal_linked` event, indicates the action was an
  // *unlink* (a source signal was removed from this wip) rather than a
  // link. Keeps the WipEventKind enum stable while letting the UI
  // distinguish the two directions in the Activity tab.
  unlinked?: boolean;
  actor: string;
  at: string;            // ISO
}
// ── Staleness helpers ────────────────────────────────────────────────────
// "Stale" is informational only — work isn't blocked. We compute it from
// the last meaningful touch on a signal: `statusUpdatedAt` when present,
// otherwise `createdAt`. The threshold is configurable so the UI can let
// users tune it later; we pin a default at one work week (7 days).

export const STALE_THRESHOLD_DAYS = 7;
export const STALE_WARN_DAYS_OVER_THRESHOLD = 14; // beyond this, escalate visual

/** Last meaningful "touch" on a signal — status update if any, else create. */
export function signalLastTouchedAt(s: Signal): string {
  return s.statusUpdatedAt ?? s.createdAt;
}

/** Days since the signal was last touched (fractional; floor for display). */
export function signalDaysStale(s: Signal, now: number = Date.now()): number {
  const t = new Date(signalLastTouchedAt(s)).getTime();
  return Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
}

/**
 * "Stale" only meaningfully applies to active items the team cares about
 * NOT idling: New, Accepted, Ready. Closed / rejected signals are settled,
 * so we never call them stale even if their last touch was years ago.
 */
export function isSignalStale(
  s: Signal,
  threshold: number = STALE_THRESHOLD_DAYS,
  now: number = Date.now(),
): boolean {
  if (s.status === "closed" || s.status === "rejected") return false;
  return signalDaysStale(s, now) > threshold;
}

// ── Time-in-progress helpers ─────────────────────────────────────────────
// We surface elapsed time on In Progress cards as plain context (not a
// deadline). The duration is derived from the event log so re-enters /
// reopens reset it naturally without storing a timestamp on the wip.

/**
 * Latest moment this wip entered the `in_progress` column. Walks the event
 * log newest-first and returns the timestamp of the last `created`/`moved`
 * event whose `toColumn` is `in_progress`. Returns null when the wip is
 * not currently in progress.
 */
export function inProgressEnteredAt(wip: Wip, events: WipEvent[]): string | null {
  if (wip.column !== "in_progress") return null;
  const ours = events
    .filter(e => e.wipId === wip.id)
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  for (const ev of ours) {
    if (ev.toColumn === "in_progress" && ev.fromColumn !== "in_progress") return ev.at;
    if (ev.fromColumn === "in_progress" && ev.toColumn !== "in_progress") return null;
  }
  return null;
}

/**
 * Hours the wip has been continuously in `in_progress`. Returns null when
 * the wip is not in progress or has no recorded entry event.
 */
export function hoursInProgress(wip: Wip, events: WipEvent[], now: number = Date.now()): number | null {
  const at = inProgressEnteredAt(wip, events);
  if (!at) return null;
  return Math.max(0, (now - new Date(at).getTime()) / (60 * 60 * 1000));
}

/**
 * Generic "when did this wip enter its CURRENT column?" — walks the event
 * log backwards looking for the latest move-into-current event. Falls
 * back to the wip's `created` event timestamp when no move events exist
 * (item has lived in this column since creation). Returns null only if
 * there's no usable signal at all.
 *
 * Drives the "X days in Backlog / To Do / Done" age badges + filters.
 */
export function columnEnteredAt(wip: Wip, events: WipEvent[]): string | null {
  const ours = events
    .filter(e => e.wipId === wip.id)
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  for (const ev of ours) {
    // Direct match: a moved event whose target is the current column.
    if (ev.toColumn === wip.column && ev.fromColumn !== wip.column) return ev.at;
    // Fall through: the item is still in the column it was created in.
    if (ev.kind === "created" && ev.toColumn === wip.column) return ev.at;
  }
  // Last resort: the oldest "created" event for this wip even if its
  // toColumn doesn't match (defensive against malformed seeds).
  const created = ours.find(e => e.kind === "created");
  return created?.at ?? null;
}

/** Days the wip has been in its current column. Null when no signal exists. */
export function daysInCurrentColumn(wip: Wip, events: WipEvent[], now: number = Date.now()): number | null {
  const at = columnEnteredAt(wip, events);
  if (!at) return null;
  return Math.max(0, (now - new Date(at).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Compact "6h" / "1d 4h" / "3d" string for the time-in-progress badge.
 * Returns "<1m" if the move just happened — otherwise the number always
 * has a unit.
 */
export function formatHoursDuration(hours: number): string {
  if (hours < 1 / 60) return "<1m";
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60));
    return `${m}m`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    return `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const rem  = Math.floor(hours - days * 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

export interface Sprint { id: string; name: string; range: string; active: boolean; }
export interface Source { id: string; name: string; description: string; }
export interface Note { id: string; source: string; title: string; body: string; author: string; createdAt: string; promoted: boolean; }

export const USERS: User[] = [
  { id: "u1", name: "Avery Chen",   initials: "AC", color: "#dbeafe" },
  { id: "u2", name: "Jordan Park",  initials: "JP", color: "#fce7f3" },
  { id: "u3", name: "Sam Okafor",   initials: "SO", color: "#d1fae5" },
  { id: "u4", name: "Rio Delgado",  initials: "RD", color: "#fef3c7" },
  { id: "u5", name: "Morgan Li",    initials: "ML", color: "#ede9fe" },
];

export function userById(id: string): User {
  return USERS.find(u => u.id === id) || { id, name: "Unknown", initials: "?", color: "#e5e7eb" };
}

export const SOURCES: Source[] = [
  { id: "src-slack",    name: "Slack #feedback", description: "Tagged messages from customer-facing teams." },
  { id: "src-intercom", name: "Intercom",         description: "Replies flagged as product feedback." },
  { id: "src-calls",    name: "Customer calls",   description: "Post-call notes from sales & CS." },
  { id: "src-internal", name: "Internal notes",   description: "Manually captured thoughts." },
];

// Fixed reference time for all seed timestamps. We deliberately avoid
// `new Date()` at module load — Next.js evaluates this module on both the
// server (at request time) and the client (at hydration), and the two clocks
// don't match. Any sort that depended on those timestamps (or any relative-
// time string rendered into HTML) would then disagree between SSR and CSR
// and trigger a "Hydration failed" warning. A constant base time gives both
// renders the same data and keeps hydration clean. Bump this when refreshing
// demo data so "recent" events still feel recent.
const SEED_BASE_TIME = new Date("2026-04-29T12:00:00.000Z").getTime();

function daysAgo(n: number) {
  return new Date(SEED_BASE_TIME - n * 24 * 60 * 60 * 1000).toISOString();
}

export const SIGNALS: Signal[] = [
  { id:"s01", title:"CSV export stalls past 10k rows",                     description:"Users report the export spinner never resolves when datasets exceed 10 000 rows. No error shown.",                                 labels:["export","perf","bug","bugA"],     author:"u2", source:"feedback", status:"accepted", screenshots:1, createdAt:daysAgo(1),  statusUpdatedAt:daysAgo(1),  linkedWip:["w-01"], priority:"high" },
  { id:"s02", title:"Hard to tell which filter is active on Signals",       description:"Active filters blend into the chrome. A user asked if the app was broken because they forgot a filter was set.",                    labels:["filters","ux","bug","bugA"],      author:"u1", source:"note",     status:"accepted", screenshots:0, createdAt:daysAgo(2),  statusUpdatedAt:daysAgo(2),  linkedWip:["w-02"], priority:"medium" },
  { id:"s03", title:"Wants per-project Slack digest",                       description:"Enterprise customer wants a weekly summary of new signals per project, delivered to a dedicated Slack channel.",                    labels:["notifications","bug","bugA"],     author:"u3", source:"feedback", status:"new",      screenshots:0, createdAt:daysAgo(3),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s04", title:"Invite email lands in spam for Outlook tenants",       description:"Several Outlook-hosted tenants report that invite emails consistently land in junk. SPF/DKIM appears configured correctly.",       labels:["auth","onboarding","bug","bugA"], author:"u4", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(4),  statusUpdatedAt:daysAgo(3),  linkedWip:["w-04"], priority:"urgent" },
  { id:"s05", title:"Keyboard nav skips the Sources rail",                  description:"Tab key jumps from the top nav straight to the main content, bypassing the left rail entirely.",                                   labels:["keyboard","ux","bug","bugA"],     author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(5),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s06", title:"Multi-select loses state on page scroll",              description:"Scrolling the Signals list while items are selected clears the selection unexpectedly.",                                            labels:["filters","bug"],                  author:"u2", source:"feedback", status:"accepted", screenshots:2, createdAt:daysAgo(6),  statusUpdatedAt:daysAgo(5),  linkedWip:["w-02"], priority:"medium" },
  { id:"s07", title:"Sprint range picker resets to today",                  description:"Opening the sprint date picker a second time shows today's date, not the saved range.",                                            labels:["desktop"],                author:"u3", source:"feedback", status:"new",      screenshots:1, createdAt:daysAgo(7),  statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s08", title:"Accepted signal vanishes without toast",               description:"After accepting a signal in the modal, it disappears from the New view with no confirmation or undo.",                             labels:["empty-state","ux","bug"], author:"u5", source:"note",     status:"accepted", screenshots:0, createdAt:daysAgo(8),  statusUpdatedAt:daysAgo(6),  linkedWip:["w-08"], priority:"medium" },
  { id:"s09", title:"Labels should autocomplete from history",              description:"Typing a label in the quick-add field doesn't suggest previously used labels.",                                                     labels:["search","bug"],           author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(9),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s10", title:"Screenshot paste is silent when clipboard is empty",   description:"Pressing Cmd+V in a signal with no image in clipboard shows no feedback — not even an error.",                                     labels:["copy"],                   author:"u4", source:"feedback", status:"rejected", screenshots:0, createdAt:daysAgo(10), statusUpdatedAt:daysAgo(9),  linkedWip:[], priority:"high" },
  { id:"s11", title:"Filter pill text truncates at narrow widths",          description:"On 1280px viewports the filter bar wraps awkwardly and some pills become unreadable.",                                             labels:["filters","desktop","bug"],author:"u2", source:"feedback", status:"new",      screenshots:2, createdAt:daysAgo(11), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s12", title:"Empty backlog shows no CTA",                           description:"When the backlog is completely empty there is no prompt to drag items or create one.",                                             labels:["empty-state","bug"],      author:"u3", source:"note",     status:"accepted", screenshots:0, createdAt:daysAgo(12), statusUpdatedAt:daysAgo(11), linkedWip:[], priority:"low" },
  { id:"s13", title:"Mobile viewport collapses top nav to unusable",        description:"At 375px the nav truncates project name and tab labels overlap.",                                                                   labels:["mobile"],                 author:"u5", source:"feedback", status:"rejected", screenshots:1, createdAt:daysAgo(13), statusUpdatedAt:daysAgo(12), linkedWip:[], priority:"high" },
  { id:"s14", title:"Source filter doesn't persist across route changes",   description:"Navigating from Signals to Sources and back resets the Source filter to 'All'.",                                                   labels:["filters"],                author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(14), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s15", title:"Drag handles are too small to target on trackpad",     description:"The 8px drag area on WIP cards is hard to grab precisely on a trackpad.",                                                          labels:["desktop","ux"],           author:"u4", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(15), statusUpdatedAt:daysAgo(14), linkedWip:[], priority:"medium" },
  { id:"s16", title:"Sprint 'active' badge is same color as labels",        description:"The green 'Active' pill visually conflicts with the accepted-status label chip.",                                                  labels:["ux"],                     author:"u2", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(16), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s17", title:"Notification bell has no popover",                     description:"Clicking the bell in the top nav does nothing; users expect at least an empty state popover.",                                    labels:["notifications"],          author:"u3", source:"feedback", status:"rejected", screenshots:0, createdAt:daysAgo(17), statusUpdatedAt:daysAgo(16), linkedWip:[], priority:"medium" },
  { id:"s18", title:"Column header count doesn't update on filter",         description:"Filtering by author leaves column headers showing the unfiltered total until a hard reload.",                                      labels:["filters"],                author:"u5", source:"feedback", status:"accepted", screenshots:1, createdAt:daysAgo(18), statusUpdatedAt:daysAgo(17), linkedWip:[], priority:"high" },
  { id:"s19", title:"Bulk-label picker closes on outside click mid-typing", description:"The label input inside the selection bar picker dismisses when the user clicks the input itself.",                                 labels:["keyboard"],               author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(19), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s20", title:"Date range 'TBD' sprint doesn't sort predictably",     description:"Sprints with range TBD appear randomly in the sprint list rather than at the end.",                                               labels:["desktop"],                author:"u4", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(20), statusUpdatedAt:daysAgo(18), linkedWip:[], priority:"high" },
  { id:"s21", title:"Search input loses focus on Signals column reorder",   description:"After dragging a signal card the search input loses focus even though we weren't targeting it.",                                  labels:["search"],                 author:"u2", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(1),  statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s22", title:"Intent cards need a clearer visual distinction",       description:"Task and Intent WIP cards look nearly identical; users confuse the two types.",                                                    labels:["ux"],                     author:"u3", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(2),  statusUpdatedAt:daysAgo(1),  linkedWip:[], priority:"medium" },
  { id:"s23", title:"Tooltip on truncated titles requested",                description:"Long signal titles are clipped with ellipsis but hovering shows no tooltip.",                                                      labels:["ux","desktop"],           author:"u5", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(3),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s24", title:"Label chip x button too small to click accurately",    description:"The remove button on label chips is 10x10 and hard to click without zooming.",                                                    labels:["mobile"],                 author:"u1", source:"feedback", status:"rejected", screenshots:0, createdAt:daysAgo(4),  statusUpdatedAt:daysAgo(3),  linkedWip:[], priority:"medium" },
  { id:"s25", title:"Assignee dropdown lacks search in WIP detail",         description:"With 10+ team members the assignee selector becomes slow to scan.",                                                                labels:["search"],                 author:"u4", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(5),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s26", title:"Source note composer doesn't scroll on long body",     description:"The textarea in Sources grows without bound; page gets very long.",                                                               labels:["ux"],                     author:"u2", source:"feedback", status:"accepted", screenshots:1, createdAt:daysAgo(6),  statusUpdatedAt:daysAgo(5),  linkedWip:[], priority:"medium" },
  { id:"s27", title:"WIP count in tab header includes done items",          description:"The WIP badge should exclude done-column items but it includes them.",                                                             labels:["ux"],                     author:"u3", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(7),  statusUpdatedAt:daysAgo(6),  linkedWip:[], priority:"high" },
  { id:"s28", title:"Rejected signal callout has misleading wording",       description:"'Mark as accepted to turn it into work' implies rejection is permanent.",                                                          labels:["copy"],                   author:"u5", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(8),  statusUpdatedAt:null,        linkedWip:[], priority:"low" },
  { id:"s29", title:"Column card drag preview is invisible on Safari",      description:"Safari doesn't show a ghost element on DnD; the card appears to vanish.",                                                         labels:["desktop"],                author:"u1", source:"feedback", status:"rejected", screenshots:2, createdAt:daysAgo(9),  statusUpdatedAt:daysAgo(8),  linkedWip:[], priority:"high" },
  { id:"s30", title:"Onboarding doesn't mention Signals to WIP flow",       description:"New users don't discover that accepting a signal is how WIP items are created.",                                                  labels:["onboarding"],             author:"u4", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(10), statusUpdatedAt:null,        linkedWip:[], priority:"low" },
  { id:"s31", title:"Group-by Author shows duplicate column for same name", description:"Two users with identical display names get merged into one column.",                                                               labels:["ux"],                     author:"u2", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(11), statusUpdatedAt:daysAgo(10), linkedWip:[], priority:"high" },
  { id:"s32", title:"Signal modal prev/next ignores active filters",        description:"Arrow navigation in the modal iterates all signals, not just the current filtered set.",                                          labels:["filters"],                author:"u3", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(12), statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s33", title:"Draft intent CTA missing in accepted callout",         description:"The green callout in the modal only offers 'Create task'; the intent option was removed accidentally.",                           labels:["ux"],                     author:"u5", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(13), statusUpdatedAt:daysAgo(12), linkedWip:[], priority:"high" },
  { id:"s34", title:"Sources rail resets scroll on note submission",        description:"After submitting a note the source list scrolls back to the top.",                                                                labels:["ux"],                     author:"u1", source:"note",     status:"rejected", screenshots:0, createdAt:daysAgo(14), statusUpdatedAt:daysAgo(13), linkedWip:[], priority:"medium" },
  { id:"s35", title:"WIP detail panel covers sprint column on small screen",description:"At 1366x768 the 480px panel overlaps the sprint's Done column completely.",                                                       labels:["desktop","ux"],           author:"u4", source:"feedback", status:"new",      screenshots:1, createdAt:daysAgo(15), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s36", title:"New sprint name should auto-increment",                description:"Clicking 'New sprint' always names it 'Sprint undefined'.",                                                                       labels:["ux"],                     author:"u2", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(16), statusUpdatedAt:daysAgo(15), linkedWip:[], priority:"high" },
  { id:"s37", title:"Exported CSV uses semicolons not commas for EU locale",description:"EU-locale users report semicolons break their Excel import.",                                                                      labels:["export"],                 author:"u3", source:"feedback", status:"new",      screenshots:0, createdAt:daysAgo(17), statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s38", title:"Label filter popover too tall on 13-inch MacBook",     description:"With 14 labels the popover extends below the viewport and can't be scrolled.",                                                    labels:["filters","desktop"],      author:"u5", source:"note",     status:"rejected", screenshots:0, createdAt:daysAgo(18), statusUpdatedAt:daysAgo(17), linkedWip:[], priority:"medium" },
  { id:"s39", title:"Tab count for Sources includes deleted notes",         description:"After deleting a note the Sources tab badge still shows the old count.",                                                           labels:["ux"],                     author:"u1", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(19), statusUpdatedAt:daysAgo(18), linkedWip:[], priority:"high" },
  { id:"s40", title:"Signal description area collapses in edit mode",       description:"Switching to edit mode shrinks the textarea to one line, losing context.",                                                         labels:["ux"],                     author:"u4", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(20), statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s41", title:"Autofocus on modal open steals keyboard from search",  description:"Opening a signal modal while search is focused loses the typed query.",                                                            labels:["keyboard"],               author:"u2", source:"feedback", status:"new",      screenshots:0, createdAt:daysAgo(1),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s42", title:"In-progress WIP column shows wrong dot color",        description:"The 'In progress' column header dot is green instead of amber.",                                                                   labels:["ux"],                     author:"u3", source:"note",     status:"accepted", screenshots:0, createdAt:daysAgo(2),  statusUpdatedAt:daysAgo(1),  linkedWip:[], priority:"high" },
  { id:"s43", title:"Can't reopen a closed sprint",                         description:"Closed sprints have no 'Reopen' action; items are stranded.",                                                                     labels:["ux"],                     author:"u5", source:"feedback", status:"rejected", screenshots:0, createdAt:daysAgo(3),  statusUpdatedAt:daysAgo(2),  linkedWip:[], priority:"medium" },
  { id:"s44", title:"Signal creation timestamp uses local timezone display",description:"Timestamps show UTC, confusing distributed teams.",                                                                               labels:["copy"],                   author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(4),  statusUpdatedAt:null,        linkedWip:[], priority:"low" },
  { id:"s45", title:"Bulk-select checkbox invisible on white cards",        description:"The checkbox outline is 1px border-strong which is too faint against white.",                                                     labels:["ux"],                     author:"u4", source:"feedback", status:"accepted", screenshots:1, createdAt:daysAgo(5),  statusUpdatedAt:daysAgo(4),  linkedWip:[], priority:"medium" },
  { id:"s46", title:"Grid view card height varies wildly across items",     description:"Cards have very different heights depending on description length, making the grid feel chaotic.",                                 labels:["ux","desktop"],           author:"u2", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(6),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s47", title:"Escape closes modal even when picker is open",         description:"Pressing Esc when the label picker is open closes the modal instead of the picker.",                                              labels:["keyboard"],               author:"u3", source:"feedback", status:"accepted", screenshots:0, createdAt:daysAgo(7),  statusUpdatedAt:daysAgo(6),  linkedWip:[], priority:"high" },
  { id:"s48", title:"Drag-to-backlog highlight doesn't clear on drop",      description:"After dropping an item in the backlog the highlight ring stays until mouse moves.",                                               labels:["ux"],                     author:"u5", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(8),  statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s49", title:"Filter state visibility and persistence",              description:"Active filters look identical to inactive ones, causing confusion. Separately, filter selections reset when navigating between routes — compounding the problem.", labels:["filters","ux"], author:"u1", source:"note", status:"accepted", screenshots:0, createdAt:daysAgo(10), statusUpdatedAt:daysAgo(9), linkedWip:["w-02"], priority:"medium" },
  { id:"s50", title:"Primary CTA should use solid filled style",            description:"Filled buttons with high contrast are more accessible — our users need clear affordance. Outline-only CTAs get missed on busy pages.",          labels:["ux","accessibility"], author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(3),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s51", title:"Primary CTA should be outline-only to match brand",    description:"Our users find solid filled CTAs too aggressive. Outline buttons match the brand tone and feel more aligned with our premium positioning.",         labels:["ux","brand"],         author:"u3", source:"feedback", status:"new",      screenshots:0, createdAt:daysAgo(4),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s52", title:"Replace top nav with a persistent left sidebar",       description:"As we add more routes, top nav becomes crowded. Left sidebar scales better and is the standard pattern for complex tools.",                         labels:["navigation","ux"],    author:"u2", source:"feedback", status:"new",      screenshots:1, createdAt:daysAgo(6),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s53", title:"Keep top bar — sidebar wastes space on laptops",       description:"Left sidebar eats 200px on 13-inch screens. Top bar is more space-efficient for our current route count and the way users navigate.",              labels:["navigation","desktop"],author:"u5", source:"note",     status:"accepted", screenshots:0, createdAt:daysAgo(7),  statusUpdatedAt:daysAgo(6),  linkedWip:[], priority:"medium" },
  { id:"s54", title:"Navigation should adapt: sidebar desktop, tabs mobile",description:"Neither top bar nor full sidebar works everywhere. A responsive nav — sidebar on desktop, bottom tabs on mobile — satisfies both concerns.",        labels:["navigation","mobile"], author:"u4", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(5),  statusUpdatedAt:null,        linkedWip:[], priority:"medium" },
  { id:"s55", title:"CSV exports must use commas — semicolons break tools", description:"Standard CSV spec uses commas. Semicolons break imports in Notion, Linear, and most data tools our users work with.",                             labels:["export"],             author:"u1", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(12), statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s56", title:"CSV export should default to semicolons for EU users", description:"EU-locale users consistently report that comma-delimited files break Excel. Semicolons are the de-facto standard in EU spreadsheet tools.",          labels:["export"],             author:"u4", source:"feedback", status:"new",      screenshots:0, createdAt:daysAgo(13), statusUpdatedAt:null,        linkedWip:[], priority:"high" },
  { id:"s57", title:"Export delimiter should be user-configurable",         description:"Both comma and semicolon CSV formats are valid depending on locale. A delimiter preference in account settings satisfies both camps without forcing one format.",labels:["export","settings"],   author:"u2", source:"note",     status:"new",      screenshots:0, createdAt:daysAgo(8),  statusUpdatedAt:null,        linkedWip:[], priority:"high" },
];

// Seed hide-under rules. Each rule is scoped to an exact sorted-labels filter.
// Two rules with different filterLabels are independent — bug and bug+filters
// are different scopes and a signal hidden in one is still visible in the other.
export const HIDE_UNDER_RULES: HideUnderRule[] = [
  { id: "hu-01", filterLabels: ["filters"],         mainSignalId: "s49", hiddenSignalIds: ["s02","s14"], createdAt: daysAgo(10) },
  { id: "hu-02", filterLabels: ["export"],          mainSignalId: "s56", hiddenSignalIds: ["s55","s57"], createdAt: daysAgo(13) },
  { id: "hu-03", filterLabels: ["navigation"],      mainSignalId: "s53", hiddenSignalIds: ["s52","s54"], createdAt: daysAgo(6)  },
];

export const WIP_ITEMS: Wip[] = [
  { id:"w-01", type:"task",   title:"Rebuild CSV exporter (server-side stream)",     description:"Move export logic to a streaming endpoint to avoid browser timeout.",             column:"in_progress", location:"sp-14", assignee:"u2", linkedSignals:["s01"] },
  { id:"w-02", type:"intent", title:"Rethink filter affordance on dense lists",       description:"Explore pill-based vs popover vs sidebar filter patterns.",                       column:"in_progress", location:"sp-14", assignee:"u1", linkedSignals:["s02","s06"] },
  { id:"w-03", type:"task",   title:"Weekly Slack digest per project",                description:"Scheduled job sends a digest of new signals to a configured Slack channel.",      column:"to_do",       location:"sp-14", assignee:"u3", linkedSignals:["s03"] },
  { id:"w-04", type:"task",   title:"Fix invite deliverability for Outlook",          description:"Review SPF/DKIM alignment and add DMARC reporting.",                              column:"done",        location:"sp-14", assignee:"u4", linkedSignals:["s04"], reviewState:"needs_review" },
  { id:"w-05", type:"task",   title:"Keyboard-accessible Sources rail",               description:"Ensure full tab/arrow-key navigation through the source list.",                  column:"backlog",     location:"backlog", assignee:null, linkedSignals:["s05"] },
  { id:"w-06", type:"intent", title:"Persistent selection across scroll + route",     description:"Investigate patterns for stable selection state during scroll events.",          column:"backlog",     location:"backlog", assignee:null, linkedSignals:["s06"] },
  { id:"w-07", type:"task",   title:"Sprint date picker doesn't snap to today",       description:"On second open the picker should restore the saved range, not reset.",           column:"to_do",       location:"sp-15", assignee:"u2", linkedSignals:["s07"] },
  { id:"w-08", type:"task",   title:"Acceptance toast + undo",                        description:"Show a non-blocking toast with undo on accept/reject actions.",                  column:"in_progress", location:"sp-15", assignee:"u1", linkedSignals:["s08"] },
  { id:"w-09", type:"intent", title:"Label taxonomy + autocomplete",                  description:"Design a label suggestion system drawing from historical usage.",                column:"backlog",     location:"backlog", assignee:null, linkedSignals:["s09"] },
  { id:"w-10", type:"task",   title:"Clipboard paste to screenshot upload",           description:"Handle paste events on signals and show clear feedback when clipboard is empty.", column:"to_do",       location:"sp-15", assignee:"u5", linkedSignals:["s10"] },
  // Intents seeded to back the Weekly Goals demo. Each maps to a real
  // product theme so the goal → intent linking reads naturally in the
  // prototype. Statuses spread across columns so the timeline shows a
  // realistic mix of Done / In Progress / To Do.
  { id:"w-11", type:"intent", title:"Add history / activity on Kanban items",
    description:"Surface column moves, reviews, and follow-ups on every work item so the board reflects what actually happened.",
    column:"in_progress", location:"sp-14", assignee:"u1", linkedSignals:[] },
  { id:"w-12", type:"intent", title:"Show current intent / work status on modal",
    description:"Make the wip detail surface review state and column at a glance — the card-level dot isn't enough on the detail view.",
    column:"done",        location:"sp-14", assignee:"u3", linkedSignals:[], reviewState:"looks_good" },
  { id:"w-13", type:"intent", title:"Search Kanban by description / context",
    description:"Search should match body text and structured context fields, not just title.",
    column:"to_do",       location:"sp-15", assignee:null, linkedSignals:[] },
  { id:"w-14", type:"intent", title:"Show source / creator in signal modal",
    description:"Always show who reported a signal and from which channel without an extra click.",
    column:"done",        location:"sp-14", assignee:"u4", linkedSignals:[], reviewState:"looks_good" },
  { id:"w-15", type:"intent", title:"Improve TPA annotation toggle",
    description:"Lightweight on/off toggle for TPA annotation; no extra titles; preserve content when hidden.",
    column:"in_progress", location:"sp-15", assignee:"u1", linkedSignals:[] },
  { id:"w-16", type:"intent", title:"Split signals",
    description:"Let a TPA split one raw signal into multiple clearer child signals while preserving the original.",
    column:"in_progress", location:"sp-15", assignee:"u2", linkedSignals:[] },
  { id:"w-17", type:"intent", title:"Manual drag and reorder Kanban cards",
    description:"Allow ordering within Backlog / To Do so the top item is the next to pick up.",
    column:"to_do",       location:"sp-15", assignee:null, linkedSignals:[] },
  { id:"w-18", type:"intent", title:"Preserve filters and collapsed sections",
    description:"Filters / sort / collapsed sprint state shouldn't reset between visits or after every action.",
    column:"to_do",       location:"sp-15", assignee:null, linkedSignals:[] },
];

export const WIP_COMMENTS: WipComment[] = [
  { id:"c01", wipId:"w-01", author:"u2", body:"Server-side streaming should resolve the timeout. I'll use ReadableStream.",        visibility:"internal", createdAt:daysAgo(1)  },
  { id:"c02", wipId:"w-01", author:"u1", body:"This is now live on staging — please test with your large exports.",                 visibility:"client",   createdAt:daysAgo(0)  },
  { id:"c03", wipId:"w-02", author:"u1", body:"Leaning toward active filter pills with a filled background + an X to clear.",      visibility:"internal", createdAt:daysAgo(3)  },
  { id:"c04", wipId:"w-02", author:"u3", body:"We showed three variants to users in a quick test — pill approach won clearly.",     visibility:"internal", createdAt:daysAgo(2)  },
  { id:"c05", wipId:"w-08", author:"u1", body:"Toast is ready. Undo reverts within 5 seconds.",                                   visibility:"internal", createdAt:daysAgo(2)  },
  { id:"c06", wipId:"w-08", author:"u5", body:"Looks great — much better UX. Shipped to production.",                              visibility:"client",   createdAt:daysAgo(1)  },
];

// A handful of seed signal comments so the new tab isn't empty on first load.
export const SIGNAL_COMMENTS: SignalComment[] = [
  { id:"sc01", signalId:"s01", author:"u2", body:"Repro confirmed at 12k rows — timeout fires at the 30s mark.", visibility:"internal", createdAt:daysAgo(1) },
  { id:"sc02", signalId:"s01", author:"u1", body:"Can you share the dataset that triggers this? Happy to take a look.", visibility:"client",   createdAt:daysAgo(0) },
  { id:"sc03", signalId:"s02", author:"u3", body:"+1 — we got the same comment from another user this morning.",    visibility:"internal", createdAt:daysAgo(2) },
];

// Real per-file attachments on signals. The existing `screenshots` count
// drives the placeholder tile grid in the modal; this list is the new
// proper attachments section + the paperclip indicator on cards.
export const SIGNAL_ATTACHMENTS: SignalAttachment[] = [
  { id:"sa01", signalId:"s01", name:"export-stuck.png",      mimeType:"image/png",       size:"242 KB", uploadedBy:"u2", createdAt:daysAgo(1) },
  { id:"sa02", signalId:"s01", name:"large-dataset.csv",     mimeType:"text/csv",        size:"3.1 MB", uploadedBy:"u2", createdAt:daysAgo(1) },
  { id:"sa03", signalId:"s02", name:"filters-confusion.png", mimeType:"image/png",       size:"168 KB", uploadedBy:"u1", createdAt:daysAgo(2) },
  { id:"sa04", signalId:"s04", name:"intercom-thread.pdf",   mimeType:"application/pdf", size:"412 KB", uploadedBy:"u4", createdAt:daysAgo(3) },
  { id:"sa05", signalId:"s05", name:"keyboard-trap.mp4",     mimeType:"video/mp4",       size:"6.4 MB", uploadedBy:"u1", createdAt:daysAgo(2) },
];

export const WIP_ATTACHMENTS: WipAttachment[] = [
  { id:"a01", wipId:"w-01", name:"streaming-poc.mp4",       size:"4.2 MB",  mimeType:"video/mp4",        visibility:"internal", uploadedBy:"u2", createdAt:daysAgo(2) },
  { id:"a02", wipId:"w-01", name:"perf-benchmark.csv",      size:"18 KB",   mimeType:"text/csv",         visibility:"client",   uploadedBy:"u2", createdAt:daysAgo(1) },
  { id:"a03", wipId:"w-02", name:"filter-variants.fig",     size:"890 KB",  mimeType:"application/fig",  visibility:"internal", uploadedBy:"u1", createdAt:daysAgo(4) },
  { id:"a04", wipId:"w-02", name:"user-test-results.pdf",   size:"230 KB",  mimeType:"application/pdf",  visibility:"client",   uploadedBy:"u3", createdAt:daysAgo(2) },
  { id:"a05", wipId:"w-08", name:"toast-design.png",        size:"140 KB",  mimeType:"image/png",        visibility:"internal", uploadedBy:"u1", createdAt:daysAgo(3) },
];

export const SPRINTS: Sprint[] = [
  { id:"sp-14", name:"Sprint 14", range:"Apr 14 — Apr 25", active:true },
  { id:"sp-15", name:"Sprint 15", range:"Apr 28 — May 9",  active:false },
];

// ── Roadmap / traceability primitives ────────────────────────────────────
// V1 connects weekly goals, product features / slices, and intents so the
// team can see what work supports which product outcome. Intents are
// existing Wip records of `type: "intent"` — we only store their ids in
// the link arrays, so a missing intent gracefully degrades to a "removed"
// hint in the UI rather than corrupting state.
//
// Status enums are deliberately narrow. We do NOT auto-derive a goal /
// feature / slice status from its children — per spec, goal satisfaction
// stays human-controlled.

export type WeeklyGoalStatus = "planned" | "in_progress" | "done";
export type FeatureStatus    = "not_started" | "planned" | "in_progress" | "done";

export interface WeeklyGoal {
  id: string;
  title: string;
  /** Human label for the week — e.g. "May 27 — Jun 2" or "Week of May 27". */
  weekLabel: string;
  /** ISO date for the Monday of the week — used to sort the timeline. */
  weekStart: string;
  status: WeeklyGoalStatus;
  // ── Linked Product Targets ──────────────────────────────────────────
  // Near-term goals should reach concrete targets (slices, capabilities);
  // broader / future goals can stay at the feature level. All three lists
  // are independent — features ≠ slices ≠ capabilities — and the UI
  // surfaces them in one "Linked Product Targets" container.
  linkedFeatureIds: string[];
  linkedSliceIds: string[];
  linkedCapabilityIds: string[];
  // Intents are LINKED, not owned by the goal. One intent can contribute
  // to multiple goals.
  linkedIntentIds: string[];    // wip ids of type "intent"
  notes?: string;
  createdAt: string;
}

export interface ProductArea {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
}

// Optional middle layer between Area and Feature so the Product View can
// group related features (e.g. "Registration" + "Sign-in" both under
// the Auth area). Optional on Feature so the V1 typed-Feature flow on
// goal cards keeps working without forcing a group choice.
export interface FeatureGroup {
  id: string;
  title: string;
  areaId: string;               // parent ProductArea.id
  createdAt: string;
}

export interface Feature {
  id: string;
  title: string;
  description?: string;
  status: FeatureStatus;
  areaId: string;               // parent ProductArea.id (empty for ungrouped)
  featureGroupId?: string;      // optional parent FeatureGroup.id
  linkedIntentIds: string[];    // wip ids of type "intent"
  createdAt: string;
}

// A "thing a Feature can include" — owned by the Feature, not the Slice.
// Slices select which capabilities they include and with what weight
// via FeatureSlice.capabilityStatus below.
export interface ProductCapability {
  id: string;
  title: string;
  featureId: string;            // parent Feature.id
  createdAt: string;
}

// Inclusion weight a slice assigns to a capability. Light-touch MoSCoW
// scoped only to slice contents — does NOT bleed into roadmap-level
// MoSCoW (which we explicitly avoid in V1).
export type SliceCapabilityStatus = "must" | "should" | "could" | "wont";

export interface FeatureSlice {
  id: string;
  title: string;
  description?: string;
  status: FeatureStatus;
  featureId: string;            // parent Feature.id
  linkedIntentIds: string[];
  // Capability inclusion: capabilityId → status. A capability that
  // isn't in this map is "not selected" — the slice neither includes
  // nor excludes it. Removing a row from the map = unselected again.
  capabilityStatus?: Record<string, SliceCapabilityStatus>;
  createdAt: string;
}

// ISO Monday helper for the seed (offset from SEED_BASE_TIME).
function mondayISO(offsetDays: number): string {
  const d = new Date(SEED_BASE_TIME + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString();
}
function weekLabelFromMonday(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} — ${fmt(end)}`;
}

const W_THIS = mondayISO(0);
const W_NEXT = mondayISO(7);
const W_LAST = mondayISO(-7);

export const PRODUCT_AREAS: ProductArea[] = [
  // The Auth area carries the worked example in the spec — area →
  // group → feature → capabilities → slice. The other three areas
  // exist as empty containers so the Product View has visible shells
  // for additional product surfaces the TPA may later organise into.
  { id: "area-auth", title: "Auth",
    description: "Account creation, sign-in, and identity flows.",
    createdAt: daysAgo(40) },
  { id: "area-signal-processing", title: "Signal Processing",
    description: "How the TPA reviews, clarifies, and acts on incoming signals.",
    createdAt: daysAgo(30) },
  { id: "area-kanban", title: "Kanban Management",
    description: "Trust and clarity around what's in progress and what's done.",
    createdAt: daysAgo(28) },
  { id: "area-client-comms", title: "Client communication",
    description: "How status flows back to clients without exposing internals.",
    createdAt: daysAgo(20) },
];

export const FEATURE_GROUPS: FeatureGroup[] = [
  // One Auth example so the spec's hierarchy reads on first load.
  { id: "fg-registration", title: "Registration", areaId: "area-auth", createdAt: daysAgo(30) },
];

// Roadmap features. The Auth example feature gets a full hierarchy
// (group + product capabilities + a slice with capability inclusion).
// The three "flat" features carry over from the weekly-goal demo — they
// stay reachable in the Product View under an "Ungrouped" bucket.
export const FEATURES: Feature[] = [
  { id: "feat-register-email", title: "Register with email",
    description: "Email-based account creation flow for new users.",
    status: "in_progress",
    areaId: "area-auth", featureGroupId: "fg-registration",
    linkedIntentIds: [],
    createdAt: daysAgo(25) },
  { id: "feat-kanban-status",  title: "Kanban status clarity",
    status: "in_progress", areaId: "", linkedIntentIds: [],
    createdAt: daysAgo(14) },
  { id: "feat-signal-review",  title: "Signal review context",
    status: "in_progress", areaId: "", linkedIntentIds: [],
    createdAt: daysAgo(7) },
  { id: "feat-kanban-manage",  title: "Kanban management",
    status: "planned",     areaId: "", linkedIntentIds: [],
    createdAt: daysAgo(3) },
];

export const PRODUCT_CAPABILITIES: ProductCapability[] = [
  { id: "cap-email-validation",  title: "Email validation",        featureId: "feat-register-email", createdAt: daysAgo(24) },
  { id: "cap-email-verification",title: "Email verification",      featureId: "feat-register-email", createdAt: daysAgo(24) },
  { id: "cap-password-reset",    title: "Password reset",          featureId: "feat-register-email", createdAt: daysAgo(24) },
  { id: "cap-duplicate-email",   title: "Duplicate email handling",featureId: "feat-register-email", createdAt: daysAgo(24) },
  { id: "cap-rate-limiting",     title: "Rate limiting",           featureId: "feat-register-email", createdAt: daysAgo(24) },
];

export const FEATURE_SLICES: FeatureSlice[] = [
  // Worked example slice: "Basic email registration for beta users".
  // capabilityStatus uses the inclusion weights from the spec —
  // validation + verification are must-haves; duplicate handling is a
  // should; rate limiting is deferred; password reset is excluded.
  { id: "slice-beta-registration",
    title: "Basic email registration for beta users",
    description: "Smallest viable email-registration flow for beta access.",
    status: "in_progress",
    featureId: "feat-register-email",
    linkedIntentIds: [],
    capabilityStatus: {
      "cap-email-validation":   "must",
      "cap-email-verification": "must",
      "cap-duplicate-email":    "should",
      "cap-rate-limiting":      "could",
      "cap-password-reset":     "wont",
    },
    createdAt: daysAgo(22) },
];

export const WEEKLY_GOALS: WeeklyGoal[] = [
  // V1 demo set — broad feature links + intent links. The fourth goal
  // exercises near-term linking: a slice + capabilities + intents.
  { id: "goal-w-last",
    title: "Make Kanban trustworthy",
    weekStart: W_LAST,
    weekLabel: weekLabelFromMonday(W_LAST),
    status: "in_progress",
    linkedFeatureIds: ["feat-kanban-status"],
    linkedSliceIds: [],
    linkedCapabilityIds: [],
    linkedIntentIds: ["w-11", "w-12", "w-13"],
    notes: "Focus the team on Kanban as the source of truth. History + status visibility + searchable context.",
    createdAt: daysAgo(14) },
  { id: "goal-w-this",
    title: "Improve signal review context",
    weekStart: W_THIS,
    weekLabel: weekLabelFromMonday(W_THIS),
    status: "in_progress",
    linkedFeatureIds: ["feat-signal-review"],
    linkedSliceIds: [],
    linkedCapabilityIds: [],
    linkedIntentIds: ["w-14", "w-15", "w-16"],
    notes: "Surface who reported what, simpler TPA annotation, and signal splitting for mixed feedback.",
    createdAt: daysAgo(7) },
  { id: "goal-w-next",
    title: "Make Kanban easier to manage",
    weekStart: W_NEXT,
    weekLabel: weekLabelFromMonday(W_NEXT),
    status: "planned",
    linkedFeatureIds: ["feat-kanban-manage"],
    linkedSliceIds: [],
    linkedCapabilityIds: [],
    linkedIntentIds: ["w-17", "w-18"],
    notes: "Reorderable cards + sticky filters / collapsed state so the board adapts to how the TPA actually works.",
    createdAt: daysAgo(3) },
  // Concrete near-term goal: links the Auth feature, the beta slice,
  // and two specific capabilities. Demonstrates "near-term goals reach
  // concrete targets, not just broad feature labels".
  { id: "goal-w-auth",
    title: "Ship basic beta registration",
    weekStart: W_NEXT,
    weekLabel: weekLabelFromMonday(W_NEXT),
    status: "planned",
    linkedFeatureIds: ["feat-register-email"],
    linkedSliceIds: ["slice-beta-registration"],
    linkedCapabilityIds: ["cap-email-validation", "cap-email-verification"],
    linkedIntentIds: [],
    notes: "Smallest viable email-registration flow for beta users. Validation + verification are must-haves this week.",
    createdAt: daysAgo(2) },
];

// Seed a realistic activity feed so demos show changes immediately. Each
// WIP gets a "created" event, plus a few cards have recent moves so client
// view has something to highlight.
function hoursAgo(n: number) {
  return new Date(SEED_BASE_TIME - n * 60 * 60 * 1000).toISOString();
}

export const WIP_EVENTS: WipEvent[] = [
  // Creations (older — before the typical "last visit")
  { id:"we01", wipId:"w-01", kind:"created", actor:"u2", at:daysAgo(8),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we02", wipId:"w-02", kind:"created", actor:"u1", at:daysAgo(7),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we03", wipId:"w-03", kind:"created", actor:"u3", at:daysAgo(6),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we04", wipId:"w-04", kind:"created", actor:"u4", at:daysAgo(8),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we05", wipId:"w-05", kind:"created", actor:"u1", at:daysAgo(5),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we06", wipId:"w-06", kind:"created", actor:"u1", at:daysAgo(5),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we07", wipId:"w-07", kind:"created", actor:"u2", at:daysAgo(4),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we08", wipId:"w-08", kind:"created", actor:"u1", at:daysAgo(4),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we09", wipId:"w-09", kind:"created", actor:"u1", at:daysAgo(3),  toColumn:"backlog", toLocation:"backlog" },
  { id:"we10", wipId:"w-10", kind:"created", actor:"u5", at:daysAgo(3),  toColumn:"backlog", toLocation:"backlog" },

  // Recent column moves — these will light up in client view
  { id:"we20", wipId:"w-04", kind:"moved",  actor:"u4", at:hoursAgo(3),  fromColumn:"in_progress", toColumn:"done", fromLocation:"sp-14", toLocation:"sp-14" },
  // Done items now land in "needs_review" instead of auto-closing linked
  // signals. Pair the move-to-done with a review-required marker so the
  // history reads naturally.
  { id:"we20b", wipId:"w-04", kind:"needs_review", actor:"u4", at:hoursAgo(3) },
  { id:"we21", wipId:"w-08", kind:"moved",  actor:"u1", at:daysAgo(1),   fromColumn:"to_do",       toColumn:"in_progress", fromLocation:"sp-15", toLocation:"sp-15" },
  { id:"we22", wipId:"w-01", kind:"moved",  actor:"u2", at:hoursAgo(20), fromColumn:"to_do",       toColumn:"in_progress", fromLocation:"sp-14", toLocation:"sp-14" },
  { id:"we23", wipId:"w-10", kind:"moved",  actor:"u5", at:hoursAgo(8),  fromColumn:"backlog",     toColumn:"to_do", fromLocation:"backlog", toLocation:"sp-15" },
  // Demo: w-02 (intent) entered In Progress ~6h ago so the elapsed-time
  // pill has something to render on first load.
  { id:"we24", wipId:"w-02", kind:"moved",  actor:"u1", at:hoursAgo(6),  fromColumn:"to_do",       toColumn:"in_progress", fromLocation:"sp-14", toLocation:"sp-14" },
];

// ── Label helpers ────────────────────────────────────────────────────────
// All label-related logic — kebab normalisation, near-duplicate detection,
// suggestion ranking, recency / frequency stats — lives here so the picker
// stays a dumb UI shell.

// Canonicalises user-typed input into a kebab-cased label. The label store
// uses kebab everywhere; whitespace and underscores collapse to a hyphen.
export function toKebabLabel(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Strips all separators / spelling variants for similarity comparison only.
// Two strings that only differ in punctuation, casing, or "color"/"colour"
// collapse to the same key.
export function normaliseForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/colour/g, "color")
    .replace(/behaviour/g, "behavior")
    .replace(/centre/g, "center");
}

// Levenshtein distance, used to find "did you mean" candidates. Bounded by
// max so we can early-exit on hopeless comparisons.
function levenshtein(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) dp[i] = i;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

// Returns existing labels that look like the typed query — different
// punctuation, spelling variants, or one-character typos. Used to nudge
// the user toward existing labels instead of creating duplicates.
export function similarLabels(query: string, all: string[], max = 3): string[] {
  const q = normaliseForCompare(query);
  if (q.length < 2) return [];
  const candidates = all
    .filter(l => normaliseForCompare(l) !== q || l.toLowerCase() === query.toLowerCase() ? true : true)
    .map(l => ({ l, n: normaliseForCompare(l) }))
    .filter(({ l }) => l.toLowerCase() !== query.toLowerCase())
    .map(({ l, n }) => {
      // Exact-after-normalise wins outright.
      if (n === q) return { l, score: 0 };
      const d = levenshtein(n, q, 3);
      return { l, score: d };
    })
    .filter(x => x.score <= Math.max(1, Math.floor(q.length / 4) + 1))
    .sort((a, b) => a.score - b.score);
  // Dedup by label, preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (seen.has(c.l)) continue;
    seen.add(c.l);
    out.push(c.l);
    if (out.length >= max) break;
  }
  return out;
}

// Top labels used most often across all signals. Ties broken by recency.
export function frequentlyUsedLabels(signals: Signal[], n = 5): string[] {
  const counts = new Map<string, number>();
  const lastUsed = new Map<string, number>();
  for (const s of signals) {
    const ts = new Date(s.createdAt).getTime();
    for (const l of s.labels) {
      counts.set(l, (counts.get(l) ?? 0) + 1);
      lastUsed.set(l, Math.max(lastUsed.get(l) ?? 0, ts));
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (lastUsed.get(b[0]) ?? 0) - (lastUsed.get(a[0]) ?? 0);
    })
    .slice(0, n)
    .map(([l]) => l);
}

// Distinct labels used on the most recently created signals.
export function recentlyUsedLabels(signals: Signal[], n = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = signals.slice().sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const s of sorted) {
    for (const l of s.labels) {
      if (seen.has(l)) continue;
      seen.add(l);
      out.push(l);
      if (out.length >= n) return out;
    }
  }
  return out;
}

// Rule-based label suggestions for one signal. Scores existing labels by
// (1) keyword presence in title/description, (2) co-occurrence with the
// signal's current labels on other signals, (3) global frequency. Excludes
// labels already on the signal. Returns labels in descending score order.
//
// This is an intentionally lightweight, deterministic stand-in for an LLM
// suggestion path — same call site, same shape, swap the body later.
export function suggestLabelsForSignal(
  signal: Signal,
  allSignals: Signal[],
  max = 5,
): string[] {
  const haystack = `${signal.title} ${signal.description}`.toLowerCase();
  const allLabels = Array.from(new Set(allSignals.flatMap(s => s.labels)));
  const sigLabels = new Set(signal.labels);

  const scores: { label: string; score: number }[] = [];

  for (const lbl of allLabels) {
    if (sigLabels.has(lbl)) continue;
    let score = 0;

    // Keyword presence (the strongest signal). Match the kebab form back
    // to spaces so "button-color" hits "button color" in the description.
    const lblWords = lbl.replace(/-/g, " ");
    if (haystack.includes(lbl.toLowerCase())) score += 3;
    else if (haystack.includes(lblWords))      score += 2;

    // Co-occurrence boost: how often this label appears on signals that
    // share at least one label with the current signal.
    if (signal.labels.length > 0) {
      const coocc = allSignals.reduce((acc, s) => {
        if (s.id === signal.id) return acc;
        if (!s.labels.includes(lbl)) return acc;
        if (!s.labels.some(x => sigLabels.has(x))) return acc;
        return acc + 1;
      }, 0);
      score += coocc * 0.6;
    }

    // Global frequency tie-breaker.
    const usage = allSignals.filter(s => s.labels.includes(lbl)).length;
    score += usage * 0.05;

    if (score > 0) scores.push({ label: lbl, score });
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.label);
}

// Seed duplicate groups for the demo. Two suggestions + one confirmed
// group so the badge/filter UI has something to render on first load.
export const DUPLICATE_GROUPS: DuplicateGroup[] = [
  // Suggested — all three are about filter state being unclear or unstable
  { id:"dup-001", confirmed:false, signalIds:["s02","s14","s18"],
    reason:"All three describe filter state being unclear or unstable across navigation.",
    reasons: [
      "Similar wording: \"filter state\" / \"filters\"",
      "Same topic area: filters",
      "Reported by 3 different authors",
    ],
    createdAt:daysAgo(1) },
  // Suggested — drag-and-drop usability
  { id:"dup-002", confirmed:false, signalIds:["s15","s29"],
    reason:"Both describe drag-and-drop usability problems.",
    reasons: [
      "Similar wording: \"drag\" mentioned in both",
      "Same surface: WIP cards / DnD",
    ],
    createdAt:daysAgo(2) },
  // Confirmed — narrow-viewport layout breakage
  { id:"dup-003", confirmed:true,  signalIds:["s11","s13"],
    reason:"Both describe layout breaking at narrow viewports.",
    reasons: [
      "Similar wording: \"narrow widths\" / mobile viewport",
      "Same surface: layout / viewport",
    ],
    createdAt:daysAgo(5), confirmedAt:daysAgo(4) },
];

// ── Hide-under helpers ───────────────────────────────────────────────────
// Filter labels are normalised to a canonical sorted form so two filters
// that differ only by order produce the same rule key.
export function hideUnderKey(filterLabels: string[]): string {
  return [...filterLabels].sort().join("|");
}

export function findHideUnderRule(
  rules: HideUnderRule[],
  filterLabels: string[],
): HideUnderRule | undefined {
  const key = hideUnderKey(filterLabels);
  return rules.find(r => hideUnderKey(r.filterLabels) === key);
}

// ── Undo-safety evaluation ───────────────────────────────────────────────
// Pure function: given a transaction and the current world state, returns
// whether undo is available, a warning (partial), or unavailable. The store
// uses `safeChanges` to decide which field reverts to apply on undo.

export type UndoSafety =
  | { state: "available";   safeChanges: FieldChange[] }
  | { state: "warning";     safeChanges: FieldChange[]; reason: string }
  | { state: "unavailable"; reason: string };

// Loose deep-equal good enough for our field types (string | string[] | null).
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

export function getUndoSafety(
  tx: Transaction,
  signals: Signal[],
  wipItems: Wip[],
): UndoSafety {
  if (tx.undone) {
    return { state: "unavailable", reason: "Already undone." };
  }

  // Hide-under-shaped actions don't use field changes; check rule/main signal.
  if (tx.action === "hide_under" || tx.action === "restore_from_hidden" || tx.action === "remove_hide_rule") {
    const snap = tx.hideUnderBefore;
    if (!snap) return { state: "unavailable", reason: "Missing hide-under context." };
    const mainExists = signals.some(s => s.id === snap.mainSignalId);
    if (!mainExists) {
      return { state: "unavailable", reason: "Main signal no longer exists." };
    }
    // Hidden signal IDs that no longer exist will be skipped on undo, but the
    // action remains available as long as the main signal is present.
    const missing = snap.hiddenSignalIds.filter(id => !signals.some(s => s.id === id));
    if (missing.length === snap.hiddenSignalIds.length && snap.hiddenSignalIds.length > 0) {
      return { state: "unavailable", reason: "All affected signals were removed." };
    }
    if (missing.length > 0) {
      return { state: "warning", safeChanges: [], reason: `${missing.length} affected signal${missing.length === 1 ? " is" : "s are"} no longer present.` };
    }
    return { state: "available", safeChanges: [] };
  }

  // Task / intent creation: undo only if the work item is still untouched.
  if (tx.action === "task_created" || tx.action === "intent_created") {
    const wipId = tx.taskId ?? tx.intentId;
    if (!wipId) return { state: "unavailable", reason: "Missing work item reference." };
    const wip = wipItems.find(w => w.id === wipId);
    if (!wip) return { state: "unavailable", reason: "Work item already removed." };
    if (wip.column !== "to_do") {
      return { state: "unavailable", reason: `Work item has progressed past To Do (${wip.column.replace("_", " ")}).` };
    }
    // Check signal field changes too — same logic as field-level below.
    const safe = tx.changes.filter(c => {
      const sig = signals.find(s => s.id === c.signalId);
      if (!sig) return false;
      return eq((sig as unknown as Record<string, unknown>)[c.field as string], c.after);
    });
    const overwritten = tx.changes.length - safe.length;
    if (overwritten === 0) return { state: "available", safeChanges: safe };
    return { state: "warning", safeChanges: safe, reason: `${overwritten} signal${overwritten === 1 ? "" : "s"} changed since; only the work item will be removed.` };
  }

  // Field-level actions: status_change, bulk_status_change, labels_add/remove,
  // priority_change, ai_processed. Determine which changes are still safe.
  if (tx.changes.length === 0) {
    return { state: "unavailable", reason: "Nothing to revert." };
  }

  const safe: FieldChange[] = [];
  const overwritten: FieldChange[] = [];
  const removed: FieldChange[] = [];

  for (const c of tx.changes) {
    const sig = signals.find(s => s.id === c.signalId);
    if (!sig) { removed.push(c); continue; }
    const cur = (sig as unknown as Record<string, unknown>)[c.field as string];
    if (eq(cur, c.after)) safe.push(c);
    else overwritten.push(c);
  }

  if (safe.length === 0) {
    return { state: "unavailable", reason: "All affected signals have changed since this action." };
  }
  if (overwritten.length === 0 && removed.length === 0) {
    return { state: "available", safeChanges: safe };
  }
  const bits: string[] = [];
  if (overwritten.length > 0) bits.push(`${overwritten.length} field${overwritten.length === 1 ? " was" : "s were"} changed since`);
  if (removed.length > 0)     bits.push(`${removed.length} signal${removed.length === 1 ? " was" : "s were"} removed`);
  return { state: "warning", safeChanges: safe, reason: `${bits.join("; ")}. Undo will revert only the unchanged fields.` };
}

// ── Digest derivation ─────────────────────────────────────────────────────
// Deterministic mock that produces a Digest from a Signal so the UI has
// something concrete to render in the Digest tab without real AI infra.
export function deriveDigest(signal: Signal, allSignals: Signal[]): SignalDigest {
  const firstSentence = signal.description.split(/[.?!]\s+/)[0] ?? signal.description;
  const summary = firstSentence.length > 0
    ? `${firstSentence}${firstSentence.endsWith(".") ? "" : "."} Affects ${signal.source === "feedback" ? "external customers" : "internal users"}; tracked since ${signal.createdAt.slice(0, 10)}.`
    : "No description provided.";

  // Suggested labels: a few common labels not already on the signal that match keywords in title+desc
  const text = (signal.title + " " + signal.description).toLowerCase();
  const labelHints: { label: string; keys: string[] }[] = [
    { label: "bug",        keys: ["error", "fails", "broken", "doesn't work", "crash", "freeze"] },
    { label: "ux",         keys: ["confusing", "unclear", "hard to", "user experience"] },
    { label: "perf",       keys: ["slow", "hangs", "stalls", "lag"] },
    { label: "mobile",     keys: ["mobile", "phone", "ios", "android"] },
    { label: "desktop",    keys: ["desktop", "browser", "safari", "chrome", "firefox"] },
    { label: "filters",    keys: ["filter", "sort"] },
    { label: "search",     keys: ["search", "autocomplete"] },
  ];
  const suggestedLabels = labelHints
    .filter(h => h.keys.some(k => text.includes(k)) && !signal.labels.includes(h.label))
    .map(h => h.label)
    .slice(0, 3);

  // Related candidates: pick up to 3 signals sharing labels
  const relatedCandidates = allSignals
    .filter(s => {
      if (s.id === signal.id) return false;
      return s.labels.some(l => signal.labels.includes(l));
    })
    .slice(0, 3)
    .map(s => s.id);

  // Assessment: terse note based on priority + status
  const priorityCopy: Record<SignalPriority, string> = {
    urgent: "High urgency — flagged for immediate review.",
    high:   "High priority signal; consider scheduling soon.",
    medium: "Standard priority; queue alongside ongoing work.",
    low:    "Low impact; safe to defer.",
  };
  const statusCopy: Record<SignalStatus, string> = {
    new:      "Awaiting triage.",
    accepted: "Validated; clarification or dependencies may remain.",
    ready:    "Actionable and queued for execution.",
    skipped:  "Deferred — will return when the skip period ends.",
    rejected: "Out of scope or duplicate of prior decision.",
    closed:   "Resolved or dropped.",
  };
  const assessment = `${priorityCopy[signal.priority]} ${statusCopy[signal.status]}`;

  // Activity: synthesize a short timeline from known events
  const activity: DigestActivity[] = [];
  activity.push({ at: signal.createdAt, kind: "source",     text: `Captured from ${signal.source === "feedback" ? "customer feedback" : "internal note"}.` });
  if (suggestedLabels.length > 0) {
    activity.push({ at: signal.createdAt, kind: "suggestion", text: `Suggested labels: ${suggestedLabels.map(l => "#" + l).join(", ")}.` });
  }
  if (relatedCandidates.length > 0) {
    activity.push({ at: signal.createdAt, kind: "relation", text: `Detected ${relatedCandidates.length} possible related signal${relatedCandidates.length > 1 ? "s" : ""}.` });
  }
  activity.push({ at: signal.createdAt, kind: "assessment", text: assessment });
  if (signal.statusUpdatedAt) {
    activity.push({ at: signal.statusUpdatedAt, kind: "summary", text: `Status changed to ${signal.status}.` });
  }

  return { summary, suggestedLabels, relatedCandidates, assessment, activity };
}

export const NOTES: Note[] = [
  { id:"n01", source:"src-slack",    title:"Customer asking about CSV export limit", body:"Came up in #enterprise-feedback. They hit 10k rows often.", author:"u2", createdAt:daysAgo(1),  promoted:true },
  { id:"n02", source:"src-intercom", title:"Filter confusion from onboarding user",  body:"New user asked support why their list looked empty.",         author:"u1", createdAt:daysAgo(2),  promoted:true },
  { id:"n03", source:"src-calls",    title:"Slack digest requested by Apex Corp",    body:"Enterprise tier, decision-maker call, high priority.",        author:"u3", createdAt:daysAgo(3),  promoted:true },
  { id:"n04", source:"src-internal", title:"Keyboard nav gap found in Sources rail", body:"Found during internal accessibility audit.",                 author:"u1", createdAt:daysAgo(5),  promoted:true },
  { id:"n05", source:"src-intercom", title:"Selection reset on scroll - confirmed",  body:"Replicated on Chrome 124 on Windows.",                       author:"u2", createdAt:daysAgo(6),  promoted:true },
  { id:"n06", source:"src-internal", title:"Labels UX needs autocomplete",           body:"Team agreed this blocks label adoption.",                     author:"u1", createdAt:daysAgo(9),  promoted:true },
  { id:"n07", source:"src-calls",    title:"Sources scroll position reset",          body:"Mentioned by two users in separate calls this week.",         author:"u4", createdAt:daysAgo(14), promoted:true },
  { id:"n08", source:"src-internal", title:"Empty backlog UX discussion",            body:"Design review flagged missing call to action.",               author:"u3", createdAt:daysAgo(12), promoted:true },
];
