"use client";
import React from "react";

/**
 * HiddenCountBadge — shown on a card that has hidden signals stacked under it.
 * Replaces the old "Related" badge from the legacy related-groups model.
 */
export function HiddenCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: "#f0fdfa", color: "#0f766e",
      border: "1px solid #99f6e4", whiteSpace: "nowrap",
    }}>
      ◇ +{count} hidden
    </span>
  );
}

/**
 * HiddenMatchBadge — shown when a search hit lives inside a hide-under rule
 * (the parent main signal is the visible card; this badge marks results that
 * matched but are normally hidden).
 */
export function HiddenMatchBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: "#fffbeb", color: "#b45309",
      border: "1px solid #fcd34d", whiteSpace: "nowrap",
    }}>
      ◇ Match in hidden
    </span>
  );
}

export function TaskCreatedBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: "rgba(124,58,237,0.08)", color: "var(--task)",
      border: "1px solid rgba(124,58,237,0.2)", whiteSpace: "nowrap",
    }}>
      ✓ Task created
    </span>
  );
}

export function IntentCreatedBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: "rgba(14,165,233,0.08)", color: "var(--intent)",
      border: "1px solid rgba(14,165,233,0.2)", whiteSpace: "nowrap",
    }}>
      ✓ Intent created
    </span>
  );
}

/**
 * DuplicateBadge — surfaces whether a signal is part of a duplicate group.
 * Two visual states share one component to keep card-side wiring simple:
 *   • "possible"  → unconfirmed suggestion. Subtle dashed amber pill so the
 *                   user knows there's something to review without it
 *                   reading as a hard fact.
 *   • "confirmed" → user-accepted group. Solid teal pill with the count
 *                   ("Duplicate ×3") so it reads as a strong relationship.
 */
export function DuplicateBadge({
  state, count, isNew = false,
}: {
  state: "possible" | "confirmed";
  count: number;
  /** Marks an unseen / changed suggestion. Only meaningful for "possible". */
  isNew?: boolean;
}) {
  if (count <= 0) return null;
  if (state === "confirmed") {
    return (
      <span
        title={`Duplicate of ${count - 1} other signal${count - 1 === 1 ? "" : "s"}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "1px 7px", borderRadius: 100,
          fontSize: 10.5, fontWeight: 500,
          background: "rgba(20,184,166,0.10)", color: "#0f766e",
          border: "1px solid rgba(20,184,166,0.40)", whiteSpace: "nowrap",
        }}
      >
        ◆ Duplicate ×{count}
      </span>
    );
  }
  // "possible" — escalate styling slightly when the suggestion is new/changed
  // since the user's last visit so it's noticeable without being intrusive.
  if (isNew) {
    return (
      <span
        title="New duplicate suggestion since your last visit. Open the signal to review."
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "1px 7px", borderRadius: 100,
          fontSize: 10.5, fontWeight: 600,
          background: "rgba(220,38,38,0.08)", color: "#b91c1c",
          border: "1px dashed rgba(220,38,38,0.55)", whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            background: "#dc2626", color: "white",
            padding: "0 5px", borderRadius: 100, lineHeight: "13px",
          }}
        >
          NEW
        </span>
        Possible duplicate
      </span>
    );
  }
  return (
    <span
      title="This signal may be a duplicate. Open it to review the suggestion."
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 7px", borderRadius: 100,
        fontSize: 10.5, fontWeight: 500,
        background: "rgba(245,158,11,0.08)", color: "#b45309",
        border: "1px dashed rgba(245,158,11,0.45)", whiteSpace: "nowrap",
      }}
    >
      ◇ Possible duplicate
    </span>
  );
}

export function ClosedBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "1px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 500,
      background: "var(--bg-sunken)", color: "var(--text-tertiary)",
      border: "1px solid var(--border)", whiteSpace: "nowrap",
    }}>
      ✕ Closed
    </span>
  );
}

/**
 * StaleBadge — small "stale Nd" indicator. Two tones:
 *   • soft amber for stale-but-not-too-old (informational)
 *   • escalated red for very stale (>2× threshold) so the worst items
 *     surface first when scanning
 *
 * The badge is informational only — it doesn't gate any action.
 */
export function StaleBadge({
  daysStale, status, escalated = false,
}: {
  daysStale: number;
  /** Optional — when "ready" we lead with "Ready · stale Nd" copy. */
  status?: string;
  escalated?: boolean;
}) {
  const days = Math.max(1, Math.floor(daysStale));
  const palette = escalated
    ? { fg: "#b91c1c", bg: "rgba(220,38,38,0.06)", bd: "rgba(220,38,38,0.30)" }
    : { fg: "#b45309", bg: "rgba(245,158,11,0.08)", bd: "rgba(245,158,11,0.40)" };
  const label = status === "ready"
    ? `Ready · stale ${days}d`
    : `Stale ${days}d`;
  return (
    <span
      title={`Last touched ${days} day${days === 1 ? "" : "s"} ago`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 7px", borderRadius: 100,
        fontSize: 10.5, fontWeight: escalated ? 600 : 500,
        background: palette.bg, color: palette.fg,
        border: `1px ${escalated ? "solid" : "dashed"} ${palette.bd}`,
        whiteSpace: "nowrap",
      }}
    >
      ◔ {label}
    </span>
  );
}
