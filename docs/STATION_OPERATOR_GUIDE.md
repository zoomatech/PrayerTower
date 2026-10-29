# Station operator guide (burst mode)

For the station's control operator (Ginni). This covers wiring an FM radio to
the station computer, the radio and sound card settings, which preset to use,
and the first tests, from no radio at all up to a real burst on the air. The
station software is already installed ([RADIO_STATION_INSTALL.md](RADIO_STATION_INSTALL.md));
the format and every setting are in [RADIO_BURST.md](RADIO_BURST.md).

## One-command install

On a Pi that is already running Raspberry Pi OS:

```
curl -fsSL https://raw.githubusercontent.com/zoomatech/PrayerTower/main/apps/station/install/get-station.sh | sudo bash -s -- --hamlib
```

This fetches the code to `/opt/prayer-tower-src` and runs `install.sh`. That
installs Node.js 22, the station service, the health check and, with
`--hamlib`, rigctld set to the dummy radio. Add `--fldigi` for fldigi. Run the
same command again to update; your settings files are kept. If the repository
is private, add `--repo https://<token>@github.com/zoomatech/PrayerTower.git`.
The token is not kept on disk.

**A Pi that sets itself up on first boot.** This needs Raspberry Pi OS Trixie,
from November 2025 or later.

1. Write it to the SD card with Raspberry Pi Imager. The card's boot partition
   then holds a `user-data` file, which cloud-init reads on first boot.
2. Replace that file with
   [`apps/station/install/pi/user-data`](../apps/station/install/pi/user-data).
   First change the password (`change-me-now` is a placeholder) and the time
   zone.
3. Put the card in the Pi and power it on. It creates the `station` user,
   then runs the one-command install, logging to
   `/var/log/prayer-tower-install.log`.
4. Sign in over SSH (`ssh station@prayer-station.local`). Fill in
   `/etc/prayer-tower-station.env` and `/etc/prayer-tower-rigctld.env`, then
   start the station:

   ```
   sudo systemctl start prayer-tower-station
   ```

## What you need

- An FM transceiver. A mobile with a 6-pin mini-DIN **data port** is best,
  because that port's audio skips the microphone circuits. A handheld works
  through its speaker/mic jack.
- A USB sound card interface with PTT. A Digirig Mobile is one example: one
  USB cable gives the computer a sound card and a serial port whose RTS line
  keys the radio. Use the cable made for your radio.
- A second receiver for testing (any scanner, handheld or SDR), or a phone
  with the Prayer Tower listening page (`/listen`).
- A dummy load for the first transmit tests.

## 1. Radio settings

Set these in the radio's menu (names differ by make; the manual has them):

| Setting | Set to | Why |
| --- | --- | --- |
| Mic compressor / speech processor ("PROC", "COMP") | **Off** | It squashes loud moments and lifts quiet ones. Burst audio needs its level left alone, and the QAM presets carry data in the level itself. |
| Data port speed | **1200** for the `fm-` presets, **9600** for the `dataport-` presets | At 1200 the port's audio passes through the usual voice filtering. At 9600 it is flat and wide, which the `dataport-` presets need. |
| APRS / packet features | Off | They can key the radio or take over the data port. |
| VOX | Off, unless you key by VOX on purpose | The station keys the radio itself (step 3). |
| Squelch (receiving radio) | Just above the noise, or open | A slow squelch can cut off the start of a burst. The station adds 100 ms of silence before each burst and waits `BURST_PTT_DELAY_MS` (300 ms) after keying. |
| Power | Low for tests | The radio is keyed for seconds at a time; handhelds have no fan. |

## 2. Sound card levels

The station plays the burst through the interface's sound card. List the
cards with `aplay -l` and `arecord -l`, then set levels with `alsamixer`
(press F6 to choose the USB card).

- **Turn off automatic gain control** on the capture side if the mixer shows
  it ("Auto Gain Control" → MM). It changes the level in the middle of a burst.
- **Transmit level (deviation).** Aim for about 2 to 3 kHz deviation. With a
  deviation meter or SDR, read it directly. Without one, use a monitor radio:
  start with the playback level low, send a test burst (step 5), and raise
  the level until the monitor stops getting louder or starts to distort. Then
  back it off until you hear a clear drop. Set the level once; don't move it
  between bursts.
- **Receive level** (for a receiving station): with only noise on the
  channel, set capture so the noise sits around -10 dBFS. That leaves room
  for the burst without clipping.
- Keep everything else on the computer away from that sound card, so system
  sounds never go out on the air.

## 3. Push-to-talk

With a Digirig or another serial-RTS interface, run hamlib's `rigctld` as a
service so it holds the serial port. If a one-shot command opens and closes
the port, RTS drops and the radio unkeys:

```
rigctld -m 1 -p /dev/ttyUSB0 -P RTS
```

(`-m 1` is hamlib's dummy rig: no CAT, just PTT on the port named by `-p`.)
Then in `/etc/prayer-tower-station.env`:

```
BURST_PTT_ON_CMD=rigctl -m 2 T 1
BURST_PTT_OFF_CMD=rigctl -m 2 T 0
BURST_PLAY_CMD=aplay -q -D plughw:CARD=Device,DEV=0 {wav}
```

`rigctl -m 2` talks to the running `rigctld`; `T 1` keys and `T 0` unkeys.
Use the card name `aplay -l` showed. The station service may open the sound
card (and nothing else in `/dev`) and runs in the `audio` group. Turn off hardware flow control on that
serial port in any other program that opens it, or it may key the radio.

## Rig control (frequency, mode and PTT through Hamlib)

Off by default. With it on, the station sets the radio's frequency and mode
when it starts and keys PTT through Hamlib's `rigctld`. After keying, it reads
PTT back, so a radio that ignored the command is caught before any audio
plays: the station unkeys and stops, the same as any other transmit failure.

1. Install rigctld as a service:

   ```
   sudo apps/station/install/install.sh --hamlib
   ```

   This installs `libhamlib-utils` and `prayer-tower-rigctld.service`, which
   listens on this machine only (127.0.0.1:4532). It also creates
   `/etc/prayer-tower-rigctld.env`.
2. In `/etc/prayer-tower-rigctld.env`, replace the placeholder radio. `RIG_MODEL=1` is Hamlib's dummy radio, so everything can be
   tried with no radio connected. Find your radio's number with `rigctl -l`,
   then set `RIG_DEVICE` (the CAT port, best as
   `/dev/serial/by-id/...`) and `RIG_SPEED` (the CAT baud rate from the
   radio's menu). For a PTT-only interface such as a Digirig keyed by RTS,
   keep `RIG_MODEL=1` and set `RIG_EXTRA_ARGS=-p /dev/ttyUSB0 -P RTS`.
3. In `/etc/prayer-tower-station.env`:

   ```
   RIG_CONTROL=rigctld
   RIG_FREQ_HZ=145050000
   RIG_MODE=FM
   ```

   On HF use `RIG_MODE=PKTUSB` (the radio's DATA mode) with
   `RIG_PASSBAND_HZ=3000`. Leave `RIG_FREQ_HZ` or `RIG_MODE` out to keep
   whatever the radio is set to. With rig control on, the
   `BURST_PTT_ON_CMD` and `BURST_PTT_OFF_CMD` lines are not used.
4. Restart both services, then check them:

   ```
   sudo systemctl restart prayer-tower-rigctld prayer-tower-station
   rigctl -m 2 f            # the frequency, read through rigctld
   sudo -u prayer-station node /opt/prayer-tower-station/dist/src/health.js
   ```

   The health check adds a `rig` line. It fails if rigctld is not answering,
   or if the radio is transmitting between bursts (a stuck PTT).

## Health alerts in Admin → Radio

Off by default. In Admin → Radio (station mode), turn on **Station alerts**.
About once a minute the station reports its own checks, and the server adds
what it can see. Problems also reach admins as an in-app alert, at most once
an hour.

| Alert | What it means | Comes from |
| --- | --- | --- |
| No sound card | ALSA lists no sound card (`/proc/asound/cards`), so bursts can't play. Check the USB interface. | The station (BURST_MODE=audio) |
| The radio did not key (PTT) | rigctld is not answering, the radio ignored PTT, or it is stuck transmitting. A failed burst whose error names PTT counts too. | The station (RIG_CONTROL=rigctld) and the burst log |
| The last burst failed | Any other transmit error. The station has stopped itself until someone checks it. | The burst log |
| A burst is overdue | A prayer has waited longer than the chosen limit (15, 30, 60 or 120 minutes; 30 by default). | The queue |
| The station stopped reporting | No report for 10 minutes. | The station |
| Nothing is waiting | The queue is empty. This is information, not a problem. | The queue |

## 4. Which preset

Start slow and speed up once the path is proven. `node /opt/prayer-tower-station/dist/src/burst/cli.js presets`
lists them with the SNR each needs.

| Hookup | Start with | Then try |
| --- | --- | --- |
| Mic/speaker jack, or any doubt | `fm-robust-fec` | `fm-standard`, then `fm-turbo-fec` |
| Data port at 1200, compressor off | `fm-standard` | `fm-qam16`, then `fm-qam64` |
| Data port at 9600, or an SDR receiver | `dataport-fast` | `dataport-qam64` |

The QAM presets (`fm-qam16`, `fm-qam64`, `dataport-qam64`) are the fastest
for a given signal, but only with the compressor off and the level steady.
Once a receiver can send back channel reports, `BURST_PRESET=auto` picks for
you ([RADIO_BURST.md](RADIO_BURST.md), "Auto preset").

## HF (shortwave) instead of FM

The same station can send on HF single sideband with the `hf-` presets ([RADIO_BURST.md](RADIO_BURST.md), "HF presets").

- **Radio mode.** Use upper sideband in the radio's DATA mode (USB-D, DATA-U, PKT-U). On many radios that mode turns the speech compressor off and takes audio from the data input. If yours doesn't, turn the compressor off yourself.
- **Filter.** Use the widest SSB filter (2.7-3.0 kHz). The presets sit in 469-2578 Hz.
- **Level.** Raise the transmit audio until ALC just starts to move, then back off to no ALC. Overdrive smears every carrier.
- **Presets.** Start with `hf-robust`. Move to `hf-standard` once bursts decode every time, and to `hf-fast` only on good paths. For auto choice set `BURST_PRESET=auto` and `BURST_AUTO_PRESETS=hf-robust,hf-standard,hf-fast`, with `BURST_AUTO_MARGIN_DB=6`.
- **Receiving.** Decode with `BURST_SEARCH_HZ=50 node /opt/prayer-tower-station/dist/src/burst/cli.js decode rx.wav`, or tick "Shortwave (SSB) radio" on `/listen`. That allows for a receiver tuned up to 50 Hz off.
- **Try it with no radio.** `BURST_MODE=simulate` with `BURST_SIM_HF=moderate` sends every burst through a simulated fading HF path.

## 5. First tests, in order

Each step uses the settings in `/etc/prayer-tower-station.env`; restart with
`sudo systemctl restart prayer-tower-station` after a change.

1. **No radio.** Set `BURST_MODE=simulate`. Bursts are written to the bursts
   folder and decoded back, and the log (`journalctl -u prayer-tower-station -f`)
   says how many prayers a receiver would get. Add `BURST_SIM_SNR_DB=10` to
   see the slower presets cope with noise.
2. **Make a test burst.** `echo "Test prayer one" | node /opt/prayer-tower-station/dist/src/burst/cli.js encode test.wav fm-robust-fec`
3. **Into the dummy load.** Key and play it by hand:
   `rigctl -m 2 T 1; aplay -q -D plughw:CARD=Device,DEV=0 test.wav; rigctl -m 2 T 0`.
   Listen on the monitor radio and set the transmit level (step 2).
4. **Decode it on the second receiver.** Record with
   `arecord -f S16_LE -r 48000 -c 1 -d 15 rx.wav` while you send, then
   `node /opt/prayer-tower-station/dist/src/burst/cli.js decode rx.wav channel.json`. It prints the
   prayers and the measured SNR. Or open `/listen` on a phone held near the
   receiver's speaker.
5. **Through the station.** Set `BURST_MODE=audio` with the PTT and play
   commands above, set Admin → Radio → "Prayers per burst" above 1, and queue
   a test prayer. The log shows the preset, frames and air time. Admin → Radio
   lists each burst.
6. **Speed up.** Move up the preset table one step at a time, decoding each on
   the second receiver. Stay one step below the fastest one that decodes
   every time.

If a burst doesn't decode: check that the compressor is off, lower the
transmit level (overdrive is the most common fault), make sure the squelch
opens fast enough, and drop back to a slower preset.

## For the legal side

Station identification, frequencies and control-operator duties are in
[RADIO_STATION.md](RADIO_STATION.md). The call sign travels in plain ASCII in
every frame header, and the format is published in [RADIO_BURST.md](RADIO_BURST.md).

## Sources

- Deviation target and monitor-radio level method: [Masters Communications, "Setting audio levels"](https://masterscommunications.com/products/radio-adapter/faq/setting-audio-levels.html)
- Data port 1200 vs 9600, APRS off, AGC off, receive level about -11 dBFS, low power and heat: [SEAPAC 2025, "VARA FM setup"](https://seapac.org/workshop-presentations_files/2025/SEAPAC%202025%20VARA%20FM%20SETUP%20(3).pdf)
- Digirig PTT by RTS, flow control off, keeping system sounds off the interface: [Digirig, "Getting started with Digirig Mobile"](https://digirig.net/?p=5478)
- `rigctl`/`rigctld` options and `T` (set_ptt): [hamlib rigctl manual](https://hamlib.sourceforge.net/snapshots/man1/rigctl.1.html)
- rigctld port 4532, the Extended Response Protocol (`+` prefix, `RPRT 0`), `F`/`M`/`T` and the mode names: [rigctld(1)](https://man.archlinux.org/man/rigctld.1.en)
- Model 1 is the Hamlib dummy radio, model 2 is NET rigctl: [hamlib-utilities(7)](https://www.mankier.com/7/hamlib-utilities)
- cloud-init on Raspberry Pi OS Trixie (`user-data` on the boot partition, from the 24 November 2025 image): [Raspberry Pi, "Cloud-init on Raspberry Pi OS"](https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/)
- cloud-init `users` (`plain_text_passwd`, `lock_passwd`) and `packages`: [cloud-init docs](https://docs.cloud-init.io/en/latest/reference/yaml_examples/user_groups.html), [modules](https://docs.cloud-init.io/en/latest/reference/modules.html)
- `libhamlib-utils` package in Debian trixie: [Debian manpages](https://dyn.manpages.debian.org/trixie/libhamlib-utils/rigctl.1.en.html)
- HF DATA mode, 300-2700 Hz passband, compressor off: [AB4OJ, "The DATA Mode in Icom HF Transceivers"](https://www.qsl.net/a/ab4oj/icom/datamode.html)
- Why PSK and other amplitude-varying signals must stay linear (no ALC, no processing): [DXLab, "Setting ALC levels for digital mode operation"](https://dxlabsuite.com/dxlabwiki/SettingDigitalModeALC)
