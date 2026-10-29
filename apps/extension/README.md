# Prayer Tower Cross-posting (browser extension)

When the member clicks Post on facebook.com or threads.com, this extension sends the same words, photos and videos to their own Prayer Tower or Open Circle account. Chrome (Manifest V3). Safari on Mac, iPhone and iPad uses the same files through Apple's packager.

- `src/capture.js`: finds the composer, its text and photo previews (tested in `test/capture.test.mjs`)
- `src/content.js`: runs on Facebook and Threads and captures the post at the moment Post is clicked
- `src/background.js`: sends it to the server, and queues and retries when offline
- `src/options.html`, `src/options.js`: the server address and the member's key
- `scripts/build.mjs`: builds the Prayer Tower or Open Circle edition into `dist/`; `scripts/safari.sh`: the Safari app for iPhone, iPad and Mac (on a Mac with Xcode)

Setup, publishing and the Safari steps are in [docs/CROSSPOST.md](../../docs/CROSSPOST.md). Run the tests with `npm test -w @prayer-tower/extension`.
