# Prayer Tower Cross-posting (browser extension)

When the member clicks Post on facebook.com or threads.com, this extension sends the same words and photos to their own Prayer Tower account. Chrome (Manifest V3). Safari on Mac, iPhone and iPad uses the same files through Apple's packager.

- `src/capture.js`: finds the composer, its text and photo previews (tested in `test/capture.test.mjs`)
- `src/content.js`: runs on Facebook and Threads and captures the post at the moment Post is clicked
- `src/background.js`: sends it to the server, and queues and retries when offline
- `src/options.html`, `src/options.js`: the server address and the member's key

Setup, publishing and the Safari steps are in [docs/CROSSPOST.md](../../docs/CROSSPOST.md). Run the tests with `npm test -w @prayer-tower/extension`.
