PRAGMA foreign_keys = ON;

CREATE TABLE threads (
  issue_number INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  article_url TEXT,
  github_url TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
  locked INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  latest_comment_id INTEGER,
  latest_activity_at TEXT NOT NULL,
  sync_run_id TEXT,
  synced_at TEXT NOT NULL
);

CREATE TABLE comments (
  comment_id INTEGER PRIMARY KEY,
  issue_number INTEGER NOT NULL REFERENCES threads(issue_number) ON DELETE CASCADE,
  author_login TEXT NOT NULL,
  author_avatar_url TEXT,
  github_url TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  sync_run_id TEXT,
  synced_at TEXT NOT NULL
);

CREATE TABLE read_state (
  issue_number INTEGER PRIMARY KEY REFERENCES threads(issue_number) ON DELETE CASCADE,
  last_read_visitor_comment_id INTEGER NOT NULL DEFAULT 0,
  read_at TEXT NOT NULL
);

CREATE TABLE sessions (
  session_id_hash TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  github_avatar_url TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX idx_threads_activity ON threads(latest_activity_at DESC);
CREATE INDEX idx_comments_thread_time ON comments(issue_number, created_at);
CREATE INDEX idx_comments_thread_admin_id ON comments(issue_number, is_admin, comment_id);
CREATE INDEX idx_comments_author ON comments(author_login);
CREATE INDEX idx_sessions_last_seen ON sessions(last_seen_at);
