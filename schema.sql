BEGIN TRANSACTION;

CREATE TABLE run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_start TEXT,
  ts_end TEXT,
  site_count INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error INTEGER DEFAULT 0, -- BOOLEAN
  options TEXT
) STRICT;

CREATE TABLE site (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  handled INTEGER DEFAULT 0, -- BOOLEAN
  error INTEGER DEFAULT 0, -- BOOLEAN
  resolved TEXT
) STRICT;

CREATE INDEX site_handled_idx ON site (handled) WHERE handled = 0;

COMMIT;
