// The linter (oxlint, `npm run lint`), set up like bst-admin's. bst-admin also checks the imports
// between its layers (src/app, src/pages, src/widgets, src/shared) with eslint-plugin-boundaries;
// Ghostfetch has no such layers, so that part isn't here.
import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y", "import"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  env: {
    builtin: true,
    browser: true,
  },
  settings: {
    react: {
      version: "19.0.0",
    },
  },
  rules: {
    "import/no-unassigned-import": "off",
    "react/react-in-jsx-scope": "off",
    // Superseded by react/exhaustive-effect-dependencies (React Compiler-powered), which
    // does reactive-value analysis this legacy syntactic port doesn't - keeping both enabled
    // produces contradictory diagnostics on the same line.
    "react/exhaustive-deps": "off",
    // Off in bst-admin, whose Yup schemas need objects with a `then` key.
    "unicorn/no-thenable": "off",
    "unicorn/consistent-function-scoping": "off",
  },
  ignorePatterns: [".output/**", ".wxt/**", "web-ext-artifacts/**"],
});
