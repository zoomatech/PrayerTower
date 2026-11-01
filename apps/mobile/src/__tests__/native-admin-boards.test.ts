// The native app's admin switchboards (apps/ios-native, Admin → Settings) come from this app's
// admin screen: each section's switches and number fields, read from admin.tsx, with the
// endpoints from api.ts. Regenerate with
//   npm run native-strings -w @prayer-tower/mobile
// (scripts/mac-build-native.sh does it before each Mac build). A stale copy is not an error
// here, so a change to the admin screen never fails another pull request.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(__dirname, '..');
const OUT = join(__dirname, '../../../ios-native/Sources/PrayerTowerKit/Resources/admin-boards.json');

/** Sections that are only switches and numbers. Radio and kindness sections live on their own screens. */
const SECTIONS = [
  // Circles and Groups first: Steve wants them easy to find (2026-10-31).
  'CirclesAndGroupsSection',
  'NotebookSettingsSection',
  'GrowthSettingsSection',
  'MessagingSettingsSection',
  'CareAndEventSettingsSection',
  'ConversationSettingsSection',
  'PracticeSettingsSection',
  'ResolutionSettingsSection',
  'PilotToolsSection',
  'GivingSplitSection',
  'LiveSection',
  'SpokenPrayerSection',
  'AwardSection',
  'AiSection',
];

type Toggle = { label: string; hint: string | null; field: string; patch: string };
type Num = { label: string; field: string; patch: string };
type Board = { id: string; title: string; intro: string | null; get: string; patch: string; toggles: Toggle[]; numbers: Num[] };

function body(src: string, name: string) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

function endpoints(api: string, getter: string) {
  const get = new RegExp(`\\b${getter}: \\(\\) =>\\s*get<[\\s\\S]*?>\\('([^']+)'\\)`).exec(api)?.[1];
  const update = `update${getter[0]!.toUpperCase()}${getter.slice(1)}`;
  const m = new RegExp(`\\b${update}: \\([\\s\\S]*?request<[\\s\\S]*?>\\('(PATCH|PUT)', '([^']+)'`).exec(api);
  return get && m ? { get, method: m[1]!, patch: m[2]! } : null;
}

export function adminBoards(): Board[] {
  const admin = readFileSync(join(APP, 'app/admin.tsx'), 'utf8');
  const api = readFileSync(join(APP, 'lib/api.ts'), 'utf8');
  const boards: Board[] = [];
  for (const name of SECTIONS) {
    const src = body(admin, name);
    if (!src) continue;
    const title = /type\.heading\}>\{t\('([^']+)'/.exec(src)?.[1];
    if (!title) continue;
    const intro = /type\.heading\}>\{t\('[^']+'\)\}<\/Text>\s*<Text style=\{type\.small\}>\{t\('([^']+)'\)\}/.exec(src)?.[1] ?? null;
    // Each save function patches one endpoint: const saveEv = (patch: Parameters<typeof api.admin.updateEventSettings>…
    const saves = new Map<string, { getter: string; text: string }>();
    const defs = [...src.matchAll(/const (save\w*) = \(patch[^)]*?typeof api\.admin\.update(\w+)>/g)];
    defs.forEach((d, i) => {
      const end = defs[i + 1]?.index ?? src.indexOf('return (');
      saves.set(d[1]!, { getter: `${d[2]![0]!.toLowerCase()}${d[2]!.slice(1)}`, text: src.slice(d.index, end) });
    });
    const groups = new Map<string, { toggles: Toggle[]; numbers: Num[] }>();
    const group = (save: string) => {
      if (!groups.has(save)) groups.set(save, { toggles: [], numbers: [] });
      return groups.get(save)!;
    };
    for (const m of src.matchAll(/<Toggle\s+label=\{t\('([^']+)'[^}]*\}\s+(?:hint=\{t\('([^']+)'\)\}\s+)?value=\{\w+\.(\w+)\}\s+onChange=\{\(v\) => (save\w*)\(\{ (\w+): v \}\)\}/g)) {
      group(m[4]!).toggles.push({ label: m[1]!, hint: m[2] ?? null, field: m[3]!, patch: m[5]! });
    }
    // Number fields: <Field label={t('x')} keyboardType="number-pad" value={days} …/>, with
    // setDays(String(x.field)) and, in a save function, { patchKey: toInt(days) }.
    for (const m of src.matchAll(/<Field label=\{t\('([^']+)'\)\} keyboardType="number-pad" value=\{(\w+)\}/g)) {
      const v = m[2]!;
      const setter = `set${v[0]!.toUpperCase()}${v.slice(1)}`;
      const field = new RegExp(`${setter}\\(String\\(\\w+\\.(\\w+)\\)\\)`).exec(src)?.[1];
      for (const [save, def] of saves) {
        const patch = new RegExp(`(\\w+): toInt\\(${v}\\)`).exec(def.text)?.[1];
        if (field && patch) group(save).numbers.push({ label: m[1]!, field, patch });
      }
    }
    for (const [save, g] of groups) {
      const getter = saves.get(save)?.getter;
      const ep = getter ? endpoints(api, getter) : null;
      if (!getter || !ep || ep.method !== 'PATCH') continue;
      // Two sections can save to one endpoint (Circles and Groups, and Growth practices): keep ids unique.
      boards.push({ id: boards.some((b) => b.id === getter) ? name : getter, title, intro, get: ep.get, patch: ep.patch, ...g });
    }
  }
  return boards;
}

describe('native admin switchboards', () => {
  const boards = adminBoards();
  if (process.env.WRITE_NATIVE_STRINGS) writeFileSync(OUT, `${JSON.stringify(boards, null, 1)}\n`);

  it('reads the notebook switches from the admin screen', () => {
    const notebook = boards.find((b) => b.id === 'notebookSettings');
    expect(notebook?.patch).toBe('/admin/notebook-settings');
    expect(notebook?.toggles.find((t) => t.patch === 'prayerListEnabled')?.field).toBe('prayer_list_enabled');
    expect(notebook?.numbers.find((n) => n.patch === 'thanksCardDays')?.field).toBe('thanks_card_days');
  });

  it('are committed for the native app', () => {
    const committed = JSON.parse(readFileSync(OUT, 'utf8')) as Board[];
    expect(committed.length).toBeGreaterThan(0);
  });
});
