// The ad-free, tracker-free promise as code (docs/NO_ENSHITTIFICATION.md). Each
// check fails CI when a change starts to add ads, trackers or ad-style data, so
// the change can't land quietly: loosening a rule means editing this file, and
// that edit shows in the pull request for everyone to read.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from './helpers.js';

afterAll(() => db.end());

const ROOT = join(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// Ad networks, ad attribution, and analytics or session-replay services that
// profile people. Matched against every installed package, direct or not.
const BANNED = [
  /google-mobile-ads/,
  /admob/i,
  /fbsdk/i,
  /facebook-(android|ios)-sdk/,
  /^react-native-fbads/,
  /appsflyer/i,
  /^react-native-adjust$/,
  /^@adjust\//,
  /^react-native-branch$/,
  /^branch-sdk$/,
  /kochava/i,
  /^@singular/,
  /^singular-react-native$/,
  /^@segment\//,
  /^analytics-node$/,
  /mixpanel/i,
  /amplitude/i,
  /posthog/i,
  /^@heap/,
  /hotjar/i,
  /fullstory/i,
  /logrocket/i,
  /smartlook/i,
  /^@react-native-firebase\/analytics$/,
  /^@firebase\/analytics/,
  /^firebase-analytics/,
  /tracking-transparency/,
  /braze/i,
  /clevertap/i,
  /moengage/i,
  /applovin/i,
  /unity-ads/i,
  /ironsource/i,
  /chartboost/i,
  /vungle/i,
  /inmobi/i,
  /^react-native-google-tag/,
];
// Installed only as part of another tool, and never turned on (the check below proves it).
const ALLOWED = new Set(['workbox-google-analytics']);

function installed(): string[] {
  const lock = JSON.parse(read('package-lock.json')) as {
    packages: Record<string, unknown>;
  };
  return [
    ...new Set(
      Object.keys(lock.packages)
        .map((k) => k.split('node_modules/').pop()!)
        .filter(Boolean),
    ),
  ];
}

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(join(ROOT, path)).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

describe('no ads, no trackers', () => {
  it('installs no ad, attribution or analytics package', () => {
    expect(installed().filter((p) => !ALLOWED.has(p) && BANNED.some((b) => b.test(p)))).toEqual([]);
  });

  it("keeps workbox's Google Analytics module switched off", () => {
    expect(read('apps/mobile/workbox-config.js')).not.toMatch(/offlineGoogleAnalytics/);
  });

  it("tells Apple the app doesn't track, and never asks to", () => {
    const app = JSON.parse(read('apps/mobile/app.json')).expo;
    expect(app.ios.privacyManifests.NSPrivacyTracking).toBe(false);
    expect(app.ios.privacyManifests.NSPrivacyTrackingDomains).toEqual([]);
    expect(app.ios.infoPlist?.NSUserTrackingUsageDescription).toBeUndefined();
    expect(JSON.stringify(app.plugins ?? [])).not.toMatch(/tracking-transparency/);
    expect(JSON.stringify(app.android ?? {})).not.toMatch(/AD_ID/);
  });

  it('loads no outside scripts in pages members see', () => {
    // A script loaded from another site can track readers. (The staff-only API docs, behind
    // API_DOCS_PASSWORD, load Swagger UI from jsDelivr through a constant and aren't caught here.)
    const pages = [...files('apps/server/src', /\.ts$/), ...files('apps/mobile/src', /\.tsx?$/), 'apps/mobile/public/index.html'].filter((p) =>
      /<script[^>]*\bsrc=["'`]?(https?:)?\/\//i.test(read(p)),
    );
    expect(pages).toEqual([]);
  });

  it('stores no ad, advertising-ID or tracking data', async () => {
    // ad_fines and ad_fine_settings exist to fine people who post ads (docs/AD_FINES.md).
    const { rows } = await db.query<{ what: string }>(
      `select table_name || '.' || column_name as what from information_schema.columns
        where table_schema = 'public' and table_name not in ('ad_fines', 'ad_fine_settings')
          and (table_name ~ '(^|_)(ad|ads|advert\\w*|sponsored|promoted|tracking|tracker)(_|$)'
            or column_name ~ '(^|_)(ad|ads|advert\\w*|sponsored|promoted|idfa|gaid|advertising_id|tracking|tracker)(_|$)')`,
    );
    expect(rows.map((r) => r.what)).toEqual([]);
  });
});
