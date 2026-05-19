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

Append a new entry under the existing plant `- sensor:` block (the third top-level `- sensor:` entry, after the wifi binary_sensors). Copy the pattern from an existing plant. Required attributes:

- `display_name`
- `room` (the slug, e.g. `balcony`)
- `species`
- `interval_days` (integer — from research)
- `days_since` (template — copy pattern)
- `last_watered` (template — copy pattern)
- `relative_last_watered` (template — copy pattern, gives "precis nu" / "X h sedan" / "igår" / "X dagar sedan")
- `light` (Swedish)
- `water` (Swedish)
- `care` (Swedish, multiline `|` block)

State logic (copy from existing plant — handles `nyvattnad`/`ok`/`due`/`overdue` with 5-min nyvattnad window).

#### 3c. `src/template/main.yaml` — append slug to plants_needing_water

In the `Plants Needing Water` sensor at the bottom of `main.yaml`:

1. Add `'sensor.plant_<slug>'` to the `entities` list.
2. Same for the `due_now` attribute's `entities` list.

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
```

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
        # 1. Hero plant card (reuses the same template as the main view)
        - type: custom:button-card
          template: custom_card_mans_plant
          variables:
            ulm_plant_slug: <slug>
            ulm_plant_icon: <same icon>

        # 2. Skötselråd container (title + species + care notes)
        - type: custom:vertical-stack-in-card
          cards:
            - type: custom:button-card
              template: card_title
              name: 🌱 Skötselråd
              label: "[[[ return states['sensor.plant_<slug>'].attributes.species ]]]"
              styles:
                card:
                  - margin-left: "0px"
            - type: markdown
              content: |
                {{ state_attr('sensor.plant_<slug>', 'care') }}

        # 3. Full-width "Markera som vattnad" button
        - type: custom:button-card
          name: Markera som vattnad
          icon: mdi:watering-can
          show_icon: true
          show_name: true
          tap_action:
            action: call-service
            service: script.mark_<slug>_watered
            haptic: light
          styles:
            card:
              - border-radius: "12px"
              - padding: "14px"
            icon:
              - color: "rgba(var(--color-blue, 61,90,254), 1)"
              - width: "22px"
              - height: "22px"
            img_cell:
              - background-color: "rgba(var(--color-blue, 61,90,254), 0.2)"
              - border-radius: "50%"
              - width: "42px"
              - height: "42px"
              - place-self: "center"
            name:
              - justify-self: "start"
              - font-weight: "bold"
              - font-size: "14px"
              - margin-left: "14px"
            grid:
              - grid-template-areas: "'i n'"
              - grid-template-columns: "min-content auto"
              - column-gap: "0px"
```

### 4. Validate config

```bash
docker exec home-assistant python -m homeassistant --script check_config --config /config 2>&1 | tail -20
```

Exit 0 = OK. Fix anything that fails.

### 5. Reload

Tell the user to either:
- Go to **Developer Tools → YAML → Reload all** (faster), or
- Restart HA container if reload doesn't pick up the new dashboard (`docker restart home-assistant`)

Then refresh the browser at `https://ubuntu.mansdahlstrom.se/house-plants/`.

## Reference: existing rooms (read fresh from rooms.yaml)

The room slugs map to `sensor.room_<slug>`. Always re-read `src/template/rooms.yaml` to get current attributes — they evolve as we add plants and learn more about each room.

## Reference: existing plant example (Dill, in main.yaml)

Look at `sensor.plant_dill` in `src/template/main.yaml` for the canonical pattern. Copy that whole block, swap names/slugs/values.

## Common pitfalls

- **Slug case sensitivity**: input_datetime, sensor, script, dashboard refs all need to match. Always lowercase snake_case.
- **Hyphen in dashboard URL**: HA requires URLs to contain `-`. We use `house-plants`. Don't rename to `plants` alone — it fails validation.
- **Newly added input_datetime needs HA reload** (Developer Tools → Reload Input datetimes, or full restart). Template sensor reload alone is not enough if the input_datetime is new.
- **Notifications go to `notify.family`** (group: mans iphone 14 pro + agnes iphone). Don't reference individual mobile_app entities directly.
- **Daily watering reminder** is at `src/automations/plants/water_reminder.yaml`, fires 09:00. It already loops all plants via the `plants_needing_water` summary sensor, so adding a plant only requires the `entities:` list update in 3c — no automation edit needed.
