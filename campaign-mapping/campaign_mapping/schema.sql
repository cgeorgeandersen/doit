-- Campaign mapping layer: the whole data model.
--
--   taxonomy  workspaces, dimensions,                   the controlled vocabulary: values are
--             dimension_values, campaigns               added or deactivated, never renamed
--   inputs    import_batches, raw_strings               exactly as imported, never modified
--   ruleset   rules, campaign_products,                 immutable rows; a version is the exact
--             ruleset_versions, ruleset_version_rules,  set of rows its manifest lists
--             ruleset_version_campaign_products
--   results   classification_runs, classifications,     derived: any run can be rebuilt from its
--             classification_hits                       ruleset version and input watermark
--
-- The triggers at the end make those promises hold in the database itself, not
-- only in the Python that normally writes here. Tables are STRICT, so a
-- priority stored as the text '10' is an error rather than a surprise.
--
-- "Network" (shared by every operator) is written as workspace_id IS NULL.

-- ── taxonomy ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspaces (                 -- one per operator
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE CHECK (slug <> '' AND slug NOT GLOB '*[^a-z0-9_-]*'),
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS dimensions (
    id            INTEGER PRIMARY KEY,
    key           TEXT NOT NULL UNIQUE CHECK (key <> '' AND key NOT GLOB '*[^a-z_]*'),
    label         TEXT NOT NULL,
    -- network: a shared fact; only network rules may set it.
    -- workspace: operators may add rules that apply in their own lens only.
    layer         TEXT NOT NULL CHECK (layer IN ('network', 'workspace')),
    multi_valued  INTEGER NOT NULL DEFAULT 0 CHECK (multi_valued IN (0, 1)),
    sort_order    INTEGER NOT NULL DEFAULT 0,
    description   TEXT NOT NULL DEFAULT '',
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS dimension_values (
    id            INTEGER PRIMARY KEY,
    dimension_id  INTEGER NOT NULL REFERENCES dimensions(id),
    value         TEXT NOT NULL CHECK (value <> '' AND value = trim(value)),
    description   TEXT NOT NULL DEFAULT '',
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    UNIQUE (dimension_id, value COLLATE NOCASE),
    UNIQUE (id, dimension_id)          -- lets a rule prove its value belongs to its dimension
) STRICT;

CREATE TABLE IF NOT EXISTS campaigns (                  -- facts about one campaign value
    id            INTEGER PRIMARY KEY,
    value_id      INTEGER NOT NULL UNIQUE REFERENCES dimension_values(id),
    start_date    TEXT NOT NULL CHECK (date(start_date) IS start_date),
    end_date      TEXT NOT NULL CHECK (date(end_date) IS end_date),
    workspace_id  INTEGER REFERENCES workspaces(id),   -- NULL: network-wide; else the operator's local campaign
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    CHECK (end_date >= start_date)
) STRICT;

-- ── inputs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_batches (
    id           INTEGER PRIMARY KEY,
    source_name  TEXT NOT NULL,                         -- the file name, or the generator
    row_count    INTEGER NOT NULL CHECK (row_count >= 0),
    note         TEXT NOT NULL DEFAULT '',
    imported_by  TEXT NOT NULL,
    imported_at  TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS raw_strings (                -- one row per imported row, exactly as it arrived
    id             INTEGER PRIMARY KEY,
    batch_id       INTEGER NOT NULL REFERENCES import_batches(id),
    source_row     INTEGER,                             -- row number in the imported file
    workspace_id   INTEGER NOT NULL REFERENCES workspaces(id),   -- the operator that sent it
    utm_source     TEXT NOT NULL DEFAULT '',
    utm_medium     TEXT NOT NULL DEFAULT '',
    utm_campaign   TEXT NOT NULL DEFAULT '',
    utm_content    TEXT NOT NULL DEFAULT '',
    utm_term       TEXT NOT NULL DEFAULT '',
    activity_date  TEXT CHECK (activity_date IS NULL OR date(activity_date) IS activity_date),
    spend          REAL NOT NULL DEFAULT 0 CHECK (spend >= 0),   -- the weight behind spend-weighted coverage
    sends          INTEGER CHECK (sends IS NULL OR sends >= 0),  -- email or SMS volume, when there is one
    row_hash       TEXT NOT NULL                        -- of the row's content, to spot duplicates on import
) STRICT;

CREATE INDEX IF NOT EXISTS raw_strings_by_workspace ON raw_strings(workspace_id);
CREATE INDEX IF NOT EXISTS raw_strings_by_hash ON raw_strings(row_hash);

-- ── ruleset ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rules (                      -- one immutable revision of a rule
    id            INTEGER PRIMARY KEY,                  -- the exact revision a classification says fired
    rule_key      TEXT NOT NULL CHECK (rule_key GLOB 'R[0-9]*'),   -- the rule itself, across revisions
    revision      INTEGER NOT NULL CHECK (revision >= 1),
    dimension_id  INTEGER NOT NULL REFERENCES dimensions(id),
    field         TEXT NOT NULL CHECK (field IN ('any', 'source', 'medium', 'campaign', 'content', 'term')),
    match_type    TEXT NOT NULL CHECK (match_type IN ('contains', 'exact', 'starts_with', 'regex')),
    pattern       TEXT NOT NULL CHECK (pattern <> ''),
    action        TEXT NOT NULL CHECK (action IN ('assign', 'ignore')),
    value_id      INTEGER,                              -- the controlled value assigned; NULL for ignore
    priority      INTEGER NOT NULL CHECK (priority >= 0),          -- lower wins
    workspace_id  INTEGER REFERENCES workspaces(id),   -- NULL: network rule; else that operator's lens only
    owner         TEXT NOT NULL CHECK (owner <> ''),
    active        INTEGER NOT NULL CHECK (active IN (0, 1)),
    note          TEXT NOT NULL DEFAULT '',
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    UNIQUE (rule_key, revision),
    UNIQUE (id, rule_key),
    FOREIGN KEY (value_id, dimension_id) REFERENCES dimension_values(id, dimension_id),
    CHECK ((action = 'assign') = (value_id IS NOT NULL))
) STRICT;

CREATE INDEX IF NOT EXISTS rules_by_key ON rules(rule_key, revision);

CREATE TABLE IF NOT EXISTS campaign_products (          -- the bridge: which products a campaign's spend goes to
    id                INTEGER PRIMARY KEY,
    campaign_id       INTEGER NOT NULL REFERENCES campaigns(id),
    product_value_id  INTEGER NOT NULL REFERENCES dimension_values(id),
    workspace_id      INTEGER REFERENCES workspaces(id),   -- NULL: the network lineup; else that operator's own
    weight            REAL NOT NULL CHECK (weight > 0),    -- relative; shares are weight / lineup total
    created_by        TEXT NOT NULL,
    created_at        TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS ruleset_versions (
    id          INTEGER PRIMARY KEY,                    -- the version number
    parent_id   INTEGER REFERENCES ruleset_versions(id),
    message     TEXT NOT NULL CHECK (message <> ''),   -- why the rules changed
    author      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    CHECK (parent_id IS NULL OR parent_id < id)
) STRICT;

CREATE TABLE IF NOT EXISTS ruleset_version_rules (      -- manifest: the exact rule revisions in a version
    version_id  INTEGER NOT NULL REFERENCES ruleset_versions(id),
    rule_key    TEXT NOT NULL,
    rule_id     INTEGER NOT NULL,
    PRIMARY KEY (version_id, rule_key),                 -- at most one revision of each rule per version
    FOREIGN KEY (rule_id, rule_key) REFERENCES rules(id, rule_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS ruleset_version_campaign_products (   -- manifest: the lineup rows in a version
    version_id           INTEGER NOT NULL REFERENCES ruleset_versions(id),
    campaign_product_id  INTEGER NOT NULL REFERENCES campaign_products(id),
    PRIMARY KEY (version_id, campaign_product_id)
) STRICT, WITHOUT ROWID;

-- ── results ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classification_runs (
    id                  INTEGER PRIMARY KEY,
    version_id          INTEGER NOT NULL REFERENCES ruleset_versions(id),
    engine_version      TEXT NOT NULL,
    max_raw_string_id   INTEGER NOT NULL,               -- input watermark: the run read raw_strings.id <= this
    input_count         INTEGER NOT NULL,
    input_fingerprint   TEXT NOT NULL,
    result_fingerprint  TEXT NOT NULL,
    note                TEXT NOT NULL DEFAULT '',
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS classifications (            -- one outcome per string, dimension and lens
    id             INTEGER PRIMARY KEY,
    run_id         INTEGER NOT NULL REFERENCES classification_runs(id),
    raw_string_id  INTEGER NOT NULL REFERENCES raw_strings(id),
    dimension_id   INTEGER NOT NULL REFERENCES dimensions(id),
    lens           TEXT NOT NULL CHECK (lens IN ('network', 'workspace')),
    status         TEXT NOT NULL CHECK (status IN ('classified', 'conflict', 'unclassified', 'ignored')),
    method         TEXT CHECK (method IN ('rule', 'campaign_bridge')),
    UNIQUE (run_id, raw_string_id, dimension_id, lens),
    CHECK ((status = 'unclassified') = (method IS NULL))
) STRICT;

CREATE INDEX IF NOT EXISTS classifications_by_run ON classifications(run_id, dimension_id, lens, status);

CREATE TABLE IF NOT EXISTS classification_hits (        -- what decided each outcome: the rules that fired
    id                   INTEGER PRIMARY KEY,
    classification_id    INTEGER NOT NULL REFERENCES classifications(id),
    role                 TEXT NOT NULL CHECK (role IN ('fired', 'candidate')),   -- candidate: one side of a conflict
    value_id             INTEGER REFERENCES dimension_values(id),
    rule_id              INTEGER REFERENCES rules(id),
    campaign_product_id  INTEGER REFERENCES campaign_products(id),   -- set when the value came from a lineup
    weight               REAL CHECK (weight IS NULL OR (weight > 0 AND weight <= 1)),   -- share of the string's spend
    CHECK ((rule_id IS NULL) <> (campaign_product_id IS NULL))
) STRICT;

CREATE INDEX IF NOT EXISTS classification_hits_by_classification ON classification_hits(classification_id);

-- ── views ───────────────────────────────────────────────────────────────────

-- "Raw string, dimension, value, fired rule, version": one row per outcome and hit.
CREATE VIEW IF NOT EXISTS v_classifications AS
SELECT
    c.run_id,
    r.version_id,
    c.raw_string_id,
    rs.workspace_id,
    d.key          AS dimension,
    c.lens,
    c.status,
    c.method,
    h.role,
    v.value,
    h.weight,
    h.rule_id,
    ru.rule_key,
    ru.revision    AS rule_revision,
    h.campaign_product_id
FROM classifications c
JOIN classification_runs r       ON r.id = c.run_id
JOIN raw_strings rs              ON rs.id = c.raw_string_id
JOIN dimensions d                ON d.id = c.dimension_id
LEFT JOIN classification_hits h  ON h.classification_id = c.id
LEFT JOIN dimension_values v     ON v.id = h.value_id
LEFT JOIN rules ru               ON ru.id = h.rule_id;

-- Every rule revision in every version, readable.
CREATE VIEW IF NOT EXISTS v_version_rules AS
SELECT
    m.version_id,
    ru.rule_key,
    ru.revision,
    ru.id          AS rule_id,
    d.key          AS dimension,
    ru.field,
    ru.match_type,
    ru.pattern,
    ru.action,
    v.value,
    ru.priority,
    w.slug         AS workspace,
    ru.owner,
    ru.active,
    ru.note,
    ru.created_at
FROM ruleset_version_rules m
JOIN rules ru                    ON ru.id = m.rule_id
JOIN dimensions d                ON d.id = ru.dimension_id
LEFT JOIN dimension_values v     ON v.id = ru.value_id
LEFT JOIN workspaces w           ON w.id = ru.workspace_id;

-- ── guards ──────────────────────────────────────────────────────────────────

-- Append-only: written once, never changed or removed.
CREATE TRIGGER IF NOT EXISTS import_batches_no_update BEFORE UPDATE ON import_batches
BEGIN SELECT RAISE(ABORT, 'import_batches is append-only'); END;
CREATE TRIGGER IF NOT EXISTS import_batches_no_delete BEFORE DELETE ON import_batches
BEGIN SELECT RAISE(ABORT, 'import_batches is append-only'); END;

CREATE TRIGGER IF NOT EXISTS raw_strings_no_update BEFORE UPDATE ON raw_strings
BEGIN SELECT RAISE(ABORT, 'raw_strings is append-only: strings stay exactly as imported'); END;
CREATE TRIGGER IF NOT EXISTS raw_strings_no_delete BEFORE DELETE ON raw_strings
BEGIN SELECT RAISE(ABORT, 'raw_strings is append-only: strings stay exactly as imported'); END;

CREATE TRIGGER IF NOT EXISTS rules_no_update BEFORE UPDATE ON rules
BEGIN SELECT RAISE(ABORT, 'rules are immutable: change a rule by writing a new revision'); END;
CREATE TRIGGER IF NOT EXISTS rules_no_delete BEFORE DELETE ON rules
BEGIN SELECT RAISE(ABORT, 'rules are immutable: deactivate a rule instead of deleting it'); END;

CREATE TRIGGER IF NOT EXISTS campaign_products_no_update BEFORE UPDATE ON campaign_products
BEGIN SELECT RAISE(ABORT, 'campaign_products is immutable: change a lineup in a new version'); END;
CREATE TRIGGER IF NOT EXISTS campaign_products_no_delete BEFORE DELETE ON campaign_products
BEGIN SELECT RAISE(ABORT, 'campaign_products is immutable: change a lineup in a new version'); END;

CREATE TRIGGER IF NOT EXISTS ruleset_versions_no_update BEFORE UPDATE ON ruleset_versions
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ruleset_versions_no_delete BEFORE DELETE ON ruleset_versions
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;

CREATE TRIGGER IF NOT EXISTS ruleset_version_rules_no_update BEFORE UPDATE ON ruleset_version_rules
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ruleset_version_rules_no_delete BEFORE DELETE ON ruleset_version_rules
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;

CREATE TRIGGER IF NOT EXISTS ruleset_version_campaign_products_no_update BEFORE UPDATE ON ruleset_version_campaign_products
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ruleset_version_campaign_products_no_delete BEFORE DELETE ON ruleset_version_campaign_products
BEGIN SELECT RAISE(ABORT, 'ruleset versions are immutable'); END;

-- Taxonomy: never deleted, and what identifies a row never changes, because
-- rules and past results point at it. Labels, descriptions and dates may change.
CREATE TRIGGER IF NOT EXISTS workspaces_no_delete BEFORE DELETE ON workspaces
BEGIN SELECT RAISE(ABORT, 'workspaces are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS workspaces_fixed_slug BEFORE UPDATE OF slug ON workspaces
BEGIN SELECT RAISE(ABORT, 'a workspace slug never changes'); END;

CREATE TRIGGER IF NOT EXISTS dimensions_no_delete BEFORE DELETE ON dimensions
BEGIN SELECT RAISE(ABORT, 'dimensions are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS dimensions_fixed_shape BEFORE UPDATE OF key, layer, multi_valued ON dimensions
BEGIN SELECT RAISE(ABORT, 'a dimension''s key, layer and multi_valued are fixed once created'); END;

CREATE TRIGGER IF NOT EXISTS dimension_values_no_delete BEFORE DELETE ON dimension_values
BEGIN SELECT RAISE(ABORT, 'values are never deleted: deactivate the value instead'); END;
CREATE TRIGGER IF NOT EXISTS dimension_values_fixed_name BEFORE UPDATE OF value, dimension_id ON dimension_values
BEGIN SELECT RAISE(ABORT, 'values are never renamed: add the new value and deactivate the old one'); END;

CREATE TRIGGER IF NOT EXISTS campaigns_no_delete BEFORE DELETE ON campaigns
BEGIN SELECT RAISE(ABORT, 'campaigns are never deleted'); END;
CREATE TRIGGER IF NOT EXISTS campaigns_fixed_value BEFORE UPDATE OF value_id ON campaigns
BEGIN SELECT RAISE(ABORT, 'a campaign row always describes the same campaign value'); END;

-- Results are written once. (Deleting a whole run is allowed: it can be rebuilt.)
CREATE TRIGGER IF NOT EXISTS classification_runs_no_update BEFORE UPDATE ON classification_runs
BEGIN SELECT RAISE(ABORT, 'classification runs are written once'); END;
CREATE TRIGGER IF NOT EXISTS classifications_no_update BEFORE UPDATE ON classifications
BEGIN SELECT RAISE(ABORT, 'classifications are written once'); END;
CREATE TRIGGER IF NOT EXISTS classification_hits_no_update BEFORE UPDATE ON classification_hits
BEGIN SELECT RAISE(ABORT, 'classifications are written once'); END;

-- References a foreign key can't type-check on its own.
CREATE TRIGGER IF NOT EXISTS campaigns_value_is_a_campaign BEFORE INSERT ON campaigns
WHEN (SELECT d.key FROM dimension_values v JOIN dimensions d ON d.id = v.dimension_id
      WHERE v.id = NEW.value_id) IS NOT 'campaign'
BEGIN SELECT RAISE(ABORT, 'campaigns.value_id must be a value of the campaign dimension'); END;

CREATE TRIGGER IF NOT EXISTS campaign_products_value_is_a_product BEFORE INSERT ON campaign_products
WHEN (SELECT d.key FROM dimension_values v JOIN dimensions d ON d.id = v.dimension_id
      WHERE v.id = NEW.product_value_id) IS NOT 'product'
BEGIN SELECT RAISE(ABORT, 'campaign_products.product_value_id must be a value of the product dimension'); END;

CREATE TRIGGER IF NOT EXISTS rules_operator_scope_needs_workspace_layer BEFORE INSERT ON rules
WHEN NEW.workspace_id IS NOT NULL
 AND (SELECT layer FROM dimensions WHERE id = NEW.dimension_id) IS NOT 'workspace'
BEGIN SELECT RAISE(ABORT, 'only workspace-layer dimensions can have operator-scoped rules'); END;

CREATE TRIGGER IF NOT EXISTS rules_revision_keeps_dimension BEFORE INSERT ON rules
WHEN NEW.revision > 1
 AND (SELECT dimension_id FROM rules WHERE rule_key = NEW.rule_key AND revision = 1) IS NOT NEW.dimension_id
BEGIN SELECT RAISE(ABORT, 'a rule keeps its dimension across revisions'); END;

PRAGMA user_version = 1;
