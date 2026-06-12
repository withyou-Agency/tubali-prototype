# Roadmap — Data Model

Database schema for the Roadmap section of Signal, derived from the prototype's in-memory model
(`lib/data.ts` / `lib/store.tsx`). UI names are used throughout; code names noted where they differ.

---

## 1. The big picture

Two axes joined by links — not one pyramid. **Product structure** describes what the product is
made of; the **work axis** describes what we're doing and why. **Weekly Goals** and **Milestones**
are planning lenses that point into both. Feedback never touches the roadmap directly — **intents
are the only bridge**.

```mermaid
flowchart LR
    subgraph WORK["Work axis (WIP domain)"]
        direction TB
        SIG([Signals - feedback])
        INT[Intents]
        TSK[Tasks]
        SIG -. "linked to" .-> INT
        INT -. "broken into" .-> TSK
    end

    subgraph LENS["Planning lenses"]
        direction TB
        GOAL["Weekly Goals<br/>(time: one week)"]
        MS["Milestones<br/>(scope + MoSCoW)"]
    end

    subgraph STRUCT["Product structure"]
        direction TB
        AREA["Capability Area"]
        FG["Feature Set<br/>(optional layer)"]
        FEAT[Feature]
        CAP[Capabilities]
        SLC["Feature Slices"]
        AREA --> FG --> FEAT
        AREA --> FEAT
        FEAT --> CAP
        FEAT --> SLC
    end

    INT == "links to" ==> GOAL
    INT == "links to" ==> FEAT
    INT == "links to" ==> SLC
    GOAL == "advances" ==> FEAT
    GOAL == "advances" ==> SLC
    GOAL == "advances" ==> CAP
    MS == "includes" ==> GOAL
    MS == "scopes (with MoSCoW)" ==> STRUCT
```

---

## 2. Entity–relationship diagram

```mermaid
erDiagram
    %% ── Product structure axis ──
    PRODUCT_AREA ||--o{ FEATURE_GROUP : "contains"
    PRODUCT_AREA |o--o{ FEATURE : "contains (NULL = unassigned)"
    FEATURE_GROUP |o--o{ FEATURE : "optionally groups"
    FEATURE ||--o{ CAPABILITY : "has"
    FEATURE ||--o{ FEATURE_SLICE : "broken into"

    %% ── Goals link, never own ──
    WEEKLY_GOAL }o--o{ FEATURE : "advances"
    WEEKLY_GOAL }o--o{ FEATURE_SLICE : "advances"
    WEEKLY_GOAL }o--o{ CAPABILITY : "advances"
    WEEKLY_GOAL }o--o{ INTENT : "executed by"

    %% ── Work axis bridge ──
    FEATURE }o--o{ INTENT : "built by"
    FEATURE_SLICE }o--o{ INTENT : "built by"

    %% ── Milestones: scope packages ──
    MILESTONE ||--o{ SCOPE_LINK : "defines scope via"
    SCOPE_LINK }o--|| PRODUCT_AREA : "one of"
    SCOPE_LINK }o--|| FEATURE_GROUP : "one of"
    SCOPE_LINK }o--|| FEATURE : "one of"
    SCOPE_LINK }o--|| FEATURE_SLICE : "one of"
    SCOPE_LINK }o--|| CAPABILITY : "one of"
    MILESTONE }o--o{ WEEKLY_GOAL : "includes"
    MILESTONE ||--o{ AUDIT_ENTRY : "append-only history"
    MILESTONE |o--o{ MILESTONE : "cloned into versions"

    PRODUCT_AREA {
        uuid id PK
        text title
        text description
    }
    FEATURE_GROUP {
        uuid id PK
        uuid area_id FK
        text title
    }
    FEATURE {
        uuid id PK
        uuid area_id FK "NULL = unassigned"
        uuid feature_group_id FK "optional"
        text title
        enum status "not_started / planned / in_progress / done"
    }
    CAPABILITY {
        uuid id PK
        uuid feature_id FK
        text title
    }
    FEATURE_SLICE {
        uuid id PK
        uuid feature_id FK
        text title
        enum status "not_started / planned / in_progress / done"
    }
    WEEKLY_GOAL {
        uuid id PK
        text title
        date week_start "anchors a 7-day week bucket"
        enum status "planned / in_progress / done (human-set)"
        text notes
    }
    INTENT {
        uuid id PK "wip_items WHERE type = intent"
        text title
        enum column "backlog / to_do / in_progress / done"
    }
    MILESTONE {
        uuid id PK "code name: Release"
        text title
        enum status "planned / in_progress / released"
        date target_start
        date target_end
        uuid version_family_id "groups versions"
        uuid version_parent_id FK "cloned from"
        int version_number "label v1, v2 derived from this"
        timestamptz locked_at "set = read-only snapshot; one unlocked head per family"
    }
    SCOPE_LINK {
        uuid milestone_id FK
        enum object_kind "area / feature_set / feature / slice / capability"
        uuid object_id "exactly one target"
        enum priority "must / should / could / wont"
        text note
    }
    AUDIT_ENTRY {
        uuid version_family_id "history survives version deletion"
        uuid milestone_id FK "NULL once the version is deleted"
        timestamptz at
        text kind "renamed, scope_added, moscow_changed, ... (extensible)"
        text summary "human-readable fallback"
        text previous_value "denormalized - survives deletion"
        text next_value
    }
```

---

## 3. Entities at a glance

| Entity | UI name | Code name | What it is |
|---|---|---|---|
| `product_areas` | Capability Area | `ProductArea` | Top of the structure tree |
| `feature_groups` | Feature Set | `FeatureGroup` | Optional middle layer inside an area |
| `features` | Feature | `Feature` | Core structure unit; can be **unassigned** (no area) when created ad-hoc from a goal card |
| `product_capabilities` | Capability | `ProductCapability` | What a feature can do |
| `feature_slices` | Feature Slice | `FeatureSlice` | Deliverable vertical cut of a feature |
| `weekly_goals` | Weekly Goal | `WeeklyGoal` | Week-scoped planning unit; status is human-set, never derived |
| `milestones` | Milestone | `Release` | Pure scope package — owns nothing, points at goals + structure |
| `milestone_audit_entries` | Change history | `MilestoneAuditEntry` | Append-only log of every milestone mutation |
| `wip_items` (bridge) | Intent / Task | `Wip` | Owned by the WIP domain; roadmap only links to `type = 'intent'` |

## 4. Relationships (the join tables)

Everything connecting the axes is **many-to-many**. In the prototype these were ID arrays stored
on one side; in the database each becomes a join table. Two of them carry payload — that's why
they exist as first-class tables rather than plain pairs:

| Link | Cardinality | Payload on the link |
|---|---|---|
| Goal ↔ Feature / Slice / Capability | n : m | — |
| Goal ↔ Intent | n : m | — |
| Feature ↔ Intent, Slice ↔ Intent | n : m | — |
| Milestone ↔ Goal | n : m | — |
| **Milestone ↔ structure object** (`milestone_scope_links`) | n : m, polymorphic over 5 kinds | **MoSCoW priority + note** — the same feature can be *must* in one milestone and *could* in another |
| Intent → Capability | *derived, not stored* | Computed transitively through the intent's goals |

## 5. Design decisions worth defending in a review

1. **Arrays → join tables.** The prototype stores links as ID arrays on the container and scans
   for reverse lookups. Join tables give both directions, referential integrity, and indexes.
2. **MoSCoW lives on the milestone↔object link, not on the object.** This is the prototype's
   most important rule: priority is *per milestone*, deliberately non-cascading to children.
3. **Milestone versioning = self-reference + family key.** Cloning (from *any* version, snapshots
   included) creates the next version in the same `version_family_id`; the current head gets
   `locked_at` stamped. Exactly one unlocked, editable head per family — enforced by a unique
   index. Deleting the head hands editability back to the previous version.
4. **Audit log is append-only and denormalized.** Entries store object *labels* and old/new
   *values as text*, and are anchored to the version *family* — so history survives deletion of
   the objects it mentions and even of the milestone version itself.
5. **Unassigned features are `area_id NULL`** (prototype used an empty string) — supports the
   "type a feature name on a goal card, organize it later" flow.
6. **Signals stay out of the roadmap schema.** The only doorway is `wip_items` of type `intent`;
   link tables enforce that with a composite foreign key on `(id, type)`.

---

*Full PostgreSQL DDL: [`roadmap-db-schema.sql`](roadmap-db-schema.sql). A browser-presentable
version of this document: [`roadmap-schema.html`](roadmap-schema.html).*
