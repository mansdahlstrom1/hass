# Plant UI v2 — Spec

**Status:** Drafted, ready to implement. Open questions noted below — first session to pick this up should resolve them before writing code.

**Related:** `.claude/skills/add-plant.md`, `src/dashboards/plants.yaml`, CLAUDE.md "Plant Tracking System" + Suggested Improvements #10 (full ULM migration).

## Prerequisites (already done by user)

- ✅ **UI Lovelace Minimalist (ULM)** is installed at `ui_lovelace_minimalist/` (HACS). Not yet wired into `configuration.yaml`'s `lovelace.dashboards`. ULM dependencies (button-card, card-mod, my-cards) are present in `www/community/`.
- ✅ **browser_mod** custom_component is installed at `custom_components/browser_mod/` (with the HA 2025.2 line-59 patch).
- ✅ **HACS frontend cards** needed by this spec are all installed: `button-card`, `lovelace-card-mod`, `lovelace-mushroom`, `vertical-stack-in-card`.
- ❌ Nothing else needs HACS UI installs — first session can go straight to code.

If at any point a spike concludes "we need card X from HACS", **stop and ask the user to install via HACS UI** — Claude cannot install HACS components programmatically. Then resume.

## Why

Current v1 plant card has one action: **tap = mark watered**. Care/wiki info lives on a separate `/house-plants/info` subview, reachable via a top chip. User feedback: this disconnects info from the plant. Info subview "feels weird" — context-switching to a list breaks the "I'm looking at Dill" flow.

User-stated goals:

1. **Tap plant card → popup with care info** (species, light, water, care notes, last watered, status).
2. **Small button on the right of each card → mark this plant watered** (current tap action moves here).
3. **Per-room "mark all watered"** button — one tap waters every plant in a room.

## Non-negotiable constraints

- Works in **HA companion app on iOS** (mobile). This kills several otherwise-attractive options. See "Popup mechanism" below.
- Works in **browser** (desktop + mobile Safari).
- No regression on existing tap-to-water — it's used multiple times daily; moving to a small chip must still be reliably tappable on phone.
- Browser_mod popups: per prior session work (CLAUDE.md mentions a patch for HA 2025.2 mod_view.py line 59), they were verified broken in the iOS companion app. **Do not assume this is fixed — re-test if you want to use them.**

## Information architecture

Where info can render when user taps the card:

| Option | Mobile-safe | Pretty | Custom content | Notes |
|---|---|---|---|---|
| A) Native HA more-info modal, styled via `card-mod` theme | ✅ | ⚠ (default ugly, needs theme work) | ⚠ (attributes only, no markdown rendering) | `tap_action: { action: more-info }`. Lowest risk for mobile. Limited content control. |
| B) `browser_mod` popup-card (mushroom-style) | ⚠ unverified | ✅ | ✅ | Patched for HA 2025.2 but previously broken on iOS app. **Spike on the iOS Companion app before committing.** |
| C) Per-plant subview navigation (`/house-plants/plant-<slug>`) | ✅ | ✅ | ✅ | HA-native navigation. Mobile-perfect. Feels like a page change, not a popup — UX trade-off. Adds N subview entries to `plants.yaml` (one per plant) — the add-plant skill must generate these. |
| D) **ULM popup pattern** (`browser_mod` + ULM templates) | ⚠ unverified | ✅ (ULM look) | ✅ | Aligns with the end-state in Suggested Improvements #10. Same `browser_mod` mobile risk as B. If this works, we get the desired final aesthetic for free. |
| E) Conditional inline expand (in-view `input_boolean` per plant + conditional card) | ✅ | ⚠ | ✅ | State management is messy — N booleans, all need closing logic. Not recommended. |

**Decision order:**

1. **First spike: B and D on iOS Companion app.** Both are `browser_mod`-based; if either works, both probably work. Test on iPhone HA Companion app, not just Safari. If it works → choose **D** (ULM popup, gets us closer to #10 end-state). If broken → drop both, continue to step 2.
2. **Fallback: C** (subview navigation). Guaranteed mobile-safe. Costs more YAML (one subview per plant).
3. **Last resort: A** (styled native modal). Use only if both B/D and C are unacceptable. Limited content (no markdown care notes).

Do **not** invest in styling/content work on option A or C without first running the browser_mod spike — finding out at Phase 4 that B/D was available is wasted work.

## Card layout

User wants a two-zone card: main area (tap = info) + small right-side button (tap = water).

### Proposed: horizontal stack of two mushroom cards

```
┌────────────────────────────────────┐ ┌──────┐
│ 🌿 Dill                             │ │  💧  │
│    Trivs · 2h sedan                │ │      │
└────────────────────────────────────┘ └──────┘
   tap → more-info (popup/subview)      tap → mark watered
```

```yaml
- type: horizontal-stack
  cards:
    - type: custom:mushroom-template-card
      primary: Dill
      secondary: "{{ status text from sensor.plant_dill }}"
      icon: mdi:sprout
      icon_color: "{{ state-based color }}"
      fill_container: true
      tap_action: { action: more-info, entity: sensor.plant_dill }
      # OR: action: navigate, navigation_path: /house-plants/plant-dill
    - type: custom:mushroom-template-card
      icon: mdi:watering-can
      icon_color: blue
      fill_container: false
      tap_action:
        action: call-service
        service: script.mark_dill_watered
```

The water button card has no primary/secondary text — just an icon, small column. Use `card_mod` to constrain its width if needed (~64px). Verify on mobile that the small tap target is reliably hittable; if not, make it taller via custom layout.

### Alternative: single `custom:button-card` with internal layout

`button-card` (already installed) supports `styles` and custom HTML/CSS for an icon, name, and a secondary action zone via `extra_styles` and event handlers on internal divs. More flexible (one card, fewer items in YAML), but harder to maintain and harder to template across 9+ plants. **Not recommended** unless we end up with significantly more visual customization needs.

## Room-level action

### "Vattna hela rummet" button

One button per room section, placed at the top of the room (next to the markdown room header, or as a `chip` row above plant cards).

```
🌿 Balkong                           [💧 Vattna alla]
west · 6h sol · high ljus
─────────────────────────────────────────
🌿 Dill          ...           [💧]
🌿 Persilja      ...           [💧]
...
```

### Backend: one dynamic script, not 5

Avoid creating `mark_room_balcony_watered`, `mark_room_kitchen_watered`, etc. Instead, one script that takes a `room` parameter and finds plants by `room` attribute:

```yaml
mark_room_watered:
  alias: Markera hela rummets växter som vattnade
  icon: mdi:watering-can-outline
  fields:
    room:
      name: Room slug
      description: "balcony / living_room / studio / kitchen / bedroom"
      selector:
        text:
  sequence:
    - variables:
        timestamp: "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}"
        plants: >-
          {{ states.sensor
             | selectattr('attributes.room', 'eq', room)
             | selectattr('object_id', 'match', '^plant_')
             | map(attribute='object_id')
             | list }}
    - repeat:
        for_each: "{{ plants }}"
        sequence:
          - action: input_datetime.set_datetime
            target:
              entity_id: "input_datetime.{{ repeat.item }}_last_watered"
            data:
              datetime: "{{ timestamp }}"
```

The dashboard chip calls this with `data: { room: balcony }`. Validate via Developer Tools → Services first — confirm the `selectattr` + `selectattr` chain returns the expected list (the `object_id` filter excludes `sensor.plants_needing_water` and `sensor.room_*`).

## Browser Mod — version status

Critical context for the popup spike (options B and D depend on this).

- **Currently installed:** `custom_components/browser_mod/` reports `version: 2.3.3` in its `manifest.json`. So we are already on v2 (the actively-maintained track at https://github.com/thomasloven/hass-browser_mod), not the legacy v1.
- **Local patch:** `mod_view.py` line 59 was hand-patched for HA 2025.2 (`hass.data["lovelace"]["resources"]` → `hass.data["lovelace"].resources`). This was applied on top of v2.3.3 because HA 2025.2's internal API drift broke that line. A newer browser_mod release may have upstream-fixed this — **first action for the spike is to check https://github.com/thomasloven/hass-browser_mod/releases for anything newer than 2.3.3 and update via HACS UI**. If a newer release ships the fix, drop the local patch.
- **Mobile compat history:** the previous session noted "popups don't work on mobile" — that was tested against this v2.3.3 install. **It is not a v1 vs v2 issue.** It could be: an iOS Companion app version gap that has since been fixed; a config issue on our end; the line-59 patch interfering with frontend resource loading; or a genuine browser_mod limitation on iOS. The spike must distinguish these.
- **v2 install correctness:** v2 requires *both* the custom_component AND a "Browser Mod" integration entry in Settings → Devices & Services. Verify the integration is set up (not just the component installed):
  - Settings → Devices & Services → search "Browser Mod". If not listed, click "Add Integration" → Browser Mod, then restart HA.
  - Without the integration entry, popups silently fail to fire — *this alone could explain the mobile failure if the integration was never added or got removed*.

**Spike order for the popup question:**

1. Check browser_mod integration is configured in Settings → Devices & Services. If missing, add it, restart, retest popups on iOS *before doing anything else*. This is the highest-likelihood single fix.
2. Check for a browser_mod release newer than v2.3.3. If yes, update via HACS, retest.
3. Only if (1) and (2) leave popups broken on iOS, fall back to option C (subview navigation).

## Open questions to resolve before implementation

1. **Popup mechanism (A vs C vs D):** Spike option D (`custom:more-info-card` or similar). If it renders custom markdown content cleanly on iOS app, choose D. If broken or fragile, fall back to C (per-plant subviews).
2. **Water-button tap target on mobile:** ~64px wide chip is fine on desktop. On phone, ≤44pt is the Apple HIG floor. Verify on iPhone before committing. If too small, give the water button a min-height of 56px or wrap each plant row in a `grid` with explicit row height.
3. **Per-room button placement:** chip-row above plant cards vs. button to the right of room title vs. card-mod-styled icon-button. ASCII mockup above puts it right of the title, but try chip-row first — it's the most discoverable on mobile (full-width tap target).
4. **Status indication when info popup is open:** if popup shows last-watered time and current status, the user might tap "water" *from inside the popup* rather than from the card. Decide if the popup should have its own water button (yes, probably — convenience win).
5. **Wiki copy in popup:** current info subview uses a markdown table for light/water + free-text care. Same structure in popup, or restructure for popup form factor (taller, narrower)?

## Implementation phases

**Suggested session boundaries** (don't try to do this in one shot):

- **Session A** = Phase 1 only. Isolated backend script + Jinja verification. Low risk, fast win, no UI change. Good shakedown of the spec.
- **Session B** = Spike + Phase 2 + Phase 3. Browser_mod iOS spike (option B/D), then card layout swap and per-room water chip. Outputs a working v2 UX with placeholder more-info on the main tap.
- **Session C** = Phase 4 only. Build the chosen popup mechanism with full content (status row + care table + markdown notes + water-from-popup button). Largest unknown, deserves its own session and context budget.
- **Session D** = Phase 5. Skill + CLAUDE.md updates. Mechanical cleanup after the design is locked.

Don't sequence Sessions B and C together — Session B output is testable independently (cards work even if popup is just `more-info` default). Wait for the user to live with Session B for a day or two before tuning the popup in Session C.


### Phase 1 — Backend (no UI change yet)

**Step 1.0 — Verify the Jinja before writing any YAML.** Paste this into Developer Tools → Template editor:

```jinja2
{{ states.sensor
   | selectattr('attributes.room', 'eq', 'balcony')
   | selectattr('object_id', 'match', '^plant_')
   | map(attribute='object_id')
   | list }}
```

Expected output: a list of 9 object_ids (`plant_dill`, `plant_persilja`, …, `plant_murgrona_2`). If output is empty or contains `plants_needing_water` / `room_*`, the filter chain is wrong — debug before continuing. The `selectattr('attributes.room', 'eq', ...)` syntax relies on HA's AttributeDict semantics and should work, but template editor is the only way to be sure across HA versions.

**Step 1.1 — Add the script** (`src/scripts.yaml`, see YAML above).

**Step 1.2 — Verify end-to-end.** Reload scripts (Developer Tools → YAML → Scripts). In Developer Tools → Services, call `script.mark_room_watered` with `room: balcony`. Confirm all 9 `input_datetime.plant_*_last_watered` entries updated to the current timestamp. No dashboard change yet — this isolates the script from frontend risk.

### Phase 2 — Card layout swap

- Replace each plant card with `horizontal-stack` containing main mushroom-template-card + water-chip mushroom-template-card.
- Main card's `tap_action` set to chosen popup mechanism from open question 1.
- Water chip calls existing `script.mark_<slug>_watered`.
- Roll out to balcony first, verify on iOS app, then if good — apply to remaining rooms (currently only balcony has plants, so phase 2 only touches the balcony section).

### Phase 3 — Room-water button

- Add chip-row or button above each room's plant list in `plants.yaml`.
- Wire to `script.mark_room_watered` with hardcoded `room: <slug>` per section.
- Update `.claude/skills/add-plant.md` so new rooms auto-include the chip when first plant is added.

### Phase 4 — Popup content

- Build the chosen popup mechanism (D or C). Content per plant:
  - Header: name + species
  - Status row: current state badge (Trivs / Törstig / Vissnar / Nyvattnad) + relative last watered
  - Care table: light, water interval, watering hint
  - Care notes (multiline markdown from `care` attribute)
  - Action button: "Markera som vattnad" (calls `script.mark_<slug>_watered`)
- Remove `/house-plants/info` subview — info now lives inline on each card.
- Drop the "Vård & info →" top chip.

### Phase 5 — Skill update

- `.claude/skills/add-plant.md`: replace single-card pattern with horizontal-stack + popup pattern. New plants generated by the skill automatically follow v2.
- CLAUDE.md "Plant Tracking System": update status states table and dashboard description.

## Should this be merged with the full ULM migration?

(Per user question.)

**Recommendation: keep v2 separate from ULM migration. Do v2 first in mushroom. Port to ULM later.**

Rationale:
- ULM's popup primitive is `browser_mod` (per `ui_lovelace_minimalist/dashboard/adaptive-dash/popup/`). We have a documented mobile issue with browser_mod. If ULM-and-v2 are merged, the mobile-popup question becomes a blocker for *both* deliverables. Keeping v2 separate lets us validate the mobile popup mechanism in plain mushroom first.
- v2 is a UX/IA redesign. ULM migration is a frontend framework swap. Mixing them produces a PR no one wants to review.
- The mushroom v2 implementation gives us a working spec ("this is what the cards do") that the ULM port can replicate with `card_plant` button-card templates.

**Caveat:** if the answer to open question 1 turns out to be "browser_mod works fine on mobile now, use it", then ULM's popup primitive also works, and merging *is* viable. Decide after the spike.

## Acceptance criteria for v2 (Phase 1–5 complete)

- [ ] Tap on plant card opens a popup/page showing care info + last watered + status + water-now button.
- [ ] Tap on plant card's right-side water button stamps `last_watered` and shows the nyvattnad state.
- [ ] Tap on a room's "water all" button updates all that room's `input_datetime`s in a single action.
- [ ] All three tap targets work in HA companion app on iOS.
- [ ] `/house-plants/info` subview is removed; the top "Vård & info →" chip is gone.
- [ ] `script.mark_room_watered` is generic (works for any room slug, no per-room scripts).
- [ ] Add-plant skill generates v2-style cards.
- [ ] CLAUDE.md is updated.

## Files touched (estimated)

| File | Change |
|---|---|
| `src/scripts.yaml` | + `mark_room_watered` script |
| `src/dashboards/plants.yaml` | Plant cards → horizontal-stack pattern; remove info subview; add per-room water chip |
| `src/template/main.yaml` | Possibly add a `status_label` attribute per plant for cleaner popup rendering (optional) |
| `.claude/skills/add-plant.md` | Replace card-generation block; reference this spec |
| `CLAUDE.md` | Update Plant Tracking System section, mark this spec as implemented in Suggested Improvements |
| `custom_components/browser_mod/` | Possibly upgrade to a newer v2 release (currently v2.3.3 with a local patch) — see Browser Mod section. User action required for HACS upgrade. |
