# plants-history

Tiny sidecar service that logs every plant-watering event to SQLite and exposes
rolling stats to Home Assistant. Lives next to `home-assistant` in the project
`docker-compose.yaml`.

## Why it exists

HA's recorder purges events after 10 days by default — too short to compute a
rolling watering interval for plants on 4–5d schedules. This service keeps an
append-only log so the Plants dashboard can show "configured vs. actual"
interval per plant. See the project root `CLAUDE.md` "Plant Tracking System"
section for context.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/waterings` | Body: `{plant_slug, watered_at?, source?}`. `watered_at` defaults to now (ISO 8601 UTC). |
| `GET`  | `/stats` | Per-slug `{count, last_watered, avg_interval_days, median_interval_days, recent}`. Avg/median from last 10 entries, `null` if `<2`. |
| `GET`  | `/waterings/:slug?limit=N` | Newest first, `limit` 1–500 (default 50). |
| `GET`  | `/healthz` | `{ok, db_rows}`. |

`plant_slug` is opaque to the service — any non-empty string works. The
service has no knowledge of which plants exist; slugs are defined by the
caller (HA scripts) and discovered from HA's `input_datetime.plant_*_last_watered`
entities during backfill.

## Environment

| Var | Default | Notes |
|---|---|---|
| `NODE_PORT` | `13338` | TCP port. |
| `DB_PATH` | `/data/plants_history.db` | SQLite file (WAL mode). Parent dir is auto-created. |
| `SEED_ON_START` | unset | If `"true"`, runs `seed.js` before the HTTP server starts. |
| `HA_BASE_URL` | `http://localhost:8123` | Used by seed. |
| `HA_TOKEN` | — | Long-lived access token (HA Profile → Long-Lived Access Tokens). Required for seed; otherwise seed is skipped with a warning. |

## Run via docker compose

From the project root (`/home/mans/hass_config`):

```bash
docker compose up -d plants-history
docker logs -f plants-history
curl -s http://localhost:13338/healthz | jq
```

DB lives at `/home/mans/hass_config/plants_history_data/plants_history.db` on
the host (bind-mounted; survives container rebuilds).

## Ad-hoc backfill

Idempotent — safe to re-run. Adds one `source: 'backfill'` row per plant that
has zero rows.

```bash
docker exec -e HA_TOKEN=$HA_TOKEN plants-history node src/seed.js
```

## Schema

```sql
CREATE TABLE waterings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_slug  TEXT NOT NULL,
  watered_at  TEXT NOT NULL,           -- ISO 8601 UTC
  source      TEXT NOT NULL DEFAULT 'card_tap',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_waterings_slug_time ON waterings(plant_slug, watered_at DESC);
```

Adding a plant: no service-side changes needed. Backfill discovers new plants
from HA at next restart; new waterings land via the existing `rest_command`
write path. The HA `rest:` sensor's `json_attributes:` block in
`configuration.yaml` does need the new slug appended so HA exposes it as an
attribute on `sensor.plants_watering_stats`. The `add-plant` skill
(`.claude/skills/add-plant.md`) covers that edit.

## Dependencies

None. Uses Node 24's built-in `node:sqlite` and `node:http`.
