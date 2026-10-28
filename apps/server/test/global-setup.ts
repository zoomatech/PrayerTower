import pg from 'pg';
import { loadConfig } from '../src/config.js';

// helpers.ts turns new-member limits off for tests; put the shipped defaults back afterwards.
export async function teardown() {
  const client = new pg.Client({ connectionString: loadConfig().DATABASE_URL });
  await client.connect();
  await client.query(
    'update public.safety_settings set new_member_limits_enabled = true, new_member_hours = 24, new_member_min_prayers = 5, new_member_posts_per_day = 3, new_member_comments_per_day = 10, new_member_links_allowed = false',
  );
  await client.end();
}
