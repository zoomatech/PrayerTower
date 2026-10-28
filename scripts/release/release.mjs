#!/usr/bin/env node
// Changelog, release notes and version bumps, generated from the pull requests
// merged into main (git history, so it works offline and needs no token).
//
//   npm run changelog                      # rewrite CHANGELOG.md (unreleased PRs on top)
//   npm run release -- patch|minor|major   # or an exact version, e.g. 1.2.0
//
// `release` sets the user-facing version everywhere (app.json and every
// package.json), moves the unreleased PRs under that version in CHANGELOG.md,
// and writes docs/release-notes/v<version>.md with store-ready drafts. Build
// numbers are not touched: EAS manages them (appVersionSource "remote",
// autoIncrement in eas.json). Then commit, tag v<version> and push the tag.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_URL = 'https://github.com/zoomatech/PrayerTower';
const APP_JSON = 'apps/mobile/app.json';
const PACKAGES = ['apps/mobile', 'apps/server', 'apps/station', 'apps/e2e', 'packages/shared'].map((p) => `${p}/package.json`);
// Store limits: App Store Connect "What's New in This Version" is 4000
// characters; Google Play release notes are 500 Unicode characters per language.
const APP_STORE_LIMIT = 4000;
const PLAY_LIMIT = 500;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const writeJson = (p, v) => writeFileSync(join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);

/** Merged PRs reachable from `ref`, oldest first: { number, title, date, sha }. */
export function mergedPrs(ref = 'HEAD', since = null) {
  const range = since ? `${since}..${ref}` : ref;
  const out = git('log', '--first-parent', '--reverse', '--format=%H%x1f%cs%x1f%s%x1f%b%x1e', range);
  const prs = [];
  for (const rec of out.split('\x1e')) {
    const [sha, date, subject, body = ''] = rec.trim().split('\x1f');
    if (!sha) continue;
    let m = /^(.*) \(#(\d+)\)$/.exec(subject); // squash merge
    if (m) {
      prs.push({ number: Number(m[2]), title: m[1], date, sha });
      continue;
    }
    m = /^Merge pull request #(\d+) from /.exec(subject); // merge commit: title is the body's first line
    if (m) prs.push({ number: Number(m[1]), title: body.trim().split('\n')[0] || subject, date, sha });
  }
  return prs;
}

/** Version tags (v1.2.3), oldest first. */
function versionTags() {
  const tags = git('tag', '--list', 'v*', '--sort=v:refname').split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  return tags.map((tag) => ({ tag, version: tag.slice(1), date: git('log', '-1', '--format=%cs', tag) }));
}

const line = (pr) => `- ${pr.title} ([#${pr.number}](${REPO_URL}/pull/${pr.number}))`;

/** The whole changelog. `next` names the version the unreleased PRs go under. */
export function changelog(next = null) {
  const tags = versionTags();
  const sections = [];
  let prev = null;
  for (const t of tags) {
    sections.unshift({ heading: `## ${t.version} (${t.date})`, prs: mergedPrs(t.tag, prev) });
    prev = t.tag;
  }
  const unreleased = mergedPrs('HEAD', prev);
  const today = new Date().toISOString().slice(0, 10);
  sections.unshift({ heading: next ? `## ${next} (${today})` : '## Unreleased', prs: unreleased });
  const body = sections
    .map((s) => `${s.heading}\n\n${s.prs.length ? [...s.prs].reverse().map(line).join('\n') : '- No merged pull requests.'}`)
    .join('\n\n');
  return {
    unreleased,
    text: `# Changelog\n\nGenerated from the pull requests merged into main by \`npm run changelog\`. Do not edit by hand; edit the PR titles instead.\n\n${body}\n`,
  };
}

function nextVersion(current, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [maj, min, pat] = current.split('.').map(Number);
  if (how === 'major') return `${maj + 1}.0.0`;
  if (how === 'minor') return `${maj}.${min + 1}.0`;
  if (how === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Use patch, minor, major or an exact version like 1.2.0 (got "${how}")`);
}

/** Keep whole bullet lines that fit within `limit` characters. */
export function fit(lines, limit, more = (n) => `- And ${n} more improvements.`) {
  const kept = [];
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const tail = i < lines.length - 1 ? more(lines.length - i - 1).length + 1 : 0;
    if (used + lines[i].length + 1 + tail > limit) {
      kept.push(more(lines.length - i));
      break;
    }
    kept.push(lines[i]);
    used += lines[i].length + 1;
  }
  return kept.join('\n');
}

export function releaseNotes(version, prs) {
  const titles = [...prs].reverse().map((p) => `- ${p.title}`);
  const appStore = fit(titles, APP_STORE_LIMIT);
  const play = fit(titles, PLAY_LIMIT - '<en-US>\n\n</en-US>'.length);
  return `# Prayer Tower ${version}

Generated by \`npm run release\` from ${prs.length} merged pull ${prs.length === 1 ? 'request' : 'requests'}. Edit the store text below into plain language for members before pasting it in, and add the Spanish versions.

## Merged pull requests

${prs.length ? [...prs].reverse().map(line).join('\n') : '- None.'}

## App Store Connect: What's New in This Version (up to ${APP_STORE_LIMIT} characters)

${appStore || '- Bug fixes and improvements.'}

## Google Play: release notes (up to ${PLAY_LIMIT} characters per language)

\`\`\`
<en-US>
${play || '- Bug fixes and improvements.'}
</en-US>
<es-US>
[Spanish release notes]
</es-US>
\`\`\`

## Checklist

- [ ] Commit, then tag: \`git tag -a v${version} -m "Prayer Tower ${version}"\` and \`git push origin v${version}\`
- [ ] Build: \`eas build --profile production --platform all\` (EAS sets the build numbers)
- [ ] Paste the store text above (both languages) into App Store Connect and Play Console
`;
}

function main([cmd, arg]) {
  if (cmd === 'changelog') {
    writeFileSync(join(ROOT, 'CHANGELOG.md'), changelog().text);
    console.log('Wrote CHANGELOG.md');
    return;
  }
  if (cmd === 'release') {
    if (!arg) throw new Error('usage: npm run release -- patch|minor|major|<x.y.z>');
    const app = readJson(APP_JSON);
    const version = nextVersion(app.expo.version, arg);
    if (versionTags().some((t) => t.version === version)) throw new Error(`v${version} is already tagged`);
    app.expo.version = version;
    writeJson(APP_JSON, app);
    for (const p of PACKAGES) {
      if (!existsSync(join(ROOT, p))) continue;
      const pkg = readJson(p);
      pkg.version = version;
      writeJson(p, pkg);
    }
    const { text, unreleased } = changelog(version);
    writeFileSync(join(ROOT, 'CHANGELOG.md'), text);
    mkdirSync(join(ROOT, 'docs/release-notes'), { recursive: true });
    const notes = `docs/release-notes/v${version}.md`;
    writeFileSync(join(ROOT, notes), releaseNotes(version, unreleased));
    console.log(`Version ${version}: updated ${APP_JSON}, ${PACKAGES.length} package.json files and CHANGELOG.md; wrote ${notes}.`);
    console.log(`Next: npm install (to update package-lock.json), commit, then git tag -a v${version} -m "Prayer Tower ${version}" && git push origin v${version}`);
    return;
  }
  throw new Error('usage: release.mjs changelog | release <patch|minor|major|x.y.z>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
