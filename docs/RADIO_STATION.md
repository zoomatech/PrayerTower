# Radio station

Radio prayers can go out as PSK31 from a Raspberry Pi 4 or an old laptop running
[fldigi](http://www.w1hkj.com/) next to an amateur transceiver. This follows
`Queue-to-PSK31_Build_Paper.docx` in the project files (October 20, 2026), which
has the legal background, parts list and sources.

The flow:

1. A member sends a request as a radio prayer. It's queued in Prayer Tower.
2. The **station worker** (`apps/station`) claims one prayer at a time over the API.
3. The worker filters the text, folds it to ASCII, and splits it into pieces that each end with `de <CALL SIGN>`.
4. It sends each piece through fldigi's local XML-RPC server.
5. It reports the result, and the poster is told their request went out.

Until the station is switched on, the placeholder transmitter only logs.

**Burst mode** sends a whole batch of prayers, compressed, in one short burst (30 prayers in under 2 seconds on an FM radio). It is off by default; see [RADIO_BURST.md](RADIO_BURST.md).

## Rules the software enforces

| Rule | What Prayer Tower does |
| --- | --- |
| 97.113(a)(2)-(3): no transmissions for payment | By default the station only receives prayers while **Admin → Tokens → Radio prayers are free** is on. Admin → Radio → "Station sends only while radio prayers are free" controls this; keep it on for an amateur station. |
| 97.113(a)(4): no obscene, indecent or false messages | Only requests that are visible and have no pending moderation are sent. Removed and sensitive requests are skipped. The station also checks a blocklist before anything reaches fldigi. |
| 97.119: call sign at the end and every 10 minutes | Every piece ends with `de CALL`. Pieces are at most 500 characters, about 2 minutes at roughly 50 words a minute. |
| 97.221: automatic control on 6 m or higher | Set the radio to 6 m or higher, e.g. 50.290, 144.144 or 432.2 MHz (USB). |
| Privacy | The station only ever gets the request text, never a name. |

Two questions are still open before running unattended (see the paper):
- Does an unattended one-way queue fit the 97.203 beacon or another 97.111(b) provision? Ask the ARRL or the FCC.
- How does the control operator's responsibility apply to third-party text?

## Prayers by need

Steve's model (2026-10-28): "from each according to his generosity, to each according to his need." Members donate Priestly tokens to the shared fund, and nobody buys a transmission. With radio prayers free (Admin → Tokens), Admin → Radio → "Which prayer goes out next" → **By need** has the station take the most urgent queued request first. Ties go to the request with the fewest people praying, then to the oldest. **First in, first out** is the default (`token_settings.radio_order`).

## Server setup

1. Generate a key with `openssl rand -hex 32` and set `STATION_API_KEY` on the API server (see `apps/server/.env.example`).
2. In the app: **Admin → Radio → Radio station**, and **Admin → Tokens → Radio prayers are free**.

## Station setup (Pi or laptop)

For a station that runs as a service, use the installer: see [RADIO_STATION_INSTALL.md](RADIO_STATION_INSTALL.md). To run it by hand:

```bash
# Node 22 and fldigi installed; fldigi's XML-RPC server is on by default at 127.0.0.1:7362
git clone https://github.com/zoomatech/PrayerTower.git && cd PrayerTower
npm ci && npm run build -w @prayer-tower/station
PRAYER_TOWER_API_URL=https://api.example.org \
STATION_API_KEY=<the key from the server> \
CALL_SIGN=<your call sign> \
npm start -w @prayer-tower/station
```

Optional settings:

| Variable | Default | Meaning |
| --- | --- | --- |
| `FLDIGI_URL` | `http://127.0.0.1:7362/RPC2` | Keep fldigi on this machine: its XML-RPC server has no authentication |
| `MODEM` | `BPSK31` | fldigi modem name |
| `POLL_SECONDS` | `10` | How often to check for queued prayers |
| `TX_TIMEOUT_SECONDS` | `180` | Longest wait for one piece; after this the worker calls `main.rx_only` and stops |
| `MAX_PIECE_CHARS` | `500` | Characters per piece before ` de CALL` |
| `BLOCKLIST_FILE` | none | Extra blocked words, one per line |

If a transmission fails or times out, the worker disables transmit, reports the failure and exits, so a person can check the station first. It exits with code 3, which the installed service does not restart. If the API is unreachable, the worker waits and tries again.

## Bring-up (from the build paper)

1. Pass the Technician exam, and wait until your call sign appears in the FCC database.
2. Install fldigi, and set the sound card and rig control (Hamlib, flrig or RigCAT).
3. Connect the interface and radio to a **dummy load**. Send an idle PSK31 signal and set the audio level so the ALC doesn't act.
4. Tune to a PSK31 frequency in your band, in USB.
5. Check that `main.get_trx_status` returns strings starting with `rx` and `tx` on your install. The worker relies on the `rx` prefix.
6. Run the worker with `CALL_SIGN=N0CALL` into the dummy load, and decode the output on a second receiver.
7. Do the RF exposure evaluation under 97.13(c), then connect the antenna and use your real call sign.

## Tests

`npm test -w @prayer-tower/station` runs the paper's acceptance tests against a mock fldigi:
- A blocklisted message never reaches `text.add_tx`.
- "Señor Núñez" is sent as "Senor Nunez" followed by the call sign.
- If fldigi never returns to receive, the worker calls `rx_only` within the timeout.
- Long messages are split, and every piece ends with the call sign.
- Nothing is sent when the queue is empty.

## Amplify

Amplify sends one prayer several times. The number of sends is the admin setting **Radio → Amplify** (placeholder 3, range 2–50). The claim response carries `repeats`, and the worker sends the same call-signed pieces that many times.

**Price.** Amplify is free while radio prayers are free (`radio_funding = free`). While radio prayers cost tokens, Amplify is off until an admin sets a price: **Admin → Tokens → Amplify price** (`token_settings.amplify_paid_cost`, in Priestly tokens). The app then shows "Amplify (N Priestly tokens)" to members who have enough. Clearing the field turns paid Amplify off again.

**For the licensing and legal side.** 47 CFR 97.113 restricts tying an amateur transmission to payment. Whether paid Amplify may go on the air, and through which kind of station, is a decision for the licensing and legal side; the switch is built so it can be turned on or left off. The station's own "only send while free" setting still holds paid prayers back (see above).

**"1,000x a second".** The notebook asks for 1,000 sends a second. That is not possible on PSK31, which sends about one 280-character prayer a minute. A faster mode or a different transmitter is roadmap open question 1.
