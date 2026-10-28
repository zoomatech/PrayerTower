# Native app tests (Maestro)

These flows drive the real iOS or Android app on a simulator or phone. The web build is covered by Playwright in `apps/e2e`.

| Flow | What it checks |
|---|---|
| `01-sign-in.yaml` | A wrong password is refused, and the right one signs in |
| `02-post.yaml` | Carol posts a prayer request and sees it in the feed |
| `03-pray.yaml` | Ethel taps Praying Now and gets the confirmation |
| `04-messages.yaml` | Carol sends Ethel a message |

`subflows/sign-in.yaml` is shared by the flows.

## Run them

1. **Install Maestro.** It needs Java 17 or newer ([install guide](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)):
   ```
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   ```
2. **Start the local stack and load the demo members** from the repo root:
   ```
   npm run db:start
   npm run seed:demo
   npm run dev:api
   ```
3. **Install a development build** on an iOS simulator with `npx expo run:ios` in `apps/mobile`. On Android, use an emulator and `npx expo run:android`. Point it at the local API (`EXPO_PUBLIC_API_URL=http://localhost:3000`).
4. **Run the flows:**
   ```
   cd apps/mobile
   maestro test .maestro/
   ```
   - One flow: `maestro test .maestro/03-pray.yaml`
   - Another member: `maestro test -e EMAIL=ruth@demo.prayertower.local .maestro/02-post.yaml`
   - A staging build: `-e APP_ID=com.zoomatech.prayertower.staging`
   - A JUnit report: `--format=JUNIT --output=maestro-report.xml`

The demo password is `praying-demo-1`, the seed default. Each run posts new text, because the server refuses the same request twice in a day.

The flows find fields by `testID` (`sign-in-email`, `sign-in-password`, `sign-in-submit`, `compose-body`, `compose-post`, `message-input`, `message-send`) and everything else by the English text on screen. They haven't been run on a device yet; the first run on Steve's Mac may need small fixes.
