// Writes docs/archive/SPANISH_REVIEW_CHECKLIST.md: every Spanish string in the app,
// beside its English, for a native speaker to check. Run after adding strings:
//   npx tsx scripts/i18n/spanish-review.ts
import { readFileSync, writeFileSync } from 'node:fs';
import * as shared from '../../packages/shared/src/index.js';
import en from '../../apps/mobile/src/locales/en.js';
import es from '../../apps/mobile/src/locales/es.js';

type Tree = { [k: string]: string | Tree };
const flat = (t: Tree, prefix = ''): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : flat(v, `${prefix}${k}.`)));
// Markdown table cell: escape backslashes first, then pipes; newlines become <br>.
const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');

const enMap = new Map(flat(en as unknown as Tree));
const { enums, ...esApp } = es as unknown as Tree & { enums: Record<string, Record<string, string>> };
const esRows = flat(esApp as Tree);

const out: string[] = [];
let total = 0;
const sections = new Map<string, [string, string][]>();
for (const row of esRows) {
  const section = row[0].split('.')[0]!;
  sections.set(section, [...(sections.get(section) ?? []), row]);
}

// Enum labels: English comes from the *_LABELS tables in packages/shared.
const enumEnglish: Record<string, Record<string, string> | undefined> = {
  moderationRule: Object.fromEntries(Object.entries(shared.MODERATION_RULES).map(([k, v]) => [k, typeof v === 'string' ? v : (v as { label: string }).label])),
  postType: shared.POST_TYPE_LABELS,
  prayerKind: shared.PRAYER_KIND_LABELS,
  prayerRealm: shared.PRAYER_REALM_LABELS,
  action: shared.ACTION_LABELS,
  whyHere: shared.WHY_HERE_LABELS,
  frequency: shared.FREQUENCY_LABELS,
  careKind: shared.CARE_KIND_LABELS,
  eventKind: shared.EVENT_KIND_LABELS,
};

// Notification templates (server): the Spanish text lives in code, so list each template's source.
const i18nSrc = readFileSync('apps/server/src/modules/notifications/i18n.ts', 'utf8');
const esBlock = i18nSrc.slice(i18nSrc.indexOf('const es: Record'), i18nSrc.indexOf('const catalogs'));
const templates = [...esBlock.matchAll(/^ {2}([a-z_]+): \(/gm)].map((m, i, all) => {
  const end = all[i + 1]?.index ?? esBlock.lastIndexOf('};');
  return { key: m[1]!, src: esBlock.slice(m.index, end).trim().replace(/,$/, '') };
});
const nouns = i18nSrc.slice(0, i18nSrc.indexOf('const es: Record'));
const nounLiterals = [...nouns.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1]!, m[2]!]);

const device = JSON.parse(readFileSync('apps/mobile/languages/es.json', 'utf8')) as Record<string, Record<string, string>>;

for (const rows of sections.values()) total += rows.length;
for (const g of Object.values(enums)) total += Object.keys(g).length;
for (const g of Object.values(device)) total += Object.keys(g).length;
total += templates.length + nounLiterals.length;

out.push(
  '# Spanish review checklist',
  '',
  `Every Spanish string in Prayer Tower, beside the English, for a native Spanish speaker to check before release. ${total} items. Generated from the code by \`npx tsx scripts/i18n/spanish-review.ts\`; regenerate it after strings change, and don't edit the tables by hand.`,
  '',
  '## How to review',
  '',
  '- **Audience:** Latin American Spanish, neutral, using **tú** (not usted or vos). The readers are Christians from many churches, praying for each other.',
  '- **For each line:** tick the box if the Spanish is right. If it isn\'t, write your wording in the **Correction** column.',
  '- **Check:**',
  '  - The meaning matches the English.',
  '  - The tone is warm and plain.',
  '  - The Christian vocabulary is natural (petición, orar, testimonio, iglesia aliada).',
  '  - Buttons stay short.',
  '- **Placeholders:** leave anything like `%{name}` exactly as it is. The app fills it in.',
  '- **Words used across the app; please confirm them once:**',
  '  - "fichas" for tokens',
  '  - "Sacerdotales" for Priestly (tokens)',
  '  - "Orando ahora" for Praying Now',
  '  - "Prometer orar" for Commit to Pray',
  '  - "Equipo Testigo" for the Witness team',
  '  - "Iglesia aliada" for church partner',
  '- **Corrections:** send them back as this file with the Correction column filled in, or as comments. A developer copies them into `apps/mobile/src/locales/es.ts`.',
  '',
  '## Contents',
  '',
  '1. App screens (by section)',
  '2. Labels (post types, kinds of prayer, actions…)',
  '3. Phone system text',
  '4. Notifications',
  '5. Website, legal pages and store listing (read as whole pages)',
  '',
  '## 1. App screens',
  '',
);
for (const [section, rows] of sections) {
  out.push(`### ${section} (${rows.length})`, '', '| ✓ | Key | English | Español | Correction |', '| --- | --- | --- | --- | --- |');
  for (const [key, value] of rows) out.push(`| ☐ | \`${key}\` | ${cell(enMap.get(key) ?? '(English comes from the server)')} | ${cell(value)} | |`);
  out.push('');
}
out.push('## 2. Labels', '');
for (const [group, labels] of Object.entries(enums)) {
  out.push(`### ${group}`, '', '| ✓ | Value | English | Español | Correction |', '| --- | --- | --- | --- | --- |');
  for (const [k, v] of Object.entries(labels)) out.push(`| ☐ | \`${k}\` | ${cell(enumEnglish[group]?.[k] ?? '')} | ${cell(v)} | |`);
  out.push('');
}
out.push('## 3. Phone system text', '', 'Shown by iOS and Android outside the app (app name, permission prompts).', '', '| ✓ | Key | Español | Correction |', '| --- | --- | --- | --- |');
for (const [platform, entries] of Object.entries(device)) for (const [k, v] of Object.entries(entries)) out.push(`| ☐ | \`${platform}.${k}\` | ${cell(v)} | |`);
out.push(
  '',
  '## 4. Notifications',
  '',
  'Push notices and the Notices tab, for members whose app is in Spanish. Values in `${…}` are filled in by the app: `p.who` is a name, `p.excerpt` the start of a request, `p.church` a church name, `p.note` a note from staff.',
  '',
  '### Words used inside notices',
  '',
  '| ✓ | Key | Español | Correction |',
  '| --- | --- | --- | --- |',
  ...nounLiterals.map(([k, v]) => `| ☐ | \`${k}\` | ${cell(v)} | |`),
  '',
);
for (const t of templates) out.push(`- [ ] **${t.key}**`, '', '  ```ts', ...t.src.split('\n').map((l) => `  ${l}`), '  ```', '');
out.push(
  '## 5. Website, legal pages and store listing',
  '',
  'Read each one as a whole page.',
  '',
  '- [ ] Website home: `/es` (the text is in `apps/server/src/modules/site/index.ts`, `es` block)',
  '- [ ] Support: `/es/support`',
  '- [ ] Privacy policy: `/es/privacy`, from `docs/legal/PRIVACY_POLICY_DRAFT.es.md`. A lawyer reviews the English first.',
  '- [ ] Terms of use: `/es/terms`, from `docs/legal/TERMS_OF_USE_DRAFT.es.md`',
  '- [ ] Account deletion page: `/es/account-deletion`',
  '- [ ] Google Play release notes (es-419): `docs/store/WHATS_NEW.md`',
  '- [ ] Store listing in Spanish, if it goes live: `docs/store/STORE_LISTING.md`',
  '',
);
writeFileSync('docs/archive/SPANISH_REVIEW_CHECKLIST.md', out.join('\n'));
console.log(`docs/archive/SPANISH_REVIEW_CHECKLIST.md: ${total} items`);
