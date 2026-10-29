# First day on the air

A checklist for the station's first day, start to finish. Tick each box before moving on. The
[control operator quick start](CONTROL_OPERATOR_QUICK_START.md) and the
[station operator guide](STATION_OPERATOR_GUIDE.md) have the detail behind each step.

The station's settings live in `/etc/prayer-tower-station.env`. After any change there, run:

```
sudo systemctl restart prayer-tower-station
```

To watch what the station is doing, keep this running in a second window on the station computer:

```
journalctl -u prayer-tower-station -f
```

## Before you start

- [ ] You have the **Radio operator** role (Me shows **Operator console**).
- [ ] In Admin → Radio, the transmitter is set to **Station**, and **Setup wizard**, **Operator
      console**, **Operator alerts** and **Station alerts** are on.
- [ ] Your call sign is in the settings file: `CALL_SIGN=K1ABC` (your own).
- [ ] You know the frequency you'll use, and it is set on the radio (or in `RIG_FREQ_HZ` with rig
      control).

## 1. Hardware hookup

- [ ] Radio **off** while you connect anything.
- [ ] **Dummy load** on the antenna socket. No antenna yet.
- [ ] USB sound card interface (for example a Digirig) plugged into the station computer, and its
      radio cable into the radio's **data port** (6-pin mini-DIN) or the speaker/mic jack.
- [ ] The interface shows up: `aplay -l` lists a USB card, and `ls /dev/ttyUSB*` shows its serial
      port.
- [ ] PTT keeper is running: `systemctl status prayer-tower-rigctld` says **active (running)**.
- [ ] Radio menu settings
      ([section 1](STATION_OPERATOR_GUIDE.md#1-radio-settings)):
  - [ ] Compressor / speech processor **off**
  - [ ] Data port speed **1200** (for the `fm-` presets)
  - [ ] APRS and packet features **off**
  - [ ] VOX **off**
  - [ ] Power **low**
- [ ] A second receiver (scanner, handheld or SDR) tuned to the same frequency, squelch just above
      the noise. Or a phone with `/listen` open, held near that receiver's speaker.

## 2. Practice mode (nothing keyed)

- [ ] In the settings file: `BURST_MODE=simulate`. Restart the station.
- [ ] The log shows the station checking in, with no errors.
- [ ] Admin → Radio → Setup wizard → **Send a test burst**. Within about 10 seconds the log shows
      a burst written to a WAV file and says **a receiver decodes** it.
- [ ] Queue one real test prayer for the radio from the app. The log shows it sent and decoded,
      and the operator console log shows it as **transmitted**.
- [ ] Optional: add `BURST_SIM_SNR_DB=10` and restart, to watch it cope with a noisy signal. Take
      the line out again afterwards.
- [ ] Press **Hold all transmissions** in the console, queue a prayer, and check nothing goes out.
      Press **Resume** and it goes.

Practice mode never touches the radio. Every change to the app runs this same path in its tests
(the server's `station-practice.test.ts`, and the burst robustness tests in
[RADIO_BURST.md](RADIO_BURST.md#robustness)).

## 3. First real keyed test (into the dummy load)

- [ ] Radio on, power low, dummy load still on.
- [ ] In the settings file: `BURST_MODE=audio`, plus the PTT and play lines from
      [section 3](STATION_OPERATOR_GUIDE.md#3-push-to-talk) (the setup wizard's step 1 writes
      them for your radio). Restart the station. It unkeys the radio as it starts; the log shows no "could not unkey" line.
- [ ] Setup wizard → **Play a 10-second test tone**. The radio keys, you hear the tone on the
      second receiver, and the radio unkeys after 10 seconds.
- [ ] Set the transmit level while the tone plays
      ([section 2](STATION_OPERATOR_GUIDE.md#2-sound-card-levels)): raise it until the second
      receiver stops getting louder, then back it off a little. Leave it there.
- [ ] Setup wizard → **Send a test burst**. The radio keys for about a second and unkeys.
- [ ] It decoded: the wizard shows a listener that heard it, or `/listen` on the phone shows
      "Station test", or tap **I decoded it on another device**.
- [ ] Queue one test prayer. The console log shows it **transmitted**, and the second receiver
      decodes the words.
- [ ] If it didn't decode: compressor off, level down a bit, squelch opening fast enough, then try
      `fm-robust-fec` (`BURST_PRESET=fm-robust-fec`).

## 4. Station ID timing

- [ ] In the settings file: `STATION_ID=cw` and `STATION_ID_MINUTES=10`. Restart the station.
- [ ] Send a test burst. At the end of the key-up you hear your call sign in Morse
      (`DE K1ABC`) on the second receiver.
- [ ] Send another test burst straight away. No Morse this time, because 10 minutes haven't
      passed.
- [ ] The operator console's **Station ID** line shows the next ID time, about 10 minutes after
      the first one.
- [ ] After 10 minutes, send one more test. The Morse ID comes back.

Every burst frame also carries the call sign in digital form, so the decoder on `/listen` always
shows it.

## 5. Antenna and on the air

- [ ] Radio off. Swap the dummy load for the antenna. Radio back on, power still low.
- [ ] Send a test burst. The second receiver (or a listener node) decodes it.
- [ ] Raise the power to what you plan to use, then send one more test.
- [ ] Choose the preset: start with `fm-robust-fec` and move up one step at a time
      ([which preset](STATION_OPERATOR_GUIDE.md#4-which-preset)). Stay one step below the fastest
      one that decodes every time.
- [ ] If listeners are mobile or on handhelds, stay on `fm-robust-fec` or `fm-qam16`: those hold up
      best when the signal flutters ([RADIO_BURST.md](RADIO_BURST.md#robustness)).

## End of the day

- [ ] Operator console: status reads as you expect, the queue is empty or moving, and the recent
      bursts read **sent**.
- [ ] To stop for the night, press **Hold all transmissions** (⌘. in the Mac console). Prayers wait
      in the queue until you press **Resume**.
- [ ] If anything keyed and wouldn't stop: press **Hold**, run
      `sudo systemctl restart prayer-tower-station` (it unkeys as it starts), and if it still
      transmits, switch the radio off.
