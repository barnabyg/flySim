import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // All engine randomness must come from the seeded generator, and all time
    // from the fixed step, so runs reproduce exactly.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded generator." },
        { object: "Date", property: "now", message: "Use simulated time." },
        { object: "performance", property: "now", message: "Use simulated time." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "three/*", "**/viewer/**"],
              message: "The engine has no rendering or UI dependencies.",
            },
          ],
        },
      ],
    },
  },
);
