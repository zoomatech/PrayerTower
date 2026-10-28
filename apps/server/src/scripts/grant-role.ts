// Bootstrap roles from the command line (e.g. the first admin):
//   npm run grant-role -- steve@example.com admin
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';
import { grantRole, type Role } from '../modules/accounts/index.js';

const [email, role] = process.argv.slice(2);
const ROLES: Role[] = ['admin', 'moderator', 'pastor_counselor', 'prayer_partner', 'witness'];
if (!email || !role || !ROLES.includes(role as Role)) {
  console.error(`usage: npm run grant-role -- <email> <${ROLES.join('|')}>`);
  process.exit(1);
}

loadDotEnv();
const db = createPool(loadConfig().DATABASE_URL);
const { rows } = await db.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [email]);
if (!rows[0]) {
  console.error(`no account with email ${email}; sign up first`);
  process.exit(1);
}
await grantRole(db, rows[0].id, role as Role, null);
console.log(`granted ${role} to ${email}`);
await db.end();
