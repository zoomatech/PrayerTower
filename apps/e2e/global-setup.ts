// Every run starts from a clean LOCAL database with fresh demo members.
// This wipes local data: `supabase db reset` reapplies the migrations.
import { execSync } from 'node:child_process';

export default function globalSetup() {
  const root = { cwd: '../..', stdio: 'inherit' as const };
  const env = execSync('npx supabase status -o env', { cwd: '../..', encoding: 'utf8' });
  const secret = process.env.SUPABASE_SECRET_KEY ?? env.match(/^SECRET_KEY="?([^"\n]+)"?/m)?.[1];
  const dbUrl = env.match(/^DB_URL="?([^"\n]+)"?/m)?.[1] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  if (!secret) throw new Error('Start Supabase first (npm run db:start).');
  if (process.env.E2E_SKIP_DB_RESET !== '1') {
    execSync('npx supabase db reset', root);
    // The reset drops the job queue's schema; put it back so a running API keeps working.
    execSync(`npx graphile-worker -c "${dbUrl}" --schema-only`, root);
  }
  execSync('npm run seed:demo', { ...root, env: { ...process.env, SUPABASE_SECRET_KEY: secret } });
}
