"use client";
import React, { useMemo, useState } from "react";
import { Tag, Check } from "./icons";
import { toKebabLabel, similarLabels, normaliseForCompare } from "@/lib/data";

interface LabelPickerProps {
  allLabels: string[];
  activeLabels: string[];
  onToggle: (label: string) => void;
  onClose: () => void;
  width?: number;
  // ── Optional assist props ────────────────────────────────────────────
  // `suggestions` = rule-based / AI hints derived from a signal's content.
  //   Shown as chips when the input is empty so the user gets a one-click
  //   shortcut without anything ever being applied automatically.
  // `recentLabels` = distinct labels from recently touched signals; shown
  //   below suggestions when the input is empty.
  // Both are purely additive — pickers without context (e.g. the toolbar
  // filter chip) can omit them and behave exactly as before.
  suggestions?: string[];
  recentLabels?: string[];
}

// Lightweight inline label picker.
//
// Behaviour summary:
// - Empty input  → shows a "Suggested" section (when provided), then
//                  "Recently used", then the full alphabetical list.
// - Typed input  → autocomplete ranks: exact > startsWith > contains, and
//                  appends fuzzy "did you mean" matches before the Create
//                  affordance.
// - Enter        → applies the focused match if any, otherwise creates the
//                  current input as a new kebab label (only if there's no
//                  exact existing match).
// - Click chip   → applies that label to the signal/selection.
//
// Nothing applies automatically; suggestions are shortcuts, not automation.

export function LabelPicker({
  allLabels, activeLabels, onToggle, onClose, width = 220,
  suggestions = [], recentLabels = [],
}: LabelPickerProps) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const queryKebab = toKebabLabel(trimmed);

  // Autocomplete: rank by relevance to the typed query.
  const ranked = useMemo(() => {
    if (!trimmed) return [] as string[];
    const q = trimmed.toLowerCase();
    const qNorm = normaliseForCompare(trimmed);

    const exact: string[]      = [];
    const starts: string[]     = [];
    const contains: string[]   = [];
    const fuzzy: string[]      = [];

    for (const l of allLabels) {
      const ll = l.toLowerCase();
      if (ll === q || normaliseForCompare(l) === qNorm) exact.push(l);
      else if (ll.startsWith(q))                         starts.push(l);
      else if (ll.includes(q))                           contains.push(l);
    }

    // Append fuzzy candidates not already covered above.
    const seen = new Set([...exact, ...starts, ...contains]);
    for (const cand of similarLabels(trimmed, allLabels, 5)) {
      if (!seen.has(cand)) fuzzy.push(cand);
    }

    return [...exact, ...starts.sort(), ...contains.sort(), ...fuzzy];
  }, [trimmed, allLabels]);

  const exactExists = ranked.some(l => l.toLowerCase() === trimmed.toLowerCase());
  const nearDupes = useMemo(
    () => trimmed && !exactExists ? similarLabels(trimmed, allLabels, 1) : [],
    [trimmed, allLabels, exactExists],
  );

  const handleCreate = () => {
    if (!queryKebab) return;
    onToggle(queryKebab);
    setQuery("");
  };

  const handlePick = (l: string) => {
    onToggle(l);
    setQuery("");
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Empty-state suggestions: filter out anything already applied.
  const visibleSuggestions = useMemo(
    () => suggestions.filter(l => !activeLabels.includes(l)).slice(0, 5),
    [suggestions, activeLabels],
  );
  const visibleRecent = useMemo(
    () => recentLabels
      .filter(l => !activeLabels.includes(l) && !visibleSuggestions.includes(l))
      .slice(0, 6),
    [recentLabels, activeLabels, visibleSuggestions],
  );

  // Empty-state full list: everything not currently active and not already
  // surfaced in the suggestions / recent rows above.
  const restAlpha = useMemo(
    () => allLabels
      .filter(l => !visibleSuggestions.includes(l) && !visibleRecent.includes(l))
      .slice()
      .sort((a, b) => a.localeCompare(b)),
    [allLabels, visibleSuggestions, visibleRecent],
  );

  return (
    <div
      style={{
        width,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        overflow: "hidden",
      }}
    >
      {/* Search input */}
      <div style={{
        padding: "6px 8px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <Tag size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type to filter or create…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "var(--fs-meta)",
            color: "var(--text)",
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === "Enter") {
              if (ranked.length > 0) {
                handlePick(ranked[0]);
              } else if (queryKebab && !exactExists) {
                handleCreate();
              }
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      </div>

      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {/* ── EMPTY STATE: suggestions / recent / all ───────────────── */}
        {!trimmed && (
          <>
            {visibleSuggestions.length > 0 && (
              <SectionHeader>Suggested</SectionHeader>
            )}
            {visibleSuggestions.length > 0 && (
              <ChipRow>
                {visibleSuggestions.map(l => (
                  <SuggestionChip key={l} label={l} onClick={() => handlePick(l)} />
                ))}
              </ChipRow>
            )}

            {visibleRecent.length > 0 && (
              <>
                <SectionHeader>Recently used</SectionHeader>
                <ChipRow>
                  {visibleRecent.map(l => (
                    <SuggestionChip key={l} label={l} onClick={() => handlePick(l)} variant="muted" />
                  ))}
                </ChipRow>
              </>
            )}

            {restAlpha.length > 0 && (visibleSuggestions.length > 0 || visibleRecent.length > 0) && (
              <SectionHeader>All labels</SectionHeader>
            )}
            {restAlpha.map(label => (
              <LabelRow
                key={label} label={label}
                active={activeLabels.includes(label)}
                onClick={() => handlePick(label)}
              />
            ))}

            {restAlpha.length === 0 && visibleSuggestions.length === 0 && visibleRecent.length === 0 && (
              <div style={{
                padding: "14px 10px", fontSize: "var(--fs-meta)",
                color: "var(--text-tertiary)", textAlign: "center",
              }}>
                No labels yet. Type to create your first one.
              </div>
            )}
          </>
        )}

        {/* ── TYPED STATE: ranked autocomplete ─────────────────────── */}
        {trimmed && (
          <>
            {ranked.map(label => (
              <LabelRow
                key={label} label={label}
                active={activeLabels.includes(label)}
                onClick={() => handlePick(label)}
                highlight={trimmed}
              />
            ))}

            {!exactExists && nearDupes.length > 0 && (
              <div style={{
                padding: "6px 10px",
                background: "var(--bg-sunken)",
                borderTop: ranked.length > 0 ? "1px solid var(--border)" : "none",
                fontSize: 11, color: "var(--text-tertiary)",
                display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
              }}>
                <span>Did you mean</span>
                {nearDupes.map(l => (
                  <button
                    key={l}
                    onClick={() => handlePick(l)}
                    style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: 100,
                      border: "1px solid var(--accent)",
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    #{l}
                  </button>
                ))}
                <span>?</span>
              </div>
            )}

            {queryKebab && !exactExists && (
              <button
                onClick={handleCreate}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 10px",
                  textAlign: "left",
                  fontSize: "var(--fs-body)",
                  color: "var(--accent)",
                  background: "transparent",
                  borderTop: (ranked.length > 0 || nearDupes.length > 0) ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  border: "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-soft)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ width: 14, display: "inline-flex", justifyContent: "center" }}>+</span>
                <span>Create label <strong style={{ fontWeight: 600 }}>#{queryKebab}</strong></span>
              </button>
            )}

            {ranked.length === 0 && !queryKebab && (
              <div style={{
                padding: "10px", fontSize: "var(--fs-meta)",
                color: "var(--text-tertiary)", textAlign: "center",
              }}>
                No matches.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Internal sub-components ─────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "8px 10px 4px", fontSize: 10,
      fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
      color: "var(--text-tertiary)",
    }}>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 4,
      padding: "2px 10px 8px",
    }}>
      {children}
    </div>
  );
}

function SuggestionChip({
  label, onClick, variant = "accent",
}: {
  label: string;
  onClick: () => void;
  variant?: "accent" | "muted";
}) {
  const accent = variant === "accent";
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 100,
        border: accent ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: accent ? "var(--accent-soft)" : "var(--bg)",
        color: accent ? "var(--accent)" : "var(--text-secondary)",
        cursor: "pointer",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = "brightness(0.96)")}
      onMouseLeave={e => (e.currentTarget.style.filter = "")}
      title={`Add #${label}`}
    >
      + #{label}
    </button>
  );
}

function LabelRow({
  label, active, onClick, highlight,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "6px 10px",
        textAlign: "left",
        fontSize: "var(--fs-body)",
        color: "var(--text)",
        background: "transparent",
        transition: "background 0.1s",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {active && <Check size={12} style={{ color: "var(--accent)" }} />}
      </span>
      <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-meta)" }}>#</span>
      <Highlighted text={label} highlight={highlight} />
    </button>
  );
}

function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "0 1px", borderRadius: 2 }}>
        {text.slice(idx, idx + highlight.length)}
      </span>
      {text.slice(idx + highlight.length)}
    </>
  );
}
