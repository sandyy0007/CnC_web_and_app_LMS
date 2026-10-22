CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL CHECK (game_id IN ('rescue', 'escape')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS results_session_idx ON results(session_id);
CREATE TABLE IF NOT EXISTS player_progress (
  player_id TEXT NOT NULL,
  game_id TEXT NOT NULL CHECK (game_id IN ('rescue', 'escape')),
  unlocked_level INTEGER NOT NULL DEFAULT 1 CHECK (unlocked_level BETWEEN 1 AND 15),
  completed_levels TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(completed_levels)),
  best_scores TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(best_scores)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_id)
);
