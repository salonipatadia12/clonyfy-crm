// Single source of truth for the local SQLite schema.
// Applied idempotently by both the seed script and the runtime connection.
// Influencer `id` is the Instagram handle (stable natural key) so re-seeding
// upserts cleanly and child rows reference a durable id.

export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS influencers (
  id              TEXT PRIMARY KEY,            -- = handle
  handle          TEXT NOT NULL,
  name            TEXT NOT NULL,
  follower_count  INTEGER,
  following_count INTEGER,
  posts_count     INTEGER,
  engagement_rate REAL,
  avg_likes       INTEGER,
  eng_quality     TEXT,                        -- high|good|ok|low|viral_outlier|anomalous
  account_type    TEXT,                        -- creator|business|personal
  category        TEXT,
  niche           TEXT,                        -- web_dev|software_dev|design|...
  market          TEXT,                        -- en|fr|fr?
  country_seed    TEXT,
  is_verified     INTEGER NOT NULL DEFAULT 0,
  is_private      INTEGER NOT NULL DEFAULT 0,
  quality_tier    TEXT,                        -- A|B|C (legacy; no longer surfaced in UI)
  bio_link        TEXT,
  biography       TEXT,
  email           TEXT,
  profile_url     TEXT,
  avatar_url      TEXT,
  -- CRM relationship state (preserved across re-seeds) --
  in_pipeline     INTEGER NOT NULL DEFAULT 0,   -- 0 = discovery pool, 1 = working pipeline
  stage           TEXT NOT NULL DEFAULT 'Prospecting',
  priority        TEXT NOT NULL DEFAULT 'low',
  added_via       TEXT,                          -- 'scrape' | 'url'
  scraped_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_influencers_stage   ON influencers(stage);
CREATE INDEX IF NOT EXISTS idx_influencers_tier    ON influencers(quality_tier);
CREATE INDEX IF NOT EXISTS idx_influencers_niche   ON influencers(niche);

CREATE TABLE IF NOT EXISTS pipeline_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id TEXT NOT NULL,
  from_stage    TEXT,
  to_stage      TEXT NOT NULL,
  note          TEXT,
  changed_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_influencer ON pipeline_entries(influencer_id);

CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_influencer ON notes(influencer_id);

CREATE TABLE IF NOT EXISTS collaborations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active|completed|cancelled
  deal_value    REAL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  start_date    TEXT,
  end_date      TEXT,
  deliverables  TEXT,                              -- JSON array
  reel_url      TEXT,                              -- live campaign reel link
  reel_views    INTEGER,                           -- manually entered views
  notes         TEXT,
  created_at    TEXT NOT NULL
);

-- In-app action log powering the Live Activity feed (real user actions only).
CREATE TABLE IF NOT EXISTS activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,                     -- added|stage|deal|closed|note|dm
  influencer_id TEXT,
  detail        TEXT,
  value         REAL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_collab_influencer ON collaborations(influencer_id);
CREATE INDEX IF NOT EXISTS idx_collab_status     ON collaborations(status);

CREATE TABLE IF NOT EXISTS segments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  filters    TEXT NOT NULL,                        -- JSON
  created_at TEXT NOT NULL
);
`;
