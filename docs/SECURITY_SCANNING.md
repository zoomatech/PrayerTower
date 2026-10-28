# Dependency and security scanning

| What | Where | When | Fails the build |
|---|---|---|---|
| **npm audit** | `audit` job in `.github/workflows/ci.yml` | Every pull request and push to `main` | A high or critical advisory in the server, station or shared packages' production dependencies, or a critical one anywhere |
| **CodeQL** (`security-extended` queries, JavaScript/TypeScript, no build) | `.github/workflows/codeql.yml` | Pull requests to `main`, pushes to `main`, and Mondays 06:30 UTC | Results go to Security → Code scanning; GitHub can block merges on new alerts if a ruleset asks for it |
| **Dependabot** version updates | `.github/dependabot.yml` | Mondays, against `main` | Opens grouped pull requests (npm minor/patch, dev dependencies, GitHub Actions); CI runs on each |

Sources: [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference), [npm audit](https://docs.npmjs.com/cli/commands/npm-audit), [CodeQL action](https://github.com/github/codeql-action).

## Why the app's audit is looser

The remaining advisories on 2026-10-28 (`zod` < 4.6.6 and `deepmerge` inside `@expo/cli` and `@expo/config`) sit in Expo's build tooling, which runs on the build machine and is not shipped in the app. `npm audit fix --force` would downgrade Expo to SDK 51. They go away when Expo updates its CLI; take that with `npx expo install --fix`. The server's own `zod` is 4.6.7 or later and is not affected.

## Expo packages and Dependabot

Expo SDK packages must move together, so Dependabot skips major updates of `expo` and `expo-*` and minor or major updates of `react-native`. Upgrade those with `npx expo install expo@<sdk> --fix`.

## Settings to turn on in GitHub (one time, repository owner)

1. **Settings → General → Default branch:** the default branch is `claude/project-thread-x8bjyl`, not `main`. Switch it to `main`. GitHub reads `dependabot.yml` from the default branch ([GitHub: About the dependabot.yml file](https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file)) and runs CodeQL's weekly schedule only there, so neither starts until this is done.
2. **Settings → Advanced Security:** turn on Dependabot alerts, Dependabot security updates and secret scanning with push protection. All are free for public repositories.
