# Code health: types, lint, unused code and coverage

CI runs all four on every pull request. Run them locally with the same commands.

| Check | Command | Fails CI when |
|---|---|---|
| TypeScript (every package) | `npm run typecheck` | Any type error |
| ESLint | `npm run lint` | Any error. Warnings are listed but don't fail. |
| Knip: unused files, dependencies and exports | `npm run knip` | Anything unused, or a package used but not listed |
| Server test coverage | `npm run coverage` (needs `npm run db:start`) | Lines, statements or functions under 80%, or branches under 70% |

## TypeScript

Every package uses `strict`, plus these stricter checks: `noUncheckedIndexedAccess` (reading `list[i]` or `map[key]` may give `undefined`), `noImplicitReturns`, `noImplicitOverride` and `noFallthroughCasesInSwitch`. The end-to-end tests (`apps/e2e`) now have their own `tsconfig.json` and are type-checked too.

## ESLint

- **Server, station, shared package, e2e tests and scripts:** `eslint.config.mjs` at the root, with ESLint's recommended rules and typescript-eslint's recommended rules ([typescript-eslint: Getting started](https://typescript-eslint.io/getting-started/)). Unused variables are errors unless their names start with `_`. Tests may use `any` for JSON answers.
- **The app:** `apps/mobile/eslint.config.js`, using Expo's preset `eslint-config-expo/flat` ([Expo: Using ESLint](https://docs.expo.dev/guides/using-eslint/)).
- **React Compiler warnings (about 60).** The app has the React Compiler on (`app.json`). Expo's preset includes its rules, such as "Cannot access refs during render". A component that breaks one still works the same. The compiler just doesn't optimize it. Most of the warnings come from the usual `useRef(new Animated.Value(0)).current` animation pattern in the feed layouts and the celebration. They are warnings for now. Fix them one screen at a time, each with a check on a device, then turn the rules back to errors in `apps/mobile/eslint.config.js`.

## Unused code (Knip)

`knip.json` lists the entry points Knip can't find by itself: the Android widget (loaded with `require` on Android), the web service-worker config and the server's command-line scripts. `ignoreExportsUsedInFile` lets a file export something it also uses itself.

Removed in this pass:

- `invites.redemptionCounts()` on the server: never called.
- `feedback.open()` on the server: never called (the admin screen uses `list`).
- The `Card` type and the `MEDIA_BUCKET` re-export in `posts`: never used.
- `offlineState()` in the app: never called.
- The unused `q` argument of the commitment reminder task.

Kept on purpose: `expo-glass-effect` in the app. The app's code doesn't import it, but Expo Router depends on it and it has native code. Removing it from the app's list hasn't been tried on a native build, so it stays until someone checks that build. Added because code used them without listing them: `pg` and `typescript` in `apps/e2e`, `typescript` in `packages/shared`, and `playwright` at the root (the icon script).

## Coverage

The server tests run with Vitest's V8 coverage ([Vitest: Coverage](https://vitest.dev/guide/coverage)). The thresholds are in `apps/server/vitest.config.ts` ([coverage.thresholds](https://vitest.dev/config/coverage)). Each CI run writes a summary to the run's page and keeps the HTML report for 14 days as the `server-coverage` artifact. Locally, open `apps/server/coverage/index.html`.

On 2026-10-28, across all of `apps/server/src`:

| | Covered |
|---|---|
| Lines | 84.1% |
| Statements | 81.7% |
| Functions | 90.5% |
| Branches | 72.4% |

These figures include the command-line scripts (seed, load test, query audit, push test, grant role) and the two process entry points (`server.ts` and `worker.ts`). Tests don't run those, and they make up most of the uncovered lines. The app code itself is mostly above 90%. A new test, `notification-i18n.test.ts`, checks that every notification the server sends has Spanish text, with and without its optional details.
