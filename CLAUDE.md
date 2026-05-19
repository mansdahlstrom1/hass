# CLAUDE.md - Home Assistant

Expert reference for managing the Home Assistant instance on this server.

## Deployment

- **HA Version:** 2025.2.4 (check `.HA_VERSION` for current) -- **~1 year old, should be updated**
- **Container:** `home-assistant` (Docker, `homeassistant/home-assistant:latest`)
- **Network mode:** host (port 8123 directly on host)
- **Restart policy:** always (auto-starts on reboot)
- **Config mount:** `/home/mans/hass_config:/config`
- **Also mounts:** `/etc/localtime` (timezone), `/etc/letsencrypt/` (SSL certs)
- **Docker Compose:** `/home/mans/hass_config/docker-compose.yaml`

## Common Operations

```bash
# Restart
docker restart home-assistant

# View logs
docker logs -f home-assistant --tail 100
# Or read the log file directly:
tail -f /home/mans/hass_config/home-assistant.log

# Check status
docker ps --filter name=home-assistant

# Full stop/start
cd ~/hass_config && docker compose down && docker compose up -d
```

## Update Procedure

Update script at `~/ubuntu-server/update_ha.sh`:

```bash
docker stop home-assistant
docker rm home-assistant
docker pull homeassistant/home-assistant
cd ~/hass_config && docker compose up -d
```

Before updating:
1. Backup the database: `cp home-assistant_v2.db home-assistant_v2.db.backup`
2. Check breaking changes in the HA release notes
3. Run the update script
4. Monitor logs for 2-3 minutes (DB migrations may run on major versions)

## Web Access

Exposed via Apache2 reverse proxy at two subdomains:
- `ubuntu.mansdahlstrom.se` (primary, external)
- `hass-local.mansdahlstrom.se`

Both proxy to `localhost:8123` with WebSocket support (RewriteEngine rules for `wss://`).

Apache vhost configs:
- `/etc/apache2/sites-available/ubuntu.mansdahlstrom.se.conf`
- `/etc/apache2/sites-available/hass-local.mansdahlstrom.se.conf`

## HTTP Config (src/http.yaml)

SSL cert paths and other sensitive values come from `secrets.yaml`:

```yaml
ssl_certificate: !secret ssl_certificate
ssl_key: !secret ssl_key
use_x_forwarded_for: true
trusted_proxies:
  - 127.0.0.1
  - ::1
```

The actual cert files are at `/etc/letsencrypt/live/mansdahlstrom.se/`.

## Core Settings (src/homeassistant.yaml)

- Location: Malmo, Sweden (SE)
- Timezone: Europe/Stockholm
- Currency: SEK
- External URL: `https://ubuntu.mansdahlstrom.se`
- Internal URL: `http://homeassistant.local:8123`
- Trusted networks: 192.168.1.0/24, fd00::/8
- Auth: homeassistant + trusted_networks providers

## Config Structure

Configuration is modular, split across `src/` directory:

```
configuration.yaml          # Main config, imports from src/
secrets.yaml                # Passwords, API tokens (DO NOT commit)
src/
  homeassistant.yaml        # Core settings (location, timezone)
  http.yaml                 # SSL and proxy config
  groups.yaml               # Room and device groups
  light_groups.yaml         # Light groupings by room
  persons.yaml              # Mans and Agnes (with device trackers)
  homekit.yaml              # HomeKit bridge config
  alexa.yaml                # Alexa smart home integration
  scripts.yaml              # EMPTY - unused
  customize.yaml            # EMPTY - unused
  devices.yaml              # EMPTY - unused
  weather.yaml              # EMPTY - unused
  dusty_map_extractor.yaml  # Xiaomi vacuum map camera (commented out in configuration.yaml)
  inputs/
    boolean.yaml            # is_cube_double_tapped toggle
    text.yaml               # alarm_time input (HH:MM pattern)
  automations/
    presence/
      coming_home.yaml      # Lights + switches on when someone arrives
      leaving_home.yaml     # Lights + switches off when everyone leaves
    time/
      night_time.yaml       # 21:00 weekdays, turn off ceiling lights
      waking_up.yaml        # Morning: bedside lamp transition + P1 radio
    flic/                   # Flic button automations (5 files) - BROKEN, server not connected
      agnes_bedside_flic.yaml
      agnes_bedside_flic_toggle.yaml
      mans_bedside_flic.yaml
      mans_bedside_flic_toggle.yaml
      toggle_makeup_mirror.yaml
    cube/
      double_tap.yaml       # Magic cube toggles coming/leaving home
    scenes/
      movie_time.yaml       # LIKELY ABANDONED - iOS action with actionName 'random'
    vacation/
      lights_on.yaml        # 17:00 - simulate presence (runs unconditionally every day!)
      lights_off.yaml       # 22:00 - lights off (runs unconditionally every day!)
    hass_start.yaml         # Set Caule Dark Aqua theme on startup
  scripts/
    download_ikea_bulb_fw.py  # IKEA firmware download utility
```

Also at root level:
- `ui_lovelace_minimalist/` - Minimalist UI dashboard (adaptive views for main + living room)
- `themes/` - 7 theme packs (caule, dark, minimalist variants, custom)
- `www/` - Web assets, custom cards, HACS community frontend cards
- `blueprints/` - 3 HA blueprints (motion_light, notify_leaving_zone, confirmable_notification)
- `phue-*.conf` - Philips Hue bridge config file (not documented in integrations)

## Integrations

| Integration | Details |
|---|---|
| deCONZ | Zigbee hub at 192.168.1.141:80 |
| Z-Wave JS | Gateway at ws://192.168.1.141:3000 |
| MQTT | Mosquitto broker at 192.168.1.36:1883 |
| Flic | Bluetooth buttons (binary_sensor platform) - **BROKEN: fails to connect at startup** |
| Xiaomi MiIO | Roborock S5 vacuum "Dusty" at 192.168.1.211 |
| Apple TV | Living room at 192.168.1.21 |
| Alexa | Amazon smart home (EU endpoint, exposes switches/lights/groups) |
| HomeKit | Bridge "Hass Bridge", advertise_ip 192.168.1.36 (exposes lights/sensors/switches) |
| Philips Hue | Bridge 00212EFFFF022E39 (config file exists, not documented elsewhere) |
| Mobile App | Mans iPhone, Agnes iPhone (see Persons note below) |
| Sonos | Auto-discovered speakers |
| Nord Pool | Electricity prices (area SE4, SEK) |
| Cast | Google Cast devices |
| HACS | Community store (custom components + frontend cards) |
| Time/Date | Sensor platform (time, date, various formats) |

## Custom Components (in custom_components/)

- **alexa_media** - Enhanced Alexa media player control
- **browser_mod** - Browser-based remote control
- **hacs** - Home Assistant Community Store
- **hacs-backup** - HACS backup/restore utility

Note: `ui_lovelace_minimalist` is at the repo root level, not in `custom_components/`.

## Persons

Defined in `src/persons.yaml`:
- **Mans** (id: `mans`) - device tracker: `device_tracker.mans_iphone_x_2`
- **Agnes** (id: `agge`) - device tracker: `device_tracker.agnes_iphone_2`
- Grouped as `group.all_persons` for presence automations

Note: Device tracker entity names may not reflect current phone models (entity names persist from initial registration).

## Groups (src/groups.yaml)

| Group | Entities |
|---|---|
| Living Room | living_room_lamp_1, basket_lamp, christmas_star, christmas_tree, marble_lamp, **echo (MISSING entity)** |
| Studio | studio_temp, studio_humidity, studio_air_pressure, studio_battery, raspotify, blob_light |
| Bedroom | living_room_lamp_2 (confusing name - physically in bedroom), agnes_mushroom_lamp, mans_mushroom_lamp |
| Kitchen | worktop_lights |
| All Persons | person.mans, person.agnes |
| My Switches | blob_light, basket_lamp, raspotify |

## Light Groups (src/light_groups.yaml)

| Group | Entities |
|---|---|
| Dimmable Lights | All room light groups combined |
| Living Room Lights | living_room_lamp_1, marble_lamp, silver_lamp, **marble_lamp (DUPLICATE - bug)** |
| Studio Lights | studio_lamp |
| Bedroom Lights | living_room_lamp_2, agnes_mushroom_lamp, mans_mushroom_lamp |
| Kitchen Lights | worktop_lights |

Note: `light.marble_lamp` appears twice in Living Room Lights - one entry should likely be removed or replaced. Bedside lamps (`mans_bedside_lamp`, `agnes_bedside_lamp`) are commented out as "Not plugged in right now".

## Automations Summary

| Automation | Trigger | Key Actions | Status |
|---|---|---|---|
| Coming Home | all_persons → home | Turn on dimmable_lights + my_switches | Working |
| Leaving Home | all_persons → not_home | Turn off dimmable_lights + my_switches | Working |
| Night Time | 21:00 Sun-Thu | Turn off ceiling lights (if someone home) | Working |
| Waking Up | alarm_time match, weekdays | Bedside lamp sunrise (30min), kitchen P1 radio | Partly broken (bedside lamps unplugged) |
| Flic buttons (5) | Flic click/double-click | Cycle brightness or toggle bedside/mirror lights | **Broken** (flic server disconnected + bedside lamps unplugged) |
| Cube Double Tap | deCONZ magic cube event | Toggle between coming_home/leaving_home | Working |
| Movie Time | iOS action (actionName: 'random') | Toggle makeup mirror switch | **Likely abandoned** (iOS actions removed in recent commit) |
| Vacation On | 17:00 daily (unconditional!) | Turn on lights to simulate presence | **Runs every day** - needs vacation mode toggle |
| Vacation Off | 22:00 daily (unconditional!) | Turn off vacation lights | **Runs every day** - needs vacation mode toggle |
| HA Start | HA startup | Set Caule Dark Aqua theme | Working |

## Plant Tracking System

Hand-rolled plant watering tracker. Manual marking (tap card → script stamps datetime), per-plant intervals, status states, daily reminder notifications. No moisture-sensor hardware.

### Architecture

```
                                 ┌───────────────────────────┐
                                 │  Daily 09:00 automation   │
                                 │ plants/water_reminder.yaml│
                                 └────────────┬──────────────┘
                                              │ if plants_needing_water > 0
                                              ▼
                                       notify.family
                                       (group: 2 phones)

User taps plant card → script.mark_<slug>_watered
                          │
                          ▼
              input_datetime.plant_<slug>_last_watered
                          │
                          ▼
              sensor.plant_<slug>   (template)
                  state ∈ ok / due / overdue / nyvattnad
                  attrs: room, species, interval_days, days_since,
                         relative_last_watered, light, water, care
                          │
                          ▼
                 sensor.plants_needing_water (summary count + due_now list)
                          │
                          ▼
                 Lovelace dashboard "Plants" (/house-plants/)
                 grouped by room via sensor.room_<slug>
```

### Files

| File | Purpose |
|---|---|
| `src/template/main.yaml` | Plant template sensors (state + attrs) + `plants_needing_water` summary |
| `src/template/rooms.yaml` | Room metadata sensors (display_name, windows_direction, sun_hours, brightness, notes) |
| `src/inputs/datetime.yaml` | One `input_datetime` per plant (last watered timestamp) |
| `src/scripts.yaml` | One `mark_<slug>_watered` script per plant |
| `src/automations/plants/water_reminder.yaml` | 09:00 daily — if any plant due/overdue, notify family |
| `src/dashboards/plants.yaml` | YAML-mode Lovelace dashboard, per-room vertical stacks |
| `.claude/skills/add-plant.md` | Workflow for adding a new plant (research, room, generate YAML) |

`template:` in `configuration.yaml` uses `!include_dir_merge_list src/template` — every `*.yaml` file in `src/template/` is concatenated, so we can split by concern.

### Dashboard

- **URL:** `/house-plants/` (HA requires URL slugs to contain a hyphen — plain `plants` fails validation)
- **Sidebar:** "Plants" (config: `lovelace.dashboards.house-plants.title`)
- **Theme:** `minimalist-desktop` (set per-dashboard so ULM color tokens resolve)
- **Main view** (`path: plants`): global summary card → one section per room. Each room is wrapped in a `custom:vertical-stack-in-card` (single rounded container with the room header on top and plants stacked beneath). Header row: `custom:button-card` using ULM's `card_title` template (room name + sun/light subtitle, pulled live from `sensor.room_<slug>` attributes) on the left, `mushroom-chips-card` "Vattna alla" chip on the right. Each plant is a `custom:button-card` using the **`custom_card_mans_plant`** ULM extension template — a single rectangular card showing state-colored circular icon, name, state line, ☀️ Ljus, 💧 Vattning, and a blue water-button on the right.
- **Per-plant subviews** (`subview: true`, `path: plant-<slug>`): tapping a plant card navigates here. Contents: hero plant card (reuses the same `custom_card_mans_plant` template) → `vertical-stack-in-card` containing `card_title` ("🌱 Skötselråd" + species) + markdown care notes → full-width `custom:button-card` "Markera som vattnad".

Tap targets:
- Plant card body → navigate to `/house-plants/plant-<slug>`
- Plant 💧 chip on card → `script.mark_<slug>_watered`
- Room "Vattna alla" → `script.mark_room_watered` (data: `room: <slug>`)
- Subview water button → `script.mark_<slug>_watered`

Plant card template lives at `ui_lovelace_minimalist/custom_cards/custom_card_mans_plant/custom_card_mans_plant.yaml` and is auto-synced into `custom_components/ui_lovelace_minimalist/__ui_minimalist__/ulm_templates/custom_cards/` when the ULM integration loads. The dashboard pulls all ULM templates in via `button_card_templates: !include_dir_merge_named "../../custom_components/ui_lovelace_minimalist/__ui_minimalist__/ulm_templates/"` at the top of `plants.yaml`.

Requires HACS frontend: `button-card`, `vertical-stack-in-card`, `mushroom`. Requires the **UI Lovelace Minimalist** integration (HA Settings → Devices & Services) — without it the `__ui_minimalist__` runtime templates dir doesn't exist and the include fails.

### Plant sensor states

| State | When | Card color | Card label |
|---|---|---|---|
| `nyvattnad` | < 5 minutes since last watered | light-blue | ✨ |
| `ok` | within interval | green | 🌿 Trivs |
| `due` | past interval, ≤ 1.5x | orange | 💧 Törstig |
| `overdue` | > 1.5x interval | red | 🥀 Vissnar |

`relative_last_watered` attribute formats as Swedish: "precis nu" / "X min sedan" / "X h sedan" / "igår" / "X dagar sedan".

### Rooms

Rooms are template sensors with attributes (`display_name`, `icon`, `location` indoor/outdoor, `windows_direction`, `sun_hours`, `brightness`, `temperature_range`, `humidity_hint`, `notes`). They are intentionally **separate from HA's built-in `area` concept** so we can encode plant-relevant facts (sun hours, draft, radiator nearby) without polluting device assignment.

Each plant sensor has a `room: <slug>` attribute referencing the room. The dashboard groups plants by this manually (one section per room in `plants.yaml`).

To add a room: append a `- name: "Room <Name>"` entry to `src/template/rooms.yaml`, then add a vertical-stack section to `src/dashboards/plants.yaml` referencing `sensor.room_<slug>`.

Existing rooms (slugs): `balcony`, `living_room`, `studio`, `kitchen`, `bedroom`. Only `balcony` is fully populated; indoor rooms have placeholder attributes (`windows_direction: unknown`) until the first plant lands there — at which point the add-plant skill prompts for the real values.

### Adding a plant

Use the `add-plant` Claude skill (in `.claude/skills/`). It walks through: name + species + room (asking light/sun for unknown rooms), researches care needs, and generates edits to all the right files. See the skill file for the canonical workflow.

Manual checklist if doing it without the skill:

1. Append entry to `src/inputs/datetime.yaml`
2. Append template sensor to `src/template/main.yaml` (copy a sibling like `Plant Dill`)
3. Append slug to **both** lists in `Plants Needing Water` summary (bottom of `main.yaml`)
4. Append `mark_<slug>_watered` script to `src/scripts.yaml`
5. In `src/dashboards/plants.yaml`: add a `horizontal-stack` plant row under the right `# === ROOM:` section AND append a `subview: true` view at the bottom of `views:` (path: `plant-<slug>`). See `.claude/skills/add-plant.md` for the templates.
6. Validate: `docker exec home-assistant python -m homeassistant --script check_config --config /config`
7. Reload via Developer Tools → YAML → Reload all (or `docker restart home-assistant` if input_datetime is new)

### Notifications

`notify.family` is a notify group defined in `configuration.yaml`:

```yaml
notify:
  - name: family
    platform: group
    services:
      - service: mobile_app_mans_iphone_14_pro
      - service: mobile_app_agnes_iphone
```

Reference: HA Companion app must be installed and logged in on each phone. The phone's entity name comes from its registration (so if Mans switches phones, the service slug stays as `mobile_app_mans_iphone_14_pro` unless re-registered). Update this list if device names drift.

### Gotchas

- **`plant_lavandell` slug is misspelled** — kept that way deliberately so state history survives. Display strings say "Lavendel" (correct), entity slug is `lavandell` (legacy typo). Same pattern applies if any other plant slug ends up misspelled — fix display, keep slug.
- **Slug ASCII rule:** `å/ä` → `a`, `ö` → `o`. So `Gräslök` → `graslok`, `Murgröna 1` → `murgrona_1`.
- **`trusted_networks` + `allow_bypass_login: true`** is configured in `src/homeassistant.yaml` (incl. `127.0.0.1`). This skips the login screen for LAN clients — used for headless screenshot tooling (Chrome DevTools MCP), but also has the side effect of skipping the login picker on phones on the home wifi. Auth provider list still includes `homeassistant`, so a user can click "Log out" to force the picker.
- **browser_mod is installed but unused** in the current dashboard. We tried it for popup wikis but switched to a subview (mobile-friendly, no JS deps). If you ever re-enable browser_mod: `custom_components/browser_mod/mod_view.py` line 59 was patched for HA 2025.2 (`hass.data["lovelace"]["resources"]` → `hass.data["lovelace"].resources`). The patch lives in the repo because it's not yet upstreamed.
- **Chrome DevTools MCP** is configured in `~/.claude.json` and used to take screenshots for design feedback. It needs Node ≥ 20.19 (we run via `nvm install --lts` on the server). Use the public URL `https://ubuntu.mansdahlstrom.se/house-plants/` not `https://localhost:8123/` — localhost trips a cert mismatch.

## Active Bugs

### Critical (causing log spam or broken functionality)

1. **Battery state error spam** - `sensor.agnes_iphone_battery_state` and `sensor.mans_iphone_x_battery_state_2` throw full ValueError stack traces every ~5 minutes when phones report "Not Charging" (string instead of numeric). This is the **overwhelming majority of the log file** (30+ errors per day). Fix: update HA to a version that handles this, or override device_class in `src/customize.yaml`.

2. **Flic server not connected** - `ERROR: Failed to connect to flic server` at every startup. All 5 flic automations and the toggle_makeup_mirror are non-functional. Either fix the flic server or remove the `binary_sensor: - platform: flic` from `configuration.yaml`.

3. **media_player.echo missing** - `Referenced entities media_player.echo are missing or not currently available`. This entity is in the Living Room group but no longer exists/available. The night_time automation logs a warning when trying to reference this group.

4. **Duplicate marble_lamp in light group** - `light.marble_lamp` appears twice in Living Room Lights (`src/light_groups.yaml` line 15 and 17). One should be removed.

5. **Vacation automations run unconditionally** - `lights_on.yaml` and `lights_off.yaml` trigger every day at 17:00/22:00 with no condition. They turn on/off specific lights every single day regardless of whether you're on vacation. Should be gated by an `input_boolean.vacation_mode`.

### Moderate

6. **Bedside lamps referenced but unplugged** - `light.mans_bedside_lamp` and `light.agnes_bedside_lamp` are commented out in light_groups.yaml as "Not plugged in" but still referenced in: vacation automations, waking_up automation, and all 4 flic bedside automations. These calls silently fail.

7. **Movie time automation abandoned** - Triggers on `ios.action_fired` with actionName `'random'` (placeholder name). Recent commit "Remove old IOS actions" suggests this is dead code. Also has inconsistency: toggles `switch.makeup_mirror` while the flic automation for same purpose uses `switch.switch_1`.

8. **P1IB MQTT sensors** - Two issues from P1 Interface Bridge: (a) `reactive_energy` device class doesn't exist in HA, (b) `kvar` unit should be `var` for reactive_power sensors.

9. **deCONZ via_device deprecation** - References non-existing device ('mac', 'b8:27:eb:cd:58:17'). Will stop working in HA 2025.12.0+. Upstream deCONZ integration bug.

10. **Sonos** - Subscription failures to 192.168.1.66, falls back to polling.

11. **DB not cleanly shut down** - Warning at startup: `could not validate that the sqlite3 database was shutdown cleanly`. Suggests container is being killed without graceful shutdown (use `docker stop` instead of `docker kill`).

12. **Xiaomi miio Python 3.13 warning** - `FutureWarning: functools.partial will be a method descriptor in future Python versions`. Will break in a future Python/HA update.

## Deprecated Config Patterns

These still work but should be modernized:

1. **`data_template:` (6 uses)** - Deprecated since HA 2021.x. Replace with `data:` (templates work in `data:` directly now).
   - `src/automations/time/waking_up.yaml` (lines 43, 50)
   - `src/automations/flic/mans_bedside_flic.yaml` (line 11)
   - `src/automations/flic/agnes_bedside_flic.yaml` (line 11)
   - `src/automations/flic/agnes_bedside_flic_toggle.yaml` (line 11)
   - `src/automations/flic/mans_bedside_flic_toggle.yaml` (line 11)

2. **`states.entity.attributes` syntax (2 uses)** - Discouraged; use `state_attr('entity', 'attr')` instead.
   - `src/automations/flic/agnes_bedside_flic.yaml` (line 15)
   - `src/automations/flic/mans_bedside_flic.yaml` (line 15)

3. **`service:` in automations** - Modern HA (2024.x+) renamed to `action:` key. `service:` still works but is legacy.

4. **`entity_id` under `data:`** - Modern HA prefers `target:` for entity targeting. All automations use the old pattern.

## Stale / Dead Config

1. **Empty files** - `src/scripts.yaml`, `src/customize.yaml`, `src/devices.yaml`, `src/weather.yaml` are all empty but still exist.

2. **`.gitignore` stale entries** - Whitelists `src/automations/ios_actions` and `src/automations/sun` directories that no longer exist.

3. **Commented-out camera** - `camera: !include src/dusty_map_extractor.yaml` is commented out in `configuration.yaml` but the file still exists.

4. **Empty `lovelace:` key** - `configuration.yaml` ends with an empty `lovelace:` key. `ui-lovelace.yaml` was deleted. Dashboard is managed via UI/minimalist integration.

5. **`switch.switch_1` generic name** - In `toggle_makeup_mirror.yaml`, a generic Z-Wave/Zigbee entity name. Unclear what physical device this is.

6. **Christmas lights always in group** - `switch.christmas_star`, `switch.christmas_tree` are permanently in the Living Room group. The coming_home automation turns them on year-round.

7. **`light.living_room_lamp_2` naming** - This light is physically in the bedroom (part of Bedroom group) but named "living room lamp 2". Confusing.

## Suggested Improvements

1. **Update HA** - 2025.2.4 is ~1 year old. Updating will fix the battery_state error spam and many other issues.
2. **Add vacation mode toggle** - Create `input_boolean.vacation_mode` and add it as a condition to vacation automations so they don't run every day.
3. **Fix or remove Flic** - Either reconnect the flic server or remove `binary_sensor: - platform: flic` and the 5 flic automation files.
4. **Remove movie_time automation** - iOS actions were already removed; this automation is dead.
5. **Fix duplicate marble_lamp** - Remove the duplicate entry in `src/light_groups.yaml`.
6. **Remove media_player.echo from group** - Or fix the entity if the Echo is still in use.
7. **Clean up empty files** - Delete `scripts.yaml`, `customize.yaml`, `devices.yaml`, `weather.yaml` and remove references.
8. **Fix docker-compose.yaml** - Remove leading whitespace from `services:` key.
9. **Modernize automation syntax** - Replace `data_template` → `data`, `states.x.attributes` → `state_attr()`, `entity_id` under data → `target`.
10. ~~**Rewrite Plants dashboard in UI Lovelace Minimalist style**~~ — **Implemented (2026-05-18).** Built `custom_card_mans_plant` ULM extension template at `ui_lovelace_minimalist/custom_cards/custom_card_mans_plant/`. Plants dashboard now uses ULM's `card_title` for room headers, `custom:vertical-stack-in-card` (HACS) for room containers, and the custom plant template for plant cards. Subviews reuse the same plant template plus a wrapped Skötselråd container. Dashboard theme is `minimalist-desktop` so ULM color tokens resolve. Did *not* install `custom:layout-card` (turned out unnecessary — ULM extension via custom_cards/ is the official pattern). ULM integration must be enabled in HA UI for `__ui_minimalist__/ulm_templates/` to exist (see Dashboard section above).
11. ~~**Plant UI v2**~~ — **Implemented (2026-05-18).** Tap card → per-plant subview at `/house-plants/plant-<slug>` (chose subview navigation over browser_mod popup for mobile safety — see `.claude/specs/plant-ui-v2.md`). Right-side water chip + per-room "Vattna alla" chip in place. Generic `script.mark_room_watered` takes a room slug. Future ULM port (#10) can replicate the subview pattern.

## Database

- SQLite at `/home/mans/hass_config/home-assistant_v2.db` (~339 MB)
- Grows over time with history data
- Backup before any update: `cp home-assistant_v2.db home-assistant_v2.db.$(date +%s)`

## Troubleshooting

**HA won't start:**
1. Check logs: `docker logs home-assistant --tail 50`
2. Verify config: Settings > System > Check Configuration (from UI)
3. Check port isn't taken: `ss -tlnp | grep 8123`

**Can't access via browser:**
1. Check container is running: `docker ps --filter name=home-assistant`
2. Test local: `curl -k https://localhost:8123/`
3. Check Apache: `sudo apachectl configtest && sudo systemctl reload apache2`
4. Check SSL certs: `ls -l /etc/letsencrypt/live/mansdahlstrom.se/`

**Integration offline:**
- deCONZ: Verify 192.168.1.141:80 reachable
- MQTT: Verify 192.168.1.36:1883 reachable
- Z-Wave: Verify ws://192.168.1.141:3000 reachable

## Secrets

Sensitive values are in `secrets.yaml` (not committed to git). Contains:
- Latitude, longitude, elevation (location)
- SSL certificate and key paths
- Xiaomi vacuum host, token, username, password
- Other integration credentials
