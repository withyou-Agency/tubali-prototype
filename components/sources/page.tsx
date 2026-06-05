"use client";
import React, { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Note, SOURCES, userById } from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowRight, X } from "@/components/ui/icons";
import { absDate, relTime } from "@/lib/time";

function SourcesRail({
  selectedSource,
  onSelect,
}: {
  selectedSource: string | null;
  onSelect: (id: string) => void;
}) {
  const { notes } = useStore();

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      overflowY: "auto",
    }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, fontSize: "var(--fs-body)", color: "var(--text)" }}>Sources</span>
      </div>
      {/* All option */}
      <button
        onClick={() => onSelect("all")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          textAlign: "left",
          background: (selectedSource === "all" || selectedSource === null) ? "var(--bg-selected)" : "transparent",
          color: (selectedSource === "all" || selectedSource === null) ? "var(--accent)" : "var(--text)",
          fontSize: "var(--fs-body)",
          borderLeft: (selectedSource === "all" || selectedSource === null) ? "2px solid var(--accent)" : "2px solid transparent",
        }}
      >
        <span style={{ fontWeight: 500 }}>All sources</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, monospace" }}>
          {notes.length}
        </span>
      </button>
      {SOURCES.map(src => {
        const count = notes.filter(n => n.source === src.id).length;
        const isSelected = selectedSource === src.id;
        return (
          <button
            key={src.id}
            onClick={() => onSelect(src.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "8px 12px",
              textAlign: "left",
              background: isSelected ? "var(--bg-selected)" : "transparent",
              color: "var(--text)",
              borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: isSelected ? 500 : 400, fontSize: "var(--fs-body)", color: isSelected ? "var(--accent)" : "var(--text)" }}>
                {src.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "JetBrains Mono, monospace" }}>{count}</span>
            </div>
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)", lineHeight: 1.35 }}>
              {src.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NoteComposer({ sourceId, onNoteCreated }: { sourceId: string; onNoteCreated: () => void }) {
  const { createNote } = useStore();
  const [selectedSrc, setSelectedSrc] = useState(sourceId === "all" ? SOURCES[0].id : sourceId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) return;
    createNote({ source: selectedSrc, title: title.trim(), body: body.trim() });
    setTitle("");
    setBody("");
    setExpanded(false);
    onNoteCreated();
  };

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: expanded ? 8 : 0 }}>
        <select
          value={selectedSrc}
          onChange={e => setSelectedSrc(e.target.value)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px 8px",
            fontSize: "var(--fs-meta)",
            background: "var(--bg)",
            color: "var(--text)",
            height: 28,
            flexShrink: 0,
          }}
        >
          {SOURCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="Add a note..."
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!expanded) { setExpanded(true); return; }
              handleSubmit();
            }
          }}
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px 10px",
            height: 28,
            fontSize: "var(--fs-body)",
            background: "var(--bg-sunken)",
            outline: "none",
          }}
        />
        {expanded && (
          <button
            onClick={handleSubmit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: "var(--radius)",
              background: "var(--accent)",
              color: "white",
              fontSize: "var(--fs-meta)",
              fontWeight: 500,
              height: 28,
              flexShrink: 0,
            }}
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      {expanded && (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Details... (Cmd+Enter to submit)"
          onKeyDown={e => {
            if (e.key === "Enter" && e.metaKey) handleSubmit();
          }}
          style={{
            width: "100%",
            minHeight: 72,
            maxHeight: 160,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "8px 10px",
            fontSize: "var(--fs-body)",
            background: "var(--bg-sunken)",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.5,
          }}
        />
      )}
    </div>
  );
}

function NoteRow({ note, selected, onSelect }: { note: Note; selected: boolean; onSelect: () => void }) {
  const src = SOURCES.find(s => s.id === note.source);
  const author = userById(note.author);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: selected ? "var(--bg-selected)" : "var(--bg)",
        alignItems: "flex-start",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--bg)"; }}
    >
      <div style={{ paddingTop: 2 }}>
        <Checkbox checked={selected} onChange={onSelect} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>{src?.name || note.source}</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Avatar userId={note.author} size="sm" />
            <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>{author.name}</span>
          </span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>{relTime(note.createdAt)}</span>
          {note.promoted && (
            <>
              <span style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>·</span>
              <span style={{
                padding: "1px 6px",
                borderRadius: 100,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontSize: 11,
                fontWeight: 500,
              }}>Signal</span>
            </>
          )}
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)", marginBottom: 3 }}>
          {note.title}
        </div>
        {note.body && (
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {note.body}
          </div>
        )}
      </div>
    </div>
  );
}

export function SourcesPage() {
  const { notes } = useStore();
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  const filteredNotes = useMemo(() => {
    if (!selectedSource || selectedSource === "all") return notes;
    return notes.filter(n => n.source === selectedSource);
  }, [notes, selectedSource]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <SourcesRail selectedSource={selectedSource} onSelect={(id) => { setSelectedSource(id); setSelectedNoteIds([]); }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Selection bar */}
        {selectedNoteIds.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            background: "#0f0f11",
            color: "white",
            fontSize: "var(--fs-body)",
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 500 }}>{selectedNoteIds.length} selected</span>
            <button
              onClick={() => alert("This would send selected notes to the Signals queue.")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.1)",
                color: "white",
                fontSize: "var(--fs-body)",
              }}
            >
              <ArrowRight size={12} /> Send to Signals
            </button>
            <button
              onClick={() => setSelectedNoteIds([])}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.1)",
                color: "white",
                fontSize: "var(--fs-body)",
              }}
            >
              <X size={12} /> Clear
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg)",
        }}>
          <div style={{ fontWeight: 600, fontSize: "var(--fs-body)", color: "var(--text)", marginBottom: 2 }}>
            {selectedSource === "all" || !selectedSource
              ? "All sources"
              : SOURCES.find(s => s.id === selectedSource)?.name || selectedSource}
          </div>
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-tertiary)" }}>
            {filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Composer */}
        <NoteComposer sourceId={selectedSource} onNoteCreated={() => {}} />

        {/* Notes list */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-sunken)" }}>
          {filteredNotes.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              selected={selectedNoteIds.includes(note.id)}
              onSelect={() => toggleNote(note.id)}
            />
          ))}
          {filteredNotes.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--fs-body)" }}>
              No notes yet. Add one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
