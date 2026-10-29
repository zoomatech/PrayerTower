# Station operator guide (burst mode)

For the station's control operator (Ginni). This covers wiring an FM radio to
the station computer, the radio and sound card settings, which preset to use,
and the first tests, from no radio at all up to a real burst on the air. The
station software is already installed ([RADIO_STATION_INSTALL.md](RADIO_STATION_INSTALL.md));
the format and every setting are in [RADIO_BURST.md](RADIO_BURST.md).

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
- Why PSK and other amplitude-varying signals must stay linear (no ALC, no processing): [DXLab, "Setting ALC levels for digital mode operation"](https://dxlabsuite.com/dxlabwiki/SettingDigitalModeALC)
