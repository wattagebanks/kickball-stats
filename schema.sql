-- Kickball Stats D1 schema.
--
-- The app stores its entire AppState (team, players, games, innings, …) as
-- a single JSON blob in one row. This keeps the backend trivial and means
-- the existing client-side data model and migration story (version field on
-- AppState) is the single source of truth. If the dataset ever outgrows
-- this approach, splitting into normalized tables is a separate migration.

CREATE TABLE IF NOT EXISTS app_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  data        TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
