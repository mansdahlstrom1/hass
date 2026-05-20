import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || '/data/plants_history.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS waterings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_slug  TEXT NOT NULL,
    watered_at  TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'card_tap',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_waterings_slug_time
    ON waterings(plant_slug, watered_at DESC);
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

export const stmts = {
  insert: db.prepare(
    'INSERT INTO waterings (plant_slug, watered_at, source) VALUES (?, ?, ?) RETURNING id'
  ),
  countAll: db.prepare('SELECT COUNT(*) AS n FROM waterings'),
  countBySlug: db.prepare('SELECT COUNT(*) AS n FROM waterings WHERE plant_slug = ?'),
  recentForSlug: db.prepare(
    'SELECT id, watered_at, source FROM waterings WHERE plant_slug = ? ORDER BY watered_at DESC LIMIT ?'
  ),
  distinctSlugs: db.prepare('SELECT DISTINCT plant_slug FROM waterings'),
};
