import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  // ── Ignored paths ────────────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "lib/api-client-react/src/generated/**",
      "lib/api-zod/src/generated/**",
      "**/*.config.{js,mjs,ts}",
    ],
  },

  // ── Base JS recommended ───────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript strict ─────────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Backend (Node.js / ESM) ───────────────────────────────────────────────
  {
    files: ["artifacts/api-server/src/**/*.ts", "lib/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "error",
    },
  },

  // ── Frontend (React + Browser) ────────────────────────────────────────────
  {
    files: ["artifacts/novamail-web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
