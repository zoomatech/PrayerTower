// ESLint for the app, from Expo's preset (`npm run lint`). docs/CODE_HEALTH.md.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'android/*', 'ios/*', '.expo/*']),
  expoConfig,
  {
    // Build-time config files run in Node.
    files: ['*.config.js', 'babel.config.js', 'workbox-config.js', 'web-edition.js', 'plugins/**/*.js', 'store/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // TypeScript already checks names in imports (tsc runs in CI), and this rule
      // misreads re-exported enums such as Notifications.AndroidImportance.
      'import/namespace': 'off',
      // React Compiler rules. A component that breaks one still works: the compiler
      // just leaves it unoptimized. Most hits are the usual
      // useRef(new Animated.Value(0)).current pattern. Warnings for now, to fix
      // screen by screen with a device check (docs/CODE_HEALTH.md).
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
]);
