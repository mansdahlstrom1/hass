---
name: add-plant
description: Add a new plant to the Home Assistant plant tracking system. Researches care needs, asks about size and room, generates all necessary YAML edits, and updates the dashboard.
---

# Add Plant Skill

Use this skill when the user wants to add a plant to the HA plant tracking system. The skill handles: research, room selection, sensor creation, dashboard update, and reload.

## What the user sees

Per-room sections on the **Plants** dashboard at `/house-plants/`. Each room has a header, a "Vattna alla" chip (calls `script.mark_room_watered` with the room slug), and one plant card per plant. Each card is the ULM-style `custom_card_mans_plant` button-card template (colored circular icon left, name + state + ☀️ ljus + 💧 vattning in the middle, water button right). Tap the card body → plant's subview. Tap the 💧 button → marks watered. The subview at `/house-plants/plant-<slug>` shows: name+species header, status card, care table, care notes, and a "Markera som vattnad" button.

Per-plant backend: `sensor.plant_<slug>` (state `ok`/`due`/`overdue`/`nyvattnad`), `input_datetime.plant_<slug>_last_watered`, `script.mark_<slug>_watered`. A daily 09:00 automation notifies `notify.family` if any plant is `due` or `overdue`.

## Workflow

### 1. Gather basic info (ask the user)

Ask via `AskUserQuestion` (one question at a time is fine — keep it conversational):

- **Plant name** (Swedish display name, used on the card)
- **Species** (Latin or English — for the wiki; AI-research it if user is unsure)
- **Room** — show the list from `src/template/rooms.yaml`:
  - `balcony` (Balkong) — west, ~6h sun, high light, outdoor
  - `living_room` (Vardagsrum) — *check rooms.yaml for current attrs*
  - `studio` (Studio)
  - `kitchen` (Kök)
  - `bedroom` (Sovrum)
  - Or new room (see step 1a)
- **Pot size / plant size** — helps tune watering interval

### 1a. If the user picks a new room (or unknown attrs on existing indoor room)

Ask:
- **Window direction** (N/E/S/W/no window)
- **Approx hours of direct sun per day** in summer
- **Indoor or outdoor**
- **Brightness level** (low / medium / high / direct sun)
- **Anything special** (drafts, radiator nearby, humid, dark corner, etc.)

Then either:
- Add the new room to `src/template/rooms.yaml`, **or**
- Update the existing room's `unknown` attrs in `src/template/rooms.yaml`

### 2. Research plant care

Do not invent. Use `WebSearch` / `WebFetch` for plant-specific Swedish care info, or rely on well-known facts. Determine:

- **Watering interval (days)** — depends on plant + room conditions. West-facing balcony with afternoon sun typically dries faster than indoor north-facing.
- **Light requirement** (Swedish text, e.g. "Mycket sol, 6+ timmar")
- **Water need** (Swedish text, e.g. "Lite, låt jorden torka mellan vattningar")
- **Care notes** (Swedish multiline — overwintering, fertilizing, pruning, soil, hardiness)

For Malmö (zone 7, climate cool), always think about: Swedish winter hardiness if outdoor; whether potted plants need extra winter protection; if indoor, dry winter air from radiators.

### 3. Generate the edits

The plant gets a **slug** — lowercase snake_case, ASCII only (`å` → `a`, `ö` → `o`, `ä` → `a`). Example: `Gräslök` → `graslok`, `Murgröna 1` → `murgrona_1`.

**Note the lavendel quirk:** `light.plant_lavandell` was misspelled at creation. Slug is preserved as `lavandell` to keep state history. Only display strings say "Lavendel". If you make a typo and the user catches it, do the same: fix display, keep slug.

#### 3a. `src/inputs/datetime.yaml`

Append:

```yaml
plant_<slug>_last_watered:
  name: <DisplayName> last watered
  has_date: true
  has_time: true
```

#### 3b. `src/template/main.yaml` — plant sensor

Append a new entry under the existing plant `- sensor:` block (the third top-level `- sensor:` entry, after the wifi binary_sensors). All four Jinja templates (`state`, `days_since`, `last_watered`, `relative_last_watered`) come from macros in `/config/custom_templates/plants.jinja` — you only specify the metadata + care text:

```yaml
- name: "Plant <DisplayName>"
  unique_id: plant_<slug>
  icon: <mdi:sprout / mdi:flower / mdi:leaf>
  state: "{% from 'plants.jinja' import plant_state %}{{ plant_state('<slug>', <interval>) }}"
  attributes:
    display_name: "<DisplayName>"
    room: <roomslug>
    species: "<Species>"
    interval_days: <interval>
    days_since: "{% from 'plants.jinja' import days_since %}{{ days_since('<slug>') }}"
    last_watered: "{{ states('input_datetime.plant_<slug>_last_watered') }}"
    relative_last_watered: "{% from 'plants.jinja' import relative_last_watered %}{{ relative_last_watered('<slug>') }}"
    light: "<Swedish light requirement>"
    water: "<Swedish water need>"
    care: |
      <Swedish multi-line care notes>
```

The state macro returns `nyvattnad`/`ok`/`due`/`overdue` (5-min nyvattnad window). The macros live at `custom_templates/plants.jinja` — edit there if you need to tweak the logic for all plants at once.

#### 3c. `src/template/main.yaml` — append slug to plants_needing_water

In the `Plants Needing Water` sensor at the bottom of `main.yaml`:

1. Add `'sensor.plant_<slug>'` to the `entities` list.
2. Same for the `due_now` attribute's `entities` list.

#### 3c.1. `configuration.yaml` — append slug to plants_watering_stats

In the `rest:` sensor block (`plants_watering_stats`), append the slug to the
`json_attributes:` list. Without this, the per-plant stats stay invisible to
the dashboard. Also append the slug to the `SLUGS` array in
`services/plants-history/src/seed.js` so backfill picks it up on next start.

#### 3d. `src/scripts.yaml`

Append:

```yaml
mark_<slug>_watered:
  alias: Markera <DisplayName> som vattnad
  icon: mdi:watering-can
  sequence:
    - action: input_datetime.set_datetime
      target:
        entity_id: input_datetime.plant_<slug>_last_watered
      data:
        datetime: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}"
    - action: rest_command.log_watering
      data:
        slug: <slug>
        source: card_tap
      continue_on_error: true
```

The `rest_command.log_watering` call writes to the plants-history sidecar
(`services/plants-history/`). `continue_on_error: true` makes it
fire-and-forget — a sidecar outage never blocks the dashboard.

#### 3e. `src/dashboards/plants.yaml`

The dashboard is two parts in one file (see the header comment in the file for the full structure):
1. **Main view** (`path: plants`, `type: sections`) — one section per room. Each room is a `custom:vertical-stack-in-card` container: header row (room title + "Vattna alla" chip) followed by one `custom:button-card` per plant using the `custom_card_mans_plant` ULM template.
2. **Per-plant subviews** (`subview: true`, `path: plant-<slug>`) — one subview per plant, appended at the bottom of `views:`.

The plant card template lives at `ui_lovelace_minimalist/custom_cards/custom_card_mans_plant/custom_card_mans_plant.yaml` and is auto-synced by the ULM integration. The dashboard pulls it in via the `button_card_templates:` include at the top of `plants.yaml`.

##### Main view — add the plant row

Find the room's `# === ROOM: <RoomName> ===` section. If it doesn't exist (no plant in that room yet), create the whole `vertical-stack-in-card` container:

```yaml
# === ROOM: <RoomName> ===
- type: grid
  cards:
    - type: custom:vertical-stack-in-card
      cards:
        - type: horizontal-stack
          cards:
            - type: custom:button-card
              template: card_title
              name: "[[[ return '<emoji> ' + states['sensor.room_<roomslug>'].attributes.display_name ]]]"
              label: >
                [[[
                  var a = states['sensor.room_<roomslug>'].attributes;
                  return a.windows_direction + ' · ' + a.sun_hours + 'h sol · ' + a.brightness + ' ljus';
                ]]]
              styles:
                card:
                  - margin-left: "0px"
            - type: custom:mushroom-chips-card
              alignment: end
              chips:
                - type: template
                  icon: mdi:watering-can-outline
                  content: Vattna alla
                  icon_color: blue
                  tap_action:
                    action: call-service
                    service: script.mark_room_watered
                    data:
                      room: <roomslug>

        # plant cards go here (each one is a sibling inside vertical-stack-in-card)
```

Then append a plant card as a sibling inside `cards:` (under the horizontal-stack header):

```yaml
- type: custom:button-card
  template: custom_card_mans_plant
  variables:
    ulm_plant_slug: <slug>
    ulm_plant_icon: <mdi:sprout / mdi:flower / mdi:leaf>
```

The template pulls `display_name`, `relative_last_watered`, `light`, `water`, and `interval_days` straight off `sensor.plant_<slug>` — no need to repeat them in the dashboard YAML.

##### Per-plant subview — append at the bottom of `views:`

All four cards in a subview are ULM button-card templates. Just swap slug + icon:

```yaml
- title: <DisplayName>
  path: plant-<slug>
  icon: <same icon as main card>
  subview: true
  type: sections
  max_columns: 1
  sections:
    - type: grid
      cards:
        - type: custom:button-card
          template: custom_card_mans_plant
          variables:
            ulm_plant_slug: <slug>
            ulm_plant_icon: <same icon>
        - type: custom:button-card
          template: custom_card_mans_plant_care
          variables:
            ulm_plant_slug: <slug>
        - type: custom:button-card
          template: custom_card_mans_plant_history
          variables:
            ulm_plant_slug: <slug>
        - type: custom:button-card
          template: custom_card_mans_plant_water_button
          variables:
            ulm_plant_slug: <slug>
```

Template sources (auto-synced by the ULM integration on HA load):

| Template | Source file |
|---|---|
| `custom_card_mans_plant` | `ui_lovelace_minimalist/custom_cards/custom_card_mans_plant/custom_card_mans_plant.yaml` |
| `custom_card_mans_plant_care` | `…/custom_card_mans_plant_care/custom_card_mans_plant_care.yaml` |
| `custom_card_mans_plant_history` | `…/custom_card_mans_plant_history/custom_card_mans_plant_history.yaml` |
| `custom_card_mans_plant_water_button` | `…/custom_card_mans_plant_water_button/custom_card_mans_plant_water_button.yaml` |

Each template reads `sensor.plant_<slug>` (display_name, species, care, light, water, interval_days, last_watered, relative_last_watered) and `sensor.plants_watering_stats.<slug>` (avg_interval_days, count, recent[]) — nothing else needs to be passed in.

### 4. Validate config

```bash
docker exec home-assistant python -m homeassistant --script check_config --config /config 2>&1 | tail -20
```

Exit 0 = OK. Fix anything that fails.

### 5. Restart HA (required)

Adding a plant touches **four** reload-domains: `input_datetime`, `script`,
`template`, and the YAML dashboard. HA's "Reload all" button does **not**
cover input_datetime helpers in the version we run, and partial reloads leave
the system in a broken state where the dashboard renders the template card
with `ulm_plant_slug` as the literal name (lowercase, no stats, dead water
button) because `sensor.plant_<slug>` doesn't exist yet.

So always run a full restart, don't offer "Reload all" as an alternative:

```bash
docker restart home-assistant
```

Then wait for HA to come back (`curl -ks https://localhost:8123/ | grep -q "Home Assistant"`)
and refresh the browser at `https://ubuntu.mansdahlstrom.se/house-plants/`.

### 6. Verify the plant is live (optional but recommended)

The plant container env exposes a long-lived token at `HA_TOKEN`:

```bash
HA_TOKEN=$(docker inspect plants-history --format '{{range .Config.Env}}{{println .}}{{end}}' | grep HA_TOKEN | cut -d= -f2)
curl -ks -H "Authorization: Bearer $HA_TOKEN" https://localhost:8123/api/states/sensor.plant_<slug> | head -c 400
```

You should see `"display_name":"<DisplayName>"` in the response. If you see
`404` or the entity is missing, the restart didn't pick up your YAML — check
`docker logs home-assistant --tail 50` for a config error.

## Reference: existing rooms (read fresh from rooms.yaml)

The room slugs map to `sensor.room_<slug>`. Always re-read `src/template/rooms.yaml` to get current attributes — they evolve as we add plants and learn more about each room.

## Reference: existing plant example (Dill, in main.yaml)

Look at `sensor.plant_dill` in `src/template/main.yaml` for the canonical pattern. Copy that whole block, swap names/slugs/values.

## Common pitfalls

- **Slug case sensitivity**: input_datetime, sensor, script, dashboard refs all need to match. Always lowercase snake_case.
- **Hyphen in dashboard URL**: HA requires URLs to contain `-`. We use `house-plants`. Don't rename to `plants` alone — it fails validation.
- **Always restart HA, don't try to reload.** A new plant touches input_datetime + script + template + dashboard. HA's "Reload all" skips input_datetimes on our version, leaving `sensor.plant_<slug>` undefined — the ULM card then falls back to printing `variables.ulm_plant_slug` (lowercase, no stats, dead water button). Symptoms look like the dashboard YAML is broken; the actual cause is a half-loaded HA.
- **Notifications go to `notify.family`** (group: mans iphone 14 pro + agnes iphone). Don't reference individual mobile_app entities directly.
- **Daily watering reminder** is at `src/automations/plants/water_reminder.yaml`, fires 09:00. It already loops all plants via the `plants_needing_water` summary sensor, so adding a plant only requires the `entities:` list update in 3c — no automation edit needed.
