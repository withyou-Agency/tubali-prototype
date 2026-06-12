-- ============================================================================
-- Signal — Roadmap domain schema (PostgreSQL 15+)
--
-- Scope: everything the Roadmap page touches (product structure, weekly
-- goals, milestones/releases) plus the minimal WIP bridge the roadmap
-- links into. The signals/feedback domain is out of scope except where
-- referenced.
--
-- Verified: this file runs top-to-bottom on PostgreSQL 16.
--
-- Key translations from the prototype (lib/data.ts / lib/store.tsx):
--   * ID-array links (linkedFeatureIds etc.)        -> join tables
--   * Release.productPriorities map ('kind:id' key) -> milestone_scope_links rows (MoSCoW is link payload)
--   * Release.auditLog embedded array               -> milestone_audit_entries table (survives version deletion)
--   * Feature.areaId '' (= unassigned)              -> area_id NULL
--   * WeeklyGoal.weekLabel                          -> dropped, derive from week_start in app
--   * latest-version-editable (derived from sort)   -> explicit locked_at stamp (exactly one unlocked
--                                                      head per family, enforced by a unique index)
--   * version_label 'v'+count (collides after
--     deletions, breaks at v10 lexicographically)   -> integer version_number, label generated
--   * area deletion: prototype leaves orphaned
--     feature groups + stale MoSCoW entries         -> deliberate fix: cascades to feature_groups
--                                                      and milestone_scope_links (the store deletes
--                                                      the area's features; the UI confirm copy
--                                                      claiming "unassigned" is the stale side)
--
-- NOTE on week_start: the prototype's weeks are 7-day buckets keyed by EXACT
-- weekStart equality — the seed anchor is a Wednesday and "+ Add next week"
-- chains +7 days, so weeks are NOT Monday-anchored. No weekday CHECK here;
-- if Monday anchoring is wanted, normalize in the app on every create path
-- and at migration time (this visibly shifts existing week labels).
-- ============================================================================

-- gen_random_uuid() is built-in since PostgreSQL 13 — no extension needed.

-- ── Enums ───────────────────────────────────────────────────────────────────

create type feature_status    as enum ('not_started','planned','in_progress','done');
create type goal_status       as enum ('planned','in_progress','done');
create type milestone_status  as enum ('planned','in_progress','released');
create type moscow_priority   as enum ('must','should','could','wont');
-- prototype MilestoneObjectKind: 'group' renamed to 'feature_group' for clarity
create type scope_object_kind as enum ('area','feature_group','feature','slice','capability');
create type wip_type          as enum ('task','intent');
-- milestone audit "kind" is deliberately NOT an enum: the prototype keeps it a
-- string union "so we can extend without a migration" and the renderer has a
-- graceful fallback for unknown kinds. See milestone_audit_entries.kind.

-- ── Work-axis bridge (owned by the WIP domain — stub here) ─────────────────
-- The roadmap never references signals directly; intents are the bridge.
-- UNIQUE (id, type) lets link tables enforce "intents only" via composite FK.

create table wip_items (
  id         uuid primary key default gen_random_uuid(),
  type       wip_type not null,
  title      text not null,
  -- ... remaining columns owned by the WIP domain schema ...
  created_at timestamptz not null default now(),
  unique (id, type)
);

-- ── Product structure axis ──────────────────────────────────────────────────
-- Capability Area -> Feature Set (optional) -> Feature -> Capabilities/Slices.
-- This is the only true containment hierarchy; everything else links into it.

create table product_areas (              -- UI: "Capability Area"
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table feature_groups (             -- UI: "Feature Set"
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references product_areas(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, area_id)                    -- enables area-consistency FK on features
);

create table features (
  id               uuid primary key default gen_random_uuid(),
  -- NULL = unassigned (prototype used ''); features get created by typing on
  -- goal cards and assigned to an area later. CASCADE on area delete matches
  -- the store's deleteProductArea (which deletes the area's features) — the
  -- UI confirm dialog claiming features "will be unassigned" is the stale side.
  area_id          uuid references product_areas(id) on delete cascade,
  -- prototype deleteFeatureGroup detaches features rather than deleting them
  feature_group_id uuid,
  title            text not null,
  description      text,
  status           feature_status not null default 'not_started',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- a grouped feature must have an area, otherwise the composite FK below is
  -- skipped under MATCH SIMPLE and dangling group refs become possible
  check (feature_group_id is null or area_id is not null),
  -- composite FK: if a feature is in a group, its area must be the group's
  -- area; ON UPDATE CASCADE lets a group be re-parented to another area with
  -- member features following (the store supports this mutation)
  foreign key (feature_group_id, area_id)
    references feature_groups (id, area_id)
    on update cascade
    on delete set null (feature_group_id)
);

create table product_capabilities (
  id         uuid primary key default gen_random_uuid(),
  feature_id uuid not null references features(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table feature_slices (
  id          uuid primary key default gen_random_uuid(),
  feature_id  uuid not null references features(id) on delete cascade,
  title       text not null,
  description text,
  status      feature_status not null default 'not_started',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- NOTE: prototype FeatureSlice.capabilityStatus (per-capability MoSCoW inside a
-- slice) was removed from the UI in V1 and is deliberately NOT modeled.
-- If it returns: slice_capabilities(slice_id, capability_id, weight moscow_priority).

-- intent links stored on features/slices in the prototype -> join tables
create table feature_intents (
  feature_id  uuid not null references features(id) on delete cascade,
  intent_id   uuid not null,
  intent_type wip_type not null default 'intent' check (intent_type = 'intent'),
  created_at  timestamptz not null default now(),
  foreign key (intent_id, intent_type) references wip_items (id, type) on delete cascade,
  primary key (feature_id, intent_id)
);

create table slice_intents (
  slice_id    uuid not null references feature_slices(id) on delete cascade,
  intent_id   uuid not null,
  intent_type wip_type not null default 'intent' check (intent_type = 'intent'),
  created_at  timestamptz not null default now(),
  foreign key (intent_id, intent_type) references wip_items (id, type) on delete cascade,
  primary key (slice_id, intent_id)
);

-- ── Weekly goals (time axis) ────────────────────────────────────────────────
-- Goals LINK product objects and intents; they never own them. Status is
-- human-set, never derived from linked work. Display order inside a week is
-- created_at; columns are grouped by exact week_start equality (see header
-- note — weeks are 7-day buckets, not necessarily Monday-anchored).

create table weekly_goals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  week_start date not null,
  status     goal_status not null default 'planned',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table weekly_goal_features (
  goal_id    uuid not null references weekly_goals(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, feature_id)
);

create table weekly_goal_slices (
  goal_id    uuid not null references weekly_goals(id) on delete cascade,
  slice_id   uuid not null references feature_slices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, slice_id)
);

create table weekly_goal_capabilities (
  goal_id       uuid not null references weekly_goals(id) on delete cascade,
  capability_id uuid not null references product_capabilities(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (goal_id, capability_id)
);

create table weekly_goal_intents (
  goal_id     uuid not null references weekly_goals(id) on delete cascade,
  intent_id   uuid not null,
  intent_type wip_type not null default 'intent' check (intent_type = 'intent'),
  created_at  timestamptz not null default now(),
  foreign key (intent_id, intent_type) references wip_items (id, type) on delete cascade,
  primary key (goal_id, intent_id)
);
-- NOTE: intent->capability traceability shown in the WIP modal is TRANSITIVE
-- (through goals' linked capabilities). Do not store it; derive it in queries.

-- ── Milestones (UI name; code name "Release") ───────────────────────────────
-- A milestone is a pure scope package: it owns nothing, it points at goals and
-- product objects. MoSCoW priority + note live ON THE LINK, not on the object,
-- so the same feature can be 'must' in one milestone and 'could' in another.

create table milestones (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            milestone_status not null default 'planned',
  -- the prototype UI never validated date ordering; the API must (see app rules)
  target_start      date,
  target_end        date,
  -- Version family: grouping key, NOT an FK — the root may be deleted while
  -- siblings live on (root's family id = its own id at insert).
  version_family_id uuid not null,
  -- the specific version this was cloned from; survives middle-of-family deletion
  version_parent_id uuid references milestones(id) on delete set null,
  -- integer, app-assigned as max(family)+1; the text label is derived, so it
  -- can neither collide after deletions nor mis-sort past v9
  version_number    int not null default 1,
  version_label     text generated always as ('v' || version_number::text) stored,
  version_summary   text,
  -- Read-only snapshot marker. Editability rule (matches the UI exactly):
  -- the single UNLOCKED row in a family is the editable head.
  --   * clone (from ANY version, snapshots included): stamp locked_at on the
  --     CURRENT head, insert the new version unlocked
  --   * delete the head: clear locked_at on the newest remaining version
  -- The partial unique index below enforces one-head-per-family and turns
  -- concurrent-clone races into retryable constraint errors.
  locked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (target_end is null or target_start is null or target_end >= target_start),
  unique (version_family_id, version_number)
);

create unique index uq_milestone_family_head
  on milestones (version_family_id) where locked_at is null;

create table milestone_goal_links (
  milestone_id uuid not null references milestones(id) on delete cascade,
  goal_id      uuid not null references weekly_goals(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (milestone_id, goal_id)
);

-- One row per (milestone, product object). Polymorphic over 5 kinds with
-- exactly-one-FK enforcement, so MoSCoW queries stay single-table while FK
-- integrity is preserved per kind.
create table milestone_scope_links (
  id               uuid primary key default gen_random_uuid(),
  milestone_id     uuid not null references milestones(id) on delete cascade,
  object_kind      scope_object_kind not null,
  area_id          uuid references product_areas(id)        on delete cascade,
  feature_group_id uuid references feature_groups(id)       on delete cascade,
  feature_id       uuid references features(id)             on delete cascade,
  slice_id         uuid references feature_slices(id)       on delete cascade,
  capability_id    uuid references product_capabilities(id) on delete cascade,
  object_id        uuid generated always as
                     (coalesce(area_id, feature_group_id, feature_id, slice_id, capability_id)) stored,
  priority         moscow_priority not null default 'must', -- new links default to 'must' (UI rule)
  note             text,
  created_at       timestamptz not null default now(),
  check (num_nonnulls(area_id, feature_group_id, feature_id, slice_id, capability_id) = 1),
  check (
       (object_kind = 'area'          and area_id          is not null)
    or (object_kind = 'feature_group' and feature_group_id is not null)
    or (object_kind = 'feature'       and feature_id       is not null)
    or (object_kind = 'slice'         and slice_id         is not null)
    or (object_kind = 'capability'    and capability_id    is not null)
  ),
  unique (milestone_id, object_id)
);
-- NOTE: MoSCoW deliberately does NOT cascade to children (linking an area says
-- nothing about its features' priorities) — that's a UI/derivation rule.

-- Append-only change history. Anchored to the VERSION FAMILY so history
-- survives deletion of individual versions (milestone_id goes NULL, the
-- denormalized milestone_label keeps the row readable) — consistent with the
-- survival semantics of the rest of the version model. object_label /
-- previous_value / next_value are denormalized TEXT for the same reason.
create table milestone_audit_entries (
  id                uuid primary key default gen_random_uuid(),
  version_family_id uuid not null,
  milestone_id      uuid references milestones(id) on delete set null,
  milestone_label   text not null,        -- e.g. 'v2 — Private beta'
  seq               bigint generated always as identity, -- deterministic order for same-timestamp rows
  at                timestamptz not null default now(),
  -- deliberately TEXT, not an enum: the prototype keeps kinds extensible
  -- without migration and renders unknown kinds via the summary fallback.
  -- Known kinds: created, cloned_from, cloned_to, renamed, description_changed,
  -- status_changed, date_changed, scope_added, scope_removed, moscow_changed,
  -- note_changed, goal_linked, goal_unlinked. NULL = legacy/free-form entry.
  kind              text,
  summary           text not null,        -- always-present human-readable fallback
  object_label      text,
  previous_value    text,
  next_value        text,
  actor_id          uuid                  -- FK to app-wide users table once modeled
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- (a) reverse lookups the UI performs; (b) FK columns on the polymorphic link
-- tables — RI triggers probe the kind columns directly, the object_id indexes
-- cannot serve cascade enforcement, so each gets a cheap partial index.

create index idx_feature_groups_area      on feature_groups (area_id);
create index idx_features_area            on features (area_id);
create index idx_features_group           on features (feature_group_id);
create index idx_capabilities_feature     on product_capabilities (feature_id);
create index idx_slices_feature           on feature_slices (feature_id);

create index idx_goal_features_feature    on weekly_goal_features (feature_id);
create index idx_goal_slices_slice        on weekly_goal_slices (slice_id);
create index idx_goal_caps_capability     on weekly_goal_capabilities (capability_id);
create index idx_goal_intents_intent      on weekly_goal_intents (intent_id);
create index idx_feature_intents_intent   on feature_intents (intent_id);
create index idx_slice_intents_intent     on slice_intents (intent_id);
create index idx_goals_week               on weekly_goals (week_start);

create index idx_milestones_family        on milestones (version_family_id, created_at);
create index idx_milestones_parent        on milestones (version_parent_id);
create index idx_ms_goal_links_goal       on milestone_goal_links (goal_id);
create index idx_ms_scope_milestone       on milestone_scope_links (milestone_id);
create index idx_ms_scope_object          on milestone_scope_links (object_id);
create index idx_ms_scope_area            on milestone_scope_links (area_id)          where area_id is not null;
create index idx_ms_scope_group           on milestone_scope_links (feature_group_id) where feature_group_id is not null;
create index idx_ms_scope_feature         on milestone_scope_links (feature_id)       where feature_id is not null;
create index idx_ms_scope_slice           on milestone_scope_links (slice_id)         where slice_id is not null;
create index idx_ms_scope_capability      on milestone_scope_links (capability_id)    where capability_id is not null;
create index idx_ms_audit_family          on milestone_audit_entries (version_family_id, at desc, seq desc);
create index idx_ms_audit_milestone       on milestone_audit_entries (milestone_id, at desc, seq desc);

-- ── Convenience view: current (editable) version per milestone family ───────
-- Authoritative by construction: locked_at IS the editability flag, and the
-- partial unique index guarantees at most one row per family.

create view milestone_family_heads as
select * from milestones where locked_at is null;

-- ── App-layer rules the schema can't fully express ──────────────────────────
-- 1. Clone (allowed from ANY version, snapshots included) — one transaction:
--    stamp locked_at on the CURRENT family head, insert the new version
--    (family id inherited, parent = clone source, version_number =
--    max(family) + 1, scope links + goal links + priorities copied), write
--    'cloned_to'/'cloned_from' audit entries. The one-head-per-family unique
--    index turns concurrent clones into retryable errors.
-- 2. Deleting the family head — same transaction: clear locked_at on the
--    newest remaining version so it becomes editable again (matches the UI,
--    where deleting the current version reactivates the previous one).
-- 3. Milestones with locked_at set are read-only (enforce in API; optionally
--    a BEFORE UPDATE trigger).
-- 4. Every milestone mutation writes a milestone_audit_entries row in the
--    same transaction, carrying version_family_id + milestone_label.
-- 5. MoSCoW set-priority / set-note = UPSERT of the milestone_scope_links row
--    (the prototype allowed priority entries without a link; this model
--    deliberately merges them — insert-with-priority if the link is missing).
-- 6. The UI must validate target_start <= target_end before save; the
--    prototype never did, and the DB CHECK will reject what its UI allowed.
-- 7. Week buckets: goals join a week by EXACT week_start equality — "+ new
--    goal in this week" must copy the column's week_start verbatim; "+ add
--    next week" = latest week_start + 7 days. Normalize to a canonical
--    weekday only if you accept relabeling migrated data (see header).
-- 8. updated_at maintenance via trigger or ORM hook.
