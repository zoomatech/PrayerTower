# Radio station install guide (Raspberry Pi or Debian laptop)

This guide sets up the Prayer Tower station worker as a service that starts at boot, checks its own health every five minutes and keeps its logs to a fixed size. What the station does and the radio rules are in [RADIO_STATION.md](RADIO_STATION.md).

## What you need

- A Raspberry Pi 4 or 5 (or any Debian or Ubuntu laptop) running **Raspberry Pi OS with desktop**. The current release is based on Debian 13 "trixie" [1]. The desktop is needed for fldigi.
- A radio, a sound card interface and a **dummy load** for the first tests.
- The station key from the server (`POST /admin/stations` on the server makes one, see RADIO_STATION.md).
- Your call sign. Until it appears in the FCC database, use `N0CALL` into the dummy load only.

## 1. Flash and update the Pi

1. Write Raspberry Pi OS (64-bit, with desktop) to the SD card with Raspberry Pi Imager [2]. In the Imager settings, set the user name, Wi-Fi and turn on SSH.
2. Boot the Pi, open a terminal and update:

```bash
sudo apt update && sudo apt full-upgrade -y && sudo reboot
```

## 2. Get the code and run the installer

The quickest way is one command, which fetches the code and runs the
installer below (details in [STATION_OPERATOR_GUIDE.md](STATION_OPERATOR_GUIDE.md#one-command-install)):

```bash
curl -fsSL https://raw.githubusercontent.com/zoomatech/PrayerTower/main/apps/station/install/get-station.sh | sudo bash -s -- --hamlib --fldigi
```

Or by hand:

```bash
sudo apt install -y git
git clone https://github.com/zoomatech/PrayerTower.git
cd PrayerTower
sudo apps/station/install/install.sh --fldigi
```

The installer:

- installs Node.js 22 from NodeSource when the system Node.js is older (Debian's own package is too old for the worker) [3][5];
- installs fldigi from apt (only with `--fldigi`);
- builds the worker and copies it to `/opt/prayer-tower-station`;
- creates the `prayer-station` system user, which runs the worker;
- writes the settings file `/etc/prayer-tower-station.env` (only if it doesn't exist, readable by root and `prayer-station` only);
- installs the `prayer-tower-station` service, a health-check timer, and a journal limit of 200 MB and one month [4].

Leave out `--fldigi` if fldigi is already installed. Run the same command again later to update: it rebuilds, keeps your settings and restarts the worker.

## 3. Fill in the settings

```bash
sudo nano /etc/prayer-tower-station.env
```

Set at least `PRAYER_TOWER_API_URL`, `STATION_API_KEY` and `CALL_SIGN`. The other values and their meaning are in the table in RADIO_STATION.md.

## 4. Set up fldigi

fldigi is a desktop program, so it runs as you, not as a service.

1. Open fldigi from the menu and complete its setup: sound card, rig control (Hamlib, flrig or RigCAT) and your call sign [6].
2. Its XML-RPC server is on by default at `127.0.0.1:7362`. Keep it on this machine: it has no password.
3. Start fldigi at login by adding it to the desktop's autostart folder, which the Pi desktop reads at login [7]:

```bash
mkdir -p ~/.config/autostart
cp /usr/share/applications/fldigi.desktop ~/.config/autostart/
```

4. Set the Pi to log in to the desktop automatically (Raspberry Pi Configuration, System, Auto login), so fldigi is running after a power cut.

## 5. Dummy-load test

With the radio on the dummy load and `CALL_SIGN=N0CALL`, follow the bring-up steps in RADIO_STATION.md, then start the worker:

```bash
sudo systemctl start prayer-tower-station
journalctl -u prayer-tower-station -f
```

Decode the output on a second receiver. When it's clean, do the RF exposure evaluation, connect the antenna and set your real call sign, then `sudo systemctl restart prayer-tower-station`.

## Day to day

| Task | Command |
| --- | --- |
| Is it running? | `systemctl status prayer-tower-station` |
| Watch the log | `journalctl -u prayer-tower-station -f` |
| Run the health check now | `sudo -u prayer-station node /opt/prayer-tower-station/dist/src/health.js` |
| Health check history | `journalctl -u prayer-tower-station-health` |
| Stop transmitting | `sudo systemctl stop prayer-tower-station` |
| Update | `git pull && sudo apps/station/install/install.sh` |
| Remove | `sudo apps/station/install/install.sh --uninstall` |
| Why didn't a burst decode? | `node /opt/prayer-tower-station/dist/src/burst/cli.js diagnose rx.wav` ([RADIO_BURST.md](RADIO_BURST.md#diagnose-a-weak-signal)) |

**The health check** looks at three things: the worker finished a loop recently, the Prayer Tower API answers, and fldigi answers and is in receive or transmit. Each failure is a `FAIL` line in the health log.

**After a failed transmission** the worker turns transmit off, reports the failure and stops with exit code 3. systemd does not restart it after exit code 3 (`RestartPreventExitStatus=3`) [8], so a person checks the station first. Then start it again with `sudo systemctl start prayer-tower-station`. Any other crash restarts after 30 seconds, at most five times in ten minutes.

**Logs** go to the system journal, kept on disk (`Storage=persistent`), at most 200 MB (`SystemMaxUse`) and one month (`MaxRetentionSec`) [4]. The limit is in `/etc/systemd/journald.conf.d/prayer-station.conf`.

Burst mode, listener nodes, the packet fallback, health alerts and the other
station features are in [STATION_OPERATOR_GUIDE.md](STATION_OPERATOR_GUIDE.md#features-at-a-glance).

## Files

| File | Purpose |
| --- | --- |
| `apps/station/install/install.sh` | Installer, updater and `--uninstall` |
| `apps/station/install/prayer-tower-station.service` | The worker service, locked down (no home access, read-only system) [9] |
| `apps/station/install/prayer-tower-station-health.{service,timer}` | Health check, 2 minutes after boot then every 5 minutes [10] |
| `apps/station/install/journald-prayer-station.conf` | Journal size and age limit |
| `apps/station/install/station.env.example` | Settings template |

## Sources

1. Raspberry Pi, "Trixie, the new version of Raspberry Pi OS": https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/
2. Raspberry Pi documentation, Getting started (Raspberry Pi Imager): https://www.raspberrypi.com/documentation/computers/getting-started.html
3. NodeSource distributions (Node.js 22 setup on Debian, amd64, armhf and arm64): https://github.com/nodesource/distributions
4. systemd, journald.conf: https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html
5. Debian trixie nodejs package: https://packages.debian.org/trixie/nodejs
6. fldigi help and setup: https://www.w1hkj.org/FldigiHelp/
7. freedesktop.org Desktop Application Autostart Specification: https://specifications.freedesktop.org/autostart-spec/latest/
8. systemd.service (`Restart=`, `RestartPreventExitStatus=`): https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
9. systemd.exec (sandboxing options): https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
10. systemd.timer: https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html
