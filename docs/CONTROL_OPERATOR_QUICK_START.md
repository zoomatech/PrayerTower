# Control operator quick start

This is a one-page start for the station's control operator (Ginni). Every step links to the full
[station operator guide](STATION_OPERATOR_GUIDE.md), which has the detail.
For the first day itself, tick through the [first day on the air checklist](FIRST_DAY_ON_AIR.md).

## Before day one (an admin does this)

1. **Your account:** Admin → People → you → add the **Radio operator** role. You can also run
   `npm run grant-role -- <your email> radio_operator`.
2. **Switches** in Admin → Radio:
   - **Setup wizard on**
   - **Operator console on**
   - **Operator alerts**
   - **Station alerts**
   - **Health page**

   Leave everything else off until the station is sending well.
3. **Transmitter:** in Admin → Radio, set the transmitter to **Station**.

## Day one: from nothing to a burst on the air

1. **Install the station** on the Pi with the
   [one-command install](STATION_OPERATOR_GUIDE.md#one-command-install). Add `--hamlib` if the radio
   takes rig control.
2. **Wire it:** radio, USB sound card interface with PTT, and a dummy load
   ([what you need](STATION_OPERATOR_GUIDE.md#what-you-need)). Set the radio as
   [section 1](STATION_OPERATOR_GUIDE.md#1-radio-settings) says, with the compressor off and fast squelch.
3. **Run a dry run first:** set `BURST_MODE=simulate` in `/etc/prayer-tower-station.env`, then run
   `sudo systemctl restart prayer-tower-station`. Watch it with `journalctl -u prayer-tower-station -f`.
4. **Use the setup wizard** (Admin → Radio → Setup wizard):
   1. **Pick the radio.** The wizard writes the settings lines. Copy them to the Pi and restart.
   2. **Play the test tone.** Set the sound card level. Overdrive is the most common fault.
   3. **Send a test burst** into the dummy load first.
   4. **Confirm it decoded,** on a listener node or on `/listen` on a phone near a second receiver.
5. **Switch to real audio:** set `BURST_MODE=audio` and restart. Queue one test prayer and watch it
   in the console log.
6. **Choose a preset:** start robust and move up one step at a time
   ([which preset](STATION_OPERATOR_GUIDE.md#4-which-preset)). Stay one step below the fastest preset
   that decodes every time.

## Every day: the operator console (Me → Operator console)

| Check | Looks right when |
| --- | --- |
| Status | It says "on the air" inside your transmission windows. |
| Station ID timer | The next ID time is in the future for every station. |
| Queue | The oldest prayer has waited less than your overdue limit (30 minutes by default). The next 10 are listed in the real send order. |
| Log | The recent bursts read **sent**, and most read **heard**. |

The console has two buttons:

- **Hold all transmissions** stops the station being handed anything new until you press **Resume**.
- **Send for 15 / 30 / 60 min** sends outside the windows for that long.

Both are recorded in Admin → Audit log.

## When an alert comes in

| Alert | First thing to try |
| --- | --- |
| No sound card | Re-seat the USB interface, then `sudo systemctl restart prayer-tower-station`. |
| The radio did not key (PTT) | Check the PTT cable and that rigctld is running (`systemctl status prayer-tower-rigctld`). If the radio is stuck transmitting, press **Hold** first, then run `sudo systemctl restart prayer-tower-station`, which unkeys the radio as it starts. If it still transmits, switch the radio off. |
| The last burst failed | The station has stopped itself. Read the error on the Health page, fix it, then restart the station. |
| A burst is overdue | Check whether the station is held, outside its windows, or not reporting. |
| The station stopped reporting | Check that the Pi is powered and online. Then run `journalctl -u prayer-tower-station -n 50`. |

The station already protects against the worst faults by itself:

- It unkeys after every burst, even a failed one.
- It unkeys when it starts and before it exits on a crash.
- A listener node keeps its reports through an internet outage or a power cut and sends them when it's back.

You can check a weak signal offline with the
[diagnose tool](STATION_OPERATOR_GUIDE.md#diagnose-a-weak-signal), using a recording from any receiver.

## Turn on later, one at a time

Turn these on once the station has run cleanly for a few days. Each has a section in the guide.

- [Reception beacon](STATION_OPERATOR_GUIDE.md#reception-beacon)
- [Listener nodes](STATION_OPERATOR_GUIDE.md#listener-nodes-receive-only-real-data-for-the-auto-preset)
- [Fair air](STATION_OPERATOR_GUIDE.md#fair-air)
- [Where it was heard](STATION_OPERATOR_GUIDE.md#where-it-was-heard)
- [My signal queue](STATION_OPERATOR_GUIDE.md#my-signal-queue)
- [Scheduled radio sends](STATION_OPERATOR_GUIDE.md#scheduled-radio-sends)
- [Prayer without ceasing](STATION_OPERATOR_GUIDE.md#prayer-without-ceasing)
- [Dish and sky target](STATION_OPERATOR_GUIDE.md#dish-and-sky-target)
