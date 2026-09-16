# Wood's Cortina Silent 12K AC — Recovery Runbook

Operational guide for the Wood's Cortina Silent 12K Smart Home (WAC1202G) portable AC, integrated through HACS `make-all/tuya-local`. Architecture, the local profile patch and the version pin live in `CLAUDE.md` → "Woods Cortina AC". **This file covers what to do when it breaks.**

Quick facts: device id `bf758820e09dac5aebuqvc` · IP `192.168.1.132` (DHCP reservation) · MAC `bc:35:1e:80:5b:fc` · protocol 3.5 · paired in the **Tuya Smart** app · manual at `~/manuals/woods-cortina-silent-12k-wac1202g.pdf`.

## Runbook: AC unavailable in HA

Follow in order and stop as soon as it's fixed.

*Diagnose (from the server, ~2 min):*
1. `ping -c3 192.168.1.132` and test the Tuya port: `timeout 3 bash -c 'cat </dev/null >/dev/tcp/192.168.1.132/6668' && echo OPEN`.
   - **Port open** → the AC is on the network; HA just can't authenticate (local key changed). Skip to step 7.
   - **No reply** → the AC is off the network. Continue.
2. Check the AC is **powered on at the unit** (POWER button, not just plugged in). Wait 2 min, then repeat step 1.
3. Open the **Tuya Smart** app (not Smart Life, not Wood's Connect). Check the **Home selector** (top left).
   - **Listed but "offline"** → it's a WiFi problem only (router/SSID/password changed?). Fix the WiFi in the app, **don't re-pair**, repeat step 1.
   - **Not listed at all** → it was unbound from the account and has wiped its WiFi. Re-pair (steps 4–6).

*Re-pair the AC (on the unit + phone):*
4. AC on → **hold SPEED 3–5 s** until the WiFi icon blinks. **Slow blink = AP mode** (use this); fast blink = EZ. Hold SPEED again to switch.
5. Tuya Smart app → **+** (top right) → Add Device → **switch to AP Mode in the top-right corner** → enter a **2.4 GHz** WiFi → join the AC's hotspot when asked → wait until it shows connected.
6. Confirm from the server: step 1 should now show **port 6668 open**.

*Reconnect Home Assistant:*
7. Settings → Devices & Services → Tuya Local → Wood's entry → ⋮ → **Delete**.
8. **Restart HA** (`docker stop -t 60 home-assistant && docker start home-assistant`). **Don't skip this.** Without it the setup flow says *"Unable to find any unregistered devices for the account."*
9. Add Integration → Tuya Local → **"cloud-assisted device setup with fresh login"** → User Code (Tuya app → Me → ⚙️ → Account and Security → User Code) → scan the QR with the Tuya app (Me → scan icon) → confirm on the phone.
10. Pick the AC. **Force-quit the Tuya app on the phone** before continuing; it blocks local connections.
11. The IP search will fail (broadcasts don't reach the server) → enter **`192.168.1.132`**, protocol **3.5**.
12. Type **"Woods Cortina Silent 12k"** (the patched profile) → name **`Wood's Cortina Silent 12K Smart Home`**.

*Verify:*
13. `climate.wood_s_cortina_silent_12k_smart_home` has a real state, its `hvac_modes` contain **no `off`** (proves the patched profile), `sensor.sovrum_temperatur` shows a number, and no new `Failed to refresh device state for Wood's…` lines appear in `home-assistant.log`.

*If step 9 finds no devices even after the restart:* run `logger.set_level` with `custom_components.tuya_local` and `tuya_sharing` set to `debug`, retry, and read the log. If no `dev_id = bf758820e09dac5aebuqvc` appears, the wrong account is logged in. **The debug log contains decrypted local keys**, so it resets on restart; don't share it.

## Incident log

### 2026-09-16: lost WiFi, re-paired

Offline since ~2026-09-06 (off the LAN entirely, missing from the Tuya app). Powered on, it still never rejoined WiFi, so it was re-paired in the Tuya Smart app (AP mode). Findings worth keeping:
- The re-pair kept the **same device id** (`bf758820e09dac5aebuqvc`) and IP (`192.168.1.132`, MAC `bc:35:1e:80:5b:fc`); only the **local key rotated**. Entity unique_ids embed the device id, so the entities came back with identical names and history.
- **Discovery broadcasts (UDP 6666/6667) never reach this server** — the router doesn't forward WiFi broadcast to the wired host. tuya_local's IP search will fail; enter the IP manually.
- **Recovery that worked:** delete the tuya_local entry → **restart HA** → Add Integration → Tuya Local → *cloud-assisted with fresh login* (User Code: Tuya app → Me → ⚙️ → Account and Security) → force-quit the Tuya app → IP `192.168.1.132`, protocol 3.5, type "Woods Cortina Silent 12k". The restart is **required**: deleting the entry leaves a stale in-memory device record, and the cloud flow then silently filters the AC out as already registered ("Unable to find any unregistered devices for the account") even though the cloud returns it.
- Debug the cloud flow with `logger.set_level` (`custom_components.tuya_local` + `tuya_sharing` → debug); logs show each device the cloud returns. Note that debug output includes decrypted local keys.
- The IP is a **long-standing DHCP reservation** (`bc:35:1e:80:5b:fc` → `192.168.1.132`), so IP drift was never the cause.
- **Root cause, best explanation (not proven):** it was both off WiFi *and* gone from the Tuya app. Losing WiFi alone leaves a device listed as "offline" in the app. It vanishing entirely means it was **unbound from the account**, and on Tuya, removing a device from the app ("Remove device" / "Disconnect and wipe data") makes the device factory-reset its WiFi config. Unbinding explains both symptoms, and the same device id coming back on re-pair fits (the id belongs to the hardware module). Who or what unbound it is unknown: someone in the app, a household member's account, or a cloud-side glitch.

## Manual and pairing controls

 Full manual saved locally at `~/manuals/woods-cortina-silent-12k-wac1202g.pdf` (source: [Bauhaus](https://www.bauhaus.se/media/pdf/2146775A.pdf)), with a page-delimited text extract beside it as `.txt` (split on `=== PAGE BREAK ===`; the English "GB" section is pages 15–20) so it can be grepped without a PDF reader. Note the manual's WiFi section is useless — it only says "follow the procedures in the APP" and documents no reset combo. Control panel buttons are **POWER, MODE, SPEED, TIMER** and **up/down arrows**. There is **no `+` button on the unit** — the `+` is the *Tuya app's* Add Device button (top right); a widely-copied "hold + for 5 seconds" instruction belongs to the Wood's **AirSwitch** model (WAC1205G), which has a dedicated AirSwitch button, and does not apply here. For this class of Tuya AC, **hold SPEED ~3–5 s** to enter/toggle pairing mode: **fast blink = EZ mode, slow blink = AP mode**, and holding SPEED again switches between them. AP mode is the one that worked here.

## App and pairing notes

 The AC must live in a **genuine Tuya app** — either **Tuya Smart** or **Smart Life** — and **not Wood's Connect**; tuya-local's cloud-assisted login (QR scan, **region = Central Europe**) talks to both genuine apps but rejects white-label ones. **This install used the Tuya Smart app** (corrected 2026-09-16; an earlier version of this note said Smart Life, which was wrong). The two apps are separate ecosystems — a device added in one is invisible in the other, even with the same email — so always re-check in **Tuya Smart** here. Pair in **AP mode** (EZ is flaky; expect power-cycles). Cloud-assisted then auto-fills device id + local key; control runs local thereafter. Re-pairing rotates the local key (device id stayed the same on the 2026-09-16 re-pair), so HA must be re-added afterwards — see RESOLVED note above. The DHCP reservation for `192.168.1.132` already exists.
