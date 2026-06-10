module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-refresh"],
  ignorePatterns: ["dist", ".eslintrc.cjs", "vite.config.ts"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    // Honour the leading-underscore convention for intentionally-unused bindings
    // (e.g. mock signatures that must match a wider type but ignore the args).
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      // Presentational components co-locate their small static data tables with the
      // component. That trips react-refresh's HMR-only heuristic but is intentional
      // and has no runtime/build impact, so don't fail the lint gate on it.
      files: ["src/components/*.tsx", "src/workflow/*.tsx"],
      rules: { "react-refresh/only-export-components": "off" },
    },
  ],
};
