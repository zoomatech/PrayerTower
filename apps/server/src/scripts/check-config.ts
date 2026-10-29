// Checks the server's settings before go-live (scripts/go-live.sh --check), so a
// bad value such as a short STATION_API_KEY stops the deploy instead of the server.
//   npm run check-config
// Reads the environment or .env. Prints setting names only, never their values.
import { configProblems, loadDotEnv } from '../config.js';

loadDotEnv();
const problems = configProblems();
if (problems.length) {
  console.error(`These settings would stop the server from starting:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Server settings are valid.');
