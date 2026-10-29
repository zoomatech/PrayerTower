// Turn a skin file (docs/skin-template.json) into a migration that adds the theme row:
//   npm run skin:add -- path/to/skin.json [--name my_skins]
// The file holds one skin or a list of them. Each is checked first (allowed tokens only,
// readable comment colors), so a bad file stops here instead of in production.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { skinMigration, SkinFile } from '../modules/skins/index.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const nameAt = args.indexOf('--name');
if (!file) {
  console.error('usage: npm run skin:add -- <skin.json> [--name label]');
  process.exit(1);
}
const raw: unknown = JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8'));
const skins = Array.isArray(raw) ? raw : [raw];
let sql: string;
try {
  sql = skins.map((s) => skinMigration(s)).join('\n');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
const label = nameAt >= 0 ? args[nameAt + 1]! : `skin_${SkinFile.parse(skins[0]).slug.replace(/-/g, '_')}`;
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const out = join(import.meta.dirname, '../../../../supabase/migrations', `${stamp}_${label}.sql`);
writeFileSync(out, sql);
console.log(`wrote ${out}\nApply it locally with \`npx supabase db reset\`; it reaches production with the next deploy.`);
