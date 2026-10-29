# Radio burst mode

Burst mode sends many prayers at once. The station claims a batch, compresses
the whole batch together, and sends it as one short burst of audio in a single
key-up. A one-prayer PSK31 piece takes about a minute; a burst carries 30
prayers in under 2 seconds on an ordinary FM radio.

It is **off by default** (`BURST_MODE=off`), and the station keeps working as
the PSK31 sender described in [RADIO_STATION.md](RADIO_STATION.md).

## Measured speed

From `node dist/src/burst/cli.js bench` and the tests in
`apps/station/test/burst.test.ts`. The 30 hand-written sample requests
(`test/fixtures/sample-prayers.ts`, 2,724 characters) compress to 967 bytes, or
about 32 bytes a prayer.

| Preset | Radio hookup | Raw rate | 30 sample prayers | Works down to (SNR in 2.5 kHz) |
| --- | --- | --- | --- | --- |
| `fm-robust` | Any FM radio's mic and speaker audio | 2.0 kbit/s | 5.0 s | about 6 dB |
| `fm-standard` (default) | Any FM radio's mic and speaker audio | 4.0 kbit/s | 2.5 s | about 10-12 dB |
| `fm-fast` | FM audio, strong clean signal | 6.0 kbit/s | 1.7 s | about 16 dB |
| `dataport-fast` | The radio's 9600 data port, or an SDR | 13 kbit/s | 0.9 s | about 18-20 dB |

A full-quieting FM signal is far above these numbers, so `fm-fast` is the
normal choice once the link is known to be solid. Bigger batches compress
better, because later prayers reuse the words of earlier ones: 100 prayers fit
in about 3.7 s on `fm-standard` and 2.6 s on `fm-fast` in the benchmark.

## How it fits that much

1. **Batch compression.** The prayers are folded to ASCII, joined with
   newlines, and compressed together. The station tries three openly published
   formats and keeps the smallest: plain text, raw DEFLATE
   ([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951)) primed with a preset
   dictionary of common prayer words (the technique in
   [Cloudflare's write-up](https://blog.cloudflare.com/improving-compression-with-preset-deflate-dictionary/)),
   and Brotli ([RFC 7932](https://www.rfc-editor.org/rfc/rfc7932)), which has
   a built-in English dictionary. The dictionary is published in
   `apps/station/src/burst/dictionary.ts`.
2. **Error correction.** The compressed batch gets a CRC-32 and is cut into
   Reed-Solomon blocks over GF(256) (the RS(255,223) family), interleaved so a
   noise burst is spread over all blocks.
3. **Many tones at once.** The audio is OFDM: 48 to 104 carriers 46.875 Hz
   apart, each carrying 1 to 3 bits per 24 ms symbol with differential PSK.
   This is the same layout that [VARA FM uses](https://digirig.net/software-modems-in-ham-radio-part-1-two-kinds-of-burst/)
   (48 kHz sound card, 1,024-point FFT, 46.875 Hz spacing, 21.3 ms symbol plus
   a 1/8 guard). Differential phase needs no channel estimate, so the radio's
   filters, pre-emphasis and de-emphasis don't need to be measured. A radio's
   [9600 data port](https://en.wikipedia.org/wiki/9600_port) skips those
   filters, which is why `dataport-fast` can use twice the bandwidth.

## Station settings

In `/etc/prayer-tower-station.env` (see `apps/station/install/station.env.example`):

| Setting | Default | Meaning |
| --- | --- | --- |
| `BURST_MODE` | `off` | `off` (PSK31, one prayer at a time), `audio`, `fldigi` or `simulate` |
| `BURST_PRESET` | `fm-standard` | One of the presets above (`cli.js presets` lists them) |
| `BURST_MAX_PRAYERS` | `50` | Most prayers claimed per burst. The server also caps it at Admin → Radio → burst size (`radio_batch_max`, default 1). |
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

To turn it on: set Admin → Radio → burst size above 1, set `BURST_MODE` (start with `simulate`), and run `sudo systemctl restart prayer-tower-station`.

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

Any recording rate works; the decoder resamples to 48 kHz.

## Format specification (version 1)

Everything needed to write an independent decoder.

### Frame bytes

```
header, 16 bytes, followed by 16 Reed-Solomon parity bytes:
  0-1   "PT"
  2     version, 1
  3     preset id (1 fm-robust, 2 fm-standard, 3 fm-fast, 4 dataport-fast)
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
  the decoded text is the prayers separated by "\n"
payload:
  the message cut into B = ceil(L / (255 - P)) blocks of near-equal size
  (the first L mod B blocks get one extra byte), each followed by P parity
  bytes, then interleaved: byte 0 of every block, byte 1 of every block, ...
```

Reed-Solomon: GF(2^8) with primitive polynomial 0x11d, generator roots
alpha^0 ... alpha^(P-1), parity appended after the data. P is the preset's
parity (48 for fm-robust, 32 otherwise).

### Waveform

48,000 samples a second. Every symbol is a 1,024-point inverse FFT of the
carrier values (real output, Hermitian), preceded by a 128-sample cyclic
prefix: 1,152 samples, 24 ms. Carrier k sits at k x 46.875 Hz.

```
sync symbol       bins 16-63, known phases S
header symbols    bins 16-63, DBPSK, 6 symbols (256 bits; the last is zero padded)
reference symbol  the preset's bins, known phases R
payload symbols   the preset's bins, differential PSK
```

| Preset | id | Bins | Bits per carrier per symbol | Parity P |
| --- | --- | --- | --- | --- |
| fm-robust | 1 | 16-63 | 1 | 48 |
| fm-standard | 2 | 16-63 | 2 | 32 |
| fm-fast | 3 | 16-63 | 3 | 32 |
| dataport-fast | 4 | 8-111 | 3 | 32 |

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
- **Level.** The frame is scaled to an RMS of 0.2 of full scale, with peaks
  limited to 0.95.
- **Between frames.** 50 ms of silence. A burst starts with 100 ms of silence.

A receiver finds the sync symbol by correlation, reads the header (whose bins
don't depend on the preset), then knows the preset and the payload length.

## Notes for the legal department

- The format is fully published here and in the source code, and uses only
  openly documented standards (DEFLATE, Brotli, Reed-Solomon, OFDM with
  differential PSK). Compression is used to shorten transmissions, not to
  obscure their meaning; anyone can decode them with the published tool.
- The call sign travels in every frame header in plain ASCII.
- See [RADIO_STATION.md](RADIO_STATION.md) for the station's other rules
  (content filter, privacy, frequencies).

## Sources

- VARA FM waveform (carrier spacing, symbol timing, carrier counts): [digirig, "Software modems in ham radio, Part 1"](https://digirig.net/software-modems-in-ham-radio-part-1-two-kinds-of-burst/)
- 9600 data port: [Wikipedia, "9600 port"](https://en.wikipedia.org/wiki/9600_port)
- Preset DEFLATE dictionaries: [Cloudflare blog](https://blog.cloudflare.com/improving-compression-with-preset-deflate-dictionary/)
- DEFLATE: [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951). Brotli: [RFC 7932](https://www.rfc-editor.org/rfc/rfc7932).
- Short-string compressors considered (Unishox2, Smaz, Shoco): [Unishox2](https://github.com/siara-cc/Unishox2)
