import js from "@eslint/js";
import tseslint from "typescript-eslint";

const EXACT_MATH = "Use exactMath, which gives the same result on every platform.";

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
      // Numbers in templates only build CSS values and messages, where the default
      // formatting is what's wanted. Review if numbers are ever formatted for reading.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // All engine randomness must come from the seeded generator, all time from the
    // fixed step and all elementary functions from exactMath, so runs reproduce exactly,
    // in Node and in every browser.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded generator." },
        { object: "Date", property: "now", message: "Use simulated time." },
        { object: "performance", property: "now", message: "Use simulated time." },
        // Math only approximates these, differently in Node and each browser.
        { object: "Math", property: "exp", message: EXACT_MATH },
        { object: "Math", property: "expm1", message: EXACT_MATH },
        { object: "Math", property: "log", message: EXACT_MATH },
        { object: "Math", property: "log1p", message: EXACT_MATH },
        { object: "Math", property: "log2", message: EXACT_MATH },
        { object: "Math", property: "log10", message: EXACT_MATH },
        { object: "Math", property: "sin", message: EXACT_MATH },
        { object: "Math", property: "cos", message: EXACT_MATH },
        { object: "Math", property: "tan", message: EXACT_MATH },
        { object: "Math", property: "asin", message: EXACT_MATH },
        { object: "Math", property: "acos", message: EXACT_MATH },
        { object: "Math", property: "atan", message: EXACT_MATH },
        { object: "Math", property: "atan2", message: EXACT_MATH },
        { object: "Math", property: "sinh", message: EXACT_MATH },
        { object: "Math", property: "cosh", message: EXACT_MATH },
        { object: "Math", property: "tanh", message: EXACT_MATH },
        { object: "Math", property: "asinh", message: EXACT_MATH },
        { object: "Math", property: "acosh", message: EXACT_MATH },
        { object: "Math", property: "atanh", message: EXACT_MATH },
        { object: "Math", property: "cbrt", message: EXACT_MATH },
        { object: "Math", property: "hypot", message: EXACT_MATH },
        { object: "Math", property: "pow", message: EXACT_MATH },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "BinaryExpression[operator='**']", message: EXACT_MATH },
        { selector: "AssignmentExpression[operator='**=']", message: EXACT_MATH },
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
