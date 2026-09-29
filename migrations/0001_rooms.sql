CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  status TEXT NOT NULL CHECK (status IN ('waiting','active','finished','cancelled')),
  host_hash TEXT NOT NULL,
  white_hash TEXT,
  black_hash TEXT,
  white_name TEXT,
  black_name TEXT,
  white_seen BIGINT NOT NULL DEFAULT 0,
  black_seen BIGINT NOT NULL DEFAULT 0,
  game TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  draw_offer TEXT,
  last_action TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_lobby ON rooms(visibility,status,expires_at,created_at);
CREATE INDEX IF NOT EXISTS rooms_white ON rooms(white_hash,expires_at);
CREATE INDEX IF NOT EXISTS rooms_black ON rooms(black_hash,expires_at);
CREATE TABLE IF NOT EXISTS live_tickets (
  ticket_hash TEXT PRIMARY KEY,
  player_hash TEXT NOT NULL,
  target TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS live_tickets_expiry ON live_tickets(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  resets_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(resets_at);
