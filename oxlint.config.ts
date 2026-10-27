// The linter (oxlint, `npm run lint`), set up like bst-admin's. bst-admin also checks the imports
// between its layers with eslint-plugin-boundaries, which needs ESLint itself; here
// scripts/check-layers.mjs checks the same rules, and `npm run lint` runs it after oxlint.
import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'import'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  env: {
    builtin: true,
    browser: true,
  },
  settings: {
    react: {
      version: '19.0.0',
    },
    // The kit's form controls, as the elements they render, so the accessibility rules can see
    // that a <label> around one labels it. A Switch is a <span role="switch"> next to a hidden
    // checkbox, which is what a label around it clicks.
    'jsx-a11y': {
      components: {
        Input: 'input',
        Switch: 'input',
      },
    },
  },
  rules: {
    'import/no-unassigned-import': 'off',
    'react/react-in-jsx-scope': 'off',
    // Superseded by react/exhaustive-effect-dependencies (React Compiler-powered), which
    // does reactive-value analysis this legacy syntactic port doesn't - keeping both enabled
    // produces contradictory diagnostics on the same line.
    'react/exhaustive-deps': 'off',
    // Off in bst-admin, whose Yup schemas need objects with a `then` key.
    'unicorn/no-thenable': 'off',
    'unicorn/consistent-function-scoping': 'off',
  },
  ignorePatterns: ['.output/**', '.wxt/**', 'web-ext-artifacts/**'],
});
