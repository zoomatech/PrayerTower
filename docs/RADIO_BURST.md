# Radio burst mode

Burst mode sends many prayers at once. The station claims a batch, compresses
the whole batch together, and sends it as one short burst of audio in a single
key-up. A one-prayer PSK31 piece takes about a minute; a burst carries 30
prayers in 1.2 seconds on an ordinary FM radio, and 100 in about 2.

It is **off by default** (`BURST_MODE=off`), and the station keeps working as
the PSK31 sender described in [RADIO_STATION.md](RADIO_STATION.md).

## Measured speed

From `npm run burst -w @prayer-tower/station -- bench` and the tests in
`apps/station/test/burst.test.ts`. The 30 hand-written sample requests
(`test/fixtures/sample-prayers.ts`, 2,724 characters) compress to 624 bytes,
about 21 bytes a prayer (4.4x). One prayer on its own takes about 24 bytes.

| Preset | Radio hookup | Raw rate | 30 sample prayers | 100 prayers | Works down to (SNR in 2.5 kHz) |
| --- | --- | --- | --- | --- | --- |
| `fm-robust` | Any FM radio's mic and speaker audio | 2.0 kbit/s | 3.5 s | 6.1 s | about 6 dB |
| `fm-standard` (default) | Any FM radio's mic and speaker audio | 4.0 kbit/s | 1.7 s | 3.1 s | about 10-12 dB |
| `fm-fast` | FM audio, strong clean signal | 6.0 kbit/s | 1.2 s | 2.1 s | about 16 dB |
| `fm-turbo` | FM audio, full-quieting signal, audio level set well | 9.2 kbit/s | 0.8 s | 1.5 s | about 22 dB |
| `fm-robust-fec` | Any FM radio, weakest paths | 4.0 kbit/s (2.0 of data) | 2.9 s | 5.3 s | about 5 dB |
| `fm-turbo-fec` | FM audio, strong signal | 9.2 kbit/s (6.1 of data) | 1.1 s | 2.0 s | about 15 dB |
| `fm-qam16` | FM audio with flat, unclipped audio | 6.5 kbit/s (4.9 of data) | 1.3 s | 2.4 s | about 12 dB |
| `fm-qam64` | FM audio, strong signal, flat unclipped audio | 11.3 kbit/s (8.5 of data) | 0.8 s | 1.5 s | about 18 dB |
| `dataport-fast` | The radio's 9600 data port, or an SDR | 13 kbit/s | 0.65 s | 1.2 s | about 18-20 dB |
| `dataport-turbo` | 9600 data port or SDR, strong signal | 17 kbit/s | 0.5 s | 1.0 s | about 24 dB |
| `dataport-qam64` | 9600 data port or SDR | 21 kbit/s (16 of data) | 0.55 s | 1.0 s | about 20 dB |
| `hf-robust` | HF (shortwave) SSB, weak or fading paths | 1.9 kbit/s (0.9 of data) | 6.1 s | 10.8 s | about 2 dB steady, 8 dB fading |
| `hf-standard` | HF SSB, fair paths | 3.8 kbit/s (1.8 of data) | 3.3 s | 5.6 s | about 4 dB steady, 12 dB fading |
| `hf-fast` | HF SSB, good paths | 3.8 kbit/s (2.4 of data) | 2.6 s | 4.3 s | about 6 dB steady, 15 dB fading |

The 100-prayer column uses the benchmark's generated requests
(`src/burst/sample.ts`) and includes the 0.1 s lead-in. Each frame also has a
fixed 0.19 s of sync and header, so bigger batches are more efficient.

The two `-fec` presets add soft-decision error correction: a rate-1/2 (or
punctured rate-2/3) convolutional code under the Reed-Solomon code, decoded by
a Viterbi decoder that weighs how sure the demodulator is of every bit.
`fm-robust-fec` is a bit faster than `fm-robust` (it needs less Reed-Solomon
parity) and decodes about 1 dB further into
the noise; `fm-turbo-fec` is a little faster than `fm-fast` and also about
1 dB tougher. They are opt-in (`BURST_PRESET=fm-robust-fec`); every receiver
decodes them. The gain is smaller than the 4-5 dB such a code gives a
coherent modem, because differential PSK compares two noisy symbols; a
pilot-aided coherent preset is the next step for more.

The three `-qam` presets are coherent: instead of comparing each symbol with
the one before, the receiver measures every carrier's gain and phase from
pilot carriers (every sixth carrier) and reads the data against that, so
amplitude can carry bits too (16-QAM and 64-QAM) and the noise isn't doubled.
With a rate-3/4 convolutional code, `fm-qam64` sends as fast as `fm-turbo` on
4-6 dB less signal (in the simulated FM path it decodes at a noise level
where `fm-turbo` fails), and `fm-qam16` is about 20% faster than
`fm-standard` on the same signal. QAM needs audio that keeps its level
steady: turn off the radio's mic compressor or speech processor, keep the
level out of clipping, and prefer the data port. They are opt-in
(`BURST_PRESET=fm-qam64`); every receiver decodes them.

The receiver follows a sound card clock difference of up to ±300 ppm through
frames of 20 seconds or more, and an SSB tuning error of up to about ±10 Hz
(it measures the error from the header and shifts the frame back into tune).

A full-quieting FM signal is normally above these numbers, so `fm-fast` or
`fm-turbo` is the normal choice once the link is known to be solid. Check with
`simulate` and a test receiver first. Bigger batches compress
better, because later prayers reuse the words of earlier ones: 100 prayers fit
in about 3.7 s on `fm-standard` and 2.6 s on `fm-fast` in the benchmark.

## Simulated throughput (every preset, several noise levels)

Measured on 2026-10-29 with `npm run burst -w @prayer-tower/station -- sim`
(`src/burst/sim.ts`). Each preset sends 30 generated requests
(`src/burst/sample.ts`) in one burst, through a simulated path: the radio's
audio filter (300-3,400 Hz for FM, 50-7,000 Hz for the data port, 300-2,700 Hz
for HF SSB) and white noise, then the decoder. The noise is stepped down 1 dB at
a time from 10 dB above the preset's rated floor. The SNR column is the lowest
level at which all 30 prayers came through on each of 3 noise seeds. HF presets
were also run through CCIR Rec. 520 moderate fading (two paths, 1 ms apart, 0.5
Hz Doppler), stepped down from 25 dB.

| Preset | 30 prayers on air | Prayers per second | Decodes all, steady (SNR in 2.5 kHz) | Decodes all, HF moderate fading |
| --- | --- | --- | --- | --- |
| `fm-robust` | 3.34 s | 9.0 | 6 dB |  |
| `fm-standard` | 1.76 s | 17.1 | 10 dB |  |
| `fm-fast` | 1.28 s | 23.5 | 15 dB |  |
| `dataport-fast` | 0.77 s | 38.8 | 17 dB |  |
| `fm-turbo` | 0.97 s | 31.1 | 21 dB |  |
| `dataport-turbo` | 0.68 s | 44.2 | 22 dB |  |
| `fm-robust-fec` | 2.98 s | 10.1 | 5 dB |  |
| `fm-turbo-fec` | 1.21 s | 24.9 | 15 dB |  |
| `fm-qam16` | 1.42 s | 21.1 | 11 dB |  |
| `fm-qam64` | 0.97 s | 31.1 | 17 dB |  |
| `dataport-qam64` | 0.68 s | 44.2 | 19 dB |  |
| `hf-robust` | 5.93 s | 5.1 | 2 dB | 7 dB |
| `hf-standard` | 3.20 s | 9.4 | 4 dB | 11 dB |
| `hf-fast` | 2.53 s | 11.9 | 6 dB | 14 dB |

"Prayers per second" is 30 divided by the burst's air time, including the
0.1 s lead-in. Below its threshold a preset loses whole frames, never single
prayers inside one: each frame's CRC drops it rather than passing on a wrong
prayer. These numbers come from a simulated channel without the clock drift,
mic compression or clipping of a real radio, so leave a few dB of margin (the
auto preset adds 3 dB). `apps/station/test/sim.test.ts` checks every preset at
2 dB and 12 dB above its rated floor and 10 dB below it, and the HF presets in
moderate fading, on every CI run.

## How it fits that much

1. **Batch compression.** The prayers are folded to ASCII, joined with
   newlines, and compressed together. The station tries four formats and keeps
   the smallest. The usual winner is a small context-mixing (CM) compressor,
   an independent implementation in the style of the lpaq family listed on
   [Matt Mahoney's Large Text Compression Benchmark](https://mattmahoney.net/dc/text.html). It is primed
   with a published sample of prayer-request English, so it already knows the
   words before the first prayer. The others are plain text, raw DEFLATE
   ([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951)) primed with a preset
   dictionary of common prayer words (the technique in
   [Cloudflare's write-up](https://blog.cloudflare.com/improving-compression-with-preset-deflate-dictionary/)),
   and Brotli ([RFC 7932](https://www.rfc-editor.org/rfc/rfc7932)), which has
   a built-in English dictionary. The dictionary and primer are published in
   `apps/station/src/burst/dictionary.ts` and `primer.ts`.
2. **Error correction.** The compressed batch gets a CRC-32 and is cut into
   Reed-Solomon blocks over GF(256) (the RS(255,223) family), interleaved so a
   noise burst is spread over all blocks.
3. **Many tones at once.** The audio is OFDM: 48 to 104 carriers 46.875 Hz
   apart, each carrying 1 to 4 bits per 24 ms symbol with differential PSK.
   This is the same layout that [VARA FM uses](https://digirig.net/software-modems-in-ham-radio-part-1-two-kinds-of-burst/)
   (48 kHz sound card, 1,024-point FFT, 46.875 Hz spacing, 21.3 ms symbol plus
   a 1/8 guard). Differential phase needs no channel estimate, so the radio's
   filters, pre-emphasis and de-emphasis don't need to be measured. A radio's
   [9600 data port](https://en.wikipedia.org/wiki/9600_port) skips those
   filters, which is why `dataport-fast` can use twice the bandwidth.

## Amplify 1,000 times

An amplified prayer is sent once for each copy Admin → Radio → Amplify asks for.
In burst mode the copies compress to almost nothing: 1,000 copies of a prayer
add about 35 bytes and go out in about half a second on `fm-fast`. That's the
notebook's "1,000×/second" (page 15). Admin → Radio offers 100× and 1,000× next
to the old 2-10×. A PSK31 station still sends at most 50 copies.

## Station settings

Setting up the radio, sound card and push-to-talk, and the first tests, are in
[STATION_OPERATOR_GUIDE.md](STATION_OPERATOR_GUIDE.md).

In `/etc/prayer-tower-station.env` (see `apps/station/install/station.env.example`):

| Setting | Default | Meaning |
| --- | --- | --- |
| `BURST_MODE` | `off` | `off` (PSK31, one prayer at a time), `audio`, `fldigi`, `simulate` or `packet` (below) |
| `PACKET_PATH` | empty | `packet`: digipeaters to ask, comma-separated, e.g. `WIDE1-1`. Empty asks none |
| `BURST_PRESET` | `fm-standard` | One of the presets above (`cli.js presets` lists them), or `auto` (below) |
| `BURST_AUTO_REPORT` | `BURST_DIR/channel.json` | `auto`: the receiver's channel report, a file or an http(s) URL |
| `BURST_AUTO_PRESETS` | the FM presets except QAM | `auto`: comma-separated presets it may choose from. Add `fm-qam16,fm-qam64` once the audio is known to be flat and unclipped |
| `BURST_AUTO_MARGIN_DB` | `3` | `auto`: SNR to spare above a preset's working level |
| `BURST_AUTO_MAX_AGE_MIN` | `30` | `auto`: an older report is ignored |
| `BURST_SIM_SNR_DB` | none | `simulate`: add noise at this SNR before decoding back |
| `BURST_MAX_PRAYERS` | `50` | Most prayers claimed per burst. The server also caps it at Admin → Radio → "Prayers per burst" (`radio_batch_max`, default 1). |
| `BURST_MAX_FRAME_SECONDS` | `20` | Longest frame. A bigger batch becomes several frames in the same key-up. |
| `BURST_PLAY_CMD` | `aplay -q {wav}` | Plays the burst to the radio's sound card. `{wav}` is the file. Example: `aplay -q -D plughw:1,0 {wav}` |
| `BURST_PTT_ON_CMD` / `BURST_PTT_OFF_CMD` | empty (VOX) | Keys the radio, e.g. `rigctl -m 2 T 1` and `rigctl -m 2 T 0` with hamlib's rigctld |
| `BURST_PTT_DELAY_MS` | `300` | Wait after keying before the audio starts |
| `BURST_DIR` | `bursts/` in the state directory | Every burst is kept here as a WAV, as the station's log of what went out |
| `BURST_FLDIGI_MODEM` | `8PSK1000F` | The fldigi mode for `BURST_MODE=fldigi` |

The modes:

- **audio**: the station plays the burst WAV itself. fldigi isn't needed.
- **fldigi**: each frame is one line of text, `PTB1 CALL <base64>`, sent in a fast fldigi mode. This uses an existing fldigi setup with no new audio wiring. It is slower than `audio`, because the frame goes through fldigi's character coding.
- **simulate**: nothing is keyed. Each burst is written to `BURST_DIR`, decoded back, and the log shows exactly what a receiver would hear. Use this to try burst mode against the live queue before going on the air.

Each burst is logged to Prayer Tower (`POST /station/bursts`). With "Prayers per
burst" above 1, Admin → Radio lists the latest bursts: prayers, air time, bytes,
frames, preset and mode. In `simulate` mode it also shows how many prayers a
receiver decoded back, and a line turns red if any were lost or the burst failed.

A live check on 2026-10-29 sent 20 queued prayers from the local API through
`simulate` on `fm-fast`. They went in one 0.56 s frame of 117 bytes, a receiver
decoded all 20, and all 20 were marked transmitted.

To turn it on: set Admin → Radio → "Prayers per burst" above 1, set `BURST_MODE` (start with `simulate`), and run `sudo systemctl restart prayer-tower-station`.

## Listen in a browser

`/listen` on the Prayer Tower website decodes bursts from a phone or laptop
microphone, so anyone near a radio can read the prayers as they play. It is
off until Admin → Radio → "Listening page on" (shown once "Prayers per burst"
is above 1); while off, `/listen` is a 404.

- The decoding runs in the browser. The sound never leaves the device.
- The page turns off the browser's echo cancelling, noise suppression and
  automatic gain, which would otherwise wreck the signal.
- It can also decode a recording (any audio file the browser can open).
- It shows each frame's call sign, preset and measured signal, and can save a
  channel report (`channel.json`) for `BURST_PRESET=auto`.
- Through a speaker and a microphone, the slower presets (`fm-robust`,
  `fm-robust-fec`, `fm-standard`) work best. The fast and QAM presets want a
  cable from the radio to the computer.
- It captures the microphone with an AudioWorklet (Web Audio's audio
  thread), falling back to the older ScriptProcessor where a browser lacks it.
- It also decodes the packet fallback (below) and shows each packet's count
  and short IDs.
- After decoding a recording it shows a **Signal check** (the same report as
  `cli.js diagnose`, below).
- It opens codec 0 and codec 3 frames (the station nearly always picks codec
  3). A frame packed with DEFLATE or Brotli says so, and the station CLI
  decodes it from a recording.

The page's decoder is the station's own code (`src/burst/web.ts`), bundled
into `apps/server/src/modules/listen/decoder.generated.ts`. After changing
the decoder, run `npm run build:listen -w @prayer-tower/station`; a station
test fails while the bundle is out of date.

**In the app.** Prayer Cast shows "Listen to the radio" while the listening page is on. The Listen screen streams the microphone (expo-audio's `useAudioStream`, 48 kHz float PCM) through the same decoder, bundled as an ES module into `apps/mobile/src/lib/burst-decoder.generated.js` by the same build script. It keeps a rolling 24-second window and decodes it every 2 seconds.

**Listener mode (no account).** Off by default. With **Listener mode** on in
Admin → Radio, and the listening page on too, the sign-in screen shows
"Listen to radio prayers (no account needed)". Anyone near a radio can then
open the same Listen screen without signing up (`GET /listen/config` tells the
app whether to show it). Every prayer the phone decodes is kept on the phone,
newest first, under **Prayers heard on air**: up to 200, never sent anywhere,
with a button to clear them. With receipts on, a listener can still choose to
send back fingerprints.

**I'm praying too.** Off by default (Admin → Radio, "Listeners can tap I'm
praying too"). Each prayer under **Prayers heard on air** gets an **I'm
praying too** button. A tap is saved on the phone first, then sent when the
phone is online (`POST /listen/praying`). Only the station's call sign and the
prayer's fingerprint are sent, never the words and nothing about the listener.
The radio prayer's anonymous count goes up by one for each tap. The person who
asked is told once that someone who heard it on the radio is praying too. A
tap can arrive up to 7 days after the prayer went out. Open Circle's button
says "I'm thinking of them too".

**Open Circle.** The browser page has Open Circle's wording on Open Circle's
own domain and at `/open-circle/listen`.

## Packet fallback

For a station whose radio or hookup can't carry the bursts, `BURST_MODE=packet`
sends standard 1200-baud packet instead: Bell 202 AFSK (mark 1200 Hz, space
2200 Hz) carrying AX.25 UI frames, the mode every APRS radio and TNC already
decodes. Packet is slow, so the words never go out. Each packet is an APRS
status report to the experimental destination `APZPTW` with the batch's count
and up to six short IDs (the first six hex digits of each prayer's receipt
fingerprint):

    >PT 12 prayers 1/2: 3fa9c1 07b2de 9c44e0 a1b2c3 d4e5f6 0a0b0c

- Off by default: Admin → Radio → **Packet fallback**. While off, the server
  refuses packet claims (`409 packet_off`) and `/node/heard-ids` is a 404.
- The station claims, filters and plays the packets through the sound card as
  in `audio` mode, keying with the same PTT commands, and logs each batch with
  preset `aprs-1200`.
- A listener node decodes packets as well as bursts and reports the IDs it
  heard (`POST /node/heard-ids`). The server matches each against that call
  sign's prayers sent in the last 24 hours and marks them heard, as for bursts.
- The `/listen` page and `node src/cli.js` decode them too. Any APRS decoder
  (Dire Wolf, a TNC) shows them as status reports.
- The call sign must fit AX.25: up to 6 letters and digits, optional `-SSID`.

The modem is `apps/station/src/packet/afsk.ts`; the message format is
`packet/message.ts`. A test round-trips packets at 48 and 44.1 kHz and through
noise at 3 dB SNR, and checks the FCS against CRC-16/X.25's check value
(0x906E). `test/packet-robustness.test.ts` also decodes packets recorded at
about -50 dBFS, hard-clipped, under 60 Hz hum and a DC offset, and with about
5 dB of twist either way (a missing or doubled FM emphasis stage). A dropout
of broken samples loses only the packet it hits.

## Compression v2 (codec 4)

Off by default: set `BURST_CODEC_V2=on` in the station's settings **after**
every listener node, the app and the `/listen` page run a version that reads
codec 4 (older receivers report the frame's codec as unknown). With it on, the
station tries codec 4 alongside the others and keeps whichever is smallest, so
it is never worse.

What changed against codec 3, measured on the same two sets (the 30
hand-written requests in `test/fixtures/sample-prayers.ts` and 100 generated
ones from `src/burst/sample.ts`, neither of which is in any primer):

| Step | 30 requests | 100 requests | One request |
| --- | --- | --- | --- |
| Codec 3 | 623 bytes | 1,148 | 23 |
| + two more models (the current word alone; bytes 2-3 back) and an APM stage | 602 | 1,115 | 20 |
| + mixer weights chosen by the last byte's kind (letter, space, other) | 596 | 1,067 | 22 |
| + a longer shared phrase primer (`src/burst/primer2.ts`, 50 more requests, updates and Open Circle wordings) | **570** (-8.5%) | **1,073** (-6.5%) | **18** (-22%) |
| Tried and dropped: replacing 63 common phrases with single bytes before coding | 579 | 915 | 20 |

The phrase substitution only won on the generated set, whose sentences repeat
from a small template; on hand-written requests it lost, so codec 4 leaves
phrase knowledge to the primer.

Air time and prayers a second (`BURST_CODEC_V2=on cli.js bench`, 2026-10-29):

| Preset | 30 sample prayers, codec 3 | codec 4 | 100 prayers, codec 3 | codec 4 |
| --- | --- | --- | --- | --- |
| `fm-robust` | 3.63s (8.3/s) | 3.22s (9.3/s) | 6.13s (16.3/s) | 5.81s (17.2/s) |
| `fm-standard` | 1.81s (16.6/s) | 1.69s (17.8/s) | 3.05s (32.7/s) | 2.84s (35.2/s) |
| `fm-fast` | 1.33s (22.6/s) | 1.25s (23.9/s) | 2.14s (46.7/s) | 2.00s (50.1/s) |
| `dataport-fast` | 0.80s (37.6/s) | 0.77s (38.8/s) | 1.18s (84.6/s) | 1.11s (90.1/s) |
| `fm-turbo` | 0.99s (30.3/s) | 0.94s (31.8/s) | 1.52s (65.9/s) | 1.45s (69.2/s) |
| `fm-robust-fec` | 3.05s (9.8/s) | 2.84s (10.6/s) | 5.29s (18.9/s) | 5.00s (20.0/s) |
| `hf-robust` | 6.13s (4.9/s) | 5.67s (5.3/s) | 10.78s (9.3/s) | 10.16s (9.8/s) |
| `hf-standard` | 3.29s (9.1/s) | 3.08s (9.7/s) | 5.62s (17.8/s) | 5.31s (18.8/s) |

Codec 4 needs about 6 MB more memory per encode or decode (the APM table and two more models) and
a few milliseconds; the browser and app decoders handle it.

## Store-and-forward relay

A listener node with a transmitter can re-send the bursts it decodes, so
listeners beyond the station's range still hear them. Off unless `RELAY=on` in
`/etc/prayer-tower-listener.env` (see `apps/station/install/listener.env.example`).

The relay re-sends a frame only when all of these hold (loop protection):

- The frame came from a station listed in `RELAY_FROM`, never from just anyone.
- It isn't the relay's own transmission heard back (its own call sign).
- It has passed fewer relays than `RELAY_MAX_HOPS` (default 1, at most 3). A
  relay never re-sends another relay's copy unless hops allow it.
- The same batch hasn't been relayed here in the last 10 minutes.
- The relay can read it (it never re-sends what it can't vouch for).
- It is within `RELAY_MAX_SECONDS_PER_HOUR` of airtime (default 120).

It waits `RELAY_DELAY_MS` (1 s) for the channel to clear, then sends the frame
on the same preset under its own call sign (`RELAY_CALL_SIGN`), which is its
identification. The original station and the hop count travel inside (codec 5,
below), so receivers show "From N0CALL (relayed by K1RLY)". Listener nodes
report a relayed prayer as heard from the original station, so receipts and
acknowledgements work, but they send no channel report for it (the signal is
the relay's, not the station's). `RELAY_MODE=simulate` (the default) writes
each relayed burst to the state directory without keying anything; `audio`
plays it through `RELAY_PLAY_CMD` with `RELAY_PTT_ON_CMD` and `RELAY_PTT_OFF_CMD`.

Receivers older than the relay show a relayed frame as unreadable and keep
decoding the rest. The code is `apps/station/src/relay.ts` and
`src/burst/relay-frame.ts`.


A relay reports with its listener heartbeat (once a minute): frames re-sent and seconds on the air in the last hour, its budget, and frames it did not re-send since it started, by reason. The operator console lists every relay that reported in the last hour.

## Diagnose a weak signal

When a burst doesn't decode, or decodes only sometimes, record it at the
receiver and replay the recording through the decoders offline:

```
arecord -f S16_LE -r 48000 -c 1 -d 30 rx.wav
node dist/src/burst/cli.js diagnose rx.wav          # or: diagnose rx.wav --json
```

A 20-prayer `fm-fast` burst with added noise (a test run, 2026-10-29):

```
Recording: 5.09 s at 48000 Hz
Level: peak 0 dBFS, average -17 dBFS, 0% clipped, DC offset 0
Noise floor -29.3 dBFS, loudest parts -9.9 dBFS
Power: 0.1% below 300 Hz, 94% in 300-3000 Hz, 5.9% above
Burst frames: 1; packet fallback packets: 0
  2.1-3.04s de N0CALL, fm-fast, 28.9 dB SNR (needs 16)
Advice:
  - Everything decoded with a comfortable margin.
```

It checks, most likely cause first:

- **Level:** very quiet audio (peak at or below -40 dBFS), clipping (0.1% of
  samples or more at full scale), and a DC offset.
- **Hum:** 30% or more of the power below 300 Hz, usually a ground loop.
- **Noise:** no burst standing 6 dB above the noise floor.
- **Margin:** each frame's measured SNR against its preset's working level
  (the speed table). Under 3 dB of margin is flagged, and so are frames that
  needed error correction.
- **Tuning:** when nothing decodes, it tries again allowing an HF receiver up
  to 50 Hz off (`BURST_SEARCH_HZ`, `0` to skip) and says if that was the fix.
- **Packet fallback:** status packets in a recording with no bursts mean the
  station is on `BURST_MODE=packet`.

The `/listen` page shows the same report for any recording it opens. The code
is `apps/station/src/burst/diagnose.ts`.

## Answered: a thanksgiving burst

Off by default (Admin → Radio, "Thanksgiving on the air for answered
requests"). When a member marks a request answered, and that request went
out by radio at least once, one short thanksgiving is queued for the station:
"Answered! Thank you for praying: " followed by the start of the request, 160
characters at most. Open Circle requests get "Good news, answered. Thank you
for your support: " instead. It is free, there is at most one per request, and
it goes through the same moderation holds, transmission windows, content filter
and acknowledgements as any radio prayer. The person who asked gets the "on the
air" receipt when it goes out.

## Receipts

Off until Admin → Radio → "On-the-air receipts on" (`token_settings.radio_receipts_enabled`).

- **On the air.** When the station reports a prayer sent, the member who sent it gets a notice: "It went out at 2:05 PM UTC from N0CALL on fm-qam16." The time is in the member's quiet-hours time zone if they set one, otherwise UTC. It works with the PSK31 loop and the log transmitter too, without a preset.
- **Heard.** In burst mode the station also reports `sentHash` for each prayer: the first 32 hex digits of SHA-256 of the exact (ASCII-folded) text it sent. A listener's `/listen` page or the app's Listen screen, with the listener's agreement, sends `POST /listen/heard` with the call sign, preset, SNR and those fingerprints, never the words. Each fingerprint matches prayers that call sign sent in the last 24 hours. The first report of each tells its sender and the person who asked; later reports only count (`radio_prayers.heard_count`, best `heard_snr_db`). The route is public, limited to 20 requests a minute per IP address, and a 404 while receipts are off.
- **Automatic sends.** A request sent for every request ([fair air](STATION_OPERATOR_GUIDE.md#fair-air)) tells its asker "Your request went out on the air". A request kept on the air ([prayer without ceasing](STATION_OPERATOR_GUIDE.md#prayer-without-ceasing)) sends no notice for its repeat sends; where it was heard still shows on the request.

## Prayers on the air (public page)

Off until Admin → Radio → "On-the-air page on" (`token_settings.on_air_page_enabled`). `/on-the-air` (and `/open-circle/on-the-air`, worded "Messages") shows how many prayers the station sent in the last 24 hours, 7 days and in all, how many listeners reported hearing, and the latest 20 bursts (time, count, air time, preset). Counts only: it never shows a prayer's words, who sent or asked for it, or anything about a listener. Simulated bursts and the log transmitter are left out.

## HF presets (shortwave SSB)

The FM presets assume a steady audio path. HF is different: the signal arrives by two or more paths through the ionosphere, so some carriers fade out (a notch every 1/delay Hz, moving as the paths drift), an SSB filter cuts the audio to about 300-2700 Hz, and two stations are rarely tuned to the same hertz. The `hf-` presets are built for that:

- **Carriers inside the SSB filter:** 46 carriers, 469-2578 Hz (bins 10-55).
- **DPSK with soft-decision FEC:** differential phase needs no channel estimate, so a fade costs nothing once it passes. The rate-1/2 (or 2/3) code and the golden-ratio interleaver spread each byte across the whole frame, so a notch costs scattered soft bits.
- **A coded header** (`header: 'coded'`): the same 32 header bytes go through the rate-1/2 code and the interleaver over 11 symbols, instead of 6 plain DBPSK symbols. On the simulated fading channels the plain header was what failed: a notch takes out the same bytes in every header symbol, more than Reed-Solomon can fix.
- **Tuning search:** a receiver tuned within about 5 Hz needs nothing. Further off, decode with `BURST_SEARCH_HZ=50 cli.js decode rx.wav` or tick "Shortwave (SSB) radio" on `/listen`. Either tries the audio shifted in 10 Hz steps up to 50 Hz either way (11 passes, so slower).

**Simulation.** `src/burst/hf-channel.ts` is the Watterson model with the CCIR Rec. 520 test channels: two equal-power paths, each with Rayleigh fading and a Gaussian Doppler spectrum. "Moderate" is 1 ms delay and 0.5 Hz spread; "poor" is 2 ms and 1 Hz. A 300-2700 Hz SSB filter and white noise are added. Results with 10 sample prayers per burst, 20 runs per point:

| Preset | Moderate, 12 dB | Poor, 12 dB | Moderate, 15 dB | Poor, 15 dB | Poor, 20 dB |
| --- | --- | --- | --- | --- | --- |
| `hf-robust` | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| `hf-standard` | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| `hf-fast` | 16/20 | 14/20 | 20/20 | 18/20 | 20/20 |
| `fm-robust-fec` (for comparison) | 11/20 | 9/20 | | | |

On a harsher channel (2 ms, 2 Hz Doppler), `hf-robust` still decoded 20/20 at 12 dB and `hf-standard` 19/20.

`BURST_SIM_HF=moderate` (or `quiet`, `poor`) runs simulate mode through this channel at `BURST_SIM_SNR_DB` (15 dB by default), with the receiver 20 Hz off and searching. The auto preset leaves HF presets out unless you list them: `BURST_AUTO_PRESETS=hf-robust,hf-standard,hf-fast`. A receiver's SNR report is its own measured SNR, so pick the margin with fading in mind (`BURST_AUTO_MARGIN_DB=6`).

Two receiver changes help every preset:
- The sync search now correlates with the sync symbol and its 90-degree turn and takes the magnitude, so a receiver that rotates the phase (any SSB receiver) finds frames as well as FM audio does.
- Receivers try the coded header whenever the plain one fails.

Both are receiver-only. Old receivers keep decoding FM frames, but they cannot read `hf-` frames.

## Auto preset

`BURST_PRESET=auto` lets a receiver steer the speed. A receiver that hears
the station measures the signal-to-noise ratio of every frame (from how far
each carrier lands from where it should, on the same 2.5 kHz scale as the
speed table; within about 1 dB in tests) and writes a channel report:

```
node dist/src/burst/cli.js decode rx.wav channel.json
```

```json
{ "snrDb": 21.4, "at": "2026-10-29T02:10:00.000Z", "callSign": "KD9XYZ", "preset": "fm-robust-fec" }
```

Before each burst the station reads the latest report (copy it to
`BURST_AUTO_REPORT`, or serve it at a URL) and sends on the fastest preset
in `BURST_AUTO_PRESETS` whose working SNR (`cli.js presets` shows it) plus
`BURST_AUTO_MARGIN_DB` is below the measurement. With no report, or one older
than `BURST_AUTO_MAX_AGE_MIN`, it uses the most robust preset in the list, so
a station that stops hearing back slows down rather than going silent. The
station log says which preset it picked and why.

In `simulate` mode the station is its own receiver: it writes the report
itself, so `BURST_MODE=simulate BURST_PRESET=auto BURST_SIM_SNR_DB=20` shows
the whole loop (first burst on `fm-robust-fec`, then the fastest preset that
fits 20 dB).

## Receiving (anyone can decode)

```sh
# Record from the receiver's audio (48 kHz mono), then decode
arecord -f S16_LE -r 48000 -c 1 -d 30 rx.wav
node apps/station/dist/src/burst/cli.js decode rx.wav

# Frames sent with BURST_MODE=fldigi: save fldigi's receive text, then
node apps/station/dist/src/burst/cli.js decode-text rx.txt

# Make a test burst from a text file (one prayer per line)
node apps/station/dist/src/burst/cli.js encode test.wav fm-standard < prayers.txt
```

Any recording rate works; the decoder resamples to 48 kHz. A WAV can be 8, 16, 24 or 32-bit PCM or 32 or 64-bit float, mono or stereo, which covers handheld recorders and Audacity's exports. A compressed WAV (ADPCM and the like) is refused with a message saying to save it as PCM or float.

The decoder is tested (`apps/station/test/robustness.test.ts`, `fuzz.test.ts`) against what real receivers do to a recording:

- **Level:** a burst recorded about 50 dB too quietly still decodes in full. An overdriven, hard-clipped one decodes what it can and never misreads.
- **Hum and DC:** 60 Hz mains hum and a DC offset from a cheap sound card don't matter.
- **Dropouts:** a few milliseconds of broken samples (NaN or Infinity, from a driver glitch) are treated as silence, so the error correction covers them and every prayer still decodes.
- **Two stations at once:** when two stations key up over each other, a prayer is never credited to the wrong call sign. Two bursts sent back to back with a tenth of a second between them are both heard.

## Format specification (version 1)

Everything needed to write an independent decoder.

### Frame bytes

```
header, 16 bytes, followed by 16 Reed-Solomon parity bytes:
  0-1   "PT"
  2     version, 1
  3     preset id (see the preset table below)
  4-6   message length L, big-endian
  7-14  call sign, ASCII, space padded
  15    flags, 0
message, L bytes:
  batch bytes, then the CRC-32 (IEEE, as zlib's crc32) of the batch, big-endian
batch:
  byte 0 = codec, then the codec's data
    0  plain ASCII
    1  raw DEFLATE (RFC 1951), with DICTIONARY_V1 as the preset dictionary
    2  Brotli (RFC 7932)
    3  context mixing (below), primed with PRIMER_V1 followed by DICTIONARY_V1
  the decoded text is the prayers separated by "\n"
payload:
  the message cut into B = ceil(L / (255 - P)) blocks of near-equal size
  (the first L mod B blocks get one extra byte), each followed by P parity
  bytes, then interleaved: byte 0 of every block, byte 1 of every block, ...
```

Reed-Solomon: GF(2^8) with primitive polynomial 0x11d, generator roots
alpha^0 ... alpha^(P-1), parity appended after the data. P is the preset's
parity (48 for fm-robust, 32 otherwise).

### Codec 3: context mixing

The reference is `apps/station/src/burst/cm.ts`. It uses only integer
arithmetic, so it gives the same bits on every machine. In outline:

- Data: the text length as a little-endian base-128 varint, then the output of
  a 32-bit binary arithmetic coder (the lpaq kind: 12-bit probabilities, bytes
  shifted out while the top bytes of the low and high bounds agree, one flush
  byte, and the reader pads with 0xFF).
- Each byte is coded most significant bit first. Seven models give a
  probability from a 2^18-slot table, indexed by a hash of their context and
  the bits of the byte so far. The contexts are: none; the last 1, 2, 3, 4 and
  6 bytes; and the current word plus the previous word (letters, lower-cased).
- Slot update: p += (bit - p) x 2/(2n + 3), where n is how often the slot was
  seen, capped at 60.
- Mixer: the stretched predictions and a bias are weighted (one weight set
  per partial byte) and squashed. Weights learn from the coding error.
- Before coding, encoder and decoder both run the model over the primer text,
  without output.

### Codec 4: context mixing version 2

The same coder and data layout as codec 3, with these differences (the `v === 2`
branches in `cm.ts`):

- Nine models: codec 3's seven, plus the current word alone and the two bytes
  before the last one (a sparse context).
- Three mixer weight sets per partial byte, picked by the last byte: a letter,
  a space, or anything else.
- An APM stage: the mixer's probability, stretched, picks two of 33 buckets in
  a table indexed by the last byte and the partial byte; the interpolated value
  r gives the final p = (mixer + 3r) / 4, and both buckets move toward the bit
  by their share (rate 1/64).
- Primer: PRIMER_V1, then PRIMER_V2_EXTRA, then DICTIONARY_V1.

### Codec 5: relay envelope

Not a compressor. Byte 1 is the hop count (1-3), byte 2 the origin call sign's
length n (3-10), then n ASCII bytes of the call sign, then the original batch
(codec byte first, never another envelope).

### Waveform

48,000 samples a second. Every symbol is a 1,024-point inverse FFT of the
carrier values (real output, Hermitian), preceded by a 128-sample cyclic
prefix: 1,152 samples, 24 ms. Carrier k sits at k x 46.875 Hz.

```
sync symbol       bins 16-63, known phases S
header symbols    bins 16-63, DBPSK, 6 symbols (256 bits; the last is zero padded);
                  HF presets 12-14: the 32 header bytes rate-1/2 coded and interleaved
                  (524 bits, below), 11 symbols
reference symbol  the preset's bins, known phases R
payload symbols   the preset's bins, differential PSK (or coherent QAM, presets 9-11)
```

| Preset | id | Bins | Bits per carrier per symbol | Parity P |
| --- | --- | --- | --- | --- |
| fm-robust | 1 | 16-63 | 1 | 48 |
| fm-standard | 2 | 16-63 | 2 | 32 |
| fm-fast | 3 | 16-63 | 3 | 32 |
| dataport-fast | 4 | 8-111 | 3 | 32 |
| fm-turbo | 5 | 12-66 | 4 | 32 |
| dataport-turbo | 6 | 8-111 | 4 | 32 |
| fm-robust-fec | 7 | 16-63 | 2 | 16, inner code rate 1/2 |
| fm-turbo-fec | 8 | 12-66 | 4 | 16, inner code rate 2/3 |
| fm-qam16 | 9 | 16-63 | 4 (16-QAM) | 16, inner code rate 3/4 |
| fm-qam64 | 10 | 12-66 | 6 (64-QAM) | 16, inner code rate 3/4 |
| dataport-qam64 | 11 | 8-111 | 6 (64-QAM) | 16, inner code rate 3/4 |
| hf-robust | 12 | 10-55 | 1 | 16, inner code rate 1/2, coded header |
| hf-standard | 13 | 10-55 | 2 | 16, inner code rate 1/2, coded header |
| hf-fast | 14 | 10-55 | 2 | 16, inner code rate 2/3, coded header |

- **Known phases.** xorshift32 (x ^= x << 13; x ^= x >> 17; x ^= x << 5),
  seeded with 0x50545331 for S and 0x50545232 for R. For each carrier, from
  the lowest bin up, step once and take phase = (top 2 bits) x 90° + 45°.
- **Bits to carriers.** Bytes are read most significant bit first, in groups
  of the preset's bits per symbol, and laid on carriers from the lowest bin up,
  symbol after symbol. The last symbol is zero padded.
- **Differential PSK.** For a group value g, the step s is the number whose
  Gray code (s XOR s>>1) is g. The carrier's phase is the previous symbol's
  phase plus s x 360° / 2^bits. The header is referenced to the sync symbol
  and the payload to the reference symbol.
- **Inner code (presets 7-14).** Before modulation, the payload bytes
  (most significant bit first) go through a constraint-length-7
  convolutional encoder with generators 171 and 133 (octal), starting in
  state 0 and flushed with six 0 bits. For each input bit the encoder emits
  the 171 output then the 133 output (neither inverted). Rate 2/3 keeps
  output bits by the repeating pattern 1, 1, 1, 0 (the 133 output of every
  second input bit is dropped), and rate 3/4 by 1, 1, 0, 1, 1, 0. The n coded bits are then scattered: coded
  bit i goes to position (i x q) mod n, where q is the first number at or
  above round(0.618034 x n) that shares no factor with n. The scattered bits
  are laid on carriers as in "Bits to carriers" and the last symbol is zero
  padded.
- **Coded header (presets 12-14).** The 32 header bytes (16 bytes and 16
  Reed-Solomon parity, as for every preset) go through the same rate-1/2
  encoder and the same scatter (n = 524), are laid on bins 16-63 one bit per
  carrier, and are sent as DBPSK referenced to the sync symbol: 11 symbols,
  the last zero padded. The receiver tries a plain header first and this one
  when the plain one fails its check; the preset id must agree with which
  one decoded.
- **Coherent QAM payload (presets 9-11).** Not differential. Carrier index
  k counts from 0 at the preset's first bin; carrier k is a pilot when
  k mod 6 = 0 or k is the last carrier, otherwise a data carrier. In payload
  symbol s (1 for the first after the reference symbol), a pilot has unit
  amplitude and phase R[k] + ((s x (k + 1)) mod 4) x 90°, where R is the
  reference symbol's phase. Data carriers, from the lowest up, take the
  scattered coded bits in groups of 4 (16-QAM) or 6 (64-QAM): the first half
  of each group is the in-phase level and the second half the quadrature
  level, each a Gray code (index i has code i XOR i>>1) for level
  2i - (L - 1), L = 4 or 8 levels, scaled so the constellation's average
  power is 1 (divide by sqrt(10) or sqrt(42)).
- **Level.** The frame is scaled to an RMS of 0.2 of full scale, with peaks
  limited to 0.95.
- **Between frames.** 50 ms of silence. A burst starts with 100 ms of silence.

A receiver finds the sync symbol by correlation, reads the header (whose bins
don't depend on the preset), then knows the preset and the payload length.
The reference decoder also tracks clock drift (from the phase slope across
carriers) and tuning error (from the common phase turn per symbol); these are
receiver choices, not part of the format.

## Notes for the legal department

- The format is fully published here and in the source code, and uses only
  openly documented standards (DEFLATE, Brotli, Reed-Solomon, the K=7
  convolutional code, OFDM with differential PSK or QAM with pilots). Compression is used to shorten transmissions, not to
  obscure their meaning; anyone can decode them with the published tool.
- The call sign travels in every frame header in plain ASCII.
- See [RADIO_STATION.md](RADIO_STATION.md) for the station's other rules
  (content filter, privacy, frequencies).

## Sources

- CCIR Rec. 520 HF test channels (two equal-power Rayleigh paths; poor = 2 ms, 1 Hz) and the Watterson tapped-delay-line model: [KC7WW, "A Low-Cost HF Channel Simulator for Testing and Evaluating HF Digital Systems", TAPR DCC 1999](https://web.tapr.org/meetings/DCC_1999/DCC1999-HFchannelSimulator-KC7WW.pdf)
- Watterson model with Gaussian Doppler spectra: [MathWorks, "HF Ionospheric Channel Models"](https://www.mathworks.com/help/comm/ug/hf-ionospheric-channel-models.html)
- Harsher test channels (good 0.5 ms / 0.1 Hz, poor 2 ms / 2 Hz): [NTIA ITS, "HF Simulator"](https://its.ntia.gov/publications/download/HF%20Simulator.pdf)
- SSB data passband 300-2700 Hz and the compressor off in DATA mode: [AB4OJ, "The DATA Mode in Icom HF Transceivers"](https://www.qsl.net/a/ab4oj/icom/datamode.html)
- VARA FM waveform (carrier spacing, symbol timing, carrier counts): [digirig, "Software modems in ham radio, Part 1"](https://digirig.net/software-modems-in-ham-radio-part-1-two-kinds-of-burst/)
- 9600 data port: [Wikipedia, "9600 port"](https://en.wikipedia.org/wiki/9600_port)
- Preset DEFLATE dictionaries: [Cloudflare blog](https://blog.cloudflare.com/improving-compression-with-preset-deflate-dictionary/)
- DEFLATE: [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951). Brotli: [RFC 7932](https://www.rfc-editor.org/rfc/rfc7932).
- Short-string compressors considered (Unishox2, Smaz, Shoco): [Unishox2](https://github.com/siara-cc/Unishox2)
- Convolutional code (K=7, generators 171/133, punctured rates): [CCSDS 131.0-B-3, TM Synchronization and Channel Coding](https://ecss.nl/wp-content/uploads/2020/04/CCSDS-131.0-B-3_forECSS(Draft-16Oct2019).pdf), [GNU Radio wiki, CC Encoder Definition](https://wiki.gnuradio.org/index.php/CC_Encoder_Definition)
- Pilot-aided channel estimation in OFDM: [NXP (Freescale) application note AN3059, "Channel Estimation in OFDM Systems"](https://community.freescale.com/docs/en/application-note/AN3059.pdf)
- Bell 202 AFSK, NRZI, HDLC flags, bit stuffing and FCS: [N1VG, "1200 Baud Packet Radio Details"](https://www.n1vg.net/packet/)
- AX.25 control and PID values (UI 0x03, no layer 3 0xF0): [Linux include/net/ax25.h](https://www.kernelsources.org/source/xref/linux/include/net/ax25.h)
- APRS status reports (data type `>`) and the APZxxx experimental destination: [APRS Protocol Reference 1.0.1](https://www.aprs.org/doc/APRS101.PDF)
- Context mixing and the lpaq family: [Matt Mahoney, Large Text Compression Benchmark](https://mattmahoney.net/dc/text.html)
